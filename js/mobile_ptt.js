// JJptt app: a PTT connection in the background for what reading from the
// web pages can't do -- logging in, pushing (推 / 噓 / →), replying, posting. The
// terminal is never shown: this reads its screen and types the keys a
// person would, one job at a time.
//
//   ptt.login(user, pass)        -> Promise (rejects with a message)
//   ptt.push(url, kind, text)    kind '1' 推 / '2' 噓 / '3' →
//   ptt.reply(url, text, quote)
//   ptt.post(board, type, title, text)
//   ptt.logout()
function JJPtt(app) {
  this.app = app;
  this.user = '';
  this.pass = '';
  this.state = 'off';        // off / connecting / in
  this.queue = Promise.resolve();
  this.listeners = [];
}

JJPtt.STEP_MS = 50;
JJPtt.KICK_KEY = 'jjptt.m.kickOthers';

JJPtt.kickOthers = function() {
  try { return window.localStorage.getItem(JJPtt.KICK_KEY) === '1'; } catch (e) { return false; }
};
JJPtt.TIMEOUT_MS = 15000;

// ---- article code (AID) from the web address ----------------------------------
// M.1699999999.A.1F3 -> 8 characters PTT jumps to with "#": the type, the
// time and the 3 hex digits, 6 bits per character (pttbbs aids.c).
JJPtt.AID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
JJPtt.aidFromUrl = function(url) {
  var m = /\/(M|G)\.(\d+)\.A\.([0-9A-Fa-f]{1,3})\.html/.exec(url || '');
  if (!m) return '';
  var n = (m[1] === 'G' ? 1 : 0) * Math.pow(2, 44) +
          (Number(m[2]) % Math.pow(2, 32)) * Math.pow(2, 12) +
          (parseInt(m[3], 16) & 0xfff);
  var out = '';
  for (var i = 0; i < 8; ++i) {
    out = JJPtt.AID_CHARS.charAt(n % 64) + out;
    n = Math.floor(n / 64);
  }
  return out;
};

JJPtt.boardFromUrl = function(url) {
  var m = /\/bbs\/([^\/]+)\//.exec(url || '');
  return m ? m[1] : '';
};

// Width PTT allows for one push: the line is "推 id:text ... mm/dd hh:mm".
JJPtt.pushMaxBytes = function(id) {
  return Math.max(20, 78 - 3 - String(id || '').length - 1 - 13);
};

JJPtt.big5Length = function(s) {
  try { return String(s).u2b().length; } catch (e) { return String(s).length * 2; }
};

// ---- state ------------------------------------------------------------------------

JJPtt.prototype.onChange = function(fn) {
  this.listeners.push(fn);
};

JJPtt.prototype.setState = function(state) {
  if (this.state === state) return;
  this.state = state;
  var self = this;
  this.listeners.forEach(function(fn) { fn(self.state); });
};

JJPtt.prototype.connected = function() {
  var conn = this.app.conn;
  return !!(conn && conn.isConnected);
};

// One job at a time, in order. When one fails, the hidden screen at that
// moment is kept (設定 → 帳號 → 最後一次 PTT 畫面) to see what PTT showed.
JJPtt.prototype.run = function(job) {
  var self = this;
  var p = this.queue.then(job, job).catch(function(err) {
    self.lastFailure = { at: Date.now(), message: (err && err.message) || String(err), screen: self.screen() };
    throw err;
  });
  this.queue = p.catch(function() {});
  return p;
};

// ---- the screen ---------------------------------------------------------------------

JJPtt.prototype.screen = function() {
  var buf = this.app.buf;
  if (!buf || !buf.getRowText) return '';
  var rows = [];
  for (var r = 0; r < (buf.rows || 24); ++r) rows.push(buf.getRowText(r, 0, buf.cols));
  return rows.join('\n');
};

JJPtt.prototype.send = function(keys) {
  if (this.app.conn) this.app.conn.send(keys);
};

JJPtt.prototype.type = function(text) {
  var conn = this.app.conn;
  if (!conn) return;
  if (conn.convSend) conn.convSend(text);
  else conn.send(text);
};

