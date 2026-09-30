// Server-side validation for OrderLead. Never trust the browser.

export const LIMITS = {
  text: 300,
  long: 1500,
  images: 3,
  imageBytes: 1_500_000, // per image, decoded
};

const ORDER_TYPES = ['Birthday cake', 'Cookies', 'Treat box'];
const FULFILLMENT = ['pickup', 'delivery'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined) || undefined;

function todayISO(now = new Date()) {
  // Accept "today" in any US timezone: compare against UTC-12h.
  return new Date(now.getTime() - 12 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * @returns {{ ok: true, lead: object, images: {filename:string,contentType:string,content:string}[] }
 *         | { ok: false, fields: Record<string,string> }}
 */
export function normalizeOrder(body, now = new Date()) {
  const fields = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, fields: { body: 'Expected a JSON object.' } };

  const lead = {
    name: str(body.name, 120),
    email: str(body.email, 200),
    phone: str(body.phone, 30),
    orderType: str(body.orderType, 60),
    products: Array.isArray(body.products) ? body.products.map((p) => str(p, LIMITS.text)).filter(Boolean).slice(0, 10) : undefined,
    quantity: body.quantity === undefined || body.quantity === null || body.quantity === '' ? undefined : Number(body.quantity),
    eventType: str(body.eventType, 80),
    eventDate: str(body.eventDate, 10),
    fulfillment: str(body.fulfillment, 20),
    theme: str(body.theme, LIMITS.text),
    colors: Array.isArray(body.colors) ? body.colors.map((c) => str(c, 30)).filter(Boolean).slice(0, 12) : undefined,
    notes: str(body.notes, LIMITS.long),
  };

  if (!lead.name) fields.name = 'Name is required.';
  if (!lead.orderType) fields.orderType = 'Order type is required.';
  else if (!ORDER_TYPES.includes(lead.orderType)) fields.orderType = 'Unknown order type.';
  if (!lead.email && !lead.phone) fields.contact = 'A phone number or email is required.';
  if (lead.email && !EMAIL.test(lead.email)) fields.email = 'Email looks invalid.';
  if (lead.phone) {
    const digits = lead.phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15 || !/^\+?[\d\s().-]+$/.test(lead.phone)) fields.phone = 'Phone looks invalid.';
  }
  if (lead.quantity !== undefined && !(Number.isInteger(lead.quantity) && lead.quantity > 0 && lead.quantity <= 10000)) {
    fields.quantity = 'Quantity must be a whole number.';
  }
  if (lead.eventDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lead.eventDate) || Number.isNaN(Date.parse(lead.eventDate))) fields.eventDate = 'Date looks invalid.';
    else if (lead.eventDate < todayISO(now)) fields.eventDate = 'That date has already passed.';
  }
  if (lead.fulfillment && !FULFILLMENT.includes(lead.fulfillment)) fields.fulfillment = 'Choose pickup or delivery.';

  const images = [];
  if (body.referenceImages !== undefined) {
    if (!Array.isArray(body.referenceImages) || body.referenceImages.length > LIMITS.images) {
      fields.referenceImages = `Up to ${LIMITS.images} photos.`;
    } else {
      body.referenceImages.forEach((d, i) => {
        const m = typeof d === 'string' && d.match(DATA_URL);
        if (!m) { fields.referenceImages = 'Photos must be JPEG, PNG or WebP.'; return; }
        const bytes = Math.floor((m[2].length * 3) / 4);
        if (bytes > LIMITS.imageBytes) { fields.referenceImages = 'A photo is too large.'; return; }
        const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
        images.push({ filename: `reference-${i + 1}.${ext}`, contentType: m[1], content: m[2] });
      });
    }
  }

  Object.keys(lead).forEach((k) => lead[k] === undefined && delete lead[k]);
  if (Object.keys(fields).length) return { ok: false, fields };
  lead.referenceImageCount = images.length;
  return { ok: true, lead, images };
}

export function orderId(now = new Date()) {
  const d = now.toISOString().slice(2, 10).replace(/-/g, '');
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TMG-${d}-${r}`;
}

const LABELS = [
  ['orderType', 'Order'], ['products', 'Details'], ['eventType', 'Occasion'], ['quantity', 'Quantity'],
  ['eventDate', 'Date'], ['fulfillment', 'Pickup/Delivery'], ['theme', 'Theme'], ['colors', 'Colors'],
  ['notes', 'Notes'], ['referenceImageCount', 'Reference photos'], ['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'],
];

export function orderRows(lead) {
  return LABELS
    .map(([k, label]) => [label, Array.isArray(lead[k]) ? lead[k].join(', ') : lead[k]])
    .filter(([, v]) => v !== undefined && v !== '' && v !== 0);
}

export function orderText(lead, id) {
  return [`New Taylor Made Goodies order request ${id}`, '']
    .concat(orderRows(lead).map(([k, v]) => `${k}: ${v}`)).join('\n');
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function orderHtml(lead, id) {
  const rows = orderRows(lead)
    .map(([k, v]) => `<tr><td style="padding:8px 16px 8px 0;color:#8a6a3a;font:600 12px/1.4 Arial,sans-serif;text-transform:uppercase;letter-spacing:.08em;vertical-align:top">${escHtml(k)}</td><td style="padding:8px 0;font:15px/1.5 Arial,sans-serif;color:#1a120d;white-space:pre-wrap">${escHtml(v)}</td></tr>`)
    .join('');
  return `<div style="max-width:560px"><h2 style="font:700 20px Arial,sans-serif;color:#1a120d">New order request <span style="color:#b8742a">${escHtml(id)}</span></h2><table style="border-collapse:collapse">${rows}</table></div>`;
}
