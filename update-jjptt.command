#!/bin/bash
# 雙擊這個檔案就會更新 JJptt（下載 GitHub 上的新版本）。
cd "$(dirname "$0")" || exit 1
echo "正在更新 JJptt…"
echo
if git pull --ff-only; then
  echo
  echo "完成！回到 JJptt 按「套用更新」，或在 chrome://extensions 的 JJptt 上按 ↻。"
else
  echo
  echo "更新失敗。請把上面的訊息截圖給 Claude 看。"
fi
echo
read -n 1 -s -r -p "按任意鍵關閉這個視窗"
