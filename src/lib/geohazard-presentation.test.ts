import assert from 'node:assert/strict';
import { test } from 'node:test';
import { geohazardPresentation,geohazardDistance } from './geohazard-presentation.ts';
import type { GeoAssessment } from './geohazards.ts';
const base:GeoAssessment={status:'ok',summary:'未落入',accuracyKnown:false,matches:[]};
const match={officialId:'test',kind:'potential' as const,name:'',county:'',town:'',village:'',risk:'中',dataset:'176527',year:115,relation:'outside' as const,distanceMeters:98621};
test('far outside with unknown GPS accuracy is quiet; nearest feature risk is not device risk',()=>{
 const view=geohazardPresentation({...base,matches:[match]});assert.equal(view.mode,'quiet');assert.deepEqual(view.highlighted,[]);
 assert.equal(geohazardPresentation({...base,accuracyKnown:true,matches:[match]}).mode,'quiet');
});
test('inside and exact boundary are highlighted only for valid current assessments',()=>{
 assert.equal(geohazardPresentation({...base,matches:[{...match,relation:'inside'}]}).mode,'inside');
 assert.equal(geohazardPresentation({...base,matches:[{...match,relation:'boundary'}]}).mode,'boundary');
});
test('UI proximity cue is limited to 100 m and does not change outside relation',()=>{
 for(const distanceMeters of [0,99,100])assert.equal(geohazardPresentation({...base,matches:[{...match,distanceMeters}]}).mode,'near');
 for(const distanceMeters of [101,98621,Infinity,NaN,-1])assert.equal(geohazardPresentation({...base,matches:[{...match,distanceMeters}]}).mode,'quiet');
});
test('stale/invalid/missing/unavailable positions never reuse an inside alert or claim outside',()=>{
 for(const status of ['stale','invalid_gps','no_location','unavailable'] as const){
  const view=geohazardPresentation({...base,status,matches:[{...match,relation:'inside'}]});
  assert.equal(view.mode,'quiet');assert.notEqual(view.label,'未落入本版圖資範圍');
 }
 assert.equal(geohazardPresentation(null).mode,'quiet');
});
test('nearer relevant match is used rather than unrelated far nearest results',()=>{
 const view=geohazardPresentation({...base,matches:[match,{...match,officialId:'near',distanceMeters:50}]});
 assert.equal(view.highlighted.length,1);assert.equal(view.highlighted[0].officialId,'near');
});
test('distance formatting does not imply a route distance or invent missing distance',()=>{
 assert.equal(geohazardDistance(98621),'98.6 km');assert.equal(geohazardDistance(100),'100 m');
 assert.equal(geohazardDistance(NaN),'未提供');
});
