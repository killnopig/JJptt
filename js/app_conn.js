// JJptt: the original PttChrome relied on a Chrome App (now discontinued) to
// open raw TCP sockets. This replacement keeps the same interface and picks a
// transport:
//  - inside the JJptt extension: the local native messaging host
//    (see native-host/), which connects to PTT directly;
//  - on the website: a WebSocket-to-TCP relay (see worker/).
// Storage and clipboard are handled in the page itself.

if (typeof lib != 'undefined')
  throw new Error('Global "lib" object already exists.');

var lib = {};

// Set this to your deployed relay, e.g. 'wss://jjptt-relay.xxx.workers.dev'.
// Can also be overridden with ?relay=wss://... in the page URL.
lib.DEFAULT_RELAY_URL = '';
lib.RELAY_STORAGE_KEY = 'jjptt.relayUrl';
lib.PREFS_STORAGE_KEY = 'jjptt.storage';
lib.NATIVE_HOST_NAME = 'com.jjptt.host';

lib.isExtension = function() {
  return typeof chrome !== 'undefined' && !!chrome.runtime &&
    typeof chrome.runtime.connectNative === 'function';
};

// Android app (mobile/): connects to PTT itself through the PttSocket plugin
// and reads www.ptt.cc directly (CapacitorHttp), like the extension does.
lib.isApp = function() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
};

// Can this page read www.ptt.cc pages itself (extension or app)?
lib.canReadPttWeb = function() {
  return lib.isExtension() || lib.isApp();
};

// The app's PttSocket plugin dressed up as the extension's native-messaging
// port (onMessage / onDisconnect / postMessage / disconnect), so connectNative
// works the same for both.
lib.openAppPort = function() {
  var C = window.Capacitor;
  var plugin = (C.Plugins && C.Plugins.PttSocket) || C.registerPlugin('PttSocket');
  var onMsg = [], onDisc = [], handles = [], done = false;
  var fire = function(list, arg) { list.slice().forEach(function(f) { f(arg); }); };
  var drop = function() {
    handles.forEach(function(h) { try { h.remove(); } catch (e) {} });
    handles = [];
  };
  var end = function() {
    if (done) return;
    done = true;
    drop();
    fire(onDisc);
  };
  var listen = function(name, fn) {
    return Promise.resolve(plugin.addListener(name, function(d) { if (!done) fn(d || {}); })).then(function(h) {
      if (done) h.remove(); else handles.push(h);
    });
  };
  var ready = Promise.all([
    listen('connected', function() { fire(onMsg, { type: 'connected' }); }),
    listen('data', function(d) { fire(onMsg, { type: 'data', data: d.data }); }),
    listen('error', function(d) { fire(onMsg, { type: 'error', message: d.message }); }),
    listen('closed', end)
  ]);
  return {
    onMessage: { addListener: function(f) { onMsg.push(f); } },
    onDisconnect: { addListener: function(f) { onDisc.push(f); } },
    postMessage: function(m) {
      if (done) return;
      if (m.type === 'connect') {
        ready.then(function() { return plugin.connect({ host: m.host, port: m.port }); }).catch(function(e) {
          fire(onMsg, { type: 'error', message: String((e && e.message) || e) });
          end();
        });
      } else if (m.type === 'send') {
        plugin.send({ data: m.data }).catch(function() {});
      }
    },
    disconnect: function() {  // closed on purpose: no onDisconnect, like chrome
      if (done) return;
      done = true;
      drop();
      plugin.close().catch(function() {});
    }
  };
};

lib.normalizeRelayUrl = function(url) {
  return url.trim().replace(/^https:\/\//, 'wss://').replace(/\/+$/, '');
};

lib.getRelayUrl = function() {
  var fromQuery = getQueryVariable('relay');
  if (fromQuery) {
    fromQuery = lib.normalizeRelayUrl(decodeURIComponent(fromQuery));
    lib.safeSetItem(lib.RELAY_STORAGE_KEY, fromQuery);
    return fromQuery;
  }
  var stored = lib.safeGetItem(lib.RELAY_STORAGE_KEY);
  if (stored) {
    return stored;
  }
  if (lib.DEFAULT_RELAY_URL) {
    return lib.DEFAULT_RELAY_URL;
  }
  var entered = window.prompt('請輸入 JJptt 轉接站網址（例如 wss://jjptt-relay.xxx.workers.dev）');
  if (entered) {
    entered = lib.normalizeRelayUrl(entered);
    lib.safeSetItem(lib.RELAY_STORAGE_KEY, entered);
    return entered;
  }
  return '';
};

lib.safeGetItem = function(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
};

lib.safeSetItem = function(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
  }
};

lib.binaryStringToBytes = function(str) {
  var bytes = new Uint8Array(str.length);
  for (var i = 0; i < str.length; ++i) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
};

