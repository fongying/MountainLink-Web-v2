import sqlite3 from 'sqlite3';
import { createHash } from 'node:crypto';

export class Mx2Error extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function radioMetadata(p: any) {
  const ranges: Record<string, [number, number, boolean]> = {
    packet_id: [0, 4294967295, true], channel: [0, 7, true],
    hop_start: [0, 7, true], hop_limit: [0, 7, true], hop_count: [0, 7, true],
    rx_rssi: [-200, 100, false], rx_snr: [-100, 100, false]
  };
  const out: Record<string, number | null> = {};
  for (const [name, [min, max, integer]] of Object.entries(ranges)) {
    const v = p[name];
    if (v == null) { out[name] = null; continue; }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max ||
      (integer && !Number.isInteger(v))) throw new Mx2Error(`invalid ${name}`);
    out[name] = v;
  }
  if (out.hop_start != null && out.hop_limit != null) {
    const hops = out.hop_start - out.hop_limit;
    if (hops < 0 || (out.hop_count != null && out.hop_count !== hops))
      throw new Mx2Error('inconsistent hop metadata');
    out.hop_count ??= hops;
  }
  return out;
}

export function validateSample(p: any) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Mx2Error('object required');
  radioMetadata(p);
  const token = (key: string, max = 64) => {
    if (typeof p[key] !== 'string' || !new RegExp(`^[A-Za-z0-9_.!\\-]{1,${max}}$`).test(p[key]))
      throw new Mx2Error(`invalid ${key}`);
  };
  for (const key of ['gateway_id', 'run_id', 'node_id', 'experiment_id', 'condition_id']) token(key);
  if (!/^[0-9a-f]{8}$/.test(p.source_node) || !/^[A-Z0-9]{4,8}$/.test(p.run_short))
    throw new Mx2Error('invalid source or run short');
  if (createHash('sha256').update(p.run_id).digest('hex').slice(0, 8).toUpperCase() !== p.run_short)
    throw new Mx2Error('run hash mismatch');
  const number = (key: string, min: number, max: number, integer = false) => {
    if (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] < min || p[key] > max ||
      (integer && !Number.isInteger(p[key]))) throw new Mx2Error(`invalid ${key}`);
  };
  number('seq', 1, 10_000_000, true);
  number('sample_ts', 1e12, 4.2e12, true);
  number('lat', -90, 90); number('lon', -180, 180); number('alt', -1000, 10000);
  number('hr', 0, 255, true);
  if (typeof p.gps_valid !== 'boolean' || typeof p.heart_rate_valid !== 'boolean' ||
    !['mock', 'real'].includes(p.data_source)) throw new Mx2Error('invalid validity/source');
  if (typeof p.recv_ts !== 'string') throw new Mx2Error('invalid recv_ts');
  const received = Date.parse(p.recv_ts);
  if (!Number.isFinite(received) || received < 1e12 || received > Date.now() + 300_000 ||
    p.sample_ts > received + 300_000) throw new Mx2Error('invalid sample/receive time');
  const fields = typeof p.raw_text === 'string' ? p.raw_text.split(',') : [];
  if (![9,10].includes(fields.length) || fields[0] !== 'MX2' || fields[1] !== p.run_short ||
      fields.slice(2).some((x: string) => !/^(0|-?[1-9][0-9]*)$/.test(x)))
    throw new Mx2Error('invalid Core');
  if (fields.length === 10) {
    const battery = Number(fields[9]);
    if (battery < 0 || (battery > 101 && battery !== 255) || p.battery_raw !== battery)
      throw new Mx2Error('invalid or mismatched battery_raw');
  } else if (p.battery_raw != null) throw new Mx2Error('battery not present in legacy Core');
  const [seq, elapsed, lat, lon, alt, hr, flags] = fields.slice(2).map(Number);
  if (seq !== p.seq || elapsed < 0 || elapsed > 31536000 || lat / 1e7 !== p.lat ||
    lon / 1e7 !== p.lon || alt / 10 !== p.alt || hr !== p.hr || flags < 0 || flags > 7 ||
    Boolean(flags & 1) !== p.gps_valid || Boolean(flags & 2) !== p.heart_rate_valid ||
    (flags & 4 ? 'mock' : 'real') !== p.data_source) throw new Mx2Error('Core mapping mismatch');
  const key = `${p.gateway_id}:${p.source_node}:${p.run_short}:${p.seq}`;
  // Independent of gateway/receipt metadata: two gateways must agree on sample content.
  const fingerprint = createHash('sha256').update(JSON.stringify([
    p.run_id, p.node_id, p.seq, p.sample_ts, p.raw_text,
    p.experiment_id, p.condition_id
  ])).digest('hex');
  return { key, fingerprint, received };
}

