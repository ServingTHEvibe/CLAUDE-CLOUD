// Order storage for the owner dashboard (/admin). Upstash Redis over its REST API,
// no dependencies. Enabled by the env vars Vercel's Upstash integration adds:
//   KV_REST_API_URL + KV_REST_API_TOKEN   (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
const env = (k) => (process.env[k] || '').trim();
const url = () => env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL');
const token = () => env('KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN');

export const storeConfigured = () => Boolean(url() && token());
export const STATUSES = ['new', 'contacted', 'done'];

async function redis(...cmd) {
  const res = await fetch(url(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Redis ${res.status} ${data.error || ''}`);
  return data.result;
}

export async function saveOrder(lead, id, images = []) {
  const record = { id, receivedAt: new Date().toISOString(), status: 'new', lead };
  await redis('SET', `tmg:order:${id}`, JSON.stringify(record));
  await redis('LPUSH', 'tmg:orders', id);
  // Reference photos are kept separately so the list stays fast. Skipped if too big.
  const photos = images.map((i) => `data:${i.contentType};base64,${i.content}`);
  if (photos.length && photos.join('').length < 900_000) {
    await redis('SET', `tmg:photos:${id}`, JSON.stringify(photos)).catch(() => {});
  }
}

export async function listOrders(limit = 200) {
  const ids = (await redis('LRANGE', 'tmg:orders', 0, limit - 1)) || [];
  if (!ids.length) return [];
  const rows = await redis('MGET', ...ids.map((id) => `tmg:order:${id}`));
  return rows.filter(Boolean).map((r) => JSON.parse(r));
}

export async function getPhotos(id) {
  const raw = await redis('GET', `tmg:photos:${id}`);
  return raw ? JSON.parse(raw) : [];
}

export async function setStatus(id, status) {
  const raw = await redis('GET', `tmg:order:${id}`);
  if (!raw) return null;
  const rec = JSON.parse(raw);
  rec.status = status;
  rec.updatedAt = new Date().toISOString();
  await redis('SET', `tmg:order:${id}`, JSON.stringify(rec));
  return rec;
}
