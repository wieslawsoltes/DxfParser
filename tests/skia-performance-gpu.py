#!/usr/bin/env python3
"""Same-backend 0.2.1/current native-pixel comparison and WebGPU timing evidence.

This is a real Graphite/SwiftShader gate: unavailable WebGPU fails, no raster
substitution. Timings are descriptive; pixel identity and cache reuse are gates.
The immutable reference checkout is supplied at .performance-reference by CI.
"""
import base64, importlib.util, json, os, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('native_gpu_harness', ROOT/'tests/skia-gpu.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
OUT=ROOT/'test-results/skia-performance'

SETUP=r'''async ({font}) => {
 window.B=(await import('/.performance-reference/packages/dxf-skia/dist/dxf-skia.mjs')).default;
 window.A=DxfSkia;
 window.fontBytes=Uint8Array.from(atob(font),c=>c.charCodeAt(0));
 window.file=(entities,extra={})=>{
  const pairs=[];for(const [name,tags] of [['HEADER',extra.header||[]],['TABLES',extra.tables||[]],['BLOCKS',extra.blocks||[]],['ENTITIES',entities],['OBJECTS',extra.objects||[]]])pairs.push([0,'SECTION'],[2,name],...tags,[0,'ENDSEC']);pairs.push([0,'EOF']);
  return pairs.map(([c,v])=>c+'\n'+v+'\n').join('');
 };
 window.style={tables:[[0,'STYLE'],[2,'F'],[3,'local.ttf']]};
 window.text=(i=0)=>[[0,'TEXT'],[5,'T'+i],[10,i*25],[20,0],[1,'Pump '+i+' Ω — ffi'],[40,5],[7,'F']];
 window.mixed=file([[0,'LINE'],[5,'A'],[10,-15],[20,-15],[11,25],[21,15],
 [0,'CIRCLE'],[5,'C'],[10,0],[20,0],[40,10],
 [0,'HATCH'],[5,'H'],[70,1],[91,1],[92,3],[72,0],[73,1],[93,4],
 [10,-10],[20,-10],[10,10],[20,-10],[10,10],[20,10],[10,-10],[20,10],[97,0],[75,0],
 [450,1],[470,'LINEAR'],[421,0x4080ff],[421,0xff8020],...text(),
 [0,'MTEXT'],[5,'MT'],[10,3],[20,-4],[40,3],[41,20],[71,5],[7,'F'],[90,1],[1,'Mixed ffi Ω\\PSecond line'],
 [0,'POINT'],[10,-1],[20,2]],style);
 window.nativeRender=async(api,source,options={},paint={})=>{
  const resources=new api.ResourceStore(S);resources.register('local.ttf',fontBytes);
  const painter=new api.SkiaPainter(S,{resources});let surface;
  try {
   const scene=new api.SceneCompiler(new api.DxfDocument(source),{textMeasurer:(p,t)=>resources.measureText(p,t)}).compile();
   const frame=api.prepareFrame(scene,{width:640,height:480,...options});
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;document.body.append(canvas);
   surface=await S.SKSurface.Create(canvas,{backend:'webgpu',allowFallback:false});
   if(surface.Backend!=='webgpu'||surface.RenderMode!=='skia-graphite-webgpu')throw Error('Required Graphite pipeline not active');
   painter.draw(surface.Canvas,frame,paint);await surface.FlushAsync();
   const image=await surface.SnapshotAsync();try{return {pixels:image.ReadPixels().slice(),metrics:painter.metrics,errors:painter.diagnostics.items.filter(x=>x.severity==='error')};}finally{image.Dispose();}
  } finally {if(surface)await surface.DisposeAsync();painter.dispose();resources.dispose();}
 };
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('Required WebGPU adapter unavailable');
 return {vendor:adapter.info.vendor,architecture:adapter.info.architecture,description:adapter.info.description};
}'''

class PerformanceGpuTests(h.NativeGpuTests):
    def setUp(self):
        super().setUp();OUT.mkdir(parents=True,exist_ok=True)
        font=next((Path(p) for p in [os.getenv('SKIA_TEST_FONT',''),'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'] if p and Path(p).is_file()),None)
        self.assertIsNotNone(font,'Native font qualification requires a local system font; no font is distributed.')
        self.adapter=self.page.evaluate(SETUP,{'font':base64.b64encode(font.read_bytes()).decode()})
    def test_perf_01_graphite_vector_text_masks_selection_and_rotation_match_reference(self):
        result=self.page.evaluate(r'''async()=>{
          const cases=[['mixed',mixed,{},{}],['rotated',mixed,{viewState:{mode:'auto',rotationRad:.47}},{}],
           ['selection',mixed,{}, {selection:new Set(['A','C','T0','MT'])}],
           ['mirrored-text',file([[0,'TEXT'],[5,'M'],[1,'jÁÅ ÿΩ'],[40,8],[41,-.7],[50,37],[7,'F'],[72,2],[73,3],[11,0],[21,0]],style),{},{}],
           ['fallback',file([[0,'MTEXT'],[1,'PUMP 123\\PPRESSURE'],[40,4],[41,30],[71,8]]),{viewState:{mode:'auto',rotationRad:.31}},{}]];
          const results=[];
          for(const [label,source,options,paint] of cases){
           const before=await nativeRender(B,source,options,paint),after=await nativeRender(A,source,options,paint);
           let changedChannels=0,maxDifference=0;
           for(let i=0;i<before.pixels.length;i++){if(before.pixels[i]!==after.pixels[i])changedChannels++;maxDifference=Math.max(maxDifference,Math.abs(before.pixels[i]-after.pixels[i]));}
           results.push({label,changedChannels,maxDifference,errors:[...before.errors,...after.errors],metrics:after.metrics});
          }
          return results;
        }''')
        (OUT/'gpu-pixels.json').write_text(json.dumps({'baseline':'1342c38a5fb7f1a0944c37fb989bf3cba52b2ebc','browser':self.browser.version,'adapter':self.adapter,'backend':'skia-graphite-webgpu','comparisons':result},indent=2))
        for row in result:
            self.assertEqual([],row['errors'],row['label']);self.assertEqual(0,row['changedChannels'],row)
        self.assertGreater(self.page.evaluate('drawCalls'),0)
    def test_perf_02_graphite_warm_camera_workloads_reuse_native_vectors(self):
        result=self.page.evaluate(r'''async()=>{
          const results=[],median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
          for(const [name,count] of [['circles',5000],['native-text',64]]){
           const entities=[];
           for(let i=0;i<count;i++)entities.push(...(name==='circles'?[[0,'CIRCLE'],[5,i.toString(16)],[10,(i%100)*25],[20,Math.floor(i/100)*25],[40,10]]:[[0,'TEXT'],[5,i.toString(16)],[10,(i%8)*180],[20,Math.floor(i/8)*20],[40,10],[1,'Pump '+i+' — Ω'],[7,'F']]));
           const source=file(entities,style),workload={name,count};let referencePixels;
           for(const [label,api] of [['before',B],['after',A]]){
            const resources=new api.ResourceStore(S);resources.register('local.ttf',fontBytes);
            const painter=new api.SkiaPainter(S,{resources});let surface;
            try{
             let t=performance.now();const doc=new api.DxfDocument(source),parseMs=performance.now()-t;t=performance.now();
             const scene=new api.SceneCompiler(doc,{textMeasurer:(p,s)=>resources.measureText(p,s)}).compile(),compileMs=performance.now()-t;t=performance.now();
             const initial=api.prepareFrame(scene,{width:800,height:600}),firstPrepareMs=performance.now()-t;
             const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;document.body.append(canvas);
             surface=await S.SKSurface.Create(canvas,{backend:'webgpu',allowFallback:false});
             if(surface.Backend!=='webgpu')throw Error('WebGPU required');
             t=performance.now();painter.draw(surface.Canvas,initial);await surface.FlushAsync();const firstDrawMs=performance.now()-t;
             const samples=[],startDraws=window.drawCalls;
             for(let i=0;i<4;i++){
              t=performance.now();const frame=api.prepareFrame(scene,{width:800,height:600,viewState:{...initial.viewState,mode:'custom',center:{...initial.worldCenter,x:initial.worldCenter.x+i}}}),prepareMs=performance.now()-t;
              t=performance.now();painter.draw(surface.Canvas,frame);await surface.FlushAsync();samples.push({prepareMs,drawFlushMs:performance.now()-t,interaction:frame.interactionStats});
             }
             const image=await surface.SnapshotAsync();let pixels;try{pixels=image.ReadPixels().slice();}finally{image.Dispose();}
             if(label==='before')referencePixels=pixels;else {let changed=0;for(let i=0;i<pixels.length;i++)if(referencePixels[i]!==pixels[i])changed++;workload.changedChannels=changed;}
             workload[label]={parseMs,compileMs,firstPrepareMs,firstDrawMs,warmPrepareMs:median(samples.map(s=>s.prepareMs)),warmDrawFlushMs:median(samples.map(s=>s.drawFlushMs)),samples,metrics:painter.metrics,drawCalls:window.drawCalls-startDraws,errors:painter.diagnostics.items.filter(d=>d.severity==='error')};
            }finally{if(surface)await surface.DisposeAsync();painter.dispose();resources.dispose();}
           }
           results.push(workload);
          }return results;
        }''')
        (OUT/'gpu-benchmark.json').write_text(json.dumps({'baseline':'1342c38a5fb7f1a0944c37fb989bf3cba52b2ebc','browser':self.browser.version,'adapter':self.adapter,'backend':'skia-graphite-webgpu','physicalHardware':False,'workloads':result},indent=2))
        for row in result:
            self.assertEqual([],row['before']['errors']);self.assertEqual([],row['after']['errors']);self.assertEqual(0,row['changedChannels'],row['name'])
            self.assertGreater(row['after']['drawCalls'],0)
            for sample in row['after']['samples']:
                self.assertEqual(0,sample['interaction']['screenPointsTransformed']);self.assertEqual(0,sample['interaction']['pickablesCreated'])
            if row['name']=='circles':
                self.assertEqual(row['count'],row['after']['metrics']['pathBuilds']);self.assertGreaterEqual(row['after']['metrics']['pathHits'],row['count']*4)
            else:
                self.assertEqual(row['count'],row['after']['metrics']['textBuilds']);self.assertEqual(row['count']*4,row['after']['metrics']['textHits'])

if __name__=='__main__':
    suite=unittest.TestSuite(PerformanceGpuTests(n) for n in sorted(dir(PerformanceGpuTests)) if n.startswith('test_perf_'))
    raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
