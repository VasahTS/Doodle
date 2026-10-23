// Run only against the CI-built, separately identified performance-test executable.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const executable = path.resolve(process.env.DOODLE_NATIVE_EXE || 'src-tauri/target/release/doodle.exe');
const port = 19222;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const policy = 'HKLM\\Software\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments';
let testPolicy = false;
function configureCiDebugging() {
  // GitHub Windows runners are elevated. WebView2 150+ ignores their environment
  // overrides, so scope the CI debugging policy to this executable on the runner.
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This native smoke harness is CI-only');
  const existing = spawnSync('reg', ['query', policy, '/v', 'doodle.exe'], { windowsHide: true });
  assert.notEqual(existing.status, 0, 'Refusing to overwrite an existing WebView2 policy');
  const result = spawnSync('reg', ['add', policy, '/v', 'doodle.exe', '/t', 'REG_SZ', '/d', '--remote-debugging-port=' + port, '/f'], { windowsHide: true });
  assert.equal(result.status, 0, 'Cannot configure the CI-only WebView2 debugging policy');
  testPolicy = true;
}

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
    configureCiDebugging();
    app = await start();
    const errors = [];
    app.page.on('pageerror', e => errors.push(e.message));
    const result = await app.page.evaluate(async () => {
      const d = __doodle, frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const identity = await __TAURI__.app.getIdentifier();
      const name = await __TAURI__.app.getName();
      const graphics = await __TAURI__.core.invoke('graphics_preferences');
      const updatesControlDisabled = document.querySelector('#btnUpdates').disabled;
      let updaterRejection = '';
      try { await __TAURI__.core.invoke('plugin:updater|check'); }
      catch (e) { updaterRejection = String(e); }
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
      return { identity, name, graphics, updatesControlDisabled, updaterRejection, hoverSceneFrames, painted, undone, redone, reopened, oraBytes: ora.length, pending };
    });
    assert.equal(result.identity, 'com.daniel.doodle.performance-test');
    assert.equal(result.updatesControlDisabled, true, 'Test update control must stay disabled');
    assert.match(result.updaterRejection, /plugin.*updater.*not found|plugin.*not found.*updater/i, 'Test build must not register the native updater');
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
    for (const size of [3840, 8000]) {
      const liquify = await app.page.evaluate(async size => {
        const d=__doodle; d.newDocument(size,size===3840?2160:8000,'none');d.S.recoveryInterval=0;
        d.runAction('tool.liquify');Object.assign(d.S.tools.liquify,{size:500,strength:1,pStrength:true,mode:'push'});
        const l=d.doc.active,tile=document.createElement('canvas');tile.width=64;tile.height=64;
        const ctx=tile.getContext('2d');ctx.fillStyle='#ed4070';ctx.fillRect(0,0,32,64);ctx.fillStyle='#26acfc';ctx.fillRect(32,0,32,32);
        l.ctx.fillStyle=l.ctx.createPattern(tile,'repeat');l.ctx.fillRect(0,0,d.doc.W,d.doc.H);d.afterDocChange(false);
        const sample=()=>[l.ctx.getImageData(0,0,128,128).data,l.ctx.getImageData(size-128,d.doc.H-128,128,128).data];
        const equal=(a,b)=>a.every((v,j)=>v.every((n,i)=>n===b[j][i]));const before=sample(),v=document.querySelector('#view'),b=v.getBoundingClientRect();
        const event=(type,x,y)=>{const p=d.docToScreen({x,y});v.dispatchEvent(new PointerEvent(type,{pointerId:71,pointerType:'pen',pressure:1,button:0,buttons:type==='pointerup'?0:1,clientX:b.left+p.x,clientY:b.top+p.y,bubbles:true}));};
        event('pointerdown',4,4);for(let i=1;i<=12;i++)event('pointermove',4+(size-8)*i/12,4+(d.doc.H-8)*i/12);event('pointerup',size-4,d.doc.H-4);
        await d.finishLiquify();const after=sample();d.undo();const undoExact=equal(before,sample());d.redo();const redoExact=equal(after,sample());
        return {changed:!equal(before,after),undoExact,redoExact,stats:d.performanceSnapshot().liquify.lastStroke,build:d.performanceSnapshot().build};
      },size);
      assert(liquify.changed&&liquify.undoExact&&liquify.redoExact,'Native extreme Liquify pixels/undo/redo failed');
      assert.equal(liquify.stats.status,'complete');assert.equal(liquify.stats.backend,'worker');
      assert.equal(liquify.build.revision,process.env.GITHUB_SHA);
      console.log('PASS Native Windows Liquify extreme '+size+': '+JSON.stringify(liquify));
    }
    stop(app); app = null; await sleep(1000);
    app = await start();
    const restarted = await app.page.evaluate(async () => {
      const prefs = await __TAURI__.core.invoke('graphics_preferences');
      await __TAURI__.core.invoke('set_graphics_preference', { mode: 'auto' });
      return prefs;
    });
    assert.equal(restarted.requested, 'software');
    assert.equal(restarted.applied, 'software');
    const processes = spawnSync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name = 'msedgewebview2.exe'\" | Where-Object { $_.CommandLine -like '*com.daniel.doodle.performance-test*' } | Select-Object -ExpandProperty CommandLine"], { windowsHide: true, encoding: 'utf8' });
    assert.equal(processes.status, 0);
    assert(processes.stdout.includes('--disable-gpu'), 'Compatibility flag is absent from the actual test WebView2 process');
    console.log('PASS Native Windows: compatibility preference persists and --disable-gpu reaches WebView2 after restart');
  } finally {
    if (app) stop(app);
    if (testPolicy) spawnSync('reg', ['delete', policy, '/v', 'doodle.exe', '/f'], { windowsHide: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
