// JJptt on phones (the Android app in mobile/). Does nothing outside the app.
//
// - Login: PTT's welcome screen is covered by JJptt's own page: account and
//   password fields (or "登入中…" when they are saved), which types them into
//   PTT's prompts.
// - Gestures instead of keys on the terminal:
//     swipe right  ←  (back / leave)        swipe left  →  (enter)
//     swipe up     PgDn                      swipe down  PgUp
//     tap          on a list row: go there and open it; on the line PTT is
//                  waiting for input on (bottom of the screen): keyboard
//     long press   keyboard
// - Article view: ◀ 上一篇 / 返回列表 / 下一篇 ▶ buttons, swipe right = back.
// - Settings laid out in one column (css: body.jj-mobile).
function JJMobile(app) {
  this.app = app;
}

// height of the ◀ 上一篇 / 返回列表 / 下一篇 ▶ bar (css: #jjReaderNav)
JJMobile.READER_BAR_PX = 60;

JJMobile.SWIPE_PX = 50;

JJMobile.KEYS = {
  left: '\x1b[D', right: '\x1b[C', pageUp: '\x1b[5~', pageDown: '\x1b[6~'
};

JJMobile.prototype.enabled = function() {
  return lib.isApp();
};

JJMobile.prototype.setup = function() {
  if (!this.enabled()) return;
  document.body.classList.add('jj-mobile');
  this.login = new JJMobileLogin(this.app);
  this.setupGestures();
  this.watchReader();
};

JJMobile.prototype.send = function(keys) {
  var conn = this.app.conn;
  if (conn && conn.send) conn.send(keys);
};

JJMobile.prototype.showKeyboard = function() {
  var input = this.app.inputArea;
  if (!input) return;
  input.focus();
  // some phones only open the keyboard for a focus that follows a tap
  if (input.click) input.click();
};

// Row of the terminal under a screen position (0..rows-1), or -1.
JJMobile.prototype.rowAt = function(y) {
  var view = this.app.view;
  if (!view || !view.mainDisplay || !view.chh) return -1;
  var r = view.mainDisplay.getBoundingClientRect();
  var row = Math.floor((y - r.top) / view.chh);
  var rows = (this.app.buf && this.app.buf.rows) || 24;
  return row >= 0 && row < rows ? row : -1;
};

// Is PTT waiting for typing there? Prompts (search, push, y/n questions,
// login...) are on the last lines with the cursor after them.
JJMobile.prototype.isInputSpot = function(row) {
  var buf = this.app.buf;
  if (!buf || row < 0) return false;
  var rows = buf.rows || 24;
  return buf.cur_y >= rows - 4 && Math.abs(row - buf.cur_y) <= 1;
};

JJMobile.prototype.setupGestures = function() {
  var self = this;
  var app = this.app;
  var el = app.BBSWin || document.getElementById('BBSWindow');
  if (!el || typeof Hammer === 'undefined') return;
  el.classList.add('jj-gestures');
  // the page must not scroll under a swipe (it would cancel the gesture)
  el.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });
  // a swipe is any move of 50px or more, slow ones too (the larger of the
  // sideways / up-down movement decides)
  var ham = new Hammer.Manager(el, {
    touchAction: 'none',  // every touch is ours: no page scrolling to cancel a swipe
    recognizers: [
      [Hammer.Pan, { direction: Hammer.DIRECTION_ALL, threshold: 10 }],
      [Hammer.Press, { time: 550 }],
      [Hammer.Tap]
    ]
  });
  ham.on('panend', function(ev) {
    var dx = ev.deltaX, dy = ev.deltaY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < JJMobile.SWIPE_PX) return;
    if (Math.abs(dx) >= Math.abs(dy)) self.send(dx > 0 ? JJMobile.KEYS.left : JJMobile.KEYS.right);
    else self.send(dy < 0 ? JJMobile.KEYS.pageDown : JJMobile.KEYS.pageUp);
  });
  ham.on('press', function() { self.showKeyboard(); });
  ham.on('tap', function(ev) {
    if (ev.srcEvent) ev.srcEvent.preventDefault();
    var x = ev.center.x, y = ev.center.y;
    if (self.isInputSpot(self.rowAt(y))) {
      self.showKeyboard();
      return;
    }
    // tap on a list row: the same as clicking it with mouse browsing
    app.inputArea.blur();
    app.onMouse_move(x, y);
    app.onMouse_click(x, y);
  });
  this.hammer = ham;
};

