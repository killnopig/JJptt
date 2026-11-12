// JJptt 真.事實查核中心: signs of coordinated pushing in one article.
//
// Everything here is a hint ("疑似"), never proof. PTT push times only have
// minutes, so "seconds after posting" means "in the same or next minutes".
//
// Phase 1 works on one article only:
//   fast    秒推: pushes within N minutes of the post time (worse when the
//           article is too long to have been read by then)
//   burst   脈衝: many pushes in one or two minutes after a quiet stretch
//   boost   補血: a long run of short 推 right after 噓 had the upper hand
//   canned  罐頭: different accounts posting near-identical sentences
//   subnet  同網段: different accounts from the same /24 IP block
// Phase 2 adds what needs several articles (FactHistory below).
function FactCheck(app) {
  this.app = app;
  this.history = new FactHistory();
  if (typeof HostingIp !== 'undefined') HostingIp.load();
}

FactCheck.DEFAULTS = {
  factFastPush: true, factFastMinutes: 2,
  factBurst: true, factBurstMin: 6, factQuietMin: 5,
  factBoost: true, factBoostRun: 15,
  factCanned: true, factCannedMin: 5, factCannedSim: 60, factCannedPhrase: 6, factCannedWindow: 10,
  factSubnet: true, factSubnetMin: 3,
  factCooccur: true, factCooccurRate: 70, factCooccurMin: 5,
  factSquad: true, factSquadMin: 3,
  factHosting: true,
  factFloodRun: true, factFloodRunMin: 10,
  factFloodRunChain: true, factFloodRunSkipAuthor: true, factFloodRunKeepRemoved: true,
  factTask: true, factTaskMin: 10, factTaskMax: 12, factTaskWindow: 5, factTaskQuietHours: 2, factTaskShort: 5,
  factTaskSquad: true, factTaskSquadMin: 2
};

FactCheck.prototype.opt = function(name) {
  var v = this.app.pref && this.app.pref.values;
  var val = v && name in v ? v[name] : FactCheck.DEFAULTS[name];
  if (typeof FactCheck.DEFAULTS[name] === 'number') {
    var n = parseInt(val, 10);
    return isNaN(n) ? FactCheck.DEFAULTS[name] : n;
  }
  return val !== false;
};

// "Wed Nov 11 21:49:32 2026" -> ms
FactCheck.postTime = function(meta) {
  var t = Date.parse(String((meta && meta['時間']) || '').trim());
  return isNaN(t) ? 0 : t;
};

// "11/12 10:02" -> ms (start of that minute), year taken from the post
FactCheck.pushTime = function(text, post) {
  var m = /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(text || '');
  if (!m || !post) return 0;
  var year = new Date(post).getFullYear();
  var t = new Date(year, +m[1] - 1, +m[2], +m[3], +m[4]).getTime();
  if (t < post - 180 * 86400000) t = new Date(year + 1, +m[1] - 1, +m[2], +m[3], +m[4]).getTime();
  return t;
};

// "11/12 10:02" -> a number of minutes (good enough to compare nearby pushes)
FactCheck.pushMinute = function(p) {
  var m = /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec((p && p.time) || '');
  if (!m) return null;
  return ((Number(m[1]) * 31 + Number(m[2])) * 24 + Number(m[3])) * 60 + Number(m[4]);
};

// Splits push indices (in floor order) into runs, one person each: a push
// joins the person's run when it comes within 3 floors and 2 minutes of the
// run's last push, even if others cut in. Used by 連推 (fact check) and by
// 連續推文排在一起 (reader), so both see the same runs.
FactCheck.chains = function(indices, pushes) {
  var placed = {}, out = [];
  for (var j = 0; j < indices.length; ++j) {
    var first = indices[j];
    if (placed[first]) continue;
    placed[first] = true;
    var chain = [first];
    var id = String(pushes[first].id).toLowerCase();
    var lastPos = j, lastT = FactCheck.pushMinute(pushes[first]);
    for (var k = j + 1; k < indices.length && k <= lastPos + 3; ++k) {
      var c = indices[k];
      if (placed[c] || String(pushes[c].id).toLowerCase() !== id) continue;
      var t = FactCheck.pushMinute(pushes[c]);
      if (lastT !== null && t !== null && t - lastT > 2) continue;
      placed[c] = true;
      chain.push(c);
      lastPos = k;
      lastT = t;
    }
    out.push(chain);
  }
  return out;
};

