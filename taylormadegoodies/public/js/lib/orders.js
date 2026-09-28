// Order submission API. The concierge UI only talks to this module; this module only
// talks to /api/order and /api/config. Swap the destination here (or behind the API)
// without touching the UI.

/**
 * @typedef {Object} OrderLead
 * @property {string} name
 * @property {string} [email]
 * @property {string} [phone]
 * @property {string} orderType
 * @property {string[]} [products]
 * @property {number} [quantity]
 * @property {string} [eventType]
 * @property {string} [eventDate]        YYYY-MM-DD
 * @property {"pickup"|"delivery"} [fulfillment]
 * @property {string} [theme]
 * @property {string[]} [colors]
 * @property {string} [notes]
 * @property {string[]} [referenceImages] data: URLs (JPEG, compressed client-side)
 */

export class OrderError extends Error {
  /** @param {'invalid'|'not_configured'|'network'|'server'} code */
  constructor(code, message, fields) {
    super(message);
    this.code = code;
    this.fields = fields || {};
  }
}

const clean = (v) => (typeof v === 'string' ? v.trim() : v);
const nonEmpty = (v) => (v === undefined || v === null || v === '' ? undefined : v);

/** Turn concierge answers into the OrderLead payload. */
export function buildOrderLead(a) {
  const fulfillment = { Pickup: 'pickup', Delivery: 'delivery' }[a.fulfillment];
  const products = a.products ? [clean(a.products)].filter(Boolean) : undefined;
  const qty = Number.parseInt(a.quantity, 10);
  /** @type {OrderLead} */
  const lead = {
    name: clean(a.name) || '',
    email: nonEmpty(clean(a.email)),
    phone: nonEmpty(clean(a.phone)),
    orderType: a.orderType,
    products,
    quantity: Number.isFinite(qty) && qty > 0 ? qty : undefined,
    eventType: nonEmpty(a.eventType),
    eventDate: nonEmpty(a.eventDate),
    fulfillment,
    theme: nonEmpty(clean(a.theme)),
    colors: a.colors && a.colors.length ? a.colors.slice() : undefined,
    notes: nonEmpty([
      clean(a.notes),
      a.fulfillment === 'Not sure yet' ? 'Pickup or delivery: not sure yet.' : '',
    ].filter(Boolean).join('\n')),
    referenceImages: a.referenceImages && a.referenceImages.length
      ? a.referenceImages.map((i) => i.dataUrl) : undefined,
  };
  Object.keys(lead).forEach((k) => lead[k] === undefined && delete lead[k]);
  return lead;
}

/**
 * @param {OrderLead} lead
 * @param {{ honeypot?: string }} [opts]
 * @returns {Promise<{ ok: true, id: string }>}
 */
export async function submitOrder(lead, opts = {}) {
  let res;
  try {
    res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lead, company: opts.honeypot || '' }),
    });
  } catch {
    throw new OrderError('network', 'We could not reach the order service.');
  }
  let body = {};
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  if (res.ok && body.ok) return body;
  if (res.status === 400) throw new OrderError('invalid', body.error || 'Some details need another look.', body.fields);
  if (res.status === 503 || res.status === 404) throw new OrderError('not_configured', 'Online ordering is not connected yet.');
  throw new OrderError('server', body.error || 'The order service had a problem.');
}

/** Plain-text summary, used for copy-to-clipboard and email/SMS fallbacks. */
export function formatOrderSummary(lead) {
  const rows = [
    ['Order', lead.orderType],
    ['Details', lead.products && lead.products.join(', ')],
    ['Occasion', lead.eventType],
    ['Quantity', lead.quantity],
    ['Date', lead.eventDate],
    ['Pickup/Delivery', lead.fulfillment],
    ['Theme', lead.theme],
    ['Colors', lead.colors && lead.colors.join(', ')],
    ['Notes', lead.notes],
    ['Reference photos', lead.referenceImages && `${lead.referenceImages.length} (attach separately)`],
    ['Name', lead.name],
    ['Phone', lead.phone],
    ['Email', lead.email],
  ];
  return ['Taylor Made Goodies order request', '']
    .concat(rows.filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}: ${v}`))
    .join('\n');
}

let configPromise;
/** Public, business-configured contact info. Empty until the owner sets env vars. */
export function getSiteConfig() {
  if (!configPromise) {
    configPromise = fetch('/api/config', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((c) => ({ ordering: !!c.ordering, contact: c.contact || {} }));
  }
  return configPromise;
}

/** Downscale a photo to ≤maxSide JPEG so a 12MP phone shot becomes ~200KB. */
export async function compressImage(file, maxSide = 1280, quality = 0.8) {
  if (!/^image\//.test(file.type)) throw new Error('Not an image');
  const bitmap = await createImageBitmap(file).catch(async () => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    return img;
  });
  const s = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * s);
  c.height = Math.round(bitmap.height * s);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  if (bitmap.close) bitmap.close();
  return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', dataUrl: c.toDataURL('image/jpeg', quality) };
}
