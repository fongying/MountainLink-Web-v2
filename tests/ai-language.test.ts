import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommendationLanguageErrors,generateChineseRecommendation,AiLanguageError} from '../src/lib/ai-language.ts';
test('Chinese prose allows IDs, acronyms and units while English paragraph is rejected',()=>{
 assert.deepEqual(recommendationLanguageErrors({title:'NT-DEMO-002 強風與降雨風險',physiologySummary:'目前無生理異常；GPS有效，HR為72 bpm。',message:'合歡山隊伍請回報狀態與需求。'}),[]);
 assert.ok(recommendationLanguageErrors({title:'Potential Danger for NT-DEMO-002: High Wind and Rain Expected'}).length);
 assert.ok(recommendationLanguageErrors({globalSummary:'合歡山隊伍 The forecast predicts strong winds and heavy rain. Please take immediate precautions.'}).length);
 assert.ok(recommendationLanguageErrors({title:'队伍风险升高，建议确认设备状态'}).length);
});
test('English response is regenerated once with language feedback',async()=>{
 const feedback:string[]=[];
 const result=await generateChineseRecommendation(async hint=>{feedback.push(hint);return {json:{title:feedback.length===1?'High wind expected':'預期強風，請留意安全'},model:'test'};});
 assert.equal(feedback.length,2);assert.match(feedback[1],/繁體中文/);assert.equal(result.json.title,'預期強風，請留意安全');
});
test('persistent English fails before report publication, with a bounded retry',async()=>{
 let count=0;
 await assert.rejects(()=>generateChineseRecommendation(async()=>{count++;return {json:{title:'High wind expected'}};}),AiLanguageError);
 assert.equal(count,2);
});
