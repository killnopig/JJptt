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
  }
};

JJMobile.prototype.start = function() {
  this.open({ type: 'home' });
  this.autoLogin();
  this.checkUpdate(false);
};

// ---- updating from inside the app ----------------------------------------------------
// Versions are 0.0.N, N the GitHub Actions run (版次); the release page
// says 「0.0.N」 and this build knows its own N
// (build-info.js). Newer -> a bar on the home screen; one tap downloads the
// APK (ApkUpdaterPlugin, no browser) and opens Android's installer.

JJMobile.RELEASE_API = 'https://api.github.com/repos/killnopig/JJptt/releases/tags/android-latest';

JJMobile.RELEASE_DL = 'https://github.com/killnopig/JJptt/releases/download/android-latest/';

JJMobile.version = function(run) {
  return isNaN(run) ? '?' : '0.0.' + run;
};

JJMobile.prototype.myBuild = function() {
  return parseInt((window.JJPTT_BUILD || {}).run, 10);
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
      return { run: +v.run, url: JJMobile.RELEASE_DL + 'JJptt.apk' };
    }) : Promise.reject(new Error('no plugin'));
  return fromFile.catch(function() {
    return fetch(JJMobile.RELEASE_API, { headers: { 'Accept': 'application/vnd.github+json' } }).then(function(r) {
      if (r.status === 403) throw new Error('GitHub 暫時不給查（這個網路查太多次了），等一下再試或換 Wi-Fi');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(rel) {
      var m = /\b0\.0\.(\d+)\b|\b1\.(\d+)\.0\b/.exec((rel && (rel.body || rel.name)) || '');
      var apk = ((rel && rel.assets) || []).filter(function(a) { return /\.apk$/i.test(a.name); })[0];
      if (!m || !apk) throw new Error('看不懂下載頁');
      return { run: +(m[1] || m[2]), url: apk.browser_download_url, size: apk.size };
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
    (this.updateAvailable ? '更新到 ' + JJMobile.version(this.update.run) : JJMobile.version(this.myBuild()) + '・檢查更新');
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

// ---- account ------------------------------------------------------------------------

JJMobile.prototype.accountSheet = function(then) {
  var self = this;
  var el = JJMobile.el;
  var ptt = this.ptt;
  if (ptt.state === 'in') {
    var box = el('div', 'jjm-sheet-list');
    box.appendChild(el('div', 'jjm-hint', '已登入，可以推文、回文、發文。'));
    box.appendChild(JJMobile.button('jjm-sheet-item', '登出', function() {
      ptt.logout();
      var pref = self.app.pref;
      if (pref && pref.logins && pref.logins[0]) {
        pref.logins = ['', ''];
        pref.setStorage({ logins: { u: '', p: '' } });
      }
      self.closeSheet();
    }));
    this.showSheet(ptt.user, box);
    return;
  }
  var form = el('form', 'jjm-sheet-form');
  var user = el('input');
  user.type = 'text';
  user.placeholder = 'PTT 帳號';
  user.setAttribute('autocapitalize', 'off');
  user.setAttribute('autocorrect', 'off');
  user.setAttribute('autocomplete', 'username');
  var pass = el('input');
  pass.type = 'password';
  pass.placeholder = '密碼';
  pass.setAttribute('autocomplete', 'current-password');
  // when shown as text, keyboards must not capitalise or correct it
  pass.setAttribute('autocapitalize', 'off');
  pass.setAttribute('autocorrect', 'off');
  pass.setAttribute('spellcheck', 'false');
  var saved = this.app.pref && this.app.pref.logins;
  if (saved && saved[0]) user.value = saved[0];
  var remember = el('label', 'jjm-check');
  var box2 = el('input');
  box2.type = 'checkbox';
  box2.checked = true;
  remember.appendChild(box2);
  remember.appendChild(document.createTextNode(' 記住帳號密碼，下次自動登入'));
  var err = el('div', 'jjm-form-error');
  var go = el('button', 'jjm-btn jjm-btn-main', '登入');
  form.appendChild(user);
  // the password with an eye to see what was typed
  var passRow = el('div', 'jjm-pass');
  passRow.appendChild(pass);
  var eye = JJMobile.button('jjm-eye', '👁', function() {
    var show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    eye.classList.toggle('jjm-on', show);
    eye.setAttribute('aria-label', show ? '隱藏密碼' : '顯示密碼');
    pass.focus();
  });
  eye.setAttribute('aria-label', '顯示密碼');
  passRow.appendChild(eye);
  form.appendChild(passRow);
  form.appendChild(remember);
  form.appendChild(err);
  form.appendChild(go);
  form.appendChild(el('div', 'jjm-hint', '看文章不用登入；登入後才能推文、回文、發文。帳號密碼只存在這支手機。'));
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var u = user.value.trim(), p = pass.value;
    if (!u || !p) {
      err.textContent = '請輸入帳號和密碼';
      return;
    }
    err.textContent = '';
    go.disabled = true;
    go.textContent = '登入中…';
    ptt.login(u, p).then(function() {
      if (box2.checked) {
        var pref = self.app.pref;
        pref.logins = [u, p];
        pref.setStorage({ logins: { u: u, p: p } });
      }
      self.closeSheet();
      if (self.app.showToast) self.app.showToast('已登入 ' + u, 1500);
      if (then) then();
    }).catch(function(e2) {
      go.disabled = false;
      go.textContent = '登入';
      err.textContent = e2.message;
    });
  });
  this.showSheet('登入 PTT', form);
  setTimeout(function() { (user.value ? pass : user).focus(); }, 50);
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

// PTT's 我的最愛 into 我的看板: PTT's order first, then boards added only in
// the app (nothing is removed).
JJMobile.prototype.syncFavs = function(manual) {
  var self = this;
  if (this.ptt.state !== 'in') {
    if (manual) this.accountSheet(function() { self.syncFavs(true); });
    return;
  }
  if (manual && this.app.showToast) this.app.showToast('正在讀取 PTT 我的最愛…', 1500);
  this.ptt.favorites().then(function(boards) {
    var mine = self.favs();
    var have = {};
    var merged = boards.map(function(b) {
      have[b.name.toLowerCase()] = true;
      return b.folder ? { name: b.name, title: b.title, folder: b.folder } : { name: b.name, title: b.title };
    });
    var added = 0;
    mine.forEach(function(f) {
      // an older sync took 我的最愛's folders (MyFavFolder) for boards
      if (/^MyFavFolder$/i.test(f.name)) return;
      if (!have[f.name.toLowerCase()]) merged.push(f);
    });
    boards.forEach(function(b) {
      if (!mine.some(function(f) { return f.name.toLowerCase() === b.name.toLowerCase(); })) added++;
    });
    if (!boards.length) {
      if (self.app.showToast) self.app.showToast('沒有讀到 PTT 我的最愛的看板（我的看板沒有改）', 3500);
      return;
    }
    JJMobile.store(JJMobile.FAVS_KEY, merged);
    JJMobile.store(JJMobile.SYNCED_KEY, Date.now());
    if (self.app.showToast) self.app.showToast('已同步 PTT 我的最愛：' + boards.length + ' 個看板' + (added ? '（新加 ' + added + ' 個）' : ''), 2500);
    var home = self.stack[0];
    if (home && home.type === 'home') {
      home.view.innerHTML = '';
      self.renderHome(home);
      if (self.stack.length === 1) self.setBar(home);
    }
  }).catch(function(err) {
    if (manual && self.app.showToast) self.app.showToast('同步失敗：' + err.message, 3500);
  });
};

// 🔍 on the home bar: type a board name and go.
JJMobile.prototype.boardSheet = function() {
  var self = this;
  var el = JJMobile.el;
  var form = el('form', 'jjm-sheet-form');
  var input = el('input');
  input.type = 'search';
  input.placeholder = '看板名稱，例如 Gossiping';
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('enterkeyhint', 'go');
  form.appendChild(input);
  form.appendChild(el('button', 'jjm-btn jjm-btn-main', '前往'));
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var name = input.value.trim().replace(/^\/?bbs\//i, '').replace(/[^\w-]/g, '');
    if (!name) return;
    self.closeSheet();
    self.open({ type: 'board', board: name });
  });
  this.showSheet('找看板', form);
  setTimeout(function() { input.focus(); }, 50);
};

// Home: tabs instead of one long page. 我的最愛 10 boards a tab (我的最愛1,
// 我的最愛2…), each PTT folder its own tab, then 熱門看板. The tab shown is
// remembered.
JJMobile.TAB_SIZE = 10;  // boards a tab unless set (設定 → 版面)
JJMobile.TAB_SIZE_KEY = 'jjptt.m.tabSize';
JJMobile.TAB_KEY = 'jjptt.m.homeTab';

JJMobile.homeTabs = function(favs) {
  var tabs = [], top = [], folders = {}, order = [];
  favs.forEach(function(f) {
    if (!f.folder) return top.push(f);
    if (!folders[f.folder]) { folders[f.folder] = []; order.push(f.folder); }
    folders[f.folder].push(f);
  });
  var size = +JJMobile.store(JJMobile.TAB_SIZE_KEY) || JJMobile.TAB_SIZE;
  var n = Math.max(1, Math.ceil(top.length / size));
  for (var i = 0; i < n; ++i) {
    tabs.push({ id: 'fav' + (i + 1), label: n > 1 ? '我的最愛' + (i + 1) : '我的最愛',
                boards: top.slice(i * size, (i + 1) * size) });
  }
  order.forEach(function(name) {
    tabs.push({ id: 'dir:' + name, label: name, boards: folders[name] });
  });
  tabs.push({ id: 'hot', label: '熱門看板', hot: true });
  return tabs;
};

JJMobile.prototype.renderHome = function(screen) {
  var self = this;
  var el = JJMobile.el;
  var v = screen.view;
  screen.title = 'JJptt';

  var tabs = JJMobile.homeTabs(this.favs());
  var want = screen.tab;
  if (!want) { try { want = window.localStorage.getItem(JJMobile.TAB_KEY); } catch (e) {} }
  var cur = tabs.filter(function(t) { return t.id === want; })[0] || tabs[0];
  screen.tab = cur.id;

  var bar = el('div', 'jjm-tabs');
  tabs.forEach(function(t) {
    var b = JJMobile.button('jjm-tab' + (t === cur ? ' jjm-on' : ''), t.label, function() {
      if (t === cur) return;
      screen.tab = t.id;
      try { window.localStorage.setItem(JJMobile.TAB_KEY, t.id); } catch (e) {}
      self.reload(screen);
    });
    bar.appendChild(b);
  });
  bar.appendChild(JJMobile.button('jjm-tab jjm-tab-sync', this.ptt.state === 'in' ? '⟳ 同步' : '⟳ 同步 PTT', function() {
    self.syncFavs(true);
  }));
  v.appendChild(bar);
  setTimeout(function() {  // the chosen tab in view
    var on = bar.querySelector('.jjm-on');
    if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, 0);

  var list = el('div', 'jjm-list');
  v.appendChild(list);
  if (!cur.hot) {
    if (!cur.boards.length) {
      list.appendChild(el('div', 'jjm-hint', '在看板裡按右上角的 ☆ 加到這裡，或登入後按「同步」拿 PTT 的我的最愛。'));
    }
    cur.boards.forEach(function(f) { list.appendChild(self.boardRow(f.name, JJPtt.cleanTitle(f.title), '')); });
  } else {
    var wait = this.loading(list);
    this.app.reader.fetchDoc(JJMobile.WEB + '/bbs/hotboards.html').then(function(doc) {
      wait.remove();
      var rows = doc.querySelectorAll('.b-ent a.board');
      for (var i = 0; i < rows.length; ++i) {
        var a = rows[i];
        var name = (a.querySelector('.board-name') || {}).textContent || '';
        var title = ((a.querySelector('.board-title') || {}).textContent || '').replace(/^◎/, '');
        var users = ((a.querySelector('.board-nuser') || {}).textContent || '').trim();
        if (name) list.appendChild(self.boardRow(name.trim(), title.trim(), users));
      }
    }).catch(function(err) {
      wait.remove();
      self.failed(list, err, function() { self.reload(screen); });
    });
  }
  this.refreshVersion();
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
          // short on a phone: FACT = 真.事實查核中心 (設定 → 事實查核 says so)
          var ft = rep.querySelector('.jjt-fact-title');
          if (ft) ft.textContent = JJMobile.FACT_SHORT;
          var fa = rep.querySelector('.jjt-fact-ai');
          if (fa) fa.textContent = 'AI 分析';
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

  v.appendChild(this.composer(screen));

  // 上一篇 / 回列表 / 下一篇 where 設定 → 版面 → 內文 puts them: the top,
  // the bottom, and/or floating on the left or right edge (one hand)
  var list = screen.list;
  var hasPrev = list && screen.index > 0;
  var hasNext = list && (screen.index + 1 < list.entries.length || list.older);
  var makeNav = function(cls, short) {
    var nav = el('div', cls);
    if (hasPrev) nav.appendChild(JJMobile.button('jjm-btn', short ? '‹' : '‹ 上一篇', function() { self.step(screen, -1); }));
    nav.appendChild(JJMobile.button('jjm-btn', short ? '≡' : '回列表', function() { self.back(); }));
    if (hasNext) nav.appendChild(JJMobile.button('jjm-btn jjm-btn-main', short ? '›' : '下一篇 ›', function() { self.step(screen, 1); }));
    return nav;
  };
  var where = JJMobile.navPlaces();
  if (where.indexOf('top') >= 0) v.insertBefore(makeNav('jjm-endnav jjm-topnav'), head.nextSibling);
  if (where.indexOf('bottom') >= 0) v.appendChild(makeNav('jjm-endnav'));
  if (where.indexOf('left') >= 0) v.appendChild(makeNav('jjm-sidenav jjm-sidenav-left', true));
  if (where.indexOf('right') >= 0) v.appendChild(makeNav('jjm-sidenav jjm-sidenav-right', true));
};

JJMobile.NAV_KEY = 'jjptt.m.navPlaces';
JJMobile.NAV_PLACES = [['top', '文章頂部'], ['bottom', '文章底部'], ['left', '左側浮動'], ['right', '右側浮動']];
JJMobile.navPlaces = function() {
  var v = JJMobile.store(JJMobile.NAV_KEY);
  return Array.isArray(v) ? v : ['bottom'];
};

// Push box under the pushes: 推 / 噓 / →, the text (as long as PTT allows
// on one line) and 送出; 回文 next to it.
JJMobile.prototype.composer = function(screen) {
  var self = this;
  var el = JJMobile.el;
  var box = el('form', 'jjm-compose');
  var kinds = el('div', 'jjm-chips jjm-kinds');
  var kind = '1';
  [['1', '推'], ['2', '噓'], ['3', '→']].forEach(function(k) {
    var b = JJMobile.button('jjm-chip jjm-kind-' + k[0] + (k[0] === kind ? ' jjm-on' : ''), k[1], function() {
      kind = k[0];
      Array.prototype.forEach.call(kinds.children, function(x) { x.classList.remove('jjm-on'); });
      b.classList.add('jjm-on');
    });
    kinds.appendChild(b);
  });
  var count = el('span', 'jjm-count');
  kinds.appendChild(count);
  box.appendChild(kinds);
  var row = el('div', 'jjm-compose-row');
  var input = el('input');
  input.type = 'text';
  input.placeholder = '說點什麼…';
  input.setAttribute('enterkeyhint', 'send');
  row.appendChild(input);
  var send = el('button', 'jjm-btn jjm-btn-main', '送出');
  row.appendChild(send);
  box.appendChild(row);
  var reply = JJMobile.button('jjm-link-btn', '回文到看板…', function() { self.replySheet(screen); });
  box.appendChild(reply);

  var max = function() { return JJPtt.pushMaxBytes(self.ptt.user || 'abcdefghijkl'); };
  var update = function() {
    var left = Math.floor((max() - JJPtt.big5Length(input.value)) / 2);
    count.textContent = '還可以打 ' + left + ' 個字';
    count.classList.toggle('jjm-over', left < 0);
  };
  input.addEventListener('input', update);
  update();
  box.addEventListener('submit', function(e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    if (JJPtt.big5Length(text) > max()) {
      if (self.app.showToast) self.app.showToast('太長了，PTT 一則推文放不下', 2500);
      return;
    }
    var go = function() {
      send.disabled = true;
      send.textContent = '送出中…';
      self.ptt.push(screen.url, kind, text).then(function() {
        input.value = '';
        if (self.app.showToast) self.app.showToast('已送出', 1500);
        self.reloadAfterPost(screen, { id: self.ptt.user, text: text });
      }).catch(function(err) {
        if (self.app.showToast) self.app.showToast(err.message, 4000);
      }).then(function() {
        send.disabled = false;
        send.textContent = '送出';
      });
    };
    if (self.ptt.state === 'in' || self.ptt.user) go();
    else self.accountSheet(go);
  });
  return box;
};

JJMobile.prototype.replySheet = function(screen) {
  var self = this;
  var el = JJMobile.el;
  var start = function() {
    var form = el('form', 'jjm-sheet-form');
    var area = el('textarea');
    area.rows = 8;
    area.placeholder = '回文內容';
    form.appendChild(area);
    var q = el('label', 'jjm-check');
    var quote = el('input');
    quote.type = 'checkbox';
    q.appendChild(quote);
    q.appendChild(document.createTextNode(' 引用原文'));
    form.appendChild(q);
    var err = el('div', 'jjm-form-error');
    form.appendChild(err);
    var go = el('button', 'jjm-btn jjm-btn-main', '發表回文');
    form.appendChild(go);
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      if (!area.value.trim()) return;
      go.disabled = true;
      go.textContent = '發表中…';
      self.ptt.reply(screen.url, area.value, quote.checked).then(function() {
        self.closeSheet();
        if (self.app.showToast) self.app.showToast('已發表回文', 2000);
      }).catch(function(e2) {
        go.disabled = false;
        go.textContent = '發表回文';
        err.textContent = e2.message;
      });
    });
    self.showSheet('回文：' + ((screen.article && screen.article.meta['標題']) || ''), form);
    setTimeout(function() { area.focus(); }, 50);
  };
  if (this.ptt.state === 'in' || this.ptt.user) start();
  else this.accountSheet(start);
};

// 發文: category chips (the board's own once PTT has shown them, PTT's
// defaults before that) or one typed in, the title, the text. What is typed
// is kept as a draft per board until it is posted.
JJMobile.DEFAULT_POST_TYPES = ['問題', '建議', '討論', '心得', '閒聊', '請益', '情報', '公告'];
JJMobile.DRAFT_KEY = 'jjptt.m.draft.';

JJMobile.prototype.postSheet = function(screen) {
  var self = this;
  var el = JJMobile.el;
  var board = screen.board;
  var store = window.localStorage;
  var draft = {};
  try { draft = JSON.parse(store.getItem(JJMobile.DRAFT_KEY + board.toLowerCase()) || '{}'); } catch (e) {}
  var start = function() {
    var form = el('form', 'jjm-sheet-form');
    var known = JJPtt.postTypes(board);
    var types = known.length ? known : JJMobile.DEFAULT_POST_TYPES;
    var type = draft.type || '';
    var chips = el('div', 'jjm-chips');
    var custom = el('input');
    custom.type = 'text';
    custom.placeholder = '或自己輸入類別';
    custom.maxLength = 4;
    // the first chip (不選) is the one for no category
    var mark = function(fillCustom) {
      Array.prototype.forEach.call(chips.children, function(c, i) {
        c.classList.toggle('jjm-on', i === 0 ? !type : c.textContent === type);
      });
      if (fillCustom) custom.value = types.indexOf(type) >= 0 ? '' : type;
    };
    [''].concat(types).forEach(function(t) {
      chips.appendChild(JJMobile.button('jjm-chip', t || '不選', function() {
        type = t;
        mark(true);
        update();
      }));
    });
    form.appendChild(chips);
    form.appendChild(custom);
    if (!known.length) {
      form.appendChild(el('div', 'jjm-hint', '這是 PTT 預設的類別；在這個板發過一次文之後，會換成這個板自己的類別。'));
    }
    var title = el('input');
    title.type = 'text';
    title.placeholder = '標題';
    title.setAttribute('enterkeyhint', 'next');
    title.value = draft.title || '';
    form.appendChild(title);
    var count = el('span', 'jjm-count');
    form.appendChild(count);
    var area = el('textarea');
    area.rows = 10;
    area.placeholder = '內文';
    area.value = draft.text || '';
    form.appendChild(area);
    var err = el('div', 'jjm-form-error');
    form.appendChild(err);
    var go = el('button', 'jjm-btn jjm-btn-main', '發表文章');
    form.appendChild(go);

    var left = function() {
      var prefix = type ? JJPtt.big5Length('[' + type + '] ') : 0;
      return Math.floor((JJPtt.TITLE_BYTES - prefix - JJPtt.big5Length(title.value.trim())) / 2);
    };
    var save = function() {
      try {
        store.setItem(JJMobile.DRAFT_KEY + board.toLowerCase(),
                      JSON.stringify({ type: type, title: title.value, text: area.value }));
      } catch (e) {}
    };
    var update = function() {
      var n = left();
      count.textContent = '標題還可以打 ' + n + ' 個字';
      count.classList.toggle('jjm-over', n < 0);
      save();
    };
    custom.addEventListener('input', function() {
      type = custom.value.replace(/[\[\]\s]/g, '');
      mark(false);
      update();
    });
    title.addEventListener('input', update);
    area.addEventListener('input', save);
    mark(true);
    update();

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      err.textContent = '';
      if (!title.value.trim()) { err.textContent = '請輸入標題'; return; }
      if (left() < 0) { err.textContent = '標題太長了'; return; }
      if (!area.value.trim()) { err.textContent = '請輸入內文'; return; }
      go.disabled = true;
      go.textContent = '發表中…';
      self.ptt.post(board, type, title.value, area.value).then(function() {
        try { store.removeItem(JJMobile.DRAFT_KEY + board.toLowerCase()); } catch (e2) {}
        self.closeSheet();
        if (self.app.showToast) self.app.showToast('已發表文章', 2000);
        if (self.stack[self.stack.length - 1] === screen) self.reload(screen);
      }).catch(function(e2) {
        go.disabled = false;
        go.textContent = '發表文章';
        err.textContent = e2.message + '（內容已存成草稿）';
      });
    });
    self.showSheet('發文到 ' + board, form);
    setTimeout(function() { (title.value ? area : title).focus(); }, 50);
  };
  if (this.ptt.state === 'in' || this.ptt.user) start();
  else this.accountSheet(start);
};

