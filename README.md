# JJptt

在瀏覽器裡上 PTT 的網頁版終端機，fork 自 [iamchucky/PttChrome](https://github.com/iamchucky/PttChrome)（GPL-2.0）。

原版要靠已停用的 Chrome App 開 TCP 連線；JJptt 改成透過自己的 Cloudflare Worker 轉接站（`worker/`）連到 PTT。預設走 SSH，加密在瀏覽器裡完成，轉接站看不到你的帳密。

## 部署轉接站

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
npx grunt
```
