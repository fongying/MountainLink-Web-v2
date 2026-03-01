// src/lib/server/db.ts
import sqlite3 from 'sqlite3';

export const db = new sqlite3.Database('data/app.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // ✅ 補上 is_admin 欄位（若已存在會報錯，我們直接忽略）
  db.run(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`, (err) => {
    // duplicate column name: is_admin -> 忽略即可
    if (err && !String(err.message).includes('duplicate column')) {
      console.error('DB migrate users.is_admin 失敗:', err);
    }
  });

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

  db.run(`CREATE INDEX IF NOT EXISTS idx_th_device_ts ON telemetry_history(device_id, ts DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_device_bindings_user ON device_bindings(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_device_units_unit ON device_units(unit)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_eq_origin_time ON earthquake_events(origin_time)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_eq_created_at ON earthquake_events(created_at)`);
});
