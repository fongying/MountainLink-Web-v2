# 2026-10-23 監控中心、Lab Ollama 與災害聊天轉發

## 介面與設定

- SOS、生理異常、低電量與離線分類使用原生 details/summary，預設展開，可獨立收合；顯示完整清單，保留分類數量、鍵盤操作與焦點樣式。
- 管理者可從導覽列或 AI 面板進入 `/settings`。伺服器透過 Lab VPN 位址呼叫 `/api/tags`，提供模型清單與重新偵測，儲存前再核對模型存在。
- Lab Ollama：`http://100.119.28.121:11434`。VPS Tailscale：`100.104.208.19`，未啟用出口節點或變更 DNS。
- 儲存到私有 `data/ai-settings.json`，原子替換、權限 600、Git 忽略；未儲存時沿用環境變數。套用不需重啟。只允許指定 Lab 主機，不跟隨重新導向。
- `/settings` 的讀取、偵測與儲存均需要管理者登入；模型不在清單、連線失敗或非 Lab 位址不能儲存。
- 實際偵測 9 個模型：gemma2:9b、batiai/gemma4-26b:q3、qwen2.5-coder:14b、qwen3.6:27b、gemma4:26b、qwen3.6:35b-a3b、gemma4:latest、gpt-oss:20b、qwen3.5:latest。

## 災害根因與修復

- 舊 Node-RED 指向 `!7a6bf098`，現役 Pi USB Radio 為 `!c0c31f54`。Radio 的 Wi-Fi 關閉、MQTT client proxy 關閉，CHAT/RESUCE uplink/downlink 關閉，因此不能把網頁有資料等同 MQTT 指令已進入無線電。
- 改由 Node-RED 發送 QoS1、非保留的 JSON 到 `mlink/2/json/mqtt/!c0c31f54`，from 必須為十進位 `3234013012`，to 為廣播 `4294967295`，channel 為 `0`（CHAT）。保留 AI topic 的既有下行相容性；AI 自動廣播開關本次不變。
- Pi Recorder 內整合 `mqtt_downlink.py`，透過 Tailscale 連至 VPS broker，帳密從既有 Radio 設定於記憶體讀取，不新增明文憑證檔。使用 Recorder 已持有的 interface.sendText，沒有第二個 USB 連線。
- 主流程每秒處理佇列，每則至少間隔 20 秒；只允許 CHAT 廣播、有效時戳及 228 UTF-8 bytes 以下文字。拒絕 retained、過期、錯誤 Gateway、其他目的與頻道。佇列上限 100。
- SQLite 追蹤 queued / sending / radio_api_accepted / uncertain / expired，依事件 ID、狀態與文字去重，跨重啟保留。若序列提交結果不明，不自動再播，避免重複警示。無法保證恰好一次送達。
- Radio API 接受後回報 `mlink/alerts/ack/!c0c31f54`。此階段只證明本地 API 提交，不證明遠端收件；廣播不要求逐一 ACK。
- 雲端去重排除 generatedAt 與監控 reason；解除、區域或內容變更仍可產生新通知。監控每次 tick 重試未成功 Webhook，不再只在快照改變時嘗試。10 秒 timeout，單則失敗不阻斷其他警示。

## 驗證與還原

- Svelte check 0 errors / 0 warnings，正式建置通過，Google Maps key 存在且 public assets hash 與正式來源相符。
- 2 項警示識別測試、5 項既有圖表測試、9 項下行指令與跨重啟去重測試通過。
- 正式瀏覽器已確認獨立收合低電量與離線、偵測 9 模型、儲存成功。
- 標記「非真實警報」的測試已經 Webhook HTTP 200、Pi MQTT 訂閱及 Radio API 接受；重送同事件 ID 不增加 SQLite 命令數。
- 5 則當前 CWA 警示均有 Radio API 提交紀錄；實機手機 CHAT 通知已觀察到大雨特報。此為觀察到的接收端證據，不宣稱每台裝置或每則廣播都收到。
- VPS 正式建置與 source、SQLite 備份於 `/home/ubuntu/mountainlink-backups/dashboard-ai-*`；Pi Recorder 備份於 `/home/pi/meshtastic-getway/backups/mqtt-downlink-*`；Node-RED 原流程備份於 `/opt/nodered/data/flows.pre-downlink-*.json`。
- 還原 Pi 時停止 Recorder、從備份還原 gateway_recorder.py 再啟動；還原 Node-RED 時以備份取代 flows.json 並重啟容器。不要覆蓋既有 MQTT 認證檔。
- 相容橋接依賴 `paho-mqtt==2.1.0`。安裝腳本需在現役主機以管理權限執行；先確認 ID、序列路徑及 Tailscale 位址，不適用其他 Gateway 直接照抄。

## Lab runner 相容性
- Lab Ollama 版本 0.21.0。gpt-oss:20b 完整分析曾達 240 秒逾時；gemma2:9b 預設推論回報 runner terminated。
- 使用 CPU、2048 context、32 token 的非裝置短 JSON 測試於約 5.2 秒成功；設定頁新增 CPU 相容模式，可在 GPU 執行異常時選擇。正式初始改為 gemma2:9b + CPU 相容模式。
- 客戶端限制 context 4096、batch 64，以控制推論記憶體；所有模型列出不代表每個模型均通過完整推論驗收。


- 完整 CPU 分析於 2026-10-23 11:16:18（台北）仍觸及 240 秒逾時。短 JSON 測試成功不能視為完整 AI 建議驗收通過；模型偵測、選擇、儲存與 CPU 模式已通過，完整推論仍需 Lab 效能／GPU 排錯。
