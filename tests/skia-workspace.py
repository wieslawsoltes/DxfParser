#!/usr/bin/env python3
"""Native SkiaSharpWeb/WASM, CAD tools and renderer lifetime over real HTTP.

These tests intentionally await native FlushAsync; screenshots are evidence of the
presented surface. No canvas context, geometry compiler or Skia runtime is mocked.
"""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('docking_harness', ROOT/'tests/docking-workspace.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
OUT=ROOT/'test-results/skia-browser'

def drawing(entities, *, objects=(), tables=()):
    pairs=[]
    for name,tags in [('TABLES',tables),('ENTITIES',entities),('OBJECTS',objects)]:
        pairs.extend([(0,'SECTION'),(2,name),*tags,(0,'ENDSEC')])
    pairs.append((0,'EOF'))
    return ''.join(f'{code}\n{value}\n' for code,value in pairs)

LINE=[(0,'LINE'),(5,'AB'),(8,'DRAFT'),(10,0),(20,0),(11,20),(21,10)]
CIRCLE=[(0,'CIRCLE'),(5,'AC'),(8,'DRAFT'),(10,10),(20,10),(40,3)]
TABLES=[(0,'LAYER'),(2,'DRAFT'),(62,2)]

class SkiaWorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if h.INJECTED: raise RuntimeError('Native rendering must use normal HTTP loading.')
        h.DockingTests.setUpClass.__func__(cls);OUT.mkdir(parents=True,exist_ok=True)
        (OUT/'environment.json').write_text(json.dumps({'browser':cls.browser.version,'injected':False,'graphics':'real native SkiaSharpWeb WASM','gpuQualification':'software environment, not physical-device certification'},indent=2))
    @classmethod
    def tearDownClass(cls):h.DockingTests.tearDownClass.__func__(cls)
    load=h.DockingTests.load
    settle=h.DockingTests.settle
    assertJS=h.DockingTests.assertJS
    colors=h.DockingTests.colors
    def setUp(self):
        h.DockingTests.setUp(self);self.context.set_default_timeout(15000);self.load()
    def tearDown(self):
        try:self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')))
        finally:self.context.close()
        self.assertEqual([],self.errors,'Uncaught application errors')
    def render(self, text=None):
        text=text or drawing(LINE+CIRCLE,tables=TABLES)
        self.page.locator('#fileInputLeft').set_input_files({'name':'native-test.dxf','mimeType':'application/dxf','buffer':text.encode()})
        self.page.wait_for_function('app.tabs.length===1')
        self.page.evaluate("app.dockingWorkspace.applyPreset('CAD');window.o=app.renderingOverlayController;window.m=o.surfaceManager;window.cad=app.cadWorkspace")
        self.settle();self.page.wait_for_function('m.host.paintCount>0 && !!m.stats');self.settle()
        self.assertJS('!m.error && m.lastFrame.scene===m.compiled')
    def command(self, value):
        self.page.locator('#parserCadCommand').fill(value);self.page.locator('#parserCadCommand').press('Enter');self.settle()
    def test_01_real_native_backend_and_no_old_renderer(self):
        self.render();self.assertJS("!!DxfSkia.SkiaPainter && m.host.painter instanceof DxfSkia.SkiaPainter && !!m.activeSurface && !DxfRendering.RenderEntityFactories && !DxfRendering.CanvasSurface && !DxfRendering.WebGLSurface")
        self.assertJS("m.canvas.dataset.renderer==='DxfSkia' && ['canvas','webgl','webgpu'].includes(m.canvas.dataset.skiaBackend)")
        self.assertGreater(self.colors(),4)
        self.assertJS("performance.getEntriesByType('resource').some(r=>r.name.endsWith('.wasm'))")
    def test_02_cad_preset_allocates_real_document_tools_and_console(self):
        self.render();self.assertJS("['rendering','render-console','render-layers','render-diagnostics','render-resources'].every(id=>w.isOpen(id))")
        self.assertJS("cad.console.clientHeight>80 && cad.console.clientWidth>500 && o.viewportEl.clientWidth>300 && o.viewportEl.clientHeight>250")
        self.page.locator('ribbon-web').get_by_role('tab',name='CAD View',exact=True).click();self.settle()
        self.assertTrue(self.page.locator('ribbon-web').get_by_role('button',name='Export PNG',exact=True).is_enabled())
    def test_03_command_pan_zoom_and_history_change_native_camera(self):
        self.render();self.page.evaluate('window.initial=m.lastFrame.scale')
        self.command('ZOOM 2');self.assertJS('Math.abs(m.lastFrame.scale/initial-2)<.0001')
        self.page.evaluate('window.before={...m.lastFrame.worldCenter}');self.command('PAN 30 15');self.assertJS('m.lastFrame.worldCenter.x!==before.x || m.lastFrame.worldCenter.y!==before.y')
        self.page.locator('#parserCadCommand').press('ArrowUp');self.assertEqual('PAN 30 15',self.page.locator('#parserCadCommand').input_value())
        self.command('ZOOM EXTENTS');self.assertJS("m.lastFrame.viewState.mode==='auto' || m.viewState.mode==='auto'")
    def test_04_ribbon_views_use_real_three_dimensional_projection(self):
        self.render(drawing(LINE+[(0,'LINE'),(5,'Z1'),(10,0),(20,0),(30,0),(11,0),(21,0),(31,10)]))
        self.command('VIEW ISOMETRIC');self.assertJS('Math.abs(m.lastFrame.basis.z.x)>.5 && Math.abs(m.lastFrame.basis.z.y)>.5 && Math.abs(m.lastFrame.basis.z.z)>.5')
        self.assertJS("(()=>{const a=m.lastFrame.worldToScreen({x:0,y:0,z:0}),b=m.lastFrame.worldToScreen({x:0,y:0,z:10});return Math.hypot(a.x-b.x,a.y-b.y)>10})()")
        self.command('VIEW TOP');self.assertJS('m.lastFrame.basis.z.z===1')
    def test_05_model_and_paper_tabs_compile_distinct_spaces(self):
        paper=[(0,'LINE'),(5,'B1'),(67,1),(410,'Sheet A'),(10,0),(20,0),(11,100),(21,50)]
        self.render(drawing(LINE+paper))
        self.assertJS("m.compiled.primitives.some(p=>p.handle==='AB') && !m.compiled.primitives.some(p=>p.handle==='B1')")
        self.page.locator('.dxf-cad-layouts').get_by_role('tab',name='Sheet A',exact=True).click();self.settle()
        self.assertJS("m.compiled.primitives.length===1 && m.compiled.primitives[0].handle==='B1' && m.layout==='Sheet A'")
        self.command('MODEL');self.assertJS("m.layout==='Model' && m.compiled.primitives[0].handle==='AB'")
    def test_06_native_selection_and_snap_are_geometry_aware(self):
        self.render()
        point=self.page.evaluate("()=>{const p=m.lastFrame.worldToScreen({x:0,y:0,z:0}),r=m.canvas.getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y}}")
        self.page.mouse.click(point['x'],point['y']);self.settle()
        self.assertJS("m.selectionHandles.has('AB')")
        self.assertJS("(()=>{const p=m.lastFrame.worldToScreen({x:0,y:0,z:0}),snap=DxfSkia.snap(m.lastFrame,p,8);return snap && snap.type==='endpoint'})()")
    def test_07_grid_and_snap_commands_are_real_toggles(self):
        self.render();self.command('GRID ON');self.assertJS('m.gridVisible && m.host.paintOptions.grid')
        self.command('OSNAP OFF');self.assertJS('m.snapEnabled===false')
        self.command('GRID OFF');self.assertJS('!m.gridVisible');self.command('OSNAP ON');self.assertJS('m.snapEnabled')
    def test_08_case_insensitive_layer_and_isolation_commands(self):
        self.render();self.command('ISOLATE AB');self.assertJS("m.compiled.primitives.every(p=>p.handle==='AB')")
        self.command('UNISOLATE');self.assertJS('m.compiled.primitives.length===2')
        self.command('LAYER OFF draft');self.assertJS('m.compiled.primitives.length===0')
        self.command('LAYER ON DRAFT');self.assertJS('m.compiled.primitives.length===2')
    def test_09_unsupported_geometry_appears_in_real_diagnostics_grid(self):
        self.render(drawing(LINE+[(0,'3DSOLID'),(5,'AD'),(1,'opaque payload')]))
        self.assertJS("m.diagnostics.some(d=>d.handle==='AD') && cad.issueView.grid.Model instanceof TreeDataGridCore.HierarchicalTreeDataGridSource")
        self.page.evaluate("w.show('render-diagnostics')");self.settle()
        self.assertIn('3DSOLID',self.page.evaluate("JSON.stringify(cad.issueView.rows)"))
    def test_10_local_resource_upload_atomic_failure_and_unload(self):
        self.render()
        image=ROOT/'test-results/skia-native/image.png'
        self.assertTrue(image.exists(),'Run node --test tests/skia-native.test.mjs first')
        self.page.evaluate("w.show('render-resources')");self.settle()
        self.page.locator('.dxf-cad-tool input[type=file]').set_input_files(str(image));self.page.wait_for_function("m.resources?.entries.size===1");self.settle()
        self.assertJS("cad.resourceView.rows.length===1 && m.resources.get('IMAGE.png').kind==='image'")
        self.page.locator('.dxf-cad-tool input[type=file]').set_input_files({'name':'image.png','mimeType':'image/png','buffer':b'not an image'})
        self.page.wait_for_function("cad.log.textContent.includes('rejected')");self.assertJS('m.resources.entries.size===1')
        self.page.evaluate("cad.resourceView.rows[0].actions[0].run()");self.settle();self.assertJS('m.resources.entries.size===0 && cad.resourceView.rows.length===0')
    def test_11_real_png_and_pdf_downloads(self):
        self.render()
        for kind,signature in [('png',b'\x89PNG'),('pdf',b'%PDF-')]:
            with self.page.expect_download() as pending:self.page.evaluate('(kind)=>cad.export(kind)',kind)
            download=pending.value;destination=OUT/('browser-export.'+kind);download.save_as(destination)
            self.assertTrue(destination.read_bytes().startswith(signature));self.assertGreater(destination.stat().st_size,100)
    def test_12_resize_reuses_canvas_after_native_backend_negotiation(self):
        self.render();self.page.evaluate('() => {window.canvas=m.canvas;window.resource=m.resources;}')
        self.page.set_viewport_size({'width':1280,'height':850});self.settle()
        self.assertJS('m.canvas===canvas && m.resources===resource && m.activeSurface.Width===m.canvas.width')
        self.assertGreater(self.colors(),4)
    def test_13_hidden_rendering_suspends_and_reopens_without_resource_loss(self):
        self.render();self.page.evaluate("window.resource=m.resources;w.hide('rendering')");self.settle()
        self.assertJS('m.suspended')
        self.page.evaluate("w.requestOpen('rendering')");self.settle()
        self.assertJS('!m.suspended && m.resources===resource');self.assertGreater(self.colors(),4)
    def test_14_disposal_during_initialization_releases_native_state(self):
        self.page.evaluate("""async()=>{const canvas=document.createElement('canvas');document.body.append(canvas);const host=new DxfSkia.SurfaceHost({initialize:DxfRendering.initializeSkia});host.initialize(canvas);const doc=new DxfSkia.DxfDocument('0\\nSECTION\\n2\\nENTITIES\\n0\\nLINE\\n10\\n0\\n20\\n0\\n11\\n10\\n21\\n10\\n0\\nENDSEC\\n0\\nEOF\\n');host.request(DxfSkia.prepareFrame(new DxfSkia.SceneCompiler(doc).compile()));await host.dispose();await host.dispose();window.disposedHost=host;canvas.remove();}""")
        self.assertJS('disposedHost.disposed && !disposedHost.surface && !disposedHost.painter && !disposedHost.pending')
    def test_15_latest_frame_wins_and_surface_budget_recovers(self):
        self.render();self.page.evaluate("""async()=>{m.host.maxPixels=4;m.resize(800,600);try{await m.ready}catch(e){window.budgetError=e.message}m.host.maxPixels=32000000;for(let i=0;i<20;i++)m.resize(500+i,400+i);await m.ready;}""")
        self.assertJS("budgetError.includes('budget') && m.lastFrame.width===519 && m.canvas.width===519 && !m.error")
        self.page.evaluate('o.resizeCanvas()');self.settle()
    def test_16_unsafe_command_text_is_not_executed(self):
        self.render();self.command('window.rendererInjection = 1');self.assertJS('!window.rendererInjection')
        self.assertIn('Unknown command',self.page.locator('.dxf-cad-log').inner_text())
        self.command('PAN NaN 0');self.assertIn('finite',self.page.locator('.dxf-cad-log').inner_text())

    def test_17_graphics_backend_selection_keeps_drawing_camera_selection_and_resources(self):
        self.render();self.command('ZOOM 2');self.command('SELECT AB')
        self.page.evaluate('window.before={scene:m.compiled,resources:m.resources,scale:m.lastFrame.scale};w.show("render-diagnostics")');self.settle()
        self.page.get_by_label('Graphics backend',exact=True).select_option('canvas')
        self.page.wait_for_function('!cad.graphicsChanging && m.host.backend==="canvas"');self.settle()
        self.assertJS('m.activeSurface.Backend==="canvas" && m.compiled===before.scene && m.resources===before.resources && m.lastFrame.scale===before.scale && m.selectionHandles.has("AB")')
        self.assertIn('canvas',self.page.locator('.dxf-cad-graphics-controls + .dxf-cad-note').inner_text())
    def test_18_retry_graphics_recreates_surface_without_replacing_document(self):
        self.render();self.command('RENDERER canvas')
        self.page.evaluate('window.old=m.activeSurface;window.documentBefore=m.sceneGraph;w.show("render-diagnostics")');self.settle()
        self.page.get_by_role('button',name='Retry graphics',exact=True).click();self.page.wait_for_function('!cad.graphicsChanging && m.activeSurface!==old');self.settle()
        self.assertJS('old.IsDisposed && m.sceneGraph===documentBefore && !m.host.error && !m.host.faulted')
    def test_19_renderer_command_rejects_unknown_backend_without_losing_the_surface(self):
        self.render();self.page.evaluate('window.old=m.activeSurface')
        self.command('RENDERER unknown');self.assertIn('Unknown rendering backend',self.page.locator('.dxf-cad-log').inner_text())
        self.assertJS('m.activeSurface===old && !old.IsDisposed && !cad.graphicsChanging')

if __name__=='__main__' :unittest.main(verbosity=2)
