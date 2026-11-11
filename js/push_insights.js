// JJptt push insights: labels push rows with their floor number, the country
// of the pusher's IP (on boards that record push IPs) and signals that an
// account may be a sock puppet or paid poster. The label is drawn with CSS
// (::after on the row) so it never becomes part of the terminal text.
//
// Signals are hints for the reader, not verdicts:
//  - 同IP: the same IP pushed under several IDs in this article
//  - 與作者同IP: a pusher shares the author's IP
//  - country in orange: the IP is outside the home country (Taiwan)
//  - 觀察: the ID is on the user's watchlist
//  - 第k/n推: the ID pushed many times in this article
function PushInsights(app) {
  this.app = app;
  this.enabled = true;
  this.homeCountry = 'TW';
  this.manyPushThreshold = 8;
  this.geo = new JJGeoIP();
  this.resetArticle();
}

// "推 userid: content     [1.2.3.4] 11/11 12:34"
PushInsights.PUSH_RE = /^([推噓→]) (\w+) *:(.*?)\s+(?:((?:\d{1,3}\.){3}\d{1,3})\s+)?(\d{1,2}\/\d{1,2})(?: \d{1,2}:\d{2})?\s*$/;
PushInsights.AUTHOR_RE = /^\s*作者\s+(\w+)/;  // 作者
PushInsights.AUTHOR_IP_RES = [
  /※ 發信站: .*來自: ((?:\d{1,3}\.){3}\d{1,3})/,   // ※ 發信站: ... 來自: ip
  /※ 編輯: (\w+) \(((?:\d{1,3}\.){3}\d{1,3})/,              // ※ 編輯: id (ip
  /◆ From: ((?:\d{1,3}\.){3}\d{1,3})/                                // ◆ From: ip
];

PushInsights.prototype.resetArticle = function() {
  this.authorId = '';
  this.authorIps = {};
  this.idsByIp = {};    // ip -> { id: true }
  this.ipsById = {};    // id -> { ip: true }
};

PushInsights.prototype.setEnabled = function(enabled) {
  this.enabled = !!enabled;
  if (this.enabled) this.geo.load();
  this.app.view.onWindowResizeForInsights();
  this.annotate();
};

PushInsights.prototype.rowText = function(row) {
  return row.textContent.replace(/ /g, ' ');
};

PushInsights.prototype.clearRow = function(row) {
  if (row.hasAttribute('data-jj')) {
    row.removeAttribute('data-jj');
    row.removeAttribute('data-jj-level');
  }
};

PushInsights.prototype.annotate = function() {
  var view = this.app.view;
  var buf = this.app.buf;
  var container = view.mainContainer;
  if (!container) return;
  var rows = container.children;
  var i;

  if (!this.enabled || buf.pageState != 3) {
    if (buf.pageState != 3) this.resetArticle();
    for (i = 0; i < rows.length; ++i) this.clearRow(rows[i]);
    return;
  }

  if (!this.geo.ready) {
    var self = this;
    this.geo.load().then(function() {
      if (self.geo.ready) self.annotate();
    });
  }

  var easyReading = view.useEasyReadingMode && buf.startedEasyReading;
  var pushes = [];
  var pushCountById = {};

  for (i = 0; i < rows.length; ++i) {
    var row = rows[i];
    if (row.getAttribute('type') !== 'bbsrow') continue;
    var text = this.rowText(row);
    var m = PushInsights.PUSH_RE.exec(text);
    if (!m) {
      this.clearRow(row);
      this.scanArticleRow(text);
      continue;
    }
    var id = m[2].toLowerCase();
    var ip = m[4] || '';
    pushCountById[id] = (pushCountById[id] || 0) + 1;
    pushes.push({ row: row, id: id, ip: ip, nth: pushCountById[id] });
    if (ip) {
      (this.idsByIp[ip] = this.idsByIp[ip] || {})[id] = true;
      (this.ipsById[id] = this.ipsById[id] || {})[ip] = true;
    }
  }

  var pref = this.app.pref;
  var watchlist = (pref && pref.watchlistedUserIds) || {};

  for (i = 0; i < pushes.length; ++i) {
    var p = pushes[i];
    var parts = [];
    var level = '';
    var warn = [];

    if (easyReading) parts.push((i + 1) + '樓');  // 樓

    if (p.ip) {
      var cc = this.geo.lookup(p.ip);
      if (cc) {
        parts.push(this.geo.countryName(cc));
        if (cc !== this.homeCountry) {
          level = 'foreign';  // country shown in orange
        }
      }
      var others = this.otherIdsOnIp(p.ip, p.id);
      if (others.length) {
        var shown = others.slice(0, 2).join(',');
        if (others.length > 2) shown += '等' + others.length + '人';  // 等N人
        warn.push('同IP:' + shown);  // 同IP:
        level = 'warn';
      }
      if (this.authorIps[p.ip] && p.id !== this.authorId) {
        warn.push('與作者同IP');  // 與作者同IP
        level = 'warn';
      }
    }

    if (p.id in watchlist) {
      var note = watchlist[p.id];
      warn.push('觀察' + (note ? ':' + note : ''));  // 觀察
      if (level !== 'warn') level = 'watch';
    }

    var total = pushCountById[p.id];
    if (total >= this.manyPushThreshold) {
      parts.push('第' + p.nth + '/' + total + '推');  // 第k/n推
    }

    var label = parts.concat(warn.length ? ['⚠ ' + warn.join(' ')] : []).join(' ');
    if (label) {
      if (p.row.getAttribute('data-jj') !== label) p.row.setAttribute('data-jj', label);
      if (level) p.row.setAttribute('data-jj-level', level);
      else p.row.removeAttribute('data-jj-level');
    } else {
      this.clearRow(p.row);
    }
  }
};

PushInsights.prototype.otherIdsOnIp = function(ip, id) {
  var ids = Object.keys(this.idsByIp[ip] || {});
  var others = [];
  for (var i = 0; i < ids.length; ++i) {
    if (ids[i] !== id) others.push(ids[i]);
  }
  return others;
};

PushInsights.prototype.scanArticleRow = function(text) {
  var m = PushInsights.AUTHOR_RE.exec(text);
  if (m) {
    var author = m[1].toLowerCase();
    if (author !== this.authorId) {
      this.resetArticle();
      this.authorId = author;
    }
    return;
  }
  for (var k = 0; k < PushInsights.AUTHOR_IP_RES.length; ++k) {
    var r = PushInsights.AUTHOR_IP_RES[k].exec(text);
    if (!r) continue;
    // ※ 編輯 lines name the editor; only count the author's own edits.
    if (r.length === 3) {
      if (r[1].toLowerCase() === this.authorId) this.authorIps[r[2]] = true;
    } else {
      this.authorIps[r[1]] = true;
    }
    return;
  }
};
