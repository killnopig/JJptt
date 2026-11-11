// JJptt reader: shows the article being read in the terminal as a modern,
// phone-app style page (flowing text, inline images, link cards, pushes with
// floors / country / hints). The content comes from the PTT web site
// (www.ptt.cc), which has the full article in a structured form; the
// terminal stays underneath for pushing, replying and navigation.
//
// Only the extension can do this: the website version cannot fetch
// www.ptt.cc (no CORS), and boards hidden from the web are not available.
function PttReader(app) {
  this.app = app;
  this.enabled = true;
  this.overlay = null;
  this.currentKey = '';
  this.dismissedKey = '';
  this.loadingKey = '';
  this.article = null;
  this.cookieReady = null;
}

PttReader.WEB = 'https://www.ptt.cc';
// back to the list, move up / down, open (what you would type in PTT)
PttReader.KEYS_PREV = '\x1b[D\x1b[A\x1b[C';
PttReader.KEYS_NEXT = '\x1b[D\x1b[B\x1b[C';

PttReader.prototype.available = function() {
  return lib.isExtension() && typeof DOMParser !== 'undefined';
};

PttReader.prototype.setEnabled = function(enabled) {
  this.enabled = !!enabled;
  if (!this.enabled) this.close();
};

// ---- terminal side -------------------------------------------------------

// Article header on the terminal's first page:
//   " 作者  BIA (必亞)                     看板  Gossiping"
//   " 標題  [問卦] ..."
//   " 時間  Sat Oct 24 21:51:19 2026"
PttReader.prototype.headerFromTerminal = function() {
  var buf = this.app.buf;
  if (buf.pageState != 3) return null;
  var r0 = buf.getRowText(0, 0, buf.cols);
  var r1 = buf.getRowText(1, 0, buf.cols);
  var r2 = buf.getRowText(2, 0, buf.cols);
  var m0 = /^\s*作者\s+(\w+)(?:.*?看板\s+(\w+))?/.exec(r0);
  var m1 = /^\s*標題\s+(.*?)\s*$/.exec(r1);
  var m2 = /^\s*時間\s+(.*?)\s*$/.exec(r2);
  if (!m0 || !m1) return null;
  // The board name can be pushed off the header row (long nicknames); fall
  // back to the board of the list we came from.
  var board = m0[2] || this.lastBoard;
  if (!board) return null;
  return { author: m0[1], board: board, title: m1[1], time: m2 ? m2[1] : '' };
};

// Called after every terminal redraw.
// Remembers the current board (list header "看板《Gossiping》") and the
// article's web URL when "※ 文章網址: ..." is on screen.
PttReader.prototype.trackTerminal = function() {
  var buf = this.app.buf;
  if (buf.pageState == 2) {
    var m = /看板《(\w+)》/.exec(buf.getRowText(0, 0, buf.cols));
    if (m) this.lastBoard = m[1];
    this.lastHeader = null;
    this.lastUrl = '';
    if (this.enabled && this.available()) this.schedulePrefetch();
  } else if (buf.pageState == 3) {
    var h = this.headerFromTerminal();
    if (h) {
      var key = h.board + '|' + h.author + '|' + h.title;
      if (!this.lastHeader || this.lastHeader.key !== key) this.lastUrl = '';
      h.key = key;
      this.lastHeader = h;
    }
    for (var r = 0; r < 23; ++r) {
      var u = /※ 文章網址: (https?:\/\/www\.ptt\.cc\/bbs\/\S+\.html)/.exec(buf.getRowText(r, 0, buf.cols));
      if (u) this.lastUrl = u[1].replace(/^http:/, 'https:');
    }
  }
};

// Right-click → 用閱讀模式開啟: open even if it failed or was closed before.
PttReader.prototype.openManually = function() {
  if (!this.available()) return;
  this.trackTerminal();
  var h = this.headerFromTerminal() || this.lastHeader;
  if (!h) {
    this.app.showToast(i18n('reader_needFirstPage'), 4000);
    return;
  }
  var key = h.board + '|' + h.author + '|' + h.title;
  this.dismissedKey = '';
  this.currentKey = '';
  this.openFor(h, key, true);
};

PttReader.prototype.onTerminalUpdate = function() {
  if (!this.available()) return;
  this.trackTerminal();
  if (!this.enabled) return;
  if (this.app.buf.pageState != 3) {
    // left the article: allow it to open again next time
    this.dismissedKey = '';
    if (this.loadingKey) {
      this.loadingKey = '';
      this.setLoading(false);
    }
    if (this.overlay && this.overlay.style.display !== 'none') this.close();
    return;
  }
  var h = this.headerFromTerminal();
  if (!h) return;
  var key = h.board + '|' + h.author + '|' + h.title;
  if (key === this.currentKey || key === this.dismissedKey || key === this.loadingKey) return;
  this.openFor(h, key);
};

// ---- fetching ------------------------------------------------------------

// Boards such as Gossiping ask "are you over 18?". Answer it by sending the
// over18 cookie: a session rule adds it to our requests to www.ptt.cc (this
// works even when third-party cookies are blocked), and the cookie itself is
// set as a fallback.
PttReader.prototype.ensureOver18 = function() {
  if (this.cookieReady) return this.cookieReady;
  var addRule = new Promise(function(resolve) {
    var dnr = chrome.declarativeNetRequest;
    if (!(dnr && dnr.updateSessionRules)) {
      resolve();
      return;
    }
    dnr.updateSessionRules({
      removeRuleIds: [1801],
      addRules: [{
        id: 1801,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'cookie', operation: 'set', value: 'over18=1' }]
        },
        condition: { urlFilter: '||www.ptt.cc/', resourceTypes: ['xmlhttprequest'] }
      }]
    }, function() {
      if (chrome.runtime.lastError) console.log('over18 rule:', chrome.runtime.lastError.message);
      resolve();
    });
  });
  var setCookie = new Promise(function(resolve) {
    if (!(chrome.cookies && chrome.cookies.set)) {
      resolve();
      return;
    }
    chrome.cookies.set({
      url: PttReader.WEB + '/',
      name: 'over18',
      value: '1',
      secure: true,
      sameSite: 'no_restriction',
      expirationDate: Math.floor(Date.now() / 1000) + 365 * 86400
    }, function() { resolve(); });
  });
  this.cookieReady = Promise.all([addRule, setCookie]);
  return this.cookieReady;
};

PttReader.prototype.fetchDoc = function(url) {
  return this.ensureOver18().then(function() {
    return fetch(url, { credentials: 'include' });
  }).then(function(res) {
    if (/\/ask\/over18/.test(res.url)) throw new Error(i18n('reader_err_over18'));
    if (res.status === 404) throw new Error(i18n('reader_err_notOnWeb'));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }).then(function(html) {
    return new DOMParser().parseFromString(html, 'text/html');
  });
};

PttReader.normalizeTitle = function(t) {
  return String(t || '').replace(/\s+/g, ' ').trim();
};

