// Test dependency only: npm install --no-save --ignore-scripts ag-psd
// Alternatively set PSD_READER_PATH to an external installation of ag-psd.
const { launch } = require('./browser.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const ag = require(process.env.PSD_READER_PATH || 'ag-psd');
ag.initializeCanvas(() => { throw new Error('Unexpected canvas allocation'); },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }));
const read = bytes => ag.readPsd(Uint8Array.from(bytes), { useImageData: true, throwForMissingFeatures: true });

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ acceptDownloads: true }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, '../src/index.html')).href);
    await page.waitForFunction(() => !!window.__doodle);
    await page.evaluate(() => {
      const d = __doodle; d.runAction('file.new');
      document.querySelector('#newW').value = 257; document.querySelector('#newH').value = 19;
      document.querySelector('input[name=newBg][value=none]').checked = true;
      document.querySelector('#newCreate').click();
    });
    const fixture = await page.evaluate(() => {
      const d = __doodle, layers = [], snapshots = [];
      const add = (name, paint) => {
        d.runAction('layer.new'); const l = d.doc.active; l.name = name;
        paint?.(l.ctx); layers.push(l); return l;
      };
      const empty = d.doc.active; empty.name = 'Vazia';
      const base = add('Base çã 🎨', ctx => {
        ctx.fillStyle = '#d23670'; ctx.fillRect(4, 3, 200, 12);
        ctx.clearRect(10, 6, 6, 5);
        ctx.clearRect(100, 3, 40, 12); ctx.fillStyle = '#d2367080'; ctx.fillRect(100, 3, 40, 12);
      }); base.opacity = 0.6; base.alphaLock = true;
      const clip = add('Recorte', ctx => { ctx.fillStyle = '#2874d8'; ctx.fillRect(0, 0, 60, 19); }); clip.clip = true;
      const hidden = add('Oculta', ctx => { ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 257, 19); }); hidden.visible = false;
      const noise = add('Textura ' + 'é'.repeat(270), ctx => {
        const im = ctx.createImageData(257, 3);
        for (let i = 0; i < im.data.length; i += 4) {
          im.data[i] = (i * 13) % 256; im.data[i + 1] = i < 512 ? 128 : (i * 29) % 256;
          im.data[i + 2] = Math.floor(i / 12) % 2 ? 30 : 200; im.data[i + 3] = i % 24 ? 255 : 80;
        }
        ctx.putImageData(im, 0, 12);
      }); noise.opacity = 0.8;
      d.doc.sel = new Set([base, clip, hidden, noise]); d.runAction('layer.group');
      const folder = d.doc.active; folder.name = 'Pasta aberta'; folder.opacity = 0.7;
      d.doc.sel = new Set([folder]); d.runAction('layer.group');
      d.doc.active.name = 'Pasta externa'; d.doc.active.collapsed = true;
      d.selectOnly(empty);
      const orphan = add('Recorte sem base', ctx => { ctx.fillStyle = '#d4a024'; ctx.fillRect(230, 4, 8, 8); });
      // First node in a group has no clipping base; the app renders it normally.
      d.doc.sel = new Set([orphan]); d.runAction('layer.group'); orphan.clip = true;
      d.doc.active.name = 'Sem base';
      d.selectOnly(empty);
      const invis = add('Dentro da pasta oculta', ctx => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 257, 19); });
      d.doc.sel = new Set([invis]); d.runAction('layer.group'); d.doc.active.name = 'Pasta oculta'; d.doc.active.visible = false;
      for (const l of [empty, ...layers]) snapshots.push({ name: l.name, pixels: Array.from(l.ctx.getImageData(0, 0, 257, 19).data) });
      d.S.fileName = 'Teste.ora'; d.S.filePath = 'original.ora'; d.S.dirty = true;
      return { bytes: Array.from(d.buildPsd()), snapshots,
        composite: Array.from(d.compositeCanvas().getContext('2d').getImageData(0, 0, 257, 19).data) };
    });
    const psd = read(fixture.bytes);
    assert.equal(psd.width, 257); assert.equal(psd.height, 19); assert.equal(psd.bitsPerChannel, 8);
    const nodes = [], visit = xs => xs.forEach(n => { nodes.push(n); if (n.children) visit(n.children); }); visit(psd.children);
    const find = name => nodes.find(n => n.name === name);
    assert.equal(find('Pasta externa').opened, false);
    assert.equal(find('Pasta aberta').children.length, 4);
    assert.equal(find('Pasta aberta').opacity, 1);
    assert.equal(find('Base çã 🎨').opacity, Math.round(0.6 * 0.7 * 255) / 255);
    assert.equal(find('Recorte').opacity, 1);
    assert.equal(find('Oculta').hidden, true); assert.equal(find('Pasta oculta').hidden, true);
    assert.equal(find('Recorte').clipping, true); assert.equal(!!find('Recorte sem base').clipping, false);
    assert.equal(find('Base çã 🎨').transparencyProtected, true);
    assert.equal(find('Base çã 🎨').protected.transparency, true);
    for (const expected of fixture.snapshots) {
      const layer = find(expected.name); assert.ok(layer, 'Unicode layer name preserved');
      const actual = new Uint8ClampedArray(257 * 19 * 4), im = layer.imageData;
      if (im) for (let y = 0; y < im.height; y++)
        actual.set(im.data.subarray(y * im.width * 4, (y + 1) * im.width * 4), ((y + layer.top) * 257 + layer.left) * 4);
      assert.deepEqual(Array.from(actual), expected.pixels, expected.name + ' retains every pixel');
    }
    console.log('PASS Independent PSD reader: nested folders, Unicode, visibility, opacity, clipping, locks, empty layers and lossless pixel channels');
    for (let i = 0; i < fixture.composite.length; i += 4) {
      const expected = fixture.composite, actual = psd.imageData.data;
      assert.equal(actual[i + 3], expected[i + 3]);
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(actual[i + c] - expected[i + c]) * expected[i + 3] / 255 <= 1.5, 'White matte round trip');
    }
    console.log('PASS Composite preview retains transparency and appearance');
    if (process.env.DOODLE_PSD_OUTPUT) {
      fs.mkdirSync(process.env.DOODLE_PSD_OUTPUT, { recursive: true });
      fs.writeFileSync(path.join(process.env.DOODLE_PSD_OUTPUT, 'layers.psd'), Buffer.from(fixture.bytes));
      const { PNG } = require('pngjs');
      fs.writeFileSync(path.join(process.env.DOODLE_PSD_OUTPUT, 'expected.png'), PNG.sync.write({ width: 257, height: 19, data: Buffer.from(fixture.composite) }));
    }
    await page.evaluate(() => {
      window.showSaveFilePicker = async options => {
        window.savedOptions = options;
        return { name: 'Teste.psd', createWritable: async () => ({ write: async b => { window.savedBytes = Array.from(b); }, close: async () => {} }) };
      };
    });
    await page.locator('#btnExportPsd').evaluate(el => el.click());
    await page.waitForFunction(() => !!window.savedBytes);
    const saved = await page.evaluate(() => ({ bytes: savedBytes, options: savedOptions, name: __doodle.S.fileName, path: __doodle.S.filePath, dirty: __doodle.S.dirty }));
    assert.equal(saved.options.suggestedName, 'Teste.psd');
    assert.deepEqual(saved.options.types[0].accept, { 'image/vnd.adobe.photoshop': ['.psd'] });
    assert.equal(saved.name, 'Teste.ora'); assert.equal(saved.path, 'original.ora'); assert.equal(saved.dirty, true);
    assert.equal(read(saved.bytes).children.length, psd.children.length);
    console.log('PASS File menu exports PSD without replacing the native ORA save destination or unsaved state');
    await page.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException('Cancelled', 'AbortError'); }; });
    const downloads = []; page.on('download', d => downloads.push(d));
    await page.locator('#btnExportPsd').evaluate(el => el.click()); await page.waitForTimeout(200);
    assert.equal(downloads.length, 0);
    // Inspect the generated Blob before the browser's OS download policy applies.
    await page.evaluate(() => {
      window.showSaveFilePicker = undefined;
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => { window.downloadBlob = blob; return create(blob); };
      HTMLAnchorElement.prototype.click = function () { window.downloadName = this.download; };
    });
    await page.locator('#btnExportPsd').evaluate(el => el.click());
    await page.waitForFunction(() => !!window.downloadBlob);
    const fallback = await page.evaluate(async () => ({ bytes: Array.from(new Uint8Array(await downloadBlob.arrayBuffer())), name: downloadName, type: downloadBlob.type }));
    assert.equal(read(fallback.bytes).width, 257); assert.equal(fallback.name, 'Teste.psd');
    assert.equal(fallback.type, 'image/vnd.adobe.photoshop');
    console.log('PASS Cancel and browser download fallback');
    await page.locator('[data-lang="en"]').evaluate(el => el.click());
    assert.ok((await page.locator('#btnExportPsd').textContent()).includes('Export PSD'));
    const native = await browser.newContext();
    await native.addInitScript(() => {
      window.__TAURI__ = {
        dialog: { save: async options => { window.nativeOptions = options; return 'C:/art/Sketch'; } },
        fs: { writeFile: async (path, bytes) => { window.nativeSaved = { path, bytes: Array.from(bytes) }; } },
      };
    });
    const app = await native.newPage(); app.on('pageerror', e => errors.push(e.message));
    await app.goto(pathToFileURL(path.join(__dirname, '../src/index.html')).href);
    await app.waitForFunction(() => !!window.__doodle);
    await app.evaluate(() => {
      __doodle.runAction('file.new'); document.querySelector('#newW').value = 16; document.querySelector('#newH').value = 16;
      document.querySelector('#newCreate').click();
    });
    await app.locator('#btnExportPsd').evaluate(el => el.click());
    await app.waitForFunction(() => !!window.nativeSaved);
    const nativeSaved = await app.evaluate(() => ({ saved: nativeSaved, options: nativeOptions }));
    assert.equal(nativeSaved.saved.path, 'C:/art/Sketch.psd'); assert.equal(read(nativeSaved.saved.bytes).width, 16);
    assert.deepEqual(nativeSaved.options.filters[0].extensions, ['psd']);
    await native.close();
    console.log('PASS Native app save dialog, PSD filter, automatic extension and file writing');
    assert.deepEqual(errors, []);
    console.log('PASS English translation and no browser errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
