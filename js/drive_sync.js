// JJptt Google Drive sync: keeps the settings (blacklist, watchlist, title
// keywords, display options...) in a private file in the user's Drive
// "app data" folder, which only JJptt can see. Login passwords are never
// synced.
//
// Setup: create an OAuth client (type "Web application") in Google Cloud and
// put its client ID below. See README for the exact steps.
function DriveSync(app) {
  this.app = app;
  this.pushTimer = null;
  this.applying = false;
  this.busy = false;
  this.gisLoading = null;
  this.tokenClient = null;
}

DriveSync.CLIENT_ID = '673188871469-hk89m262pm6cqfv8bgra7jiuuhnqbtfj.apps.googleusercontent.com';
DriveSync.SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
DriveSync.FILE_NAME = 'jjptt-settings.json';
DriveSync.KEY_ENABLED = 'jjptt.drive.enabled';
DriveSync.KEY_TOKEN = 'jjptt.drive.token';
DriveSync.KEY_UPDATED = 'jjptt.drive.localUpdatedAt';
DriveSync.KEY_ACCOUNT = 'jjptt.drive.account';
DriveSync.PUSH_DELAY = 1500;

DriveSync.prototype.clientId = function() {
  return DriveSync.CLIENT_ID;
};

DriveSync.prototype.isConfigured = function() {
  return !!this.clientId();
};

DriveSync.prototype.isEnabled = function() {
  return lib.safeGetItem(DriveSync.KEY_ENABLED) === '1';
};

DriveSync.prototype.localUpdatedAt = function() {
  return parseInt(lib.safeGetItem(DriveSync.KEY_UPDATED) || '0', 10) || 0;
};

DriveSync.prototype.setLocalUpdatedAt = function(t) {
  lib.safeSetItem(DriveSync.KEY_UPDATED, String(t));
};

DriveSync.prototype.setStatus = function(key, extra) {
  var text = i18n(key) || key;
  if (extra) text += ' ' + extra;
  $('#drive_status').text(text);
};

DriveSync.prototype.refreshUi = function() {
  var configured = this.isConfigured();
  var enabled = this.isEnabled();
  $('#drive_connect').toggle(configured && !enabled);
  $('#drive_syncNow').toggle(configured && enabled);
  $('#drive_disconnect').toggle(configured && enabled);
  this.showAccount();
  if (!configured) {
    this.setStatus('drive_status_notConfigured');
  } else if (!enabled) {
    this.setStatus('drive_status_off');
  }
};

DriveSync.prototype.setupUi = function() {
  var self = this;
  $('#drive_title').text(i18n('drive_title'));
  $('#drive_connect').text(i18n('drive_connect')).off().click(function() { self.connect(); });
  $('#drive_syncNow').text(i18n('drive_syncNow')).off().click(function() { self.syncNow(); });
  $('#drive_disconnect').text(i18n('drive_disconnect')).off().click(function() { self.disconnect(); });
  this.refreshUi();
};

// ---- linked account -------------------------------------------------------

DriveSync.prototype.account = function() {
  try {
    return JSON.parse(lib.safeGetItem(DriveSync.KEY_ACCOUNT) || 'null');
  } catch (e) {
    return null;
  }
};

// "已連結的 Google 帳號：王小明（someone@gmail.com）" under the description.
DriveSync.prototype.showAccount = function() {
  var a = this.isEnabled() ? this.account() : null;
  var label = '';
  if (a && (a.name || a.email)) {
    label = a.name && a.email ? a.name + '（' + a.email + '）' : (a.name || a.email);
  }
  $('#drive_account').text(label ? (i18n('drive_account') || '') + label : '')
    .css('display', label ? 'block' : 'none');
};

// Asks Drive who the token belongs to (works with the drive.appdata scope).
DriveSync.prototype.fetchAccount = function(token) {
  var self = this;
  return this.api(token, 'GET',
    'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)'
  ).then(function(data) {
    var u = (data && data.user) || {};
    lib.safeSetItem(DriveSync.KEY_ACCOUNT, JSON.stringify({
      name: u.displayName || '', email: u.emailAddress || ''
    }));
    self.showAccount();
  }).catch(function(e) {
    console.log('drive account lookup failed', e);
  });
};

// ---- tokens -------------------------------------------------------------

DriveSync.prototype.cachedToken = function() {
  try {
    var t = JSON.parse(lib.safeGetItem(DriveSync.KEY_TOKEN) || 'null');
    if (t && t.token && t.expires > Date.now() + 60000) return t.token;
  } catch (e) {
  }
  return null;
};

