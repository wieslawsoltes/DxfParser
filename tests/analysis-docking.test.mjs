import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisArrangement, createAnalysisDocking } from '../packages/dxf-analysis/index.mjs';
import { inspectTree, referenceIndex, mtextPlain } from '../packages/dxf-inspector/index.mjs';

const node = (type, handle, properties = [], children = []) => ({ type, handle, properties: properties.map(([code,value]) => ({code,value})), children });
test('analysis layout uses bounded panes instead of squeezing every pane into compact hosts', () => {
    assert.equal(analysisArrangement(1200,500),'balanced');
    assert.equal(analysisArrangement(850,500),'stacked');
    for (const [width,height] of [[380,800],[1400,250],[0,0],[NaN,NaN]]) assert.equal(analysisArrangement(width,height),'tabs');
    for (const preset of ['balanced','stacked','tabs']) assert.equal(analysisArrangement(120,120,preset),preset);
    assert.throws(()=>analysisArrangement(1200,700,'invalid'),RangeError);
});
test('docking import is inert and factory rejects missing host dependencies', () => {
    assert.throws(()=>createAnalysisDocking(),/browser window/);
    assert.throws(()=>createAnalysisDocking({window:{document:{},ResizeObserver:class{},AbortController:class{}}}),/Dockyard/);
});
test('inspection models retain source identities, properties, duplicates and subtree sizes', () => {
    const a=node('LINE','a',[[8,'PIPES'],[330,'A']]), b=node('CIRCLE','A',[[40,'2']]);
    const root=node('SECTION',null,[],[a,b]); const source={id:'source',originalTreeData:[root]};
    const index=inspectTree(source);
    assert.equal(index.tab,source);assert.equal(index.nodes.length,3);assert.equal(index.depth,2);
    assert.deepEqual(index.handles.get('A'),[a,b]);assert.equal(index.incoming.get('A')[0].node,a);
    assert.equal(index.size.get(root),index.characters);assert.equal(index.positions.get(b),2);
    assert.equal(index.properties,3);
});
test('report indexing is finite for shared and cyclic malformed trees', () => {
    const a=node('A','1'),b=node('B','2');a.children=[b,b];b.children=[a];
    const s=inspectTree({originalTreeData:[a,b]});assert.equal(s.nodes.length,2);
    assert.equal(s.size.get(a),2);assert.equal(s.size.get(b),1);assert.equal(s.characters,2);
});
test('reference graph retains ambiguous named targets and unresolved endpoints', () => {
    const a=node('LAYER','1',[[2,'PIPES']]), b=node('LAYER','2',[[2,'pipes']]), c=node('LINE','3',[[8,'PIPES'],[330,'MISSING']]);
    const index=inspectTree({originalTreeData:[a,b,c]}), graph=referenceIndex(index);
    assert.equal(referenceIndex(index),graph);assert.equal(graph.outgoing.get(c).length,3);
    assert.equal(graph.incoming.get(a)[0].node,c);assert.equal(graph.incoming.get(b)[0].node,c);
    assert.ok(graph.outgoing.get(c).some(x=>x.node===null&&x.value==='MISSING'));
    assert.ok(graph.outgoing.get(c).filter(x=>x.node).every(x=>x.label.startsWith('Ambiguous')));
});
test('source indexes are isolated even with duplicate handles across drawings', () => {
    const a=node('LINE','A'), b=node('CIRCLE','A');
    const first=inspectTree({originalTreeData:[a]}), second=inspectTree({originalTreeData:[b]});
    assert.equal(first.handles.get('A')[0],a);assert.equal(second.handles.get('A')[0],b);
    first.types.clear();assert.equal(second.types.size,1);
});
test('MTEXT previews preserve raw source and safely return literal markup', () => {
    const raw='{\\C1;Plant\\PInspection \\S1^2; <img onerror=x>}';
    assert.equal(mtextPlain(raw),'Plant\nInspection 1/2 <img onerror=x>');
    assert.ok(raw.startsWith('{\\C1;'));
    assert.deepEqual(inspectTree().nodes,[]);
});

// Exercise the real serializer without mounting a browser host. This catches
// iterator/collection assumptions in validation before any live DOM is changed.
await import('../vendor/dockyard/avalondock.js');
const D = globalThis.AvalonDock;
function layoutHarness() {
    const Type = createAnalysisDocking({window:{document:{},ResizeObserver:class{},AbortController,TextEncoder},dockyard:D});
    const value=Object.assign(Object.create(Type.prototype),{
        panels:new Map(['records','visual','details'].map(id=>[id,{label:id,node:{id}}])),
        disposed:false,preset:'stacked',custom:false,suppress:0,focused:null,
        layoutSelect:{value:'stacked'},restoreButton:{hidden:true},persist(){},schedule(){}
    });
    value.manager=new D.DockingManager({Layout:value.build('stacked'),EnableHistory:true});
    value.fingerprint=value.structure();return value;
}
test('real Dockyard iterator-based hydration restores all panels and transient focus', () => {
    const value=layoutHarness(), original=value.panels.get('records').node;
    try {
        const state=value.saveState();value.focus('visual');
        assert.equal(value.focused,'visual');assert.ok(value.manager.Find('records').IsHidden);
        value.restoreFocus();assert.equal(value.focused,null);
        assert.equal(value.manager.Find('records').Content,original);
        assert.ok(!value.manager.Find('records').IsHidden);
        assert.deepEqual([...value.manager.Layout.Descendents()].filter(n=>n.ContentId).map(n=>n.ContentId).sort(),['details','records','visual']);
        value.manager.Hide(value.manager.Find('visual'));const hidden=value.saveState();
        value.restoreState(state);value.restoreState(hidden);assert.ok(value.manager.Find('visual').IsHidden);
    } finally {value.manager.Dispose();}
});
test('analysis restore rejects foreign, duplicate and missing panels without replacing the live layout', () => {
    const value=layoutHarness();
    try {
        const state=value.saveState(), original=value.manager.Layout;
        const invalid=structuredClone(state);invalid.layout.layout.rootPanel.children=[];
        assert.throws(()=>value.restoreState(invalid),/every known pane/);
        assert.equal(value.manager.Layout,original);
        const foreign=structuredClone(state);
        const visit=x=>{if(x?.props?.ContentId==='details')x.props.ContentId='outside';for(const child of x?.children||[])visit(child);};
        visit(foreign.layout.layout.rootPanel);assert.throws(()=>value.restoreState(foreign));
        assert.equal(value.manager.Layout,original);
    } finally {value.manager.Dispose();}
});


test('analysis pane callbacks report errors without interrupting subsequent notifications', () => {
    const value=layoutHarness(), seen=[];
    value.hint={textContent:'',setAttribute(name,text){seen.push([name,text]);}};
    value.onError=error=>{seen.push(error.message);throw new Error('observer failed');};
    try {
        assert.doesNotThrow(()=>value.notify(()=>{throw new Error('resize failed');}));
        value.notify(id=>seen.push(id),'visual');
        assert.equal(value.hint.textContent,'resize failed');
        assert.deepEqual(seen,[['role','alert'],'resize failed','visual']);
    } finally {value.manager.Dispose();}
});

test('disposing from an analysis callback suppresses late notifications and error reporting', () => {
    const value=layoutHarness();let errors=0;
    value.hint={setAttribute(){throw new Error('disposed UI accessed');}};
    value.onError=()=>errors++;
    try {
        assert.doesNotThrow(()=>value.notify(()=>{value.disposed=true;throw new Error('late');}));
        value.notify(()=>{throw new Error('must not run');});
        assert.equal(errors,0);
    } finally {value.manager.Dispose();}
});
