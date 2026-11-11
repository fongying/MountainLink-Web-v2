# 完整 AI 分析 JSON 修復

完整分析需要輸出 16 個必要欄位。原客戶端只允許 512 tokens，且非空白回覆不檢查停止原因就直接 JSON.parse，截斷的字串會以 Unterminated string 失敗；空回覆重試時還會移除 schema。

- 完整分析輸出額度改為 2048 tokens；回覆不完整、停止原因為 length、空回覆或 JSON 格式錯誤時，保留同一份 schema、原始輸入、模型和 CPU 選項，以 4096 tokens 最多重試一次。
- context 提升為 8192，以保留輸入與較長結構化輸出的空間。兩次請求共用原本 240 秒總期限，不無限重試。HTTP/runner 錯誤不重複發動昂貴推論。
- 不補引號或括號、不猜測模型內容，也不將未完成的回覆視為可用建議。仍保留 ai-agent 的證據識別碼、地區與訊息校驗。
- 短測試頁維持輕量測試；通過仍不能替代完整分析驗收。

7 項完整回覆測試與 9 項短測試回歸通過。涵蓋較長完整內容、截斷重試、同 schema 與截止時間、重試上限、空值與不正確 JSON、CPU 設定及 HTTP 錯誤。

進一步將 Ollama 的 focusDeviceId 約束為本次選定隊伍、evidenceIds 約束為本次資料目錄、targetAreas 約束為既有山區白名單，保留原本 required 欄位與後端校驗。增加 2 項 schema 約束測試；與短測試合計 18 項回歸通過，型別檢查 0 errors / 0 warnings。

Nginx 完整分析端點等待時間改為 360 秒；設定頁改為 120 秒，避免代理先於應用程式結束等待而顯示「無法取得 AI 分析結果」。實際配置片段見 `ops/nginx/ai-timeouts.conf`；變更前已備份並通過 nginx -t 後 reload。

正式驗收：2026-10-23 12:03:13（台北），gemma2:9b 完整分析輸出 1605 tokens，done_reason=stop，JSON 16 欄位完整，validation_error_count=0，狀態 sent。此為完整分析流程通過；不等同每一台 Radio 都收到廣播。

此次未修改 Node-RED 轉發行為。
