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
PushInsights.TITLE_RE = /^\s*標題\s+(.*?)\s*$/;  // 標題
PushInsights.URL_LINE_RE = /^※ 文章網址:/;
PushInsights.SITE_LINE_RE = /^※ 發信站:/;
PushInsights.AUTHOR_IP_RES = [
  /※ 發信站: .*來自: ((?:\d{1,3}\.){3}\d{1,3})/,   // ※ 發信站: ... 來自: ip
  /※ 編輯: (\w+) \(((?:\d{1,3}\.){3}\d{1,3})/,              // ※ 編輯: id (ip
  /◆ From: ((?:\d{1,3}\.){3}\d{1,3})/                                // ◆ From: ip
];

// User-adjustable label texts (settings → 推文分析與顏色).
PushInsights.prototype.pref = function(name, fallback) {
  var pref = this.app.pref;
  var v = pref && pref.values ? pref.values[name] : undefined;
  return (v === undefined || v === null || v === '') ? fallback : v;
};

PushInsights.flagEmoji = function(cc) {
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65);
};

// Country as text, flag or both (countryDisplay: 0 / 1 / 2).
PushInsights.prototype.countryLabel = function(cc) {
  var name = this.geo.countryName(cc);
  var mode = parseInt(this.pref('countryDisplay', 0), 10);
  if (mode === 1) return PushInsights.flagEmoji(cc) || name;
  if (mode === 2) return (PushInsights.flagEmoji(cc) + ' ' + name).trim();
  return name;
};

PushInsights.prototype.hintTexts = function() {
  return {
    prefix: this.pref('suspectPrefix', '⚠'),
    sameIp: this.pref('suspectSameIpText', '同IP'),
    authorIp: this.pref('suspectAuthorIpText', '與作者同IP'),
    watch: this.pref('watchText', '觀察')
  };
};

// Compact layout with little room on the right: country plus a single
// warning sign; the full text is in the row's tooltip.
PushInsights.prototype.fitLabel = function(full, parts, warn, T, spaceCols) {
  var view = this.app.view;
  if (!view.compactLabels || !view.compactLabels() || spaceCols === undefined || spaceCols >= 12) return full;
  var country = parts.length ? parts[0] : '';
  var sign = warn.length ? (T.prefix || '\u26a0') : '';
  return [country, sign].filter(Boolean).join(' ');
};

// "IP as flag" layout: hide the IP text in the row (keeping its width so
// the date stays in place) and show the country flag over it.
PushInsights.prototype.maskIp = function(row, ip, flag, note) {
  note = note || '';
  var existing = row.querySelector('.jj-ip');
  if (existing && existing.textContent === ip) {
    if (existing.getAttribute('data-flag') !== flag) existing.setAttribute('data-flag', flag);
    if (existing.getAttribute('data-note') !== note) existing.setAttribute('data-note', note);
    return;
  }
  var walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, null, false);
  var node;
  while ((node = walker.nextNode())) {
    var idx = node.nodeValue.indexOf(ip);
    if (idx < 0) continue;
    var ipNode = node.splitText(idx);
    ipNode.splitText(ip.length);
    var span = document.createElement('span');
    span.className = 'jj-ip';
    span.setAttribute('data-flag', flag);
    span.setAttribute('data-note', note);
    ipNode.parentNode.insertBefore(span, ipNode);
    span.appendChild(ipNode);
    return;
  }
};

PushInsights.prototype.resetArticle = function() {
  this.articleKey = '';
  this.pendingAuthor = '';
  this.authorId = '';
  this.authorIps = {};
  this.idsByIp = {};    // ip -> { id: true }
  this.ipsById = {};    // id -> { ip: true }
  // Normal (paged) mode floor numbers: pushes start on the line after
  // "※ 文章網址"; lines in the push area that are not pushes are skipped.
  this.pushStartLine = 0;
  this.urlLineSeen = false;
  this.nonPushLines = {};
};

// Article line number shown on each screen row in normal mode, using the
// status row ("目前顯示: 第 28~50 行"). Returns null when unknown.
PushInsights.prototype.lineMapper = function() {
  var status = this.app.buf.getRowText(23, 0, this.app.buf.cols).parseStatusRow();
  if (!status) return null;
  var start = status.rowIndexStart, end = status.rowIndexEnd;
  if (end - start + 1 >= 23) {
    // Full screen: map from the bottom so wrapped lines above don't matter.
    return function(row) { return row <= 22 ? end - (22 - row) : null; };
  }
  return function(row) {
    var n = start + row;
    return (row <= 22 && n <= end) ? n : null;
  };
};

PushInsights.prototype.floorOf = function(line) {
  if (!this.pushStartLine || line === null || line < this.pushStartLine) return 0;
  var skipped = 0;
  for (var k in this.nonPushLines) {
    var n = +k;
    if (n >= this.pushStartLine && n < line) skipped++;
  }
  return line - this.pushStartLine + 1 - skipped;
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
  if (row.hasAttribute('data-jj') || row.hasAttribute('data-jj-floor')) {
    row.removeAttribute('data-jj');
    row.removeAttribute('data-jj-floor');
    row.removeAttribute('data-jj-level');
    row.removeAttribute('title');
  }
};

