// JJptt on phones (the Android app in mobile/). Does nothing elsewhere.
//
// No terminal: boards, article lists and articles are read from PTT's own
// web pages (www.ptt.cc, straight from the phone) and shown as a phone app --
// big type, big targets. What the extension has for reading stays: 真.事實查核
// 中心, push insights (flags, same IP, watch / custom lists), blacklists,
// 連推 / 同網址洗版, grouped push runs, images and link cards, loading ahead.
//
// Screens: home (search a board, my boards, hot boards) -> board (newest
// first, older pages as you scroll) -> article (swipe sideways for the
// previous / next one). Back: the ← in the bar or the phone's back button.
function JJMobile(app) {
  this.app = app;
  this.stack = [];          // screens, last = on show
  this.articles = {};       // url -> { promise, at }
}

JJMobile.WEB = 'https://www.ptt.cc';
JJMobile.CACHE_MS = 10 * 60 * 1000;
JJMobile.FAVS_KEY = 'jjptt.m.favs';
JJMobile.FONT_KEY = 'jjptt.m.font';
JJMobile.FONTS = [15, 17, 19, 22];

JJMobile.prototype.enabled = function() {
  return lib.isApp();
};

// ---- small helpers ------------------------------------------------------------

JJMobile.el = function(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
};

JJMobile.tap = function(node, fn) {
  node.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  });
  return node;
};

JJMobile.button = function(cls, text, fn) {
  var b = JJMobile.el('button', cls, text);
  b.type = 'button';
  return JJMobile.tap(b, fn);
};

// The terminal code listens to clicks, mouse and keys on the whole window
// (and cancels form submits, takes Enter...). Nothing in the phone UI is for
// it, so events stop here.
JJMobile.EVENTS = ['click', 'mousedown', 'mouseup', 'mousemove', 'mouseover', 'keydown', 'keypress', 'keyup', 'input', 'paste'];
JJMobile.isolate = function(node) {
  JJMobile.EVENTS.forEach(function(t) {
    node.addEventListener(t, function(e) { e.stopPropagation(); });
  });
};