// Push indices split where other lines ("※ 編輯" ...) come between pushes
// (push.block, set when the article is loaded; all one block without it).
// 連推 does not count in [公告] / [測試] articles (also "Re: [公告] ..."):
// announcements and test posts are where people chat or try things out.
FactCheck.floodRunExempt = function(title) {
  return /^\s*(?:(?:Re|Fw):\s*)?\[\s*(?:公告|測試)\s*\]/i.test(String(title || ''));
};

FactCheck.blocks = function(pushes) {
  var out = [], last;
  for (var i = 0; i < pushes.length; ++i) {
    var b = pushes[i].block;
    if (!out.length || b !== last) out.push([]);
    out[out.length - 1].push(i);
    last = b;
  }
  return out;
};

FactCheck.bodyChars = function(text) {
  var body = String(text || '').split(/\n※ 發信站|\n--\n/)[0];
  return body.replace(/\s+/g, '').length;
};

FactCheck.normalize = function(s) {
  return String(s || '').toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\s　.,!?;:'"()\[\]{}<>~`@#$%^&*_\-+=|\\\/，。！？；：、「」『』（）【】《》～…—]+/g, '');
};

FactCheck.sharePhrase = function(a, b, len) {
  if (a.length > b.length) { var t = a; a = b; b = t; }
  for (var i = 0; i + len <= a.length; ++i) {
    if (b.indexOf(a.substr(i, len)) >= 0) return true;
  }
  return false;
};

// remove every run of 4+ characters that also appears in `source`
FactCheck.stripQuoted = function(s, source) {
  if (!source) return s;
  var out = '', i = 0;
  while (i < s.length) {
    var len = 0;
    while (i + len < s.length && source.indexOf(s.substr(i, len + 1)) >= 0) len++;
    if (len >= 4) { i += len; continue; }
    out += s.charAt(i);
    i++;
  }
  return out;
};

FactCheck.bigrams = function(s) {
  var set = {};
  for (var i = 0; i + 1 < s.length; ++i) set[s.substr(i, 2)] = true;
  return set;
};

