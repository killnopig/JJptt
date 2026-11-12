// JJptt tests: plain Node, no extra packages.  npm test
//
// Loads the browser source files into this context with a few stubs, then
// checks the 真.事實查核中心 rules and the 連推 / 臨時黑名單 behaviour.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');
var root = path.join(__dirname, '..');

global.window = global;
global.document = { addEventListener: function() {}, createElement: function() { return {}; } };
global.locale = {};
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/zh_TW_messages.js'), 'utf8'));
global.i18n = function(k) { return (locale.zh_TW[k] && locale.zh_TW[k].message) || k; };
global.$ = function() { return { length: 0 }; };
global.lib = { safeGetItem: function(k) { return global.lib.store[k] || null; },
               safeSetItem: function(k, v) { global.lib.store[k] = v; }, store: {} };
['js/predefined_config.js', 'js/fact_check.js', 'js/reader.js', 'js/pref.js', 'js/spam_guard.js'].forEach(function(f) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
});

var failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

// ---- helpers ---------------------------------------------------------------

function push(id, minute, block) {
  var p = { id: id, tag: '推', content: id + ' ' + Math.random(), ip: '',
            time: '11/12 10:' + (minute < 10 ? '0' + minute : minute) };
  if (block !== undefined) p.block = block;
  return p;
}
function many(id, count, minute, block) {
  var out = [];
  for (var i = 0; i < count; ++i) out.push(push(id, minute, block));
  return out;
}
function article(pushes, author) {
  return { url: 'https://www.ptt.cc/bbs/Test/M.1.A.html', text: '',
           meta: { '作者': (author || 'op') + ' (nick)', '時間': 'Thu Nov 12 10:00:00 2026',
                   '標題': '[問卦] 測試', '看板': 'Test' },
           pushes: pushes };
}

// A real PttChromePref with storage / screen calls stubbed out.
function makePref(values) {
  var app = { redraws: 0, toasts: [], reader: null };
  app.view = { redraw: function() { app.redraws++; } };
  app.showToast = function(t) { app.toasts.push(t); };
  app.doAddBlacklistUserId = function(id) { app.pref.blacklistedUserIds[id] = true; };
  var pref = new PttChromePref(app, function() {});
  pref.values = Object.assign({}, DEFAULT_PREFS, values || {});
  pref.setStorage = function() {};
  pref.refreshTempBlacklistOnUi = function() {};
  pref.refreshBlacklistOnUi = function() {};
  app.pref = pref;
  return pref;
}

// Runs the fact check; the blacklist step is deferred with setTimeout, so
// run that at once here.
function analyze(art, values, pref) {
  pref = pref || makePref(values);
  if (values) Object.assign(pref.values, values);
  var fc = new FactCheck(pref.app);
  fc.history = { record: function() {}, count: function() { return 0; } };
  fc.historyTags = function() {};
  var timers = [];
  var real = global.setTimeout;
  global.setTimeout = function(fn) { timers.push(fn); };
  try { var r = fc.analyze(art); } finally { global.setTimeout = real; }
  timers.forEach(function(fn) { fn(); });
  return { report: r.report, tags: r.tags, pref: pref, fc: fc,
           floodLine: r.report.filter(function(t) { return /^連續推文/.test(t); })[0] || '' };
}

// Fake DOM good enough for PttReader.toLines.
function text(s) { return { nodeType: 3, nodeValue: s }; }
function elem(attrs, kids) {
  var n = { nodeType: 1, tagName: 'DIV', firstChild: null, nextSibling: null,
            hasAttribute: function(k) { return k in attrs; },
            getAttribute: function(k) { return k in attrs ? attrs[k] : null; } };
  for (var i = kids.length - 1; i >= 0; --i) { kids[i].nextSibling = n.firstChild; n.firstChild = kids[i]; }
  return n;
}
function pushNode(i) { return elem({ 'data-push-index': String(i) }, [text('push\n')]); }

// ---- FactCheck.chains ------------------------------------------------------

console.log('FactCheck.chains');