lib.bytesToBinaryString = function(bytes) {
  var out = '';
  var chunk = 8192;
  for (var i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return out;
};

lib.AppConnection = function(spec) {
  // Callback functions.
  this.callbacks = {
    connect: spec.onConnect,        // Called when socket is connected.
    disconnect: spec.onDisconnect,  // Called when socket is disconnected.
    recv: spec.onReceive,           // Called when client receives data from server.
    sent: spec.onSent,              // Called when client sends data to server.
    paste: spec.onPasteDone,
    storage: spec.onStorageDone,
    font: spec.onSymFont
  };

  this.isConnected = false;
  this.socket = null;
  this.nativePort = null;
  this.pending = [];
  // Other code calls appPort.postMessage(...) for storage, clipboard, etc.
  var self = this;
  this.appPort = {
    postMessage: function(msg) { self.handleMessage(msg); }
  };
};

lib.AppConnection.prototype.connect = function(callback) {
  this.isConnected = true;
  setTimeout(callback, 0);
};

lib.AppConnection.prototype.handleMessage = function(msg) {
  var self = this;
  switch (msg.action) {
    case 'storage':
      this.handleStorage(msg);
      break;
    case 'copy':
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg.data).catch(function(e) {
          console.log('copy failed', e);
        });
      }
      break;
    case 'paste':
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function(text) {
          if (text && self.callbacks.paste) {
            self.callbacks.paste(text);
          }
        }).catch(function(e) {
          console.log('paste failed', e);
        });
      }
      break;
    case 'newWindow':
      window.open(window.location.pathname, '_blank');
      break;
    default:
      // getSymFont etc. are not available without the Chrome App.
      break;
  }
};