// Main entry: tags[i] is a list of {t: text, lvl: 'warn'|'note'} for push i,
// report lists what was found for the box at the top of the pushes.
FactCheck.prototype.analyze = function(article) {
  var pushes = (article && article.pushes) || [];
  var n = pushes.length;
  var tags = [];
  var i, j;
  for (i = 0; i < n; ++i) tags.push([]);
  var report = [];
  var add = function(k, t, lvl) {
    for (var x = 0; x < tags[k].length; ++x) if (tags[k][x].t === t) return;
    tags[k].push({ t: t, lvl: lvl || 'warn' });
  };
  if (!n) return { tags: tags, report: report };

  var post = FactCheck.postTime(article.meta);
  var times = pushes.map(function(p) { return FactCheck.pushTime(p.time, post); });
  var ids = pushes.map(function(p) { return String(p.id || '').toLowerCase(); });

  var authorId = String((article.meta && article.meta['作者']) || '').split(' ')[0].toLowerCase();
  var postMinute = post ? Math.floor(post / 60000) * 60000 : 0;

  // 1. 秒推 / 黃金 3 分鐘定調部隊. Not the author (補充 right after posting is
  //    normal). Worked out even with the rule off: 首殺班底 and the history
  //    need it, the switch only hides the tags.
  this.lastFastIds = {};
  if (post) {
    var showFast = this.opt('factFastPush');
    var limit = this.opt('factFastMinutes');
    var chars = FactCheck.bodyChars(article.text);
    var readMin = chars / 500;  // about 500 Chinese characters a minute
    var fastIds = {};
    for (i = 0; i < n; ++i) {
      if (!times[i] || ids[i] === authorId) continue;
      var mins = (times[i] - postMinute) / 60000;
      if (mins < 0 || mins > limit) continue;
      var tooFast = readMin > Math.max(1, mins + 1);  // could not have read it yet
      if (showFast) add(i, tooFast ? '秒推‧沒讀完' : '秒推', tooFast ? 'warn' : 'note');
      fastIds[ids[i]] = true;
    }
    var fastCount = Object.keys(fastIds).length;
    if (showFast && fastCount) {
      report.push('秒推：發文 ' + limit + ' 分鐘內 ' + fastCount + ' 人推文' +
                  (readMin > 2 ? '（內文約 ' + chars + ' 字，正常要讀 ' + Math.round(readMin) + ' 分鐘）' : ''));
    }
    this.lastFastIds = fastIds;
  }

  // 2. 脈衝式群聚: many pushes in a minute or two, right after a quiet
  //    stretch -- or followed by one, when it was quiet before too (a busy
  //    thread that just stops is not a wave). Before the first push the
  //    quiet runs from the post time; after the last one, up to now.
  if (this.opt('factBurst')) {
    var burstMin = this.opt('factBurstMin'), quiet = this.opt('factQuietMin');
    var byMinute = {}, minutes = [];
    for (i = 0; i < n; ++i) {
      if (!times[i]) continue;
      if (!byMinute[times[i]]) { byMinute[times[i]] = []; minutes.push(times[i]); }
      byMinute[times[i]].push(i);
    }
    minutes.sort(function(a, b) { return a - b; });
    var wave = 0;
    for (j = 0; j < minutes.length; ++j) {
      // a wave is one minute, or two back-to-back minutes
      var group = byMinute[minutes[j]].slice();
      var end = j;
      if (j + 1 < minutes.length && minutes[j + 1] - minutes[j] === 60000) {
        group = group.concat(byMinute[minutes[j + 1]]);
        end = j + 1;
      }
      if (group.length < burstMin) continue;
      var first = j === 0, last = end + 1 >= minutes.length;
      // minutes with nobody pushing just before / after
      var before = !first ? (minutes[j] - minutes[j - 1]) / 60000 - 1 :
                   postMinute ? (minutes[j] - postMinute) / 60000 : 0;
      var after = !last ? (minutes[end + 1] - minutes[end]) / 60000 - 1 :
                  Math.floor((Date.now() - minutes[end]) / 60000) - 1;
      // how many pushes in the `quiet` minutes before the wave
      var prior = 0;
      for (var pk = j - 1; pk >= 0 && minutes[j] - minutes[pk] <= quiet * 60000; --pk) prior += byMinute[minutes[pk]].length;
      var quietBefore = before >= quiet;
      var quietAfter = after >= quiet && prior < burstMin / 2;
      if (!quietBefore && !quietAfter) continue;  // just a busy thread
      wave++;
      for (var g = 0; g < group.length; ++g) add(group[g], '脈衝' + wave, 'warn');
      var d = new Date(minutes[j]);
      report.push('脈衝 ' + wave + '：' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2) +
                  ' 起 ' + (end > j ? 2 : 1) + ' 分鐘內湧入 ' + group.length + ' 則' +
                  (quietBefore ? (first ? '，發文後 ' + Math.round(before) + ' 分鐘都沒人推' : '，之前 ' + Math.round(before) + ' 分鐘沒人推') : '') +
                  (after >= quiet ? (last ? '，之後到現在沒人推' : '，之後 ' + Math.round(after) + ' 分鐘沒人推') : ''));
      j = end;
    }
  }

  // 3. 補血: 噓 ahead, then a long run of short 推
  if (this.opt('factBoost')) {
    var run = this.opt('factBoostRun');
    var start = -1;
    for (i = 0; i <= n; ++i) {
      var isPush = i < n && pushes[i].tag === '推';
      if (isPush && start < 0) start = i;
      if (isPush) continue;
      if (start >= 0 && i - start >= run) {
        var from = Math.max(0, start - 30);
        var boo = 0, up = 0;
        for (j = from; j < start; ++j) {
          if (pushes[j].tag === '噓') boo++;
          else if (pushes[j].tag === '推') up++;
        }
        var short = 0;
        for (j = start; j < i; ++j) if (FactCheck.normalize(pushes[j].content).length <= 6) short++;
        if (start - from >= 10 && boo >= up && short >= (i - start) * 0.7) {
          for (j = start; j < i; ++j) add(j, '補血?', 'warn');
          report.push('疑似補血：第 ' + (start + 1) + '～' + i + ' 樓連續 ' + (i - start) + ' 則純推（多半很短），前面 ' +
                      (start - from) + ' 則裡噓 ' + boo + '、推 ' + up);
        }
      }
      start = -1;
    }
  }

  // 4. 罐頭推文: near-identical sentences from different accounts
  var cannedGroups = [];
  if (this.opt('factCanned')) {
    var minAcc = this.opt('factCannedMin');
    var simMin = this.opt('factCannedSim') / 100, phraseMin = Math.max(2, this.opt('factCannedPhrase'));
    var windowMs = this.opt('factCannedWindow') * 60000;
    // people quote the title and the article: wording from there is not
    // a sign of coordination, so it is left out of the comparison
    var source = FactCheck.normalize((article.meta && article.meta['標題'] || '') + ' ' +
                                     String(article.text || '').split(/\n※ 發信站/)[0]);
    var sourceGrams = FactCheck.bigrams(source);
    var grams = [], index = {}, texts = [];
    for (i = 0; i < n; ++i) {
      var s = FactCheck.stripQuoted(FactCheck.normalize(pushes[i].content), source);
      texts.push(s);
      var gs = s.length >= 6 ? FactCheck.bigrams(s) : null;
      if (gs) {
        for (var sg in sourceGrams) delete gs[sg];
        if (Object.keys(gs).length < 4) gs = null;
      }
      grams.push(gs);
      if (!grams[i]) continue;
      for (var gk in grams[i]) (index[gk] = index[gk] || []).push(i);
    }
    var parent = [];
    for (i = 0; i < n; ++i) parent.push(i);
    var find = function(x) { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
    for (i = 0; i < n; ++i) {
      if (!grams[i]) continue;
      var size = Object.keys(grams[i]).length;
      var shared = {};
      for (var key in grams[i]) {
        var list = index[key];
        if (list.length > 200) continue;  // very common pair of characters
        for (var q = 0; q < list.length; ++q) if (list[q] > i) shared[list[q]] = (shared[list[q]] || 0) + 1;
      }
      for (var other in shared) {
        var o = +other;
        if (ids[o] === ids[i]) continue;
        var osize = Object.keys(grams[o]).length;
        // reworded slogans ("某黨自導自演" in different sentences): many
        // shared character pairs and one shared phrase of 4+ characters
        var overlap = shared[other] / Math.min(size, osize);
        if (overlap >= simMin && FactCheck.sharePhrase(texts[i], texts[o], phraseMin)) parent[find(o)] = find(i);
      }
    }
    var groups = {};
    for (i = 0; i < n; ++i) if (grams[i]) (groups[find(i)] = groups[find(i)] || []).push(i);
    var countAcc = function(list) {
      var a = {};
      list.forEach(function(k) { a[ids[k]] = true; });
      return Object.keys(a).length;
    };
    for (var root in groups) {
      // 接龍: the same line copied floor after floor is PTT culture
      var members = groups[root].filter(function(k) {
        return !(texts[k] && (texts[k - 1] === texts[k] || texts[k + 1] === texts[k]));
      });
      if (countAcc(members) < minAcc) continue;
      // a meme spreads over the whole thread; a canned batch arrives together:
      // keep the busiest stretch of `windowMs`
      var best = [];
      if (windowMs > 0) {
        var byTime = members.filter(function(k) { return times[k]; }).sort(function(x, y) { return times[x] - times[y]; });
        var lo = 0;
        for (var hi = 0; hi < byTime.length; ++hi) {
          while (times[byTime[hi]] - times[byTime[lo]] > windowMs) lo++;
          var win = byTime.slice(lo, hi + 1);
          if (countAcc(win) > countAcc(best)) best = win;
        }
      } else {
        best = members;
      }
      cannedGroups.push({ all: members, batch: countAcc(best) >= minAcc ? best.sort(function(x, y) { return x - y; }) : [] });
    }
  }

  // 5. 同網段: same /24, different accounts and different addresses
  if (this.opt('factSubnet')) {
    var minSub = this.opt('factSubnetMin');
    var nets = {};
    for (i = 0; i < n; ++i) {
      var ip = pushes[i].ip;
      if (!ip) continue;
      var net = ip.split('.').slice(0, 3).join('.');
      var e = (nets[net] = nets[net] || { ids: {}, ips: {}, rows: [] });
      e.ids[ids[i]] = true;
      e.ips[ip] = true;
      e.rows.push(i);
    }
    for (var nk in nets) {
      var ent = nets[nk];
      var accN = Object.keys(ent.ids).length;
      if (accN < minSub || Object.keys(ent.ips).length < 2) continue;
      ent.rows.forEach(function(k) { add(k, '同網段', 'warn'); });
      report.push('同網段：' + accN + ' 個帳號來自 ' + nk + '.x（' + Object.keys(ent.ids).slice(0, 5).join('、') +
                  (accN > 5 ? '…' : '') + '）');
    }
  }

  // 6. 門檻推文: pushed just past the list's push-count threshold (~10) right after posting, then nobody,
  //    and the first 10 are bare short 推
  //    (worked out with the rule off too: 門檻班底 and the history need it)
  this.lastTaskIds = null;
  var showTask = this.opt('factTask');
  if (post) {
    var tMin = this.opt('factTaskMin'), tMax = this.opt('factTaskMax');
    var win = this.opt('factTaskWindow') * 60000, quietMs = this.opt('factTaskQuietHours') * 3600000;
    var shortLen = this.opt('factTaskShort');
    var lastT = 0, allIn = n > 0;
    for (i = 0; i < n; ++i) {
      if (!times[i]) { allIn = false; break; }
      if (times[i] - Math.floor(post / 60000) * 60000 > win) allIn = false;
      if (times[i] > lastT) lastT = times[i];
    }
    var head = pushes.slice(0, Math.min(10, n));
    var pure = head.every(function(p) { return p.tag === '推' && FactCheck.normalize(p.content).length <= shortLen; });
    if (n >= tMin && n <= tMax && allIn && pure && Date.now() - lastT >= quietMs) {
      this.lastTaskIds = {};
      for (i = 0; i < head.length; ++i) {
        if (showTask) add(i, '門檻推文', 'warn');
        this.lastTaskIds[ids[i]] = true;
      }
      if (showTask) report.push('疑似門檻推文：推文剛好衝到 ' + n + ' 推（過了列表顯示推文數的門檻）就停，全部在發文 ' + this.opt('factTaskWindow') + ' 分鐘內，之後 ' +
                  Math.floor((Date.now() - lastT) / 3600000) + ' 小時以上沒人推；前 ' + head.length + ' 推都是 ' + shortLen + ' 字以內的純推');
    }
  }

  // 7. 連續推文洗版: one account with a long run of pushes goes on the
  //    24-hour blacklist (deferred: this runs while the article draws).
  //    Each can be turned off: runs count the way 連續推文排在一起 groups them
  //    (others may cut in for up to 2 floors, within 2 minutes) instead of
  //    strictly unbroken; the author replying in their own article doesn't
  //    count; nobody the user took off the blacklist is put back within 24 h.
  //    Not in [公告] / [測試] articles: people chat or try things out there.
  if (this.opt('factFloodRun') && !FactCheck.floodRunExempt(article.meta && article.meta['標題'])) {
    var floodMin = this.opt('factFloodRunMin');
    var self7 = this, flooders = {};
    var useChain7 = this.opt('factFloodRunChain'), keep7 = this.opt('factFloodRunKeepRemoved');
    var authorId7 = this.opt('factFloodRunSkipAuthor') ?
        String((article.meta && article.meta['作者']) || '').split(' ')[0].toLowerCase() : '';
    var runs7 = [];
    if (useChain7) {
      FactCheck.blocks(pushes).forEach(function(b) { runs7 = runs7.concat(FactCheck.chains(b, pushes)); });
    } else {
      for (i = 0; i < n; ++i) {  // strictly unbroken runs
        if (i && ids[i] === ids[i - 1] && pushes[i].block === pushes[i - 1].block) runs7[runs7.length - 1].push(i);
        else runs7.push([i]);
      }
    }
    runs7.forEach(function(ch) {
      var id = ids[ch[0]];
      if (!id || id === authorId7 || ch.length < floodMin) return;
      flooders[id] = Math.max(flooders[id] || 0, ch.length);
    });
    Object.keys(flooders).forEach(function(id) {
      for (var k = 0; k < n; ++k) if (ids[k] === id) add(k, '連推' + flooders[id], 'warn');
    });
    var fl = Object.keys(flooders);
    if (fl.length) {
      var pref7 = this.app.pref;
      var exempt7 = fl.filter(function(id) { return keep7 && pref7 && pref7.isFloodExempt && pref7.isFloodExempt(id); });
      report.push('連續推文：' + fl.length + ' 個帳號連推 ' + floodMin + ' 則以上' + (useChain7 ? '（被別人插話、3 樓內 2 分鐘內接著推的也算）' : '（中間沒有別人）') +
                  (exempt7.length < fl.length ? '，已加入 24 小時黑名單' : '') +
                  (exempt7.length ? '；' + exempt7.join('、') + ' 你手動移除過，24 小時內不再加入' : ''));
      setTimeout(function() {
        var pref = self7.app.pref;
        if (!pref) return;
        var batch = fl.filter(function(id) { return pref.mayAutoBlacklist(id); }).map(function(id) {
          return { id: id, ms: 24 * 3600 * 1000, info: {
            kind: 'flood', n: flooders[id], url: article.url || '',
            title: (article.meta && article.meta['標題']) || '', board: (article.meta && article.meta['看板']) || ''
          } };
        });
        pref.addTempBlacklistMany(batch);
        batch.forEach(function(b) {
          if (self7.app.showToast) self7.app.showToast(i18n('flood_autoBlacklisted').replace('%s', b.id).replace('%n', b.info.n) +
                                                       pref.autoBlacklistWhere(b.info), 5000);
        });
      }, 0);
    }
  }

  // Phase 2: patterns over many articles
  this.history.record(article, ids, this.lastFastIds || {}, this.lastTaskIds);
  this.historyTags(article, ids, add, report);

  // Phase 3: data-centre / VPN addresses. Shown first: the report line goes
  // to the top and the tag to the front of each push's tags.
  if (this.opt('factHosting') && typeof HostingIp !== 'undefined' && HostingIp.ready) {
    var byProvider = {};
    var hostRows = [];
    for (i = 0; i < n; ++i) {
      var h = pushes[i].ip ? HostingIp.lookup(pushes[i].ip) : '';
      if (!h) continue;
      hostRows.push([i, h]);
      (byProvider[h] = byProvider[h] || {})[ids[i]] = true;
    }
    hostRows.forEach(function(r) {
      var same = Object.keys(byProvider[r[1]]).length >= 2;
      tags[r[0]].unshift({ t: (same ? '同機房:' : '機房:') + r[1], lvl: 'warn' });
    });
    var provs = Object.keys(byProvider).sort(function(x, y) {
      return Object.keys(byProvider[y]).length - Object.keys(byProvider[x]).length;
    });
    if (provs.length) {
      var shared = provs.filter(function(pv) { return Object.keys(byProvider[pv]).length >= 2; });
      var parts = provs.map(function(pv) {
        var accs = Object.keys(byProvider[pv]);
        return pv + ' ' + accs.length + ' 個帳號';
      });
      report.unshift((shared.length ? '同機房：' : '機房／VPN IP：') + parts.join('；'));
    }
  }

  // 罐頭 last: a batch of look-alike pushes only counts as canned (red,
  // in the report) when at least two of its accounts also show another sign
  // (fast push, burst, boosting, same network, data centre) -- one early
  // pusher in a meme is not enough; otherwise it gets a grey 同梗 tag.
  if (cannedGroups && cannedGroups.length) {
    var strongSign = /^(秒推|脈衝|補血|同網段|機房|同機房)/;
    var label = 0;
    cannedGroups.forEach(function(g) {
      var strongAcc = {};
      g.batch.forEach(function(k) {
        if (tags[k].some(function(t) { return strongSign.test(t.t); })) strongAcc[ids[k]] = true;
      });
      var strong = Object.keys(strongAcc).length >= 2;
      if (!strong) {
        g.all.forEach(function(k) { add(k, '同梗', 'grey'); });
        return;
      }
      var name = '罐頭' + String.fromCharCode(65 + (label++ % 26));
      g.batch.forEach(function(k) { add(k, name, 'warn'); });
      var accs = {};
      g.batch.forEach(function(k) { accs[ids[k]] = true; });
      var span = Math.round((times[g.batch[g.batch.length - 1]] - times[g.batch[0]]) / 60000);
      report.push(name + '：' + Object.keys(accs).length + ' 個帳號在 ' + Math.max(1, span) + ' 分鐘內說幾乎一樣的話，' +
                  '並且有秒推／脈衝／同網段／機房等其他疑點，例如「' + String(pushes[g.batch[0]].content).trim().slice(0, 24) + '」');
    });
  }

  return { tags: tags, report: report };
};

