#!/usr/bin/env python3
"""Required native Graphite/WebGPU and Ganesh/WebGL tests on software Vulkan.

Run under Xvfb on Linux. Missing WebGPU adapters FAIL rather than skip or fall
back. This qualifies real API/Skia pipelines on SwiftShader, not physical GPUs.
"""
import functools, http.server, json, os, threading, unittest
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/skia-gpu'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def dxf(pairs):return ''.join(f'{c}\n{v}\n' for c,v in [(0,'SECTION'),(2,'ENTITIES'),*pairs,(0,'ENDSEC'),(0,'EOF')])
LINE=[(0,'LINE'),(5,'L'),(10,0),(20,0),(11,20),(21,10)]
CIRCLE=[(0,'CIRCLE'),(5,'C'),(10,10),(20,10),(40,5)]
SOLID=[(0,'SOLID'),(5,'S'),(420,0xff0000),(10,0),(20,0),(11,10),(21,0),(12,0),(22,10),(13,10),(23,10)]
HATCH=[(0,'HATCH'),(5,'H'),(70,1),(91,1),(92,3),(72,0),(73,1),(93,4),(10,-10),(20,-10),(10,10),(20,-10),(10,10),(20,10),(10,-10),(20,10),(97,0),(75,0),(450,1),(470,'LINEAR'),(421,0xff0000),(421,0x0000ff)]

class NativeGpuTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUT.mkdir(parents=True,exist_ok=True)
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.p=sync_playwright().start()
        executable=os.getenv('CHROMIUM_EXECUTABLE') or cls.p.chromium.executable_path
        env=dict(os.environ);icd=Path(executable).parent/'vk_swiftshader_icd.json'
        if icd.exists():env.update(VK_ICD_FILENAMES=str(icd),VK_DRIVER_FILES=str(icd))
        cls.browser=cls.p.chromium.launch(executable_path=executable,headless=True,env=env,args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface'])
    @classmethod
    def tearDownClass(cls):cls.browser.close();cls.p.stop();cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.context=self.browser.new_context();self.context.set_default_timeout(30000);self.page=self.context.new_page();self.errors=[]
        self.page.on('pageerror',lambda e:self.errors.append(str(e)))
        self.page.add_init_script("""window.drawCalls=0;window.invalidDraws=[];
        for(const method of ['draw','drawIndexed']) {const native=GPURenderPassEncoder.prototype[method];
          GPURenderPassEncoder.prototype[method]=function(...args) {drawCalls++;
            const unsigned=method==='draw'?args:args.filter((_,i)=>i!==3);
            if(unsigned.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff))invalidDraws.push({method,args});
            return native.apply(this,args);};}
        """)
        self.page.goto(f'http://127.0.0.1:{self.server.server_port}/tests/skia-gpu.html')
        self.page.wait_for_function('window.ready')
    def tearDown(self):
        try:
            self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')))
            self.assertEqual([],self.page.evaluate('invalidDraws'))
            self.page.evaluate('async()=>{await window.host?.dispose()}')
            self.assertEqual([],self.errors)
        finally:self.context.close()
    def test_01_required_graphite_draws_native_pixels_and_reports_adapter(self):
        info=self.page.evaluate("async()=>{const a=await navigator.gpu.requestAdapter();if(!a)throw Error('Required WebGPU adapter unavailable');return {vendor:a.info.vendor,architecture:a.info.architecture,description:a.info.description}}")
        mode=self.page.evaluate('(text)=>start(text)',dxf(SOLID+CIRCLE))
        self.assertEqual('skia-graphite-webgpu',mode)
        sample=self.page.evaluate("""async()=>{const image=await host.surface.SnapshotAsync();try{const bytes=image.ReadPixels(),p=frame.worldToScreen({x:5,y:5,z:0}),offset=(Math.floor(p.y)*640+Math.floor(p.x))*4;return [...bytes.slice(offset,offset+4)];}finally{image.Dispose()}}""")
        self.assertEqual([255,0,0,255],sample)
        self.assertGreater(self.page.evaluate('drawCalls'),0)
        (OUT/'environment.json').write_text(json.dumps({'browser':self.browser.version,'adapter':info,'renderer':mode,'fallback':False,'physicalGpuQualified':False},indent=2))
    def test_02_required_ganesh_webgl_is_not_raster_fallback(self):
        self.page.evaluate('(text)=>start(text,"webgl")',dxf(LINE+CIRCLE))
        self.assertEqual('webgl',self.page.evaluate('host.surface.Backend'))
        png=self.page.evaluate('async()=>[...(await host.exportPng()).slice(0,8)]')
        self.assertEqual([137,80,78,71,13,10,26,10],png)
    def test_03_graphite_hatch_gradients_and_native_curve_clipping(self):
        self.page.evaluate('(text)=>start(text)',dxf(HATCH))
        result=self.page.evaluate("""async()=>{const image=await host.surface.SnapshotAsync();try{const p=image.ReadPixels();const rgb=x=>{const q=frame.worldToScreen({x,y:5,z:0}),i=(Math.floor(q.y)*640+Math.floor(q.x))*4;return [...p.slice(i,i+3)]};return {left:rgb(-8),right:rgb(8),issues:host.painter.diagnostics.items};}finally{image.Dispose()}}""")
        self.assertGreater(result['left'][0],200);self.assertGreater(result['right'][2],200);self.assertEqual([],result['issues'])
    def test_04_real_gpu_validation_failure_is_captured_and_replayed_once(self):
        self.page.evaluate('(text)=>start(text,"webgpu",true)',dxf(LINE+CIRCLE))
        result=self.page.evaluate("""async()=>{const old=host.surface,resources=host.resources,flush=old.Flush.bind(old);old.Flush=()=>{old._graphitePresenter.device.createBuffer({size:4,usage:0});flush();};host.request(frame);await host.whenIdle();return {backend:host.surface.Backend,failures:host.recoveryEvents,sameResources:host.resources===resources,disposed:old.IsDisposed};}""")
        self.assertIn(result['backend'],['webgl','canvas']);self.assertTrue(result['sameResources']);self.assertTrue(result['disposed'])
        self.assertEqual(1,len([e for e in result['failures'] if e['backend']=='webgpu']))
    def test_05_real_device_loss_recovers_without_a_user_redraw(self):
        self.page.evaluate('(text)=>start(text,"webgpu",true)',dxf(LINE+CIRCLE))
        self.page.evaluate('host.surface._graphitePresenter.device.destroy()')
        self.page.wait_for_function('host.surface && host.surface.Backend!=="webgpu" && host.paintCount>=2')
        self.page.evaluate('()=>host.whenIdle()')
        self.assertEqual(1,self.page.evaluate('host.recoveryEvents.filter(x=>x.backend==="webgpu").length'))
    def test_06_graphite_repeated_resize_and_explicit_retry_releases_previous_surfaces(self):
        self.page.evaluate('(text)=>start(text)',dxf(LINE+CIRCLE))
        self.page.evaluate("""async()=>{for(let i=1;i<=8;i++){const old=host.surface;frame=DxfSkia.prepareFrame(frame.scene,{width:640+i,height:480+i});host.request(frame);await host.whenIdle();if(!old.IsDisposed)throw Error('Resize leaked surface');}host.retryBackend('webgpu');await host.whenIdle();}""")
        self.assertEqual('webgpu',self.page.evaluate('host.surface.Backend'));self.assertEqual([],self.page.evaluate('host.recoveryEvents'))
    def test_07_all_dxf_fixtures_run_through_real_graphite_without_boundary_errors(self):
        self.page.evaluate('(text)=>start(text)',dxf(LINE))
        results=[]
        for file in sorted((ROOT/'tests/data').glob('*.dxf')):
            if file.name == 'advanced-geometry.dxf':
                rejection=self.page.evaluate("""text=>{const previous=host.lastFrame;try{makeScene(text);return {rejected:false};}catch(error){return {rejected:error instanceof SyntaxError,message:error.message,preserved:host.lastFrame===previous};}}""",file.read_text())
                self.assertTrue(rejection['rejected']);self.assertTrue(rejection['preserved']);self.assertIn('line 97',rejection['message'])
                results.append({'file':file.name,**rejection});continue
            result=self.page.evaluate("""async text=>{const scene=makeScene(text);frame=DxfSkia.prepareFrame(scene,{width:640,height:480});host.request(frame);await host.whenIdle();return {backend:host.surface.Backend,primitives:scene.primitives.length,errors:host.painter.diagnostics.items.filter(d=>d.severity==='error')};}""",file.read_text())
            self.assertEqual('webgpu',result['backend']);self.assertEqual([],result['errors']);results.append({'file':file.name,**result})
        (OUT/'fixtures.json').write_text(json.dumps(results,indent=2))
if __name__=='__main__':unittest.main(verbosity=2)
