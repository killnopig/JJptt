// JJptt on phones: 設定 and 版面.
// Part of JJMobile (js/mobile.js).

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
    data.jjpttVersion = JJMobile.version(self.myBuild(), self.myVersion()) + ' (app)';
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
  verText.appendChild(el('div', 'jjm-set-title', '版本 ' + JJMobile.version(parseInt(b.run, 10), b.version)));
  if (b.time) verText.appendChild(el('div', 'jjm-set-sub', '打包時間 ' + this.shortTime(b.time)));
  verRow.appendChild(verText);
  ab.appendChild(verRow);
  var upd = JJMobile.iconButton('jjm-btn jjm-btn-main jjm-wide', 'reload', '檢查並自動更新', function() { self.checkUpdate(true); });
  panes.about.insertBefore(upd, ab);
  panes.about.insertBefore(el('div', 'jjm-hint', '有新版就直接下載，接著會跳出 Android 的安裝畫面，按「更新」就裝好（設定和登入都會保留）。'), ab);
  // 正式版 (default) or every 測試版 too
  var beta = this.localToggleRow(JJMobile.BETA_KEY, '接收測試版',
    '關著 = 只更新到正式版（試過沒問題的）；打開 = 每次修改都會收到，可能還有問題', false);
  beta.querySelector('input').addEventListener('change', function() {
    self.update = null;
    self.updateAvailable = false;
    self.checkUpdate(false);
  });
  var betaBox = el('div', 'jjm-group jjm-beta');
  betaBox.appendChild(beta);
  panes.about.insertBefore(betaBox, ab);
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
JJMobile.LOOK_DEV = { text: 22, push: 17, list: 19, lh: 1.65, listGap: 2, pushGap: 0, inline: false,
                      floor: '', nav: ['left', 'right'], ui: 0.9, tab: 30 };
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
  // one row: 預設 / 開發者建議 / 自訂1 / 自訂2 (an empty one is dimmed)
  var chips = el('div', 'jjm-chips jjm-chips-row jjm-looks-pick');
  var apply = function(look, name) {
    self.applyLook(look);
    if (self.app.showToast) self.app.showToast('已套用「' + name + '」', 1500);
    self.reload(screen);
  };
  chips.appendChild(JJMobile.button('jjm-chip', '預設', function() { apply(JJMobile.LOOK_DEFAULT, '預設'); }));
  chips.appendChild(JJMobile.button('jjm-chip', '開發者建議', function() { apply(JJMobile.LOOK_DEV, '開發者建議'); }));
  ['1', '2'].forEach(function(n) {
    var has = !!slots[n];
    var b = JJMobile.button('jjm-chip' + (has ? '' : ' jjm-empty'), '自訂' + n, function() {
      if (has) apply(slots[n], '自訂' + n);
      else if (self.app.showToast) self.app.showToast('自訂' + n + ' 還沒存，先按下面的「存自訂' + n + '」', 2500);
    });
    chips.appendChild(b);
  });
  box.appendChild(chips);
  var save = el('div', 'jjm-chips jjm-chips-row');
  ['1', '2'].forEach(function(n) {
    save.appendChild(JJMobile.button('jjm-chip jjm-chip-small', '存自訂' + n, function() {
      slots[n] = self.getLook();
      JJMobile.store(JJMobile.LOOK_SLOTS_KEY, slots);
      if (self.app.showToast) self.app.showToast('已存成自訂' + n, 1500);
      self.reload(screen);
    }));
  });
  // 複製碼 / 貼上碼: a sheet to choose which (目前 / 自訂1 / 自訂2)
  var copyCode = function(look, name) {
    var code = 'JJLOOK' + JSON.stringify(look);
    var done = function() {
      self.closeSheet();
      if (self.app.showToast) self.app.showToast('已複製「' + name + '」的設定碼', 2000);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, function() { window.prompt('複製這段：', code); });
      else window.prompt('複製這段：', code);
    } catch (e) { window.prompt('複製這段：', code); }
  };
  save.appendChild(JJMobile.button('jjm-chip jjm-chip-small', '複製碼', function() {
    var list = el('div', 'jjm-sheet-list');
    list.appendChild(JJMobile.button('jjm-sheet-item', '目前的版面', function() { copyCode(self.getLook(), '目前'); }));
    ['1', '2'].forEach(function(n) {
      var b = JJMobile.button('jjm-sheet-item', '自訂' + n + (slots[n] ? '' : '（還沒存）'), function() {
        if (slots[n]) copyCode(slots[n], '自訂' + n);
      });
      if (!slots[n]) b.disabled = true;
      list.appendChild(b);
    });
    self.showSheet('複製哪一個的設定碼？', list);
  }));
  save.appendChild(JJMobile.button('jjm-chip jjm-chip-small', '貼上碼', function() {
    var form = el('div', 'jjm-sheet-form');
    var area = el('textarea');
    area.rows = 3;
    area.placeholder = '把 JJLOOK 開頭的設定碼貼在這裡';
    form.appendChild(area);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function(t) { if (/^\s*JJLOOK/.test(t || '')) area.value = t.trim(); }, function() {});
      }
    } catch (e) {}
    var err = el('div', 'jjm-form-error');
    form.appendChild(err);
    var read = function() {
      try { return JSON.parse(String(area.value).trim().replace(/^JJLOOK/, '')); }
      catch (e) { err.textContent = '這不是設定碼'; return null; }
    };
    var row = el('div', 'jjm-chips jjm-chips-row');
    row.appendChild(JJMobile.button('jjm-btn jjm-btn-main', '套用到目前', function() {
      var look = read();
      if (look) { self.closeSheet(); apply(look, '設定碼'); }
    }));
    ['1', '2'].forEach(function(n) {
      row.appendChild(JJMobile.button('jjm-btn', '存到自訂' + n, function() {
        var look = read();
        if (!look) return;
        slots[n] = look;
        JJMobile.store(JJMobile.LOOK_SLOTS_KEY, slots);
        self.closeSheet();
        if (self.app.showToast) self.app.showToast('已存到自訂' + n, 1500);
        self.reload(screen);
      }));
    });
    form.appendChild(row);
    self.showSheet('貼上設定碼', form);
    setTimeout(function() { area.focus(); }, 50);
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
  var chev = el('span', 'jjm-set-chev');
  chev.innerHTML = JJMobile.svg('next');
  row.appendChild(chev);
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