// ---- phase 2: what needs several articles ---------------------------------
//
// The order of pushers in articles you have opened (or that were loaded
// ahead) is kept in this browser only, for the last 400 articles.

FactCheck.prototype.historyTags = function(article, ids, add, report) {
  var h = this.history;
  var seen = {};
  var i;
  if (this.opt('factCooccur')) {
    var rate = this.opt('factCooccurRate') / 100, min = this.opt('factCooccurMin');
    var flagged = {};
    for (i = 0; i < ids.length; ++i) {
      var id = ids[i];
      if (seen[id]) continue;
      seen[id] = true;
      // partners near this id in this article
      var near = {};
      for (var d = -3; d <= 3; ++d) {
        if (d && ids[i + d] && ids[i + d] !== id) near[ids[i + d]] = true;
      }
      var partners = h.partners(id, rate, min).filter(function(p) { return near[p.id]; });
      if (!partners.length) continue;
      flagged[id] = partners;
    }
    var fl = Object.keys(flagged);
    for (i = 0; i < ids.length; ++i) {
      if (!flagged[ids[i]]) continue;
      add(i, '共伴:' + flagged[ids[i]].slice(0, 3).map(function(p) { return p.id; }).join(','), 'warn');
    }
    if (fl.length) {
      report.push('共伴效應：' + fl.slice(0, 4).map(function(k) {
        var p = flagged[k][0];
        return k + ' 出現的 ' + p.total + ' 篇裡，' + p.id + ' 有 ' + p.count + ' 篇在前後 3 樓';
      }).join('；') + (fl.length > 4 ? '…' : ''));
    }
  }
  if (this.opt('factTaskSquad')) {
    // accounts in the first 10 pushes of several 10-push task articles
    var taskCounts = h.taskCounts();
    var tmin = this.opt('factTaskSquadMin');
    var crew = [];
    for (i = 0; i < ids.length; ++i) {
      var tc = taskCounts.counts[ids[i]] || 0;
      if (tc >= tmin) {
        add(i, '門檻班底(' + tc + '篇)', 'warn');
        if (crew.indexOf(ids[i]) < 0) crew.push(ids[i]);
      }
    }
    if (crew.length) {
      report.push('門檻班底：' + crew.slice(0, 8).map(function(k) { return k + '（' + taskCounts.counts[k] + ' 篇）'; }).join('、') +
                  (crew.length > 8 ? '…' : '') + '——在累積的 ' + taskCounts.total + ' 篇門檻推文中，反覆出現在前 10 推');
    }
  }
  if (this.opt('factSquad') && this.lastFastIds) {
    var author = String((article.meta && article.meta['作者']) || '').split(' ')[0].toLowerCase();
    var squad = h.squad(author, this.opt('factSquadMin'));
    var hits = [];
    for (i = 0; i < ids.length; ++i) {
      if (squad[ids[i]] && this.lastFastIds[ids[i]]) {
        add(i, '首殺班底', 'warn');
        if (hits.indexOf(ids[i]) < 0) hits.push(ids[i]);
      }
    }
    if (hits.length) {
      report.push('首殺班底：' + hits.slice(0, 6).join('、') + ' 在 ' + author + ' 的 ' +
                  squad[hits[0]].of + ' 篇文章中有 ' + squad[hits[0]].fast + ' 篇都是發文 2 分鐘內推文');
    }
  }
};

