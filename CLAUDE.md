# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

JJptt is a PTT (Taiwan's BBS) client: a Chrome extension, a web version, and an Android app (`mobile/`), all built from the same `js/` sources. Forked from iamchucky/PttChrome (GPL-2.0). The owner writes in Traditional Chinese; UI strings, changelog entries and release notes are in Chinese.

## Commands

```bash
npm ci                 # once (grunt is a dev dependency; `grunt` is not on PATH otherwise)
npm test               # node test/run.js — plain Node, no test framework
npm run build          # sync version → grunt (jshint, concat, cssmin, uglify) → copy into extension/
npx grunt jshint       # lint only (the build fails on any jshint error)
```

- `test/run.js` has no filter: it runs everything and prints `ok` / `FAIL` per test. To look at one, `npm test 2>&1 | grep -A2 '<name>'`.
- Tests load browser sources into Node with `vm` and stubs (`window`, `$`, `lib.store`). Sync tests use `test(...)`; anything async uses `testAsync(...)`, which must be defined *after* `var asyncTests = []` (around the "Android app (lib.openAppPort)" section) or the file crashes at load. A test is also expected to fail on the old code when it guards a fix.
- **Built files are committed**: `js/pttchrome.min.js`, `css/pttchrome.min.css`, and everything under `extension/`. After changing `js/` or `css/`, run `npm run build` and commit the outputs with the source. `*.concat.*` are gitignored.
- Android app: `cd mobile && npm ci && node build.js && npx cap sync android`, then `cd android && ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew assembleDebug` (or `assembleRelease`, unsigned). `mobile/build.js` copies the built extension pages into `mobile/www` and writes `build-info.js` (version + `GITHUB_RUN_NUMBER`).
- Local Android check: emulator AVD `Medium_Phone_API_37.0` in `~/Library/Android/sdk`. Debug builds are debuggable, so the WebView can be driven over CDP (`adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`); `pttchrome.app.mobile` is the app object.

## Architecture

**No modules.** Every `js/*.js` file defines globals and is concatenated in the order listed in `Gruntfile.js` (`concat.js` and `jshint.files` — both lists must include a new file); `dev.html` loads the same files unbundled. `pttchrome.App` (`js/pttchrome.js`) is the root object; `js/main.js` creates it.

**Connection** (`js/app_conn.js`): one interface, three transports, all speaking SSH/telnet from the page (`ssh.js`, `telnet.js`):
- extension → native host (`native-host/main.go`, Go) via `chrome.runtime.connectNative`
- Android app → `PttSocketPlugin` (Capacitor plugin, raw TCP), dressed up as a native-messaging port (`lib.openAppPort`)
- web version → a Cloudflare Worker relay (`worker/`)

Both native pieces only allow `ptt.cc` / `ptt2.cc` and fixed ports. `lib.isApp()` / `lib.isExtension()` decide which path runs; settings storage also goes through `AppConnection.handleStorage` (localStorage in the app, with the PTT password moved into the `SecureStore` plugin — Android Keystore — never localStorage).

**Terminal**: `term_buf.js` (screen buffer), `ansi_parser.js`, `term_view.js` (rendering), `pref.js` (settings: `DEFAULT_PREFS` in `predefined_config.js`, the settings modal in `index.html`).

**Reading mode** (`js/reader.js`, `PttReader`): instead of the terminal, articles are fetched from www.ptt.cc and rendered as HTML (images, link cards, pushes). Articles are keyed by `PttReader.articleUrl(url)` (no query / `#`) — the app reloads with `?_=time` to bypass caches, and keying by the raw URL once made one article count as several.

**Analysis** — all run on every loaded article:
- `push_insights.js` — floor numbers, IP country (`data/geoip-v4.bin`), same-IP, repeat-pusher colours (sets `data-jj-rp` / `--jj-rp`)
- `fact_check.js` — 真.事實查核中心 FACT: per-article rules (秒推, 脈衝, 罐頭, 同網段, 機房 via `data/hosting-v4.bin`, 連推…) plus cross-article history (`FactHistory`, 共伴 / 首殺班底) in localStorage
- `spam_guard.js` — same URL in >3 articles in 24h → temporary blacklist

Every FACT rule needs a setting in `index.html`, a `DEFAULT_PREFS` entry, and `options_<key>` in both `zh_TW_messages.js` and `en_US_messages.js`; a test checks this.

**Android app UI** (`js/mobile*.js`, `JJMobile`, only when `lib.isApp()`): a phone UI built on top of `PttReader`, not the terminal. `mobile.js` (start, top bar, icons `JJMobile.ICONS`, updates), `mobile_home.js` (account, boards), `mobile_board.js` (article list), `mobile_article.js` (article, pushes, composer, swipe), `mobile_settings.js` (設定 / 版面). `mobile_ptt.js` (`JJPtt`) drives a hidden terminal session to log in, push, reply and post — it waits on screen text with `wait(cases, ms, since)`; pass `since` (a screen taken before typing) so text already on screen (e.g. a list header's 「[s]選擇看板」) is not taken as PTT's answer. Mobile CSS is the `JJptt on phones` section at the end of `css/main.css`, using tokens on `body.jj-mobile` (`--accent`, `--r-*`, `--f-*`).

## Branches and releases

- `gh-pages` is the default branch: GitHub Pages serves the web version from its root, and `.github/workflows/release.yml` publishes the extension (`vX.Y.Z` release) when the version at the top of `js/changelog.js` changes. To release the extension: add an entry at the top of `js/changelog.js`, `npm run build` (writes the version into `package.json`, `extension/manifest.json`, `CHANGELOG.md`).
- `mobile` is where work happens now; it is kept identical to `gh-pages` (`git push origin mobile` then `git push origin mobile:gh-pages`, a fast-forward). Every push to `mobile` runs `.github/workflows/android.yml`: test, build, sign, publish the **測試版** (test build) on the `android-latest` release (version `<package.json version> (<run number>)`).
- **正式版** (stable) is promoted by hand: `gh workflow run android-stable.yml -R killnopig/JJptt --ref gh-pages -f notes='…'`. It republishes the APK currently on `android-latest` unchanged to `android-stable` (what the app checks) and `android-v<version>-<run>`, never as the repo's Latest. Check `android-latest`'s `version.json` first so the promoted build is the one that was tried.
- The app checks `android-stable` by default and `android-latest` when 設定 → 關於 → 接收測試版 is on; it falls back to `android-latest` only when there is no stable release (404).

## Signing

Release APKs are signed by `mobile/android/sign-release.sh` with APK Signature Scheme v3 key rotation: `signing.lineage` rotates from the old debug key (`mobile/android/app/jjptt-debug.keystore`, public, password `android`) to the release key (GitHub Secrets `ANDROID_KEYSTORE_B64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS`; the owner keeps the `.p12` outside the repo). Do not delete the debug keystore or the lineage file — every release is signed with both. Android 9+ verifies the new key; 7–8 still see the old one. A debug build cannot be installed over a release build (uninstall first).

## Docs

`README.md` / `.en.md` / `.ja.md` are short front pages; details live in `docs/desktop*.md` and `docs/android*.md`. The README keeps `<a name>` anchors for the old section links. Promo images in `docs/images/android-*.png` (zh / en / ja) are rendered from screenshots of a made-up demo article — use fictional accounts, not real PTT users, in anything published.

## Project commands

`.claude/commands/`: `/beta` (test build), `/stable` (promote to 正式版, asks first), `/status`, `/check` (lint, tests, build, doc links), `/emu` (debug app on the emulator; CDP helper in `.claude/tools/cdp.mjs`), `/ext-release` (extension version), `/promo` (promo copy). The owner says 「發測試」 for `/beta` and 「發正式」 for `/stable`.
