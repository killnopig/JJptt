// JJptt app: a PTT connection in the background for what reading from the
// web pages can't do -- logging in, pushing (推 / 噓 / →) and replying. The
// terminal is never shown: this reads its screen and types the keys a
// person would, one job at a time.
//
//   ptt.login(user, pass)        -> Promise (rejects with a message)
//   ptt.push(url, kind, text)    kind '1' 推 / '2' 噓 / '3' →
//   ptt.reply(url, text, quote)
//   ptt.logout()
function JJPtt(app) {
  this.app = app;
  this.user = '';
  this.pass = '';
  this.state = 'off';        // off / connecting / in
  this.queue = Promise.resolve();
  this.listeners = [];
}

JJPtt.STEP_MS = 100;
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

// One job at a time, in order.
JJPtt.prototype.run = function(job) {
  var p = this.queue.then(job, job);
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
JJPtt.prototype.wait = function(cases, ms, since) {
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
      if (Date.now() > until) return reject(new Error('PTT 沒有回應，請再試一次'));
      setTimeout(tick, JJPtt.STEP_MS);
    };
    tick();
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
  return this.connect().then(function() {
    return self.wait({ user: /請輸入代號/ }, 20000);
  }).then(function() {
    var before = self.screen();
    self.type(user + '\r');
    // only once PTT really asks for the password: what is typed before that
    // is thrown away (that made right passwords fail)
    return self.wait({ pass: /請輸入您的密碼/ }, 15000, before);
  }).then(function() {
    return JJPtt.sleep(300);
  }).then(function() {
    var before = self.screen();
    self.type(pass + '\r');
    return self.pastLogin(before);
  }).then(function() {
    self.user = user;
    self.pass = pass;
    self.setState('in');
  }).catch(function(err) {
    self.setState(self.connected() ? 'connecting' : 'off');
    self.disconnect();
    throw err;
  });
};

