# JJptt

[中文](README.md) | **English** | [日本語](README.ja.md)

[![Ko-fi](https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/killnopig)

**Read PTT in your browser — and catch the astroturfers while you're at it.**

[PTT](https://www.ptt.cc/) is Taiwan's largest bulletin board system. JJptt is a client for it.

- **Direct, no middleman**: the extension connects to ptt.cc through a small local helper program. No relay server; your ID and password stay on your computer.
- **FACT (真.事實查核中心)**: fast pushes, bursts, boosting, canned pushes, shared subnets, data-centre / VPN IPs, co-occurring accounts, first-push squads — the traces of coordinated opinion pushing under an article, visible at a glance, and handed to AI with one click.
- **Reading mode**: keeps the terminal's font and feel, with images, videos and news cards right inside the article; the previous and next articles are loaded ahead, so they open instantly.
- **Pushes at a glance**: floor numbers, country flags, shared IPs and repeat pushers each get their own colour — who is flooding and who is relaying, without counting.
- **Your lists**: blacklist, watchlist, a custom "shill" list — fade or hide, switch on and off any time; posting the same URL around gets blocked automatically for 24 hours.
- **Gets out of your way**: newest articles on top, Z search fills in the push count, select text to ask AI whether it's true.
- **Settings travel with you**: Google Drive sync or export to a file; new versions install with one click and restart by themselves.

Free and open source (GPL-2.0). Not on any store, and no data is collected.

📱 **Now on your phone too**: the [JJptt Android app](#android-app) is out — it connects to PTT directly, nothing else to install.

![Reading mode: the terminal look, with images inside the article](docs/images/reader.png)

![FACT: a report above the pushes, and each push tagged with fast push, shared subnet, data centre, canned text…](docs/images/reader-factcheck.png)

<sub>Demo screens; accounts and content are fictional. JJptt's interface is in Traditional Chinese.</sub>

### FACT (真.事實查核中心)

**FACT = Facts, Accuracy, Credibility & Truth.** Evidence over opinion: ask about the facts, not the side; check everyone the same way.

- **One ruler**: the standard never changes with political leaning, identity or organisation.
- **Open evidence**: every tag can say why (shared IP, data centre, fast push…) — open the report and see.
- **Open to checking**: anyone flagged by mistake can be taken off the automatic blacklist, and every rule can be switched off or given your own threshold.

![FACT: Evidence over opinion — transparent, consistent, impartial, evidence first, willing to correct](docs/images/fact.png)

### Data usage

- The terminal screen is light: text only, a few MB for a whole day.
- Reading mode uses more: each article is downloaded from PTT's web site, usually 50–300 KB, over 1 MB for an article with thousands of pushes; images and link previews load only when you scroll to them, from tens of KB to a few MB each.
- By default, loading ahead includes images (設定 → 一般 →「預先讀取時連圖片一起下載」, Settings → General → "Download images when loading ahead"): the fastest switching, but much more data — with 5 articles each way, every switch downloads about 10 more articles (10 ahead and 3 behind when you keep reading in one direction) with all their images; untick it to fetch text only.
- On a hotspot or a limited plan: untick that option, tick 「閱讀模式用低解析度圖片」 (low-resolution images in reading mode), set 「預先讀取上下幾篇」 (articles to load ahead) to 0 or 1, or turn reading mode off for a while.

## Android app

![JJptt for Android: Read PTT. Catch the astroturfers.](docs/images/android-cover.en.png)

JJptt now has an Android app. It connects to PTT by itself — no local helper to install, and no relay server in between.

- **FACT**: fast pushes, shared subnets, data-centre IPs… tagged right next to each push, and one tap hands the article to AI.
- **Push, reply, post**: your push shows up the moment PTT takes it (marked 「剛送出」, "just sent") — no waiting for the web page to catch up.
- **Easy reading**: images and news cards inside the article; previous / next can float on the left or right edge for one-handed reading; your PTT favourites sync in one tap.
- **Your layout**: text size, line spacing and push style, with a live preview on top; save a layout as a code and share it with friends.
- **Same settings as the desktop**: a settings file exported from the extension imports straight into the app.
- **Your account stays safe**: the password is encrypted with an Android Keystore key on the phone and never backed up to the cloud.

![FACT: five accounts say "so good!" within one minute? We flag it.](docs/images/android-fact.en.png)

### Download and update

1. On your phone, open the [JJptt Android release page](https://github.com/killnopig/JJptt/releases/tag/android-stable) and tap `JJptt.apk` (about 10 MB).
2. Open the downloaded file to install. The first time, Android asks you to allow installing apps from unknown sources.
3. New versions: in the app, **設定 → 關於 →「檢查並自動更新」** (Settings → About → Check and update). One tap; settings and login are kept.

To try changes still being tested: 設定 → 關於 → turn on 「**接收測試版**」 (Receive test builds).

Android 7.0 and later. Not on Google Play — install from the release page above.

### About an iOS version

Many people have asked for an iPhone version, and I'd love to make one. Most of the code can be reused, but publishing an iOS app requires joining Apple's Developer Program (US$99 a year), and an iPhone to test the direct PTT connection and pushing.

JJptt has always been a free, ad-free side project, and that cost isn't covered yet. If JJptt is useful to you and you'd like to help make the iOS version happen, you're welcome to [buy me a coffee on Ko-fi](https://ko-fi.com/killnopig) — any amount, entirely optional, and no feature depends on it. Once the developer account is covered, I'll start, and share the progress here.

<sub>The articles, accounts and IPs in the promo images are fictional demo data.</sub>

## Installation (about 5 minutes, once)

This part is for the desktop: JJptt is a Chrome extension plus a small local helper program for the connection. Both are needed.
Works with desktop Chrome, Edge, Brave, Arc and Vivaldi; on a phone, use the [Android app](#android-app) above.

If you'd rather not use Git, download `JJptt-extension-<version>.zip` (the unzipped `extension` folder is what step 4 asks for) and `JJptt-native-host-<version>.zip` (unzip and run the installer inside) from [Releases](https://github.com/killnopig/JJptt/releases/latest). Installed from zip, the one-click update doesn't work and new versions must be downloaded again; the `git clone` way below updates with one click.

### Mac

**Step 1: open Terminal**

Press `⌘ + Space`, type "Terminal", press Enter. A window you can type in appears; every command below is **pasted here, then Enter**.

**Step 2: download JJptt**

```bash
cd ~ && git clone https://github.com/killnopig/JJptt.git
```

- If asked to install the command line developer tools, click "Install", wait for it to finish, and paste the command again.
- When done, your home folder (the one with the house icon in Finder) has a new `JJptt` folder.

**Step 3: install the local helper**

```bash
sh ~/JJptt/native-host/install.sh
```

When it says it's done (「安裝完成」), you're set.

**Step 4: add JJptt to Chrome**

1. Type `chrome://extensions` in Chrome's address bar and press Enter (`edge://extensions` in Edge).
2. Turn on **Developer mode** at the top right.
3. Click **Load unpacked** at the top left.
4. In the window that opens, press `⌘ + Shift + G`, paste `~/JJptt/extension`, press Enter, then "Select".
5. A JJptt card appears: done.

**Step 5: restart Chrome**

Press `⌘ + Q` to quit Chrome completely and open it again. Click the puzzle icon right of the address bar → pin JJptt; from then on, click the JJptt icon in the toolbar to open it.

### Windows

**Step 1: install Git**

Download from <https://git-scm.com/download/win> and click "Next" through the defaults.

**Step 2: download JJptt**

Press the `Windows key`, type `cmd`, open Command Prompt, paste this line and press Enter:

```bat
cd %USERPROFILE% && git clone https://github.com/killnopig/JJptt.git
```

When done, there is a new folder `C:\Users\<your name>\JJptt`.

**Step 3: install the local helper**

Open that `JJptt` folder → `native-host` → double-click `install.bat`.

**Steps 4 and 5:** as on the Mac. Choose the `extension` folder inside `JJptt`; to restart the browser, close all its windows.

## First use

1. Click the JJptt icon in the toolbar: a new tab opens and connects to PTT (encrypted SSH by default).
2. Enter your ID and password as usual. To log in automatically: **right-click on the screen → 設定 (Settings) → 自動登入與其他 (Auto login and more)**.
3. Open a board and an article and reading mode shows images and the push analysis. Press `Esc` to go back to the terminal screen.
4. Every switch is under **right-click → 設定 (Settings)**; the shill-catching ones are under 「真.事實查核中心」 (FACT).

![FACT in the settings: every rule has its own switch and threshold](docs/images/settings-factcheck.png)

Newest articles on top: 設定 → 排版 (Layout) → tick 「文章列表最新的在上面」 (newest first in the article list).

![Newest articles on top; the cursor starts on the newest one](docs/images/list-newest.png)

## Updating

- When there's a new version, a notice appears at the top of JJptt; press 「**立即更新**」 (Update now) and it downloads and reopens by itself.
- Or open the settings and press 「**更新 JJptt**」 (Update JJptt) at the bottom left.
- If the button doesn't work: on a Mac double-click `update-jjptt.command` in the `JJptt` folder, on Windows `update-jjptt.bat`, then go back to JJptt and press 「套用更新」 (Apply update).

## FAQ

**I clicked the JJptt icon and it never connects**
The local helper isn't installed properly, or the browser wasn't fully closed afterwards. Do step 3 again, then `⌘ + Q` (on Windows close every window) and reopen.

**The layout looks broken**
For example overlapping text, things out of place, or a setting that doesn't change the screen: reload first (`⌘ + R` on a Mac, `F5` on Windows). Reloading reconnects (log in again if you haven't set auto login); your settings stay. If it still looks wrong, report it on GitHub with a screenshot.

**I forgot where the JJptt folder is**
Open `chrome://extensions` → "Details" on the JJptt card → scroll to "Source"; that path without the final `/extension` is the folder.

**Syncing to another computer**
設定 → 同步、備份與更新 (Sync, backup and update) → 「連結 Google 帳號」 (Link Google account), or 「匯出設定檔」 (Export settings) and on the other computer 「從檔案匯入」 (Import from file). IDs and passwords are not synced.

**Uninstalling**
Remove JJptt at `chrome://extensions`, then the local helper: on a Mac run `sh ~/JJptt/native-host/install.sh --uninstall` in Terminal, on Windows double-click `native-host\uninstall.bat`. Finally delete the `JJptt` folder.

**Is the local helper safe?**
It only connects to `ptt.cc` / `ptt2.cc` and only answers the JJptt extension; "Update now" only downloads the new version from GitHub into the JJptt folder. Its source is `native-host/main.go`.

## Why a reading mode

PTT itself is an 80 × 24 character text terminal, and that limit makes a few things hard there:

- **No images**: a terminal shows only text, so images, videos and news links in an article are just URLs to open one by one and come back from. Reading mode shows them inside the article; scroll down and you've seen them.
- **One page at a time**: long articles and hundreds of pushes are paged through screen by screen. Reading mode puts the whole article on one page, to scroll smoothly and jump anywhere.
- **Push analysis needs the whole article**: floor numbers, several accounts on one IP, the author's IP, repeat pushers and canned pushes are only reliable with every push. The terminal sees one page; reading mode has the whole article at once.
- **Copying and checking are awkward**: selecting text in the terminal picks up borders and formatting characters. In reading mode you select and copy directly, and can hand the selection or the whole article to AI to check.
- **Waiting between articles**: in the terminal the next article arrives from PTT a page at a time. Reading mode loads the previous and next few ahead, so switching is nearly instant.

It deliberately keeps the terminal's font, colours and 80-column width, and PTT's keys (↑↓ scroll, ← / Esc leave, X push, y reply), so it is still PTT — just with images and whole-article reading. To turn it off: 設定 → 一般 (General). Boards the web site doesn't have (such as ones that need a login) stay on the terminal screen automatically.

## Advanced (for developers)

JJptt is a fork of [iamchucky/PttChrome](https://github.com/iamchucky/PttChrome) (GPL-2.0). The original opened TCP connections through the discontinued Chrome Apps; JJptt's extension connects through the local helper instead, and there is also a web version that connects to PTT through your own Cloudflare Worker relay (`worker/`). Both use SSH by default, with the encryption done in the browser.

### Web version (needs your own relay)

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

Enter the deployed `https://jjptt-relay.<your-subdomain>.workers.dev` in the box the web page asks with the first time (or set `lib.DEFAULT_RELAY_URL` in `js/app_conn.js`). The web addresses allowed to use the relay are set in `ALLOWED_ORIGINS` in `worker/wrangler.toml`.

Abuse limits: at most 10 new connections per IP per minute (`[[ratelimits]]` in `wrangler.toml`); uploads per connection at 16 KB/s, bursting to 256 KB (`UPLOAD_*` in `worker/src/index.js`).

### Google sync for your own fork

JJptt already has its own Google client ID; ordinary users can skip this. If you fork it, in the [Google Cloud Console](https://console.cloud.google.com/):

1. Create a project; "APIs & Services" → "Library" → enable the **Google Drive API**.
2. Set up the OAuth consent screen (audience "External"; add the Gmail accounts you'll use as "Test users").
3. "Clients" → "Create client" → "Web application": JavaScript origin `https://<your-account>.github.io`, redirect URI `https://<extension ID>.chromiumapp.org/`.
4. Put the client ID in `DriveSync.CLIENT_ID` in `js/drive_sync.js`, then `npm run build`.

### Development

`dev.html` loads the sources in `js/` directly; `index.html` and the extension use the bundled `js/pttchrome.min.js`:

```bash
npm install
npm run build
```

`npm run build` bundles the site and copies it into `extension/`. To release a new version: add an entry at the top of `js/changelog.js` (version, date, what changed), then `npm run build`; the version is written into `package.json`, `extension/manifest.json` and `CHANGELOG.md` automatically.

`npm test` runs the automated tests (Node only, no packages to install), in `test/run.js`: FACT's flood rules, the temporary blacklist, same-URL spam, and checks that every rule appears in the settings page and in the Chinese and English texts.

The Android app is in `mobile/` (Capacitor); `npm run build` there copies the built pages into the app. CI builds and signs it on every push to the `mobile` branch (`.github/workflows/android.yml`), and a tested build is promoted to the stable release by hand (`.github/workflows/android-stable.yml`).

The local helper's source is `native-host/main.go`; after changing it, `sh native-host/build.sh` rebuilds the executables for every platform (needs Go).

### Data sources

The IP country data (`data/geoip-v4.bin`) is converted from geo-whois-asn-country of [ip-location-db](https://github.com/sapics/ip-location-db), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), source: [Number Resource Organization (NRO)](https://www.nro.net/). See `tools/build-geoip.js` to update it.

The data-centre / VPN IP data (`data/hosting-v4.bin`) is filtered from origin-asn of ip-location-db, under [PDDL](https://opendatacommons.org/licenses/pddl/1-0/) (public domain), from the regional internet registries and the public routing data of Route Views / RIPE RIS. See `tools/build-hosting.js` to update it.

## Thanks

Thanks to 中正機械 MBA91 几啟成, my muse.
