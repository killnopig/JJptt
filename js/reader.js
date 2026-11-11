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
  var m0 = /^\s*作者\s+(\w+).*?看板\s+(\S+)/.exec(r0);
  var m1 = /^\s*標題\s+(.*?)\s*$/.exec(r1);
  if (!m0 || !m1) return null;
  return { author: m0[1], board: m0[2], title: m1[1] };
};

// Called after every terminal redraw.
PttReader.prototype.onTerminalUpdate = function() {
  if (!this.enabled || !this.available()) return;
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

PttReader.prototype.ensureOver18 = function() {
  if (this.cookieReady) return this.cookieReady;
  this.cookieReady = new Promise(function(resolve) {
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
  return this.cookieReady;
};

PttReader.prototype.fetchDoc = function(url) {
  return this.ensureOver18().then(function() {
    return fetch(url, { credentials: 'include' });
  }).then(function(res) {
    if (!res.ok) throw new Error('ptt web ' + res.status);
    return res.text();
  }).then(function(html) {
    return new DOMParser().parseFromString(html, 'text/html');
  });
};

PttReader.normalizeTitle = function(t) {
  return String(t || '').replace(/\s+/g, ' ').trim();
};

// Finds the article's web URL by searching the board for the author's posts.
PttReader.prototype.findArticleUrl = function(h) {
  var self = this;
  var want = PttReader.normalizeTitle(h.title);
  var search = function(page) {
    var url = PttReader.WEB + '/bbs/' + encodeURIComponent(h.board) +
      '/search?q=' + encodeURIComponent('author:' + h.author) + (page > 1 ? '&page=' + page : '');
    return self.fetchDoc(url).then(function(doc) {
      var ents = doc.querySelectorAll('.r-ent');
      for (var i = 0; i < ents.length; ++i) {
        var a = ents[i].querySelector('.title a');
        if (!a) continue;
        if (PttReader.normalizeTitle(a.textContent) === want) {
          return PttReader.WEB + a.getAttribute('href');
        }
      }
      return page < 3 && ents.length ? search(page + 1) : null;
    });
  };
  return search(1);
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
    return { url: url, meta: meta, text: body.textContent, pushes: pushes };
  });
};

// ---- rendering -----------------------------------------------------------

PttReader.prototype.ensureOverlay = function() {
  if (this.overlay) return this.overlay;
  var self = this;
  var o = document.createElement('div');
  o.id = 'jjReader';
  o.tabIndex = -1;
  o.innerHTML =
    '<div class="jjr-bar">' +
      '<button class="jjr-back" type="button"></button>' +
      '<div class="jjr-bar-title"></div>' +
      '<a class="jjr-web" target="_blank" rel="noreferrer"></a>' +
      '<button class="jjr-close" type="button"></button>' +
    '</div>' +
    '<div class="jjr-scroll"><div class="jjr-page"></div></div>';
  document.body.appendChild(o);
  o.querySelector('.jjr-back').textContent = i18n('reader_back');
  o.querySelector('.jjr-close').textContent = i18n('reader_terminal');
  o.querySelector('.jjr-web').textContent = i18n('reader_openWeb');
  o.querySelector('.jjr-back').addEventListener('click', function() { self.closeAndSend('\x1b[D'); });
  o.querySelector('.jjr-close').addEventListener('click', function() { self.dismiss(); });
  o.addEventListener('keydown', function(e) { self.onKeyDown(e); });
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

PttReader.prototype.onKeyDown = function(e) {
  var scroller = this.overlay.querySelector('.jjr-scroll');
  var page = scroller.clientHeight * 0.9;
  switch (e.key) {
    case 'Escape':
      this.dismiss();
      break;
    case 'ArrowLeft':
    case 'q':
      this.closeAndSend('\x1b[D');
      break;
    case 'X':
    case 'y':
    case '%':
      this.closeAndSend(e.key);
      break;
    case ' ':
    case 'PageDown':
      scroller.scrollTop += page;
      break;
    case 'PageUp':
      scroller.scrollTop -= page;
      break;
    case 'ArrowDown':
      scroller.scrollTop += 60;
      break;
    case 'ArrowUp':
      scroller.scrollTop -= 60;
      break;
    case 'Home':
      scroller.scrollTop = 0;
      break;
    case 'End':
      scroller.scrollTop = scroller.scrollHeight;
      break;
    default:
      return;
  }
  e.preventDefault();
  e.stopPropagation();
};

PttReader.prototype.openFor = function(h, key) {
  var self = this;
  this.loadingKey = key;
  this.findArticleUrl(h).then(function(url) {
    if (!url) throw new Error('not found on web');
    return self.fetchArticle(url);
  }).then(function(article) {
    if (self.loadingKey !== key) return;  // moved on meanwhile
    // Still reading the same article in the terminal?
    var now = self.headerFromTerminal();
    if (!now || now.board + '|' + now.author + '|' + now.title !== key) return;
    self.loadingKey = '';
    self.currentKey = key;
    self.article = article;
    self.render(article, h);
    self.show();
  }).catch(function(e) {
    console.log('reader unavailable for this article:', e.message);
    if (self.loadingKey === key) self.loadingKey = '';
    self.dismissedKey = key;  // stay in the terminal for this one
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

PttReader.prototype.linkBlock = function(url) {
  var el = PttReader.el;
  var wrap = el('div', 'jjr-media');
  var a = el('a', 'jjr-link', url);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noreferrer';
  wrap.appendChild(a);

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
    card.appendChild(el('div', 'jjr-card-host', 'YouTube'));
    wrap.appendChild(card);
  } else {
    var host = '';
    try { host = new URL(url).hostname; } catch (e) {}
    var c = el('a', 'jjr-card');
    c.href = url;
    c.target = '_blank';
    c.rel = 'noreferrer';
    c.appendChild(el('div', 'jjr-card-host', host));
    c.appendChild(el('div', 'jjr-card-url', url));
    wrap.replaceChild(c, a);
  }
  return wrap;
};

PttReader.prototype.renderText = function(text, container) {
  var el = PttReader.el;
  var lines = text.replace(/\r/g, '').split('\n');
  var para = null;
  var urlRe = /https?:\/\/[^\s<>"'，。）)]+/g;
  for (var i = 0; i < lines.length; ++i) {
    var line = lines[i];
    var trimmed = line.trim();
    var onlyUrl = /^https?:\/\/\S+$/.test(trimmed);
    if (onlyUrl) {
      para = null;
      container.appendChild(this.linkBlock(trimmed));
      continue;
    }
    if (!trimmed) {
      para = null;
      container.appendChild(el('div', 'jjr-gap'));
      continue;
    }
    var cls = 'jjr-line';
    if (/^[:：]\s?/.test(trimmed) || /^※ 引述/.test(trimmed)) cls += ' jjr-quote';
    else if (/^※ /.test(trimmed) || /^--$/.test(trimmed)) cls += ' jjr-sys';
    var div = el('div', cls);
    var last = 0, m;
    urlRe.lastIndex = 0;
    while ((m = urlRe.exec(line))) {
      div.appendChild(document.createTextNode(line.slice(last, m.index)));
      var a = el('a', 'jjr-link', m[0]);
      a.href = m[0];
      a.target = '_blank';
      a.rel = 'noreferrer';
      div.appendChild(a);
      last = m.index + m[0].length;
    }
    div.appendChild(document.createTextNode(line.slice(last)));
    container.appendChild(div);
  }
};

PttReader.prototype.render = function(article, h) {
  var el = PttReader.el;
  var o = this.ensureOverlay();
  var page = o.querySelector('.jjr-page');
  page.innerHTML = '';
  o.querySelector('.jjr-bar-title').textContent = (article.meta['標題'] || h.title) + '  ' + h.board;
  o.querySelector('.jjr-web').href = article.url;

  var head = el('div', 'jjr-head');
  head.appendChild(el('div', 'jjr-title', article.meta['標題'] || h.title));
  var info = el('div', 'jjr-info');
  info.appendChild(el('span', '', (article.meta['作者'] || h.author)));
  info.appendChild(el('span', '', article.meta['看板'] || h.board));
  info.appendChild(el('span', '', article.meta['時間'] || ''));
  head.appendChild(info);
  page.appendChild(head);

  var body = el('div', 'jjr-body');
  this.renderText(article.text, body);
  page.appendChild(body);

  page.appendChild(this.renderPushes(article));
  o.querySelector('.jjr-scroll').scrollTop = 0;
};

PttReader.prototype.renderPushes = function(article) {
  var el = PttReader.el;
  var pref = this.app.pref;
  var geo = this.app.pushInsights.geo;
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

  var wrap = el('div', 'jjr-pushes');
  var counts = { push: 0, boo: 0, arrow: 0 };
  var list = el('div', 'jjr-push-list');
  var nth = {};
  article.pushes.forEach(function(p, i) {
    var id = p.id.toLowerCase();
    nth[id] = (nth[id] || 0) + 1;
    if (p.tag === '推') counts.push++;
    else if (p.tag === '噓') counts.boo++;
    else counts.arrow++;

    var row = el('div', 'jjr-push');
    if (id in black) {
      if (hide) return;
      row.className += ' jjr-faded';
    }
    var hints = [];
    var level = '';
    var country = '';
    if (p.ip && geo.ready) {
      var cc = geo.lookup(p.ip);
      if (cc) {
        country = geo.countryName(cc);
        if (cc !== 'TW') level = 'foreign';
      }
    }
    if (p.ip) {
      var others = Object.keys(idsByIp[p.ip] || {}).filter(function(x) { return x !== id; });
      if (others.length) {
        hints.push('同IP:' + others.slice(0, 2).join(',') + (others.length > 2 ? '等' + others.length + '人' : ''));
        level = 'warn';
      }
      if (authorIp && p.ip === authorIp && id !== authorId) {
        hints.push('與作者同IP');
        level = 'warn';
      }
    }
    if (id in watch) {
      hints.push('觀察' + (watch[id] ? ':' + watch[id] : ''));
      if (level !== 'warn') level = 'watch';
    }
    if (countById[id] >= 8) hints.push('第' + nth[id] + '/' + countById[id] + '推');

    var top = el('div', 'jjr-push-top');
    top.appendChild(el('span', 'jjr-floor', (i + 1) + '樓'));
    top.appendChild(el('span', 'jjr-tag jjr-tag-' + (p.tag === '推' ? 'push' : p.tag === '噓' ? 'boo' : 'arrow'), p.tag));
    top.appendChild(el('span', 'jjr-id', p.id));
    if (country) top.appendChild(el('span', 'jjr-country' + (level === 'foreign' ? ' jjr-foreign' : ''), country));
    top.appendChild(el('span', 'jjr-time', p.time));
    row.appendChild(top);
    var content = el('div', 'jjr-push-content');
    var urlRe = /https?:\/\/[^\s]+/g, last = 0, m;
    while ((m = urlRe.exec(p.content))) {
      content.appendChild(document.createTextNode(p.content.slice(last, m.index)));
      var a = el('a', 'jjr-link', m[0]);
      a.href = m[0];
      a.target = '_blank';
      a.rel = 'noreferrer';
      content.appendChild(a);
      last = m.index + m[0].length;
    }
    content.appendChild(document.createTextNode(p.content.slice(last)));
    row.appendChild(content);
    // small previews for image links in pushes
    (p.content.match(/https?:\/\/\S+/g) || []).forEach(function(u) {
      var src = PttReader.imageSrc(u);
      if (!src) return;
      var im = el('img', 'jjr-push-img');
      im.loading = 'lazy';
      im.referrerPolicy = 'no-referrer';
      im.src = src;
      im.addEventListener('error', function() { im.style.display = 'none'; });
      row.appendChild(im);
    });
    if (hints.length) row.appendChild(el('div', 'jjr-hint jjr-' + (level || 'info'), '⚠ ' + hints.join(' ')));
    list.appendChild(row);
  });

  wrap.appendChild(el('div', 'jjr-push-summary',
    '推 ' + counts.push + '　噓 ' + counts.boo + '　→ ' + counts.arrow));
  wrap.appendChild(list);
  return wrap;
};
