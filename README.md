# MountainLink Web v2

MountainLink 是一套山域安全指揮與 Meshtastic 裝置監控平台，整合登山申請、即時定位、生命徵象、中央氣象署災害警示、72 小時山區天氣預報與 AI 風險建議。

> 本專案仍在開發階段。正式部署前請更換所有密鑰、限制 Google Maps Key、停用不需要的公開入口，並建立 SQLite 備份策略。

## 主要功能

- 山域指揮中心
  - Google Maps 2D／3D 地圖
  - 裝置位置、SOS、在線、離線與低電量狀態
  - 心率、血氧、體溫及收縮壓生理風險判斷
  - CWA 豪雨、低溫及地震警示
  - 山區鄉鎮 GeoJSON 警戒範圍
- 裝置管理
  - 裝置列表與詳情頁
  - 即時遙測、歷史趨勢、訊號與電量資訊
  - 裝置單位與帳號綁定
- 登山申請
  - 行程、人員與安全裝備分段表單
  - 風險評估及 Meshtastic 裝置綁定
- AI 安全建議
  - 支援 NVIDIA API 或自架 Ollama
  - 整合災害、72 小時預報、裝置、生理與地形摘要
  - Policy gate、冷卻時間與 Meshtastic 草稿
- 即時通訊
  - SSE 推送裝置、災害與 AI 建議更新
  - Webhook 串接 Node-RED／Meshtastic bridge

## 技術架構

- SvelteKit 2、Svelte 5、TypeScript
- `@sveltejs/adapter-node`
- SQLite 3
- Google Maps JavaScript API、Map ID、Elevation API
- 中央氣象署開放資料 API
- Server-Sent Events（SSE）
- NVIDIA Integrate API 或 Ollama

## 系統需求

- Node.js 22 LTS（建議）
- npm 10 以上
- Linux VPS（以下範例以 Ubuntu 24.04 為準）
- Nginx
- 可寫入的 `data/` 目錄

## 本機開發

```bash
git clone https://github.com/fongying/MountainLink-Web-v2.git
cd MountainLink-Web-v2
npm ci
```

建立 `.env`，至少設定 Google Maps 與 CWA：

```dotenv
VITE_GOOGLE_MAPS_API_KEY=your_browser_google_maps_key
VITE_GOOGLE_MAP_ID=your_google_map_id
CWA_API_KEY=your_cwa_api_key
```

啟動開發伺服器：

```bash
npm run dev -- --host 127.0.0.1
```

預設網址：`http://127.0.0.1:5173`

## 環境變數

### 必要設定

| 變數 | 用途 |
| --- | --- |
| `VITE_GOOGLE_MAPS_API_KEY` | 瀏覽器端 Google Maps JavaScript API Key，會公開在前端，必須設定 HTTP referrer 限制 |
| `VITE_GOOGLE_MAP_ID` | Google Cloud Map ID，用於進階標記及地圖樣式 |
| `CWA_API_KEY` | 中央氣象署開放資料 API Key |
| `MLINK_INGEST_API_KEY` | `/api/ingest` 裝置資料寫入驗證 Key |
| `MLINK_WEBHOOK_SECRET` | 外部地震 webhook HMAC 驗證密鑰 |

`CWA_OPEN_DATA_API_KEY` 與 `CWA_AUTHORIZATION` 可作為 `CWA_API_KEY` 的相容別名。

### Google Elevation

| 變數 | 用途 |
| --- | --- |
| `GOOGLE_ELEVATION_API_KEY` | 伺服器端 Elevation API Key |
| `GOOGLE_MAPS_API_KEY` | Elevation API 的備援伺服器端 Key |

若未設定 Elevation Key，AI 仍可使用裝置回報海拔、天氣與災害資料。請勿讓伺服器端 Key 暴露到前端。

### AI Agent

共用設定：

```dotenv
AI_AGENT_ENABLED=true
AI_AGENT_PROVIDER=nvidia
AI_AGENT_AUTO_DISPATCH=false
AI_AGENT_COOLDOWN_MINUTES=360
```

NVIDIA：

```dotenv
NVIDIA_API_KEY=nvapi-your-key
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=meta/llama-3.3-70b-instruct
NVIDIA_TIMEOUT_MS=90000
```

Ollama：

```dotenv
AI_AGENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://10.77.0.10:11434
OLLAMA_MODEL=gpt-oss:20b
OLLAMA_TIMEOUT_MS=240000
```

VPS 與內網 Ollama 建議透過 WireGuard 連線，不要將 `11434` 直接公開到 Internet。正式上線前建議保持 `AI_AGENT_AUTO_DISPATCH=false`，確認 Meshtastic 發送流程後再啟用。