DriveSync.prototype.storeToken = function(token, expiresIn) {
  lib.safeSetItem(DriveSync.KEY_TOKEN, JSON.stringify({
    token: token,
    expires: Date.now() + (parseInt(expiresIn, 10) || 3600) * 1000
  }));
};

DriveSync.prototype.clearToken = function() {
  try {
    window.localStorage.removeItem(DriveSync.KEY_TOKEN);
  } catch (e) {
  }
};

// Resolves with an access token, or null when one cannot be had without
// user interaction (interactive=false).
DriveSync.prototype.getToken = function(interactive) {
  var cached = this.cachedToken();
  if (cached) return Promise.resolve(cached);
  if (!this.isConfigured()) return Promise.resolve(null);
  if (lib.isExtension() && chrome.identity && chrome.identity.launchWebAuthFlow) {
    return this.getTokenFromExtension(interactive);
  }
  if (!interactive) return Promise.resolve(null);
  return this.getTokenFromGis();
};

DriveSync.prototype.getTokenFromExtension = function(interactive) {
  var self = this;
  var url = 'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=' + encodeURIComponent(this.clientId()) +
    '&response_type=token' +
    '&redirect_uri=' + encodeURIComponent(chrome.identity.getRedirectURL()) +
    '&scope=' + encodeURIComponent(DriveSync.SCOPE) +
    (interactive ? '' : '&prompt=none');
  return new Promise(function(resolve) {
    chrome.identity.launchWebAuthFlow({ url: url, interactive: !!interactive }, function(redirect) {
      if (chrome.runtime.lastError || !redirect) {
        resolve(null);
        return;
      }
      var params = new URLSearchParams(redirect.split('#')[1] || '');
      var token = params.get('access_token');
      if (token) self.storeToken(token, params.get('expires_in'));
      resolve(token || null);
    });
  });
};

DriveSync.prototype.loadGis = function() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  if (this.gisLoading) return this.gisLoading;
  this.gisLoading = new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = function() { resolve(); };
    s.onerror = function() { reject(new Error('cannot load Google sign-in')); };
    document.head.appendChild(s);
  });
  return this.gisLoading;
};

DriveSync.prototype.getTokenFromGis = function() {
  var self = this;
  return this.loadGis().then(function() {
    return new Promise(function(resolve) {
      var client = google.accounts.oauth2.initTokenClient({
        client_id: self.clientId(),
        scope: DriveSync.SCOPE,
        callback: function(res) {
          if (res && res.access_token) {
            self.storeToken(res.access_token, res.expires_in);
            resolve(res.access_token);
          } else {
            resolve(null);
          }
        },
        error_callback: function() { resolve(null); }
      });
      client.requestAccessToken({ prompt: self.isEnabled() ? '' : 'consent' });
    });
  }).catch(function(e) {
    console.log('drive sign-in failed', e);
    return null;
  });
};

// ---- Drive API ----------------------------------------------------------

DriveSync.prototype.api = function(token, method, url, body, contentType) {
  var self = this;
  var headers = { 'Authorization': 'Bearer ' + token };
  if (contentType) headers['Content-Type'] = contentType;
  return fetch(url, { method: method, headers: headers, body: body }).then(function(res) {
    if (res.status === 401) {
      self.clearToken();
      throw new Error('unauthorized');
    }
    if (!res.ok) throw new Error('drive ' + res.status);
    return res.status === 204 ? null : res.json();
  });
};

DriveSync.prototype.findFile = function(token) {
  var q = encodeURIComponent("name='" + DriveSync.FILE_NAME + "'");
  return this.api(token, 'GET',
    'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,modifiedTime)&q=' + q
  ).then(function(data) {
    return (data.files && data.files[0]) || null;
  });
};