// Finds the article by searching the board for the author's posts. The
// terminal cuts long titles at the screen edge, so titles are compared by
// prefix and the post time (from the article page) decides between matches.
PttReader.prototype.findArticle = function(h) {
  var self = this;
  var want = PttReader.normalizeTitle(h.title);
  var candidates = [];
  var search = function(page) {
    var url = PttReader.WEB + '/bbs/' + encodeURIComponent(h.board) +
      '/search?q=' + encodeURIComponent('author:' + h.author) + (page > 1 ? '&page=' + page : '');
    return self.fetchDoc(url).then(function(doc) {
      var ents = doc.querySelectorAll('.r-ent');
      for (var i = 0; i < ents.length; ++i) {
        var a = ents[i].querySelector('.title a');
        if (!a) continue;
        var t = PttReader.normalizeTitle(a.textContent);
        if (t === want || (want.length >= 6 && (t.indexOf(want) === 0 || want.indexOf(t) === 0))) {
          candidates.push(PttReader.WEB + a.getAttribute('href'));
        }
      }
      if (!candidates.length && page < 3 && ents.length) return search(page + 1);
      return candidates;
    });
  };
  var tryNext = function(list) {
    if (!list.length) throw new Error(i18n('reader_err_notFound'));
    return self.fetchArticle(list[0]).then(function(article) {
      var t = PttReader.normalizeTitle(article.meta['時間']);
      if (h.time && t && t !== PttReader.normalizeTitle(h.time) && list.length > 1) {
        return tryNext(list.slice(1));
      }
      return article;
    });
  };
  var ts = Date.now();
  return search(1).then(function(list) {
    console.log('JJptt 搜尋文章網址 ' + (Date.now() - ts) + 'ms');
    return tryNext(list);
  });
};

// ---- prefetch from the article list ------------------------------------------
// While the cursor rests on an article in the list, fetch it in the
// background so that it is ready when Enter is pressed.

PttReader.prefetchKey = function(board, author, title) {
  var t = PttReader.normalizeTitle(title).replace(/^(?:Re|R|Fw|轉)\s*:\s*/i, '');
  return (board + '|' + author + '|' + t).toLowerCase();
};

// Remembers the articles visible in the list (also in filtered views such
// as "推文數 ≥ 10") and where the cursor is, to know the neighbours of the
// article being read.
PttReader.prototype.snapshotList = function() {
  var buf = this.app.buf;
  var rows = [], cursor = -1;
  for (var r = 3; r < 23; ++r) {
    var text = buf.getRowText(r, 0, buf.cols);
    var author = text.parseThreadForUserId();
    var title = text.parseThreadTitle();
    if (!author || !title) continue;
    if (/^[>●]/.test(text)) cursor = rows.length;
    rows.push({ author: author, title: title });
  }
  if (cursor >= 0 && this.lastBoard) this.listSnap = { board: this.lastBoard, rows: rows, index: cursor };
};

// Starts fetching an article in the background (no-op if already cached).
PttReader.prototype.startPrefetch = function(board, author, title) {
  var self = this;
  var key = PttReader.prefetchKey(board, author, title);
  this.prefetch = this.prefetch || {};
  var have = this.prefetch[key];
  if (have && Date.now() - have.at < PttReader.PREFETCH_TTL) return;
  var h = { board: board, author: author, title: title.replace(/^(?:R|Re|Fw|轉)\s*:\s*/i, 'Re: '), time: '' };
  var p = this.findArticle(h);
  p.catch(function() { delete self.prefetch[key]; });
  this.prefetch[key] = { promise: p, at: Date.now(), board: board.toLowerCase(), author: author.toLowerCase(),
                         title: PttReader.prefetchKey('', '', title).slice(2) };
  var keys = Object.keys(this.prefetch);
  if (keys.length > 25) delete this.prefetch[keys[0]];
};

PttReader.PREFETCH_TTL = 180000;

// Setting: how many articles above / below to load ahead (0 = off).
PttReader.prototype.prefetchCount = function() {
  var pref = this.app.pref;
  var n = parseInt(pref && pref.values ? pref.values.readerPrefetchCount : 1, 10);
  if (isNaN(n)) n = 1;
  return Math.max(0, Math.min(5, n));
};

// In the list: fetch the article under the cursor once it rests there.
PttReader.prototype.schedulePrefetch = function() {
  var self = this;
  if (!this.prefetchCount()) return;
  if (this.app.buf.pageState != 2 || !this.lastBoard) return;
  this.snapshotList();
  var snap = this.listSnap;
  if (!snap || snap.board !== this.lastBoard) return;
  var cur = snap.rows[snap.index];
  var key = PttReader.prefetchKey(snap.board, cur.author, cur.title);
  if (key === this.prefetchPending) return;
  this.prefetchPending = key;
  clearTimeout(this.prefetchTimer);
  this.prefetchTimer = setTimeout(function() {
    self.startPrefetch(snap.board, cur.author, cur.title);
  }, 400);
};

// While reading: fetch the previous and next article of the list.
PttReader.prototype.prefetchNeighbours = function(h) {
  var snap = this.listSnap;
  if (!snap || String(snap.board).toLowerCase() !== String(h.board).toLowerCase()) return;
  var cur = snap.rows[snap.index];
  if (!cur || cur.author.toLowerCase() !== String(h.author).toLowerCase()) return;
  var self = this;
  var n = this.prefetchCount();
  var idx = [];
  for (var d = 1; d <= n; ++d) idx.push(snap.index - d, snap.index + d);
  idx.forEach(function(i) {
    var row = snap.rows[i];
    if (row) self.startPrefetch(snap.board, row.author, row.title);
  });
};

// Prefetched article for this header, if fresh (pushes keep coming in).
PttReader.prototype.takePrefetch = function(h) {
  if (!this.prefetch) return null;
  // list and header both cut long titles, so compare by prefix
  var want = PttReader.prefetchKey('', '', h.title).slice(2);
  var key = null, hit = null;
  for (var k in this.prefetch) {
    var c = this.prefetch[k];
    if (c.board !== String(h.board).toLowerCase() || c.author !== String(h.author).toLowerCase()) continue;
    if (c.title === want || (Math.min(c.title.length, want.length) >= 6 &&
        (c.title.indexOf(want) === 0 || want.indexOf(c.title) === 0))) {
      key = k;
      hit = c;
      break;
    }
  }
  if (!hit || Date.now() - hit.at > PttReader.PREFETCH_TTL) return null;
  delete this.prefetch[key];
  return hit.promise.then(function(article) {
    var t = PttReader.normalizeTitle(article.meta['時間']);
    if (h.time && t && t !== PttReader.normalizeTitle(h.time)) throw new Error('prefetch mismatch');
    return article;
  });
};

