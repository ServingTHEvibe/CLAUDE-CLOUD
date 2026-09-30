// Owner dashboard API. Password comes from the ADMIN_PASSWORD env var.
//   POST  /api/admin {password}         -> { token }   (valid 30 days)
//   GET   /api/admin                    -> { orders }  (Authorization: Bearer <token>)
//   GET   /api/admin?photos=<id>        -> { photos }
//   PATCH /api/admin {id, status}       -> { order }
import crypto from 'node:crypto';
import { storeConfigured, listOrders, setStatus, getPhotos, STATUSES } from './_lib/store.js';

const pw = () => (process.env.ADMIN_PASSWORD || '').trim();
const sign = (exp) => crypto.createHmac('sha256', pw()).update(`tmg-admin:${exp}`).digest('hex');
const same = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
function authed(req) {
  const [exp, sig] = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').split('.');
  return Boolean(exp && sig && Number(exp) > Date.now() && same(sig, sign(exp)));
}
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > 10000) break; }
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!pw()) return res.status(503).json({ error: 'Admin password is not set up yet.' });
  if (!storeConfigured()) return res.status(503).json({ error: 'Order storage is not connected yet.' });

  try {
    if (req.method === 'POST') {
      const { password } = await body(req);
      if (!same(password || '', pw())) {
        await new Promise((r) => setTimeout(r, 800));
        return res.status(401).json({ error: 'Wrong password.' });
      }
      const exp = Date.now() + 30 * 24 * 3600 * 1000;
      return res.status(200).json({ token: `${exp}.${sign(exp)}` });
    }
    if (!authed(req)) return res.status(401).json({ error: 'Please log in again.' });
    if (req.method === 'GET') {
      const id = req.query && req.query.photos;
      if (id) return res.status(200).json({ photos: await getPhotos(String(id).slice(0, 40)) });
      return res.status(200).json({ orders: await listOrders() });
    }
    if (req.method === 'PATCH') {
      const { id, status } = await body(req);
      if (!STATUSES.includes(status) || typeof id !== 'string') return res.status(400).json({ error: 'Bad request.' });
      const order = await setStatus(id.slice(0, 40), status);
      return order ? res.status(200).json({ order }) : res.status(404).json({ error: 'Not found.' });
    }
    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[admin]', e.message);
    return res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
}
