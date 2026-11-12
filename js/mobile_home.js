// JJptt on phones: the account sheet and the home screen (boards).
// Part of JJMobile (js/mobile.js).

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
  form.appendChild(el('div', 'jjm-hint', '看文章不用登入；登入後才能推文、回文、發文。帳號密碼只存在這支手機，密碼加密保存，不會備份到雲端。'));
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
