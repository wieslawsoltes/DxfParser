'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../components/analysis-visual-model.js');
const row = (key, ...values) => ({key, values});

test('typed groups and stable row keys are not inferred from labels', () => {
  const result = M.aggregate([row('a',1),row(1,'1'),row('c',null),row('d',undefined),row('e','')],0);
  assert.equal(result.buckets.length,5);
  assert.deepEqual(new Set(result.buckets.flatMap(b=>b.keys)), new Set(['a',1,'c','d','e']));
});
test('weighted populations preserve exact totals and membership', () => {
  const rows=[row('a','Pump',2.5),row('b','Pump',3.5),row('c','Tank',2)];
  const {buckets,excluded}=M.aggregate(rows,0,1);
  assert.equal(excluded,0);assert.equal(buckets[0].value,6);assert.deepEqual(buckets[0].keys,['a','b']);
  assert.equal(buckets.reduce((n,b)=>n+b.value,0),8);assert.equal(rows[0].values[1],2.5);
});
test('negative, nonfinite and nonnumeric weights are explicit exclusions', () => {
  const a=M.aggregate([row(0,'a',-1),row(1,'a',NaN),row(2,'a',Infinity),row(3,'a','4'),row(4,'a',0)],0,1);
  assert.equal(a.excluded,4);assert.equal(a.buckets[0].count,1);assert.equal(a.buckets[0].value,0);
});
test('Other retains all remaining groups and typed membership', () => {
  const buckets=M.aggregate(Array.from({length:100},(_,i)=>row(i,'group'+i,i)),0,1).buckets;
  const top=M.top(buckets,6);assert.equal(top.length,6);assert.equal(top.at(-1).count,95);
  assert.equal(top.reduce((n,b)=>n+b.value,0),4950);assert.equal(new Set(top.flatMap(b=>b.keys)).size,100);
  assert.equal(buckets.length,100);
});
test('overflowing a group or Other is not rendered as NaN', () => {
  assert.throws(()=>M.aggregate([row(1,'x',Number.MAX_VALUE),row(2,'x',Number.MAX_VALUE)],0,1),RangeError);
  assert.throws(()=>M.top(M.aggregate([row(1,'x',Number.MAX_VALUE),row(2,'y',Number.MAX_VALUE)],0,1).buckets,1),RangeError);
});
test('histogram bins are disjoint with an inclusive final maximum', () => {
  const h=M.histogram([0,1,2,3,4,5,6,7,8,9,10].map((n,i)=>row(i,n)),0,5);
  assert.deepEqual(h.buckets.map(b=>b.keys),[[0,1],[2,3],[4,5],[6,7],[8,9,10]]);
  assert.equal(h.buckets.at(-1).hi,10);assert.equal(h.excluded,0);
});
test('constant, empty and invalid histogram populations', () => {
  assert.equal(M.histogram([],0).buckets.length,0);
  const h=M.histogram([row(1,42),row(2,42),row(3,NaN),row(4,'42')],0);
  assert.equal(h.buckets.length,1);assert.equal(h.buckets[0].value,2);assert.equal(h.excluded,2);
});
test('opposite finite extremes do not overflow histogram arithmetic', () => {
  const h=M.histogram([row(1,-Number.MAX_VALUE),row(2,0),row(3,Number.MAX_VALUE)],0);
  assert(h.buckets.every(b=>Number.isFinite(b.lo)&&Number.isFinite(b.hi)));
  assert.equal(h.buckets.reduce((n,b)=>n+b.value,0),3);
});
test('matrix includes all records once even with Other axes', () => {
  const rows=Array.from({length:100},(_,i)=>row(i,'x'+i%10,'y'+i%12));
  const m=M.matrix(rows,0,1,4,4);assert.equal(m.xs.length,4);assert.equal(m.ys.length,4);
  const cells=m.cells.flat();assert.equal(cells.reduce((n,c)=>n+c.value,0),100);
  assert.equal(new Set(cells.flatMap(c=>c.keys)).size,100);
  for (let y=0;y<m.ys.length;y++) for(let x=0;x<m.xs.length;x++) for(const k of m.cells[y][x].keys){assert(m.xs[x].keys.includes(k));assert(m.ys[y].keys.includes(k));}
});
test('byte ranges count bytes rather than rows and ignore malformed rows', () => {
  const b=M.byteStats([row('a','00 00 FF'),row('b','41 42 43'),row('bad','F')],0);
  assert.equal(b.total,6);assert.equal(b.invalid,1);assert.equal(b.printable,3);
  assert.equal(b.buckets[0].value,2);assert.equal(b.buckets[0].count,1);assert.deepEqual(b.buckets[4].keys,['b']);
});
test('entropy of uniform bytes is 8, one value is 0', () => {
  const hex=Array.from({length:256},(_,i)=>i.toString(16).padStart(2,'0')).join('');
  assert.equal(M.byteStats([row('a',hex)],0).entropy,8);
  assert.equal(M.byteStats([row('a','FFFFFFFF')],0).entropy,0);
  assert.equal(M.byteStats([],0).entropy,0);
});
test('comparison preserves booleans/numbers and exact equality', () => {
  const columns=['Type','Count','Enabled','Value'].map(title=>({title}));
  const result=M.compareRows(columns,row('p','x',1,true,-0),row('s','x','1',false,0));
  assert.deepEqual(result.map(r=>r.values[3]),['Same','Changed','Changed','Changed']);
  assert.equal(result[1].values[1],1);assert.equal(result[1].values[2],'1');
  assert.equal(result[2].values[1],true);
});
test('50,000 records aggregate without changing source order or losing membership', () => {
  const rows=Array.from({length:50000},(_,i)=>row(i,i%31,1));
  const b=M.aggregate(rows,0,1).buckets;assert.equal(b.reduce((n,x)=>n+x.value,0),50000);
  assert.equal(new Set(b.flatMap(x=>x.keys)).size,50000);assert.equal(rows[49999].key,49999);
});
