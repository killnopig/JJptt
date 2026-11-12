#!/usr/bin/env bash
# Signs the release APK with JJptt's own key, rotated from the old one.
#
#   sign-release.sh <unsigned.apk> <out.apk>
#
# Needs JJPTT_KEYSTORE (the .p12 file) and JJPTT_KEYSTORE_PASSWORD; the key
# is kept out of the repo (GitHub Actions Secrets, and the owner's backup).
#
# Why two keys: test builds up to now were signed with the debug key in this
# repo (app/jjptt-debug.keystore), which anyone can read. signing.lineage is
# that old key saying "the new key takes over" (APK Signature Scheme v3), so
# Android 9+ updates in place, keeps the settings, and from then on only
# accepts the new key (the old one has no rollback right). Android 7-8 do not
# know v3 and keep checking the old key's v1/v2 signature.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
in="$1"
out="$2"
: "${JJPTT_KEYSTORE:?the release keystore (.p12)}"
: "${JJPTT_KEYSTORE_PASSWORD:?its password}"
alias="${JJPTT_KEY_ALIAS:-jjptt}"

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
bt="$(ls -d "$sdk"/build-tools/* | sort -V | tail -1)"

aligned="$(mktemp -t jjptt-aligned.XXXXXX).apk"
"$bt/zipalign" -p -f 4 "$in" "$aligned"

export JJPTT_OLD_PASSWORD=android  # the old, public debug key
"$bt/apksigner" sign \
  --rotation-min-sdk-version 28 \
  --lineage "$here/signing.lineage" \
  --ks "$here/app/jjptt-debug.keystore" --ks-key-alias androiddebugkey \
    --ks-pass env:JJPTT_OLD_PASSWORD --key-pass env:JJPTT_OLD_PASSWORD \
  --next-signer \
  --ks "$JJPTT_KEYSTORE" --ks-key-alias "$alias" \
    --ks-pass env:JJPTT_KEYSTORE_PASSWORD --key-pass env:JJPTT_KEYSTORE_PASSWORD \
  --out "$out" "$aligned"
rm -f "$aligned"

"$bt/apksigner" verify --print-certs "$out" | grep -E "Signer #|DN" || true
