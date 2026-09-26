import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { StateCodec, StateManager, stateLimits, DEFAULT_STATE_LIMITS } from '../packages/dxf-state/index.mjs';
import { DxfParser } from '../packages/dxf-inspector/index.mjs';

class Storage {
    #values = new Map();
    get length() { return this.#values.size; }
    key(index) { return [...this.#values.keys()][index] ?? null; }
    getItem(key) { return this.#values.get(key) ?? null; }
    setItem(key, value) { this.#values.set(key, value); }
    removeItem(key) { this.#values.delete(key); }
}
const source = '0\nSECTION\n2\nENTITIES\n0\nLINE\n5\nA\n10\n0\n20\n0\n11\n20\n21\n10\n0\nENDSEC\n0\nEOF\n';
const tab = (id = 0) => ({id, name:'source.dxf', originalTreeData:new DxfParser().parse(source), isModified:true,
    columnWidths:{line:80,type:'2*'}, navigationHistory:['A','B'],currentHistoryIndex:1,codeSearchTerms:['10'],dataSearchTerms:['pipe']});
const snapshot = () => new StateCodec().buildSnapshot([tab()],[],0,null,{type:'*'},{sideBySideDiffEnabled:true},'2026-09-26T00:00:00.000Z');
const node = id => ({id,type:'LINE',children:[],properties:[],expanded:false});

// Import identity/global isolation is also covered by the shared package suite.
test('state limits are immutable, finite and explicit', () => {
    assert.equal(stateLimits().maxBytes, 64*1024*1024); assert.ok(Object.isFrozen(DEFAULT_STATE_LIMITS));
    for (const value of [0,-1,NaN,Infinity,1.5,'1']) assert.throws(()=>stateLimits({maxTabs:value}),RangeError);
    assert.throws(()=>stateLimits({typo:1}),TypeError);
});
test('snapshot roundtrip preserves source, typed IDs, widths, history and flags', () => {
    const codec = new StateCodec(), input=tab();input.originalTreeData[0].expanded=true;
    const value=codec.buildSnapshot([input],[],0,null,{type:'*'},{sideBySideDiffEnabled:true});
    const result=codec.restoreSnapshot(codec.stringify(value));
    assert.equal(result.app.activeTabIdLeft,0); assert.equal(result.app.sideBySideDiffEnabled,true);
    assert.equal(result.leftTabs[0].isModified,true);assert.deepEqual(result.leftTabs[0].columnWidths,input.columnWidths);
    assert.deepEqual(result.leftTabs[0].navigationHistory,['A','B']);
    assert.equal(new DxfParser().serializeTree(result.leftTabs[0].originalTreeData),new DxfParser().serializeTree(input.originalTreeData));
    result.leftTabs[0].originalTreeData[0].type='DIFFERENT';assert.equal(input.originalTreeData[0].type,'SECTION');
});
test('empty expansion list collapses the copied snapshot without mutating its caller', () => {
    const value=snapshot();value.leftTabs[0].originalTreeData[0].expanded=true;value.leftTabs[0].expandedNodeIds=[];
    const result=new StateCodec().restoreSnapshot(value);
    assert.equal(result.leftTabs[0].originalTreeData[0].expanded,false);assert.equal(value.leftTabs[0].originalTreeData[0].expanded,true);
});
test('live expansion overrides an obsolete restored expansion list', () => {
    const input=tab();input.expandedNodeIds=[];input.originalTreeData[0].expanded=true;
    assert.deepEqual(new StateCodec().serializeTab(input).expandedNodeIds,[input.originalTreeData[0].id]);
});
test('source traversal uses typed membership and handles 20000 nodes without recursion', () => {
    const codec=new StateCodec(), tree=Array.from({length:20_000},(_,i)=>node(i));
    codec.restoreExpandedState(tree,tree.filter(n=>n.id%2===0).map(n=>n.id));
    assert.equal(codec.getExpandedNodeIds(tree).length,10_000);
    const typed=[node(1),node('1')];codec.restoreExpandedState(typed,['1']);assert.equal(typed[0].expanded,false);assert.equal(typed[1].expanded,true);
});
test('invalid tree prevents partial expansion mutations', () => {
    const first=node(1),second=node(2);second.children.push(first);
    assert.throws(()=>new StateCodec().restoreExpandedState([first,second],[1]),/shared/);assert.equal(first.expanded,false);
});
test('tree cycles, duplicate IDs and malformed children are rejected', () => {
    const codec=new StateCodec(), cyclic=node(1);cyclic.children.push(cyclic);
    assert.throws(()=>codec.serializeTreeData([cyclic]),/Cyclic/);
    assert.throws(()=>codec.getExpandedNodeIds([node(1),node(1)]),/Duplicate/);
    assert.throws(()=>codec.getExpandedNodeIds([{...node(1),children:{}}]),/children/);
});
test('tree serialization omits derived expansion and filtered-tree properties', () => {
    const n=node('edit:1');n.expanded=true;n.currentTreeData=[n];
    const text=new StateCodec().serializeTreeData([n]);assert.doesNotMatch(text,/expanded|currentTreeData/);
    assert.equal(JSON.parse(text)[0].id,'edit:1');
});
test('snapshot validation rejects versions, duplicate storage identities and invalid arrays', () => {
    const codec=new StateCodec();for(const version of [undefined,0,2,'1'])assert.throws(()=>codec.restoreSnapshot({...snapshot(),version}),/version/);
    const value=snapshot();value.rightTabs=[tab('0')];assert.throws(()=>codec.restoreSnapshot(value),/Duplicate source tab/);
    assert.throws(()=>codec.restoreSnapshot({...snapshot(),leftTabs:{}}),/arrays/);
});
test('source limits reject oversized, deep and invalid source records', () => {
    assert.throws(()=>new StateCodec({maxTabs:1}).buildSnapshot([tab(1),tab(2)],[],1,null,null),/tab budget/);
    assert.throws(()=>new StateCodec({maxTreeNodes:1}).serializeTab(tab()),/node budget/);
    const root=node(1);root.children=[node(2)];root.children[0].children=[node(3)];
    assert.throws(()=>new StateCodec({maxDepth:1}).getExpandedNodeIds([root]),/depth budget/);
    const malformed=tab();malformed.originalTreeData[0].properties=[{code:1,value:{}}];assert.throws(()=>new StateCodec().serializeTab(malformed),/group pairs/);
});
test('UTF-8 bytes are checked before parsing and after serialization', () => {
    const codec=new StateCodec({maxBytes:8});assert.equal(codec.parse('"ééé"'),'ééé');
    assert.throws(()=>codec.parse('"éééé"'),/byte budget/);assert.throws(()=>codec.stringify('éééé'),/byte budget/);
    assert.throws(()=>codec.parse('{'.repeat(9)),/byte budget/);
});
test('state data cannot invoke accessors or toJSON and cannot pollute prototypes', () => {
    const codec=new StateCodec();let called=0;
    const input={};Object.defineProperty(input,'version',{get(){called++;return 1;},enumerable:true});
    assert.throws(()=>codec.restoreSnapshot(input),/accessors/);assert.equal(called,0);
    assert.throws(()=>codec.stringify({toJSON(){called++;return {};}}),/JSON/);assert.equal(called,0);
    for(const key of ['__proto__','constructor','prototype'])assert.throws(()=>codec.parse(`{"${key}":{"polluted":true}}`),/Unsafe/);
    assert.equal({}.polluted,undefined);
});
test('plain JSON from another realm is accepted without shared ownership', () => {
    const value=vm.runInNewContext('({name:"other",values:[1,2]})');
    const copy=new StateCodec().copy(value);assert.deepEqual(copy,{name:'other',values:[1,2]});assert.notEqual(copy.values,value.values);
});
test('non-JSON values, sparse arrays, class instances and nesting over budget fail', () => {
    const codec=new StateCodec();for(const input of [NaN,Infinity,1n,()=>{},new Date(),new Map(),[undefined],Array(3)])assert.throws(()=>codec.stringify(input));
    const value={};value.self=value;assert.throws(()=>codec.stringify(value),/Cyclic/);
    assert.throws(()=>new StateCodec({maxValues:2}).copy([1,2]),/value budget/);
    const deep={};let p=deep;for(let i=0;i<30;i++){p.child={};p=p.child;}assert.throws(()=>new StateCodec({maxDepth:1}).copy(deep),/nesting/);
});
test('invalid filter metadata cannot enter restored application state', () => {
    for(const patch of [{columnWidths:{line:-1}},{codeSearchTerms:[{}]},{currentSortField:'oops'},{minLine:-1},{classIdToName:{a:{}}}]){
        const value=snapshot();Object.assign(value.leftTabs[0],patch);assert.throws(()=>new StateCodec().restoreSnapshot(value));
    }
});
test('live renderer caches and callbacks are not part of serialized tab state', () => {
    const input=tab();input.callback=()=>{};input.currentTreeData=input;input.renderer={};input.renderer.self=input.renderer;
    assert.equal(new StateCodec().serializeTab(input).id,0);
});
test('legacy unversioned manifest migrates single-pane identities including zero', () => {
    const codec=new StateCodec();const state=codec.parseManifest(JSON.stringify({tabIds:[0,5],activeTabId:0,timestamp:10,columnWidths:{type:'*'}}));
    assert.deepEqual(state.tabIdsLeft,[0,5]);assert.deepEqual(state.tabIdsRight,[]);assert.equal(state.activeTabIdLeft,0);
});
test('legacy serialized tree and expansion list are restored using the expected identity', () => {
    const input=tab(),codec=new StateCodec(), text=JSON.stringify({...input,originalTreeData:undefined,
        originalTreeDataSerialized:codec.serializeTreeData(input.originalTreeData),expandedNodeIds:[input.originalTreeData[0].id]});
    const restored=codec.parseTab(text,0);assert.equal(restored.originalTreeData[0].expanded,true);assert.equal(restored.isModified,true);
    assert.throws(()=>codec.parseTab(text,'0'),/identity/);
});
test('invalid active IDs fall back to the first source; no missing source is synthesized', () => {
    const value=snapshot();value.app.activeTabIdLeft='not-there';value.app.activeTabIdRight=0;
    const result=new StateCodec().restoreSnapshot(value);assert.equal(result.app.activeTabIdLeft,0);assert.equal(result.app.activeTabIdRight,null);
});
test('host-injected stores preserve independent namespaces and exact flags', () => {
    const storage=new Storage(),now=()=>100, a=new StateManager({storage,now,getUiState:()=>({sideBySideDiffEnabled:true})});
    const b=new StateManager({storage,now,storageKey:'b.state',tabStatePrefix:'b.tab.'});
    assert.equal(a.saveAppState([tab()],[],0,null,{type:'*'}),true);assert.equal(b.saveAppState([tab(2)],[],2,null,null),true);
    assert.equal(a.loadAppState().sideBySideDiffEnabled,true);assert.equal(b.loadAppState().activeTabIdLeft,2);
    a.clearAllState();assert.equal(a.hasSavedState(),false);assert.equal(b.loadTabState(2).name,'source.dxf');
});
test('null storage is disabled and storage failures/error observers do not escape', () => {
    const disabled=new StateManager();assert.equal(disabled.saveTabState(tab()),'unavailable');assert.equal(disabled.hasSavedState(),false);
    const fail=()=>{throw new Error('denied');};const storage={get length(){throw Error('denied');},getItem:fail,setItem:fail,removeItem:fail,key:fail};
    const manager=new StateManager({storage,onError:fail});
    assert.equal(manager.loadAppState(),null);assert.equal(manager.loadTabState(0),null);assert.equal(manager.hasSavedState(),false);
    assert.equal(manager.clearAllState(),false);assert.equal(manager.removeTabState(0),false);assert.equal(manager.saveTabState(tab()),'failed');
});
test('quota failure preserves the last persisted source, not a metadata-only replacement', () => {
    const storage=new Storage(),manager=new StateManager({storage,now:()=>100}),input=tab();manager.saveTabState(input);
    const saved=storage.getItem('dxf_tab_0'),set=storage.setItem.bind(storage);let calls=0;
    storage.setItem=(key,value)=>{calls++;if(value.includes('originalTreeDataSerialized'))throw Error('quota');set(key,value);};
    input.name='changed.dxf';assert.equal(manager.saveTabState(input),'preserved');assert.equal(calls,1);assert.equal(storage.getItem('dxf_tab_0'),saved);
});
test('new source quota fallback reports metadata-only, never a restored drawing', () => {
    const storage=new Storage(),set=storage.setItem.bind(storage);storage.setItem=(key,value)=>{if(JSON.parse(value).originalTreeDataSerialized!==null)throw Error('quota');set(key,value);};
    const manager=new StateManager({storage});assert.equal(manager.saveTabState(tab()),'metadata-only');assert.equal(manager.loadTabState(0).originalTreeData,null);
});
test('encoding failure never writes partial state or overwrites an existing source', () => {
    const storage=new Storage(),manager=new StateManager({storage}),input=tab();manager.saveTabState(input);const saved=storage.getItem('dxf_tab_0');
    input.originalTreeData[0].children.push(input.originalTreeData[0]);assert.equal(manager.saveTabState(input),'failed');assert.equal(storage.getItem('dxf_tab_0'),saved);
    assert.equal(manager.saveAppState([tab(1),input],[],1,null,null),false);assert.equal(storage.getItem('dxf_tab_1'),null);
});
test('full save publishes source records before the manifest, light save never writes sources', () => {
    const storage=new Storage(),writes=[],set=storage.setItem.bind(storage);storage.setItem=(key,text)=>{writes.push(key);set(key,text);};
    const manager=new StateManager({storage});assert.equal(manager.saveAppState([tab()],[],0,null,null),true);assert.deepEqual(writes,['dxf_tab_0','dxf_parser_state']);
    writes.length=0;assert.equal(manager.saveAppStateLight([tab()],[],0,null,null),true);assert.deepEqual(writes,['dxf_parser_state']);
});
test('expired state clears only the owned namespace using Storage.key rather than Object.keys', () => {
    const storage=new Storage();let now=10;const manager=new StateManager({storage,now:()=>now,maxAge:100});manager.saveAppState([tab()],[],0,null,null);
    storage.setItem('dxf.workspace.parser.v1','layout');storage.setItem('sidebarCollapsed','true');now=111;
    assert.equal(manager.loadAppState(),null);assert.equal(storage.getItem('dxf_tab_0'),null);assert.equal(storage.getItem('sidebarCollapsed'),'true');
    assert.equal(storage.getItem('dxf.workspace.parser.v1'),'layout');
});
test('clear attempts remaining keys even when one removal fails', () => {
    const storage=new Storage(),manager=new StateManager({storage}),remove=storage.removeItem.bind(storage);manager.saveAppState([tab(1),tab(2)],[],1,null,null);
    storage.removeItem=key=>{if(key==='dxf_tab_1')throw Error('denied');remove(key);};
    assert.equal(manager.clearAllState(),false);assert.equal(storage.getItem('dxf_tab_2'),null);assert.equal(manager.hasSavedState(),false);
});
test('invalid manifests and source records fail closed without deleting persisted bytes', () => {
    const storage=new Storage(),manager=new StateManager({storage});storage.setItem('dxf_parser_state','{"timestamp":"bad"}');
    assert.equal(manager.loadAppState(),null);assert.equal(manager.hasSavedState(),true);
    storage.setItem('dxf_tab_0','not JSON');assert.equal(manager.loadTabState(0),null);assert.equal(storage.getItem('dxf_tab_0'),'not JSON');
});
test('dispose is idempotent and releases host references without clearing saved data', () => {
    const storage=new Storage(),manager=new StateManager({storage,getUiState:()=>({})});manager.saveAppState([tab()],[],0,null,null);manager.dispose();manager.dispose();
    assert.equal(manager.storage,null);assert.equal(manager.getUiState,null);assert.equal(manager.onError,null);
    assert.equal(manager.saveTabState(tab()),'unavailable');assert.equal(manager.restoreFromSnapshot(snapshot()),null);assert.equal(manager.loadAppState(),null);
    assert.throws(()=>manager.buildExportSnapshot(),/disposed/);assert.ok(storage.getItem('dxf_tab_0'));
});
test('constructor rejects invalid storage contracts and overlapping or empty keys', () => {
    assert.throws(()=>new StateManager({storage:{}}),/Storage/);
    for(const options of [{tabStatePrefix:''},{storageKey:''},{storageKey:'tab.a',tabStatePrefix:'tab.'},{getUiState:0},{maxAge:-1}]) assert.throws(()=>new StateManager(options));
});
