'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {A,G,file,compile,block,line,circle,hatch,near}=require('./helpers');
const {vec,add,sub,mul,distance,pathBounds,arcPath,interpolateFitPoints}=G;
const rad=d=>d*Math.PI/180, polar=(angle,r=10)=>vec(r*Math.cos(rad(angle)),r*Math.sin(rad(angle)));
function arc(start,end){return [[0,'ARC'],[5,'ARC'],[10,0],[20,0],[40,10],[50,start],[51,end]];}
function good(scene){assert.deepEqual(scene.diagnostics.filter(x=>x.severity==='error'),[]);return scene;}
const section=[[0,'VIEWPORT'],[5,'V'],[67,1],[410,'Sheet'],[69,2],[68,1],[10,0],[20,0],[40,20],[41,20],[45,20],[340,'BOUNDARY']];
test('analytic conic bounds include internal extrema even with a coarse picking tolerance',()=>{
    const p=arcPath(vec(),vec(10,0),vec(0,10),rad(20),rad(100)),b=pathBounds(p);
    near(assert,b.maxY,10,1e-12);near(assert,b.minX,-5,1e-12);near(assert,b.maxX,10*Math.cos(rad(20)),1e-12);
    const sc=good(compile(arc(20,120),{tolerance:100}));near(assert,sc.bounds.maxY,10,1e-12);
});
test('analytic cubic bounds do not use the control polygon or flattened samples',()=>{
    const b=pathBounds([['M',vec(0,0)],['C',vec(0,10),vec(10,10),vec(10,0)]]);
    near(assert,b.maxY,7.5);near(assert,b.minY,0);near(assert,b.maxX,10);
    const c=pathBounds([['M',vec(1e12,1e12)],['C',vec(1e12,1e12+10),vec(1e12+10,1e12+10),vec(1e12+10,1e12)]]);
    near(assert,c.maxY-1e12,7.5,1e-4);
});
test('analytic projected conic bounds match affine ellipse extrema',()=>{
    const p=arcPath(vec(2,3),vec(12,5),vec(-3,7)),b=pathBounds(p);
    near(assert,b.maxX,2+Math.hypot(12,3),1e-11);near(assert,b.minY,3-Math.hypot(5,7),1e-11);
});
test('fit-only spline emits native cubics through every fit point instead of a polygon',()=>{
    const input=[vec(0,0),vec(3,6),vec(8,2),vec(12,8)],p=interpolateFitPoints(input);
    assert.equal(p.length,4);assert.deepEqual(p[0],['M',input[0]]);
    for(let i=1;i<input.length;i++){assert.equal(p[i][0],'C');assert.deepEqual(p[i][3],input[i]);}
    const sc=good(compile([[0,'SPLINE'],[5,'F'],[70,0],...input.flatMap(p=>[[11,p.x],[21,p.y]])]));
    assert.ok(sc.primitives[0].path.some(c=>c[0]==='C'));assert.ok(sc.diagnostics.some(d=>d.code==='spline-fit-interpolated'));
    assert.ok(!sc.diagnostics.some(d=>d.code==='spline-fit'));
});
test('clamped fit spline endpoints obey supplied tangent directions',()=>{
    const pts=[vec(0,0),vec(4,7),vec(10,0)],p=interpolateFitPoints(pts,{startTangent:vec(1,0),endTangent:vec(1,0)});
    near(assert,p[1][1].y,0,1e-12);near(assert,p.at(-1)[2].y,0,1e-12);
    assert.ok(p[1][1].x>0);assert.ok(p.at(-1)[2].x<10);
});
test('closed fit spline is periodic and preserves tangent continuity at the seam',()=>{
    const pts=[vec(0,0),vec(5,0),vec(5,5),vec(0,5)],p=interpolateFitPoints(pts,{closed:true});
    assert.equal(p.at(-1)[0],'Z');assert.deepEqual(p.at(-2)[3],pts[0]);
    const a=sub(p[1][1],pts[0]),b=sub(pts[0],p.at(-2)[2]);near(assert,a.x,b.x);near(assert,a.y,b.y);
});
test('fit interpolation validates degenerate geometry and budgets',()=>{
    assert.throws(()=>interpolateFitPoints([vec(),vec()]));
    assert.throws(()=>interpolateFitPoints([vec(),vec(1,0)],{closed:true}));
    assert.throws(()=>interpolateFitPoints([vec(),vec(1,0)],{maxPoints:NaN}));
    assert.throws(()=>interpolateFitPoints([vec(),vec(Infinity,0)]));
    assert.throws(()=>interpolateFitPoints([vec(),vec(1,0)],{startTangent:vec()}));
});
test('arcs have actual endpoint, angular midpoint and quadrant snaps without artificial conic endpoints',()=>{
    const f=A.prepareFrame(good(compile(arc(20,160))),{width:800,height:600});
    for(const [deg,kind] of [[20,'endpoint'],[160,'endpoint'],[90,'midpoint'],[90,'quadrant']]){
        const snap=f.snap(f.worldToScreen(polar(deg)),1,new Set([kind]));assert.ok(snap,kind);near(assert,distance(snap.point,polar(deg)),0,1e-10);
    }
    assert.equal(f.snap(f.worldToScreen(polar(20)),1,new Set(['quadrant'])),null);
    assert.equal(f.snap(f.worldToScreen(polar(55)),1,new Set(['endpoint'])),null);
});
test('arc center snap is available outside its geometric bounding rectangle',()=>{
    const f=A.prepareFrame(good(compile(arc(10,30))));const result=f.snap(f.worldToScreen(vec()),1,new Set(['center']));assert.ok(result);assert.equal(result.kind,'center');
});
test('circles have quadrants but no fabricated start/end snaps',()=>{
    const f=A.prepareFrame(compile(circle()));assert.equal(f.snap(f.worldToScreen(vec(10,0)),1,new Set(['endpoint'])),null);
    assert.equal(f.snap(f.worldToScreen(vec(10,0)),1,new Set(['quadrant'])).kind,'quadrant');
});
test('curve snaps survive mirrored nonuniform INSERT transforms',()=>{
    const sc=good(compile([[0,'INSERT'],[5,'I'],[2,'B'],[41,-2],[42,3],[10,100]],{}, {blocks:block('B',arc(0,180))}));
    const f=A.prepareFrame(sc),result=f.snap(f.worldToScreen(vec(100,30)),1,new Set(['midpoint']));assert.ok(result);near(assert,result.point.x,100);near(assert,result.point.y,30);
});
test('transparent geometry cannot attract snaps',()=>{
    const f=A.prepareFrame(compile([...line(),[440,0x02000000]]));assert.equal(f.snap(f.worldToScreen(vec()),10),null);
});
test('optional nearest snaps interpolate geometry without moving the original data',()=>{
    const f=A.prepareFrame(compile(line()));const p=f.worldToScreen(vec(3,.05)),r=f.snap(p,10,new Set(['nearest']));assert.equal(r.kind,'nearest');near(assert,r.point.x,3);near(assert,r.point.y,0);
});
test('Unicode escapes do not consume adjacent hex characters and literal braces survive',()=>{
    assert.equal(A.plainText(String.raw`\U+0041BCD`),'ABCD');
    assert.equal(A.plainText(String.raw`\{KEEP\} \\ {\C1;RED}`),'{KEEP} \\ RED');
    assert.equal(A.plainText(String.raw`\U+D83D\U+DE80`),'🚀');
    assert.equal(A.plainText(String.raw`\zKEEP`),String.raw`\zKEEP`);
    assert.equal(A.plainText(String.raw`A\PB\S1#2;`),'A\nB1/2');
});
test('hatch island styles honor explicit EXTERNAL/OUTERMOST flags',()=>{
    const loops=[[-10,10,3],[-6,6,18],[-2,2,2]];
    const make=style=>[[0,'HATCH'],[5,'H'],[70,1],[91,3],...loops.flatMap(([lo,hi,flags])=>[[92,flags],[72,0],[73,1],[93,4],[10,lo],[20,lo],[10,hi],[20,lo],[10,hi],[20,hi],[10,lo],[20,hi],[97,0]]),[75,style]];
    const normal=good(compile(make(0))),outer=good(compile(make(1))),ignore=good(compile(make(2)));
    assert.equal(normal.primitives[0].rings.length,3);assert.equal(outer.primitives[0].rings.length,2);assert.equal(ignore.primitives[0].rings.length,1);
    assert.ok(A.prepareFrame(normal).hitTest(A.prepareFrame(normal).worldToScreen(vec())));
    assert.equal(A.prepareFrame(outer).hitTest(A.prepareFrame(outer).worldToScreen(vec())),null);
    assert.ok(A.prepareFrame(ignore).hitTest(A.prepareFrame(ignore).worldToScreen(vec())));
});
test('hatch loop budgets and missing style-filter matches are explicit',()=>{
    const sc=compile(hatch(),{maxHatchLoops:1});assert.ok(sc.diagnostics.some(d=>d.message.includes('loop budget')));
    const t=hatch().map(([code,value])=>[code,code===75?2:value]);const empty=compile(t);assert.equal(empty.primitives.length,0);assert.ok(empty.diagnostics.some(d=>d.code==='empty-hatch'));
});
test('gradient hatches retain colors and native affine gradient geometry',()=>{
    const sc=good(compile([...hatch(),[450,1],[470,'LINEAR'],[453,2],[421,0xff0000],[421,0x0000ff],[460,Math.PI/2]]));
    const g=sc.primitives[0].gradient;assert.deepEqual(g.colors,['#ff0000','#0000ff']);near(assert,g.u.x,0);assert.ok(g.u.y>0);
});
test('one-color hatch gradient tint is decoded without integer channel overflow',()=>{
    const sc=good(compile([...hatch(),[450,1],[470,'CYLINDER'],[452,1],[462,.5],[421,0xff0000]]));assert.deepEqual(sc.primitives[0].gradient.colors,['#ff0000','#ff8080']);
});
test('circular viewport clips retain native conics and exclude the rectangular corner',()=>{
    const doc=new A.DxfDocument(file([...line('MODEL',-10,8,10,8),...section,...circle('BOUNDARY'),[67,1],[410,'Sheet']]));
    const sc=good(new A.SceneCompiler(doc).compile('Sheet')), p=sc.primitives.find(p=>p.entityHandle==='MODEL');assert.ok(p);
    assert.ok(p.clips[0].path.some(c=>c[0]==='K'));const f=A.prepareFrame(sc);
    assert.equal(f.hitTest(f.worldToScreen(vec(8,8)),1),null);assert.ok(f.hitTest(f.worldToScreen(vec(0,8)),1));
});
test('viewport clip geometry remains active when its boundary layer is switched off',()=>{
    const doc=new A.DxfDocument(file([...line('MODEL',-10,8,10,8),...section,...circle('BOUNDARY'),[8,'OFF'],[67,1],[410,'Sheet']],{tables:[[0,'LAYER'],[2,'OFF'],[62,-1]]}));
    const sc=good(new A.SceneCompiler(doc).compile('Sheet'));assert.ok(sc.primitives[0].clips[0].path);assert.equal(sc.primitives.length,1);
});
test('native path rejects float overflow before calling into Skia and releases allocations',()=>{
    let disposed=0,moves=0;class Path{MoveTo(){moves++;}Dispose(){disposed++;}}
    assert.throws(()=>A.nativePath({SKPath:Path,SKPathFillType:{EvenOdd:1}},[['M',vec(1e100,0)]]),/float32/);
    assert.equal(disposed,1);assert.equal(moves,0);
});
function dim(type,pairs=[]){return [[0,'DIMENSION'],[5,'DIM'],[70,type],...pairs];}
test('three-point angular dimensions generate a native arc and measured degree label',()=>{
    const sc=good(compile(dim(5,[[10,7],[20,7],[13,10],[23,0],[14,0],[24,10],[15,0],[25,0]])));
    assert.ok(sc.primitives.some(p=>p.path?.some(c=>c[0]==='K')));
    assert.equal(sc.primitives.find(p=>p.kind==='text').text,'90.00°');
});
test('two-line angular dimensions select the sector containing the arc definition point',()=>{
    const sc=good(compile(dim(2,[[13,0],[23,0],[14,10],[24,0],[10,0],[20,0],[15,0],[25,10],[16,6],[26,6]])));
    assert.equal(sc.primitives.find(p=>p.kind==='text').text,'90.00°');
});
test('generated dimension text at zero is explicit and radius uses only one arrow',()=>{
    const sc=good(compile(dim(4,[[10,0],[20,0],[15,10],[25,0],[11,0],[21,2]])));
    const text=sc.primitives.find(p=>p.kind==='text');assert.equal(text.text,'R10.00');assert.equal(text.position.x,0);assert.equal(text.position.y,2);
    assert.equal(sc.primitives.filter(p=>p.fill).length,1);
});
test('dimension style names are case-insensitive and decimal suppression/postfix are applied',()=>{
    const sc=good(compile(dim(1,[[3,'custom'],[13,0],[23,0],[14,10],[24,0],[10,0],[20,4]]),{}, {tables:[[0,'DIMSTYLE'],[2,'Custom'],[140,1],[271,4],[78,8],[144,2],[3,'<> mm']]}));
    assert.equal(sc.primitives.find(p=>p.kind==='text').text,'20 mm');
});
test('ordinate measurement is relative to its dimension origin',()=>{
    const sc=good(compile(dim(6|64,[[10,100],[20,100],[13,112],[23,115],[14,125],[24,115]])));
    assert.equal(sc.primitives.find(p=>p.kind==='text').text,'12.00');
});
test('angular dimension degeneracies are isolated without dropping valid siblings',()=>{
    const sc=compile([...dim(2),...line('SURVIVES')]);assert.ok(sc.diagnostics.some(d=>d.severity==='error'));assert.ok(sc.primitives.some(p=>p.handle==='SURVIVES'));
});
test('dash intervals reject overflow rather than passing Infinity to native Skia',()=>{
    assert.throws(()=>A.nativeDash([1e100,-1e100]),/overflow/);assert.throws(()=>A.nativeDash([0,-1],1,NaN));
});

