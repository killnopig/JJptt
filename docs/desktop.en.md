# JJptt Chrome extension

[中文](desktop.md) | **English** | [日本語](desktop.ja.md)

← [Back to JJptt](../README.en.md)

## Installation (about 5 minutes, once)

You install two things, and both are needed:

- **The extension**: a small tool added to your browser. It's what you see as JJptt.
- **The local helper**: a small program on your computer that connects JJptt to PTT. A browser can't connect to PTT by itself, so it needs this.

Works with desktop Chrome, Edge, Brave, Arc and Vivaldi; on a phone, use the [Android app](android.en.md).

There are two ways to install; pick one:

| | Method 1 (recommended): download with Git | Method 2: download zip files |
|---|---|---|
| Updating later | One click on 「立即更新」 (Update now) | Download and install again every time |
| What you do | Paste two or three commands into Terminal | Download and unzip; on a Mac you still paste one command |

Method 1 comes first; [Method 2](#method-2-download-zip-files) is further down.

### Method 1: Mac

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

> **Why turn on Developer mode?** JJptt isn't in the Chrome Web Store. Chrome only lets you pick a folder and install an extension from it in this mode. Turning it on doesn't make your computer less safe; it just adds the "install it yourself" option.

**Step 5: restart Chrome**

Press `⌘ + Q` to quit Chrome completely and open it again. Click the puzzle icon right of the address bar → pin JJptt; from then on, click the JJptt icon in the toolbar to open it.

### Method 1: Windows

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

### Method 2: download zip files

1. From [Releases](https://github.com/killnopig/JJptt/releases/latest), download two files: `JJptt-extension-<version>.zip` and `JJptt-native-host-<version>.zip`.
2. Unzip both (on a Mac, double-click; on Windows, right-click → "Extract All").
3. Install the local helper:
   - Mac: open Terminal (see Method 1, step 1), type `sh ` (sh and a space), drag `install.sh` from the unzipped `native-host` folder into the window, and press Enter.
   - Windows: open the unzipped `native-host` folder and double-click `install.bat`.
4. Add JJptt to Chrome: follow step 4 of Method 1, and pick the unzipped `extension` folder.
5. Restart the browser: step 5 of Method 1.

Installed this way, 「立即更新」 (Update now) doesn't work. For a new version, download and do it again.

## First use

1. Click the JJptt icon in the toolbar: a new tab opens and connects to PTT (encrypted SSH by default).
2. Enter your ID and password as usual. To log in automatically: **right-click on the screen → 設定 (Settings) → 自動登入與其他 (Auto login and more)**.
3. Open a board and an article and reading mode shows images and the push analysis. Press `Esc` to go back to the terminal screen.
4. Every switch is under **right-click → 設定 (Settings)**; the shill-catching ones are under 「真.事實查核中心」 (FACT) — see [the full FACT guide](fact.en.md) for what each rule does.

![FACT in the settings: every rule has its own switch and threshold](images/settings-factcheck.png)

Newest articles on top: 設定 → 排版 (Layout) → tick 「文章列表最新的在上面」 (newest first in the article list).

![Newest articles on top; the cursor starts on the newest one](images/list-newest.png)

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
設定 → 同步、備份與更新 (Sync, backup and update) → 「連結 Google 帳號」 (Link Google account), or 「匯出設定檔」 (Export settings) and on the other computer 「從檔案匯入」 (Import from file). IDs and passwords are not synced. What moves and what doesn't: [Moving your settings](settings-file.en.md).

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

It deliberately keeps the terminal's font, colours and 80-column width, and PTT's keys (↑↓ scroll, ← / Esc leave, X push, y reply), so it is still PTT — just with images and whole-article reading. To turn it off: 設定 → 一般 (General). Boards PTT's web site (www.ptt.cc) doesn't show (such as ones that need a login) stay on the terminal screen automatically.

## Data usage

- PTT's original screen (the terminal) is light: text only, a few MB for a whole day.
- Reading mode uses more: each article is downloaded from PTT's web site, usually 50–300 KB. A popular article with thousands of pushes can be over 1 MB.
- Images and link previews load only when you scroll near them, from tens of KB to a few MB each.
- 「預先讀取時連圖片一起下載」 (download images when loading ahead) is on by default: the fastest switching, but much more data. With 5 articles loaded each way, every switch downloads about 10 more articles with all their images. Untick it to load text only.

On a hotspot or a limited plan, save data like this:

1. 設定 → 一般 (Settings → General) → untick 「預先讀取時連圖片一起下載」.
2. Tick 「閱讀模式用低解析度圖片」 (low-resolution images in reading mode).
3. Set 「預先讀取上下幾篇」 (articles to load ahead) to 0 or 1.
4. Still too much? Turn reading mode off for a while.

## Advanced (only for people who write code; everyone else can skip it)

### Web version (needs your own relay server)

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
