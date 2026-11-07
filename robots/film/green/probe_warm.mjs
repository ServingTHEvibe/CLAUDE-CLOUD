// list the warm colours left on a green film's creature at time t (node sims/green/probe_warm.mjs <entry> <t> <global>)
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {CHROMIUM, CHROMIUM_ARGS, DIST, playwright} from '../../paths.mjs';
const [entry, t, glob] = process.argv.slice(2);
const {chromium} = playwright();
const browser = await chromium.launch({executablePath: CHROMIUM, args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
await page.addInitScript(() => { window.__CAPTURE = true; window.__SIM_CONFIG = {}; });
await page.goto(pathToFileURL(path.join(DIST, `${entry}.html`)).href);
await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 60000});
const res = await page.evaluate(([t, glob]) => {
  window.SIM.render(Number(t));
  const out = {};
  const warm = (c) => {
    if (!c?.isColor) return false;
    const k = Math.max(1e-6, c.r, c.g, c.b);
    const r = c.r / k, g = c.g / k, b = c.b / k;
    return r > 0.9 && b < 0.6 && g < 0.85 && r - b > 0.3;
  };
  const hex = (c) => [c.r, c.g, c.b].map((v) => v.toFixed(2)).join(',');
  const scene = window[glob].st.scene ?? null;
  const roots = [window[glob].oc?.root ?? window[glob].sp?.root ?? window[glob].fish?.root ?? window[glob].bee?.root];
  if (scene) roots.push(scene);
  for (const [ri, r] of roots.entries()) r.traverse((o) => {
    if (o.isLight && warm(o.color)) out[`${ri} light ${o.type} ${hex(o.color)}`] = (out[`${ri} light ${o.type} ${hex(o.color)}`] ?? 0) + 1;
    for (const m of [].concat(o.material || [])) for (const key of ['color', 'emissive', 'attenuationColor', 'sheenColor', 'specularColor']) if (warm(m[key])) { const id = `${ri} ${m.type} ${key} ${hex(m[key])} map:${!!m.map} emap:${!!m.emissiveMap} vc:${!!m.vertexColors}`; out[id] = (out[id] ?? 0) + 1; }
    for (const [nm, at] of [['vertex', o.geometry?.attributes?.color], ['instance', o.instanceColor]]) {
      if (!at) continue;
      let n = 0;
      const c = {isColor: true, r: 0, g: 0, b: 0};
      for (let i = 0; i < at.count; i++) {
        c.r = at.getX(i); c.g = at.getY(i); c.b = at.getZ(i);
        if (warm(c)) n++;
      }
      if (n) out[`${ri} ${nm} colours warm: ${n} of ${at.count}`] = (out[`${ri} ${nm} colours warm: ${n} of ${at.count}`] ?? 0) + 1;
    }
  });
  return out;
}, [t, glob]);
console.log(JSON.stringify(res, null, 1));
await browser.close();
