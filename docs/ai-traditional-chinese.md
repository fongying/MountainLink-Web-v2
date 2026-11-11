# AI報告繁體中文限制

根因：原system prompt以中文描述任務，但未明訂敘述值語言；JSON schema驗證格式與欄位而不驗語言。因此gemma2:9b可回傳英文敘述並通過原驗證。

修正：system與user輸入都明訂zh-TW，JSON keys/enum/ID/專有名詞仍保留原文。產生後檢查10個敘述欄位：title、globalSummary、reasoningSummary、teamSituationSummary、physiologySummary、terrainSummary、operatorRecommendation、recommendedAction、meshtasticDraft、message。檢查無漢字、以英文為主、常見簡體詞；允許裝置ID、網址、GPS/SOS等技術名詞。

語言不符時，以原始資料/相同schema加上語言修正指令重產一次，不將舊英文回覆加入聊天歷史。再不符則記錄「AI回覆語言不符」，不發布模型報告、不發送短訊。套用Ollama與NVIDIA供應者。此為啟發式檢查，不是完整的繁簡字典或語義驗證。

既有英文歷史報告不改寫；新分析適用修正。測試涵蓋繁中混合ID/單位、英文段落、常見簡體、一次重試成功、持續英文失敗且總呼叫數限兩次。
