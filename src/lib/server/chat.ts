import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { getDeviceBinding } from '$lib/server/device-bindings';
import { resolvePrivateDelivery, type RadioMapping, type PrivateDelivery } from '$lib/ai-private-route';
import { DELIVERY_RANK } from '$lib/ai-delivery';
import type { ChatMessage } from '$lib/chat';
export class ChatError extends Error { constructor(message:string,public status=400){super(message);} }
const all=<T=any>(sql:string,params:unknown[]=[])=>new Promise<T[]>((resolve,reject)=>db.all(sql,params as any,(e,rows)=>e?reject(e):resolve(rows as T[])));
const one=async<T=any>(sql:string,params:unknown[]=[]) => (await all<T>(sql,params))[0];
const run=(sql:string,params:unknown[]=[])=>new Promise<number>((resolve,reject)=>db.run(sql,params as any,function(e){e?reject(e):resolve(this.changes);}));
const ready=(async()=>{
 await run(`CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,device_id TEXT,direction TEXT NOT NULL,origin TEXT NOT NULL,text TEXT NOT NULL,
  radio_node TEXT NOT NULL,gateway_node TEXT NOT NULL,packet_id INTEGER,created_at INTEGER NOT NULL,
  uploaded_at INTEGER NOT NULL,user_id INTEGER,actor TEXT NOT NULL,stage TEXT NOT NULL,stage_rank INTEGER NOT NULL DEFAULT 0,
  delivery_json TEXT,error TEXT,command_id TEXT)`);
 await run('CREATE INDEX IF NOT EXISTS idx_chat_device_time ON chat_messages(device_id,created_at DESC)');
 await run('CREATE INDEX IF NOT EXISTS idx_chat_incoming_packet ON chat_messages(direction,radio_node,packet_id,created_at)');
})();
export async function canAccessChat(user:any,deviceId:string) {
 return Boolean(user && (user.is_admin || await getDeviceBinding(deviceId)===user.id));
}
export async function getChatRoute(deviceId:string,now=Date.now()) {
 try {
  const rows=await all<RadioMapping>(`SELECT node_id,source_node,received_at,sample_ts,data_source,run_id FROM mx2_samples WHERE received_at>=?`,[now-600000]);
  return {delivery:resolvePrivateDelivery(deviceId,rows,now),error:''};
 } catch(error) {return {delivery:null,error:error instanceof Error?error.message:'無法核對裝置身分'};}
}
const dto=(r:any):ChatMessage=>({id:r.id,deviceId:r.device_id,direction:r.direction,origin:r.origin,text:r.text,
 radioNode:r.radio_node,actor:r.actor,createdAt:r.created_at,stage:r.stage,packetId:r.packet_id??undefined,error:r.error??undefined});