JJMobile.store = function(key, value) {
  try {
    if (value === undefined) return JSON.parse(window.localStorage.getItem(key) || 'null');
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
  return null;
};

// ---- start ----------------------------------------------------------------------

JJMobile.prototype.setup = function() {
  if (!this.enabled()) return;
  var self = this;
  var el = JJMobile.el;
  document.body.classList.add('jj-mobile');
  this.root = el('div', 'jjm');
  this.bar = el('div', 'jjm-bar');
  this.backBtn = JJMobile.button('jjm-icon jjm-back', '‹', function() { self.back(); });
  this.titleEl = el('div', 'jjm-title');
  this.actions = el('div', 'jjm-actions');
  this.bar.appendChild(this.backBtn);
  this.bar.appendChild(this.titleEl);
  this.bar.appendChild(this.actions);
  this.root.appendChild(this.bar);
  this.views = el('div', 'jjm-views');
  this.root.appendChild(this.views);
  document.body.appendChild(this.root);
  JJMobile.isolate(this.root);
  this.app.modalShown = true;  // the terminal's key handling stays out of the way
  this.setFont(JJMobile.store(JJMobile.FONT_KEY) || 17);

  // the phone's back button
  var C = window.Capacitor;
  var appPlugin = C && C.Plugins && C.Plugins.App;
  if (appPlugin && appPlugin.addListener) {
    appPlugin.addListener('backButton', function() {
      if ($('#prefModal').is(':visible')) $('#prefModal').modal('hide');
      else if (self.sheet) self.closeSheet();
      else if (self.stack.length > 1) self.back();
      else if (appPlugin.exitApp) appPlugin.exitApp();
    });
  }
};

JJMobile.prototype.start = function() {
  this.open({ type: 'home' });
};

JJMobile.prototype.setFont = function(px) {
  this.fontPx = px;
  this.root.style.setProperty('--jjm-fs', px + 'px');
  JJMobile.store(JJMobile.FONT_KEY, px);
};

// ---- screens ----------------------------------------------------------------------

// Opens a screen on top; the one below keeps its place for when you go back.
JJMobile.prototype.open = function(screen) {
  var top = this.stack[this.stack.length - 1];
  if (top) top.view.style.display = 'none';
  screen.view = JJMobile.el('div', 'jjm-view');
  this.views.appendChild(screen.view);
  this.stack.push(screen);
  this.render(screen);
};

// Swaps the screen on show for another (next article...).
JJMobile.prototype.replace = function(screen) {
  var top = this.stack.pop();
  if (top) top.view.remove();
  this.open(screen);
};

JJMobile.prototype.back = function() {
  if (this.stack.length < 2) return;
  this.stack.pop().view.remove();
  var top = this.stack[this.stack.length - 1];
  top.view.style.display = '';
  this.setBar(top);
  if (top.type === 'board' && top.listNode) this.markRead(top);
};

JJMobile.prototype.render = function(screen) {
  this.setBar(screen);
  if (screen.type === 'home') this.renderHome(screen);
  else if (screen.type === 'board') this.renderBoard(screen);
  else if (screen.type === 'article') this.renderArticle(screen);
};

JJMobile.prototype.setBar = function(screen) {
  var self = this;
  this.backBtn.style.visibility = this.stack.length > 1 ? 'visible' : 'hidden';
  this.titleEl.textContent = screen.title || 'JJptt';
  this.actions.innerHTML = '';
  var add = function(text, label, fn) {
    var b = JJMobile.button('jjm-icon', text, fn);
    b.setAttribute('aria-label', label);
    self.actions.appendChild(b);
    return b;
  };
  if (screen.type === 'board') {
    var fav = this.isFav(screen.board);
    var star = add(fav ? '★' : '☆', '我的看板', function() {
      self.toggleFav(screen.board, screen.boardTitle);
      star.textContent = self.isFav(screen.board) ? '★' : '☆';
    });
    star.classList.toggle('jjm-on', fav);
    add('⌕', '搜尋', function() { self.searchSheet(screen); });
    add('⟳', '重新整理', function() { self.reload(screen); });
  } else if (screen.type === 'article') {
    add('Aa', '字的大小', function() { self.fontSheet(); });
    add('⟳', '重新整理', function() { self.reload(screen); });
  } else {
    add('⚙', '設定', function() { self.openSettings(); });
  }
};

JJMobile.prototype.reload = function(screen) {
  if (screen.type === 'article') delete this.articles[screen.url];
  screen.view.innerHTML = '';
  screen.view.scrollTop = 0;
  this.render(screen);
};

JJMobile.prototype.openSettings = function() {
  var pref = this.app.pref;
  if (pref && pref.updateSettingsToUi) pref.updateSettingsToUi();
  $('#prefModal').modal('show');
};

JJMobile.prototype.loading = function(parent, text) {
  var n = JJMobile.el('div', 'jjm-loading', text || '載入中…');
  parent.appendChild(n);
  return n;
};

JJMobile.prototype.failed = function(parent, err, retry) {
  var box = JJMobile.el('div', 'jjm-error');
  box.appendChild(JJMobile.el('div', '', (err && err.message) || '載入失敗'));
  if (retry) box.appendChild(JJMobile.button('jjm-btn', '再試一次', retry));
  parent.appendChild(box);
};

// ---- home: boards -------------------------------------------------------------------

JJMobile.prototype.favs = function() {
  var f = JJMobile.store(JJMobile.FAVS_KEY);
  return Array.isArray(f) ? f : [];
};

JJMobile.prototype.isFav = function(board) {
  var b = String(board).toLowerCase();
  return this.favs().some(function(f) { return f.name.toLowerCase() === b; });
};

JJMobile.prototype.toggleFav = function(board, title) {
  var b = String(board).toLowerCase();
  var f = this.favs();
  var i = -1;
  f.forEach(function(x, k) { if (x.name.toLowerCase() === b) i = k; });
  if (i >= 0) f.splice(i, 1);
  else f.push({ name: board, title: title || '' });
  JJMobile.store(JJMobile.FAVS_KEY, f);
  if (this.app.showToast) this.app.showToast(i >= 0 ? '已從我的看板移除' : '已加入我的看板', 1500);
};

JJMobile.prototype.renderHome = function(screen) {
  var self = this;
  var el = JJMobile.el;
  var v = screen.view;
  screen.title = 'JJptt';
  this.titleEl.textContent = 'JJptt';

  var form = el('form', 'jjm-search');
  var input = el('input');
  input.type = 'search';
  input.placeholder = '輸入看板名稱，例如 Gossiping';
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('enterkeyhint', 'go');
  form.appendChild(input);
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var name = input.value.trim().replace(/^\/?bbs\//i, '').replace(/[^\w-]/g, '');
    if (!name) return;
    input.blur();
    self.open({ type: 'board', board: name });
  });
  v.appendChild(form);

  var favs = this.favs();
  v.appendChild(el('div', 'jjm-section', '我的看板'));
  var favList = el('div', 'jjm-list');
  if (!favs.length) {
    favList.appendChild(el('div', 'jjm-hint', '在看板裡按右上角的 ☆，就會加到這裡。'));
  }
  favs.forEach(function(f) { favList.appendChild(self.boardRow(f.name, f.title, '')); });
  v.appendChild(favList);

  v.appendChild(el('div', 'jjm-section', '熱門看板'));
  var hot = el('div', 'jjm-list');
  v.appendChild(hot);
  var wait = this.loading(hot);
  this.app.reader.fetchDoc(JJMobile.WEB + '/bbs/hotboards.html').then(function(doc) {
    wait.remove();
    var rows = doc.querySelectorAll('.b-ent a.board');
    for (var i = 0; i < rows.length; ++i) {
      var a = rows[i];
      var name = (a.querySelector('.board-name') || {}).textContent || '';
      var title = ((a.querySelector('.board-title') || {}).textContent || '').replace(/^◎/, '');
      var users = ((a.querySelector('.board-nuser') || {}).textContent || '').trim();
      if (name) hot.appendChild(self.boardRow(name.trim(), title.trim(), users));
    }
  }).catch(function(err) {
    wait.remove();
    self.failed(hot, err, function() { self.reload(screen); });
  });
};

