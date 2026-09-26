import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportBuffer, createReportWorkspace, reportWorkspaceArrangement } from '../packages/dxf-analysis/index.mjs';

function buffer(options = {}) {
    const scheduled = new Map(), values = [], errors = [];
    let sequence = 0;
    const result = new ReportBuffer({ publish: rows => values.push(rows), schedule: callback => {
        const id = sequence++; scheduled.set(id, callback); return id;
    }, cancel: id => scheduled.delete(id), onError: error => errors.push(error), ...options });
    return { result, scheduled, values, errors, frame() {
        const callbacks = [...scheduled.values()]; scheduled.clear(); callbacks.forEach(callback => callback());
    } };
}

test('report buffers coalesce 20,000 appends, including a scheduler token of zero', () => {
    const h = buffer();
    for (let i = 0; i < 20000; i++) h.result.append({ key:i, values:[i] });
    assert.equal(h.scheduled.size, 1); assert.equal(h.values.length, 0);
    h.frame(); assert.equal(h.values.length, 1); assert.equal(h.values[0].length, 20000);
    assert.equal(h.result.count, 20000); assert.equal(h.scheduled.size, 0);
    h.result.dispose();
});

test('report buffers publish copied arrays without claiming deep ownership of host rows', () => {
    const h = buffer(), row = { key:1, values:['Pump'] };
    h.result.replace([row]); h.frame(); h.values[0].length = 0;
    assert.equal(h.result.count, 1); assert.equal(h.result.snapshot()[0], row);
    const copy = h.result.snapshot(); copy.push({}); assert.equal(h.result.count, 1);
    h.result.dispose();
});

test('row budgets and invalid arrays reject without partial insertion', () => {
    const h = buffer({ maxRows:3 }); h.result.appendMany([1,2]);
    assert.throws(() => h.result.appendMany([3,4]), RangeError);
    assert.throws(() => h.result.replace([1,2,3,4]), RangeError);
    assert.throws(() => h.result.appendMany(null), TypeError);
    assert.deepEqual(h.result.snapshot(), [1,2]); h.result.dispose();
});

test('throwing array access cannot leave a partially appended result', () => {
    const h = buffer(); h.result.append(1);
    const input = [2,3]; Object.defineProperty(input, 1, {get(){throw new Error('bad row');}});
    assert.throws(() => h.result.appendMany(input), /bad row/);
    assert.deepEqual(h.result.snapshot(), [1]); h.result.dispose();
});

test('explicit flush cancels queued publication and replace retains only the newest rows', () => {
    const h = buffer(); h.result.appendMany([1,2]); h.result.replace([3]); h.result.flush();
    assert.deepEqual(h.values, [[3]]); assert.equal(h.scheduled.size, 0);
    h.result.flush(); h.frame(); assert.equal(h.values.length, 1); h.result.dispose();
});

test('closing a report cancels scheduled and already-dequeued callbacks without publication', () => {
    const h = buffer(); h.result.append({file:{name:'source.dxf'}});
    const callback = [...h.scheduled.values()][0]; h.result.dispose(); h.result.dispose(); callback();
    assert.equal(h.result.count, 0); assert.deepEqual(h.values, []);
    assert.equal(h.scheduled.size, 0); assert.equal(h.result.publish, null);
    assert.throws(() => h.result.append(3), /disposed/); h.result.flush();
});

test('failed publication retains data for retry without an automatic retry loop', () => {
    let fail = true;
    const h = buffer({publish() { if (fail) throw new Error('consumer failed'); }});
    h.result.append(1); h.frame();
    assert.equal(h.errors.length, 1); assert.equal(h.result.count, 1); assert.equal(h.scheduled.size, 0);
    fail = false; h.result.flush(); assert.equal(h.result.dirty, false); h.result.dispose();
});

test('a consumer can append while publishing without losing the next frame', () => {
    let h;
    h = buffer({publish(rows) { if (rows.length === 1) h.result.append(2); }});
    h.result.append(1); h.frame(); assert.equal(h.scheduled.size, 1);
    h.frame(); assert.equal(h.result.count, 2); assert.equal(h.scheduled.size, 0); h.result.dispose();
});

test('disposal during failed publication and a throwing error observer are contained', () => {
    const h = buffer({onError(){throw new Error('observer');}});
    h.result.publish = () => { h.result.dispose(); throw new Error('publication'); };
    h.result.append(1); assert.doesNotThrow(() => h.frame()); assert.ok(h.result.disposed);
});

test('buffer and factory dependencies fail before allocating models', () => {
    assert.throws(() => new ReportBuffer(), /functions/);
    for (const maxRows of [0,-1,Infinity,NaN,1.5]) assert.throws(() => buffer({maxRows}), RangeError);
    assert.throws(() => createReportWorkspace(), /browser window/);
    const window = {document:{},HTMLElement:class{},ResizeObserver:class{},AbortController};
    assert.throws(() => createReportWorkspace({window}), /Dockyard/);
});

test('result workspace size policy uses tabbed query access for compact and short hosts', () => {
    assert.deepEqual(reportWorkspaceArrangement(1280,700), {compact:false,mode:'tabs'});
    for (const size of [[390,700],[1200,220],[0,0],[NaN,NaN]]) assert.ok(reportWorkspaceArrangement(...size).compact);
    assert.equal(reportWorkspaceArrangement(1280,700,'horizontal').mode,'horizontal');
    assert.throws(() => reportWorkspaceArrangement(1280,700,'bad'), RangeError);
});

// Exercise real Dockyard layouts in Node; no DOM or second docking algorithm.
await import('../vendor/dockyard/avalondock.js');
const D = globalThis.AvalonDock;
const Type = createReportWorkspace({window:{document:{},HTMLElement:class{},ResizeObserver:class{},AbortController},dockyard:D,createView(){}});
function layout(compact, mode, count) {
    const value = Object.assign(Object.create(Type.prototype), {
        compact, mode, controls:{identity:'query'}, controlsId:'query', controlsTitle:'Query',
        entries:new Map(Array.from({length:count},(_,i)=>['result-'+i,{id:'result-'+i,title:'Result '+i,content:{id:i}}]))
    });
    return {value, root:value.build()};
}

test('32 result documents have finite balanced layouts and retain their content identities', () => {
    for (const mode of ['tabs','horizontal','vertical']) {
        const {value,root} = layout(false,mode,32);
        assert.ok(D.validateLayout(root).nodes < 80);
        const nodes = [...root.Descendents()].filter(node => node instanceof D.LayoutDocument);
        assert.equal(nodes.length,32);
        for (const node of nodes) assert.equal(node.Content,value.entries.get(node.ContentId).content);
        assert.equal(new Set(nodes.map(node=>node.Parent)).size,mode==='tabs'?1:32);
    }
});

test('compact result layouts retain query and results in one accessible pane', () => {
    for (const mode of ['tabs','horizontal','vertical']) {
        const {root} = layout(true,mode,3), nodes=[...root.Descendents()].filter(node=>node.ContentId);
        assert.equal(nodes.length,4); assert.equal(new Set(nodes.map(node=>node.Parent)).size,1);
        assert.equal(nodes.find(node=>node.ContentId==='query').CanClose,false);
        assert.ok(D.validateLayout(root).nodes < 16);
    }
});
