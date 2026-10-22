const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: process.env.DOODLE_BROWSER || 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = pathToFileURL(path.join(__dirname, '../src/index.html')).href;
    await page.goto(url); await page.waitForFunction(() => !!window.__doodle);
    await page.evaluate(() => {
      const d = __doodle, layer = d.doc.active;
      window.clearTest = {
        id: layer.id, count: d.allLayers().length,
        rect(x, y, w, h) { return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]; },
        pixels(l = d.doc.active) { return Array.from(l.ctx.getImageData(600, 300, 200, 200).data); },
        draw(l = d.doc.active) { l.ctx.fillStyle = '#c8402f'; l.ctx.fillRect(600, 300, 200, 200); },
        pixel(x, y, l = d.doc.active) { return Array.from(l.ctx.getImageData(x, y, 1, 1).data); },
      };
      clearTest.draw();
      d.applyLasso(clearTest.rect(600, 300, 120, 120), 'replace');
      d.applyLasso(clearTest.rect(630, 330, 30, 30), 'sub');
      d.afterDocChange(false);
    });
    const before = await page.evaluate(() => clearTest.pixels());
    await page.keyboard.press('Backspace');
    assert.deepEqual(await page.evaluate(() => clearTest.pixel(610, 310)), [0, 0, 0, 0]);
    assert.deepEqual(await page.evaluate(() => clearTest.pixel(640, 340)), [200, 64, 47, 255]);
    assert.deepEqual(await page.evaluate(() => clearTest.pixel(780, 480)), [200, 64, 47, 255]);
    assert.equal(await page.evaluate(() => __doodle.allLayers().length === clearTest.count && __doodle.doc.active.id === clearTest.id), true);
    const after = await page.evaluate(() => clearTest.pixels());
    await page.keyboard.press('Control+z'); assert.deepEqual(await page.evaluate(() => clearTest.pixels()), before);
    await page.keyboard.press('Control+Shift+z'); assert.deepEqual(await page.evaluate(() => clearTest.pixels()), after);
    assert.equal(await page.evaluate(() => !!__doodle.selection), true);
    console.log('PASS Backspace clears only selected pixels, preserves holes/layer and supports exact undo/redo');
    await page.keyboard.press('Control+d'); await page.keyboard.press('Backspace');
    assert.equal(await page.evaluate(() => clearTest.pixels().every(v => v === 0)), true);
    assert.equal(await page.evaluate(() => __doodle.allLayers().length === clearTest.count && __doodle.doc.active.id === clearTest.id), true);
    await page.keyboard.press('Control+z'); assert.deepEqual(await page.evaluate(() => clearTest.pixels()), after);
    console.log('PASS Without selection Backspace clears the whole layer, keeps it and can be undone');
    // Keep the alternate Delete behavior and the fill modifier separate.
    await page.keyboard.press('Delete'); assert.equal(await page.evaluate(() => clearTest.pixels().every(v => v === 0)), true);
    await page.keyboard.press('Control+z');
    await page.evaluate(() => __doodle.applyLasso(clearTest.rect(600, 300, 120, 120), 'replace'));
    await page.keyboard.press('Alt+Backspace');
    assert.equal(await page.evaluate(() => clearTest.pixel(610, 310)[3]), 255);
    console.log('PASS Delete remains an alternate and Alt+Backspace still fills');
    // Multiple selected layers lose pixels, never their nodes or the unselected background.
    await page.evaluate(() => {
      const d = __doodle, first = d.doc.active;
      d.runAction('layer.new'); clearTest.draw();
      d.doc.sel = new Set([first, d.doc.active]); clearTest.multiIds = [...d.doc.sel].map(l => l.id);
      clearTest.multiCount = d.allLayers().length; d.renderLayers();
    });
    await page.keyboard.press('Backspace');
    assert.equal(await page.evaluate(() => {
      const ls = __doodle.allLayers();
      return ls.length === clearTest.multiCount && clearTest.multiIds.every(id => {
        const l = ls.find(n => n.id === id); return l && clearTest.pixel(610, 310, l)[3] === 0;
      }) && ls[0].ctx.getImageData(610, 310, 1, 1).data[3] === 255;
    }), true);
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => __doodle.allLayers().filter(l => clearTest.multiIds.includes(l.id)).every(l => clearTest.pixel(610, 310, l)[3] === 255)), true);
    console.log('PASS Multiple layer clearing preserves nodes/background and undoes in one step');
    // Text inputs must receive Backspace without altering the drawing.
    await page.keyboard.press('b'); await page.locator('#optSizeNum').fill('25');
    const typedBefore = await page.evaluate(() => clearTest.pixels());
    await page.keyboard.press('Backspace');
    assert.deepEqual(await page.evaluate(() => clearTest.pixels()), typedBefore);
    console.log('PASS Backspace in a text field does not clear drawing contents');
    await page.locator('#optSizeNum').press('Tab');
    await page.locator('#btnSettings').click(); await page.keyboard.press('Escape');
    await page.keyboard.press('Backspace');
    assert.equal(await page.evaluate(() => clearTest.pixel(610, 310)[3]), 0);
    console.log('PASS Backspace works after closing Settings');
    await page.evaluate(() => localStorage.setItem('doodle.keys', JSON.stringify({ 'edit.clear': 'Delete' })));
    await page.reload(); await page.waitForFunction(() => !!window.__doodle);
    assert.match(await page.locator('[data-act="edit.clear"]').getAttribute('title'), /Backspace/);
    await page.evaluate(() => localStorage.setItem('doodle.keys', JSON.stringify({ 'edit.clear': 'Q', 'tool.brush': 'Backspace' })));
    await page.reload(); await page.waitForFunction(() => !!window.__doodle);
    assert.match(await page.locator('[data-act="edit.clear"]').getAttribute('title'), /\(Q\)/);
    console.log('PASS Old defaults migrate and custom shortcuts remain unchanged');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
