// Full resolution stress/regression tests; no app dependencies are required.
const { launch } = require('./browser.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
(async () => {
 const browser = await launch(); const results = [];
 try {
  const cases = [
   {name:'1080p-fast-reference',W:1920,H:1080,size:160,events:30},
   {name:'4K-default-fast',W:3840,H:2160,size:160,events:30},
   {name:'4K-worker-cpu',W:3840,H:2160,size:500,events:12,cpu:true},
   {name:'4K-max-fast',W:3840,H:2160,size:500,events:12},
   {name:'8K-limit-max-fast',W:8000,H:8000,size:500,events:12},
   {name:'8K-limit-default-fast',W:8000,H:8000,size:160,events:12},
   {name:'4K-min-brush-jump',W:3840,H:2160,size:1,events:2},
   {name:'8K-selection-alpha-twirl',W:8000,H:8000,size:500,events:12,mode:'twirl',selection:true,lock:true},
   {name:'4K-many-layers',W:3840,H:2160,size:500,events:12,layers:12},
   {name:'4K-cooperative',W:3840,H:2160,size:500,events:12,fallback:true},
  ].filter(c => !process.env.DOODLE_STRESS_FILTER || c.name.includes(process.env.DOODLE_STRESS_FILTER));
  for (const c of cases) {
   const page = await browser.newPage({viewport:{width:1366,height:768}}), errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(process.env.DOODLE_STRESS_SOURCE || path.join(__dirname,'../src/index.html')).href);
   await page.waitForFunction(()=>!!window.__doodle);
   const r = await page.evaluate(async c => {
    const d=__doodle; if(!d.finishLiquify)d.finishLiquify=async()=>{}; d.S.recoveryInterval=0; d.newDocument(c.W,c.H,'none');
    window.__DOODLE_FORCE_COOPERATIVE__=!!c.fallback; window.__DOODLE_FORCE_CPU__=!!c.cpu;
    if(c.layers)for(let i=1;i<c.layers;i++)d.runAction('layer.new');
    d.runAction('tool.liquify'); Object.assign(d.S.tools.liquify,{size:c.size,strength:1,pStrength:true,mode:c.mode||'push'});
    const l=d.doc.active, tile=document.createElement('canvas'); tile.width=64;tile.height=64;
    const t=tile.getContext('2d'); t.fillStyle='#f353a4';t.fillRect(0,0,32,64);t.fillStyle='#26acfc';t.fillRect(32,0,32,32);
    l.ctx.fillStyle=l.ctx.createPattern(tile,'repeat');l.ctx.fillRect(0,0,c.W,c.H);d.afterDocChange(false);l.alphaLock=!!c.lock;
    if(c.selection)d.applyLasso([{x:c.W/2-512,y:c.H/2-512},{x:c.W/2+512,y:c.H/2-512},{x:c.W/2+512,y:c.H/2+512},{x:c.W/2-512,y:c.H/2+512}],'replace');
    await new Promise(r=>setTimeout(r,250));
    const regions=[{x:0,y:0},{x:Math.floor(c.W/2)-64,y:Math.floor(c.H/2)-64},{x:c.W-128,y:c.H-128}];
    const sample=()=>regions.map(b=>l.ctx.getImageData(b.x,b.y,128,128).data);
    const equal=(a,b)=>a.every((v,j)=>v.every((n,i)=>n===b[j][i]));
    const before=sample(), v=document.querySelector('#view'), b=v.getBoundingClientRect(), times=[], gaps=[];
    const event=(type,x,y,id=91)=>{ const q=d.docToScreen({x,y}), start=performance.now();v.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'pen',pressure:1,button:0,buttons:type==='pointerup'?0:1,clientX:b.left+q.x,clientY:b.top+q.y,bubbles:true}));times.push(performance.now()-start); };
    let previous=performance.now(), active=true;
    const beat=()=>{const now=performance.now();gaps.push(now-previous);previous=now;if(active)setTimeout(beat,8);};setTimeout(beat,8);
    const started=performance.now();event('pointerdown',4,4);
    for(let i=1;i<=c.events;i++){event('pointermove',4+(c.W-8)*i/c.events,4+(c.H-8)*i/c.events);await new Promise(r=>setTimeout(r,8));}
    event('pointerup',c.W-4,c.H-4);await d.finishLiquify();
    active=false;const elapsed=performance.now()-started, after=sample(), stats=d.performanceSnapshot().liquify?.lastStroke || {backend:'legacy-main-thread',status:'complete'};
    if(equal(before,after))throw Error('No deformation');
    if(c.lock&&!before.every((v,j)=>v.every((n,i)=>i%4!==3||n===after[j][i])))throw Error('Alpha lock changed alpha');
    if(c.selection&&(!equal([before[0]],[after[0]])||!equal([before[2]],[after[2]])))throw Error('Changed pixels outside selection');
    if(!c.selection&&!before[2].some((n,i)=>n!==after[2][i]))throw Error('Final endpoint lost');
    d.undo();if(!equal(before,sample()))throw Error('Undo did not restore exact original');
    d.redo();if(!equal(after,sample()))throw Error('Redo did not restore exact result');
    gaps.sort((a,b)=>a-b);times.sort((a,b)=>a-b);
    return {name:c.name,elapsedMs:elapsed,inputP95:times[Math.floor(times.length*.95)],inputMax:times.at(-1),heartbeatP95:gaps[Math.floor(gaps.length*.95)],heartbeatMax:gaps.at(-1),heartbeatCount:gaps.length,stats,history:d.history};
   },c);
   assert.equal(r.stats.status,'complete');if(!process.env.DOODLE_STRESS_SOURCE){assert.equal(r.stats.events,c.events+(c.mode?2:1),'Dropped input events');assert.equal(r.stats.backend,c.fallback?'cooperative':'worker');
   assert(r.stats.peakCacheBytes<=32*1024*1024,'Unbounded source tile cache');
   assert(r.stats.maxPublishTiles<=8,'Oversized preview batch');
   assert(r.inputP95<50,'Input handler exceeds 50 ms');assert(r.heartbeatP95<50,'UI heartbeat p95 exceeds 50 ms');
   }assert(r.heartbeatCount>0,'UI heartbeat did not run');assert.deepEqual(errors,[]);
   console.log('PASS',JSON.stringify(r)); results.push(r); await page.close();
  }
  fs.writeFileSync(process.env.DOODLE_STRESS_OUTPUT || path.join(__dirname,'liquify-stress-results.json'),JSON.stringify(results,null,2)+'\n');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