FactCheck.prototype.setupUi = function() {
  var self = this;
  var refresh = function() {
    $('#fact_historyCount').text(i18n('fact_historyCount').replace('%s', self.history.count()));
  };
  $('#fact_historyNote').text(i18n('fact_historyNote'));
  // one click for every rule in 自動偵測 (saved with the other settings)
  var setAll = function(on) {
    $('#opt_factDetect').next('.list-group-item-text').find('.checkbox input[type=checkbox]').prop('checked', on);
  };
  $('#fact_allOn').text(i18n('fact_allOn')).off().click(function(e) { e.preventDefault(); setAll(true); });
  $('#fact_allOff').text(i18n('fact_allOff')).off().click(function(e) { e.preventDefault(); setAll(false); });
  $('#fact_historyClear').text(i18n('fact_historyClear')).off().click(function(e) {
    e.preventDefault();
    if (!window.confirm(i18n('fact_historyConfirm'))) return;
    self.history.clear();
    refresh();
  });
  refresh();
};

function FactHistory() {
  this.data = null;
}

FactHistory.KEY = 'jjptt.factHistory';
FactHistory.MAX_ARTICLES = 400;
FactHistory.MAX_PUSHERS = 300;

FactHistory.prototype.load = function() {
  if (this.data) return this.data;
  try {
    this.data = JSON.parse(lib.safeGetItem(FactHistory.KEY) || 'null');
  } catch (e) {
    this.data = null;
  }
  if (!this.data || !this.data.a) this.data = { a: {}, order: [] };
  this.index = null;
  return this.data;
};

