// JJptt update check (extension version).
//
// The extension runs unpacked from the user's git checkout, so updating is
// "git pull" + reloading the extension. This checks two things:
//  - GitHub: is there a newer version than the files on disk? Then say so
//    and point to the update script (update-jjptt.command / .bat).
//  - Disk: are the files on disk newer than the running code (the script or
//    git pull already ran)? Then offer one button that reloads the
//    extension; background.js reopens JJptt afterwards.
function JJUpdater(app) {
  this.app = app;
  this.remoteVersion = '';
  this.diskVersion = '';
  this.status = '';
  this.pollTimer = null;
}

JJUpdater.REMOTE_MANIFEST = 'https://raw.githubusercontent.com/killnopig/JJptt/gh-pages/extension/manifest.json';
JJUpdater.CHECK_EVERY = 6 * 3600 * 1000;

JJUpdater.compare = function(a, b) {
  var pa = String(a || '0').split('.'), pb = String(b || '0').split('.');
  for (var i = 0; i < Math.max(pa.length, pb.length); ++i) {
    var x = parseInt(pa[i] || '0', 10), y = parseInt(pb[i] || '0', 10);
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
};

JJUpdater.prototype.available = function() {
  return !!(window.chrome && chrome.runtime && chrome.runtime.getURL && chrome.runtime.reload);
};

JJUpdater.prototype.running = function() {
  return typeof JJPTT_VERSION !== 'undefined' ? JJPTT_VERSION : '0';
};

JJUpdater.prototype.fetchVersion = function(url) {
  return fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), { cache: 'no-store', credentials: 'omit' })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(j) { return (j && j.version) || ''; })
    .catch(function() { return ''; });
};

JJUpdater.prototype.start = function() {
  if (!this.available()) return;
  var self = this;
  this.check(false);
  setInterval(function() { self.check(false); }, JJUpdater.CHECK_EVERY);
};

// manual = from the settings button: also report "already up to date"
JJUpdater.prototype.check = function(manual) {
  var self = this;
  if (!this.available()) return Promise.resolve();
  this.setStatus(i18n('update_checking'));
  return Promise.all([
    this.fetchVersion(chrome.runtime.getURL('manifest.json')),
    this.fetchVersion(JJUpdater.REMOTE_MANIFEST)
  ]).then(function(v) {
    self.diskVersion = v[0];
    self.remoteVersion = v[1];
    self.refresh(manual);
  });
};

JJUpdater.prototype.refresh = function(manual) {
  var running = this.running();
  var disk = this.diskVersion || running;
  var remote = this.remoteVersion;
  if (JJUpdater.compare(disk, running) > 0) {
    // already downloaded: only the reload is missing
    this.stopPolling();
    this.setStatus(i18n('update_downloaded').replace('%s', disk));
    this.showBar(i18n('update_downloaded').replace('%s', disk), i18n('update_apply'));
  } else if (remote && JJUpdater.compare(remote, disk) > 0) {
    this.setStatus(i18n('update_available').replace('%s', remote));
    this.showBar(i18n('update_available').replace('%s', remote), i18n('update_now'), 'now');
    this.startPolling();
  } else {
    this.hideBar();
    this.setStatus(remote ? i18n('update_latest').replace('%s', running) : i18n('update_failed'));
    if (manual) this.app.showToast(remote ? i18n('update_latest').replace('%s', running) : i18n('update_failed'), 3000);
  }
};

// After pointing to the script: watch the files on disk so the "apply"
// button appears by itself once the download is done.
JJUpdater.prototype.startPolling = function() {
  var self = this;
  if (this.pollTimer) return;
  this.pollTimer = setInterval(function() {
    self.fetchVersion(chrome.runtime.getURL('manifest.json')).then(function(v) {
      if (v && JJUpdater.compare(v, self.running()) > 0) {
        self.diskVersion = v;
        self.refresh(false);
      }
    });
  }, 5000);
};

JJUpdater.prototype.stopPolling = function() {
  clearInterval(this.pollTimer);
  this.pollTimer = null;
};

// Reloading closes this tab; background.js opens JJptt again.
JJUpdater.prototype.apply = function() {
  chrome.runtime.reload();
};

// One button: the JJptt native host (1.1.0+) runs "git pull" in the jjptt
// folder, then the extension reloads itself.
JJUpdater.HOST = 'com.jjptt.host';

JJUpdater.prototype.native = function(msg) {
  return new Promise(function(resolve) {
    if (!(chrome.runtime && chrome.runtime.sendNativeMessage)) {
      resolve(null);
      return;
    }
    chrome.runtime.sendNativeMessage(JJUpdater.HOST, msg, function(res) {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(res || null);
    });
  });
};