export function createMx2Store(path = 'data/app.db') {
  const connection = new sqlite3.Database(path);
  connection.configure('busyTimeout', 10000);
  const run = (sql: string, args: any[] = []) => new Promise<void>((resolve, reject) =>
    connection.run(sql, args, (err) => err ? reject(err) : resolve()));
  const get = (sql: string, args: any[] = []) => new Promise<any>((resolve, reject) =>
    connection.get(sql, args, (err, row) => err ? reject(err) : resolve(row)));
  const all = (sql: string) => new Promise<any[]>((resolve, reject) =>
    connection.all(sql, (err, rows) => err ? reject(err) : resolve(rows)));
  const ready = (async () => {
    await run(`CREATE TABLE IF NOT EXISTS mx2_samples (
      source_node TEXT,run_id TEXT,node_id TEXT,seq INTEGER, gateway_id TEXT,run_short TEXT,
      fingerprint TEXT NOT NULL,received_at INTEGER NOT NULL,uploaded_at INTEGER NOT NULL,
      sample_ts INTEGER NOT NULL,data_source TEXT NOT NULL,payload_json TEXT NOT NULL,
      history_id INTEGER, PRIMARY KEY(run_id,node_id,seq))`);
    for (const table of ['device_state', 'telemetry_history']) {
      const columns = new Set((await all(`PRAGMA table_info(${table})`)).map((r: any) => r.name));
      for (const [name, type] of [['mx2_gps_valid', 'INTEGER'], ['mx2_position_ts', 'INTEGER'],
        ['mx2_sample_ts', 'INTEGER'], ['mx2_data_source', 'TEXT'], ['mx2_packet_id', 'INTEGER'],
        ['mx2_battery_raw','INTEGER'], ['mx2_battery_ts','INTEGER']]) {
        if (!columns.has(name)) await run(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
      }
    }
  })();
  let serial: Promise<any> = ready;
  async function saveBattery(p: any, historyId: number | null) {
    if (p.battery_raw == null || historyId == null) return;
    const percentage = p.battery_raw <= 100 ? p.battery_raw : null;
    await run(`UPDATE telemetry_history SET battery=?,mx2_battery_raw=?,mx2_battery_ts=? WHERE id=?`,
      [percentage,p.battery_raw,p.sample_ts,historyId]);
    // Battery is part of the same sample. Old uploads cannot replace current device state.
    await run(`UPDATE device_state SET battery=?,mx2_battery_raw=?,mx2_battery_ts=?
      WHERE device_id=? AND mx2_sample_ts=? AND json_extract(raw_json,'$.run_id')=? AND json_extract(raw_json,'$.seq')=?`,
      [percentage,p.battery_raw,p.sample_ts,p.node_id,p.sample_ts,p.run_id,p.seq]);
  }
  async function saveRadio(p: any, historyId: number | null) {
    const m = radioMetadata(p);
    const values = [m.packet_id, m.channel, m.hop_count, m.hop_start, m.rx_rssi, m.rx_snr];
    if (historyId != null) {
      const before = await get('SELECT mx2_packet_id,channel,hops_away,hop_start,rssi,snr FROM telemetry_history WHERE id=?', [historyId]);
      const columns = ['mx2_packet_id','channel','hops_away','hop_start','rssi','snr'];
      const enriched = before && values.some((value, i) => value != null && before[columns[i]] == null);
      // Keep the original radio ID outside the legacy device/packet UNIQUE index.
      // MX2 sample identity is run + node + seq, so a reused 32-bit packet ID cannot drop a sample.
      await run(`UPDATE telemetry_history SET mx2_packet_id=COALESCE(mx2_packet_id,?),
        channel=COALESCE(channel,?),hops_away=COALESCE(hops_away,?),hop_start=COALESCE(hop_start,?),
        rssi=COALESCE(rssi,?),snr=COALESCE(snr,?),raw_json=? WHERE id=?`,
        [...values, JSON.stringify(p), historyId]);
      await run(`UPDATE device_state SET packet_id=COALESCE(packet_id,?),
        channel=COALESCE(channel,?),hops_away=COALESCE(hops_away,?),hop_start=COALESCE(hop_start,?),
        rssi=COALESCE(rssi,?),snr=COALESCE(snr,?),raw_json=?
        WHERE device_id=? AND mx2_sample_ts=? AND json_extract(raw_json,'$.run_id')=? AND json_extract(raw_json,'$.seq')=?`,
        [...values, JSON.stringify(p), p.node_id, p.sample_ts, p.run_id, p.seq]);
      return Boolean(enriched);
    }
    return false;
  }
  async function save(p: any) {
    const { key, fingerprint, received } = validateSample(p);
    await run('BEGIN IMMEDIATE');
    try {
      const identity = [p.run_id, p.node_id, p.seq];
      const existing = await get('SELECT fingerprint,history_id,payload_json FROM mx2_samples WHERE run_id=? AND node_id=? AND seq=?', identity);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new Mx2Error('sample content conflict', 409);
        const original = JSON.parse(existing.payload_json);
        // Enrich missing metadata without replacing the first Gateway's recorded measurements.
        for (const [name, value] of Object.entries(radioMetadata(p))) {
          if (original[name] == null && value != null) original[name] = value;
        }
        const metadataUpdated = await saveRadio(original, existing.history_id);
        await saveBattery(original, existing.history_id);
        await run('UPDATE mx2_samples SET payload_json=? WHERE run_id=? AND node_id=? AND seq=?', [JSON.stringify(original), ...identity]);
        await run('COMMIT');
        return { key, status: 'existing', metadata_updated: metadataUpdated };
      }
      const body = JSON.stringify(p);
      await run(`INSERT INTO mx2_samples
        (source_node,run_id,node_id,seq,gateway_id,run_short,fingerprint,received_at,uploaded_at,sample_ts,data_source,payload_json)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [p.source_node, ...identity, p.gateway_id, p.run_short, fingerprint, received, Date.now(), p.sample_ts, p.data_source, body]);
      // Mock samples remain auditable but never become a real device's live position.
      if (p.data_source === 'real') {
        const lat = p.gps_valid ? p.lat : null, lon = p.gps_valid ? p.lon : null;
        const alt = p.gps_valid ? p.alt : null, hr = p.heart_rate_valid ? p.hr : null;
        await run(`INSERT INTO telemetry_history
          (device_id,ts,hr,lat,lon,alt,recv_ts,sender,raw_text,raw_json,mx2_gps_valid,mx2_position_ts,mx2_sample_ts,mx2_data_source)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [p.node_id, p.sample_ts, hr, lat, lon, alt, p.recv_ts,
          p.source_node, p.raw_text, body, Number(p.gps_valid), p.gps_valid ? p.sample_ts : null, p.sample_ts, 'real']);
        const row = await get('SELECT last_insert_rowid() AS id');
        await run('UPDATE mx2_samples SET history_id=? WHERE run_id=? AND node_id=? AND seq=?', [row.id, ...identity]);
        // Sample chronology controls live state; late uploads only extend history.
        await run(`INSERT INTO device_state
          (device_id,updated_at,recv_ts,hr,lat,lon,alt,sender,raw_text,raw_json,
           mx2_gps_valid,mx2_position_ts,mx2_sample_ts,mx2_data_source,updated_at_iso)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
          ON CONFLICT(device_id) DO UPDATE SET
          updated_at=MAX(device_state.updated_at,excluded.updated_at),recv_ts=excluded.recv_ts,
          packet_id=NULL,channel=NULL,hops_away=NULL,hop_start=NULL,rssi=NULL,snr=NULL,
          hr=excluded.hr,lat=COALESCE(excluded.lat,device_state.lat),lon=COALESCE(excluded.lon,device_state.lon),
          alt=COALESCE(excluded.alt,device_state.alt),sender=excluded.sender,
          raw_text=excluded.raw_text,raw_json=excluded.raw_json,mx2_gps_valid=excluded.mx2_gps_valid,
          mx2_position_ts=COALESCE(excluded.mx2_position_ts,device_state.mx2_position_ts,
            CASE WHEN device_state.lat IS NOT NULL AND device_state.lon IS NOT NULL THEN device_state.updated_at END),
          mx2_sample_ts=excluded.mx2_sample_ts,mx2_data_source=excluded.mx2_data_source,updated_at_iso=datetime('now')
          WHERE excluded.mx2_sample_ts>COALESCE(device_state.mx2_sample_ts,device_state.updated_at)`,
          [p.node_id, received, p.recv_ts, hr, lat, lon, alt, p.source_node, p.raw_text, body,
          Number(p.gps_valid), p.gps_valid ? p.sample_ts : null, p.sample_ts, 'real']);
        await saveRadio(p, row.id);
        await saveBattery(p, row.id);
      }
      await run('COMMIT');
      return { key, status: 'inserted', metadata_updated: false };
    } catch (error) { await run('ROLLBACK'); throw error; }
  }
  return {
    ingest(p: any) {
      const task = serial.then(() => save(p));
      serial = task.catch(() => undefined);
      return task;
    },
    async close() { await serial; await new Promise<void>((resolve, reject) => connection.close(e => e ? reject(e) : resolve())); }
  };
}
