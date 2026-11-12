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

📱 **Now on your phone too**: the [JJptt Android app](docs/android.en.md) is out — it connects to PTT directly, nothing else to install.

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

## Get JJptt

- **Desktop (Chrome extension)**: Chrome, Edge, Brave, Arc, Vivaldi — about 5 minutes to set up → [Desktop install and use](docs/desktop.en.md)
- **Android app**: download and install, nothing else needed → [The Android app and download](docs/android.en.md)
- **iPhone**: not yet — [why, and how to help](docs/android.en.md#about-an-ios-version)

## Development

JJptt is a fork of [iamchucky/PttChrome](https://github.com/iamchucky/PttChrome) (GPL-2.0). The original opened TCP connections through the discontinued Chrome Apps; JJptt's extension connects through the local helper instead, and there is also a web version that connects to PTT through your own Cloudflare Worker relay (`worker/`). Both use SSH by default, with the encryption done in the browser.

`dev.html` loads the sources in `js/` directly; `index.html` and the extension use the bundled `js/pttchrome.min.js`:

```bash
npm install
npm run build
```

`npm run build` bundles the site and copies it into `extension/`. To release a new version: add an entry at the top of `js/changelog.js` (version, date, what changed), then `npm run build`; the version is written into `package.json`, `extension/manifest.json` and `CHANGELOG.md` automatically.

`npm test` runs the automated tests (Node only, no packages to install), in `test/run.js`: FACT's flood rules, the temporary blacklist, same-URL spam, and checks that every rule appears in the settings page and in the Chinese and English texts.

The Android app is in `mobile/` (Capacitor); `npm run build` there copies the built pages into the app. CI builds and signs it on every push to the `mobile` branch (`.github/workflows/android.yml`), and a tested build is promoted to the stable release by hand (`.github/workflows/android-stable.yml`).

The local helper's source is `native-host/main.go`; after changing it, `sh native-host/build.sh` rebuilds the executables for every platform (needs Go).

## Data sources

The IP country data (`data/geoip-v4.bin`) is converted from geo-whois-asn-country of [ip-location-db](https://github.com/sapics/ip-location-db), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), source: [Number Resource Organization (NRO)](https://www.nro.net/). See `tools/build-geoip.js` to update it.

The data-centre / VPN IP data (`data/hosting-v4.bin`) is filtered from origin-asn of ip-location-db, under [PDDL](https://opendatacommons.org/licenses/pddl/1-0/) (public domain), from the regional internet registries and the public routing data of Route Views / RIPE RIS. See `tools/build-hosting.js` to update it.

## Thanks

Thanks to 中正機械 MBA91 几啟成, my muse.
