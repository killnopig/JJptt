// JJptt on phones (the Android app in mobile/): a row of PTT keys under the
// terminal (phones have no arrow keys), previous / back / next buttons in
// the article view, and a settings window laid out for a narrow screen
// (css: body.jj-mobile). Does nothing outside the app.
function JJMobile(app) {
  this.app = app;
}

JJMobile.KEYS = [
  // [label, what is sent to PTT ('' = special)]
  ['⌨', ''],
  ['←', '\x1b[D'],
  ['↑', '\x1b[A'],
  ['↓', '\x1b[B'],
  ['→', '\x1b[C'],
  ['⏎', '\r'],
  ['上頁', '\x1b[5~'],
  ['下頁', '\x1b[6~'],
  ['首', '\x1b[1~'],
  ['尾', '\x1b[4~']
];

// height of the ◀ 上一篇 / 返回列表 / 下一篇 ▶ bar (css: #jjReaderNav)
JJMobile.READER_BAR_PX = 60;

JJMobile.prototype.enabled = function() {
  return lib.isApp();
};

JJMobile.prototype.setup = function() {
  if (!this.enabled()) return;
  document.body.classList.add('jj-mobile');
  this.buildKeyBar();
  this.watchReader();
};

JJMobile.prototype.send = function(keys) {
  var conn = this.app.conn;
  if (conn && conn.send) conn.send(keys);
};

JJMobile.button = function(label, onTap) {
  var b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  // keep the focus where it is (the on-screen keyboard stays as it was)
  b.addEventListener('mousedown', function(e) { e.preventDefault(); });
  b.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    onTap();
  });
  return b;
};

JJMobile.prototype.buildKeyBar = function() {
  var self = this;
  var bar = document.createElement('div');
  bar.id = 'jjKeyBar';
  JJMobile.KEYS.forEach(function(k) {
    bar.appendChild(JJMobile.button(k[0], function() {
      if (k[1]) {
        self.send(k[1]);
      } else {
        // ⌨: the phone keyboard, for typing into PTT
        var input = self.app.inputArea;
        if (!input) return;
        if (document.activeElement === input) input.blur();
        else input.focus();
      }
    }));
  });
  document.body.appendChild(bar);
  this.keyBar = bar;
};

// Article view: ◀ previous, back to the list, next ▶ -- the same as ↑ at the
// top, ← and ↓ at the bottom on a keyboard.
JJMobile.prototype.buildReaderBar = function() {
  var reader = this.app.reader;
  var bar = document.createElement('div');
  bar.id = 'jjReaderNav';
  bar.appendChild(JJMobile.button('◀ 上一篇', function() { reader.closeAndSend(reader.navKeys(-1)); }));
  bar.appendChild(JJMobile.button('返回列表', function() { reader.closeAndSend('\x1b[D'); }));
  bar.appendChild(JJMobile.button('下一篇 ▶', function() { reader.closeAndSend(reader.navKeys(1)); }));
  document.body.appendChild(bar);
  return bar;
};

// Show the PTT keys with the terminal, the article buttons with the article.
JJMobile.prototype.watchReader = function() {
  var self = this;
  var readerBar = null;
  var update = function() {
    var reader = self.app.reader;
    var open = !!(reader && reader.isOpen && reader.isOpen());
    if (open && !readerBar) readerBar = self.buildReaderBar();
    if (readerBar) readerBar.style.display = open ? 'flex' : 'none';
    self.keyBar.style.display = open || self.app.modalShown ? 'none' : 'flex';
  };
  update();
  setInterval(update, 250);
};
