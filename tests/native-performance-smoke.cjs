// Run only against the CI-built, separately identified performance-test executable.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const executable = path.resolve(process.env.DOODLE_NATIVE_EXE || 'src-tauri/target/release/doodle.exe');
const port = 19222;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function start() {
  assert.equal(process.platform, 'win32');
  assert(fs.existsSync(executable), 'Built executable is missing');
  const child = spawn(executable, [], {
    windowsHide: true,
    stdio: 'inherit',
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + port },
  });
  try {
    let endpoint;
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null) throw new Error('Native app exited with code ' + child.exitCode);
      try {
        const r = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1000) });
        if (r.ok) { endpoint = (await r.json()).webSocketDebuggerUrl; break; }
      } catch (_) { /* wait for the test app's WebView2 */ }
      await sleep(500);
    }
    assert(endpoint, 'Native WebView2 did not expose its test debugging endpoint');
    const browser = await chromium.connectOverCDP(endpoint);
    let page;
    for (let i = 0; i < 60; i++) {
      page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith('devtools:'));
      if (page) break;
      await sleep(500);
    }
    assert(page, 'Native app has no page');
    await page.waitForFunction(() => !!window.__doodle?.recovery.ready, null, { timeout: 30000 });
    return { child, browser, page };
  } catch (error) {
    stop({ child }); throw error;
  }
}
function stop(app) {
  if (app.child.pid && app.child.exitCode === null) {
    spawnSync('taskkill', ['/PID', String(app.child.pid), '/T', '/F'], { windowsHide: true });
  }
}

(async () => {
  let app;
  try {
    app = await start();
    const errors = [];
    app.page.on('pageerror', e => errors.push(e.message));
    const result = await app.page.evaluate(async () => {
      const d = __doodle, frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const identity = await __TAURI__.app.getIdentifier();
      const name = await __TAURI__.app.getName();
      const graphics = await __TAURI__.core.invoke('graphics_preferences');
      const updaterAvailable = !!__TAURI__.updater;
      d.S.recoveryInterval = 0; d.newDocument(256, 256, 'none');
      Object.assign(d.S.tools.brush, { size: 8, smoothing: 0, opacity: 1, pSize: true, pOpacity: false });
      d.runAction('tool.brush'); await frame();
      const view = document.querySelector('#view'), b = view.getBoundingClientRect();
      const before = d.perf.scenes;
      for (let i = 0; i < 10; i++) {
        view.dispatchEvent(new PointerEvent('pointermove', { pointerId: 55, pointerType: 'pen', pressure: 0, clientX: b.left + 100 + i, clientY: b.top + 100, bubbles: true }));
        await frame();
      }
      const hoverSceneFrames = d.perf.scenes - before;
      const event = (type, x, y) => {
        const q = d.docToScreen({ x, y });
        view.dispatchEvent(new PointerEvent(type, { pointerId: 56, pointerType: 'pen', pressure: 0.8, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: b.left + q.x, clientY: b.top + q.y, bubbles: true }));
      };
      event('pointerdown', 32, 64); event('pointermove', 128, 64); event('pointerup', 128, 64); await frame();
      const sample = () => Array.from(d.doc.active.ctx.getImageData(60, 60, 12, 9).data);
      const painted = sample(); d.undo(); const undone = sample(); d.redo(); const redone = sample();
      const ora = await d.buildOra(); await d.loadOra(ora); const reopened = sample();
      await __TAURI__.core.invoke('set_graphics_preference', { mode: 'software' });
      const pending = await __TAURI__.core.invoke('graphics_preferences');
      return { identity, name, graphics, updaterAvailable, hoverSceneFrames, painted, undone, redone, reopened, oraBytes: ora.length, pending };
    });
    assert.equal(result.identity, 'com.daniel.doodle.performance-test');
    assert.equal(result.updaterAvailable, false, 'Test build must not load the stable updater');
    assert.equal(result.graphics.applied, 'auto');
    assert.equal(result.graphics.supported, true);
    assert.equal(result.hoverSceneFrames, 0);
    assert(result.painted.some((v, i) => i % 4 === 3 && v > 0), 'Native canvas stroke is missing');
    assert(result.undone.every(v => v === 0));
    assert.deepEqual(result.redone, result.painted);
    assert(result.oraBytes > 500);
    assert.equal(result.reopened.length, result.painted.length);
    assert(result.reopened.every((v, i) => Math.abs(v - result.painted[i]) <= 1), 'ORA pixels changed beyond PNG channel rounding');
    assert.equal(result.pending.requested, 'software');
    assert.equal(result.pending.applied, 'auto');
    assert.deepEqual(errors, []);
    console.log('PASS Native Windows: isolated app identity; updater absent; pen hover; stroke; undo/redo; ORA round trip; persistent graphics preference');
    stop(app); app = null; await sleep(1000);
    app = await start();
    const restarted = await app.page.evaluate(async () => {
      const prefs = await __TAURI__.core.invoke('graphics_preferences');
      await __TAURI__.core.invoke('set_graphics_preference', { mode: 'auto' });
      return prefs;
    });
    assert.equal(restarted.requested, 'software');
    assert.equal(restarted.applied, 'software');
    console.log('PASS Native Windows: compatibility preference applies after restart');
  } finally { if (app) stop(app); }
})().catch(error => { console.error(error); process.exitCode = 1; });