FactHistory.prototype.save = function() {
  try {
    lib.safeSetItem(FactHistory.KEY, JSON.stringify(this.data));
  } catch (e) {
    // storage full: drop the oldest half and try once more
    var order = this.data.order;
    order.splice(0, Math.floor(order.length / 2)).forEach(function(k) { delete this.data.a[k]; }, this);
    try { lib.safeSetItem(FactHistory.KEY, JSON.stringify(this.data)); } catch (e2) {}
  }
};

FactHistory.prototype.count = function() {
  return this.load().order.length;
};

FactHistory.prototype.clear = function() {
  this.data = { a: {}, order: [] };
  this.index = null;
  this.save();
};

// ids in push order (repeats kept), fastIds: pushed within the fast window
FactHistory.prototype.record = function(article, ids, fastIds, taskIds) {
  if (!article || !article.url || !ids.length) return;
  var d = this.load();
  var key = String(article.url).replace(/^https?:\/\/[^\/]+/, '');
  var author = String((article.meta && article.meta['作者']) || '').split(' ')[0].toLowerCase();
  var entry = { u: author, p: ids.slice(0, FactHistory.MAX_PUSHERS), f: Object.keys(fastIds || {}) };
  if (taskIds) entry.k = Object.keys(taskIds);  // first 10 of a 10-push task article
  var old = d.a[key];
  if (old && old.p.length === entry.p.length && old.f.length === entry.f.length &&
      !!old.k === !!entry.k) return;  // nothing new
  if (!old) d.order.push(key);
  d.a[key] = entry;
  while (d.order.length > FactHistory.MAX_ARTICLES) delete d.a[d.order.shift()];
  this.index = null;
  this.save();
};

