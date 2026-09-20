import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../packages/dxf-skia/src/surface-host.js', import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(fn) { for(let n=0;n<100;n++) { if(fn()) return; await tick(); } throw new Error('Timed out waiting for controlled native operation.'); }
function harness(hooks = {}, options = {}) {
    const calls=[], surfaces=[], replaced=[], drawn=[], notifications=[], recovered=[];
    class Painter {
        constructor() { this.resources={ token: 'retained document resources' }; }
        draw(canvas, frame) { drawn.push(frame); hooks.draw?.(canvas,frame); return {primitives:1}; }
        clearCache() { this.clears=(this.clears||0)+1; }
        dispose() { this.disposals=(this.disposals||0)+1; }
    }
    const scope={DxfSkia:{SkiaPainter:Painter}};
    vm.runInNewContext(code,scope);
    function canvas() { return {width:1,height:1,dataset:{},getContext(){},cloneNode(){return canvas();},replaceWith(next){replaced.push(next);}}; }
    const S={SKEncodedImageFormat:{Png:'png'},SKSurface:{async Create(element, config) {
        calls.push(config.backend);
        const surface={Element:element,Backend:config.backend,Width:element.width,Height:element.height,Canvas:{},config,disposeCount:0,
            async FlushAsync(){return hooks.flush?.(surface);},
            async SnapshotAsync(){return hooks.snapshot?.(surface);},
            async DisposeAsync(){surface.disposeCount++; await hooks.dispose?.(surface);}};
        surfaces.push(surface);
        await hooks.create?.(surface);
        return surface;
    }}};
    const host=new scope.DxfSkia.SurfaceHost({Skia:S,onPaint:x=>notifications.push(x),onRecovery:e=>recovered.push(e),...options});
    host.initialize(canvas());
    return {host,calls,surfaces,replaced,drawn,notifications,recovered};
}
const frame=n=>({width:64,height:32,devicePixelRatio:1,n});
test('flush failure trips one backend and replays the latest document through the next backend',async()=>{
    const h=harness({flush:s=>{if(s.Backend==='webgpu') throw new TypeError("Failed to execute 'draw' on 'GPURenderPassEncoder': Value is outside the 'unsigned long' value range.");}});
    try {
        h.host.request(frame(1)); await h.host.whenIdle();
        assert.deepEqual(h.calls,['webgpu','webgl']); assert.equal(h.surfaces[0].disposeCount,1);
        assert.equal(h.notifications.length,1); assert.equal(h.notifications[0].backend,'webgl');
        assert.equal(h.recovered.length,1); assert.match(h.notifications[0].fallbackReasons[0],/unsigned long/);
        const resources=h.host.resources; h.host.request(frame(2)); await h.host.whenIdle();
        assert.equal(h.host.resources,resources); assert.deepEqual(h.calls,['webgpu','webgl']);
    } finally {await h.host.dispose();}
});
test('all failed backends are quarantined with one terminal notification and no render loop',async()=>{
    let errors=0; const h=harness({flush:()=>{throw Error('device failure');}},{onError:()=>errors++});
    h.host.request(frame(1)); await assert.rejects(h.host.whenIdle(),/device failure/);
    for(let i=0;i<50;i++) h.host.request(frame(i)); await tick();
    assert.deepEqual(h.calls,['webgpu','webgl','canvas']); assert.equal(errors,1); assert.equal(h.host.faulted,true);
    assert.ok(h.surfaces.every(s=>s.disposeCount===1)); await h.host.dispose();
});
test('explicit no-fallback request never silently changes graphics API',async()=>{
    const h=harness({flush:()=>{throw Error('lost');}},{backend:'webgpu',allowFallback:false});
    h.host.request(frame(1)); await assert.rejects(h.host.whenIdle(),/lost/); assert.deepEqual(h.calls,['webgpu']); await h.host.dispose();
});
test('backend creation failure and synchronous creation-time loss dispose and fall back',async()=>{
    const h=harness({create:s=>{if(s.Backend==='webgpu') s.config.onDeviceLost({reason:'destroyed'});}});
    h.host.request(frame(1)); await h.host.whenIdle(); assert.deepEqual(h.calls,['webgpu','webgl']);
    assert.equal(h.surfaces[0].disposeCount,1); await h.host.dispose();
});
test('device loss after a successful paint schedules bounded recovery without another UI request',async()=>{
    const h=harness(); h.host.request(frame(1)); await h.host.whenIdle();
    h.surfaces[0].config.onDeviceLost({message:'adapter removed'}); await h.host.whenIdle();
    assert.deepEqual(h.calls,['webgpu','webgl']); assert.equal(h.host.paintCount,2); assert.equal(h.surfaces[0].disposeCount,1);
    h.surfaces[0].config.onDeviceLost({message:'duplicate stale callback'}); await tick();
    assert.deepEqual(h.calls,['webgpu','webgl']); await h.host.dispose();
});
test('a frame superseded during an asynchronous flush is never announced as current',async()=>{
    const waiting=deferred(); let count=0; const h=harness({flush:()=>++count===1?waiting.promise:undefined});
    h.host.request(frame(1)); await until(()=>count===1); h.host.request(frame(2)); waiting.resolve(); await h.host.whenIdle();
    assert.equal(h.notifications.length,1); assert.equal(h.notifications[0].frame.n,2); await h.host.dispose();
});
test('suspension invalidates in-flight presentation and resume republishes the retained frame',async()=>{
    const waiting=deferred(); let count=0; const h=harness({flush:()=>++count===1?waiting.promise:undefined});
    h.host.request(frame(1)); await until(()=>count===1); h.host.suspend(); waiting.resolve(); await h.host.whenIdle();
    assert.equal(h.notifications.length,0); h.host.resume(); await h.host.whenIdle(); assert.equal(h.notifications.length,1); await h.host.dispose();
});
test('explicit backend retry during creation disposes the stale surface before using the requested backend',async()=>{
    const waiting=deferred(); const h=harness({create:s=>s.Backend==='webgpu'?waiting.promise:undefined});
    h.host.request(frame(1)); await until(()=>h.calls.length===1); h.host.retryBackend('canvas'); waiting.resolve(); await h.host.whenIdle();
    assert.deepEqual(h.calls,['webgpu','canvas']); assert.equal(h.surfaces[0].disposeCount,1); assert.equal(h.notifications[0].backend,'canvas'); await h.host.dispose();
});
test('explicit retry resets the circuit without losing document resources',async()=>{
    let fail=true; const h=harness({flush:()=>{if(fail) throw Error('failure');}});
    h.host.request(frame(1)); await assert.rejects(h.host.whenIdle()); const resources=h.host.resources;
    fail=false; h.host.retryBackend('canvas'); await h.host.whenIdle(); assert.equal(h.host.resources,resources);
    assert.equal(h.host.faulted,false); assert.equal(h.notifications[0].backend,'canvas'); await h.host.dispose();
});
test('invalid DPR and surface budget do not poison a functioning backend',async()=>{
    const h=harness(); h.host.request({...frame(1),devicePixelRatio:Infinity}); await assert.rejects(h.host.whenIdle(),/Finite positive/);
    assert.deepEqual(h.calls,[]); assert.equal(h.host.failedBackends.size,0);
    h.host.request({...frame(2),width:1e12}); await assert.rejects(h.host.whenIdle(),/pixel budget/);
    h.host.request(frame(3)); await h.host.whenIdle(); assert.equal(h.notifications[0].frame.n,3); await h.host.dispose();
});
test('throwing UI callbacks cannot cause graphics fallback or unhandled rejection storms',async()=>{
    const h=harness({}, {onPaint:()=>{throw Error('UI bug');}}); h.host.request(frame(1)); await h.host.whenIdle();
    assert.deepEqual(h.calls,['webgpu']); assert.equal(h.host.callbackError.message,'UI bug'); assert.equal(h.host.failedBackends.size,0); await h.host.dispose();
});
test('disposal during initialization is idempotent and releases native and painter state once',async()=>{
    const waiting=deferred(); const h=harness({create:()=>waiting.promise});
    h.host.request(frame(1)); await until(()=>h.calls.length===1); const painter=h.host.painter;
    const a=h.host.dispose(), b=h.host.dispose(); assert.equal(a,b); waiting.resolve(); await a;
    assert.equal(h.surfaces[0].disposeCount,1); assert.equal(painter.disposals,1); assert.equal(h.notifications.length,0); assert.equal(h.host.canvas,null);
});