lib.AppConnection.prototype.loadStoredItems = function() {
  var raw = lib.safeGetItem(lib.PREFS_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
};

// Android app: the saved PTT password goes to the SecureStore plugin
// (encrypted with a key in Android's Keystore); localStorage keeps p: ''.
// null outside the app (the extension / web page keep it as before).
lib.SECURE_PASS_KEY = 'pttPass';
lib.secureStore = function() {
  var C = window.Capacitor;
  var p = lib.isApp() && C.Plugins && C.Plugins.SecureStore;
  return p && typeof p.get === 'function' ? p : null;
};

lib.AppConnection.prototype.handleStorage = function(msg) {
  var stored = this.loadStoredItems();
  var secure = lib.secureStore();
  var self = this;
  // one after another, so a 登出 right after a login ends up removed
  var queue = function(fn) {
    self.secureQueue = (self.secureQueue || Promise.resolve()).then(fn, fn);
    return self.secureQueue;
  };
  if (msg.type === 'get' && secure && !('pass' in msg)) {
    var plain = stored.logins && stored.logins.p;
    queue(function() {
      if (plain) {
        // from before: move it into the SecureStore, then off localStorage
        return secure.set({ key: lib.SECURE_PASS_KEY, value: plain }).then(function() {
          var now = self.loadStoredItems();
          if (now.logins && now.logins.p === plain) {
            now.logins.p = '';
            lib.safeSetItem(lib.PREFS_STORAGE_KEY, JSON.stringify(now));
          }
          return plain;
        }, function() { return plain; });
      }
      return secure.get({ key: lib.SECURE_PASS_KEY }).then(function(r) {
        return (r && r.value) || '';
      }, function() { return ''; });
    }).then(function(pass) {
      self.handleStorage({ type: 'get', defaults: msg.defaults, pass: pass });
    });
    return;
  }
  if (msg.type === 'set' && secure && msg.data && msg.data.logins && 'p' in msg.data.logins) {
    var pass = msg.data.logins.p || '';
    queue(function() {
      return pass ? secure.set({ key: lib.SECURE_PASS_KEY, value: pass })
                  : secure.remove({ key: lib.SECURE_PASS_KEY });
    });
    var copy = {};
    for (var g in msg.data) copy[g] = msg.data[g];
    copy.logins = { u: msg.data.logins.u, p: '' };
    if (!('u' in msg.data.logins)) delete copy.logins.u;
    msg = { type: 'set', data: copy };
  }
  if (msg.type === 'get') {
    var result = {};
    var defaults = msg.defaults || {};
    for (var key in defaults) {
      var merged = {};
      var def = defaults[key] || {};
      var saved = stored[key] || {};
      for (var k in def) merged[k] = def[k];
      for (var s in saved) merged[s] = saved[s];
      result[key] = merged;
    }
    if ('pass' in msg && result.logins) result.logins.p = msg.pass;
    if (this.callbacks.storage) {
      this.callbacks.storage({ action: 'onStorageDone', data: result });
    }
  } else if (msg.type === 'set') {
    var data = msg.data || {};
    for (var group in data) {
      stored[group] = stored[group] || {};
      for (var name in data[group]) {
        stored[group][name] = data[group][name];
      }
    }
    lib.safeSetItem(lib.PREFS_STORAGE_KEY, JSON.stringify(stored));
  } else if (msg.type === 'clear') {
    try {
      window.localStorage.removeItem(lib.PREFS_STORAGE_KEY);
    } catch (e) {
    }
  }
};

lib.AppConnection.prototype.connectTcp = function(host, port, keepAlive) {
  if (!this.isConnected) {
    return;
  }
  this.closeSocket();

  if (lib.isExtension() || lib.isApp()) {
    this.connectNative(host, port);
    return;
  }

  var self = this;
  var relay = lib.getRelayUrl();
  if (!relay) {
    setTimeout(function() {
      if (self.callbacks.disconnect) self.callbacks.disconnect();
    }, 0);
    return;
  }

  var url = relay + (relay.indexOf('?') < 0 ? '?' : '&') +
    'host=' + encodeURIComponent(host) + '&port=' + encodeURIComponent(port);

  var socket;
  try {
    socket = new WebSocket(url);
  } catch (e) {
    console.log('relay connect failed', e);
    setTimeout(function() {
      if (self.callbacks.disconnect) self.callbacks.disconnect();
    }, 0);
    return;
  }
  socket.binaryType = 'arraybuffer';
  this.socket = socket;
  this.pending = [];

  socket.onopen = function() {
    if (self.socket !== socket) return;
    var queued = self.pending;
    self.pending = [];
    for (var i = 0; i < queued.length; ++i) {
      socket.send(queued[i]);
    }
    if (self.callbacks.connect) self.callbacks.connect();
  };
  socket.onmessage = function(e) {
    if (self.socket !== socket) return;
    var str = (typeof e.data === 'string') ? e.data :
      lib.bytesToBinaryString(new Uint8Array(e.data));
    if (self.callbacks.recv) self.callbacks.recv(str);
  };
  socket.onclose = function() {
    if (self.socket !== socket) return;  // closed on purpose
    self.socket = null;
    if (self.callbacks.disconnect) self.callbacks.disconnect();
  };
};

lib.AppConnection.prototype.connectNative = function(host, port) {
  var self = this;
  var nativePort;
  try {
    nativePort = lib.isApp() ? lib.openAppPort() : chrome.runtime.connectNative(lib.NATIVE_HOST_NAME);
  } catch (e) {
    console.log('native host connect failed', e);
    setTimeout(function() {
      if (self.callbacks.disconnect) self.callbacks.disconnect();
    }, 0);
    return;
  }
  this.nativePort = nativePort;
  var opened = false;
  var hostError = '';

  nativePort.onMessage.addListener(function(msg) {
    if (self.nativePort !== nativePort) return;
    switch (msg.type) {
      case 'connected':
        opened = true;
        if (self.callbacks.connect) self.callbacks.connect();
        break;
      case 'data':
        if (self.callbacks.recv) self.callbacks.recv(atob(msg.data));
        break;
      case 'error':
        hostError = msg.message || '';
        console.log('native host error', hostError);
        break;
      default:
        break;
    }
  });
  nativePort.onDisconnect.addListener(function() {
    var err = window.chrome && chrome.runtime && chrome.runtime.lastError;
    if (self.nativePort !== nativePort) return;  // closed on purpose
    self.nativePort = null;
    if (!opened && !hostError && !lib.isApp()) {
      console.log('native host unavailable', err && err.message);
      lib.showNativeHostMissing();
    }
    if (self.callbacks.disconnect) self.callbacks.disconnect();
  });

  nativePort.postMessage({ type: 'connect', host: host, port: port });
};

lib.showNativeHostMissing = function() {
  if (lib.nativeHostWarned) return;
  lib.nativeHostWarned = true;
  window.alert('找不到 JJptt 本機程式。\n\n' +
    '請先執行 native-host 資料夾裡的安裝腳本（Mac/Linux：install.sh，Windows：install.bat），' +
    '然後完全關閉並重新打開瀏覽器。');
};

lib.AppConnection.prototype.sendTcp = function(str) {
  if (!this.isConnected) {
    return;
  }
  if (this.nativePort) {
    // because ptt seems to respond slowly after a large chunk of text is
    // pasted, split it up like the original Chrome App did.
    var chunk = 1000;
    for (var i = 0; i < str.length; i += chunk) {
      this.nativePort.postMessage({ type: 'send', data: btoa(str.substring(i, i + chunk)) });
    }
    return;
  }
  if (!this.socket) {
    return;
  }
  var bytes = lib.binaryStringToBytes(str);
  if (this.socket.readyState === WebSocket.OPEN) {
    this.socket.send(bytes);
  } else if (this.socket.readyState === WebSocket.CONNECTING) {
    this.pending.push(bytes);
  }
};

lib.AppConnection.prototype.closeSocket = function() {
  var nativePort = this.nativePort;
  this.nativePort = null;
  if (nativePort) {
    try {
      nativePort.disconnect();
    } catch (e) {
    }
  }
  var socket = this.socket;
  this.socket = null;
  this.pending = [];
  if (socket) {
    try {
      socket.close();
    } catch (e) {
    }
  }
};

lib.AppConnection.prototype.disconnect = function() {
  if (!this.isConnected) {
    return;
  }
  this.closeSocket();
  this.isConnected = false;
};
