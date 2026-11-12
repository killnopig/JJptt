package com.jjptt.app;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * JJptt's direct connection to PTT on Android: the app's counterpart of the
 * desktop native host (native-host/main.go). The page runs telnet/SSH itself
 * and this only moves bytes, so nothing goes through a relay.
 *
 * Same rules as the native host: only ptt.cc / ptt2.cc, only ports 22, 23,
 * 443 and 3000-3010.
 *
 * JS: connect({host, port}), send({data: base64}), close();
 * events "connected", "data" {data: base64}, "error" {message}, "closed".
 */
@CapacitorPlugin(name = "PttSocket")
public class PttSocketPlugin extends Plugin {

    private final Object lock = new Object();
    private final ExecutorService writer = Executors.newSingleThreadExecutor();
    private Socket socket;
    private OutputStream out;
    // bumped on every connect / close; volatile: the read loop checks it
    // without the lock and must see a close() at once
    private volatile int generation = 0;

    static boolean allowedTarget(String host, int port) {
        boolean hostOk = "ptt.cc".equals(host) || "ptt2.cc".equals(host);
        boolean portOk = port == 22 || port == 23 || port == 443 || (port >= 3000 && port <= 3010);
        return hostOk && portOk;
    }

    @PluginMethod
    public void connect(PluginCall call) {
        final String host = call.getString("host", "ptt.cc");
        final int port = call.getInt("port", 22);
        if (!allowedTarget(host, port)) {
            call.reject("target not allowed");
            return;
        }
        final int mine;
        synchronized (lock) {
            closeLocked();
            mine = ++generation;
        }
        call.resolve();
        new Thread(() -> run(host, port, mine), "ptt-socket").start();
    }

    private void run(String host, int port, int mine) {
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), 15000);
            s.setTcpNoDelay(true);
            s.setKeepAlive(true);
            synchronized (lock) {
                if (mine != generation) {
                    s.close();
                    return;
                }
                socket = s;
                out = s.getOutputStream();
            }
            notifyListeners("connected", new JSObject());
            InputStream in = s.getInputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) {
                if (mine != generation) return;
                JSObject d = new JSObject();
                d.put("data", Base64.encodeToString(buf, 0, n, Base64.NO_WRAP));
                notifyListeners("data", d);
            }
        } catch (IOException e) {
            if (mine == generation) {
                JSObject d = new JSObject();
                d.put("message", String.valueOf(e.getMessage()));
                notifyListeners("error", d);
            }
        } finally {
            boolean current;
            synchronized (lock) {
                current = mine == generation;
                if (current) closeLocked();
            }
            try { s.close(); } catch (IOException ignored) { }
            if (current) notifyListeners("closed", new JSObject());
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        final byte[] bytes;
        try {
            bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("bad data");
            return;
        }
        final OutputStream o;
        synchronized (lock) {
            o = out;
        }
        if (o == null) {
            call.reject("not connected");
            return;
        }
        // one writer thread keeps the order of what was typed
        writer.execute(() -> {
            try {
                o.write(bytes);
                o.flush();
            } catch (IOException ignored) {
                // the read loop sees the broken connection and reports it
            }
        });
        call.resolve();
    }

    @PluginMethod
    public void close(PluginCall call) {
        synchronized (lock) {
            generation++;
            closeLocked();
        }
        call.resolve();
    }

    private void closeLocked() {
        if (socket != null) {
            try { socket.close(); } catch (IOException ignored) { }
        }
        socket = null;
        out = null;
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (lock) {
            generation++;
            closeLocked();
        }
        writer.shutdownNow();
    }
}
