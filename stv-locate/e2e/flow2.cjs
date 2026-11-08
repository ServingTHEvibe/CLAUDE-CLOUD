const L = require(__dirname + '/lib.cjs');
const { check } = L;
const before = require(process.cwd() + '/state.json').assets;
(async () => {
  const browser = await L.chromium.launch();
  const { ctx, page } = await L.newPhone(browser, { storageState: 'storage.json', geolocation: { latitude: 41.58682, longitude: -93.62496, accuracy: 18 }, permissions: ['geolocation'] });
  await L.mockProviders(page);
  // a. reopen app: unfinished session resumes at the building
  await page.goto(L.BASE + '/');
  await page.waitForSelector('.fp h2:has-text("E2E Plant")', { timeout: 20000 });
  check('Reload: unfinished session reopens the same building', true);
  await page.waitForTimeout(800);
  check('Reopen: 4 machine pins + building pin on map', await page.locator('.equipment-map-marker').count() === 5, 'markers=' + await page.locator('.equipment-map-marker').count());
  check('Reopen: building outline drawn', await page.locator('.fp-map svg path').count() >= 1);
  // b. overlap chooser
  await page.locator('.equipment-map-marker[title="Drink vending machine"]').click({ force: true });
  await page.waitForSelector('.map-pin-picker');
  const choices = await page.locator('.map-pin-choices button strong').allTextContents();
  check('Overlap: chooser lists the machines sharing the spot', choices.includes('Drink vending machine') && choices.includes('Snack vending machine'), choices.join(', '));
  await page.locator('.map-pin-choices button', { hasText: 'Snack vending machine' }).click();
  check('Overlap: picking Snack opens Snack sheet', (await page.locator('.fp-machine-name').textContent()) === 'Snack vending machine');
  await page.screenshot({ path: 'new-05-snack-sheet.png' });
  // c. each machine opens its own sheet from the list, with its own details/photos
  for (const a of before) {
    await page.getByRole('button', { name: 'Back to all machines' }).click().catch(() => {});
    await page.locator('.fp-list button', { hasText: a.name }).first().click();
    const name = await page.locator('.fp-machine-name').textContent();
    const id = await page.locator('text=Record ID').textContent();
    let photoOk = true;
    if (a.photos.length) photoOk = await page.locator('.fp-photos.large img').first().evaluate(img => img.complete ? img.naturalWidth > 0 : new Promise(r => img.onload = () => r(img.naturalWidth > 0)));
    check(`Sheet: ${a.name} opens its own record`, name === a.name && id.includes(a.id) && photoOk, photoOk ? '' : 'photo did not load');
  }
  // d. move one machine; others stay put
  await page.getByRole('button', { name: 'Back to all machines' }).click();
  await page.locator('.fp-list button', { hasText: 'Breakroom cooler' }).click();
  await page.getByRole('button', { name: 'Move pin' }).click();
  await L.tapMap(page, 0.7, 0.62);
  await page.getByRole('button', { name: 'Save new position' }).click();
  await page.waitForSelector('text=Changes to “Breakroom cooler” saved');
  let { assets } = await L.api(page, '/api/assets');
  const moved = assets.find(a => a.name === 'Breakroom cooler'), old = before.find(a => a.name === 'Breakroom cooler');
  check('Move: cooler pin moved', moved.lat !== old.lat || moved.lng !== old.lng, `${old.lat},${old.lng} -> ${moved.lat},${moved.lng}`);
  const others = before.filter(a => a.name !== 'Breakroom cooler').every(b => { const n = assets.find(x => x.id === b.id); return n && n.lat === b.lat && n.lng === b.lng; });
  check('Move: other 3 machines unchanged', others);
  check('Move: no record created', assets.length === 4);
  // e. forced photo upload failure, retry
  await page.getByRole('button', { name: 'Back to all machines' }).click();
  await page.getByRole('button', { name: 'Add equipment' }).click();
  await L.tapMap(page, 0.6, 0.4);
  await page.getByRole('button', { name: 'Coffee station' }).click();
  await page.getByLabel('Room / area').fill('Lobby');
  let failFiles = true;
  await page.route('**/api/files', r => failFiles && r.request().method() === 'POST' ? r.fulfill({ status: 503, json: { error: 'The photo could not be uploaded. Keep your editor open and retry.' } }) : r.continue());
  await page.getByLabel('Take photo').setInputFiles('machine2.png');
  await page.waitForSelector('.fp-photo-fail');
  check('Photo failure: shown as not attached with Retry', await page.getByRole('button', { name: 'Retry' }).count() === 1);
  await page.screenshot({ path: 'new-06-photo-failed.png' });
  // reload during the failure: draft + failed photo survive
  await page.reload();
  await page.waitForSelector('text=We restored your unsaved work', { timeout: 20000 });
  check('Reload mid-draft: draft restored', (await page.getByLabel('Room / area').inputValue()) === 'Lobby');
  check('Reload mid-draft: failed photo kept for retry', await page.getByRole('button', { name: 'Retry' }).count() === 1);
  failFiles = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.waitForSelector('figcaption.ok');
  check('Photo retry: attached', await page.locator('.fp-photo-fail').count() === 0);
  // f. forced save failure where server stored it but the reply was lost -> retry must not duplicate
  let lose = true;
  await page.route('**/api/assets', async r => {
    if (r.request().method() !== 'POST' || !lose) return r.continue();
    lose = false; const resp = await r.fetch(); await resp.text();
    return r.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' });
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForSelector('.fp-error');
  check('Save failure: error shown, form kept', (await page.getByLabel('Room / area').inputValue()) === 'Lobby');
  await page.screenshot({ path: 'new-07-save-failed.png' });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForSelector('text=Saved “Coffee station”');
  ({ assets } = await L.api(page, '/api/assets'));
  check('Save retry: exactly one Coffee station record (no duplicate)', assets.filter(a => a.name === 'Coffee station').length === 1 && assets.length === 5, 'total=' + assets.length);
  check('Save retry: retried record has its photo', assets.find(a => a.name === 'Coffee station').photos.length === 1);
  // double tap protection
  await page.getByRole('button', { name: 'Back to all machines' }).click();
  await page.getByRole('button', { name: 'Add equipment' }).click();
  await L.tapMap(page, 0.4, 0.62);
  await page.getByRole('button', { name: 'Water cooler' }).click();
  const btn = page.getByRole('button', { name: 'Save', exact: true });
  await btn.evaluate(b => { b.click(); b.click(); b.click(); });
  await page.waitForSelector('text=Saved “Water cooler”');
  ({ assets } = await L.api(page, '/api/assets'));
  check('Repeat taps on Save: one record', assets.filter(a => a.name === 'Water cooler').length === 1, 'total=' + assets.length);
  // g. area photo
  await page.getByRole('button', { name: 'Back to all machines' }).click();
  await page.getByLabel('Area name for the next area photo').fill('Breakroom');
  await page.getByLabel('Capture this area').setInputFiles('area.png');
  await page.waitForSelector('text=Area photo saved to this building');
  const { locations } = await L.api(page, '/api/locations');
  const site = locations.find(l => l.name === 'E2E Plant');
  const ap = site.interior?.photos?.[0];
  const ids = before.filter(a => a.room === 'Breakroom').map(a => a.id);
  check('Area photo: saved on the building with the machines in that room', ap && ap.label === 'Breakroom' && ids.every(i => ap.assetIds.includes(i)), ap && ap.assetIds.length + ' machines linked');
  await page.screenshot({ path: 'new-08-area.png', fullPage: false });
  // h. finish -> confirmation, then reload & reopen
  await page.getByRole('button', { name: 'Finish' }).click();
  const msg = await page.locator('.field-success').textContent();
  check('Finish: clear saved confirmation', /machines saved at E2E Plant to your account/.test(msg), msg);
  await page.reload();
  await page.waitForSelector('button.field-add');
  await page.waitForTimeout(800);
  check('After Finish + reload: planner does not reopen by itself', await page.locator('.fp').count() === 0);
  await page.locator('button.field-add').click();
  await page.locator('.fp-list button', { hasText: 'E2E Plant' }).click();
  await page.waitForTimeout(800);
  check('Reopen building: 6 machines + building pin', await page.locator('.equipment-map-marker').count() === 7);
  check('Reopen building: area photo listed', await page.locator('img[alt="Area photo: Breakroom"]').count() === 1);
  const sitePin = locations.find(l => l.name === 'E2E Plant');
  check('Building pin unchanged by machine edits', Math.abs(sitePin.lat - 41.58682) < 1e-9 && Math.abs(sitePin.lng + 93.62496) < 1e-9, `${sitePin.lat},${sitePin.lng}`);
  await page.screenshot({ path: 'new-09-reopen.png' });
  await browser.close();
  const failed = L.results.filter(r => !r.ok).length; console.log('flow2 done, failures:', failed); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
