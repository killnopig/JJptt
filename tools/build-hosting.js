// Builds data/hosting-v4.bin: IPv4 ranges of well-known cloud, hosting and
// VPN providers, used by js/hosting_ip.js for the "機房" fact-check rule.
//
// Data: ip-location-db "origin-asn" (PDDL, public domain), from
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/sapics/ip-location-db.git
//   cd ip-location-db && git sparse-checkout set origin-asn
//   node tools/build-hosting.js ip-location-db/origin-asn/origin-asn-ipv4.csv
//
// File layout (little endian):
//   "JJHOST1"  magic (7 bytes)
//   u8         number of provider names P
//   P * (u8 length + UTF-8 bytes)
//   u32        number of ranges N
//   N * u32    range starts (sorted)
//   N * u32    range ends (inclusive)
//   N * u8     provider index
const fs = require('fs');
const path = require('path');

// AS number -> short provider name. Consumer ISPs are never listed here.
const PROVIDERS = {
  'AWS': [16509, 14618, 8987],
  'Google Cloud': [396982],
  'Azure': [8075],
  'Oracle Cloud': [31898],
  'DigitalOcean': [14061],
  'Linode': [63949],
  'Vultr': [20473],
  'OVH': [16276],
  'Hetzner': [24940],
  'Contabo': [51167],
  'Leaseweb': [60781, 28753, 59253, 7203],
  'M247 (VPN)': [9009],
  'Datacamp (VPN)': [60068],
  'Packethub (VPN)': [207137, 147049],
  'Cloudflare WARP': [13335],
  'Alibaba Cloud': [45102, 37963],
  'Tencent Cloud': [132203, 45090],
  'Huawei Cloud': [136907, 55990],
  'IONOS': [8560],
  'Scaleway': [12876],
  'Hostinger': [47583],
  'G-Core': [199524],
  'Zenlayer': [21859],
  'Psychz': [40676],
  'QuadraNet': [8100],
  'ColoCrossing': [36352],
  'Clouvider': [62240],
  'xTom': [3258],
  'FranTech': [53667],
  'Kamatera': [36007],
  'HostRoyale': [203020],
  'Hivelocity': [29802],
  'Sharktech': [46844],
  'Tzulo': [11878]
};

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/build-hosting.js <origin-asn-ipv4.csv>');
  process.exit(1);
}

const names = Object.keys(PROVIDERS);
const asnToIndex = {};
names.forEach(function(n, i) { PROVIDERS[n].forEach(function(a) { asnToIndex[a] = i; }); });

const ipNum = function(s) {
  const p = s.split('.');
  return ((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + (+p[3]);
};

const ranges = [];
fs.readFileSync(src, 'utf8').split('\n').forEach(function(line) {
  if (!line) return;
  const m = /^([\d.]+),([\d.]+),(\d+),/.exec(line);
  if (!m) return;
  const idx = asnToIndex[+m[3]];
  if (idx === undefined) return;
  ranges.push([ipNum(m[1]), ipNum(m[2]), idx]);
});
ranges.sort(function(a, b) { return a[0] - b[0]; });

// merge touching ranges of the same provider
const merged = [];
ranges.forEach(function(r) {
  const last = merged[merged.length - 1];
  if (last && last[2] === r[2] && r[0] <= last[1] + 1) {
    if (r[1] > last[1]) last[1] = r[1];
  } else {
    merged.push(r.slice());
  }
});

const nameBufs = names.map(function(n) { return Buffer.from(n, 'utf8'); });
let size = 7 + 1 + nameBufs.reduce(function(s, b) { return s + 1 + b.length; }, 0) + 4 + merged.length * 9;
const out = Buffer.alloc(size);
let o = out.write('JJHOST1', 0, 'ascii');
out.writeUInt8(names.length, o); o += 1;
nameBufs.forEach(function(b) { out.writeUInt8(b.length, o); o += 1; b.copy(out, o); o += b.length; });
out.writeUInt32LE(merged.length, o); o += 4;
merged.forEach(function(r) { out.writeUInt32LE(r[0], o); o += 4; });
merged.forEach(function(r) { out.writeUInt32LE(r[1], o); o += 4; });
merged.forEach(function(r) { out.writeUInt8(r[2], o); o += 1; });

const dest = path.join(__dirname, '..', 'data', 'hosting-v4.bin');
fs.writeFileSync(dest, out);
const perName = {};
merged.forEach(function(r) { perName[names[r[2]]] = (perName[names[r[2]]] || 0) + 1; });
console.log('wrote', dest, out.length, 'bytes,', merged.length, 'ranges');
console.log(perName);
