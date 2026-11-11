// Offline IPv4 -> country lookup backed by data/geoip-v4.bin
// (built by tools/build-geoip.js; data CC BY 4.0, Number Resource Organization).
function JJGeoIP(url) {
  this.url = url || 'data/geoip-v4.bin';
  this.ready = false;
  this.loading = null;
  this.countries = null;
  this.starts = null;
  this.codes = null;
  this.names = {};
  try {
    this.displayNames = new Intl.DisplayNames(['zh-TW'], { type: 'region' });
  } catch (e) {
    this.displayNames = null;
  }
}

JJGeoIP.prototype.load = function() {
  if (this.loading) return this.loading;
  var self = this;
  this.loading = fetch(this.url).then(function(res) {
    if (!res.ok) throw new Error('geoip ' + res.status);
    return res.arrayBuffer();
  }).then(function(buf) {
    self.parse(buf);
    self.ready = true;
  }).catch(function(e) {
    console.log('geoip unavailable', e);
  });
  return this.loading;
};

JJGeoIP.prototype.parse = function(buf) {
  var view = new DataView(buf);
  var magic = String.fromCharCode.apply(null, new Uint8Array(buf, 0, 6));
  if (magic !== 'JJGEO1') throw new Error('bad geoip file');
  var off = 6;
  var c = view.getUint16(off, true); off += 2;
  var countries = [];
  for (var i = 0; i < c; ++i) {
    countries.push(String.fromCharCode(view.getUint8(off), view.getUint8(off + 1)));
    off += 2;
  }
  var n = view.getUint32(off, true); off += 4;
  var starts = new Uint32Array(n);
  for (var j = 0; j < n; ++j, off += 4) {
    starts[j] = view.getUint32(off, true);
  }
  this.countries = countries;
  this.starts = starts;
  this.codes = new Uint8Array(buf.slice(off, off + n));
};

JJGeoIP.ipToInt = function(ip) {
  var parts = ip.split('.');
  if (parts.length !== 4) return -1;
  var n = 0;
  for (var i = 0; i < 4; ++i) {
    var p = parseInt(parts[i], 10);
    if (isNaN(p) || p < 0 || p > 255) return -1;
    n = n * 256 + p;
  }
  return n;
};

// Returns an ISO country code such as 'TW', or '' when unknown.
JJGeoIP.prototype.lookup = function(ip) {
  if (!this.ready) return '';
  var n = JJGeoIP.ipToInt(ip);
  if (n < 0) return '';
  var lo = 0, hi = this.starts.length - 1, found = -1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (this.starts[mid] <= n) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return '';
  var code = this.countries[this.codes[found]];
  return code === '--' ? '' : code;
};

JJGeoIP.prototype.countryName = function(code) {
  if (!code) return '';
  if (code in this.names) return this.names[code];
  var name = code;
  if (this.displayNames) {
    try {
      name = this.displayNames.of(code) || code;
    } catch (e) {
    }
  }
  this.names[code] = name;
  return name;
};
