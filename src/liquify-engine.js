/* Sparse, full-resolution Liquify. The same engine can yield cooperatively if Workers are unavailable. */
(() => {
'use strict';
function engine(scope) {
  const TILE = 128, CACHE_TILES = 512;
  let state = null, sequence = 0;
  const replies = new Map();
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  function rpc(type, data, transfer = []) {
    const request = ++sequence;
    return new Promise((resolve, reject) => {
      replies.set(request, { resolve, reject });
      scope.postMessage({ ...data, type, request, id: state.id }, transfer);
    });
  }
  function tileKey(x, y) { return (y >> 7) * state.cols + (x >> 7); }
  async function ensure(rect) {
    const s = state, missing = [];
    if (s.gpu) {
      let collision=false;
      for(let y=rect.y&~127;y<rect.y+rect.h;y+=TILE) for(let x=rect.x&~127;x<rect.x+rect.w;x+=TILE) {
        const slot=((y&2047)>>7)*16+((x&2047)>>7), key=tileKey(x,y);
        if(s.slots.has(slot)&&s.slots.get(slot)!==key)collision=true;
      }
      if(collision){await flush();s.cache.clear();s.slots.clear();}
    }
    const needed = (Math.ceil((rect.x + rect.w) / TILE) - (rect.x >> 7)) * (Math.ceil((rect.y + rect.h) / TILE) - (rect.y >> 7));
    if (s.cache.size + needed > CACHE_TILES) { await flush(); s.cache.clear(); s.slots.clear(); }
    for (let y = rect.y & ~127; y < rect.y + rect.h; y += TILE)
      for (let x = rect.x & ~127; x < rect.x + rect.w; x += TILE) {
        const key = tileKey(x, y);
        if (!s.cache.has(key)) missing.push({ key, x, y, w: Math.min(TILE, s.W - x), h: Math.min(TILE, s.H - y) });
      }
    for (let i = 0; i < missing.length; i += 8) {
      const items = await rpc('tiles', { tiles: missing.slice(i, i + 8) });
      for (const item of items) {
        let data = item.data, mask = item.mask;
        if (item.bitmap) {
          const c = new scope.OffscreenCanvas(item.w, item.h), ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(item.bitmap, 0, 0); item.bitmap.close();
          data = ctx.getImageData(0, 0, item.w, item.h).data;
          if (item.maskBitmap) {
            ctx.clearRect(0, 0, item.w, item.h); ctx.drawImage(item.maskBitmap, 0, 0); item.maskBitmap.close();
            mask = ctx.getImageData(0, 0, item.w, item.h).data;
          }
        }
        s.cache.set(item.key, { ...item, bitmap: null, maskBitmap: null, data, mask });
        if(s.gpu) {
          const gl=gpu.gl;
          gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,gpu.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,item.x&2047,item.y&2047,item.w,item.h,gl.RGBA,gl.UNSIGNED_BYTE,data);
          if(s.selection){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,gpu.mask);gl.texSubImage2D(gl.TEXTURE_2D,0,item.x&2047,item.y&2047,item.w,item.h,gl.RGBA,gl.UNSIGNED_BYTE,mask);gl.activeTexture(gl.TEXTURE0);}
          s.slots.set(((item.y&2047)>>7)*16+((item.x&2047)>>7),item.key);
        }
        s.stats.tilesRead++;
      }
    }
  }
  function clampRect(x, y, w, h) {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(state.W, Math.ceil(x + w)), y1 = Math.min(state.H, Math.ceil(y + h));
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  async function flush() {
    const s = state;
    const keys = [...s.dirty];
    for (let n = 0; n < keys.length; n += 8) {
      const transfer = [], tiles = keys.slice(n, n + 8).map(key => {
        const tile = s.cache.get(key);
        if(s.gpu){
          const gl=gpu.gl, next=new Uint8ClampedArray(tile.w*tile.h*4);
          gl.bindFramebuffer(gl.FRAMEBUFFER,gpu.read);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,gpu.texture,0);
          gl.readPixels(tile.x&2047,tile.y&2047,tile.w,tile.h,gl.RGBA,gl.UNSIGNED_BYTE,next);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
          if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw Error('Liquify graphics context lost');
          if(next.every((v,i)=>v===tile.data[i]))return null;
          if(!s.originals.has(key)){s.originals.set(key,tile.data.slice());s.stats.originalBytes+=tile.data.byteLength;}
          tile.data=next;
        }
        const data = tile.data.slice();
        const before = s.originals.get(key);
        const original = before && !s.sentOriginals.has(key) ? before : null;
        if (original) { s.sentOriginals.add(key); s.originals.set(key, null); transfer.push(original.buffer); }
        transfer.push(data.buffer);
        return { key, x: tile.x, y: tile.y, w: tile.w, h: tile.h, data, before: original };
      }).filter(Boolean);
      if(tiles.length) await rpc('paint', { tiles }, transfer);
      s.stats.publications++; s.stats.maxPublishTiles = Math.max(s.stats.maxPublishTiles, tiles.length);
    }
    s.dirty.clear(); s.lastFlush = performance.now();
  }
  let gpu;
  function makeGpu() {
    const canvas = new scope.OffscreenCanvas(512, 512);
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, depth: false, stencil: false });
    if (!gl) return null;
    const shader = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s)); return s; };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}'));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D pixels, maskPixels;
