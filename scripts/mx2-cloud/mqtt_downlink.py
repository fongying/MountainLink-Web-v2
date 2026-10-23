"""MQTT -> existing Recorder USB interface. MQTT receipt is not radio delivery."""
import hashlib
import json
import queue
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path


def parse_command(raw, local_node_id, now=None):
    body = json.loads(raw)
    if not isinstance(body, dict) or body.get('type') != 'sendtext':
        raise ValueError('unsupported command')
    if body.get('from') != int(local_node_id.lstrip('!'), 16):
        raise ValueError('incorrect gateway')
    if body.get('to', 4294967295) != 4294967295 or body.get('channel', 0) != 0:
        raise ValueError('only CHAT broadcast is allowed')
    text = body.get('payload')
    if not isinstance(text, str) or not text.strip() or len(text.encode('utf8')) > 228:
        raise ValueError('invalid text length')
    stamp = datetime.fromisoformat(str(body.get('generatedAt', '')).replace('Z', '+00:00'))
    age = (time.time() if now is None else now) - stamp.timestamp()
    if not -60 <= age <= 1800:
        raise ValueError('expired command')
    event_id = str(body.get('id', ''))
    if not event_id or len(event_id) > 250:
        raise ValueError('missing command identity')
    key = hashlib.sha256((event_id + '|' + str(body.get('status', '')) + '|' + text).encode()).hexdigest()
    return key, text, stamp.timestamp()


class MqttDownlink:
    def __init__(self, interface, data_dir, log_event):
        import paho.mqtt.client as mqtt
        self.interface = interface
        self.log = log_event
        self.node_id = f'!{interface.myInfo.my_node_num:08x}'
        self.topic = f'mlink/2/json/mqtt/{self.node_id}'
        self.inbox = queue.Queue(maxsize=100)
        self.next_send = 0
        self.db = sqlite3.connect(str(Path(data_dir) / 'mqtt_downlink.sqlite3'))
        self.db.execute('CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, text TEXT NOT NULL, issued REAL NOT NULL, state TEXT NOT NULL, packet_id INTEGER)')
        self.db.execute("UPDATE commands SET state='uncertain' WHERE state='sending'")
        self.db.commit()
        config = interface.localNode.moduleConfig.mqtt
        if not config.username or not config.password:
            raise ValueError('Radio MQTT credentials are not configured')
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f'mlink-pi-downlink-{self.node_id[1:]}')
        self.client.username_pw_set(config.username, config.password)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.reconnect_delay_set(1, 30)
        # The broker connection stays within the user's encrypted Tailscale network.
        self.client.connect_async('100.104.208.19', 1883, 60)
        self.client.loop_start()

    def on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            client.subscribe(self.topic, qos=1)
            self.log('DOWNLINK_MQTT_CONNECTED', 'Subscribed to CHAT downlink', {'topic': self.topic})
        else:
            self.log('DOWNLINK_MQTT_REJECTED', 'Broker rejected downlink connection', {'reason': str(reason_code)})

    def on_message(self, client, userdata, message):
        if message.retain:
            return  # Never transmit stale retained disaster messages.
        try:
            command = parse_command(message.payload, self.node_id)
            self.inbox.put_nowait(command)
        except (ValueError, TypeError, UnicodeError, queue.Full):
            self.log('DOWNLINK_REJECTED', 'Invalid, expired or overflowing command')

    def tick(self):
        while not self.inbox.empty():
            key, text, issued = self.inbox.get_nowait()
            self.db.execute("INSERT OR IGNORE INTO commands(id,text,issued,state) VALUES(?,?,?,'queued')", (key, text, issued))
        self.db.commit()
        if time.monotonic() < self.next_send:
            return
        row = self.db.execute("SELECT id,text,issued FROM commands WHERE state='queued' ORDER BY issued LIMIT 1").fetchone()
        if not row:
            return
        key, text, issued = row
        if time.time() - issued > 1800:
            self.db.execute("UPDATE commands SET state='expired' WHERE id=?", (key,))
            self.db.commit()
            return
        self.db.execute("UPDATE commands SET state='sending' WHERE id=?", (key,))
        self.db.commit()
        self.next_send = time.monotonic() + 20
        try:
            packet = self.interface.sendText(text, destinationId='^all', channelIndex=0, wantAck=False)
            packet_id = getattr(packet, 'id', None)
            self.db.execute("UPDATE commands SET state='radio_api_accepted', packet_id=? WHERE id=?", (packet_id, key))
            self.db.commit()
            self.log('DOWNLINK_RADIO_API_ACCEPTED', 'CHAT message submitted to Radio', {'command_id': key, 'packet_id': packet_id, 'channel': 0})
            self.client.publish(f'mlink/alerts/ack/{self.node_id}', json.dumps({'command_id': key, 'packet_id': packet_id, 'stage': 'radio_api_accepted'}), qos=1, retain=False)
        except Exception:
            # A serial write exception can be ambiguous. Avoid repeating a disaster broadcast automatically.
            self.db.execute("UPDATE commands SET state='uncertain' WHERE id=?", (key,))
            self.db.commit()
            self.log('DOWNLINK_UNCERTAIN', 'Radio submission failed; inspect before replay', {'command_id': key})

    def close(self):
        self.client.disconnect()
        self.client.loop_stop()
        self.db.close()