function pngImage(counters = {}) {
    return {
        Encode() {
            counters.encodes = (counters.encodes || 0) + 1;
            return { ToArray: () => new Uint8Array([137,80,78,71]), Dispose() { counters.dataDisposals = (counters.dataDisposals || 0) + 1; } };
        },
        Dispose() { counters.imageDisposals = (counters.imageDisposals || 0) + 1; }
    };
}
test('explicit retry during a failed flush is a new generation, not another failed backend', async () => {
    const gate=deferred(); let flushes=0;
    const h=harness({flush:()=>++flushes===1?gate.promise:undefined},{backend:'webgpu',allowFallback:false});
    h.host.request(frame(1)); await until(()=>flushes===1);
    h.host.retryBackend('webgpu'); gate.reject(new Error('old generation failure'));
    try {
        await h.host.whenIdle();
        assert.deepEqual(h.calls,['webgpu','webgpu']);
        assert.equal(h.host.failedBackends.size,0);
        assert.equal(h.host.recoveryEvents.length,0);
        assert.equal(h.surfaces[0].disposeCount,1);
        assert.equal(h.notifications.length,1);
    } finally { await h.host.dispose(); }
});
test('a throwing canvas-replacement notification does not poison a viable backend', async () => {
    const h=harness({create:s=>{if(s.Backend==='webgpu')throw Error('unavailable');}},
        {onCanvasReplaced:()=>{throw Error('consumer canvas callback');}});
    try {
        h.host.request(frame(1)); await h.host.whenIdle();
        assert.deepEqual(h.calls,['webgpu','webgl']);
        assert.equal(h.host.callbackError.message,'consumer canvas callback');
        assert.equal(h.host.failedBackends.size,1);
    } finally { await h.host.dispose(); }
});
test('PNG readbacks are serialized per surface and release native images and data exactly once', async () => {
    const gate=deferred(), counts={}; let started=0, active=0, maximum=0;
    const h=harness({snapshot:async()=>{started++;maximum=Math.max(maximum,++active);if(started===1)await gate.promise;active--;return pngImage(counts);}});
    h.host.request(frame(1)); await h.host.whenIdle();
    const first=h.host.exportPng(), second=h.host.exportPng();
    await until(()=>started>=1); await tick(); const before=started;
    gate.resolve();
    try {
        await Promise.all([first,second]);
        assert.equal(before,1); assert.equal(maximum,1);
        assert.equal(counts.imageDisposals,2); assert.equal(counts.dataDisposals,2);
    } finally { await h.host.dispose(); }
});
test('surface disposal waits for an outstanding PNG readback, rejects stale export, and releases once', async () => {
    const gate=deferred(), counts={}; let started=false;
    const h=harness({snapshot:async()=>{started=true;await gate.promise;return pngImage(counts);}});
    h.host.request(frame(1)); await h.host.whenIdle(); const painter=h.host.painter;
    const exporting=assert.rejects(h.host.exportPng(),/Drawing changed/);
    await until(()=>started); const disposing=h.host.dispose(); await tick();
    const prematurelyDisposed=h.surfaces[0].disposeCount;
    gate.resolve(); await exporting; await disposing;
    assert.equal(prematurelyDisposed,0); assert.equal(h.surfaces[0].disposeCount,1);
    assert.equal(counts.imageDisposals,1); assert.equal(counts.encodes,undefined); assert.equal(painter.disposals,1);
});
test('a camera redraw waits for PNG readback and cannot publish an export of the wrong frame', async () => {
    const gate=deferred(), counts={}; let started=false;
    const h=harness({snapshot:async()=>{started=true;await gate.promise;return pngImage(counts);}});
    h.host.request(frame(1)); await h.host.whenIdle();
    const exported=h.host.exportPng().then(()=>({ok:true}),error=>({error})); await until(()=>started);
    h.host.request(frame(2)); await tick(); const paintsDuringReadback=h.drawn.length;
    gate.resolve(); const outcome=await exported; await h.host.whenIdle();
    try {
        assert.equal(paintsDuringReadback,1);
        assert.match(outcome.error?.message || '',/Drawing changed/);
        assert.equal(h.host.presentedFrame.n,2); assert.equal(counts.imageDisposals,1);
    } finally { await h.host.dispose(); }
});
test('resize retires the source surface only after pending snapshot completion', async () => {
    const gate=deferred(); let started=false;
    const h=harness({snapshot:async()=>{started=true;await gate.promise;return pngImage();}});
    h.host.request(frame(1)); await h.host.whenIdle();
    const exported=h.host.exportPng().catch(error=>error); await until(()=>started);
    h.host.request({...frame(2),width:128}); await tick(); const premature=h.surfaces[0].disposeCount;
    gate.resolve(); const error=await exported; await h.host.whenIdle();
    try {
        assert.equal(premature,0); assert.match(error.message,/Drawing changed/);
        assert.equal(h.surfaces[0].disposeCount,1); assert.equal(h.host.surface.Width,128);
    } finally { await h.host.dispose(); }
});
test('backend retry waits for a readback without dropping resources or reusing the old surface', async () => {
    const gate=deferred(); let started=false;
    const h=harness({snapshot:async()=>{started=true;await gate.promise;return pngImage();}});
    h.host.request(frame(1)); await h.host.whenIdle(); const resources=h.host.resources;
    const exported=h.host.exportPng().catch(error=>error); await until(()=>started);
    h.host.retryBackend('canvas'); await tick(); const premature=h.surfaces[0].disposeCount;
    gate.resolve(); const error=await exported; await h.host.whenIdle();
    try {
        assert.equal(premature,0); assert.match(error.message,/Drawing changed/);
        assert.deepEqual(h.calls,['webgpu','canvas']); assert.equal(h.host.resources,resources);
        assert.equal(h.host.recoveryEvents.length,0);
    } finally { await h.host.dispose(); }
});
test('failed snapshot releases the surface queue and allows another export and redraw', async () => {
    const counts={}; let attempts=0;
    const h=harness({snapshot:()=>{if(++attempts===1)throw Error('readback failed');return pngImage(counts);}});
    try {
        h.host.request(frame(1)); await h.host.whenIdle(); await assert.rejects(h.host.exportPng(),/readback failed/);
        const png=await h.host.exportPng(); assert.equal(png[0],137);
        h.host.request(frame(2)); await h.host.whenIdle(); assert.equal(h.host.presentedFrame.n,2);
        assert.equal(h.host.failedBackends.size,0); assert.equal(counts.imageDisposals,1);
    } finally { await h.host.dispose(); }
});

