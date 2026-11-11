#!/bin/sh
# Installs the JJptt native host for Chrome / Edge / Brave / Chromium / Arc.
# Usage:  sh install.sh            install
#         sh install.sh --uninstall
set -e

NAME="com.jjptt.host"
EXTENSION_ID="fdlnogjbmfefgnaidfoackkjnnkibnmm"
INSTALL_DIR="$HOME/.jjptt"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

case "$(uname -s)" in
  Darwin)
    OS=darwin
    BASE="$HOME/Library/Application Support"
    BROWSER_DIRS="Google/Chrome
Google/Chrome Beta
Chromium
Microsoft Edge
BraveSoftware/Brave-Browser
Arc/User Data
Vivaldi"
    ;;
  Linux)
    OS=linux
    BASE="$HOME/.config"
    BROWSER_DIRS="google-chrome
google-chrome-beta
chromium
microsoft-edge
BraveSoftware/Brave-Browser
vivaldi"
    ;;
  *)
    echo "不支援的系統：$(uname -s)。Windows 請執行 install.bat。" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64) ARCH=amd64 ;;
  *) echo "不支援的處理器架構：$(uname -m)" >&2; exit 1 ;;
esac

if [ "$1" = "--uninstall" ]; then
  echo "$BROWSER_DIRS" | while IFS= read -r d; do
    rm -f "$BASE/$d/NativeMessagingHosts/$NAME.json"
  done
  rm -rf "$INSTALL_DIR"
  echo "已移除 JJptt 本機程式。"
  exit 0
fi

BIN="$SCRIPT_DIR/bin/jjptt-host-$OS-$ARCH"
if [ ! -f "$BIN" ]; then
  echo "找不到 $BIN" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
cp "$BIN" "$INSTALL_DIR/jjptt-host"
chmod 755 "$INSTALL_DIR/jjptt-host"
if [ "$OS" = darwin ]; then
  # Files downloaded from the internet are quarantined by macOS.
  xattr -d com.apple.quarantine "$INSTALL_DIR/jjptt-host" 2>/dev/null || true
fi

MANIFEST="{
  \"name\": \"$NAME\",
  \"description\": \"JJptt native host\",
  \"path\": \"$INSTALL_DIR/jjptt-host\",
  \"type\": \"stdio\",
  \"allowed_origins\": [\"chrome-extension://$EXTENSION_ID/\"]
}"

echo "$BROWSER_DIRS" | while IFS= read -r d; do
  # Always register for Chrome; other browsers only if installed.
  if [ -d "$BASE/$d" ] || [ "$d" = "Google/Chrome" ] || [ "$d" = "google-chrome" ]; then
    mkdir -p "$BASE/$d/NativeMessagingHosts"
    printf '%s\n' "$MANIFEST" > "$BASE/$d/NativeMessagingHosts/$NAME.json"
    echo "已註冊：$d"
  fi
done

echo ""
echo "安裝完成。請完全關閉瀏覽器再重新打開，然後點 JJptt 擴充功能圖示。"
