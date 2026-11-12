---
description: 發擴充版新版本：在 js/changelog.js 加一筆、建置、推到 gh-pages 觸發 release.yml
argument-hint: "[版本號，例如 1.34.0（可省略，自動遞增）]"
---

發 Chrome 擴充版的新版本。

1. 讀 `js/changelog.js` 最上面那筆，看格式和目前版本。
2. 版本號：有給參數就用它：$ARGUMENTS
   沒給就看上一版之後的改動：只有修正就遞增最後一碼，有新功能就遞增中間那碼。
3. 從上一版到現在的 `git log` 整理變更內容，寫成給使用者看的中文，**只寫擴充版（電腦版）看得到的改變**；只改 App 的 commit 不寫。日期用今天。
4. 先把新的那筆 changelog 給使用者看，等使用者說可以再繼續。
5. 寫進 `js/changelog.js` 最上面，`npm test`，`npm run build`（版本會寫進 `package.json`、`extension/manifest.json`、`CHANGELOG.md`），commit。
6. `git push origin mobile` 再 `git push origin mobile:gh-pages`。推到 gh-pages 會觸發 `release.yml` 發 `vX.Y.Z`；推 mobile 也會同時出一個 App 測試版，這是正常的。
7. 在背景等 `release.yml` 跑完，回報 release 網址。
