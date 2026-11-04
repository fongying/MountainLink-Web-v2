# SOS HELP 上傳修復

新版 Sender 的手動 SOS 使用 TAK GeoChat 或 TEXT_MESSAGE_APP 廣播：`SOS HELP id=... [HR=...] [GPS=...] [MOCK] ev=xxxxxxxx`。它不屬於 MX2 Core；Core 的 flags 只包含 GPS、心率有效性及 mock。

原問題：SDK 省略 channel=0 的 protobuf 預設欄位，舊 handler 將缺欄位視為錯誤；並且舊 MST1 SOS parser 與一般 MX2 uploader 都不處理 SOS HELP。

修復：舊 handler 僅對「欄位不存在」採 protobuf 預設 0，明確 null 或非法頻道仍拒絕。新的 sos_upload 跟隨 Recorder JSONL，不開 USB、不送無線電 ACK。TAK 必須是 All Chat Rooms、callsign 與 logical node 一致；雲端再核對該收件時間的真實 MX2 無線電對照，避免把 radio ID 當 logical ID。未知／改變身分保留在待上傳佇列，不強行歸屬。

SQLite 持久游標及 outbox；正確 key 的雲端確認才完成，重試不重複建立 history。首次啟用只從近期檔案末 1 MiB 回讀最多 24 小時真實證據；超過 10 分鐘的回報只存稽核、不觸發目前 SOS。已驗證的同一持續事件，在 auto-send 暫停後仍可繼續上傳；若來源改綁其他節點則阻擋。

`/api/ingest/sos` 沿用 MX2 key。真實且新鮮的 SOS 更新 device_state.sos、收件上線時間、history，透過 SSE 更新平台。保留既有電量／生理／位置與定位時間，沒有把收件時間當成 SOS 原始觸發時間。MOCK 不影響真實狀態。本修復不新增 SOS OFF／自動解除邏輯。

測試：`node scripts/chat/test-sos.mjs`；Pi venv `python -m unittest discover -s /tmp/sos-validation -p 'test_*.py'`（新 SOS、私訊、下行）；舊 Gateway `pytest test_tak_sos.py`；`npm run check`、`npm run build`。所有測試應使用隔離資料庫及假的 post，禁止向正式平台製造假 SOS。

部署：先備份 app.db／來源／build；部署雲端 API，再備份 Pi uploader、private_chat_upload、tak_sos.py 及佇列；更新 worker 與新增 SOS module，執行 patch_sos_channel.py 後重啟既有 worker／Recorder。確認無在途私訊 ACK 才重啟 Recorder。雲端未能驗證身分時不刪除原始證據或 pending rows。
