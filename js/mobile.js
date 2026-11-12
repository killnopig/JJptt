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
JJMobile.SYNCED_KEY = 'jjptt.m.favsSynced';
JJMobile.SEARCH_PUSH_KEY = 'jjptt.m.searchByPush';
JJMobile.FONT_KEY = 'jjptt.m.font';
// pushes and the article list have their own sizes (unset: the text's size)
JJMobile.FONT_PARTS = {
  text: { key: JJMobile.FONT_KEY, css: '--jjm-fs', title: '文章內文' },
  push: { key: 'jjptt.m.fontPush', css: '--jjm-pfs', title: '推文' },
  list: { key: 'jjptt.m.fontList', css: '--jjm-lfs', title: '文章列表' }
};
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
JJMobile.SEARCH_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" style="vertical-align:middle">' +
  '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/>' +
  '<line x1="15.4" y1="15.4" x2="20.5" y2="20.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

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
  // the background connection (js/mobile_ptt.js) is only for logging in and
  // pushing: the old article view must not follow its screens
  var reader = this.app.reader;
  reader.onTerminalUpdate = function() {};
  reader.schedulePrefetch = function() {};
  this.ptt = new JJPtt(this.app);
  this.ptt.onChange(function(state) {
    var top = self.stack[self.stack.length - 1];
    if (top) self.setBar(top);
    var home = self.stack[0];
    if (home && home.type === 'home' && home.view) {  // the sync button's text
      var btn = home.view.querySelector('.jjm-tab-sync');
      if (btn) btn.textContent = state === 'in' ? '⟳ 同步' : '⟳ 同步 PTT';
    }
    // logged in: bring PTT's 我的最愛 in once per app start
    if (state === 'in' && !self.favsSyncedNow) {
      self.favsSyncedNow = true;
      self.syncFavs(false);
    }
  });
  this.setFont(JJMobile.store(JJMobile.FONT_KEY) || 17);
  this.setUiZoom(JJMobile.store(JJMobile.UI_KEY) || 1);
  this.setLineHeight(JJMobile.store(JJMobile.LH_KEY));
  this.setFloorColor(JJMobile.store(JJMobile.FLOOR_KEY));
  this.setFontOf('push', JJMobile.store(JJMobile.FONT_PARTS.push.key));
  this.setFontOf('list', JJMobile.store(JJMobile.FONT_PARTS.list.key));
  this.setPushStyle();
  this.setListGap();

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
    // back from the background: check the PTT connection (JJPtt.resume)
    var awaySince = 0;
    appPlugin.addListener('appStateChange', function(st) {
      if (!st || !st.isActive) { awaySince = Date.now(); return; }
      var away = awaySince ? Date.now() - awaySince : 0;
      awaySince = 0;
      if (self.ptt && self.ptt.resume) self.ptt.resume(away).catch(function() {});
    });
  }
};

JJMobile.prototype.start = function() {
  this.open({ type: 'home' });
  this.autoLogin();
  this.checkUpdate(false);
};

// ---- updating from inside the app ----------------------------------------------------
// Versions are JJptt's own (the extension's, package.json) plus N, the
// GitHub Actions run (版次): 「1.33.0 (57)」. Which build is newer is told by
// N alone; the release page also says 「版次 0.0.N」 (what builds before
// 1.33.0 (N) read) and this build knows its own N and version
// (build-info.js). Newer -> a bar on the home screen; one tap downloads the
// APK (ApkUpdaterPlugin, no browser) and opens Android's installer.

JJMobile.RELEASE_API = 'https://api.github.com/repos/killnopig/JJptt/releases/tags/android-latest';

JJMobile.RELEASE_DL = 'https://github.com/killnopig/JJptt/releases/download/android-latest/';

JJMobile.version = function(run, ver) {
  if (isNaN(run)) return '?';
  return ver ? ver + ' (' + run + ')' : '0.0.' + run;
};

JJMobile.prototype.myBuild = function() {
  return parseInt((window.JJPTT_BUILD || {}).run, 10);
};

JJMobile.prototype.myVersion = function() {
  return (window.JJPTT_BUILD || {}).version || '';
};

