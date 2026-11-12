# JJptt

[中文](README.md) | [English](README.en.md) | **日本語**

[![Android アプリをダウンロード](https://img.shields.io/badge/Android-APK%20%E3%83%80%E3%82%A6%E3%83%B3%E3%83%AD%E3%83%BC%E3%83%89-3DDC84?logo=android&logoColor=white)](https://github.com/killnopig/JJptt/releases/tag/android-stable) [![パソコン版](https://img.shields.io/badge/Chrome-%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD-4285F4?logo=googlechrome&logoColor=white)](docs/desktop.ja.md) [![Ko-fi](https://img.shields.io/badge/Ko--fi-%E3%82%B3%E3%83%BC%E3%83%92%E3%83%BC%E3%82%92%E3%81%8A%E3%81%94%E3%82%8B-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/killnopig)

## 誰が世論を誘導している？ JJptt ならひと目でわかる。

[PTT（批踢踢）](https://www.ptt.cc/) は台湾最大の電子掲示板（BBS）で、JJptt はそのクライアントです。1分以内に5つのアカウントが同じ言葉を書き込む、3つのアカウントが同じIP帯から来ている、プッシュのIPが海外のデータセンター——PTTの画面では自分で数えきれないこうした痕跡を、JJptt は各プッシュの横に表示します。

<p align="center">
  <img src="docs/images/android-cover.ja.png" width="49%" alt="JJptt Android：PTTを読みながら、世論誘導を見抜く">
  <img src="docs/images/android-fact.ja.png" width="49%" alt="FACT：1分以内に5人が「本当においしい」？ 表示してお知らせ">
</p>

**無料・広告なし・オープンソース・データ収集なし。** パソコンでも Android スマホでも使えます。（JJptt の画面は繁体字中国語です）

### JJptt を選ぶ理由

| | |
|---|---|
| 🔍 **[世論誘導を見抜く](docs/fact.ja.md)** | FACT（真.事實查核中心）が即プッシュ、急増、水増し、定型文プッシュ、同一サブネット、データセンター／VPNのIP、共起アカウント、初動の常連を自動で表示——数える必要はありません |
| 🤖 **ワンタップでAIに聞く** | 記事全体を ChatGPT、Claude、Perplexity、Grok、Copilot に渡して判定；一部分を選んで「これは事実？」と聞くこともできます |
| 🔒 **直接接続、第三者を介さない** | ptt.cc に直接つなぎ、中継サーバーはなし；IDとパスワードは自分のパソコンかスマホにだけ残ります |
| 📖 **読みやすい** | 画像・動画・ニュースカードを本文の中に表示；前後の記事は先読みしておくので、すぐに開きます |
| 🎨 **プッシュがひと目でわかる** | 階数、国旗、同じIP、何度もプッシュする人を色分け；ブラックリストは薄く表示か非表示、同じURLを貼り回る人は24時間自動ブロック |
| 🔄 **設定を持ち運べる** | パソコン版で書き出した設定をそのままアプリに読み込み；整えたレイアウトは設定コードにして友だちと共有 |

## 📱 Android アプリ

> **Android アプリについて知りたい方へ**：アプリが自分でPTTにつなぐので、ほかに何もインストール不要。プッシュ・返信・投稿ができ、送ったプッシュはすぐ表示。文章の一部や記事全体をワンタップでAIに聞けます。パスワードは Android のキーストアで暗号化。無料、約10MB。
>
> 👉 **[Android アプリの紹介とダウンロード](docs/android.ja.md)**：スクリーンショット、ダウンロードと更新方法、iPhone 版の予定

## 💻 パソコン版（Chrome 拡張機能）

PTTのターミナルのフォントと手触りはそのままに、閲覧モードと FACT を追加。Chrome、Edge、Brave、Arc、Vivaldi で使え、約5分で準備完了です。

![閲覧モード：ターミナルの見た目のまま、画像を本文に表示](docs/images/reader.png)

![FACT：プッシュの上にレポート、各プッシュに即プッシュ・同一サブネット・データセンター・定型文などの疑いを表示](docs/images/reader-factcheck.png)

- **閲覧モード**：画像・動画・ニュースカードを本文の中に表示、次の記事は先読み。
- **使うほど快適**：最新の記事を一番上に、Z検索にプッシュ数を自動入力、文字を選べばAIに聞けます。
- **設定を持ち運べる**：Google Drive で同期、ファイルに書き出し。新しいバージョンはワンクリックで自動更新・自動再起動。

**[パソコン版のインストールと使い方](docs/desktop.ja.md)**

<sub>デモ画面です。記事・アカウント・IPはすべて架空のものです。</sub>

## FACT（真.事實查核中心）

**FACT = Facts, Accuracy, Credibility & Truth.** 立場より証拠：立場ではなく事実を問い、相手を問わず同じように検証します。

- **同じものさし**：政治的立場、人物の身分、組織の背景で検証の基準を変えません。
- **証拠を公開**：どの表示にも理由があります（同じIP、データセンター、即プッシュ…）。レポートを開けば見られます。
- **検証を受け入れる**：誤判定された人は自動ブラックリストから外せます。どのルールもオン／オフやしきい値を自分で設定できます。

![FACT：Evidence over opinion ——透明・一貫・公平・証拠優先・訂正を恐れない](docs/images/fact.png)

👉 **[FACT の詳しい説明](docs/fact.ja.md)**：検出ルールと初期しきい値、自動ブラックリスト（連投・同じURLの荒らし）、誤判定の取り消し方

## データ通信量について

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
