// JJptt spam guard: an ID that posts the same URL in more than three
// different articles within 24 hours (in the article body or in pushes) is
// put on the blacklist for 24 hours. Only articles JJptt has loaded (read
// or prefetched) are counted.
function SpamGuard(app) {
  this.app = app;
}

SpamGuard.KEY = 'jjptt.spamSeen';
SpamGuard.WINDOW = 24 * 3600 * 1000;
SpamGuard.LIMIT = 3;  // more than this many articles -> blacklist

SpamGuard.prototype.enabled = function() {
  var pref = this.app.pref;
  return !!(pref && pref.values && pref.values.autoBlacklistSameUrl !== false);
};

SpamGuard.normalize = function(url) {
  return String(url || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[)\]）】」。，、,.;:!?]+$/, '')
    .toLowerCase();
};

SpamGuard.prototype.load = function() {
  try {
    return JSON.parse(lib.safeGetItem(SpamGuard.KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
};

SpamGuard.prototype.save = function(seen) {
  lib.safeSetItem(SpamGuard.KEY, JSON.stringify(seen));
};

SpamGuard.prototype.prune = function(seen, now) {
  for (var id in seen) {
    for (var url in seen[id]) {
      var arts = seen[id][url];
      for (var a in arts) {
        if (now - arts[a] > SpamGuard.WINDOW) delete arts[a];
      }
      if (!Object.keys(arts).length) delete seen[id][url];
    }
    if (!Object.keys(seen[id]).length) delete seen[id];
  }
};

// Called with every article loaded from the PTT web site.
SpamGuard.prototype.record = function(article) {
  if (!this.enabled() || !article || !article.url) return;
  var now = Date.now();
  var seen = this.load();
  this.prune(seen, now);
  var articleKey = article.url.replace(/^https?:\/\/[^\/]+/, '');
  var touched = {};
  var add = function(id, url) {
    id = String(id || '').toLowerCase();
    url = SpamGuard.normalize(url);
    if (!id || !url) return;
    var byUrl = (seen[id] = seen[id] || {});
    var arts = (byUrl[url] = byUrl[url] || {});
    arts[articleKey] = now;
    touched[id + '\n' + url] = true;
  };
  var urlRe = /https?:\/\/[^\s<>"'，。）)]+/g;

  // article body by the author (not quotes / signature lines)
  var author = String(article.meta['作者'] || '').split(' ')[0];
  String(article.text || '').split('\n').forEach(function(line) {
    var t = line.trim();
    if (/^[:：]/.test(t) || /^※/.test(t)) return;
    (t.match(urlRe) || []).forEach(function(u) { add(author, u); });
  });
  // pushes
  (article.pushes || []).forEach(function(p) {
    (String(p.content || '').match(urlRe) || []).forEach(function(u) { add(p.id, u); });
  });

  var pref = this.app.pref;
  for (var k in touched) {
    var parts = k.split('\n');
    var id = parts[0], url = parts[1];
    var count = Object.keys(seen[id][url]).length;
    if (count > SpamGuard.LIMIT && pref && !pref.isBlacklisted(id)) {
      pref.addTempBlacklist(id, SpamGuard.WINDOW);
      this.app.showToast(i18n('spam_autoBlacklisted').replace('%s', id).replace('%n', count), 5000);
    }
  }
  this.save(seen);
};