test('joins a run across up to 2 other floors', function() {
  var ps = [push('a', 1), push('b', 1), push('c', 1), push('a', 1)];
  assert.deepStrictEqual(FactCheck.chains([0, 1, 2, 3], ps), [[0, 3], [1], [2]]);
});
test('3 other floors in between breaks the run', function() {
  var ps = [push('a', 1), push('b', 1), push('c', 1), push('d', 1), push('a', 1)];
  assert.deepStrictEqual(FactCheck.chains([0, 1, 2, 3, 4], ps)[0], [0]);
});
test('more than 2 minutes later breaks the run', function() {
  var ps = [push('a', 1), push('b', 1), push('a', 4)];
  assert.deepStrictEqual(FactCheck.chains([0, 1, 2], ps)[0], [0]);
});
test('IDs compare without case', function() {
  var ps = [push('Abc', 1), push('x', 1), push('abc', 1)];
  assert.deepStrictEqual(FactCheck.chains([0, 1, 2], ps)[0], [0, 2]);
});
test('FactCheck.blocks splits on push.block', function() {
  var ps = [push('a', 1, 1), push('a', 1, 1), push('a', 1, 2)];
  assert.deepStrictEqual(FactCheck.blocks(ps), [[0, 1], [2]]);
  assert.deepStrictEqual(FactCheck.blocks([push('a', 1), push('b', 1)]), [[0, 1]]);
});

// ---- reader uses the same runs ----------------------------------------------

console.log('PttReader.groupRuns / assignBlocks');

test('groupRuns shows the runs FactCheck.chains finds', function() {
  var ps = [push('a', 1), push('b', 1), push('a', 1), push('c', 1), push('b', 1)];
  var lines = ps.map(function(p, i) { var l = []; l.push_index = i; return l; });
  PttReader.groupRuns(lines, ps);
  assert.deepStrictEqual(lines.map(function(l) { return l.push_index; }), [0, 2, 1, 4, 3]);
});
test('groupRuns never moves a push past a ※ 編輯 line', function() {
  var ps = [push('a', 1), push('b', 1), push('a', 1)];
  var mk = function(i) { var l = []; l.push_index = i; return l; };
  var lines = [mk(0), mk(1), [{ text: '※ 編輯' }], mk(2)];
  PttReader.groupRuns(lines, ps);
  assert.deepStrictEqual(lines.map(function(l) { return l.push_index; }), [0, 1, undefined, 2]);
});
test('assignBlocks numbers the blocks between other lines', function() {
  var ps = [push('a', 1), push('a', 1), push('a', 1)];
  var body = elem({}, [text('內文\n'), pushNode(0), pushNode(1), text('※ 編輯: a\n'), pushNode(2)]);
  PttReader.assignBlocks(body, ps);
  assert.deepStrictEqual(ps.map(function(p) { return p.block; }), [1, 1, 2]);
});

// ---- 連推 rule --------------------------------------------------------------

console.log('連推 (factFloodRun)');

