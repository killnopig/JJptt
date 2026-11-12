# Moving your settings: computer ↔ phone, or a new phone

[中文](settings-file.md) | **English** | [日本語](settings-file.ja.md)

← [Back to JJptt](../README.en.md)

The blacklist and FACT rules you set up on your computer can be saved as a file and opened on your phone, so you don't have to set them up again one by one. The same works for a new phone or a new computer. (JJptt's screens are in Traditional Chinese; button names are given as they appear, with a translation.)

## What can I move, and where to?

Everything, in every direction. It's the same kind of file, so a file saved on one side opens on the other.

| From | To | Works? | When you'd do it |
|---|---|---|---|
| Chrome extension on a computer | Android app | ✅ Yes | You set up the blacklist and FACT rules on the computer and want the phone to match |
| Android app | Chrome extension on a computer | ✅ Yes | You added lots of people to the blacklist on the phone and want the computer to match |
| Chrome extension | Chrome extension on another computer | ✅ Yes | A new computer, or one at home and one at work |
| Android app | Android app on another phone | ✅ Yes | A new phone |

## Can I keep my own backup?

Yes. Save a file with the same 「匯出設定檔」 (Export settings) button and keep it in Google Drive, or send it to yourself on LINE. That's your backup.

Later, if you reinstall your computer, lose your phone or mess up your settings, press 「從檔案匯入…」 (Import from file) in the same place (on the phone, 「選擇設定檔匯入」) and pick that file. Everything goes back to how it was when you saved it.

**What the backup keeps** (it all comes back when you restore):

- Your blacklist, watchlist, custom list, and the notes you wrote about accounts
- Title keywords you don't want to see
- People the rules put on the blacklist automatically, and how long until they come off
- Every FACT rule: on or off, and any numbers you changed
- Reading settings, such as keeping one person's pushes together, hiding pinned posts, showing countries
- The AI service you chose for AI analysis, and your own prompt
- Your saved quick searches

**What the backup doesn't keep** (take care of these separately):

- **Your PTT ID and password**: just log in again.
- **The phone's layout** (text size, line spacing, push style): press 「複製碼」 (Copy code) and keep the code in a note; to restore, press 「貼上碼」 (Paste code).
- **The boards on the phone's home screen**: after logging in, press 「同步」 (Sync) on the home screen; they come back from your PTT 「我的最愛」 (favourites).
- **The history behind the 共伴, 首殺班底 and 門檻班底 tags**: they come back after you've read articles for a while.
- **Drafts you haven't sent yet.**

Tips:
- **Save a copy after a big round of changes**, say after adding many people to the blacklist or changing many FACT rules.
- **The file name has the date** (like `jjptt-settings-20261113.json`); keeping the latest one or two is enough.
- **Save the phone's layout too**: it isn't in the backup, so also press 「複製碼」 and keep the code.

## How to move them (three steps)

1. **Save a file on the old one**
   - Computer (Chrome extension): right-click on the screen → 設定 (Settings) →「同步、備份與更新」(Sync, backup and update) → press 「匯出設定檔」 (Export settings).
   - Android app: 設定 (Settings) → 一般 (General) → find 「同步」 (Sync) → press 「匯出設定檔」 (Export settings) and choose where to save it (Google Drive, or LINE to yourself).
2. **Get the file to the new one**: send it to yourself on LINE, put it in Google Drive, or email it to yourself. The file is named like `jjptt-settings-20261113.json`.
3. **Open the file on the new one**
   - Computer: in the same place, press 「從檔案匯入…」 (Import from file) and pick the file.
   - Android app: in the same place, press 「選擇設定檔匯入」 (Choose a settings file) and pick the file.

The Chrome extension can also 「連結 Google 帳號」 (link a Google account); after that, all your computers stay the same by themselves, with no files to send.

## What comes along

- **Your lists**: blacklist, watchlist, custom list, your notes about accounts, and title keywords you don't want to see.
- **Every FACT rule**: which are on, which are off, and any numbers you changed (for example, how many minutes still count as a fast push).
- **People put on the blacklist automatically**: with the reason, and how long until they come off.
- **How you like to read**: for example, keeping one person's pushes together, hiding pinned posts, showing countries next to pushes.
- **AI analysis**: whether you chose ChatGPT, Claude or another one, and your own prompt.
- **Search**: your saved quick searches.

## What doesn't come along, and what to do on the new one

| What | Why it isn't moved | What to do |
|---|---|---|
| **Your PTT ID and password** | For safety, the password is never put in the file | Log in once on the new one |
| **The app's layout** (text size, line spacing, push style) | This is shared with a code instead | Old phone: 設定 → 版面 (Layout) → press 「複製碼」 (Copy code) and send it over; new phone: same page, press 「貼上碼」 (Paste code) |
| **The boards on the app's home screen** | This list already lives in your PTT account | After logging in, press 「同步」 (Sync) on the home screen; they come back from your PTT 「我的最愛」 |
| **The 共伴, 首殺班底 and 門檻班底 tags** | These need many articles to compare; they were noted down bit by bit as you read on the old one | Read on the new one for a while and they'll start to appear |
| **Drafts you haven't sent** | They're only on the old phone | Send them or copy them out on the old phone first |

## Before you open a file

- **The new one ends up exactly like the file.** Say you've already added a few people to the blacklist on the new phone, but they aren't in the file: after you open the file, they're no longer on the blacklist. So **save from the one with the most complete lists** and move that to the others.
- **It asks you first**; nothing changes until you press OK.
- **Old files still work**: rules added to JJptt later aren't in an old file, so they keep your current settings and aren't wiped.
- **Picked the wrong file? No harm**: a file that isn't from JJptt just shows a message, and your settings stay as they are.
- **Think before you send it to a friend**: there's no password in it, but your blacklist and notes are, and your friend will see them.
