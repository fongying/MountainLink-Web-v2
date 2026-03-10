# MountainLink Web v2

MountainLink is a Blue Force Tracker style rescue platform that combines real-time device tracking, unit management, and natural hazard alerts (rain, cold, earthquake).

Tech stack: `SvelteKit + TypeScript + SQLite + Google Maps + SSE`.

## Deployment Readiness (Current Check)

- `npm run check`: PASS (0 errors, 0 warnings)
- `npm run build`: PASS (adapter-node output generated)
- Dashboard:
  - 2D/3D map view and live device state
  - Unified Natural Hazard Alert Zone (rain/cold/earthquake)
  - Earthquake toast and sound (`static/sounds/eq-alert.mp3`, `static/sounds/eq-alert.ogg`)
- Earthquake webhook:
  - `POST /api/hooks/eq/trigger`
  - HMAC verification, SQLite persistence, SSE `hazard_update` broadcast

## Architecture

- Frontend: SvelteKit (Svelte 5)
- Backend: SvelteKit server routes (same repository)
- Database: SQLite (`data/app.db`)
- Real-time channel: SSE (`/api/stream`)
- External data:
  - CWA rain: `W-C0033-003`
  - CWA cold: `W-C0033-004`
  - CWA earthquake: `E-A0015-001`
- External trigger: earthquake webhook (for example EQ Wake Up)

## Main Features

- Dashboard (`/dashboard`)
  - 2D/3D map overview
  - Device list and status
  - Natural Hazard Alert Zone
- Device detail (`/devices/[id]`)
  - Live telemetry and event logs
- Device unit admin (`/devices/[id]/unit`)
  - Admin can assign unit role
  - Admin can bind device to user account

## Local Development

### 1) Install dependencies

```bash
npm install
```

### 2) Configure `.env`

```bash
VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_KEY
VITE_GOOGLE_MAP_ID=YOUR_GOOGLE_MAP_ID
CWA_API_KEY=YOUR_CWA_API_KEY
MLINK_WEBHOOK_SECRET=YOUR_LONG_RANDOM_SECRET
MLINK_INGEST_API_KEY=YOUR_INGEST_API_KEY
MLINK_ALERT_WEBHOOK_URL=YOUR_NODE_RED_WEBHOOK_URL
MLINK_ALERT_WEBHOOK_SECRET=YOUR_NODE_RED_WEBHOOK_SECRET

# Optional cache TTL in seconds
CWA_RAIN_TTL_SEC=600
CWA_COLD_TTL_SEC=600
```

### 3) Start dev server

```bash
npm run dev
```

Default URL: `http://localhost:5173`

## NPM Scripts

```bash
npm run dev
npm run check
npm run build
npm run preview
```

## API Endpoints

- `GET /api/stream`: SSE (`telemetry`, `online`, `hazard_update`)
- `GET /api/alerts/rain`: rain alerts (server-side cache)
- `GET /api/alerts/cold`: cold alerts (server-side cache)
- `GET /api/eq/events`: earthquake events (last 3 days, max 3)
- `GET /api/eq/latest`: latest earthquake event
- `POST /api/ingest`: device telemetry ingest
- `POST /api/hooks/eq/trigger`: external earthquake trigger (HMAC)

Note: most API routes require authenticated session (`locals.user`).

## Earthquake Trigger Webhook

### Required headers

- `X-MLINK-Timestamp`: unix milliseconds
- `X-MLINK-Signature`: `hex(hmac_sha256(secret, timestamp + "." + rawBody))`

### Validation behavior

- Missing `MLINK_WEBHOOK_SECRET` on server: `503`
- Invalid signature: `401`
- Allowed timestamp skew: `+/- 60 seconds`

### Success response

```json
{ "ok": true, "id": "event-id", "isNew": true }
```

## Device Telemetry Ingest

Use `POST /api/ingest` with either:

- `X-MLINK-INGEST-KEY: <MLINK_INGEST_API_KEY>`
- or `Authorization: Bearer <MLINK_INGEST_API_KEY>`

