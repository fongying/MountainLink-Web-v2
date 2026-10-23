import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeDemoPlayback,PLAYBACK_WINDOW,PLAYBACK_STEP,hasPosition,lastPosition,routeSegments,
  samplePlaybackRows,playbackEvents,playbackTime,type PlaybackRow } from './playback.ts';
const now=Date.parse('2026-10-23T13:17:42Z');
test('demo is exactly 72 hours with 145 inclusive half-hour frames and stable snapshot',()=>{
 const a=makeDemoPlayback(now),b=makeDemoPlayback(now+10000);
 assert.equal(a.end-a.start,PLAYBACK_WINDOW);assert.equal(a.frames.length,145);
 assert.deepEqual(a,b);assert.equal(a.end%PLAYBACK_STEP,0);
 a.frames.forEach((p,i)=>assert.equal(p.ts,a.start+i*PLAYBACK_STEP));
 assert.ok(a.demo);assert.ok(a.frames.every(p=>p.source==='demo'));
});
test('SOS/offline transition keeps unknown positions blank and never draws across missing GPS',()=>{
 const {frames}=makeDemoPlayback(now);
 assert.equal(frames[119].sos,false);assert.equal(frames[120].sos,true);
 for(let i=125;i<=130;i++) {assert.equal(frames[i].online,false);assert.equal(frames[i].lat,null);assert.equal(frames[i].hr,null);}
 assert.equal(lastPosition(frames,128),frames[124]);
 assert.equal(routeSegments(frames).length,2);
 assert.equal(routeSegments(frames,128).length,1);
 assert.ok(playbackEvents(frames).some(e=>e.index===125));
 assert.ok(playbackEvents(frames).some(e=>e.index===131));
});
test('invalid coordinates never create map points',()=>{
 const p=makeDemoPlayback(now).frames[0];
 for(const change of [{lat:NaN},{lat:91},{lon:181},{lat:null},{gpsValid:false}]) assert.equal(hasPosition({...p,...change}),false);
});
test('sampling never pulls a future report into an earlier frame or fills empty buckets',()=>{
 const start=now,end=start+3*PLAYBACK_STEP;
 const row:PlaybackRow={ts:start+1,lat:24,lon:121,alt:3200,hr:80,battery:90,sos:0,gps_valid:1};
 const frames=samplePlaybackRows([row,{...row,ts:start+100,hr:95},{...row,ts:start-1},{...row,ts:end+1}],start,end);
 assert.equal(frames.length,4);assert.equal(frames[0].source,'missing');
 assert.equal(frames[1].hr,95);assert.equal(frames[2].hr,null);assert.equal(frames[2].source,'missing');
 frames.forEach(p=>assert.ok(p.sampleAt==null||p.sampleAt<=p.ts));
});
test('ten-minute rule is applied at selected historical time, not present clock',()=>{
 const row:PlaybackRow={ts:now+PLAYBACK_STEP-600000,lat:24,lon:121,alt:3200,hr:80,battery:90,sos:0,gps_valid:1};
 assert.equal(samplePlaybackRows([row],now,now+PLAYBACK_STEP)[1].online,false);
 assert.equal(samplePlaybackRows([{...row,ts:row.ts+1}],now,now+PLAYBACK_STEP)[1].online,true);
});
test('invalid GPS is blank and time labels always use Taiwan timezone',()=>{
 const row:PlaybackRow={ts:now,lat:24,lon:121,alt:3200,hr:80,battery:90,sos:0,gps_valid:0};
 const frame=samplePlaybackRows([row],now,now)[0];assert.equal(frame.lat,null);assert.equal(frame.alt,null);
 assert.match(playbackTime(now),/21:17/);
});
