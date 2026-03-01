# MountainLink Web v2

MountainLink 是一個以 **Blue Force Tracker** 概念打造的搜救監控平台，提供裝置定位、即時遙測、單位管理與自然災害告警（豪雨 / 低溫 / 地震）整合。

本 repo 為 Web 端實作（SvelteKit + TypeScript + SQLite + Google Maps）。

---

## 1) 系統目標

- 即時掌握山域/任務裝置位置與狀態
- 區分單位角色（登山者、待救者、特搜、警消、志工）
- 讓指揮端在同一畫面查看裝置態勢 + 自然災害警示
- 支援管理員做裝置單位設定與帳號綁定

---

## 2) 技術架構

### Frontend
- SvelteKit（Svelte 5）
- TypeScript
- Google Maps JavaScript API（2D + 3D）

### Backend (same repo)
- SvelteKit Server Routes
- SSE (`/api/stream`) 用於即時資料流
- SQLite (`data/app.db`) 儲存帳號、session、裝置單位/綁定

### External Data / Integration
- CWA Open Data（天氣與地震）
  - 豪雨：`W-C0033-003`
  - 低溫：`W-C0033-004`
  - 地震報告：`E-A0015-001`
- 外部地震 Trigger Webhook（例如地牛 / 其他軟體）

---

## 3) 主要功能

- Dashboard
  - 2D / 3D 地圖切換
  - 即時裝置清單
  - **自然災害警示區**（豪雨、低溫、地震整合）
- Device Detail (`/devices/[id]`)
  - 單裝置即時資訊（心率/電量/SOS/訊號）
  - 即時地圖與事件紀錄
- Device Unit Admin (`/devices/[id]/unit`)
  - 管理員設定裝置單位
  - 管理員綁定裝置到帳號（DB 寫入）

---

## 4) 快速開始

### Prerequisites
- Node.js 18+（建議 20+）
- npm

### Install

```bash
npm install
```

### Run (dev)

```bash
npm run dev
```

開啟：`http://localhost:5173`

---

## 5) 環境變數

在專案根目錄建立 `.env`：

```bash
VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_KEY
VITE_GOOGLE_MAP_ID=YOUR_GOOGLE_MAP_ID

CWA_API_KEY=YOUR_CWA_API_KEY
MLINK_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET
```

### 說明
- `VITE_GOOGLE_MAPS_API_KEY`：Google Maps JS API key
- `VITE_GOOGLE_MAP_ID`：3D 地圖所需 Map ID
- `CWA_API_KEY`：中央氣象署 Open Data API key
- `MLINK_WEBHOOK_SECRET`：地震 Trigger Webhook HMAC 驗簽密鑰

> 注意：Map ID 需啟用對應 API，否則 3D 圖層可能無法正常顯示。

---

## 6) NPM Scripts

```bash
npm run dev          # 開發模式
npm run build        # 打包
npm run preview      # 預覽 build
npm run check        # Svelte + TypeScript 檢查
npm run check:watch  # 持續檢查
```

---

## 7) 重要路由

### UI Pages
- `/`：首頁
- `/login`：登入
- `/register`：註冊（Admin 可用）
- `/dashboard`：主控台
- `/devices/[id]`：裝置詳情
- `/devices/[id]/unit`：裝置單位/綁定設定（Admin）

### API
- `GET /api/stream`：SSE 即時資料
- `GET /api/alerts/rain`：豪雨特報
- `GET /api/alerts/cold`：低溫特報
- `GET /api/eq/events`：地震事件列表
- `GET /api/eq/latest`：最新地震事件
- `POST /api/hooks/eq/trigger`：外部地震 trigger webhook（HMAC 驗證）

> 多數 API 需要登入 session（`locals.user`）才可存取。

---

## 8) 告警與地震模組摘要

### 自然災害警示區
- 整合豪雨 / 低溫 / 地震
- 可切換篩選（全部、豪雨、低溫、地震）
- 地震通知為防洗版策略：**近 3 天 + 最多 3 則**

### 地震資料來源整合
- Report：CWA `E-A0015-001` 輪詢
- Trigger：外部 webhook 主動推送
- 後端會做 dedup + merge，形成統一 `EarthquakeEvent`

### Webhook 驗證規則
- Header:
  - `X-MLINK-Timestamp`
  - `X-MLINK-Signature`
- Signature:
  - `hex(hmac_sha256(secret, timestamp + "." + rawBody))`
- 允許時間偏差：`±60s`

---

## 9) 資料庫

SQLite 檔案：`data/app.db`

核心資料表：
- `users`
- `sessions`
- `telemetry_history`
- `device_units`
- `device_bindings`

初始化/遷移邏輯在：`src/lib/server/db.ts`

---

## 10) 專案目錄重點

- `src/routes/dashboard/+page.svelte`：主控台
- `src/lib/components/WeatherAlertPanel.svelte`：自然災害警示區
- `src/lib/server/alerts/*`：豪雨/低溫解析
- `src/lib/server/earthquake.ts`：地震 report/trigger 合併邏輯
- `src/routes/api/hooks/eq/trigger/+server.ts`：地震 webhook 入口
- `src/lib/components/DeviceMap2D.svelte`：2D 地圖與標記
- `src/lib/components/GoogleMap3DView.svelte`：3D 地圖

---

## 11) 已知事項 / 後續建議

- 部分舊頁文字仍有編碼亂碼（mojibake）風險，建議逐頁統一 UTF-8 正規化。
- 地震事件目前為 in-memory 狀態（重啟後重建），若要持久化可落 DB。
- 目前 SSE 主要推送遙測；地震/災害可再擴充 SSE 主動推播。
- 目前裝置遙測仍以 mock 流為主，之後可替換成正式 MQTT/HTTP ingestion。

---

## 12) License

此專案授權與使用條款請依團隊內部規範或另附文件。