### 災害快取與 Meshtastic Webhook

```dotenv
CWA_RAIN_TTL_SEC=600
CWA_COLD_TTL_SEC=600
CWA_FORECAST_TTL_SEC=1800

MLINK_ALERT_WEBHOOK_URL=https://bridge.example.com/mountainlink
MLINK_ALERT_WEBHOOK_SECRET=your_bridge_hmac_secret
```

### Node Server

```dotenv
HOST=127.0.0.1
PORT=3000
ORIGIN=https://mountain.example.com
```

## 驗證與建置

```bash
npm run check
npm run build
```

Google Maps 的 `VITE_*` 變數會在前端建置階段寫入 bundle，因此必須在執行 `npm run build` 前設定。正式環境的私密變數應由 systemd `EnvironmentFile` 提供。

本機預覽 production build：

```bash
HOST=127.0.0.1 PORT=3000 node build
```

## Ubuntu VPS 部署

### 1. 建立執行帳號與目錄

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin mountainlink
sudo mkdir -p /opt/mountainlink /var/lib/mountainlink /etc/mountainlink
sudo chown -R mountainlink:mountainlink /opt/mountainlink /var/lib/mountainlink
```

### 2. 下載與建置

```bash
sudo -u mountainlink git clone https://github.com/fongying/MountainLink-Web-v2.git /opt/mountainlink
cd /opt/mountainlink
sudo -u mountainlink npm ci
```

先建立只供建置使用的 `.env.production`，放入 `VITE_GOOGLE_MAPS_API_KEY` 與 `VITE_GOOGLE_MAP_ID`，再執行：

```bash
sudo -u mountainlink npm run check
sudo -u mountainlink npm run build
```

### 3. SQLite 持久化

應用程式固定使用相對路徑 `data/app.db`。建議將 `data` 連結到 VPS 持久化目錄：

```bash
cd /opt/mountainlink
sudo -u mountainlink mkdir -p /var/lib/mountainlink/data
sudo -u mountainlink cp -n data/app.db /var/lib/mountainlink/data/app.db 2>/dev/null || true
sudo rm -rf /opt/mountainlink/data
sudo -u mountainlink ln -s /var/lib/mountainlink/data /opt/mountainlink/data
```

若沒有既有資料庫，可建立空檔；應用程式啟動時會建立資料表：

```bash
sudo -u mountainlink touch /var/lib/mountainlink/data/app.db
```

第一個完成註冊的帳號會成為管理員。正式上線後應限制 `/register` 的外部存取或在建立管理員後關閉公開註冊。

### 4. Runtime 環境檔

建立 `/etc/mountainlink/mountainlink.env`：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
ORIGIN=https://mountain.example.com

CWA_API_KEY=replace_me
MLINK_INGEST_API_KEY=replace_with_long_random_value
MLINK_WEBHOOK_SECRET=replace_with_long_random_value

GOOGLE_ELEVATION_API_KEY=replace_me

AI_AGENT_ENABLED=true
AI_AGENT_PROVIDER=nvidia
AI_AGENT_AUTO_DISPATCH=false
AI_AGENT_COOLDOWN_MINUTES=360
NVIDIA_API_KEY=replace_me
NVIDIA_MODEL=meta/llama-3.3-70b-instruct

MLINK_ALERT_WEBHOOK_URL=
MLINK_ALERT_WEBHOOK_SECRET=
```

保護環境檔：

```bash
sudo chown root:mountainlink /etc/mountainlink/mountainlink.env
sudo chmod 640 /etc/mountainlink/mountainlink.env
```

### 5. systemd

建立 `/etc/systemd/system/mountainlink.service`：

```ini
[Unit]
Description=MountainLink Web
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=mountainlink
Group=mountainlink
WorkingDirectory=/opt/mountainlink
EnvironmentFile=/etc/mountainlink/mountainlink.env
ExecStart=/usr/bin/node build
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

啟用服務：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mountainlink
sudo systemctl status mountainlink
curl -I http://127.0.0.1:3000/login
```

檢視日誌：

```bash
journalctl -u mountainlink -f
```

### 6. Nginx 與 SSE

建立 `/etc/nginx/sites-available/mountainlink`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name mountain.example.com;

    client_max_body_size 2m;

    location /api/stream {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_read_timeout 1h;
        add_header X-Accel-Buffering no;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }
}
```

啟用網站：

```bash
sudo ln -s /etc/nginx/sites-available/mountainlink /etc/nginx/sites-enabled/mountainlink
sudo nginx -t
sudo systemctl reload nginx
```

使用 Certbot 啟用 HTTPS：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d mountain.example.com
```