// ⇣ on an article: straight to the push box at the bottom. No keyboard
// until the box itself is tapped.
JJMobile.prototype.toComposer = function(screen) {
  var c = screen.view && screen.view.querySelector('.jjm-compose');
  if (c) c.scrollIntoView({ block: 'end', behavior: 'smooth' });
};

// After pushing: load the article again, staying at the bottom.
// After pushing: reload, go to the very bottom, then check the new push is
// there. www.ptt.cc can lag a few seconds: not there yet -> reload again
// (a few times). Found -> highlighted just above the push box.
JJMobile.prototype.reloadAfterPost = function(screen, mine) {
  var self = this;
  var tries = 0;
  var findMine = function() {
    if (!mine || !mine.id) return null;
    var id = mine.id.toLowerCase(), text = String(mine.text || '').slice(0, 6);
    var rows = screen.view.querySelectorAll('.jjm-pushes > .jjm-push');
    for (var i = rows.length - 1; i >= 0 && i >= rows.length - 30; --i) {
      var who = (rows[i].querySelector('.jjm-push-id') || {}).textContent || '';
      var said = (rows[i].querySelector('.jjm-push-text') || {}).textContent || '';
      if (who.trim().toLowerCase() === id && said.indexOf(text) >= 0) return rows[i];
    }
    return null;
  };
  var round = function() {
    delete self.articles[screen.url];
    // a query the page ignores: past any cache on the way
    var fresh = screen.url + (screen.url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now();
    self.app.reader.fetchArticle(fresh).then(function(article) {
      article.url = screen.url;
      self.articles[screen.url] = { promise: Promise.resolve(article), at: Date.now() };
      if (self.stack[self.stack.length - 1] !== screen) return;
      // 1. reload  2. to the bottom
      screen.view.innerHTML = '';
      self.fillArticle(screen, article);
      var c = screen.view.querySelector('.jjm-compose');
      if (c) c.scrollIntoView({ block: 'end' });
      else screen.view.scrollTop = screen.view.scrollHeight;
      // 3. is the push there?
      var row = findMine();
      if (row) { row.classList.add('jjm-push-new'); return; }
      if (mine && ++tries < 6) setTimeout(round, 1500);
      else if (mine && self.app.showToast) self.app.showToast('推文已送出，網頁版還沒更新，等一下按 ⟳', 3000);
    }).catch(function() {});
  };
  round();
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
    // 秒推、機房… on the account's line, not a line of their own
    if (chips.length) {
      var cr = el('span', 'jjm-push-chips jjm-push-chips-inline');
      chips.forEach(function(c) { cr.appendChild(el('span', 'jjm-pchip jjm-pchip-' + c[1], c[0])); });
      head.appendChild(cr);
    }
    head.appendChild(el('span', 'jjm-push-time', [flag, p.time].filter(Boolean).join(' ')));
    head.appendChild(el('span', 'jjm-push-floor', (i + 1) + '樓'));
    row.appendChild(head);
    var content = reader.lineNode([{ text: p.content, st: { fg: 7, bg: 0, hl: false, href: '' } }]);
    content.node.className = 'jjm-push-text';
    row.appendChild(content.node);
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

// Aa on an article: 內文 and 推文 sizes, each on its own row; the sheet stays
// open so both can be tried on the article behind it.
JJMobile.prototype.fontSheet = function() {
  var self = this;
  var el = JJMobile.el;
  var wrap = el('div', 'jjm-sheet-form');
  ['text', 'push'].forEach(function(which) {
    wrap.appendChild(el('div', 'jjm-set-title', which === 'text' ? '內文' : '推文'));
    var box = el('div', 'jjm-chips jjm-font');
    var now = which === 'text' ? self.fontPx : (self.fonts || {}).push || null;
    var opts = [['小', 15], ['中', 17], ['大', 19], ['特大', 22]];
    if (which === 'push') opts.unshift(['同內文', null]);
    opts.forEach(function(f) {
      var b = JJMobile.button('jjm-chip' + (now === f[1] ? ' jjm-on' : ''), f[0], function() {
        self.setFontOf(which, f[1]);
        Array.prototype.forEach.call(box.children, function(x) { x.classList.remove('jjm-on'); });
        b.classList.add('jjm-on');
      });
      if (f[1]) b.style.fontSize = f[1] + 'px';
      box.appendChild(b);
    });
    wrap.appendChild(box);
  });
  this.showSheet('字的大小', wrap);
};

// ---- settings ---------------------------------------------------------------------------
//
// The app's own settings screen: only what matters on a phone (reading,
// fact check, lists, account). Fact-check rules come from the extension's
// settings page (index.html), so a new rule shows up here by itself.

JJMobile.SKIP_PREFS = { showSuspectPrefix: 1, suspectPrefix: 1, suspectSameIpText: 1, suspectAuthorIpText: 1 };

JJMobile.prototype.setPref = function(key, value) {
  var pref = this.app.pref;
  if (!pref) return;
  pref.values[key] = value;
  var v = {};
  v[key] = value;
  pref.setStorage({ values: v });
  this.app.onPrefChange(pref, key);
};

// "名稱：說明" -> [名稱, 說明]
JJMobile.splitLabel = function(text) {
  text = String(text || '');
  var i = text.indexOf('：');
  if (i > 0 && i < 24) return [text.slice(0, i), text.slice(i + 1)];
  return [text, ''];
};

JJMobile.prototype.renderSettings = function(screen) {
  var self = this;
  var el = JJMobile.el;
  var v = screen.view;
  var pref = this.app.pref;
  screen.title = '設定';
  this.titleEl.textContent = '設定';
  if (!pref || !pref.values) {
    v.appendChild(el('div', 'jjm-loading', '設定還在載入，請稍候再開'));
    return;
  }
  // tabs like the extension's settings page (一般 / 版面 / 黑名單 / … / 關於):
  // one part at a time instead of one long page; the tab is remembered
  var TABS = [['general', '一般'], ['layout', '版面'], ['lists', '黑名單'], ['fact', '真.事實查核'],
              ['account', '帳號'], ['about', '關於']];
  var cur = screen.tab;
  if (!cur) { try { cur = window.localStorage.getItem('jjptt.m.setTab'); } catch (e) {} }
  if (!TABS.some(function(t) { return t[0] === cur; })) cur = 'general';
  var tabBar = el('div', 'jjm-tabs');
  v.appendChild(tabBar);
  var panes = {};
  TABS.forEach(function(t) {
    var pane = el('div', 'jjm-pane');
    pane.style.display = t[0] === cur ? '' : 'none';
    panes[t[0]] = pane;
    tabBar.appendChild(JJMobile.button('jjm-tab' + (t[0] === cur ? ' jjm-on' : ''), t[1], function(e) {
      screen.tab = t[0];
      try { window.localStorage.setItem('jjptt.m.setTab', t[0]); } catch (e2) {}
      Array.prototype.forEach.call(tabBar.children, function(b) { b.classList.remove('jjm-on'); });
      e.currentTarget.classList.add('jjm-on');
      Object.keys(panes).forEach(function(k) { panes[k].style.display = k === t[0] ? '' : 'none'; });
      v.scrollTop = 0;
    }));
  });
  TABS.forEach(function(t) { v.appendChild(panes[t[0]]); });
  setTimeout(function() {
    var on = tabBar.querySelector('.jjm-on');
    if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, 0);
  var section = function(tab, title, note) {
    var pane = panes[tab];
    pane.appendChild(el('div', 'jjm-section', title));
    if (note) pane.appendChild(el('div', 'jjm-hint', note));
    var box = el('div', 'jjm-group');
    pane.appendChild(box);
    return box;
  };

  // account
  var acc = section('account', '帳號');
  var st = this.ptt.state;
  acc.appendChild(this.setRow(st === 'in' ? '已登入 ' + this.ptt.user : '登入 PTT',
    st === 'in' ? '點這裡登出' : '登入後可以推文、回文、發文', function() { self.accountSheet(function() { self.reload(screen); }); }));
  if (this.ptt.lastFailure) {
    var lf = this.ptt.lastFailure;
    acc.appendChild(this.setRow('最後一次 PTT 畫面（除錯用）', this.shortTime(new Date(lf.at).toISOString()) + '・' + lf.message, function() {
      var pre = JJMobile.el('pre', 'jjm-screen', lf.screen.replace(/\s+$/gm, ''));
      var box = JJMobile.el('div', '');
      box.appendChild(JJMobile.el('div', 'jjm-hint', '背景連線失敗時 PTT 的畫面。截圖給開發者看，就知道哪裡卡住。'));
      box.appendChild(pre);
      self.showSheet('最後一次 PTT 畫面', box);
    }));
  }
  if (this.ptt.lastLogin) {
    var ll = this.ptt.lastLogin;
    var sec = function(ms) { return (ms / 1000).toFixed(1) + ' 秒'; };
    acc.appendChild(this.setRow('最後一次登入花的時間', '共 ' + sec(ll.total) + '（點開看每一步）', function() {
      var pre = JJMobile.el('pre', 'jjm-screen', ll.steps.map(function(st) { return st[0] + '　' + sec(st[1]); }).join('\n'));
      var box = JJMobile.el('div', '');
      box.appendChild(JJMobile.el('div', 'jjm-hint', '每一步等了多久。登入很慢時截圖給開發者看。'));
      box.appendChild(pre);
      self.showSheet('最後一次登入', box);
    }));
  }
  acc.appendChild(this.localToggleRow(JJPtt.KICK_KEY, '登入時踢掉其他地方的連線', '關著 = 保留電腦或別的手機上開著的 PTT'));
  // the top bar's account button
  var show = el('div', 'jjm-set jjm-set-col');
  show.appendChild(el('div', 'jjm-set-title', '上方顯示的帳號'));
  show.appendChild(el('div', 'jjm-set-sub', '截圖或旁人看得到螢幕時，可以不露出帳號'));
  var showChips = el('div', 'jjm-chips');
  var nameBox = el('input');
  nameBox.type = 'text';
  nameBox.maxLength = 12;
  nameBox.placeholder = '自訂名稱，例如 我';
  nameBox.value = JJMobile.store(JJMobile.ACCT_NAME_KEY) || '';
  var how = JJMobile.store(JJMobile.ACCT_SHOW_KEY) || 'id';
  nameBox.style.display = how === 'custom' ? '' : 'none';
  [['id', '顯示帳號'], ['hide', '隱藏（👤）'], ['custom', '自訂名稱']].forEach(function(o) {
    var b = JJMobile.button('jjm-chip' + (how === o[0] ? ' jjm-on' : ''), o[1], function() {
      JJMobile.store(JJMobile.ACCT_SHOW_KEY, o[0]);
      Array.prototype.forEach.call(showChips.children, function(x) { x.classList.remove('jjm-on'); });
      b.classList.add('jjm-on');
      nameBox.style.display = o[0] === 'custom' ? '' : 'none';
      if (o[0] === 'custom') nameBox.focus();
    });
    showChips.appendChild(b);
  });
  nameBox.addEventListener('input', function() { JJMobile.store(JJMobile.ACCT_NAME_KEY, nameBox.value); });
  show.appendChild(showChips);
  show.appendChild(nameBox);
  acc.appendChild(show);

  // reading
  var rd = section('general', '閱讀');
  rd.appendChild(this.numberRow('readerPrefetchCount', '先讀好接下來幾篇', '0 = 不預先讀取，最多 10', 0, 10));
  rd.appendChild(this.toggleRow('readerPrefetchImages', '預先讀取時連圖片一起下載', '換篇更快，但流量多很多'));
  rd.appendChild(this.toggleRow('readerLowResImages', '用低解析度圖片', '載入快、省流量；點圖片看原圖'));
  rd.appendChild(this.toggleRow('hidePinned', '隱藏置底公告', '看板文章列表不顯示板規、公告那些置底文章'));
  rd.appendChild(this.toggleRow('readerGroupRuns', '同一個人的連續推文排在一起', '被別人插話打斷的也排回一起，樓層照舊'));
  this.layoutPane(panes.layout, screen);

  // search
  var se = section('general', '搜尋');
  var sw = this.localToggleRow(JJMobile.SEARCH_PUSH_KEY, '看板搜尋預設用推文數篩選', '打開搜尋就選好「推文數 ≥」並填好下面的數字', true);
  se.appendChild(sw);
  se.appendChild(this.numberRow('pushFilterDefault', '推文數預設', '正數 = 推文至少這麼多（10 = 推 ≥ 10）；負數 = 噓文（-10 = 噓比推多 10 以上）', -99, 999));
  // the extension's 備份成檔案, read here
  var imp = el('div', 'jjm-set jjm-set-col');
  imp.appendChild(el('div', 'jjm-set-title', '匯入擴充版的設定檔'));
  imp.appendChild(el('div', 'jjm-set-sub', '電腦上擴充版「同步、備份與更新 → 備份成檔案」存的 jjptt-settings-….json，傳到手機後在這裡選它：黑名單、觀察名單、自訂名單、事實查核規則都會套用（不含帳號密碼）。'));
  var file = el('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.style.display = 'none';
  file.addEventListener('change', function() {
    var f = file.files && file.files[0];
    if (!f || !self.app.updater) return;
    self.app.updater.importSettings(f);
    setTimeout(function() { self.reload(screen); }, 1500);
  });
  imp.appendChild(file);
  imp.appendChild(JJMobile.button('jjm-btn jjm-btn-main', '選擇設定檔匯入', function() { file.value = ''; file.click(); }));
  // export: the same file the extension's 備份成檔案 makes, through
  // Android's share sheet (雲端硬碟、LINE、檔案…)
  imp.appendChild(el('div', 'jjm-set-sub', '匯出：存成同樣格式的 json，可以存到雲端硬碟、傳 LINE，電腦擴充版也能匯入。'));
  imp.appendChild(JJMobile.button('jjm-btn', '匯出設定檔', function() {
    var up = self.app.updater, ds = self.app.driveSync;
    if (!ds || !ds.snapshot) return;
    var data = ds.snapshot();
    data.kind = 'settings-export';
    data.exportedAt = new Date().toISOString();
    data.jjpttVersion = JJMobile.version(self.myBuild()) + ' (app)';
    data.appLook = self.getLook ? self.getLook() : undefined;
    var d = new Date(), pad = function(n) { return (n < 10 ? '0' : '') + n; };
    var name = 'jjptt-settings-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    var text = JSON.stringify(data, null, 2);
    var C = window.Capacitor, plugin = C && C.Plugins && C.Plugins.ApkUpdater;
    if (plugin && plugin.shareText) {
      plugin.shareText({ name: name, text: text }).catch(function(e) {
        if (self.app.showToast) self.app.showToast('匯出失敗：' + (e && e.message || e), 3000);
      });
    } else if (up && up.exportSettings) {
      up.exportSettings();
    }
  }));
  var ie = section('general', '同步');
  ie.appendChild(imp);

  // lists
  var ab0 = section('lists', '自動黑名單');
  this.autoBlackRules(ab0);
  ab0.appendChild(this.tempListRow(screen));

  var ls = section('lists', '名單');
  ls.appendChild(this.choiceRow('blacklistMode', '黑名單的人', [[0, '淡化'], [1, '隱藏'], [2, '不管']]));
  ls.appendChild(this.listRow('黑名單', Object.keys(pref.blacklistedUserIds || {}), {},
    function(id) { self.app.doAddBlacklistUserId(id); }, function(id) { self.app.doRemoveBlacklistUserId(id); }, screen));
  ls.appendChild(this.textRow('blacklistedTitleKeywords', '標題關鍵字黑名單', '用逗號隔開，標題有這些字的文章淡化或隱藏'));
  ls.appendChild(this.toggleRow('watchlistEnabled', '觀察名單', '推文旁標「觀察」，列表上作者變紫色'));
  ls.appendChild(this.listRow('觀察名單', Object.keys(pref.watchlistedUserIds || {}), pref.watchlistedUserIds || {},
    function(id) { self.app.doAddWatchUserId(id); }, function(id) { self.app.doRemoveWatchUserId(id); }, screen));
  ls.appendChild(this.toggleRow('customListEnabled', '自訂名單', '推文旁標名單名稱，列表上作者變青色'));
  ls.appendChild(this.textRow('customListName', '自訂名單的名稱', '預設「網軍」'));
  ls.appendChild(this.listRow(pref.customListName(), Object.keys(pref.notedUserIds || {}), pref.notedUserIds || {},
    function(id) { self.app.doSetUserNote(id); }, function(id) { self.app.doRemoveUserNote(id); }, screen));

  // fact check (from the extension's settings page)
  var fc = section('fact', '真.事實查核中心 FACT', '文章推文上方那一條「FACT」。標出來的只是疑點，不代表一定是網軍。');
  this.factRows(fc, screen);
  if (pref.values.aiService !== undefined && typeof PREF_OPTIONS !== 'undefined' && PREF_OPTIONS.aiService) {
    fc.appendChild(this.choiceRow('aiService', '「請 AI 分析」用哪一個',
      PREF_OPTIONS.aiService.map(function(k, i) { return [i, i18n(k)]; })));
  }
  this.aboutFact(section('fact', '關於 真.事實查核中心 FACT'));

  // about
  var ab = section('about', '關於');
  var b = window.JJPTT_BUILD || {};
  var verRow = el('div', 'jjm-set');
  var verText = el('div', 'jjm-set-text');
  verText.appendChild(el('div', 'jjm-set-title', '版本 ' + JJMobile.version(parseInt(b.run, 10))));
  if (b.time) verText.appendChild(el('div', 'jjm-set-sub', '打包時間 ' + this.shortTime(b.time)));
  verRow.appendChild(verText);
  ab.appendChild(verRow);
  var upd = JJMobile.button('jjm-btn jjm-btn-main jjm-wide', '⟳ 檢查並自動更新', function() { self.checkUpdate(true); });
  panes.about.insertBefore(upd, ab);
  panes.about.insertBefore(el('div', 'jjm-hint', '有新版就直接下載，接著會跳出 Android 的安裝畫面，按「更新」就裝好（設定和登入都會保留）。'), ab);
  var cafe = JJMobile.button('jjm-btn jjm-wide jjm-btn-coffee', '☕ 覺得好用？請我喝杯咖啡', function() {
    if (window.confirm('要打開 Ko-fi 贊助頁面嗎？（自願，不影響任何功能）')) window.open('https://ko-fi.com/killnopig', '_blank');
  });
  panes.about.appendChild(cafe);
  panes.about.appendChild(el('div', 'jjm-hint', '會先問一次再打開 Ko-fi，不會誤按就扣款。'));
  ab.appendChild(this.setRow('原始碼與回報問題', 'GitHub', function() {
    window.open('https://github.com/killnopig/JJptt', '_blank');
  }));
};

// ---- 版面: sub-tabs, each with a live demo on top -------------------------------------
// 文章列表 / 內文 / 推文 / 看板列表: what is changed below shows in the demo
// above at once.

JJMobile.prototype.fontChips = function(which) {
  var self = this;
  var el = JJMobile.el;
  var row = el('div', 'jjm-set jjm-set-col');
  row.appendChild(el('div', 'jjm-set-title', '字的大小'));
  var chips = el('div', 'jjm-chips');
  var now = which === 'text' ? self.fontPx : (self.fonts || {})[which] || null;
  var opts = [['小', 15], ['中', 17], ['大', 19], ['特大', 22]];
  if (which !== 'text') opts.unshift(['同內文', null]);
  opts.forEach(function(f) {
    var b = JJMobile.button('jjm-chip' + (now === f[1] ? ' jjm-on' : ''), f[0], function() {
      self.setFontOf(which, f[1]);
      Array.prototype.forEach.call(chips.children, function(x) { x.classList.remove('jjm-on'); });
      b.classList.add('jjm-on');
    });
    chips.appendChild(b);
  });
  row.appendChild(chips);
  return row;
};

JJMobile.prototype.slider = function(title, sub, min, max, value, words, onInput, step) {
  var el = JJMobile.el;
  var row = el('div', 'jjm-set jjm-set-col');
  var head = el('div', 'jjm-set-head');
  head.appendChild(el('div', 'jjm-set-title', title));
  var val = el('span', 'jjm-set-val');
  head.appendChild(val);
  row.appendChild(head);
  if (sub) row.appendChild(el('div', 'jjm-set-sub', sub));
  var range = el('input', 'jjm-range');
  range.type = 'range';
  range.min = min;
  range.max = max;
  range.step = step || 2;
  range.value = value;
  var show = function() { val.textContent = words(+range.value); };
  show();
  range.addEventListener('input', function() { onInput(+range.value); show(); });
  row.appendChild(range);
  return row;
};

JJMobile.demoList = function() {
  var el = JJMobile.el;
  var frame = el('div', 'jjm-list');
  [['爆', 'hot', '[新聞] 颱風明天登陸 北部可能停班停課', 'reporter01', '11/12'],
   ['15', '10', '[問卦] 有沒有便利商店咖啡越來越貴的八卦？', 'coffee99', '11/12'],
   ['3', '1', '[爆卦] 這個標題比較長，看看兩行的時候間距長怎樣好不好讀', 'longtitle', '11/12']
  ].forEach(function(e) {
    var r = el('div', 'jjm-row jjm-article');
    r.appendChild(el('div', 'jjm-article-title', e[2]));
    var meta = el('div', 'jjm-article-meta');
    meta.appendChild(el('span', 'jjm-nrec jjm-nrec-' + e[1], e[0]));
    meta.appendChild(el('span', 'jjm-author', e[3]));
    meta.appendChild(el('span', 'jjm-date', e[4]));
    r.appendChild(meta);
    frame.appendChild(r);
  });
  return frame;
};

JJMobile.demoText = function() {
  var el = JJMobile.el;
  var frame = el('div', 'jjm-reading');
  var head = el('div', 'jjm-head');
  head.appendChild(el('h1', 'jjm-head-title', '[心得] 第一次用手機看 PTT 的感想'));
  frame.appendChild(head);
  var body = el('div', 'jjm-body');
  ['以前都用電腦連，', '這次試了手機 App，', '字的大小可以自己調，', '看久了眼睛比較不累。'].forEach(function(t) {
    body.appendChild(el('div', 'jjt-line', t));
  });
  frame.appendChild(body);
  return frame;
};

JJMobile.demoPushes = function() {
  var el = JJMobile.el;
  var frame = el('div', 'jjm-reading');
  [['推', 'up', 'kitten5566', '這篇整理得很清楚，推', '11/12 10:21', 12, []],
   ['→', 'arrow', 'kitten5566', '補充一下：官方今天也有發新聞稿', '11/12 10:22', 13, []],
   ['噓', 'down', 'troll0607', '又在帶風向', '11/12 10:22', 14, [['秒推', 'warn']]],
   ['推', 'up', 'neko_neko', '樓上的 IP 跟另外兩個人一樣欸', '11/12 10:25', 15, [['觀察', 'watch']]]
  ].forEach(function(s) {
    var p = el('div', 'jjm-push');
    if (s[6].length) p.setAttribute('data-level', s[6][0][1]);
    var h = el('div', 'jjm-push-head');
    h.appendChild(el('span', 'jjm-push-tag jjm-push-' + s[1], s[0]));
    h.appendChild(el('span', 'jjm-push-id', s[2]));
    h.appendChild(el('span', 'jjm-push-time', '🇹🇼 ' + s[4]));
    h.appendChild(el('span', 'jjm-push-floor', s[5] + '樓'));
    p.appendChild(h);
    p.appendChild(el('div', 'jjm-push-text', s[3]));
    if (s[6].length) {
      var c = el('div', 'jjm-push-chips');
      s[6].forEach(function(x) { c.appendChild(el('span', 'jjm-pchip jjm-pchip-' + x[1], x[0])); });
      p.appendChild(c);
    }
    frame.appendChild(p);
  });
  return frame;
};

JJMobile.prototype.demoBoards = function() {
  var frame = JJMobile.el('div', 'jjm-list');
  frame.appendChild(this.boardRow('Gossiping', '[八卦] 亂講話', ''));
  frame.appendChild(this.boardRow('C_Chat', '[希洽] 閒聊', ''));
  frame.appendChild(this.boardRow('Stock', '[股票]', ''));
  // a demo: tapping a row goes nowhere
  Array.prototype.forEach.call(frame.children, function(r) { r.style.pointerEvents = 'none'; });
  return frame;
};

// 版面 presets: 預設, 開發者建議, and two of one's own. A look is every
// 版面 setting in one object.
JJMobile.LOOK_SLOTS_KEY = 'jjptt.m.looks';
JJMobile.LOOK_DEFAULT = { text: 17, push: null, list: null, lh: 1.65, listGap: 12, pushGap: 10, inline: false,
                          floor: '', nav: ['bottom'], ui: 1, tab: 10 };
JJMobile.LOOK_DEV = { text: 17, push: 15, list: 17, lh: 1.5, listGap: 6, pushGap: 4, inline: false,
                      floor: '', nav: ['bottom', 'right'], ui: 1, tab: 15 };
JJMobile.prototype.getLook = function() {
  return { text: this.fontPx, push: (this.fonts || {}).push || null, list: (this.fonts || {}).list || null,
           lh: this.lineHeight || 1.65, listGap: this.listGap, pushGap: this.pushGap, inline: !!this.pushInline,
           floor: this.floorColor || '', nav: JJMobile.navPlaces(), ui: this.uiZoom || 1,
           tab: +JJMobile.store(JJMobile.TAB_SIZE_KEY) || JJMobile.TAB_SIZE };
};
JJMobile.prototype.applyLook = function(l) {
  l = l || JJMobile.LOOK_DEFAULT;
  this.setFont(l.text || 17);
  this.setFontOf('push', l.push || null);
  this.setFontOf('list', l.list || null);
  this.setLineHeight(l.lh || 1.65);
  this.setListGap(typeof l.listGap === 'number' ? l.listGap : 12);
  this.setPushStyle(typeof l.pushGap === 'number' ? l.pushGap : 10, !!l.inline);
  this.setFloorColor(l.floor || '');
  JJMobile.store(JJMobile.NAV_KEY, Array.isArray(l.nav) ? l.nav : ['bottom']);
  this.setUiZoom(l.ui || 1);
  JJMobile.store(JJMobile.TAB_SIZE_KEY, l.tab || JJMobile.TAB_SIZE);
  JJMobile.store(JJMobile.TAB_KEY, null);
  if (this.stack[0] && this.stack[0].type === 'home') this.stack[0].tab = null;
  this.homeDirty = true;
};

JJMobile.prototype.lookPresets = function(pane, screen) {
  var self = this;
  var el = JJMobile.el;
  var slots = JJMobile.store(JJMobile.LOOK_SLOTS_KEY) || {};
  var box = el('div', 'jjm-set jjm-set-col jjm-looks');
  box.appendChild(el('div', 'jjm-set-title', '建議組合'));
  var chips = el('div', 'jjm-chips');
  var apply = function(look, name) {
    self.applyLook(look);
    if (self.app.showToast) self.app.showToast('已套用「' + name + '」', 1500);
    self.reload(screen);
  };
  chips.appendChild(JJMobile.button('jjm-chip', '預設', function() { apply(JJMobile.LOOK_DEFAULT, '預設'); }));
  chips.appendChild(JJMobile.button('jjm-chip', '開發者建議', function() { apply(JJMobile.LOOK_DEV, '開發者建議'); }));
  ['1', '2'].forEach(function(n) {
    var has = !!slots[n];
    var b = JJMobile.button('jjm-chip' + (has ? '' : ' jjm-empty'), '自訂' + n + (has ? '' : '（空）'), function() {
      if (has) apply(slots[n], '自訂' + n);
      else if (self.app.showToast) self.app.showToast('自訂' + n + ' 還沒存，先按下面的「存成自訂' + n + '」', 2500);
    });
    chips.appendChild(b);
  });
  box.appendChild(chips);
  var save = el('div', 'jjm-chips');
  ['1', '2'].forEach(function(n) {
    save.appendChild(JJMobile.button('jjm-chip jjm-chip-small', '把現在的存成自訂' + n, function() {
      slots[n] = self.getLook();
      JJMobile.store(JJMobile.LOOK_SLOTS_KEY, slots);
      if (self.app.showToast) self.app.showToast('已存成自訂' + n, 1500);
      self.reload(screen);
    }));
  });
  save.appendChild(JJMobile.button('jjm-chip jjm-chip-small', '複製設定碼', function() {
    var code = 'JJLOOK' + JSON.stringify(self.getLook());
    var done = function() { if (self.app.showToast) self.app.showToast('已複製，可以貼給別人或開發者', 2000); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, function() { window.prompt('複製這段：', code); });
      else window.prompt('複製這段：', code);
    } catch (e) { window.prompt('複製這段：', code); }
  }));
  save.appendChild(JJMobile.button('jjm-chip jjm-chip-small', '貼上設定碼', function() {
    var code = window.prompt('貼上別人給你的設定碼：', '');
    if (!code) return;
    try { apply(JSON.parse(String(code).trim().replace(/^JJLOOK/, '')), '設定碼'); }
    catch (e) { if (self.app.showToast) self.app.showToast('這不是設定碼', 2000); }
  }));
  box.appendChild(save);
  pane.appendChild(box);
};

JJMobile.prototype.layoutPane = function(pane, screen) {
  var self = this;
  var el = JJMobile.el;
  this.lookPresets(pane, screen);
  var gapWord = function(lo) {
    return function(g) { return g <= lo ? '最緊' : g <= lo + 4 ? '緊' : g <= lo + 10 ? '標準' : g <= lo + 16 ? '鬆' : '最鬆'; };
  };
  var SUBS = [
    ['list', '文章列表', function(box) {
      box.appendChild(self.fontChips('list'));
      box.appendChild(self.slider('間距', '每一篇文章上下的空間（看板列表也一樣）', 2, 24, self.listGap, gapWord(4),
        function(v) { self.setListGap(v); }));
    }, JJMobile.demoList],
    ['text', '內文', function(box) {
      box.appendChild(self.fontChips('text'));
      box.appendChild(self.slider('行距', '每一行之間的空間', 12, 24, Math.round((self.lineHeight || 1.65) * 10),
        function(v) { return v <= 13 ? '最緊' : v <= 15 ? '緊' : v <= 18 ? '標準' : v <= 21 ? '鬆' : '最鬆'; },
        function(v) { self.setLineHeight(v / 10); }, 1));
      var nr = el('div', 'jjm-set jjm-set-col');
      nr.appendChild(el('div', 'jjm-set-title', '上一篇／回列表／下一篇 放在哪'));
      nr.appendChild(el('div', 'jjm-set-sub', '可以選好幾個；左側、右側是貼在螢幕邊的小按鈕，單手拇指按得到'));
      var nchips = el('div', 'jjm-chips');
      JJMobile.NAV_PLACES.forEach(function(pl) {
        var on = JJMobile.navPlaces().indexOf(pl[0]) >= 0;
        var b = JJMobile.button('jjm-chip' + (on ? ' jjm-on' : ''), pl[1], function() {
          var cur = JJMobile.navPlaces().slice();
          var i = cur.indexOf(pl[0]);
          if (i >= 0) cur.splice(i, 1); else cur.push(pl[0]);
          JJMobile.store(JJMobile.NAV_KEY, cur);
          b.classList.toggle('jjm-on', i < 0);
        });
        nchips.appendChild(b);
      });
      nr.appendChild(nchips);
      box.appendChild(nr);
    }, JJMobile.demoText],
    ['push', '推文', function(box) {
      box.appendChild(self.fontChips('push'));
      box.appendChild(self.slider('間距', '', 0, 24, self.pushGap, gapWord(2),
        function(v) { self.setPushStyle(v, self.pushInline); }));
      var line = el('label', 'jjm-set jjm-toggle');
      var t = el('div', 'jjm-set-text');
      t.appendChild(el('div', 'jjm-set-title', '帳號和推文排在同一行'));
      t.appendChild(el('div', 'jjm-set-sub', '比較緊湊，一個畫面看得到更多推文'));
      line.appendChild(t);
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = self.pushInline;
      cb.addEventListener('change', function() { self.setPushStyle(self.pushGap, cb.checked); });
      line.appendChild(cb);
      line.appendChild(el('span', 'jjm-switch'));
      box.appendChild(line);
      var fl = el('div', 'jjm-set jjm-set-col');
      fl.appendChild(el('div', 'jjm-set-title', '樓層的顏色'));
      var fchips = el('div', 'jjm-chips');
      JJMobile.FLOOR_COLORS.forEach(function(c) {
        var b = JJMobile.button('jjm-chip' + ((self.floorColor || '') === c[1] ? ' jjm-on' : ''), c[0], function() {
          self.setFloorColor(c[1]);
          Array.prototype.forEach.call(fchips.children, function(x) { x.classList.remove('jjm-on'); });
          b.classList.add('jjm-on');
        });
        if (c[1]) b.style.color = c[1];
        fchips.appendChild(b);
      });
      fl.appendChild(fchips);
      box.appendChild(fl);
    }, JJMobile.demoPushes],
    ['boards', '看板列表', function(box) {
      var perRow = el('div', 'jjm-set jjm-set-col');
      perRow.appendChild(el('div', 'jjm-set-title', '我的最愛每一頁幾個看板'));
      perRow.appendChild(el('div', 'jjm-set-sub', '超過就分成 我的最愛1、我的最愛2…'));
      var perChips = el('div', 'jjm-chips');
      var perNow = +JJMobile.store(JJMobile.TAB_SIZE_KEY) || JJMobile.TAB_SIZE;
      [10, 15, 20, 30].forEach(function(n) {
        var b = JJMobile.button('jjm-chip' + (perNow === n ? ' jjm-on' : ''), n + ' 個', function() {
          JJMobile.store(JJMobile.TAB_SIZE_KEY, n);
          JJMobile.store(JJMobile.TAB_KEY, null);
          if (self.stack[0] && self.stack[0].type === 'home') self.stack[0].tab = null;
          Array.prototype.forEach.call(perChips.children, function(x) { x.classList.remove('jjm-on'); });
          b.classList.add('jjm-on');
          self.homeDirty = true;
        });
        perChips.appendChild(b);
      });
      perRow.appendChild(perChips);
      box.appendChild(perRow);
      box.appendChild(self.slider('間距', '每一個看板上下的空間（文章列表也一樣）', 2, 24, self.listGap, gapWord(4),
        function(v) { self.setListGap(v); }));
    }, function() { return self.demoBoards(); }],
    ['ui', '介面文字', function(box) {
      var row = el('div', 'jjm-set jjm-set-col');
      row.appendChild(el('div', 'jjm-set-title', '介面文字大小'));
      row.appendChild(el('div', 'jjm-set-sub', '首頁、設定、說明文字和跳出來的視窗；文章和列表在前面幾個分頁調'));
      var chips = el('div', 'jjm-chips');
      [['最小', 0.8], ['小', 0.9], ['中', 1], ['大', 1.1], ['更大', 1.2], ['特大', 1.3]].forEach(function(z) {
        var b = JJMobile.button('jjm-chip' + ((self.uiZoom || 1) === z[1] ? ' jjm-on' : ''), z[0], function() {
          self.setUiZoom(z[1]);
          Array.prototype.forEach.call(chips.children, function(x) { x.classList.remove('jjm-on'); });
          b.classList.add('jjm-on');
        });
        chips.appendChild(b);
      });
      row.appendChild(chips);
      box.appendChild(row);
    }, function() {
      var d = el('div', 'jjm-group jjm-demo-ui');
      d.appendChild(self.setRow('同 IP 多帳號', '不同帳號用同一個 IP 推文時標示（這是說明文字）', function() {}));
      return d;
    }]
  ];
  var cur = screen.layoutTab || 'list';
  var bar = el('div', 'jjm-subtabs');
  pane.appendChild(bar);
  var demo = el('div', 'jjm-demo');
  pane.appendChild(demo);
  var box = el('div', 'jjm-group');
  pane.appendChild(box);
  var show = function(id) {
    screen.layoutTab = id;
    var sub = SUBS.filter(function(x) { return x[0] === id; })[0];
    Array.prototype.forEach.call(bar.children, function(b, i) { b.classList.toggle('jjm-on', SUBS[i][0] === id); });
    demo.innerHTML = '';
    demo.appendChild(el('div', 'jjm-demo-label', '示範（下面改了這裡馬上變）'));
    demo.appendChild(sub[3]());
    box.innerHTML = '';
    sub[2](box);
  };
  SUBS.forEach(function(x) {
    bar.appendChild(JJMobile.button('jjm-chip', x[1], function() { show(x[0]); }));
  });
  show(cur);
};

JJMobile.prototype.setRow = function(title, sub, onTap) {
  var el = JJMobile.el;
  var row = el('button', 'jjm-set jjm-set-tap');
  row.type = 'button';
  var t = el('div', 'jjm-set-text');
  t.appendChild(el('div', 'jjm-set-title', title));
  if (sub) t.appendChild(el('div', 'jjm-set-sub', sub));
  row.appendChild(t);
  row.appendChild(el('span', 'jjm-set-chev', '›'));
  return JJMobile.tap(row, onTap);
};

JJMobile.prototype.toggleRow = function(key, title, sub) {
  var self = this;
  var el = JJMobile.el;
  var vals = this.app.pref.values;
  var on = vals[key] !== false && vals[key] !== 0 && vals[key] !== undefined;
  if (typeof DEFAULT_PREFS !== 'undefined' && vals[key] === undefined) on = !!DEFAULT_PREFS[key];
  var row = el('label', 'jjm-set jjm-toggle');
  var t = el('div', 'jjm-set-text');
  t.appendChild(el('div', 'jjm-set-title', title));
  if (sub) t.appendChild(el('div', 'jjm-set-sub', sub));
  row.appendChild(t);
  var box = el('input');
  box.type = 'checkbox';
  box.checked = on;
  box.addEventListener('change', function() {
    self.setPref(key, box.checked);
    row.dispatchEvent(new CustomEvent('jjm-toggle', { bubbles: false, detail: box.checked }));
  });
  row.appendChild(box);
  row.appendChild(el('span', 'jjm-switch'));
  row.setAttribute('data-key', key);
  return row;
};

// A switch kept in this phone only (not one of the extension's settings).
JJMobile.prototype.localToggleRow = function(storeKey, title, sub, defaultOn) {
  var el = JJMobile.el;
  var row = el('label', 'jjm-set jjm-toggle');
  var t = el('div', 'jjm-set-text');
  t.appendChild(el('div', 'jjm-set-title', title));
  if (sub) t.appendChild(el('div', 'jjm-set-sub', sub));
  row.appendChild(t);
  var box = el('input');
  box.type = 'checkbox';
  var saved = null;
  try { saved = window.localStorage.getItem(storeKey); } catch (e) {}
  // stored as '1' / '0' (older switches) or true / false
  box.checked = saved === null ? !!defaultOn : (saved === '1' || saved === 'true');
  box.addEventListener('change', function() {
    try { window.localStorage.setItem(storeKey, box.checked ? (defaultOn ? 'true' : '1') : (defaultOn ? 'false' : '0')); } catch (e) {}
  });
  row.appendChild(box);
  row.appendChild(el('span', 'jjm-switch'));
  return row;
};

JJMobile.prototype.numberRow = function(key, title, sub, min, max) {
  var self = this;
  var el = JJMobile.el;
  var row = el('div', 'jjm-set');
  var t = el('div', 'jjm-set-text');
  t.appendChild(el('div', 'jjm-set-title', title));
  if (sub) t.appendChild(el('div', 'jjm-set-sub', sub));
  row.appendChild(t);
  var input = el('input', 'jjm-num');
  input.type = 'number';
  input.inputMode = 'numeric';
  input.value = this.app.pref.values[key];
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  input.addEventListener('change', function() {
    var n = parseInt(input.value, 10);
    if (isNaN(n)) return;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    input.value = n;
    self.setPref(key, n);
  });
  row.appendChild(input);
  return row;
};

JJMobile.prototype.textRow = function(key, title, sub) {
  var self = this;
  var el = JJMobile.el;
  var row = el('div', 'jjm-set jjm-set-col');
  row.appendChild(el('div', 'jjm-set-title', title));
  if (sub) row.appendChild(el('div', 'jjm-set-sub', sub));
  var input = el('input', 'jjm-text');
  input.type = 'text';
  input.value = this.app.pref.values[key] || '';
  input.addEventListener('change', function() { self.setPref(key, input.value.trim()); });
  row.appendChild(input);
  return row;
};

JJMobile.prototype.choiceRow = function(key, title, options) {
  var self = this;
  var el = JJMobile.el;
  var row = el('div', 'jjm-set jjm-set-col');
  row.appendChild(el('div', 'jjm-set-title', title));
  var chips = el('div', 'jjm-chips');
  var cur = parseInt(this.app.pref.values[key], 10) || 0;
  options.forEach(function(o) {
    var b = JJMobile.button('jjm-chip' + (o[0] === cur ? ' jjm-on' : ''), o[1], function() {
      self.setPref(key, o[0]);
      Array.prototype.forEach.call(chips.children, function(x) { x.classList.remove('jjm-on'); });
      b.classList.add('jjm-on');
    });
    chips.appendChild(b);
  });
  row.appendChild(chips);
  return row;
};

// A list of IDs: tap ✕ to take one off, type one to add.
JJMobile.prototype.listRow = function(title, ids, notes, add, remove, screen) {
  var self = this;
  var el = JJMobile.el;
  var row = el('div', 'jjm-set jjm-set-col');
  row.appendChild(el('div', 'jjm-set-title', title + '（' + ids.length + '）'));
  var list = el('div', 'jjm-idlist');
  ids.sort().forEach(function(id) {
    var item = el('span', 'jjm-idchip');
    item.appendChild(el('span', '', id + (notes[id] ? '：' + notes[id] : '')));
    item.appendChild(JJMobile.button('jjm-idx', '✕', function() {
      remove(id);
      self.reload(screen);
    }));
    list.appendChild(item);
  });
  if (!ids.length) list.appendChild(el('span', 'jjm-set-sub', '還沒有人'));
  row.appendChild(list);
  var form = el('form', 'jjm-addrow');
  var input = el('input', 'jjm-text');
  input.type = 'text';
  input.placeholder = '加入帳號';
  input.setAttribute('autocapitalize', 'off');
  form.appendChild(input);
  form.appendChild(el('button', 'jjm-btn', '加入'));
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var id = input.value.trim().toLowerCase();
    if (!/^[a-z0-9]{2,12}$/.test(id)) return;
    add(id);
    self.reload(screen);
  });
  row.appendChild(form);
  return row;
};

// 自動黑名單 (連推 / 同網址洗版): why, where, how long; remove or make permanent.
// 自動黑名單, like the extension's: who, why (連推 N 則 / 同一網址貼在 N 篇,
// with that address), in which article (tap to open it), when it was added
// and how long is left; remove or make permanent.
JJMobile.prototype.tempListRow = function(screen) {
  var self = this;
  var el = JJMobile.el;
  var pref = this.app.pref;
  pref.pruneTempBlacklist();
  var ids = Object.keys(pref.tempBlacklist || {});
  // newest first
  ids.sort(function(x, y) { return pref.tempBlacklist[y] - pref.tempBlacklist[x]; });
  var row = el('div', 'jjm-set jjm-set-col');
  row.appendChild(el('div', 'jjm-set-title', '自動黑名單（' + ids.length + '）'));
  row.appendChild(el('div', 'jjm-set-sub', ids.length ? '被規則自動加入的人，到時間自己解除。誤殺的按「移除」。' : '目前沒有人。'));
  var ago = function(ms) {
    var m = Math.round(ms / 60000);
    return m < 60 ? Math.max(1, m) + ' 分鐘前' : Math.round(m / 60) + ' 小時前';
  };
  ids.forEach(function(id) {
    var info = (pref.tempBlacklistInfo || {})[id] || {};
    var until = pref.tempBlacklist[id];
    var left = Math.max(1, Math.round((until - Date.now()) / 3600000));
    var added = until - 24 * 3600000;  // both rules add for 24 hours
    var item = el('div', 'jjm-temp');
    item.appendChild(el('div', 'jjm-temp-id', id));
    var why = info.kind === 'flood' ? '在一篇文章裡連推 ' + (info.n || '?') + ' 則' :
              info.kind === 'spam' ? '同一個網址貼在 ' + (info.n || '?') + ' 篇文章' : '原因沒有記錄（舊版加入的）';
    item.appendChild(el('div', 'jjm-temp-why', '原因：' + why));
    if (info.kind === 'spam' && info.link) item.appendChild(el('div', 'jjm-set-sub jjm-temp-link', '網址：' + info.link));
    if (info.title || info.url) {
      var where = (info.board ? '[' + info.board + '] ' : '') + (info.title || info.url);
      if (/^https:\/\/(www\.)?ptt\.cc\/bbs\//.test(info.url || '')) {
        item.appendChild(JJMobile.button('jjm-temp-art', '文章：' + where + ' ›', function() {
          self.open({ type: 'article', url: info.url, title: info.board || '' });
        }));
      } else {
        item.appendChild(el('div', 'jjm-set-sub', '文章：' + where));
      }
    }
    item.appendChild(el('div', 'jjm-set-sub', ago(Date.now() - added) + '加入・剩約 ' + left + ' 小時'));
    var acts = el('div', 'jjm-chips');
    acts.appendChild(JJMobile.button('jjm-chip', '移除', function() { pref.removeTempBlacklist(id); self.reload(screen); }));
    acts.appendChild(JJMobile.button('jjm-chip', '改成永久', function() { pref.makeTempBlacklistPermanent(id); self.reload(screen); }));
    item.appendChild(acts);
    row.appendChild(item);
  });
  return row;
};

// The rules that add people to 自動黑名單 (the extension has them under
// 事實查核 and 黑名單; here together, above the list).
JJMobile.AUTO_BLACK_KEYS = ['factFloodRun', 'factFloodRunMin', 'factFloodRunChain', 'factFloodRunSkipAuthor',
                            'factFloodRunKeepRemoved', 'autoBlacklistSameUrl'];
JJMobile.prototype.autoBlackRules = function(box) {
  var self = this;
  var vals = this.app.pref.values;
  var params = JJMobile.el('div', 'jjm-params');
  JJMobile.AUTO_BLACK_KEYS.forEach(function(key) {
    if (!(key in vals)) return;
    if (key === 'factFloodRunMin') {
      params.appendChild(self.numberRow(key, '連推幾則以上', '同一篇文章裡', 3, 99));
    } else if (key === 'factFloodRun') {
      var t = self.toggleRow(key, '連推', '同一個帳號在一篇文章裡連續推文太多則，自動加入 24 小時');
      box.appendChild(t);
      box.appendChild(params);
      var sync = function() { params.classList.toggle('jjm-off', !t.querySelector('input').checked); };
      t.addEventListener('jjm-toggle', sync);
      sync();
    } else if (key === 'factFloodRunChain') {
      params.appendChild(self.toggleRow(key, '被別人插話打斷也算', '3 樓內、2 分鐘內接著推的；關掉 = 中間完全沒有別人才算'));
    } else if (key === 'factFloodRunSkipAuthor') {
      params.appendChild(self.toggleRow(key, '原 PO 不算', '原 PO 在自己文章裡連續回覆不會被加入'));
    } else if (key === 'factFloodRunKeepRemoved') {
      box.appendChild(self.toggleRow(key, '移除過的不再加回', '你手動移除的人，24 小時內不會被連推或同網址洗版再加進來'));
    } else {
      box.appendChild(self.toggleRow(key, '同網址洗版', '24 小時內把同一網址貼在超過 3 篇文章，自動加入 24 小時'));
    }
  });
};

// 關於 FACT, at the bottom of 事實查核: one line, the rest folded away
// for whoever wants it.
JJMobile.prototype.aboutFact = function(box) {
  var el = JJMobile.el;
  var head = el('div', 'jjm-set jjm-set-col jjm-fact-about');
  head.appendChild(el('div', 'jjm-fact-name', 'FACT'));
  head.appendChild(el('div', 'jjm-set-sub', 'Facts, Accuracy, Credibility & Truth・真.事實查核中心'));
  head.appendChild(el('div', 'jjm-fact-motto', 'Evidence over opinion. 證據勝於立場'));
  var more = el('div', 'jjm-fact-more');
  more.style.display = 'none';
  more.appendChild(el('div', 'jjm-set-title', '不問立場，只問事實；不分對象，一體查核。'));
  more.appendChild(el('div', 'jjm-set-sub', 'One Standard. For All. Fact Over Bias.'));
  var values = el('div', 'jjm-chips');
  [['公開透明', 'Transparency'], ['標準一致', 'Consistency'], ['不偏不倚', 'Impartiality'],
   ['證據優先', 'Evidence First'], ['勇於更正', 'Accountability']].forEach(function(v) {
    var c = el('span', 'jjm-chip jjm-fact-value');
    c.appendChild(el('b', '', v[0]));
    c.appendChild(el('small', '', v[1]));
    values.appendChild(c);
  });
  more.appendChild(values);
  var rules = el('ol', 'jjm-fact-rules');
  [['同一把尺', '不因政治立場、人物身分或組織背景改變查核標準。'],
   ['公開證據', '每個標記都說得出為什麼：同 IP、機房、秒推…點開 FACT 就看得到。'],
   ['接受檢驗', '誤判的人可以從自動黑名單移除，規則也都能在上面自己調整。']].forEach(function(r) {
    var li = el('li', '');
    li.appendChild(el('b', '', r[0] + '：'));
    li.appendChild(document.createTextNode(r[1]));
    rules.appendChild(li);
  });
  more.appendChild(rules);
  // how it works, in plain words
  more.appendChild(el('div', 'jjm-set-title', 'FACT 怎麼運作'));
  var how = el('ul', 'jjm-fact-rules');
  ['只看推文本身公開的資料：推文時間、IP、國家、內容，以及同一批帳號在不同文章的出現紀錄。',
   '每條規則只回答一個問題，例如「是不是發文後幾秒就推」「是不是來自雲端機房」，符合就標出來，並寫明原因。',
   '標記是提醒你多看一眼的疑點，不是判決；最後怎麼看，由你自己決定。',
   '紀錄只存在這支手機，不會上傳；不想要的規則可以在上面一條一條關掉。'].forEach(function(t) {
    how.appendChild(el('li', '', t));
  });
  more.appendChild(how);
  head.appendChild(more);
  var toggle = JJMobile.button('jjm-link-btn', '看 FACT 的原則 ›', function() {
    var open = more.style.display === 'none';
    more.style.display = open ? '' : 'none';
    toggle.textContent = open ? '收起' : '看 FACT 的原則 ›';
  });
  head.appendChild(toggle);
  box.appendChild(head);
};

// The fact-check rules, in the order and groups of the extension's settings
// page: a switch per rule, its numbers under it (greyed out when off).
JJMobile.prototype.factRows = function(box, screen) {
  var self = this;
  var el = JJMobile.el;
  var vals = this.app.pref.values;
  var src = document.getElementById('opt_factDetect');
  var holder = src && src.nextElementSibling;
  if (!holder) return;
  var lastToggle = null, params = null, lastHead = null;
  // a group whose rules are all left out (terminal-only): no heading either
  var dropEmpty = function() {
    if (lastHead && lastHead === box.lastChild) box.removeChild(lastHead);
  };
  var link = function(toggle, group) {
    var sync = function() { group.classList.toggle('jjm-off', !toggle.querySelector('input').checked); };
    toggle.addEventListener('jjm-toggle', sync);
    sync();
  };
  Array.prototype.forEach.call(holder.children, function(n) {
    var id = n.id || '';
    if (n.classList.contains('jj-subhead')) {
      dropEmpty();
      lastHead = box.appendChild(el('div', 'jjm-subhead', i18n('options_' + id.replace(/^opt_/, ''))));
      lastToggle = null;
      return;
    }
    if (id === 'fact_historyNote') {
      box.appendChild(el('div', 'jjm-set-sub jjm-pad', i18n('fact_historyNote')));
      return;
    }
    if (n.classList.contains('jj-row') && n.querySelector('#fact_historyClear')) {
      box.appendChild(self.setRow('清除累積的跨文章紀錄', '共伴、首殺班底、門檻班底用的；目前 ' + self.app.factCheck.history.count() + ' 篇', function() {
        if (!window.confirm('清除累積的紀錄？')) return;
        self.app.factCheck.history.clear();
        self.reload(screen);
      }));
      return;
    }
    var key = id.replace(/^opt_/, '');
    if (!key || JJMobile.SKIP_PREFS[key] || !(key in vals)) return;
    if (JJMobile.AUTO_BLACK_KEYS.indexOf(key) >= 0) return;  // in 黑名單 → 自動黑名單
    var label = JJMobile.splitLabel(i18n('options_' + key));
    if (n.classList.contains('checkbox') && typeof vals[key] === 'boolean') {
      var t = self.toggleRow(key, label[0], label[1]);
      box.appendChild(t);
      lastToggle = t;
      params = el('div', 'jjm-params');
      box.appendChild(params);
      link(t, params);
    } else if (n.classList.contains('jj-param') || n.classList.contains('form-group')) {
      var row = typeof vals[key] === 'number' || /^\d+$/.test(String(vals[key])) ?
        self.numberRow(key, label[0], label[1]) : self.textRow(key, label[0], label[1]);
      (lastToggle && params ? params : box).appendChild(row);
    }
  });
  dropEmpty();
};
