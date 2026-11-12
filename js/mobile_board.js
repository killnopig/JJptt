// JJptt on phones: a board's article list, and loading articles.
// Part of JJMobile (js/mobile.js).

// ---- board: article list ------------------------------------------------------------

// "https://www.ptt.cc/bbs/Gossiping/index.html" etc. -> entries, newest first.
JJMobile.parseIndex = function(doc, newestFirst) {
  var out = [];
  var pinned = false;
  var nodes = doc.querySelectorAll('.r-list-container > div');
  for (var i = 0; i < nodes.length; ++i) {
    var n = nodes[i];
    if (n.classList.contains('r-list-sep')) { pinned = true; continue; }
    if (!n.classList.contains('r-ent')) continue;
    var a = n.querySelector('.title a');
    out.push({
      title: ((a || n.querySelector('.title')) || {}).textContent.trim(),
      url: a ? JJMobile.WEB + a.getAttribute('href') : '',
      author: ((n.querySelector('.meta .author') || {}).textContent || '').trim(),
      date: ((n.querySelector('.meta .date') || {}).textContent || '').trim(),
      nrec: ((n.querySelector('.nrec') || {}).textContent || '').trim(),
      pinned: pinned
    });
  }
  var older = '';
  var links = doc.querySelectorAll('.btn-group-paging a');
  for (var k = 0; k < links.length; ++k) {
    if (/上頁/.test(links[k].textContent) && links[k].getAttribute('href')) older = JJMobile.WEB + links[k].getAttribute('href');
  }
  var board = ((doc.querySelector('#topbar .board') || {}).textContent || '').replace(/^\s*看板\s*/, '').trim();
  var normal = out.filter(function(e) { return !e.pinned; });
  var pins = out.filter(function(e) { return e.pinned; });
  if (newestFirst) normal.reverse();
  return { entries: normal, pinned: pins, older: older, board: board };
};

JJMobile.prototype.renderBoard = function(screen) {
  var self = this;
  var el = JJMobile.el;
  var v = screen.view;
  var q = screen.query || '';
  var qLabel = /^author:/.test(q) ? '作者 ' + q.slice(7) : /^recommend:/.test(q) ? '推文 ≥ ' + q.slice(10) : q;
  screen.title = screen.board + (q ? ' · ' + qLabel : '');
  this.titleEl.textContent = screen.title;
  screen.entries = [];
  screen.listNode = el('div', 'jjm-list jjm-articles');
  v.appendChild(screen.listNode);
  var more = el('div', 'jjm-more');
  v.appendChild(more);
  var url = JJMobile.WEB + '/bbs/' + encodeURIComponent(screen.board) +
    (screen.query ? '/search?q=' + encodeURIComponent(screen.query) : '/index.html');
  screen.older = url;
  screen.loadingMore = false;

  var loadMore = function() {
    if (screen.loadingMore || !screen.older) return;
    screen.loadingMore = true;
    more.textContent = '載入中…';
    var first = !screen.entries.length;
    self.app.reader.fetchDoc(screen.older).then(function(doc) {
      // board index pages run oldest -> newest; search results come newest first
      var page = JJMobile.parseIndex(doc, !screen.query);
      if (page.board && first && !screen.query) {
        screen.board = page.board;
        screen.title = page.board;
        if (self.stack[self.stack.length - 1] === screen) self.setBar(screen);
      }
      screen.older = page.older;
      // 置底公告, unless hidden (設定 → 一般; the extension's hidePinned)
      var pv2 = (self.app.pref && self.app.pref.values) || {};
      if (first && page.pinned.length && !pv2.hidePinned) {
        page.pinned.forEach(function(e) { self.appendEntry(screen, e); });
      }
      page.entries.forEach(function(e) { self.appendEntry(screen, e); });
      more.textContent = screen.older ? '' : (screen.entries.length ? '沒有更早的文章了' : '沒有文章');
      screen.loadingMore = false;
      if (first) self.prefetchList(screen, 0);
      // a short first page: keep going until the screen is full
      if (screen.older && v.scrollHeight <= v.clientHeight + 200) loadMore();
    }).catch(function(err) {
      screen.loadingMore = false;
      more.textContent = '';
      self.failed(more, err, function() { more.innerHTML = ''; loadMore(); });
    });
  };
  screen.loadMore = loadMore;
  v.addEventListener('scroll', function() {
    if (v.scrollTop + v.clientHeight > v.scrollHeight - 600) loadMore();
  });
  loadMore();
};

JJMobile.prototype.hiddenEntry = function(e) {
  var pref = this.app.pref;
  if (!pref) return '';
  var black = pref.enableBlacklist && e.author && pref.isBlacklisted(e.author);
  var kw = (pref.titleKeywords || []).some(function(k) { return k && e.title.indexOf(k) >= 0; });
  if (!black && !kw) return '';
  return pref.hideBlacklisted ? 'hide' : 'fade';
};

