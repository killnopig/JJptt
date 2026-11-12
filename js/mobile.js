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
      var btn = home.view.querySelector('.jjm-section-row .jjm-mini');
      if (btn) btn.textContent = state === 'in' ? '從 PTT 同步' : '登入後可同步 PTT 我的最愛';
    }
    // logged in: bring PTT's 我的最愛 in once per app start
    if (state === 'in' && !self.favsSyncedNow) {
      self.favsSyncedNow = true;
      self.syncFavs(false);
    }
  });
  this.setFont(JJMobile.store(JJMobile.FONT_KEY) || 17);
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
// The release page says 「第 N 次打包」; this build knows its own N
// (build-info.js). Newer -> a bar on the home screen; one tap downloads the
// APK (ApkUpdaterPlugin, no browser) and opens Android's installer.

JJMobile.RELEASE_API = 'https://api.github.com/repos/killnopig/JJptt/releases/tags/android-latest';

JJMobile.RELEASE_DL = 'https://github.com/killnopig/JJptt/releases/download/android-latest/';

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
      var m = /第\s*(\d+)\s*次打包/.exec((rel && (rel.body || rel.name)) || '');
      var apk = ((rel && rel.assets) || []).filter(function(a) { return /\.apk$/i.test(a.name); })[0];
      if (!m || !apk) throw new Error('看不懂下載頁');
      return { run: +m[1], url: apk.browser_download_url, size: apk.size };
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

// The row at the top of the home screen: which build this is and a button
// to check (always there); green with 更新 when there is a newer one.
JJMobile.prototype.setUpdateRow = function(note) {
  var self = this;
  var home = this.stack[0];
  if (!home || !home.view || this.updateAvailable) return;
  var row = home.view.querySelector('.jjm-verrow');
  if (!row) {
    row = JJMobile.el('div', 'jjm-verrow');
    row.appendChild(JJMobile.el('span', 'jjm-ver'));
    row.appendChild(JJMobile.button('jjm-mini', '檢查更新', function() { self.checkUpdate(true); }));
    home.view.insertBefore(row, home.view.firstChild);
  }
  var mine = this.myBuild();
  var text = 'JJptt 第 ' + (isNaN(mine) ? '?' : mine) + ' 次打包';
  if (note) text += '・' + note;
  else if (this.lastUpdateNote) text += '・' + this.lastUpdateNote;
  if (note) this.lastUpdateNote = note;
  row.querySelector('.jjm-ver').textContent = text;
};

