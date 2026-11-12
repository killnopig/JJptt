# FACT (真.事實查核中心)

[中文](fact.md) | **English** | [日本語](fact.ja.md)

← [Back to JJptt](../README.en.md)

**FACT = Facts, Accuracy, Credibility & Truth.**

In PTT's comment sections, a group of people sometimes plan to comment together, so that everyone thinks "this is what most people think". That's called steering the thread.

It's hard to spot by eye: a row of near-identical pushes within one minute, several accounts going online from the same place, the commenters coming from a data centre abroad. JJptt puts this **evidence** next to each push.

**The rules look only at behaviour, never at the side someone takes.** (JJptt's screens are in Traditional Chinese; the tag names below are what you see on screen.)

![FACT: Evidence over opinion — transparent, consistent, impartial, evidence first, willing to correct](images/fact.png)

## First, to be clear: a tag is not proof

A tag only means "this behaviour matches a rule". It doesn't mean the account is a paid shill (an account hired or organised to steer threads).

Think of a teacher who finds two homework papers that look alike. That doesn't prove someone copied; maybe the two students just worked on it together. But it's worth a second look.

FACT works the same way: it lays out the evidence and **leaves the call to you**. The more tags one account has, and the more rules hold at once, the more it's worth a look.

## FACT does three things

1. **Find**: each push is tagged with what looks off, and a report sits above the pushes.
2. **Act**: accounts that flood (posting the same thing over and over, pushing everyone else's comments out of view) go on the blacklist for 24 hours, faded or hidden.
3. **Correct**: every entry says why. A mistake is removed in one tap; every rule can be switched off or given your own numbers.

The Chrome extension and the Android app use the same rules.

## Glossary

| Word | Meaning |
|---|---|
| **Push (推文)** | A comment under an article. 推 means for, 噓 (boo) means against, → is just a comment |
| **Floor (樓層)** | The order of pushes. The first push is floor 1, the second floor 2 |
| **Author (原 PO)** | The person who posted the article |
| **Account** | A name on PTT. One person can have several accounts |
| **Steering** | A group posting lots of comments on purpose, so one opinion looks like the majority's |
| **Paid shill (網軍)** | An account hired or organised to steer threads |
| **IP** | Every device online has an IP, like a house number on the internet |
| **Subnet (網段)** | A group of IPs whose first parts are the same, like houses on the same street |
| **Data centre (機房)** | A place full of servers, such as Amazon's or Google's cloud. People at home or on a phone don't go online from one |
| **VPN** | A service that makes you look as if you're online from somewhere else, often used to hide where you really are |
| **Flooding (洗版)** | Posting the same thing again and again, pushing everyone else's comments out of view |
| **Blacklist** | People you'd rather not read; their pushes are faded or hidden |
| **Threshold** | A rule's line, such as "within 2 minutes" or "at least 5 accounts". You can change all of them |

## Principles

- **One ruler**: the same standard whatever someone's politics, identity or group. The rules look at three things only: when someone pushed, what they wrote, and where they went online from.
- **Open evidence**: every tag can say why. Open the report to see which accounts and which numbers.
- **Open to checking**: anyone tagged by mistake can be taken off the automatic blacklist; every rule can be switched on or off with your own numbers; and one tap asks AI to read it all again.
- **Only your own screen**: FACT never reports anyone and never changes what others see on PTT. The history it compares against stays on your own computer or phone.

## 1. Find: tags next to each push

![FACT: a report above the pushes, each push tagged with fast push, shared subnet, data centre, canned text…](images/reader-factcheck.png)

When an article has enough pushes (10 by default), a one-line **FACT report** appears between the article and the pushes; tap it to see the whole report. Its 「AI 分析」 (AI analysis) button hands the article and its pushes to the AI you choose (ChatGPT, Claude, Perplexity, Grok, Copilot or your own).

The numbers below are the defaults; you can change them in the settings.

### Timing: when they pushed

| Tag | What it means | Why it's suspicious |
|---|---|---|
| **秒推** (fast push) | Pushed within 2 minutes of the article being posted. If the article is too long to have been read, it says 「秒推‧沒讀完」 (fast push, not read). The author's own additions don't count | Taking a side before reading it may mean they knew the article was coming and planned to push |
| **脈衝** (burst) | A quiet article suddenly gets a crowd of pushes within a minute or two (at least 6, with 5+ quiet minutes around them), tagged 脈衝1, 脈衝2… Articles that are busy all along don't count | Real interest trickles in. Arriving all at once and leaving all at once looks like someone blew a whistle |
| **補血** (boosting) | Boos outnumber pushes, then comes a long run of very short pushes (15 or more in a row), tagged 「補血?」 | Looks like someone saw the thread turning and brought people in to pull the score back up |
| **門檻推文** (threshold pushes) | The count climbs to about 10 and stops: 10–12 pushes, all within 5 minutes of posting, then nothing for 2+ hours, and the first 10 are pushes of 5 characters or fewer | PTT's article list only shows the count once it reaches about 10, which makes the article stand out. Stopping right there looks like someone "topping it up to the pass mark" |

### Where they went online from

| Tag | What it means | Why it's suspicious |
|---|---|---|
| **機房** (data centre) | The IP belongs to a cloud or VPN provider (34 of them, such as Amazon and Google), tagged 機房:provider. Two or more accounts from the same provider are tagged 同機房:provider and listed on the report's first line | People go online at home or on their phone. Coming from a data centre is often a way to hide where you are, or to run many accounts |
| **同網段** (shared subnet) | 3 or more accounts whose IPs share the first three parts (e.g. all 101.12.34.x) | House numbers that close are like living on one street: maybe the same group |
| **同 IP** (shared IP) | Different accounts pushing from the same IP | The same house number: quite possibly one person switching accounts (or just one school's or company's network) |
| **與作者同 IP** (same IP as the author) | The pusher and the article's author use the same IP | Maybe the author switched accounts to push their own article |

### Content: what they wrote

| Tag | What it means | Why it's suspicious |
|---|---|---|
| **罐頭** (canned) | Within 10 minutes, at least 5 accounts say almost the same thing: 60%+ of the words shared and at least 6 characters in a row identical. Quoting the title or the article, and relay games, don't count. It turns red as 「罐頭A」 only when at least 2 of those accounts are also tagged fast push, burst, boosting, shared subnet or data centre; merely similar wording is grey, 「同梗」 (same meme) | Like everyone pasting from the same script. Many people can also think of the same joke, so it takes other evidence to turn red |

### Across articles: accounts that keep showing up together

These need several articles to tell, so they get better the longer you use JJptt. The history stays on your own device.

| Tag | What it means | Why it's suspicious |
|---|---|---|
| **共伴** (co-occurring) | In the articles where A pushes, B is within 3 floors of A 70%+ of the time; A's push is tagged 共伴:B. A must have appeared in at least 5 articles | Two accounts that always turn up one right after the other, like a team |
| **首殺班底** (first-push squad) | On one author's articles, an account keeps pushing within 2 minutes of posting (at least 3 articles, and more than half of them) | Always racing to be first, like a regular warm-up act for that author |
| **門檻班底** (threshold squad) | The same account is among the first 10 pushes of at least 2 門檻推文 articles, tagged 門檻班底(N篇) | Every time an article gets "topped up to the pass mark", they're there |

## 2. Act: the automatic blacklist

The tags above only point things out. Two behaviours get in the way of everyone's reading, so JJptt **puts the account on the blacklist for 24 hours**:

| Rule | When | For |
|---|---|---|
| **連推** (flooding) | One account pushes too many times in a row in one article (10 or more by default), tagged 連推N. A run interrupted by others still counts if the next push is within 3 floors and 2 minutes. The author replying in their own article doesn't count | 24 hours |
| **Same-URL spam** | One account posts the same URL in more than 3 articles within 24 hours | 24 hours |

Articles titled [公告] (announcement) or [測試] (test), and replies to them, don't count for flooding.

You choose how blacklisted accounts look: **faded** (still visible, default), **hidden**, or **shown as usual** (the blacklist paused, the list kept).

Besides the automatic rules you keep three lists yourself:

- **Blacklist**: people you'd rather not read, faded or hidden.
- **Watchlist**: people you're not sure about yet. Marked next to their pushes, with notes.
- **Custom list**: named by you (say, "shills"); its name is shown next to their pushes.

## 3. Correct: when it gets it wrong

![FACT in the settings: every rule has its own switch and threshold](images/settings-factcheck.png)

- **Every entry is recorded**: the automatic blacklist shows why, the URL, which article, when it was added and how long is left.
- **It ends by itself**: after 24 hours the entry is gone.
- **Remove in one tap**: think it's wrong? Press 「移除」 (remove). Anyone you remove by hand isn't added back by the rules for 24 hours.
- **Make it permanent**: press 「改成永久」 to move the account to your own blacklist.
- **Every rule can be tuned**: switch each rule on or off and set its numbers, or press 「全部開啟／全部關閉」 (all on / all off).
- **Ask AI again**: not sure? Press 「AI 分析」 on the report and let AI read the whole thing.

## Where the settings are

| | Each rule's switch and numbers | Automatic blacklist, lists |
|---|---|---|
| **Chrome extension** | Right-click on the screen → 設定 (Settings) →「真.事實查核中心」→ 自動偵測 (detection) | 名單 (lists), at the top of the same page |
| **Android app** | 設定 →「真.事實查核」 | 設定 →「黑名單」→ 自動黑名單 |

The rules and lists you set up on your computer can be saved as a file and moved to your phone (or the other way round), with no need to set them up again: [Moving your settings](settings-file.en.md).

## Questions

**Why only 24 hours on the automatic blacklist?**
Flooding and spamming are usually a moment's thing. 24 hours clears the screen without hiding someone forever over one mistake. If you really don't want to see them, make it permanent.

**Does it affect anyone else?**
No. FACT changes only your own screen and never reports anyone. An article is sent to the AI you chose only when you press 「AI 分析」 yourself.

**Why do some tags only appear after a while?**
共伴, 首殺班底 and 門檻班底 compare several articles. JJptt notes things down as you read (on your device only).

<sub>Demo screens; articles, accounts and IPs are fictional.</sub>
