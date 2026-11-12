---
description: 推之前的完整檢查：lint、測試、建置、文件連結、建置產物是否已 commit
---

只檢查、不 commit、不 push。逐項回報 ✅／❌，有錯就附上錯誤訊息的關鍵幾行。

1. `npx grunt jshint`
2. `npm test`：統計 ok／FAIL 數量，列出每個 FAIL。
3. `npm run build`，接著 `git status --short`：建置後如果 `js/pttchrome.min.js`、`css/pttchrome.min.css`、`extension/` 有出現新的差異，代表原始碼改了但建置產物還沒更新，要指出來。
4. 文件連結：檢查 `README*.md` 與 `docs/*.md` 裡的相對連結和 `#錨點` 都指得到（檔案存在、標題錨點存在；程式碼區塊裡的不算）。
5. 改到 `mobile/` 或 `js/mobile*.js` 的話，再跑 `cd mobile && node build.js` 確認能產生 `www/`。

最後一句話：可以推，或還差什麼。
