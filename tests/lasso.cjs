const { launch } = require('./browser.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const url = pathToFileURL(path.join(__dirname, '../src/index.html')).href, errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url); await page.waitForFunction(() => !!window.__doodle);
    await page.keyboard.press('l');
    await page.evaluate(() => {
      const d = __doodle;
      window.testLasso = {
        event(type, x, y, modifiers = {}) {
          const view = document.querySelector('#view'), box = view.getBoundingClientRect(), p = d.docToScreen({ x, y });
          view.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 42, pointerType: 'pen', pressure: 1,
            button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: box.left + p.x, clientY: box.top + p.y, ...modifiers }));
        },
        rect(x, y, w, h, modifiers = {}) {
          this.event('pointerdown', x, y, modifiers);
          for (const [px, py] of [[x + w, y], [x + w, y + h], [x, y + h], [x, y]]) this.event('pointermove', px, py, modifiers);
          this.event('pointerup', x, y, modifiers);
        },
        selected(x, y) { return !!(d.selection && d.selection.mctx.getImageData(x, y, 1, 1).data[3]); },
        pixels() { return Array.from(d.doc.active.ctx.getImageData(580, 300, 260, 220).data); },
      };
    });
    const result = await page.evaluate(() => {
      const d = __doodle, t = testLasso, results = [];
      const check = (ok, text) => { if (!ok) throw new Error(text); results.push(text); };
      d.S.dirty = false;
      t.rect(600, 340, 100, 100);
      check(t.selected(650, 380) && !t.selected(740, 380), 'New lasso selects only the outlined area');
      t.rect(720, 340, 100, 100, { shiftKey: true });
      check(t.selected(650, 380) && t.selected(750, 380) && !t.selected(710, 380), 'Shift adds a separate area');
      t.rect(620, 360, 40, 40, { ctrlKey: true });
      check(!t.selected(640, 380) && t.selected(680, 380) && t.selected(750, 380), 'Ctrl subtracts a hole and preserves other areas');
      d.undo(); check(t.selected(640, 380) && t.selected(750, 380), 'Undo restores subtracted selection');
      d.undo(); check(t.selected(640, 380) && !t.selected(750, 380), 'Undo removes added area in one step');
      d.redo(); d.redo(); check(!t.selected(640, 380) && t.selected(750, 380), 'Redo restores both selection operations');
      check(!d.S.dirty, 'Changing selection does not mark drawing unsaved');
      t.rect(680, 440, 40, 40, { shiftKey: true });
      check(t.selected(700, 460), 'Shift still adds to selection');
      t.rect(680, 440, 40, 40, { ctrlKey: true, shiftKey: true });
      check(!t.selected(700, 460), 'Ctrl takes precedence over Shift to subtract');
      return results;
    });
    result.forEach(r => console.log('PASS', r));
    await page.locator('[data-lasso-mode="add"]').click();
    await page.evaluate(() => testLasso.rect(680, 440, 40, 40));
    assert.equal(await page.evaluate(() => testLasso.selected(700, 460)), true);
    await page.keyboard.down('Alt');
    assert.equal(await page.locator('[data-lasso-mode="sub"]').getAttribute('aria-pressed'), 'true');
    await page.keyboard.up('Alt');
    assert.equal(await page.locator('[data-lasso-mode="add"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-lasso-mode="sub"]').click();
    await page.evaluate(() => testLasso.rect(680, 440, 40, 40));
    assert.equal(await page.evaluate(() => testLasso.selected(700, 460)), false);
    await page.keyboard.down('Shift');
    assert.equal(await page.locator('[data-lasso-mode="add"]').getAttribute('aria-pressed'), 'true');
    await page.keyboard.up('Shift');
    assert.equal(await page.locator('[data-lasso-mode="sub"]').getAttribute('aria-pressed'), 'true');
    console.log('PASS Toolbar modes, temporary modifiers and restoration');
    const before = await page.evaluate(() => { __doodle.S.color = '#c8402f'; return testLasso.pixels(); });
    await page.keyboard.press('f');
    const after = await page.evaluate(() => testLasso.pixels());
    assert.notDeepEqual(after, before);
    assert.deepEqual(await page.evaluate(() => Array.from(__doodle.doc.active.ctx.getImageData(750, 380, 1, 1).data)), [200, 64, 47, 255]);
    assert.equal(await page.evaluate(() => __doodle.doc.active.ctx.getImageData(640, 380, 1, 1).data[3]), 0);
    await page.keyboard.press('Control+z'); assert.deepEqual(await page.evaluate(() => testLasso.pixels()), before);
    await page.keyboard.press('Control+Shift+z'); assert.deepEqual(await page.evaluate(() => testLasso.pixels()), after);
    await page.keyboard.press('Control+z'); await page.keyboard.press('Alt+Backspace');
    assert.deepEqual(await page.evaluate(() => testLasso.pixels()), after);
    console.log('PASS F and Alt+Backspace fill selected areas, preserve holes and undo/redo exactly');
    if (process.env.DOODLE_SCREENSHOT) await page.screenshot({ path: process.env.DOODLE_SCREENSHOT });
    // No selection must leave the layer untouched.
    await page.keyboard.press('Control+d');
    const noSel = await page.evaluate(() => testLasso.pixels()); await page.keyboard.press('f');
    assert.deepEqual(await page.evaluate(() => testLasso.pixels()), noSel);
    console.log('PASS F without selection does not paint');
    await page.locator('[data-lang="en"]').evaluate(el => el.click());
    assert.equal(await page.locator('[data-lasso-mode="add"]').textContent(), '+ Add');
    await page.locator('[data-lang="pt"]').evaluate(el => el.click());
    assert.equal(await page.locator('[data-lasso-mode="add"]').textContent(), '+ Somar');
    await page.waitForTimeout(400); await page.reload(); await page.waitForFunction(() => !!window.__doodle);
    assert.equal(await page.evaluate(() => __doodle.S.lassoMode), 'sub');
    console.log('PASS Translations and persistent lasso mode');
    // Simulate settings from an older installation and a custom binding.
    await page.evaluate(() => localStorage.setItem('doodle.keys', JSON.stringify({ 'sel.fill': 'Alt+Backspace' })));
    await page.reload(); await page.waitForFunction(() => !!window.__doodle);
    assert.match(await page.locator('[data-act="sel.fill"]').getAttribute('title'), /\(F\)/);
    await page.evaluate(() => localStorage.setItem('doodle.keys', JSON.stringify({ 'sel.fill': 'Q', 'tool.brush': 'F' })));
    await page.reload(); await page.waitForFunction(() => !!window.__doodle);
    assert.match(await page.locator('[data-act="sel.fill"]').getAttribute('title'), /\(Q\)/);
    await page.keyboard.press('f'); assert.equal(await page.evaluate(() => __doodle.S.tool), 'brush');
    console.log('PASS Default shortcut migration preserves custom shortcuts');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
