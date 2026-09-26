#!/usr/bin/env python3
"""Source-state package and application lifecycle through real HTTP, storage and DXF views."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('dock_harness', ROOT / 'tests/docking-workspace.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
OUT = ROOT / 'test-results/state-persistence'

class StatePersistenceTests(h.DockingTests):
    @classmethod
    def setUpClass(cls):
        h.DockingTests.setUpClass.__func__(cls)
        OUT.mkdir(parents=True, exist_ok=True)
    @classmethod
    def tearDownClass(cls):
        h.DockingTests.tearDownClass.__func__(cls)
    def tearDown(self):
        try:
            self.page.screenshot(path=str(OUT / (self._testMethodName + '.png')))
        finally:
            self.context.close()
        self.assertEqual([], self.errors, 'Unexpected application errors')
    def state(self):
        self.load()
        self.sample()
        self.page.evaluate('''() => {
            window.sourceTab=app.tabs[0];
            window.stateSnapshot=app.stateManager.buildExportSnapshot(app.tabs,app.tabsRight,app.activeTabId,app.activeTabIdRight,app.columnWidths);
        }''')
    def upload(self, value, name='state.json'):
        self.page.locator('#appStateFileInput').set_input_files({'name': name, 'mimeType': 'application/json', 'buffer': json.dumps(value).encode()})
    def test_state_01_package_import_is_dom_free_and_does_not_install_globals(self):
        self.page.goto(self.base + 'tests/state-consumer.html')
        self.page.wait_for_function('!!window.demo')
        self.assertJS('!window.app && !window.DxfState && demo.standalone && demo.restored.leftTabs[0].id===0')
        self.assertJS('demo.a.storage!==demo.b.storage && demo.a.loadTabState(0).name==="standalone.dxf" && demo.b.loadTabState(0)===null')
    def test_state_02_roundtrip_retires_same_id_views_and_retains_modified_widths(self):
        self.state()
        self.page.evaluate('''() => {
            app.drawingViews.renderAll();
            window.oldSurface=app.drawingViews.records.get(sourceTab.id).overlay.surfaceManager;
            window.oldDocument=dw.findByTab(sourceTab.id);
            stateSnapshot.leftTabs[0].isModified=true;
            stateSnapshot.leftTabs[0].columnWidths={line:91,code:81,type:'*',objectCount:99,dataSize:101};
            window.applied=app.handleApplyStateSnapshot(stateSnapshot);
        }''')
        self.settle()
        self.assertJS('applied && oldSurface.disposed && dw.findByTab(sourceTab.id)!==oldDocument')
        self.assertJS('app.tabs[0]!==sourceTab && app.tabs[0].isModified && app.tabs[0].columnWidths.line===91 && dw.findByTab(app.tabs[0].id).grid.columnWidths.line===91')
        self.page.evaluate('() => {app.drawingViews.renderAll();}')
        self.page.wait_for_function('app.cadWorkspace.manager.host.paintCount>0')
        self.assertJS('app.cadWorkspace.manager!==oldSurface && !app.cadWorkspace.manager.error')
    def test_state_03_invalid_snapshot_does_not_remove_current_sources(self):
        self.state()
        self.page.evaluate('''() => {
            window.rejected=app.handleApplyStateSnapshot({...stateSnapshot,version:999});
            window.duplicateRejected=app.handleApplyStateSnapshot({...stateSnapshot,rightTabs:[stateSnapshot.leftTabs[0]]});
            window.missingTreeRejected=app.handleApplyStateSnapshot({...stateSnapshot,leftTabs:[{...stateSnapshot.leftTabs[0],originalTreeData:null}]});
        }''')
        self.assertJS('rejected===false && duplicateRejected===false && missingTreeRejected===false && app.tabs[0]===sourceTab && dw.records.size===1')
    def test_state_04_file_import_is_copy_isolated_and_survives_reload(self):
        self.state()
        value=self.page.evaluate('stateSnapshot')
        value['leftTabs'][0]['isModified']=True
        value['leftTabs'][0]['name']='restored-state.dxf'
        self.upload(value)
        self.page.wait_for_function('app.tabs[0]?.name==="restored-state.dxf"')
        # Keep the modified flag and explicitly accept the real unsaved-source prompt.
        self.confirm_navigation=True
        self.page.reload(wait_until='domcontentloaded')
        self.page.wait_for_function('window.app?.tabs[0]?.name==="restored-state.dxf"')
        self.assertJS('app.tabs[0].isModified && app.tabs[0].originalTreeData.length>0')
    def delay_read(self):
        self.page.evaluate('''() => {
            const read=File.prototype.text;
            window.pendingStateReads=[];
            File.prototype.text=function(){return new Promise((resolve,reject)=>{
                pendingStateReads.push(()=>read.call(this).then(resolve,reject));
            });};
        }''')
    def test_state_05_newer_file_read_wins_even_when_first_completes_last(self):
        self.state()
        self.delay_read()
        value=self.page.evaluate('stateSnapshot')
        value['leftTabs'][0]['name']='first-read.dxf'
        self.upload(value,'first.json')
        self.page.wait_for_function('pendingStateReads.length===1')
        value['leftTabs'][0]['name']='second-read.dxf'
        self.upload(value,'second.json')
        self.page.wait_for_function('pendingStateReads.length===2')
        self.page.evaluate('() => {pendingStateReads[1]();}')
        self.page.wait_for_function('app.tabs[0]?.name==="second-read.dxf"')
        self.page.evaluate('() => {pendingStateReads[0]();}')
        self.page.wait_for_timeout(200)
        self.assertJS('app.tabs.length===1 && app.tabs[0].name==="second-read.dxf"')
    def test_state_06_disposal_cancels_autosave_and_late_import(self):
        self.state()
        self.delay_read()
        self.upload(self.page.evaluate('stateSnapshot'))
        self.page.wait_for_function('pendingStateReads.length===1')
        self.page.evaluate('() => {w.dispose();pendingStateReads[0]();}')
        self.page.wait_for_timeout(200)
        self.assertJS('app._stateAbort.signal.aborted && app._stateSaveTimer===null && app.stateManager.disposed && app.stateManager.storage===null')
        self.assertJS('dw.disposed && app.ribbonWorkspace.disposed && app.tabs[0]===sourceTab')
    def test_state_07_legacy_storage_roundtrip_and_empty_expansion(self):
        self.state()
        self.page.evaluate('''() => {
            stateSnapshot.leftTabs[0].expandedNodeIds=[];
            app.handleApplyStateSnapshot(stateSnapshot);
            app.stateManager.saveAppState(app.tabs,app.tabsRight,app.activeTabId,app.activeTabIdRight,app.columnWidths);
            const state=JSON.parse(localStorage.getItem('dxf_parser_state'));
            state.tabIds=state.tabIdsLeft;state.activeTabId=state.activeTabIdLeft;
            delete state.tabIdsLeft;delete state.activeTabIdLeft;
            localStorage.setItem('dxf_parser_state',JSON.stringify(state));
        }''')
        self.page.reload(wait_until='domcontentloaded')
        self.page.wait_for_function('window.app?.tabs.length===1')
        self.assertJS('app.tabs[0].originalTreeData.every(n=>!n.expanded) && app.stateManager.getExpandedNodeIds(app.tabs[0].originalTreeData).length===0')
    def test_state_08_cleanup_preserves_workspace_and_other_stores(self):
        self.state()
        self.page.evaluate('''() => {
            localStorage.setItem('neighbor.record','sentinel');w.save();
            window.layoutBefore=localStorage.getItem('dxf.workspace.parser.v1');
            app.stateManager.clearAllState();
        }''')
        self.assertJS('localStorage.getItem("neighbor.record")==="sentinel" && localStorage.getItem("dxf.workspace.parser.v1")===layoutBefore && !app.stateManager.hasSavedState()')
    def test_state_09_file_limit_rejects_before_reading_and_keeps_current_source(self):
        self.state()
        self.page.evaluate('''() => {
            window.readCalled=false;File.prototype.text=function(){readCalled=true;return Promise.resolve('{}');};
            Object.defineProperty(app.stateManager.codec,'limits',{value:{...app.stateManager.codec.limits,maxBytes:4}});
        }''')
        self.upload({'larger':'than the budget'})
        self.page.wait_for_timeout(100)
        self.assertJS('!readCalled && app.tabs[0]===sourceTab && dw.records.size===1')
    def test_state_10_workspace_disposal_is_not_monkey_patched_by_controllers(self):
        self.state()
        self.assertJS('w.dispose===Object.getPrototypeOf(w).dispose')
        self.page.evaluate('() => {w.dispose();w.dispose();}')
        self.assertJS('app.stateManager.disposed && dw.disposed && app.ribbonWorkspace.disposed && w.disposed')

if __name__ == '__main__':
    suite=unittest.TestSuite(StatePersistenceTests(n) for n in sorted(n for n in dir(StatePersistenceTests) if n.startswith('test_state_')))
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
