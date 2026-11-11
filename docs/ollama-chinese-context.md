# Ollama中文生成與輸入預算修正

正式gemma2:9b模板確認支援system欄位。但最近三筆成功推論prompt_eval_count皆為8192，已達num_ctx上限。現行實際snapshot約44962 UTF8 bytes，system1828 bytes，包含重複天氣明細與證據摘要；開頭的語言要求可能因截斷失效。

修正：
- 結構化snapshot改為緊湊JSON，移除重複天氣description；依預算省略背景詳細預報、縮短預報證據摘要，必要時省略非焦點隊伍細節。
- 保留焦點隊伍完整資料、官方地質比對與所有證據ID/標籤。contextCoverage明示省略數量，禁止把省略解讀為沒有風險。核心資料仍過大時停止分析，不直接截斷JSON。
- system、末尾語言提示及預留800bytes一併納入18000 UTF8 bytes目標預算；非AI設定測試請求保持原本內容。
- 語言重試指令也放入JSON資料尾端，不只修改system。
- 回覆若prompt_eval_count達8192，停止採用該結果，避免用截斷資料發送。

驗證：15項測試通過（語言、預算、JSON完整性/重試、schema保留及上下文滿載拒絕），型別檢查0錯誤0警告、正式建置成功。

隔離實測使用正式焦點隊伍、天氣與證據、唯讀DB連線，直接呼叫Lab gemma2:9b；不執行正式analyze、不入庫、不廣播。原prompt44962bytes，修正後prompt_eval_count5067，輸出724tokens，一次產生中文標題「全局摘要」，語言檢查無錯誤。此為本次樣本，不代表所有未來輸入都相同；仍保留預算與滿載拒絕。

第二次獨立實測：prompt_eval_count5067，輸出740tokens；16個必要欄位完整，沒有空字串敘述，語言檢查無錯誤，仍為一次呼叫完成。
