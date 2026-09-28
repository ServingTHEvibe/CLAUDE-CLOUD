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
  js/film-config.js     chapter list (add the mural footage here), readout labels
  js/concierge.js       Goodie Concierge conversation + UI
  js/lib/orders.js      OrderLead payload, submitOrder(), config, image compression
  film/<chapter>/{d,m}/ WebP frames, desktop 1080w / mobile 720w, native 24fps
  img/                  editorial stills + OG image (all cut from the supplied footage)
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

## Add the Atlanta mural footage (Video A)

Only the dessert footage (Video B) was available for this build. To open the film on the mural:

```bash
FFMPEG=ffmpeg scripts/extract-frames.sh path/to/mural.mp4 a-mural        # prints the frame count
```

Then, in `public/js/film-config.js`:
- put `{ id: 'a-mural', frames: <count> }` **first** in `chapters`
- set `aspect` to the footage's aspect if it differs (both chapters should match)
- add a readout entry for the mural chapter

Finally, re-time the `data-in / data-peak / data-out` values on the `.beat` elements in
`index.html`. They are 0–1 progress through the whole film. Consider raising `.film { height }`
in `site.css` so the longer film keeps the same scroll pace.

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