test('10 in a row: tagged and blacklisted 24 hours with the reason', function() {
  var r = analyze(article(many('aaa', 10, 1)));
  assert.ok(r.pref.isBlacklisted('aaa'));
  var left = r.pref.tempBlacklist.aaa - Date.now();
  assert.ok(left > 23.9 * 3600000 && left <= 24 * 3600000);
  var info = r.pref.tempBlacklistInfo.aaa;
  assert.strictEqual(info.kind, 'flood');
  assert.strictEqual(info.n, 10);
  assert.strictEqual(info.title, '[問卦] 測試');
  assert.strictEqual(info.board, 'Test');
  assert.ok(/ptt\.cc/.test(info.url));
  assert.ok(r.tags[0].some(function(t) { return t.t === '連推10'; }));
});
test('9 in a row is under the threshold', function() {
  var r = analyze(article(many('aaa', 9, 1)));
  assert.ok(!r.pref.isBlacklisted('aaa'));
  assert.strictEqual(r.floodLine, '');
});
test('the threshold can be changed', function() {
  assert.ok(analyze(article(many('aaa', 5, 1)), { factFloodRunMin: 5 }).pref.isBlacklisted('aaa'));
});
test('rule off: nothing happens', function() {
  assert.ok(!analyze(article(many('aaa', 20, 1)), { factFloodRun: false }).pref.isBlacklisted('aaa'));
});
test('one cut-in does not dodge it (9 + other + 5)', function() {
  var ps = many('aaa', 9, 1).concat([push('bbb', 1)], many('aaa', 5, 2));
  var r = analyze(article(ps));
  assert.ok(r.pref.isBlacklisted('aaa'));
  assert.strictEqual(r.pref.tempBlacklistInfo.aaa.n, 14);
});
test('[公告] / [測試] articles: 連推 does not count', function() {
  ['[公告] 每週六清除本板文章.', '[測試]', 'Re: [公告] 板規', ' [ 測試 ] abc'].forEach(function(title) {
    var art = article(many('aaa', 20, 1));
    art.meta['標題'] = title;
    var r = analyze(art);
    assert.ok(!r.pref.isBlacklisted('aaa'), title);
    assert.strictEqual(r.floodLine, '', title);
    assert.ok(!r.tags[0] || !r.tags[0].some(function(t) { return /^連推/.test(t.t); }), title);
  });
  assert.ok(analyze(article(many('aaa', 20, 1))).pref.isBlacklisted('aaa'), '[問卦] 測試 still counts');
});
test('old 連推 entries from [公告] / [測試] articles are dropped; others stay', function() {
  var pref = makePref();
  var until = Date.now() + 3600000;
  pref.tempBlacklist = { a: until, b: until, c: until, d: until };
  pref.tempBlacklistInfo = {
    a: { kind: 'flood', n: 30, title: '[公告] 每週六清除本板文章.' },
    b: { kind: 'flood', n: 12, title: '[測試]' },
    c: { kind: 'flood', n: 12, title: '[問卦] 測試' },
    d: { kind: 'spam', n: 4, title: '[公告] 板規' }
  };
  assert.strictEqual(pref.dropExemptFlood(), true);
  assert.deepStrictEqual(Object.keys(pref.tempBlacklist).sort(), ['c', 'd']);
  assert.deepStrictEqual(Object.keys(pref.tempBlacklistInfo).sort(), ['c', 'd']);
  assert.strictEqual(pref.dropExemptFlood(), false);
});
test('cut-ins counting off: 9 + other + 5 is not a run', function() {
  var ps = many('aaa', 9, 1).concat([push('bbb', 1)], many('aaa', 5, 2));
  assert.ok(!analyze(article(ps), { factFloodRunChain: false }).pref.isBlacklisted('aaa'));
});
test('a ※ 編輯 line splits runs (6 + edit + 6)', function() {
  var ps = many('aaa', 6, 1, 1).concat(many('aaa', 6, 1, 2));
  assert.ok(!analyze(article(ps)).pref.isBlacklisted('aaa'));
  assert.ok(!analyze(article(ps), { factFloodRunChain: false }).pref.isBlacklisted('aaa'));
});
test('the author replying in their own article is not counted', function() {
  var r = analyze(article(many('op', 12, 1), 'op'));
  assert.ok(!r.pref.isBlacklisted('op'));
});
test('author rule off: the author is counted too', function() {
  assert.ok(analyze(article(many('op', 12, 1), 'op'), { factFloodRunSkipAuthor: false }).pref.isBlacklisted('op'));
});
test('taken off by hand: not put back for 24 hours', function() {
  var pref = makePref();
  var art = article(many('aaa', 10, 1));
  analyze(art, null, pref);
  assert.ok(pref.isBlacklisted('aaa'));
  pref.removeTempBlacklist('aaa');
  assert.ok(!pref.isBlacklisted('aaa'));
  assert.ok(!('aaa' in pref.tempBlacklistInfo));
  var r = analyze(art, null, pref);
  assert.ok(!pref.isBlacklisted('aaa'));
  assert.ok(/手動移除過/.test(r.floodLine));
  assert.ok(!/已加入/.test(r.floodLine));
});
test('keep-removed rule off: put back on next time', function() {
  var pref = makePref({ factFloodRunKeepRemoved: false });
  var art = article(many('aaa', 10, 1));
  analyze(art, null, pref);
  pref.removeTempBlacklist('aaa');
  analyze(art, null, pref);
  assert.ok(pref.isBlacklisted('aaa'));
});
test('the exemption runs out after 24 hours', function() {
  var pref = makePref();
  pref.removeTempBlacklist('aaa');
  pref.floodExempt.aaa = Date.now() - 1;
  analyze(article(many('aaa', 10, 1)), null, pref);
  assert.ok(pref.isBlacklisted('aaa'));
});

