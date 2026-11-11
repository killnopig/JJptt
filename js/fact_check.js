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
  factCanned: true, factCannedMin: 3,
  factSubnet: true, factSubnetMin: 3,
  factCooccur: true, factCooccurRate: 70, factCooccurMin: 5,
  factSquad: true, factSquadMin: 3,
  factHosting: true
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

  // 1. 秒推 / 黃金 3 分鐘定調部隊
  if (this.opt('factFastPush') && post) {
    var limit = this.opt('factFastMinutes');
    var chars = FactCheck.bodyChars(article.text);
    var readMin = chars / 500;  // about 500 Chinese characters a minute
    var postMinute = Math.floor(post / 60000) * 60000;
    var fastIds = {};
    for (i = 0; i < n; ++i) {
      if (!times[i]) continue;
      var mins = (times[i] - postMinute) / 60000;
      if (mins < 0 || mins > limit) continue;
      var tooFast = readMin > Math.max(1, mins + 1);  // could not have read it yet
      add(i, tooFast ? '秒推‧沒讀完' : '秒推', tooFast ? 'warn' : 'note');
      fastIds[ids[i]] = true;
    }
    var fastCount = Object.keys(fastIds).length;
    if (fastCount) {
      report.push('秒推：發文 ' + limit + ' 分鐘內 ' + fastCount + ' 人推文' +
                  (readMin > 2 ? '（內文約 ' + chars + ' 字，正常要讀 ' + Math.round(readMin) + ' 分鐘）' : ''));
    }
    this.lastFastIds = fastIds;
  } else {
    this.lastFastIds = {};
  }

  // 2. 脈衝式群聚: minutes with many pushes after (or before) a quiet stretch
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
      var before = j > 0 ? (minutes[j] - minutes[j - 1]) / 60000 : Infinity;
      var after = end + 1 < minutes.length ? (minutes[end + 1] - minutes[end]) / 60000 : Infinity;
      if (before < quiet && after < quiet) continue;  // just a busy thread
      wave++;
      for (var g = 0; g < group.length; ++g) add(group[g], '脈衝' + wave, 'warn');
      var d = new Date(minutes[j]);
      report.push('脈衝 ' + wave + '：' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2) +
                  ' 起 ' + (end > j ? 2 : 1) + ' 分鐘內湧入 ' + group.length + ' 則' +
                  (before !== Infinity && before >= quiet ? '，之前 ' + Math.round(before) + ' 分鐘沒人推' : '') +
                  (after !== Infinity && after >= quiet ? '，之後 ' + Math.round(after) + ' 分鐘沒人推' : ''));
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
  if (this.opt('factCanned')) {
    var minAcc = this.opt('factCannedMin');
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
        if (overlap >= 0.4 && FactCheck.sharePhrase(texts[i], texts[o], 4)) parent[find(o)] = find(i);
      }
    }
    var groups = {};
    for (i = 0; i < n; ++i) if (grams[i]) (groups[find(i)] = groups[find(i)] || []).push(i);
    var label = 0;
    for (var root in groups) {
      var members = groups[root];
      var accounts = {};
      members.forEach(function(k) { accounts[ids[k]] = true; });
      if (Object.keys(accounts).length < minAcc) continue;
      var name = '罐頭' + String.fromCharCode(65 + (label++ % 26));
      members.forEach(function(k) { add(k, name, 'warn'); });
      report.push(name + '：' + Object.keys(accounts).length + ' 個帳號說幾乎一樣的話，例如「' +
                  String(pushes[members[0]].content).trim().slice(0, 24) + '」');
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

  // Phase 2: patterns over many articles
  this.history.record(article, ids, this.lastFastIds || {});
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
        return pv + ' ' + accs.length + ' 個帳號（' + accs.slice(0, 5).join('、') + (accs.length > 5 ? '…' : '') + '）';
      });
      report.unshift((shared.length ? '同機房：' : '機房／VPN IP：') + parts.join('；'));
    }
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
FactHistory.prototype.record = function(article, ids, fastIds) {
  if (!article || !article.url || !ids.length) return;
  var d = this.load();
  var key = String(article.url).replace(/^https?:\/\/[^\/]+/, '');
  var author = String((article.meta && article.meta['作者']) || '').split(' ')[0].toLowerCase();
  var entry = { u: author, p: ids.slice(0, FactHistory.MAX_PUSHERS), f: Object.keys(fastIds || {}) };
  var old = d.a[key];
  if (old && old.p.length === entry.p.length && old.f.length === entry.f.length) return;  // nothing new
  if (!old) d.order.push(key);
  d.a[key] = entry;
  while (d.order.length > FactHistory.MAX_ARTICLES) delete d.a[d.order.shift()];
  this.index = null;
  this.save();
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
