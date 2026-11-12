// JJptt on phones: the article screen, pushes, people and bottom sheets.
// Part of JJMobile (js/mobile.js).

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
  // under the text: ask AI about the whole article, open it in the browser
  var acts = el('div', 'jjm-artacts');
  acts.appendChild(JJMobile.iconButton('jjm-btn jjm-btn-quiet', 'ai', '問 AI：這篇是不是事實？', function() {
    self.app.askAi(JJMobile.articleForAi(article));
  }));
  acts.appendChild(JJMobile.iconButton('jjm-btn jjm-btn-quiet', 'external', '在瀏覽器開啟', function() {
    window.open(PttReader.articleUrl(screen.url || article.url), '_blank');
  }));
  body.parentNode.insertBefore(acts, body.nextSibling);
  reader.loadPreviews(v);
  // your own push just sent, until www.ptt.cc has it (reloadAfterPost)
  pushList = this.showPendingPush(screen, article, pushList);

  v.appendChild(this.composer(screen));

  // 上一篇 / 回列表 / 下一篇 where 設定 → 版面 → 內文 puts them: the top,
  // the bottom, and/or floating on the left or right edge (one hand)
  var list = screen.list;
  var hasPrev = list && screen.index > 0;
  var hasNext = list && (screen.index + 1 < list.entries.length || list.older);
  var makeNav = function(cls, short) {
    var nav = el('div', cls);
    if (hasPrev) nav.appendChild(JJMobile.iconButton('jjm-btn', 'back', short ? '' : '上一篇', function() { self.step(screen, -1); }));
    nav.appendChild(short ? JJMobile.iconButton('jjm-btn', 'list', '', function() { self.back(); }) :
      JJMobile.button('jjm-btn', '回列表', function() { self.back(); }));
    if (hasNext) nav.appendChild(JJMobile.iconButton('jjm-btn jjm-btn-main', 'next', short ? '' : '下一篇', function() { self.step(screen, 1); }, true));
    return nav;
  };
  var where = JJMobile.navPlaces();
  if (where.indexOf('top') >= 0) v.insertBefore(makeNav('jjm-endnav jjm-topnav'), head.nextSibling);
  if (where.indexOf('bottom') >= 0) v.appendChild(makeNav('jjm-endnav'));
  if (where.indexOf('left') >= 0) v.appendChild(makeNav('jjm-sidenav jjm-sidenav-left', true));
  if (where.indexOf('right') >= 0) v.appendChild(makeNav('jjm-sidenav jjm-sidenav-right', true));
};

// What 「問 AI：這篇是不是事實？」 sends: title, address and the text up to
// the 發信站 line (the extension's reading mode sends the same).
JJMobile.articleForAi = function(article) {
  var meta = article.meta || {};
  return (meta['標題'] || '') + '\n' + PttReader.articleUrl(article.url || '') + '\n\n' +
    String(article.text || '').split('\n※ 發信站')[0];
};

// Text selected in an article: a bar at the bottom asks AI about it (the
// extension's 「問 AI：這是不是事實？」 in the right-click menu). Android's own
// copy / share bar stays as it is.
JJMobile.prototype.watchSelection = function() {
  var self = this;
  var bar = null, picked = '';
  var hide = function() { if (bar) bar.style.display = 'none'; };
  var show = function() {
    if (!bar) {
      bar = JJMobile.el('div', 'jjm-selbar');
      var ask = JJMobile.iconButton('jjm-btn jjm-btn-main', 'ai', '問 AI：這是不是事實？', function() {
        var t = picked;
        hide();
        try { window.getSelection().removeAllRanges(); } catch (e) {}
        if (t) self.app.askAi(t);
      });
      // keep the selection while the finger is on the button
      ask.addEventListener('mousedown', function(e) { e.preventDefault(); });
      ask.addEventListener('touchstart', function(e) { e.preventDefault(); ask.click(); }, { passive: false });
      bar.appendChild(ask);
      (self.root || document.body).appendChild(bar);  // inside .jjm: its button styles
    }
    bar.style.display = '';
  };
  document.addEventListener('selectionchange', function() {
    var sel = window.getSelection ? window.getSelection() : null;
    var text = sel ? String(sel).trim() : '';
    var top = self.stack[self.stack.length - 1];
    var node = sel && sel.anchorNode;
    var inArticle = !!(text && top && top.type === 'article' && top.view && node && top.view.contains(node));
    if (inArticle) { picked = text; show(); }
    else hide();
  });
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
  // a quiet button like the rest (not a blue link, the only one in the app)
  var reply = JJMobile.iconButton('jjm-btn jjm-btn-quiet', 'edit', '回文到看板…', function() { self.replySheet(screen); });
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
        self.reloadAfterPost(screen, { id: self.ptt.user, text: text, kind: kind });
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

// After pushing. www.ptt.cc lags behind PTT (Gossiping: a minute and
// more), so the push is shown at once from what was sent -- PTT already
// took it -- marked 剛送出, and the article is fetched again quietly in the
// background (no re-drawing, the reading place stays) until the web page
// has it too; only then is it drawn again, the push highlighted.
JJMobile.PENDING_WAITS = [2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000];  // ~1.5 minutes

// Is the push (id + start of the text) among the article's last pushes?
JJMobile.hasPush = function(article, mine) {
  if (!article || !mine) return false;
  var id = String(mine.id || '').toLowerCase(), text = String(mine.text || '').slice(0, 6);
  var ps = article.pushes || [];
  for (var i = ps.length - 1; i >= 0 && i >= ps.length - 60; --i) {
    if (String(ps[i].id || '').toLowerCase() === id && String(ps[i].content || '').indexOf(text) >= 0) return true;
  }
  return false;
};

JJMobile.prototype.pendingPushRow = function(mine) {
  var el = JJMobile.el;
  var row = el('div', 'jjm-push jjm-push-mine');
  var head = el('div', 'jjm-push-head');
  var tag = mine.kind === '2' ? '噓' : mine.kind === '3' ? '→' : '推';
  head.appendChild(el('span', 'jjm-push-tag jjm-push-' + (tag === '推' ? 'up' : tag === '噓' ? 'down' : 'arrow'), tag));
  head.appendChild(el('span', 'jjm-push-id', mine.id));
  head.appendChild(el('span', 'jjm-pchip jjm-pchip-grey jjm-pending-chip', mine.late ? '網頁版還沒出現' : '剛送出'));
  var d = new Date(mine.at), p = function(n) { return (n < 10 ? '0' : '') + n; };
  head.appendChild(el('span', 'jjm-push-time', p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())));
  row.appendChild(head);
  row.appendChild(el('div', 'jjm-push-text', mine.text));
  return row;
};

