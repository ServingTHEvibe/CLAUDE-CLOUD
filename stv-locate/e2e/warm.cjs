const L = require(__dirname + '/lib.cjs');
(async () => { const b = await L.chromium.launch(); const { page } = await L.newPhone(b); await L.mockProviders(page); await L.signIn(page); await page.locator('button.field-add').click(); await page.waitForTimeout(6000); await page.reload(); await page.waitForTimeout(3000); await page.evaluate(() => localStorage.clear()); await b.close(); })();
