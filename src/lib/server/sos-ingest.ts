import sqlite3 from 'sqlite3';
import {createHash} from 'node:crypto';
export class SosError extends Error {constructor(message:string,public status=400){super(message)}}
export function parseSosHelp(text:unknown) {
 if(typeof text!=='string'||Buffer.byteLength(text)>100)throw new SosError('invalid SOS text');
 const m=/^SOS HELP id=([A-Za-z0-9_.!\-]{1,64})(?: HR=([0-9]{1,3}))?(?: GPS=(-?[0-9]+\.[0-9]{5}),(-?[0-9]+\.[0-9]{5}))?( MOCK)? ev=([0-9a-f]{8})$/.exec(text);
 if(!m||(m[2]&&(+m[2]<1||+m[2]>255))||(m[3]&&(+m[3]<-90||+m[3]>90||+m[4]<-180||+m[4]>180)))throw new SosError('invalid SOS payload');
 return {node:m[1],event:m[6],source:m[5]?'mock':'real'};
}
export function createSosStore(path='data/app.db', supplied?:sqlite3.Database){
 const db=supplied??new sqlite3.Database(path);db.configure('busyTimeout',10000);
 const run=(s:string,p:any[]=[])=>new Promise<void>((r,j)=>db.run(s,p,e=>e?j(e):r()));
 const get=(s:string,p:any[]=[])=>new Promise<any>((r,j)=>db.get(s,p,(e,v)=>e?j(e):r(v)));
 const ready=run(`CREATE TABLE IF NOT EXISTS sos_broadcast_receipts(
  key TEXT PRIMARY KEY,event_id TEXT NOT NULL,source_node TEXT NOT NULL,node_id TEXT NOT NULL,
  packet_id INTEGER NOT NULL,received_at INTEGER NOT NULL,uploaded_at INTEGER NOT NULL,
  applied INTEGER NOT NULL,payload_json TEXT NOT NULL)`);
 let serial:Promise<any>=ready;
 async function save(p:any,now=Date.now()){
  const parsed=parseSosHelp(p?.text);
  if(!/^[a-f0-9]{64}$/.test(p?.key)||p.gateway_node!=='!c0c31f54'||!(/^[a-f0-9]{8}$/).test(p.source_node)
   ||['00000000','ffffffff','c0c31f54'].includes(p.source_node)||parsed.node!==p.node_id||parsed.event!==p.event_token||parsed.source!==p.data_source
   ||!Number.isInteger(p.packet_id)||p.packet_id<1||p.packet_id>4294967295||!Number.isInteger(p.received_at)||p.received_at<1e12||p.received_at>now+60000
   ||(p.channel!=null&&(!Number.isInteger(p.channel)||p.channel<0||p.channel>7)))throw new SosError('invalid SOS envelope');
  const expected=createHash('sha256').update(`${p.source_node}:${p.packet_id}:${p.text}:${Math.floor(p.received_at/86400000)}`).digest('hex');
  if(expected!==p.key)throw new SosError('SOS evidence mismatch');
  const event=`${p.source_node}:${p.node_id}:${p.event_token}`;
  await run('BEGIN IMMEDIATE');
  try{
   const existing=await get('SELECT key FROM sos_broadcast_receipts WHERE key=? OR (source_node=? AND packet_id=? AND json_extract(payload_json,\'$.text\')=? AND ABS(received_at-?)<86400000)',[p.key,p.source_node,p.packet_id,p.text,p.received_at]);
   if(existing){await run('COMMIT');return {key:p.key,status:'existing',node_id:p.node_id,applied:false};}
   const rows=await new Promise<any[]>((r,j)=>db.all('SELECT node_id,data_source,sample_ts,received_at FROM mx2_samples WHERE source_node=? AND received_at<=? AND sample_ts<=? ORDER BY sample_ts DESC,received_at DESC LIMIT 2',[p.source_node,p.received_at,p.received_at+60000],(e,v)=>e?j(e):r(v)));
   const mapping=rows[0];const prior=await get("SELECT 1 FROM sos_broadcast_receipts WHERE event_id=? AND json_extract(payload_json,'$.data_source')='real' LIMIT 1",[event]);
   const conflict=rows[1]&&rows[1].sample_ts===mapping?.sample_ts&&rows[1].node_id!==mapping?.node_id;
   // Initial SOS requires a real MX2 identity from the last 24 hours. The same ongoing SOS can continue while auto-send is paused.
   const matched=mapping&&mapping.node_id===p.node_id&&mapping.data_source==='real'&&!conflict
    &&(prior||(p.received_at-mapping.sample_ts<86400000&&p.received_at-mapping.received_at<86400000));
   if(parsed.source==='real'&&!matched)throw new SosError('SOS identity unresolved; keep queued for review',409);
   const applied=parsed.source==='real'&&now-p.received_at<600000&&!/^NT-DEMO-/i.test(p.node_id);
   await run('INSERT INTO sos_broadcast_receipts VALUES(?,?,?,?,?,?,?,?,?)',[p.key,event,p.source_node,p.node_id,p.packet_id,p.received_at,now,Number(applied),JSON.stringify(p)]);
   if(applied){
    // SOS is latched. Preserve telemetry, battery and GPS timestamps; no inferred location/trigger time.
    await run(`INSERT INTO device_state(device_id,updated_at,sos) VALUES(?,?,1)
     ON CONFLICT(device_id) DO UPDATE SET sos=1,updated_at=MAX(device_state.updated_at,excluded.updated_at),updated_at_iso=datetime('now')`,[p.node_id,p.received_at]);
    await run('INSERT INTO telemetry_history(device_id,ts,sos,recv_ts,sender,raw_text,raw_json) VALUES(?,?,1,?,?,?,?)',[p.node_id,p.received_at,new Date(p.received_at).toISOString(),p.source_node,p.text,JSON.stringify(p)]);
   }
   await run('COMMIT');return {key:p.key,status:'inserted',node_id:p.node_id,applied:Boolean(applied)};
  }catch(e){await run('ROLLBACK');throw e;}
 }
 return {ingest(p:any,now?:number){const task=serial.then(()=>save(p,now));serial=task.catch(()=>undefined);return task;},async close(){await serial;await new Promise<void>((r,j)=>db.close(e=>e?j(e):r()));}};
}
