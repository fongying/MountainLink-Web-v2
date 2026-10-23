import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardPayloadHash } from './hazard-identity.ts';
test('same hazard deduplicates across monitor ticks and manual refreshes', () => {
 const a = {id:'rain-1',status:'active',message:'rain',generatedAt:'first',reason:'boot'};
 assert.equal(hazardPayloadHash(a),hazardPayloadHash({...a,generatedAt:'next',reason:'refresh'}));
});
test('content changes and ending hazards produce new dispatch identities', () => {
 const a = {id:'rain-1',status:'active',message:'rain'};
 assert.notEqual(hazardPayloadHash(a),hazardPayloadHash({...a,message:'heavy rain'}));
 assert.notEqual(hazardPayloadHash(a),hazardPayloadHash({...a,status:'ended'}));
});
