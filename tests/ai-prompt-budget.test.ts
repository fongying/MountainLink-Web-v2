import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compactRecommendationPrompt} from '../src/lib/server/ai-prompt-budget.ts';
test('oversized context is bounded without losing focus geometry, evidence IDs or valid JSON',()=>{
 const snapshot={focusDeviceId:'fresh',teamRiskContext:[{deviceId:'fresh',geohazard:{status:'ok',summary:'不在範圍不代表安全'}},{deviceId:'other'}],evidenceCatalog:Array.from({length:30},(_,i)=>({id:`forecast:${i}`,source:'forecast',label:`地區${i}`,detail:'天氣預報'.repeat(100)})),mountainForecast72h:Array.from({length:30},(_,i)=>({id:`forecast:${i}`,periods:Array.from({length:4},()=>({startTime:'2026-10-23',pop:80,description:'背景'.repeat(500)}))}))};
 const text=compactRecommendationPrompt(JSON.stringify(snapshot),6000), result=JSON.parse(text);
 assert.ok(Buffer.byteLength(text)<=6000);assert.equal(result.focusDeviceId,'fresh');assert.deepEqual(result.teamRiskContext[0],snapshot.teamRiskContext[0]);assert.deepEqual(result.evidenceCatalog.map((e:any)=>e.id),snapshot.evidenceCatalog.map(e=>e.id));assert.ok(result.contextCoverage.detailedForecastsOmitted>0);
});
test('oversized indispensable focus evidence fails closed; non-AI probes unchanged',()=>{
 assert.throws(()=>compactRecommendationPrompt(JSON.stringify({teamRiskContext:[{deviceId:'focus',data:'核心'.repeat(4000)}],evidenceCatalog:[]}),1000),/核心證據/);
 assert.equal(compactRecommendationPrompt('請回覆JSON',200),'請回覆JSON');
});
