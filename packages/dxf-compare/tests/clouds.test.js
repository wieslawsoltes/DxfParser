'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../../dxf-skia'), C = require('..')(A), G = A.geometry;
const box = (x,y,w=1,h=1,z=0) => ({ minX:x, minY:y, minZ:z, maxX:x+w, maxY:y+h, maxZ:z });
const changes = boxes => boxes.map((bounds,i) => ({ id:'c'+i, bounds }));
const group = (boxes, options={}) => C.groupChanges(changes(boxes), C.options({margin:0,...options}));
const members = groups => groups.map(g => g.changeIds);
const area = ring => ring.reduce((a,p,i) => {const q=ring[(i+1)%ring.length];return a+p.x*q.y-q.x*p.y;},0)/2;
const fixture = (entities=[]) => '0\nSECTION\n2\nENTITIES\n'+entities.flat().join('\n')+(entities.length?'\n':'')+'0\nENDSEC\n0\nEOF\n';
const line = (h,x) => [0,'LINE',5,h,10,x,20,0,11,x+1,21,1];
const compile = text => new A.SceneCompiler(new A.DxfDocument(text)).compile();

test('proximity joins transitively without merging empty corners of group bounds', () => {
    const boxes=[box(0,0,4,1),box(0,0,1,4),box(3,3),box(0,4)];
    assert.deepEqual(members(group(boxes)),[['c0','c1','c3'],['c2']]);
});
test('cloud margin controls overlap threshold including boundary contact', () => {
    assert.equal(group([box(0,0),box(3,0)],{margin:.99}).length,2);
    assert.equal(group([box(0,0),box(3,0)],{margin:1}).length,1);
});
test('local and combined legacy modes remain explicit and snapshots retain them', () => {
    const boxes=[box(0,0),box(.5,0),box(100,0)];
    assert.equal(group(boxes,{cloudMode:'local'}).length,3);
    assert.equal(group(boxes,{cloudMode:'combined'}).length,1);
    assert.equal(group(boxes).length,2);
    const value=C.readSnapshot(C.snapshot(fixture(),fixture(),{cloudMode:'local',cloudShape:'polygonal'}));
    assert.equal(value.options.cloudMode,'local');assert.equal(value.options.cloudShape,'polygonal');
});
test('grouping does not mutate caller bounds, changes, order or shared scene indexes', () => {
    const input=changes([box(0,0),box(.5,0)]);input.forEach(c=>{Object.freeze(c.bounds);Object.freeze(c);});Object.freeze(input);
    const before=JSON.stringify(input); const sets=C.groupChanges(input,C.options());
    assert.equal(JSON.stringify(input),before);assert.notEqual(sets[0].cloudBounds,input[0].bounds);
});
test('unbounded changes remain in the ledger as standalone sets without clouds', () => {
    const sets=group([G.emptyBounds(),box(0,0),G.emptyBounds()]);
    assert.equal(sets.length,3);assert.deepEqual(sets[0].changeIds,['c0']);assert(G.isEmpty(sets[0].cloudBounds));
});
test('indexed grouping equals brute-force connectivity on seeded random rectangles', () => {
    let seed=9813;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
    for(let trial=0;trial<30;trial++) {
        const boxes=Array.from({length:80},()=>box(random()*30,random()*30,random()*5,random()*5)), seen=new Set(), expected=[];
        for(let i=0;i<boxes.length;i++)if(!seen.has(i)){const ids=[i];seen.add(i);for(let n=0;n<ids.length;n++)for(let j=0;j<boxes.length;j++)if(!seen.has(j)&&G.intersects(boxes[ids[n]],boxes[j])){seen.add(j);ids.push(j);}expected.push(ids.sort((a,b)=>a-b).map(x=>'c'+x));}
        assert.deepEqual(members(group(boxes)),expected);
    }
});
test('dense grouping consumes each discovered object without quadratic repeated candidate lists', () => {
    const sets=group(Array.from({length:20000},()=>box(0,0)),{maxCloudWork:100000});
    assert.equal(sets.length,1);assert.equal(sets[0].changeIds.length,20000);
});
test('sparse grouping is bounded and retains all twenty thousand separated changes', () => {
    assert.equal(group(Array.from({length:20000},(_,i)=>box(i*3,0)),{maxCloudWork:2500000}).length,20000);
});
test('grouping work, settings and coordinate overflow fail explicitly', () => {
    assert.throws(()=>group([box(0,0)],{maxCloudWork:1}),/budget/);
    assert.throws(()=>C.options({cloudShape:'convex'}),/shape/);
    assert.throws(()=>C.options({maxCloudWork:NaN}),/budget/);
    assert.throws(()=>group([box(1,0,Infinity)]),/Nonfinite/);
});
test('polygonal union keeps a concave L outline rather than its bounding rectangle', () => {
    const rings=C.rectangleUnion([box(0,0,3,1),box(0,0,1,3)]);
    assert.equal(rings.length,1);assert.equal(rings[0].length,6);assert.equal(area(rings[0]),5);
    assert(!G.inLoops({x:2,y:2},rings));
});
test('polygonal union removes internal seams, duplicate rectangles and contained boxes', () => {
    const rings=C.rectangleUnion([box(0,0,2,2),box(2,0,2,2),box(0,0,2,2),box(.5,.5)]);
    assert.equal(rings.length,1);assert.equal(rings[0].length,4);assert.equal(area(rings[0]),8);
});
test('polygonal union retains holes and disconnected or corner-touching boundaries', () => {
    const rings=C.rectangleUnion([box(0,0,4,1),box(0,3,4,1),box(0,1,1,2),box(3,1,1,2)]);
    assert.equal(rings.length,2);assert.equal(rings.reduce((sum,r)=>sum+area(r),0),12);
    assert(!G.inLoops({x:2,y:2},rings));assert(G.inLoops({x:.5,y:2},rings));
    assert.equal(C.rectangleUnion([box(0,0),box(1,1),box(5,5)]).length,3);
});
test('sweep union equals independent raster membership on seeded random rectangles', () => {
    let seed=4713;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
    for(let trial=0;trial<25;trial++) {
        const boxes=Array.from({length:25},()=>box(Math.floor(random()*10),Math.floor(random()*10),1+Math.floor(random()*4),1+Math.floor(random()*4))), rings=C.rectangleUnion(boxes);
        let expectedArea=0;
        for(let x=0;x<14;x++)for(let y=0;y<14;y++){const p={x:x+.5,y:y+.5},inside=boxes.some(b=>G.inBounds(p,b));assert.equal(G.inLoops(p,rings),inside);expectedArea+=Number(inside);}
        assert.equal(rings.reduce((sum,r)=>sum+area(r),0),expectedArea);
    }
});
test('polygonal output and sweep work enforce independent explicit budgets', () => {
    assert.throws(()=>C.rectangleUnion([box(0,0)],{maxCloudWork:1}),/budget/);
    assert.throws(()=>C.rectangleUnion([box(0,0)],{maxCloudSegments:3}),/budget/);
    assert.equal(C.rectangleUnion(Array.from({length:10000},()=>box(0,0)),{maxCloudWork:100000}).length,1);
});
test('degenerate and large-coordinate contours stay finite and nonzero', () => {
    for(const b of [box(0,0,0,0),box(1e12,1e12,0,0)]) {const rings=C.rectangleUnion([b]);assert.equal(rings[0].length,4);assert(rings[0].every(G.validPoint));assert(rings[0][1].x>rings[0][0].x || rings[0][1].y!==rings[0][0].y);}
});
test('display-only changes reuse signatures and matching while regrouping only when necessary', () => {
    const current=compile(fixture([line('A',0),line('B',20)])), s=new C.Session(new A.DxfDocument(fixture()));
    const first=s.scene(current), result=s.result;
    for(const patch of [{currentColor:'#112233'},{cloudShape:'polygonal'},{showCurrent:false},{currentFirst:true},{clouds:false}]) {
        s.configure(patch);s.scene(current);assert.equal(s.result.changes,result.changes);assert.equal(s.result.changeSets,result.changeSets);assert.equal(s.result.currentOnly,result.currentOnly);
    }
    s.configure({margin:20});s.scene(current);assert.equal(s.result.changes,result.changes);assert.equal(s.result.changeSets.length,1);
    s.configure({properties:0});s.scene(current);assert.notEqual(s.result.changes,result.changes);assert.notEqual(s.composed,first);
});
test('change-set reports are cycle-free with exact object membership and unchanged object counts', () => {
    const r=C.compareScenes(compile(fixture([line('A',0),line('B',2)])),compile(fixture()));const report=C.report(r);
    assert.equal(report.counts.changes,2);assert.equal(report.changeSets.length,1);assert.equal(report.changeSets[0].changeIds.length,2);
    assert(!JSON.stringify(report).includes('primitives'));
});

test('direct composition and reports honor revised cloud settings consistently', () => {
    const r=C.compareScenes(compile(fixture([line('A',0),line('B',20)])),compile(fixture()));
    assert.equal(C.compose(r).primitives.filter(p=>p.comparisonDecoration).length,2);
    r.options.cloudMode='combined';assert.equal(C.compose(r).primitives.filter(p=>p.comparisonDecoration).length,1);
    assert.equal(C.cloudBounds(r).length,1);assert.equal(C.report(r).changeSets.length,1);
});