JJMobile.prototype.showUpdateBar = function() {
  var self = this;
  var home = this.stack[0];
  if (!home || !home.view || !this.update) return;
  var old = home.view.querySelector('.jjm-update');
  if (old) old.remove();
  var plain = home.view.querySelector('.jjm-verrow');
  if (plain) plain.remove();
  var bar = JJMobile.el('div', 'jjm-update');
  this.updateText = JJMobile.el('div', 'jjm-update-text', '有新版（第 ' + this.update.run + ' 次打包）');
  bar.appendChild(this.updateText);
  this.updateBtn = JJMobile.button('jjm-btn jjm-btn-main', '更新', function() { self.installUpdate(); });
  bar.appendChild(this.updateBtn);
  home.view.insertBefore(bar, home.view.firstChild);
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
  if (!this.updateText) this.showUpdateBar();
  var say = function(t) { if (self.updateText) self.updateText.textContent = t; };
  if (this.updateBtn) this.updateBtn.disabled = true;
  say('下載中…');
  var handle = null;
  Promise.resolve(plugin.addListener('progress', function(p) {
    var total = p.total > 0 ? p.total : self.update.size;
    if (total) say('下載中 ' + Math.floor(p.done / total * 100) + '%');
  })).then(function(h) { handle = h; });
  plugin.install({ url: this.update.url }).then(function() {
    say('請在跳出的畫面按「更新」');
  }).catch(function(err) {
    var msg = String((err && err.message) || err);
    if (/permission/.test(msg)) say('請在剛打開的設定裡允許 JJptt「安裝不明應用程式」，回來再按一次更新');
    else say('更新失敗：' + msg);
  }).then(function() {
    self.updating = false;
    if (self.updateBtn) self.updateBtn.disabled = false;
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
  else if (screen.type === 'settings') this.renderSettings(screen);
};

JJMobile.prototype.setBar = function(screen) {
  var self = this;
  this.backBtn.style.visibility = this.stack.length > 1 ? 'visible' : 'hidden';
  this.titleEl.textContent = screen.title || 'JJptt';
  if (screen.type === 'home') {  // the app icon in front of the name
    var logo = JJMobile.el('img', 'jjm-logo');
    logo.src = 'app-icon.png';
    logo.alt = '';
    logo.addEventListener('error', function() { logo.remove(); });
    this.titleEl.insertBefore(logo, this.titleEl.firstChild);
  }
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
    add('⟳', '重新整理', function() { self.reload(screen); });
  } else if (screen.type === 'article') {
    add('Aa', '字的大小', function() { self.fontSheet(); });
    add('⟳', '重新整理', function() { self.reload(screen); });
  } else if (screen.type === 'settings') {
    // nothing on the right
  } else {
    add('⌕', '找看板', function() { self.boardSheet(); });
    var st = this.ptt ? this.ptt.state : 'off';
    var acct = add(st === 'in' ? this.ptt.user : st === 'connecting' ? '登入中…' : '登入', '帳號', function() { self.accountSheet(); });
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
    box.appendChild(el('div', 'jjm-hint', '已登入，可以推文、回文。'));
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
  form.appendChild(el('div', 'jjm-hint', '看文章不用登入；登入後才能推文、回文。帳號密碼只存在這支手機。'));
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
      return { name: b.name, title: b.title };
    });
    var added = 0;
    mine.forEach(function(f) {
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

JJMobile.prototype.renderHome = function(screen) {
  var self = this;
  var el = JJMobile.el;
  var v = screen.view;
  screen.title = 'JJptt';


  var favs = this.favs();
  var favHead = el('div', 'jjm-section jjm-section-row');
  favHead.appendChild(el('span', '', '我的看板'));
  favHead.appendChild(JJMobile.button('jjm-mini', this.ptt.state === 'in' ? '從 PTT 同步' : '登入後可同步 PTT 我的最愛', function() {
    self.syncFavs(true);
  }));
  v.appendChild(favHead);
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
  if (this.updateAvailable) this.showUpdateBar();  // the bar survives a redraw
  else this.setUpdateRow(null);
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
  // 設定 → 搜尋: open on 推文數 with the usual number filled in
  var pv = (this.app.pref && this.app.pref.values) || {};
  var pushN = parseInt(pv.pushFilterDefault, 10);
  if (isNaN(pushN) || pushN <= 0) pushN = 10;
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
        self.reloadAfterPost(screen);
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

// After pushing: load the article again, staying at the bottom.
JJMobile.prototype.reloadAfterPost = function(screen) {
  var self = this;
  delete this.articles[screen.url];
  this.getArticle(screen.url).then(function(article) {
    if (self.stack[self.stack.length - 1] !== screen) return;
    screen.view.innerHTML = '';
    self.fillArticle(screen, article);
    var c = screen.view.querySelector('.jjm-compose');
    if (c) c.scrollIntoView({ block: 'center' });
  }).catch(function() {});
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
  var section = function(title, note) {
    v.appendChild(el('div', 'jjm-section', title));
    if (note) v.appendChild(el('div', 'jjm-hint', note));
    var box = el('div', 'jjm-group');
    v.appendChild(box);
    return box;
  };

  // account
  var acc = section('帳號');
  var st = this.ptt.state;
  acc.appendChild(this.setRow(st === 'in' ? '已登入 ' + this.ptt.user : '登入 PTT',
    st === 'in' ? '點這裡登出' : '登入後可以推文、回文', function() { self.accountSheet(function() { self.reload(screen); }); }));
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
  acc.appendChild(this.localToggleRow(JJPtt.KICK_KEY, '登入時踢掉其他地方的連線', '關著 = 保留電腦或別的手機上開著的 PTT'));

  // reading
  var rd = section('閱讀');
  rd.appendChild(this.numberRow('readerPrefetchCount', '先讀好接下來幾篇', '0 = 不預先讀取，最多 10', 0, 10));
  rd.appendChild(this.toggleRow('readerPrefetchImages', '預先讀取時連圖片一起下載', '換篇更快，但流量多很多'));
  rd.appendChild(this.toggleRow('readerLowResImages', '用低解析度圖片', '載入快、省流量；點圖片看原圖'));
  rd.appendChild(this.toggleRow('readerGroupRuns', '同一個人的連續推文排在一起', '被別人插話打斷的也排回一起，樓層照舊'));
  var fontRow = el('div', 'jjm-set');
  fontRow.appendChild(el('div', 'jjm-set-title', '字的大小'));
  var fonts = el('div', 'jjm-chips');
  [['小', 15], ['中', 17], ['大', 19], ['特大', 22]].forEach(function(f) {
    var b = JJMobile.button('jjm-chip' + (self.fontPx === f[1] ? ' jjm-on' : ''), f[0], function() {
      self.setFont(f[1]);
      Array.prototype.forEach.call(fonts.children, function(x) { x.classList.remove('jjm-on'); });
      b.classList.add('jjm-on');
    });
    fonts.appendChild(b);
  });
  fontRow.appendChild(fonts);
  rd.appendChild(fontRow);
  this.pushLookRows(rd);
  this.listLookRows(rd);

  // search
  var se = section('搜尋');
  var sw = this.localToggleRow(JJMobile.SEARCH_PUSH_KEY, '看板搜尋預設用推文數篩選', '打開搜尋就選好「推文數 ≥」並填好下面的數字', true);
  se.appendChild(sw);
  se.appendChild(this.numberRow('pushFilterDefault', '推文數預設', '只看推文數至少這麼多的文章', 1, 999));

  // lists
  var ls = section('名單');
  ls.appendChild(this.choiceRow('blacklistMode', '黑名單的人', [[0, '淡化'], [1, '隱藏'], [2, '不管']]));
  ls.appendChild(this.listRow('黑名單', Object.keys(pref.blacklistedUserIds || {}), {},
    function(id) { self.app.doAddBlacklistUserId(id); }, function(id) { self.app.doRemoveBlacklistUserId(id); }, screen));
  ls.appendChild(this.tempListRow(screen));
  ls.appendChild(this.textRow('blacklistedTitleKeywords', '標題關鍵字黑名單', '用逗號隔開，標題有這些字的文章淡化或隱藏'));
  ls.appendChild(this.toggleRow('autoBlacklistSameUrl', '同網址洗版自動封鎖', '24 小時內把同一網址貼在超過 3 篇，加入黑名單 24 小時'));
  ls.appendChild(this.toggleRow('watchlistEnabled', '觀察名單', '推文旁標「觀察」，列表上作者變紫色'));
  ls.appendChild(this.listRow('觀察名單', Object.keys(pref.watchlistedUserIds || {}), pref.watchlistedUserIds || {},
    function(id) { self.app.doAddWatchUserId(id); }, function(id) { self.app.doRemoveWatchUserId(id); }, screen));
  ls.appendChild(this.toggleRow('customListEnabled', '自訂名單', '推文旁標名單名稱，列表上作者變青色'));
  ls.appendChild(this.textRow('customListName', '自訂名單的名稱', '預設「網軍」'));
  ls.appendChild(this.listRow(pref.customListName(), Object.keys(pref.notedUserIds || {}), pref.notedUserIds || {},
    function(id) { self.app.doSetUserNote(id); }, function(id) { self.app.doRemoveUserNote(id); }, screen));

  // fact check (from the extension's settings page)
  var fc = section('真.事實查核中心', '只是疑點，不代表一定是網軍。');
  this.factRows(fc, screen);
  if (pref.values.aiService !== undefined && typeof PREF_OPTIONS !== 'undefined' && PREF_OPTIONS.aiService) {
    fc.appendChild(this.choiceRow('aiService', '「請 AI 分析」用哪一個',
      PREF_OPTIONS.aiService.map(function(k, i) { return [i, i18n(k)]; })));
  }

  // about
  var ab = section('關於');
  var b = window.JJPTT_BUILD || {};
  var buildText = b.run ? '第 ' + b.run + ' 次打包' + (b.time ? '（' + this.shortTime(b.time) + '）' : '') : '';
  ab.appendChild(this.setRow('JJptt ' + (typeof JJPTT_VERSION !== 'undefined' ? JJPTT_VERSION : '') + (buildText ? '・' + buildText : ''),
                             '檢查有沒有新版，有就直接更新', function() {
    self.checkUpdate(true);
  }));
  ab.appendChild(this.setRow('覺得好用？請我喝杯咖啡', 'Ko-fi（自願，不影響任何功能）', function() {
    window.open('https://ko-fi.com/killnopig', '_blank');
  }));
  ab.appendChild(this.setRow('原始碼與回報問題', 'GitHub', function() {
    window.open('https://github.com/killnopig/JJptt', '_blank');
  }));
};

// 推文間距 slider, one-line switch and a preview of a few pushes that
// follows them (and the text size) as they change.
JJMobile.prototype.pushLookRows = function(box) {
  var self = this;
  var el = JJMobile.el;
  var row = el('div', 'jjm-set jjm-set-col');
  var head = el('div', 'jjm-set-head');
  head.appendChild(el('div', 'jjm-set-title', '推文間距'));
  var val = el('span', 'jjm-set-val');
  head.appendChild(val);
  row.appendChild(head);
  var range = el('input', 'jjm-range');
  range.type = 'range';
  range.min = 0;
  range.max = 24;
  range.step = 2;
  range.value = this.pushGap;
  var show = function() {
    var g = +range.value;
    val.textContent = g <= 2 ? '最緊' : g <= 6 ? '緊' : g <= 12 ? '標準' : g <= 18 ? '鬆' : '最鬆';
  };
  show();
  range.addEventListener('input', function() {
    self.setPushStyle(+range.value, self.pushInline);
    show();
  });
  row.appendChild(range);
  box.appendChild(row);

  var line = el('label', 'jjm-set jjm-toggle');
  var t = el('div', 'jjm-set-text');
  t.appendChild(el('div', 'jjm-set-title', '帳號和推文排在同一行'));
  t.appendChild(el('div', 'jjm-set-sub', '比較緊湊，一個畫面看得到更多推文'));
  line.appendChild(t);
  var cb = el('input');
  cb.type = 'checkbox';
  cb.checked = this.pushInline;
  cb.addEventListener('change', function() { self.setPushStyle(self.pushGap, cb.checked); });
  line.appendChild(cb);
  line.appendChild(el('span', 'jjm-switch'));
  box.appendChild(line);

  // preview: what an article's pushes look like with these settings
  var pv = el('div', 'jjm-set jjm-set-col');
  pv.appendChild(el('div', 'jjm-set-sub', '預覽（字的大小、間距改了會跟著變）'));
  var frame = el('div', 'jjm-preview jjm-reading');
  var sample = [
    ['推', 'up', 'kitten5566', '這篇整理得很清楚，推', '11/12 10:21', 12, []],
    ['→', 'arrow', 'kitten5566', '補充一下：官方今天也有發新聞稿', '11/12 10:22', 13, []],
    ['噓', 'down', 'troll0607', '又在帶風向', '11/12 10:22', 14, [['秒推', 'warn'], ['同IP：bot1、bot2', 'warn']]],
    ['推', 'up', 'neko_neko', '樓上的 IP 跟另外兩個人一樣欸', '11/12 10:25', 15, [['觀察', 'watch']]]
  ];
  sample.forEach(function(s) {
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
  pv.appendChild(frame);
  box.appendChild(pv);
};

// 列表間距 slider with a preview of a board's article list.
JJMobile.prototype.listLookRows = function(box) {
  var self = this;
  var el = JJMobile.el;
  var row = el('div', 'jjm-set jjm-set-col');
  var head = el('div', 'jjm-set-head');
  head.appendChild(el('div', 'jjm-set-title', '列表間距'));
  var val = el('span', 'jjm-set-val');
  head.appendChild(val);
  row.appendChild(head);
  row.appendChild(el('div', 'jjm-set-sub', '看板列表、文章列表每一列的上下空間'));
  var range = el('input', 'jjm-range');
  range.type = 'range';
  range.min = 2;
  range.max = 24;
  range.step = 2;
  range.value = this.listGap;
  var show = function() {
    var g = +range.value;
    val.textContent = g <= 4 ? '最緊' : g <= 8 ? '緊' : g <= 14 ? '標準' : g <= 19 ? '鬆' : '最鬆';
  };
  show();
  range.addEventListener('input', function() {
    self.setListGap(+range.value);
    show();
  });
  row.appendChild(range);
  var frame = el('div', 'jjm-preview jjm-list');
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
  row.appendChild(el('div', 'jjm-set-sub', '預覽'));
  row.appendChild(frame);
  box.appendChild(row);
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
JJMobile.prototype.tempListRow = function(screen) {
  var self = this;
  var el = JJMobile.el;
  var pref = this.app.pref;
  pref.pruneTempBlacklist();
  var ids = Object.keys(pref.tempBlacklist || {});
  var row = el('div', 'jjm-set jjm-set-col');
  row.appendChild(el('div', 'jjm-set-title', '自動黑名單（' + ids.length + '）'));
  row.appendChild(el('div', 'jjm-set-sub', '連推、同網址洗版自動加入的，24 小時後自己解除'));
  ids.forEach(function(id) {
    var info = (pref.tempBlacklistInfo || {})[id] || {};
    var hours = Math.max(1, Math.round((pref.tempBlacklist[id] - Date.now()) / 3600000));
    var why = info.kind === 'flood' ? '連推 ' + info.n + ' 則' : info.kind === 'spam' ? '同一網址貼 ' + info.n + ' 篇' : '';
    var item = el('div', 'jjm-temp');
    item.appendChild(el('div', 'jjm-temp-id', id));
    item.appendChild(el('div', 'jjm-set-sub', [why, info.title ? '在 ' + (info.board ? '[' + info.board + '] ' : '') + info.title : '', '剩約 ' + hours + ' 小時'].filter(Boolean).join('・')));
    var acts = el('div', 'jjm-chips');
    acts.appendChild(JJMobile.button('jjm-chip', '移除', function() { pref.removeTempBlacklist(id); self.reload(screen); }));
    acts.appendChild(JJMobile.button('jjm-chip', '改成永久', function() { pref.makeTempBlacklistPermanent(id); self.reload(screen); }));
    item.appendChild(acts);
    row.appendChild(item);
  });
  return row;
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
