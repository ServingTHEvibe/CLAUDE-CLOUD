import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrder, orderText } from '../api/_lib/order.js';
import handler from '../api/order.js';

const NOW = new Date('2026-09-28T15:00:00Z');
const base = { name: 'Jada Taylor', phone: '(404) 555-0100', orderType: 'Cookies', eventDate: '2026-10-10' };

test('accepts a minimal valid lead', () => {
  const r = normalizeOrder(base, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.lead.name, 'Jada Taylor');
  assert.equal(r.lead.referenceImageCount, 0);
});

test('requires name, order type and a way to reach the customer', () => {
  const r = normalizeOrder({ orderType: 'Cookies' }, NOW);
  assert.equal(r.ok, false);
  assert.ok(r.fields.name);
  assert.ok(r.fields.contact);
});

test('rejects unknown order types, bad email/phone, past dates, bad fulfillment', () => {
  const r = normalizeOrder({ ...base, orderType: 'Pizza', email: 'nope', phone: '12', eventDate: '2026-01-01', fulfillment: 'drone' }, NOW);
  assert.equal(r.ok, false);
  for (const k of ['orderType', 'email', 'phone', 'eventDate', 'fulfillment']) assert.ok(r.fields[k], k);
});

test('quantity must be a positive whole number', () => {
  assert.equal(normalizeOrder({ ...base, quantity: 2.5 }, NOW).ok, false);
  assert.equal(normalizeOrder({ ...base, quantity: 24 }, NOW).ok, true);
});

test('reference images: decoded to attachments, typed and capped', () => {
  const tiny = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg').toString('base64');
  const ok = normalizeOrder({ ...base, referenceImages: [tiny, tiny] }, NOW);
  assert.equal(ok.ok, true);
  assert.equal(ok.images.length, 2);
  assert.equal(ok.images[0].filename, 'reference-1.jpg');
  assert.equal(normalizeOrder({ ...base, referenceImages: [tiny, tiny, tiny, tiny] }, NOW).ok, false);
  assert.equal(normalizeOrder({ ...base, referenceImages: ['data:text/html;base64,PGI+'] }, NOW).ok, false);
});

test('text summary contains the key facts', () => {
  const { lead } = normalizeOrder({ ...base, colors: ['Pink', 'Gold'] }, NOW);
  const t = orderText(lead, 'TMG-X');
  assert.match(t, /TMG-X/);
  assert.match(t, /Colors: Pink, Gold/);
  assert.match(t, /Phone: \(404\) 555-0100/);
});

function fakeRes() {
  return {
    code: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; },
  };
}

test('handler: 405 on GET, 400 on invalid, 503 when no channel configured', async () => {
  for (const k of ['RESEND_API_KEY', 'ORDER_EMAIL', 'ORDER_WEBHOOK_URL', 'TWILIO_ACCOUNT_SID']) delete process.env[k];
  let res = fakeRes(); await handler({ method: 'GET' }, res); assert.equal(res.code, 405);
  res = fakeRes(); await handler({ method: 'POST', body: { name: '' } }, res); assert.equal(res.code, 400);
  res = fakeRes(); await handler({ method: 'POST', body: { ...base, eventDate: '2099-01-01' } }, res); assert.equal(res.code, 503);
});

test('handler: honeypot short-circuits with a fake success', async () => {
  const res = fakeRes();
  await handler({ method: 'POST', body: { ...base, company: 'Spam LLC' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);
});

test('handler: delivers to a webhook and returns an id', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); };
  process.env.ORDER_WEBHOOK_URL = 'https://hooks.example.test/order';
  try {
    const res = fakeRes();
    await handler({ method: 'POST', body: { ...base, eventDate: '2099-01-01' } }, res);
    assert.equal(res.code, 200);
    assert.match(res.body.id, /^TMG-\d{6}-[A-Z0-9]{4}$/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.lead.orderType, 'Cookies');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ORDER_WEBHOOK_URL;
  }
});

test('handler: 502 when every channel fails', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  process.env.ORDER_WEBHOOK_URL = 'https://hooks.example.test/order';
  const err = console.error; console.error = () => {};
  try {
    const res = fakeRes();
    await handler({ method: 'POST', body: { ...base, eventDate: '2099-01-01' } }, res);
    assert.equal(res.code, 502);
  } finally {
    globalThis.fetch = realFetch; console.error = err;
    delete process.env.ORDER_WEBHOOK_URL;
  }
});
