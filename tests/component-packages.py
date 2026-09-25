#!/usr/bin/env python3
"""Standalone ES-module consumers using real vendor controls, without the app."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('docking_harness', ROOT / 'tests/docking-workspace.py')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
OUT = ROOT / 'test-results/component-browser'

class ComponentPackagesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        h.DockingTests.setUpClass.__func__(cls); OUT.mkdir(parents=True, exist_ok=True)
    @classmethod
    def tearDownClass(cls): h.DockingTests.tearDownClass.__func__(cls)
    def setUp(self):
        h.DockingTests.setUp(self)
        self.page.goto(self.base + 'tests/component-packages.html', wait_until='domcontentloaded')
        self.page.wait_for_function('!!window.componentDemo')
        self.page.wait_for_timeout(150)
    def tearDown(self):
        try: self.page.screenshot(path=str(OUT / (self._testMethodName + '.png')))
        finally: self.context.close()
        self.assertEqual([], self.errors)
    def test_packages_01_imports_do_not_install_application_globals(self):
        self.assertTrue(self.page.evaluate('!window.app && !window.DxfParser && !window.DxfGrid && !window.TreeDataGrid && !window.DxfAnalysis && !window.DxfDocking'))
        self.assertEqual(3, self.page.evaluate('componentDemo.view.visibleRows.length'))
    def test_packages_02_record_filtering_is_independent(self):
        self.page.locator('[aria-label="Filter Inventory"]').fill('Valve')
        self.page.wait_for_function('componentDemo.view.visibleRows.length===1')
        self.assertEqual(3, self.page.evaluate('componentDemo.second.visibleRows.length'))
    def test_packages_03_spreadsheet_uses_supplied_gridweb(self):
        self.page.locator('#report').get_by_role('button', name='Spreadsheet', exact=True).click()
        self.page.wait_for_function('componentDemo.view.mode==="spreadsheet" && !!componentDemo.view.spreadsheet')
        self.assertTrue(self.page.evaluate('componentDemo.view.spreadsheet.book instanceof GridWeb.Workbook'))
    def test_packages_04_source_activation_is_a_host_callback(self):
        self.page.evaluate('async () => { await componentDemo.view.runAction(() => componentDemo.actions.push("action")); }')
        self.assertEqual(['external-source'], self.page.evaluate('componentDemo.sourceIds'))
        self.assertIn('action', self.page.evaluate('componentDemo.actions'))
    def test_packages_05_proxy_class_navigation_needs_no_window_app(self):
        self.page.locator('#tree').get_by_text('ExternalClass', exact=False).click()
        self.assertIn('class:42', self.page.evaluate('componentDemo.actions'))
    def test_packages_06_factories_do_not_duplicate_accessibility_ids(self):
        self.assertTrue(self.page.evaluate('(() => { const ids=[...document.querySelectorAll("[id]")].map(n=>n.id); return ids.length===new Set(ids).size && componentDemo.ui.AnalysisView!==componentDemo.secondUI.AnalysisView; })()'))
    def test_packages_07_dispose_is_idempotent_and_source_owned(self):
        self.page.evaluate('() => { componentDemo.view.dispose();componentDemo.view.dispose();componentDemo.treeView.dispose();componentDemo.treeView.dispose(); }')
        self.assertTrue(self.page.evaluate('componentDemo.view.disposed && componentDemo.treeView.lifetime.signal.aborted && !componentDemo.second.disposed && componentDemo.second.host.isConnected'))

    def test_packages_08_optional_spreadsheet_rejects_before_mutation(self):
        self.assertTrue(self.page.evaluate("""() => {
            const {createAnalysisUI, host}=componentDemo;
            const api=createAnalysisUI({...host,gridWeb:undefined});
            const container=document.createElement('div');document.body.append(container);
            const view=new api.AnalysisView(container,{rows:[{key:1,values:['A']}],visualization:false});
            const html=container.innerHTML;
            let error;try{view.setMode('spreadsheet');}catch(e){error=e;}
            const valid=view.sheetButton.disabled && view.mode==='records' && !view.spreadsheet && container.innerHTML===html && error?.message.includes('GridWeb');
            view.dispose();container.remove();return valid;
        }"""))
    def test_packages_09_foreign_document_containers_reject_without_mutation(self):
        self.assertTrue(self.page.evaluate("""() => {
            const foreign=document.implementation.createHTMLDocument('foreign');
            const parent=foreign.createElement('div');foreign.body.append(parent);
            const before=parent.innerHTML;
            for(const Type of [componentDemo.ui.GridView,componentDemo.ui.AnalysisView]) {
                let error;try{new Type(parent);}catch(e){error=e;}
                if(!(error instanceof TypeError) || parent.innerHTML!==before) return false;
            }
            return true;
        }"""))

if __name__ == '__main__': unittest.main(verbosity=2)
