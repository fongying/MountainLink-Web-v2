from pathlib import Path
import json,shutil,time,subprocess
p=Path('/opt/nodered/data/flows.json')
backup=p.with_name('flows.pre-downlink-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'.json')
shutil.copy2(p,backup)
a=json.loads(p.read_text())
formatter=next(n for n in a if n.get('name')=='Format Hazard To MQTT')
formatter['func']=Path(__file__).with_name('format_downlink.js').read_text()
for n in a:
 if n.get('type')=='mqtt out' and n.get('id') in formatter['wires'][0]:
  n['qos']='1';n['retain']='false'
# Reuse the already configured ingest credential locally; never print or embed it in Git.
import re
parser=next(n for n in a if n.get('name')=='Parse + Prepare Ingest')
match=re.search(r'const apiKey = "([^"\n]+)"',parser['func'])
if not match: raise RuntimeError('Cannot locate existing ingest authentication; stop')
api_key=match.group(1)
z=formatter['z']
broker=next(n for n in a if n.get('type')=='mqtt out' and n.get('id') in formatter['wires'][0])['broker']
nodes=[
 {'id':'ai_dm_receipt_in','type':'mqtt in','z':z,'name':'AI private delivery receipts','topic':'mlink/alerts/ack/!c0c31f54','qos':'1','datatype':'json','broker':broker,'nl':False,'rap':False,'inputs':0,'wires':[['ai_dm_receipt_format']]},
 {'id':'ai_dm_receipt_format','type':'function','z':z,'name':'Authenticated AI delivery receipt','outputs':1,'func':
  "const p=msg.payload; if(msg.retain || !p || typeof p.id!=='string' || (!p.id.startsWith('ai-') && !p.id.startsWith('chat-'))) return null;\n"
  +"msg.url=p.id.startsWith('chat-')?'http://172.18.0.1/api/chat/delivery':'http://172.18.0.1/api/ai/delivery'; msg.method='POST';\n"
  +"msg.headers={'Content-Type':'application/json','Host':'165.154.227.58','X-MLINK-INGEST-KEY':"+json.dumps(api_key)+"};\n"
  +"msg._receiptPayload=p; msg._receiptHeaders={...msg.headers}; msg._deliveryRetries=0; return msg;",'wires':[['ai_dm_receipt_http']]},
 {'id':'ai_dm_receipt_http','type':'http request','z':z,'name':'POST private delivery receipt','method':'use','ret':'txt','paytoqs':'ignore','url':'','persist':False,'senderr':False,'headers':[],'requestTimeout':'10000','wires':[['ai_dm_receipt_retry']]},
 {'id':'ai_dm_receipt_retry','type':'function','z':z,'name':'Retry receipt only, never radio','outputs':1,'func':
  "if(msg.statusCode>=200 && msg.statusCode<300) return null; if(++msg._deliveryRetries>6) { node.warn('AI receipt delivery failed; inspect Gateway SQLite'); return null; } msg.payload=msg._receiptPayload; msg.headers=msg._receiptHeaders; return msg;",'wires':[['ai_dm_receipt_delay']]},
 {'id':'ai_dm_receipt_delay','type':'delay','z':z,'name':'Receipt retry delay','pauseType':'delay','timeout':'5','timeoutUnits':'seconds','rate':'1','nbRateUnits':'1','rateUnits':'second','randomFirst':'1','randomLast':'5','randomUnits':'seconds','drop':False,'allowrate':False,'wires':[['ai_dm_receipt_http']]}
]
a=[n for n in a if n.get('id') not in {v['id'] for v in nodes}]+nodes
p.write_text(json.dumps(a,ensure_ascii=False,indent=2))
subprocess.run(['docker','restart','nodered'],check=True,stdout=subprocess.DEVNULL)
print('NODE_RED_DESTINATION_UPDATED',str(backup))
