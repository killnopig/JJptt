// JJptt relay, part 2: fetches PTT web pages (www.ptt.cc/bbs/...) for the
// web version's article view. A web page can't read www.ptt.cc itself (the
// browser blocks reading other sites), the extension can; this does it for
// the pages allowed in ALLOWED_ORIGINS, and only for PTT's /bbs/ pages, so it
// is not a general-purpose proxy.
//
//   GET /page?url=https%3A%2F%2Fwww.ptt.cc%2Fbbs%2FGossiping%2FM.1.A.html
//
// Answers: the page (200), PTT's 404, 451 when PTT still asks "are you over
// 18?", 403 for other sites / pages / origins, 429 when one visitor asks too
// often (PAGE_LIMITER in wrangler.toml).

export const PAGE_PATH = '/page';
const PTT_HOST = 'www.ptt.cc';
const MAX_BYTES = 8 * 1024 * 1024;

export function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}

// The PTT page to fetch, or null when the url is not one we fetch.
export function pageTarget(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== PTT_HOST || u.port || u.username || u.password) return null;
  if (!u.pathname.startsWith('/bbs/')) return null;
  u.hash = '';
  return u;
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function reply(status, body, origin, extra) {
  const headers = Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
                                origin ? cors(origin) : {}, extra || {});
  return new Response(body, { status, headers });
}

// fetchImpl is the global fetch; tests pass a fake one.
export async function handlePage(request, env, fetchImpl) {
  const origin = request.headers.get('Origin') || '';
  if (!allowedOrigins(env).includes(origin)) return reply(403, 'Origin not allowed\n');
  if (request.method === 'OPTIONS') return reply(204, null, origin);
  if (request.method !== 'GET') return reply(405, 'GET only\n', origin);

  const target = pageTarget(new URL(request.url).searchParams.get('url') || '');
  if (!target) return reply(403, 'Only www.ptt.cc/bbs/ pages\n', origin);

  if (env.PAGE_LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.PAGE_LIMITER.limit({ key: ip });
    if (!success) return reply(429, 'Too many requests, try again later\n', origin);
  }

  let res;
  try {
    res = await (fetchImpl || fetch)(target.href, {
      headers: { 'Cookie': 'over18=1', 'User-Agent': 'Mozilla/5.0 (compatible; JJptt relay)' },
      redirect: 'follow',
    });
  } catch (e) {
    return reply(502, 'PTT did not answer\n', origin);
  }
  const final = pageTarget(res.url || target.href);
  if (/\/ask\/over18/.test(res.url || '')) return reply(451, 'PTT asks for over18\n', origin);
  if (!final) return reply(502, 'PTT redirected elsewhere\n', origin);
  if (res.status === 404) return reply(404, 'Not on the web\n', origin);
  if (!res.ok) return reply(502, 'PTT answered ' + res.status + '\n', origin);

  const body = await res.text();
  if (body.length > MAX_BYTES) return reply(502, 'Page too large\n', origin);
  return reply(200, body, origin, { 'Content-Type': 'text/html; charset=utf-8' });
}