export async function listChat(deviceId:string) {
 await ready;
 const rows=await all('SELECT * FROM chat_messages WHERE device_id=? ORDER BY created_at DESC,id DESC LIMIT 100',[deviceId]);
 const ai=await all(`SELECT d.payload_json,d.delivery_stage,d.delivery_packet_id,r.generated_at
  FROM ai_dispatches d JOIN ai_recommendations r ON r.id=d.recommendation_id
  WHERE json_extract(d.payload_json,'$.delivery.mode')='private'
   AND json_extract(d.payload_json,'$.delivery.focusDeviceId')=? ORDER BY r.generated_at DESC LIMIT 50`,[deviceId]);
 const messages:ChatMessage[]=[...rows.map(dto),...ai.map((r:any)=>{const p=JSON.parse(r.payload_json);return {
  id:p.id,deviceId,direction:'out' as const,origin:'ai' as const,text:p.message,radioNode:p.delivery.destination,
  actor:'AI 建議',createdAt:Date.parse(r.generated_at),stage:r.delivery_stage||'webhook_accepted',packetId:r.delivery_packet_id??undefined};})];
 messages.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
 return {messages:messages.slice(-100),route:await getChatRoute(deviceId)};
}
async function postWebhook(payload:unknown) {
 const url=env.MLINK_ALERT_WEBHOOK_URL?.trim();if(!url) throw new ChatError('尚未設定下行轉送服務',503);
 const body=JSON.stringify(payload),headers:Record<string,string>={'Content-Type':'application/json'};
 const secret=env.MLINK_ALERT_WEBHOOK_SECRET?.trim();
 if(secret){const stamp=Date.now().toString();headers['X-MLINK-Timestamp']=stamp;headers['X-MLINK-Signature']=createHmac('sha256',secret).update(stamp+'.'+body).digest('hex');}
 const response=await fetch(url,{method:'POST',headers,body,signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new ChatError(`下行轉送服務回應 ${response.status}`,502);
}
export async function sendChat(deviceId:string,user:{id:number;username:string},input:any,post=postWebhook) {
 await ready;
 const id=input?.id,text=typeof input?.text==='string'?input.text.trim():'';
 if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new ChatError('缺少有效訊息識別碼');
 if(!text||Buffer.byteLength(text,'utf8')>228)throw new ChatError('訊息須為 1–228 UTF-8 bytes');
 const existing=await one('SELECT * FROM chat_messages WHERE id=?',[id]);
 if(existing){if(existing.device_id!==deviceId||existing.user_id!==user.id||existing.text!==text)throw new ChatError('訊息識別碼已被其他內容使用',409);return dto(existing);}
 const route=await getChatRoute(deviceId);if(!route.delivery)throw new ChatError(route.error,409);
 const pending=await one(`SELECT count(*) AS n FROM chat_messages WHERE device_id=? AND direction='out' AND stage_rank<=2 AND created_at>?`,[deviceId,Date.now()-180000]);
 if(pending.n>=3)throw new ChatError('已有訊息等待 Gateway，請稍候',429);
 const now=Date.now();
 const inserted=await run(`INSERT OR IGNORE INTO chat_messages(id,device_id,direction,origin,text,radio_node,gateway_node,created_at,uploaded_at,user_id,actor,stage,delivery_json)
  SELECT ?,?,'out','human',?,?,'!c0c31f54',?,?,?,?, 'submitting',?
  WHERE NOT EXISTS(SELECT 1 FROM chat_messages WHERE device_id=? AND direction='out' AND user_id=? AND created_at>?)`,
  [id,deviceId,text,route.delivery.destination,now,now,user.id,user.username,JSON.stringify(route.delivery),deviceId,user.id,now-20000]);
 if(!inserted){const duplicate=await one('SELECT * FROM chat_messages WHERE id=?',[id]);
  if(duplicate&&duplicate.user_id===user.id&&duplicate.device_id===deviceId&&duplicate.text===text)return dto(duplicate);
  throw new ChatError('每 20 秒可發送一則，請稍候',429);}
 try {
  await post({id:`chat-${id}`,topic:'mlink/private-chat',message:text,generatedAt:new Date(now).toISOString(),delivery:route.delivery});
  await run("UPDATE chat_messages SET stage='webhook_accepted' WHERE id=? AND stage='submitting' AND stage_rank=0",[id]);
 } catch {await run("UPDATE chat_messages SET stage='uncertain',stage_rank=5,error='下行轉送結果不明；不自動重送，請核對回報。' WHERE id=? AND stage_rank<3",[id]);}
 return dto(await one('SELECT * FROM chat_messages WHERE id=?',[id]));
}
export async function acceptChatDelivery(body:any) {
 await ready;
 if(!body||typeof body.id!=='string'||!body.id.startsWith('chat-')||body.gateway!=='!c0c31f54'
  ||!/^[a-f0-9]{64}$/.test(body.command_id)||!Object.hasOwn(DELIVERY_RANK,body.stage)||body.stage==='webhook_accepted')return false;
 if(['radio_ack','radio_nak','radio_api_accepted'].includes(body.stage)&&(!Number.isInteger(body.packet_id)||body.packet_id<1||body.packet_id>4294967295))return false;
 const row=await one("SELECT * FROM chat_messages WHERE id=? AND direction='out'",[body.id.slice(5)]);
 if(!row||row.radio_node!==body.destination)return false;
 const rank=DELIVERY_RANK[body.stage as keyof typeof DELIVERY_RANK];
 await run(`UPDATE chat_messages SET stage=?,stage_rank=?,packet_id=COALESCE(?,packet_id),command_id=?,error=NULL
  WHERE id=? AND stage_rank<=?`,[body.stage,rank,body.packet_id??null,body.command_id,row.id,rank]);
 return true;
}
export async function ingestChat(body:any,now=Date.now()) {
 await ready;
 if(!body||!/^[a-f0-9]{64}$/.test(body.key)||body.gateway_node!=='!c0c31f54'
  ||!/^[a-f0-9]{8}$/.test(body.source_node)||['00000000','ffffffff','c0c31f54'].includes(body.source_node)
  ||!Number.isInteger(body.packet_id)||body.packet_id<1||body.packet_id>4294967295
  ||!Number.isInteger(body.received_at)||body.received_at<1e12||body.received_at>now+60000
  ||typeof body.text!=='string'||!body.text.trim()||Buffer.byteLength(body.text,'utf8')>228)throw new ChatError('私訊收件資料無效');
 const id=`rx-${body.key}`,radio=`!${body.source_node}`;
 const duplicate=await one(`SELECT id FROM chat_messages WHERE id=? OR (direction='in' AND radio_node=? AND packet_id=? AND text=? AND ABS(created_at-?)<86400000)`,[id,radio,body.packet_id,body.text,body.received_at]);
 if(duplicate)return {key:body.key,status:'existing'};
 // Resolve identity at receipt time, not upload time; late delivery must not follow a new owner.
 const rows=await all<RadioMapping>(`SELECT node_id,source_node,received_at,sample_ts,data_source,run_id FROM mx2_samples
  WHERE source_node=? AND received_at<=? AND received_at>? AND sample_ts<=? ORDER BY sample_ts DESC,received_at DESC LIMIT 2`,
  [body.source_node,body.received_at,body.received_at-600000,body.received_at+60000]);
 const m=rows[0];
 const ambiguous=rows[1]&&rows[1].sample_ts===m?.sample_ts&&rows[1].node_id!==m?.node_id;
 const device=m&&m.data_source==='real'&&!ambiguous&&body.received_at-m.sample_ts<600000&&!/^NT-DEMO-/i.test(m.node_id)?m.node_id:null;
 await run(`INSERT OR IGNORE INTO chat_messages(id,device_id,direction,origin,text,radio_node,gateway_node,packet_id,created_at,uploaded_at,actor,stage)
  VALUES(?,?,'in','radio',?,?,?,?,?,?,'Radio Companion','received')`,[id,device,body.text,radio,body.gateway_node,body.packet_id,body.received_at,now]);
 return {key:body.key,status:'inserted',assigned:Boolean(device)};
}