JJMobile.prototype.appendEntry = function(screen, e) {
  var self = this;
  var el = JJMobile.el;
  var hidden = this.hiddenEntry(e);
  if (hidden === 'hide') return;
  var index = screen.entries.length;
  screen.entries.push(e);
  var row = el('button', 'jjm-row jjm-article');
  row.type = 'button';
  if (hidden) row.classList.add('jjm-faded');
  if (e.pinned) row.classList.add('jjm-pinned');
  if (!e.url) row.classList.add('jjm-deleted');
  var top = el('div', 'jjm-article-title', e.title);
  row.appendChild(top);
  var meta = el('div', 'jjm-article-meta');
  var nrec = this.nrecBadge(e.nrec);
  if (nrec) meta.appendChild(nrec);
  if (e.pinned) meta.appendChild(el('span', 'jjm-tag', '置底'));
  var who = el('span', 'jjm-author', e.author);
  var pref = this.app.pref;
  if (pref && e.author && pref.watchlistedUserIds && e.author.toLowerCase() in pref.watchlistedUserIds) who.classList.add('jjm-watch');
  if (pref && e.author && pref.notedUserIds && e.author.toLowerCase() in pref.notedUserIds) who.classList.add('jjm-noted');
  meta.appendChild(who);
  meta.appendChild(el('span', 'jjm-date', e.date));
  row.appendChild(meta);
  if (e.url && this.readUrls && this.readUrls[e.url]) row.classList.add('jjm-read');
  e.row = row;
  JJMobile.tap(row, function() {
    if (!e.url) return;
    self.open({ type: 'article', url: e.url, list: screen, index: index, title: screen.board });
  });
  screen.listNode.appendChild(row);
};

// 推文數 the way PTT colours it: 爆 red, 10+ yellow, 1-9 green, X (噓) grey
JJMobile.prototype.nrecBadge = function(n) {
  if (!n) return null;
  var cls = 'jjm-nrec';
  if (n === '爆') cls += ' jjm-nrec-hot';
  else if (/^X/.test(n)) cls += ' jjm-nrec-boo';
  else if (+n >= 10) cls += ' jjm-nrec-10';
  else cls += ' jjm-nrec-1';
  return JJMobile.el('span', cls, n);
};

JJMobile.prototype.markRead = function(screen) {
  var read = this.readUrls || {};
  screen.entries.forEach(function(e) { if (e.row && read[e.url]) e.row.classList.add('jjm-read'); });
};

JJMobile.prototype.searchSheet = function(screen) {
  var self = this;
  var el = JJMobile.el;
  var box = el('form', 'jjm-sheet-form');
  var kinds = [['', '標題'], ['author:', '作者'], ['recommend:', '推文數 ≥']];
  // 設定 → 搜尋: open on 推文數 with the usual number filled in
  var pv = (this.app.pref && this.app.pref.values) || {};
  var pushN = parseInt(pv.pushFilterDefault, 10);
  if (isNaN(pushN) || pushN === 0) pushN = 10;  // negative: 噓文 (recommend:-10)
  var byPush = JJMobile.store(JJMobile.SEARCH_PUSH_KEY) !== false;
  var kind = byPush ? 'recommend:' : '';
  var chips = el('div', 'jjm-chips');
  var input = el('input');
  input.type = 'search';
  input.placeholder = '搜尋標題';
  input.setAttribute('enterkeyhint', 'search');
  kinds.forEach(function(k) {
    var c = JJMobile.button('jjm-chip' + (k[0] === kind ? ' jjm-on' : ''), k[1], function() {
      kind = k[0];
      Array.prototype.forEach.call(chips.children, function(x) { x.classList.remove('jjm-on'); });
      c.classList.add('jjm-on');
      input.placeholder = kind === 'author:' ? '作者帳號' : kind === 'recommend:' ? '例如 50' : '搜尋標題';
      input.type = kind === 'recommend:' ? 'number' : 'search';
      input.value = kind === 'recommend:' ? String(pushN) : '';
      input.focus();
    });
    chips.appendChild(c);
  });
  box.appendChild(chips);
  if (kind === 'recommend:') {
    input.type = 'number';
    input.placeholder = '例如 50';
    input.value = String(pushN);
  }
  box.appendChild(input);
  box.appendChild(el('button', 'jjm-btn jjm-btn-main', '搜尋'));
  box.addEventListener('submit', function(e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) return;
    self.closeSheet();
    self.open({ type: 'board', board: screen.board, query: kind + q });
  });
  this.showSheet('在 ' + screen.board + ' 搜尋', box);
  setTimeout(function() { input.focus(); }, 50);
};

// ---- loading articles (with the cache that makes the next one instant) -----------

JJMobile.prototype.getArticle = function(url) {
  var c = this.articles[url];
  if (c && Date.now() - c.at < JJMobile.CACHE_MS) return c.promise;
  var self = this;
  var p = this.app.reader.fetchArticle(url);
  this.articles[url] = { promise: p, at: Date.now() };
  p.catch(function() { delete self.articles[url]; });
  var keys = Object.keys(this.articles);
  if (keys.length > 80) delete this.articles[keys[0]];
  return p;
};

// How many articles to load ahead (設定 → 閱讀模式預先讀取上下幾篇).
JJMobile.prototype.aheadCount = function() {
  var pref = this.app.pref;
  var n = parseInt(pref && pref.values ? pref.values.readerPrefetchCount : 3, 10);
  return isNaN(n) ? 3 : Math.max(0, Math.min(10, n));
};

// Loads the next few articles of a list, two at a time; their pictures too
// when 預先讀取時連圖片一起下載 is on.
JJMobile.prototype.prefetchList = function(screen, from) {
  var self = this;
  var todo = screen.entries.slice(from, from + this.aheadCount() * 2).filter(function(e) { return e.url; });
  var next = function() {
    var e = todo.shift();
    if (!e) return;
    self.getArticle(e.url).then(function(a) {
      self.app.reader.preloadMedia(a);
    }, function() {}).then(next);
  };
  next();
  next();
};