Current ingest accepts the Node-RED normalized payload and binds records by `device_id`.

Example payload:

```json
{
  "recv_ts": "2026-03-09T18:43:43.000Z",
  "packet_id": 1407811794,
  "sender": "!7a6bf098",
  "from": 3234013012,
  "channel": 1,
  "hops_away": 0,
  "hop_start": 3,
  "rssi": -38,
  "snr": 9.5,
  "device_id": "c0c31f54",
  "hr": 85,
  "sos": 0,
  "battery": 101,
  "spo2": 98,
  "bp_hi": 115,
  "bp_lo": 80,
  "bt": 36.8,
  "raw_text": "MLINK1,id=c0c31f54,hr=85,sos=0,bat=101,spo2=98,bp=115/80,bt=36.8"
}
```

## Hazard Dispatch To Node-RED

When `MLINK_ALERT_WEBHOOK_URL` is configured, the server dispatches rain, cold, and earthquake alerts to Node-RED.

Rules:

- Send once when a new alert becomes active
- Send once again when the alert is ended / cleared
- Re-send only when alert content changes
- No periodic reminder resend

Optional HMAC headers are added when `MLINK_ALERT_WEBHOOK_SECRET` is configured:

- `X-MLINK-Timestamp`
- `X-MLINK-Signature`

Example webhook payload:

```json
{
  "id": "rain-abc123",
  "type": "rain",
  "status": "active",
  "severity": "watch",
  "title": "大雨特報",
  "region": "宜蘭縣、花蓮縣、南投縣",
  "topic": "mlink/alerts",
  "message": "[注意]大雨特報,區域:宜蘭、花蓮、南投",
  "generatedAt": "2026-03-10T08:00:00.000Z",
  "reason": "hazard_monitor_refresh"
}
```

## Windows Bridge Scripts

- `scripts/eq/callcenter_eq.bat`
- `scripts/eq/callcenter_eq.ps1`
- `scripts/eq/eq-bridge.log`

The `.ps1` script builds payload, computes HMAC, posts webhook, retries, and logs results.
For production, update:

- `$webhookUrl`
- `$secret` (must match server `MLINK_WEBHOOK_SECRET`)

## VPS Deployment (Node + Nginx)

### 1) Build on server

```bash
npm ci
npm run check
npm run build
```

### 2) Run app (adapter-node)

```bash
node build
```

Use PM2 or systemd for process supervision.

### 3) Required env vars on VPS

- `VITE_GOOGLE_MAPS_API_KEY`
- `VITE_GOOGLE_MAP_ID`
- `CWA_API_KEY`
- `MLINK_WEBHOOK_SECRET`
- `CWA_RAIN_TTL_SEC` (optional, default 600)
- `CWA_COLD_TTL_SEC` (optional, default 600)
- `PORT` (optional, default 3000)
- `HOST` (recommended `0.0.0.0`)

### 4) Nginx setting for SSE

Disable buffering for `/api/stream` to avoid SSE delays/disconnects:

```nginx
location /api/stream {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    gzip off;
}
```

## Database

SQLite file: `data/app.db`

Main tables:

- `users`
- `sessions`
- `telemetry_history`
- `device_units`
- `device_bindings`
- `earthquake_events`

Schema creation/ensure is in:

- `src/lib/server/db.ts`
- `src/lib/server/earthquake.ts`

## Important Paths

- `src/routes/dashboard/+page.svelte`
- `src/lib/components/WeatherAlertPanel.svelte`
- `src/lib/server/hazards.ts`
- `src/lib/server/stream.ts`
- `src/lib/server/earthquake.ts`
- `src/lib/server/alerts/rain.ts`
- `src/lib/server/alerts/cold.ts`
- `src/routes/api/hooks/eq/trigger/+server.ts`
- `scripts/eq/callcenter_eq.ps1`

## Known Limitations

- Device telemetry is still mock-stream based (not yet wired to production MQTT ingestion).
- Some legacy comments still contain old encoding artifacts (runtime is not affected).

## License

Follow internal team policy or project-specific license documents.