JJMobile.prototype.boardRow = function(name, title, users) {
  var self = this;
  var el = JJMobile.el;
  var row = el('button', 'jjm-row jjm-board');
  row.type = 'button';
  var main = el('div', 'jjm-row-main');
  main.appendChild(el('div', 'jjm-row-title', name));
  if (title) main.appendChild(el('div', 'jjm-row-sub', title));
  row.appendChild(main);
  if (users) row.appendChild(el('div', 'jjm-badge', users));
  return JJMobile.tap(row, function() { self.open({ type: 'board', board: name, boardTitle: title }); });
};

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
      if (first && page.pinned.length) {
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
  var kind = '';
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
      input.focus();
    });
    chips.appendChild(c);
  });
  box.appendChild(chips);
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

// ---- article ------------------------------------------------------------------------

JJMobile.prototype.renderArticle = function(screen) {
  var self = this;
  var v = screen.view;
  v.classList.add('jjm-reading');
  this.readUrls = this.readUrls || {};
  this.readUrls[screen.url] = true;
  var wait = this.loading(v);
  this.getArticle(screen.url).then(function(article) {
    if (!v.isConnected) return;
    wait.remove();
    self.fillArticle(screen, article);
    if (screen.list) self.prefetchList(screen.list, screen.index + 1);
  }).catch(function(err) {
    wait.remove();
    self.failed(v, err, function() { self.reload(screen); });
  });
  this.swipeArticles(screen);
};