PttReader.prototype.fetchArticle = function(url) {
  var self = this;
  return this.fetchDoc(url).then(function(doc) {
    var main = doc.getElementById('main-content');
    if (!main) throw new Error('no article content');
    var meta = {};
    var metas = main.querySelectorAll('.article-metaline, .article-metaline-right');
    for (var i = 0; i < metas.length; ++i) {
      var tag = metas[i].querySelector('.article-meta-tag');
      var val = metas[i].querySelector('.article-meta-value');
      if (tag && val) meta[tag.textContent.trim()] = val.textContent.trim();
    }
    var pushes = [];
    var pushNodes = main.querySelectorAll('.push');
    for (var j = 0; j < pushNodes.length; ++j) {
      var n = pushNodes[j];
      var tagEl = n.querySelector('.push-tag');
      var idEl = n.querySelector('.push-userid');
      if (!tagEl || !idEl) continue;  // e.g. "檔案過大！部分文章無法顯示"
      n.setAttribute('data-push-index', pushes.length);
      var contentEl = n.querySelector('.push-content');
      var ipdt = (n.querySelector('.push-ipdatetime') || {}).textContent || '';
      var ipm = /((?:\d{1,3}\.){3}\d{1,3})/.exec(ipdt);
      pushes.push({
        tag: tagEl.textContent.trim(),
        id: idEl.textContent.trim(),
        content: (contentEl ? contentEl.textContent : '').replace(/^:\s?/, ''),
        ip: ipm ? ipm[1] : '',
        time: ipdt.replace(ipm ? ipm[1] : '', '').trim()
      });
    }
    var body = main.cloneNode(true);
    // pushes stay in place (marked with data-push-index) so that "※ 編輯"
    // lines between them keep their position and line numbers stay right
    var drop = body.querySelectorAll('.article-metaline, .article-metaline-right, .richcontent, .push:not([data-push-index])');
    for (var k = 0; k < drop.length; ++k) drop[k].parentNode.removeChild(drop[k]);
    var article = { url: url, meta: meta, text: body.textContent, body: body, pushes: pushes };
    if (self.app.spamGuard) {
      try { self.app.spamGuard.record(article); } catch (e) { console.log('spam guard', e); }
    }
    if (self.app.factCheck) {
      try { self.app.factCheck.analyze(article); } catch (e) { console.log('fact check', e); }
    }
    return article;
  });
};

// ---- rendering -----------------------------------------------------------

PttReader.prototype.ensureOverlay = function() {
  if (this.overlay) return this.overlay;
  var self = this;
  var o = document.createElement('div');
  o.id = 'jjReader';
  o.className = 'jjr-root jjt-root';
  o.tabIndex = -1;
  o.innerHTML = '<div class="jjt-scroll"><div class="jjt-page"></div></div><div class="jjt-status"></div>';
  document.body.appendChild(o);
  // Keys are taken at the document level while the view is open, so they
  // keep working wherever focus went (clicked image, link, ...).
  document.addEventListener('keydown', function(e) {
    if (!self.isOpen()) return;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if ($('#prefModal').is(':visible')) return;
    // Ctrl/Cmd+C with text selected: copy it here so the terminal's own
    // key handling never gets the key.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.keyCode === 67 || e.key === 'c')) {
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        e.preventDefault();
        e.stopPropagation();
        self.copyText(sel.toString().replace(/\u00a0/g, ' '));
        return;
      }
    }
    self.onKeyDown(e);
  }, true);
  o.addEventListener('click', function(e) {
    self.hideMenu();
    // clicking an image opens the original, like links in the terminal
    var img = e.target.closest && e.target.closest('.jjr-img');
    if (img && img.tagName === 'IMG') window.open(img.getAttribute('data-full') || img.src, '_blank', 'noreferrer');
    if (!(e.target.closest && e.target.closest('a'))) o.focus();
  });
  o.addEventListener('contextmenu', function(e) { self.onContextMenu(e); });
  // hovering an image / YouTube link shows a large preview next to the mouse
  o.addEventListener('mouseover', function(e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var src = PttReader.previewFor(a.getAttribute('href'));
    if (src) self.showHoverPreview(src, e);
  });
  o.addEventListener('mousemove', function(e) {
    if (self.hoverPreview && self.hoverPreview.style.display === 'block') self.placeHoverPreview(e);
  });
  o.addEventListener('mouseout', function(e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (a && !(e.relatedTarget && a.contains(e.relatedTarget))) self.hideHoverPreview();
  });
  o.querySelector('.jjt-scroll').addEventListener('scroll', function() { self.hideHoverPreview(); });
  window.addEventListener('resize', function() {
    if (!self.isOpen()) return;
    // wait for the terminal to re-layout first
    setTimeout(function() { self.layout(); }, 0);
  });
  o.querySelector('.jjt-scroll').addEventListener('scroll', function() { self.updateStatus(); });
  // images change the page height as they load
  o.addEventListener('load', function() { self.updateStatus(); }, true);
  this.overlay = o;
  return o;
};

// Large picture for a link: the original image, or a YouTube thumbnail.
PttReader.previewFor = function(url) {
  if (!url || !/^https?:/.test(url)) return '';
  var img = PttReader.imageSrc(url);
  if (img) return img;
  var yt = url.parseYoutubeUrl ? url.parseYoutubeUrl() : null;
  if (yt) return 'https://i.ytimg.com/vi/' + yt.split(/[?&]/)[0] + '/hqdefault.jpg';
  return '';
};

PttReader.prototype.showHoverPreview = function(src, e) {
  var p = this.hoverPreview;
  if (!p) {
    p = this.hoverPreview = PttReader.el('img');
    p.id = 'jjHoverPreview';
    p.referrerPolicy = 'no-referrer';
    var self = this;
    p.addEventListener('load', function() {
      if (self.lastMouse) self.placeHoverPreview(self.lastMouse);
    });
    this.overlay.appendChild(p);
  }
  if (p.getAttribute('src') !== src) p.setAttribute('src', src);
  p.style.display = 'block';
  this.placeHoverPreview(e);
};

PttReader.prototype.placeHoverPreview = function(e) {
  var p = this.hoverPreview;
  this.lastMouse = { clientX: e.clientX, clientY: e.clientY };
  var w = p.offsetWidth || 0, h = p.offsetHeight || 0, gap = 18;
  var x = e.clientX + gap;
  if (x + w > window.innerWidth - 4) x = Math.max(4, e.clientX - gap - w);
  var y = Math.min(Math.max(4, e.clientY - h / 2), window.innerHeight - h - 4);
  p.style.left = x + 'px';
  p.style.top = Math.max(4, y) + 'px';
};

PttReader.prototype.hideHoverPreview = function() {
  if (this.hoverPreview) this.hoverPreview.style.display = 'none';
};

PttReader.prototype.isOpen = function() {
  return !!(this.overlay && this.overlay.style.display !== 'none' && this.overlay.style.display !== '');
};

PttReader.prototype.hideMenu = function() {
  if (this.menu) this.menu.style.display = 'none';
};

// Right-click: blacklist / watchlist the pusher, or go back / settings.
PttReader.prototype.copyText = function(text) {
  var app = this.app;
  var done = function() { app.showToast(i18n('reader_copied'), 1500); };
  var fallback = function() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fallback);
  } else {
    fallback();
  }
};

