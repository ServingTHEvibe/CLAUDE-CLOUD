# Taylor Made Goodies: cinematic site + Goodie Concierge

A scroll-film website for Taylor Made Goodies. The hero is a real piece of footage, scrubbed
frame by frame on a `<canvas>` as the visitor scrolls. It resolves into editorial product
sections and an order-intake chat (the Goodie Concierge) that sends real order requests
through `/api/order`.

No framework and no build step: static files in `public/`, and Vercel serverless functions in `api/`.

```
public/
  index.html            page + SEO/OG/JSON-LD metadata
  css/site.css          design tokens, layout, responsive, reduced-motion
  js/main.js            Lenis + GSAP/ScrollTrigger (one loop), depth planes, nav, reveals, 3D cards
  js/film.js            frame engine: progressive loading, ImageBitmap window, canvas draw
  js/film-config.js     chapters (mural → portal → desserts), portal window, readout labels
  js/concierge.js       Goodie Concierge conversation + UI
  js/lib/orders.js      OrderLead payload, submitOrder(), config, image compression
  film/<chapter>/{d,m}/ WebP frames, desktop 1080w / mobile 720w, native 24fps
  img/                  editorial stills + OG image (all cut from the supplied footage)
  fonts/                Anton, Instrument Serif, Manrope (self-hosted, SIL OFL, latin subset)
  vendor/               GSAP 3, ScrollTrigger, Lenis (vendored, no CDN dependency)
api/
  order.js              POST: validate → deliver (email / SMS / webhook)
  config.js             GET: public contact info + whether ordering is connected
  _lib/                 validation + delivery channels
scripts/
  extract-frames.sh     video → frame sets
  dev-server.mjs        local preview incl. the API
  verify.mjs            screenshots at 8 viewports, errors, overflow, canvas sampling, jank
  e2e-concierge.mjs     walks the concierge end to end and checks the delivered payload
source/                 original footage (not deployed)
```

## Run locally

```bash
cd taylormadegoodies
npm install          # only needed for the verification scripts (playwright-core)
npm run dev          # http://localhost:4173
npm test             # API unit tests
```

Optional: copy `.env.example` to `.env.local` to test real delivery locally.

## Deploy to Vercel

1. In Vercel, **Add New → Project**, import this repository, and set **Root Directory** to
   `taylormadegoodies`. Framework preset: **Other**. No build command is needed; the output
   directory is set in `vercel.json` (`public`).
2. Add environment variables (Project → Settings → Environment Variables). See below.
3. Deploy. New projects can sit behind **Deployment Protection** (a Vercel login wall). To
   make the site public, turn it off under Project → Settings → Deployment Protection.

## Connect ordering (environment variables)

Order requests go to every channel that is configured. Configure at least one. Until then the
concierge still works: it tells the customer ordering isn't connected yet, keeps their draft,
and offers email/text/copy buttons (email and text appear only if public contact info is set).

| Channel | Variables | Notes |
|---|---|---|
| Email ([Resend](https://resend.com)) | `RESEND_API_KEY`, `ORDER_EMAIL`, `ORDER_FROM_EMAIL` | Reference photos arrive as attachments. `ORDER_FROM_EMAIL` must use a domain verified in Resend. `ORDER_CONFIRM_CUSTOMER=true` also emails the customer a copy. |
| SMS (Twilio) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `ORDER_SMS_NUMBER` | Short summary text to the owner's phone. |
| Webhook | `ORDER_WEBHOOK_URL`, `ORDER_WEBHOOK_SECRET` | Use this for Zapier / Make / Slack / Airtable / Square / a POS. JSON body: `{ id, receivedAt, lead, summary }`; the secret is sent as `X-TMG-Secret`. `ORDER_WEBHOOK_INCLUDE_IMAGES=true` adds photos as data URLs. |
| Public contact | `PUBLIC_CONTACT_EMAIL`, `PUBLIC_CONTACT_PHONE`, `PUBLIC_INSTAGRAM_URL` | Shown in the CTA, footer and concierge fallback. Leave blank to hide. |

The payload (`OrderLead`, documented in `public/js/lib/orders.js`):

```ts
{ name, email?, phone?, orderType, products?, quantity?, eventType?, eventDate?,
  fulfillment?: "pickup" | "delivery", theme?, colors?, notes?, referenceImages? }
```

Taking payment is not wired in. Nothing on the site states prices, so the concierge collects the
request and the business confirms pricing and timing with the customer. When there's a real
menu and pricing, a Square or Stripe checkout link can go into the concierge's success step.

## The film: two chapters, one shot

`public/js/film-config.js` lists the chapters, which play back to back as one frame index:

| Chapter | Source | Frames | Layout |
|---|---|---|---|
| `a-mural` | Video A (Atlanta mural), frames 0–124 | 125 | `cover`: full-bleed, 1600w desktop / 960w mobile |
| `b-goodies` | Video B (desserts), all frames | 241 | `portal`: feathered window, 1080w / 720w |

The mural is cut at frame 124, where the cookie flies into the lens and fills the frame. A
circular portal opens out of that cookie into the dessert film (`FILM.portal`, 0.30 → 0.36
progress). The source then pulls back out to the wall, which would reverse the camera
direction, so that part isn't used.

Re-extracting or swapping footage:

```bash
FFMPEG=ffmpeg DESKTOP_W=1600 MOBILE_W=960 scripts/extract-frames.sh source/video-a-mural.mp4 a-mural 0 125
FFMPEG=ffmpeg scripts/extract-frames.sh source/video-b-goodies.mp4 b-goodies
```

If a frame count changes, update it in `film-config.js`. Then re-time the portal window, the
readout, and the `data-in / data-peak / data-out` values on the `.beat` elements in `index.html`
(all are 0–1 progress through the whole film). The film's scroll length is `.film { height }`
in `site.css` (940vh desktop, 680vh mobile).

Phones and portrait tablets (`FILM.mobileQuery`) get their own composition: the mural fills the
top ~64% of the screen and the copy sits below it.

## Content still needed from the business

So nothing is invented, these are deliberately absent until real information exists:
founder story and photos, real product photography and names, menu and pricing, service area
and lead times, delivery policy, social handles, and reviews or event photos (a proof section can
be added once there is real content).

## Verify

```bash
npm run dev &                                    # or point at a preview URL
node scripts/verify.mjs http://localhost:4173    # writes verify-out/ + report.json
node scripts/e2e-concierge.mjs http://localhost:4173 fallback
DEV_CAPTURE=1 ORDER_WEBHOOK_URL=http://localhost:4174/__capture node scripts/dev-server.mjs 4174 &
node scripts/e2e-concierge.mjs http://localhost:4174 sent
```

Dev contract: `?jump=<scrollY>` loads pre-scrolled with all scroll state settled,
`window.__ready` flips once the page is ready, and `?debug` logs frame-time p95/max.
