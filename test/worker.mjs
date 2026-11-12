// Tests for the relay's PTT page fetcher (worker/src/page.js). npm test
import assert from 'assert';
import { handlePage, pageTarget } from '../worker/src/page.js';

let failed = 0, passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const ORIGIN = 'https://killnopig.github.io';
const env = { ALLOWED_ORIGINS: ORIGIN + ',http://localhost:8000' };
const page = 'https://www.ptt.cc/bbs/Gossiping/M.1.A.html';
function req(url, origin, method) {
  return new Request('https://relay.example/page?url=' + encodeURIComponent(url),
                     { method: method || 'GET', headers: origin === undefined ? { Origin: ORIGIN } : origin ? { Origin: origin } : {} });
}
// fake PTT: records what was asked, answers with `answer`
function fakePtt(answer) {
  const f = async (url, init) => {
    f.calls.push({ url, init });
    const a = Object.assign({ status: 200, body: '<html>ok</html>', url }, answer || {});
    const r = new Response(a.body, { status: a.status });
    Object.defineProperty(r, 'url', { value: a.url });
    return r;
  };
  f.calls = [];
  return f;
}

console.log('relay /page');

await test('fetches a PTT article for an allowed page, with CORS and over18', async () => {
  const ptt = fakePtt();
  const r = await handlePage(req(page), env, ptt);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(await r.text(), '<html>ok</html>');
  assert.strictEqual(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.strictEqual(ptt.calls[0].url, page);
  assert.strictEqual(ptt.calls[0].init.headers.Cookie, 'over18=1');
});
await test('board search pages work too', async () => {
  const u = 'https://www.ptt.cc/bbs/Gossiping/search?q=author%3Aabc&page=2';
  const ptt = fakePtt();
  assert.strictEqual((await handlePage(req(u), env, ptt)).status, 200);
  assert.strictEqual(ptt.calls[0].url, u);
});
await test('other origins are refused (and get no CORS header)', async () => {
  for (const o of ['https://evil.example', '', null]) {
    const ptt = fakePtt();
    const r = await handlePage(req(page, o), env, ptt);
    assert.strictEqual(r.status, 403, String(o));
    assert.strictEqual(r.headers.get('Access-Control-Allow-Origin'), null);
    assert.strictEqual(ptt.calls.length, 0);
  }
});
await test('only https://www.ptt.cc/bbs/ pages', async () => {
  const bad = ['https://evil.example/bbs/x', 'http://www.ptt.cc/bbs/x', 'https://ptt.cc/bbs/x',
               'https://www.ptt.cc/man/x', 'https://www.ptt.cc/ask/over18', 'https://www.ptt.cc:8443/bbs/x',
               'https://user@www.ptt.cc/bbs/x', 'https://www.ptt.cc.evil.example/bbs/x',
               'https://www.ptt.cc/bbs/../etc', 'javascript:alert(1)', '', 'not a url'];
  for (const u of bad) {
    const ptt = fakePtt();
    const r = await handlePage(req(u), env, ptt);
    assert.strictEqual(r.status, 403, u);
    assert.strictEqual(ptt.calls.length, 0, u);
  }
  assert.ok(pageTarget('https://www.ptt.cc/bbs/Test/index.html'));
});
await test('PTT 404 is passed on', async () => {
  assert.strictEqual((await handlePage(req(page), env, fakePtt({ status: 404 }))).status, 404);
});
await test('still asked "over 18?": 451', async () => {
  const r = await handlePage(req(page), env, fakePtt({ url: 'https://www.ptt.cc/ask/over18?from=%2Fbbs%2FGossiping' }));
  assert.strictEqual(r.status, 451);
});
await test('redirected off PTT: not passed on', async () => {
  const r = await handlePage(req(page), env, fakePtt({ url: 'https://evil.example/' }));
  assert.strictEqual(r.status, 502);
});
await test('PTT down: 502', async () => {
  const r = await handlePage(req(page), env, async () => { throw new Error('down'); });
  assert.strictEqual(r.status, 502);
});
await test('rate limit: 429 and PTT is not asked', async () => {
  const ptt = fakePtt();
  const limited = Object.assign({ PAGE_LIMITER: { limit: async () => ({ success: false }) } }, env);
  assert.strictEqual((await handlePage(req(page), limited, ptt)).status, 429);
  assert.strictEqual(ptt.calls.length, 0);
});
await test('preflight and methods', async () => {
  assert.strictEqual((await handlePage(req(page, ORIGIN, 'OPTIONS'), env, fakePtt())).status, 204);
  assert.strictEqual((await handlePage(req(page, ORIGIN, 'POST'), env, fakePtt())).status, 405);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
