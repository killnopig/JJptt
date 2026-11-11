#!/bin/sh
# Builds jjptt-host for every supported platform into native-host/bin/.
set -e
cd "$(dirname "$0")"
mkdir -p bin
for target in darwin/arm64 darwin/amd64 linux/amd64 linux/arm64 windows/amd64; do
  os=${target%/*}; arch=${target#*/}
  ext=""; [ "$os" = windows ] && ext=".exe"
  echo "building $os/$arch"
  CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -trimpath -ldflags "-s -w" \
    -o "bin/jjptt-host-$os-$arch$ext" .
done
