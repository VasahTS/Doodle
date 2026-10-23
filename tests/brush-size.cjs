// Run with Node.js, Playwright and Chrome; DOODLE_BROWSER=msedge checks Edge.
const { launch } = require('./browser.cjs');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { createHash } = require('node:crypto');

(async () => {
  const browser = await launch();
  const hashes = [];
  try {
    for (const dpr of [1, 1.5, 2]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: dpr });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(pathToFileURL(path.join(__dirname, '../src/index.html')).href);
      await page.waitForFunction(() => !!window.__doodle);
      const results = await page.evaluate(() => {
        const d = __doodle, layer = d.doc.active, c = d.S.tools.brush;
        const samples = [], read = () => Array.from(layer.ctx.getImageData(590, 390, 160, 24).data);
        function event(type, x, y, pressure = 1, pointerType = 'pen') {
          const view = document.querySelector('#view'), b = view.getBoundingClientRect(), p = d.docToScreen({ x, y });
          view.dispatchEvent(new PointerEvent(type, { pointerId: 71, pointerType, pressure, button: 0,
            buttons: type === 'pointerup' ? 0 : 1, clientX: b.left + p.x, clientY: b.top + p.y, bubbles: true }));
        }
        function draw(size, pSize = false, pressure = 1, pointerType = 'pen', zoom = 1) {
          layer.ctx.clearRect(0, 0, d.doc.W, d.doc.H);
          d.S.zoom = zoom; d.S.rot = 0; d.S.flip = false;
          d.runAction('tool.brush');
          Object.assign(c, { size, pSize, pOpac: false, opacity: 1, smoothing: 0, curve: 1 });
          d.S.color = '#000000';
          event('pointerdown', 600.25, 400.25, pressure, pointerType);
          for (let x = 602.25; x <= 720.25; x += 2) event('pointermove', x, 400.25, pressure, pointerType);
          event('pointerup', 720.25, 400.25, pressure, pointerType);
          const pixels = read(), mass = pixels.reduce((a, v, i) => a + (i % 4 === 3 ? v : 0), 0);
          return { pixels, mass };
        }
        for (const size of [0.1, 0.3, 0.5, 1, 2]) samples.push({ size, mass: draw(size).mass });
        const light = draw(1, true, 0.1), full = draw(1, true, 1);
        const reference = draw(1).pixels, mouse = draw(1, false, 1, 'mouse').pixels;
        const zoomed = draw(1, false, 1, 'pen', 0.5).pixels;
        const beforeUndo = read(); d.undo(); const undone = read(); d.redo(); const redone = read();
        const half = draw(0.5).pixels; d.undo(); const halfUndone = read(); d.redo(); const halfRedone = read();
        d.runAction('tool.eraser'); d.S.tools.eraser.size = 0.3; d.runAction('tool.eraser');
        return { samples, light: light.mass, full: full.mass, reference, mouse, zoomed, beforeUndo, undone, redone,
          half, halfUndone, halfRedone, eraserSize: document.querySelector('#optSizeNum').value };
      });
      assert(results.samples[0].mass > 0, '0.1 px must produce a visible mark');
      results.samples.slice(1).forEach((s, i) => assert(s.mass > results.samples[i].mass, 'Increasing size must increase coverage: ' + JSON.stringify(results.samples)));
      assert(results.light < results.full * 0.5, 'Light pressure must be able to draw well below the old 0.8 px floor');
      assert.deepEqual(results.reference, results.mouse, 'Same size and pressure produce the same mouse and pen stroke');
      assert.deepEqual(results.reference, results.zoomed, 'Document stroke must not depend on view zoom');
      assert(results.undone.every(v => v === 0));
      assert.deepEqual(results.beforeUndo, results.redone);
      assert(results.halfUndone.every(v => v === 0));
      assert.deepEqual(results.half, results.halfRedone);
      assert.equal(results.eraserSize, '0.3');
      // Controls, slider limits, decimal keyboard increments and independent sizes.
      await page.keyboard.press('b');
      await page.locator('#optSizeNum').fill('0.5'); await page.locator('#optSizeNum').press('Tab');
      assert.equal(await page.evaluate(() => __doodle.S.tools.brush.size), 0.5);
      await page.keyboard.press('['); assert.equal(await page.locator('#optSizeNum').inputValue(), '0.4');
      await page.keyboard.press(']'); assert.equal(await page.locator('#optSizeNum').inputValue(), '0.5');
      await page.locator('#optSize').fill('0'); assert.equal(await page.locator('#optSizeNum').inputValue(), '0.1');
      await page.locator('#optSize').fill('1000'); assert.equal(await page.locator('#optSizeNum').inputValue(), '500');
      await page.locator('#optSizeNum').fill('0.5'); await page.locator('#optSizeNum').press('Tab');
      await page.keyboard.press('e'); assert.equal(await page.locator('#optSizeNum').inputValue(), '0.3');
      await page.keyboard.press('j');
      assert.equal(await page.locator('#optSizeNum').getAttribute('min'), '1');
      await page.locator('#optSize').fill('0'); assert.equal(await page.locator('#optSizeNum').inputValue(), '1');
      await page.keyboard.press('b'); assert.equal(await page.locator('#optSizeNum').inputValue(), '0.5');
      await page.waitForTimeout(400); await page.reload(); await page.waitForFunction(() => !!window.__doodle);
      assert.equal(await page.locator('#optSizeNum').inputValue(), '0.5');
      assert.deepEqual(errors, []);
      const hash = createHash('sha256').update(Buffer.from(results.reference)).digest('hex');
      hashes.push(hash);
      console.log('PASS DPR', dpr, 'fractional sizes, pressure, zoom, undo/redo, controls and persistence', JSON.stringify(results.samples));
      await context.close();
    }
    assert(hashes.every(h => h === hashes[0]), 'Document pixels must be identical across screen scale factors');
    console.log('PASS Identical 1 px document stroke at DPR 1, 1.5 and 2:', hashes[0]);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
