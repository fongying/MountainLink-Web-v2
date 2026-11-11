# Venu 3 心率廣播連線修正（2026-11-04）

實機 Sender 已獲附近裝置／定位權限並找到 Venu 3，但反覆在 GATT 建立階段失敗，沒有進入服務探索。Android 將此裝置識別為雙模式，舊版使用三參數 connectGatt 的自動 transport。

將 HrPlxBleClient.connect 改為四參數 connectGatt，明確指定 BluetoothDevice.TRANSPORT_LE。最小修正保存在 scripts/android/venu3-force-le.patch，基於 C:\Codes\Meshtastic-Android 當時的工作內容，只包含本次修改；未混入該 Android checkout 其他未提交變更。

驗證：Sender 72 項 testDebugUnitTest 全過、assembleDebug 成功。比對與原已安裝 APK 的簽章一致後，使用 adb install -r 保留資料更新並啟動。ADB 已確認 GATT 連線、服務探索與 CCCD 寫入成功，持續收到標準心率 0x2A37 通知，Sender 顯示即時 bpm。此驗收範圍為手錶至 Sender，沒有據此宣稱本次資料已上傳雲端。

本機 APK 與證據位於本工作目錄 output/venu3/，APK 未加入 Git。手錶仍需開啟心率廣播。Android API 參考：https://developer.android.com/reference/android/bluetooth/BluetoothDevice
