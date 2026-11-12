# JJptt Chrome 擴充功能版

**中文** | [English](desktop.en.md) | [日本語](desktop.ja.md)

← [回 JJptt 首頁](../README.md)

## 安裝教學（約 5 分鐘，只要做一次）

要裝兩樣東西，兩個都裝好才能用：

- **擴充功能**：裝在瀏覽器裡的小工具，JJptt 的畫面就是它。
- **本機小程式**：裝在電腦上的小程式，負責幫 JJptt 連上 PTT。瀏覽器自己不能直接連 PTT，所以需要它。

支援電腦上的 Chrome、Edge、Brave、Arc、Vivaldi；手機請用 [Android App](android.md)。

有兩種裝法，選一種就好：

| | 方法一（推薦）：用 Git 下載 | 方法二：下載壓縮檔 |
|---|---|---|
| 以後怎麼更新 | 按一下「立即更新」就好 | 每次都要重新下載、重新裝 |
| 要做什麼 | 在「終端機」貼兩三行指令 | 下載、解壓縮，Mac 還是要貼一行指令 |

下面先寫方法一，[方法二](#方法二下載壓縮檔) 在後面。

### 方法一：Mac

**步驟 1：打開「終端機」**

按 `⌘ + 空白鍵`，輸入「終端機」（或 Terminal），按 Enter。會出現一個可以打字的視窗，下面的指令都是**複製貼上到這裡，再按 Enter**。

**步驟 2：下載 JJptt**

```bash
cd ~ && git clone https://github.com/killnopig/JJptt.git
```

- 如果跳出「需要安裝命令列開發者工具」，按「安裝」，等它裝完再貼一次上面的指令。
- 完成後，你的「家目錄」（Finder 左邊有房子圖示的那個）裡會多一個 `JJptt` 資料夾。

**步驟 3：安裝本機小程式**

```bash
sh ~/JJptt/native-host/install.sh
```

看到「安裝完成」就好了。

**步驟 4：把 JJptt 加進 Chrome**

1. 在 Chrome 網址列輸入 `chrome://extensions` 按 Enter（Edge 是 `edge://extensions`）。
2. 打開右上角的「**開發人員模式**」。
3. 按左上角「**載入未封裝項目**」。
4. 在跳出的視窗按 `⌘ + Shift + G`，貼上 `~/JJptt/extension`，按 Enter，再按「選擇」。
5. 出現 JJptt 的卡片就成功了。

> **為什麼要打開「開發人員模式」？** JJptt 沒有上架 Chrome 線上應用程式商店。Chrome 只讓你在這個模式下，自己選一個資料夾來安裝擴充功能。打開它不會讓電腦變危險，只是多了「自己安裝」這個選項。

**步驟 5：重開 Chrome**

按 `⌘ + Q` 完全關閉 Chrome，再重新打開。點網址列右邊的拼圖圖示 → 在 JJptt 旁邊按圖釘，以後點工具列上的 JJptt 圖示就能開。

### 方法一：Windows

**步驟 1：安裝 Git**

到 <https://git-scm.com/download/win> 下載安裝，一路按「Next」用預設值就好。

**步驟 2：下載 JJptt**

按 `Windows 鍵`，輸入 `cmd`，打開「命令提示字元」，貼上下面這行按 Enter：

```bat
cd %USERPROFILE% && git clone https://github.com/killnopig/JJptt.git
```

完成後，`C:\Users\你的名字\JJptt` 會多一個資料夾。

**步驟 3：安裝本機小程式**

打開那個 `JJptt` 資料夾 → `native-host` → 雙擊 `install.bat`。

**步驟 4、5：** 跟 Mac 的步驟 4、5 一樣。選資料夾時選 `JJptt` 裡面的 `extension`；重開瀏覽器要把所有視窗都關掉。

### 方法二：下載壓縮檔

1. 到 [Releases](https://github.com/killnopig/JJptt/releases/latest) 下載兩個檔案：`JJptt-extension-版本.zip` 和 `JJptt-native-host-版本.zip`。
2. 兩個都解壓縮（Mac 雙擊檔案；Windows 按右鍵 →「解壓縮全部」）。
3. 安裝本機小程式：
   - Mac：打開「終端機」（見方法一的步驟 1），輸入 `sh `（sh 後面有一個空白），把解壓縮出來的 `native-host` 資料夾裡的 `install.sh` 拖進視窗，按 Enter。
   - Windows：打開解壓縮出來的 `native-host` 資料夾，雙擊 `install.bat`。
4. 把 JJptt 加進 Chrome：照方法一的步驟 4，選資料夾時選解壓縮出來的 `extension` 資料夾。
5. 重開瀏覽器：照方法一的步驟 5。

用這個方法裝的，「立即更新」不能用。有新版時要重新下載、重新做一次。

## 第一次使用

1. 點工具列上的 JJptt 圖示，會開一個新分頁並連上 PTT（預設走加密的 SSH）。
2. 像平常一樣輸入帳號、密碼。想自動登入：在畫面上**按右鍵 → 設定 → 自動登入與其他**。
3. 進看板、開文章就會自動用「閱讀模式」顯示圖片和推文分析。按 `Esc` 回到原本的終端機畫面。
4. 所有功能的開關都在**右鍵 → 設定**；抓網軍相關的在「真.事實查核中心」，每條規則的意思見 [FACT 完整說明](fact.md)。

![設定裡的真.事實查核中心：每條規則都能單獨開關、自己填門檻](images/settings-factcheck.png)

想讓最新的文章排在最上面：設定 → 排版 → 勾「文章列表最新的在上面」。

![文章列表最新的在上面，進板時游標停在最新那篇](images/list-newest.png)

## 怎麼更新

- 有新版時，JJptt 畫面上方會出現提示，按「**立即更新**」就會自動下載並重新開啟。
- 也可以打開設定，按左下角的「**更新 JJptt**」。
- 按鈕不能用的話：Mac 雙擊 `JJptt` 資料夾裡的 `update-jjptt.command`，Windows 雙擊 `update-jjptt.bat`，再回到 JJptt 按「套用更新」。

## 常見問題

**點了 JJptt 圖示，畫面一直連不上**
本機小程式沒裝好，或裝完沒有完全關閉瀏覽器。重新做一次步驟 3，然後 `⌘ + Q`（Windows 關掉所有視窗）再重開。

**排版跑掉、畫面怪怪的**
例如字疊在一起、位置錯開、改了設定畫面沒跟著變：先按重新整理（Mac 按 `⌘ + R`，Windows 按 `F5`）看看有沒有改善。重新整理會重新連線（沒設自動登入的話要再登入一次），設定不會不見。還是不行的話，到 GitHub 回報問題，附上截圖。

**忘記 JJptt 資料夾放在哪裡**
打開 `chrome://extensions` → JJptt 卡片的「詳細資料」→ 往下找「來源」，那個路徑去掉最後的 `/extension` 就是。

**想同步到另一台電腦**
設定 → 同步、備份與更新 → 「連結 Google 帳號」，或「匯出設定檔」再到另一台「從檔案匯入」。帳號密碼不會同步；哪些會跟著搬見 [把設定搬到另一台](settings-file.md)。

**怎麼移除**
在 `chrome://extensions` 移除 JJptt，再移除本機小程式：Mac 在終端機執行 `sh ~/JJptt/native-host/install.sh --uninstall`，Windows 雙擊 `native-host\uninstall.bat`。最後刪掉 `JJptt` 資料夾。

**本機小程式安全嗎**
它只會連到 `ptt.cc` / `ptt2.cc`，只接受 JJptt 擴充功能呼叫；「立即更新」時也只會在 JJptt 資料夾下載 GitHub 上的新版。原始碼在 `native-host/main.go`。

## 為什麼要有閱讀模式

PTT 本身是 80 × 24 字的文字終端機，這個限制讓幾件事在終端機裡做不好：

- **看不到圖**：終端機只能顯示文字，文章裡的圖片、影片、新聞連結都只是一串網址，要一個一個點開，看完再切回來。閱讀模式把它們直接顯示在內文中，往下捲就看完。
- **一次只看得到一頁**：長文章和幾百則推文要一頁一頁翻。閱讀模式把整篇文章放在同一頁，可以順順地捲、隨意跳到任何位置。
- **推文分析需要整篇**：樓層、同 IP 多帳號、與作者同 IP、推文多次的人、罐頭推文這些判斷要看到全部推文才準確。終端機一次只看到一頁，閱讀模式一開就拿到整篇。
- **複製、查證不方便**：在終端機選字會跨到畫面框線和格式字元。閱讀模式可以直接選取、複製，也可以把選取的文字或整篇文章交給 AI 查證。
- **換篇要等**：在終端機看下一篇要等 PTT 一頁一頁送過來。閱讀模式會預先讀取上下幾篇，換篇幾乎不用等。

它刻意保留終端機的字型、顏色和 80 字寬，按鍵也跟 PTT 一樣（↑↓ 捲動、←／Esc 離開、X 推文、y 回文），所以用起來仍然是 PTT，只是多了圖片和整篇閱讀。不想用的話，可以在 設定 → 一般 關掉；PTT 網站（www.ptt.cc）上看不到的看板（例如需要登入才看得到的）會自動留在終端機畫面。

## 流量

- 原本的 PTT 畫面（終端機）很省：只傳文字，看一整天大約幾 MB。
- 閱讀模式比較耗：每篇文章要從 PTT 網站下載，一般 50～300 KB。推文上千則的熱門文章，可能超過 1 MB。
- 圖片和網址預覽，要捲到附近才會下載，每張從幾十 KB 到幾 MB 不等。
- 「預先讀取時連圖片一起下載」預設是打開的：換篇最快，但流量會多很多。預先讀上下 5 篇時，每換一篇，大約會多下載 10 篇文章和它們所有的圖片。取消勾選，就只先讀文字。

用手機熱點，或流量有限時，可以這樣省：

1. 設定 → 一般 → 取消「預先讀取時連圖片一起下載」。
2. 勾「閱讀模式用低解析度圖片」。
3. 把「預先讀取上下幾篇」調成 0 或 1。
4. 還是太多的話，暫時關掉閱讀模式。

## 進階（寫程式的人才需要看，一般使用者可以跳過）

### 網頁版（需要自己架轉接站）

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

把部署出來的 `https://jjptt-relay.<你的子網域>.workers.dev` 填進網頁第一次跳出的輸入框（或設在 `js/app_conn.js` 的 `lib.DEFAULT_RELAY_URL`）。允許使用轉接站的網頁網址設在 `worker/wrangler.toml` 的 `ALLOWED_ORIGINS`。

防濫用限制：每個 IP 每分鐘最多 10 條新連線（`wrangler.toml` 的 `[[ratelimits]]`）；每條連線上傳平時 16 KB/秒、可瞬間衝到 256 KB（`worker/src/index.js` 的 `UPLOAD_*`）。

### 自己 fork 時的 Google 同步設定

JJptt 已經填好自己的 Google 用戶端 ID，一般使用者不用做這段。自己 fork 的人要到 [Google Cloud Console](https://console.cloud.google.com/)：

1. 建立專案，「API 和服務」→「程式庫」→ 啟用 **Google Drive API**。
2. 設定 OAuth 同意畫面（目標對象「外部」，把要用的 Gmail 加進「測試使用者」）。
3. 「用戶端」→「建立用戶端」→「網頁應用程式」：JavaScript 來源 `https://<你的帳號>.github.io`，重新導向 URI `https://<擴充功能 ID>.chromiumapp.org/`。
4. 把用戶端 ID 填進 `js/drive_sync.js` 的 `DriveSync.CLIENT_ID`，再 `npm run build`。
