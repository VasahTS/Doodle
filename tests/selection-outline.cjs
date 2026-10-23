const { launch } = require('./browser.cjs');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, '../src/index.html')).href);
    await page.waitForFunction(() => !!window.__doodle);
    const cases = await page.evaluate(async () => {
      const d = __doodle, results = [];
      const rect = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
      const ellipse = (x, y, rx, ry) => Array.from({ length: 64 }, (_, i) => ({ x: x + Math.cos(i / 32 * Math.PI) * rx, y: y + Math.sin(i / 32 * Math.PI) * ry }));
      const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      async function check(name, components, holes) {
        await frame();
        const s = d.selection;
        if (!s) throw new Error(name + ': missing selection');
        if (!s.outline || !s.contours) throw new Error(name + ': no cached outline rendered');
        const b = s.bbox, data = s.mctx.getImageData(b.x, b.y, b.w, b.h).data;
        const selected = (x, y) => x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h && data[((y - b.y) * b.w + x - b.x) * 4 + 3] > 0;
        // Expand visible contour segments into unit edges, rejecting duplicates.
        const actual = new Set();
        let area = 0;
        for (const c of s.contours) for (let i = 0; i < c.pts.length; i++) {
          const a = c.pts[i], z = c.pts[(i + 1) % c.pts.length];
          if (a.x !== z.x && a.y !== z.y) throw new Error(name + ': unexpected diagonal pixel edge');
          area += a.x * z.y - z.x * a.y;
          const dx = Math.sign(z.x - a.x), dy = Math.sign(z.y - a.y), length = Math.abs(z.x - a.x) + Math.abs(z.y - a.y);
          for (let j = 0; j < length; j++) {
            const x = a.x + dx * j, y = a.y + dy * j, nx = x + dx, ny = y + dy;
            const key = x < nx || y < ny ? `${x},${y}:${nx},${ny}` : `${nx},${ny}:${x},${y}`;
            if (actual.has(key)) throw new Error(name + ': duplicate visible edge ' + key);
            actual.add(key);
          }
        }
        let expectedEdges = 0, count = 0;
        // Independent invariant: every drawn edge must separate selected/unselected pixels.
        for (let y = b.y; y <= b.y + b.h; y++) for (let x = b.x; x <= b.x + b.w; x++) {
          if (x < b.x + b.w && selected(x, y - 1) !== selected(x, y)) {
            expectedEdges++; if (!actual.has(`${x},${y}:${x + 1},${y}`)) throw new Error(name + ': missing horizontal boundary');
          }
          if (y < b.y + b.h && selected(x - 1, y) !== selected(x, y)) {
            expectedEdges++; if (!actual.has(`${x},${y}:${x},${y + 1}`)) throw new Error(name + ': missing vertical boundary');
          }
          if (selected(x, y)) count++;
        }
        if (actual.size !== expectedEdges) throw new Error(name + ': extra lines inside/outside selection');
        if (area / 2 !== count) throw new Error(name + ': contour area differs from selected pixels');
        if (components !== undefined && s.contours.filter(c => !c.sub).length !== components) throw new Error(name + ': wrong component count');
        if (holes !== undefined && s.contours.filter(c => c.sub).length !== holes) throw new Error(name + ': wrong hole count');
        const cached = s.outline; await frame();
        if (s.outline !== cached) throw new Error(name + ': outline rebuilt without mask change');
        results.push(name);
      }
      d.applyLasso(rect(600, 300, 100, 100), 'replace');
      await check('Initial rectangle', 1, 0);
      d.applyLasso(rect(650, 330, 100, 100), 'add');
      await check('Overlapping addition merges into one boundary', 1, 0);
      d.applyLasso(rect(620, 350, 20, 20), 'add');
      await check('Adding an enclosed area leaves no internal outline', 1, 0);
      d.applyLasso(rect(630, 280, 50, 80), 'sub');
      await check('Subtraction crossing border leaves only the cut edge', 1, 0);
      d.applyLasso(rect(690, 370, 20, 20), 'sub');
      await check('Enclosed subtraction creates a hole', 1, 1);
      d.undo(); await check('Undo restores the previous visible outline', 1, 0);
      d.redo(); await check('Redo restores the hole outline', 1, 1);
      d.applyLasso(rect(800, 300, 40, 40), 'sub');
      await check('Subtracting outside selection draws no stray outline', 1, 1);
      d.applyLasso(rect(800, 300, 40, 40), 'add');
      await check('Disjoint additions remain separate', 2, 1);
      d.invertSelection(); await check('Inverted selection outline matches its mask', 2, 2);
      d.applyLasso(rect(0, 0, 15, 15), 'replace');
      d.applyLasso(rect(15, 15, 15, 15), 'add');
      await check('Diagonal corner contacts form two closed boundaries', 2, 0);
      // Reproduce the overlapping freehand curves in the reported screenshot.
      d.applyLasso(ellipse(850, 360, 120, 85), 'replace');
      d.applyLasso(ellipse(760, 360, 40, 75), 'add');
      d.applyLasso(ellipse(790, 435, 65, 50), 'sub');
      await check('Curved overlapping lasso follows the final mask', 1, 0);
      d.S.color = '#c8402f'; d.runAction('sel.fill');
      // Move a selection containing pixels to exercise transform cache invalidation.
      d.startTransform(); if (!d.tf) throw new Error('Transform did not start');
      d.tf.tx = 35; d.tf.ty = 20; d.applyTransform();
      await check('Transformed selection recalculates its visible outline');
      d.undo(); await check('Transform undo restores its cached outline');
      d.redo(); await check('Transform redo restores the transformed outline');
      d.applyLasso(rect(0, 0, d.doc.W, d.doc.H), 'sub'); await frame();
      if (d.selection) throw new Error('Removing entire selection must remove the outline');
      results.push('Subtracting entire selection removes outline');
      d.applyLasso(ellipse(850, 360, 120, 85), 'replace');
      d.applyLasso(ellipse(760, 360, 40, 75), 'add');
      d.applyLasso(ellipse(790, 435, 65, 50), 'sub');
      d.doc.active.ctx.clearRect(0, 0, d.doc.W, d.doc.H); d.runAction('sel.fill');
      d.runAction('tool.lasso'); await frame();
      return results;
    });
    cases.forEach(s => console.log('PASS', s));
    assert.deepEqual(errors, []);
    if (process.env.DOODLE_SCREENSHOT) await page.screenshot({ path: process.env.DOODLE_SCREENSHOT });
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