// Called from fillArticle: the pending push under the others while the web
// page does not have it yet.
JJMobile.prototype.showPendingPush = function(screen, article, pushList) {
  var mine = screen.pendingPush;
  if (!mine) return pushList;
  if (JJMobile.hasPush(article, mine)) { screen.pendingPush = null; return pushList; }
  if (!pushList) {
    pushList = JJMobile.el('div', 'jjm-pushes');
    screen.view.appendChild(pushList);
  }
  pushList.appendChild(this.pendingPushRow(mine));
  return pushList;
};

JJMobile.prototype.reloadAfterPost = function(screen, mine) {
  var self = this;
  mine.at = Date.now();
  screen.pendingPush = mine;
  var token = screen.pendingToken = {};
  // 1. at once: under the other pushes, the box in view
  var list = screen.view.querySelector('.jjm-pushes');
  if (!list) {
    list = JJMobile.el('div', 'jjm-pushes');
    var box = screen.view.querySelector('.jjm-compose');
    screen.view.insertBefore(list, box || null);
  }
  var row = this.pendingPushRow(mine);
  row.classList.add('jjm-push-new');
  list.appendChild(row);
  var c = screen.view.querySelector('.jjm-compose');
  if (c) c.scrollIntoView({ block: 'end', behavior: 'smooth' });
  // 2. quietly, until www.ptt.cc has it
  var tries = 0;
  var round = function() {
    if (screen.pendingToken !== token || screen.pendingPush !== mine) return;  // another push / done
    var fresh = screen.url + (screen.url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now();
    self.app.reader.fetchArticle(fresh).then(function(article) {
      if (screen.pendingToken !== token) return;
      article.url = screen.url;
      self.articles[screen.url] = { promise: Promise.resolve(article), at: Date.now() };
      if (!JJMobile.hasPush(article, mine)) return next();
      screen.pendingPush = null;
      if (self.stack[self.stack.length - 1] !== screen) return;
      // the web page has it: drawn again, the same place kept (or the
      // bottom, if that is where the reader was)
      var v = screen.view;
      var atBottom = v.scrollHeight - v.scrollTop - v.clientHeight < 400;
      var top = v.scrollTop;
      v.innerHTML = '';
      self.fillArticle(screen, article);
      var rows = v.querySelectorAll('.jjm-pushes > .jjm-push');
      var id = String(mine.id).toLowerCase(), text = String(mine.text).slice(0, 6);
      for (var i = rows.length - 1; i >= 0 && i >= rows.length - 30; --i) {
        var who = ((rows[i].querySelector('.jjm-push-id') || {}).textContent || '').trim().toLowerCase();
        var said = (rows[i].querySelector('.jjm-push-text') || {}).textContent || '';
        if (who === id && said.indexOf(text) >= 0) { rows[i].classList.add('jjm-push-new'); break; }
      }
      if (atBottom) {
        var box2 = v.querySelector('.jjm-compose');
        if (box2) box2.scrollIntoView({ block: 'end' });
        else v.scrollTop = v.scrollHeight;
      } else {
        v.scrollTop = top;
      }
    }).catch(next);
  };
  var next = function() {
    if (screen.pendingToken !== token || screen.pendingPush !== mine) return;
    if (tries >= JJMobile.PENDING_WAITS.length) {
      // still not on the web page: say so on the row, no toast
      mine.late = true;
      var chip = screen.view.querySelector('.jjm-push-mine .jjm-pending-chip');
      if (chip) chip.textContent = '網頁版還沒出現';
      return;
    }
    setTimeout(round, JJMobile.PENDING_WAITS[tries++]);
  };
  next();
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
    recognizers: [[Hammer.Pan, { direction: Hammer.DIRECTION_HORIZONTAL, threshold: 20 }]],
    // Hammer's defaults put user-select: none and touch-callout: none on the
    // article, so a long press could not select text (問 AI, copy); keep the
    // phone's own selection, and leave vertical scrolling to the phone
    touchAction: 'pan-y',
    cssProps: { userSelect: 'auto', touchSelect: 'auto', touchCallout: 'default', userDrag: 'auto',
                contentZooming: 'none', tapHighlightColor: 'rgba(0,0,0,0)' }
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
  // 推文分析 off (設定 → 真.事實查核): no floor numbers, flags or same-IP
  // marks, like the extension; FACT tags and the lists have their own switches
  var insightsOn = !(pref && pref.values && pref.values.enablePushInsights === false);
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
    if (insightsOn && p.ip && geo.ready) {
      var cc = geo.lookup(p.ip);
      if (cc) {
        flag = PushInsights.flagEmoji(cc);
        if (cc !== 'TW') level = 'foreign';
      }
    }
    if (insightsOn && p.ip) {
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
    if (insightsOn) head.appendChild(el('span', 'jjm-push-floor', (i + 1) + '樓'));
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
