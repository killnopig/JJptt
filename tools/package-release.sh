#!/bin/sh
# Packages a GitHub release into dist/ (run `npm run build` first):
#   JJptt-extension-X.Y.Z.zip    extension/ folder, load it with 「載入未封裝項目」
#   JJptt-native-host-X.Y.Z.zip  install scripts + bin/, keeps the layout install.sh expects
#   install.sh install.bat install.ps1 uninstall.bat jjptt-host-*   the same files one by one
#   notes.md                     this version's section of CHANGELOG.md
set -e
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
OUT=dist
rm -rf "$OUT"
mkdir -p "$OUT"

zip -q -r -X "$OUT/JJptt-extension-$VERSION.zip" extension -x '*.DS_Store'

NH="native-host/install.sh native-host/install.bat native-host/install.ps1 native-host/uninstall.bat"
# shellcheck disable=SC2086
zip -q -r -X "$OUT/JJptt-native-host-$VERSION.zip" $NH native-host/bin -x '*.DS_Store'
# shellcheck disable=SC2086
cp $NH native-host/bin/jjptt-host-* "$OUT/"

awk -v head="## $VERSION（" '
  index($0, head) == 1 { found = 1; next }
  found && /^## / { exit }
  found { print }
' CHANGELOG.md | sed '/./,$!d' > "$OUT/notes.md"
if [ ! -s "$OUT/notes.md" ]; then
  echo "CHANGELOG.md has no section for $VERSION" >&2
  exit 1
fi

echo "$VERSION"
