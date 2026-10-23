import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { assessGeohazards, locate, edgeDistance, type GeoDataset } from '../src/lib/geohazards.ts';
const polygon={type:'Polygon' as const,coordinates:[[[120,23],[120.01,23],[120.01,23.01],[120,23.01],[120,23]],[[120.004,23.004],[120.006,23.004],[120.006,23.006],[120.004,23.006],[120.004,23.004]]] as [number,number][][]};
const dataset=JSON.parse(readFileSync('data/geohazards/landslides-115.geojson','utf8')) as GeoDataset;
const now=Date.now();
test('polygon interior, hole, boundary, exterior and multipolygon',()=>{
 assert.equal(locate([120.002,23.002],polygon).relation,'inside');
 assert.equal(locate([120.005,23.005],polygon).relation,'outside');
 assert.equal(locate([120,23.005],polygon).relation,'boundary');
 assert.equal(locate([119,23],polygon).relation,'outside');
 assert.equal(locate([120.002,23.002],{type:'MultiPolygon',coordinates:[polygon.coordinates]}).relation,'inside');
});
test('edge distance is to segment, not infinite line',()=>{
 assert.ok(Math.abs(edgeDistance([120,23],[120.01,23],[120.02,23])-1024)<5);
});
test('missing, invalid, stale and future GPS never report a current match',()=>{
 for(const d of [{updatedAt:now},{lat:91,lon:120,updatedAt:now},{lat:23,lon:120,updatedAt:now,mx2GpsValid:false},{lat:23,lon:120,updatedAt:now,mx2PositionTs:now-600001},{lat:23,lon:120,updatedAt:now+120000}]) {
   const r=assessGeohazards(d,dataset,now);assert.notEqual(r.status,'ok');assert.equal(r.matches.length,0);
 }
 assert.equal(assessGeohazards({updatedAt:now},null,now).status,'unavailable');
});
test('official data: two layers, 94 each; geographic coordinates and privacy allowlist',()=>{
 assert.equal(dataset.features.length,188);
 for(const kind of ['potential','impact']) assert.equal(dataset.features.filter(f=>f.properties.kind===kind).length,94);
 for(const f of dataset.features){assert.ok(f.properties.officialId);assert.ok(!('address' in f.properties));assert.notEqual(f.properties.risk,'undefined');}
});
test('outside both layers returns separately labelled nearest boundaries, no safe claim',()=>{
 const result=assessGeohazards({lat:23.57489,lon:119.5824,updatedAt:now},dataset,now);
 assert.equal(result.status,'ok');assert.equal(result.matches.length,2);
 assert.ok(result.matches.every(m=>m.relation==='outside'&&m.distanceMeters>0));
 assert.match(result.summary,/不代表/);assert.equal(result.accuracyKnown,false);
});
test('all 188 official geometries agree with independent Shapely/PROJ reference',()=>{
 const fixtures=JSON.parse(readFileSync('tests/geohazards-reference.json','utf8'));
 for(const item of fixtures){
  const f=dataset.features.find(f=>f.id===item.id)!;
  const result=locate(item.point,f.geometry);
  assert.equal(result.relation,item.relation,item.id);
  assert.ok(Math.abs(result.distanceMeters-item.distance)<Math.max(2,item.distance*0.01),`${item.id}: ${result.distanceMeters} vs ${item.distance}`);
 }
});
import { validateGeohazardClaims } from '../src/lib/geohazard-validation.ts';
test('AI cannot contradict expired or outside official position evidence',()=>{
 const stale=assessGeohazards({lat:23,lon:120,updatedAt:0},dataset,now);
 assert.equal(validateGeohazardClaims(['該裝置位於南投縣仁愛鄉，附近存在崩塌潛勢區域。'],stale).length,1);
 const outside=assessGeohazards({lat:23.57,lon:119.58,updatedAt:now},dataset,now);
 assert.equal(validateGeohazardClaims(['隊伍位於崩塌潛勢區內'],outside).length,1);
 assert.deepEqual(validateGeohazardClaims(['座標未落入崩塌潛勢區，不代表安全。'],outside),[]);
 assert.deepEqual(validateGeohazardClaims(['請留意天候並確認路線安全。'],outside),[]);
 const inside={...outside,matches:[{...outside.matches[0],relation:'inside' as const}]};
 assert.deepEqual(validateGeohazardClaims(['位於崩塌潛勢區內'],inside),[]);
});
