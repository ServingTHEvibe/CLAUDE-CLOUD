// Headless still: node tools/render.mjs hammerhead out.png "view=hero&w=1600&h=900"
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [model = 'hammerhead', out = 'still.png', query = 'view=hero&w=1600&h=900'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const q = new URLSearchParams(query);
const w = +q.get('w') || 1600, h = +q.get('h') || 900;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t = Date.now();
await page.goto(`http://localhost:${port}/${model}/index.html?still&${query}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
const stats = await page.evaluate(() => window.__stats);
await page.locator('canvas').screenshot({ path: out });
console.log(JSON.stringify({ out, ms: Date.now() - t, stats }));
await browser.close();
server.close();
