"""MQTT -> Recorder's single USB interface. Submission and radio ACK are distinct."""
import hashlib
import json
import queue
import sqlite3
import time
from datetime import datetime
from pathlib import Path

BROADCAST = 4294967295
MAX_MAPPING_AGE = 600


def timestamp(value):
    stamp = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if stamp.tzinfo is None:
        raise ValueError('timezone required')
    return stamp.timestamp()


def parse_command(raw, local_node_id, now=None):
    body = json.loads(raw)
    now = time.time() if now is None else now
    if not isinstance(body, dict) or body.get('type') != 'sendtext':
        raise ValueError('unsupported command')
    if body.get('from') != int(local_node_id.lstrip('!'), 16):
        raise ValueError('incorrect gateway')
    destination = body.get('to', BROADCAST)
    if type(destination) is not int or body.get('channel', 0) != 0:
        raise ValueError('invalid destination or channel')
    private = body.get('deliveryMode') == 'private'
    delivery = body.get('delivery') or {}
    if not isinstance(delivery, dict):
        raise ValueError('invalid delivery')
    if private:
        if not 0 < destination < BROADCAST or destination == body['from']:
            raise ValueError('invalid private destination')
        if not isinstance(delivery, dict) or delivery.get('mode') != 'private' or delivery.get('destination') != f'!{destination:08x}':
            raise ValueError('private route mismatch')
        focus = delivery.get('focusDeviceId')
        if not isinstance(focus, str) or not focus or focus.upper().startswith('NT-DEMO-') or not delivery.get('runId'):
            raise ValueError('missing real device identity')
        for field in ('mappedAt', 'sampleAt'):
            if not -60 <= now - timestamp(delivery.get(field)) < MAX_MAPPING_AGE:
                raise ValueError('expired private mapping')
    elif destination != BROADCAST or str(body.get('id', '')).startswith('ai-') or body.get('deliveryMode') not in (None, 'broadcast'):
        raise ValueError('AI must be private; no broadcast fallback')
    text = body.get('payload')
    if not isinstance(text, str) or not text.strip() or len(text.encode('utf8')) > 228:
        raise ValueError('invalid text length')
    issued = timestamp(body.get('generatedAt', ''))
    if not -60 <= now - issued <= 1800:
        raise ValueError('expired command')
    event_id = body.get('id')
    if not isinstance(event_id, str) or not event_id or len(event_id) > 250:
        raise ValueError('missing command identity')
    # Destination and logical identity are part of dedupe, even for identical text.
    key = hashlib.sha256(json.dumps([event_id, body.get('status', ''), text, destination,
                                     delivery.get('focusDeviceId')], ensure_ascii=False).encode()).hexdigest()
    legacy = hashlib.sha256((event_id + '|' + str(body.get('status', '')) + '|' + text).encode()).hexdigest()
    return key, text, issued, destination, event_id, json.dumps(delivery), legacy


