// print a film's camera every 0.5 s (node sims/green/cam_track.mjs <entry> <global> [step])
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {CHROMIUM, CHROMIUM_ARGS, DIST, playwright} from '../../paths.mjs';
const [entry, glob, step = '0.5'] = process.argv.slice(2);
const {chromium} = playwright();
const browser = await chromium.launch({executablePath: CHROMIUM, args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
await page.addInitScript(() => { window.__CAPTURE = true; window.__SIM_CONFIG = {}; });
await page.goto(pathToFileURL(path.join(DIST, `${entry}.html`)).href);
await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 60000});
const rows = await page.evaluate(([glob, step]) => {
  const T = window[glob].T;
  const out = [];
  for (let t = 0; t <= window.SIM.duration + 1e-6; t += Number(step)) {
    const s = T.stateAt(t);
    const c = s.cam;
    out.push(`${t.toFixed(1).padStart(5)}  ${String(s.view).padEnd(9)} az ${c.az.toFixed(0).padStart(4)}  el ${c.el.toFixed(0).padStart(3)}  d ${c.d.toFixed(1)}`);
  }
  return out;
}, [glob, step]);
console.log(rows.join('\n'));
await browser.close();
