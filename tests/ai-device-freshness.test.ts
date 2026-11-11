import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterAiDevices, AI_DEVICE_MAX_AGE_MS} from '../src/lib/ai-device-freshness.ts';
const now=Date.UTC(2026,9,23,9);
test('21-day boundary: exclude exactly 21 days and older, keep one millisecond newer',()=>{
 const data=[{id:'newer',updatedAt:now-AI_DEVICE_MAX_AGE_MS+1},{id:'boundary',updatedAt:now-AI_DEVICE_MAX_AGE_MS},{id:'older',updatedAt:now-AI_DEVICE_MAX_AGE_MS-1}];
 assert.deepEqual(filterAiDevices(data,now).map(d=>d.id),['newer']);
});
test('old SOS cannot outrank recent SOS; recent offline remains eligible and history is untouched',()=>{
 const old={id:'July-SOS',updatedAt:Date.UTC(2026,6,4),sos:true,online:false};
 const current={id:'current-SOS',updatedAt:now-300000,sos:true,online:true};
 const offline={id:'recent-offline',updatedAt:now-86400000,sos:false,online:false};
 const original=[old,current,offline];
 assert.deepEqual(filterAiDevices(original,now).map(d=>d.id),['current-SOS','recent-offline']);
 assert.equal(original.length,3); assert.equal(original[0],old);
});
test('missing, nonfinite, zero and implausible future timestamps are not current evidence',()=>{
 const data=[{updatedAt:NaN},{updatedAt:Infinity},{updatedAt:0},{updatedAt:now+60001},{updatedAt:now}];
 assert.deepEqual(filterAiDevices(data,now),[{updatedAt:now}]);
});
