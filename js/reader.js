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
  return search(1).then(tryNext);
};

PttReader.prototype.fetchArticle = function(url) {
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
    var drop = body.querySelectorAll('.article-metaline, .article-metaline-right, .push, .richcontent');
    for (var k = 0; k < drop.length; ++k) drop[k].parentNode.removeChild(drop[k]);
    return { url: url, meta: meta, text: body.textContent, body: body, pushes: pushes };
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
  o.addEventListener('keydown', function(e) { self.onKeyDown(e); });
  o.querySelector('.jjt-scroll').addEventListener('scroll', function() { self.updateStatus(); });
  // images change the page height as they load
  o.addEventListener('load', function() { self.updateStatus(); }, true);
  this.overlay = o;
  return o;
};

PttReader.prototype.show = function() {
  var o = this.ensureOverlay();
  o.style.display = 'flex';
  this.app.modalShown = true;  // keeps terminal key handling out of the way
  o.focus();
};

PttReader.prototype.close = function() {
  if (!this.overlay) return;
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

PttReader.prototype.closeAndSend = function(keys) {
  this.dismiss();
  if (this.app.conn && this.app.conn.send) this.app.conn.send(keys);
};

// Keys behave like reading in the terminal; anything else goes to PTT.
PttReader.prototype.onKeyDown = function(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;  // browser shortcuts (copy...)
  var scroller = this.overlay.querySelector('.jjt-scroll');
  var line = this.lineHeight || 20;
  var page = Math.max(line, scroller.clientHeight - line * 2);
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
      scroller.scrollTop += line;
      break;
    case 'ArrowUp':
      scroller.scrollTop -= line;
      break;
    case ' ':
    case 'PageDown':
    case 'ArrowRight':
      scroller.scrollTop += page;
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
  var load = url ? this.fetchArticle(url) : this.findArticle(h);
  if (manual) this.app.showToast(i18n('app_loading') || '…', 1500);
  load.then(function(article) {
    if (self.loadingKey !== key) return;  // moved on meanwhile
    // Still reading the same article in the terminal? (manual opens may be
    // on a later page where the header is not visible)
    var now = self.headerFromTerminal();
    if (!manual && (!now || now.board + '|' + now.author + '|' + now.title !== key)) return;
    self.loadingKey = '';
    self.currentKey = key;
    self.article = article;
    self.render(article, h);
    self.show();
  }).catch(function(e) {
    console.log('reader unavailable for this article:', e);
    if (self.loadingKey === key) self.loadingKey = '';
    self.dismissedKey = key;  // stay in the terminal for this one
    var msg = (e && e.message) || String(e);
    if (/Failed to fetch/i.test(msg)) msg = i18n('reader_err_network');
    self.app.showToast(i18n('reader_failed').replace('%s', msg), 5000);
  });
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
    im.src = img;
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
      return {
        title: title,
        desc: meta(['og:description', 'description', 'twitter:description']),
        image: image,
        site: meta(['og:site_name'])
      };
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
  var row = function(tag, value, tag2, value2) {
    var d = el('div', 'jjt-line jjt-hrow');
    d.appendChild(el('span', 'q4 b7 jjt-htag', ' ' + tag + ' '));
    d.appendChild(el('span', 'q7 b4 jjt-hval', ' ' + value));
    if (tag2) {
      d.appendChild(el('span', 'q4 b7 jjt-htag', ' ' + tag2 + ' '));
      d.appendChild(el('span', 'q7 b4 jjt-hval2', ' ' + value2 + ' '));
    }
    frag.appendChild(d);
  };
  row('作者', article.meta['作者'] || h.author, '看板', article.meta['看板'] || h.board);
  row('標題', article.meta['標題'] || h.title);
  row('時間', article.meta['時間'] || '');
  var sep = el('div', 'jjt-line');
  sep.appendChild(el('span', 'q6 b0', new Array(41).join('─')));
  frag.appendChild(sep);
  return frag;
};

PttReader.prototype.render = function(article, h) {
  var el = PttReader.el;
  var view = this.app.view;
  var o = this.ensureOverlay();
  var page = o.querySelector('.jjt-page');
  page.innerHTML = '';

  // Match the terminal's font, size and position.
  var chw = view.chw || 10, chh = view.chh || 20;
  this.lineHeight = chh;
  var rect = view.mainDisplay.getBoundingClientRect();
  var gutter = chw * (view.leftGutterCols ? view.leftGutterCols() : 0);
  page.style.fontFamily = getComputedStyle(view.mainDisplay).fontFamily;
  page.style.fontSize = chh + 'px';
  page.style.lineHeight = chh + 'px';
  page.style.width = (chw * 80) + 'px';
  page.style.marginLeft = Math.max(0, rect.left + gutter) + 'px';
  page.style.paddingTop = Math.max(0, rect.top) + 'px';
  page.style.setProperty('--jj-cols-w', (chw * 80) + 'px');

  page.appendChild(this.headerNode(article, h));

  var lines = PttReader.toLines(article.body);
  // drop the trailing empty line left by the removed pushes
  while (lines.length && !lines[lines.length - 1].length) lines.pop();
  for (var i = 0; i < lines.length; ++i) {
    var r = this.lineNode(lines[i]);
    page.appendChild(r.node);
    var text = r.node.textContent.trim();
    var quoted = /^[:：]/.test(text) || /^※/.test(text);
    if (!quoted) {
      for (var u = 0; u < r.urls.length; ++u) page.appendChild(this.linkBlock(r.urls[u], true));
    }
  }
  page.appendChild(this.renderPushes(article));
  o.querySelector('.jjt-scroll').scrollTop = 0;
  this.updateStatus();
  this.loadPreviews(page);
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
  var black = (pref && pref.enableBlacklist && pref.blacklistedUserIds) || {};
  var hide = pref && pref.hideBlacklisted;
  var watch = (pref && pref.watchlistedUserIds) || {};
  var authorId = String(article.meta['作者'] || '').split(' ')[0].toLowerCase();
  var authorIpMatch = /來自: ((?:\d{1,3}\.){3}\d{1,3})/.exec(article.text);
  var authorIp = authorIpMatch ? authorIpMatch[1] : '';

  var idsByIp = {}, countById = {};
  article.pushes.forEach(function(p) {
    var id = p.id.toLowerCase();
    countById[id] = (countById[id] || 0) + 1;
    if (p.ip) (idsByIp[p.ip] = idsByIp[p.ip] || {})[id] = true;
  });

  var wrap = document.createDocumentFragment();
  var nth = {};
  article.pushes.forEach(function(p, i) {
    var id = p.id.toLowerCase();
    nth[id] = (nth[id] || 0) + 1;
    if ((id in black) && hide) return;

    var hints = [];
    var level = '';
    var parts = [];
    if (p.ip && geo.ready) {
      var cc = geo.lookup(p.ip);
      if (cc) {
        parts.push(insights.countryLabel(cc));
        if (cc !== 'TW') level = 'foreign';
      }
    }
    if (p.ip) {
      var others = Object.keys(idsByIp[p.ip] || {}).filter(function(x) { return x !== id; });
      if (others.length) {
        hints.push(T.sameIp + ':' + others.slice(0, 2).join(',') + (others.length > 2 ? '等' + others.length + '人' : ''));
        level = 'warn';
      }
      if (authorIp && p.ip === authorIp && id !== authorId) {
        hints.push(T.authorIp);
        level = 'warn';
      }
    }
    if (id in watch) {
      hints.push(T.watch + (watch[id] ? ':' + watch[id] : ''));
      if (level !== 'warn') level = 'watch';
    }
    if (countById[id] >= 8) parts.push('第' + nth[id] + '/' + countById[id] + '推');
    var label = parts.concat(hints.length ? [(T.prefix ? T.prefix + ' ' : '') + hints.join(' ')] : []).join(' ');

    // "推 userid: content          ip mm/dd hh:mm" in PTT colours
    var line = el('div', 'jjt-line jjt-push' + ((id in black) ? ' jjt-faded' : ''));
    var left = el('span', 'jjt-push-left');
    left.appendChild(el('span', p.tag === '推' ? 'q15 b0' : 'q9 b0', p.tag + ' '));
    left.appendChild(el('span', 'q11 b0', p.id));
    var content = self.lineNode([{ text: ':' + p.content, st: { fg: 3, bg: 0, hl: false, href: '' } }]);
    var c = content.node;
    while (c.firstChild) left.appendChild(c.firstChild);
    line.appendChild(left);
    line.appendChild(el('span', 'q7 b0 jjt-push-right', ' ' + [p.ip, p.time].filter(Boolean).join(' ')));
    line.setAttribute('data-jj-floor', (i + 1) + '樓');
    if (label) line.setAttribute('data-jj', label);
    if (level) line.setAttribute('data-jj-level', level);
    wrap.appendChild(line);
    // images posted in pushes
    content.urls.forEach(function(u) {
      if (!PttReader.imageSrc(u)) return;
      var media = self.linkBlock(u, true);
      media.className += ' jjt-push-media';
      wrap.appendChild(media);
    });
  });
  return wrap;
};
