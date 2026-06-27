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

  db.run(`CREATE TABLE IF NOT EXISTS ai_recommendations (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    reasoning_summary TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    message TEXT NOT NULL,
    target_areas_json TEXT NOT NULL,
    evidence_json TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    validation_errors_json TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    dispatched_at TEXT,
    dispatch_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  addColumnIfMissing('ai_recommendations', 'global_summary TEXT');
  addColumnIfMissing('ai_recommendations', 'focus_device_id TEXT');
  addColumnIfMissing('ai_recommendations', 'team_context_json TEXT');

  db.run(`CREATE TABLE IF NOT EXISTS ai_dispatches (
    dispatch_key TEXT PRIMARY KEY,
    recommendation_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(recommendation_id) REFERENCES ai_recommendations(id)
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

  db.run(`CREATE TABLE IF NOT EXISTS trip_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    route_name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    party_size INTEGER NOT NULL,
    experience_level TEXT NOT NULL,
    equipment_json TEXT NOT NULL,
    emergency_contact_name TEXT NOT NULL,
    emergency_contact_phone TEXT NOT NULL,
    meshtastic_device_id TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'submitted',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  addColumnIfMissing('trip_applications', 'main_route TEXT');
  addColumnIfMissing('trip_applications', 'sub_route TEXT');
  addColumnIfMissing('trip_applications', 'total_days INTEGER');
  addColumnIfMissing('trip_applications', 'entry_area TEXT');
  addColumnIfMissing('trip_applications', 'exit_area TEXT');
  addColumnIfMissing('trip_applications', 'itinerary TEXT');
  addColumnIfMissing('trip_applications', 'satellite_phone TEXT');
  addColumnIfMissing('trip_applications', 'radio_frequency TEXT');
  addColumnIfMissing('trip_applications', 'applicant_name TEXT');
  addColumnIfMissing('trip_applications', 'applicant_mobile TEXT');
  addColumnIfMissing('trip_applications', 'applicant_email TEXT');
  addColumnIfMissing('trip_applications', 'leader_name TEXT');
  addColumnIfMissing('trip_applications', 'leader_mobile TEXT');
  addColumnIfMissing('trip_applications', 'leader_email TEXT');
  addColumnIfMissing('trip_applications', 'team_members_text TEXT');
  addColumnIfMissing('trip_applications', 'stay_behind_name TEXT');
  addColumnIfMissing('trip_applications', 'stay_behind_phone TEXT');
  addColumnIfMissing('trip_applications', 'stay_behind_mobile TEXT');
  addColumnIfMissing('trip_applications', 'stay_behind_email TEXT');
  addColumnIfMissing('trip_applications', 'agreement_confirmed INTEGER NOT NULL DEFAULT 0');

  db.run(`CREATE TABLE IF NOT EXISTS risk_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    level TEXT NOT NULL,
    factors_json TEXT NOT NULL,
    recommendations_json TEXT NOT NULL,
    model_version TEXT NOT NULL DEFAULT 'rules-v1',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(application_id) REFERENCES trip_applications(id)
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
  db.run(`CREATE INDEX IF NOT EXISTS idx_ai_recommendations_generated ON ai_recommendations(generated_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ai_recommendations_fingerprint ON ai_recommendations(fingerprint, generated_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ai_dispatches_recommendation ON ai_dispatches(recommendation_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_trip_applications_user ON trip_applications(user_id, created_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_trip_applications_status ON trip_applications(status, start_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_risk_assessments_application ON risk_assessments(application_id, created_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_risk_assessments_level ON risk_assessments(level, score DESC)`);
});
