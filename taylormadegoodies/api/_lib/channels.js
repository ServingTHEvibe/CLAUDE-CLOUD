// Delivery channels for order requests. Each is enabled purely by environment variables;
// nothing here hard-codes a destination.
//
//   Email (Resend)   RESEND_API_KEY, ORDER_EMAIL, [ORDER_FROM_EMAIL]
//   SMS (Twilio)     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, ORDER_SMS_NUMBER
//   Dashboard        KV_REST_API_URL, KV_REST_API_TOKEN  (Upstash Redis; owner views at /admin)
//   Webhook          ORDER_WEBHOOK_URL, [ORDER_WEBHOOK_SECRET]  (Zapier, Make, Slack, Airtable, a POS…)
import { orderText, orderHtml } from './order.js';
import { storeConfigured, saveOrder } from './store.js';

const env = (k) => (process.env[k] || '').trim();

export function configuredChannels() {
  const list = [];
  if (storeConfigured()) list.push('dashboard');
  if (env('RESEND_API_KEY') && env('ORDER_EMAIL')) list.push('email');
  if (env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_FROM_NUMBER') && env('ORDER_SMS_NUMBER')) list.push('sms');
  if (env('ORDER_WEBHOOK_URL')) list.push('webhook');
  return list;
}

async function check(res, name) {
  if (res.ok) return;
  let detail = '';
  try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
  throw new Error(`${name} responded ${res.status} ${detail}`);
}

async function sendEmail(lead, id, images) {
  const from = env('ORDER_FROM_EMAIL') || 'Taylor Made Goodies <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: env('ORDER_EMAIL').split(',').map((s) => s.trim()).filter(Boolean),
      reply_to: lead.email || undefined,
      subject: `New order request ${id}: ${lead.orderType}${lead.eventDate ? ` for ${lead.eventDate}` : ''}`,
      text: orderText(lead, id),
      html: orderHtml(lead, id),
      attachments: images.map((i) => ({ filename: i.filename, content: i.content })),
    }),
  });
  await check(res, 'Resend');
}

async function sendConfirmation(lead, id) {
  if (env('ORDER_CONFIRM_CUSTOMER') !== 'true' || !lead.email || !env('RESEND_API_KEY')) return;
  const from = env('ORDER_FROM_EMAIL') || 'Taylor Made Goodies <onboarding@resend.dev>';
  const first = lead.name.split(/\s+/)[0];
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [lead.email],
      reply_to: env('ORDER_EMAIL').split(',')[0] || undefined,
      subject: `We got your order request (${id})`,
      text: `Hi ${first},\n\nThanks for reaching out to Taylor Made Goodies. We received your request and will follow up to confirm details, pricing and timing.\n\n${orderText(lead, id)}\n`,
    }),
  });
  await check(res, 'Resend confirmation');
}

async function sendSms(lead, id) {
  const sid = env('TWILIO_ACCOUNT_SID');
  const bits = [
    `TMG order ${id}`,
    `${lead.orderType}${lead.eventType ? ` · ${lead.eventType}` : ''}`,
    lead.eventDate && `Date: ${lead.eventDate}`,
    lead.quantity && `Qty: ${lead.quantity}`,
    `${lead.name}${lead.phone ? ` ${lead.phone}` : ''}${lead.email ? ` ${lead.email}` : ''}`,
  ].filter(Boolean);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: env('TWILIO_FROM_NUMBER'), To: env('ORDER_SMS_NUMBER'), Body: bits.join('\n').slice(0, 1500) }),
  });
  await check(res, 'Twilio');
}

async function sendWebhook(lead, id, images) {
  const headers = { 'Content-Type': 'application/json' };
  if (env('ORDER_WEBHOOK_SECRET')) headers['X-TMG-Secret'] = env('ORDER_WEBHOOK_SECRET');
  const res = await fetch(env('ORDER_WEBHOOK_URL'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id,
      receivedAt: new Date().toISOString(),
      lead,
      summary: orderText(lead, id),
      // Photos are included only when the receiver opts in; many automation tools reject large bodies.
      referenceImages: env('ORDER_WEBHOOK_INCLUDE_IMAGES') === 'true'
        ? images.map((i) => `data:${i.contentType};base64,${i.content}`) : undefined,
    }),
  });
  await check(res, 'Webhook');
}

/** Deliver to every configured channel. Resolves with per-channel results. */
export async function deliver(lead, id, images) {
  const channels = configuredChannels();
  const run = { dashboard: () => saveOrder(lead, id, images), email: () => sendEmail(lead, id, images), sms: () => sendSms(lead, id), webhook: () => sendWebhook(lead, id, images) };
  const settled = await Promise.allSettled(channels.map((c) => run[c]()));
  const results = channels.map((c, i) => ({ channel: c, ok: settled[i].status === 'fulfilled', error: settled[i].reason && String(settled[i].reason.message || settled[i].reason) }));
  if (results.some((r) => r.ok)) await sendConfirmation(lead, id).catch((e) => console.error('[order] confirmation failed', e.message));
  return results;
}
