#!/usr/bin/env python3
"""Analysis usability: real TreeDataGridWeb + GridWeb + source-aware CAD actions.
Normal CI uses HTTP, actual modules, local storage and real DXF file inputs.
"""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('harness',ROOT/'tests/docking-workspace.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
ARTIFACTS=ROOT/'test-results/analysis'

class AnalysisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        h.DockingTests.setUpClass.__func__(cls);ARTIFACTS.mkdir(parents=True,exist_ok=True)
        (ARTIFACTS/'environment.json').write_text(json.dumps({'browser':cls.browser.version,'transport':'http'},indent=2))
    @classmethod
    def tearDownClass(cls):h.DockingTests.tearDownClass.__func__(cls)
    def setUp(self):h.DockingTests.setUp(self);self.load();self.fixture()
    def tearDown(self):
        try:self.page.screenshot(path=str(ARTIFACTS/(self._testMethodName+'.png')))
        finally:self.context.close()
        self.assertEqual([],self.errors,'Uncaught application errors')
    load=h.DockingTests.load
    settle=h.DockingTests.settle
    assertJS=h.DockingTests.assertJS
    def fixture(self,side='Left',name='analysis-workbench.dxf'):
        self.page.locator('#fileInput'+side).set_input_files({'name':name,'mimeType':'application/dxf','buffer':(ROOT/'tests/data/analysis-workbench.dxf').read_bytes()})
        self.page.wait_for_function('(name)=>[...app.documentWorkspace.records.values()].some(r=>r.tab.name===name)',arg=name);self.settle()
    def launch(self,button,container):
        self.page.evaluate('(id)=>document.getElementById(id).click()',button);self.settle()
        self.page.wait_for_function('(id)=>!!document.getElementById(id).querySelector(".dxf-analysis-view")',arg=container)
        self.page.evaluate('(id)=>{window.v=document.getElementById(id).querySelector(".dxf-analysis-view").analysisView;}',container)
        return self.page.locator('#'+container+' > .dxf-analysis-view')

    def test_01_statistics_real_models_metrics_and_numeric_header_sort(self):
        self.launch('showStatsOverlayBtn','overlayStatsContent')
        self.assertJS("v.grid.Model instanceof TreeDataGridCore.HierarchicalTreeDataGridSource && app.myTreeGrid instanceof TreeDataGrid && !v.spreadsheet")
        self.assertJS("v.rows.reduce((n,r)=>n+r.values[1],0)===DxfAnalysis.inspect(app.getActiveTab()).nodes.length")
        self.page.locator('#statsOverlay tree-data-grid').get_by_role('columnheader',name='Count Resize Count',exact=True).click();self.settle()
        self.assertJS("v.visibleRows[0].values[1]<=v.visibleRows[v.visibleRows.length-1].values[1]")
        self.assertEqual(4,self.page.locator('#statsOverlay .analysis-kpi').count())

    def test_02_lazy_spreadsheet_preserves_literal_cells_and_selection(self):
        self.launch('showStatsOverlayBtn','overlayStatsContent')
        self.page.evaluate("v.setRows([{key:'a',values:['=DANGEROUS()',3,3,3]},{key:'b',values:['Pump',50,50,50]}]);v.selectIndex(1)")
        self.page.locator('#statsOverlay').get_by_role('button',name='Spreadsheet',exact=True).click();self.settle()
        self.assertJS("v.spreadsheet.grid.Workbook instanceof GridWeb.Workbook && v.spreadsheet.book.ActiveWorksheet.GetCell('A2').Value==='=DANGEROUS()' && !v.spreadsheet.book.ActiveWorksheet.GetCell('A2').Formula && v.selectedKey==='b'")
        self.page.locator('#statsOverlay').get_by_role('button',name='Records',exact=True).click();self.assertJS("v.selectedKey==='b' && !v.grid.hidden")

    def test_03_fonts_resolve_styles_hierarchy_and_filtered_ancestors(self):
        self.launch('showFontsOverlayBtn','overlayFontsContent')
        self.assertJS("v.rows.some(r=>r.values[0]==='arial.ttf' && r.children.length===2 && r.values[3]===14) && v.rows.some(r=>r.values[4]==='Unresolved')")
        self.page.locator('#fontsOverlay').get_by_role('button',name='Expand all',exact=True).click();self.settle()
        self.assertJS("v.visibleRows.length===v.allRows.length")
        self.page.locator('#fontsOverlay').get_by_role('searchbox').fill('MTEXT');self.page.wait_for_function('v.filtering')
        self.assertJS("v.visibleRows.length===3 && v.visibleRows[0].values[0]==='arial.ttf' && v.visibleRows[1].values[0]==='TITLE'")

    def test_04_ownership_preserves_cycles_duplicates_and_missing_owners(self):
        self.launch('showHandleMapOverlayBtn','overlayHandleMapContent')
        self.assertJS("v.allRows.length===DxfAnalysis.inspect(app.getActiveTab()).nodes.filter(n=>n.handle).length")
        self.assertJS("v.allRows.filter(r=>r.values[4]==='Owner cycle').length===2 && v.allRows.filter(r=>r.values[4]==='Duplicate handle').length===2 && v.allRows.some(r=>r.values[4]==='Missing owner')")
        self.page.locator('#handleMapOverlay').get_by_role('searchbox').fill('C2');self.page.wait_for_function('v.filtering')
        self.assertJS("v.filteredRows.some(r=>r.values[0]==='C2') && v.filteredRows.some(r=>r.values[4]==='Owner cycle')")

    def test_05_dependencies_show_external_paths_without_resolution_claims(self):
        self.launch('showDepsOverlayBtn','overlayDepsContent')
        self.page.locator('#depsOverlay').get_by_role('searchbox').fill('pump-photo');self.page.wait_for_function('v.visibleRows.length===1')
        self.assertJS("v.selectedRow.values[2]==='references/pump-photo.png' && v.selectedRow.values[5]==='External reference' && v.selectedRow.metadata[0][1].startsWith('Not probed')")
        self.page.locator('#depsOverlay').get_by_role('tab',name='Raw data',exact=True).click()
        self.assertIn('IMAGEDEF',self.page.locator('#depsOverlay .analysis-detail-body').inner_text())

    def test_06_texts_include_continuations_formatting_and_safe_markup(self):
        self.launch('showTextsOverlayBtn','overlayTextsContent')
        self.page.locator('#textsOverlay').get_by_role('combobox',name='Type filter',exact=True).select_option('MTEXT');self.settle()
        self.assertJS("v.visibleRows.length===1 && v.selectedRow.values[0].includes('Plant inspection\\nPumps') && v.selectedRow.values[0].includes('Review corrosion') && !v.selectedRow.values[0].includes('\\\\C1;')")
        self.page.evaluate("app.getActiveTab().originalTreeData.push({id:90000,type:'TEXT',line:9999,properties:[{code:1,value:'<img src=x onerror=window.analysisInjection=1>'}],children:[]});app.updateTexts();v.clearFilters();v.search.value='onerror';v.refresh()")
        self.assertJS("v.visibleRows.length===1 && !window.analysisInjection && !v.host.querySelector('img')")

    def test_07_line_types_keep_patterns_and_all_usages(self):
        self.launch('showLineTypesOverlayBtn','overlayLineTypesContent')
        self.page.evaluate("v.selectKey(v.allRows.find(r=>r.values[0]==='DASHED').key)")
        self.assertJS("v.selectedRow.values[2]===21 && v.selectedRow.values[5]==='0.6, -0.4' && !!v.details.querySelector('svg')")
        self.page.locator('#lineTypesOverlay').get_by_role('tab',name='Related (1)',exact=True).click();self.settle()
        self.assertJS("v.relatedView.rows.length===21")

    def test_08_diagnostics_run_single_issue_projection_and_severity_cards(self):
        self.launch('showDiagnosticsOverlayBtn','analysisDiagnostics')
        self.page.get_by_role('button',name='Run Analysis',exact=True).click()
        self.page.wait_for_function('!!app.lastDiagnosticsResults',timeout=30000);self.settle()
        self.assertJS("v.rows.length===['structural','integrity','rendering','text','performance','compliance','bestPractices','security'].reduce((n,k)=>n+app.lastDiagnosticsResults[k].length,0)")
        self.assertEqual(1,self.page.locator('#diagnosticsOverlay .dxf-analysis-view').count())
        self.page.locator('#diagnosticsStats [data-filter=warning]').click();self.settle()
        self.assertJS("v.visibleRows.every(r=>r.values[1]==='warning')")
        self.page.locator('#diagnosticsStats [data-filter=all]').focus();self.page.keyboard.press('Enter');self.settle()
        self.assertJS("v.visibleRows.length===v.rows.length")

    def test_09_rule_inline_controls_bulk_filter_and_apply(self):
        self.page.evaluate("document.getElementById('configureRulesBtn').click()");self.settle()
        self.page.evaluate("window.v=[...app.tabularReports.projections].find(p=>p.source.id==='ruleConfigContent').view;window.before=[...document.querySelectorAll('.rule-item')].map(r=>[r.dataset.category,r.querySelector('input').checked]);w.manager.Find('ruleConfigOverlay').Dock()")
        self.page.locator('[data-grid-title="Diagnostic Rules"]').get_by_role('combobox',name='Category filter',exact=True).select_option('security');self.settle()
        self.page.locator('[data-grid-title="Diagnostic Rules"]').get_by_role('button',name='Disable filtered',exact=True).click();self.settle()
        self.assertJS("[...document.querySelectorAll('.rule-item[data-category=security] input')].every(i=>!i.checked) && document.querySelector('.rule-item[data-category=structural] input').checked===before.find(r=>r[0]==='structural')[1]")
        self.page.locator('#applyRuleConfigBtn').click();self.settle()
        self.assertJS("w.isOpen('ruleConfigOverlay') && Object.values(app.ruleConfiguration.security).every(v=>v===false)")

    def test_10_blocks_thumbnails_attributes_and_full_width_drilldown(self):
        self.launch('showBlocksOverlayBtn','overlayBlocksContent')
        self.assertJS("v.rows.some(r=>r.values[0]==='PUMP' && r.values[1]===12)")
        self.page.evaluate("v.selectKey('block:PUMP');window.kept=v.selectedKey;v.showDetail('related')");self.settle()
        self.assertJS('v.related.length>0 && !!v.relatedView')
        self.page.locator('#blocksOverlay .analysis-related-toolbar').get_by_role('button',name='Open full view',exact=True).click();self.settle()
        self.assertJS("!!v.drillView && v.drillView.grid.clientWidth>600")
        self.page.locator('#blocksOverlay .analysis-drill-heading button').click();self.settle()
        self.assertJS("!v.drill && v.selectedKey===kept")

    def test_11_layer_inline_toggle_targets_sorted_source_row(self):
        self.page.evaluate("w.applyPreset('Review');w.show('render-layers')");self.settle()
        self.page.evaluate("window.v=[...app.tabularReports.projections].find(p=>p.source.matches('table')&&p.source.querySelector('[data-action=toggle-on]')).view;v.sort.value='0';v.direction=-1;v.applySort();window.target=v.visibleRows[0];window.check=target.source.querySelector('[data-action=toggle-on]');window.old=check.checked")
        self.page.locator('#renderingOverlayLayerManager tree-data-grid input[aria-label^="On:"]').first.click();self.settle()
        self.assertJS("check.checked!==old")

    def test_12_rebuild_retains_filters_column_width_and_source_identity(self):
        self.launch('showBlocksOverlayBtn','overlayBlocksContent')
        self.page.evaluate("v.search.value='PUMP';v.refresh();v.treeModel.Columns.Get(0).Width=new TreeDataGridCore.GridLength(260);window.previous=v;app.updateBlocksOverlay()");self.settle()
        self.page.evaluate("() => {window.v=document.querySelector('#overlayBlocksContent .dxf-analysis-view').analysisView;}")
        self.assertJS("previous.disposed && v.search.value==='PUMP' && v.selectedKey==='block:PUMP' && v.treeModel.Columns.Get(0).Width.Value===260")

    def test_13_duplicate_handle_actions_navigate_canonical_node_and_stay_docked(self):
        self.launch('showHandleMapOverlayBtn','overlayHandleMapContent')
        self.page.evaluate("window.source=app.documentWorkspace.active;window.target=v.allRows.filter(r=>r.values[0]==='E1')[1];v.search.value='E1';v.refresh();v.selectKey(target.key);w.manager.Find('handleMapOverlay').Dock()")
        self.fixture('Right','other.dxf');self.page.evaluate("w.show('handleMapOverlay')");self.settle()
        self.page.locator('#handleMapOverlay > .overlay-content .analysis-details > .dxf-grid-actions').get_by_role('button',name='Show in Tree',exact=True).click();self.settle()
        self.assertJS("app.documentWorkspace.active===source && source.grid.selectedRowId===target.node.id && w.isOpen('handleMapOverlay')")

    def test_14_closed_source_cannot_trigger_inline_shadow_action(self):
        self.launch('showHandleMapOverlayBtn','overlayHandleMapContent')
        self.page.evaluate("window.source=app.documentWorkspace.active;v.search.value='D1';v.refresh();w.manager.Find('handleMapOverlay').Dock()")
        self.fixture('Right','other.dxf');self.page.evaluate("window.other=app.documentWorkspace.active;window.confirm=()=>true;w.manager.Find(source.id).Close();w.show('handleMapOverlay')");self.settle()
        self.page.evaluate('v.grid.Scroll.Offset={X:2000,Y:0}');self.settle()
        self.page.locator('#handleMapOverlay tree-data-grid').get_by_role('button',name='Show in Tree: D1',exact=True).click();self.settle()
        self.assertJS("app.documentWorkspace.active===other && v.count.dataset.error==='true' && v.count.textContent.includes('source drawing is closed')")

    def test_15_detail_splitter_column_resize_and_keyboard_search(self):
        self.launch('showStatsOverlayBtn','overlayStatsContent')
        self.page.evaluate("() => {v.docking.setPreset('balanced');}");self.settle()
        self.page.evaluate("window.width=v.details.clientWidth");self.page.locator('#statsOverlay .analysis-dock-host .ad-splitter').last.focus();self.page.keyboard.press('ArrowLeft');self.settle()
        self.assertJS('v.details.clientWidth>width')
        grid=self.page.locator('#statsOverlay tree-data-grid');grip=grid.locator('.resize-grip').first;box=grip.bounding_box()
        self.page.mouse.move(box['x']+4,box['y']+15);self.page.mouse.down();self.page.mouse.move(box['x']+64,box['y']+15,steps=6);self.page.mouse.up();self.settle()
        self.assertJS('v.treeModel.Columns.Get(0).Width.Value>240')
        grid.locator('.root').focus();self.page.keyboard.press('Control+f');self.page.keyboard.type('INSERT');self.page.wait_for_function('v.visibleRows.length===1')
        self.assertJS("v.visibleRows[0].values[0]==='INSERT'")

    def test_16_compact_docked_details_and_dark_theme(self):
        self.launch('showTextsOverlayBtn','overlayTextsContent')
        self.page.evaluate("w.manager.Theme='dark';w.manager.Float(w.manager.Find('textsOverlay'),{FloatingLeft:15,FloatingTop:15,FloatingWidth:430,FloatingHeight:670})");self.settle()
        self.assertJS("v.host.dataset.theme==='dark' && v.main.dataset.arrangement==='tabs' && v.grid.clientHeight>180")
        self.page.locator('#textsOverlay .analysis-modes').get_by_role('button',name='Details',exact=True).click();self.settle()
        self.assertJS("v.docking.isVisible('details') && !v.docking.isVisible('records') && v.details.clientHeight>200")
        self.page.locator('#textsOverlay .analysis-modes').get_by_role('button',name='Records',exact=True).click();self.settle()
        self.assertJS("v.docking.isVisible('records') && v.grid.clientHeight>200")

    def test_17_large_records_virtualized_and_filter_without_workbook_recreation(self):
        self.launch('showStatsOverlayBtn','overlayStatsContent')
        self.page.evaluate("v.setRows(Array.from({length:20000},(_,i)=>({key:i,values:['P-'+i,i,0,0]})));window.model=v.treeModel;v.grid.Scroll.Offset={X:0,Y:500000}");self.settle()
        self.assertJS("v.grid.shadowRoot.querySelectorAll('.row').length<100 && v.treeModel.Rows.Count===20000 && !v.spreadsheet")
        self.page.locator('#statsOverlay').get_by_role('searchbox').fill('P-19999');self.page.wait_for_function('v.visibleRows.length===1')
        self.assertJS('v.treeModel===model && v.selectedRow.key===19999')

    def test_18_csv_and_full_record_copy_are_literal_and_sorted(self):
        self.launch('showStatsOverlayBtn','overlayStatsContent')
        self.page.evaluate("v.setRows([{key:'b',values:['Pump',20,1,-1]},{key:'a',values:['=FORMULA()',2,1,-2]}]);v.sort.value='1';v.applySort();v.selectIndex(0)")
        self.assertJS("v.csvText().includes(\"'\"+'=FORMULA()') && v.csvText().indexOf('FORMULA')<v.csvText().indexOf('Pump') && v.csvText().includes('\"-2\"') && v.selectionText().includes('=FORMULA()')")

    def test_19_raw_properties_exclude_identity_from_incoming_references(self):
        self.launch('showHandleMapOverlayBtn','overlayHandleMapContent')
        self.page.evaluate("v.search.value='D1';v.refresh();v.selectKey(v.filteredRows.find(r=>r.values[0]==='D1').key)")
        self.assertJS("v.related.every(r=>r.title!=='Referenced by')")
        self.page.locator('#handleMapOverlay').get_by_role('tab',name='Raw data',exact=True).click();self.assertIn('Missing owner',self.page.locator('#handleMapOverlay .analysis-detail-body').inner_text())

    def test_20_frequencies_show_all_code_occurrences_in_drilldown(self):
        self.launch('showCloudOverlayBtn','overlayObjectCloud')
        self.page.locator('#cloudOverlay').get_by_role('combobox',name='Kind filter',exact=True).select_option('Group code');self.settle()
        self.page.evaluate("v.selectKey(v.visibleRows.find(r=>r.values[0]==='5').key);v.openRelated(v.related[0])");self.settle()
        self.assertJS("v.drillView.rows.length===v.selectedRow.values[2] && v.drillView.rows.length>50")
        self.page.keyboard.press('Escape');self.assertJS("!v.drill && v.facetValues.get(1)==='Group code'")

    def test_21_projection_and_typed_view_lifetimes_dispose_together(self):
        self.launch('showStatsOverlayBtn','overlayStatsContent');self.page.evaluate("v.setMode('spreadsheet');v.openRelated(v.related[0]);window.views=[v,v.drillView];window.book=v.spreadsheet.book;w.dispose();w.dispose()")
        self.assertJS("views.every(v=>v.disposed) && app.analysisReports.disposed && app.tabularReports.projections.size===0 && app.analysisReports.views.size===0")

    def test_22_async_diagnostics_results_remain_bound_to_started_document(self):
        self.launch('showDiagnosticsOverlayBtn','analysisDiagnostics')
        self.page.evaluate("window.first=app.documentWorkspace.active;window.resolveRun=null;window.DXFDiagnosticsEngine=class{async runFullDiagnostics(){return await new Promise(r=>window.resolveRun=r)}};void app.runDiagnostics()")
        self.fixture('Right','second.dxf')
        self.page.evaluate("resolveRun({structural:[{title:'First file issue',severity:'warning',description:'Captured document'}],integrity:[],rendering:[],text:[],performance:[],compliance:[],bestPractices:[],security:[],stats:{totalIssues:1,warningIssues:1}})");self.settle()
        self.assertJS("w.require('diagnosticsOverlay').sourceTabId===first.tab.id && v.rows[0].values[0]==='First file issue' && app.analysisReports.diagnosticResults.has(first.tab.id)")

    def test_23_block_collections_include_more_than_legacy_card_limits(self):
        data=(ROOT/'tests/data/analysis-workbench.dxf').read_text()
        inserts=''.join(f'0\nINSERT\n5\n{0xB200+i:X}\n2\nPUMP\n8\nEQUIPMENT\n10\n{i*25}\n20\n80\n30\n0\n' for i in range(24))
        marker='0\nENDSEC\n0\nSECTION\n2\nOBJECTS'
        self.assertIn(marker,data)
        self.page.locator('#fileInputLeft').set_input_files({'name':'many-inserts.dxf','mimeType':'application/dxf','buffer':data.replace(marker,inserts+marker).encode()})
        self.settle();self.launch('showBlocksOverlayBtn','overlayBlocksContent')
        self.assertJS("v.selectedRow.values[1]===36 && v.related.find(c=>c.title==='Instances').rows.length===36 && v.related.find(c=>c.title==='Block diagnostics').rows.length>8")
        self.page.evaluate("v.openRelated(v.related.find(c=>c.title==='Instances'));v.drillView.search.value='B217';v.drillView.refresh()")
        self.assertJS("v.drillView.visibleRows.length===1 && v.drillView.selectedRow.values[0]==='B217'")

    def test_24_reference_ambiguity_requires_explicit_candidate(self):
        self.page.evaluate("app.getActiveTab().originalTreeData.push({id:90001,type:'XRECORD',handle:'F01',line:1600,properties:[{code:330,value:'E1'}],children:[]})")
        self.launch('showHandleMapOverlayBtn','overlayHandleMapContent')
        self.page.evaluate("v.search.value='F01';v.refresh();v.selectKey(v.visibleRows.find(r=>r.values[0]==='F01').key);v.openRelated(v.related.find(c=>c.title==='DXF properties'))")
        self.assertJS("v.drillView.rows[0].actions.length===0 && v.drillView.related[0].title==='Reference candidates' && v.drillView.related[0].rows.length===2")

    def test_25_diagnostics_export_uses_bound_source_filename(self):
        self.launch('showDiagnosticsOverlayBtn','analysisDiagnostics')
        self.page.get_by_role('button',name='Run Analysis',exact=True).click();self.page.wait_for_function('!!app.lastDiagnosticsResults');self.settle()
        self.fixture('Right','other.dxf')
        self.page.evaluate("XLSX.writeFile=(book,name)=>window.savedReport={name,file:book.Sheets.Summary.B3.v};w.show('diagnosticsOverlay')")
        self.page.get_by_role('button',name='Export Report',exact=True).click();self.settle()
        self.assertJS("savedReport.name.startsWith('analysis-workbench.dxf_diagnostics_') && savedReport.file==='analysis-workbench.dxf'")

    def test_26_typed_row_selection_survives_insert_before_source_node(self):
        self.launch('showTextsOverlayBtn','overlayTextsContent')
        self.page.evaluate("v.selectKey(v.rows.find(r=>r.values[1]==='MTEXT').key);window.selected=v.selectedKey;app.getActiveTab().originalTreeData.unshift({id:99001,type:'TEXT',line:1,properties:[{code:1,value:'Added'}],children:[]});app.updateTexts()")
        self.assertJS("v.selectedKey===selected && v.selectedRow.values[1]==='MTEXT'")

if __name__=='__main__':
    print('HTTP + native analysis controls',flush=True)
    unittest.main(verbosity=2)
