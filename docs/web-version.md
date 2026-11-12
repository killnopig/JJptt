# JJptt 網站版（不用安裝，要自己架轉接站）

> 一般使用者不需要看這份。JJptt 平常是 **Chrome／Edge 擴充功能**，安裝方式在 [README](../README.md)。

網站版（`https://killnopig.github.io/JJptt/`，從網址列直接開，不用裝擴充功能）要靠一個架在 Cloudflare 的轉接站：

- 轉接終端機連線（網頁沒辦法直接連 PTT）。
- 代抓 PTT 官方網頁（www.ptt.cc）的文章（`/page`），所以網站版也有閱讀模式、真.事實查核中心、連推黑名單、連續推文排在一起，跟擴充功能一樣。只抓 `https://www.ptt.cc/bbs/` 底下的網頁，只給 `ALLOWED_ORIGINS` 裡的網頁用，不是萬用代理。

跟擴充功能版不一樣的地方：沒有網址預覽卡片（那要能抓任何網站，轉接站刻意不做）；圖片和 YouTube 縮圖照常顯示；沒有「立即更新」（重新整理就是最新版）。

**第一次部署（Mac，約 10 分鐘）：**

1. 到 <https://dash.cloudflare.com/sign-up> 註冊 Cloudflare 帳號（免費方案就夠）。
2. 電腦要有 Node.js：終端機打 `node -v`，有出現版本號就好；沒有的話到 <https://nodejs.org> 下載 LTS 版安裝。
3. 終端機依序執行（第二行會打開瀏覽器，按「Allow」授權）：

   ```bash
   cd ~/JJptt/worker
   npx wrangler login
   npx wrangler deploy
   ```

4. 最後會印出一行 `https://jjptt-relay.<你的子網域>.workers.dev`，把它記下來。
5. 打開 `https://killnopig.github.io/JJptt/?relay=wss://jjptt-relay.<你的子網域>.workers.dev`（把網址換成你的）。之後直接開 `https://killnopig.github.io/JJptt/` 就會記得。也可以把網址設在 `js/app_conn.js` 的 `lib.DEFAULT_RELAY_URL`，網頁就不會再問。

**更新轉接站**（之後改了 `worker/` 才需要）：`cd ~/JJptt/worker && npx wrangler deploy`。舊版的轉接站沒有代抓文章的功能，網站版的閱讀模式會顯示「請重新部署轉接站」。

允許使用轉接站的網頁網址設在 `worker/wrangler.toml` 的 `ALLOWED_ORIGINS`；自己 fork 的話要把 `https://killnopig.github.io` 換成自己的。

防濫用限制：每個 IP 每分鐘最多 10 條新連線、120 次代抓文章（`wrangler.toml` 的 `[[ratelimits]]`）；每條連線上傳平時 16 KB/秒、可瞬間衝到 256 KB（`worker/src/index.js` 的 `UPLOAD_*`）。Cloudflare 免費方案每天 10 萬次請求，自己用綽綽有餘。
