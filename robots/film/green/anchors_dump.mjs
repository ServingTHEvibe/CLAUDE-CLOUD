// print a film's anchor table A, the parts' rest points the close-up cameras aim at (node sims/green/anchors_dump.mjs <entry> <global>)
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {CHROMIUM, CHROMIUM_ARGS, DIST, playwright} from '../../paths.mjs';

const [entry, glob] = process.argv.slice(2);
const {chromium} = playwright();
const browser = await chromium.launch({executablePath: CHROMIUM, args: CHROMIUM_ARGS});
const page = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
await page.addInitScript(() => {
  window.__CAPTURE = true;
  window.__SIM_CONFIG = {};
});
await page.goto(pathToFileURL(path.join(DIST, `${entry}.html`)).href);
await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 60000});
const out = await page.evaluate((g) => JSON.stringify(Object.fromEntries(Object.entries(window[g].A).map(([k, v]) => [k, v.map((x) => +x.toFixed(2))]))), glob);
console.log(out);
await browser.close();
