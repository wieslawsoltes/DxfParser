#!/usr/bin/env python3
"""Compact shared headers, retained disclosure controls, and data-area budgets."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('density_harness', ROOT/'tests/analysis-docking.py')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
OUT = ROOT/'test-results/analysis-density'

class DensityTests(h.DockingAnalysisTests):
    def tearDown(self):
        OUT.mkdir(parents=True, exist_ok=True)
        try:
            self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')))
        finally:
            self.context.close()
        self.assertEqual([], self.errors, 'Uncaught application errors')

    def menu(self, name, root='#primary'):
        self.page.locator(root+' .analysis-'+name+'-menu > button').first.click()
        self.settle()

    def test_density_01_two_rows_leave_records_space_at_all_sizes(self):
        metrics=[]
        for width,height in [(1280,720),(760,520),(390,320),(320,260)]:
            self.page.evaluate('([w,h])=>Object.assign(document.getElementById("primary").style,{width:w+"px",height:h+"px"})',[width,height]);self.settle()
            value=self.page.evaluate('() => ({width:v.host.clientWidth,height:v.host.clientHeight,chrome:v.main.getBoundingClientRect().top-v.host.getBoundingClientRect().top,records:v.grid.clientHeight,overflow:v.host.scrollWidth-v.host.clientWidth})')
            metrics.append(value)
            self.assertLessEqual(value['chrome'],84,value)
            self.assertLessEqual(value['overflow'],2,value)
            self.assertGreaterEqual(value['records'],height-118,value)
        OUT.mkdir(parents=True,exist_ok=True);(OUT/'header-metrics.json').write_text(json.dumps(metrics,indent=2))

    def test_density_02_filter_popover_does_not_resize_or_recreate_records(self):
        self.page.evaluate('() => {window.gridBefore=v.grid;window.modelBefore=v.treeModel;window.before=v.grid.clientHeight;}')
        self.menu('filter')
        self.assertJS('v.filterMenu.panel.matches(":popover-open") && v.grid.clientHeight===before && v.grid===gridBefore && v.treeModel===modelBefore')
        self.page.get_by_role('combobox',name='Type filter',exact=True).select_option('Pump');self.settle()
        self.page.keyboard.press('Escape');self.settle()
        self.assertJS('v.facetValues.get(1)==="Pump" && v.filteredRows.length===20 && v.filterMenu.trigger.textContent.includes("1") && document.activeElement===v.filterMenu.trigger')
        self.page.locator('#primary').get_by_role('button',name='Reset filters',exact=True).click();self.settle()
        self.assertJS('v.filteredRows.length===60 && v.filterMenu.trigger.textContent==="Filters"')

    def test_density_03_columns_and_sort_are_reachable_and_retained(self):
        self.menu('filter')
        self.page.get_by_role('combobox',name='Sort Equipment analysis',exact=True).select_option('2')
        self.page.locator('#primary .analysis-column-menu > summary').click()
        self.page.get_by_role('checkbox',name='Show Type column',exact=True).uncheck()
        self.page.keyboard.press('Escape');self.settle();self.menu('filter')
        self.assertJS('v.sort.value==="2" && !v.columnChecks[1][0].IsVisible && !v.columnChecks[1][1].checked && s.columnChecks[1][1].checked')

    def test_density_04_menus_escape_docking_clips_and_remain_in_viewport(self):
        self.page.evaluate('() => {Object.assign(document.getElementById("primary").style,{width:"320px",height:"260px"});}');self.settle()
        self.menu('filter')
        self.assertJS('(() => {const r=v.filterMenu.panel.getBoundingClientRect();return r.width>300 && r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight && v.grid.clientHeight>130;})()')
        self.page.locator('#primary .analysis-column-menu > summary').click();self.settle()
        self.assertJS('v.filterMenu.panel.scrollHeight>=v.filterMenu.panel.clientHeight')

    def test_density_05_layout_menu_retains_native_history(self):
        self.menu('layout')
        self.page.get_by_role('combobox',name='Analysis layout',exact=True).select_option('tabs');self.settle()
        self.assertJS('d.arrangement==="tabs" && v.layoutMenu.panel.matches(":popover-open")')
        self.page.get_by_role('button',name='Reset layout',exact=True).click();self.settle()
        self.page.keyboard.press('Escape');self.settle()
        self.assertJS('d.preset==="auto" && d.isVisible("records") && d.isVisible("visual")')

    def test_density_06_chart_options_retain_figure_and_do_not_consume_chart_height(self):
        self.page.evaluate('() => {window.before=v.visuals.body.clientHeight;}')
        self.menu('chart')
        self.page.get_by_role('combobox',name='Measure visual by',exact=True).select_option('-1');self.settle()
        self.assertJS('v.visuals.state.measure===-1 && v.visuals.body.clientHeight===before && v.visuals.tools.clientHeight<=38')
        self.page.get_by_role('button',name='Chart data',exact=True).click();self.settle()
        self.assertJS('v.drillView && !v.visuals.optionsMenu.panel.matches(":popover-open")')

    def test_density_07_keyboard_disclosure_and_outside_click(self):
        self.page.locator('#primary .analysis-filter-menu > button').focus();self.page.keyboard.press('Enter');self.settle()
        self.page.keyboard.press('Tab')
        self.assertJS('v.filterMenu.panel.contains(document.activeElement) && v.filterMenu.trigger.getAttribute("aria-expanded")==="true"')
        self.page.locator('#primary input[type=search]').click();self.settle()
        self.assertJS('!v.filterMenu.panel.matches(":popover-open") && v.filterMenu.trigger.getAttribute("aria-expanded")==="false"')

    def test_density_08_disposal_and_hidden_hosts_close_popovers(self):
        self.menu('filter');self.page.evaluate('() => {window.panel=v.filterMenu.panel;v.dispose();}');self.settle()
        self.assertJS('!panel.isConnected && !panel.matches(":popover-open") && !s.disposed')
        self.menu('filter','#secondary')
        self.page.evaluate('() => {document.getElementById("secondary").style.display="none";}');self.settle()
        self.assertJS('!s.filterMenu.panel.matches(":popover-open")')

    def test_density_09_error_status_survives_compact_headers(self):
        self.page.evaluate('() => {Object.assign(document.getElementById("primary").style,{width:"320px",height:"260px"});}');self.settle()
        self.page.evaluate('() => v.runAction(()=>{throw new Error("The original source is closed.");},false)');self.settle()
        self.assertTrue(self.page.locator('#primary .dxf-grid-count[data-error=true]').is_visible())
        self.assertJS('v.host.scrollWidth<=v.host.clientWidth+2 && v.grid.clientHeight>100')

    def test_density_10_every_application_report_uses_compact_shared_chrome(self):
        h.h.DockingTests.load(self);h.a.AnalysisTests.fixture(self)
        results=[]
        for button,container in [('showStatsOverlayBtn','overlayStatsContent'),('showCloudOverlayBtn','overlayObjectCloud'),('showDepsOverlayBtn','overlayDepsContent'),('showHandleMapOverlayBtn','overlayHandleMapContent'),('showFontsOverlayBtn','overlayFontsContent'),('showClassesOverlayBtn','overlayClassesContent'),('showLineTypesOverlayBtn','overlayLineTypesContent'),('showTextsOverlayBtn','overlayTextsContent'),('showBinaryObjectsOverlayBtn','binaryObjectsList'),('showProxyObjectsOverlayBtn','proxyObjectsList'),('showObjectSizeOverlayBtn','objectSizeList'),('showBlocksOverlayBtn','overlayBlocksContent'),('showDiagnosticsOverlayBtn','analysisDiagnostics'),('configureRulesBtn','ruleConfigContent')]:
            if container=='ruleConfigContent':
                # The rule editor retains its source controls hidden beside the
                # report projection, not inside the source node being observed.
                self.page.evaluate('(id)=>document.getElementById(id).click()',button);self.settle()
                self.page.wait_for_function('() => [...app.tabularReports.projections].some(p=>p.source.id==="ruleConfigContent")')
                self.page.evaluate('() => {v=[...app.tabularReports.projections].find(p=>p.source.id==="ruleConfigContent").view;}')
                self.assertJS('document.querySelector("#ruleConfigOverlay .rule-config-toolbar").clientHeight<=42')
            else:
                h.a.AnalysisTests.launch(self,button,container)
            metric=self.page.evaluate('() => ({title:v.title,chrome:v.main.getBoundingClientRect().top-v.host.getBoundingClientRect().top,records:v.grid.clientHeight})')
            results.append(metric);self.assertLessEqual(metric['chrome'],84,metric);self.assertGreaterEqual(metric['records'],220,metric)
        OUT.mkdir(parents=True,exist_ok=True);(OUT/'report-metrics.json').write_text(json.dumps(results,indent=2))

    def test_density_11_kpis_scope_and_source_navigation_remain_available(self):
        h.h.DockingTests.load(self);h.a.AnalysisTests.fixture(self);h.a.AnalysisTests.launch(self,'showStatsOverlayBtn','overlayStatsContent')
        self.assertJS('document.querySelector("#statsOverlay .analysis-kpis").clientHeight<35 && document.querySelector("#statsOverlay .dxf-report-source .backToTreeBtn")!==null')
        self.page.locator('#statsOverlay .analysis-report-context > summary').click();self.settle()
        self.assertTrue(self.page.locator('#statsOverlay .analysis-report-note').is_visible())
        self.page.locator('#statsOverlay .analysis-report-context > summary').click()
        self.assertJS('v.grid.clientHeight>350')

    def test_density_12_filter_state_survives_menu_close_resize_and_sheet(self):
        self.menu('filter');self.page.get_by_role('combobox',name='Type filter',exact=True).select_option('Valve');self.settle()
        self.page.keyboard.press('Escape');self.settle()
        self.page.locator('#primary').get_by_role('button',name='Spreadsheet',exact=True).click();self.settle()
        self.page.evaluate('() => {window.book=v.spreadsheet.book;document.getElementById("primary").style.width="390px";}');self.settle()
        self.menu('filter');self.page.keyboard.press('Escape');self.settle()
        self.assertJS('v.spreadsheet.book===book && v.filteredRows.length===40 && v.mode==="spreadsheet" && v.facetValues.get(1)==="Valve"')

    def test_density_13_fallback_disclosures_are_bounded_and_keyboard_accessible(self):
        self.page.evaluate("""() => {
            Object.defineProperty(HTMLElement.prototype,'showPopover',{configurable:true,value:undefined});
            const options=v.options,container=v.container;v.dispose();
            v=new analysisDemo.ui.AnalysisView(container,options);d=v.docking;
        }""");self.settle()
        self.menu('filter')
        self.assertJS('v.filterMenu.root.classList.contains("analysis-control-inline") && !v.filterMenu.panel.hidden && v.filterMenu.panel.clientHeight<=180')
        self.page.get_by_role('combobox',name='Type filter',exact=True).select_option('Pump');self.settle()
        self.page.keyboard.press('Escape');self.settle()
        self.assertJS('v.filterMenu.panel.hidden && v.filteredRows.length===20 && document.activeElement===v.filterMenu.trigger')
        self.menu('chart')
        self.assertTrue(self.page.get_by_role('combobox',name='Measure visual by',exact=True).is_visible())
        self.assertJS('v.visuals.optionsMenu.panel.clientHeight<=180 && v.host.scrollWidth<=v.host.clientWidth+2')

    def test_density_14_bottom_menu_inherits_host_theme_and_retains_small_checkboxes(self):
        self.page.evaluate("""() => {
            Object.assign(document.getElementById('primary').style,{marginTop:'650px',height:'260px'});
            v.host.style.setProperty('--ad-panel','#19232d');v.host.style.setProperty('--ad-text','#eeeeee');
            v.setTheme('dark');
        }""");self.settle();self.menu('filter')
        self.page.locator('#primary .analysis-column-menu > summary').click();self.settle()
        self.assertJS("""(() => {
            const r=v.filterMenu.panel.getBoundingClientRect(),a=v.filterMenu.trigger.getBoundingClientRect();
            return r.top>=0 && r.bottom<=a.top && r.right<=innerWidth &&
                getComputedStyle(v.filterMenu.panel).backgroundColor==='rgb(25, 35, 45)' &&
                v.columnChecks.every(([,check])=>check.getBoundingClientRect().width===16);
        })()""")
        self.page.emulate_media(forced_colors='active');self.settle()
        self.assertTrue(self.page.locator('#primary .analysis-control-panel:popover-open').is_visible())

if __name__=='__main__':
    suite=unittest.TestSuite(DensityTests(name) for name in sorted(n for n in dir(DensityTests) if n.startswith('test_density_')))
    raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
