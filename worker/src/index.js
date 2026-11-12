// JJptt relay: bridges a browser WebSocket to a TCP connection to PTT.
// The browser runs telnet/SSH itself; this worker only forwards bytes.
// It also fetches PTT web pages for the web version's article view
// (/page, see page.js).
import { connect } from 'cloudflare:sockets';
import { PAGE_PATH, handlePage, allowedOrigins as pageOrigins } from './page.js';

const ALLOWED_HOSTS = new Set(['ptt.cc', 'ptt2.cc']);
const ALLOWED_PORTS = new Set([22, 23, 443, 3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010]);

// Upload budget per connection (browser -> PTT). Typing and pasting a long
// post fit easily; sustained floods get the connection closed.
const UPLOAD_BYTES_PER_SEC = 16 * 1024;
const UPLOAD_BURST_BYTES = 256 * 1024;

function createUploadBudget() {
  let tokens = UPLOAD_BURST_BYTES;
  let last = Date.now();
  return (bytes) => {
    const now = Date.now();
    tokens = Math.min(UPLOAD_BURST_BYTES, tokens + ((now - last) / 1000) * UPLOAD_BYTES_PER_SEC);
    last = now;
    tokens -= bytes;
    return tokens >= 0;
  };
}

export default {
  async fetch(request, env) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      if (new URL(request.url).pathname === PAGE_PATH) return handlePage(request, env);
      return new Response('JJptt relay is running.\n', { status: 200 });
    }

    const allowedOrigins = pageOrigins(env);
    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigins.includes(origin)) {
      return new Response('Origin not allowed', { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const host = params.get('host') || 'ptt.cc';
    const port = parseInt(params.get('port') || '22', 10);
    if (!ALLOWED_HOSTS.has(host) || !ALLOWED_PORTS.has(port)) {
      return new Response('Target not allowed', { status: 403 });
    }

    if (env.CONNECT_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.CONNECT_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response('Too many connections, try again later', { status: 429 });
      }
    }

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();

    let socket;
    try {
      socket = connect({ hostname: host, port });
    } catch (e) {
      server.close(1011, 'connect failed');
      return new Response(null, { status: 101, webSocket: client });
    }

    const writer = socket.writable.getWriter();
    let closed = false;
    const closeAll = (code, reason) => {
      if (closed) return;
      closed = true;
      try { server.close(code, reason); } catch (e) {}
      try { socket.close(); } catch (e) {}
    };

    const withinBudget = createUploadBudget();
    server.addEventListener('message', (event) => {
      const data = typeof event.data === 'string'
        ? new TextEncoder().encode(event.data)
        : new Uint8Array(event.data);
      if (!withinBudget(data.byteLength)) {
        closeAll(1008, 'upload rate exceeded');
        return;
      }
      writer.write(data).catch(() => closeAll(1011, 'write failed'));
    });
    server.addEventListener('close', () => closeAll(1000, 'client closed'));
    server.addEventListener('error', () => closeAll(1011, 'client error'));

    socket.readable
      .pipeTo(new WritableStream({
        write(chunk) { server.send(chunk); },
      }))
      .then(() => closeAll(1000, 'server closed'))
      .catch(() => closeAll(1011, 'server error'));

    return new Response(null, { status: 101, webSocket: client });
  },
};
