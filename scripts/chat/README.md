# 裝置私訊

裝置詳情的「私訊聊天」入口僅供管理員及裝置綁定使用者。每則 228 UTF-8 bytes、每人每裝置 20 秒一則，顯示最近 100 則，每 3 秒授權輪詢。

下行沿用既有簽章 webhook → Node-RED → MQTT → Pi Recorder 的唯一 Radio 連線。chat- 識別碼不得退回廣播；雲端與 Pi 皆驗證 10 分鐘內真實 MX2 身分。提交結果不明不自動重送；同一請求 ID 只提交一次。ACK 是目的無線電確認，不代表手機／人員已讀。

上行由既有 mx2-cloud-upload worker 跟隨 Recorder 原始 JSONL，僅擷取發給 Gateway !c0c31f54 的文字私訊。首次啟用從檔尾開始；SQLite 儲存游標、待上傳資料及確認狀態。雲端依收件當時的真實 MX2 對照歸屬，無可靠對照則保留未歸屬紀錄。一般頻道廣播不會進入對話。手機使用 Radio Companion 私訊 Gateway「Meshtastic Client2」回覆，無須更新 APK。

API：GET/POST /api/chat/[id]（登入、裝置權限；POST 同源）；POST /api/chat/ingest（既有 MX2 金鑰）；POST /api/chat/delivery（既有 ingest 金鑰）。訊息不經全站 SSE。

測試：`node scripts/chat/test.mjs`、`node --test scripts/mx2-cloud/format_downlink.test.mjs`、`python -m unittest discover -s scripts/mx2-cloud -p 'test_*.py'`、`npm run check`、`npm run build`。

部署時先備份來源、app.db 與 Pi SQLite；先部署雲端 API，再更新 Node-RED formatter／receipt 路由，Pi 僅更新 mx2_upload.py、private_chat_upload.py、mqtt_downlink.py。檢查沒有尚在等待 ACK 的命令再重啟 Recorder。不得另開 USB Radio 連線或重建既有資料庫。
