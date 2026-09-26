#!/usr/bin/env python3
"""HTTP result-document consumers and real application batch-analysis integration."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('docking_harness', ROOT/'tests/docking-workspace.py')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
OUT = ROOT/'test-results/report-workspace'

class ReportWorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): h.DockingTests.setUpClass.__func__(cls); OUT.mkdir(parents=True,exist_ok=True)
    @classmethod
    def tearDownClass(cls): h.DockingTests.tearDownClass.__func__(cls)
    def setUp(self):
        h.DockingTests.setUp(self)
        self.page.goto(self.base+'tests/report-workspace.html',wait_until='domcontentloaded')
        self.page.wait_for_function('window.reportDemo?.reports.entries.size===2')
        self.page.evaluate('() => {window.r=reportDemo.reports;window.a=reportDemo.first;window.b=reportDemo.second;}')
        self.settle()
    def tearDown(self):
        try:self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')))
        finally:self.context.close()
        self.assertEqual([],self.errors,'Uncaught application errors')
    settle=h.DockingTests.settle
    assertJS=h.DockingTests.assertJS

    def test_results_01_independent_native_documents_and_query_sidebar(self):
        self.assertJS('!window.app && !window.DxfAnalysis && r.manager instanceof AvalonDock.DockingManager')
        self.assertJS('a.content.clientWidth>300 && b.content.clientWidth>300 && a.view.grid.clientHeight>300 && b.view.grid.clientHeight>300')
        self.assertJS('r.controls.clientWidth>=230 && a.view.docking!==b.view.docking && reportDemo.other.entries.size===1')
    def test_results_02_native_float_and_redock_retain_filters_and_selection(self):
        self.page.evaluate("() => {a.view.search.value='P-1';a.view.refresh();a.view.selectKey(1);window.original=a.view.grid;r.manager.Float(r.manager.Find(a.id),{FloatingWidth:640,FloatingHeight:500});}");self.settle()
        self.assertJS('r.manager.Find(a.id).IsFloating && a.view.grid===original && a.view.selectedKey===1 && b.view.rows.length===1')
        self.page.evaluate('() => {r.manager.Find(a.id).Dock();}');self.settle()
        self.assertJS('!r.manager.Find(a.id).IsFloating && a.view.search.value==="P-1"')
    def test_results_03_compact_host_uses_tabs_and_keeps_query_accessible(self):
        self.page.evaluate("() => {document.getElementById('primary').style.width='390px';}");self.settle()
        self.assertJS('r.compact && r.manager.Find(a.id).Parent===r.manager.Find(r.controlsId).Parent && a.view.grid.clientHeight>300')
        self.page.locator('#primary .report-workspace-toolbar').get_by_role('button',name='Query',exact=True).click();self.settle()
        self.assertTrue(self.page.locator('#query input').first.is_visible())
        self.page.locator('#primary [aria-label="Active result"]').select_option('result-b');self.settle()
        self.assertJS('r.activeId===b.id && b.content.clientHeight>400 && b.view.grid.clientHeight>300')
    def test_results_04_focus_results_restores_query_without_disposing_views(self):
        self.page.locator('#primary .report-workspace-toolbar').get_by_role('button',name='Focus results',exact=True).click();self.settle()
        self.assertJS('r.manager.Find(r.controlsId).IsHidden && !a.view.disposed && !b.view.disposed')
        self.page.locator('#primary .report-workspace-toolbar').get_by_role('button',name='Restore query',exact=True).click();self.settle()
        self.assertJS('!r.manager.Find(r.controlsId).IsHidden && r.controls.clientWidth>=230')
    def test_results_05_streamed_results_publish_once_and_keep_other_query_unchanged(self):
        self.page.evaluate('''() => {window.published=0;const original=a.view.setRows.bind(a.view);a.view.setRows=rows=>{published++;original(rows);};
            for(let i=40;i<2540;i++)r.append(a.id,{key:i,values:['P-'+i,'Pump',i]});}''')
        self.page.wait_for_function('a.view.rows.length===2540');self.assertJS('published===1 && b.view.rows.length===1')
    def test_results_06_native_close_releases_pending_rows_and_content_cache(self):
        self.page.evaluate("() => {r.arrange('tabs');r.activate(b.id);r.append(b.id,{key:'late',values:['Pending']});}");self.settle()
        self.page.locator('#primary .report-workspace-host .ad-tab[data-tab-id="result-b"]').get_by_role('button',name='Close tab',exact=True).click();self.settle()
        self.assertJS('b.disposed && b.view.disposed && b.buffer.count===0 && !r.entries.has(b.id) && !r.manager._registry.has(b.id) && r.entries.size===1')
        self.assertJS("(() => {try{r.append(b.id,{key:'x',values:[]});}catch(e){return e instanceof RangeError;}return false;})()")
    def test_results_07_row_and_document_budgets_are_atomic(self):
        self.page.evaluate('() => {r.maxDocuments=2;window.before=r.manager.SaveLayout();}');self.settle()
        self.assertJS("(() => {try{r.add({title:'over budget'});}catch(e){return r.manager.SaveLayout()===before&&r.entries.size===2;}return false;})()")
        self.assertJS("(() => {b.buffer.maxRows=2;try{r.appendMany(b.id,[{key:2,values:[]},{key:3,values:[]}]);}catch(e){return b.buffer.count===1;}return false;})()")
    def test_results_08_disposal_keeps_host_controls_and_other_workspaces(self):
        self.page.evaluate('() => {r.append(a.id,{key:100,values:["late"]});r.dispose();r.dispose();}');self.settle()
        self.assertJS('r.disposed && a.view.disposed && b.view.disposed && r.entries.size===0 && a.buffer.count===0')
        self.assertJS('document.getElementById("query").parentElement.id==="primary" && !reportDemo.other.disposed && reportDemo.closed.length===2')
    def test_results_09_spreadsheet_and_native_inner_panes_survive_rearrangement(self):
        self.page.evaluate("() => {a.view.setMode('spreadsheet');a.view.selectKey(2);window.sheet=a.view.spreadsheet;window.model=a.view.treeModel;r.arrange('vertical');}");self.settle()
        self.assertJS('a.view.spreadsheet===sheet && a.view.treeModel===model && a.view.selectedKey===2 && !a.view.spreadsheet.grid.hidden')
        self.page.evaluate("() => {r.arrange('horizontal');a.view.setMode('records');}");self.settle()
        self.assertJS('a.view.selectedKey===2 && a.view.grid.clientHeight>300 && b.view.grid.clientHeight>300')
    def test_results_10_failed_dock_insertion_leaves_no_ghost_documents(self):
        self.assertJS('''() => {const container=document.createElement('div');document.body.append(container);
            const Type=reportDemo.Results;const workspace=new Type({container});const original=workspace.manager.AddDocument.bind(workspace.manager);
            workspace.manager.AddDocument=model=>{original(model);throw new Error('insertion failed');};
            let rejected=false;try{workspace.add({id:'bad',title:'Bad'});}catch(e){rejected=e.message==='insertion failed';}
            const okay=rejected&&workspace.entries.size===0&&!workspace.manager.Find('bad')&&!container.querySelector('.dxf-analysis-view');
            workspace.dispose();container.remove();return okay;}''')
    def test_results_11_foreign_nodes_reject_without_moving_content(self):
        self.assertJS('''() => {const foreign=document.implementation.createHTMLDocument('foreign'),node=foreign.createElement('div');foreign.body.append(node);
            try{new reportDemo.Results({container:node});}catch(e){return e instanceof TypeError && node.parentElement===foreign.body;}return false;}''')
    def test_results_12_package_disposal_observers_cannot_prevent_other_cleanup(self):
        self.page.evaluate("() => {r.onClose=()=>{throw new Error('cleanup observer');};r.dispose();}");self.settle()
        self.assertJS('a.disposed && b.disposed && a.view.disposed && b.view.disposed && r.entries.size===0')
    def app(self):
        h.DockingTests.load(self)
        self.page.evaluate('''() => {w.show('batchProcessingOverlay');window.batch=app.batchDataGrid;
            window.batchA=batch.addTab('First query');window.batchB=batch.addTab('Second query');
            const file=new File(['0\\nEOF'],'source.dxf');
            for(let i=0;i<30;i++)batch.addRow(batchA,{file:'source.dxf',line:i+1,data:'Line '+i,fileObject:file});
            batch.addRow(batchB,{file:'other.dxf',line:5,data:'Other',fileObject:file});
            batch.documents.arrange('horizontal');batch.switchTab(batchA); }''');self.settle()
    def test_results_13_application_batch_results_use_full_height_docked_documents(self):
        self.app()
        self.assertJS('batch.documents.entries.size===2 && batch.tabs[batchA].view.grid.clientHeight>250 && batch.tabs[batchB].view.grid.clientHeight>250')
        self.assertJS('batch.tabs[batchA].view.grid.shadowRoot.querySelector("[role=columnheader]").getBoundingClientRect().width<90')
        self.assertJS('batch.controls.clientHeight>400 && batch.tabs[batchA].rows.length===30 && document.getElementById("batchJsQuery").isConnected')
    def test_results_14_application_expand_resolves_outer_owner_and_actions_keep_files(self):
        self.app()
        self.page.evaluate('''() => {app.openFileTab=(file,line)=>{window.jumped={name:file.name,line};};batch.tabs[batchA].view.selectKey(4);}''');self.settle()
        self.page.evaluate('() => batch.tabs[batchA].view.runAction(batch.tabs[batchA].view.selectedRow.actions[0].run)');self.settle()
        self.assertJS('jumped.name==="source.dxf" && jumped.line===5')
        self.page.locator('[data-report-id="'+self.page.evaluate('batchA')+'"] .analysis-modes').get_by_role('button',name='Expand analysis',exact=True).click();self.settle()
        self.assertJS('w.manager.Find("batchProcessingOverlay").FindParent(AvalonDock.LayoutFloatingWindow).IsMaximized')
    def test_results_15_application_close_ignores_late_producer_rows_and_keeps_excel_data(self):
        self.app()
        self.page.evaluate("() => {batch.removeTab(batchA);batch.addRow(batchA,{file:'late',line:99,data:'late'});}");self.settle()
        self.assertJS('!batch.tabs[batchA] && batch.getAllTabs()[batchB].rows[0].line===5 && batch.documents.entries.size===1')
        with self.page.expect_download() as download:self.page.locator('#downloadExcelBtn').click()
        self.assertEqual('batch_results.xlsx',download.value.suggested_filename)
    def test_results_16_native_splitter_is_keyboard_resizable(self):
        self.page.evaluate('window.queryWidth=r.controls.clientWidth')
        self.page.locator('#primary .report-workspace-host .ad-splitter').first.focus()
        self.page.keyboard.press('ArrowRight');self.settle()
        self.assertJS('r.controls.clientWidth!==queryWidth && !a.view.disposed && !b.view.disposed')

    def test_results_17_locked_layout_change_reports_error_without_changing_selection(self):
        self.page.evaluate('() => {r.manager.Find(b.id).CanMove=false;}')
        field=self.page.locator('#primary [aria-label="Result layout"]');field.focus();self.settle()
        self.page.evaluate('() => {window.beforeLocked=r.manager.SaveLayout();}')
        field.select_option('vertical');self.settle()
        self.assertJS('r.mode==="horizontal" && r.layoutSelect.value==="horizontal" && r.manager.SaveLayout()===beforeLocked')
        self.assertIn('movable',self.page.locator('#primary .report-workspace-message').inner_text())
    def test_results_18_one_report_resize_failure_does_not_interrupt_its_neighbor(self):
        self.page.evaluate('() => {window.siblingResized=0;a.view.refreshLayout=()=>{throw new Error("report resize failed");};b.view.refreshLayout=()=>{siblingResized++;};r.sizes.clear();r.refreshLayout();}')
        self.assertJS('siblingResized>0 && !a.disposed && !b.disposed')
        self.assertIn('report resize failed',self.page.locator('#primary .report-workspace-message').inner_text())

    def test_results_19_application_star_widths_preserve_spreadsheet_mode(self):
        self.app()
        self.page.evaluate('() => {batch.tabs[batchA].view.setMode("spreadsheet");}');self.settle()
        self.assertJS('batch.tabs[batchA].view.spreadsheet.book.ActiveWorksheet.GetCell("D2").Value==="Line 0"')
        self.assertJS('batch.tabs[batchA].view.spreadsheet.grid.clientWidth>0 && batch.tabs[batchA].view.spreadsheet.grid.clientHeight>200')
        self.page.evaluate('() => {batch.tabs[batchA].view.setMode("records");}');self.settle()
        self.assertJS('batch.tabs[batchA].view.rows.length===30 && batch.tabs[batchB].rows.length===1')
    def test_results_20_closed_query_ignores_a_pending_file_parse(self):
        self.app()
        self.page.evaluate("""() => {const transfer=new DataTransfer();transfer.items.add(new File(['0\\nEOF'],'delayed.dxf'));
            document.getElementById('directoryInput').files=transfer.files;
            document.getElementById('batchObjectType').value='LINE';
            app.parseFileStream=()=>new Promise(resolve=>{window.finishRead=resolve;});
            app.handleBatchProcess();window.closedQuery=batch.activeTabId;batch.removeTab(closedQuery);
            finishRead({objects:[{type:'LINE',line:1,properties:[],children:[]}]});}""")
        self.page.wait_for_function('document.getElementById("batchProgress").style.display==="none"')
        self.assertJS('!batch.tabs[closedQuery] && !batch.documents.entries.has(closedQuery) && batch.tabs[batchA].rows.length===30 && batch.tabs[batchB].rows.length===1')

if __name__=='__main__':unittest.main(verbosity=2)