PttReader.prototype.onContextMenu = function(e) {
  var self = this;
  var app = this.app;
  e.preventDefault();
  e.stopPropagation();
  var selText = window.getSelection().isCollapsed ? '' : window.getSelection().toString();
  if (!this.menu) {
    this.menu = PttReader.el('ul', 'dropdown-menu jjt-menu');
    document.body.appendChild(this.menu);
  }
  var menu = this.menu;
  menu.innerHTML = '';
  var add = function(label, fn) {
    var li = PttReader.el('li');
    var a = PttReader.el('a', '', label);
    a.href = '#';
    a.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      self.hideMenu();
      fn();
    });
    li.appendChild(a);
    menu.appendChild(li);
  };
  if (selText) {
    add(i18n('cmenu_copy'), function() { self.copyText(selText.replace(/\u00a0/g, ' ')); });
    add(i18n('cmenu_askAi'), function() { app.askAi(selText); });
    menu.appendChild(PttReader.el('li', 'divider'));
  } else if (this.article) {
    var art = this.article;
    add(i18n('cmenu_askAiArticle'), function() {
      app.askAi((art.meta['標題'] || '') + '\n' + (art.url || '') + '\n\n' + String(art.text || '').split('\n※ 發信站')[0]);
    });
  }
  var link = e.target.closest && e.target.closest('a[href^="http"]');
  if (link) {
    var href = link.getAttribute('href');
    add(i18n('reader_copyUrl'), function() { self.copyText(href); });
    add(i18n('reader_openUrl'), function() { window.open(href, '_blank', 'noreferrer'); });
    menu.appendChild(PttReader.el('li', 'divider'));
  }
  var push = e.target.closest && e.target.closest('[data-user]');
  if (push) {
    var id = push.getAttribute('data-user');
    var pref = app.pref;
    if (pref.isBlacklisted(id)) {
      add(i18n('cmenu_removeBlacklistUserId') + " '" + id + "'", function() { app.doRemoveBlacklistUserId(id); self.rerender(); });
    } else {
      add(i18n('cmenu_addBlacklistUserId') + " '" + id + "'", function() { app.doAddBlacklistUserId(id); self.rerender(); });
    }
    var listName = pref.customListName();
    if (id in (pref.notedUserIds || {})) {
      add(i18n('cmenu_removeUserNote').replace('%l', listName) + " '" + id + "'", function() { app.doRemoveUserNote(id); self.rerender(); });
    } else {
      add(i18n('cmenu_setUserNote').replace('%l', listName) + " '" + id + "'", function() { app.doSetUserNote(id); self.rerender(); });
    }
    if (id in pref.watchlistedUserIds) {
      add(i18n('cmenu_removeWatchUserId') + " '" + id + "'", function() { app.doRemoveWatchUserId(id); self.rerender(); });
    } else {
      add(i18n('cmenu_addWatchUserId') + " '" + id + "'", function() { app.doAddWatchUserId(id); self.rerender(); });
    }
    menu.appendChild(PttReader.el('li', 'divider'));
  }
  add(i18n('reader_terminal'), function() { self.dismiss(); });
  add(i18n('cmenu_settings'), function() { self.dismiss(); app.doSettings(); });
  menu.style.display = 'block';
  menu.style.position = 'fixed';
  menu.style.zIndex = 3000;
  var x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 4);
  var y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 4);
  menu.style.left = Math.max(0, x) + 'px';
  menu.style.top = Math.max(0, y) + 'px';
};

// Redraw after blacklist / watchlist changes, keeping the scroll position.
PttReader.prototype.rerender = function() {
  if (!this.article || !this.isOpen()) return;
  var scroller = this.overlay.querySelector('.jjt-scroll');
  var top = scroller.scrollTop;
  this.render(this.article, this.renderedHeader || {});
  scroller.scrollTop = top;
  this.updateStatus();
  this.overlay.focus();
};

PttReader.prototype.show = function() {
  var o = this.ensureOverlay();
  o.style.display = 'flex';
  this.app.modalShown = true;  // keeps terminal key handling out of the way
  o.focus();
};

PttReader.prototype.close = function() {
  if (!this.overlay) return;
  this.hideMenu();
  this.hideHoverPreview();
  this.overlay.style.display = 'none';
  this.app.modalShown = false;
  this.currentKey = '';
  this.app.setInputAreaFocus();
};

// Close and don't reopen for this article.
PttReader.prototype.dismiss = function() {
  this.dismissedKey = this.currentKey || this.loadingKey;
  this.close();
};

// Keys to the article above (-1) / below (+1) on screen; with the list
// shown newest first, "above" is the next article in PTT's order.
PttReader.prototype.navKeys = function(dir) {
  var pref = this.app.pref;
  if (pref && pref.values && pref.values.listNewestFirst) dir = -dir;
  return dir < 0 ? PttReader.KEYS_PREV : PttReader.KEYS_NEXT;
};

PttReader.prototype.closeAndSend = function(keys) {
  this.dismiss();
  // keep the list position in step when moving to the previous / next one
  if (this.listSnap && keys === PttReader.KEYS_PREV) this.listSnap.index--;
  if (this.listSnap && keys === PttReader.KEYS_NEXT) this.listSnap.index++;
  if (this.app.conn && this.app.conn.send) this.app.conn.send(keys);
};

