---
description: 在 Android 模擬器建置並開啟 debug 版 App，接上 CDP 以便直接操作 WebView
argument-hint: "[要檢查的東西，例如「推文顏色」（可省略）]"
---

在本機模擬器跑 App 的 **debug 版**。

1. SDK 在 `$HOME/Library/Android/sdk`，AVD 是 `Medium_Phone_API_37.0`。`adb devices` 沒有模擬器就在背景啟動：`$HOME/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_37.0 -no-snapshot-save`，等 `adb wait-for-device` 並確認 `sys.boot_completed` 是 1。
2. 建置：根目錄 `npm run build`，然後 `cd mobile && node build.js && npx cap sync android`，再 `cd android && ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew assembleDebug`。
3. 安裝：`adb install -r app/build/outputs/apk/debug/app-debug.apk`。如果因簽章不同失敗（裝著的是 release 版），先問使用者能不能 `adb uninstall` 再裝；解除安裝會清掉 App 裡的設定和登入。
4. 啟動 App，找它的 pid（`adb shell pidof com.jjptt.app`；啟動用 `adb shell monkey -p com.jjptt.app 1`），然後
   `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`，
   從 `http://localhost:9333/json` 取 `webSocketDebuggerUrl`。
5. 用 `node .claude/tools/cdp.mjs <ws url> '<js>'` 在 WebView 裡執行程式；`pttchrome.app.mobile` 是 App 物件。畫面用 `adb exec-out screencap -p > <scratchpad>/x.png` 截圖再讀圖確認。
6. 不要在模擬器裡登入使用者的 PTT 帳號或 Google 帳號。需要文章時用不必登入的看板／網頁版文章。

要檢查的東西：$ARGUMENTS
沒有指定就只確認 App 開得起來、首頁正常，並附一張截圖。