uniform bool hasSelection;
uniform ivec2 origin, sourceOrigin, documentSize;
uniform vec2 center, movement;
uniform float radius, strength;
uniform int mode, signDirection;
uniform bool alphaLock;
out vec4 color;
vec4 pixel(ivec2 p) {
 if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,documentSize)))return vec4(0.);
 return texelFetch(pixels,p%ivec2(2048),0);
}
void main(){
 ivec2 point=origin+ivec2(gl_FragCoord.xy);
 vec4 original=pixel(point);
 if(hasSelection&&texelFetch(maskPixels,point%ivec2(2048),0).a==0.){color=original;return;}
 vec2 v=vec2(point)+.5-center;
 float d2=dot(v,v)/(radius*radius);
 if(d2>=1.){color=original;return;}
 float falloff=(1.-d2)*(1.-d2);
 vec2 from;
 if(mode==0) from=vec2(point)-movement*strength*falloff;
 else if(mode==3){float a=-float(signDirection)*strength*.18*falloff;float co=cos(a),si=sin(a);from=vec2(v.x*co-v.y*si,v.x*si+v.y*co)+center-.5;}
 else from=v*exp((mode==1?-1.:1.)*strength*.18*falloff)+center-.5;
 ivec2 lo=ivec2(floor(from));vec2 f=fract(from);
 vec4 p0=pixel(lo),p1=pixel(lo+ivec2(1,0)),p2=pixel(lo+ivec2(0,1)),p3=pixel(lo+ivec2(1));
 vec4 weights=vec4((1.-f.x)*(1.-f.y),f.x*(1.-f.y),(1.-f.x)*f.y,f.x*f.y)*vec4(p0.a,p1.a,p2.a,p3.a);
 float a=dot(weights,vec4(1.));
 if(alphaLock&&(original.a==0.||a*255.<.5)){color=original;return;}
 float na=alphaLock?original.a:floor(a*255.+.5)/255.;
 vec3 rgb=na>0.&&a>0.?(p0.rgb*weights.x+p1.rgb*weights.y+p2.rgb*weights.z+p3.rgb*weights.w)/a:vec3(0.);
 color=vec4(floor(rgb*255.+.5)/255.,na);
}`));
    gl.linkProgram(program); if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program); gl.disable(gl.BLEND); gl.disable(gl.DITHER);
    const makeTexture=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA8,2048,2048);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);return t;};
    const texture=makeTexture();gl.activeTexture(gl.TEXTURE1);const mask=makeTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.uniform1i(gl.getUniformLocation(program,'maskPixels'),1);
    const uniforms={};for(const key of ['origin','sourceOrigin','documentSize','center','movement','radius','strength','mode','signDirection','alphaLock','hasSelection'])uniforms[key]=gl.getUniformLocation(program,key);
    return {gl,texture,mask,uniforms,read:gl.createFramebuffer()};
  }
  function gpuDab(s, rect, cx, cy, dx, dy, strength, reverse, mode) {
    const {gl,texture,uniforms:u}=gpu;
    if(gl.isContextLost())throw Error('Liquify graphics context lost');
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.viewport(0,0,rect.w,rect.h);
    gl.uniform2i(u.origin,rect.x,rect.y);gl.uniform2i(u.documentSize,s.W,s.H);
    gl.uniform2f(u.center,cx,cy);gl.uniform2f(u.movement,dx,dy);gl.uniform1f(u.radius,s.cfg.size/2);gl.uniform1f(u.strength,strength);
    gl.uniform1i(u.mode,['push','expand','pinch','twirl'].indexOf(mode));gl.uniform1i(u.signDirection,reverse?-1:1);gl.uniform1i(u.alphaLock,s.alphaLock?1:0);gl.uniform1i(u.hasSelection,s.selection?1:0);
    gl.drawArrays(gl.TRIANGLES,0,3);
    // Copy the completed dab into the sparse atlas only after all source samples
    // have been read. Splits preserve pixels across wrapping tile boundaries.
    for(let y=0;y<rect.h;){const ty=(rect.y+y)&2047,hh=Math.min(rect.h-y,2048-ty);
      for(let x=0;x<rect.w;){const tx=(rect.x+x)&2047,ww=Math.min(rect.w-x,2048-tx);
        gl.copyTexSubImage2D(gl.TEXTURE_2D,0,tx,ty,x,y,ww,hh);x+=ww;
      }y+=hh;
    }
    if(gl.getError()!==gl.NO_ERROR||gl.isContextLost())throw Error('Liquify graphics context lost');
    for(let y=rect.y&~127;y<rect.y+rect.h;y+=TILE)for(let x=rect.x&~127;x<rect.x+rect.w;x+=TILE)s.dirty.add(tileKey(x,y));
    s.stats.pixelEngine='webgl2';s.stats.gpuBytes=2*2048*2048*4;
  }
  async function dab(cx, cy, dx, dy, pressure, reverse) {
    const s = state, c = s.cfg, r = c.size / 2;
    const strength = c.strength * (c.pStrength ? pressure : 1);
    if (!(strength > 0)) return;
    let rect = clampRect(cx - r, cy - r, 2 * r, 2 * r);
    if (rect && s.selection) {
      const b = s.selection, x = Math.max(rect.x, b.x), y = Math.max(rect.y, b.y);
      rect = clampRect(x, y, Math.min(rect.x + rect.w, b.x + b.w) - x, Math.min(rect.y + rect.h, b.y + b.h) - y);
    }
    if (!rect) return;
    const pad = Math.ceil(r * .4 + 2);
    const srcRect = clampRect(rect.x - pad, rect.y - pad, rect.w + 2 * pad, rect.h + 2 * pad);
    if (!s.forceCpu && s.cfg.size >= 24 && !scope.cooperative && gpu===undefined) {try{gpu=makeGpu();}catch(_){gpu=null;}}
    s.gpu=!s.forceCpu&&s.cfg.size>=24&&!scope.cooperative&&!!gpu;
    const fetchStart = performance.now(); await ensure(srcRect); s.stats.fetchMs += performance.now() - fetchStart;
    const start = performance.now(), bytes = srcRect.w * srcRect.h * 4;
    let mode = c.mode;
    if (reverse && mode === 'expand') mode = 'pinch'; else if (reverse && mode === 'pinch') mode = 'expand';
    if(s.gpu){
      gpuDab(s,rect,cx,cy,dx,dy,strength,reverse,mode);
      s.stats.computeMs+=performance.now()-start;s.stats.dabs++;s.stats.peakCacheBytes=Math.max(s.stats.peakCacheBytes,s.cache.size*TILE*TILE*4);return;
    }
    if (!s.source || s.source.length < bytes) s.source = new Uint8ClampedArray(bytes);
    const source = s.source;
    // A frozen source for this dab, copied row-wise from sparse CPU tiles.
    for (let y = 0; y < srcRect.h; y++) {
      let x = srcRect.x;
      while (x < srcRect.x + srcRect.w) {
        const tile = s.cache.get(tileKey(x, srcRect.y + y));
        const count = Math.min(tile.x + tile.w, srcRect.x + srcRect.w) - x;
        const from = ((srcRect.y + y - tile.y) * tile.w + x - tile.x) * 4;
        source.set(tile.data.subarray(from, from + count * 4), (y * srcRect.w + x - srcRect.x) * 4);
        x += count;
      }
    }
    const mx = dx * strength, my = dy * strength, r2 = r * r;
    s.stats.pixelEngine='cpu';
    let sliceStart = performance.now();
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      const vy = y + .5 - cy, vy2 = vy * vy;
      if (vy2 >= r2) continue;
      const reach = Math.sqrt(r2 - vy2);
      const left = Math.max(rect.x, Math.ceil(cx - reach - .5)), right = Math.min(rect.x + rect.w, Math.ceil(cx + reach - .5));
      for (let x = left; x < right; x++) {
        const tile = s.cache.get(tileKey(x, y)), i = ((y - tile.y) * tile.w + x - tile.x) * 4;
        const dst = tile.data;
        if ((tile.mask && !tile.mask[i + 3]) || (s.alphaLock && !dst[i + 3])) continue;
        const vx = x + .5 - cx, d2 = (vx * vx + vy2) / r2;
        if (d2 >= 1) continue;
        const t = 1 - d2, falloff = t * t;
        let sx, sy;
        if (mode === 'push') { sx = x - mx * falloff; sy = y - my * falloff; }
        else if (mode === 'twirl') {
          const a = -(reverse ? -1 : 1) * strength * .18 * falloff, co = Math.cos(a), si = Math.sin(a);
          sx = vx * co - vy * si + cx - .5; sy = vx * si + vy * co + cy - .5;
        } else {
          const scale = Math.exp((mode === 'expand' ? -1 : 1) * strength * .18 * falloff);
          sx = vx * scale + cx - .5; sy = vy * scale + cy - .5;
        }
        const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
        const j = ((iy - srcRect.y) * srcRect.w + ix - srcRect.x) * 4, stride = srcRect.w * 4;
        const validX0 = ix >= 0 && ix < s.W, validX1 = ix + 1 >= 0 && ix + 1 < s.W;
        const validY0 = iy >= 0 && iy < s.H, validY1 = iy + 1 >= 0 && iy + 1 < s.H;
        // Unrolled premultiplied bilinear sampling; transparent outside the document.
        const w0 = validX0 && validY0 ? (1 - fx) * (1 - fy) * source[j + 3] : 0;
        const w1 = validX1 && validY0 ? fx * (1 - fy) * source[j + 7] : 0;
        const w2 = validX0 && validY1 ? (1 - fx) * fy * source[j + stride + 3] : 0;
        const w3 = validX1 && validY1 ? fx * fy * source[j + stride + 7] : 0;
        const a = w0 + w1 + w2 + w3;
        if (s.alphaLock && a < .5) continue;
        const na = s.alphaLock ? dst[i + 3] : Math.round(a);
        const nr = na && a ? Math.round(((w0 ? source[j] * w0 : 0) + (w1 ? source[j + 4] * w1 : 0) + (w2 ? source[j + stride] * w2 : 0) + (w3 ? source[j + stride + 4] * w3 : 0)) / a) : 0;
        const ng = na && a ? Math.round(((w0 ? source[j + 1] * w0 : 0) + (w1 ? source[j + 5] * w1 : 0) + (w2 ? source[j + stride + 1] * w2 : 0) + (w3 ? source[j + stride + 5] * w3 : 0)) / a) : 0;
        const nb = na && a ? Math.round(((w0 ? source[j + 2] * w0 : 0) + (w1 ? source[j + 6] * w1 : 0) + (w2 ? source[j + stride + 2] * w2 : 0) + (w3 ? source[j + stride + 6] * w3 : 0)) / a) : 0;
        if (dst[i] === nr && dst[i + 1] === ng && dst[i + 2] === nb && dst[i + 3] === na) continue;
        if (!s.originals.has(tile.key)) {
          const original = dst.slice(); s.originals.set(tile.key, original); s.stats.originalBytes += original.byteLength;
        }
        dst[i] = nr; dst[i + 1] = ng; dst[i + 2] = nb; dst[i + 3] = na;
        s.dirty.add(tile.key); s.changed.add(tile.key);
      }
      if (scope.cancelled) throw new Error('Cancelled');
      if (scope.cooperative && (y & 7) === 0 && performance.now() - sliceStart >= 4) {
        s.stats.yields++; await pause(); sliceStart = performance.now();
      }
    }
    s.stats.computeMs += performance.now() - start; s.stats.dabs++;
    s.stats.peakCacheBytes = Math.max(s.stats.peakCacheBytes, s.cache.size * TILE * TILE * 4);
  }
  async function process(s) {
    if (s.running) return;
    s.running = true;
    try {
      while (state === s) {
        const point = s.queue.shift();
        if (!point) {
          await flush();
          if (s.queue.length) continue;
          if (s.ending) {
            scope.postMessage({ type: 'done', id: s.id, stats: s.stats });
            state = null;
          }
          break;
        }
        if (point.tick) await dab(point.x, point.y, 0, 0, point.p, point.alt);
        else {
          const dx = point.x - s.x, dy = point.y - s.y, dist = Math.hypot(dx, dy);
          if (dist >= .01) {
            const count = Math.ceil(dist / Math.max(1, s.cfg.size * .1));
            s.stats.maxDabsPerEvent = Math.max(s.stats.maxDabsPerEvent, count);
            for (let i = 1; i <= count && state === s; i++) {
              const f = i / count;
              await dab(s.x + dx * f, s.y + dy * f, dx / count, dy / count, s.p + (point.p - s.p) * f, point.alt);
              if (performance.now() - s.lastFlush >= 12) { await flush(); if (scope.cooperative) await pause(); }
            }
          }
          s.x = point.x; s.y = point.y; s.p = point.p;
        }
        if (performance.now() - s.lastFlush >= 12) { await flush(); if (scope.cooperative) await pause(); }
      }
    } catch (e) {
      scope.postMessage({ type: 'error', id: s.id, message: String(e?.message || e) });
      if (state === s) state = null;
    } finally { s.running = false; if (state === s && (s.queue.length || s.ending)) void process(s); }
  }
  scope.onmessage = ({ data: m }) => {
    if (m.type === 'reply') {
      const reply = replies.get(m.request); if (!reply) return;
      replies.delete(m.request); m.error ? reply.reject(new Error(m.error)) : reply.resolve(m.value); return;
    }
    if (m.type === 'begin') {
      state = { ...m, cols: Math.ceil(m.W / TILE), cache: new Map(), slots: new Map(), originals: new Map(), sentOriginals: new Set(), changed: new Set(), dirty: new Set(), queue: [], ending: false, running: false, lastFlush: performance.now(), stats: { dabs: 0, events: 0, maxQueue: 0, maxDabsPerEvent: 0, tilesRead: 0, originalBytes: 0, peakCacheBytes: 0, fetchMs: 0, computeMs: 0, publications: 0, maxPublishTiles: 0, yields: 0 } };
      return;
    }
    const s = state; if (!s || s.id !== m.id) return;
    if (m.type === 'point') { s.queue.push(m); s.stats.events++; s.stats.maxQueue = Math.max(s.stats.maxQueue, s.queue.length); }
    if (m.type === 'end') s.ending = true;
    void process(s);
  };
}
let idleWorker = null;
function create(forceCooperative = false) {
  if (!forceCooperative && idleWorker) { const worker = idleWorker; idleWorker = null; return worker; }
  if (!forceCooperative && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    const url = URL.createObjectURL(new Blob(['(' + engine.toString() + ')(self);'], { type: 'text/javascript' }));
    try {
      const worker = new Worker(url); URL.revokeObjectURL(url); worker.backend = 'worker'; return worker;
    } catch (_) { URL.revokeObjectURL(url); }
  }
  let stopped = false;
  const client = { backend: 'cooperative', onmessage: null, onerror: null, postMessage(data) { if (!stopped) queueMicrotask(() => scope.onmessage({ data })); }, terminate() { stopped = true; scope.cancelled = true; } };
  const scope = { cooperative: true, OffscreenCanvas: typeof OffscreenCanvas !== 'undefined' ? OffscreenCanvas : function(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, postMessage(data) { if (!stopped) queueMicrotask(() => client.onmessage?.({ data })); }, onmessage: null };
  engine(scope); return client;
}
window.DoodleLiquifyEngine = { create, release(worker) { if (worker.backend === 'worker') { idleWorker?.terminate(); idleWorker = worker; worker.onmessage = worker.onerror = null; } else worker.terminate(); } };
})();
