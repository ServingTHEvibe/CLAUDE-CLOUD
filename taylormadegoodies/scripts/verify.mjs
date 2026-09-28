// Headless verification: screenshots at every breakpoint and scroll beat, console and
// network errors, horizontal overflow, canvas pixel sampling, and a scroll jank test.
//   node scripts/verify.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:4173';
const out = process.argv[3] || 'verify-out';
fs.mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';

const VIEWPORTS = [
  ['desktop-1440', 1440, 900], ['desktop-1728', 1728, 1117], ['desktop-1920', 1920, 1080],
  ['tablet-1024', 1024, 1366], ['tablet-834', 834, 1194],
  ['mobile-390', 390, 844], ['mobile-393', 393, 852], ['mobile-430', 430, 932],
];
const FILM_POINTS = [0, 0.2, 0.38, 0.5, 0.66, 0.8, 0.95, 1];
const SECTIONS = ['#goodies', '.feature--right', '.bleed', '#custom', '#story', '#faq', '.cta', '.footer'];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;

const browser = await chromium.launch({ executablePath, args: ['--disable-gpu-sandbox'] });
const report = [];

async function open(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(350);
}

for (const [name, w, h] of VIEWPORTS) {
  if (only && !only.includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 900, isMobile: w < 900, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/api/order')) errors.push(`${r.status()} ${r.url()}`); });

  await open(page, `${base}/`);
  const filmLen = await page.evaluate(() => { const f = document.querySelector('[data-film]'); return f.offsetHeight - innerHeight; });
  const samples = [];
  for (const p of FILM_POINTS) {
    const y = Math.round(filmLen * p);
    await open(page, `${base}/?jump=${y}`);
    samples.push(await page.evaluate(() => {
      const c = document.querySelector('[data-canvas]');
      const d = c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
      return { rgb: [d[0], d[1], d[2]], cw: c.width, ch: c.height };
    }));
    await page.screenshot({ path: `${out}/${name}-film-${String(Math.round(p * 100)).padStart(3, '0')}.png` });
  }
  for (const sel of SECTIONS) {
    const y = await page.evaluate((s) => { const el = document.querySelector(s); return el.getBoundingClientRect().top + scrollY; }, sel);
    await open(page, `${base}/?jump=${Math.round(y)}`);
    await page.screenshot({ path: `${out}/${name}-section-${sel.replace(/[^a-z-]/g, '')}.png` });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  report.push({ name, overflow, errors: [...new Set(errors)], centerPixels: samples.map((s) => s.rgb.join(',')), canvas: `${samples[0].cw}x${samples[0].ch}` });
  await ctx.close();
}

// Jank: real scrolling through the film on desktop, per-frame rAF deltas.
if (!only || only.includes('jank')) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await open(page, `${base}/`);
  await page.waitForTimeout(2500);
  const jank = await page.evaluate(async () => {
    const deltas = []; let last = performance.now(), run = true;
    const loop = (t) => { deltas.push(t - last); last = t; if (run) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const end = document.querySelector('[data-film]').offsetHeight - innerHeight;
    for (let y = 0; y < end; y += 60) { window.scrollTo(0, y); await new Promise((r) => requestAnimationFrame(r)); }
    await new Promise((r) => setTimeout(r, 400)); run = false;
    const s = deltas.slice(3).sort((a, b) => a - b);
    return { frames: s.length, p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1) };
  });
  report.push({ name: 'jank-1440', ...jank });
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
