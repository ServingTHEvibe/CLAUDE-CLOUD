// End-to-end: walk the Goodie Concierge from first question to a delivered order.
//   node scripts/e2e-concierge.mjs <baseUrl> [expect=sent|fallback] [screenshotDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:4173';
const expect = process.argv[3] || 'sent';
const shots = process.argv[4];
const w = Number(process.env.W || 1440), h = Number(process.env.H || 900);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true, hasTouch: w < 900, isMobile: w < 900 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base);
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(() => localStorage.clear());

const panel = page.locator('.concierge__panel');
const chip = (t) => panel.locator('.concierge__composer .chip', { hasText: t }).first();
const shot = async (n) => shots && (fs.mkdirSync(shots, { recursive: true }), page.screenshot({ path: `${shots}/${n}.png` }));

await page.locator('[data-launcher]').click();
await chip('Birthday cake').click();
await panel.locator('.concierge__composer input[name=v]').fill('Vanilla with strawberries');
await panel.locator('.concierge__composer .send').click();
await chip('Birthday').click();
await chip('25').click();
await panel.locator('.concierge__composer input[type=date]').fill('2099-05-17');
await panel.locator('.concierge__composer .send').click();
await chip('Delivery').click();
await chip('Pink').click();
await chip('Gold').click();
await panel.locator('.concierge__composer input[name=theme]').fill('90s R&B');
await shot('01-theme');
await panel.locator('.concierge__composer .send').click();
// tiny generated PNG as a reference photo
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8Dwn4EIwDiqEAMAAMY/Af9jaM+kAAAAAElFTkSuQmCC', 'base64');
fs.writeFileSync('/tmp/tmg-ref.png', png);
await panel.locator('.concierge__composer input[type=file]').setInputFiles('/tmp/tmg-ref.png');
await panel.locator('.concierge__composer button[type=submit]:not([disabled])').click();
await panel.locator('.concierge__composer textarea').fill('Name on cake: Maya. No nuts please.');
await panel.locator('.concierge__composer .send').click();
await panel.locator('.concierge__composer input[name=v]').fill('Jada Taylor');
await panel.locator('.concierge__composer .send').click();
await panel.locator('#tmg-phone').fill('404-555-0100');
await panel.locator('#tmg-email').fill('jada@example.test');
await panel.locator('.concierge__composer button[type=submit]').click();
await panel.locator('.review').waitFor();
await shot('02-review');
// edit one field from the review card
await panel.locator('.review [data-edit="3"]').last().click();
await chip('50').click();
await panel.locator('.review').nth(1).waitFor();
const reviewText = await panel.locator('.review').last().innerText();
if (!reviewText.includes('50')) throw new Error('edit from review did not update quantity');
await panel.locator('.concierge__composer button[type=submit]', { hasText: 'Send my order' }).click();

if (expect === 'sent') {
  await panel.locator('.msg--bot', { hasText: 'Your reference' }).waitFor({ timeout: 10000 });
  await shot('03-sent');
  const captured = await (await fetch(`${base}/__capture`)).json();
  const l = captured.lead;
  const want = { name: 'Jada Taylor', orderType: 'Birthday cake', eventType: 'Birthday', quantity: 50, eventDate: '2099-05-17', fulfillment: 'delivery', theme: '90s R&B', referenceImageCount: 1 };
  for (const [k, v] of Object.entries(want)) if (l[k] !== v) throw new Error(`webhook ${k}: ${JSON.stringify(l[k])} != ${JSON.stringify(v)}`);
  if (l.colors.join() !== 'Pink,Gold') throw new Error('colors');
  console.log('SENT OK', captured.id, JSON.stringify(l));
} else {
  await panel.locator('.msg--bot', { hasText: 'still being connected' }).waitFor({ timeout: 10000 });
  await panel.locator('[data-copy]').waitFor();
  await shot('03-fallback');
  const draft = await page.evaluate(() => localStorage.getItem('tmg-concierge-v1'));
  if (!draft || !draft.includes('Jada')) throw new Error('draft not kept after failed send');
  console.log('FALLBACK OK; draft kept; email link:', await panel.locator('a[href^="mailto:"]').count());
}
if (errors.length) { console.error('page errors', errors); process.exit(1); }
await browser.close();
