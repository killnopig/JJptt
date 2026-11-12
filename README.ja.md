# JJptt

[中文](README.md) | [English](README.en.md) | **日本語**

[![Ko-fi](https://img.shields.io/badge/Ko--fi-%E3%82%B3%E3%83%BC%E3%83%92%E3%83%BC%E3%82%92%E3%81%8A%E3%81%94%E3%82%8B-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/killnopig)

**ブラウザでPTTを読みながら、世論誘導を見抜く。**

[PTT（批踢踢）](https://www.ptt.cc/) は台湾最大の電子掲示板（BBS）です。JJptt はそのクライアントです。

- **直接接続、第三者を介さない**：拡張機能版はローカルの小さなヘルパープログラムで ptt.cc に直接つなぎます。中継サーバーはなく、IDとパスワードはあなたのパソコンにだけ残ります。
- **FACT（真.事實查核中心）**：即プッシュ、急増、水増し、定型文プッシュ、同一サブネット、データセンター／VPNのIP、共起アカウント、初動の常連——記事の下にある組織的な世論誘導の痕跡がひと目でわかり、ワンクリックでAIに判定させることもできます。
- **閲覧モード**：ターミナルのフォントと手触りはそのまま、画像・動画・ニュースカードを本文の中に表示。前後の記事は先読みしておくので、すぐに開きます。
- **プッシュがひと目でわかる**：階数、国旗、同じIP、何度もプッシュする人を色分け。誰が荒らしで誰がリレーしているか、数える必要はありません。
- **リストは自由に管理**：ブラックリスト、ウォッチリスト、自分で作る「工作員」リスト。薄く表示・非表示をいつでも切り替え。同じURLを貼り回る人は24時間自動でブロックします。
- **使うほど快適**：最新の記事を一番上に、Z検索にプッシュ数を自動入力、文字を選べばAIに事実かどうか聞けます。
- **設定を持ち運べる**：Google Drive で同期、ファイルに書き出し。新しいバージョンはワンクリックで自動更新・自動再起動。

無料・オープンソース（GPL-2.0）。ストアには出しておらず、データは一切収集しません。

📱 **スマホでも使えます**：[JJptt Android アプリ](docs/android.ja.md) の正式版を公開しました。PTTに直接つながり、ほかに何もインストール不要です。

![閲覧モード：ターミナルの見た目のまま、画像を本文に表示](docs/images/reader.png)

![FACT：プッシュの上にレポート、各プッシュに即プッシュ・同一サブネット・データセンター・定型文などの疑いを表示](docs/images/reader-factcheck.png)

<sub>デモ画面です。アカウントと内容は架空のものです。JJptt の画面は繁体字中国語です。</sub>

### FACT（真.事實查核中心）

**FACT = Facts, Accuracy, Credibility & Truth.** 立場より証拠：立場ではなく事実を問い、相手を問わず同じように検証します。

- **同じものさし**：政治的立場、人物の身分、組織の背景で検証の基準を変えません。
- **証拠を公開**：どの表示にも理由があります（同じIP、データセンター、即プッシュ…）。レポートを開けば見られます。
- **検証を受け入れる**：誤判定された人は自動ブラックリストから外せます。どのルールもオン／オフやしきい値を自分で設定できます。

![FACT：Evidence over opinion ——透明・一貫・公平・証拠優先・訂正を恐れない](docs/images/fact.png)

### データ通信量について

- ターミナル画面はとても軽く、文字だけなので一日見ても数MB程度です。
- 閲覧モードは多めです：記事ごとにPTTのウェブ版からダウンロードし、通常50〜300KB、プッシュが千件を超える記事は1MBを超えることもあります。画像やリンクのプレビューはスクロールして近づいたときに読み込み、1枚あたり数十KB〜数MBです。
- 先読みは初期設定で画像も含みます（設定 → 一般 →「預先讀取時連圖片一起下載」＝先読み時に画像も一緒にダウンロード）。記事の切り替えは最速ですが、通信量はかなり増えます。前後5本の場合、1本切り替えるごとに約10本分（同じ方向に読み進めると前方10本・後方3本）の本文とその画像をすべてダウンロードします。チェックを外すと本文だけになります。
- テザリングや通信量に制限があるとき：上の項目のチェックを外す、「閱讀模式用低解析度圖片」（閲覧モードで低解像度の画像）にチェック、「預先讀取上下幾篇」（前後何本を先読み）を0か1にする、または閲覧モードを一時的にオフにしてください。

## ダウンロード

- **パソコン版（Chrome 拡張機能）**：Chrome、Edge、Brave、Arc、Vivaldi、約5分で準備完了 → [パソコン版のインストールと使い方](docs/desktop.ja.md)
- **Android アプリ**：ダウンロードしてインストールするだけ → [Android アプリの紹介とダウンロード](docs/android.ja.md)
- **iPhone**：まだありません——[理由と応援のしかた](docs/android.ja.md#ios-版について)

## 開発

JJptt は [iamchucky/PttChrome](https://github.com/iamchucky/PttChrome)（GPL-2.0）のフォークです。元のバージョンは提供終了した Chrome アプリで TCP 接続を開いていましたが、JJptt の拡張機能版はローカルヘルパーで直接接続します。ほかに、自分の Cloudflare Worker 中継サーバー（`worker/`）経由でPTTにつなぐウェブ版もあります。どちらも初期設定は SSH で、暗号化はブラウザの中で行います。

`dev.html` は `js/` のソースを直接読み込みます。`index.html` と拡張機能はまとめた `js/pttchrome.min.js` を使います：

```bash
npm install
npm run build
```

`npm run build` でサイトをまとめて `extension/` にコピーします。新しいバージョンを出すには：`js/changelog.js` の先頭に1件追加（バージョン、日付、変更内容）してから `npm run build`。バージョンは `package.json`、`extension/manifest.json`、`CHANGELOG.md` に自動で書き込まれます。

`npm test` で自動テストを実行します（Node だけで、追加のパッケージは不要）。テストは `test/run.js` にあり、FACT の連続プッシュのルール、一時ブラックリスト、同じURLの荒らし、そして各ルールが設定ページと中国語・英語の説明に漏れなくあるかを確認します。

Android アプリは `mobile/`（Capacitor）にあり、そこで `npm run build` するとまとめたページをアプリにコピーします。`mobile` ブランチに push するたびに CI が自動でビルドと署名を行い（`.github/workflows/android.yml`）、テスト済みのものを手動で正式版にします（`.github/workflows/android-stable.yml`）。

ローカルヘルパーのソースは `native-host/main.go` です。変更したら `sh native-host/build.sh` で全プラットフォームの実行ファイルを作り直します（Go が必要）。

## データの出典

IPの国データ（`data/geoip-v4.bin`）は [ip-location-db](https://github.com/sapics/ip-location-db) の geo-whois-asn-country を変換したもので、ライセンスは [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)、出典：[Number Resource Organization (NRO)](https://www.nro.net/)。更新方法は `tools/build-geoip.js` を参照してください。

データセンター／VPNのIPデータ（`data/hosting-v4.bin`）は ip-location-db の origin-asn から抽出したもので、[PDDL](https://opendatacommons.org/licenses/pddl/1-0/)（パブリックドメイン）、出典は各地域インターネットレジストリと Route Views / RIPE RIS の公開ルーティングデータです。更新方法は `tools/build-hosting.js` を参照してください。

## 謝辞

中正機械 MBA91 几啟成、わたしのミューズに感謝します。
