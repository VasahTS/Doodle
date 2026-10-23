const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: process.env.DOODLE_BROWSER || 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'pt-BR' });
  try {
    await context.addInitScript(() => {
      window.closeTest = { dialogs: [], writes: [], destroyed: 0, destination: 'C:/art/Sketch.ora', hold: false, fail: false, opened: 0 };
      const win = {
        onCloseRequested(callback) { window.requestClose = () => {
          const event = { prevented: false, preventDefault() { this.prevented = true; } };
          closeTest.event = event; return callback(event);
        }; },
        async destroy() { closeTest.destroyed++; },
      };
      window.__TAURI__ = {
        window: { getCurrentWindow: () => win },
        dialog: {
          save: async options => { closeTest.dialogs.push(options); return closeTest.destination; },
          open: async () => { closeTest.opened++; return null; },
        },
        fs: { writeFile: async (file, bytes) => {
          closeTest.writes.push({ file, bytes: Array.from(bytes) });
          if (closeTest.fail) throw new Error('Test write failure');
          if (closeTest.hold) await new Promise(resolve => { window.finishWriting = resolve; });
        } },
      };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, '../src/index.html')).href);
    await page.waitForFunction(() => !!window.__doodle && !!window.requestClose);
    await page.evaluate(() => {
      __doodle.runAction('file.new'); document.querySelector('#newW').value = 16; document.querySelector('#newH').value = 16;
      document.querySelector('#newCreate').click();
    });
    const request = async () => {
      await page.evaluate(() => { window.closeDone = false; window.closePromise = requestClose().then(() => { window.closeDone = true; }); });
    };
    const done = () => page.waitForFunction(() => closeDone);
    const dirty = () => page.evaluate(() => {
      __doodle.doc.active.ctx.fillStyle = '#c8402f'; __doodle.doc.active.ctx.fillRect(1, 1, 5, 5);
      __doodle.afterDocChange(true);
    });
    await request(); await done();
    assert.equal(await page.evaluate(() => closeTest.event.prevented), false);
    assert.equal(await page.locator('#mConfirm').isVisible(), false);
    console.log('PASS Clean documents close normally');
    await dirty();
    for (const action of ['cancel', 'escape', 'outside']) {
      await request(); assert.equal(await page.locator('#confirmSave').isVisible(), true);
      assert.equal(await page.locator('#confirmSave').textContent(), 'Salvar e sair');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'confirmSave');
      if (action === 'cancel') await page.locator('#confirmNo').click();
      else if (action === 'escape') await page.keyboard.press('Escape');
      else await page.mouse.click(4, 100);
      await done(); assert.equal(await page.evaluate(() => __doodle.S.dirty && closeTest.destroyed === 0 && closeTest.writes.length === 0), true);
    }
    console.log('PASS Three choices, safe focus, Cancel, Escape and outside click retain unsaved pixels');
    await page.evaluate(() => { closeTest.destination = null; });
    await request(); await page.locator('#confirmSave').click(); await done();
    assert.equal(await page.evaluate(() => __doodle.S.dirty && closeTest.destroyed === 0 && closeTest.writes.length === 0), true);
    console.log('PASS Cancelling the native save dialog keeps the app open');
    await page.evaluate(() => { closeTest.destination = 'C:/art/Sketch.ora'; closeTest.fail = true; });
    await request(); await page.locator('#confirmSave').click(); await done();
    assert.equal(await page.evaluate(() => __doodle.S.dirty && closeTest.destroyed === 0), true);
    assert.match(await page.locator('#toast').textContent(), /Test write failure/);
    console.log('PASS Write errors retain unsaved data and prevent closing');
    await page.evaluate(() => { closeTest.fail = false; closeTest.hold = true; closeTest.writes = []; closeTest.dialogs = []; });
    await request(); await page.locator('#confirmSave').click();
    await page.waitForFunction(() => !!window.finishWriting);
    assert.equal(await page.locator('#mConfirm .modal').getAttribute('aria-busy'), 'true');
    assert.equal(await page.locator('#confirmYes').isDisabled(), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.querySelector('#app').inert && !document.querySelector('#app').contains(document.activeElement)), true);
    await page.evaluate(() => requestClose());
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#mConfirm').isVisible(), true);
    assert.equal(await page.evaluate(() => closeTest.destroyed), 0);
    assert.equal(await page.evaluate(() => closeTest.writes.length), 1);
    await page.evaluate(() => finishWriting()); await done();
    assert.equal(await page.evaluate(() => closeTest.destroyed === 1 && !__doodle.S.dirty), true);
    assert.equal(await page.locator('#mConfirm').isVisible(), false);
    assert.equal(await page.locator('#confirmNo').isEnabled(), true);
    assert.equal(await page.locator('#app').evaluate(el => el.inert), false);
    const saved = await page.evaluate(async () => {
      await __doodle.loadOra(Uint8Array.from(closeTest.writes[0].bytes));
      return { pixel: Array.from(__doodle.doc.active.ctx.getImageData(2, 2, 1, 1).data),
        file: closeTest.writes[0].file, filter: closeTest.dialogs[0].filters[0].extensions };
    });
    assert.deepEqual(saved.pixel, [200, 64, 47, 255]); assert.equal(saved.file, 'C:/art/Sketch.ora'); assert.deepEqual(saved.filter, ['ora']);
    console.log('PASS Save and exit waits for the complete ORA write, blocks duplicate closes and produces a recoverable drawing');
    await dirty(); await page.evaluate(() => { closeTest.hold = false; closeTest.dialogs = []; closeTest.writes = []; });
    await request(); await page.locator('#confirmSave').click(); await done();
    assert.equal(await page.evaluate(() => closeTest.dialogs.length), 0);
    assert.equal(await page.evaluate(() => closeTest.writes[0].file), 'C:/art/Sketch.ora');
    console.log('PASS Existing documents save to their current ORA path');
    await dirty(); await page.evaluate(() => { closeTest.hold = true; delete window.finishWriting; __doodle.runAction('file.save'); });
    await page.waitForFunction(() => !!window.finishWriting);
    await request(); await done();
    assert.equal(await page.evaluate(() => closeTest.event.prevented), true);
    assert.equal(await page.locator('#mConfirm').isVisible(), false);
    assert.equal(await page.evaluate(() => closeTest.destroyed), 2);
    await page.evaluate(() => { closeTest.hold = false; finishWriting(); });
    await page.waitForFunction(() => !__doodle.S.dirty);
    console.log('PASS Closing during an existing save cannot interrupt the file write');
    await dirty(); await page.evaluate(() => { closeTest.writes = []; });
    await request(); await page.locator('#confirmYes').click(); await done();
    assert.equal(await page.evaluate(() => closeTest.writes.length), 0);
    assert.equal(await page.evaluate(() => closeTest.destroyed), 3);
    console.log('PASS Exit without saving closes without writing');
    await page.evaluate(() => __doodle.runAction('file.open'));
    assert.equal(await page.locator('#confirmSave').isVisible(), false);
    await page.locator('#confirmNo').click();
    assert.equal(await page.evaluate(() => closeTest.opened), 0);
    await page.locator('[data-lang="en"]').evaluate(el => el.click());
    await request(); assert.equal(await page.locator('#confirmSave').textContent(), 'Save and exit');
    assert.equal(await page.locator('#confirmYes').textContent(), 'Exit without saving');
    await page.locator('#confirmNo').click(); await done();
    assert.deepEqual(errors, []);
    if (process.env.DOODLE_SCREENSHOT) { await request(); await page.screenshot({ path: process.env.DOODLE_SCREENSHOT }); await page.locator('#confirmNo').click(); await done(); }
    console.log('PASS English translation, existing two-choice confirmations and no script errors');
  } finally { await context.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