JJPtt.sleep = function(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
};

// Waits until one of `cases` matches the screen; resolves with its key.
// cases: { key: RegExp }. Rejects after `ms` (or when the connection drops).
// With `since` (a screen() taken before typing), only lines that changed
// since then count: what was already there (an old error...) is not PTT's
// answer.
JJPtt.prototype.wait = function(cases, ms, since, label) {
  var self = this;
  var until = Date.now() + (ms || JJPtt.TIMEOUT_MS);
  var before = since === undefined ? null : String(since).split('\n');
  return new Promise(function(resolve, reject) {
    var tick = function() {
      if (!self.connected()) return reject(new Error('和 PTT 的連線斷了'));
      var text = self.screen();
      if (before) {
        text = text.split('\n').filter(function(line, i) { return line !== before[i]; }).join('\n');
      }
      for (var k in cases) {
        if (cases[k].test(text)) return resolve(k);
      }
      if (Date.now() > until) return reject(new Error('PTT 沒有回應' + (label ? '（' + label + '）' : '') + '，請再試一次'));
      setTimeout(tick, JJPtt.STEP_MS);
    };
    tick();
  });
};

// Instead of a fixed pause after a key: as soon as the screen has changed
// from `prev` and stopped changing (PTT draws in pieces), or after `ms`.
// Resolves true when it changed.
JJPtt.prototype.settle = function(prev, ms) {
  var self = this;
  var until = Date.now() + (ms || 1000);
  return new Promise(function(resolve) {
    var last = null;
    var tick = function() {
      var now = self.screen();
      if (now !== prev && now === last) return resolve(true);
      if (Date.now() > until) return resolve(now !== prev);
      last = now;
      setTimeout(tick, JJPtt.STEP_MS);
    };
    setTimeout(tick, JJPtt.STEP_MS);
  });
};

// Screens PTT puts in the way, and the key that gets past each.
JJPtt.HURDLES = [
  [/按任意鍵繼續|請按任意鍵|按任一鍵/, ' '],
  [/您要刪除以上錯誤嘗試的記錄嗎/, 'y\r'],
  [/有一篇文章尚未完成|尚未完成的文章/, 'q\r'],
  [/請選擇簽名檔/, '0\r']
];

// ---- login / logout -----------------------------------------------------------------------

JJPtt.prototype.connect = function() {
  var self = this;
  if (this.connected()) return Promise.resolve();
  this.setState('connecting');
  var conn = this.app.conn;
  // JJptt's own auto-login and duplicate-login answer stay out: this
  // types everything itself
  if (conn) conn.loginStr = ['', '', '', ''];
  var buf = this.app.buf;
  if (buf) {
    buf.enableDeleteDupLogin = false;
    // a new connection starts on a blank screen: nothing left over from
    // the last one may be read as PTT's answer
    try { if (buf.clear) buf.clear(2); } catch (e) {}
  }
  this.app.connect('ptt.cc');
  var until = Date.now() + 20000;
  return new Promise(function(resolve, reject) {
    var tick = function() {
      if (self.connected()) return resolve();
      if (Date.now() > until) {
        self.setState('off');
        return reject(new Error('連不上 PTT，請確認網路'));
      }
      setTimeout(tick, 200);
    };
    tick();
  });
};

JJPtt.prototype.login = function(user, pass) {
  var self = this;
  return this.run(function() {
    return self.doLogin(user, pass);
  });
};

