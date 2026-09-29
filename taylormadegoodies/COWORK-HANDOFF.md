# Handoff: deploy the Taylor Made Goodies site to Vercel

Paste this into Claude Cowork (with Claude in Chrome available). The site is finished and
tested; what remains is creating the Vercel project in the browser and making it live.

## Where everything is

- Repo: https://github.com/ServingTHEvibe/CLAUDE-CLOUD
- Branch: `claude/quirky-hamilton-wl7tuc` (the site is NOT on `main` yet)
- Site folder: `taylormadegoodies/` (static site in `public/`, Vercel functions in `api/`,
  settings in `taylormadegoodies/vercel.json`, no build step)
- Vercel team: "servingthevibe-8631's projects"
- Leave the existing project `taylormadegoodies-6704-desktop` alone; it is a different repo.

## Steps (in Chrome, logged in to vercel.com)

1. Add New → Project → import **ServingTHEvibe/CLAUDE-CLOUD**.
2. Project name: `taylormadegoodies-scrollfilm`
3. Framework Preset: **Other**
4. Root Directory: **Edit → `taylormadegoodies`**
5. Leave build/output/install settings empty (vercel.json sets output to `public`). Click Deploy.
   This first deploy builds `main`, which doesn't contain the site, so it may fail. That's expected.
6. Deploy the branch to production, either way:
   - Project → Settings → Git → set **Production Branch** to `claude/quirky-hamilton-wl7tuc`,
     then Deployments → Redeploy (or push any commit), **or**
   - merge the branch into `main` on GitHub (open a PR from `claude/quirky-hamilton-wl7tuc`).
7. Make it public: Project → Settings → Deployment Protection. If Vercel Authentication is
   on for production, the site shows a login wall to visitors; turn it off for production.

## Check the live site

- The page loads on the Atlanta mural and scrolling plays the film: mural → push into the
  lettering → a cookie opens a circular portal → Taylor Made Goodies logo → dough, cookie,
  cake → "Made different. Made Taylor."
- `/api/config` returns JSON like `{"ordering":false,"contact":{}}`.
- Open the Goodie Concierge (bottom-right) and walk through an order. Until an order
  destination is configured, sending shows "Online ordering is still being connected" and
  offers Copy details. That is the intended fallback, not a bug.
- Check it on a real phone too: scrolling smoothness couldn't be measured where it was built.

## Connecting real orders (needs the owner's choice)

Set these in Project → Settings → Environment Variables, then redeploy. At least one channel:

- Email via Resend: `RESEND_API_KEY`, `ORDER_EMAIL`, `ORDER_FROM_EMAIL` (verified domain)
- SMS via Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `ORDER_SMS_NUMBER`
- Webhook (Zapier/Make/Slack/Airtable/POS): `ORDER_WEBHOOK_URL`, optional `ORDER_WEBHOOK_SECRET`
- Optional public contact shown on the site: `PUBLIC_CONTACT_EMAIL`, `PUBLIC_CONTACT_PHONE`,
  `PUBLIC_INSTAGRAM_URL`

Don't invent an email address or phone number. Only use ones the business owner supplies.
Full details are in `taylormadegoodies/README.md` and `taylormadegoodies/AUDIT.md`.
