#!/usr/bin/env python3
"""Real HTTP + native Skia multi-document rendering. No injected app/renderer."""
from __future__ import annotations
import base64
import importlib.util
import json
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('native_harness', ROOT/'tests/skia-workspace.py')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
OUT = ROOT/'test-results/multiple-drawings'

class MultipleDrawingTests(h.SkiaWorkspaceTests):
    def settle(self):
        self.page.wait_for_timeout(120)
        self.page.wait_for_function('!window.app?.drawingViews || [...app.drawingViews.records.values()].every(r => !r.visible || !r.overlay.surfaceManager.host._running)', timeout=20000)
    def tearDown(self):
        OUT.mkdir(parents=True, exist_ok=True)
        try:
            self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')))
            state=self.page.evaluate('() => [...(window.app?.drawingViews?.records.values()||[])].map(r=>({id:r.id,open:r.open,visible:r.visible,selected:app.dockingWorkspace.manager.Find(r.id)?.IsSelected,rect:r.overlay.viewportEl.getBoundingClientRect().toJSON(),error:r.overlay.surfaceManager.error?.message,paintCount:r.overlay.surfaceManager.host.paintCount,suspended:r.overlay.surfaceManager.suspended}))')
            (OUT/(self._testMethodName+'.json')).write_text(json.dumps(state,indent=2))
        finally: self.context.close()
        self.assertEqual([], self.errors, 'Uncaught application errors')
    def two(self):
        self.render()
        self.page.evaluate('() => { window.views=app.drawingViews;window.a=views.active; }')
        text=h.drawing([(0,'LINE'),(5,'AB'),(8,'DRAFT'),(10,100),(20,100),(11,140),(21,130)],tables=h.TABLES)
        self.page.locator('#fileInputLeft').set_input_files({'name':'second.dxf','mimeType':'application/dxf','buffer':text.encode()})
        self.page.wait_for_function('app.tabs.length===2')
        self.page.evaluate('() => { rb.execute("skia-render-all");window.b=views.records.get(app.tabs[1].id); }')
        self.settle()
        self.page.wait_for_function('a.visible && b.visible && a.overlay.surfaceManager.stats && b.overlay.surfaceManager.stats')
    def focus(self, name):
        self.page.evaluate('(name) => { views.activate(window[name]);w.manager.Find(window[name].id).Activate(); }',name)
        self.settle()
    def test_multi_01_two_native_surfaces_and_unique_dom(self):
        self.two()
        self.assertJS('a.overlay.surfaceManager!==b.overlay.surfaceManager && a.overlay.canvas!==b.overlay.canvas && a.overlay.surfaceManager.activeSurface!==b.overlay.surfaceManager.activeSurface')
        self.assertJS('a.overlay.currentDoc.entities.length===2 && b.overlay.currentDoc.entities.length===1')
        self.assertJS('a.overlay.surfaceManager.host.S===b.overlay.surfaceManager.host.S && a.overlay.surfaceManager.resources!==b.overlay.surfaceManager.resources')
        self.assertJS('(()=>{const ids=[...document.querySelectorAll("[id]")].map(e=>e.id);return new Set(ids).size===ids.length})()')
        self.assertGreater(self.page.locator('[data-render-tab-id]').count(),1)
    def test_multi_02_active_ribbon_and_command_route(self):
        self.two(); self.focus('a')
        self.page.evaluate('() => { rb.execute("skia-grid");rb.execute("skia-view","Isometric");rb.execute("measure-distance"); }');self.settle()
        self.assertJS('a.overlay.surfaceManager.gridVisible && !b.overlay.surfaceManager.gridVisible')
        self.assertJS('a.overlay.surfaceManager.viewDirection.x!==0 && b.overlay.surfaceManager.viewDirection.x===0')
        self.assertJS('a.overlay.measurementMode==="distance" && b.overlay.measurementMode==="none"')
        self.command('ZOOM 2');self.command('SELECT AB')
        self.assertJS('a.overlay.surfaceManager.viewState.mode==="custom" && b.overlay.surfaceManager.viewState.mode==="auto"')
        self.assertJS('a.overlay.selectionHandles.has("AB") && !b.overlay.selectionHandles.size && app.getActiveTab().id===a.tab.id')
    def test_multi_03_tools_layers_selection_and_camera_stay_per_source(self):
        self.two();self.focus('a');self.command('ZOOM 2');self.command('PAN 20 10');self.command('SELECT AB')
        self.page.evaluate('() => { window.cameraA=JSON.stringify(a.overlay.surfaceManager.viewState); }')
        self.focus('b');self.command('SELECT AB');self.command('LAYER OFF DRAFT')
        self.assertJS('b.overlay.surfaceManager.compiled.primitives.length===0 && a.overlay.surfaceManager.compiled.primitives.length===2')
        self.focus('a')
        self.assertJS('JSON.stringify(a.overlay.surfaceManager.viewState)===cameraA && a.overlay.selectionHandles.has("AB")')
        self.assertJS('w.require("render-properties").node.contains(a.overlay.propertyPanel) && !b.overlay.propertyPanel.isConnected')
    def test_multi_04_compare_sessions_survive_focus_changes(self):
        self.two();self.focus('a');self.command('COMPARE second.dxf')
        self.page.evaluate('() => { window.sessionA=a.overlay.surfaceManager.comparison; }')
        self.focus('b');self.assertJS('!b.overlay.surfaceManager.comparison && a.overlay.surfaceManager.comparison===sessionA')
        self.command('COMPARE native-test.dxf');self.command('COMPARESHOW1 OFF')
        self.assertJS('b.overlay.surfaceManager.comparison!==sessionA && sessionA.options.showCurrent && !b.overlay.surfaceManager.comparison.options.showCurrent')
        self.focus('a');self.assertJS('app.cadWorkspace.compare===a.cad.compare && a.cad.compare.referenceName==="second.dxf"')
    def test_multi_05_docking_and_layout_round_trip_keep_views(self):
        self.two()
        self.page.evaluate('() => { window.canvasA=a.overlay.canvas;window.canvasB=b.overlay.canvas;w.manager.Float(w.manager.Find(b.id),{FloatingWidth:500,FloatingHeight:380}); }');self.settle()
        self.assertJS('w.manager.Find(b.id).IsFloating && b.visible && a.visible')
        self.page.evaluate('() => { w.manager.Find(b.id).Dock();views.tile("vertical");window.layout=w.exportLayout();w.applyPreset("Focus");w.importLayout(layout); }');self.settle()
        self.assertJS('a.overlay.canvas===canvasA && b.overlay.canvas===canvasB && a.visible && b.visible')
    def test_multi_06_hidden_views_suspend_without_losing_state(self):
        self.two();self.focus('a');self.command('ZOOM 2');self.command('COMPARE second.dxf')
        self.page.evaluate('() => { window.resourceA=a.overlay.surfaceManager.resources;window.sessionA=a.overlay.surfaceManager.comparison;w.hide(a.id); }');self.settle()
        self.assertJS('a.overlay.surfaceManager.suspended && b.visible')
        self.page.evaluate('() => { window.paintA=a.overlay.surfaceManager.host.paintCount;a.cad.repaint(); }');self.settle()
        self.assertJS('a.overlay.surfaceManager.host.paintCount===paintA')
        self.page.evaluate('() => { views.openById(a.tab.id);views.tile("horizontal"); }');self.settle()
        self.assertJS('a.visible && a.overlay.surfaceManager.resources===resourceA && a.overlay.surfaceManager.comparison===sessionA && a.overlay.surfaceManager.viewState.mode==="custom"')
    def test_multi_07_source_close_disposes_only_its_surface(self):
        self.two()
        self.page.evaluate('() => { window.hostB=b.overlay.surfaceManager.host;window.hostA=a.overlay.surfaceManager.host;dw.remove(dw.findByTab(b.tab.id)); }');self.settle()
        self.page.wait_for_function('hostB.disposed && !hostB.surface && !hostB.resources')
        self.assertJS('!hostA.disposed && views.records.size===1 && app.tabs.length===1')
    def test_multi_08_primary_source_close_and_reopen_is_safe(self):
        self.two();self.focus('a')
        self.page.evaluate('() => { window.hostA=a.overlay.surfaceManager.host;dw.remove(dw.findByTab(a.tab.id)); }');self.settle()
        self.assertJS('hostA.disposed && views.active===b && !b.overlay.surfaceManager.host.disposed')
        self.page.locator('#fileInputLeft').set_input_files({'name':'third.dxf','mimeType':'application/dxf','buffer':h.drawing(h.CIRCLE).encode()})
        self.page.evaluate('() => { views.renderAll(); }');self.settle()
        self.assertJS('views.records.size===2 && [...views.records.values()].every(r=>r.visible && !r.overlay.surfaceManager.host.disposed)')
    def test_multi_09_refresh_preserves_layout_and_other_document(self):
        self.two();self.focus('a')
        paper=[(0,'LINE'),(5,'BB'),(67,1),(410,'Sheet A'),(10,0),(20,0),(11,50),(21,20)]
        text=h.drawing(h.LINE+paper,tables=h.TABLES)
        self.page.evaluate('(text) => { app.renderingDataController.ingestDocument({tabId:a.tab.id,fileName:a.tab.name,sourceText:text}); }',text)
        self.command('LAYOUT "Sheet A"');self.command('ZOOM 2')
        self.page.evaluate('(text) => { window.graphB=b.overlay.currentDoc;window.cameraA=JSON.stringify(a.overlay.surfaceManager.viewState);app.renderingDataController.ingestDocument({tabId:a.tab.id,fileName:a.tab.name,sourceText:text}); }',text.replace('11\n50','11\n60'))
        self.settle()
        self.assertJS('a.overlay.surfaceManager.layout==="Sheet A" && JSON.stringify(a.overlay.surfaceManager.viewState)===cameraA && b.overlay.currentDoc===graphB')
    def test_multi_10_async_resource_load_is_pinned_to_original_view(self):
        self.two();self.focus('a');self.page.evaluate('() => { w.show("render-resources"); }');self.settle()
        self.page.evaluate('() => { const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){return new Promise(resolve=>setTimeout(()=>original.call(this).then(resolve),250));}; }')
        png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=')
        self.page.locator('.dxf-cad-tool input[type=file]').set_input_files({'name':'pixel.png','mimeType':'image/png','buffer':png})
        self.focus('b');self.page.wait_for_function('a.overlay.surfaceManager.resources.entries.size===1')
        self.assertJS('b.overlay.surfaceManager.resources.entries.size===0')
    def test_multi_11_exports_remain_bound_during_focus_change(self):
        self.two();self.focus('a')
        with self.page.expect_download() as download:
            self.page.evaluate('() => { app.cadWorkspace.export("png");views.activate(b); }')
        self.assertEqual(download.value.suggested_filename,'native-test.png')
        self.assertTrue(Path(download.value.path()).read_bytes().startswith(b'\x89PNG'))
        result=self.page.evaluate('async()=>({a:Array.from((await a.overlay.surfaceManager.exportPdf()).slice(0,5)),b:Array.from((await b.overlay.surfaceManager.exportPdf()).slice(0,5))})')
        self.assertEqual(result,{'a':[37,80,68,70,45],'b':[37,80,68,70,45]})
    def test_multi_12_snapshot_opens_new_view_without_replacing_sources(self):
        self.two();self.focus('a');self.command('COMPARE second.dxf')
        self.page.evaluate('() => { window.sessionA=a.overlay.surfaceManager.comparison;window.docA=a.overlay.currentDoc;const compare=a.cad.compare;compare.restoreSnapshot(DxfCompare.snapshot(compare.currentText(),compare.referenceText,compare.settings)); }');self.settle()
        self.assertJS('views.records.size===3 && app.tabs.length===3 && a.overlay.currentDoc===docA && a.overlay.surfaceManager.comparison===sessionA && views.active!==a && views.active!==b')
    def test_multi_13_reload_restores_drawings_and_cameras(self):
        self.two();self.focus('a');self.command('ZOOM 2')
        self.page.evaluate('() => { views.tile("horizontal");app.saveCurrentState();w.save(); }');self.settle()
        self.page.reload(wait_until='domcontentloaded');self.page.wait_for_function('app.drawingViews.records.size===2');self.settle()
        self.assertJS('[...app.drawingViews.records.values()].every(r=>r.open && r.visible)')
        self.assertJS('[...app.drawingViews.records.values()].some(r=>r.overlay.surfaceManager.viewState.mode==="custom")')
    def test_multi_14_keyboard_and_operand_assignment_do_not_leak(self):
        self.two();self.focus('a');self.page.evaluate('() => { a.node.focus(); }');self.page.keyboard.press('m');self.settle()
        self.assertJS('a.overlay.measurementMode!=="none" && b.overlay.measurementMode==="none"')
        self.page.evaluate('() => { window.managerA=a.overlay.surfaceManager;dw.assignSide(dw.findByTab(a.tab.id),"right"); }');self.settle()
        self.assertJS('a.overlay.surfaceManager===managerA && a.pane==="right" && b.pane==="left"')
    def test_multi_15_view_budget_fails_before_render_all_changes(self):
        self.two();self.focus('a');self.page.evaluate('() => { views.maxViews=1; }');self.command('RENDERALL')
        self.assertJS('views.records.size===2 && a.cad.log.textContent.includes("at most 1")')
    def test_multi_16_close_last_source_keeps_empty_workbench_usable(self):
        self.render()
        self.page.evaluate('() => { dw.remove(dw.active); }');self.settle()
        self.assertJS('app.drawingViews.records.size===0 && !app.cadWorkspace.active()')
        self.page.locator('#fileInputLeft').set_input_files({'name':'again.dxf','mimeType':'application/dxf','buffer':h.drawing(h.LINE).encode()})
        self.page.evaluate('() => { app.openRenderingOverlay("left"); }');self.settle()
        self.page.wait_for_function('app.cadWorkspace.manager.host.paintCount>0')
        self.assertJS('app.drawingViews.records.size===1 && app.cadWorkspace.active()')

    def test_multi_17_layout_restore_reopens_closed_view(self):
        self.two()
        self.page.evaluate('() => { window.saved=w.exportLayout();w.hide(a.id); }');self.settle()
        self.assertJS('!a.open && a.overlay.surfaceManager.suspended')
        self.page.evaluate('() => { w.importLayout(saved); }');self.settle()
        self.assertJS('a.open && a.visible && !a.overlay.surfaceManager.suspended && b.visible')
    def test_multi_18_primary_report_roots_are_released_with_source(self):
        self.two()
        self.page.evaluate('() => { window.oldRoot=a.overlay.infoTabPanel;dw.remove(dw.findByTab(a.tab.id)); }');self.settle()
        self.assertJS('!app.tabularReports.roots.includes(oldRoot) && [...app.tabularReports.projections].every(p=>!oldRoot.contains(p.source)) && b.visible')
    def test_multi_19_snapshot_budget_is_atomic(self):
        self.two();self.focus('a');self.command('COMPARE second.dxf')
        self.page.evaluate('() => { views.maxViews=2;window.sourceA=a.overlay.currentDoc;window.budgetError="";try{a.cad.compare.restoreSnapshot(DxfCompare.snapshot(a.cad.compare.currentText(),a.cad.compare.referenceText,a.cad.compare.settings));}catch(e){budgetError=e.message;} }');self.settle()
        self.assertJS('budgetError.includes("Close a source") && app.tabs.length===2 && views.records.size===2 && a.overlay.currentDoc===sourceA')

if __name__ == '__main__':
    suite=unittest.TestSuite(MultipleDrawingTests(name) for name in sorted(n for n in dir(MultipleDrawingTests) if n.startswith('test_multi_')))
    result=unittest.TextTestRunner(verbosity=2, failfast=True).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
