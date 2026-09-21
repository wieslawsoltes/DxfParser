import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import A from '../packages/dxf-skia/index.js';
import H from '../packages/dxf-skia/tests/helpers.js';
import {Initialize} from '../vendor/skiasharpweb/dist/package/node.js';
const S=await Initialize({fonts:false});
const fontFile=[process.env.SKIA_TEST_FONT,'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'].find(x=>x&&fs.existsSync(x));
const font=()=>{assert.ok(fontFile,'Native performance tests require a local font.');return fs.readFileSync(fontFile);};
function fixture({cacheLimit,cacheBytes,textCacheLimit,textCacheBytes}={}) {
 const resources=new A.ResourceStore(S),surface=S.SKSurface.Create(new S.SKImageInfo(640,480)),painter=new A.SkiaPainter(S,{resources,cacheLimit,cacheBytes,textCacheLimit,textCacheBytes});
 return {resources,surface,painter,draw(scene,options={}){const f=A.prepareFrame(scene,{width:640,height:480});painter.draw(surface.Canvas,f,options);return f;},dispose(){painter.dispose();surface.Dispose();resources.dispose();}};
}
const textScene=(resources,content='ÅΩ ffi j',count=1)=>new A.SceneCompiler(new A.DxfDocument(H.file(Array.from({length:count},(_,i)=>[[0,'TEXT'],[5,'T'+i],[1,content+i],[10,i*10],[20,0],[40,3],[7,'F']]).flat(),{tables:[[0,'STYLE'],[2,'F'],[3,'local.ttf']]})),{textMeasurer:(p,t)=>resources.measureText(p,t)}).compile();
test('native text recordings remove repeated font creation, measurement and shaping',()=>{const f=fixture();try{
 f.resources.register('local.ttf',font());const scene=textScene(f.resources,'ffi Ω ',20);f.draw(scene);const before={...f.resources.metrics};
 for(let i=0;i<10;i++)f.draw(scene);
 assert.equal(f.painter.metrics.textBuilds,20);assert.equal(f.painter.metrics.textHits,200);assert.deepEqual(f.resources.metrics,before);assert.equal(before.fontCreates,1);
}finally{f.dispose();}});
test('native path working set above old 2048 limit is reused on every pan',()=>{const f=fixture();try{
 const scene=H.compile(Array.from({length:3000},(_,i)=>H.circle(i.toString(16),(i%100)*30,Math.floor(i/100)*30,10)).flat());
 const first=f.draw(scene);assert.equal(first.interactionStats.pickablesCreated,0);f.draw(scene);assert.equal(f.painter.metrics.pathBuilds,3000);assert.equal(f.painter.metrics.pathHits,3000);
}finally{f.dispose();}});
test('native caches below drawing size remain bounded without cyclic eviction',()=>{const f=fixture({cacheLimit:2,cacheBytes:1024});try{
 const scene=H.compile([...H.line('A'),...H.line('B',0,2,10,2),...H.line('C',0,3,10,3)]);f.draw(scene);const paths=[...f.painter.cache.values()].map(v=>v.path);f.draw(scene);
 assert.equal(f.painter.cache.size,2);assert.ok(f.painter.cachedBytes<=1024);assert.equal(f.painter.metrics.pathHits,2);assert.deepEqual([...f.painter.cache.values()].map(v=>v.path),paths);f.painter.clearCache();assert.ok(paths.every(p=>p.IsDisposed));
}finally{f.dispose();}});
test('shared hatch clips build once per frame rather than once per pattern line',()=>{const f=fixture();try{
 const scene=H.compile(H.hatch('H',false).concat([[78,1],[53,0],[43,0],[44,0],[45,0],[46,1],[79,0]]));
 assert.ok(scene.primitives.length>5);f.draw(scene);assert.equal(f.painter.metrics.clipBuilds,1);assert.ok(f.painter.metrics.clipHits>5);assert.equal(f.painter.frameClips,null);f.draw(scene);assert.equal(f.painter.metrics.clipBuilds,2);
}finally{f.dispose();}});
test('text recording eviction and revision changes dispose native pictures',()=>{const f=fixture({textCacheLimit:1});try{
 f.resources.register('local.ttf',font());const scene=textScene(f.resources,'Pump ',3);f.draw(scene);const p=[...f.painter.textCache.values()][0].picture;
 f.draw(scene);assert.equal(f.painter.textCache.size,1);assert.equal(f.painter.metrics.textHits,1);assert.equal(p.IsDisposed,false);
 f.resources.remove('local.ttf');f.draw(scene);assert.equal(p.IsDisposed,true);f.painter.clearCache();assert.equal(f.painter.textBytes,0);
}finally{f.dispose();}});
test('text measurement caches are bounded and invalidated atomically on resource removal',()=>{const f=fixture();try{
 f.resources.register('local.ttf',font());const p={font:'local.ttf'};
 for(let i=0;i<4100;i++)f.resources.measureText(p,'Label '+i);
 assert.ok(f.resources.measurements.size<=4096);assert.ok(f.resources.measurementCharacters<=1000000);
 const session=[...f.resources.fontSessions.values()][0];assert.throws(()=>f.resources.register('local.ttf',new Uint8Array([0,1,2])));assert.equal(session.font.IsDisposed,false);
 f.resources.remove('local.ttf');assert.equal(session.font.IsDisposed,true);assert.equal(session.shaper.IsDisposed,true);assert.equal(f.resources.measurements.size,0);
}finally{f.dispose();}});
test('text recordings stay vector content through native PDF export',async()=>{const host=new A.SurfaceHost({Skia:S});try{
 await host.ensureRuntime();host.resources.register('local.ttf',font());host.lastFrame=A.prepareFrame(textScene(host.resources,'Native PDF Ω'));
 const data=await host.exportPdf();assert.equal(Buffer.from(data).subarray(0,5).toString(),'%PDF-');assert.ok(!Buffer.from(data).includes(Buffer.from('/Subtype /Image')));
}finally{await host.dispose();}});
