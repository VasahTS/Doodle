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
    await page.waitForFunction(() => !!window.__doodle);
    const results = await page.evaluate(async () => {
      const d = __doodle, results = [], v = document.querySelector('#view');
      const check = (ok, message) => { if (!ok) throw Error(message); results.push(message); };
      const wait = () => new Promise(r => setTimeout(r, 8));
      const equal = (a,b) => a.length === b.length && a.every((v,i) => v === b[i]);
      const sample = () => d.doc.active.ctx.getImageData(0,0,512,512).data;
      function reset() {
        d.newDocument(512,512,'none'); d.S.recoveryInterval=0;
        const l=d.doc.active;
        for(let y=0;y<512;y+=16) for(let x=0;x<512;x+=16) {
          l.ctx.fillStyle=`rgba(${x/2},${y/2},180,${x%32?1:.5})`;l.ctx.fillRect(x,y,12,12);
        }
        d.afterDocChange(false);d.runAction('tool.liquify');
        Object.assign(d.S.tools.liquify,{size:160,strength:.4,pStrength:true,mode:'push'});
      }
      function event(type,x,y) {
        const p=d.docToScreen({x,y}),b=v.getBoundingClientRect();
        v.dispatchEvent(new PointerEvent(type,{pointerId:91,pointerType:'pen',pressure:.7,button:0,buttons:type==='pointerup'?0:1,clientX:b.left+p.x,clientY:b.top+p.y,bubbles:true}));
      }
      function drag(y) {event('pointerdown',80,y);event('pointermove',400,y);event('pointerup',400,y);}
      reset();const before=sample();drag(160);drag(320);await d.finishLiquify();const after=sample();
      check(d.history.undo===2&&!equal(before,after),'Rapid consecutive strokes are preserved separately');
      d.undo();const first=sample();d.undo();check(equal(before,sample()),'Both queued strokes undo exactly');
      d.redo();check(equal(first,sample()),'First queued stroke redoes exactly');d.redo();check(equal(after,sample()),'Second queued stroke redoes exactly');
      reset();const original=sample();drag(256);await d.runAction('edit.undo');
      check(equal(original,sample())&&d.history.redo===1,'Undo requested during computation waits for the completed stroke');
      reset();drag(256);d.newDocument(512,512,'none');await new Promise(r=>setTimeout(r,200));
      check(sample().every(v=>v===0)&&d.history.undo===0,'Late worker replies cannot change a replacement document');
      reset();const safe=sample();event('pointerdown',60,256);event('pointermove',300,256);
      for(let i=0;i<200&&!d.liquify?.tiles.size;i++)await wait();
      check(d.liquify?.tiles.size>0,'Failure injection happens after a visible preview');
      d.liquify.worker.onerror({message:'Injected worker failure'});
      check(equal(safe,sample())&&d.history.undo===0,'Worker failure restores original pixels without a partial history entry');
      check(d.performanceSnapshot().liquify.lastStroke.status==='reverted','Diagnostics identify a reverted stroke');
      // CPU and GPU have independent samplers. Use one dab with integral source
      // displacement to detect orientation, atlas addressing and alpha mistakes.
      let cpu;
      for(const backend of ['cpu','gpu']) {
        window.__DOODLE_FORCE_CPU__=backend==='cpu';reset();
        event('pointerdown',240,256);event('pointermove',248,256);event('pointerup',248,256);await d.finishLiquify();
        const bytes=sample();if(backend==='cpu')cpu=bytes;
        else {let max=0;for(let i=0;i<bytes.length;i++)max=Math.max(max,Math.abs(bytes[i]-cpu[i]));check(max<=2,'GPU and CPU agree within 2 channel levels, including partial alpha: '+max);}
      }
      window.__DOODLE_FORCE_CPU__=false;
      return results;
    });
    results.forEach(r=>console.log('PASS',r)); assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
})().catch(e=>{ console.error(e); process.exitCode=1; });
