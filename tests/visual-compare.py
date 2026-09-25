#!/usr/bin/env python3
"""Real HTTP/Skia WASM comparison, native export and atomic import regression tests."""
import importlib.util
import json
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('skia_harness', ROOT / 'tests/skia-workspace.py')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)

class VisualCompareTests(h.SkiaWorkspaceTests):
    # Side-effect evaluations must not return the app/native WASM object graph.
    # Only explicit scalar assertions and bounded export headers cross the driver pipe.
    # Reuse setup/render helpers, not the inherited baseline tests.
    def settle(self):
        self.page.wait_for_timeout(100)
        self.page.evaluate("""async () => {
          const app=window.app || window.DxfEditorApp, manager=app?.renderingOverlayController?.surfaceManager || app?.getSurfaceManager?.();
          if (!manager?.lastFrame || manager.suspended) return;
          let timer;
          try { await Promise.race([manager.ready, new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Native comparison did not become idle: '+JSON.stringify({paintCount:manager.host.paintCount,requestId:manager.host.requestId,revision:manager.compileRevision,error:manager.host.error?.message,callbackError:manager.host.callbackError?.message}))),15000))]); }
          finally { clearTimeout(timer); }
        }""")
    def reference(self, entities=None):
        source = h.drawing(entities if entities is not None else h.CIRCLE + [(0,'LINE'),(5,'AB'),(8,'DRAFT'),(10,30),(20,0),(11,50),(21,10)], tables=h.TABLES)
        self.page.evaluate("() => { cad.compare.open();window.compare=cad.compare; }")
        self.page.locator('.dxf-compare-panel input[type=file][accept=".dxf"]').set_input_files({'name':'revision.dxf','mimeType':'application/dxf','buffer':source.encode()})
        self.page.wait_for_function('!!m.comparison?.result');self.settle()
        return source
    def test_compare_01_native_categories_and_grid(self):
        self.render();self.reference()
        self.assertJS("m.lastFrame.scene!==m.compiled && m.lastFrame.scene.comparison===m.comparison.result")
        self.assertJS("m.comparison.result.counts.common===1 && m.comparison.result.counts.modified===1")
        self.assertJS("compare.view.grid.Model instanceof TreeDataGridCore.HierarchicalTreeDataGridSource")
        self.assertIn('1 current only',self.page.locator('.dxf-compare-summary').inner_text())
        self.assertJS("m.lastFrame.scene.primitives.some(p=>p.comparisonDecoration) && m.host.painter instanceof DxfSkia.SkiaPainter")
    def test_compare_02_visibility_toggle_and_camera_cache(self):
        self.render();self.reference();self.page.evaluate('() => { window.composed=m.lastFrame.scene;window.result=m.comparison.result; }')
        self.command('ZOOM 2');self.command('PAN 20 10');self.assertJS('m.lastFrame.scene===composed && m.comparison.result===result')
        self.page.evaluate('() => { compare.open(); }');self.settle()
        self.page.locator('.dxf-compare-settings > summary').click();self.settle()
        self.page.locator('[data-compare=showReference]').uncheck();self.settle()
        self.assertJS("!m.lastFrame.scene.primitives.some(p=>p.comparisonSide==='reference')")
        self.command('COMPARETOGGLE');self.assertJS('m.lastFrame.scene===m.compiled')
        self.command('COMPARETOGGLE');self.assertJS('m.lastFrame.scene!==m.compiled')
        self.command('COMPARECLOSE');self.assertJS('!m.comparison && m.lastFrame.scene===m.compiled')
    def test_compare_03_change_navigation_and_property_mask(self):
        self.render();self.reference();self.command('COMPARENEXT')
        self.assertJS("compare.selectedIndex===0 && m.lastFrame.viewState.mode==='custom'")
        self.command('COMPAREPROPS 0');self.assertJS('m.comparison.options.properties===0')
        self.command('COMPARETOLERANCE 12');self.assertJS('m.comparison.options.precision===12')
        self.command('COMPARETOLERANCE 99');self.assertJS('m.comparison.options.precision===12')
    def test_compare_04_native_exports_and_lossless_snapshot(self):
        self.render();ref=self.reference()
        data=self.page.evaluate("async()=>({pdf:Array.from((await m.exportPdf()).slice(0,5)),png:Array.from((await m.exportPng()).slice(0,8)),scene:m.host.lastFrame.scene.comparison!==undefined})")
        self.assertEqual(data['pdf'],[37,80,68,70,45]);self.assertEqual(data['png'],[137,80,78,71,13,10,26,10]);self.assertTrue(data['scene'])
        with self.page.expect_download() as download:self.page.locator('.dxf-compare-panel').get_by_role('button',name='Save snapshot',exact=True).click()
        value=json.loads(Path(download.value.path()).read_text())
        self.assertEqual(value['referenceText'],ref);self.assertEqual(value['format'],'dxf-render-compare');self.assertIn('currentText',value)
        self.page.evaluate('(value)=>{ window.snapshotValue=value; }',value)
        self.page.evaluate('() => { compare.restoreSnapshot(JSON.stringify(snapshotValue));window.o=app.renderingOverlayController;window.m=o.surfaceManager;window.compare=app.cadWorkspace.compare; }');self.settle()
        self.assertJS('m.comparison.result.counts.modified===1 && app.tabs.length===2')
    def test_compare_05_import_undo_redo_and_tree_source_consistency(self):
        self.render();self.reference();self.command('COMPARENEXT')
        self.page.evaluate('window.sourceBefore=compare.currentText();window.countBefore=m.sceneGraph.document.entities.length')
        self.page.locator('.dxf-compare-panel').get_by_role('button',name='Import selected change',exact=True).click();self.settle()
        self.assertJS('compare.undoStack.length===1 && m.sceneGraph.document.entities.length===countBefore+1')
        self.assertJS("app.dxfParser.serializeTree(compare.currentTab().originalTreeData)===app.dxfParser.serializeTree(app.dxfParser.parse(compare.currentText()))")
        self.command('COMPAREUNDO');self.assertJS('compare.currentText()===sourceBefore && m.sceneGraph.document.entities.length===countBefore')
        self.command('COMPAREREDO');self.assertJS('m.sceneGraph.document.entities.length===countBefore+1')
    def test_compare_06_unsupported_dependency_import_is_atomic(self):
        self.render();self.reference(h.CIRCLE+[(0,'LINE'),(5,'FF'),(10,50),(20,0),(11,70),(21,0),(102,'{ACAD_XDICTIONARY'),(360,'BEEF'),(102,'}')]);self.page.evaluate('() => { compare.view.selectKey(m.comparison.result.changes.find(c=>c.reference).id); }');self.settle()
        self.page.evaluate('window.before=compare.currentText()')
        self.page.locator('.dxf-compare-panel').get_by_role('button',name='Import selected change',exact=True).click();self.settle()
        self.assertJS('compare.currentText()===before && compare.undoStack.length===0')
        self.assertIn('dictionaries',self.page.locator('.dxf-compare-message').inner_text())
    def test_compare_07_document_switch_preserves_source_owned_comparison(self):
        self.render();self.reference()
        self.page.locator('#fileInputLeft').set_input_files({'name':'different.dxf','mimeType':'application/dxf','buffer':h.drawing(h.LINE).encode()})
        self.page.wait_for_function('app.tabs.length===2');self.page.evaluate("o.open({pane:'left',tab:app.tabs[1]})");self.settle()
        self.assertJS('!!m.comparison && !app.cadWorkspace.manager.comparison && app.cadWorkspace.manager!==m')
    def test_compare_08_reference_and_cloud_are_not_current_pick_targets(self):
        self.render();self.reference()
        self.assertJS("(()=>{const p=m.lastFrame.worldToScreen({x:40,y:5,z:0});return !DxfSkia.hitTest(m.lastFrame,p,3)})()")
    def test_compare_09_stale_async_file_load_cannot_reopen_ended_session(self):
        self.render();self.reference()
        self.page.evaluate("window.pending=compare.loadFile({name:'slow.dxf',size:20,arrayBuffer:()=>new Promise(resolve=>window.completeRead=resolve)});compare.end();completeRead(new TextEncoder().encode('0\\nSECTION\\n2\\nENTITIES\\n0\\nENDSEC\\n0\\nEOF\\n').buffer)")
        self.page.evaluate('async()=>await pending');self.settle();self.assertJS('!m.comparison')

    def test_compare_10_row_selection_after_reference_refresh_uses_new_result(self):
        self.render();self.reference()
        ref=h.drawing(h.CIRCLE + [(0,'LINE'),(5,'D1'),(10,40),(20,0),(11,45),(21,5),(0,'LINE'),(5,'D2'),(10,80),(20,0),(11,90),(21,5)],tables=h.TABLES)
        self.page.evaluate('(text)=>{ compare.start(text,"new-reference.dxf"); }',ref);self.settle()
        self.page.evaluate('compare.view.selectKey(m.comparison.result.changes[2].id)');self.settle()
        self.assertJS('compare.selectedIndex===2 && !compare.importButton.disabled')
    def test_compare_11_tree_edits_are_not_overwritten_by_import(self):
        self.render();self.reference();self.command('COMPARENEXT')
        self.page.evaluate("window.before=compare.currentText();compare.currentTab().originalTreeData=app.dxfParser.parse(before.replace('11\\n20','11\\n200'));window.edited=compare.sourceFor(compare.currentTab())")
        self.page.locator('.dxf-compare-panel').get_by_role('button',name='Import selected change',exact=True).click();self.settle()
        self.assertJS('compare.currentText()===before && compare.sourceFor(compare.currentTab())===edited && compare.undoStack.length===0')
        self.assertIn('source tree changed',self.page.locator('.dxf-compare-message').inner_text())
    def test_compare_12_binary_reference_uses_decoded_native_source(self):
        self.render();self.page.evaluate('() => { cad.compare.open();window.compare=cad.compare; }')
        self.page.locator('.dxf-compare-panel input[type=file][accept=".dxf"]').set_input_files({'name':'binary-reference.dxf','mimeType':'application/dxf','buffer':h.binary_drawing()})
        self.page.wait_for_function('!!m.comparison?.result');self.settle()
        self.assertJS('m.comparison.result.counts.modified===1 && typeof compare.referenceText==="string" && m.comparison.reference.entities.length===2')
        # Binary fixture omits the current drawing's yellow DRAFT layer definition.
        # Its LINE is geometrically unchanged but visibly changed until properties are ignored.
        self.command('COMPAREPROPS 0');self.assertJS('m.comparison.result.counts.common===1')

    def test_compare_13_stale_snapshot_read_cannot_restore_after_end(self):
        self.render();self.reference()
        snapshot=self.page.evaluate('DxfCompare.snapshot(compare.currentText(),compare.referenceText,compare.settings)')
        self.page.evaluate("""() => {
            const original=File.prototype.text;
            File.prototype.text=function(){ return new Promise((resolve,reject)=>setTimeout(()=>original.call(this).then(resolve,reject),200)); };
            window.sourceBeforeSnapshot=compare.currentText();
        }""")
        self.page.locator('.dxf-compare-panel input[type=file][accept=".json"]').set_input_files({'name':'delayed.snapshot.json','mimeType':'application/json','buffer':snapshot.encode()})
        self.page.evaluate('compare.end()');self.page.wait_for_timeout(300);self.settle()
        self.assertJS('m.comparison===null && app.tabs.length===1 && compare.currentText()===sourceBeforeSnapshot')

    def grouped_reference(self):
        def line(handle,x): return [(0,'LINE'),(5,handle),(8,'DRAFT'),(10,x),(20,0),(11,x+1),(21,1)]
        self.render(h.drawing(h.CIRCLE,tables=h.TABLES))
        self.reference(h.CIRCLE + line('D1',0) + line('D2',2.5) + line('D3',50))
    def test_compare_14_proximity_navigation_retains_individual_object_inspection(self):
        self.grouped_reference()
        self.assertJS('m.comparison.result.counts.changes===3 && m.comparison.result.changeSets.length===2')
        self.assertIn('3 changed objects · 2 change sets',self.page.locator('.dxf-compare-summary').inner_text())
        self.command('COMPAREPREV');self.assertJS('compare.selectedIndex===2')
        self.command('COMPARENEXT');self.assertJS('compare.selectedIndex===0')
        self.command('COMPARENEXT');self.assertJS('compare.selectedIndex===2')
        self.page.evaluate('() => { compare.view.selectKey(m.comparison.result.changes[1].id); }');self.settle()
        self.assertJS('compare.selectedIndex===1 && !compare.importButton.disabled')
        self.command('COMPARENEXT');self.assertJS('compare.selectedIndex===2')
        self.command('COMPARERCMARGIN 0');self.assertJS('m.comparison.result.changeSets.length===3')
        self.command('COMPAREGROUP combined');self.assertJS('m.comparison.result.changeSets.length===1')
    def test_compare_15_native_cloud_shape_and_grouping_controls_reuse_matching(self):
        self.grouped_reference()
        self.page.evaluate('() => { window.originalChanges=m.comparison.result.changes;window.originalSets=m.comparison.result.changeSets; }')
        self.page.locator('.dxf-compare-settings > summary').click();self.settle()
        self.page.get_by_label('Cloud shape',exact=True).select_option('polygonal');self.settle()
        self.assertJS('m.comparison.result.changes===originalChanges && m.comparison.result.changeSets===originalSets && m.comparison.options.cloudShape==="polygonal"')
        self.assertJS('m.lastFrame.scene.primitives.filter(p=>p.comparisonDecoration).length===2 && !m.comparisonError')
        self.page.get_by_label('Cloud grouping',exact=True).select_option('local');self.settle()
        self.assertJS('m.comparison.result.changes===originalChanges && m.comparison.result.changeSets.length===3')
        self.page.evaluate('() => { compare.end(); }');self.settle()
    def test_compare_16_command_validation_and_snapshot_preserve_cloud_options(self):
        self.grouped_reference();self.command('COMPARESHAPE polygonal');self.command('COMPAREGROUP local')
        self.command('COMPARESHOWRC OFF');self.assertJS('!m.comparison.options.clouds')
        self.command('COMPARESHOWRC maybe');self.assertJS('!m.comparison.options.clouds')
        self.command('COMPARESHOWRC 1');self.assertJS('m.comparison.options.clouds')
        self.command('COMPARETEXT OFF');self.assertJS('!m.comparison.options.text')
        self.command('COMPAREHATCH 0');self.assertJS('!m.comparison.options.hatch')
        self.command('COMPARESHAPE unsupported');self.assertJS('m.comparison.options.cloudShape==="polygonal"')
        self.page.evaluate('() => { const text=DxfCompare.snapshot(compare.currentText(),compare.referenceText,compare.settings);compare.restoreSnapshot(text);window.o=app.renderingOverlayController;window.m=o.surfaceManager;window.compare=app.cadWorkspace.compare; }');self.settle()
        self.assertJS('m.comparison.options.cloudShape==="polygonal" && m.comparison.options.cloudMode==="local" && m.comparison.result.changeSets.length===3')

if __name__ == '__main__':
    names=[name for name in dir(VisualCompareTests) if name.startswith('test_compare_')]
    suite=unittest.TestSuite(VisualCompareTests(name) for name in names)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
