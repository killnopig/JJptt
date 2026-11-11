// Converts the ip-location-db "geo-whois-asn-country" IPv4 CSV into the
// compact lookup table used by js/geoip.js (data/geoip-v4.bin).
//
//   npm pack @ip-location-db/geo-whois-asn-country
//   tar xzf ip-location-db-geo-whois-asn-country-*.tgz
//   node tools/build-geoip.js package/geo-whois-asn-country-ipv4-num.csv
//
// Data: CC BY 4.0, Number Resource Organization (https://www.nro.net/).
//
// File layout (little endian):
//   "JJGEO1"  magic (6 bytes)
//   u16       number of countries C (index 0 = unknown "--")
//   C * 2     ASCII country codes
//   u32       number of ranges N
//   N * u32   range start addresses (sorted, each range ends where the next starts)
//   N * u8    country index for each range
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/build-geoip.js <ipv4-num.csv>');
  process.exit(1);
}

const countries = ['--'];
const countryIndex = { '--': 0 };
const starts = [];
const codes = [];
let next = 0;  // first address not covered yet

function push(start, code) {
  if (codes.length && codes[codes.length - 1] === code) return;  // merge
  starts.push(start);
  codes.push(code);
}

for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
  if (!line) continue;
  const [a, b, cc] = line.split(',');
  const start = Number(a), end = Number(b);
  if (start > next) push(next, 0);  // gap
  if (!(cc in countryIndex)) {
    countryIndex[cc] = countries.length;
    countries.push(cc);
  }
  push(Math.max(start, next), countryIndex[cc]);
  next = end + 1;
}
if (next <= 0xffffffff) push(next, 0);

const n = starts.length;
const size = 6 + 2 + countries.length * 2 + 4 + n * 4 + n;
const buf = Buffer.alloc(size);
let off = buf.write('JJGEO1', 0, 'ascii');
off = buf.writeUInt16LE(countries.length, off);
for (const c of countries) off += buf.write(c.padEnd(2, '-').slice(0, 2), off, 'ascii');
off = buf.writeUInt32LE(n, off);
for (const s of starts) off = buf.writeUInt32LE(s, off);
for (const c of codes) off = buf.writeUInt8(c, off);

const out = path.join(__dirname, '..', 'data', 'geoip-v4.bin');
fs.writeFileSync(out, buf);
console.log(`wrote ${out}: ${n} ranges, ${countries.length} countries, ${size} bytes`);
