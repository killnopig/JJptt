---
description: 發正式版：把 android-latest 上現在的測試版原封不動升為 android-stable
argument-hint: "[給使用者看的更新說明（可省略，會自動整理）]"
---

把目前的 **測試版** 升成 **正式版**。不重新建置，用的是同一個 APK。

1. 讀 `android-latest` 的 `version.json`（`gh release download android-latest -R killnopig/JJptt -p version.json -O -`），以及 `android-stable` 的版次。
2. 測試版和正式版是同一版就說「已經是正式版」並停下。
3. 說明文字：有給參數就用它：$ARGUMENTS
   沒給就從上一個正式版到現在的 commit（`git log`）整理成給一般使用者看的中文條列，只寫使用者感受得到的改變，不寫內部細節。
4. 先把「要升的版次＋說明文字」給使用者看，等使用者說可以才執行：
   `gh workflow run android-stable.yml -R killnopig/JJptt --ref gh-pages -f notes='…'`
5. 在背景等 workflow 跑完，確認 `android-stable` 的 `version.json` 已經是那個版次，回報結果與 release 網址。
