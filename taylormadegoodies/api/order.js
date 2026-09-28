// POST /api/order — receives an OrderLead from the Goodie Concierge.
//   200 { ok, id }            delivered to at least one channel
//   400 { error, fields }     validation failed
//   503 { error }             no delivery channel configured yet
//   502 { error }             every configured channel failed
import { normalizeOrder, orderId } from './_lib/order.js';
import { configuredChannels, deliver } from './_lib/channels.js';

const MAX_BODY = 4_000_000;

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 });
  }
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try { body = await readBody(req); } catch (e) {
    return res.status(e.status || 400).json({ error: e.status === 413 ? 'Request too large.' : 'Invalid JSON.' });
  }

  // Honeypot: bots fill the hidden "company" field. Pretend success, deliver nothing.
  if (body && typeof body.company === 'string' && body.company.trim()) {
    return res.status(200).json({ ok: true, id: orderId() });
  }

  const parsed = normalizeOrder(body);
  if (!parsed.ok) return res.status(400).json({ error: 'Some details need another look.', fields: parsed.fields });

  if (!configuredChannels().length) {
    return res.status(503).json({ error: 'Online ordering is not connected yet.' });
  }

  const id = orderId();
  const results = await deliver(parsed.lead, id, parsed.images);
  results.filter((r) => !r.ok).forEach((r) => console.error(`[order ${id}] ${r.channel} failed: ${r.error}`));
  if (!results.some((r) => r.ok)) return res.status(502).json({ error: 'We could not send your order. Please try again.' });

  console.log(`[order ${id}] delivered via ${results.filter((r) => r.ok).map((r) => r.channel).join(', ')}`);
  return res.status(200).json({ ok: true, id });
}
