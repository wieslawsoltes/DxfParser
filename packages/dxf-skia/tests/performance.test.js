'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),A=require('..'),H=require('./helpers');
test('camera frame preparation never transforms pick tessellation until requested',()=>{
 const scene=H.compile(Array.from({length:2000},(_,i)=>H.circle(i.toString(16),(i%100)*30,Math.floor(i/100)*30,10)).flat());
 const frame=A.prepareFrame(scene);assert.equal(frame.interactionStats.pickablesCreated,0);assert.equal(frame.interactionStats.screenPointsTransformed,0);
 const picks=frame.pickables;assert.equal(picks.length,2000);assert.equal(frame.interactionStats.screenPointsTransformed,0);const p=picks[0];assert.ok(p.screenBounds);assert.equal(frame.interactionStats.screenPointsTransformed,0);assert.ok(p.screenPoints.length>10);assert.equal(frame.interactionStats.screenPointsTransformed,p.screenPoints.length);
});
test('point picking searches the spatial index instead of materializing every visible object',()=>{
 const scene=H.compile(Array.from({length:2000},(_,i)=>H.line(i.toString(16),(i%100)*30,Math.floor(i/100)*30,(i%100)*30+5,Math.floor(i/100)*30)).flat());
 const frame=A.prepareFrame(scene),hit=frame.hitTest(frame.worldToScreen({x:0,y:0,z:0}),.1);assert.ok(hit);assert.ok(frame.interactionStats.pickablesCreated<10);assert.equal(frame.interactionStats.screenPointsTransformed,0);
});
test('center snaps remain reachable outside arc geometry bounds',()=>{
 const scene=H.compile([[0,'ARC'],[5,'A'],[10,0],[20,0],[40,10],[50,0],[51,20],...H.line('B',-5,-5,15,15)]),frame=A.prepareFrame(scene);
 const p=frame.snap(frame.worldToScreen({x:0,y:0,z:0}),1,['center']);assert.equal(p.handle,'A');assert.equal(p.type,'center');
});
test('infinite rays and lines retain lazy visible points and geometric picking',()=>{
 const f=A.prepareFrame(H.compile([[0,'XLINE'],[5,'X'],[10,0],[20,0],[11,1],[21,0],...H.line('B',0,3,100,3)]));const x=f.pickables.find(p=>p.handle==='X');assert.equal(x.screenPoints.length,2);assert.equal(f.hitTest(f.worldToScreen({x:50,y:0,z:0}),1).handle,'X');
});
test('in-place spatial index does not reorder caller arrays and handles duplicate centroids',()=>{
 const items=Array.from({length:5000},(_,id)=>({id,bounds:{minX:0,maxX:1,minY:0,maxY:1,minZ:0,maxZ:0}})),copy=[...items];
 const index=new A.SpatialIndex(items,4);assert.deepEqual(items,copy);assert.equal(index.search({minX:.1,maxX:.2,minY:.1,maxY:.2}).length,5000);
});
test('shared clips project lazily once per projection and preserve exclusion holes',()=>{
 const scene=H.compile(H.hatch()),f=A.prepareFrame(scene),point=f.worldToScreen({x:0,y:0,z:0});assert.equal(f.hitTest(point,.1),null);assert.equal(f.interactionStats.screenPointsTransformed,0);
});