// After the password: answer what PTT asks until the main menu.
JJPtt.prototype.pastLogin = function(before) {
  var self = this;
  // the app's own choice, off unless turned on: logging in on the phone
  // must not throw the computer's PTT off
  var dupAnswer = JJPtt.kickOthers() ? 'y\r' : 'n\r';
  var until = Date.now() + 25000;
  var step = function() {
    if (Date.now() > until) return Promise.reject(new Error('登入逾時，請再試一次'));
    return self.wait({
      wrong: /密碼不對|無此帳號|帳號不存在/,
      busy: /系統過載|請稍後再來|登入太頻繁/,
      dup: /刪除其他重複登入的連線/,
      menu: /【\s*主功能表\s*】|主功能表/,
      hurdle: /按任意鍵|請按任意鍵|按任一鍵|您要刪除以上錯誤嘗試|尚未完成的文章|有一篇文章尚未完成/
    }, 15000, before).then(function(k) {
      before = undefined;  // past the password: the whole screen counts again
      if (k === 'wrong') {
        // PTT's own words, so a misread screen can be told from a typo
        var said = (self.screen().split('\n').filter(function(l) { return /密碼不對|無此帳號|帳號不存在/.test(l); }).pop() || '').trim();
        throw new Error('帳號或密碼錯誤' + (said ? '（PTT：' + said.slice(0, 40) + '）' : ''));
      }
      if (k === 'busy') throw new Error('PTT 現在很忙，請稍後再試');
      if (k === 'menu') return null;
      if (k === 'dup') self.send(dupAnswer);
      else self.passHurdle();
      return JJPtt.sleep(400).then(step);
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
  // out of an article / menu, then "s" (select board)
  if (/瀏覽 第|\(y\)回應/.test(this.screen())) this.send('q');
  return JJPtt.sleep(200).then(function() {
    self.send('s');
    return self.wait({ ask: /請輸入看板名稱|選擇看板/ }, 8000);
  }).then(function() {
    self.type(board + '\r');
    var boardRe = new RegExp('看板《' + board.replace(/[^\w-]/g, '') + '》', 'i');
    var until = Date.now() + 15000;
    var step = function() {
      if (Date.now() > until) return Promise.reject(new Error('進不了 ' + board + ' 板'));
      return self.wait({ list: boardRe, hurdle: /按任意鍵|請按任意鍵|按任一鍵/, none: /無此看板|沒有這個看板/ }, 10000).then(function(k) {
        if (k === 'none') throw new Error('沒有 ' + board + ' 這個看板');
        if (k === 'list') return null;
        self.send(' ');
        return JJPtt.sleep(400).then(step);
      });
    };
    return step();
  }).then(function() {
    self.send('#');
    return self.wait({ ask: /搜尋.*(文章代碼|AID)|請輸入文章代碼|#/ }, 5000);
  }).then(function() {
    self.send(aid + '\r');
    return JJPtt.sleep(500);
  }).then(function() {
    if (/找不到這個文章代碼|找不到|沒有這篇/.test(self.screen())) throw new Error('在 PTT 上找不到這篇文章');
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
        input: /(推|噓|→)\s*\w+\s*:/,
        no: /禁止推薦|不能推薦|無法推文|禁止推文|您不能|已被鎖定|權限不足/,
        wait: /推文間隔|請稍候|太快/
      }, 8000);
    }).then(function(k) {
      if (k === 'no') throw new Error('這個板或這篇文章不能推文');
      if (k === 'wait') throw new Error('推文太快了，等一下再試');
      if (k === 'choose') {
        self.send(kind === '2' ? '2' : kind === '3' ? '3' : '1');
        return self.wait({ input: /(推|噓|→)\s*\w+\s*:/, no: /禁止|不能|無法/ }, 6000);
      }
      return k;
    }).then(function(k) {
      if (k === 'no') throw new Error('這篇文章不能用這種方式推文');
      self.type(text + '\r');
      return self.wait({ confirm: /確定\s*\[y\/N\]|確定要/i, done: /文章選讀|看板《/ }, 8000);
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
      var until = Date.now() + 15000;
      // answer the questions until the editor is open
      var step = function() {
        if (Date.now() > until) return Promise.reject(new Error('PTT 沒有開啟編輯畫面'));
        return self.wait({
          where: /回應至|\(F\)看板/,
          title: /採用原標題/,
          quote: /引用原文/,
          editor: /編輯文章|\^X|Ctrl-X|檔案處理/,
          no: /無法回應|不能回文|禁止回文|唯讀|權限不足|您不能/
        }, 10000).then(function(k) {
          if (k === 'no') throw new Error('這個板不能回文');
          if (k === 'editor') return null;
          if (k === 'where') self.send('f\r');
          else if (k === 'title') self.send('y\r');
          else if (k === 'quote') self.send(quote ? 'y\r' : 'n\r');
          return JJPtt.sleep(500).then(step);
        });
      };
      return step();
    }).then(function() {
      // the editor: type the lines, then Ctrl-X and save
      lines.forEach(function(line, i) {
        if (line) self.type(line);
        if (i < lines.length - 1 || quote) self.send('\r');
      });
      return JJPtt.sleep(300);
    }).then(function() {
      self.send('\x18');
      return self.wait({ save: /檔案處理|\(S\)存檔/ }, 8000);
    }).then(function() {
      self.send('s\r');
      var until = Date.now() + 15000;
      var step = function() {
        if (Date.now() > until) return Promise.reject(new Error('不確定有沒有貼出去，請到板上看看'));
        return self.wait({
          done: /順利貼出|貼出佈告|文章已發表/,
          sign: /請選擇簽名檔|簽名檔/,
          hurdle: /按任意鍵|請按任意鍵/,
          list: /文章選讀|看板《/,
          no: /無法發表|不能發文|禁止發文|權限不足/
        }, 10000).then(function(k) {
          if (k === 'no') throw new Error('這個板不能發文');
          if (k === 'done' || k === 'list') {
            if (/按任意鍵|請按任意鍵/.test(self.screen())) self.send(' ');
            return null;
          }
          if (k === 'sign') self.send('0\r');
          else self.send(' ');
          return JJPtt.sleep(500).then(step);
        });
      };
      return step();
    });
  });
};

// ---- 我的最愛 (the account's favourite boards) ---------------------------------------------

// One row of a board list: "   12 ˇGossiping    綜合 ◎[八卦] 亂講話   爆! 板主"
// -> { name, title }; folders (Σ) and separator lines give null.
JJPtt.parseBoardRow = function(row) {
  var m = /^\s*[>●]?\s*(\d+)\s+[ˇ\s]?\s*([A-Za-z][\w\-]{1,15})\s+(\S{1,6})\s+([◎●Σ□]?)\s*(.*)$/.exec(row);
  if (!m || m[4] === 'Σ') return null;
  if (/^-+$/.test(m[2])) return null;
  var title = m[5].split(/\s{2,}/)[0].replace(/^◎/, '').trim();
  return { n: +m[1], name: m[2], title: title };
};

// Back to the main menu from wherever the connection is.
JJPtt.prototype.toMenu = function() {
  var self = this;
  var tries = 0;
  var step = function() {
    var text = self.screen();
    if (/【\s*主功能表\s*】|主功能表/.test(text)) return Promise.resolve();
    if (++tries > 8) return Promise.reject(new Error('回不到 PTT 主選單'));
    if (/確定要離開|您確定要離開|離開.*嗎/.test(text)) self.send('n\r');
    else if (/按任意鍵|請按任意鍵/.test(text)) self.send(' ');
    else self.send('\x1b[D');
    return JJPtt.sleep(500).then(step);
  };
  return step();
};

JJPtt.prototype.favorites = function() {
  var self = this;
  return this.run(function() {
    var boards = [], seen = {};
    var lastFirst = -1, pages = 0;
    var read = function() {
      var buf = self.app.buf;
      var first = -1;
      for (var r = 2; r < (buf.rows || 24) - 1; ++r) {
        var b = JJPtt.parseBoardRow(buf.getRowText(r, 0, buf.cols));
        if (!b) continue;
        if (first < 0) first = b.n;
        var k = b.name.toLowerCase();
        if (!seen[k]) {
          seen[k] = true;
          boards.push({ name: b.name, title: b.title });
        }
      }
      return first;
    };
    var page = function() {
      var first = read();
      if (first === lastFirst || ++pages > 30) return Promise.resolve();
      lastFirst = first;
      self.send('\x1b[6~');  // page down
      return JJPtt.sleep(500).then(page);
    };
    return self.ensureIn().then(function() {
      return self.toMenu();
    }).then(function() {
      self.send('f');
      return self.wait({ fav: /我的最愛|我 的 最愛/ }, 8000);
    }).then(function() {
      return JJPtt.sleep(300);
    }).then(page).then(function() {
      self.send('\x1b[D');  // leave the list
      return boards;
    });
  });
};
