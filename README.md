# JJptt

在瀏覽器裡上 PTT 的網頁版終端機，fork 自 [iamchucky/PttChrome](https://github.com/iamchucky/PttChrome)（GPL-2.0）。

原版要靠已停用的 Chrome App 開 TCP 連線；JJptt 改成透過自己的 Cloudflare Worker 轉接站（`worker/`）連到 PTT。預設走 SSH，加密在瀏覽器裡完成，轉接站看不到你的帳密。

JJptt 有兩種用法：

- **擴充功能版**：搭配本機小程式，直接從你的電腦連到 PTT，不經過任何轉接站
- **網站版**：打開網址就能用（手機也行），透過 Cloudflare 轉接站連線

## 擴充功能版

支援電腦版 Chrome、Edge、Brave、Chromium、Arc、Vivaldi。不需要上架商店。

1. 下載這個 repo（`git clone`，或在 GitHub 按 Code → Download ZIP 後解壓縮）
2. 安裝本機小程式（只要做一次）：
   - Mac / Linux：在終端機執行 `sh native-host/install.sh`
   - Windows：雙擊 `native-host/install.bat`
3. 瀏覽器打開 `chrome://extensions`，開啟右上角「開發人員模式」，按「載入未封裝項目」，選 `extension` 資料夾
4. 完全關閉瀏覽器再重開，點工具列上的 JJptt 圖示

預設走 SSH（`ptt.cc:22`）。要走 telnet，在畫面上按右鍵選「連到其他站台」，輸入 `ptt.cc:23`。

移除本機小程式：Mac / Linux 執行 `sh native-host/install.sh --uninstall`，Windows 雙擊 `native-host/uninstall.bat`。

本機小程式只會連到 `ptt.cc` / `ptt2.cc`，也只接受 JJptt 擴充功能（ID `fdlnogjbmfefgnaidfoackkjnnkibnmm`）呼叫。

## 部署轉接站（網站版）

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

把部署出來的 `https://jjptt-relay.<你的子網域>.workers.dev` 網址填進網頁第一次跳出的輸入框（或設在 `js/app_conn.js` 的 `lib.DEFAULT_RELAY_URL`）。

允許使用轉接站的網頁網址設在 `worker/wrangler.toml` 的 `ALLOWED_ORIGINS`。

### 防濫用限制

- 每個 IP 每分鐘最多建立 10 條新連線（`wrangler.toml` 的 `[[ratelimits]]`）
- 每條連線的上傳速度上限：平時 16 KB/秒，可瞬間衝到 256 KB，打字和貼長文都夠用，灌水式的大量資料會被斷線（`worker/src/index.js` 開頭的 `UPLOAD_*`）

## 開發

`dev.html` 直接載入 `js/` 底下的原始碼；`index.html` 用的是打包後的 `js/pttchrome.min.js`，改完原始碼要重新打包：

```bash
npm install
npm run build
```

`npm run build` 會打包網站，並把結果複製到 `extension/`。

本機小程式的原始碼在 `native-host/main.go`，改完用 `sh native-host/build.sh` 重新編譯所有平台的執行檔（需要 Go）。