// Article view: ◀ previous, back to the list, next ▶ -- the same as ↑ at the
// top, ← and ↓ at the bottom on a keyboard; swiping right is back as well.
JJMobile.button = function(label, onTap) {
  var b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('mousedown', function(e) { e.preventDefault(); });
  b.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    onTap();
  });
  return b;
};

JJMobile.prototype.buildReaderBar = function() {
  var reader = this.app.reader;
  var bar = document.createElement('div');
  bar.id = 'jjReaderNav';
  bar.appendChild(JJMobile.button('◀ 上一篇', function() { reader.closeAndSend(reader.navKeys(-1)); }));
  bar.appendChild(JJMobile.button('返回列表', function() { reader.closeAndSend(JJMobile.KEYS.left); }));
  bar.appendChild(JJMobile.button('下一篇 ▶', function() { reader.closeAndSend(reader.navKeys(1)); }));
  document.body.appendChild(bar);
  if (typeof Hammer !== 'undefined' && reader.overlay) {
    // sideways only, so scrolling the article stays the phone's own
    var ham = new Hammer.Manager(reader.overlay, {
      recognizers: [[Hammer.Swipe, { direction: Hammer.DIRECTION_HORIZONTAL, threshold: 40, velocity: 0.3 }]]
    });
    ham.on('swiperight', function() { if (reader.isOpen()) reader.closeAndSend(JJMobile.KEYS.left); });
  }
  return bar;
};

JJMobile.prototype.watchReader = function() {
  var self = this;
  var readerBar = null;
  setInterval(function() {
    var reader = self.app.reader;
    var open = !!(reader && reader.isOpen && reader.isOpen());
    if (open && !readerBar) readerBar = self.buildReaderBar();
    if (readerBar) readerBar.style.display = open ? 'flex' : 'none';
  }, 250);
};

// ---- login page ---------------------------------------------------------------
//
// Covers the terminal from connecting until PTT is past its login prompts.
// States: connecting -> form (or logging in with saved account) -> logging in
// -> done; back to the form with a message when PTT says the password is
// wrong; back to connecting when the connection drops.

function JJMobileLogin(app) {
  this.app = app;
  this.state = '';
  this.sent = null;       // { user, pass } typed into the form
  this.passSent = false;
  this.build();
  this.show('connecting');
  var self = this;
  setInterval(function() { self.check(); }, 200);
}

JJMobileLogin.PROMPT_USER = '請輸入代號';
JJMobileLogin.PROMPT_PASS = '請輸入您的密碼';
JJMobileLogin.WRONG = /密碼不對|無此帳號|帳號不存在/;

JJMobileLogin.prototype.build = function() {
  var self = this;
  var el = function(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text) n.textContent = text;
    return n;
  };
  var root = el('div', { id: 'jjLogin' });
  root.appendChild(el('img', { src: 'icon_512.png', alt: '', 'class': 'jj-login-logo' }));
  root.appendChild(el('div', { 'class': 'jj-login-name' }, 'JJptt'));
  root.appendChild(el('div', { 'class': 'jj-login-tag' }, '在手機上逛 PTT，順手把帶風向的抓出來'));
  this.status = root.appendChild(el('div', { 'class': 'jj-login-status' }));

  var form = el('form', { 'class': 'jj-login-form', autocomplete: 'on' });
  this.user = form.appendChild(el('input', { type: 'text', placeholder: 'PTT 帳號', autocapitalize: 'off',
                                             autocorrect: 'off', spellcheck: 'false', autocomplete: 'username' }));
  this.pass = form.appendChild(el('input', { type: 'password', placeholder: '密碼', autocomplete: 'current-password' }));
  var remember = el('label', { 'class': 'jj-login-remember' });
  this.remember = remember.appendChild(el('input', { type: 'checkbox' }));
  this.remember.checked = true;
  remember.appendChild(document.createTextNode(' 記住帳號密碼，下次自動登入'));
  form.appendChild(remember);
  this.error = form.appendChild(el('div', { 'class': 'jj-login-error' }));
  form.appendChild(el('button', { type: 'submit', 'class': 'jj-login-go' }, '登入'));
  var guest = form.appendChild(el('button', { type: 'button', 'class': 'jj-login-guest' }, '以訪客身分參觀（guest）'));
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    self.submit(self.user.value.trim(), self.pass.value, self.remember.checked);
  });
  guest.addEventListener('click', function(e) {
    e.preventDefault();
    self.submit('guest', '', false);
  });
  // keys typed here are for the form, not for PTT
  ['keydown', 'keypress', 'keyup', 'input'].forEach(function(type) {
    form.addEventListener(type, function(e) { e.stopPropagation(); });
  });
  root.appendChild(form);
  this.form = form;
  document.body.appendChild(root);
  this.root = root;
};