// How many 10-push task articles each account was in the first 10 of.
FactHistory.prototype.taskCounts = function() {
  var d = this.load();
  var counts = {}, total = 0;
  for (var k in d.a) {
    if (!d.a[k].k) continue;
    total++;
    d.a[k].k.forEach(function(id) { counts[id] = (counts[id] || 0) + 1; });
  }
  return { counts: counts, total: total };
};

// id -> list of article keys, built once per change
FactHistory.prototype.buildIndex = function() {
  if (this.index) return this.index;
  var d = this.load();
  var byId = {};
  for (var k in d.a) {
    var p = d.a[k].p;
    var seenHere = {};
    for (var i = 0; i < p.length; ++i) {
      if (seenHere[p[i]]) continue;
      seenHere[p[i]] = true;
      (byId[p[i]] = byId[p[i]] || []).push(k);
    }
  }
  this.index = byId;
  return byId;
};

// Accounts that were within 3 floors of `id` in at least `rate` of the
// articles where `id` pushed (and `id` pushed in at least `min` articles).
FactHistory.prototype.partners = function(id, rate, min) {
  var byId = this.buildIndex();
  var arts = byId[id] || [];
  if (arts.length < min) return [];
  var d = this.data;
  var counts = {};
  arts.forEach(function(k) {
    var p = d.a[k].p;
    var near = {};
    for (var i = 0; i < p.length; ++i) {
      if (p[i] !== id) continue;
      for (var j = Math.max(0, i - 3); j <= Math.min(p.length - 1, i + 3); ++j) {
        if (p[j] !== id) near[p[j]] = true;
      }
    }
    for (var o in near) counts[o] = (counts[o] || 0) + 1;
  });
  var out = [];
  for (var o in counts) {
    if (counts[o] / arts.length >= rate) out.push({ id: o, count: counts[o], total: arts.length });
  }
  out.sort(function(a, b) { return b.count - a.count; });
  return out;
};

// Accounts that pushed within the fast window in at least `min` of the
// author's articles (and in at least half of them).
FactHistory.prototype.squad = function(author, min) {
  var d = this.load();
  var of = 0, fast = {};
  for (var k in d.a) {
    if (d.a[k].u !== author) continue;
    of++;
    d.a[k].f.forEach(function(id) { fast[id] = (fast[id] || 0) + 1; });
  }
  var out = {};
  for (var id in fast) {
    if (fast[id] >= min && fast[id] >= of / 2) out[id] = { fast: fast[id], of: of };
  }
  return out;
};
