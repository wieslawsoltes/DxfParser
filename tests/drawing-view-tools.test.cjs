'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../packages/dxf-skia'), { compile, line } = require('../packages/dxf-skia/tests/helpers');
require('../vendor/dockyard/avalondock');
const D = global.AvalonDock, T = require('../packages/dxf-drawing-tools/index.cjs').createDrawingViewTools(S, D);
const frame = (x = 0, span = 20, width = 800, height = 600, options = {}) => S.prepareFrame(compile(line('A', x, x, x + span, x + span)), { width, height, ...options });
const redraw = (f, camera) => S.prepareFrame(f.scene, { width: f.width, height: f.height, viewDirection: camera.direction, viewState: camera.viewState });
const almost = (a, b) => assert.ok(Math.abs(a - b) < 1e-8 * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`);

test('world camera transfer uses resolved coordinates, not destination auto extents or DPR', () => {
    const a = frame(0, 20, 800, 600, { devicePixelRatio: 2, viewState: { mode: 'custom', center: S.geometry.vec(4, 8, 2), scale: 7, rotationRad: .3 } });
    const b = frame(1000, 200, 300, 900), camera = T.transferCamera(T.captureCamera(a), b), result = redraw(b, camera);
    assert.deepEqual(result.worldCenter, a.worldCenter); assert.equal(result.scale, a.scale); assert.equal(result.rotationRad, a.rotationRad);
    const p = S.geometry.vec(5, 6), ap = a.worldToScreen(p), bp = result.worldToScreen(p);
    almost(ap.x - a.width / 2, bp.x - result.width / 2); almost(ap.y - a.height / 2, bp.y - result.height / 2);
    assert.notEqual(camera.viewState.center, a.worldCenter); assert.ok(T.sameCamera(result, camera));
});
test('world transfer retains isometric projection and depth', () => {
    const a = frame(0, 20, 800, 600, { viewDirection: S.geometry.vec(1, 1, 1), viewState: { mode: 'custom', center: S.geometry.vec(2, 4, 6), scale: 13, rotationRad: -.9 } });
    const b = redraw(frame(300), T.transferCamera(T.captureCamera(a), frame(300)));
    almost(b.basis.z.x, a.basis.z.x); almost(b.basis.z.y, a.basis.z.y); almost(b.basis.z.z, a.basis.z.z);
    assert.deepEqual(b.screenToWorld(S.geometry.vec(400, 300)), a.screenToWorld(S.geometry.vec(400, 300)));
});
test('relative transfer preserves normalized pan and fit ratio across bounds and pane sizes', () => {
    const a = frame(0, 20, 800, 600, { viewState: { mode: 'custom', center: S.geometry.vec(15, 5), scale: 53.6, rotationRad: .2 } });
    const snapshot = T.captureCamera(a), b = frame(100, 200, 480, 950);
    const result = T.captureCamera(redraw(b, T.transferCamera(snapshot, b, 'relative')));
    almost(result.zoom, snapshot.zoom); almost(result.offset.x, snapshot.offset.x); almost(result.offset.y, snapshot.offset.y);
    assert.deepEqual(result.center, {x: 250, y: 150, z: 0});
});
test('relative transfer handles empty drawings and huge world origins', () => {
    for (const a of [S.prepareFrame(compile([])), frame(1e12, 10)]) {
        const b = S.prepareFrame(compile([]), {width:200,height:400});
        const c = T.transferCamera(T.captureCamera(a), b, 'relative');
        assert.ok(Number.isFinite(c.viewState.center.x) && Number.isFinite(c.viewState.scale));
    }
});
test('layout mismatch is skipped and camera input validation fails closed', () => {
    const f = frame(), s = T.captureCamera(f, 'Model');
    assert.equal(T.transferCamera(s, f, 'world', 'Sheet A'), null);
    assert.ok(T.transferCamera(s, f, 'world', 'model'));
    assert.throws(() => T.transferCamera({...s,scale:NaN},f), /Nonfinite/);
    assert.throws(() => T.transferCamera({...s,direction:{x:0,y:0,z:0}},f), /Invalid camera/);
    assert.throws(() => T.transferCamera(s, f, 'unknown'), /world or relative/);
    assert.throws(() => T.captureCamera(null), /rendered drawing/);
});
function linkHarness() {
    const records = [0,100,200].map(x => ({open:true,visible:true,frame:frame(x),layout:'Model'}));
    let active = records[0], serial = 0, applied = 0, link;
    const queue = new Map(), errors = [];
    link = new T.NavigationLink({ records: () => records, active: () => active, visible: r => r.visible,
        frame: r => r.frame, layout: r => r.layout,
        schedule: f => {queue.set(++serial,f);return serial;},cancel: id => queue.delete(id),error: e => errors.push(e),
        apply: (r,camera) => {applied++;r.frame=redraw(r.frame,camera);link.onFrame(r,r.frame);} });
    return {records,link,queue,errors,get applied(){return applied;},focus(r){active=r;link.focus(r);},
        flush(){const callbacks=[...queue.values()];queue.clear();callbacks.forEach(f=>f());},
        move(r,x){r.frame=frame(x,20,800,600,{viewState:{mode:'custom',center:S.geometry.vec(x+10,x+10),scale:40}});link.onFrame(r,r.frame);} };
}
test('navigation coalesces a gesture burst and does not echo follower frames', () => {
    const h=linkHarness();h.link.setMode('world');
    for(let i=0;i<100;i++)h.move(h.records[0],i);
    assert.equal(h.queue.size,1);h.flush();assert.equal(h.applied,2);assert.equal(h.queue.size,0);
    assert.deepEqual(h.records[1].frame.worldCenter,h.records[0].frame.worldCenter);
    h.link.dispose();
});
test('focus switches consume the latest pending camera before a new gesture', () => {
    const h=linkHarness();h.link.setMode('world');h.move(h.records[0],250);h.focus(h.records[1]);h.flush();
    assert.equal(h.records[1].frame.worldCenter.x,260);
    h.move(h.records[1],350);h.flush();assert.equal(h.records[0].frame.worldCenter.x,360);h.link.dispose();
});
test('hidden/closed/incompatible views are not painted; revealed views catch up', () => {
    const h=linkHarness();h.records[1].visible=false;h.records[2].layout='Sheet A';h.link.setMode('world');h.flush();assert.equal(h.applied,0);
    h.records[1].visible=true;h.link.onFrame(h.records[1],h.records[1].frame);h.flush();assert.equal(h.applied,1);
    h.records[1].open=false;h.move(h.records[0],70);h.flush();assert.equal(h.applied,1);h.link.dispose();
});
test('turning links off cancels pending work and restores independent navigation', () => {
    const h=linkHarness();h.link.setMode('world');h.link.setMode('off');h.flush();assert.equal(h.applied,0);
    h.move(h.records[0],300);assert.equal(h.queue.size,0);
    h.link.match();assert.equal(h.applied,2);assert.equal(h.link.mode,'off');h.link.dispose();
});
test('invalid mode does not alter queued state, disposal cancels queued work', () => {
    const h=linkHarness();h.link.setMode('relative');assert.throws(()=>h.link.setMode('oops'));assert.equal(h.link.mode,'relative');assert.equal(h.queue.size,1);
    h.link.dispose();h.flush();assert.equal(h.applied,0);assert.equal(h.link.snapshot,null);h.link.dispose();
});
test('relative followers recompute fit scale when resized, without becoming the leader', () => {
    const h=linkHarness();h.link.setMode('relative');h.flush();const a=T.captureCamera(h.records[0].frame);
    h.records[1].frame=S.prepareFrame(h.records[1].frame.scene,{width:300,height:1200,viewState:h.records[1].frame.viewState});
    h.link.onFrame(h.records[1],h.records[1].frame);h.flush();almost(T.captureCamera(h.records[1].frame).zoom,a.zoom);assert.deepEqual(T.captureCamera(h.records[0].frame),a);h.link.dispose();
});
function dock(count=4) {
    const models=Array.from({length:count},(_,i)=>new D.LayoutDocument({ContentId:'view'+i,Title:'Drawing '+i}));
    const source=new D.LayoutDocument({ContentId:'source',Title:'Tree'}), tool=new D.LayoutAnchorable({ContentId:'layers'});
    const pane=new D.LayoutDocumentPane({Id:'source-pane',DockWidth:'3*',Children:[source,...models]});
    const manager=new D.DockingManager({Layout:new D.LayoutRoot({RootPanel:new D.LayoutPanel({Children:[pane,new D.LayoutAnchorablePane({DockWidth:240,Children:[tool]})]})}),EnableHistory:true,AllowMixedOrientation:true});
    manager.Activate(models[1]||models[0]);manager.ClearHistory();return {manager,models,source,tool};
}
const liveModels=h=>h.models.map(m=>h.manager.Find(m.ContentId));
test('grid tiling uses equal star rows and panes and keeps unrelated content', () => {
    const h=dock();assert.deepEqual(T.tileDrawings(h.manager,h.models,'grid',1200,600),{columns:2,rows:2});
    const parents=h.models.map(m=>m.Parent);assert.equal(new Set(parents).size,4);
    assert.equal(h.source.Parent,parents[0]);assert.equal(h.tool.Parent.DockWidth.Value,240);
    assert.ok(h.models.every(m=>m.IsSelected&&!m.IsFloating));assert.equal(h.manager.ActiveModel,h.models[1]);
    assert.ok(parents.every(p=>p.DockWidth.IsStar&&p.DockWidth.Value===1));
    assert.equal(parents[0].Parent,parents[1].Parent);assert.equal(parents[2].Parent,parents[3].Parent);
    assert.equal(parents[0].Parent.DockHeight.Value,parents[2].Parent.DockHeight.Value);D.validateLayout(h.manager.Layout);
});
test('retile is one undo operation and does not grow obsolete pane wrappers', () => {
    const h=dock(6);T.tileDrawings(h.manager,h.models,'grid',1200,800);h.manager.ClearHistory();
    const before=h.manager.SaveLayout();T.tileDrawings(h.manager,liveModels(h),'vertical');
    assert.equal(h.manager._undo.length,1);assert.ok(h.manager.Undo());
    const reloaded=h.manager.SaveLayout();const stable=text=>JSON.parse(JSON.stringify(JSON.parse(text),(key,value)=>key==='LastActivationTimeStamp'?undefined:value));assert.deepEqual(stable(reloaded),stable(before));assert.ok(h.manager.Redo());
    for(let i=0;i<40;i++)T.tileDrawings(h.manager,liveModels(h),i%2?'horizontal':'grid',1200,800);
    assert.ok(D.validateLayout(h.manager.Layout).nodes<35);
});
test('floating views are redocked while retaining model/content identity', () => {
    const h=dock(3);h.manager.Float(h.models[0]);h.manager.Float(h.models[1]);h.manager.Float(h.models[2]);h.manager.ClearHistory();
    T.tileDrawings(h.manager,h.models,'horizontal');assert.ok(h.models.every(m=>!m.IsFloating));assert.equal(h.manager.Layout.FloatingWindows.Count,0);
    assert.ok(h.manager.Undo());assert.ok(liveModels(h).every(m=>m.IsFloating));
});
test('locked and duplicate models and invalid layouts are rejected before mutation', () => {
    const h=dock();h.models[3].CanMove=false;const before=h.manager.SaveLayout();
    assert.throws(()=>T.tileDrawings(h.manager,h.models,'grid'),/movable/);assert.equal(h.manager.SaveLayout(),before);
    assert.throws(()=>T.tileDrawings(h.manager,[h.models[0],h.models[0]]),/unique/);
    assert.throws(()=>T.tileDrawings(h.manager,h.models,'diagonal'),/grid tiling/);
});
test('a rejected Dock operation rolls the whole tile transaction back', () => {
    const h=dock(3);h.manager.Float(h.models[2]);const before=h.manager.SaveLayout(),originalDock=h.manager.Dock;
    h.manager.Dock=function(){throw new Error('test rejection');};
    assert.throws(()=>T.tileDrawings(h.manager,h.models),/test rejection/);h.manager.Dock=originalDock;
    const stable=text=>JSON.parse(JSON.stringify(JSON.parse(text),(key,value)=>key==='LastActivationTimeStamp'?undefined:value));
    assert.deepEqual(stable(h.manager.SaveLayout()),stable(before));D.validateLayout(h.manager.Layout);
});
test('grid shape supports 1–32 drawings and rejects nonfinite dimensions', () => {
    for(let n=1;n<=32;n++)for(const [w,h]of[[1200,600],[500,1200],[100,100]]){const s=T.gridShape(n,w,h);assert.ok(s.rows*s.columns>=n&&s.rows<=n&&s.columns<=n);}
    assert.deepEqual(T.gridShape(4,1200,600),{columns:2,rows:2});assert.throws(()=>T.gridShape(33));assert.throws(()=>T.gridShape(4,Infinity,1));
});

test('transferred relative cameras preserve native Skia pixels within one antialias level for translated/scaled drawings', async () => {
    const {Initialize}=await import('../vendor/skiasharpweb/dist/package/node.js'), K=await Initialize({fonts:false});
    const a=frame(0,20), b=frame(1000,200), target=redraw(b,T.transferCamera(T.captureCamera(a),b,'relative'));
    function paint(f){const surface=K.SKSurface.Create(new K.SKImageInfo(f.width,f.height)),painter=new S.SkiaPainter(K);try{const stats=painter.draw(surface.Canvas,f);assert.deepEqual(stats.diagnostics.filter(d=>d.severity==='error'),[]);const image=surface.Snapshot();try{return new Uint8Array(image.ReadPixels());}finally{image.Dispose();}}finally{painter.dispose();surface.Dispose();}}
    const pa=paint(a),pb=paint(target);let changed=0,maxDelta=0;for(let i=0;i<pa.length;i++){const delta=Math.abs(pa[i]-pb[i]);if(delta){changed++;maxDelta=Math.max(maxDelta,delta);}}
    // Equivalent transforms can round a native antialias coverage value by one byte level.
    assert.ok(maxDelta<=1 && changed<pa.length*.01,JSON.stringify({changed,maxDelta,total:pa.length}));
});

test('removing a queued follower cannot apply into a disposed document', () => {
    const h=linkHarness();h.link.setMode('world');h.records[1].disposed=true;h.records.splice(2,1);h.flush();assert.equal(h.applied,0);h.link.dispose();
});

test('32 retained views have finite shallow grid layouts across repeated arrangements', () => {
    const h=dock(32);
    for(const mode of ['grid','horizontal','vertical','grid']){T.tileDrawings(h.manager,liveModels(h),mode,1200,900);assert.ok(D.validateLayout(h.manager.Layout).nodes<100);assert.equal(new Set(liveModels(h).map(m=>m.Parent)).size,32);}
});


test('clearing a closed source set retains link mode but drops the obsolete camera', () => {
    const h=linkHarness();h.link.setMode('world');h.move(h.records[0],250);
    h.records.splice(0,h.records.length);h.link.reset();h.flush();
    assert.equal(h.link.snapshot,null);assert.equal(h.link.pending,null);assert.equal(h.link.mode,'world');
    const fresh={open:true,visible:true,frame:frame(10000),layout:'Model'},original=fresh.frame;
    h.records.push(fresh);h.focus(fresh);h.flush();
    assert.equal(fresh.frame,original);assert.deepEqual(h.link.snapshot.center,original.worldCenter);
    h.link.dispose();h.link.reset();
});