test('queued PNG exports cancel before native entry when disposal invalidates the generation', async () => {
    const gate=deferred(); let started=0;
    const h=harness({snapshot:async()=>{started++;await gate.promise;return pngImage();}});
    h.host.request(frame(1)); await h.host.whenIdle();
    const a=h.host.exportPng().catch(e=>e),b=h.host.exportPng().catch(e=>e);
    await until(()=>started===1); const disposing=h.host.dispose(); gate.resolve();
    const errors=await Promise.all([a,b]); await disposing;
    assert.equal(started,1); assert.ok(errors.every(e=>/Drawing changed/.test(e.message)));
    assert.equal(h.surfaces[0].disposeCount,1);
});
test('native PNG encoder failures dispose the image and do not strand the next surface operation', async () => {
    let disposals=0;
    const h=harness({snapshot:()=>({Encode(){throw Error('codec failure');},Dispose(){disposals++;}})});
    try {
        h.host.request(frame(1));await h.host.whenIdle();await assert.rejects(h.host.exportPng(),/codec failure/);
        h.host.request(frame(2));await h.host.whenIdle();assert.equal(h.host.presentedFrame.n,2);
        assert.equal(disposals,1);assert.equal(h.host.failedBackends.size,0);
    } finally {await h.host.dispose();}
});
test('a null native snapshot is an explicit export error and never poisons rendering', async () => {
    const h=harness({snapshot:()=>null});
    try {
        h.host.request(frame(1));await h.host.whenIdle();await assert.rejects(h.host.exportPng(),/Native snapshot failed/);
        h.host.request(frame(2));await h.host.whenIdle();assert.equal(h.host.failedBackends.size,0);
    } finally {await h.host.dispose();}
});
test('a new frame queued immediately after export is painted before the snapshot is captured', async () => {
    const captured=[];let h;
    h=harness({snapshot:()=>{captured.push(h.drawn.at(-1).n);return pngImage();}});
    try {
        h.host.request(frame(1));await h.host.whenIdle();
        const exported=h.host.exportPng();h.host.request(frame(2));await exported;await h.host.whenIdle();
        assert.deepEqual(captured,[2]);
    } finally {await h.host.dispose();}
});