JJPtt.prototype.doLogin = function(user, pass) {
  var self = this;
  if (this.state === 'in' && this.connected() && user === this.user) return Promise.resolve();
  // which step was waited on, for the message when PTT does not answer
  var at = function(step) {
    return function(err) {
      if (err && /沒有回應/.test(err.message)) err.message = 'PTT 沒有回應（' + step + '），請再試一次';
      throw err;
    };
  };
  // how long each step took (設定 → 帳號 shows it)
  var t0 = Date.now(), last = t0, steps = [];
  var mark = function(name) {
    var now = Date.now();
    steps.push([name, now - last]);
    last = now;
    self.lastLogin = { at: t0, total: now - t0, steps: steps };
  };
  return this.connect().then(function() {
    mark('連線');
    return self.wait({ user: /請輸入代號/ }, 20000).catch(at('等帳號欄'));
  }).then(function() {
    mark('帳號欄出現');
    var before = self.screen();
    self.type(user + '\r');
    // only once PTT really asks for the password: what is typed before that
    // is thrown away (that made right passwords fail)
    return self.wait({ pass: /請輸入您的密碼/ }, 15000, before).catch(at('等密碼欄'));
  }).then(function() {
    mark('密碼欄出現');
    return JJPtt.sleep(100);
  }).then(function() {
    var before = self.screen();
    self.type(pass + '\r');
    // logged in as soon as PTT takes the password: the app says so right
    // away; the screens after it are cleared while nobody waits on them
    var accepted = function() {
      mark('密碼通過');
      self.user = user;
      self.pass = pass;
      self.setState('in');
    };
    return self.pastLogin(before, mark, accepted).catch(at('密碼送出後'));
  }).then(function() {
    // wherever PTT put us (分類看板, an article…): ← until the main menu,
    // so every login ends on the same screen
    return self.toMenu().catch(function() {});
  }).then(function() {
    mark('回到主選單');
  }).catch(function(err) {
    if (self.state === 'in') return;  // already in: a screen left over is no failure
    // dropped: the top bar must not stay on 「登入中…」
    self.disconnect();
    self.setState('off');
    throw err;
  });
};

// After the password: answer what PTT asks until the main menu.
// Where a login can end besides the main menu (an account's own setting).
JJPtt.LANDED = /【\s*(分類看板|看板列表|我\s*的\s*最愛|熱門看板)\s*】|看板《[^》]+》|文章選讀/;

JJPtt.prototype.pastLogin = function(before, mark, accepted) {
  var self = this;
  // the app's own choice, off unless turned on: logging in on the phone
  // must not throw the computer's PTT off
  var dupAnswer = JJPtt.kickOthers() ? 'y\r' : 'n\r';
  var until = Date.now() + 25000;
  var isIn = false, dupDone = false;
  // only lines that changed since the last key count: an answered question
  // stays on the screen (that answered 「重複登入」 thirty times)
  var step = function() {
    if (Date.now() > until) return isIn ? Promise.resolve() : Promise.reject(new Error('登入逾時，請再試一次'));
    var cases = {
      wrong: /密碼不對|無此帳號|帳號不存在/,
      busy: /系統過載|請稍後再來|登入太頻繁/,
      dup: /刪除其他重複登入的連線/,
      hurdle: /按任意鍵|請按任意鍵|按任一鍵|您要刪除以上錯誤嘗試|尚未完成的文章|有一篇文章尚未完成/,
      menu: /【\s*主功能表\s*】|主功能表/,
      // some accounts start somewhere else: 【分類看板】, 我的最愛, a board,
      // or an article (an announcement shown after login)
      list: JJPtt.LANDED,
      article: /瀏覽\s*第\s*\d+\/\d+\s*頁|\(y\)回應/
    };
    if (dupDone) delete cases.dup;
    return self.wait(cases, isIn ? 3000 : 15000, before).catch(function(err) {
      // in, and nothing more that this knows: wherever it stopped is fine
      if (isIn) return 'quiet';
      throw err;
    }).then(function(k) {
      if (k === 'wrong' && !isIn) {
        // PTT's own words, so a misread screen can be told from a typo
        var said = (self.screen().split('\n').filter(function(l) { return /密碼不對|無此帳號|帳號不存在/.test(l); }).pop() || '').trim();
        throw new Error('帳號或密碼錯誤' + (said ? '（PTT：' + said.slice(0, 40) + '）' : ''));
      }
      if (k === 'busy' && !isIn) throw new Error('PTT 現在很忙，請稍後再試');
      if (!isIn && k !== 'wrong' && k !== 'busy') {
        isIn = true;
        if (accepted) accepted();
      }
      if (k === 'menu' || k === 'list' || k === 'article' || k === 'quiet') return null;
      if (mark) mark(k === 'dup' ? '重複登入的問題' : '按任意鍵等畫面');
      before = self.screen();
      if (k === 'dup') { dupDone = true; self.send(dupAnswer); }
      else if (!self.passHurdle()) self.send(' ');
      return self.settle(before, 1500).then(step);
    });
  };
  return step();
};

