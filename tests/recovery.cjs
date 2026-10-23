const { launch } = require('./browser.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await launch();
  const url = pathToFileURL(path.join(__dirname, '../src/index.html')).href;
  try {
    for (const native of [false, true]) {
      const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'doodle-recovery-')), errors = [];
      let failCommit = false, writes = 0;
      const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'pt-BR' });
      try {
        if (native) {
          await context.exposeBinding('recoveryFs', async (_, action, args) => {
            const safe = value => { const absolute = path.resolve(value); assert(absolute.startsWith(path.resolve(temp) + path.sep)); return absolute; };
            const file = safe(args[0]);
            if (action === 'mkdir') return fs.mkdir(file, { recursive: true });
            if (action === 'list') return (await fs.readdir(file, { withFileTypes: true })).map(e => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() }));
            if (action === 'stat') return { size: (await fs.stat(file)).size };
            if (action === 'get') return Array.from(await fs.readFile(file));
            if (action === 'del') return fs.unlink(file);
            if (action === 'put') { writes++; return fs.writeFile(file, Buffer.from(args[1])); }
            if (action === 'rename') {
              if (failCommit && /\/v-[\d-]+\.json$/.test(args[1])) throw new Error('Simulated crash before manifest rename');
              return fs.rename(file, safe(args[1]));
            }
            throw new Error('Unexpected filesystem action');
          });
          await context.addInitScript(root => {
            window.__TAURI__ = {
              path: { appLocalDataDir: async () => root },
              fs: {
                mkdir: p => recoveryFs('mkdir', [p]), readDir: p => recoveryFs('list', [p]), stat: p => recoveryFs('stat', [p]),
                readFile: async p => Uint8Array.from(await recoveryFs('get', [p])),
                writeFile: (p, bytes) => recoveryFs('put', [p, Array.from(bytes)]),
                rename: (a, b) => recoveryFs('rename', [a, b]), remove: p => recoveryFs('del', [p]),
              },
              dialog: { save: async () => root + '/exported.ora' },
            };
          }, temp.replaceAll('\\', '/'));
        }
        async function open() {
          const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message));
          await p.goto(url); await p.waitForFunction(() => !!window.__doodle?.recovery.ready);
          return p;
        }
        let page = await open();
        const fixture = await page.evaluate(() => {
          const d = __doodle; d.runAction('file.new'); document.querySelector('#newW').value = 64; document.querySelector('#newH').value = 64;
          document.querySelector('input[name=newBg][value=none]').checked = true; document.querySelector('#newCreate').click();
          const base = d.doc.active; base.name = 'Base 🎨'; base.ctx.fillStyle = '#d23670'; base.ctx.fillRect(2, 2, 35, 35); base.alphaLock = true;
          d.runAction('layer.new'); const clip = d.doc.active; clip.name = 'Recorte'; clip.clip = true; clip.ctx.fillStyle = '#2874d8'; clip.ctx.fillRect(10, 10, 45, 45);
          d.runAction('layer.new'); const empty = d.doc.active; empty.name = 'Vazia'; empty.visible = false;
          d.doc.sel = new Set([base, clip, empty]); d.runAction('layer.group'); d.doc.active.name = 'Pasta çã'; d.doc.active.opacity = 0.7; d.doc.active.collapsed = true;
          d.S.fileName = 'Sketch <&>.ora'; d.S.filePath = 'original.ora'; d.S.fileHandle = { original: true }; d.afterDocChange(true);
          return { session: d.recovery.state.id, pixels: d.allLayers().map(n => Array.from(n.ctx.getImageData(0, 0, 64, 64).data)) };
        });
        assert.equal(await page.evaluate(() => __doodle.recovery.run()), true, await page.locator('#recoveryStatus').textContent());
        assert.equal(await page.evaluate(() => __doodle.recovery.stats.encoded), 3);
        assert.equal(await page.evaluate(() => __doodle.recovery.run()), false);
        assert.equal(await page.evaluate(() => __doodle.S.dirty && __doodle.S.filePath === 'original.ora' && __doodle.S.fileHandle.original), true);
        await page.evaluate(() => { __doodle.doc.active.opacity = 0.5; __doodle.afterDocChange(true); });
        assert.equal(await page.evaluate(() => __doodle.recovery.run()), true);
        assert.equal(await page.evaluate(() => __doodle.recovery.stats.encoded), 3);
        await page.evaluate(() => { __doodle.selectOnly(__doodle.allLayers()[0]); __doodle.doc.active.alphaLock = false; __doodle.runAction('edit.clear'); });
        assert.equal(await page.evaluate(() => __doodle.recovery.run()), true);
        const fallbackPixels = await page.evaluate(() => Array.from(__doodle.doc.active.ctx.getImageData(0, 0, 64, 64).data));
        await page.evaluate(() => { __doodle.runAction('sel.all'); __doodle.S.color = '#227a43'; __doodle.runAction('sel.fill'); __doodle.runAction('sel.none'); });
        assert.equal(await page.evaluate(() => __doodle.recovery.run()), true);
        assert.equal(await page.evaluate(() => __doodle.recovery.stats.encoded), 5);
        let records = await page.evaluate(() => __doodle.recovery.records());
        assert.equal(records.length, 3);
        const latest = records[0];
        assert.equal(typeof latest.meta.checksum, 'number');
        await page.evaluate(async key => {
          const disk = __doodle.recovery.store, bytes = await disk.get(key), m = JSON.parse(new TextDecoder().decode(bytes));
          m.name = 'Damaged metadata'; await disk.put(key, new TextEncoder().encode(JSON.stringify(m)));
          if ((await __doodle.recovery.records()).some(r => r.key === key)) throw new Error('Damaged metadata was accepted');
          await disk.put(key, bytes);
        }, latest.key);
        console.log('PASS', native ? 'Native files' : 'IndexedDB', 'only changed layers encode; three coherent versions share immutable PNGs and preserve the original save target');
        // Interrupt publication of another version; the earlier versions must survive.
        if (native) failCommit = true;
        else await page.evaluate(() => {
          const disk = __doodle.recovery.store, put = disk.put.bind(disk);
          disk.put = (key, bytes) => key.includes('/v-') ? Promise.reject(new Error('Simulated transaction failure')) : put(key, bytes);
        });
        await page.evaluate(() => { __doodle.doc.active.name = 'Incomplete'; __doodle.afterDocChange(true); });
        assert.equal(await page.evaluate(() => __doodle.recovery.run()), false);
        assert.equal((await page.evaluate(() => __doodle.recovery.records())).length, 3);
        await page.close(); failCommit = false;
        page = await open();
        assert.equal(await page.locator('#recoveryNotice').isVisible(), true);
        records = await page.evaluate(() => __doodle.recovery.records()); assert.equal(records.length, 3);
        // Corrupt the newest PNG. Recovery must validate SHA-256 and use an older complete version.
        await page.evaluate(async key => {
          const disk = __doodle.recovery.store, m = (await __doodle.recovery.records()).find(r => r.key === key).meta;
          const base = m.tree[0].children[0]; await disk.put(m.session + '/p-' + base.blob + '.png', Uint8Array.of(1, 2, 3));
          window.originalHandle = { sentinel: true }; __doodle.S.fileHandle = originalHandle;
          window.showSaveFilePicker = async () => ({ name: 'exported.ora', createWritable: async () => ({ write: async bytes => { window.exported = Array.from(bytes); }, close: async () => {} }) });
        }, latest.key);
        await page.locator('#recoveryShow').click();
        assert.equal(await page.locator('.recovery-item strong').textContent(), 'Sketch <&>.ora');
        await page.getByRole('button', { name: 'Salvar cópia .ora', exact: true }).click();
        if (native) { await page.waitForFunction(() => !__doodle.recovery.busyUI); assert((await fs.stat(path.join(temp, 'exported.ora'))).size > 100); }
        else await page.waitForFunction(() => !!window.exported && !__doodle.recovery.busyUI);
        assert.equal(await page.evaluate(() => __doodle.S.fileHandle === originalHandle && !__doodle.S.dirty), true);
        await page.getByRole('button', { name: 'Recuperar', exact: true }).click();
        await page.waitForFunction(() => __doodle.S.dirty && !__doodle.recovery.busyUI);
        assert.deepEqual(await page.evaluate(() => Array.from(__doodle.allLayers()[0].ctx.getImageData(0, 0, 64, 64).data)), fallbackPixels);
        assert.equal(await page.evaluate(() => __doodle.doc.root.children[0].collapsed), true);
        assert.equal(await page.evaluate(() => __doodle.S.filePath === null && __doodle.S.fileHandle === null), true);
        assert.match(await page.locator('#toast').textContent(), /versão anterior/);
        console.log('PASS', native ? 'Native files' : 'IndexedDB', 'simulated crash/restart, incomplete commit, corruption fallback, Unicode, folder state and independent ORA-copy export');
        // Disabled autosave and a full disk must never remove a good copy.
        await page.evaluate(() => { __doodle.S.recoveryInterval = 0; });
        assert.equal(await page.evaluate(() => __doodle.recovery.run()), false);
        await page.evaluate(() => { __doodle.S.recoveryInterval = 30; __doodle.S.recoveryLimit = 0; });
        assert.equal(await page.evaluate(() => __doodle.recovery.run()), false);
        assert.equal((await page.evaluate(() => __doodle.recovery.records())).filter(r => r.meta.session === fixture.session).length, 3);
        await page.evaluate(() => { __doodle.S.recoveryLimit = 512; });
        // Save/recover acknowledgment suppresses a repeated crash prompt without deleting history.
        await page.evaluate(() => __doodle.recovery.acknowledge());
        await page.reload(); await page.waitForFunction(() => !!window.__doodle?.recovery.ready);
        await page.waitForTimeout(100);
        assert.equal(await page.locator('#recoveryNotice').isVisible(), false);
        await page.locator('#btnRecovery').evaluate(el => el.click());
        await page.waitForFunction(() => document.querySelectorAll('.recovery-item').length === 1);
        await page.locator('#recoveryInterval').selectOption('15'); await page.waitForTimeout(350);
        await page.reload(); await page.waitForFunction(() => !!window.__doodle?.recovery.ready);
        assert.equal(await page.evaluate(() => __doodle.S.recoveryInterval), 15);
        await page.locator('#btnRecovery').evaluate(el => el.click());
        await page.waitForFunction(() => document.querySelectorAll('.recovery-item').length === 1);
        await page.getByRole('button', { name: 'Descartar cópias', exact: true }).click(); await page.locator('#confirmYes').click();
        await page.waitForFunction(async () => (await __doodle.recovery.records()).length === 0);
        assert.equal(await page.evaluate(() => __doodle.S.dirty), false);
        assert.deepEqual(errors, []);
        console.log('PASS', native ? 'Native files' : 'IndexedDB', 'storage errors preserve prior copies; settings persist; acknowledgment and explicit discard retain the current drawing');
        if (native) assert(writes > 0);
      } finally {
        await context.close();
        const target = path.resolve(temp);
        assert.equal(path.dirname(target), path.resolve(os.tmpdir())); assert(path.basename(target).startsWith('doodle-recovery-'));
        await fs.rm(target, { recursive: true, force: true });
      }
    }
    const live = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    try {
      const page = await live.newPage(); await page.goto(url); await page.waitForFunction(() => !!window.__doodle?.recovery.ready);
      await page.evaluate(() => {
        const d = __doodle; d.runAction('file.new'); document.querySelector('#newW').value = 64; document.querySelector('#newH').value = 64;
        document.querySelector('input[name=newBg][value=none]').checked = true; document.querySelector('#newCreate').click();
        d.doc.active.ctx.fillStyle = '#d23670'; d.doc.active.ctx.fillRect(1, 1, 20, 20); d.afterDocChange(true); d.recovery.state.last = Date.now() - 60000;
        const view = document.querySelector('#view'), b = view.getBoundingClientRect(), p = d.docToScreen({ x: 12, y: 12 });
        view.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8, pointerType: 'pen', button: 0, buttons: 1, pressure: 0.5, clientX: b.left + p.x, clientY: b.top + p.y }));
      });
      await page.waitForTimeout(1300);
      assert.equal((await page.evaluate(() => __doodle.recovery.records())).length, 0);
      await page.evaluate(() => {
        const view = document.querySelector('#view');
        view.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 8, pointerType: 'pen', button: 0 }));
      });
      await page.waitForFunction(async () => (await __doodle.recovery.records()).length === 1);
      await page.waitForFunction(() => !__doodle.recovery.working);
      console.log('PASS Real scheduler defers a due autosave during pen input and saves after the stroke ends');
      // Change pixels after toBlob has captured them, while PNG compression is asynchronous.
      // The committed copy must contain the coherent earlier pixels and retain newer dirty edits.
      const concurrent = await page.evaluate(async () => {
        const d = __doodle; d.runAction('sel.all'); d.S.color = '#982050'; d.runAction('sel.fill'); d.runAction('sel.none');
        const before = Array.from(d.doc.active.ctx.getImageData(2, 2, 1, 1).data), version = d.recovery.state.revision;
        const original = HTMLCanvasElement.prototype.toBlob; let injected = false;
        HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
          const layer = this === d.doc.active.canvas;
          return original.call(this, blob => {
            if (layer && !injected) { injected = true; d.runAction('edit.clear'); }
            callback(blob);
          }, ...args);
        };
        let saved;
        try { saved = await d.recovery.run(); } finally { HTMLCanvasElement.prototype.toBlob = original; }
        const r = (await d.recovery.records())[0];
        if (!r) throw new Error(JSON.stringify({ saved, files: await d.recovery.store.list(), revision: d.recovery.state.revision }));
        const bytes = (await d.recovery.ora(r.key)).bytes;
        return { saved, before, version, captured: r.meta.revision, current: d.recovery.state.revision, dirty: d.S.dirty, bytes: Array.from(bytes) };
      });
      assert.equal(concurrent.saved, true); assert.equal(concurrent.captured, concurrent.version);
      assert(concurrent.current > concurrent.captured); assert.equal(concurrent.dirty, true);
      const reader = await live.newPage(); await reader.goto(url); await reader.waitForFunction(() => !!window.__doodle?.recovery.ready);
      const recoveredPixel = await reader.evaluate(async bytes => {
        await __doodle.loadOra(Uint8Array.from(bytes)); return Array.from(__doodle.doc.active.ctx.getImageData(2, 2, 1, 1).data);
      }, concurrent.bytes);
      assert.deepEqual(recoveredPixel, concurrent.before); await reader.close();
      assert.equal(await page.evaluate(() => __doodle.recovery.run()), true);
      console.log('PASS Drawing during PNG encoding produces a consistent earlier snapshot, preserves unsaved edits and schedules the newer state');
    } finally { await live.close(); }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
