const { launch } = require('./browser.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, '../src/index.html')).href);
    await page.waitForFunction(() => !!window.__doodle?.recovery.ready);
    await page.evaluate(() => { __doodle.S.recoveryInterval = 0; __doodle.newDocument(128,128,'none'); });
    const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await frame();
    const scenes = await page.evaluate(() => __doodle.perf.scenes);
    await page.keyboard.press('Control+a'); await frame();
    assert.equal(await page.locator('#selBar').isVisible(), true);
    await page.keyboard.press('Control+d'); await frame();
    assert.equal(await page.locator('#selBar').isHidden(), true);
    await page.evaluate(() => __doodle.applyLasso([{x:10,y:10},{x:50,y:10},{x:50,y:50},{x:10,y:50}], 'replace'));
    await frame(); assert.equal(await page.locator('#selBar').isVisible(), true);
    await page.evaluate(() => __doodle.invertSelection()); await frame();
    assert.equal(await page.locator('#selBar').isVisible(), true);
    await page.keyboard.press('Control+d'); await frame();
    assert.equal(await page.locator('#selBar').isHidden(), true);
    assert.equal(await page.evaluate(() => __doodle.perf.scenes), scenes, 'Selection UI must not recompose document pixels');
    console.log('PASS Selection actions appear, invert and disappear on overlay-only frames');
    const result = await page.evaluate(async () => {
      const d=__doodle, pixel=()=>Array.from(d.doc.active.ctx.getImageData(15,15,1,1).data);
      d.doc.active.ctx.fillStyle='#cc2244'; d.doc.active.ctx.fillRect(10,10,20,20);
      d.runAction('edit.copy');
      d.newDocument(64,64,'none'); d.runAction('edit.paste');
      const pasted=pixel(), count=d.allLayers().length;
      d.undo(); const undone=pixel(); d.redo(); const redone=pixel();
      const ora=await d.buildOra(); await d.loadOra(ora);d.runAction('edit.paste');
      return {pasted,count,undone,redone,afterOpen:pixel(),afterOpenCount:d.allLayers().length};
    });
    assert.deepEqual(result.pasted,[204,34,68,255]);assert.equal(result.count,2);
    assert.deepEqual(result.undone,[0,0,0,0]);assert.deepEqual(result.redone,result.pasted);
    assert.deepEqual(result.afterOpen,result.pasted);assert.equal(result.afterOpenCount,3);
    assert.deepEqual(errors,[]);
    console.log('PASS Clipboard survives new/opened documents with exact paste undo and redo');
  } finally { await browser.close(); }
})().catch(e=>{ console.error(e);process.exitCode=1; });
