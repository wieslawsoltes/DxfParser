#!/usr/bin/env python3
"""RibbonWeb + document ownership + source-aware navigation integration.

Tests load native ESM over HTTP and use real browser storage.
"""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('docking_harness',ROOT/'tests/docking-workspace.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
ARTIFACTS=ROOT/'test-results/ribbon'

class RibbonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        h.DockingTests.setUpClass.__func__(cls)
        ARTIFACTS.mkdir(parents=True,exist_ok=True)
        (ARTIFACTS/'environment.json').write_text(json.dumps({'browser':cls.browser.version,'transport':'http'},indent=2))
    @classmethod
    def tearDownClass(cls): h.DockingTests.tearDownClass.__func__(cls)
    def setUp(self): h.DockingTests.setUp(self)
    def tearDown(self):
        try: self.page.screenshot(path=str(ARTIFACTS/f'{self._testMethodName}.png'))
        finally: self.context.close()
        self.assertEqual([],self.errors,'Unexpected page errors')
    assertJS=h.DockingTests.assertJS
    settle=h.DockingTests.settle
    colors=h.DockingTests.colors
    def load(self,path='index.html'):
        h.DockingTests.load(self,path)
        self.page.wait_for_function('(window.app||window.DxfEditorApp).ribbonWorkspace?.ribbon?.model')
        self.page.evaluate('() => {window.rb=(window.app||window.DxfEditorApp).ribbonWorkspace.ribbon;window.dw=window.app?.documentWorkspace;}')
    def file(self,name='one.dxf',side='Left',text=None):
        if text is None: text=(ROOT/'tests/data/sample.dxf').read_text()
        self.page.locator('#fileInput'+side).set_input_files({'name':name,'mimeType':'application/dxf','buffer':text.encode()})
        self.page.wait_for_function('(name)=>[...app.documentWorkspace.records.values()].some(r=>r.tab.name===name)',arg=name)
        self.settle()
        return self.page.evaluate('(name)=>[...dw.records.values()].find(r=>r.tab.name===name).id',name)
    def execute(self,id,value=None):
        self.page.evaluate('async ([id,value])=>await rb.execute(id,value)',[id,value]);self.settle()
    def select(self,tab):
        self.page.locator('ribbon-web').get_by_role('tab',name=tab,exact=True).click();self.settle()
    def click(self,label):
        self.page.locator('ribbon-web').get_by_role('button',name=label,exact=True).last.click();self.settle()
    def record_globals(self): self.page.evaluate('() => {window.records=[...dw.records.values()];window.a=records[0];window.b=records[1];window.c=records[2];}')

    def test_01_native_ribbon_and_no_legacy_command_panels(self):
        self.load()
        self.assertJS("customElements.get('ribbon-web') && rb.shadowRoot.querySelector('[part=ribbon]')")
        self.assertJS("['commands','tools','render-controls'].every(id=>!w.definitions.has(id)) && w.toolbar.hidden")
        self.assertEqual(self.page.locator('ribbon-web').count(),1)
        self.assertJS("!rb.getControl('file-save').enabled && !rb.getControl('analysis-statsOverlay').enabled")
        self.assertJS("rb.shadowRoot.querySelectorAll('.icon.symbol').length===0")
        self.select('Analyze');self.assertEqual(self.page.locator('ribbon-web .group').count(),5)
        self.assertTrue(self.page.locator('ribbon-web').get_by_role('button',name='Batch Processing',exact=True).is_enabled())

    def test_02_all_analysis_ribbon_buttons_open_real_grid_panels(self):
        self.load();self.file()
        # Exercise the actual selected RibbonWeb controls, not the old hidden sidebar.
        self.select('Analyze')
        for label,panel in [('Frequencies','cloudOverlay'),('Statistics','statsOverlay'),('Dependencies','depsOverlay'),('Handle Map','handleMapOverlay'),('Binary Objects','binaryObjectsOverlay'),('Proxy Objects','proxyObjectsOverlay'),('Object Sizes','objectSizeOverlay'),('Blocks & Inserts','blocksOverlay'),('Line Types','lineTypesOverlay'),('Texts','textsOverlay'),('Fonts','fontsOverlay'),('Classes','classesOverlay'),('Diagnostics','diagnosticsOverlay'),('Batch Processing','batchProcessingOverlay')]:
            self.click(label)
            self.assertJS(f"w.isOpen('{panel}') && w.manager.Find('{panel}').IsFloating")
            self.page.evaluate('(id)=>w.hide(id)',panel);self.settle()
        self.select('Analyze')
        self.page.locator('ribbon-web [data-group-id="analysis-quality"] .launcher').click();self.settle()
        self.assertJS("w.isOpen('ruleConfigOverlay')")

    def test_03_files_are_independent_retained_dock_documents(self):
        self.load();self.file('one.dxf');self.file('two.dxf');self.file('three.dxf','Right');self.record_globals()
        self.assertJS("records.length===3 && records.every(r=>w.manager.Find(r.id) instanceof AvalonDock.LayoutDocument && r.grid instanceof TreeDataGrid)")
        self.assertJS("new Set(records.map(r=>r.node)).size===3 && new Set(records.map(r=>r.grid)).size===3")
        self.assertJS("!w.manager.Find('tree-left') && !w.manager.Find('tree-right') && document.querySelectorAll('#tabContainerLeft button,#tabContainerRight button').length===0")
        self.page.evaluate('w.manager.Dock(w.manager.Find(a.id),w.manager.Find(c.id).Parent,"Bottom")');self.settle()
        self.assertJS('a.node.clientHeight>0 && b.node.clientHeight>0 && c.node.clientHeight>0')
        self.page.evaluate('dw.activate(a);app.handleExpandAll();a.grid.columnWidths.type=450;a.grid.updateVisibleNodes();a.container.scrollLeft=75;dw.activate(c)');self.settle()
        self.assertJS('a.grid.flatData.length>c.grid.flatData.length && a.container.scrollLeft===75')
        self.assertJS('new Set([...document.querySelectorAll("[id]")].map(n=>n.id)).size===document.querySelectorAll("[id]").length')

    def test_04_pointer_document_float_resize_and_dock_retains_grid(self):
        self.load();id=self.file();self.record_globals()
        tab=self.page.locator(f'[data-tab-id="{id}"]')
        box=tab.bounding_box();self.page.mouse.move(box['x']+30,box['y']+12);self.page.mouse.down();self.page.mouse.move(720,470,steps=15);self.page.mouse.up();self.settle()
        self.assertJS('w.manager.Find(a.id).IsFloating')
        self.page.evaluate('w.manager.Find(a.id).Dock()');self.settle()
        self.assertJS('w.manager.Find(a.id).Content===a.node && dw.active.grid===a.grid && !w.manager.Find(a.id).IsFloating')

    def test_05_dirty_edit_and_cancel_close_are_document_specific(self):
        self.load();self.file('one.dxf');self.file('two.dxf','Right');self.record_globals()
        self.page.evaluate('dw.activate(b);app.handleExpandAll()');self.settle()
        cell=self.page.locator(f'[data-document-id] .tree-data').filter(has_text='HEADER').last
        # Use the real grid inline editor; commit-on-blur after Enter must run once.
        self.page.evaluate('''() => {window.prop=b.grid.flatData.find(f=>f.node.isProperty)?.node;
          window.before=JSON.stringify(a.tab.originalTreeData);
          window.editCell=document.createElement('div');b.node.append(editCell);b.grid.makeDataEditable(editCell,prop);
        }''')
        field=self.page.locator('.dxf-file-document input').last;field.fill('CHANGED');field.press('Enter');self.settle()
        self.assertJS('b.tab.isModified && w.manager.Find(b.id).IsModified && !a.tab.isModified && JSON.stringify(a.tab.originalTreeData)===before')
        self.page.evaluate('w.manager.Find(b.id).Close()');self.settle()
        self.assertJS('dw.records.has(b.id) && app.tabsRight.length===1')
        # Explicit handler replacement, then accepted close releases only this document.
        self.page.evaluate('window.confirm=()=>true;w.manager.Find(b.id).Close()');self.settle()
        self.assertJS('!dw.records.has(b.id) && dw.records.has(a.id) && !b.node.isConnected && b.grid.lifetime.signal.aborted')
        self.page.evaluate('w.manager.Undo()');self.settle()
        self.assertJS('!w.manager.Find(b.id) && !dw.records.has(b.id)')

    def test_06_document_tabs_update_command_target_not_visual_side(self):
        self.load();self.file('one.dxf');self.file('two.dxf','Right');self.record_globals()
        self.page.evaluate('w.manager.Dock(w.manager.Find(b.id),w.manager.Find(a.id).Parent,"Center")');self.settle()
        self.page.locator('[data-tab-id="'+self.page.evaluate('a.id')+'"]').click();self.settle()
        self.execute('tree-expand')
        self.assertJS('dw.active===a && app.getActiveTab()===a.tab && a.grid.flatData.length>b.grid.flatData.length')
        self.page.locator('[data-tab-id="'+self.page.evaluate('b.id')+'"]').click();self.settle()
        self.assertJS('dw.active===b && app.myTreeGrid===b.grid && rb.model.title.includes("two.dxf")')

    def test_07_back_to_tree_does_not_dismiss_docked_report(self):
        self.load();self.file();self.record_globals();self.execute('analysis-statsOverlay')
        self.page.evaluate('w.manager.Dock(w.manager.Find("statsOverlay"),w.manager.Find(a.id).Parent,"Right")');self.settle()
        self.page.locator('#statsOverlay .backToTreeBtn').click();self.settle()
        self.assertJS('w.isOpen("statsOverlay") && !w.manager.Find("statsOverlay").IsFloating && w.manager.Find(a.id).IsActive')
        self.page.evaluate('w.manager.Find("statsOverlay").Float()');self.settle()
        self.page.locator('#statsOverlay .backToTreeBtn').click();self.settle()
        self.assertJS('!w.isOpen("statsOverlay")')

    def test_08_report_actions_navigate_the_original_source_document(self):
        self.load();self.file('source.dxf');self.file('other.dxf','Right');self.record_globals()
        self.page.evaluate('dw.activate(a)');self.execute('analysis-statsOverlay')
        self.page.evaluate('w.manager.Dock(w.manager.Find("statsOverlay"),w.manager.Find(a.id).Parent,"Bottom");dw.activate(b)');self.settle()
        self.assertJS('dw.active===b && w.require("statsOverlay").sourceTabId===a.tab.id')
        self.page.locator('#statsOverlay .backToTreeBtn').click();self.settle()
        self.assertJS('dw.active===a && w.isOpen("statsOverlay")')
        self.assertJS('document.querySelector("#statsOverlay .dxf-report-source").textContent.includes("source.dxf")')

    def test_09_report_handle_navigation_keeps_docked_panel_and_reveals_grid(self):
        self.load();self.file('handles.dxf',text=(ROOT/'tests/data/sample.dxf').read_text().replace('0\nLINE','0\nLINE\n5\nABC1'));self.file('other.dxf','Right');self.record_globals()
        self.page.evaluate('dw.activate(a)');self.execute('analysis-handleMapOverlay')
        self.page.evaluate('w.manager.Dock(w.manager.Find("handleMapOverlay"),w.manager.Find(a.id).Parent,"Right");dw.activate(b)');self.settle()
        # The interactive row's action captures its canonical DXF node, not a formatted link label.
        self.page.locator('#handleMapOverlay .analysis-details > .dxf-grid-actions').get_by_role('button',name='Show in Tree',exact=True).click();self.settle()
        self.assertJS('dw.active===a && w.isOpen("handleMapOverlay") && a.grid.selectedRowId!==null')

    def test_10_closed_report_source_cannot_navigate_an_unrelated_file(self):
        self.load();self.file('source.dxf');self.file('other.dxf','Right');self.record_globals()
        self.page.evaluate('dw.activate(a)');self.execute('analysis-statsOverlay')
        self.page.evaluate('w.manager.Dock(w.manager.Find("statsOverlay"),w.manager.Find(b.id).Parent,"Bottom");w.manager.Find(a.id).Close();dw.activate(b)');self.settle()
        self.page.locator('#statsOverlay .backToTreeBtn').click();self.settle()
        self.assertJS('dw.active===b && w.status.textContent.includes("source drawing is closed")')

    def test_11_docked_filter_apply_stays_open_and_uses_source(self):
        self.load();self.file('left.dxf');self.file('right.dxf','Right');self.record_globals()
        self.page.evaluate('dw.activate(a)');self.execute('tree-filters')
        self.page.evaluate('w.manager.Dock(w.manager.Find("filtersOverlayLeft"),w.manager.Find(a.id).Parent,"Bottom");dw.activate(b)');self.settle()
        self.page.locator('#minLineInputLeft').fill('19');self.page.locator('#searchBtnLeft').click();self.settle()
        self.assertJS('w.isOpen("filtersOverlayLeft") && a.tab.minLine===19 && !b.tab.minLine')
        self.page.evaluate('w.manager.Find("filtersOverlayLeft").Float()');self.settle()
        self.page.locator('#searchBtnLeft').click();self.settle()
        self.assertJS('!w.isOpen("filtersOverlayLeft")')

    def test_12_contextual_tabs_and_render_controls_work(self):
        self.load();self.file();self.record_globals()
        self.assertEqual(self.page.locator('ribbon-web').get_by_role('tab',name='Drawing',exact=True).count(),0)
        self.execute('render-open')
        self.assertJS('app.renderingOverlayController.currentDoc?.status==="ready"')
        self.assertTrue(self.page.locator('ribbon-web').get_by_role('tab',name='Drawing',exact=True).is_visible())
        self.click('Distance');self.assertJS('document.querySelector("[data-mode=distance]").getAttribute("aria-pressed")==="true"')
        self.click('Fit drawing');self.assertGreater(self.colors(),4)
        self.page.evaluate('dw.activate(a)');self.settle()
        self.assertEqual(self.page.locator('ribbon-web').get_by_role('tab',name='Drawing',exact=True).count(),0)

    def test_13_compare_operands_are_independent_of_docking_placement(self):
        self.load();self.file('one.dxf');self.file('two.dxf');self.file('three.dxf','Right');self.record_globals()
        self.select('Compare')
        self.page.locator('ribbon-web #input-compare-left').select_option(str(self.page.evaluate('a.tab.id')));self.settle()
        self.page.locator('ribbon-web #input-compare-right').select_option(str(self.page.evaluate('c.tab.id')));self.settle()
        self.click('Tree Diff');self.assertJS('app.sideBySideDiffEnabled && app.myTreeGridLeft===a.grid && app.myTreeGridRight===c.grid')
        self.page.evaluate('w.manager.Dock(w.manager.Find(c.id),w.manager.Find(a.id).Parent,"Bottom")');self.settle()
        self.assertJS('app.getComparisonTab("left")===a.tab && app.getComparisonTab("right")===c.tab')
        self.execute('compare-diff');self.assertJS('!app.sideBySideDiffEnabled')

    def test_14_layout_import_reset_and_history_retain_every_open_document(self):
        self.load();self.file('one.dxf');self.file('two.dxf');self.file('three.dxf','Right');self.record_globals()
        self.page.evaluate('window.snapshot=w.exportLayout();w.manager.Float(w.manager.Find(b.id),{FloatingWidth:600,FloatingHeight:400});w.importLayout(snapshot)');self.settle()
        self.assertJS('records.every(r=>w.manager.Find(r.id).Content===r.node && dw.records.get(r.id)===r)')
        for preset in ['Review','Focus','Compare']:
            self.execute('workspace-preset',preset)
            self.assertJS('records.every(r=>w.manager.Find(r.id) && dw.records.get(r.id)===r)')
        self.execute('layout-reset')
        self.assertJS('records.every(r=>w.manager.Find(r.id)) && !w.definitions.has("tools")')

    def test_15_session_and_layout_reload_rebinds_dynamic_documents(self):
        self.load();self.file('one.dxf');self.file('two.dxf','Right');self.record_globals()
        self.page.evaluate('dw.activate(a);dw.markModified(a);a.tab.minLine=7;app.stateManager.saveTabState(a.tab);app.saveCurrentState();w.manager.Float(w.manager.Find(a.id),{FloatingWidth:620,FloatingHeight:420});w.save()');self.settle()
        # The test's own dirty data needs an explicit beforeunload acceptance.
        self.page.evaluate("window.onbeforeunload=null;for(const r of dw.records.values())r.tab.isModified=false")
        self.page.reload(wait_until='domcontentloaded');self.page.wait_for_function('app?.dockingWorkspace?.ready');self.page.evaluate('() => {window.w=app.dockingWorkspace;window.dw=app.documentWorkspace;window.rb=app.ribbonWorkspace.ribbon;}')
        self.assertJS('dw.records.size===2 && [...dw.records.values()].every(r=>w.manager.Find(r.id))')
        self.assertJS('[...dw.records.values()].find(r=>r.tab.name==="one.dxf").tab.isModified')
        self.assertJS('w.manager.Find([...dw.records.values()].find(r=>r.tab.name==="one.dxf").id).IsFloating')

    def test_16_home_navigation_history_and_shortcut(self):
        self.load();self.file(text=(ROOT/'tests/data/sample.dxf').read_text().replace('0\nLINE','0\nLINE\n5\nABC1'))
        self.page.keyboard.press('Control+g');self.settle()
        self.page.locator('ribbon-web #handleSearchInput').fill('ABC1')
        self.click('Go to handle')
        self.assertJS('app.getActiveTab().navigationHistory.at(-1)==="ABC1" && app.myTreeGrid.selectedRowId!==null')
        self.assertJS('rb.getControl("nav-history").getItems().some(c=>c.label==="ABC1")')

    def test_17_layout_ribbon_panel_recovery_theme_and_minimization(self):
        self.load();self.select('View & Layout')
        self.page.locator('ribbon-web #input-workspace-theme').select_option('dark');self.settle()
        self.assertJS('w.manager.Theme==="dark" && rb.theme==="dark"')
        self.page.locator('ribbon-web #input-ribbon-layout').select_option('simplified');self.settle()
        self.assertJS('rb.layout==="simplified" && rb.getBoundingClientRect().height<160')
        self.page.evaluate('rb.minimized=true');self.settle();self.assertJS('rb.getBoundingClientRect().height<100')
        self.page.evaluate('rb.minimized=false');self.settle();self.click('Panels')
        self.page.locator('ribbon-web').get_by_role('menuitem',name='Hex Viewer',exact=True).click();self.settle()
        self.assertJS('w.isOpen("hexViewerOverlay")')

    def test_18_file_backstage_commands_and_quick_access_picker(self):
        self.load()
        with self.page.expect_file_chooser() as chooser:
            self.page.locator('ribbon-web .qat').get_by_role('button',name='Open DXF',exact=True).click()
        chooser.value.set_files({'name':'qat.dxf','mimeType':'application/dxf','buffer':(ROOT/'tests/data/sample.dxf').read_bytes()});self.settle()
        self.assertJS('app.tabs[0].name==="qat.dxf"')
        self.click('File');self.click('Session & Parsing')
        self.page.locator('ribbon-web').get_by_label('Use streamed parsing',exact=True).check();self.settle()
        self.assertJS('document.getElementById("useStreamCheckbox").checked')

    def test_19_office_contextual_commands_retain_document(self):
        self.load();self.page.evaluate((ROOT/'tests/gridweb-fixtures.js').read_text())
        self.execute('file-documents');self.select('Document Preview')
        self.assertJS('app.officePreview.toolbar.hidden && w.isOpen("document-preview")')
        self.assertTrue(self.page.locator('ribbon-web').get_by_role('button',name='Open document',exact=True).is_visible())
        self.execute('office-zoom','1.5');self.assertJS('app.officePreview.zoom.value==="1.5"')

    def test_20_editor_uses_native_ribbon_and_existing_commands(self):
        self.load('editor/index.html')
        self.assertJS('!w.definitions.has("ribbon") && document.getElementById("editorRibbon").closest(".dxf-dock-storage")')
        with self.page.expect_file_chooser() as chooser:self.execute('editor-open-drawing')
        chooser.value.set_files(str(ROOT/'tests/data/sample.dxf'));self.page.wait_for_function('DxfEditorApp.getActiveDocument()');self.settle()
        self.assertJS('rb.model.title.includes("sample.dxf")')
        self.execute('editor-palette');self.assertJS('w.isOpen("command-palette")')
        self.page.evaluate('w.applyPreset("Focus")');self.settle()
        self.assertJS('document.querySelector("ribbon-web").isConnected && DxfEditorApp.getActiveDocument()')

    def test_21_mobile_overflow_and_floating_bounds(self):
        self.page.set_viewport_size({'width':390,'height':844});self.load();self.file()
        self.assertJS('w.preset==="Focus" && rb.clientWidth<=390')
        self.select('Analyze');self.page.locator('ribbon-web .overflow-button').click();self.settle()
        self.assertTrue(self.page.locator('ribbon-web .popup').is_visible())
        self.page.keyboard.press('Escape');self.execute('analysis-statsOverlay');self.settle()
        box=self.page.locator('.ad-floating').bounding_box();self.assertGreaterEqual(box['x'],0);self.assertLessEqual(box['x']+box['width'],391)

    def test_22_close_drawing_does_not_resurrect_from_old_layout(self):
        self.load();self.file('one.dxf');self.file('two.dxf','Right');self.record_globals()
        self.page.evaluate('window.saved=w.exportLayout();w.manager.Find(a.id).Close();w.importLayout(saved)');self.settle()
        self.assertJS('dw.records.size===1 && !w.manager.Find(a.id) && w.manager.Find(b.id) && app.tabs.length===0')
        self.assertJS('localStorage.getItem("dxf_tab_"+a.tab.id)===null')

    def test_23_source_tool_context_and_explicit_close_remain_available(self):
        self.load();self.file();self.record_globals();self.execute('analysis-statsOverlay')
        self.select('Report Tools');self.click('Dock back');self.assertJS('!w.manager.Find("statsOverlay").IsFloating')
        self.click('Float as dialog');self.assertJS('w.manager.Find("statsOverlay").IsFloating')
        self.click('Close panel');self.assertJS('!w.isOpen("statsOverlay")')

    def test_24_workspace_disposal_releases_ribbon_and_document_listeners(self):
        self.load();self.file();self.record_globals()
        self.page.evaluate('window.ribbonController=app.ribbonWorkspace;w.dispose();w.dispose()');self.settle()
        self.assertJS('dw.disposed && ribbonController.disposed && a.abort.signal.aborted && a.grid.lifetime.signal.aborted && !document.querySelector("ribbon-web")')

    def test_25_tree_context_menu_tracks_its_document_and_survives_row_recycling(self):
        self.load();self.file('source.dxf');self.file('target.dxf','Right');self.record_globals()
        self.page.evaluate('dw.activate(b);app.handleExpandAll();window.originalA=JSON.stringify(a.tab.originalTreeData);window.countB=b.tab.originalTreeData.length');self.settle()
        doc_id=self.page.evaluate('String(b.tab.id)')
        self.page.locator(f'[data-document-id="{doc_id}"] .tree-row').first.click(button='right');self.settle()
        self.assertTrue(self.page.locator('#contextMenu').is_visible())
        # A document switch or virtualized row redraw cannot redirect the pending edit.
        self.page.evaluate('dw.activate(a,{focus:false});b.grid.updateVisibleNodes()');self.settle()
        self.page.locator('#contextMenu [data-cmd="add-below"]').click();self.settle()
        self.assertJS('dw.active===b && b.tab.originalTreeData.length===countB+1 && b.tab.isModified && !a.tab.isModified && JSON.stringify(a.tab.originalTreeData)===originalA')

    def test_26_filtered_property_row_edits_only_change_the_active_document(self):
        self.load();self.file('source.dxf');self.file('target.dxf','Right');self.record_globals()
        self.page.evaluate('''() => {
          dw.activate(b);app.handleExpandAll();app.applyTabFilters(b.tab);
          const prop=b.grid.flatData.find(f=>f.node.isProperty).node;
          window.parent=app.filteredNodeSources.get(prop.parentNode)||prop.parentNode;
          window.count=parent.properties.length;window.beforeA=JSON.stringify(a.tab.originalTreeData);
          app.selectedNodeId=prop.id;b.selectedNodeId=prop.id;app.ribbonWorkspace.schedule();
        }''');self.settle();self.execute('row-add')
        self.assertJS('parent.properties.length===count+1 && b.tab.isModified && !a.tab.isModified && JSON.stringify(a.tab.originalTreeData)===beforeA')
        self.execute('row-remove')
        self.assertJS('parent.properties.length===count && app.selectedNodeId===null && b.selectedNodeId===null')
        self.page.evaluate('''() => {
          b.tab.isModified=false;w.manager.Find(b.id).IsModified=false;
          app.handleRemoveRow();app.handleAddRow();
          window.foreignChange=app.removeRow(a.tab.originalTreeData[0],"right");
        }''')
        self.assertJS('!b.tab.isModified && foreignChange===false && JSON.stringify(a.tab.originalTreeData)===beforeA')

    def test_27_open_subtree_is_an_independent_snapshot_and_ids_do_not_collide(self):
        self.load();self.file('source.dxf');self.record_globals()
        self.page.evaluate('''() => {window.source=a.tab.originalTreeData[0];app.handleOpen(source.id);
          window.extracted=dw.active;window.copy=extracted.tab.originalTreeData[0];
          window.sourceBefore=JSON.stringify(source);app.addChildRow(copy);app.applyTabFilters(extracted.tab);
        }''');self.settle()
        self.assertJS('copy!==source && JSON.stringify(source)===sourceBefore && extracted.tab.isModified && !a.tab.isModified')
        self.file('another.dxf','Right')
        self.page.evaluate('''() => {dw.activate(extracted);app.addRowBelow(copy);app.addRowBelow(copy);
          window.editIds=extracted.tab.originalTreeData.map(n=>n.id);
        }''')
        self.assertJS('new Set(editIds).size===editIds.length && editIds.filter(id=>String(id).startsWith("edit:")).length===2')

    def test_28_edit_invalidates_render_cache_and_open_uses_updated_tree(self):
        self.load();self.file('source.dxf');self.record_globals();self.execute('render-open')
        self.page.evaluate('''() => {dw.activate(a);window.oldScene=app.renderingDataController.getDocument(a.tab.id);
          const entity=a.tab.originalTreeData.find(n=>n.type==='SECTION' && n.properties.some(p=>p.code===2&&p.value==='ENTITIES'));
          if(!entity)throw Error('No entities section');app.addDxfEntity(entity.children[0], 'CIRCLE');
        }''');self.settle()
        self.assertJS('a.tab.renderingSourceText===null && !app.renderingDataController.hasDocument(a.tab.id)')
        self.execute('render-open')
        self.assertJS('app.renderingDataController.getDocument(a.tab.id)!==oldScene && app.renderingDataController.getDocument(a.tab.id).status==="ready" && a.tab.renderingSourceText===app.dxfParser.serializeTree(a.tab.originalTreeData)')

    def test_29_filter_source_survives_explicit_comparison_role_reassignment(self):
        self.load();self.file('source.dxf');self.file('other.dxf','Right');self.record_globals()
        self.page.evaluate('dw.activate(a)');self.execute('tree-filters')
        self.page.evaluate('w.manager.Dock(w.manager.Find("filtersOverlayLeft"),w.manager.Find(a.id).Parent,"Bottom");dw.assignSide(a,"right");dw.activate(b)');self.settle()
        self.page.locator('#minLineInputLeft').fill('19');self.page.locator('#searchBtnLeft').click();self.settle()
        self.assertJS('a.side==="right" && a.tab.minLine===19 && !b.tab.minLine && w.isOpen("filtersOverlayLeft")')
        self.page.locator('#codeSearchInputLeft').fill('8');self.page.locator('#codeSearchInputLeft').press('Enter');self.settle()
        self.assertJS('a.tab.codeSearchTerms.includes("8") && !b.tab.codeSearchTerms.includes("8")')
        self.page.locator('#codeSearchTagsLeft .remove').click();self.settle()
        self.assertJS('a.tab.codeSearchTerms.length===0 && b.tab.codeSearchTerms.length===0')

    def test_30_sort_indicators_are_local_and_closed_context_target_cannot_edit(self):
        self.load();self.file('source.dxf');self.file('other.dxf','Right');self.record_globals()
        self.page.evaluate('''() => {
          dw.activate(a);app.handleHeaderClick(a.header.querySelector('[data-field="code"]'));
          dw.activate(b);app.handleHeaderClick(b.header.querySelector('[data-field="type"]'));
        }''');self.settle()
        self.assertJS('a.header.querySelector("[data-field=code]").dataset.sort==="asc" && b.header.querySelector("[data-field=type]").dataset.sort==="asc"')
        doc_id=self.page.evaluate('String(b.tab.id)')
        self.page.locator(f'[data-document-id="{doc_id}"] .tree-row').first.click(button='right');self.settle()
        self.page.evaluate('window.beforeA=JSON.stringify(a.tab.originalTreeData);w.manager.Find(b.id).Close();dw.activate(a,{focus:false})');self.settle()
        self.page.locator('#contextMenu [data-cmd="remove"]').click();self.settle()
        self.assertJS('JSON.stringify(a.tab.originalTreeData)===beforeA && !a.tab.isModified')

    def test_31_review_preset_renders_active_right_document(self):
        self.load();self.file('left.dxf');self.file('right.dxf','Right');self.record_globals()
        self.page.evaluate('dw.activate(b);w.applyPreset("Review")');self.settle()
        self.assertJS('app.renderingOverlayController.currentTabId===b.tab.id && w.require("render-layers").sourceTabId===b.tab.id')
        self.page.evaluate('dw.activate(a);w.applyPreset("Focus")');self.settle()
        self.assertJS('app.renderingOverlayController.currentTabId===a.tab.id && w.require("render-info").sourceTabId===a.tab.id')

if __name__=='__main__':
    print('HTTP + native ESM + real browser storage',flush=True)
    unittest.main(verbosity=2)