DriveSync.prototype.download = function(token, fileId) {
  return this.api(token, 'GET',
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media');
};

DriveSync.prototype.upload = function(token, fileId, content) {
  var json = JSON.stringify(content);
  if (fileId) {
    return this.api(token, 'PATCH',
      'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media',
      json, 'application/json');
  }
  var boundary = 'jjptt' + Date.now();
  var meta = JSON.stringify({ name: DriveSync.FILE_NAME, parents: ['appDataFolder'] });
  var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
    '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + json +
    '\r\n--' + boundary + '--';
  return this.api(token, 'POST',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    body, 'multipart/related; boundary=' + boundary);
};

// ---- settings snapshot ----------------------------------------------------

DriveSync.prototype.snapshot = function() {
  var pref = this.app.pref;
  pref.setBlacklistValue();
  pref.setWatchlistValue();
  pref.setNotesValue();
  var values = {};
  for (var k in DEFAULT_PREFS) {
    if (k in pref.values) values[k] = pref.values[k];
  }
  return { app: 'jjptt', version: 1, updatedAt: this.localUpdatedAt() || Date.now(), values: values };
};

DriveSync.prototype.apply = function(remote) {
  var pref = this.app.pref;
  var values = remote.values || {};
  for (var k in values) {
    if (k in DEFAULT_PREFS) pref.values[k] = values[k];
  }
  try {
    pref.blacklistedUserIds = JSON.parse(pref.values.blacklistedUserIds || '{}');
    pref.watchlistedUserIds = JSON.parse(pref.values.watchlistedUserIds || '{}');
    pref.notedUserIds = JSON.parse(pref.values.notedUserIds || '{}');
    pref.quickSearches = JSON.parse(pref.values.quickSearchList || '[]').filter(function(q) { return !/goo\.gl/i.test(q.url); });
  } catch (e) {
    console.log('bad synced settings', e);
  }
  this.applying = true;
  try {
    pref.setStorage({ values: pref.values });
  } finally {
    this.applying = false;
  }
  pref.updateToApp();
  pref.updateSettingsToUi();
  this.app.view.redraw(true);
};

// ---- sync flow ------------------------------------------------------------

// Called whenever settings are saved locally.
DriveSync.prototype.onLocalChange = function() {
  if (this.applying) return;
  this.setLocalUpdatedAt(Date.now());
  if (!this.isEnabled()) return;
  var self = this;
  clearTimeout(this.pushTimer);
  this.pushTimer = setTimeout(function() { self.push(false); }, DriveSync.PUSH_DELAY);
};

DriveSync.prototype.push = function(interactive) {
  var self = this;
  return this.getToken(interactive).then(function(token) {
    if (!token) {
      self.setStatus('drive_status_needAuth');
      return false;
    }
    self.setStatus('drive_status_syncing');
    return self.findFile(token).then(function(file) {
      return self.upload(token, file && file.id, self.snapshot());
    }).then(function() {
      self.setStatus('drive_status_done', new Date().toLocaleTimeString());
      return true;
    });
  }).catch(function(e) {
    console.log('drive push failed', e);
    self.setStatus('drive_status_error');
    return false;
  });
};

// Downloads the Drive copy; applies it when newer, uploads ours when older.
DriveSync.prototype.sync = function(interactive) {
  var self = this;
  if (this.busy) return Promise.resolve(false);
  this.busy = true;
  return this.getToken(interactive).then(function(token) {
    if (!token) {
      self.setStatus('drive_status_needAuth');
      return false;
    }
    self.setStatus('drive_status_syncing');
    var who = self.account() ? Promise.resolve() : self.fetchAccount(token);
    return who.then(function() {
      return self.findFile(token);
    }).then(function(file) {
      if (!file) return self.upload(token, null, self.snapshot());
      return self.download(token, file.id).then(function(remote) {
        var remoteAt = (remote && remote.updatedAt) || 0;
        var localAt = self.localUpdatedAt();
        if (remote && remote.app === 'jjptt' && remoteAt > localAt) {
          self.apply(remote);
          self.setLocalUpdatedAt(remoteAt);
        } else if (localAt > remoteAt) {
          return self.upload(token, file.id, self.snapshot());
        }
      });
    }).then(function() {
      self.setStatus('drive_status_done', new Date().toLocaleTimeString());
      return true;
    });
  }).catch(function(e) {
    console.log('drive sync failed', e);
    self.setStatus('drive_status_error');
    return false;
  }).then(function(ok) {
    self.busy = false;
    return ok;
  });
};

DriveSync.prototype.startup = function() {
  this.setupUi();
  if (this.isConfigured() && this.isEnabled()) this.sync(false);
};

DriveSync.prototype.connect = function() {
  var self = this;
  this.getToken(true).then(function(token) {
    if (!token) {
      self.setStatus('drive_status_error');
      return;
    }
    lib.safeSetItem(DriveSync.KEY_ENABLED, '1');
    try {
      window.localStorage.removeItem(DriveSync.KEY_ACCOUNT);  // may be a different account now
    } catch (e) {
    }
    self.refreshUi();
    self.sync(false);
  });
};

DriveSync.prototype.syncNow = function() {
  this.sync(true);
};

DriveSync.prototype.disconnect = function() {
  var token = this.cachedToken();
  if (token) {
    fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), { method: 'POST' })
      .catch(function() {});
  }
  this.clearToken();
  try {
    window.localStorage.removeItem(DriveSync.KEY_ENABLED);
    window.localStorage.removeItem(DriveSync.KEY_ACCOUNT);
  } catch (e) {
  }
  this.refreshUi();
};
