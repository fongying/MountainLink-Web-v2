import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync,mkdirSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('SQLite range query picks final sample per interval, filters mock and demo never writes telemetry',async()=>{
 const cwd=process.cwd(),dir=mkdtempSync(join(tmpdir(),'mlink-playback-'));mkdirSync(join(dir,'data'));process.chdir(dir);
 const { db }=await import('$lib/server/db');
 const { getDevicePlayback }=await import('$lib/server/playback');
 const { playbackRange,PLAYBACK_STEP }=await import('$lib/playback');
 const run=(sql:string,p:unknown[]=[])=>new Promise<void>((res,rej)=>db.run(sql,p as any,e=>e?rej(e):res()));
 const count=()=>new Promise<number>((res,rej)=>db.get('SELECT count(*) AS n FROM telemetry_history',(e,row:any)=>e?rej(e):res(row.n)));
 try {
  const {start}=playbackRange();
  for(const [delta,hr,source] of [[1,70,'real'],[500,80,'real'],[600,90,'mock'],[PLAYBACK_STEP+1,85,'real'],[-1,99,'real']] as const)
   await run('INSERT INTO telemetry_history(device_id,ts,lat,lon,hr,raw_json) VALUES(?,?,?,?,?,?)',
    ['real-device',start+delta,24,121,hr,JSON.stringify({data_source:source,gps_valid:true})]);
  const before=await count();const result=await getDevicePlayback('real-device','真實裝置');
  assert.equal(result.frames.length,145);assert.equal(result.frames[0].source,'missing');
  assert.equal(result.frames[1].hr,80);assert.equal(result.frames[2].hr,85);
  assert.equal(result.frames[3].source,'missing');assert.equal(result.demo,false);
  const demo=await getDevicePlayback('NT-DEMO-002','合歡山 SOS 示範隊');assert.equal(demo.demo,true);
  assert.equal(await count(),before);
 } finally {await new Promise<void>((res,rej)=>db.close(e=>e?rej(e):res()));process.chdir(cwd);rmSync(dir,{recursive:true,force:true});}
});
