#!/usr/bin/env python3
"""Linked visualizations with real HTTP, native record controls and renderer navigation."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import unittest
from xml.etree import ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('analysis_harness',ROOT/'tests/analysis-views.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
h=a.h
ARTIFACTS=ROOT/'test-results/analysis-visuals'

class VisualTests(unittest.TestCase):
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
    fixture=a.AnalysisTests.fixture
    launch=a.AnalysisTests.launch
    def visual(self,button='showStatsOverlayBtn',container='overlayStatsContent',kind=None):
        self.launch(button,container)
        self.page.evaluate("v.visuals.setLayout('split')")
        if kind:self.page.evaluate('(kind)=>{v.visuals.state.kind=kind;v.visuals.schedule()}',kind)
        self.settle();self.page.wait_for_function('!v.visuals.dirty && !v.visuals.frame')
        return self.page.locator('#'+container+' .analysis-visuals').first
    def kind(self,kind):
        self.page.locator('[aria-label=Visualization]:visible').first.select_option(kind);self.settle()
    def bare(self,rows,columns=('Group','Count','Category')):
        self.page.evaluate('''({rows,columns})=>{
            const host=document.createElement('div');host.id='visual-test';host.style.cssText='position:fixed;inset:210px 25px 25px;z-index:10000;background:white';document.body.append(host);
            window.v=new DxfAnalysis.AnalysisView(host,{title:'Visual test',columns,rows,height:600,docking:false});v.visuals.setLayout('split');
        }''',{'rows':rows,'columns':list(columns)})
        self.settle()

    def test_01_all_typed_report_visuals_keep_original_native_records(self):
        for button,container in [('showStatsOverlayBtn','overlayStatsContent'),('showCloudOverlayBtn','overlayObjectCloud'),('showDepsOverlayBtn','overlayDepsContent'),('showHandleMapOverlayBtn','overlayHandleMapContent'),('showFontsOverlayBtn','overlayFontsContent'),('showClassesOverlayBtn','overlayClassesContent'),('showLineTypesOverlayBtn','overlayLineTypesContent'),('showTextsOverlayBtn','overlayTextsContent'),('showBinaryObjectsOverlayBtn','binaryObjectsList'),('showProxyObjectsOverlayBtn','proxyObjectsList'),('showObjectSizeOverlayBtn','objectSizeList'),('showBlocksOverlayBtn','overlayBlocksContent')]:
            with self.subTest(button=button):
                self.visual(button,container)
                self.assertJS("v.visuals && v.grid.Model instanceof TreeDataGridCore.HierarchicalTreeDataGridSource && !v.spreadsheet && v.visuals.body.childElementCount>0")
                self.assertNotIn('Visualization unavailable',self.page.evaluate('v.visuals.body.textContent'))

    def test_02_distribution_filters_records_and_spreadsheet_not_totals(self):
        visual=self.visual();self.page.evaluate('window.total=v.rows.reduce((n,r)=>n+r.values[1],0);window.diagram=v.visuals.chartData.length')
        visual.get_by_role('button',name='LINE:',exact=False).click();self.settle()
        self.assertJS("v.matchingRows.length===1 && v.matchingRows[0].values[0]==='LINE' && v.visuals.chartData.length===diagram && v.rows.reduce((n,r)=>n+r.values[1],0)===total")
        self.page.locator('#statsOverlay').get_by_role('button',name='Spreadsheet',exact=True).click();self.settle()
        self.assertJS("v.spreadsheet.book.ActiveWorksheet.GetCell('A2').Value==='LINE' && v.spreadsheet.visibleRows.length===1")
        visual.get_by_role('button',name='LINE:',exact=False).click();self.settle();self.assertJS('!v.visualFilter && v.matchingRows.length===v.allRows.length')

    def test_03_chart_data_keeps_exact_sources_and_returns_to_parent(self):
        self.visual();self.page.evaluate('window.gridBefore=v.grid;window.k=v.selectedKey')
        self.page.locator('#statsOverlay').get_by_role('button',name='Chart data',exact=True).click();self.settle()
        self.assertJS("v.drillView && !v.drillView.visuals && v.drillView.rows.length===v.rows.length && v.drillView.rows[0].values[1]===v.visuals.chartData[0].value")
        self.page.evaluate("v.drillView.rows[0].actions[0].run()");self.settle()
        self.assertJS('!v.drillView && v.grid===gridBefore && !!v.visualFilter && v.matchingRows.length===1')

    def test_04_facets_search_and_visual_filters_compose(self):
        self.visual('showTextsOverlayBtn','overlayTextsContent','distribution')
        self.page.locator('#textsOverlay').get_by_role('combobox',name='Type filter',exact=True).select_option('TEXT');self.settle()
        self.page.evaluate('window.contextCount=v.contextRows.length;v.visuals.filter(v.visuals.chartData[0])');self.settle()
        self.assertJS("v.matchingRows.every(r=>r.values[1]==='TEXT') && v.contextRows.length===contextCount && v.visuals.chartData.reduce((n,b)=>n+b.count,0)===contextCount")
        self.page.locator('#textsOverlay').get_by_role('button',name='Reset filters',exact=True).click();self.settle()
        self.assertJS('!v.visualFilter && !v.facetValues.size && v.matchingRows.length===v.allRows.length')

    def test_05_histogram_membership_and_exact_bound_inspection(self):
        self.visual('showObjectSizeOverlayBtn','objectSizeList')
        self.assertJS("v.visuals.state.kind==='histogram' && v.visuals.chartData.reduce((n,b)=>n+b.value,0)===v.contextRows.length")
        self.page.evaluate('v.visuals.openData()');self.settle()
        self.assertJS("v.drillView.rows[0].metadata[0][1]===v.visuals.chartData[0].lo && v.drillView.rows.at(-1).metadata[2][1]===true")
        self.page.keyboard.press('Escape');self.settle();self.assertJS('!v.drillView')

    def test_06_diagnostic_matrix_uses_actual_findings(self):
        self.visual('showDiagnosticsOverlayBtn','analysisDiagnostics')
        self.page.get_by_role('button',name='Run Analysis',exact=True).click();self.page.wait_for_function('!!app.lastDiagnosticsResults');self.settle()
        self.assertJS("v.visuals.state.kind==='matrix' && v.visuals.chartData.reduce((n,b)=>n+b.value,0)===v.rows.length")
        self.page.locator('#diagnosticsOverlay .av-cell[role=button]').first.click();self.settle()
        self.assertJS('v.matchingRows.length>0 && v.matchingRows.every(r=>r.values[1]===v.matchingRows[0].values[1] && r.values[2]===v.matchingRows[0].values[2])')

    def test_07_rule_matrix_scopes_inline_bulk_commands(self):
        self.page.evaluate("document.getElementById('configureRulesBtn').click()");self.settle()
        self.page.evaluate("window.v=[...app.tabularReports.projections].find(p=>p.source.id==='ruleConfigContent').view;w.manager.Find('ruleConfigOverlay').Dock();v.visuals.setLayout('split')")
        self.settle();self.assertJS("v.visuals.state.kind==='matrix'")
        self.page.evaluate("window.otherRules=[...document.querySelectorAll('.rule-item:not([data-category=security]) input')].map(x=>x.checked);let b=v.visuals.chartData.find(b=>/security/i.test(b.label)&&b.value);v.visuals.filter(b)")
        self.settle();self.page.locator('[data-grid-title="Diagnostic Rules"]').get_by_role('button',name='Disable filtered',exact=True).click();self.settle()
        self.assertJS("[...document.querySelectorAll('.rule-item[data-category=security] input')].every(i=>!i.checked) && JSON.stringify(otherRules)===JSON.stringify([...document.querySelectorAll('.rule-item:not([data-category=security]) input')].map(x=>x.checked))")

    def test_08_fonts_count_roots_once_and_allow_leaf_population(self):
        self.visual('showFontsOverlayBtn','overlayFontsContent')
        self.assertJS("v.visuals.state.scope==='roots' && v.visuals.chartData.reduce((n,b)=>n+b.value,0)===v.rows.reduce((n,r)=>n+r.values[3],0)")
        self.page.locator('#fontsOverlay').get_by_role('combobox',name='Visual population',exact=True).select_option('leaves');self.settle()
        self.assertJS('v.visuals.population().every(r=>!r.children?.length)')

    def test_09_reference_graph_retains_duplicate_candidates_and_missing_targets(self):
        self.page.evaluate("app.getActiveTab().originalTreeData.push({id:90101,type:'XRECORD',handle:'F01',line:1600,properties:[{code:330,value:'E1'},{code:360,value:'DEAD'}],children:[]})")
        self.visual('showHandleMapOverlayBtn','overlayHandleMapContent','relationships')
        self.page.evaluate("v.revealKey(v.allRows.find(r=>r.values[0]==='F01').key)");self.settle()
        self.assertJS("v.visuals.relationRows.filter(r=>r.label.startsWith('Ambiguous')).length===2 && v.visuals.relationRows.some(r=>r.row.values[0]==='DEAD' && r.label.startsWith('Unresolved'))")
        self.page.locator('#handleMapOverlay').get_by_role('button',name='All relationships',exact=True).click();self.settle()
        self.assertJS('v.drillView.rows.length===3')

    def test_10_cyclic_ownership_relationships_are_still_inspectable(self):
        self.visual('showHandleMapOverlayBtn','overlayHandleMapContent','relationships')
        self.page.evaluate("v.revealKey(v.allRows.find(r=>r.values[4]==='Owner cycle').key)");self.settle()
        self.assertJS("v.visuals.relationRows.length>=2 && v.visuals.body.querySelectorAll('.av-edge').length>=2")

    def test_11_graph_is_bounded_but_all_relationships_are_available(self):
        self.visual('showBlocksOverlayBtn','overlayBlocksContent','relationships')
        self.assertJS('v.visuals.relationRows.length===12 && v.visuals.body.querySelectorAll(".av-edge").length===6')
        self.page.locator('#blocksOverlay').get_by_role('button',name='All relationships',exact=True).click();self.settle()
        self.assertJS('v.drillView.rows.length===12 && v.drillView.rows.every(r=>r.values[1]==="Block INSERT")')

    def test_12_text_cards_page_without_losing_keyboard_focus(self):
        self.visual('showTextsOverlayBtn','overlayTextsContent')
        self.assertEqual(6,self.page.locator('#textsOverlay .analysis-preview-card').count())
        self.page.locator('#textsOverlay .analysis-preview-card > button').nth(2).focus();self.page.keyboard.press('Enter');self.settle()
        self.assertJS("document.activeElement.matches('.analysis-preview-card > button') && document.activeElement.getAttribute('aria-pressed')==='true'")
        self.page.locator('#textsOverlay').get_by_role('button',name='Next cards',exact=True).click();self.settle()
        self.assertJS('v.visuals.galleryStart===6 && v.visuals.chartRows.length>0')

    def test_13_block_cards_retain_full_metadata_and_collection(self):
        self.visual('showBlocksOverlayBtn','overlayBlocksContent')
        self.assertJS("v.visuals.state.kind==='gallery' && v.visuals.chartRows[0].values[1]===12 && v.related.some(c=>c.title==='Instances' && c.rows.length===12)")
        self.assertGreater(self.page.locator('#blocksOverlay .analysis-preview-card').count(),0)

    def test_14_line_type_cards_reorder_with_table_sort(self):
        self.visual('showLineTypesOverlayBtn','overlayLineTypesContent')
        self.assertGreater(self.page.locator('#lineTypesOverlay .analysis-preview-card svg').count(),0)
        self.page.locator('#lineTypesOverlay').get_by_role('combobox',name='Sort Line Types',exact=True).select_option('2');self.settle()
        self.assertJS('v.visuals.chartRows[0].values[2]===Math.min(...v.contextRows.map(r=>r.values[2]))')

    def test_15_hex_visual_counts_current_page_bytes(self):
        self.page.evaluate("app.showHexViewer('00004142FF')");self.settle()
        self.page.evaluate("window.v=document.querySelector('[data-grid-title=\"Binary Data\"]').analysisView;v.visuals.setLayout('split')");self.settle()
        self.assertJS("v.visuals.state.kind==='bytes' && v.visuals.chartData.reduce((n,b)=>n+b.value,0)===5")
        self.assertIn('Current page/filter: 5 bytes',self.page.evaluate('v.visuals.footer.textContent'))

    def test_16_frequency_populations_do_not_mix_denominators(self):
        self.visual('showCloudOverlayBtn','overlayObjectCloud')
        self.assertJS('new Set(v.visuals.population().map(r=>r.values[1])).size===1')
        self.page.locator('#cloudOverlay').get_by_role('combobox',name='Frequency population',exact=True).select_option('Group code');self.settle()
        self.assertJS("v.visuals.population().every(r=>r.values[1]==='Group code') && v.visuals.chartData.reduce((n,b)=>n+b.value,0)===v.contextRows.filter(r=>r.values[1]==='Group code').reduce((n,r)=>n+r.values[2],0)")

    def test_17_pinned_comparison_is_value_snapshot_not_live_row(self):
        self.visual();self.page.evaluate('v.selectIndex(0);v.pinSelection();window.value=v.pinned.values[1];v.rows[0].values[1]+=10;v.refresh();v.selectIndex(0);v.compareSelection()');self.settle()
        self.assertJS("v.drillView.rows[1].values[1]===value && v.drillView.rows[1].values[2]===value+10 && v.drillView.rows[1].values[3]==='Changed'")

    def test_18_saved_presentation_restores_chart_filter_and_native_table(self):
        self.visual();self.page.evaluate("v.visuals.filter(v.visuals.chartData[0]);v.pinSelection();v.visuals.setLayout('visual');window.state=v.saveState();window.oldGrid=v.grid;v.clearFilters();v.visuals.setLayout('data');v.restoreState(state)");self.settle()
        self.assertJS("v.grid===oldGrid && v.visualFilter && v.pinned && v.host.dataset.visualLayout==='visual' && v.matchingRows.length===1")
        self.page.locator('#statsOverlay').get_by_role('button',name='Records',exact=True).click();self.settle();self.assertJS("v.host.dataset.visualLayout==='split' && !v.grid.hidden")

    def test_19_disposal_releases_visuals_and_nested_grids(self):
        self.visual();self.page.evaluate('window.visual=v.visuals;v.visuals.openData();window.child=v.drillView;v.dispose();v.dispose()')
        self.assertJS('visual.disposed && !visual.view && !visual.diagram && visual.chartData.length===0 && child.disposed && !v.host.isConnected')

    def test_20_svg_export_is_self_contained_safe_and_theme_resolved(self):
        self.bare([{'key':'x','values':['<script>alert(1)</script>',3,'A']}]);self.page.evaluate("v.setTheme('dark')");self.settle()
        with self.page.expect_download() as pending:self.page.locator('#visual-test').get_by_role('button',name='Save SVG',exact=True).click()
        path=ARTIFACTS/'safe-dark.svg';pending.value.save_as(path);text=path.read_text();root=ET.fromstring(text)
        self.assertIn('&lt;script&gt;',text);self.assertNotIn('<script>',text);self.assertNotIn('onclick=',text);self.assertNotIn('var(',text)
        self.assertEqual('{http://www.w3.org/2000/svg}svg',root.tag)
        self.assertTrue(any(n.tag.endswith('rect') and n.attrib.get('width')=='760' for n in root))

    def test_21_closed_source_retains_inspection_but_rejects_navigation(self):
        self.visual('showTextsOverlayBtn','overlayTextsContent');self.page.evaluate("window.source=app.documentWorkspace.active;w.manager.Find('textsOverlay').Dock();w.manager.Find(source.id).Close()");self.settle()
        self.page.evaluate("v.runAction(()=>v.selectedRow.actions.find(a=>a.label==='Show in Tree').run())");self.settle()
        self.assertJS("v.count.textContent.includes('source drawing is closed') && v.rows.length>0 && w.isOpen('textsOverlay')")
        self.page.locator('#textsOverlay').get_by_role('button',name='Chart data',exact=True).click();self.settle();self.assertJS('v.drillView.rows.length>0')

    def test_22_locate_in_native_drawing_uses_bound_source_not_active_file(self):
        self.visual('showTextsOverlayBtn','overlayTextsContent');self.page.evaluate("window.source=app.documentWorkspace.active;v.selectKey(v.allRows.find(r=>r.values[1]==='TEXT' && r.node.handle).key);window.target=v.selectedRow;w.manager.Find('textsOverlay').Dock()")
        self.fixture('Right','other.dxf')
        self.page.evaluate("async()=>{await target.actions.find(a=>a.label==='Locate in Drawing').run()}");self.settle()
        self.assertJS("app.documentWorkspace.active===source && app.renderingOverlayController.currentTabId===source.tab.id && w.isOpen('textsOverlay') && app.renderingOverlayController.surfaceManager.host.paintCount>0")

    def test_23_source_refresh_is_distinct_from_rebind_to_active(self):
        self.visual();self.page.evaluate("window.source=app.documentWorkspace.active;w.manager.Find('statsOverlay').Dock()")
        self.fixture('Right','other.dxf');self.page.evaluate("w.show('statsOverlay')");self.settle()
        self.page.evaluate("rb.execute('report-refresh-source')");self.settle()
        self.assertJS("w.require('statsOverlay').sourceTabId===source.tab.id && app.documentWorkspace.active===source")

    def test_24_compact_panes_default_to_data_but_visuals_remain_available(self):
        self.bare([{'key':'x','values':['A',1,'B']}]);self.page.evaluate("document.getElementById('visual-test').style.width='420px';document.getElementById('visual-test').style.height='390px';v.visuals.setLayout('auto');v.setTheme('dark')");self.settle()
        self.assertJS("v.host.dataset.visualLayout==='data' && v.visuals.host.hidden && !v.grid.hidden")
        self.page.locator('#visual-test').get_by_role('button',name='Visuals',exact=True).click();self.settle()
        self.assertJS("!v.visuals.host.hidden && v.grid===v.host.querySelector('tree-data-grid')")
        self.assertJS("v.host.scrollWidth<=v.host.clientWidth+2")

    def test_25_twenty_thousand_records_use_bounded_marks_and_full_chart_data(self):
        self.bare([{'key':i,'values':['Group '+str(i%41),i%10,'C']} for i in range(20000)])
        self.assertJS("v.visuals.body.querySelectorAll('.av-bar').length===6 && v.visuals.chartData.length===41 && v.grid.shadowRoot.querySelectorAll('[role=row]').length<200")
        self.page.locator('#visual-test .av-bar').last.click();self.settle()
        self.assertJS('v.matchingRows.length===v.visualFilter.keys.size && v.matchingRows.length>10000')

    def test_26_hidden_visuals_defer_work_and_recompute_on_show(self):
        self.visual();self.page.evaluate("v.visuals.setLayout('data');v.setRows([{key:'a',values:['Only',15,100,15]}])");self.settle()
        self.assertJS('v.visuals.dirty && !v.visuals.frame')
        self.page.locator('#statsOverlay').get_by_role('button',name='Visuals',exact=True).click();self.settle()
        self.assertJS("v.visuals.chartData.length===1 && v.visuals.chartData[0].value===15 && !v.visuals.dirty")

    def test_27_focus_visual_expands_bar_budget_without_losing_table(self):
        self.visual();self.page.evaluate('window.gridBefore=v.grid');self.assertJS("v.visuals.body.querySelectorAll('.av-bar').length===6")
        self.page.locator('#statsOverlay').get_by_role('button',name='Focus visual',exact=True).click();self.settle()
        self.assertJS("v.visuals.body.querySelectorAll('.av-bar').length===14 && v.grid===gridBefore")
        self.page.locator('#statsOverlay').get_by_role('button',name='Records',exact=True).click();self.settle()
        self.assertJS("v.visuals.body.querySelectorAll('.av-bar').length===6 && v.grid===gridBefore")

    def test_28_chart_keyboard_filter_retains_focus_and_can_toggle_back(self):
        self.visual();self.page.locator('#statsOverlay .av-bar').first.focus();self.page.keyboard.press('Enter');self.settle()
        self.assertJS("v.visualFilter && document.activeElement.matches('.av-bar')")
        self.page.keyboard.press('Enter');self.settle();self.assertJS('!v.visualFilter')
        self.page.locator('#statsOverlay [aria-label="Resize visualization"]').focus();self.page.keyboard.press('ArrowDown');self.assertJS('v.visuals.height>210')

    def test_29_visual_errors_do_not_hide_or_corrupt_records(self):
        self.bare([{'key':1,'values':['Overflow',1e308,'A']},{'key':2,'values':['Overflow',1e308,'A']}]);self.page.evaluate('v.visuals.state.measure=1;v.visuals.schedule()');self.settle()
        self.assertIn('finite numeric range',self.page.evaluate('v.visuals.body.textContent'))
        self.assertJS('v.rows.length===2 && v.matchingRows.length===2 && !v.grid.hidden')

    def test_30_cards_use_context_not_their_own_visual_filter(self):
        self.visual('showTextsOverlayBtn','overlayTextsContent');self.page.evaluate('window.before=v.visuals.chartData.length;v.setVisualFilter({label:"one",keys:[v.allRows[0].key]})');self.settle()
        self.assertJS('v.matchingRows.length===1 && v.visuals.chartData.length===before && v.visuals.chartRows.length===6')

    def test_31_closed_source_chart_data_can_filter_snapshot_records(self):
        self.visual();self.page.evaluate("window.source=app.documentWorkspace.active;w.manager.Find('statsOverlay').Dock();w.manager.Find(source.id).Close()")
        self.settle();self.page.locator('#statsOverlay').get_by_role('button',name='Chart data',exact=True).click();self.settle()
        self.page.locator('#statsOverlay .analysis-drill .analysis-details > .dxf-grid-actions').get_by_role('button',name='Inspect records',exact=True).click();self.settle()
        self.assertJS('!v.drillView && v.visualFilter && v.matchingRows.length===1 && !app.documentWorkspace.active')

    def test_32_native_renderer_tool_panels_also_keep_visual_and_record_controls(self):
        self.page.evaluate("app.openRenderingOverlay('left')");self.settle()
        self.page.evaluate("for(const id of ['render-info','render-layers','render-blocks'])w.show(id)");self.settle()
        self.assertJS("[...document.querySelectorAll('#renderingOverlayInfoPanel .dxf-analysis-view,#renderingOverlayLayersPanel .dxf-analysis-view,#renderingOverlayBlocksPanel .dxf-analysis-view')].length>=3")
        self.assertJS("[...document.querySelectorAll('#renderingOverlayInfoPanel .dxf-analysis-view,#renderingOverlayLayersPanel .dxf-analysis-view,#renderingOverlayBlocksPanel .dxf-analysis-view')].every(h=>h.analysisView.visuals && h.analysisView.grid.Model instanceof TreeDataGridCore.HierarchicalTreeDataGridSource)")

    def test_33_new_source_resets_pinned_values_and_visual_key_filter(self):
        self.visual();self.page.evaluate('v.pinSelection();v.visuals.filter(v.visuals.chartData[0]);window.firstSource=app.documentWorkspace.active')
        self.fixture('Right','other.dxf');self.page.evaluate("app.updateStats()");self.settle()
        self.assertJS("!v.pinned && !v.visualFilter && w.require('statsOverlay').sourceTabId!==firstSource.tab.id && v.matchingRows.length===v.allRows.length")

    def test_34_matrix_keyboard_selection_has_a_pressed_state(self):
        self.visual('showDiagnosticsOverlayBtn','analysisDiagnostics');self.page.get_by_role('button',name='Run Analysis',exact=True).click();self.page.wait_for_function('!!app.lastDiagnosticsResults');self.settle()
        self.page.locator('#diagnosticsOverlay .av-cell[role=button]').first.focus();self.page.keyboard.press('Space');self.settle()
        self.assertJS("v.visualFilter && document.activeElement.matches('.av-cell') && document.activeElement.getAttribute('aria-pressed')==='true'")
        self.page.keyboard.press('Space');self.settle();self.assertJS('!v.visualFilter')

if __name__=='__main__':unittest.main(verbosity=2)
