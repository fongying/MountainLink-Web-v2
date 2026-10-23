import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sqlite3 from 'sqlite3';
import { createMx2Store } from './mx2-ingest.ts';

test('atomic ingestion, retries, conflicts, chronology, GPS validity, mock and SOS', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'mx2-'));
  const path = join(folder, 'test.db');
  const db = new sqlite3.Database(path);
  const run = (sql: string) => new Promise<void>((resolve, reject) => db.exec(sql, e => e ? reject(e) : resolve()));
  const get = (sql: string) => new Promise<any>((resolve, reject) => db.get(sql, (e, r) => e ? reject(e) : resolve(r)));
  await run(`CREATE TABLE telemetry_history(id INTEGER PRIMARY KEY,device_id TEXT,ts INTEGER,hr INTEGER,battery INTEGER,lat REAL,lon REAL,alt REAL,recv_ts TEXT,sender TEXT,raw_text TEXT,raw_json TEXT,packet_id INTEGER,channel INTEGER,hops_away INTEGER,hop_start INTEGER,rssi REAL,snr REAL);
    CREATE UNIQUE INDEX legacy_packet ON telemetry_history(device_id,packet_id) WHERE packet_id IS NOT NULL;
    CREATE TABLE device_state(device_id TEXT PRIMARY KEY,updated_at INTEGER,recv_ts TEXT,hr INTEGER,lat REAL,lon REAL,alt REAL,sender TEXT,raw_text TEXT,raw_json TEXT,sos INTEGER DEFAULT 0,updated_at_iso TEXT,packet_id INTEGER,channel INTEGER,hops_away INTEGER,hop_start INTEGER,rssi REAL,snr REAL,battery INTEGER,charging INTEGER);`);
  const store = createMx2Store(path);
  const now = Math.floor(Date.now()/1000)*1000;
  const short = createHash('sha256').update('TEST-R01').digest('hex').slice(0,8).toUpperCase();
  const sample = (seq: number, flags = 3, stamp = now) => ({gateway_id:'test',source_node:'12345678',
    run_short:short,run_id:'TEST-R01',node_id:'H01',experiment_id:'TEST',condition_id:'C01',seq,
    sample_ts:stamp,recv_ts:new Date(stamp+1000).toISOString(),lat:23.5,lon:121,alt:10,hr:80,
    gps_valid:!!(flags&1),heart_rate_valid:!!(flags&2),data_source:flags&4?'mock':'real',
    raw_text:`MX2,${short},${seq},${seq},235000000,1210000000,100,80,${flags}`});
  try {
    assert.equal((await store.ingest(sample(1))).status,'inserted');
    await run('UPDATE device_state SET sos=1,battery=101,charging=1');
    assert.equal((await store.ingest(sample(1))).status,'existing');
    const radio={packet_id:2652100741,channel:1,hop_start:3,hop_limit:3,rx_rssi:-81,rx_snr:7.5};
    assert.equal((await store.ingest({...sample(1),...radio})).status,'existing');
    const enriched=await get('SELECT * FROM device_state');
    assert.equal(enriched.packet_id,radio.packet_id);assert.equal(enriched.channel,1);
    assert.equal(enriched.hops_away,0);assert.equal(enriched.hop_start,3);
    assert.equal(enriched.rssi,-81);assert.equal(enriched.snr,7.5);
    assert.equal(enriched.battery,101);assert.equal(enriched.charging,1);
    assert.equal((await get('SELECT mx2_packet_id FROM telemetry_history')).mx2_packet_id,radio.packet_id);
    await store.ingest({...sample(1),...radio,channel:2});
    assert.equal((await get('SELECT channel FROM device_state')).channel,1);
    assert.equal((await store.ingest({...sample(1),gateway_id:'second',source_node:'87654321'})).status,'existing');
    assert.equal((await get('SELECT count(*) n FROM telemetry_history')).n,1);
    await assert.rejects(store.ingest({...sample(1),condition_id:'OTHER'}), /conflict/);
    await store.ingest({...sample(2,2,now+2000),...radio});
    const state = await get('SELECT * FROM device_state');
    assert.equal(state.lat,23.5); assert.equal(state.mx2_gps_valid,0);
    assert.equal(state.mx2_position_ts,now); assert.equal(state.sos,1);
    await store.ingest({...sample(3,3,now-10000),...radio,channel:7});
    assert.equal((await get('SELECT mx2_sample_ts t FROM device_state')).t,now+2000);
    assert.equal((await get('SELECT channel FROM device_state')).channel,1);
    await store.ingest(sample(4,7,now+3000));
    assert.equal((await get('SELECT count(*) n FROM telemetry_history')).n,3);
    assert.equal((await get('SELECT mx2_sample_ts t FROM device_state')).t,now+2000);
    await assert.rejects(store.ingest({...sample(5),lat:99}), /invalid lat/);
    await assert.rejects(store.ingest({...sample(5),channel:99}), /invalid channel/);
    await assert.rejects(store.ingest({...sample(5),hop_start:1,hop_limit:3}), /inconsistent hop/);
    await run(`CREATE TRIGGER fail_history BEFORE INSERT ON telemetry_history BEGIN SELECT RAISE(ABORT,'injected'); END;`);
    await assert.rejects(store.ingest(sample(6)), /injected/);
    assert.equal((await get('SELECT count(*) n FROM mx2_samples WHERE seq=6')).n,0);
    await run('DROP TRIGGER fail_history');
    assert.equal((await store.ingest(sample(6))).status,'inserted');
    const results = await Promise.all([store.ingest(sample(7)),store.ingest(sample(7))]);
    assert.deepEqual(results.map(x=>x.status),['inserted','existing']);
    const power=(seq: number,level: number,stamp=now+seq*1000)=>{
      const p=sample(seq,3,stamp);return {...p,battery_raw:level,raw_text:p.raw_text+','+level};
    };
    for(const level of [0,57,100,101,255]) {
      const seq=10+[0,57,100,101,255].indexOf(level);
      await store.ingest(power(seq,level));
      const state=await get('SELECT battery,mx2_battery_raw,mx2_battery_ts,lat FROM device_state');
      assert.equal(state.battery,level<=100?level:null);
      assert.equal(state.mx2_battery_raw,level);assert.equal(state.mx2_battery_ts,now+seq*1000);
      assert.equal(state.lat,23.5);
      assert.equal((await store.ingest(power(seq,level))).status,'existing');
    }
    await store.ingest(power(20,57,now-20000));
    assert.equal((await get('SELECT mx2_battery_raw v FROM device_state')).v,255);
    const legacy=sample(21,3,now+30000);
    await store.ingest(legacy);
    assert.equal((await get('SELECT mx2_battery_raw v FROM device_state')).v,255);
    await assert.rejects(store.ingest(power(22,102)),/battery_raw/);
    await assert.rejects(store.ingest({...power(22,57),battery_raw:101}),/battery_raw/);
    await assert.rejects(store.ingest({...sample(22),battery_raw:57}),/legacy Core/);
  } finally {
    await store.close(); await new Promise<void>(r=>db.close(()=>r()));
    await rm(folder,{recursive:true,force:true});
  }
});
