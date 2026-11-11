// JJptt relay: bridges a browser WebSocket to a TCP connection to PTT.
// The browser runs telnet/SSH itself; this worker only forwards bytes.
import { connect } from 'cloudflare:sockets';

const ALLOWED_HOSTS = new Set(['ptt.cc', 'ptt2.cc']);
const ALLOWED_PORTS = new Set([22, 23, 443, 3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010]);

export default {
  async fetch(request, env) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('JJptt relay is running.\n', { status: 200 });
    }

    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
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

    server.addEventListener('message', (event) => {
      const data = typeof event.data === 'string'
        ? new TextEncoder().encode(event.data)
        : new Uint8Array(event.data);
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
