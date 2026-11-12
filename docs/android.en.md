# JJptt for Android

[中文](android.md) | **English** | [日本語](android.ja.md)

← [Back to JJptt](../README.en.md)

![JJptt for Android: Read PTT. Catch the astroturfers.](images/android-cover.en.png)

JJptt now has an Android app: download it and it works, nothing else to install. The app connects straight to PTT, with no one else's server in between.

- **FACT**: fast pushes, shared subnets, data-centre IPs… tagged right next to each push, and one tap hands the article to AI; accounts that flood fade out for 24 hours ([how the rules work](fact.en.md)).
- **Push, reply, post**: your push shows up the moment PTT takes it (marked 「剛送出」, "just sent") — no waiting for PTT's web site (www.ptt.cc) to catch up.
- **Easy reading**: images and news cards inside the article; previous / next can float on the left or right edge for one-handed reading; your PTT favourites sync in one tap.
- **Your layout**: text size, line spacing and push style, with a live preview on top; a layout you like becomes a short code (設定 → 版面 →「複製碼」, Settings → Layout → Copy code) to share with friends.
- **Same settings as the Chrome extension**: a settings file exported from the extension imports straight into the app, and the other way round ([how](settings-file.en.md)).
- **Your account stays safe**: the password is locked in the phone's built-in safe (Android Keystore), stays on this phone and is never backed up to the cloud.
- **Ask AI, share, in one tap**: select a passage and ask AI "is this true?", or hand the whole article to ChatGPT, Claude, Perplexity, Grok or Copilot; copy the article's address in one tap, or open it in the browser.

![FACT: five accounts say "so good!" within one minute? We flag it.](images/android-fact.en.png)

<p align="center">
  <img src="images/app-fact.png" width="24%" alt="The FACT report above the pushes">
  <img src="images/app-pushes.png" width="24%" alt="Pushes tagged fast push, shared subnet, data centre">
  <img src="images/app-sent.png" width="24%" alt="Your push shows up at once">
  <img src="images/app-layout.png" width="24%" alt="Layout settings with a live preview">
</p>
<p align="center"><sub>FACT report ｜ what's odd about each push ｜ your push, at once ｜ live layout preview</sub></p>

## Download and update

1. On your phone, open the [JJptt Android release page](https://github.com/killnopig/JJptt/releases/tag/android-stable) and tap `JJptt.apk` (about 10 MB). An APK is the install file for an Android app.
2. Open the downloaded file to install.
   - The first time, Android asks whether to allow installing apps from unknown sources. Choose allow.
   - Why it asks: JJptt isn't on Google Play, and Android always asks once when you install an app from anywhere else.
   - On Android 8 and later, this only allows the app you downloaded with (such as Chrome or Files); it doesn't let other apps install things.
3. New versions: in the app, **設定 → 關於 →「檢查並自動更新」** (Settings → About → Check and update). One tap; settings and login are kept.

To try changes still being tested: 設定 → 關於 → turn on 「**接收測試版**」 (Receive test builds).

Android 7.0 and later. Not on Google Play — install from the release page above.

**Data usage**: reading downloads the images in articles. On mobile data or a limited plan, go to 設定 → 一般 →「閱讀」 (Settings → General → Reading), turn off 「預先讀取時連圖片一起下載」 (download images when loading ahead) and turn on 「用低解析度圖片」 (low-resolution images).

## About an iOS version

Many people have asked for an iPhone version, and I'd love to make one. Most of the code can be reused, but publishing an iOS app requires joining Apple's Developer Program (US$99 a year), and an iPhone to test the direct PTT connection and pushing.

JJptt has always been a free, ad-free side project, and that cost isn't covered yet. If JJptt is useful to you and you'd like to help make the iOS version happen, you're welcome to [buy me a coffee on Ko-fi](https://ko-fi.com/killnopig) — any amount, entirely optional, and no feature depends on it. Once the developer account is covered, I'll start, and share the progress here.

<sub>The articles, accounts and IPs in the promo images are fictional demo data.</sub>
