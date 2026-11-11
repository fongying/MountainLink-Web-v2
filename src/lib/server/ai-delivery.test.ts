import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('receipt validation and monotonic persisted stage survive duplicate/out-of-order MQTT delivery', async()=>{
 const cwd=process.cwd(), dir=mkdtempSync(join(tmpdir(),'mlink-receipts-'));
 mkdirSync(join(dir,'data'));process.chdir(dir);
 const { db }=await import('$lib/server/db');
 const { acceptAiDelivery, getAiDelivery }=await import('$lib/server/ai-delivery');
 const run=(s:string,p:unknown[]=[])=>new Promise<void>((res,rej)=>db.run(s,p as any,e=>e?rej(e):res()));
 try {
  await run(`INSERT INTO ai_dispatches(dispatch_key,recommendation_id,topic,payload_hash,payload_json,status,delivery_stage)
   VALUES(?,?,?,?,?,?,?)`,['test-key','test-rec','test','test',JSON.stringify({id:'ai-test-rec',delivery:{mode:'private',destination:'!f6fcf190'}}),'sent','webhook_accepted']);
  const receipt={id:'ai-test-rec',command_id:'a'.repeat(64),gateway:'!c0c31f54',destination:'!f6fcf190',packet_id:42,stage:'radio_api_accepted'};
  for(const bad of [{...receipt,destination:'!12345678'},{...receipt,id:'ai-unknown'},{...receipt,gateway:'!12345678'},
    {...receipt,stage:'read'},{...receipt,packet_id:null}]) assert.equal(await acceptAiDelivery(bad),false);
  assert.equal(await acceptAiDelivery(receipt),true);
  assert.equal((await getAiDelivery('test-rec'))?.stage,'radio_api_accepted');
  await acceptAiDelivery({...receipt,stage:'queued'});
  assert.equal((await getAiDelivery('test-rec'))?.stage,'radio_api_accepted');
  await acceptAiDelivery({...receipt,stage:'ack_timeout'});
  await acceptAiDelivery({...receipt,stage:'radio_ack'});
  await acceptAiDelivery({...receipt,stage:'radio_nak'});
  assert.equal((await getAiDelivery('test-rec'))?.stage,'radio_ack');
 } finally {
  await new Promise<void>((res,rej)=>db.close(e=>e?rej(e):res()));process.chdir(cwd);rmSync(dir,{recursive:true,force:true});
 }
});