JJMobile.prototype.fillArticle = function(screen, article) {
  var self = this;
  var el = JJMobile.el;
  var reader = this.app.reader;
  var v = screen.view;
  var meta = article.meta || {};
  screen.article = article;

  var head = el('div', 'jjm-head');
  head.appendChild(el('h1', 'jjm-head-title', meta['標題'] || ''));
  var info = el('div', 'jjm-head-info');
  var author = String(meta['作者'] || '').split(' ')[0];
  if (author) info.appendChild(this.userChip(author, screen));
  if (meta['看板']) info.appendChild(el('span', '', meta['看板']));
  if (meta['時間']) info.appendChild(el('span', '', this.shortTime(meta['時間'])));
  head.appendChild(info);
  v.appendChild(head);

  var fact = { tags: [], report: [] };
  if (this.app.factCheck) {
    try { fact = this.app.factCheck.analyze(article); } catch (e) { console.log('fact check', e); }
  }
  reader.factReport = fact.report;
  var pushes = this.pushInfo(article, fact);

  var body = el('div', 'jjm-body');
  var lines = PttReader.toLines(article.body);
  var pv = this.app.pref && this.app.pref.values;
  if (!(pv && pv.readerGroupRuns === false)) PttReader.groupRuns(lines, article.pushes);
  var pushList = null;
  for (var i = 0; i < lines.length; ++i) {
    var line = lines[i];
    if (line.push_index !== undefined) {
      if (!pushList) {
        var rep = reader.factReportNode(article);
        if (rep) {
          rep.classList.add('jjm-fact');
          v.appendChild(body);
          v.appendChild(rep);
        }
        var count = (article.pushes || []).length;
        var title = el('div', 'jjm-section', '推文 ' + count);
        if (!rep) v.appendChild(body);
        v.appendChild(title);
        pushList = el('div', 'jjm-pushes');
        v.appendChild(pushList);
      }
      var node = pushes[line.push_index];
      if (node) pushList.appendChild(node);
      continue;
    }
    if (pushList) continue;  // "※ 編輯" lines among the pushes: left out
    if (!body.firstChild && !line.length) continue;  // blank lines where the header was
    var r = reader.lineNode(line);
    body.appendChild(r.node);
    var text = r.node.textContent.trim();
    if (/^[:：]/.test(text)) r.node.classList.add('jjm-quote');       // quoting someone
    else if (/^※|^--$/.test(text)) r.node.classList.add('jjm-sys');   // 發信站, 編輯, signature line
    if (!/^[:：]/.test(text) && !/^※/.test(text)) {
      for (var u = 0; u < r.urls.length; ++u) body.appendChild(reader.linkBlock(r.urls[u], true));
    }
  }
  if (!pushList) v.appendChild(body);
  reader.loadPreviews(v);

  // the end: previous / next in the list
  var nav = el('div', 'jjm-endnav');
  var list = screen.list;
  if (list && screen.index > 0) {
    nav.appendChild(JJMobile.button('jjm-btn', '‹ 上一篇', function() { self.step(screen, -1); }));
  }
  nav.appendChild(JJMobile.button('jjm-btn', '回列表', function() { self.back(); }));
  if (list && (screen.index + 1 < list.entries.length || list.older)) {
    nav.appendChild(JJMobile.button('jjm-btn jjm-btn-main', '下一篇 ›', function() { self.step(screen, 1); }));
  }
  v.appendChild(nav);
};

