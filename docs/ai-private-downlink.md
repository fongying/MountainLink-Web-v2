# AI 私訊下行

個別 AI 建議依 `focusDeviceId` 查詢雲端已驗證的 MX2M/Core 樣本，使用 `source_node` 作為實體 Sender 無線電位址。邏輯 ID 不直接當作無線電 ID。最近 10 分鐘的真實樣本與收件時間都必須有效；每個來源依 sample_ts 決定最新身分。示範、mock、未知、過期、身分衝突或同一邏輯裝置對應多台無線電都阻擋，沒有廣播 fallback。

- 雲端私訊 payload `delivery` 包含目的 `!xxxxxxxx`、邏輯 ID、Run、收件及樣本時間。
- Node-RED 的 `format_downlink.js` 保留此資料。AI 僅允許 private；rain/cold/earthquake 維持 CHAT channel 0 廣播。
- Pi 使用 Recorder 原本持有的 USB interface。提交前再以本機 `mx2_upload.sqlite3` 最新已配對 MX2M/Core 核對相同邏輯 ID、Run 與 10 分鐘時效；未完成配對也阻擋。
- 私訊 `wantAck=True`，廣播仍為 False。去重包含目的節點與邏輯 ID，沿用歷史廣播去重。佇列間隔 20 秒，序列結果不明不自動重送。
- 全文上限為 **228 UTF-8 bytes**。提示詞及輸出驗證均使用此限制，過長不送出。

## 狀態證據

`webhook_accepted` → `queued` → `radio_api_accepted` → `radio_ack`。收到同 requestId 且 from 等於目的節點的 routing 成功回覆，才標記 radio_ack。NAK、180 秒未回覆、映射改變及序列例外分別記錄。逾時僅代表未確認，不能斷言未收到。ACK 不代表使用者已讀。

Pi 將回報送到 `mlink/alerts/ack/!c0c31f54`；SQLite 保留最新階段與待發回報。Node-RED 以既有 ingest 認證轉送 `/api/ai/delivery`，HTTP 失敗最多重試 6 次、間隔 5 秒，只重送回報。雲端核對原始 dispatch 的事件、目的與 Gateway，依階段優先序更新，避免亂序回報覆蓋 ACK。回報管線中斷後仍可從 Pi SQLite 查核；MQTT 發布不等於雲端已持久化。

網頁將 HTTP 成功文案改為「已提交下行」，私訊草稿區顯示目的與實際回報階段。舊廣播紀錄顯示「下行狀態未追蹤」。手機端接收以 Radio Companion 的 Meshtastic 私訊為準；本項不宣稱 Sender App 新增聊天介面或已讀功能。

## 驗證與部署

- 7 項 TypeScript／Node-RED 路由測試、18 項 Pi 解析／映射／ACK／去重測試。
- 暫存 SQLite 測試回報驗證及階段不倒退，不寫入正式測試資料。
- 型別檢查與正式建置通過。
- 部署前核對正式來源與 Git 基準一致，Pi 舊佇列沒有 queued/sending 命令，備份原始碼、SQLite 與 Node-RED 流程後依 Pi → Node-RED → Web 順序部署。
- 還原時使用各主機 `backups/ai-private-*`、VPS `mountainlink-backups/ai-private-*` 及 `/opt/nodered/data/flows.pre-downlink-*`。新資料欄位可保留；先還原舊 Web 下行前，應評估恢復 AI 廣播的影響。

## 2026-10-23 正式驗收

Pi、Node-RED 與 Web 均已備份並部署；服務恢復 active/running。未帶 ingest 認證的回報 API 回覆 401。向最近有效 MX2M 對照的穎哥 `!f6fcf190` 發送「[測試] Gateway 私訊連線測試，無須採取行動。」；事件 `private-test-1792760603142` 在 Pi SQLite 記錄 `radio_ack`，封包 `831746792`，目的十進位 `4143772048`。此為真實無線電 ACK，不代表手機畫面或人員已讀；測試未廣播，也未建立假 SOS／氣象事件。

正式備份：Pi `/home/pi/meshtastic-getway/backups/ai-private-20261023T130134Z`、Web `/home/ubuntu/mountainlink-backups/ai-private-20261023T130142Z`、Node-RED `/opt/nodered/data/flows.pre-downlink-20261023T130136Z.json`。Web 使用 `/usr/bin/node` 建置。回報驗證另以隔離 SQLite 測試，避免把測試建議塞入正式 AI 報告。
