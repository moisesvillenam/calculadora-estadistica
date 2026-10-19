// Browser integration without dependencies, a server or a real Supabase project.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const results = path.join(root, 'test-results');
const profile = path.join(root, '.browser-test-profile');
fs.mkdirSync(results, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'browser.html'), 'utf8')
  .replace('<script src="browser-tests.js">', `<script>window.CLARA_TEST_HTML=${JSON.stringify(html).replace(/</g, '\\u003c')};</script><script src="../tests/browser-tests.js">`);
const target = path.join(results, 'browser.html');
fs.writeFileSync(target, fixture);
const child = spawn(process.env.CHROMIUM_BIN || 'chromium', [
  '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run',
  '--disable-background-networking', '--disable-extensions', '--disable-sync', '--allow-file-access-from-files',
  '--host-resolver-rules=MAP * ~NOTFOUND', `--user-data-dir=${profile}`,
  '--dump-dom', '--virtual-time-budget=15000', pathToFileURL(target).href
], { env: { ...process.env, XDG_CONFIG_HOME: profile, XDG_CACHE_HOME: profile, TMPDIR: profile } });
let output = '', errors = '';
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', data => { errors += data; });
const timer = setTimeout(() => child.kill(), 45000);
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', () => {
  clearTimeout(timer);
  const report = output.match(/<pre id="test-result" data-status="([^"]+)">([\s\S]*?)<\/pre>/);
  console.log(report ? report[2] : errors.slice(-3000));
  if (report?.[1] !== 'passed') process.exitCode = 1;
});
