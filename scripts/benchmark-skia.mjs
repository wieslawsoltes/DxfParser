#!/usr/bin/env node
/* Compare the fixed 0.2.1 native renderer and current source in one process.
 * Timings are reports, not unstable wall-clock acceptance thresholds. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
import A from '../packages/dxf-skia/index.js';
import H from '../packages/dxf-skia/tests/helpers.js';
import {Initialize} from '../vendor/skiasharpweb/dist/package/node.js';
const require=createRequire(import.meta.url),baseline=process.argv[2]||process.env.DXF_PERFORMANCE_BASELINE;
if(!baseline)throw new Error('Pass the checked-out 1342c38 baseline repository directory.');
const B=require(path.resolve(baseline,'packages/dxf-skia/index.js')),S=await Initialize({fonts:false});
const fontFile=[process.env.SKIA_TEST_FONT,'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'].find(p=>p&&fs.existsSync(p));
if(!fontFile)throw new Error('A locally installed font is required; it is not distributed.');
const fontBytes=fs.readFileSync(fontFile),out=path.resolve('test-results/skia-performance');fs.mkdirSync(out,{recursive:true});
const report={baseline:'1342c38a5fb7f1a0944c37fb989bf3cba52b2ebc',node:process.version,os:os.platform(),cpu:os.cpus()[0]?.model,backend:'native-skia-raster',pixelComparisons:[],workloads:[]};
const text=(i=0)=>[[0,'TEXT'],[5,'T'+i],[10,i*25],[20,0],[1,'Pump '+i+' Ω — ffi'],[40,5],[7,'F']];
const section={tables:[[0,'STYLE'],[2,'F'],[3,'local.ttf']]};
function resources(api){const r=new api.ResourceStore(S);r.register('local.ttf',fontBytes);return r;}
function render(api,source,frameOptions,paintOptions={}) {
 const r=resources(api),p=new api.SkiaPainter(S,{resources:r}),surface=S.SKSurface.Create(new S.SKImageInfo(640,480));
 try{const scene=new api.SceneCompiler(new api.DxfDocument(source),{textMeasurer:(p,t)=>r.measureText(p,t)}).compile();const f=api.prepareFrame(scene,{width:640,height:480,...frameOptions});p.draw(surface.Canvas,f,paintOptions);const image=surface.Snapshot();try{return {pixels:Buffer.from(image.ReadPixels()),stats:p.metrics};}finally{image.Dispose();}}
 finally{p.dispose();r.dispose();surface.Dispose();}
}
const mixed=H.file([...H.line(),...H.circle(),...H.hatch(),...text(),[0,'MTEXT'],[5,'MT'],[10,3],[20,-4],[40,3],[41,20],[71,5],[7,'F'],[90,1],[1,'Mixed ffi Ω\\PSecond line'],[0,'POINT'],[10,-1],[20,2]],section);
for(const [label,source,opts,paint] of [
 ['mixed',mixed,{},{}],['rotated',mixed,{viewState:{mode:'auto',rotationRad:.47}},{}],
 ['selection',mixed,{}, {selection:new Set(['A','C','T0','MT'])}],
 ['mirrored-text',H.file([[0,'TEXT'],[5,'M'],[1,'jÁÅ ÿΩ'],[40,8],[41,-.7],[50,37],[7,'F'],[72,2],[73,3],[11,0],[21,0]],section),{},{}],
 ['fallback',H.file([[0,'MTEXT'],[1,'PUMP 123\\PPRESSURE'],[40,4],[41,30],[71,8]]),{viewState:{mode:'auto',rotationRad:.31}},{}]
]) {
 const old=render(B,source,opts,paint),now=render(A,source,opts,paint);let changed=0,max=0;for(let i=0;i<old.pixels.length;i++){if(old.pixels[i]!==now.pixels[i])changed++;max=Math.max(max,Math.abs(old.pixels[i]-now.pixels[i]));}
 report.pixelComparisons.push({label,changedChannels:changed,maxDifference:max});assert.equal(changed,0,label+' pixels changed');
}
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
for(const [name,count] of [['circles',5000],['native-text',80]]) {
 const ents=[];for(let i=0;i<count;i++)ents.push(...(name==='circles'?H.circle(i.toString(16),(i%100)*25,Math.floor(i/100)*25,10):[[0,'TEXT'],[5,i.toString(16)],[10,(i%10)*180],[20,Math.floor(i/10)*20],[40,10],[1,'Pump '+i+' — Ω'],[7,'F']]));
 const source=H.file(ents,section),runs={};
 for(const [label,api] of [['before',B],['after',A]]) {
  const r=resources(api);let t=performance.now();const doc=new api.DxfDocument(source),parseMs=performance.now()-t;t=performance.now();
  const scene=new api.SceneCompiler(doc,{textMeasurer:(p,s)=>r.measureText(p,s)}).compile(),compileMs=performance.now()-t;t=performance.now();
  const initial=api.prepareFrame(scene),firstPrepareMs=performance.now()-t,painter=new api.SkiaPainter(S,{resources:r}),surface=S.SKSurface.Create(new S.SKImageInfo(800,600));
  try{t=performance.now();painter.draw(surface.Canvas,initial);const firstDrawMs=performance.now()-t,samples=[];
   for(let i=0;i<5;i++){t=performance.now();const frame=api.prepareFrame(scene,{viewState:{...initial.viewState,mode:'custom',center:{...initial.worldCenter,x:initial.worldCenter.x+i}}}),prepareMs=performance.now()-t;t=performance.now();painter.draw(surface.Canvas,frame);samples.push({prepareMs,drawMs:performance.now()-t});}
   runs[label]={parseMs,compileMs,firstPrepareMs,firstDrawMs,warmPrepareMs:median(samples.map(s=>s.prepareMs)),warmDrawMs:median(samples.map(s=>s.drawMs)),samples,cacheMetrics:painter.metrics};
  }finally{painter.dispose();r.dispose();surface.Dispose();}
 }
 report.workloads.push({name,count,sourceBytes:Buffer.byteLength(source),...runs});console.log(JSON.stringify(report.workloads.at(-1)));
}
fs.writeFileSync(path.join(out,'benchmark.json'),JSON.stringify(report,null,2));console.log('Reference pixel comparisons and performance report completed.');
