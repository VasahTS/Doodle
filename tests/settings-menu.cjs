const { launch } = require('./browser.cjs');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
  const browser = await launch();
  const errors = [];
  try {
    const url = pathToFileURL(path.join(__dirname, '../src/index.html')).href;
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'pt-BR' });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url); await page.waitForFunction(() => !!window.__doodle);
    const gear = page.locator('#btnSettings'), menu = page.locator('#settingsMenu');
    await gear.click(); assert.equal(await menu.isVisible(), true);
    assert.equal(await gear.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#btnUpdates').isDisabled(), true);
    assert.equal(await page.locator('#updatesBrowserHint').isVisible(), true);
    assert.equal(await page.locator('#top #btnKeys').count(), 0);
    assert.equal(await page.locator('#fileMenu [data-lang], #fileMenu #btnUpdates').count(), 0);
    console.log('PASS Gear contains shortcuts, language and browser update availability');
    await page.locator('[data-lang="en"]').click();
    assert.equal(await menu.isVisible(), false);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en-US');
    assert.equal(await gear.getAttribute('aria-label'), 'Settings');
    await gear.click();
    assert.equal(await page.locator('[data-lang="en"]').getAttribute('aria-checked'), 'true');
    assert.match(await page.locator('#btnUpdates').textContent(), /Check for updates/);
    await page.locator('[data-lang="pt"]').click();
    await page.waitForTimeout(400); await page.reload(); await page.waitForFunction(() => !!window.__doodle);
    assert.equal(await gear.getAttribute('aria-label'), 'Configurações');
    console.log('PASS Language changes translate settings and persist after reload');
    await gear.click(); await page.locator('#btnKeys').click();
    assert.equal(await page.locator('#mKeys').isVisible(), true);
    assert.equal(await menu.isVisible(), false);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#mKeys').isVisible(), true);
    await page.keyboard.press('Escape');
    console.log('PASS Shortcuts open from Settings and Ctrl+K');
    await gear.click(); await page.keyboard.press('Escape');
    assert.equal(await menu.isVisible(), false);
    assert.equal(await gear.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Space'); assert.equal(await menu.isVisible(), true);
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.lang), 'en');
    await page.keyboard.press('Home'); assert.equal(await page.evaluate(() => document.activeElement.id), 'btnKeys');
    await page.keyboard.press('ArrowUp'); assert.equal(await page.evaluate(() => document.activeElement.dataset.lang), 'en');
    await page.keyboard.press('Escape'); await page.keyboard.press('ArrowUp');
    assert.equal(await menu.isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.lang), 'en');
    await page.keyboard.press('Escape');
    console.log('PASS Keyboard opening, focus, arrow navigation and Escape');
    await gear.click(); await page.locator('#fileBtn').click();
    assert.equal(await menu.isVisible(), false); assert.equal(await page.locator('#fileMenu').isVisible(), true);
    await gear.click(); assert.equal(await page.locator('#fileMenu').isVisible(), false);
    await page.locator('.brand').click(); assert.equal(await menu.isVisible(), false);
    assert.equal(await gear.getAttribute('aria-expanded'), 'false');
    console.log('PASS Menus are mutually exclusive and close on outside click');
    for (const width of [820, 390]) {
      await page.setViewportSize({ width, height: 640 }); await gear.click();
      const box = await menu.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 640);
      await page.keyboard.press('Escape');
    }
    console.log('PASS Menu stays within narrow windows');
    assert.equal(await page.evaluate(() => __doodle.S.dirty), false);
    await page.setViewportSize({ width: 1366, height: 768 }); await gear.click();
    if (process.env.DOODLE_SCREENSHOT) await page.screenshot({ path: process.env.DOODLE_SCREENSHOT });
    // Exercise the installed-app UI with a local updater stub; no network or installer.
    const nativeContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'pt-BR', colorScheme: 'dark' });
    await nativeContext.addInitScript(() => {
      localStorage.setItem('doodle.lastUpdateCheck', String(Date.now()));
      window.updateChecks = 0; window.updateResult = 'current';
      window.__TAURI__ = {
        app: { getVersion: async () => '9.8.7' },
        updater: { check: async () => {
          window.updateChecks++;
          if (window.updateResult === 'error') throw new Error('Test offline');
          if (window.updateResult === 'available') return { version: '9.9.0', downloadAndInstall: () => { throw new Error('Must not install'); } };
          return null;
        } },
      };
    });
    const app = await nativeContext.newPage(); app.on('pageerror', e => errors.push(e.message));
    await app.goto(url); await app.waitForFunction(() => !!window.__doodle);
    await app.locator('#btnSettings').click();
    assert.equal(await app.locator('#btnUpdates').isEnabled(), true);
    assert.equal(await app.locator('#appVersion').textContent(), 'v9.8.7');
    assert.equal(await app.locator('#updatesBrowserHint').isVisible(), false);
    if (process.env.DOODLE_NATIVE_SCREENSHOT) await app.screenshot({ path: process.env.DOODLE_NATIVE_SCREENSHOT });
    await app.locator('#btnUpdates').click();
    await app.waitForFunction(() => updateChecks === 1);
    assert.equal(await app.locator('#settingsMenu').isVisible(), false);
    assert.match(await app.locator('#toast').textContent(), /versão mais nova/);
    await app.evaluate(() => { updateResult = 'available'; });
    await app.locator('#btnSettings').click(); await app.locator('#btnUpdates').click();
    assert.equal(await app.locator('#updBanner').isVisible(), true);
    assert.match(await app.locator('#updText').textContent(), /9\.9\.0/);
    await app.locator('#updLater').click();
    await app.evaluate(() => { updateResult = 'error'; });
    await app.locator('#btnSettings').click(); await app.locator('#btnUpdates').click();
    assert.match(await app.locator('#toast').textContent(), /Não consegui procurar/);
    console.log('PASS Installed-app update action, version, current/available/error states with stub');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
