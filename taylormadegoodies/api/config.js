// GET /api/config — public, business-supplied contact info for the page and the
// concierge fallback. Everything comes from env vars; unset means "don't show it".
import { configuredChannels } from './_lib/channels.js';

const env = (k) => (process.env[k] || '').trim();

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  const contact = {};
  if (env('PUBLIC_CONTACT_EMAIL')) contact.email = env('PUBLIC_CONTACT_EMAIL');
  if (env('PUBLIC_CONTACT_PHONE')) {
    contact.phone = env('PUBLIC_CONTACT_PHONE').replace(/[^\d+]/g, '');
    contact.phoneDisplay = env('PUBLIC_CONTACT_PHONE');
  }
  if (/^https:\/\//.test(env('PUBLIC_INSTAGRAM_URL'))) contact.instagram = env('PUBLIC_INSTAGRAM_URL');
  res.status(200).json({ ordering: configuredChannels().length > 0, contact });
}