JJPtt.prototype.passHurdle = function() {
  var text = this.screen();
  for (var i = 0; i < JJPtt.HURDLES.length; ++i) {
    if (JJPtt.HURDLES[i][0].test(text)) {
      this.send(JJPtt.HURDLES[i][1]);
      return true;
    }
  }
  return false;
};

JJPtt.prototype.disconnect = function() {
  var conn = this.app.conn;
  try { if (conn && conn.isConnected) conn.disconnect(); } catch (e) {}
};

JJPtt.prototype.logout = function() {
  this.user = '';
  this.pass = '';
  this.disconnect();
  this.setState('off');
};

// Logged in again if the connection dropped (the phone slept...).
JJPtt.prototype.ensureIn = function() {
  if (this.state === 'in' && this.connected()) return Promise.resolve();
  if (!this.user) return Promise.reject(new Error('請先登入'));
  this.state = 'off';
  return this.doLogin(this.user, this.pass);
};

// ---- getting to an article --------------------------------------------------------------

JJPtt.prototype.toArticle = function(url) {
  var self = this;
  var board = JJPtt.boardFromUrl(url);
  var aid = JJPtt.aidFromUrl(url);
  if (!board || !aid) return Promise.reject(new Error('看不懂這篇文章的網址'));
  return this.toBoard(board).then(function() {
    self.send('#');
    return self.wait({ ask: /搜尋.*(文章代碼|AID)|請輸入文章代碼|#/ }, 5000, undefined, '找文章代碼');
  }).then(function() {
    self.send(aid + '\r');
    return JJPtt.sleep(500);
  }).then(function() {
    if (/找不到這個文章代碼|找不到|沒有這篇/.test(self.screen())) throw new Error('在 PTT 上找不到這篇文章');
  });
};

// Into a board's article list.
JJPtt.prototype.toBoard = function(board) {
  var self = this;
  if (!/^[A-Za-z0-9_\-]{1,20}$/.test(board || '')) return Promise.reject(new Error('看板名稱不對'));
  // out of an article, then "s" (select board) -- which only works in a
  // list, not in the main menu: from there, 我的最愛 first
  if (/瀏覽 第|\(y\)回應/.test(this.screen())) this.send('q');
  return JJPtt.sleep(200).then(function() {
    if (/【\s*主功能表\s*】|主功能表/.test(self.screen())) return self.enterFavorites();
  }).then(function() {
    self.send('s');
    return self.wait({ ask: /請輸入看板名稱|選擇看板/ }, 8000, undefined, '按 s 選看板');
  }).then(function() {
    self.type(board + '\r');
    var name = board.replace(/[^\w-]/g, '');
    var boardRe = new RegExp('看板《' + name + '》', 'i');
    // in 我的最愛 / 看板列表, s only moves the cursor onto the board: → goes in
    var cursorRe = new RegExp('^\\s*>\\s*\\d+\\s+[ˇ∨\\s]?\\s*' + name + '\\s', 'mi');
    var until = Date.now() + 15000, moved = 0;
    var step = function() {
      if (Date.now() > until) return Promise.reject(new Error('PTT 沒有回應（進 ' + board + ' 板），請再試一次'));
      return self.wait({
        none: /無此看板|沒有這個看板/,
        hurdle: /按任意鍵|請按任意鍵|按任一鍵/,
        // the board's own article list (its header names the 板主); a
        // board list's header can name the board under the cursor too
        inboard: /【\s*板主|文章選讀/,
        cursor: cursorRe
      }, 10000, undefined, '進 ' + board + ' 板').then(function(k) {
        if (k === 'none') throw new Error('沒有 ' + board + ' 這個看板');
        if (k === 'inboard') {
          if (boardRe.test(self.screen())) return null;
          // still the board we came from: wait for the new one
          if (cursorRe.test(self.screen()) && moved < 2) { moved++; self.send('\x1b[C'); }
          return JJPtt.sleep(200).then(step);
        }
        var before = self.screen();
        if (k === 'cursor') {
          if (moved >= 2) return JJPtt.sleep(200).then(step);
          moved++;
          self.send(moved === 1 ? '\x1b[C' : '\r');
        } else {
          self.send(' ');
        }
        return self.settle(before, 1500).then(step);
      });
    };
    return step();
  });
};

// Answers PTT's questions until `done` shows. cases: { key: RegExp };
// answer(key) returns the keys to send. Each question is answered once:
// on the real PTT an answered question stays on the screen while the next
// one is asked under it, and must not be answered again. 'hurdle' (any key)
// and 'sign' may come back.
JJPtt.prototype.answerUntil = function(cases, answer, ms, failMessage) {
  var self = this;
  var answered = {};
  var until = Date.now() + (ms || 15000);
  var step = function() {
    if (Date.now() > until) return Promise.reject(new Error(failMessage || 'PTT 沒有回應，請再試一次'));
    var open = {};
    for (var k in cases) if (!answered[k]) open[k] = cases[k];
    return self.wait(open, 10000).then(function(k) {
      var keys = answer(k);
      if (keys === null) return k;
      if (k !== 'hurdle' && k !== 'sign') answered[k] = true;
      if (keys) self.send(keys);
      return JJPtt.sleep(500).then(step);
    });
  };
  return step();
};

// The editor: type the lines, Ctrl-X, save, then past the signature and the
// 「順利貼出佈告」 screen.
JJPtt.prototype.typeAndSave = function(lines, endWithNewline) {
  var self = this;
  lines.forEach(function(line, i) {
    if (line) self.type(line);
    if (i < lines.length - 1 || endWithNewline) self.send('\r');
  });
  return JJPtt.sleep(300).then(function() {
    self.send('\x18');
    return self.wait({ save: /檔案處理|\(S\)存檔/ }, 8000, undefined, '存檔');
  }).then(function() {
    self.send('s\r');
    return self.answerUntil({
      no: /無法發表|不能發文|禁止發文|權限不足|無法在此發表/,
      done: /順利貼出|貼出佈告|文章已發表/,
      sign: /請選擇簽名檔/,
      hurdle: /按任意鍵|請按任意鍵/,
      list: /文章選讀|看板《/
    }, function(k) {
      if (k === 'no') throw new Error('這個板不能發文');
      if (k === 'done' || k === 'list') {
        if (/按任意鍵|請按任意鍵/.test(self.screen())) self.send(' ');
        return null;
      }
      return k === 'sign' ? '0\r' : ' ';
    }, 15000, '不確定有沒有貼出去，請到板上看看');
  });
};

// ---- push (推 / 噓 / →) -----------------------------------------------------------------------

JJPtt.prototype.push = function(url, kind, text) {
  var self = this;
  text = String(text || '').replace(/\s+/g, ' ').trim();
  if (!text) return Promise.reject(new Error('沒有內容'));
  return this.run(function() {
    return self.ensureIn().then(function() {
      return self.toArticle(url);
    }).then(function() {
      self.send('X');
      return self.wait({
        choose: /值得推薦|給它噓聲|只加.*註解|1\.\s*值得/,
        input: /(推|噓|→)\s*\w+\s*[:：]/,
        no: /禁止推薦|不能推薦|無法推文|禁止推文|您不能|已被鎖定|權限不足/,
        wait: /推文間隔|請稍候|太快/
      }, 8000, undefined, '按 X 推文');
    }).then(function(k) {
      if (k === 'no') throw new Error('這個板或這篇文章不能推文');
      if (k === 'wait') throw new Error('推文太快了，等一下再試');
      if (k === 'choose') {
        self.send(kind === '2' ? '2' : kind === '3' ? '3' : '1');
        return self.wait({ input: /(推|噓|→)\s*\w+\s*[:：]/, no: /禁止|不能|無法/ }, 6000, undefined, '選推噓後等輸入框');
      }
      return k;
    }).then(function(k) {
      if (k === 'no') throw new Error('這篇文章不能用這種方式推文');
      self.type(text + '\r');
      return self.wait({ confirm: /確定\s*\[y\/N\]|確定要/i, done: /文章選讀|看板《/ }, 8000, undefined, '送出推文');
    }).then(function(k) {
      if (k === 'confirm') self.send('y\r');
      return JJPtt.sleep(600);
    });
  });
};

// ---- reply (回文到看板) -------------------------------------------------------------------------

JJPtt.prototype.reply = function(url, text, quote) {
  var self = this;
  var lines = String(text || '').replace(/\r/g, '').split('\n');
  if (!String(text || '').trim()) return Promise.reject(new Error('沒有內容'));
  return this.run(function() {
    return self.ensureIn().then(function() {
      return self.toArticle(url);
    }).then(function() {
      self.send('y');
      // answer the questions until the editor is open
      return self.answerUntil({
        no: /無法回應|不能回文|禁止回文|唯讀|權限不足|您不能/,
        editor: JJPtt.EDITOR,
        where: /回應至|\(F\)看板/,
        title: /採用原標題/,
        quote: /引用原文/
      }, function(k) {
        if (k === 'no') throw new Error('這個板不能回文');
        if (k === 'editor') return null;
        if (k === 'where') return 'f\r';
        if (k === 'title') return 'y\r';
        return quote ? 'y\r' : 'n\r';
      }, 15000, 'PTT 沒有開啟編輯畫面');
    }).then(function() {
      return self.typeAndSave(lines, quote);
    });
  });
};

// ---- post (發文) ------------------------------------------------------------------------------

// The board's categories as PTT lists them after Ctrl-P:
// "種類：1.問題 2.建議 3.討論 ... (1-8或不選)" -> ['問題', '建議', '討論', ...]
JJPtt.parsePostTypes = function(screen) {
  var line = String(screen || '').split('\n').filter(function(l) { return /種類：/.test(l); }).pop();
  if (!line) return [];
  line = line.slice(line.indexOf('種類：') + 3).replace(/\(1-\d.*$/, '');
  var out = [], re = /(\d)\.(\S+)/g, m;
  while ((m = re.exec(line))) out[+m[1] - 1] = m[2];
  return out.filter(function(x) { return x; });
};

// Categories seen on each board (after a post there), for the app's chips.
JJPtt.TYPES_KEY = 'jjptt.m.postTypes';
JJPtt.postTypes = function(board) {
  try {
    var all = JSON.parse(window.localStorage.getItem(JJPtt.TYPES_KEY) || '{}');
    return all[String(board).toLowerCase()] || [];
  } catch (e) { return []; }
};
JJPtt.savePostTypes = function(board, types) {
  if (!types.length) return;
  try {
    var all = JSON.parse(window.localStorage.getItem(JJPtt.TYPES_KEY) || '{}');
    all[String(board).toLowerCase()] = types;
    window.localStorage.setItem(JJPtt.TYPES_KEY, JSON.stringify(all));
  } catch (e) {}
};

// The editor's footer (not the list's「(^X)轉錄」).
JJPtt.EDITOR = /編輯文章|\^X\/\^Q|檔案處理/;

// Title width PTT keeps (TTLEN), with the "[類別] " PTT puts in front.
JJPtt.TITLE_BYTES = 64;

// post(board, type, title, text): type is a category name ('問卦'...) or ''.
// One of the board's own categories is picked by its number; any other is
// put in front of the title as "[type] ", since PTT only takes 1-8 there.
JJPtt.prototype.post = function(board, type, title, text) {
  var self = this;
  type = String(type || '').replace(/[\[\]\s]/g, '');
  title = String(title || '').replace(/\s+/g, ' ').trim();
  var lines = String(text || '').replace(/\r/g, '').split('\n');
  if (!title) return Promise.reject(new Error('請輸入標題'));
  if (!String(text || '').trim()) return Promise.reject(new Error('沒有內容'));
  var typeAsked = false;
  return this.run(function() {
    return self.ensureIn().then(function() {
      return self.toBoard(board);
    }).then(function() {
      self.send('\x10');  // Ctrl-P
      return self.answerUntil({
        no: /無法在此發表|無法發表|不能發文|禁止發文|權限不足|您不能|未達.*(限制|標準)|唯讀/,
        editor: JJPtt.EDITOR,
        type: /種類：|或不選/,
        title: /標題：/,
        hurdle: /按任意鍵|請按任意鍵|按任一鍵/
      }, function(k) {
        if (k === 'no') throw new Error('你現在不能在 ' + board + ' 板發文');
        if (k === 'editor') return null;
        if (k === 'hurdle') return ' ';
        if (k === 'type') {
          typeAsked = true;
          var types = JJPtt.parsePostTypes(self.screen());
          JJPtt.savePostTypes(board, types);
          var i = type ? types.indexOf(type) : -1;
          if (i >= 0) return String(i + 1) + '\r';
          if (type) title = '[' + type + '] ' + title;
          return '\r';
        }
        // the title (no category question asked: a category goes in front)
        if (type && !typeAsked) title = '[' + type + '] ' + title;
        return title + '\r';
      }, 20000, 'PTT 沒有開啟編輯畫面');
    }).then(function() {
      return self.typeAndSave(lines, false);
    });
  });
};

// ---- 我的最愛 (the account's favourite boards) ---------------------------------------------

// One row of a board list: "   12 ˇGossiping    綜合 ◎[八卦] 亂講話   爆! 板主"
// -> { name, title }; folders (Σ, or 我的最愛's own 「目錄 □」) and
// separator lines give null.
JJPtt.parseBoardRow = function(row) {
  var m = /^\s*[>●]?\s*(\d+)\s+[ˇ∨\s]?\s*([A-Za-z][\w\-]{1,15})\s+(\S{1,6})\s+([◎●Σ□]?)\s*(.*)$/.exec(row);
  if (!m || m[4] === 'Σ' || m[4] === '□' || m[3] === '目錄') return null;
  if (/^-+$/.test(m[2])) return null;
  var title = m[5].split(/\s{2,}/)[0].replace(/^◎/, '');
  // a title that fills its column runs straight into the next ones:
  // 「…三星獅爆!GreenChamb…」, 「…龍布…爆!hasebe/jou…」, 「…規…21 abc」
  return { n: +m[1], name: m[2], title: JJPtt.cleanTitle(title) };
};

// A title that filled its column runs straight into the next ones:
// 「…三星獅爆!GreenChamb…」, 「…龍布…爆!hasebe/jou…」, 「…規…21 abc」.
JJPtt.cleanTitle = function(title) {
  return String(title || '').replace(/(爆!|HOT)\S*$/, '').replace(/…\s*\d{1,3}(\s+\S+)?$/, '…').trim();
};

// Back to the main menu from wherever the connection is.
JJPtt.prototype.toMenu = function() {
  var self = this;
  var tries = 0;
  var step = function() {
    var text = self.screen();
    if (/【\s*主功能表\s*】|主功能表/.test(text)) return Promise.resolve();
    if (++tries > 12) return Promise.reject(new Error('回不到 PTT 主選單'));
    if (/確定要離開|您確定要離開|離開.*嗎/.test(text)) self.send('n\r');
    else if (/按任意鍵|請按任意鍵|按任一鍵/.test(text)) self.send(' ');
    else self.send('\x1b[D');
    return self.settle(text, 800).then(step);
  };
  return step();
};

// From the main menu into 我的最愛. The main menu itself says 「我 的 最愛」
// (its F item), so this waits for the board list's column header among what
// changed. A menu letter may only move the cursor there: then → goes in.
JJPtt.LIST_HEAD = /編號.*看\s*板|看\s*板.*類別|類別.*轉信/;
JJPtt.prototype.enterFavorites = function() {
  var self = this;
  var before = this.screen();
  this.send('f');
  return this.wait({ list: JJPtt.LIST_HEAD }, 2500, before).catch(function() {
    if (!/主功能表/.test(self.screen())) throw new Error('進不了我的最愛');
    self.send('\x1b[C');
    return self.wait({ list: JJPtt.LIST_HEAD }, 8000, before, '進我的最愛');
  });
};

// A folder row of 我的最愛: "     2   MyFavFolder 目錄 □MLB" -> { n, title }.
JJPtt.parseFolderRow = function(row) {
  var m = /^\s*[>●]?\s*(\d+)\s+[ˇ∨\s]?\s*([A-Za-z][\w\-]{1,15})\s+目錄\s+□\s*(.*)$/.exec(row);
  if (!m) return null;
  return { n: +m[1], title: m[3].split(/\s{2,}/)[0].trim() || m[2] };
};

// The account's 我的最愛, in PTT's order, with the boards inside its folders
// (each with `folder`: the folder's name):
//   [{ name, title }, { name, title, folder: 'MLB' }, ...]
JJPtt.prototype.favorites = function() {
  var self = this;
  return this.run(function() {
    var out = [];
    // one list (我的最愛 or a folder), every page; folders found are
    // returned with where they were, to be read afterwards
    var readList = function(folder) {
      var boards = [], folders = [], seen = {};
      var lastFirst = -1, pages = 0;
      var read = function() {
        var buf = self.app.buf;
        var first = -1;
        for (var r = 2; r < (buf.rows || 24) - 1; ++r) {
          var text = buf.getRowText(r, 0, buf.cols);
          var num = /^\s*[>●]?\s*(\d+)\s/.exec(text);
          if (!num) continue;
          if (first < 0) first = +num[1];
          if (seen[num[1]]) continue;
          var b = JJPtt.parseBoardRow(text);
          var f = !b && !folder && JJPtt.parseFolderRow(text);
          if (b || f) seen[num[1]] = true;
          if (b) boards.push(folder ? { name: b.name, title: b.title, folder: folder } : { name: b.name, title: b.title });
          if (f) folders.push({ n: f.n, title: f.title, at: boards.length });
        }
        return first;
      };
      var page = function() {
        var first = read();
        if (first === lastFirst || ++pages > 30) return Promise.resolve({ boards: boards, folders: folders });
        lastFirst = first;
        var prev = self.screen();
        self.send('\x1b[6~');  // page down
        // no change: that was the last page
        return self.settle(prev, 900).then(function(moved) {
          return moved ? page() : { boards: boards, folders: folders };
        });
      };
      return page();
    };
    // into folder number n (jump to it, →), read it, ← back out. A folder
    // that can't be opened is left out, not the whole sync.
    var readFolder = function(f) {
      var prev = self.screen();
      self.type(String(f.n) + '\r');
      return self.settle(prev, 600).then(function() {
        var at = self.screen();
        self.send('\x1b[C');
        return self.settle(at, 1500).then(function(entered) {
          if (!entered) return [];
          return readList(f.title).then(function(r) {
            var inside = self.screen();
            self.send('\x1b[D');
            return self.settle(inside, 1000).then(function() { return r.boards; });
          });
        });
      });
    };
    return self.ensureIn().then(function() {
      return self.toMenu();
    }).then(function() {
      return self.enterFavorites();
    }).then(function() {
      // the rows come a moment after the header: wait for the first one
      // (none within 4 s: an empty 我的最愛)
      return self.wait({ row: /^\s*[>●]?\s*\d+\s+[ˇ\s]?\s*[A-Za-z][\w\-]+\s+\S/m }, 4000).catch(function() {});
    }).then(function() {
      return readList('');
    }).then(function(top) {
      var inside = [];
      var next = function(i) {
        if (i >= top.folders.length) return Promise.resolve();
        return readFolder(top.folders[i]).then(function(b) {
          inside[i] = b;
          return next(i + 1);
        });
      };
      return next(0).then(function() {
        // each folder's boards where the folder was
        var at = 0;
        top.folders.forEach(function(f, i) {
          out = out.concat(top.boards.slice(at, f.at), inside[i] || []);
          at = f.at;
        });
        out = out.concat(top.boards.slice(at));
      });
    }).then(function() {
      self.send('\x1b[D');  // leave the list
      return out;
    });
  });
};
