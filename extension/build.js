// Copies the built website into extension/ so it can be loaded unpacked.
// Run after `npx grunt`:  node extension/build.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = __dirname;

const dirs = ['css', 'fonts', 'cursor', 'icon', 'data'];
const files = [
  'icon_16.png', 'icon_128.png', 'icon_512.png', 'LICENSE',
  'js/jquery-2.1.1.min.js', 'js/bootstrap.min.js', 'js/paramikojs_ssh.min.js',
  'js/hammer.min.js', 'js/pttchrome.min.js',
];

for (const d of dirs.concat(['js'])) {
  fs.rmSync(path.join(out, d), { recursive: true, force: true });
}
for (const d of dirs) {
  fs.cpSync(path.join(root, d), path.join(out, d), {
    recursive: true,
    filter: (src) => !/\.concat\./.test(src),
  });
}
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
  fs.copyFileSync(path.join(root, f), path.join(out, f));
}

// Extension pages only allow scripts packaged with the extension, so drop
// remote scripts (Google API, Facebook SDK) and inline scripts.
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/^﻿/, '');
html = html
  .replace(/<script[^>]*src="https?:\/\/[^"]*"[^>]*><\/script>\s*/g, '')
  .replace(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>\s*/g, '')
  .replace(/<link rel="chrome-webstore-item"[^>]*>\s*/g, '')
  .replace(/<div id="fb-root"><\/div>\s*/g, '');
if (/<script(?![^>]*\ssrc=)/.test(html) || /src="https?:/.test(html)) {
  throw new Error('app.html still contains inline or remote scripts');
}
fs.writeFileSync(path.join(out, 'app.html'), html);
console.log('extension/ updated');
