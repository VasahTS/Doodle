const { launch } = require('./browser.cjs');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async()=>{
  const browser=await launch(),url=pathToFileURL(path.join(__dirname,'../src/index.html')).href;
  try {
    const context=await browser.newContext();
    // Build a genuine v1 database before the application opens v2, without downloading a fixture.
    await context.addInitScript(()=>{
      const old=indexedDB.open('doodle.recovery.v1',1);
      old.onupgradeneeded=()=>{old.result.createObjectStore('files')};
      old.onsuccess=()=>{
        const db=old.result; db.onversionchange=()=>db.close();
        const tx=db.transaction('files','readwrite');
        tx.objectStore('files').put(new Uint8Array([1,2,3]),'11111111-1111-4111-8111-111111111111/p-'+ 'a'.repeat(64)+'.png');
      };
      window.fileValueCursors=0;
      const cursor=IDBObjectStore.prototype.openCursor;
      IDBObjectStore.prototype.openCursor=function(...args){ if(this.name==='files')fileValueCursors++; return cursor.apply(this,args); };
    });
    const page=await context.newPage(); await page.goto(url); await page.waitForFunction(()=>!!window.__doodle?.recovery.ready);
    const migrated=await page.evaluate(async()=>{
      const d=__doodle, files=await d.recovery.store.list();
      return {size:files[0]?.size,bytes:Array.from(await d.recovery.store.get(files[0].key)),valueCursors:fileValueCursors};
    });
    assert.deepEqual(migrated,{size:3,bytes:[1,2,3],valueCursors:0});
    console.log('PASS v1 recovery data migrates losslessly; listing uses keys and small metadata instead of PNG value cursors');
    const backoff=await page.evaluate(async()=>{
      const d=__doodle,r=d.recovery;d.S.recoveryInterval=30;d.S.recoveryLimit=512;
      d.newDocument(64,64,'none'); d.S.color='#cc2222';d.runAction('sel.all');d.runAction('sel.fill');
      r.state.last=Date.now()-60000;
      const list=r.store.list.bind(r.store);let calls=0;
      r.store.list=async session=>{calls++;const files=await list(session);return session?files:[...files,{key:'22222222-2222-4222-8222-222222222222/p-'+ 'b'.repeat(64)+'.png',size:512*1048576}]};
      const encoded=r.stats.encoded;
      const first=await r.run({force:false}),next=r.state.nextAttempt,firstCalls=calls;
      const second=await r.run({force:false});
      const unchanged=calls===firstCalls,failures=r.state.failures,remaining=next-Date.now();
      r.store.list=list;r.retry();
      const recovered=await r.run();
      return {first,second,unchanged,failures,remaining,recovered,encodesWhileFull:r.stats.encoded-encoded-1};
    });
    assert.equal(backoff.first,false);assert.equal(backoff.second,false);assert.equal(backoff.unchanged,true);
    assert.equal(backoff.failures,1);assert(backoff.remaining>3000);assert.equal(backoff.recovered,true);assert.equal(backoff.encodesWhileFull,0);
    console.log('PASS Full recovery storage fails before PNG compression, backs off without repeat I/O and resumes on explicit retry');
    await page.evaluate(async()=>{
      const d=__doodle;d.S.recoveryVersions=5;
      for(let i=0;i<6;i++){d.S.color=i%2?'#20cc30':'#cc2030';d.runAction('sel.fill');if(!await d.recovery.run())throw new Error('Backup failed')}
      if((await d.recovery.records(d.recovery.state.id)).length!==5)throw new Error('Five-version setting ignored');
      d.S.recoveryVersions=1;
      const put=d.recovery.store.put.bind(d.recovery.store);
      d.recovery.store.put=async(key,bytes)=>{if(key.includes('/v-'))throw new Error('Interrupted manifest');return put(key,bytes)};
      d.S.color='#3344ff';d.runAction('sel.fill');if(await d.recovery.run())throw new Error('Interrupted commit succeeded');
      if((await d.recovery.records(d.recovery.state.id)).length!==5)throw new Error('Older versions pruned before successful commit');
      d.recovery.store.put=put;d.recovery.retry();if(!await d.recovery.run())throw new Error('Retry failed');
      if((await d.recovery.records(d.recovery.state.id)).length!==1)throw new Error('Retention was not applied after success');
    });
    console.log('PASS Configurable version retention; lowering the count preserves older copies until a new manifest commits');
    await context.close();
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
