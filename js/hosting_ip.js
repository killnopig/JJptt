// Offline IPv4 -> cloud / hosting / VPN provider lookup, backed by
// data/hosting-v4.bin (see tools/build-hosting.js). Used by the "機房"
// rule of the fact check; consumer ISPs are not in the file.
var HostingIp = {
  ready: false,
  loading: null,
  names: [],
  starts: null,
  ends: null,
  idx: null
};

HostingIp.load = function(url) {
  if (HostingIp.loading) return HostingIp.loading;
  HostingIp.loading = fetch(url || 'data/hosting-v4.bin').then(function(res) {
    if (!res.ok) throw new Error('hosting data ' + res.status);
    return res.arrayBuffer();
  }).then(function(buf) {
    var view = new DataView(buf);
    var magic = String.fromCharCode.apply(null, new Uint8Array(buf, 0, 7));
    if (magic !== 'JJHOST1') throw new Error('bad hosting data');
    var o = 7;
    var count = view.getUint8(o); o += 1;
    var dec = new TextDecoder('utf-8');
    var names = [];
    for (var i = 0; i < count; ++i) {
      var len = view.getUint8(o); o += 1;
      names.push(dec.decode(new Uint8Array(buf, o, len))); o += len;
    }
    var n = view.getUint32(o, true); o += 4;
    var starts = new Uint32Array(n), ends = new Uint32Array(n);
    for (i = 0; i < n; ++i) starts[i] = view.getUint32(o + i * 4, true);
    o += n * 4;
    for (i = 0; i < n; ++i) ends[i] = view.getUint32(o + i * 4, true);
    o += n * 4;
    HostingIp.idx = new Uint8Array(buf, o, n);
    HostingIp.names = names;
    HostingIp.starts = starts;
    HostingIp.ends = ends;
    HostingIp.ready = true;
  }).catch(function(e) {
    console.log('hosting ip data:', e.message);
  });
  return HostingIp.loading;
};

// provider name, or '' for anything else
HostingIp.lookup = function(ip) {
  if (!HostingIp.ready) return '';
  var p = String(ip || '').split('.');
  if (p.length !== 4) return '';
  var v = ((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + (+p[3]);
  var lo = 0, hi = HostingIp.starts.length - 1, found = -1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (HostingIp.starts[mid] <= v) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (found < 0 || v > HostingIp.ends[found]) return '';
  return HostingIp.names[HostingIp.idx[found]];
};
