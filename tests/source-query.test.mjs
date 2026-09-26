import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { DxfParser, filterSourceTree, searchSourceTree, selectSourceNodes, sortSourceTree,
    sourceSortValue, setSourceExpansion, DEFAULT_QUERY_LIMITS } from '../packages/dxf-inspector/index.mjs';

let id=0;
const tag = (code,value,line=1) => ({code,value,line});
const node = (type,properties=[],children=[],line=1) => ({id:++id,type,line,properties,children,expanded:true});
function fixture() {
    return [node('SECTION', [tag(2,'ENTITIES',2)], [
        node('LINE', [tag(5,'AB',4),tag(8,'PIPES',6),tag(8,'PIPES',8),tag(10,'0',10)], [],3),
        node('CIRCLE', [tag(5,'AB',14),tag(8,'pipes',16),tag(40,'2',18)], [],13)
    ]),node('EOF',[],[],21)];
}
function oracleFilter(nodes, o) {
    const lineOk = line => (o.minLine==null || parseInt(line)>=o.minLine) && (o.maxLine==null || parseInt(line)<=o.maxLine);
    const textOk = value => o.dataTerms.some(term => {
        const a=o.dataCase?value:value.toLowerCase(), b=o.dataCase?term:term.toLowerCase();
        return o.dataExact?a===b:a.includes(b);
    });
    return nodes.flatMap(n=>{
        const children=oracleFilter(n.children,o), properties=n.properties.filter(p=>lineOk(p.line) &&
            (!o.codeTerms.length || o.codeTerms.includes(String(p.code))) && (!o.dataTerms.length || textOk(p.value)));
        if(o.objectTypes.length && !o.objectTypes.some(t=>n.type.toLowerCase()===t.toLowerCase()) && !children.length)return [];
        if(o.dataTerms.length && !textOk(n.type) && !properties.length && !children.length)return [];
        if(!lineOk(n.line) && !properties.length && !children.length)return [];
        return [{...n,properties,children}];
    });
}