JJMobile.prototype.shortTime = function(t) {
  var d = new Date(Date.parse(t));
  if (isNaN(d)) return t;
  var p = function(n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};

// Previous / next article of the list (dir -1 / +1), loading older pages
// when needed.
JJMobile.prototype.step = function(screen, dir) {
  var self = this;
  var list = screen.list;
  if (!list) return;
  var i = screen.index + dir;
  while (list.entries[i] && !list.entries[i].url) i += dir;  // deleted ones
  if (i < 0) return;
  if (i >= list.entries.length) {
    if (!list.older) return;
    list.loadMore();
    if (this.app.showToast) this.app.showToast('載入更早的文章…', 1200);
    return;
  }
  var e = list.entries[i];
  this.replace({ type: 'article', url: e.url, list: list, index: i, title: list.board, enter: dir });
};

// Swipe left: next article, swipe right: previous (scrolling stays the
// phone's own).
JJMobile.prototype.swipeArticles = function(screen) {
  var self = this;
  if (typeof Hammer === 'undefined' || !screen.list) return;
  var ham = new Hammer.Manager(screen.view, {
    recognizers: [[Hammer.Pan, { direction: Hammer.DIRECTION_HORIZONTAL, threshold: 20 }]]
  });
  ham.on('panend', function(ev) {
    if (Math.abs(ev.deltaX) < 90 || Math.abs(ev.deltaX) < Math.abs(ev.deltaY) * 2) return;
    self.step(screen, ev.deltaX < 0 ? 1 : -1);
  });
};

// ---- pushes ---------------------------------------------------------------------------

// One node per push: who, what, when, and what the insights / fact check
// say about them -- the same findings as the extension, laid out for a phone.
JJMobile.prototype.pushInfo = function(article, fact) {
  var self = this;
  var el = JJMobile.el;
  var reader = this.app.reader;
  var pref = this.app.pref;
  var insights = this.app.pushInsights;
  var geo = insights.geo;
  var T = insights.hintTexts();
  var isBlack = function(id) { return !!(pref && pref.enableBlacklist && pref.isBlacklisted(id)); };
  var hide = pref && pref.hideBlacklisted;
  var watch = (pref && pref.watchlistedUserIds) || {};
  var notes = (pref && pref.values.customListEnabled !== false && pref.notedUserIds) || {};
  var authorId = String(article.meta['作者'] || '').split(' ')[0].toLowerCase();
  var authorIpMatch = /來自: ((?:\d{1,3}\.){3}\d{1,3})/.exec(article.text);
  var authorIp = authorIpMatch ? authorIpMatch[1] : '';
  var idsByIp = {}, countById = {}, repeatColors = {};
  article.pushes.forEach(function(p) {
    var id = p.id.toLowerCase();
    countById[id] = (countById[id] || 0) + 1;
    if (p.ip) (idsByIp[p.ip] = idsByIp[p.ip] || {})[id] = true;
  });
  var out = [];
  article.pushes.forEach(function(p, i) {
    var id = p.id.toLowerCase();
    var black = isBlack(id);
    if (black && hide) return;
    var chips = [];   // [text, level]
    var level = '';
    var flag = '';
    if (p.ip && geo.ready) {
      var cc = geo.lookup(p.ip);
      if (cc) {
        flag = PushInsights.flagEmoji(cc);
        if (cc !== 'TW') level = 'foreign';
      }
    }
    if (p.ip) {
      var others = Object.keys(idsByIp[p.ip] || {}).filter(function(x) { return x !== id; });
      if (others.length && pref.values.factSameIp !== false) {
        chips.push([T.sameIp + '：' + others.slice(0, 2).join('、') + (others.length > 2 ? ' 等 ' + others.length + ' 人' : ''), 'warn']);
        level = 'warn';
      }
      if (authorIp && p.ip === authorIp && id !== authorId && pref.values.factAuthorIp !== false) {
        chips.push([T.authorIp, 'warn']);
        level = 'warn';
      }
    }
    if (id in watch && pref.values.watchlistEnabled !== false) {
      chips.push([T.watch + (watch[id] ? '：' + watch[id] : ''), 'watch']);
      if (level !== 'warn') level = 'watch';
    }
    if (id in notes) {
      chips.push([pref.customListName() + (notes[id] ? '：' + notes[id] : ''), 'note']);
      if (!level || level === 'foreign') level = 'note';
    }
    (fact.tags[i] || []).forEach(function(t) {
      chips.push([t.t, t.lvl === 'grey' ? 'grey' : t.lvl === 'warn' ? 'warn' : 'watch']);
      if (t.lvl === 'warn') level = 'warn';
    });

    var row = el('div', 'jjm-push' + (black ? ' jjm-faded' : ''));
    if (level) row.setAttribute('data-level', level);
    var head = el('div', 'jjm-push-head');
    var tagCls = p.tag === '推' ? 'up' : p.tag === '噓' ? 'down' : 'arrow';
    head.appendChild(el('span', 'jjm-push-tag jjm-push-' + tagCls, p.tag === '→' ? '→' : p.tag));
    var who = self.userChip(p.id, null, true);
    PushInsights.setRepeatColor(who, insights.repeatColor(repeatColors, id, countById[id]));
    head.appendChild(who);
    head.appendChild(el('span', 'jjm-push-time', [flag, p.time].filter(Boolean).join(' ')));
    head.appendChild(el('span', 'jjm-push-floor', (i + 1) + '樓'));
    row.appendChild(head);
    var content = reader.lineNode([{ text: p.content, st: { fg: 7, bg: 0, hl: false, href: '' } }]);
    content.node.className = 'jjm-push-text';
    row.appendChild(content.node);
    if (chips.length) {
      var cr = el('div', 'jjm-push-chips');
      chips.forEach(function(c) { cr.appendChild(el('span', 'jjm-pchip jjm-pchip-' + c[1], c[0])); });
      row.appendChild(cr);
    }
    if (!black) {
      content.urls.forEach(function(u) {
        if (PttReader.imageSrc(u)) row.appendChild(reader.linkBlock(u, true));
      });
    }
    out[i] = row;
  });
  return out;
};

// ---- people: tap an ID for lists / search -------------------------------------------

JJMobile.prototype.userChip = function(id, screen, inPush) {
  var self = this;
  var chip = JJMobile.button(inPush ? 'jjm-push-id' : 'jjm-user', id, function() { self.userSheet(id, screen); });
  return chip;
};

JJMobile.prototype.userSheet = function(id, screen) {
  var self = this;
  var app = this.app;
  var pref = app.pref;
  var lid = String(id).toLowerCase();
  var el = JJMobile.el;
  var box = el('div', 'jjm-sheet-list');
  var item = function(text, fn) {
    box.appendChild(JJMobile.button('jjm-sheet-item', text, function() {
      self.closeSheet();
      fn();
      self.refreshArticle();
    }));
  };
  if (pref.isBlacklisted(lid)) item('移出黑名單', function() { app.doRemoveBlacklistUserId(lid); });
  else item('加入黑名單', function() { app.doAddBlacklistUserId(lid); });
  if (lid in (pref.watchlistedUserIds || {})) item('移出觀察名單', function() { app.doRemoveWatchUserId(lid); });
  else item('加入觀察名單…', function() { app.doAddWatchUserId(lid); });
  var listName = pref.customListName();
  if (lid in (pref.notedUserIds || {})) item('移出' + listName, function() { app.doRemoveUserNote(lid); });
  else item('加入' + listName + '…', function() { app.doSetUserNote(lid); });
  var board = this.currentBoard();
  if (board) {
    box.appendChild(JJMobile.button('jjm-sheet-item', '看 ' + id + ' 在 ' + board + ' 的文章', function() {
      self.closeSheet();
      self.open({ type: 'board', board: board, query: 'author:' + id });
    }));
  }
  box.appendChild(JJMobile.button('jjm-sheet-item', '複製帳號', function() {
    self.closeSheet();
    app.reader.copyText(id);
  }));
  this.showSheet(id, box);
};

JJMobile.prototype.currentBoard = function() {
  for (var i = this.stack.length - 1; i >= 0; --i) {
    var s = this.stack[i];
    if (s.type === 'board') return s.board;
    if (s.type === 'article' && s.article && s.article.meta['看板']) return s.article.meta['看板'];
  }
  return '';
};

// After a list change: draw the open article again (same scroll position).
JJMobile.prototype.refreshArticle = function() {
  var top = this.stack[this.stack.length - 1];
  if (!top || top.type !== 'article' || !top.article) return;
  var y = top.view.scrollTop;
  top.view.innerHTML = '';
  this.fillArticle(top, top.article);
  top.view.scrollTop = y;
};

// ---- bottom sheets --------------------------------------------------------------------

JJMobile.prototype.showSheet = function(title, content) {
  var self = this;
  var el = JJMobile.el;
  this.closeSheet();
  var shade = el('div', 'jjm-shade');
  var sheet = el('div', 'jjm-sheet');
  sheet.appendChild(el('div', 'jjm-sheet-grip'));
  if (title) sheet.appendChild(el('div', 'jjm-sheet-title', title));
  sheet.appendChild(content);
  shade.appendChild(sheet);
  shade.addEventListener('click', function(e) { if (e.target === shade) self.closeSheet(); });
  JJMobile.isolate(shade);
  document.body.appendChild(shade);
  this.sheet = shade;
};

JJMobile.prototype.closeSheet = function() {
  if (this.sheet) this.sheet.remove();
  this.sheet = null;
};

JJMobile.prototype.fontSheet = function() {
  var self = this;
  var box = JJMobile.el('div', 'jjm-chips jjm-font');
  [['小', 15], ['中', 17], ['大', 19], ['特大', 22]].forEach(function(f) {
    var b = JJMobile.button('jjm-chip' + (self.fontPx === f[1] ? ' jjm-on' : ''), f[0], function() {
      self.setFont(f[1]);
      self.closeSheet();
    });
    b.style.fontSize = f[1] + 'px';
    box.appendChild(b);
  });
  this.showSheet('字的大小', box);
};
