// Local preview: serves public/ and runs api/*.js with a Vercel-like req/res.
//   node scripts/dev-server.mjs [port]
// Loads .env.local if present. With DEV_CAPTURE=1, POST /__capture records webhook
// payloads (GET /__capture returns the last one) so ordering can be tested end to end
// by setting ORDER_WEBHOOK_URL=http://localhost:<port>/__capture.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 4173);

const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.svg': 'image/svg+xml' };
let captured = null;

function decorate(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.headersSent) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  return res;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  decorate(res);
  try {
    if (url.pathname === '/__capture' && process.env.DEV_CAPTURE === '1') {
      if (req.method === 'POST') {
        let raw = ''; for await (const c of req) raw += c;
        captured = JSON.parse(raw);
        return res.status(200).json({ ok: true });
      }
      return res.status(200).json(captured);
    }
    if (url.pathname.startsWith('/api/')) {
      const file = path.join(root, 'api', `${url.pathname.slice(5)}.js`);
      if (!file.startsWith(path.join(root, 'api')) || url.pathname.includes('/_') || !fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
      const mod = await import(pathToFileURL(file).href);
      req.query = Object.fromEntries(url.searchParams);
      return await mod.default(req, res);
    }
    let file = path.join(root, 'public', decodeURIComponent(url.pathname));
    if (!file.startsWith(path.join(root, 'public'))) return res.status(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return res.status(404).end('Not found');
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: 'Dev server error' });
  }
}).listen(port, () => console.log(`Taylor Made Goodies → http://localhost:${port}`));
