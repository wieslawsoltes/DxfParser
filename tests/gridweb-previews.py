#!/usr/bin/env python3
"""Real GridWeb/RichTextWeb integration. CI uses normal HTTP, not source substitutions."""
from __future__ import annotations
import importlib.util
import json
import os
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('docking_harness', ROOT/'tests/docking-workspace.py')
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)
ARTIFACTS = ROOT/'test-results/gridweb'

class GridPreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        harness.DockingTests.setUpClass.__func__(cls)
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        (ARTIFACTS/'environment.json').write_text(json.dumps({'browser':cls.browser.version,'injected':harness.INJECTED},indent=2))
    @classmethod
    def tearDownClass(cls):
        harness.DockingTests.tearDownClass.__func__(cls)
    def setUp(self):
        harness.DockingTests.setUp(self)
        self.load()
        self.page.evaluate((ROOT/'tests/gridweb-fixtures.js').read_text())
    def tearDown(self):
        try:
            self.page.screenshot(path=str(ARTIFACTS/f'{self._testMethodName}.png'))
        finally:
            self.context.close()
        self.assertEqual([], self.errors, 'Unexpected page errors')
    load = harness.DockingTests.load
    assertJS = harness.DockingTests.assertJS
    settle = harness.DockingTests.settle
    sample = harness.DockingTests.sample

    def test_01_real_controls_and_unchanged_main_trees(self):
        self.sample()
        self.assertJS("customElements.get('grid-web') === GridWeb.GridWebElement && !!RichTextWeb.fromDOCX")
        self.assertJS("app.myTreeGrid instanceof TreeDataGrid && app.myTreeGridRight instanceof TreeDataGrid && !document.querySelector('#panelLeft grid-web,#panelRight grid-web')")
        self.page.evaluate("document.getElementById('showStatsOverlayBtn').click()")
        self.page.wait_for_function("document.querySelector('#statsOverlay grid-web')")
        self.assertJS("[...document.querySelectorAll('#statsOverlay grid-web')].every(g=>g.ReadOnly && g.Workbook instanceof GridWeb.Workbook)")

    def test_02_report_inventory_and_no_visible_table_fallback(self):
        self.sample()
        result=self.page.evaluate("""async()=>{
          const launchers=['showCloudOverlayBtn','showStatsOverlayBtn','showDepsOverlayBtn','showBinaryObjectsOverlayBtn','showHandleMapOverlayBtn','showProxyObjectsOverlayBtn','showFontsOverlayBtn','showClassesOverlayBtn','showObjectSizeOverlayBtn','showBlocksOverlayBtn','showLineTypesOverlayBtn','showTextsOverlayBtn','showDiagnosticsOverlayBtn','configureRulesBtn'];
          for(const id of launchers){document.getElementById(id).click();await new Promise(requestAnimationFrame);}
          w.applyPreset('Review');await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
          return {grids:document.querySelectorAll('grid-web').length,tables:[...document.querySelectorAll('table')].filter(n=>!n.closest('.dxf-grid-source,[hidden]')).length,
            trees:!document.querySelector('#panelLeft grid-web,#panelRight grid-web')};
        }""")
        self.assertGreater(result['grids'],10);self.assertEqual(0,result['tables']);self.assertTrue(result['trees'])

    def test_03_sort_filter_literal_cells_and_action_identity(self):
        self.page.evaluate("""()=>{
          w.show('statsOverlay');const host=document.getElementById('overlayStatsContent')||document.getElementById('statsOverlay').querySelector('.overlay-content');
          const node=document.createElement('div');host.append(node);window.actions=[];
          window.v=new DxfGrid.GridView(node,{title:'Test records',columns:['Tag','Quantity'],rows:[
            {key:'b',values:['Pump',20],actions:[{label:'Run record',run:r=>actions.push(r.key)}]},
            {key:'a',values:['=NOT_A_FORMULA()',3],actions:[{label:'Run record',run:r=>actions.push(r.key)}]}]});
          v.sort.value='1';v.refresh();v.grid.Select('A2');
        }""")
        self.assertJS("v.visibleRows[0].key==='a' && v.book.ActiveWorksheet.GetCell('A2').Value==='=NOT_A_FORMULA()' && !v.book.ActiveWorksheet.GetCell('A2').Formula")
        self.page.locator('[data-grid-title="Test records"]').get_by_role('button',name='Run record',exact=True).click()
        self.assertJS("actions.join()==='a'")
        self.page.locator('[data-grid-title="Test records"] input[type=search]').fill('pump')
        self.page.wait_for_function("v.visibleRows.length===1")
        self.assertJS("v.visibleRows[0].key==='b'")

    def test_04_layer_checkbox_and_drawing_information_values(self):
        self.sample();self.page.evaluate("w.applyPreset('Review')");self.settle()
        self.page.locator('#renderingOverlayLayerManager .dxf-grid-actions').get_by_role('checkbox',name='On',exact=True).uncheck();self.settle()
        self.assertJS("!document.querySelector('input[data-action=\"toggle-on\"]').checked")
        self.page.locator('#renderingOverlayLayerManager .dxf-grid-actions').get_by_role('checkbox',name='On',exact=True).check();self.settle()
        self.assertJS("[...app.tabularReports.projections].filter(p=>p.source.matches('.rendering-summary-grid')).some(p=>p.view.rows.some(r=>r.values[1] && r.values[1]!=='—'))")

    def test_05_rule_configuration_and_source_updates(self):
        self.sample();self.page.evaluate("document.getElementById('configureRulesBtn').click()");self.settle()
        self.page.evaluate("""()=>{const p=[...app.tabularReports.projections].find(p=>p.source.matches('.rule-category-body'));window.rv=p.view;p.source.classList.add('expanded');window.sourceCheck=rv.selectedRow.source.querySelector('input');window.wasChecked=sourceCheck.checked;}""")
        self.settle()
        self.page.evaluate("rv.details.querySelector('input[type=checkbox]').click()")
        self.page.wait_for_function("rv.selectedRow.values[0] !== wasChecked")
        self.assertJS("sourceCheck.checked!==wasChecked && !!document.querySelector('.rule-category-controls:not(.dxf-grid-source)')")

    def test_06_classes_cloud_back_command_and_empty_recovery(self):
        self.sample()
        self.page.evaluate("""()=>{app.getActiveTab().originalTreeData.push({type:'CLASS',id:'cls',line:30,handle:'C0',properties:[{code:1,value:'PumpClass'},{code:2,value:'PumpCpp'},{code:3,value:'CADTest'}],children:[]});document.getElementById('showClassesOverlayBtn').click();}""")
        self.settle()
        self.assertJS("document.querySelector('[data-grid-title=\"Classes\"]')?.gridView.rows[0].values[0].includes('PumpClass')")
        self.page.get_by_role('button',name='CADTest (1)',exact=True).click();self.settle()
        self.assertTrue(self.page.get_by_role('button',name='Show All Classes',exact=True).is_visible())
        self.page.get_by_role('button',name='Show All Classes',exact=True).click();self.settle()
        self.assertEqual(1,self.page.locator('[data-grid-title="Classes"]').count())
        self.page.evaluate("app.getActiveTab().originalTreeData=app.getActiveTab().originalTreeData.filter(n=>n.id!=='cls');app.updateClasses()")
        self.settle();self.assertEqual(0,self.page.locator('[data-grid-title="Classes"]').count())

    def test_07_nested_block_metadata_and_proxy_actions(self):
        self.page.evaluate("""()=>{w.show('blocksOverlay');const container=document.getElementById('blocksOverlay').querySelector('.overlay-content');const list=document.createElement('div');list.className='block-overlay-list';list.innerHTML='<div class="block-card"><h3>Pump</h3><div class="block-card-line">Base point: 1,2,3</div><div class="block-card-line">Instances: 2</div><div class="block-card-warning">Review units</div><details><summary>Attributes</summary><ul><li>Tag: P-101</li><li>Power: 7.5 kW</li></ul></details><button>Jump to definition</button></div>';list.querySelector('button').onclick=()=>window.blockAction=true;container.append(list);}""")
        self.settle()
        self.assertJS("document.querySelector('[data-grid-title=\"Blocks & Inserts\"]').gridView.rows[0].values[1]==='Instances: 2'")
        self.page.get_by_role('button',name='Jump to definition',exact=True).click();self.assertJS('window.blockAction===true')
        self.page.evaluate("const v=document.querySelector('[data-grid-title=\"Blocks & Inserts\"]').gridView;v.details.querySelector('details').open=true;v.details.querySelectorAll('.dxf-grid-related')[1].open=true")
        self.settle();self.assertJS("document.querySelector('[data-grid-title=\"Attributes\"]')?.gridView.rows.length===2")

    def test_08_batch_rows_actions_and_original_export_records(self):
        self.page.evaluate("""()=>{w.show('batchProcessingOverlay');window.batchId=app.batchDataGrid.addTab('Query');window.file=new File(['0\\nEOF'],'drawing.dxf');for(let i=0;i<2500;i++)app.batchDataGrid.addRow(batchId,{file:'drawing.dxf',line:i+1,data:'Record '+i,fileObject:file});app.openFileTab=(f,line)=>window.opened={same:f===file,line};}""")
        self.page.wait_for_function("app.batchDataGrid.tabs[batchId].view.rows.length===2500")
        self.page.evaluate("app.batchDataGrid.tabs[batchId].view.grid.Select('A11')")
        self.page.get_by_role('button',name='Open file at line',exact=True).click()
        self.assertJS("opened.same && opened.line===10 && app.batchDataGrid.getAllTabs()[batchId].rows[0].fileObject===file")
        self.page.evaluate("window.oldView=app.batchDataGrid.tabs[batchId].view;app.batchDataGrid.removeTab(batchId)");self.assertJS('oldView.disposed')

    def test_09_paged_hex_is_bounded_and_can_reach_final_bytes(self):
        self.page.evaluate("w.show('hexViewerOverlay');app.virtualizeHexViewer(new Uint8Array(1024*1024).fill(65))")
        self.assertJS("document.getElementById('hexContent')._dataGrid.rows.length===2048")
        self.page.get_by_role('textbox',name='Hex byte offset',exact=True).fill('FFFF0')
        self.page.get_by_role('textbox',name='Hex byte offset',exact=True).press('Tab');self.settle()
        self.assertJS("document.getElementById('hexContent')._dataGrid.rows[0].values[0]==='000FFFF0' && document.getElementById('hexContent')._dataGrid.rows.length===1")

    def test_10_native_xlsx_multiple_sheets_styles_formulas_and_retention(self):
        self.assertTrue(self.page.evaluate("async()=>await app.officePreview.open(gridFixtures.excel(),'Equipment.xlsx')"))
        self.assertJS("app.officePreview.control instanceof GridWeb.GridWebElement && app.officePreview.book.Worksheets.Count===2 && app.officePreview.book.ActiveWorksheet.GetCell('C4').Value===2000 && app.officePreview.book.ActiveWorksheet.GetCell('A1').Style.font.bold")
        self.page.get_by_role('tab',name='Notes',exact=True).click();self.assertJS("app.officePreview.control.Sheet.Name==='Notes' && app.officePreview.control.Sheet.GetCell('A1').Value==='Drawing review'")
        self.page.evaluate("window.book=app.officePreview.book;window.control=app.officePreview.control;w.manager.Find('document-preview').Dock();w.hide('document-preview');w.show('document-preview')");self.settle()
        self.assertJS('app.officePreview.book===book && app.officePreview.control===control && control.Sheet.Name===\'Notes\' && control.clientHeight>100')

    def test_11_legacy_xls_and_xlsb_use_gridweb(self):
        for kind,extension in [('biff8','xls'),('xlsb','xlsb')]:
            result=self.page.evaluate("async({kind,extension})=>{const ok=await app.officePreview.open(gridFixtures.legacyExcel(kind),'test.'+extension);return {ok,value:app.officePreview.book?.ActiveWorksheet.GetCell('B2').Value,warning:app.officePreview.status.textContent};}",{'kind':kind,'extension':extension})
            self.assertTrue(result['ok'],result);self.assertEqual(42,result['value']);self.assertIn('Legacy Excel',result['warning'])
            self.assertJS('app.officePreview.control instanceof GridWeb.GridWebElement && app.officePreview.control.ReadOnly')

    def test_12_csv_tsv_file_input_and_formula_injection(self):
        self.page.evaluate("w.show('document-preview')")
        self.page.locator('#officeDocumentPreview input[type=file]').set_input_files({'name':'sample.csv','mimeType':'text/csv','buffer':b'Tag,Quantity\n=SUM(1+1),42'})
        self.page.wait_for_function("app.officePreview.book?.ActiveWorksheet.GetCell('B2').Value===42")
        self.assertJS("app.officePreview.book.ActiveWorksheet.GetCell('A2').Value==='=SUM(1+1)' && !app.officePreview.book.ActiveWorksheet.GetCell('A2').Formula")
        self.assertTrue(self.page.evaluate("async()=>await app.officePreview.open(new TextEncoder().encode('Tag\\tValue\\nP-101\\t7'),'data.tsv')"))
        self.assertJS("app.officePreview.book.ActiveWorksheet.GetCell('B2').Value===7")

    def test_13_docx_rich_readonly_pages_and_retention(self):
        self.assertTrue(self.page.evaluate("async()=>await app.officePreview.open(await gridFixtures.word(),'Drawing review.docx')"))
        self.assertJS("app.officePreview.control.tagName==='RICH-TEXT-PAGE-EDITOR' && app.officePreview.control.IsReadOnly && app.officePreview.control.Document.Text.includes('P-101')")
        self.page.evaluate("window.doc=app.officePreview.control.Document;window.editor=app.officePreview.control;w.manager.Find('document-preview').Dock();w.hide('document-preview');w.show('document-preview')");self.settle()
        self.assertJS('app.officePreview.control===editor && editor.Document===doc && editor.clientHeight>100')

    def test_14_rtf_legacy_doc_and_encrypted_rejection(self):
        self.assertTrue(self.page.evaluate(r"async()=>await app.officePreview.open(new TextEncoder().encode('{\\rtf1\\ansi Hello \\b Word\\b0}'),'review.rtf')"))
        self.assertJS("app.officePreview.control.Document.Text.includes('Word')")
        self.assertTrue(self.page.evaluate("async()=>await app.officePreview.open(gridFixtures.legacyWord(),'review.doc')"))
        self.assertJS("app.officePreview.control.Document.Text.includes('P-101 approved') && app.officePreview.status.textContent.includes('main-story text only')")
        self.page.evaluate("window.previousDoc=app.officePreview.control.Document")
        self.assertFalse(self.page.evaluate("async()=>await app.officePreview.open(gridFixtures.legacyWord(true),'encrypted.doc')"))
        self.assertJS("app.officePreview.status.dataset.error==='true' && app.officePreview.control.Document===previousDoc")

    def test_15_archives_route_office_entries_to_real_controls(self):
        self.assertTrue(self.page.evaluate("async()=>{window.zip=GridWeb.writeZip({'Equipment.xlsx':gridFixtures.excel(),'Review.docx':await gridFixtures.word()});return await app.officePreview.open(zip,'Package.zip');}"))
        self.assertJS("app.officePreview.stage.querySelector('grid-web') instanceof GridWeb.GridWebElement")
        self.page.get_by_role('button',name='Preview',exact=True).click();self.page.wait_for_function('!!app.officePreview.book')
        self.assertJS("app.officePreview.book.Worksheets.Count===2")
        self.assertTrue(self.page.evaluate("async()=>{const entries=await GridWeb.readZip(zip);return await app.officePreview.open(entries.get('Review.docx'),'Review.docx');}"))
        self.assertJS("app.officePreview.control.Document.Text.includes('Reviewed')")

    def test_16_embedded_content_detection_and_hex_actions(self):
        self.page.evaluate("app.showHexViewer([...gridFixtures.excel()].map(b=>b.toString(16).padStart(2,'0')).join(''))")
        self.page.wait_for_function('!!app.officePreview.book')
        self.assertJS("w.isOpen('document-preview') && app.officePreview.book.Worksheets.Count===2 && document.getElementById('hexContent')._dataGrid.rows.length>0")

    def test_17_latest_import_wins_invalid_input_preserves_document(self):
        self.page.evaluate("""async()=>{const first=app.officePreview.open(gridFixtures.excel(),'slow.xlsx');await app.officePreview.open(new TextEncoder().encode('Tag,Value\\nLatest,99'),'latest.csv');await first;window.retained=app.officePreview.book;}""")
        self.assertJS("app.officePreview.filename==='latest.csv' && app.officePreview.book.ActiveWorksheet.GetCell('B2').Value===99")
        self.assertFalse(self.page.evaluate("async()=>await app.officePreview.open(new Uint8Array([0x50,0x4b,0,0]),'broken.xlsx')"))
        self.assertJS("app.officePreview.book===retained && app.officePreview.status.dataset.error==='true'")
        self.assertFalse(self.page.evaluate("async()=>await app.officePreview.open(new Uint8Array(DxfOffice.MAX_INPUT+1),'large.doc')"))

    def test_18_hostile_markup_and_linked_media_are_not_loaded(self):
        self.assertTrue(self.page.evaluate("async()=>await app.officePreview.open(new TextEncoder().encode('<h1>Safe</h1><script>window.previewInjected=true</script><img src=\"https://example.invalid/private\" onerror=\"window.previewInjected=true\"><p>Text</p>'),'test.html')"))
        self.assertJS("!window.previewInjected && !JSON.stringify(app.officePreview.control.Document.ToJSON()).includes('https://example.invalid/private')")
        self.assertFalse(self.page.evaluate("async()=>{const zip=GridWeb.writeZip({'safe.txt':new TextEncoder().encode('safe')});zip[0]=0;return await app.officePreview.open(zip,'bad.zip');}"))

    def test_19_projection_cleanup_and_dispose(self):
        self.sample();self.page.evaluate("document.getElementById('showStatsOverlayBtn').click()");self.settle()
        self.page.evaluate("window.views=[...app.tabularReports.projections].map(p=>p.view);document.getElementById('statsOverlay').querySelector('.overlay-content').replaceChildren()")
        self.settle();self.assertJS("views.some(v=>v.disposed)")
        self.page.evaluate("w.dispose();w.dispose()")
        self.assertJS('app.tabularReports.disposed && app.officePreview.disposed && app.tabularReports.projections.size===0')

    def test_20_editor_has_document_preview_and_local_dependencies(self):
        self.context.close();harness.DockingTests.setUp(self);self.load('editor/index.html')
        self.assertJS("w.definitions.size===6 && !!DxfEditorApp.officePreview && ![...document.scripts].some(s=>s.src.startsWith('https:'))")
        self.assertTrue(self.page.evaluate("async()=>await DxfEditorApp.officePreview.open(new TextEncoder().encode('Editor,Preview\\nExcel,1'),'test.csv')"))
        self.assertJS('DxfEditorApp.officePreview.control instanceof GridWeb.GridWebElement')
        self.page.evaluate('w.dispose()');self.assertJS('DxfEditorApp.officePreview.disposed')

if __name__ == '__main__':
    print('Injected harness' if harness.INJECTED else 'HTTP + actual local browser controls',flush=True)
    unittest.main(verbosity=2)