JJMobileLogin.prototype.show = function(state, message) {
  if (this.state === state && !message) return;
  this.state = state;
  this.root.style.display = state === 'done' ? 'none' : 'flex';
  this.form.style.display = state === 'form' ? 'flex' : 'none';
  this.status.textContent = state === 'connecting' ? '連線中…' : state === 'logging' ? '登入中…' : '';
  this.error.textContent = message || '';
  this.app.modalShown = state !== 'done';  // terminal keys stay out of the way
  if (state === 'form' && !message) {
    var saved = this.app.pref && this.app.pref.logins;
    if (saved && saved[0] && !this.user.value) this.user.value = saved[0];
  }
  if (state === 'done' && this.app.inputArea) this.app.inputArea.blur();
};

JJMobileLogin.prototype.screenText = function() {
  var buf = this.app.buf;
  if (!buf || !buf.getRowText) return '';
  var out = [];
  for (var r = 0; r < (buf.rows || 24); ++r) out.push(buf.getRowText(r, 0, buf.cols));
  return out.join('\n');
};

JJMobileLogin.prototype.typeLine = function(text) {
  var conn = this.app.conn;
  if (!conn) return;
  var line = text + '\r';
  if (conn.convSend) conn.convSend(line);
  else conn.send(line);
};

JJMobileLogin.prototype.submit = function(user, pass, remember) {
  if (!user) {
    this.show('form', '請輸入帳號');
    return;
  }
  if (user !== 'guest' && !pass) {
    this.show('form', '請輸入密碼');
    return;
  }
  // saved only once PTT has let us in (a wrong password saved would make
  // every auto-login fail)
  this.sent = { user: user, pass: pass, remember: remember && user !== 'guest' };
  this.passSent = user === 'guest';
  this.typeLine(user);
  this.show('logging');
};

JJMobileLogin.prototype.check = function() {
  var conn = this.app.conn;
  if (!conn || !conn.isConnected) {
    this.sent = null;
    this.seenLogin = false;
    this.calm = 0;
    this.show('connecting');
    return;
  }
  if (this.state === 'done') return;
  var text = this.screenText();
  var askUser = text.indexOf(JJMobileLogin.PROMPT_USER) >= 0;
  var askPass = text.indexOf(JJMobileLogin.PROMPT_PASS) >= 0;
  var wrong = JJMobileLogin.WRONG.test(text);
  if (askUser || askPass) {
    this.seenLogin = true;
    this.calm = 0;
  }
  if (this.sent && askPass && !this.passSent) {
    this.passSent = true;
    this.typeLine(this.sent.pass);
    return;
  }
  if (askUser) {
    if (this.sent && this.passSent && (wrong || !askPass)) {
      // asked for the account again after the password: it was wrong
      this.sent = null;
      this.pass.value = '';
      this.show('form', '帳號或密碼錯誤，請再試一次');
    } else if (!this.sent) {
      // saved account: auto-login types it (js/ssh.js, telnet.js)
      if (conn.autoLoginStage > 0) this.show('logging');
      else this.show('form', wrong ? '帳號或密碼錯誤，請再試一次' : '');
    }
    return;
  }
  if (askPass || !text.replace(/\s/g, '')) {  // still logging in / nothing yet
    this.calm = 0;
    return;
  }
  // No login prompt on the screen. PTT redraws in pieces, so wait until it
  // has stayed that way for a second; after typing the account, wait for the
  // password prompt (up to 10 s) before calling it done.
  this.calm = (this.calm || 0) + 1;
  if (this.calm < 5) return;
  if (this.sent && !this.passSent && this.calm < 50) return;
  // PTT's welcome art comes a moment before the prompt: wait up to 5 s
  if (!this.seenLogin && this.calm < 25) return;
  if (this.sent && this.sent.remember) this.saveLogin(this.sent.user, this.sent.pass);
  this.sent = null;
  this.show('done');
};

// Same as filling in 設定 → 自動登入: auto-login next time.
JJMobileLogin.prototype.saveLogin = function(user, pass) {
  var pref = this.app.pref;
  if (!pref) return;
  pref.logins = [user, pass];
  pref.setStorage({ logins: { u: user, p: pass } });
  if (pref.updateToApp) pref.updateToApp();
};
