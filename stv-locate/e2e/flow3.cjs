const L = require(__dirname + '/lib.cjs');
const { check } = L;
(async () => {
  const browser = await L.chromium.launch();
  // A. Denied GPS (no permission granted)
  {
    const { ctx, page } = await L.newPhone(browser, { storageState: 'storage.json' });
    await L.mockProviders(page);
    await page.goto(L.BASE + '/'); await page.waitForTimeout(2500); if (await page.locator('.fp').count()) await page.locator('.fp-finish').click(); await page.waitForSelector('button.field-add');
    await page.locator('button.field-add').click();
    await page.getByRole('button', { name: 'Use my GPS' }).click();
    await page.waitForSelector('text=GPS isn\'t available');
    const t = await page.locator('.fp-card.warn').textContent();
    check('Denied GPS: clear message, no location assumed', /Location permission is off/.test(t) && await page.locator('.gps-you-are-here').count() === 0, t.slice(0, 80));
    check('Denied GPS: address and map fallbacks offered', await page.getByRole('button', { name: 'Pick building on map' }).count() === 1);
    await page.screenshot({ path: 'new-10-gps-denied.png' });
    // B. Approximate address: pick result, then tap the real roof
    await page.getByLabel('Street address').fill('Test Ave, Des Moines IA');
    await page.getByRole('button', { name: 'Find address' }).click();
    await page.waitForSelector('text=Approximate — check the roof');
    check('Approximate address: result labeled approximate', true);
    await page.locator('.fp-results button').first().click();
    await page.waitForSelector('text=Approximate address match');
    await page.screenshot({ path: 'new-11-approx.png' });
    await L.tapMap(page, 0.62, 0.62);
    const addr = await page.getByLabel('Address').inputValue();
    check('Approximate address: tapping roof keeps typed/returned address', addr.startsWith('Test Ave'), addr);
    await page.getByLabel('Business / building name').fill('Approx Depot');
    await page.getByRole('button', { name: 'Confirm building' }).click();
    await page.waitForSelector('.fp-card strong:has-text("Tap where the machine is")');
    const { locations } = await L.api(page, '/api/locations');
    const dep = locations.find(l => l.name === 'Approx Depot');
    check('Approximate address: building saved at the tapped roof, not the geocoder point', dep && (dep.lat !== 41.587 || dep.lng !== -93.626), dep && `${dep.lat},${dep.lng}`);
    // C. Sign-in recovery keeps the draft
    await L.tapMap(page, 0.5, 0.5);
    await page.getByRole('button', { name: 'Snack vending machine' }).click();
    await page.getByLabel('Room / area').fill('Front office');
    await page.route('**/api/assets', r => r.request().method() === 'POST' ? r.fulfill({ status: 401, body: 'Unauthorized' }) : r.continue());
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForSelector('text=Sign in again — your draft is kept');
    await page.unroute('**/api/assets');
    await page.getByRole('link', { name: 'Sign in again — your draft is kept' }).click();
    await page.waitForSelector('text=We restored your unsaved work', { timeout: 20000 });
    check('Sign-in recovery: returns to the same draft', (await page.getByLabel('Room / area').inputValue()) === 'Front office');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForSelector('text=Saved “Snack vending machine”');
    check('Sign-in recovery: save succeeds afterwards', true);
    await ctx.close();
  }
  // D/E/F. Indoor: floor plan, LiDAR RoomPlan import, GLB import + reopen
  {
    const { ctx, page } = await L.newPhone(browser, { storageState: 'storage.json' });
    await L.mockProviders(page);
    page.on('dialog', d => d.accept());
    await page.goto(L.BASE + '/'); await page.waitForTimeout(2500); if (await page.locator('.fp').count()) await page.locator('.fp-finish').click(); await page.waitForSelector('button.field-add');
    await page.locator('button.field-add').click();
    await page.locator('.fp-list button', { hasText: 'E2E Plant' }).click();
    const drinkBefore = (await L.api(page, '/api/assets')).assets.find(a => a.name === 'Drink vending machine');
    await page.getByRole('button', { name: 'Indoor plan & 3D' }).click();
    await page.getByRole('button', { name: 'Photograph a plan or sketch one' }).click();
    await page.waitForSelector('.interior-modal');
    await page.getByLabel('Upload floor plan').setInputFiles('plan.png');
    await page.waitForSelector('text=Plan photo loaded');
    await page.getByRole('button', { name: 'Place indoors: Drink vending machine' }).click();
    const area = page.locator('[aria-label="Plan placement area"]');
    await area.scrollIntoViewIfNeeded();
    const box = await area.boundingBox();
    await page.mouse.click(box.x + box.width * 0.4, box.y + Math.min(box.height * 0.5, 40));
    await page.screenshot({ path: 'dbg-plan.png' });
    await page.getByRole('button', { name: 'Save interior layout' }).click();
    await page.waitForTimeout(1500);
    let { locations } = await L.api(page, '/api/locations');
    let site = locations.find(l => l.name === 'E2E Plant');
    check('Floor plan: photo saved privately as a reference plan', site.layout?.reference?.key?.startsWith('local_seedy/'));
    const drink = (await L.api(page, '/api/assets')).assets.find(a => a.name === 'Drink vending machine');
    check('Floor plan: machine marked on the plan', site.layout?.planPins?.some(p => p.assetId === drink.id));
    check('Floor plan: aerial pin of that machine unchanged', drink.lat === drinkBefore.lat && drink.lng === drinkBefore.lng && drink.updated === drinkBefore.updated);
    await page.screenshot({ path: 'new-12-floorplan.png' });
    await page.getByRole('button', { name: 'Back to equipment' }).click();
    // reopen after reload
    await page.reload(); await page.waitForTimeout(1500);
    if (!(await page.locator('.fp').count())) { await page.locator('button.field-add').click(); await page.locator('.fp-list button', { hasText: 'E2E Plant' }).click(); }
    await page.getByRole('button', { name: 'Indoor plan & 3D' }).click();
    const cur = await page.locator('.fp-card').first().textContent();
    check('Floor plan: reopens labeled "Reference photo"', /Reference photo of a plan/.test(cur) && /1 machines marked/.test(cur), cur.slice(0, 90));
    // E. LiDAR RoomPlan JSON import
    await page.getByLabel('Import measured LiDAR scan').setInputFiles('room-0.json');
    await page.waitForSelector('.interior-modal');
    await page.waitForTimeout(800);
    const notice = await page.locator('.interior-notice span').first().textContent();
    check('LiDAR import: studio labels it MEASURED SCAN', /MEASURED SCAN/i.test(notice), notice);
    await page.screenshot({ path: 'new-13-roomplan.png' });
    await page.getByRole('button', { name: 'Back to equipment' }).click();
    ({ locations } = await L.api(page, '/api/locations'));
    site = locations.find(l => l.name === 'E2E Plant');
    const xs = site.layout.sketch.flat().map(p => p.x), zs = site.layout.sketch.flat().map(p => p.z);
    const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...zs) - Math.min(...zs);
    check('LiDAR import: measured 4 m × 3 m walls recovered', site.layout.source === 'roomplan-scan' && site.layout.basis === 'measured' && Math.abs(Math.max(w, d) - 4) < 0.05 && Math.abs(Math.min(w, d) - 3) < 0.05, `${w.toFixed(2)} x ${d.toFixed(2)} m`);
    // F. GLB: bad file rejected, good file imported, marker placed, reopened
    await page.getByLabel('Model type').selectOption('measured-scan');
    await page.getByLabel('Upload reconstructed 3D location').setInputFiles({ name: 'bad.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from('not a model at all, sorry') });
    await page.waitForSelector('text=not a valid GLB');
    check('GLB: invalid file gets a usable error', true);
    await page.getByLabel('Upload reconstructed 3D location').setInputFiles('room.glb');
    await page.waitForSelector('.saved-model canvas', { timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.getByLabel('Mark equipment in this model').selectOption({ label: /Snack vending machine/.test(await page.getByLabel('Mark equipment in this model').innerText()) ? (await page.getByLabel('Mark equipment in this model').locator('option', { hasText: 'Snack vending machine' }).first().textContent()) : '' });
    await page.locator('.saved-model canvas').scrollIntoViewIfNeeded();
    const c = await page.locator('.saved-model canvas').boundingBox();
    await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
    await page.waitForSelector('text=1 equipment markers saved', { timeout: 10000 });
    ({ locations } = await L.api(page, '/api/locations'));
    site = locations.find(l => l.name === 'E2E Plant');
    check('GLB: saved privately with its "Measured scan" label', site.interior.model.key.startsWith('local_seedy/model-') && site.interior.model.kind === 'measured-scan');
    check('GLB: machine marker saved inside the model', site.interior.modelPins.length === 1);
    await page.reload(); await page.waitForTimeout(1500);
    if (!(await page.locator('.fp').count())) { await page.locator('button.field-add').click(); await page.locator('.fp-list button', { hasText: 'E2E Plant' }).click(); }
    await page.getByRole('button', { name: 'Indoor plan & 3D' }).click();
    await page.waitForSelector('.saved-model canvas', { timeout: 20000 });
    check('GLB: reopens with type label', await page.locator('text=Measured scan · room.glb').count() === 1);
    await page.locator('.model-marked button').first().click();
    const ident = await page.locator('.model-identified').textContent();
    check('GLB: saved machine can be identified inside the model', /Snack vending machine/.test(ident), ident);
    await page.locator('.saved-model').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'new-14-glb.png' });
    await ctx.close();
  }
  await browser.close();
  const failed = L.results.filter(r => !r.ok).length; console.log('flow3 done, failures:', failed); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
