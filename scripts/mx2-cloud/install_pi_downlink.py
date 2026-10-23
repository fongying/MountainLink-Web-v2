from pathlib import Path
import shutil,subprocess,time,hashlib
root=Path('/home/pi/meshtastic-getway')
target=root/'src/gateway_recorder.py'
original=target.read_text()
assert 'self.mqtt_downlink' not in original, 'already integrated'
backup=root/'backups'/('mqtt-downlink-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
backup.mkdir(parents=True)
shutil.copy2(target,backup/'gateway_recorder.py')
text=original.replace('        self.interface = None\n        self.last_packet_receive_time', '        self.interface = None\n        self.mqtt_downlink = None\n        self.last_packet_receive_time',1)
anchor='                self.update_health("RUNNING")\n\n                while self.running:'
assert anchor in text
text=text.replace(anchor,'''                self.update_health("RUNNING")
                try:
                    from mqtt_downlink import MqttDownlink
                    self.mqtt_downlink = MqttDownlink(self.interface, self.data_dir, self.log_event)
                except Exception:
                    self.log_event("DOWNLINK_INIT_FAILED", "MQTT downlink unavailable; recorder remains active")

                while self.running:''',1)
text=text.replace('                    now = time.time()\n                    if now - last_heartbeat_time', '''                    now = time.time()
                    if self.mqtt_downlink:
                        try:
                            self.mqtt_downlink.tick()
                        except Exception:
                            self.log_event("DOWNLINK_TICK_FAILED", "MQTT downlink tick failed; recorder remains active")
                    if now - last_heartbeat_time''',1)
text=text.replace('            finally:\n                if self.interface:', '''            finally:
                if self.mqtt_downlink:
                    try:
                        self.mqtt_downlink.close()
                    except Exception:
                        pass
                    self.mqtt_downlink = None
                if self.interface:''',1)
compile(text,str(target),'exec')
module=Path('/home/codex-admin/mqtt_downlink.py')
compile(module.read_text(),str(module),'exec')
target.write_text(text)
shutil.copy2(module,root/'src/mqtt_downlink.py')
subprocess.run(['chown','pi:pi',str(target),str(root/'src/mqtt_downlink.py')],check=True)
subprocess.run(['systemctl','restart','meshtastic-gateway'],check=True)
time.sleep(8)
assert subprocess.run(['systemctl','is-active','--quiet','meshtastic-gateway']).returncode==0
print('PI_DOWNLINK_DEPLOYED',str(backup),hashlib.sha256(target.read_bytes()).hexdigest())
