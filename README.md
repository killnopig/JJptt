# JJptt

**中文** | [English](README.en.md) | [日本語](README.ja.md)

[![Ko-fi](https://img.shields.io/badge/Ko--fi-%E8%AB%8B%E6%88%91%E5%96%9D%E6%9D%AF%E5%92%96%E5%95%A1-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/killnopig)

**在瀏覽器裡上 PTT，順手把帶風向的抓出來。**

- **直連、不經手**：擴充功能版用本機小程式直接連 ptt.cc，不經過任何轉接站，帳號密碼只留在你的電腦。
- **真.事實查核中心**：秒推、脈衝、補血、罐頭推文、同網段、機房／VPN IP、共伴效應、首殺班底——一篇文章底下的協同帶風向痕跡一眼看穿，還能一鍵交給 AI 判讀。
- **閱讀模式**：保留終端機的字型與手感，圖片、影片、新聞卡片直接夾在內文裡，上下篇預先讀好、秒開。
- **推文一目了然**：樓層、國旗、同 IP、推文多次的人各自上色，誰在洗版、誰在接力，不用數。
- **名單隨你管**：黑名單、觀察名單、自訂「網軍」名單，淡化或隱藏、隨時開關；同一網址洗版自動封鎖 24 小時。
- **越用越順手**：最新文章排最上面、Z 搜尋自動帶推文數、選字就能問 AI 是不是事實。
- **設定帶著走**：Google Drive 同步、匯出成檔案；有新版按一下就自動更新、自動重開。

免費、開源（GPL-2.0），不上架、不收集任何資料。

📱 **手機也能用了**：[JJptt Android App](docs/android.md) 正式版已發布，直接連 PTT、不用裝任何東西。

![閱讀模式：保留終端機外觀，圖片直接顯示在內文裡](docs/images/reader.png)

![真.事實查核中心：推文上方的報告，每則推文旁標出秒推、同網段、機房、罐頭等疑點](docs/images/reader-factcheck.png)

<sub>以上為示範畫面，帳號與內容都是虛構的。</sub>

### FACT 真.事實查核中心

**FACT = Facts, Accuracy, Credibility & Truth。** 證據勝於立場：不問立場，只問事實；不分對象，一體查核。

- **同一把尺**：不因政治立場、人物身分或組織背景改變查核標準。
- **公開證據**：每個標記都說得出為什麼（同 IP、機房、秒推…），點開報告就看得到。
- **接受檢驗**：誤判的人可以從自動黑名單移除，每條規則都能自己開關、調門檻。

![FACT 真.事實查核中心：Evidence over opinion，公開透明、標準一致、不偏不倚、證據優先、勇於更正](docs/images/fact.png)

### 流量提醒

- 終端機畫面很省：只傳文字，看一整天大約幾 MB。
- 閱讀模式比較耗：每篇文章要從 PTT 網頁版下載，一般 50～300 KB，推文上千則的爆文可能超過 1 MB；捲到圖片和網址預覽時才會載入，每張圖從幾十 KB 到幾 MB 不等。
- 預先讀取預設連圖片一起下載（設定 → 一般 →「預先讀取時連圖片一起下載」）：換篇最快，但流量會多很多——上下 5 篇時，每換一篇大約多下載 10 篇（一直往同一個方向看時是前進方向 10 篇、回頭 3 篇）的文字和它們的所有圖片；取消勾選就只抓文字。
- 用手機熱點或流量有限時：取消「預先讀取時連圖片一起下載」、勾「閱讀模式用低解析度圖片」、把「預先讀取上下幾篇」調成 0 或 1，或暫時關掉閱讀模式。

<!-- 舊網址的段落連結（安裝教學、常見問題…）跳到這裡：那些內容搬到 docs/desktop.md -->
<a name="安裝教學約-5-分鐘只要做一次"></a><a name="mac"></a><a name="windows"></a><a name="第一次使用"></a><a name="怎麼更新"></a><a name="常見問題"></a><a name="為什麼要有閱讀模式"></a><a name="進階給會寫程式的人"></a><a name="網站版需要自己部署轉接站"></a><a name="自己-fork-時的-google-同步設定"></a><a name="android-app"></a>

## 下載安裝

- **電腦版（Chrome 擴充功能）**：Chrome、Edge、Brave、Arc、Vivaldi，約 5 分鐘裝好 → [電腦版安裝與使用說明](docs/desktop.md)
- **Android App**：直接下載安裝，不用裝其他東西 → [Android App 介紹與下載](docs/android.md)
- **iPhone**：還沒有，[原因和怎麼幫忙](docs/android.md#關於-ios-版)

安裝教學、第一次使用、怎麼更新、常見問題、為什麼要有閱讀模式、進階設定，都搬到了 [電腦版說明](docs/desktop.md)。

## 開發

JJptt fork 自 [iamchucky/PttChrome](https://github.com/iamchucky/PttChrome)（GPL-2.0）。原版要靠已停用的 Chrome App 開 TCP 連線；JJptt 的擴充功能版改用本機小程式直接連線，另外也有網站版，透過自己的 Cloudflare Worker 轉接站（`worker/`）連到 PTT。兩種都預設走 SSH，加密在瀏覽器裡完成。

`dev.html` 直接載入 `js/` 的原始碼；`index.html` 和擴充功能用打包後的 `js/pttchrome.min.js`：

```bash
npm install
npm run build
```

`npm run build` 會打包網站並複製到 `extension/`。發佈新版本：在 `js/changelog.js` 最上面加一筆（版本號、日期、改了什麼），再 `npm run build`，版本號會自動寫進 `package.json`、`extension/manifest.json` 和 `CHANGELOG.md`。

`npm test` 跑自動測試（只要 Node，不用另外裝套件），測試在 `test/run.js`：事實查核的連推規則、臨時黑名單、同網址洗版，以及每條規則在設定頁和中英文說明都有沒有漏掉。

Android App 在 `mobile/`（Capacitor）；在那裡 `npm run build` 會把打包好的網頁複製進 App。每次推到 `mobile` 分支，CI 會自動建置並簽章（`.github/workflows/android.yml`），測試過的版本再手動發成正式版（`.github/workflows/android-stable.yml`）。

本機小程式的原始碼在 `native-host/main.go`，改完用 `sh native-host/build.sh` 重新編譯所有平台的執行檔（需要 Go）。

## 資料來源

IP 國籍資料（`data/geoip-v4.bin`）由 [ip-location-db](https://github.com/sapics/ip-location-db) 的 geo-whois-asn-country 轉換而來，資料授權為 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，來源：[Number Resource Organization (NRO)](https://www.nro.net/)。更新方式見 `tools/build-geoip.js`。

機房／VPN IP 資料（`data/hosting-v4.bin`）由 ip-location-db 的 origin-asn 篩選而來，資料為 [PDDL](https://opendatacommons.org/licenses/pddl/1-0/)（公有領域），來源為各區域網路註冊機構與 Route Views / RIPE RIS 的公開路由資料。更新方式見 `tools/build-hosting.js`。

## 致謝

感謝中正機械 MBA91 几啟成，我的 MUSE。
