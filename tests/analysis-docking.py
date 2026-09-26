#!/usr/bin/env python3
"""Native nested Dockyard layouts in standalone controls and all current report views."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('analysis_harness',ROOT/'tests/analysis-views.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
h=a.h
OUT=ROOT/'test-results/analysis-docking'

class DockingAnalysisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):h.DockingTests.setUpClass.__func__(cls);OUT.mkdir(parents=True,exist_ok=True)
    @classmethod
    def tearDownClass(cls):h.DockingTests.tearDownClass.__func__(cls)
    def setUp(self):
        h.DockingTests.setUp(self)
        self.page.goto(self.base+'tests/analysis-docking.html',wait_until='domcontentloaded')
        self.page.wait_for_function('window.analysisDemo?.v.docking')
        self.page.evaluate('() => {window.v=analysisDemo.v;window.d=v.docking;window.s=analysisDemo.second;}');self.settle()
    def tearDown(self):
        try:self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')))
        finally:self.context.close()
        self.assertEqual([],self.errors,'Uncaught application errors')
    settle=h.DockingTests.settle
    assertJS=h.DockingTests.assertJS
    def test_dock_01_independent_controls_and_real_docking_without_app(self):
        self.assertJS('!window.app && !window.DxfAnalysis && !window.DxfDocking && d.manager instanceof AvalonDock.DockingManager')
        self.assertJS("d.isVisible('records') && d.isVisible('visual') && d.isVisible('details') && v.grid.clientHeight>300 && s.docking!==d")
        self.assertJS('v.host.scrollWidth<=v.host.clientWidth+2')
    def test_dock_02_move_float_and_restore_retains_model_selection_and_filters(self):
        self.page.evaluate("() => {v.search.value='Equipment 1';v.refresh();v.selectKey(1);window.originalGrid=v.grid;window.originalModel=v.treeModel;d.manager.Float(d.manager.Find('details'),{FloatingWidth:400,FloatingHeight:320});}");self.settle()
        self.assertJS("d.manager.Find('details').IsFloating && v.selectedKey===1 && v.grid===originalGrid && v.treeModel===originalModel")
        self.page.evaluate("() => {d.manager.Find('details').Dock();}");self.settle()
        self.assertJS("!d.manager.Find('details').IsFloating && v.search.value==='Equipment 1' && s.rows.length===3")
    def test_dock_03_narrow_resize_tabs_keep_usable_records_and_details(self):
        self.page.evaluate("() => {document.getElementById('primary').style.width='390px';}");self.settle()
        self.assertJS("v.main.dataset.arrangement==='tabs' && d.isVisible('records') && v.grid.clientHeight>300 && !d.isVisible('details')")
        self.page.locator('#primary .analysis-modes').get_by_role('button',name='Details',exact=True).click();self.settle()
        self.assertJS("d.isVisible('details') && v.details.clientHeight>300 && !d.isVisible('records')")
        self.page.locator('#primary .analysis-modes').get_by_role('button',name='Records',exact=True).click();self.settle()
        self.assertJS("d.isVisible('records') && !v.grid.hidden && v.host.scrollWidth<=v.host.clientWidth+2")
    def test_dock_04_focus_restore_keeps_full_custom_arrangement(self):
        self.page.evaluate("() => {d.setPreset('stacked');window.original=v.grid;}");self.settle()
        self.page.evaluate("() => {d.focus('visual');}");self.settle()
        self.assertJS("d.focused==='visual' && d.isVisible('visual') && !d.isVisible('records') && v.visuals.host.clientHeight>400")
        self.page.locator('#primary').get_by_role('button',name='Restore panes',exact=True).click();self.settle()
        self.assertJS("!d.focused && d.isVisible('records') && d.isVisible('details') && v.grid===original")
    def test_dock_05_state_roundtrip_keeps_nodes_and_rejects_foreign_or_missing_panels(self):
        self.page.evaluate("() => {d.setPreset('stacked');window.state=d.saveState();window.grid=v.grid;d.setPreset('tabs');d.restoreState(state);}");self.settle()
        self.assertJS("d.preset==='stacked' && v.grid===grid && d.isVisible('details')")
        self.assertJS("""(() => {const before=d.manager.SaveLayout();for(const bad of [{...state,version:2},{...state,panels:['foreign']},{...state,layout:{}}]) {
            let threw=false;try{d.restoreState(bad);}catch(e){threw=true;}if(!threw||d.manager.SaveLayout()!==before)return false;}return true;})()""")
    def test_dock_06_native_keyboard_splitter_and_history(self):
        self.page.evaluate("() => {d.setPreset('balanced');window.width=v.details.clientWidth;}");self.settle()
        self.page.evaluate('window.width=v.details.clientWidth')
        self.page.locator('#primary .analysis-dock-host .ad-splitter').last.focus();self.page.keyboard.press('ArrowLeft');self.settle()
        self.assertJS('v.details.clientWidth>width && d.custom')
        self.page.locator('#primary').get_by_role('button',name='Undo layout',exact=True).click();self.settle()
        self.assertJS('Math.abs(v.details.clientWidth-width)<3')
    def test_dock_07_spreadsheet_and_chart_filters_stay_linked(self):
        self.page.locator('#primary .analysis-modes').get_by_role('button',name='Spreadsheet',exact=True).click();self.settle()
        self.assertJS("v.spreadsheet && v.mode==='spreadsheet' && d.isVisible('records')")
        self.page.evaluate("() => {v.setVisualFilter({label:'subset',keys:[1,4,7]});}");self.settle()
        self.assertJS('v.visibleRows.length===3 && v.spreadsheet.rows.length===3 && s.rows.length===3')
    def test_dock_08_disposal_disconnects_layout_and_retains_other_view(self):
        self.page.evaluate('() => {v.dispose();v.dispose();}');self.settle()
        self.assertJS('d.disposed && !d.host.isConnected && s.host.isConnected && !s.docking.disposed')
    def test_dock_09_optional_layout_and_foreign_container_validation(self):
        self.assertJS("""(() => {const foreign=document.implementation.createHTMLDocument(); const c=foreign.createElement('div');
            let threw=false;try{new analysisDemo.Layout({container:c,records:c,details:c});}catch(e){threw=true;}
            return threw && !c.childNodes.length && d.isOpen('records');})()""")
    def test_dock_10_every_typed_application_report_gets_docking(self):
        h.DockingTests.load(self);a.AnalysisTests.fixture(self)
        for button,container in [('showStatsOverlayBtn','overlayStatsContent'),('showCloudOverlayBtn','overlayObjectCloud'),('showDepsOverlayBtn','overlayDepsContent'),('showHandleMapOverlayBtn','overlayHandleMapContent'),('showFontsOverlayBtn','overlayFontsContent'),('showClassesOverlayBtn','overlayClassesContent'),('showLineTypesOverlayBtn','overlayLineTypesContent'),('showTextsOverlayBtn','overlayTextsContent'),('showBinaryObjectsOverlayBtn','binaryObjectsList'),('showProxyObjectsOverlayBtn','proxyObjectsList'),('showObjectSizeOverlayBtn','objectSizeList'),('showBlocksOverlayBtn','overlayBlocksContent')]:
            with self.subTest(button=button):
                a.AnalysisTests.launch(self,button,container)
                self.assertJS("!!v.docking && v.docking.manager instanceof AvalonDock.DockingManager && v.docking.isOpen('records')")
                self.assertJS("v.grid.clientHeight>=130 && v.main.clientHeight>=220")
                self.page.evaluate('() => {for(const model of [...w.manager.Layout.FloatingWindows]) for(const item of model.Descendents()) if(item.ContentId) w.hide(item.ContentId);}')
    def test_dock_11_expand_analysis_preserves_source_selection(self):
        h.DockingTests.load(self);a.AnalysisTests.fixture(self);a.AnalysisTests.launch(self,'showStatsOverlayBtn','overlayStatsContent')
        self.page.evaluate('() => {v.selectIndex(0);window.key=v.selectedKey;window.grid=v.grid;}')
        self.page.locator('#statsOverlay').get_by_role('button',name='Expand analysis',exact=True).click();self.settle()
        self.assertJS('w.manager.Find("statsOverlay").FindParent(AvalonDock.LayoutFloatingWindow).IsMaximized && v.selectedKey===key && v.grid===grid')
        self.assertJS('v.main.clientHeight>450')
    def test_dock_12_workspace_disposal_retires_report_layouts(self):
        h.DockingTests.load(self);a.AnalysisTests.fixture(self);a.AnalysisTests.launch(self,'showStatsOverlayBtn','overlayStatsContent')
        self.page.evaluate('() => {window.old=v.docking;w.dispose();}');self.settle()
        self.assertJS('old.disposed && !old.host.isConnected')

    def test_dock_13_native_tab_gesture_floats_and_reset_restores_panes(self):
        self.page.locator('#primary .analysis-dock-host .ad-tab[data-tab-id="details"]').dblclick();self.settle()
        self.assertJS("d.manager.Find('details').IsFloating && d.isVisible('details') && d.custom")
        self.page.locator('#primary .analysis-layout-toolbar').get_by_role('button',name='Reset layout',exact=True).click();self.settle()
        self.assertJS("!d.manager.Find('details').IsFloating && d.isVisible('records') && !d.custom")
    def test_dock_14_reload_restores_only_layout_metadata(self):
        self.page.evaluate("() => {d.setPreset('stacked');d.hide('visual');d.flush();}");self.settle()
        self.page.reload(wait_until='domcontentloaded');self.page.wait_for_function('window.analysisDemo?.v.docking');self.settle()
        self.assertJS("analysisDemo.v.docking.preset==='stacked' && !analysisDemo.v.docking.isOpen('visual') && analysisDemo.v.docking.isVisible('records') && analysisDemo.v.rows.length===60")
        self.assertJS("!localStorage.getItem('demo.analysis.Equipment analysis').includes('Equipment 59')")

if __name__=='__main__':unittest.main(verbosity=2)
