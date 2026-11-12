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
// which build this is (GitHub Actions run number and commit), shown in
// 設定 → 關於 so a phone can tell whether it has the newest one
const info = {
  run: process.env.GITHUB_RUN_NUMBER || 'dev',
  sha: (process.env.GITHUB_SHA || '').slice(0, 7),
  time: new Date().toISOString()
};
fs.writeFileSync(path.join(out, 'build-info.js'), 'window.JJPTT_BUILD = ' + JSON.stringify(info) + ';\n');
let page = fs.readFileSync(path.join(ext, 'app.html'), 'utf8');
page = page.replace('</head>', '<script src="build-info.js"></script>\n</head>');
fs.writeFileSync(path.join(out, 'index.html'), page);
// the app's own icon (the home screen title)
fs.copyFileSync(path.join(__dirname, 'assets', 'jjptt-app-icon-192.png'), path.join(out, 'app-icon.png'));
console.log('mobile/www updated');
