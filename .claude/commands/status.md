---
description: 一眼看現況：正式版／測試版版次、CI、分支是否同步、未 commit 的變更
---

只讀不改，回報以下幾項，用一張簡短的表：

- **正式版**：`android-stable` 的 `version.json`（版本與版次）
- **測試版**：`android-latest` 的 `version.json`
- **擴充版**：`js/changelog.js` 最上面的版本，以及 GitHub 上最新的 `v*` release
- **CI**：`gh run list -R killnopig/JJptt -L 5` 最近幾次的結果，有失敗就指出是哪個 workflow
- **分支**：`git fetch` 後，`mobile`、`origin/mobile`、`origin/gh-pages` 是否指向同一個 commit；有沒有還沒推的 commit
- **工作目錄**：`git status --short`

最後一句話說「測試版比正式版新幾版、新在哪」（從 `git log` 看），讓使用者判斷要不要 /stable。
