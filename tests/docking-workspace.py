#!/usr/bin/env python3
"""Real Chromium integration tests. Normal mode serves the unmodified static application.

--injected is an explicitly weaker offline harness for policy-blocked environments:
local scripts/styles are injected in dependency order and storage is an in-memory
Storage substitute. CI must run normal mode to test navigation and real persistence.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import re
import threading
import unittest

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'test-results' / 'docking'
INJECTED = '--injected' in os.sys.argv
if INJECTED:
    os.sys.argv.remove('--injected')


def injected_load(page, path: str, storage=None):
    """No application source substitutions; only loading and browser storage differ."""
    file = ROOT / path
    html = file.read_text()
    scripts = []
    for match in re.finditer(r'<script\b([^>]*)>(.*?)</script>', html, re.S):
        src = re.search(r'\bsrc="([^"]+)"', match[1])
        if src and not src[1].startswith('https:'):
            scripts.append(((file.parent / src[1]).read_text(), src[1]))
        elif not src:
            scripts.append((match[2], 'inline.js'))
    styles = [ (file.parent / href).read_text() for href in
               re.findall(r'<link\s+rel="stylesheet"\s+href="([^"]+)"[^>]*>', html)]
    html = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
    html = re.sub(r'<link\s+rel="stylesheet"[^>]*>', '', html)
    page.set_content(html)
    page.evaluate('''initial => {
      const entries = new Map(Object.entries(initial));
      Object.defineProperty(window, 'localStorage', {value: {
        getItem: k => entries.get(String(k)) ?? null, setItem: (k,v) => entries.set(String(k),String(v)),
        removeItem: k => entries.delete(String(k)), clear: () => entries.clear(),
        key: n => [...entries.keys()][n] ?? null, get length() { return entries.size; }
      }});
    }''', storage or {})
    for css in styles:
        page.add_style_tag(content=css)
    for script, name in scripts:
        page.add_script_tag(content=script + '\n//# sourceURL=' + name)
    if path == 'index.html':
        page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")


class QuietServer(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class DockingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietServer, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}/'
        cls.playwright = sync_playwright().start()
        options = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
        if os.getenv('CHROMIUM_EXECUTABLE'):
            options['executable_path'] = os.environ['CHROMIUM_EXECUTABLE']
        cls.browser = cls.playwright.chromium.launch(**options)
        (ARTIFACTS / 'environment.json').write_text(json.dumps({
            'browser': cls.browser.version, 'injected': INJECTED, 'base': cls.base
        }, indent=2))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 1000})
        # Existing ZIP/XLSX libraries are outside this migration. The docking tests need no network.
        self.context.route('https://**/*', lambda route: route.abort())
        self.errors = []
        self.context.set_default_timeout(7000)
        self.page = self.context.new_page()
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.on('dialog', lambda dialog: dialog.dismiss())

    def tearDown(self):
        self.page.screenshot(path=str(ARTIFACTS / f'{self._testMethodName}.png'))
        self.context.close()
        self.assertEqual([], self.errors, 'Unexpected page errors')

    def load(self, path='index.html', storage=None):
        if INJECTED:
            injected_load(self.page, path, storage)
        else:
            self.page.goto(self.base + path, wait_until='domcontentloaded')
        self.page.wait_for_function('window.app?.dockingWorkspace || window.DxfEditorApp?.dockingWorkspace')
        self.page.wait_for_timeout(180)  # App state restoration is scheduled at 100 ms.
        self.page.evaluate('window.w = window.app?.dockingWorkspace || window.DxfEditorApp.dockingWorkspace')
        self.assertJS('w.host.clientHeight > 300 && w.host.clientWidth > 300')

    def assertJS(self, expression, message=None):
        self.assertTrue(self.page.evaluate(expression), message or expression)

    def settle(self):
        self.page.wait_for_timeout(100)

    def sample(self, right=False):
        self.page.locator('#fileInput' + ('Right' if right else 'Left')).set_input_files(str(ROOT / 'tests/data/sample.dxf'))
        self.page.wait_for_function('app.tabsRight.length === 1' if right else 'app.tabs.length === 1')
        self.settle()

    def colors(self):
        return self.page.evaluate('''() => {
          const canvas = document.getElementById('renderingOverlayCanvas');
          const data = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
          const colors = new Set();
          for (let i=0;i<data.length;i+=4) { colors.add(`${data[i]},${data[i+1]},${data[i+2]},${data[i+3]}`); if(colors.size>16) break; }
          return colors.size;
        }''')

    def test_01_main_registry_and_connected_retained_nodes(self):
        self.load()
        self.assertJS('w.definitions.size === 28')
        self.assertJS("['commands','tools','tree-left','tree-right'].every(id=>w.isOpen(id))")
        self.assertJS('[...w.definitions.values()].every(d=>d.node.isConnected)')
        self.assertJS("new Set([...document.querySelectorAll('[id]')].map(n=>n.id)).size === document.querySelectorAll('[id]').length")
        self.assertJS("document.getElementById('compareSplitter').hidden")
        self.assertJS("w.manager.Find('tree-left').CanClose === false")

    def test_02_file_inputs_and_right_toggle_preserve_data(self):
        self.load(); self.sample(); self.sample(True)
        self.page.evaluate("window.rightNode=document.getElementById('panelRight');window.rightTab=app.tabsRight[0]")
        self.page.locator('#toggleRightPanelBtn').click(); self.settle()
        self.assertJS("!w.isOpen('tree-right') && document.getElementById('panelRight')===rightNode")
        self.page.locator('#toggleRightPanelBtn').click(); self.settle()
        self.assertJS("w.isOpen('tree-right') && app.tabsRight[0]===rightTab")
        self.assertJS("document.getElementById('toggleRightPanelBtn').getAttribute('aria-pressed')==='false'")

    def test_03_all_report_launchers_and_nested_rules(self):
        self.load(); self.sample()
        launchers = {
            'cloudOverlay':'showCloudOverlayBtn','statsOverlay':'showStatsOverlayBtn',
            'depsOverlay':'showDepsOverlayBtn','binaryObjectsOverlay':'showBinaryObjectsOverlayBtn',
            'handleMapOverlay':'showHandleMapOverlayBtn','proxyObjectsOverlay':'showProxyObjectsOverlayBtn',
            'fontsOverlay':'showFontsOverlayBtn','classesOverlay':'showClassesOverlayBtn',
            'objectSizeOverlay':'showObjectSizeOverlayBtn','blocksOverlay':'showBlocksOverlayBtn',
            'lineTypesOverlay':'showLineTypesOverlayBtn','textsOverlay':'showTextsOverlayBtn',
            'diagnosticsOverlay':'showDiagnosticsOverlayBtn','ruleConfigOverlay':'configureRulesBtn',
            'batchProcessingOverlay':'showBatchProcessOverlayBtn'
        }
        for panel, launcher in launchers.items():
            self.page.evaluate('(id)=>document.getElementById(id).click()', launcher)
            self.settle()
            self.assertJS(f"w.isOpen('{panel}') && w.manager.Find('{panel}').IsFloating")
        self.assertJS("!document.getElementById('diagnosticsOverlay').contains(document.getElementById('ruleConfigOverlay'))")
        self.page.evaluate("w.hide('diagnosticsOverlay')")
        self.assertJS("w.isOpen('ruleConfigOverlay')")
        self.page.evaluate("w.show('hexViewerOverlay')")
        self.assertJS("w.isOpen('hexViewerOverlay')")

    def test_04_filter_dialogs_are_simultaneous_modeless_and_retained(self):
        self.load(); self.sample(); self.sample(True)
        self.page.locator('#filtersLeftBtn').click(); self.settle()
        self.page.evaluate("document.getElementById('filtersRightBtn').click()")
        self.settle()
        self.assertJS("w.isOpen('filtersOverlayLeft') && w.isOpen('filtersOverlayRight')")
        self.page.locator('.dxf-dock-brand').click(); self.settle()
        self.assertJS("w.isOpen('filtersOverlayLeft') && w.isOpen('filtersOverlayRight')")
        self.page.evaluate("window.field=document.getElementById('minLineInputLeft');field.value='17';w.manager.Find('filtersOverlayLeft').Dock()")
        self.settle()
        self.assertJS("document.getElementById('minLineInputLeft')===field && field.value==='17'")
        self.page.evaluate("w.hide('filtersOverlayLeft')")
        self.assertJS("!document.getElementById('filtersOverlayLeft')._dismissHandlers")

    def test_05_existing_launcher_reactivates_open_tab(self):
        self.load(); self.sample()
        self.page.evaluate("document.getElementById('showStatsOverlayBtn').click()")
        self.settle()
        self.page.evaluate("w.manager.Dock(w.manager.Find('statsOverlay'),w.manager.Find('tree-left').Parent,'Center');w.manager.Find('tree-left').Activate()")
        self.settle()
        self.page.locator('#showStatsOverlayBtn').click(); self.settle()
        self.assertJS("w.manager.Find('statsOverlay').IsSelected")

    def test_06_pointer_float_resize_and_dock_back(self):
        self.load()
        self.page.evaluate("window.node=document.getElementById('panelRight')")
        tab = self.page.locator('[data-tab-id="tree-right"]')
        box = tab.bounding_box()
        self.page.keyboard.down('Control')
        self.page.mouse.move(box['x']+40, box['y']+14); self.page.mouse.down()
        self.page.mouse.move(700,450,steps=12); self.page.mouse.up(); self.page.keyboard.up('Control')
        self.settle()
        self.assertJS("w.manager.Find('tree-right').IsFloating")
        before=self.page.locator('.ad-floating').bounding_box()
        grip=self.page.locator('.ad-resize-e').bounding_box()
        self.page.mouse.move(grip['x']+2,grip['y']+20); self.page.mouse.down()
        self.page.mouse.move(grip['x']-70,grip['y']+20,steps=8); self.page.mouse.up(); self.settle()
        after=self.page.locator('.ad-floating').bounding_box()
        self.assertLess(after['width'],before['width']-30)
        self.page.evaluate("w.manager.Find('tree-right').Dock()")
        self.settle()
        self.assertJS("!w.manager.Find('tree-right').IsFloating && document.getElementById('panelRight')===node")

    def test_07_auto_hide_pin_and_hide_show(self):
        self.load()
        self.page.evaluate("window.node=w.require('tools').node;w.manager.Find('tools').ToggleAutoHide()")
        self.settle()
        self.assertJS("w.manager.Find('tools').IsAutoHidden")
        self.page.locator('.ad-anchor-tab[data-content-id="tools"]').click(); self.settle()
        self.assertTrue(self.page.locator('#showStatsOverlayBtn').is_visible())
        self.page.evaluate("w.manager.Find('tools').ToggleAutoHide();w.hide('tools');w.show('tools')")
        self.settle()
        self.assertJS("!w.manager.Find('tools').IsAutoHidden && w.require('tools').node===node")

    def test_08_splitter_keyboard_and_layout_history(self):
        self.load()
        before=self.page.locator('#panelLeft').bounding_box()['width']
        splitter=self.page.locator('.ad-splitter-vertical').last
        splitter.focus(); self.page.keyboard.press('ArrowRight'); self.settle()
        after=self.page.locator('#panelLeft').bounding_box()['width']
        self.assertGreater(after,before+4)
        self.page.get_by_role('button',name='Undo layout change',exact=True).click(); self.settle()
        self.assertAlmostEqual(before,self.page.locator('#panelLeft').bounding_box()['width'],delta=2)
        self.page.get_by_role('button',name='Redo layout change',exact=True).click(); self.settle()
        self.assertAlmostEqual(after,self.page.locator('#panelLeft').bounding_box()['width'],delta=2)

    def test_09_render_resize_reparent_redraw_and_cleanup(self):
        self.load(); self.sample()
        self.page.evaluate("w.applyPreset('Review')"); self.settle()
        self.assertJS("app.renderingOverlayController.currentDoc.status==='ready'")
        self.assertGreater(self.colors(),4,'Drawing must not be a cleared bitmap after layout')
        self.page.evaluate("window.canvas=app.renderingOverlayController.canvas;w.manager.Float(w.manager.Find('rendering'),{FloatingWidth:640,FloatingHeight:450})")
        self.settle()
        self.assertJS("canvas===app.renderingOverlayController.canvas && canvas.width<640 && canvas.width>400")
        self.assertGreater(self.colors(),4)
        self.page.evaluate("w.manager.Find('rendering').Dock();w.hide('rendering')"); self.settle()
        self.assertJS('app.renderingOverlayController.currentDoc===null')
        self.page.evaluate("w.requestOpen('rendering')"); self.settle()
        self.assertGreater(self.colors(),4)

    def test_10_render_tool_visibility_layers_and_controls(self):
        self.load(); self.sample(); self.page.evaluate("w.applyPreset('Review')"); self.settle()
        self.assertJS("!document.getElementById('dxfRenderingOverlay').contains(document.getElementById('renderingMeasurementToolbar'))")
        self.page.evaluate("app.renderingOverlayController.setInformationTab('blocks',{focus:true})")
        self.settle()
        self.assertJS("w.manager.Find('render-blocks').IsSelected && w.isOpen('render-layers')")
        self.page.evaluate("w.show('render-layers')"); self.settle()
        self.page.locator('input[data-action="toggle-on"]').uncheck(); self.settle()
        self.assertJS("!document.querySelector('input[data-action=\"toggle-on\"]').checked")
        self.page.locator('input[data-action="toggle-on"]').check(); self.settle()
        self.assertGreater(self.colors(),4)
        self.assertJS("document.getElementById('renderingOverlayPropertyPanel').getAttribute('aria-hidden')==='false'")
        self.page.evaluate("w.show('render-controls')"); self.settle()
        self.assertTrue(self.page.locator('#renderingMeasurementToolbar').is_visible())

    def test_11_export_import_keeps_content_and_model_types(self):
        self.load(); self.sample()
        self.page.evaluate("window.node=document.getElementById('panelLeft');window.tab=app.tabs[0];w.show('statsOverlay');window.saved=w.exportLayout();w.hide('statsOverlay');w.importLayout(saved)")
        self.settle()
        self.assertJS("w.isOpen('statsOverlay') && document.getElementById('panelLeft')===node && app.tabs[0]===tab")
        data=json.loads(self.page.evaluate('w.exportLayout()'))
        self.assertEqual(data['format'],'dxfparser-dockyard-workspace')
        self.assertNotIn('originalTreeData',json.dumps(data))
        self.assertNotIn('renderingSourceText',json.dumps(data))

    def test_12_bad_import_is_atomic_and_capabilities_are_enforced(self):
        self.load()
        self.page.evaluate('window.before=w.manager.Layout')
        for text in ['{', '{}', '{"format":"dxfparser-dockyard-workspace","version":999}', 'x'*1048577]:
            self.assertJS('''(text=>{try{w.importLayout(text);return false;}catch{return w.manager.Layout===before;}})('''+json.dumps(text)+')')
        self.assertJS('''() => {
          const data=JSON.parse(w.exportLayout());
          function visit(n){if(n.props?.ContentId==='tree-left')n.type='LayoutAnchorable';for(const v of Object.values(n))if(v&&typeof v==='object')Array.isArray(v)?v.forEach(visit):visit(v);}
          visit(data.layout);try{w.importLayout(JSON.stringify(data));return false;}catch{return w.manager.Layout===before;}
        }''')
        self.page.evaluate('''() => {
          const data=JSON.parse(w.exportLayout());
          function visit(n){if(n.props?.ContentId==='tree-left')n.props.CanClose=true;for(const v of Object.values(n))if(v&&typeof v==='object')Array.isArray(v)?v.forEach(visit):visit(v);}
          visit(data.layout);w.importLayout(JSON.stringify(data));
        }''')
        self.assertJS("!w.manager.Find('tree-left').CanClose")

    def test_13_persistence_and_corruption_recovery(self):
        self.load()
        self.page.evaluate("w.hide('tree-right');w.manager.Theme='dark';w.save()")
        storage=self.page.evaluate('Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>{const k=localStorage.key(i);return[k,localStorage.getItem(k)];}))')
        if INJECTED:
            self.page.close(); self.page=self.context.new_page(); self.page.on('pageerror',lambda e:self.errors.append(str(e)))
            self.load(storage=storage)
        else:
            self.page.reload(wait_until='domcontentloaded'); self.page.wait_for_function('window.app?.dockingWorkspace'); self.page.evaluate('window.w=app.dockingWorkspace'); self.settle()
        self.assertJS("!w.isOpen('tree-right') && w.manager.Theme==='dark'")
        self.page.evaluate("localStorage.setItem(w.storageKey,'broken')")
        if INJECTED:
            self.page.close(); self.page=self.context.new_page(); self.page.on('pageerror',lambda e:self.errors.append(str(e)))
            self.load(storage={'dxfparser.dockyard.parser.v1':'broken'})
        else:
            self.page.reload(wait_until='domcontentloaded'); self.page.wait_for_function('window.app?.dockingWorkspace'); self.page.evaluate('window.w=app.dockingWorkspace'); self.settle()
        self.assertJS("w.isOpen('tree-right') && w.status.dataset.error==='true'")

    def test_14_reset_layout_and_presets_do_not_reset_files(self):
        self.load(); self.sample(); self.sample(True)
        self.page.evaluate('window.tab=app.tabs[0];window.right=app.tabsRight[0]')
        for preset in ['Review','Focus','Compare']:
            self.page.get_by_label('Workspace preset',exact=True).select_option(preset); self.settle()
            self.assertJS('app.tabs[0]===tab && app.tabsRight[0]===right')
        self.page.get_by_role('button',name='Reset layout',exact=True).click(); self.settle()
        self.assertJS("app.tabs[0]===tab && w.isOpen('tree-right')")

    def test_15_compact_default_and_float_bounds(self):
        self.page.set_viewport_size({'width':390,'height':844}); self.load()
        self.assertJS("w.preset==='Focus'")
        self.assertTrue(self.page.locator('#openLeftBtn').is_visible())
        self.page.evaluate("w.show('hexViewerOverlay')"); self.settle()
        self.page.set_viewport_size({'width':360,'height':640}); self.settle()
        box=self.page.locator('.ad-floating').bounding_box()
        self.assertGreaterEqual(box['x'],0); self.assertLessEqual(box['x']+box['width'],361)
        self.assertLessEqual(box['y']+box['height'],640)

    def test_16_editor_layout_palette_and_rendering_retention(self):
        self.load('editor/index.html')
        self.assertJS('w.definitions.size===6')
        self.page.locator('#editorOpenFileInput').set_input_files(str(ROOT/'tests/data/sample.dxf'))
        self.page.wait_for_function('!!DxfEditorApp.getActiveDocument()'); self.settle()
        self.page.evaluate('window.record=DxfEditorApp.getActiveDocument();window.canvas=document.getElementById("editorCanvas2D")')
        self.page.keyboard.press('Control+Shift+P'); self.settle()
        self.assertJS("w.isOpen('command-palette')")
        self.page.locator('#commandPaletteInput').fill('zoom'); self.settle()
        self.page.evaluate("w.manager.Find('command-palette').Dock()")
        self.settle()
        self.assertEqual(self.page.locator('#commandPaletteInput').input_value(),'zoom')
        self.page.evaluate("w.hide('command-palette');DxfEditorApp.openCommandPalette()")
        self.settle()
        self.assertJS("w.isOpen('command-palette')")
        self.page.evaluate("w.applyPreset('Focus')"); self.settle()
        self.assertJS('DxfEditorApp.getActiveDocument()===record && document.getElementById("editorCanvas2D")===canvas')
        self.assertJS("!w.manager.Find('viewport').CanClose")

    def test_17_dispose_detaches_observers_but_retains_app_nodes(self):
        self.load()
        self.page.evaluate("window.nodes=[...w.definitions.values()].map(d=>d.node);w.dispose();w.dispose()")
        self.settle()
        self.assertJS("w.disposed && !document.getElementById('parserDockWorkspace') && nodes.every(n=>n.isConnected)")

    def test_18_context_menu_and_panel_recovery(self):
        self.load()
        self.page.locator('[data-tab-id="tree-left"]').click(button='right'); self.settle()
        self.assertEqual(self.page.get_by_role('menuitem',name='Open in browser window',exact=True).count(),0)
        self.page.keyboard.press('Escape')
        self.page.evaluate("w.hide('tools');w.hide('commands')")
        self.page.get_by_role('button',name='Show or hide workspace panels',exact=True).click()
        self.page.get_by_role('menuitemradio',name='Analysis Tools',exact=True).click(); self.settle()
        self.assertJS("w.isOpen('tools')")


if __name__ == '__main__':
    print('INJECTED OFFLINE HARNESS (not an HTTP/storage certification)' if INJECTED else 'HTTP + real Chromium storage integration tests', flush=True)
    unittest.main(verbosity=2)
