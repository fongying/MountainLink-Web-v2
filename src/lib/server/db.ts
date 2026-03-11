// src/lib/server/db.ts
import sqlite3 from 'sqlite3';

export const db = new sqlite3.Database('data/app.db');

function addColumnIfMissing(table: string, definition: string) {
  db.run(`ALTER TABLE ${table} ADD COLUMN ${definition}`, (err) => {
    if (err && !String(err.message).includes('duplicate column')) {
      console.error(`DB migrate ${table}.${definition} failed:`, err);
    }
  });
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  addColumnIfMissing('users', 'is_admin INTEGER NOT NULL DEFAULT 0');

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS telemetry_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    ts INTEGER NOT NULL,              -- epoch ms
    hr INTEGER,
    battery INTEGER,
    lat REAL,
    lon REAL,
    alt REAL,
    sos INTEGER,
    rssi INTEGER,
    snr REAL
  )`);

  addColumnIfMissing('telemetry_history', 'recv_ts TEXT');
  addColumnIfMissing('telemetry_history', 'packet_id INTEGER');
  addColumnIfMissing('telemetry_history', 'sender TEXT');
  addColumnIfMissing('telemetry_history', 'from_node INTEGER');
  addColumnIfMissing('telemetry_history', 'channel INTEGER');
  addColumnIfMissing('telemetry_history', 'hops_away INTEGER');
  addColumnIfMissing('telemetry_history', 'hop_start INTEGER');
  addColumnIfMissing('telemetry_history', 'spo2 INTEGER');
  addColumnIfMissing('telemetry_history', 'bp_hi INTEGER');
  addColumnIfMissing('telemetry_history', 'bp_lo INTEGER');
  addColumnIfMissing('telemetry_history', 'bt REAL');
  addColumnIfMissing('telemetry_history', 'raw_text TEXT');
  addColumnIfMissing('telemetry_history', 'raw_json TEXT');

  db.run(`CREATE TABLE IF NOT EXISTS device_bindings (
    device_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS device_units (
    device_id TEXT PRIMARY KEY,
    unit TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS device_labels (
    device_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS earthquake_events (
    id TEXT PRIMARY KEY,
    origin_time TEXT NOT NULL,
    magnitude REAL,
    depth_km REAL,
    lat REAL,
    lon REAL,
    location TEXT,
    source TEXT NOT NULL DEFAULT 'CWA',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS hazard_dispatches (
    dispatch_key TEXT PRIMARY KEY,
    alert_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    topic TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS device_state (
    device_id TEXT PRIMARY KEY,
    updated_at INTEGER NOT NULL,
    recv_ts TEXT,
    packet_id INTEGER,
    sender TEXT,
    from_node INTEGER,
    channel INTEGER,
    hops_away INTEGER,
    hop_start INTEGER,
    hr INTEGER,
    battery INTEGER,
    charging INTEGER NOT NULL DEFAULT 0,
    spo2 INTEGER,
    bp_hi INTEGER,
    bp_lo INTEGER,
    bt REAL,
    lat REAL,
    lon REAL,
    alt REAL,
    sos INTEGER,
    rssi INTEGER,
    snr REAL,
    raw_text TEXT,
    raw_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at_iso TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_th_device_ts ON telemetry_history(device_id, ts DESC)`);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_th_device_packet ON telemetry_history(device_id, packet_id) WHERE packet_id IS NOT NULL`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_device_bindings_user ON device_bindings(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_device_labels_name ON device_labels(display_name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_device_units_unit ON device_units(unit)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_device_state_updated_at ON device_state(updated_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_eq_origin_time ON earthquake_events(origin_time)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_eq_created_at ON earthquake_events(created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_hazard_dispatches_alert ON hazard_dispatches(alert_id, status)`);
});
