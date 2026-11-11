# JJptt

在瀏覽器裡上 PTT 的網頁版終端機，fork 自 [iamchucky/PttChrome](https://github.com/iamchucky/PttChrome)（GPL-2.0）。

原版要靠已停用的 Chrome App 開 TCP 連線；JJptt 改成透過自己的 Cloudflare Worker 轉接站（`worker/`）連到 PTT。預設走 SSH，加密在瀏覽器裡完成，轉接站看不到你的帳密。

## 功能

- **推文樓層**：好讀模式下每則推文右邊標出第幾樓
- **IP 國籍**：在會記錄推文 IP 的看板，標出推文者 IP 所在國家；國外 IP 以橘色顯示
- **可疑帳號標記**（紅色）：同一 IP 用多個帳號推文、推文者跟作者同 IP；同一帳號在一篇文章推很多次也會標出「第 k/n 推」。這些只是提示，不代表一定是網軍
- **觀察名單**（紫色）：在推文上按右鍵「加入觀察名單」，可以加備註
- **自動縮圖**：好讀模式下圖片網址（imgur、Twitter、各種圖片連結）直接顯示圖片，imgur 動圖會播放；一般模式滑鼠移到網址上顯示預覽
- **黑名單**：依帳號淡化或完全隱藏推文和文章，也能用標題關鍵字隱藏文章（設定 → 黑名單）
- **Google Drive 同步**：黑名單、觀察名單和其他設定自動同步到你的 Google Drive（存在 JJptt 專用的隱藏資料夾，看不到你其他檔案；不同步密碼）。需要先完成下面的「設定 Google 同步」

推文分析和好讀模式預設開啟，可以在設定裡關掉。

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

預設走 SSH（`ptt.cc:22`）。要走 telnet，在畫面上按右鍵選「去其他站台 ...」，輸入 `ptt.cc:23`。

移除本機小程式：Mac / Linux 執行 `sh native-host/install.sh --uninstall`，Windows 雙擊 `native-host/uninstall.bat`。

本機小程式只會連到 `ptt.cc` / `ptt2.cc`，也只接受 JJptt 擴充功能（ID `fdlnogjbmfefgnaidfoackkjnnkibnmm`）呼叫。

## 設定 Google 同步（只要做一次）

Google 規定每個 App 要有自己的「用戶端 ID」。到 [Google Cloud Console](https://console.cloud.google.com/) 照下面做：

1. 建立新專案，名稱填 `JJptt`
2. 「API 和服務」→「程式庫」→ 搜尋 **Google Drive API** → 啟用
3. 「Google Auth Platform」（或「OAuth 同意畫面」）→ 開始設定：
   - 應用程式名稱 `JJptt`、填你的 Email
   - 目標對象選「外部」
   - 「目標對象」頁面的「測試使用者」加入要用同步功能的 Gmail（自己和朋友，最多 100 人）
4. 「用戶端」→「建立用戶端」→ 類型選「網頁應用程式」：
   - 已授權的 JavaScript 來源：`https://killnopig.github.io`
   - 已授權的重新導向 URI：`https://fdlnogjbmfefgnaidfoackkjnnkibnmm.chromiumapp.org/`（擴充功能用）
5. 複製產生的「用戶端 ID」（`xxxx.apps.googleusercontent.com`），填進 `js/drive_sync.js` 的 `DriveSync.CLIENT_ID`，然後 `npm run build`

之後在 設定 → 黑名單 → 按「連結 Google 帳號」。

- 擴充功能版：完全自動同步
- 網站版：瀏覽器的授權一小時後會過期，過期後同步狀態會顯示要你按「立即同步」重新授權

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

## 資料來源

IP 國籍資料（`data/geoip-v4.bin`）由 [ip-location-db](https://github.com/sapics/ip-location-db) 的 geo-whois-asn-country 轉換而來，資料授權為 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，來源：[Number Resource Organization (NRO)](https://www.nro.net/)。更新方式見 `tools/build-geoip.js`。
