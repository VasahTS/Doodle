const { launch } = require('./browser.cjs');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');

(async () => {
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, locale: 'pt-BR' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = pathToFileURL(path.join(__dirname, '../src/index.html')).href;
    await page.goto(url); await page.waitForFunction(() => !!window.__doodle?.recovery.ready);
    const result = await page.evaluate(async () => {
      const d = __doodle, frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      d.S.recoveryInterval = 0; await frame();
      const before = d.perf.scenes;
      const view = document.querySelector('#view'), b = view.getBoundingClientRect();
      for (let i = 0; i < 16; i++) {
        view.dispatchEvent(new PointerEvent('pointermove', { pointerId: 11, pointerType: 'pen', pressure: 0, clientX: b.left + 200 + i * 8, clientY: b.top + 200, bubbles: true }));
        await frame();
      }
      const hoverPaints = d.perf.scenes - before;
      d.runAction('sel.all'); await frame(); const antsBefore = d.perf.scenes;
      await new Promise(r => setTimeout(r, 400));
      const antsPaints = d.perf.scenes - antsBefore;
      d.runAction('sel.none'); await frame();
      const dimensions = [d.doc.W, d.doc.H], fullWidth = view.width;
      d.S.performanceMode = 'economy'; d.resizeRenderSurfaces(); await frame();
      const reducedWidth = view.width;
      d.newDocument(2048, 2048, 'none');
      d.S.historySteps = 50; d.S.historyMemory = 32;
      Object.assign(d.S.tools.brush, { size: 7, smoothing: 0, opacity: 1, pSize: false });
      function event(type, x, y) {
        const q = d.docToScreen({ x, y }), box = view.getBoundingClientRect();
        view.dispatchEvent(new PointerEvent(type, { pointerId: 33, pointerType: 'pen', pressure: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: box.left + q.x, clientY: box.top + q.y, bubbles: true }));
      }
      event('pointerdown', 20, 20);
      for (let i = 1; i <= 40; i++) event('pointermove', 20 + i * 49, 20 + i * 49);
      await frame();
      const live = Array.from(view.getContext('2d').getImageData(Math.round(d.docToScreen({x:1000,y:1000}).x), Math.round(d.docToScreen({x:1000,y:1000}).y), 1, 1).data);
      event('pointerup', 1980, 1980); await frame();
      const bytes = d.history.bytes, layer = d.doc.active;
      const sample = () => Array.from(layer.ctx.getImageData(980, 980, 30, 30).data);
      const painted = sample(); d.undo(); const undone = sample(); d.redo(); const redone = sample();
      return { hoverPaints, antsPaints, dimensions, fullWidth, reducedWidth, bytes, painted, undone, redone, live };
    });
    assert.equal(result.hoverPaints, 0, 'Pen hover must not repaint document pixels');
    assert.equal(result.antsPaints, 0, 'Selection animation must only repaint the overlay');
    assert.equal(result.fullWidth, result.reducedWidth * 2, 'Economy affects only presentation DPR');
    assert.deepEqual(result.dimensions, [1920,1080]);
    assert(result.bytes < 6 * 1024 * 1024, `A thin diagonal must retain tiles rather than its full bounding rectangle: ${result.bytes}`);
    assert(result.painted.some((v,i) => i % 4 === 3 && v));
    assert(result.undone.every(v => v === 0)); assert.deepEqual(result.redone, result.painted);
    assert(result.live[0] < 180, 'Live preview must contain the current stroke before release');
    console.log('PASS Cursor and selection animation repaint zero scene frames; DPR presentation; sparse diagonal history', result.bytes);

    await page.evaluate(() => __doodle.newDocument(1024,1024,'none'));
    await page.evaluate(() => {
      const d=__doodle; d.S.historySteps=50; d.S.historyMemory=32; d.runAction('sel.all');
      for(let i=0;i<12;i++){d.S.color=i%2?'#20cc30':'#cc2030';d.runAction('sel.fill')}
      if(d.history.bytes>32*1048576)throw new Error('History exceeded byte budget');
      if(d.history.undo>=13)throw new Error('Large entries were not evicted');
    });
    await page.evaluate(() => __doodle.showPerformance('history'));
    await page.locator('#prefSteps').fill('2'); await page.locator('#prefSteps').press('Tab');
    assert((await page.evaluate(() => __doodle.history.undo + __doodle.history.redo)) <= 2);
    await page.locator('#prefSteps').fill('7'); await page.locator('#prefSteps').press('Tab');
    await page.locator('#tab-graphics').click(); await page.locator('#prefProfile').selectOption('economy');
    await page.locator('#tab-storage').click(); await page.locator('#prefRecoveryLimit').selectOption('1024');
    await page.locator('#prefVersions').fill('5'); await page.locator('#prefVersions').press('Tab');
    await page.waitForTimeout(400); await page.reload(); await page.waitForFunction(() => !!window.__doodle);
    assert.deepEqual(await page.evaluate(() => [__doodle.S.historySteps,__doodle.S.performanceMode,__doodle.S.recoveryLimit,__doodle.S.recoveryVersions]), [7,'economy',1024,5]);
    await page.evaluate(() => __doodle.showPerformance('graphics'));
    assert.equal(await page.locator('#prefHardware').isDisabled(),true);
    await page.locator('#tab-graphics').press('End'); assert.equal(await page.locator('#tab-diagnostics').getAttribute('aria-selected'),'true');
    await page.locator('#prefMeasure').click(); await page.waitForFunction(() => !!__doodle.perf.lastTest, { timeout: 10000 });
    assert((await page.evaluate(() => __doodle.perf.lastTest.frames)) > 20);
    assert.equal(await page.locator('#prefMeasure').isEnabled(),true);
    // Diagnostics export cannot adopt or change the drawing's save target.
    await page.evaluate(() => { window.showSaveFilePicker=undefined; __doodle.S.filePath='original.ora'; __doodle.S.fileName='original.ora'; });
    const downloadPromise = page.waitForEvent('download'); await page.locator('#prefExportDiagnostic').click();
    const download = await downloadPromise, report = JSON.parse(await fs.readFile(await download.path(),'utf8'));
    assert.equal(report.schema,1); assert(!JSON.stringify(report).includes('original.ora'));
    assert.equal(await page.evaluate(() => __doodle.S.filePath),'original.ora');
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#mPerformance').isHidden(),true);
    assert.equal(await page.locator('#btnSettings').evaluate(e=>e===document.activeElement),true);
    // English strings in each new panel.
    await page.locator('#btnSettings').click(); await page.locator('[data-lang=en]').click();
    await page.evaluate(() => __doodle.showPerformance('storage'));
    assert.equal(await page.locator('#performanceTitle').textContent(),'Performance and storage');
    assert.match(await page.locator('#panel-storage').textContent(),/Versions per drawing/);
    for (const tab of ['graphics','history','diagnostics']) { await page.locator('#tab-'+tab).click(); assert(!/[áãçõ]/i.test(await page.locator('#panel-'+tab).textContent())); }
    assert.deepEqual(errors,[]);
    console.log('PASS History limits; persistent quality/storage/versions; keyboard tabs and focus; private diagnostics export; Portuguese and English');
    await context.close();

    // Native preference bridge: selection is persisted, and accurately remains pending restart.
    const nativeContext=await browser.newContext();
    await nativeContext.addInitScript(() => {
      let requested='auto'; window.nativeWrites=[];
      window.__TAURI__={ core:{invoke:async (command,args)=>{
        if(command==='arquivo_inicial')return null;
        if(command==='graphics_preferences')return {requested,applied:'auto',supported:true,platform:'windows',externalOverride:false};
        if(command==='set_graphics_preference'){ requested=args.mode; nativeWrites.push(requested);return; }
        throw new Error('Unsupported command');
      }}};
    });
    const nativePage=await nativeContext.newPage(); await nativePage.goto(url); await nativePage.waitForFunction(()=>!!window.__doodle);
    await nativePage.evaluate(()=>__doodle.showPerformance('graphics'));
    await nativePage.locator('#prefHardware').selectOption('software');
    await nativePage.waitForFunction(()=>nativeWrites.length===1);
    assert.deepEqual(await nativePage.evaluate(()=>nativeWrites),['software']);
    assert.match(await nativePage.locator('#graphicsStatus').textContent(),/closing and reopening/);
    await nativeContext.close();
    console.log('PASS Native hardware setting persists through the bridge and reports a restart requirement');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