test('filter projections retain canonical source identities and source order',()=>{
    const tree=fixture(), before=structuredClone(tree), sourceMap=new WeakMap();
    const filtered=filterSourceTree(tree,{objectTypes:['line'],dataTerms:['pipes'],sourceMap});
    assert.deepEqual(tree,before);assert.notEqual(filtered[0],tree[0]);assert.equal(sourceMap.get(filtered[0]),tree[0]);
    assert.equal(sourceMap.get(filtered[0].children[0]),tree[0].children[0]);
    assert.equal(filtered[0].children[0].properties[0],tree[0].children[0].properties[1]);
    assert.equal(filtered[0].children.length,1);assert.notEqual(filtered[0].children,tree[0].children);
});
test('filter code terms restrict group pairs without erasing object context',()=>{
    const tree=fixture(), filtered=filterSourceTree(tree,{codeTerms:['8']});
    assert.equal(filtered.length,2);assert.equal(filtered[0].children.length,2);
    assert.equal(filtered[0].children[0].properties.length,2);assert.equal(filtered[0].properties.length,0);
});
test('line bounds retain out-of-range ancestor nodes of matching descendants',()=>{
    const filtered=filterSourceTree(fixture(),{minLine:16,maxLine:16});
    assert.equal(filtered[0].type,'SECTION');assert.equal(filtered[0].children.length,1);
    assert.equal(filtered[0].children[0].properties[0].line,16);
});
test('all valid filter combinations agree with a separate recursive oracle',()=>{
    for(const codeTerms of [[],['8'],['5','40']]) for(const dataTerms of [[],['pipes'],['LINE','2'],['nothing']])
    for(const objectTypes of [[],['LINE'],['CIRCLE']]) for(const dataExact of [false,true]) for(const dataCase of [false,true])
    for(const [minLine,maxLine] of [[null,null],[8,null],[null,14],[6,16]]) {
        const tree=fixture(), options={codeTerms,dataTerms,objectTypes,dataExact,dataCase,minLine,maxLine};
        assert.deepEqual(filterSourceTree(tree,options),oracleFilter(tree,options),JSON.stringify(options));
    }
});
test('batch search preserves duplicate properties and equal handles from distinct nodes',()=>{
    const tree=fixture(), rows=searchSourceTree(tree,{searchCode:8});
    assert.deepEqual(rows.map(r=>r.line),[6,8,16]);assert.notEqual(rows[0].property,rows[1].property);
    assert.equal(rows[2].node,tree[0].children[1]);assert.equal(searchSourceTree(tree,{searchCode:5}).length,2);
});
test('batch exact matching is case-sensitive while substring defaults are insensitive',()=>{
    const tree=fixture();assert.equal(searchSourceTree(tree,{searchText:'PIPES',exact:true}).length,2);
    assert.equal(searchSourceTree(tree,{searchText:'PIPES'}).length,3);
    assert.equal(searchSourceTree(tree,{searchText:'PIPES',exact:true,dataCase:false}).length,3);
    assert.equal(searchSourceTree(tree,{searchText:'PIPES',dataCase:true}).length,2);
});
test('object-only search returns objects and code/data criteria return properties',()=>{
    const tree=fixture(), rows=searchSourceTree(tree,{objectType:'line'});
    assert.equal(rows[0].node,tree[0].children[0]);assert.equal(rows[0].property,null);
    assert.equal(rows[0].line,3);assert.equal(searchSourceTree(tree,{}).length,0);
    assert.deepEqual(searchSourceTree(tree,{objectType:'circle',searchCode:'8',searchText:'PIPES'}).map(r=>r.line),[16]);
});
test('numeric and null property values are inspected as data, never HTML',()=>{
    const tree=[node('TEXT',[tag(1,42),tag(1,null),tag(1,'<script>')])];
    assert.equal(searchSourceTree(tree,{searchText:'42'})[0].data,'42');
    assert.equal(filterSourceTree(tree,{dataTerms:['42']})[0].properties.length,1);
    assert.equal(sourceSortValue(tree[0],'dataSize'),14);
});
test('query results reject overflow, including a zero budget, instead of truncating',()=>{
    const tree=fixture();assert.throws(()=>searchSourceTree(tree,{searchCode:8,maxResults:2}),/maxResults/);
    assert.throws(()=>selectSourceNodes(tree,()=>true,{maxResults:0}),/maxResults/);
    assert.deepEqual(selectSourceNodes(tree,()=>false,{maxResults:0}),[]);
    assert.deepEqual(searchSourceTree([],{maxResults:0}),[]);
});
test('node selection is synchronous preorder and keeps original node references',()=>{
    const tree=fixture(), selected=selectSourceNodes(tree,()=>true);
    assert.deepEqual(selected.map(n=>n.type),['SECTION','LINE','CIRCLE','EOF']);
    assert.equal(selected[1],tree[0].children[0]);assert.throws(()=>selectSourceNodes(tree,'node=>true'),/predicate/);
});
test('async predicates reject rather than treating a Promise as a match',async()=>{
    assert.throws(()=>selectSourceNodes(fixture(),async()=>{throw new Error('async');}),/synchronous/);
    await new Promise(resolve=>setTimeout(resolve,0));
});
test('predicate exceptions and cooperative cancellation escape without partial results',()=>{
    const tree=fixture(), controller=new AbortController(), reason=new Error('stop');
    assert.throws(()=>selectSourceNodes(tree,()=>{controller.abort(reason);return true;},{signal:controller.signal}),e=>e===reason);
    assert.throws(()=>selectSourceNodes(tree,()=>{throw reason;}),e=>e===reason);
});
test('all query entry points respect a pre-aborted signal',()=>{
    const controller=new AbortController();controller.abort(new Error('cancelled'));
    const options={signal:controller.signal}, tree=fixture(), before=structuredClone(tree);
    for(const action of [()=>filterSourceTree(tree,options),()=>searchSourceTree(tree,options),
        ()=>selectSourceNodes(tree,()=>true,options),()=>sortSourceTree(tree,'line',true,options),
        ()=>setSourceExpansion(tree,false,options),()=>sourceSortValue(tree[0],'dataSize',options)])assert.throws(action,/cancelled/);
    assert.deepEqual(tree,before);
});
test('all source query operations reject cycles and shared nodes deterministically',()=>{
    for(const cyclic of [false,true]){
        const tree=fixture();tree[0].children.push(cyclic?tree[0]:tree[0].children[0]);
        let invoked=false;
        for(const action of [()=>filterSourceTree(tree),()=>searchSourceTree(tree),
            ()=>selectSourceNodes(tree,()=>{invoked=true;return true;}),()=>sortSourceTree(tree,'line'),()=>setSourceExpansion(tree,false)])
            assert.throws(action,/cycle or shared/);
        assert.equal(invoked,false);assert.equal(tree[0].expanded,true);
    }
});
test('invalid nodes and exhausted traversal budgets reject before any sort/expansion writes',()=>{
    for(const options of [{limits:{maxNodes:2}},{limits:{maxProperties:2}},{limits:{maxDepth:1}}]){
        const tree=fixture(), before=structuredClone(tree);
        assert.throws(()=>sortSourceTree(tree,'line',false,options),/exceeds/);
        assert.throws(()=>setSourceExpansion(tree,false,options),/exceeds/);assert.deepEqual(tree,before);
    }
    assert.throws(()=>filterSourceTree([null]),/Invalid source node/);
    assert.throws(()=>searchSourceTree([node('LINE',[null])]),/Invalid source property/);
    assert.throws(()=>filterSourceTree([node('LINE',[],{})]),/children must be an array/);
});
test('invalid configuration and sort fields reject at the API boundary',()=>{
    assert.deepEqual(filterSourceTree(fixture(), {minLine:4,maxLine:3}),[]);
    assert.throws(()=>filterSourceTree([], {minLine:NaN}),/finite/);
    assert.throws(()=>filterSourceTree([], {codeTerms:'8'}),/array/);
    assert.throws(()=>searchSourceTree([], {maxResults:-1}),/nonnegative/);
    assert.throws(()=>searchSourceTree([], {limits:{maxDepth:Infinity}}),/nonnegative/);
    assert.throws(()=>sortSourceTree([], 'bad'),/sort field/);
    assert.throws(()=>sortSourceTree([], 'line',1),/boolean/);
    assert.throws(()=>setSourceExpansion([], 1),/boolean/);
    assert.equal(Object.isFrozen(DEFAULT_QUERY_LIMITS),true);
});
test('deep source operations do not recurse, including postorder aggregates',()=>{
    const depth=12000, root=node('X'), tree=[root];let tail=root;
    for(let i=1;i<depth;i++){const child=node('X',[],[],i);tail.children=[child];tail=child;}
    tail.properties=[tag(1,'needle',depth)];
    assert.equal(searchSourceTree(tree,{searchText:'needle'})[0].node,tail);
    assert.equal(sourceSortValue(root,'objectCount'),depth-1);
    assert.equal(sourceSortValue(root,'dataSize'),depth+6);
    const projected=filterSourceTree(tree,{dataTerms:['needle']});let found=projected[0], count=1;
    while(found.children.length){found=found.children[0];count++;}assert.equal(count,depth);
    sortSourceTree(tree,'dataSize');setSourceExpansion(tree,false);assert.equal(tail.expanded,false);
});
test('stable sorting precomputes aggregate keys and preserves every original object',()=>{
    const a=node('A',[],[node('child')]), b=node('B'), c=node('C',[],[node('child')]), tree=[a,b,c];
    sortSourceTree(tree,'objectCount');assert.deepEqual(tree,[b,a,c]);
    sortSourceTree(tree,'objectCount',false);assert.deepEqual(tree,[a,c,b]);
    assert.equal(tree[0],a);assert.equal(sourceSortValue(a,'objectCount'),1);
});
test('sort order and property pair order match each supported field',()=>{
    for(const [field, expected] of [['line',['B','A']],['type',['A','B']],['dataSize',['B','A']]]){
        const a=node('A',[tag(8,'z',8),tag(1,'a',6)],[],10), b=node('B',[],[],2), tree=[a,b];
        sortSourceTree(tree,field);assert.deepEqual(tree.map(n=>n.type),expected);
    }
    const a=node('A',[tag(8,'z',8),tag(1,'a',6)]);const first=a.properties[0];
    sortSourceTree([a],'code');assert.equal(a.properties[1],first);
    sortSourceTree([a],'line',false);assert.equal(a.properties[0],first);
    sortSourceTree([a],'type');assert.equal(a.properties[1],first);
});
test('read-only descendants cannot leave preceding writable arrays partly sorted',()=>{
    const tree=[node('Z'),node('A',Object.freeze([tag(8,'z'),tag(1,'a')]))], before=structuredClone(tree);
    assert.throws(()=>sortSourceTree(tree,'code'),/writable/);assert.deepEqual(tree,before);
    Object.defineProperty(tree[1],'expanded',{value:true,writable:false});
    assert.throws(()=>setSourceExpansion(tree,false),/writable/);assert.equal(tree[0].expanded,true);
});
test('frozen inputs support read-only queries and empty expansion preserves leaves',()=>{
    const leaf=node('EMPTY');leaf.expanded=false;const tree=[node('PARENT',[],[leaf])];
    setSourceExpansion(tree,true);assert.equal(tree[0].expanded,true);assert.equal(leaf.expanded,false);
    Object.freeze(tree[0]);Object.freeze(tree[0].children);Object.freeze(tree);
    assert.equal(filterSourceTree(tree).length,1);assert.equal(searchSourceTree(tree,{objectType:'empty'}).length,1);
});
test('property pseudo-node aggregate behavior excludes pseudo-node descendant counts',()=>{
    const pseudo={...node('PROP'),isProperty:true,data:'12',code:'8'}, tree=[node('BLOCK',[],[pseudo,node('LINE')])];
    assert.equal(sourceSortValue(tree[0],'objectCount'),1);assert.equal(sourceSortValue(tree[0],'dataSize'),11);
    assert.equal(sourceSortValue(pseudo,'code'),8);assert.equal(sourceSortValue(pseudo,'type'),'12');
});
test('application query adapters delegate to the shipped inspector and retain ownership',()=>{
    const appSource=readFileSync(new URL('../components/app.js',import.meta.url),'utf8');
    const context={filterSourceTree,searchSourceTree,selectSourceNodes,sortSourceTree,sourceSortValue,setSourceExpansion};
    const App=runInNewContext(appSource+'\n;App',context);const app=Object.create(App.prototype),tree=fixture();
    const projected=app.filterTree(tree,[],[],false,false,null,null,[]);
    assert.equal(app.filteredNodeSources.get(projected[0]),tree[0]);
    assert.equal(app.searchDxfTree(tree,'line','','','8').length,2);
    app.sortTreeNodes(projected,'line',false);app.collapseAllNodes(projected);assert.equal(projected[0].expanded,false);
    assert.equal(tree[0].expanded,true);
});
test('queries consume parsed DXF and maintain canonical source after projection ordering',()=>{
    const parser=new DxfParser(),tree=parser.parse('0\nSECTION\n2\nENTITIES\n0\nLINE\n5\nAB\n8\nPIPES\n0\nENDSEC\n0\nEOF\n');
    const before=parser.serializeTree(tree), sourceMap=new WeakMap();
    const projection=filterSourceTree(tree,{dataTerms:['pipes'],sourceMap});sortSourceTree(projection,'type');
    const match=searchSourceTree(tree,{searchCode:8})[0];assert.equal(sourceMap.get(projection[0].children[0]),match.node);
    assert.equal(parser.serializeTree(tree),before);
});