JJUpdater.prototype.updateNow = function() {
  var self = this;
  if (this.updating) return;
  this.updating = true;
  this.showBar(i18n('update_running'), '');
  this.setStatus(i18n('update_running'));
  this.native({ type: 'ping' }).then(function(pong) {
    if (!pong || JJUpdater.compare(pong.version, '1.1.0') < 0) {
      throw new Error(i18n('update_needHost'));
    }
    return self.native({ type: 'update' });
  }).then(function(res) {
    if (!res) throw new Error(i18n('update_failedRun'));
    if (res.type !== 'updated') throw new Error(res.message || i18n('update_failedRun'));
    return self.fetchVersion(chrome.runtime.getURL('manifest.json'));
  }).then(function(disk) {
    self.updating = false;
    if (disk && JJUpdater.compare(disk, self.running()) > 0) {
      self.setStatus(i18n('update_restarting'));
      self.showBar(i18n('update_restarting'), '');
      setTimeout(function() { self.apply(); }, 800);
    } else {
      self.check(true);
    }
  }).catch(function(err) {
    self.updating = false;
    var text = String(err && err.message || err).trim();
    self.setStatus(text);
    self.showBar(text + ' ' + i18n('update_howto'), '');
    self.startPolling();
  });
};

JJUpdater.prototype.setStatus = function(text) {
  this.status = text;
  $('#update_status').text(text);
};

JJUpdater.prototype.showBar = function(text, buttonText, action) {
  var self = this;
  var bar = document.getElementById('jjUpdateBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'jjUpdateBar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = '';
  var span = document.createElement('span');
  span.textContent = text;
  bar.appendChild(span);
  if (buttonText) {
    var btn = document.createElement('button');
    btn.textContent = buttonText;
    btn.addEventListener('click', function() {
      if (action === 'now') self.updateNow();
      else self.apply();
    });
    bar.appendChild(btn);
  }
  var close = document.createElement('button');
  close.className = 'jj-close';
  close.textContent = '×';
  close.title = i18n('update_later');
  close.addEventListener('click', function() { self.hideBar(); });
  bar.appendChild(close);
  bar.style.display = 'flex';
};

JJUpdater.prototype.hideBar = function() {
  var bar = document.getElementById('jjUpdateBar');
  if (bar) bar.style.display = 'none';
};

// ---- settings export / import ---------------------------------------------

JJUpdater.prototype.exportSettings = function() {
  var data = this.app.driveSync.snapshot();
  data.kind = 'settings-export';
  data.exportedAt = new Date().toISOString();
  data.jjpttVersion = this.running();
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  var d = new Date();
  var pad = function(n) { return (n < 10 ? '0' : '') + n; };
  a.href = URL.createObjectURL(blob);
  a.download = 'jjptt-settings-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    URL.revokeObjectURL(a.href);
    a.parentNode.removeChild(a);
  }, 1000);
};

JJUpdater.prototype.importSettings = function(file) {
  var self = this;
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function() {
    var data = null;
    try { data = JSON.parse(reader.result); } catch (e) {}
    if (!data || data.app !== 'jjptt' || !data.values || typeof data.values !== 'object') {
      self.app.showToast(i18n('backup_badFile'), 4000);
      return;
    }
    if (!window.confirm(i18n('backup_confirm'))) return;
    self.app.driveSync.apply(data);
    self.app.pref.notifySync();  // let Google Drive pick up the imported settings
    self.app.showToast(i18n('backup_imported'), 3000);
  };
  reader.readAsText(file);
};

JJUpdater.prototype.setupUi = function() {
  var self = this;
  $('#opt_syncBackup').text(i18n('options_syncBackup'));
  $('#backup_title').text(i18n('backup_title'));
  $('#backup_note').text(i18n('backup_note'));
  $('#backup_export').text(i18n('backup_export')).off().click(function(e) {
    e.preventDefault();
    self.exportSettings();
  });
  $('#backup_import').text(i18n('backup_import')).off().click(function(e) {
    e.preventDefault();
    $('#backup_file').val('').click();
  });
  $('#backup_file').off().on('change', function() {
    self.importSettings(this.files && this.files[0]);
  });
  $('#update_title').text(i18n('update_title'));
  $('#update_help').text(i18n('update_help'));
  $('#update_check').text(i18n('update_check')).off().click(function(e) {
    e.preventDefault();
    self.check(true);
  });
  $('#update_now').text(i18n('update_now')).off().click(function(e) {
    e.preventDefault();
    self.updateNow();
  });
  $('#update_status').text(this.status);
  $('#update_row').toggle(this.available());
};