// The release page's text -> the run: 「版次 0.0.N」, or older 「0.0.N」 / 「1.N.0」.
JJMobile.runFromRelease = function(text) {
  var m = /版次\s*0\.0\.(\d+)/.exec(text || '') || /\b0\.0\.(\d+)\b|\b1\.(\d+)\.0\b/.exec(text || '');
  return m ? +(m[1] || m[2]) : NaN;
};

// The newest build: version.json next to the APK, read by the app itself
// (no limit on how often); GitHub's API (60 a hour per network, often used
// up on phone networks) only when that fails.
JJMobile.prototype.latestBuild = function() {
  var C = window.Capacitor;
  var plugin = C && C.Plugins && C.Plugins.ApkUpdater;
  var fromFile = plugin && plugin.fetchText ?
    plugin.fetchText({ url: JJMobile.RELEASE_DL + 'version.json' }).then(function(r) {
      var v = JSON.parse(r.text);
      if (typeof v.run !== 'number' || v.run <= 0) throw new Error('no run');
      return { run: +v.run, version: typeof v.version === 'string' ? v.version : '', url: JJMobile.RELEASE_DL + 'JJptt.apk' };
    }) : Promise.reject(new Error('no plugin'));
  return fromFile.catch(function() {
    return fetch(JJMobile.RELEASE_API, { headers: { 'Accept': 'application/vnd.github+json' } }).then(function(r) {
      if (r.status === 403) throw new Error('GitHub 暫時不給查（這個網路查太多次了），等一下再試或換 Wi-Fi');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(rel) {
      var run = JJMobile.runFromRelease((rel && (rel.body || rel.name)) || '');
      var apk = ((rel && rel.assets) || []).filter(function(a) { return /\.apk$/i.test(a.name); })[0];
      if (isNaN(run) || !apk) throw new Error('看不懂下載頁');
      return { run: run, version: '', url: apk.browser_download_url, size: apk.size };
    });
  });
};

JJMobile.prototype.checkUpdate = function(manual) {
  var self = this;
  var mine = this.myBuild();
  this.setUpdateRow(manual ? '檢查中…' : null);
  return this.latestBuild().then(function(latest) {
    self.update = latest;
    if (!isNaN(mine) && latest.run > mine) {
      self.updateAvailable = true;
      self.showUpdateBar();
      if (manual) self.installUpdate();
    } else {
      self.setUpdateRow('已經是最新版');
    }
  }).catch(function(err) {
    self.setUpdateRow(manual ? '檢查失敗：' + err.message : null);
  });
};

// The version and 檢查更新 sit in the home screen's top bar (no icon or
// name: space). A short note there (檢查中…, 下载中 40%); anything longer
// is a toast. Green 更新到 0.0.N when there is a newer one.
JJMobile.prototype.setUpdateRow = function(note) {
  var top = this.stack[this.stack.length - 1];
  var onHome = top && top.type === 'home';
  // the version button is only on the home screen: elsewhere every note is a toast
  var shortNote = onHome && note && note.length <= 10 && !/^已經是最新版$/.test(note);
  this.updateNote = shortNote ? note : null;
  if (note && !shortNote && this.app.showToast && !/^下載中 \d/.test(note)) this.app.showToast(note, note.length > 20 ? 5000 : 2000);
  this.refreshVersion();
};

JJMobile.prototype.showUpdateBar = function() {
  this.refreshVersion();
};

JJMobile.prototype.refreshVersion = function() {
  var self = this;
  var top = this.stack[this.stack.length - 1];
  if (!top || top.type !== 'home' || !this.titleEl) return;
  var text = this.updateNote ||
    (this.updateAvailable ? '更新到 ' + JJMobile.version(this.update.run, this.update.version) : JJMobile.version(this.myBuild(), this.myVersion()) + '・檢查更新');
  var b = JJMobile.button('jjm-verbtn' + (this.updateAvailable ? ' jjm-verbtn-new' : ''), text, function() {
    if (self.updating) return;
    if (self.updateAvailable) self.installUpdate();
    else self.checkUpdate(true);
  });
  this.titleEl.innerHTML = '';
  this.titleEl.appendChild(b);
};

JJMobile.prototype.installUpdate = function() {
  var self = this;
  var C = window.Capacitor;
  var plugin = C && C.Plugins && C.Plugins.ApkUpdater;
  if (!this.update) return;
  if (!plugin) {  // an older app without the updater: the download page
    window.open(this.update.url, '_blank');
    return;
  }
  if (this.updating) return;
  this.updating = true;
  var say = function(t) { self.setUpdateRow(t); };
  say('下載中…');
  var handle = null;
  Promise.resolve(plugin.addListener('progress', function(p) {
    var total = p.total > 0 ? p.total : self.update.size;
    if (total) say('下載中 ' + Math.floor(p.done / total * 100) + '%');
  })).then(function(h) { handle = h; });
  plugin.install({ url: this.update.url }).then(function() {
    say('請在跳出的畫面按「更新」');
    self.updateNote = null;
  }).catch(function(err) {
    var msg = String((err && err.message) || err);
    if (/permission/.test(msg)) say('請在剛打開的設定裡允許 JJptt「安裝不明應用程式」，回來再按一次更新');
    else say('更新失敗：' + msg);
  }).then(function() {
    self.updating = false;
    if (/^下載中/.test(self.updateNote || '')) self.updateNote = null;
    self.refreshVersion();
    if (handle) handle.remove();
  });
};

// With a saved account, log in in the background when the app opens (the
// settings load a moment after start).
JJMobile.prototype.autoLogin = function() {
  var self = this;
  var tries = 0;
  var check = function() {
    var pref = self.app.pref;
    var saved = pref && pref.logins;
    if (saved && saved[0] && saved[1]) {
      self.ptt.login(saved[0], saved[1]).catch(function(err) {
        if (self.app.showToast) self.app.showToast('自動登入失敗：' + err.message, 4000);
      });
    } else if (++tries < 15) {
      setTimeout(check, 200);
    }
  };
  check();
};

// 介面文字大小: the home screen, settings, sheets and the top bar, scaled
// (articles and lists have their own sizes).
// What the top bar shows once logged in: the account, just 👤, or a name
// of one's own (設定 → 帳號) -- for screenshots and people looking over.
JJMobile.ACCT_SHOW_KEY = 'jjptt.m.acctShow';
JJMobile.ACCT_NAME_KEY = 'jjptt.m.acctName';
JJMobile.acctLabel = function(user) {
  var how = JJMobile.store(JJMobile.ACCT_SHOW_KEY) || 'id';
  if (how === 'hide') return '👤';
  if (how === 'custom') return String(JJMobile.store(JJMobile.ACCT_NAME_KEY) || '').trim() || '👤';
  return user;
};

JJMobile.FACT_SHORT = 'FACT';  // Facts, Accuracy, Credibility & Truth = 真.事實查核中心
JJMobile.UI_KEY = 'jjptt.m.uiZoom';
JJMobile.FLOOR_KEY = 'jjptt.m.floorColor';
JJMobile.FLOOR_COLORS = [['灰（預設）', ''], ['白', '#e8ece4'], ['黃', '#ffd54f'], ['綠', '#9ccc65'],
                         ['藍', '#64b5f6'], ['紫', '#ba68c8'], ['紅', '#ef5350']];
JJMobile.prototype.setFloorColor = function(c) {
  this.floorColor = c || '';
  if (c) this.root.style.setProperty('--jjm-floor', c);
  else this.root.style.removeProperty('--jjm-floor');
  JJMobile.store(JJMobile.FLOOR_KEY, c || null);
};
JJMobile.prototype.setUiZoom = function(z) {
  this.uiZoom = z || 1;
  this.root.style.setProperty('--jjm-ui', String(this.uiZoom));
  JJMobile.store(JJMobile.UI_KEY, this.uiZoom);
};

// 內文行距: 1.2 to 2.4 times the text (default 1.65)
JJMobile.LH_KEY = 'jjptt.m.lineHeight';
JJMobile.prototype.setLineHeight = function(lh) {
  this.lineHeight = lh || 1.65;
  this.root.style.setProperty('--jjm-lh', String(this.lineHeight));
  JJMobile.store(JJMobile.LH_KEY, lh || null);
};

JJMobile.prototype.setFontOf = function(which, px) {
  if (which === 'text') return this.setFont(px);
  var f = JJMobile.FONT_PARTS[which];
  this.fonts = this.fonts || {};
  this.fonts[which] = px || null;
  if (px) this.root.style.setProperty(f.css, px + 'px');
  else this.root.style.removeProperty(f.css);
  JJMobile.store(f.key, px || null);
};

JJMobile.prototype.setFont = function(px) {
  this.fontPx = px;
  this.root.style.setProperty('--jjm-fs', px + 'px');
  JJMobile.store(JJMobile.FONT_KEY, px);
};

// Push spacing (px above / below each push) and "ID and text on one line".
JJMobile.GAP_KEY = 'jjptt.m.pushGap';
JJMobile.LIST_GAP_KEY = 'jjptt.m.listGap';

// Space above / below each row of the board and article lists.
JJMobile.prototype.setListGap = function(gap) {
  if (gap === undefined || gap === null) gap = JJMobile.store(JJMobile.LIST_GAP_KEY);
  if (typeof gap !== 'number') gap = 12;
  this.listGap = gap;
  this.root.style.setProperty('--jjm-lgap', gap + 'px');
  JJMobile.store(JJMobile.LIST_GAP_KEY, gap);
};
JJMobile.INLINE_KEY = 'jjptt.m.pushInline';
JJMobile.prototype.setPushStyle = function(gap, inline) {
  if (gap === undefined || gap === null) gap = JJMobile.store(JJMobile.GAP_KEY);
  if (typeof gap !== 'number') gap = 10;
  if (inline === undefined || inline === null) inline = JJMobile.store(JJMobile.INLINE_KEY) === true;
  this.pushGap = gap;
  this.pushInline = inline;
  this.root.style.setProperty('--jjm-pgap', gap + 'px');
  this.root.classList.toggle('jjm-inline', inline);
  JJMobile.store(JJMobile.GAP_KEY, gap);
  JJMobile.store(JJMobile.INLINE_KEY, inline);
};

// ---- screens ----------------------------------------------------------------------

// Opens a screen on top; the one below keeps its place for when you go back.
JJMobile.prototype.open = function(screen) {
  var top = this.stack[this.stack.length - 1];
  if (top) top.view.style.display = 'none';
  screen.view = JJMobile.el('div', 'jjm-view');
  screen.view.setAttribute('data-type', screen.type);
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
  if (top.type === 'home' && this.homeDirty) {  // 每頁幾個看板 changed
    this.homeDirty = false;
    this.reload(top);
  }
  this.setBar(top);
  if (top.type === 'board' && top.listNode) this.markRead(top);
};

JJMobile.prototype.render = function(screen) {
  this.setBar(screen);
  if (screen.type === 'home') this.renderHome(screen);
  else if (screen.type === 'board') this.renderBoard(screen);
  else if (screen.type === 'article') this.renderArticle(screen);
  else if (screen.type === 'settings') this.renderSettings(screen);
};

JJMobile.prototype.setBar = function(screen) {
  var self = this;
  var hasBack = this.stack.length > 1;
  this.backBtn.style.display = hasBack ? '' : 'none';
  this.bar.classList.toggle('jjm-noback', !hasBack);
  this.titleEl.textContent = screen.title || 'JJptt';
  if (screen.type === 'home') this.refreshVersion();  // the version, not the name
  this.actions.innerHTML = '';
  var add = function(text, label, fn) {
    var b = JJMobile.button('jjm-icon', text === '⌕' ? '' : text, fn);
    if (text === '⌕') b.innerHTML = JJMobile.SEARCH_SVG;  // a real magnifier (the ⌕ glyph is tiny)
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
    add('✎', '發文', function() { self.postSheet(screen); });
    add('⟳', '重新整理', function() { self.reload(screen); });
  } else if (screen.type === 'article') {
    add('⇡', '回到頂部', function() { if (screen.view) screen.view.scrollTo({ top: 0, behavior: 'smooth' }); });
    add('⇣', '到最下面推文', function() { self.toComposer(screen); });
    add('Aa', '字的大小', function() { self.fontSheet(); });
    add('⟳', '重新整理', function() { self.reload(screen); });
  } else if (screen.type === 'settings') {
    // nothing on the right
  } else {
    add('⌕', '找看板', function() { self.boardSheet(); });
    var st = this.ptt ? this.ptt.state : 'off';
    var acct = add(st === 'in' ? JJMobile.acctLabel(this.ptt.user) : st === 'connecting' ? '登入中…' : '登入', '帳號', function() { self.accountSheet(); });
    acct.classList.add('jjm-acct');
    if (st === 'in') acct.classList.add('jjm-acct-in');
    add('⚙', '設定', function() { self.open({ type: 'settings' }); });
  }
};
