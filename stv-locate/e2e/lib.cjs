const { chromium, devices } = require('playwright');
const BASE = 'http://localhost:5173';
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); }
async function mockProviders(page, opts = {}) {
  // External providers are blocked in this sandbox; simulate their responses.
  await page.route(/arcgisonline|tile\.openstreetmap\.org/, r => r.abort());
  await page.route('**/api/geocode?**', async route => {
    const u = new URL(route.request().url());
    if (u.searchParams.has('lat')) {
      if (opts.reverseFail) return route.fulfill({ status: 503, json: { error: 'Address lookup is unavailable.' } });
      return route.fulfill({ json: { result: { address: '1550 Test Ave, Des Moines, IA 50309', name: '', lat: +u.searchParams.get('lat'), lng: +u.searchParams.get('lng'), exact: true } } });
    }
    return route.fulfill({ json: { results: [
      { place_id: 'a1', display_name: 'Test Ave, Des Moines, Polk County, Iowa, 50309', name: '', lat: '41.58700', lon: '-93.62600', location_hint: 'approximate_area' },
    ] } });
  });
  await page.route('**/api/building-footprint?**', async route => {
    const u = new URL(route.request().url()); const lat = +u.searchParams.get('lat'), lng = +u.searchParams.get('lng');
    if (opts.noOutline) return route.fulfill({ status: 503, json: { error: 'unavailable' } });
    const d = 0.00018;
    return route.fulfill({ json: { outline: { source: 'osm', points: [{ lat: lat - d, lng: lng - d * 1.4 }, { lat: lat - d, lng: lng + d * 1.4 }, { lat: lat + d, lng: lng + d * 1.4 }, { lat: lat + d, lng: lng - d * 1.4 }] } } });
  });
}
async function newPhone(browser, extra = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], ...extra });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  return { ctx, page };
}
async function signIn(page) { await page.goto(BASE + '/signin-with-chatgpt?return_to=/'); await page.waitForSelector('button.field-add'); await page.waitForTimeout(800); }
async function tapMap(page, fx, fy) {
  const box = await page.locator('.fp-map .leaflet-container').boundingBox();
  await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(400);
}
async function api(page, path) { return page.evaluate(async p => (await fetch(p, { cache: 'no-store' })).json(), path); }
module.exports = { chromium, devices, BASE, results, check, mockProviders, newPhone, signIn, tapMap, api };
