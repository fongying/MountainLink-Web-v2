from pathlib import Path
import json,shutil,time,subprocess
p=Path('/opt/nodered/data/flows.json')
backup=p.with_name('flows.pre-downlink-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'.json')
shutil.copy2(p,backup)
a=json.loads(p.read_text())
formatter=next(n for n in a if n.get('name')=='Format Hazard To MQTT')
formatter['func']='''const p = msg.payload;
if (!p || typeof p.message !== 'string' || !p.message.trim() || !p.id) return null;
if (!['rain', 'cold', 'earthquake'].includes(p.type) && p.topic !== 'mlink/agent-alerts' && p.reason !== 'downlink_test') return null;
if (Buffer.byteLength(p.message, 'utf8') > 228) {
    node.warn('Hazard text exceeds radio limit; not transmitted'); return null;
}
msg.topic = 'mlink/2/json/mqtt/!c0c31f54';
msg.payload = JSON.stringify({
    type: 'sendtext', from: 3234013012, to: 4294967295,
    channel: 0, payload: p.message, id: p.id, status: p.status || 'active',
    generatedAt: new Date().toISOString()
});
return msg;'''
for n in a:
 if n.get('type')=='mqtt out' and n.get('id') in formatter['wires'][0]:
  n['qos']='1';n['retain']='false'
p.write_text(json.dumps(a,ensure_ascii=False,indent=2))
subprocess.run(['docker','restart','nodered'],check=True,stdout=subprocess.DEVNULL)
print('NODE_RED_DESTINATION_UPDATED',str(backup))
