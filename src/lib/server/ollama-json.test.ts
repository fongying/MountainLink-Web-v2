import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestStructuredJson, constrainRecommendationSchema } from './ollama-json.ts';
const opts = { baseUrl: 'http://lab', model: 'test', cpuOnly: false, system: 'system', prompt: 'input', schema: {type:'object'}, signal: new AbortController().signal };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
test('full structured answer can exceed former 512 token budget', async () => {
  const json = { summary: '山'.repeat(900) };
  const r = await requestStructuredJson(opts, async (_, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.options.num_predict, 2048);assert.deepEqual(body.format, opts.schema);
    return reply({done:true,done_reason:'stop',eval_count:1200,response:JSON.stringify(json)});
  });
  assert.deepEqual(r.json, json);
});
test('truncated answer retries with larger budget and same schema, prompt and deadline', async () => {
  let count=0;
  const r=await requestStructuredJson(opts, async (_,init) => {
    const body=JSON.parse(String(init?.body));count++;
    assert.equal(init?.signal, opts.signal);assert.deepEqual(body.format,opts.schema);assert.ok(body.prompt.startsWith(opts.prompt));
    assert.equal(body.options.num_predict,count===1?2048:4096);
    return reply(count===1?{done:true,done_reason:'length',response:'{"summary":"partial'}:{done:true,done_reason:'stop',response:'{"summary":"complete"}'});
  });
  assert.equal(count,2);assert.deepEqual(r.json,{summary:'complete'});
});
test('valid-looking but length-stopped output is never accepted', async () => {
  await assert.rejects(requestStructuredJson(opts,async()=>reply({done:true,done_reason:'length',response:'{"ok":true}'})),/輸出上限/);
});
test('malformed JSON and empty output retry while keeping schema', async () => {
  for (const text of ['', 'not json']) {
    let count=0;
    await requestStructuredJson(opts,async(_,init)=>{count++;assert.deepEqual(JSON.parse(String(init?.body)).format,opts.schema);return reply({done:true,response:count===1?text:'{"ok":true}'});});
    assert.equal(count,2);
  }
});
test('invalid JSON stops after two attempts without fabricating an answer', async () => {
  let count=0;
  await assert.rejects(requestStructuredJson(opts,async()=>{count++;return reply({done:true,response:'{"bad":"'});}),/兩次回覆/);
  assert.equal(count,2);
});
test('HTTP runner failure does not trigger a second expensive generation', async () => {
  let count=0;
  await assert.rejects(requestStructuredJson(opts,async()=>{count++;return reply({error:'runner failed'},500);}),/500/);
  assert.equal(count,1);
});
test('CPU mode is retained on retry', async () => {
  let count=0;
  await requestStructuredJson({...opts,cpuOnly:true},async(_,init)=>{count++;assert.equal(JSON.parse(String(init?.body)).options.num_gpu,0);return reply({done:true,response:count===1?'':'{"ok":true}'});});
  assert.equal(count,2);
});

test('recommendation identifiers and areas are constrained without removing required fields', () => {
 const original={type:'object',properties:{title:{type:'string'}},required:['title','focusDeviceId','evidenceIds','targetAreas']};
 const schema=constrainRecommendationSchema(original,{focusDeviceId:'FOCUS',evidenceIds:['h1','h1'],targetAreas:['臺中市和平區']});
 assert.deepEqual((schema as Record<string, unknown>).required,original.required);
 assert.deepEqual(schema.properties.focusDeviceId,{type:'string',const:'FOCUS'});
 assert.deepEqual(schema.properties.evidenceIds.items,{type:'string',enum:['h1']});
 assert.deepEqual(schema.properties.targetAreas.items,{type:'string',enum:['臺中市和平區']});
 assert.deepEqual(original.properties,{title:{type:'string'}});
});
test('empty catalogs allow only empty arrays rather than invalid enums', () => {
 const schema=constrainRecommendationSchema({properties:{}},{focusDeviceId:'FOCUS',evidenceIds:[],targetAreas:[]});
 assert.equal(schema.properties.evidenceIds.maxItems,0);
 assert.equal(schema.properties.targetAreas.maxItems,0);
});
test('saturated input is rejected; Chinese reminder is last in request',async()=>{
 await assert.rejects(requestStructuredJson({...opts,system:'請使用繁體中文'},async(_,init)=>{
   const body=JSON.parse(String(init?.body));assert.match(body.prompt,/不得補造資料。$/);return reply({done:true,prompt_eval_count:8192,response:'{"ok":true}'});
 }),/上下文上限/);
});