// ---- loading an article ------------------------------------------------------

console.log('loading articles');

test('every loaded article (read or prefetched) goes through the fact check', function() {
  var src = PttReader.prototype.fetchArticle.toString();
  assert.ok(/factCheck\.analyze\(article\)/.test(src), 'fetchArticle runs the fact check');
  assert.ok(/assignBlocks\(body, pushes\)/.test(src), 'fetchArticle sets push.block');
  assert.ok(/findArticle\(/.test(PttReader.prototype.startPrefetch.toString()), 'prefetch loads through findArticle');
  assert.ok(/fetchArticle\(/.test(PttReader.prototype.findArticle.toString()), 'findArticle uses fetchArticle');
});

// ---- spam guard ---------------------------------------------------------------

console.log('同網址洗版 (SpamGuard)');

test('same URL in 4 articles: blacklisted with the reason', function() {
  lib.store = {};
  var pref = makePref();
  var guard = new SpamGuard(pref.app);
  for (var i = 1; i <= 4; ++i) {
    guard.record({ url: 'https://www.ptt.cc/bbs/Test/M.' + i + '.A.html', text: '',
                   meta: { '作者': 'op', '標題': '文' + i, '看板': 'Test' },
                   pushes: [{ id: 'spammer', content: 'https://example.com/buy' }] });
  }
  assert.ok(pref.isBlacklisted('spammer'));
  var info = pref.tempBlacklistInfo.spammer;
  assert.strictEqual(info.kind, 'spam');
  assert.strictEqual(info.n, 4);
  assert.strictEqual(info.link, 'example.com/buy');
  assert.strictEqual(info.title, '文4');
});

function spamArticle(i, id) {
  return { url: 'https://www.ptt.cc/bbs/Test/M.' + i + '.A.html', text: '',
           meta: { '作者': 'op', '標題': '文' + i, '看板': 'Test' },
           pushes: [{ id: id || 'spammer', content: 'https://example.com/buy' }] };
}

test('spam: taken off by hand, not put back when the article is opened again', function() {
  lib.store = {};
  var pref = makePref();
  var guard = new SpamGuard(pref.app);
  for (var i = 1; i <= 4; ++i) guard.record(spamArticle(i));
  assert.ok(pref.isBlacklisted('spammer'));
  pref.removeTempBlacklist('spammer');
  guard.record(spamArticle(4));
  guard.record(spamArticle(5));
  assert.ok(!pref.isBlacklisted('spammer'));
});
test('spam: keep-removed rule off: put back', function() {
  lib.store = {};
  var pref = makePref({ factFloodRunKeepRemoved: false });
  var guard = new SpamGuard(pref.app);
  for (var i = 1; i <= 4; ++i) guard.record(spamArticle(i));
  pref.removeTempBlacklist('spammer');
  guard.record(spamArticle(4));
  assert.ok(pref.isBlacklisted('spammer'));
});
test('spam: the toast names the article', function() {
  lib.store = {};
  var pref = makePref();
  var guard = new SpamGuard(pref.app);
  for (var i = 1; i <= 4; ++i) guard.record(spamArticle(i));
  assert.strictEqual(pref.app.toasts.length, 1);
  assert.ok(pref.app.toasts[0].indexOf('[Test] 文4') >= 0, pref.app.toasts[0]);
});

// ---- automatic blacklist: batch, toast, permanent ---------------------------------

console.log('自動黑名單');

test('3 flooders in one article: one redraw, 3 toasts naming the article', function() {
  var ps = many('a1', 10, 1).concat(many('a2', 10, 1), many('a3', 10, 1));
  var r = analyze(article(ps));
  ['a1', 'a2', 'a3'].forEach(function(id) { assert.ok(r.pref.isBlacklisted(id), id); });
  assert.strictEqual(r.pref.app.redraws, 1);
  assert.strictEqual(r.pref.app.toasts.length, 3);
  r.pref.app.toasts.forEach(function(t) { assert.ok(t.indexOf('[Test] [問卦] 測試') >= 0, t); });
});
test('make permanent: moves from the temporary list to the blacklist', function() {
  var r = analyze(article(many('aaa', 10, 1)));
  r.pref.makeTempBlacklistPermanent('aaa');
  assert.ok(!('aaa' in r.pref.tempBlacklist));
  assert.ok(!('aaa' in r.pref.tempBlacklistInfo));
  assert.ok(r.pref.blacklistedUserIds.aaa);
  assert.ok(r.pref.isBlacklisted('aaa'));
});

// ---- single-article rules: 脈衝, 罐頭, 秒推, 門檻 ----------------------------------

console.log('脈衝 / 罐頭 / 秒推 / 門檻');

// pushes at "11/12 10:MM", `count` per minute for the given minutes
function steady(fromMin, toMin, perMin, prefix) {
  var out = [];
  for (var m = fromMin; m <= toMin; ++m) {
    for (var k = 0; k < perMin; ++k) out.push(push((prefix || 'u') + m + '_' + k, m));
  }
  return out;
}
function bursts(r) { return r.report.filter(function(t) { return /^脈衝/.test(t); }); }
// Date.now() fixed at 11/12 hh:mm (local time, like the push times)
function at(hh, mm, fn) {
  var real = Date.now;
  Date.now = function() { return new Date(2026, 10, 12, hh, mm).getTime(); };
  try { return fn(); } finally { Date.now = real; }
}

test('脈衝: a steady busy thread has none (not at the start, not at the end)', function() {
  at(12, 0, function() {
    assert.deepStrictEqual(bursts(analyze(article(steady(0, 20, 4)))), []);
  });
});
test('脈衝: a busy thread being read live has none in its newest minute', function() {
  at(10, 20, function() {
    assert.deepStrictEqual(bursts(analyze(article(steady(0, 20, 4)))), []);
  });
});
test('脈衝: a wave after 5+ quiet minutes is caught', function() {
  var ps = steady(0, 3, 1, 'a').concat(many('w', 8, 12));
  var b = bursts(analyze(article(ps)));
  assert.strictEqual(b.length, 1);
  assert.ok(/之前 8 分鐘沒人推/.test(b[0]), b[0]);
});
test('脈衝: nobody for 8 minutes after posting, then a wave', function() {
  var b = bursts(analyze(article(many('w', 8, 8))));
  assert.strictEqual(b.length, 1);
  assert.ok(/發文後 8 分鐘都沒人推/.test(b[0]), b[0]);
});
test('脈衝: lots of pushes right after posting is 秒推, not a wave', function() {
  at(12, 0, function() {
    assert.deepStrictEqual(bursts(analyze(article(many('w', 8, 0).concat(steady(1, 6, 2))))), []);
  });
});
test('脈衝: a quiet thread, a wave, then nobody until now is caught', function() {
  // 2 pushes in the 5 minutes before, so not quiet *before* the wave
  var ps = [push('a', 5), push('b', 7)].concat(many('w', 8, 9));
  at(12, 0, function() {
    var b = bursts(analyze(article(ps)));
    assert.strictEqual(b.length, 1);
    assert.ok(/之後到現在沒人推/.test(b[0]), b[0]);
  });
  at(10, 11, function() {  // still going on: not known yet
    assert.deepStrictEqual(bursts(analyze(article(ps))), []);
  });
});

function meme(fastCount) {
  // 6 accounts saying nearly the same thing, spread out (not 接龍);
  // the first `fastCount` of them push within 2 minutes of the post
  var ps = [], ends = ['哈', '啦', '欸', '喔', '耶', '嗎'];
  for (var i = 0; i < 6; ++i) {
    var p = push('m' + i, i < fastCount ? 1 : 4 + i);
    p.content = '政府真的是爛到不行了吧' + ends[i];
    ps.push(p);
    ps.push(push('f' + i, i < fastCount ? 1 : 4 + i));
  }
  return ps;
}
function cannedTags(r) {
  var out = {};
  r.tags.forEach(function(ts) { ts.forEach(function(t) { if (/^(罐頭|同梗)/.test(t.t)) out[t.t] = (out[t.t] || 0) + 1; }); });
  return out;
}
test('罐頭: a meme with only one early pusher stays grey 同梗', function() {
  var r = analyze(article(meme(1)));
  assert.deepStrictEqual(cannedTags(r), { '同梗': 6 });
  assert.ok(!r.report.some(function(t) { return /^罐頭/.test(t); }));
});
test('罐頭: two accounts with another sign make it 罐頭', function() {
  var r = analyze(article(meme(2)));
  assert.ok(cannedTags(r)['罐頭A'] >= 5, JSON.stringify(cannedTags(r)));
  assert.ok(r.report.some(function(t) { return /^罐頭A/.test(t); }));
});

test('秒推: the author adding a note right after posting is not 秒推', function() {
  var r = analyze(article([push('op', 0), push('x', 1)], 'op'));
  assert.deepStrictEqual(r.tags[0], []);
  assert.ok(r.tags[1].some(function(t) { return t.t === '秒推'; }));
  assert.ok(!('op' in r.fc.lastFastIds));
});
test('秒推 off: no tags, but still worked out for 首殺班底 / history', function() {
  var r = analyze(article([push('x', 1)]), { factFastPush: false });
  assert.deepStrictEqual(r.tags[0], []);
  assert.ok(!r.report.some(function(t) { return /^秒推/.test(t); }));
  assert.ok(r.fc.lastFastIds.x);
});
test('首殺班底 works with 秒推 off', function() {
  lib.store = {};
  var pref = makePref({ factFastPush: false, factSquadMin: 3 });
  var fc = new FactCheck(pref.app);
  fc.history = new FactHistory();
  var r;
  for (var i = 1; i <= 3; ++i) {
    var a = article([push('fan', 1), push('x' + i, 30)], 'op');
    a.url = 'https://www.ptt.cc/bbs/Test/M.' + i + '.A.html';
    r = fc.analyze(a);
  }
  assert.ok(r.tags[0].some(function(t) { return t.t === '首殺班底'; }), JSON.stringify(r.tags[0]));
});
test('門檻推文 off: no tags, but the first 10 are still remembered for 門檻班底', function() {
  var ps = [];
  for (var i = 0; i < 10; ++i) { var p = push('c' + i, 1); p.content = '推'; ps.push(p); }
  at(14, 0, function() {
    var r = analyze(article(ps), { factTask: false });
    assert.ok(!r.tags.some(function(ts) { return ts.some(function(t) { return t.t === '門檻推文'; }); }));
    assert.ok(r.fc.lastTaskIds && r.fc.lastTaskIds.c0);
    var on = analyze(article(ps));
    assert.ok(on.tags[0].some(function(t) { return t.t === '門檻推文'; }));
  });
});

// ---- settings defaults ----------------------------------------------------------

console.log('settings');

test('every fact-check rule has a default in DEFAULT_PREFS', function() {
  Object.keys(FactCheck.DEFAULTS).forEach(function(k) {
    assert.ok(k in DEFAULT_PREFS, k + ' missing from predefined_config.js');
    assert.strictEqual(DEFAULT_PREFS[k], FactCheck.DEFAULTS[k], k + ' defaults differ');
  });
});
test('every fact-check rule has a place in the settings page', function() {
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  Object.keys(FactCheck.DEFAULTS).forEach(function(k) {
    assert.ok(html.indexOf('id="opt_' + k + '"') >= 0, k + ' missing from index.html');
  });
});
test('every fact-check rule has Chinese and English text', function() {
  var zh = fs.readFileSync(path.join(root, 'js/zh_TW_messages.js'), 'utf8');
  var en = fs.readFileSync(path.join(root, 'js/en_US_messages.js'), 'utf8');
  Object.keys(FactCheck.DEFAULTS).forEach(function(k) {
    assert.ok(zh.indexOf('"options_' + k + '"') >= 0, k + ' missing from zh_TW_messages.js');
    assert.ok(en.indexOf('"options_' + k + '"') >= 0, k + ' missing from en_US_messages.js');
  });
});

test('the settings page does not wipe the temporary blacklist list', function() {
  var src = PttChromePref.prototype.updateSettingsToUi.toString();
  var skip = src.indexOf("i === 'tempBlacklist'"), wipe = src.indexOf("$('#opt_'+i).empty()");
  assert.ok(skip >= 0 && wipe > skip, '#opt_tempBlacklist is emptied before the skip check');
});

// ---- article list with 置底公告 hidden ---------------------------------------

console.log('list: hide pinned posts');
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/term_view.js'), 'utf8'), { filename: 'js/term_view.js' });

function listScreen(nums, pinnedCount, cursorNum) {
  var rows = ['【板主:x】 看板《Gossiping》', '', '   編號    日 期 作 者       文  章  標  題'];
  nums.forEach(function(n) {
    rows.push((n === cursorNum ? '>' : ' ') + n + ' + 3 11/12 user     □ [問卦] title ' + n);
  });
  for (var p = 0; p < pinnedCount; ++p) rows.push('   ★    11/12 mod      □ [公告] 板規');
  while (rows.length < 23) rows.push('');
  rows.push(' 文章列表 (^P)發表');
  return rows;
}
function listView(rows, sent, state) {
  var v = Object.create(TermView.prototype);
  v.buf = { rows: 24, cols: 80, pageState: 2, cur_y: 0, getRowText: function(r) { return rows[r] || ''; } };
  v.htmlRowStrArray = rows.map(function(t, r) {
    return '<span type="bbsrow" srow="' + r + '">' + t.replace('>', '&gt;') + '</span>';
  });
  v.bbscore = { pref: { values: { hidePinned: true, listNewestFirst: false } } };
  v.conn = { send: function(k) { sent.push(k); } };
  v.pinFillState = state;
  return v;
}
function range(a, b) { var out = []; for (var n = a; n <= b; ++n) out.push(n); return out; }
function shownNums(v) {
  return v.listMap.html.slice(3, 23).map(function(h) { var m = /(\d{6})/.exec(h); return m ? +m[1] : 0; });
}

test('last page: the hidden pinned rows are filled with the articles before, up to the bottom', function() {
  var log = console.log; console.log = function() {};
  try {
    var sent = [];
    var lastRows = listScreen(range(780708, 780724), 3, 780724);
    var v = listView(lastRows, sent);
    v.updateListMap();
    assert.deepStrictEqual(sent, ['\x1b[5~'], 'nothing remembered yet: look at the previous page');
    listView(listScreen(range(780688, 780707), 0, 780704), sent, v.pinFillState).updateListMap();
    assert.strictEqual(sent[1], new Array(21).join('\x1b[B'), 'back to the newest with ↓ x20');
    var back = listView(lastRows, sent, v.pinFillState);
    back.updateListMap();
    assert.deepStrictEqual(shownNums(back), range(780705, 780724));
    assert.strictEqual(back.slotOfRow(lastRows.indexOf(lastRows.filter(function(t) { return /^>/.test(t); })[0])), 22);
    assert.strictEqual(sent.length, 2, 'no more keys once filled');
  } finally {
    console.log = log;
  }
});
test('a page without pinned posts is shown as PTT draws it', function() {
  var v = listView(listScreen(range(780688, 780707), 0, 780700), []);
  v.updateListMap();
  assert.deepStrictEqual(shownNums(v), range(780688, 780707));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