class MqttDownlink:
    def __init__(self, interface, data_dir, log_event):
        import paho.mqtt.client as mqtt
        self.interface = interface
        self.log = log_event
        self.data_dir = Path(data_dir)
        self.node_id = f'!{interface.myInfo.my_node_num:08x}'
        self.topic = f'mlink/2/json/mqtt/{self.node_id}'
        self.inbox = queue.Queue(maxsize=100)
        self.responses = queue.Queue(maxsize=100)
        self.next_send = 0
        self.db = sqlite3.connect(str(self.data_dir / 'mqtt_downlink.sqlite3'))
        self.db.execute('CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, text TEXT NOT NULL, issued REAL NOT NULL, state TEXT NOT NULL, packet_id INTEGER)')
        columns = {row[1] for row in self.db.execute('PRAGMA table_info(commands)')}
        for name, definition in [('destination', 'INTEGER NOT NULL DEFAULT 4294967295'),
                                 ('event_id', 'TEXT'), ('delivery', "TEXT NOT NULL DEFAULT '{}'"),
                                 ('submitted', 'REAL'), ('receipt_pending', 'INTEGER NOT NULL DEFAULT 0')]:
            if name not in columns:
                self.db.execute(f'ALTER TABLE commands ADD COLUMN {name} {definition}')
        self.db.execute("UPDATE commands SET state='uncertain',receipt_pending=1 WHERE state='sending'")
        self.db.commit()
        config = interface.localNode.moduleConfig.mqtt
        if not config.username or not config.password:
            raise ValueError('Radio MQTT credentials are not configured')
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f'mlink-pi-downlink-{self.node_id[1:]}')
        self.client.username_pw_set(config.username, config.password)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.reconnect_delay_set(1, 30)
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
            return
        try:
            self.inbox.put_nowait(parse_command(message.payload, self.node_id))
        except (ValueError, TypeError, UnicodeError, queue.Full, OverflowError):
            self.log('DOWNLINK_REJECTED', 'Invalid, expired or overflowing command')

    def current_mapping(self, destination, delivery):
        """Read uploader's validated MX2M/Core pairing; never open another serial client."""
        path = self.data_dir / 'mx2_upload.sqlite3'
        with sqlite3.connect(f'{path.as_uri()}?mode=ro', uri=True, timeout=2) as source:
            row = source.execute('SELECT body FROM samples WHERE source=? ORDER BY received DESC,created DESC LIMIT 1',
                                 (f'{destination:08x}',)).fetchone()
        if not row or not row[0]:
            return False
        sample = json.loads(row[0])
        now = time.time()
        return (sample.get('node_id') == delivery['focusDeviceId'] and sample.get('data_source') == 'real'
                and sample.get('run_id') == delivery['runId']
                and -60 <= now - timestamp(sample['recv_ts']) < MAX_MAPPING_AGE
                and -60 <= now - sample['sample_ts'] / 1000 < MAX_MAPPING_AGE)

    def set_stage(self, key, stage):
        self.db.execute('UPDATE commands SET state=?,receipt_pending=1 WHERE id=?', (stage, key))
        self.db.commit()

    def flush_receipts(self):
        # Persist and retry receipts after MQTT outages, without replaying the radio command.
        for key, event_id, packet_id, destination, state in self.db.execute(
                'SELECT id,event_id,packet_id,destination,state FROM commands WHERE receipt_pending=1').fetchall():
            result = self.client.publish(f'mlink/alerts/ack/{self.node_id}', json.dumps({
                'command_id': key, 'id': event_id, 'packet_id': packet_id,
                'destination': f'!{destination:08x}' if destination != BROADCAST else '^all',
                'gateway': self.node_id, 'stage': state}), qos=1, retain=False)
            if result.rc == 0:
                try:
                    result.wait_for_publish(timeout=0.2)
                    if result.is_published():
                        self.db.execute('UPDATE commands SET receipt_pending=0 WHERE id=? AND state=?', (key, state))
                except (RuntimeError, ValueError):
                    pass
        self.db.commit()

    def tick(self):
        while not self.responses.empty():
            key, packet = self.responses.get_nowait()
            row = self.db.execute('SELECT destination,packet_id,state FROM commands WHERE id=?', (key,)).fetchone()
            decoded = packet.get('decoded', {})
            routing = decoded.get('routing')
            if not row or not isinstance(routing, dict) or decoded.get('requestId') != row[1]:
                continue
            reason = routing.get('errorReason', 'NONE')
            if reason == 'NONE' and packet.get('from') == row[0]:
                self.set_stage(key, 'radio_ack')
            elif reason != 'NONE' and row[2] != 'radio_ack':
                self.set_stage(key, 'radio_nak')
        self.db.execute("UPDATE commands SET state='ack_timeout',receipt_pending=1 WHERE destination!=? AND state='radio_api_accepted' AND submitted<?",
                        (BROADCAST, time.time()-180))
        while not self.inbox.empty():
            key, text, issued, destination, event_id, delivery, old_key = self.inbox.get_nowait()
            # Preserve old broadcast dedupe identities across the schema migration.
            if destination == BROADCAST and self.db.execute('SELECT 1 FROM commands WHERE id=?', (old_key,)).fetchone():
                continue
            self.db.execute("INSERT OR IGNORE INTO commands(id,text,issued,state,destination,event_id,delivery,receipt_pending) VALUES(?,?,?,'queued',?,?,?,1)",
                            (key, text, issued, destination, event_id, delivery))
        self.db.commit()
        self.flush_receipts()
        if time.monotonic() < self.next_send:
            return
        row = self.db.execute("SELECT id,text,issued,destination,delivery FROM commands WHERE state='queued' ORDER BY issued LIMIT 1").fetchone()
        if not row:
            return
        key, text, issued, destination, raw_delivery = row
        private = destination != BROADCAST
        delivery = json.loads(raw_delivery)
        if time.time() - issued > 1800:
            self.set_stage(key, 'expired')
            return
        if private:
            try:
                valid = all(-60 <= time.time()-timestamp(delivery[f]) < MAX_MAPPING_AGE for f in ('mappedAt', 'sampleAt'))
                valid = valid and self.current_mapping(destination, delivery)
            except (ValueError, TypeError, KeyError, sqlite3.Error):
                valid = False
            if not valid:
                self.set_stage(key, 'mapping_blocked')
                self.log('DOWNLINK_MAPPING_BLOCKED', 'Private route expired or changed', {'command_id': key})
                return
        self.set_stage(key, 'sending')
        self.next_send = time.monotonic() + 20
        try:
            options = dict(destinationId=f'!{destination:08x}' if private else '^all', channelIndex=0, wantAck=private)
            if private:
                # The installed SDK explicitly permits ACK callbacks named onAckNak.
                def onAckNak(packet, command_key=key):
                    try:
                        self.responses.put_nowait((command_key, packet))
                    except queue.Full:
                        self.log('DOWNLINK_ACK_OVERFLOW', 'ACK queue full; receipt remains unconfirmed')
                options['onResponse'] = onAckNak
            packet = self.interface.sendText(text, **options)
            packet_id = getattr(packet, 'id', None)
            self.db.execute('UPDATE commands SET packet_id=?,submitted=? WHERE id=?', (packet_id, time.time(), key))
            self.set_stage(key, 'radio_api_accepted')
            self.log('DOWNLINK_RADIO_API_ACCEPTED', 'CHAT message submitted to Radio', {'command_id': key, 'packet_id': packet_id, 'destination': options['destinationId'], 'channel': 0})
            self.flush_receipts()
        except Exception:
            self.set_stage(key, 'uncertain')
            self.log('DOWNLINK_UNCERTAIN', 'Radio submission failed; inspect before replay', {'command_id': key})

    def close(self):
        self.client.disconnect()
        self.client.loop_stop()
        self.db.close()