// Keys behave like reading in the terminal; anything else goes to PTT.
PttReader.prototype.onKeyDown = function(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;  // browser shortcuts (copy...)
  var scroller = this.overlay.querySelector('.jjt-scroll');
  var line = this.lineHeight || 20;
  var page = Math.max(line, scroller.clientHeight - line * 2);
  // like PTT: past the top / bottom of the article goes to the previous /
  // next one
  var atTop = scroller.scrollTop <= 0;
  var atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
  if (this.menu && this.menu.style.display === 'block') {
    if (e.key === 'Escape') {
      this.hideMenu();
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
  switch (e.key) {
    case 'Escape':
      this.dismiss();
      break;
    case 'ArrowLeft':
    case 'q':
      this.closeAndSend('\x1b[D');
      break;
    case 'ArrowDown':
    case 'Enter':
      if (atBottom) this.closeAndSend(this.navKeys(1));
      else scroller.scrollTop += line;
      break;
    case 'ArrowUp':
      if (atTop) this.closeAndSend(this.navKeys(-1));
      else scroller.scrollTop -= line;
      break;
    case ' ':
    case 'PageDown':
    case 'ArrowRight':
      if (atBottom) this.closeAndSend(this.navKeys(1));
      else scroller.scrollTop += page;
      break;
    case 'PageUp':
    case 'b':
      scroller.scrollTop -= page;
      break;
    case 'Home':
      scroller.scrollTop = 0;
      break;
    case 'End':
    case '$':
      scroller.scrollTop = scroller.scrollHeight;
      break;
    default:
      if (e.key.length === 1) {
        // X push, y reply, ] next article ... handled by PTT itself
        this.closeAndSend(e.key);
        break;
      }
      return;
  }
  e.preventDefault();
  e.stopPropagation();
};

PttReader.prototype.openFor = function(h, key, manual) {
  var self = this;
  this.loadingKey = key;
  var url = (this.lastHeader && this.lastHeader.key === key) ? this.lastUrl : '';
  var t0 = Date.now();
  var pre = this.takePrefetch(h);
  var how = url ? 'url' : pre ? 'prefetch' : 'search';
  var load = url ? this.fetchArticle(url) :
    pre ? pre.catch(function() { how = 'search'; return self.findArticle(h); }) : this.findArticle(h);
  this.setLoading(true);
  load.then(function(article) {
    var tFetched = Date.now();
    PttReader.lastTiming = { how: how, fetchMs: tFetched - t0 };
    if (self.loadingKey === key) self.setLoading(false);
    if (self.loadingKey !== key) return;  // moved on meanwhile
    // Still reading the same article in the terminal? The header may have
    // scrolled away if the user paged down while it was loading, so use the
    // article tracked from the terminal rather than what is on screen.
    if (!manual) {
      self.trackTerminal();
      var cur = self.lastHeader;
      if (self.app.buf.pageState != 3 || !cur || cur.key !== key) return;
    }
    self.loadingKey = '';
    self.currentKey = key;
    self.article = article;
    self.render(article, h);
    self.show();
    self.restorePosition();
    self.prefetchNeighbours(h);
    PttReader.lastTiming.renderMs = Date.now() - tFetched;
    console.log('JJptt 閱讀模式載入：' + (how === 'url' ? '直接用文章網址' : how === 'prefetch' ? '列表預先載入' : '搜尋網址＋下載') +
      ' ' + PttReader.lastTiming.fetchMs + 'ms，排版 ' + PttReader.lastTiming.renderMs + 'ms');
  }).catch(function(e) {
    console.log('reader unavailable for this article:', e);
    if (self.loadingKey === key) {
      self.loadingKey = '';
      self.setLoading(false);
    }
    self.dismissedKey = key;  // stay in the terminal for this one
    var msg = (e && e.message) || String(e);
    if (/Failed to fetch/i.test(msg)) msg = i18n('reader_err_network');
    self.app.showToast(i18n('reader_failed').replace('%s', msg), 5000);
  });
};

// "閱讀模式載入中…" at the top while the article is being fetched.
PttReader.prototype.setLoading = function(on) {
  var n = document.getElementById('jjLoading');
  if (!n) {
    n = PttReader.el('div', '', i18n('app_loading'));
    n.id = 'jjLoading';
    document.body.appendChild(n);
  }
  n.classList.toggle('show', !!on);
};

PttReader.el = function(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
};

PttReader.imageSrc = function(url) {
  if (url.isImageUrl()) return url;
  var m = /^https?:\/\/(?:m\.)?imgur\.com\/(\w{5,8})$/i.exec(url);
  if (m) return 'https://i.imgur.com/' + m[1] + '.jpg';
  return '';
};

// Smaller version of an image when the host offers one: imgur "l" thumbnails
// (about 640px wide), Twitter "small". Animated GIFs are left alone.
PttReader.lowResSrc = function(src) {
  var m = /^https?:\/\/i\.imgur\.com\/(\w{7})\.(jpe?g|png|webp)(?:[?#].*)?$/i.exec(src);
  if (m) return 'https://i.imgur.com/' + m[1] + 'l.jpg';
  if (/^https?:\/\/pbs\.twimg\.com\/media\//i.test(src)) {
    return src.replace(/([?&]name=)\w+/, '$1small') + (/[?&]name=/.test(src) ? '' : (src.indexOf('?') < 0 ? '?' : '&') + 'name=small');
  }
  return src;
};

PttReader.prototype.displaySrc = function(src) {
  var pref = this.app.pref;
  var low = !pref || !pref.values || pref.values.readerLowResImages !== false;
  return low ? PttReader.lowResSrc(src) : src;
};

// Link line plus its media (image, video, YouTube or link card). With
// mediaOnly the link text itself is left out (it is already in the text).
PttReader.prototype.linkBlock = function(url, mediaOnly) {
  var el = PttReader.el;
  var wrap = el('div', 'jjr-media');
  var a = el('a', 'jjr-link', url);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noreferrer';
  if (!mediaOnly) wrap.appendChild(a);

  var img = PttReader.imageSrc(url);
  var yt = url.parseYoutubeUrl ? url.parseYoutubeUrl() : null;
  var imgurVideo = /^https?:\/\/i\.imgur\.com\/(\w+)\.(?:gifv|mp4)$/i.exec(url);
  if (imgurVideo) {
    var v = el('video', 'jjr-img');
    v.src = 'https://i.imgur.com/' + imgurVideo[1] + '.mp4';
    v.autoplay = v.loop = v.muted = v.playsInline = true;
    wrap.appendChild(v);
  } else if (img) {
    var im = el('img', 'jjr-img');
    im.loading = 'lazy';
    im.referrerPolicy = 'no-referrer';
    im.src = this.displaySrc(img);
    im.setAttribute('data-full', img);
    im.addEventListener('error', function() { im.style.display = 'none'; });
    wrap.appendChild(im);
  } else if (yt) {
    var card = el('a', 'jjr-card jjr-yt');
    card.href = url;
    card.target = '_blank';
    card.rel = 'noreferrer';
    var thumb = el('img', 'jjr-card-thumb');
    thumb.loading = 'lazy';
    thumb.src = 'https://i.ytimg.com/vi/' + yt.split(/[?&]/)[0] + '/hqdefault.jpg';
    card.appendChild(thumb);
    var ytText = el('div', 'jjr-card-text');
    ytText.appendChild(el('div', 'jjr-card-host', 'YouTube'));
    card.appendChild(ytText);
    card.setAttribute('data-preview-url', url);
    wrap.appendChild(card);
  } else {
    // Link card like phone apps: filled with the page's title, summary and
    // image once previews are allowed (see loadPreviews).
    var host = '';
    try { host = new URL(url).hostname; } catch (e) {}
    var c = el('a', 'jjr-card');
    c.href = url;
    c.target = '_blank';
    c.rel = 'noreferrer';
    var text = el('div', 'jjr-card-text');
    text.appendChild(el('div', 'jjr-card-host', host));
    c.appendChild(text);
    c.setAttribute('data-preview-url', url);
    wrap.appendChild(c);
  }
  return wrap;
};

// ---- link previews ----------------------------------------------------------
// Fetching arbitrary sites needs an optional permission that the user grants
// once from a card ("顯示網址預覽").

PttReader.PREVIEW_ORIGINS = ['http://*/*', 'https://*/*'];

PttReader.prototype.previewPermission = function() {
  return new Promise(function(resolve) {
    if (!(chrome.permissions && chrome.permissions.contains)) {
      resolve(false);
      return;
    }
    chrome.permissions.contains({ origins: PttReader.PREVIEW_ORIGINS }, function(ok) { resolve(!!ok); });
  });
};

PttReader.prototype.loadPreviews = function(root) {
  var self = this;
  var cards = root.querySelectorAll('[data-preview-url]');
  if (!cards.length) return;
  this.previewPermission().then(function(ok) {
    for (var i = 0; i < cards.length; ++i) {
      if (ok) self.fillCard(cards[i]);
      else self.offerPreview(cards[i], root);
    }
  });
};

PttReader.prototype.offerPreview = function(card, root) {
  var self = this;
  if (card.querySelector('.jjr-card-allow')) return;
  var btn = PttReader.el('button', 'jjr-card-allow', i18n('reader_allowPreview'));
  btn.type = 'button';
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    chrome.permissions.request({ origins: PttReader.PREVIEW_ORIGINS }, function(granted) {
      if (!granted) return;
      var btns = root.querySelectorAll('.jjr-card-allow');
      for (var i = 0; i < btns.length; ++i) btns[i].parentNode.removeChild(btns[i]);
      self.loadPreviews(root);
    });
  });
  card.querySelector('.jjr-card-text').appendChild(btn);
};

PttReader.fetchMsn = function(locale, id) {
  var api = 'https://assets.msn.com/content/view/v2/Detail/' + locale.toLowerCase() + '/' + id;
  return fetch(api, { credentials: 'omit' }).then(function(r) {
    return r.ok ? r.json() : null;
  }).then(function(j) {
    if (!j || !j.title) return null;
    var imgs = j.imageResources || [];
    var img = imgs.length ? (imgs[0].url || '') : '';
    if (img && img.indexOf('?') < 0) img += '?w=800';
    return {
      title: j.title,
      desc: j.abstract || '',
      image: img,
      site: (j.provider && j.provider.name) || 'MSN'
    };
  }).catch(function() { return null; });
};

PttReader.prototype.fetchPreview = function(url) {
  this.previewCache = this.previewCache || {};
  if (this.previewCache[url]) return this.previewCache[url];
  var p = fetch(url, { credentials: 'omit', redirect: 'follow' }).then(function(res) {
    var type = res.headers.get('content-type') || '';
    if (!res.ok || type.indexOf('html') < 0) return null;
    return res.text().then(function(html) {
      var doc = new DOMParser().parseFromString(html.slice(0, 400000), 'text/html');
      var meta = function(names) {
        for (var i = 0; i < names.length; ++i) {
          var n = doc.querySelector('meta[property="' + names[i] + '"], meta[name="' + names[i] + '"]');
          if (n && n.getAttribute('content')) return n.getAttribute('content').trim();
        }
        return '';
      };
      var title = meta(['og:title', 'twitter:title']) || (doc.title || '').trim();
      var image = meta(['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']);
      if (image) {
        try { image = new URL(image, res.url).href; } catch (e) { image = ''; }
      }
      var info = {
        title: title,
        desc: meta(['og:description', 'description', 'twitter:description']),
        image: image,
        site: meta(['og:site_name'])
      };
      // MSN article pages are built by script and carry no og: tags; their
      // content API has the title, summary and pictures
      var msn = /^https?:\/\/(?:www\.)?msn\.com\/([a-z]{2}-[a-z]{2})\/.*\/ar-([A-Za-z0-9]+)/i.exec(res.url);
      if (msn && !image) {
        return PttReader.fetchMsn(msn[1], msn[2]).then(function(m) { return m || info; });
      }
      return info;
    });
  }).catch(function() { return null; });
  this.previewCache[url] = p;
  return p;
};

PttReader.prototype.fillCard = function(card) {
  var el = PttReader.el;
  var url = card.getAttribute('data-preview-url');
  var isYt = card.classList.contains('jjr-yt');
  this.fetchPreview(url).then(function(info) {
    if (!info || !(info.title || info.image)) return;
    var text = card.querySelector('.jjr-card-text');
    var allow = text.querySelector('.jjr-card-allow');
    if (allow) allow.parentNode.removeChild(allow);
    if (info.image && !isYt) {
      var img = el('img', 'jjr-card-thumb');
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.src = info.image;
      img.addEventListener('error', function() {
        if (img.parentNode) img.parentNode.removeChild(img);
      });
      card.insertBefore(img, card.firstChild);
      card.classList.add('jjr-card-rich');
    }
    if (info.site) text.querySelector('.jjr-card-host').textContent = info.site;
    if (info.title) text.appendChild(el('div', 'jjr-card-title', info.title));
    if (info.desc && !isYt) text.appendChild(el('div', 'jjr-card-desc', info.desc));
  });
};

// ---- terminal-look rendering ----------------------------------------------
// The article is drawn like the terminal (same font, size, 80-column width,
// PTT colours) with images and link cards inserted below lines with URLs.

// PTT web colour classes (f0-f7, b0-b7, hl) -> terminal classes (q0-q15, b0-b7).
PttReader.colorState = function(node, parent) {
  var st = { fg: parent.fg, bg: parent.bg, hl: parent.hl, href: parent.href };
  var cls = (node.getAttribute && node.getAttribute('class')) || '';
  cls.split(/\s+/).forEach(function(c) {
    var m = /^f(\d)$/.exec(c);
    if (m) st.fg = +m[1];
    m = /^b(\d)$/.exec(c);
    if (m) st.bg = +m[1];
    if (c === 'hl') st.hl = true;
  });
  if (node.tagName === 'A' && node.getAttribute('href')) st.href = node.getAttribute('href');
  return st;
};

// Splits a DOM subtree into lines of coloured segments.
PttReader.toLines = function(root) {
  var lines = [[]];
  var walk = function(node, st) {
    if (node.nodeType === 3) {
      var parts = node.nodeValue.split('\n');
      for (var i = 0; i < parts.length; ++i) {
        if (i > 0) lines.push([]);
        if (parts[i]) lines[lines.length - 1].push({ text: parts[i], st: st });
      }
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.hasAttribute('data-push-index')) {
      // a push is one line of its own
      var marker = [];
      marker.push_index = +node.getAttribute('data-push-index');
      if (!lines[lines.length - 1].length) lines[lines.length - 1] = marker;
      else lines.push(marker);
      lines.push([]);
      return;
    }
    var next = PttReader.colorState(node, st);
    for (var c = node.firstChild; c; c = c.nextSibling) walk(c, next);
  };
  walk(root, { fg: 7, bg: 0, hl: false, href: '' });
  return lines;
};

PttReader.segClass = function(st) {
  return 'q' + (st.fg + (st.hl ? 8 : 0)) + ' b' + st.bg;
};

PttReader.prototype.lineNode = function(segs) {
  var el = PttReader.el;
  var div = el('div', 'jjt-line');
  var urls = [];
  var urlRe = /https?:\/\/[^\s<>"'，。）)]+/g;
  segs.forEach(function(seg) {
    var cls = PttReader.segClass(seg.st);
    if (seg.st.href) {
      var a = el('a', 'jjt-link ' + cls, seg.text);
      a.href = seg.st.href;
      a.target = '_blank';
      a.rel = 'noreferrer';
      div.appendChild(a);
      if (/^https?:/.test(seg.st.href)) urls.push(seg.st.href);
      return;
    }
    var last = 0, m;
    urlRe.lastIndex = 0;
    while ((m = urlRe.exec(seg.text))) {
      if (m.index > last) div.appendChild(el('span', cls, seg.text.slice(last, m.index)));
      var link = el('a', 'jjt-link ' + cls, m[0]);
      link.href = m[0];
      link.target = '_blank';
      link.rel = 'noreferrer';
      div.appendChild(link);
      urls.push(m[0]);
      last = m.index + m[0].length;
    }
    if (last < seg.text.length) div.appendChild(el('span', cls, seg.text.slice(last)));
  });
  if (!segs.length) div.appendChild(document.createTextNode(' '));
  return { node: div, urls: urls };
};

PttReader.prototype.headerNode = function(article, h) {
  var el = PttReader.el;
  var frag = document.createDocumentFragment();
  // Two layers: all row backgrounds first, then all text on top, so a row's
  // background can't cover the edges of tall glyphs in the row above.
  var head = el('div', 'jjt-head');
  var bg = el('div', 'jjt-head-bg');
  var fg = el('div', 'jjt-head-fg');
  var row = function(tag, value, tag2, value2) {
    var d = el('div', 'jjt-line jjt-hrow');
    d.appendChild(el('span', 'q4 b7 jjt-htag', ' ' + tag + ' '));
    d.appendChild(el('span', 'q7 b4 jjt-hval', ' ' + value));
    if (tag2) {
      d.appendChild(el('span', 'q4 b7 jjt-htag', ' ' + tag2 + ' '));
      d.appendChild(el('span', 'q7 b4 jjt-hval2', ' ' + value2 + ' '));
    }
    bg.appendChild(d);
    fg.appendChild(d.cloneNode(true));
  };
  row('作者', article.meta['作者'] || h.author, '看板', article.meta['看板'] || h.board);
  row('標題', article.meta['標題'] || h.title);
  row('時間', article.meta['時間'] || '');
  head.appendChild(bg);
  head.appendChild(fg);
  frag.appendChild(head);
  var sep = el('div', 'jjt-line');
  sep.appendChild(el('span', 'q6 b0', new Array(41).join('─')));
  frag.appendChild(sep);
  return frag;
};

PttReader.prototype.render = function(article, h) {
  this.renderedHeader = h;
  var el = PttReader.el;
  var view = this.app.view;
  var o = this.ensureOverlay();
  var page = o.querySelector('.jjt-page');
  page.innerHTML = '';

  this.layout();

  page.appendChild(this.headerNode(article, h));

  var lines = PttReader.toLines(article.body);
  if (lines.length && !lines[lines.length - 1].length && lines[lines.length - 1].push_index === undefined) lines.pop();
  var pushNodes = this.renderPushes(article);
  var reportShown = false;
  for (var i = 0; i < lines.length; ++i) {
    if (lines[i].push_index !== undefined) {
      if (!reportShown) {  // fact-check report right above the first push
        reportShown = true;
        var rep = this.factReportNode(article);
        if (rep) page.appendChild(rep);
      }
      var pn = pushNodes[lines[i].push_index];
      if (pn) {
        pn.line.setAttribute('data-line', 5 + i);
        page.appendChild(pn.frag);
      }
      continue;
    }
    var r = this.lineNode(lines[i]);
    // PTT line number: 3 header lines + separator, then the body
    r.node.setAttribute('data-line', 5 + i);
    page.appendChild(r.node);
    var text = r.node.textContent.trim();
    var quoted = /^[:：]/.test(text) || /^※/.test(text);
    if (!quoted) {
      for (var u = 0; u < r.urls.length; ++u) page.appendChild(this.linkBlock(r.urls[u], true));
    }
  }
  this.updateStatus();
  this.loadPreviews(page);
};

// Box above the pushes listing what the fact-check rules found, with a
// button that asks the AI about the whole thread.
PttReader.prototype.factReportNode = function(article) {
  var self = this;
  var el = PttReader.el;
  var pref = this.app.pref;
  if (pref && pref.values && pref.values.factReport === false) return null;
  var lines = this.factReport || [];
  var box = el('div', 'jjt-fact');
  var head = el('div', 'jjt-fact-head');
  head.appendChild(el('span', 'jjt-fact-title', '真.事實查核中心'));
  head.appendChild(el('span', 'jjt-fact-sum', lines.length ? '抓到 ' + lines.length + ' 項疑點（僅供參考）' : '沒有發現明顯的協同推文跡象'));
  var ask = el('button', 'jjt-fact-ai', '請 AI 分析推文風向');
  ask.type = 'button';
  ask.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    self.askAiAboutPushes(article);
  });
  head.appendChild(ask);
  box.appendChild(head);
  lines.forEach(function(t) { box.appendChild(el('div', 'jjt-fact-line', '・' + t)); });
  return box;
};

PttReader.prototype.askAiAboutPushes = function(article) {
  var pushes = article.pushes || [];
  var title = article.meta['標題'] || '';
  var body = String(article.text || '').split('\n※ 發信站')[0].replace(/\s+/g, ' ').slice(0, 600);
  var list = pushes.slice(0, 200).map(function(p, i) {
    return (i + 1) + '樓 ' + p.tag + ' ' + p.id + ': ' + String(p.content).trim() + ' (' + [p.ip, p.time].filter(Boolean).join(' ') + ')';
  }).join('\n');
  var found = (this.factReport || []).join('\n');
  var text = '標題：' + title + '\n發文時間：' + (article.meta['時間'] || '') + '\n內文摘要：' + body +
             (found ? '\n\nJJptt 自動偵測到：\n' + found : '') + '\n\n推文（共 ' + pushes.length + ' 則，以下前 ' +
             Math.min(200, pushes.length) + ' 則）：\n' + list;
  this.app.askAi(text, '以下是 PTT 一篇文章和它的推文。請分析推文是否有協同帶風向（網軍）的跡象：例如發文後極短時間內集體進場、同一時間湧入大量立場一致的推文、連續空泛的純推補血、不同帳號用幾乎相同的句型、同網段或境外 IP。請指出可疑的帳號與樓層、理由，以及這些推文想引導的立場；也請說明哪些看起來是正常鄉民討論。最後提醒這只是推測。\n\n%s', 7000);
};

// After showing: start at the top, or at the line the terminal is showing
// if the user already paged down while the article was loading. (Scrolling
// must happen after the overlay is visible; hidden elements ignore it.)
PttReader.prototype.restorePosition = function() {
  var self = this;
  var scroller = this.overlay.querySelector('.jjt-scroll');
  var target = 0;
  var buf = this.app.buf;
  if (buf.pageState == 3) {
    var status = buf.getRowText(23, 0, buf.cols).parseStatusRow();
    if (status && status.rowIndexStart > 1) {
      var lines = this.overlay.querySelectorAll('.jjt-page [data-line]');
      for (var i = 0; i < lines.length; ++i) {
        if (+lines[i].getAttribute('data-line') >= status.rowIndexStart) {
          target = lines[i];
          break;
        }
      }
    }
  }
  scroller.scrollTop = 0;
  if (target) {
    // put the line where the terminal's first row is
    var page = this.overlay.querySelector('.jjt-page');
    var top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop = Math.max(0, top - (parseFloat(page.style.paddingTop) || 0));
  }
  this.updateStatus();
  // keep it there while images above finish loading
  requestAnimationFrame(function() { self.updateStatus(); });
};

// Puts the view exactly in the terminal's box: rows 1-23 scroll, the status
// bar sits on row 24, same font, size and columns.
PttReader.prototype.layout = function() {
  if (!this.overlay) return;
  var view = this.app.view;
  var o = this.overlay;
  var page = o.querySelector('.jjt-page');
  var scroller = o.querySelector('.jjt-scroll');
  var chw = view.chw || 10, chh = view.chh || 20;
  var rows = (this.app.buf && this.app.buf.rows) || 24;
  this.lineHeight = chh;
  var rect = view.mainDisplay.getBoundingClientRect();
  var gutter = chw * (view.leftGutterCols ? view.leftGutterCols() : 0);
  page.style.fontFamily = getComputedStyle(view.mainDisplay).fontFamily;
  page.style.fontSize = chh + 'px';
  page.style.lineHeight = chh + 'px';
  page.style.width = (chw * 80) + 'px';
  page.style.marginLeft = Math.max(0, rect.left + gutter) + 'px';
  page.style.paddingTop = '0px';
  this.rightSpaceCols = Math.max(0, (window.innerWidth - (rect.left + gutter) - chw * 80) / chw);
  scroller.style.marginTop = Math.max(0, rect.top) + 'px';
  scroller.style.height = (chh * (rows - 1)) + 'px';
  o.style.setProperty('--jj-box-h', (chh * (rows - 1)) + 'px');
  // image height limit (setting, % of the box)
  var pref = this.app.pref;
  var pct = parseInt(pref && pref.values ? pref.values.readerImageMaxPercent : 40, 10);
  if (!(pct >= 10 && pct <= 100)) pct = 40;
  o.style.setProperty('--jj-img-frac', pct / 100);
  this.updateStatus();
};

PttReader.prototype.updateStatus = function() {
  if (!this.overlay) return;
  var s = this.overlay.querySelector('.jjt-scroll');
  var max = s.scrollHeight - s.clientHeight;
  var pct = max > 0 ? Math.round(s.scrollTop / max * 100) : 100;
  var bar = this.overlay.querySelector('.jjt-status');
  bar.innerHTML = '';
  var el = PttReader.el;
  var page = this.overlay.querySelector('.jjt-page');
  bar.style.fontFamily = page.style.fontFamily;
  bar.style.fontSize = page.style.fontSize;
  bar.style.lineHeight = page.style.lineHeight;
  bar.style.width = page.style.width;
  bar.style.marginLeft = page.style.marginLeft;
  bar.appendChild(el('span', 'q15 b4', '  瀏覽 (' + pct + '%) '));
  bar.appendChild(el('span', 'q0 b7 jjt-status-fill', ''));
  var keys = [['(y)', '回應'], ['(X)', '推文'], ['(←)', '離開'], ['(Esc)', '終端機']];
  keys.forEach(function(k) {
    bar.appendChild(el('span', 'q1 b7', k[0]));
    bar.appendChild(el('span', 'q0 b7', k[1]));
  });
  bar.appendChild(el('span', 'q0 b7', ' '));
};

PttReader.prototype.renderPushes = function(article) {
  var el = PttReader.el;
  var self = this;
  var pref = this.app.pref;
  var insights = this.app.pushInsights;
  var geo = insights.geo;
  var T = insights.hintTexts();
  var isBlack = function(id) { return !!(pref && pref.enableBlacklist && pref.isBlacklisted(id)); };
  var hide = pref && pref.hideBlacklisted;
  var watch = (pref && pref.watchlistedUserIds) || {};
  var authorId = String(article.meta['作者'] || '').split(' ')[0].toLowerCase();
  var authorIpMatch = /來自: ((?:\d{1,3}\.){3}\d{1,3})/.exec(article.text);
  var authorIp = authorIpMatch ? authorIpMatch[1] : '';

  var fact = { tags: [], report: [] };
  if (this.app.factCheck) {
    try { fact = this.app.factCheck.analyze(article); } catch (e) { console.log('fact check', e); }
  }
  this.factReport = fact.report;

  var idsByIp = {}, countById = {};
  article.pushes.forEach(function(p) {
    var id = p.id.toLowerCase();
    countById[id] = (countById[id] || 0) + 1;
    if (p.ip) (idsByIp[p.ip] = idsByIp[p.ip] || {})[id] = true;
  });

  var result = [];
  var nth = {};
  var repeatColors = {};
  article.pushes.forEach(function(p, i) {
    var id = p.id.toLowerCase();
    nth[id] = (nth[id] || 0) + 1;
    var blackListed = isBlack(id);
    if (blackListed && hide) return;
    var wrap = document.createDocumentFragment();

    var hints = [];
    var tags = [];
    var level = '';
    var parts = [];
    var asFlag = self.app.view.ipAsFlag && self.app.view.ipAsFlag();
    var flag = '';
    if (p.ip && geo.ready) {
      var cc = geo.lookup(p.ip);
      if (cc) {
        if (asFlag) flag = PushInsights.flagEmoji(cc);
        else parts.push(insights.countryLabel(cc));
        if (cc !== 'TW') level = 'foreign';
      }
    }
    if (p.ip) {
      var others = Object.keys(idsByIp[p.ip] || {}).filter(function(x) { return x !== id; });
      if (others.length) {
        hints.push(T.sameIp + ':' + others.slice(0, 2).join(',') + (others.length > 2 ? '等' + others.length + '人' : ''));
        tags.push(T.sameIp);
        level = 'warn';
      }
      if (authorIp && p.ip === authorIp && id !== authorId) {
        hints.push(T.authorIp);
        tags.push(T.authorIp);
        level = 'warn';
      }
    }
    if (id in watch) {
      hints.push(T.watch + (watch[id] ? ':' + watch[id] : ''));
      tags.push(T.watch);
      if (level !== 'warn') level = 'watch';
    }
    (fact.tags[i] || []).forEach(function(t) {  // 真.事實查核中心 rules
      hints.push(t.t);
      tags.push(t.t);
      if (t.lvl === 'warn') level = 'warn';
      else if (!level || level === 'foreign') level = 'watch';
    });
    var notes = (pref && pref.notedUserIds) || {};
    if (id in notes) {  // the user's own named list (網軍 by default)
      parts.push(pref.customListName() + (notes[id] ? ':' + notes[id] : ''));
      if (!level || level === 'foreign') level = 'note';
    }
    if (countById[id] >= 8) parts.push('第' + nth[id] + '/' + countById[id] + '推');
    var full = parts.concat(hints.length ? [(T.prefix ? T.prefix + ' ' : '') + hints.join(' ')] : []).join(' ');
    var label = insights.fitLabel(full, parts, hints, T, self.rightSpaceCols);

    // "推 userid: content          ip mm/dd hh:mm" in PTT colours
    var line = el('div', 'jjt-line jjt-push' + (blackListed ? ' jjt-faded' : ''));
    line.setAttribute('data-user', id);
    PushInsights.setRepeatColor(line, insights.repeatColor(repeatColors, id, countById[id]));
    var left = el('span', 'jjt-push-left');
    left.appendChild(el('span', p.tag === '推' ? 'q15 b0' : 'q9 b0', p.tag + ' '));
    left.appendChild(el('span', 'q11 b0', p.id));
    var content = self.lineNode([{ text: ':' + p.content, st: { fg: 3, bg: 0, hl: false, href: '' } }]);
    var c = content.node;
    while (c.firstChild) left.appendChild(c.firstChild);
    line.appendChild(left);
    var right = el('span', 'q7 b0 jjt-push-right', ' ');
    if (asFlag && full) {  // notes in front of the flag
      right.appendChild(el('span', 'jjt-itag jjt-itag-' + (level || 'none'), full + ' '));
    }
    right.appendChild(document.createTextNode([asFlag ? flag : p.ip, p.time].filter(Boolean).join(' ')));
    line.appendChild(right);
    line.setAttribute('data-jj-floor', (i + 1) + '樓');
    if (label && !asFlag) line.setAttribute('data-jj', label);
    line.setAttribute('title', ((i + 1) + '樓 ' + full).trim());
    if (level) line.setAttribute('data-jj-level', level);
    wrap.appendChild(line);
    result[i] = { line: line, frag: wrap };
    // images posted in pushes
    content.urls.forEach(function(u) {
      if (blackListed) return;  // no thumbnails for blacklisted users
      if (!PttReader.imageSrc(u)) return;
      var media = self.linkBlock(u, true);
      media.className += ' jjt-push-media';
      wrap.appendChild(media);
    });
  });
  return result;
};
