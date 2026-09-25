#!/usr/bin/env python3
"""Standalone package consumption through HTTP with real native rendering."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('docking_harness', ROOT / 'tests/docking-workspace.py')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
OUT = ROOT / 'test-results/rendering-view'

class RenderingViewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        h.DockingTests.setUpClass.__func__(cls); OUT.mkdir(parents=True, exist_ok=True)
    @classmethod
    def tearDownClass(cls): h.DockingTests.tearDownClass.__func__(cls)
    def setUp(self):
        h.DockingTests.setUp(self)
        self.page.goto(self.base + 'tests/rendering-view.html', wait_until='domcontentloaded')
        self.page.wait_for_function('!!window.demo')
        self.page.evaluate('() => { window.d=demo;window.a=d.a;window.b=d.b; }')
    def tearDown(self):
        try: self.page.screenshot(path=str(OUT / (self._testMethodName + '.png')))
        finally: self.context.close()
        self.assertEqual([], self.errors)
    assertJS = h.DockingTests.assertJS

    def test_01_independent_native_views_without_application_globals(self):
        self.assertJS('!window.app && !window.DxfRendering && !window.DxfApp && !window.DxfGrid')
        self.assertJS('a.view.activeSurface!==b.view.activeSurface && a.view.resources!==b.view.resources && a.view.host.paintCount>0 && b.view.host.paintCount>0')
        self.assertJS('a.view.host.painter instanceof DxfSkia.SkiaPainter && b.view.host.painter instanceof DxfSkia.SkiaPainter')
        self.assertJS('a.view.canvas.getContext("2d").getImageData(300,170,1,1).data[1]>100 && b.view.canvas.getContext("2d").getImageData(300,170,1,1).data[0]>180')

    def test_02_camera_and_selection_do_not_alias_neighbors(self):
        self.assertJS('''async () => {
            const before=b.view.lastFrame, scene=a.view.compiled;
            a.view.setSelectionHandles(['A']);
            a.view.renderScene(a.drawing.sceneGraph,{viewState:{mode:'manual',scale:5,center:{x:5,y:5,z:0}}});
            await a.view.ready;
            return a.view.compiled===scene && b.view.lastFrame===before && !b.view.selectionHandles.has('A') && a.view.selectionHandles.has('A');
        }''')

    def test_03_paint_callback_error_does_not_break_presentation_or_dom_events(self):
        self.assertJS('''async () => {
            let events=0;a.view.canvas.addEventListener('dxf-skia-painted',()=>events++);
            a.view.onPaint=()=>{throw new Error('observer-failure');};
            a.view.renderScene(a.drawing.sceneGraph);await a.view.ready;
            return events===1 && d.errors.includes('observer-failure') && !a.view.error && !a.view.host.faulted;
        }''')

    def test_04_plain_inspector_is_safe_and_independent(self):
        self.page.evaluate('''() => a.properties.setSections([{title:'Danger',properties:[
            {name:'Text',value:'<img src=x onerror="window.injected=true">'},
            {name:'Legacy',value:'<b>safe</b>',isHtml:true}]}])''')
        self.assertJS('!window.injected && !document.querySelector("#properties-a img") && document.querySelector("#properties-a").textContent.includes("safe") && b.properties.sections[0].title==="Entity"')

    def test_05_foreign_containers_and_duplicate_owners_are_rejected(self):
        self.assertJS('''() => {
            const foreign=document.implementation.createHTMLDocument().body;foreign.textContent='sentinel';let count=0;
            try{new d.Inspector(foreign);}catch(error){if(error instanceof TypeError)count++;}
            try{new d.Inspector(a.properties.container);}catch(error){if(error.message.includes('owned'))count++;}
            return count===2 && foreign.textContent==='sentinel' && a.properties.sections.length===1;
        }''')

    def test_06_host_record_view_updates_and_disposes_through_owner(self):
        self.page.evaluate('''() => {
            const ui=d.createAnalysisUI({window,treeDataGridCore:TreeDataGridCore,treeDataGridWeb:TreeDataGridWeb});
            const Inspector=d.createPropertyInspector({window,createRecordView:(container,options)=>new ui.AnalysisView(container,options)});
            window.record=new Inspector(document.getElementById('record'));
            record.setSections([{title:'Line',properties:[{name:'Length',value:12}]}]);record.setTheme('dark');
        }''')
        self.page.wait_for_function('!!record.gridView && !!document.querySelector("#record tree-data-grid")')
        self.assertJS('''() => {
            const view=record.gridView;record.setSections([{title:'Circle',properties:[{name:'Radius',value:3}]}]);
            const retained=record.gridView===view;record.dispose();record.dispose();
            return retained && record.gridView===null && document.getElementById('record').children.length===0 && !a.properties.disposed;
        }''')

    def test_07_dispose_one_view_preserves_neighbor_and_exports(self):
        self.assertJS('''async () => {
            const end=a.view.dispose();const repeated=a.view.dispose();await end;
            b.view.renderScene(b.drawing.sceneGraph);await b.view.ready;
            const png=await b.view.exportPng(), pdf=await b.view.exportPdf();
            return end===repeated && a.view.disposed && a.view.activeSurface===null && b.view.host.paintCount>1 &&
                new TextDecoder().decode(png.slice(1,4))==='PNG' && new TextDecoder().decode(pdf.slice(0,4))==='%PDF';
        }''')

    def test_08_pending_initialization_cannot_register_after_dispose(self):
        self.assertJS('''async () => {
            let resolve;const View=d.createRenderingServices({renderer:DxfSkia,initialize:()=>new Promise(r=>resolve=r)}).RenderingSurfaceManager;
            const view=new View();let message='';const load=view.registerResource('late.png',new Uint8Array()).catch(error=>message=error.message);
            await Promise.resolve();await Promise.resolve();const end=view.dispose();resolve(await d.initialize());await load;await end;
            return message.includes('disposed') && !view.resources && view.compiled===null && !b.view.disposed;
        }''')

    def test_09_suspension_and_frame_unsubscription(self):
        self.assertJS('''async () => {
            let frames=0;const detach=a.view.subscribeFrame(()=>frames++);a.view.suspend();const count=a.view.host.paintCount;
            a.view.renderScene(a.drawing.sceneGraph);await a.view.ready;detach();
            const suspended=a.view.host.paintCount===count;a.view.resume();await a.view.ready;
            a.view.renderScene(a.drawing.sceneGraph);await a.view.ready;
            return suspended && frames===1 && a.view.host.paintCount>count;
        }''')

    def test_10_property_dispose_releases_container_and_copies_input(self):
        self.assertJS('''() => {
            const sections=[{title:'Input',properties:[{name:'Value',value:'initial'}]}];a.properties.setSections(sections);
            sections[0].properties[0].value='changed';const copied=a.properties.sections[0].properties[0].value==='initial';
            const container=a.properties.container;a.properties.dispose();const next=new d.Inspector(container);next.clear();next.dispose();
            return copied && !container.classList.contains('rendering-property-grid') && !b.properties.disposed;
        }''')

    def test_11_editor_workspace_disposal_releases_renderer_and_pending_resize(self):
        self.context.close(); h.DockingTests.setUp(self)
        h.DockingTests.load(self, 'editor/index.html')
        self.page.evaluate("""() => {
            window.retiredView=DxfEditorApp.getSurfaceManager();
            window.retiredOverlay=DxfEditorApp.getOverlayController();
            window.retiredData=retiredOverlay.dataController;
            const viewport=DxfEditorApp.getViewportElement();
            viewport.style.height='301px';
            requestAnimationFrame(() => DxfEditorApp.dockingWorkspace.dispose());
        }""")
        self.page.wait_for_function('retiredView.disposed && retiredOverlay.disposed')
        self.page.evaluate('''async () => {
            await retiredView.dispose();
            window.dispatchEvent(new Event('resize'));
            await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
        }''')
        self.assertJS('retiredData.disposed && retiredData.documents.size===0 && !DxfEditorApp.getSurfaceManager() && !DxfEditorApp.getOverlayController() && !DxfEditorApp.rerenderActiveDocument()')

if __name__ == '__main__': unittest.main(verbosity=2)
