import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const fn=new Function('msg','node','Buffer',readFileSync(new URL('./format_downlink.js',import.meta.url),'utf8'));
const base={id:'ai-test',topic:'mlink/agent-alerts',message:'[測試] 私訊測試',delivery:{mode:'private',destination:'!f6fcf190',focusDeviceId:'logical-1',mappedAt:new Date().toISOString(),sampleAt:new Date().toISOString(),runId:'DEV-REAL'}};
const run=p=>fn({payload:p},{warn(){}},Buffer);
test('AI private destination survives Node-RED formatting',()=>{
 const out=run(base), p=JSON.parse(out.payload);
 assert.equal(p.to,0xf6fcf190);assert.equal(p.deliveryMode,'private');assert.equal(p.channel,0);
});
test('missing/expired/broadcast AI route is blocked',()=>{
 for(const edit of [undefined,{...base.delivery,destination:'!ffffffff'},{...base.delivery,focusDeviceId:'NT-DEMO-002'},
  {...base.delivery,mappedAt:new Date(Date.now()-600001).toISOString()}]) assert.equal(run({...base,delivery:edit}),null);
});
test('rain/cold/earthquake remain CHAT broadcasts',()=>{
 for(const type of ['rain','cold','earthquake']){
 const p=JSON.parse(run({id:'hazard-test',type,message:'[測試]'}).payload);
 assert.equal(p.to,4294967295);assert.equal(p.deliveryMode,'broadcast');assert.equal(p.channel,0);
 }
});
