import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CommandSession } from '../packages/dxf-command-line/index.mjs';

// These are isolated adapter tests, not browser/native rendering qualification.
const source=readFileSync(new URL('../components/cad-workspace.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};};
function host() {
    const downloads=[],revoked=[],warnings=[],timers=new Map();let id=0;
    const realm={window:{},createCommandConsole:()=>class {},console:{warn:(...args)=>warnings.push(args)},Blob,
        URL:{createObjectURL:()=>`blob:${++id}`,revokeObjectURL:url=>revoked.push(url)},
        setTimeout:callback=>{timers.set(++id,callback);return id;},clearTimeout:id=>timers.delete(id),
        document:{createElement:()=>({click(){downloads.push(this.download);}})}};
    vm.runInNewContext(source,realm);
    const cad=Object.create(realm.window.DxfCad.CadWorkspace.prototype),calls=[];
    Object.assign(cad,{disposed:false,app:{},compare:null,downloadUrls:new Map(),views:[],
        manager:{ready:Promise.resolve(),sceneGraph:{document:{fileName:'source-a.dxf'}},dispose:async()=>calls.push('native')},
        overlay:{zoomView:x=>calls.push(['zoom',x]),panView:(x,y)=>calls.push(['pan',x,y]),applyViewState:x=>calls.push(['fit',x.mode])},
        refresh:()=>calls.push('refresh'),write:(...args)=>calls.push(['write',...args])});
    return {cad,calls,downloads,revoked,warnings,timers};
}
test('CAD adapter consumes parsed session commands and retains numeric validation', async () => {
    const h=host(),session=new CommandSession({execute:context=>h.cad.runCommand(context)});
    assert.equal((await session.submit('ZOOM 2')).status,'ok');assert.deepEqual(h.calls[0],['zoom',2]);
    assert.equal((await session.submit('PAN 4 9')).status,'ok');assert.ok(h.calls.some(x=>Array.isArray(x)&&x[0]==='pan'&&x[1]===4));
    assert.equal((await session.submit('PAN NaN 3')).status,'error');assert.equal((await session.submit('ZOOM 0')).status,'error');session.dispose();
});
test('CAD adapter rechecks cancellation after an asynchronous extension declines the command', async () => {
    const h=host(),gate=deferred(),session=new CommandSession({execute:ctx=>h.cad.runCommand(ctx)});
    h.cad.compare={command:()=>gate.promise};const result=session.submit('PAN 4 9');await Promise.resolve();
    session.dispose();gate.resolve(false);assert.equal((await result).status,'cancelled');await new Promise(r=>setImmediate(r));
    assert.equal(h.calls.length,0);
});
test('CAD export captures its original filename before async native export completes', async () => {
    const h=host(),gate=deferred();h.cad.manager.exportPng=()=>gate.promise;
    const done=h.cad.export('png');h.cad.manager.sceneGraph.document.fileName='different.dxf';gate.resolve(new Uint8Array([1,2,3]));await done;
    assert.deepEqual(h.downloads,['source-a.png']);assert.equal(h.cad.downloadUrls.size,1);
    const url=[...h.cad.downloadUrls.keys()][0];h.cad.revokeDownload(url);assert.deepEqual(h.revoked,[url]);assert.equal(h.timers.size,0);
});
test('late CAD export completion cannot download after source closure', async () => {
    const h=host(),gate=deferred();h.cad.manager.exportPng=()=>gate.promise;const done=h.cad.export('png');h.cad.disposed=true;
    gate.resolve(new Uint8Array([1]));await done;assert.equal(h.downloads.length,0);assert.equal(h.cad.downloadUrls.size,0);
});
test('command export errors have a single reporting owner', async () => {
    const h=host();h.cad.manager.exportPng=async()=>{throw new Error('export failed');};const errors=[];
    const session=new CommandSession({execute:ctx=>h.cad.runCommand(ctx)});session.subscribe(e=>{if(e.type==='output')errors.push(e.message);});
    assert.equal((await session.submit('PNG')).status,'error');assert.deepEqual(errors,['export failed']);assert.equal(h.calls.length,0);session.dispose();
});
test('CAD cleanup retires all owners even if a comparison controller throws', async () => {
    const h=host(),cad=h.cad;
    Object.assign(cad,{commandLine:{dispose:()=>h.calls.push('console')},abort:{abort:()=>h.calls.push('abort')},
        detachPaint:()=>h.calls.push('paint'),detachError:()=>h.calls.push('error'),detachWorkspace:()=>h.calls.push('workspace'),
        compare:{dispose(){throw new Error('broken consumer');}},views:[{dispose:()=>h.calls.push('view')}],footer:{remove:()=>h.calls.push('footer')}});
    cad.downloadUrls.set('blob:existing',8);const done=cad.dispose();assert.equal(cad.dispose(),done);await done;
    assert.deepEqual(h.calls,['console','abort','paint','error','workspace','view','footer','native']);
    assert.deepEqual(h.revoked,['blob:existing']);assert.equal(h.warnings.length,1);assert.equal(cad.views.length,0);
});
test('retired CAD owners cannot reconstruct resource views or retry a native backend', async () => {
    const h=host();h.cad.disposed=true;h.cad.createView=()=>assert.fail('late view creation');
    h.cad.refreshResources();await h.cad.setBackend('canvas');assert.equal(h.calls.length,0);
});
