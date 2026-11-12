// Copies the built extension pages into mobile/www for the Android app.
// Run `npm run build` at the top first (it builds extension/).
const fs = require('fs');
const path = require('path');

const ext = path.join(__dirname, '..', 'extension');
const out = path.join(__dirname, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const d of ['css', 'fonts', 'cursor', 'icon', 'data', 'js']) {
  fs.cpSync(path.join(ext, d), path.join(out, d), { recursive: true });
}
for (const f of ['icon_16.png', 'icon_48.png', 'icon_128.png', 'icon_512.png', 'LICENSE']) {
  fs.copyFileSync(path.join(ext, f), path.join(out, f));
}
fs.copyFileSync(path.join(ext, 'app.html'), path.join(out, 'index.html'));
console.log('mobile/www updated');
