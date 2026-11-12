---
description: 發測試版：測試、建置、commit、推 mobile 與 gh-pages，等 CI 出 android-latest
argument-hint: "[commit 訊息（可省略）]"
---

發一個 Android **測試版**（`android-latest`）。

1. `git status` 看有哪些變更；沒有變更也沒有未推的 commit 就說一聲並停下。
2. `npm test`，有 FAIL 就停下回報，不要推。
3. 改過 `js/` 或 `css/` 就 `npm run build`，把 `js/pttchrome.min.js`、`css/pttchrome.min.css`、`extension/` 一起加進 commit。
4. Commit：訊息用英文、照 repo 既有風格（`App article: …`）；有給參數就用它：$ARGUMENTS
5. `git push origin mobile`，再 `git push origin mobile:gh-pages`（必須是 fast-forward，不行就停下問）。
6. 在背景用 `gh run watch` 等 `android.yml` 跑完，然後讀 `android-latest` 的 `version.json`，回報版次，例如「1.33.2 (65)」，以及 CI 是否成功。
