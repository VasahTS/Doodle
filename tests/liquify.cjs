// Run with Node.js and Playwright available through NODE_PATH.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  const browser = await chromium.launch({ channel: process.env.DOODLE_BROWSER || 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, '../src/index.html')).href);
    await page.waitForFunction(() => !!window.__doodle);
    await page.evaluate(() => {
      const d = window.__doodle;
      window.test = {
        reset(mode = 'push', options = {}) {
          d.runAction('sel.none');
          const l = d.doc.active;
          l.alphaLock = false; l.visible = true;
          l.ctx.clearRect(0, 0, d.doc.W, d.doc.H);
          // Colored grid with transparent outer edges and partial alpha.
          for (let y = 300; y < 600; y += 20) for (let x = 600; x < 1000; x += 20) {
            l.ctx.fillStyle = `rgba(${(x - 600) / 2},${(y - 300) / 1.5},180,${x < 640 ? 0.5 : 1})`;
            l.ctx.fillRect(x, y, 15, 15);
          }
          Object.assign(d.S.tools.liquify, { size: 160, strength: 0.6, pStrength: true, mode }, options);
          d.runAction('tool.liquify'); d.afterDocChange(false);
          return this.pixels();
        },
        pixels() { return Array.from(d.doc.active.ctx.getImageData(0, 0, d.doc.W, d.doc.H).data); },
        event(type, x, y, extra = {}) {
          const p = d.docToScreen({ x, y }), v = document.querySelector('#view'), box = v.getBoundingClientRect();
          v.dispatchEvent(new PointerEvent(type, { clientX: box.left + p.x, clientY: box.top + p.y,
            pointerId: 91, pointerType: 'pen', pressure: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, ...extra }));
        },
        drag(extra = {}, x = 720, y = 420) {
          this.event('pointerdown', x, y, extra);
          for (let i = 1; i <= 6; i++) this.event('pointermove', x + i * 8, y + i * 2, extra);
          this.event('pointerup', x + 48, y + 12, extra);
        },
        equal(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); },
      };
    });
    const result = await page.evaluate(async () => {
      const d = window.__doodle, t = window.test, results = [];
      const check = (ok, message) => { if (!ok) throw new Error(message); results.push(message); };
      for (const mode of ['push', 'expand', 'pinch', 'twirl']) {
        const before = t.reset(mode); t.drag(); const after = t.pixels();
        check(!t.equal(before, after), mode + ' deforms pixels');
        d.undo(); check(t.equal(before, t.pixels()), mode + ' undo restores exact pixels in one step');
        d.redo(); check(t.equal(after, t.pixels()), mode + ' redo restores exact result');
      }
      t.reset('expand'); t.drag({ altKey: true }); const reversed = t.pixels();
      t.reset('pinch'); t.drag(); check(t.equal(reversed, t.pixels()), 'Alt reverses expand to pinch');
      t.reset();
      const lockCtx = d.doc.active.ctx, gradient = lockCtx.createLinearGradient(600, 0, 900, 0);
      gradient.addColorStop(0, '#f00'); gradient.addColorStop(1, '#00f');
      lockCtx.fillStyle = gradient; lockCtx.globalAlpha = 0.5; lockCtx.fillRect(600, 300, 300, 300); lockCtx.globalAlpha = 1;
      const beforeLock = t.pixels(); d.doc.active.alphaLock = true; t.drag({}, 620, 420);
      const afterLock = t.pixels();
      check(!t.equal(beforeLock, afterLock), 'Alpha lock still allows color deformation');
      check(beforeLock.every((v, i) => i % 4 !== 3 || v === afterLock[i]), 'Alpha lock preserves every alpha byte');
      const beforeSel = t.reset();
      d.applyLasso([{ x: 730, y: 390 }, { x: 770, y: 390 }, { x: 770, y: 460 }, { x: 730, y: 460 }], 'replace');
      const mask = d.selection.mctx.getImageData(0, 0, d.doc.W, d.doc.H).data;
      t.drag(); const afterSel = t.pixels();
      check(!t.equal(beforeSel, afterSel), 'Liquify changes pixels inside selection');
      check(beforeSel.every((v, i) => mask[Math.floor(i / 4) * 4 + 3] || v === afterSel[i]), 'No changes outside selection');
      const empty = t.reset(); d.doc.active.ctx.clearRect(0, 0, d.doc.W, d.doc.H);
      d.S.dirty = false; t.drag(); check(!d.S.dirty, 'Empty stroke creates no history or dirty state');
      const click = t.reset(); t.event('pointerdown', 720, 420); t.event('pointerup', 720, 420);
      check(t.equal(click, t.pixels()), 'Push click without movement changes nothing');
      const original = t.reset(); t.drag({ pressure: 0.2 }); const low = t.pixels();
      t.reset(); t.drag({ pressure: 1 }); const high = t.pixels();
      const difference = a => a.reduce((sum, v, i) => sum + Math.abs(v - original[i]), 0);
      check(difference(low) < difference(high), 'Pen pressure controls strength');
      t.reset(); t.drag(); const beforeOra = t.pixels(), bytes = await d.buildOra();
      await d.loadOra(bytes); d.afterDocChange(false);
      const reopened = t.pixels();
      const maxOraDiff = beforeOra.reduce((max, v, i) => Math.max(max, Math.abs(v - reopened[i])), 0);
      check(maxOraDiff <= 1, 'ORA save and reopen preserves liquified pixels (PNG rounding <= 1): ' + maxOraDiff);
      t.reset(); t.drag(); const canceled = t.pixels();
      t.event('pointerdown', 720, 420); t.event('pointermove', 740, 420); t.event('pointercancel', 740, 420);
      d.undo(); check(t.equal(canceled, t.pixels()), 'Pointer cancellation commits one undoable stroke');
      const beforeView = t.reset();
      d.S.rot = 0.4; d.S.flip = true; d.S.zoom = 0.75;
      t.drag(); check(!t.equal(beforeView, t.pixels()), 'Brush works with rotated and mirrored view');
      d.undo(); check(t.equal(beforeView, t.pixels()), 'Rotated stroke undo is exact');
      d.S.rot = 0; d.S.flip = false; d.runAction('view.fit');
      return results;
    });
    result.forEach(s => console.log('PASS', s));
    // Real mouse input and tool shortcut exercise the normal browser path.
    await page.keyboard.press('b');
    await page.locator('#optSizeNum').fill('23');
    await page.locator('#optSizeNum').press('Tab');
    await page.keyboard.press('j');
    assert.equal(await page.locator('[data-tool="liquify"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#optSizeNum').inputValue(), '160');
    const mouseResult = await page.evaluate(() => {
      test.reset();
      const box = document.querySelector('#view').getBoundingClientRect();
      const p = __doodle.docToScreen({ x: 720, y: 420 });
      return { x: box.left + p.x, y: box.top + p.y,
        before: __doodle.doc.active.canvas.toDataURL() };
    });
    await page.mouse.move(mouseResult.x, mouseResult.y); await page.mouse.down();
    await page.mouse.move(mouseResult.x + 40, mouseResult.y + 10, { steps: 12 }); await page.mouse.up();
    assert.notEqual(await page.evaluate(() => __doodle.doc.active.canvas.toDataURL()), mouseResult.before);
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => __doodle.doc.active.canvas.toDataURL()), mouseResult.before);
    console.log('PASS Real mouse stroke and Ctrl+Z');
    // Stationary radial modes continue while held, then stop on release.
    await page.evaluate(() => { test.reset('expand'); test.event('pointerdown', 720, 420); });
    const held = await page.evaluate(() => __doodle.doc.active.canvas.toDataURL());
    await page.waitForFunction(before => __doodle.doc.active.canvas.toDataURL() !== before, held, { timeout: 3000 });
    await page.evaluate(() => test.event('pointerup', 720, 420));
    const released = await page.evaluate(() => __doodle.doc.active.canvas.toDataURL());
    await page.waitForTimeout(140);
    assert.equal(await page.evaluate(() => __doodle.doc.active.canvas.toDataURL()), released);
    console.log('PASS Hold applies radial effect; release stops it');
    await page.locator('#btnOpts').click();
    await page.locator('#optLiquifyMode').selectOption('twirl');
    assert.equal(await page.evaluate(() => __doodle.S.tools.liquify.mode), 'twirl');
    console.log('PASS Toolbar, J shortcut, independent sizes and mode control');
    await page.locator('[data-lang="en"]').evaluate(el => el.click());
    assert.equal(await page.locator('#optsTitle').textContent(), 'Liquify settings');
    assert.equal(await page.locator('#optLiquifyMode option[value="push"]').textContent(), 'Push');
    await page.locator('[data-lang="pt"]').evaluate(el => el.click());
    assert.equal(await page.locator('#optsTitle').textContent(), 'Ajustes do liquify');
    console.log('PASS Portuguese and English tool settings');
    if (process.env.DOODLE_SCREENSHOT) await page.screenshot({ path: process.env.DOODLE_SCREENSHOT });
    await page.waitForTimeout(400);
    await page.reload(); await page.waitForFunction(() => !!window.__doodle);
    assert.equal(await page.evaluate(() => __doodle.S.tool), 'liquify');
    assert.equal(await page.evaluate(() => __doodle.S.tools.liquify.mode), 'twirl');
    console.log('PASS Liquify settings persist after reload');
    assert.deepEqual(errors, []);
    console.log('PASS No browser script errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