防火牆只需開放 SSH、HTTP 與 HTTPS；Node `3000` 不應直接對外：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 更新部署

```bash
cd /opt/mountainlink
sudo -u mountainlink git pull --ff-only
sudo -u mountainlink npm ci
sudo -u mountainlink npm run check
sudo -u mountainlink npm run build
sudo systemctl restart mountainlink
sudo systemctl status mountainlink
```

資料庫不應隨 Git 更新覆蓋。部署前先備份：

```bash
sudo systemctl stop mountainlink
sudo -u mountainlink cp /var/lib/mountainlink/data/app.db \
  /var/lib/mountainlink/data/app-$(date +%F-%H%M%S).db
sudo systemctl start mountainlink
```

## API 摘要

| 方法 | 路徑 | 用途 |
| --- | --- | --- |
| `GET` | `/api/stream` | SSE 即時事件 |
| `POST` | `/api/ingest` | 裝置遙測寫入 |
| `GET` | `/api/history` | 裝置歷史資料 |
| `GET` | `/api/alerts/rain` | CWA 雨量／豪雨警示 |
| `GET` | `/api/alerts/cold` | CWA 低溫警示 |
| `GET` | `/api/weather/forecast` | 山區未來天氣預報 |
| `GET` | `/api/eq/events` | 地震事件 |
| `POST` | `/api/hooks/eq/trigger` | 外部地震 HMAC webhook |
| `GET` | `/api/ai/recommendations/latest` | 最新 AI 建議 |
| `POST` | `/api/ai/recommendations/run` | 管理員手動執行 AI 分析 |

多數讀取 API 需要登入；管理操作需要管理員權限。

### 裝置遙測寫入

`POST /api/ingest` 支援下列任一驗證方式：

```http
X-MLINK-INGEST-KEY: your_key
```

或：

```http
Authorization: Bearer your_key
```

最小 payload 範例：

```json
{
  "device_id": "NT-001",
  "recv_ts": "2026-06-27T12:00:00.000Z",
  "hr": 82,
  "battery": 87,
  "spo2": 97,
  "bp_hi": 118,
  "bp_lo": 76,
  "bt": 36.7,
  "lat": 23.9518,
  "lon": 121.0922,
  "alt": 2145,
  "sos": 0,
  "rssi": -84,
  "snr": 8.5
}
```

## 地震 Webhook 簽章

`POST /api/hooks/eq/trigger` 必須帶入：

- `X-MLINK-Timestamp`：Unix milliseconds
- `X-MLINK-Signature`：`hex(hmac_sha256(secret, timestamp + "." + rawBody))`

允許時間誤差為正負 60 秒。

## 專案結構

```text
src/routes/                 SvelteKit 頁面與 API
src/lib/components/         地圖、裝置與圖表元件
src/lib/server/             SQLite、CWA、AI、風險及 dispatch 邏輯
src/lib/mountain-areas.ts   山區鄉鎮白名單
static/data/                山區鄉鎮 GeoJSON
data/app.db                 SQLite 開發資料庫
scripts/                    資料準備及外部 bridge 腳本
docs/                       專案文件
```

## 常見問題

### Google Maps 顯示 `RefererNotAllowedMapError`

確認 Google Cloud Console 已將正式網域加入 Maps JavaScript API Key 的 HTTP referrer，例如：

```text
https://mountain.example.com/*
```

### SSE 連線頻繁中斷

確認 Nginx 的 `/api/stream` 已停用 `proxy_buffering`、`proxy_cache` 與 `gzip`，並提高 `proxy_read_timeout`。

### AI 顯示暫停或處理失敗

確認 `AI_AGENT_ENABLED`、`AI_AGENT_PROVIDER` 與對應 provider Key／URL，並用 `journalctl -u mountainlink -f` 查看伺服器錯誤。

### SQLite 出現唯讀錯誤

```bash
sudo chown -R mountainlink:mountainlink /var/lib/mountainlink/data
sudo chmod 750 /var/lib/mountainlink/data
sudo chmod 640 /var/lib/mountainlink/data/app.db
```

## 安全檢查

- 不要提交 `.env`、API Key、Webhook Secret 或正式資料庫備份。
- Google 瀏覽器 Key 必須限制網域與可用 API。
- Ingest Key 與 HMAC Secret 使用不同的高強度隨機值。
- Ollama 僅允許 WireGuard 或可信任內網存取。
- Nginx／TLS 終止後，Node 只監聽 `127.0.0.1`。
- 定期更新 npm 套件、Ubuntu 安全修補與 SQLite 備份。

## License

目前尚未提供公開授權條款。未經專案擁有者明確授權，不得將本專案視為開源軟體再散布。
