// Copies the version from js/changelog.js into package.json and
// extension/manifest.json, and regenerates CHANGELOG.md.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/changelog.js'), 'utf8') +
  '\nthis.log = JJPTT_CHANGELOG;', ctx);
const log = ctx.log;
const version = log[0].version;

function setVersion(file) {
  const p = path.join(root, file);
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  json.version = version;
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n');
}
setVersion('package.json');
setVersion('extension/manifest.json');

let md = '# 更新紀錄\n\n此檔由 `js/changelog.js` 自動產生（`npm run build`）。\n';
for (const entry of log) {
  md += `\n## ${entry.version}（${entry.date}）\n\n`;
  md += entry.changes.map((c) => `- ${c}`).join('\n') + '\n';
}
fs.writeFileSync(path.join(root, 'CHANGELOG.md'), md);
console.log('version ' + version);