PushInsights.prototype.setAttr = function(row, name, value) {
  if (value) {
    if (row.getAttribute(name) !== value) row.setAttribute(name, value);
  } else if (row.hasAttribute(name)) {
    row.removeAttribute(name);
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
  var lineOf = easyReading ? null : this.lineMapper();
  var pushes = [];
  var pushCountById = {};

  for (i = 0; i < rows.length; ++i) {
    var row = rows[i];
    if (row.getAttribute('type') !== 'bbsrow') continue;
    var text = this.rowText(row);
    var line = lineOf ? lineOf(i) : null;
    var m = PushInsights.PUSH_RE.exec(text);
    if (!m) {
      this.clearRow(row);
      this.scanArticleRow(text, line);
      continue;
    }
    if (line !== null) delete this.nonPushLines[line];
    var id = m[2].toLowerCase();
    var ip = m[4] || '';
    pushCountById[id] = (pushCountById[id] || 0) + 1;
    pushes.push({ row: row, id: id, ip: ip, nth: pushCountById[id], line: line });
    if (ip) {
      (this.idsByIp[ip] = this.idsByIp[ip] || {})[id] = true;
      (this.ipsById[id] = this.ipsById[id] || {})[ip] = true;
    }
  }

  var pref = this.app.pref;
  var watchlist = (pref && pref.watchlistedUserIds) || {};
  var T = this.hintTexts();

  for (i = 0; i < pushes.length; ++i) {
    var p = pushes[i];
    var parts = [];
    var level = '';
    var warn = [];
    var tags = [];
    var flagText = '';

    var floor = easyReading ? i + 1 : this.floorOf(p.line);
    var floorText = floor > 0 ? floor + '樓' : '';  // shown at the left

    if (p.ip) {
      var cc = this.geo.lookup(p.ip);
      var asFlag = view.ipAsFlag && view.ipAsFlag();
      flagText = cc ? PushInsights.flagEmoji(cc) : '';
      if (cc) {
        if (!asFlag) parts.push(this.countryLabel(cc));
        if (cc !== this.homeCountry) {
          level = 'foreign';  // country shown in orange
        }
      }
      var others = this.otherIdsOnIp(p.ip, p.id);
      if (others.length) {
        var shown = others.slice(0, 2).join(',');
        if (others.length > 2) shown += '等' + others.length + '人';  // 等N人
        warn.push(T.sameIp + ':' + shown);
        tags.push(T.sameIp);
        level = 'warn';
      }
      if (this.authorIps[p.ip] && p.id !== this.authorId) {
        warn.push(T.authorIp);
        tags.push(T.authorIp);
        level = 'warn';
      }
    }

    if (p.id in watchlist) {
      var note = watchlist[p.id];
      warn.push(T.watch + (note ? ':' + note : ''));
      tags.push(T.watch);
      if (level !== 'warn') level = 'watch';
    }

    var total = pushCountById[p.id];
    if (total >= this.manyPushThreshold) {
      parts.push('第' + p.nth + '/' + total + '推');  // 第k/n推
    }

    var full = parts.concat(warn.length ? [(T.prefix ? T.prefix + ' ' : '') + warn.join(' ')] : []).join(' ');
    var label = this.fitLabel(full, parts, warn, T, view.rightSpaceCols);
    // IP-as-flag layout: the notes go in front of the flag, in the IP's
    // place, instead of the right margin (often off screen)
    if (p.ip && view.ipAsFlag && view.ipAsFlag()) {
      this.maskIp(p.row, p.ip, flagText || '', full);
      this.setAttr(p.row, 'data-jj-ilevel', full ? level : '');
      label = '';
    }
    this.setAttr(p.row, 'data-jj-floor', floorText);
    this.setAttr(p.row, 'data-jj', label);
    this.setAttr(p.row, 'data-jj-level', label ? level : '');
    // full text on hover in case the label is clipped / shortened
    this.setAttr(p.row, 'title', [floorText, full].filter(Boolean).join(' '));
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

PushInsights.prototype.scanArticleRow = function(text, line) {
  var m = PushInsights.AUTHOR_RE.exec(text);
  if (m) {
    this.pendingAuthor = m[1].toLowerCase();
    return;
  }
  m = PushInsights.TITLE_RE.exec(text);
  if (m && this.pendingAuthor) {
    // A new article (author + title) starts a fresh analysis.
    var key = this.pendingAuthor + '|' + m[1];
    if (key !== this.articleKey) {
      var author = this.pendingAuthor;
      this.resetArticle();
      this.articleKey = key;
      this.authorId = author;
    }
    return;
  }
  if (line !== null && line !== undefined) {
    if (PushInsights.URL_LINE_RE.test(text)) {
      this.pushStartLine = line + 1;
      this.urlLineSeen = true;
    } else if (PushInsights.SITE_LINE_RE.test(text) && !this.urlLineSeen) {
      this.pushStartLine = line + 1;
    } else if (this.pushStartLine && line >= this.pushStartLine) {
      this.nonPushLines[line] = true;
    }
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