test('malformed nonrectangular viewport boundary retains valid model geometry with a diagnostic',()=>{
    const doc=new A.DxfDocument(file([...line('MODEL',-10,8,10,8),...section,...circle('BOUNDARY').map(([c,v])=>[c,c===40?-1:v]),[67,1],[410,'Sheet']]));
    const sc=new A.SceneCompiler(doc).compile('Sheet');
    assert.ok(sc.primitives.some(p=>p.entityHandle==='MODEL'));
    assert.ok(sc.diagnostics.some(d=>d.code==='viewport-boundary'));
});
test('coarse interaction sampling does not remove exact arc quadrant snap targets',()=>{
    const sc=compile(arc(13,123),{tolerance:100}),f=A.prepareFrame(sc);
    assert.ok(f.snap(f.worldToScreen(polar(90)),.1,new Set(['quadrant'])));
});
test('invalid public parser budgets cannot disable workload limits',()=>{
    for(const limit of [NaN,Infinity,0,-1,1.5]){
        assert.throws(()=>A.parseTags('0\nEOF\n',{maxTags:limit}));
        assert.throws(()=>A.parseTags('0\nEOF\n',{maxBytes:limit}));
        assert.throws(()=>new A.DxfDocument([],{maxTags:limit}));
    }
});
test('invalid native conic weights release the allocated path before native submission',()=>{
    let disposed=0,conics=0;class Path{MoveTo(){}ConicTo(){conics++;}Dispose(){disposed++;}}
    for(const weight of [0,-1,NaN,Infinity,1e100])assert.throws(()=>A.nativePath({SKPath:Path,SKPathFillType:{EvenOdd:1}},[['M',vec()],['K',vec(1,1),vec(2,0),weight]]),/weight/);
    assert.equal(disposed,5);assert.equal(conics,0);
});
