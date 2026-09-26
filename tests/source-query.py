#!/usr/bin/env python3
"""Source queries in the normal source-only workbench and retained batch results."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('source_query_harness',ROOT/'tests/docking-workspace.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
OUT=ROOT/'test-results/source-query'
SOURCE='0\nSECTION\n2\nENTITIES\n0\nLINE\n5\nAB\n8\nPIPES\n8\nPIPES\n10\n0\n20\n0\n11\n20\n21\n10\n0\nCIRCLE\n5\nBC\n8\npipes\n10\n40\n20\n0\n40\n5\n0\nENDSEC\n0\nEOF\n'

class SourceQueryTests(h.DockingTests):
    def setUp(self):
        super().setUp();self.load()
        self.page.locator('#fileInputLeft').set_input_files({'name':'queries.dxf','mimeType':'application/dxf','buffer':SOURCE.encode()})
        self.page.wait_for_function('app.tabs.length===1')
        self.page.evaluate('() => {window.tab=app.tabs[0];window.original=app.dxfParser.serializeTree(tab.originalTreeData);}')
    def tearDown(self):
        OUT.mkdir(parents=True,exist_ok=True)
        try:self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')))
        finally:self.context.close()
        self.assertEqual([],self.errors,'Uncaught application errors')
    def prepare_batch(self,query='',object_type='',code='',text=''):
        self.page.evaluate('''args => {
            w.show('batchProcessingOverlay');window.batch=app.batchDataGrid;
            const transfer=new DataTransfer();transfer.items.add(new File([args.source],'queries.dxf'));
            document.getElementById('directoryInput').files=transfer.files;
            document.getElementById('batchJsQuery').value=args.query;
            document.getElementById('batchObjectType').value=args.type;
            document.getElementById('batchSearchCode').value=args.code;
            document.getElementById('batchSearchText').value=args.text;
        }''',{'source':SOURCE,'query':query,'type':object_type,'code':code,'text':text})
    def finish_batch(self):
        self.page.wait_for_function('document.getElementById("batchProgress").style.display==="none"')
        self.settle()
    def test_query_01_filter_projection_keeps_canonical_edit_ownership(self):
        self.page.evaluate('''() => {
            tab.selectedObjectTypes=['LINE'];tab.dataSearchTerms=['PIPES'];tab.dataExact=true;
            app.applyTabFilters(tab);
            window.projected=tab.currentTreeData[0].children[0];window.canonical=app.filteredNodeSources.get(projected);
        }''');self.settle()
        self.assertJS('projected.type==="LINE" && projected!==canonical && canonical===tab.originalTreeData[0].children[0]')
        self.assertJS('projected.properties.length===2 && projected.properties[0]===canonical.properties.find(p=>p.code===8)')
        self.assertJS('app.locateTreeRow(projected,"left").node===canonical && app.dxfParser.serializeTree(tab.originalTreeData)===original')
    def test_query_02_sort_and_expansion_route_through_the_package_without_source_loss(self):
        self.page.evaluate('''() => {
            tab.currentSortField='objectCount';tab.currentSortAscending=false;app.applyTabFilters(tab);
            app.collapseAllNodes(tab.originalTreeData);app.applyTabFilters(tab);
        }''');self.settle()
        self.assertJS('tab.currentTreeData.every(n=>n.expanded===false) && app.searchDxfTree(tab.originalTreeData,"LINE","",false,"8").length===2')
        self.page.evaluate('() => {app.expandAllNodes(tab.originalTreeData);app.applyTabFilters(tab);}')
        self.assertJS('tab.originalTreeData[0].expanded && app.getSortValue(tab.originalTreeData[0],"objectCount")===3')
    def test_query_03_batch_group_pair_search_retains_duplicate_values_and_file_actions(self):
        self.prepare_batch(code='8');self.page.evaluate('app.handleBatchProcess()');self.finish_batch()
        self.assertJS('Object.values(batch.tabs).length===1 && Object.values(batch.tabs)[0].rows.length===3')
        self.assertJS('Object.values(batch.tabs)[0].rows.every(r=>r.fileObject.name==="queries.dxf")')
        self.assertJS('Object.values(batch.tabs)[0].view.rows.length===3')
    def test_query_04_invalid_host_predicate_does_not_create_empty_results(self):
        self.prepare_batch(query='({not:"callable"})');self.page.evaluate('app.handleBatchProcess()')
        self.assertJS('batch.documents.entries.size===0 && Object.keys(batch.tabs).length===0 && document.getElementById("batchProgress").style.display!=="block"')
    def test_query_05_synchronous_host_predicate_keeps_source_node_order(self):
        self.prepare_batch(query='node => node.type === "LINE" || node.type === "CIRCLE"')
        self.page.evaluate('app.handleBatchProcess()');self.finish_batch()
        self.assertJS('Object.values(batch.tabs)[0].rows.map(r=>r.data).join(",")==="LINE,CIRCLE"')
    def test_query_06_async_predicate_is_reported_without_false_matches(self):
        self.prepare_batch(query='async node => node.type === "LINE"')
        self.page.evaluate('app.handleBatchProcess()');self.finish_batch()
        self.assertJS('Object.values(batch.tabs)[0].rows.length===0 && w.status.textContent.includes("synchronous")')
    def test_query_07_result_limit_rejects_whole_file_without_partial_rows(self):
        self.prepare_batch(code='8');self.page.evaluate('() => {batch.documents.maxRows=2;app.handleBatchProcess();}')
        self.finish_batch()
        self.assertJS('Object.values(batch.tabs)[0].rows.length===0 && w.status.textContent.includes("maxResults")')

if __name__=='__main__':
    suite=unittest.TestSuite(SourceQueryTests(n) for n in sorted(n for n in dir(SourceQueryTests) if n.startswith('test_query_')))
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
