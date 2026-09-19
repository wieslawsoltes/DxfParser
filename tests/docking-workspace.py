#!/usr/bin/env python3
"""Real Chromium integration tests. Normal mode serves the unmodified static application.

--injected is an explicitly weaker offline harness for policy-blocked environments:
local scripts/styles are injected in dependency order and storage is an in-memory
Storage substitute. CI must run normal mode to test navigation and real persistence.
"""
from __future__ import annotations

import argparse
import base64
import functools
import http.server
import io
import json
import os
from pathlib import Path
import re
import threading
import unittest

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'test-results' / 'docking'
INJECTED = '--injected' in os.sys.argv
if INJECTED:
    os.sys.argv.remove('--injected')


def inline_module(file, cache=None):
    """Keep ESM semantics in offline mode; only relative URLs become data URLs.

    This harness does not claim to verify network or native HTTP module loading.
    Production files are unmodified. CI runs without --injected.
    """
    cache = {} if cache is None else cache
    file = file.resolve()
    if file in cache:
        return cache[file]
    source = file.read_text()
    def dependency(match):
        specifier = match.group(2)
        if not specifier.startswith('.'):
            raise ValueError(f'Nonlocal offline dependency: {specifier}')
        return match.group(1) + inline_module(file.parent / specifier, cache) + match.group(3)
    source = re.sub(r"(from\s*['\"])([^'\"]+)(['\"])", dependency, source, flags=re.M)
    source = re.sub(r"(^[ \t]*import\s*['\"])([^'\"]+)(['\"])", dependency, source, flags=re.M)
    url = 'data:text/javascript;base64,' + base64.b64encode(source.encode()).decode()
    cache[file] = url
    return url


def injected_load(page, path: str, storage=None):
    """No application source substitutions; only loading and browser storage differ."""
    file = ROOT / path
    html = file.read_text()
    scripts = []
    for match in re.finditer(r'<script\b([^>]*)>(.*?)</script>', html, re.S):
        src = re.search(r'\bsrc="([^"]+)"', match[1])
        module = 'type="module"' in match[1]
        if src and not src[1].startswith('https:'):
            script = 'import ' + json.dumps(inline_module(file.parent / src[1])) + ';' if module else (file.parent / src[1]).read_text()
            scripts.append((script, src[1], module))
        elif not src:
            scripts.append((match[2], 'inline.js', module))
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
    for script, name, module in scripts:
        page.add_script_tag(content=script + '\n//# sourceURL=' + name, type='module' if module else 'text/javascript')
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
        # All application dependencies are local; accidental external requests are blocked.
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
        self.page.evaluate('window.w = window.app?.dockingWorkspace || window.DxfEditorApp.dockingWorkspace;window.dw=window.app?.documentWorkspace;window.rb=(window.app||window.DxfEditorApp).ribbonWorkspace.ribbon')
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
        # Read the composited canvas, not a backend-specific drawing context.
        # Normal HTTP can select WebGL/WebGPU; requesting a 2D context on that
        # same canvas returns null. Screenshot pixels cover every backend and
        # still fail for a cleared/uniform bitmap after a docking operation.
        screenshot = self.page.locator('#renderingOverlayCanvas').screenshot()
        with Image.open(io.BytesIO(screenshot)) as image:
            colors = image.convert('RGBA').getcolors(maxcolors=16)
            return len(colors) if colors is not None else 17

    def test_01_main_registry_and_connected_retained_nodes(self):
        self.load()
        self.assertJS('w.definitions.size === 26')
        self.assertJS("['tree-left','tree-right'].every(id=>w.isOpen(id)) && ['commands','tools','render-controls'].every(id=>!w.definitions.has(id)) && !!rb.shadowRoot")
        self.assertJS('[...w.definitions.values()].every(d=>d.node.isConnected)')
        self.assertJS("new Set([...document.querySelectorAll('[id]')].map(n=>n.id)).size === document.querySelectorAll('[id]').length")
        self.assertJS("document.getElementById('compareSplitter').hidden")
        self.assertJS("w.manager.Find('tree-left').CanClose === false")

    def test_02_file_inputs_and_right_toggle_preserve_data(self):
        self.load(); self.sample(); self.sample(True)
        self.page.evaluate("window.left=dw.current('left');window.right=dw.current('right');window.rightNode=right.node;window.rightTab=right.tab;app.setRightPanelHidden(true)")
        self.settle()
        self.assertJS("dw.records.has(right.id) && w.isOpen(right.id) && right.node===rightNode && app.tabsRight[0]===rightTab")
        self.page.evaluate("dw.activate(left);dw.activate(right)"); self.settle()
        self.assertJS("dw.active===right && right.grid===app.myTreeGrid && w.manager.Find(right.id).IsActive")

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
        self.page.evaluate("app.openFiltersOverlay('left')"); self.settle()
        self.page.evaluate("document.getElementById('filtersRightBtn').click()")
        self.settle()
        self.assertJS("w.isOpen('filtersOverlayLeft') && w.isOpen('filtersOverlayRight')")
        self.page.locator('.dxf-dock-status').click(); self.settle()
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
        self.page.evaluate("w.manager.Dock(w.manager.Find('statsOverlay'),w.manager.Find(dw.current('left').id).Parent,'Center');w.manager.Find(dw.current('left').id).Activate()")
        self.settle()
        self.page.evaluate("app.ribbonWorkspace.ribbon.execute('analysis-statsOverlay')"); self.settle()
        self.assertJS("w.manager.Find('statsOverlay').IsSelected")

    def test_06_pointer_float_resize_and_dock_back(self):
        self.load()
        self.page.evaluate("window.node=w.require('tree-right').node")
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
        self.assertJS("!w.manager.Find('tree-right').IsFloating && w.require('tree-right').node===node")

    def test_07_auto_hide_pin_and_hide_show(self):
        self.load(); self.sample()
        self.page.evaluate("w.requestOpen('statsOverlay');w.manager.Find('statsOverlay').Dock();window.node=w.require('statsOverlay').node;w.manager.Find('statsOverlay').ToggleAutoHide()")
        self.settle()
        self.assertJS("w.manager.Find('statsOverlay').IsAutoHidden")
        self.page.locator('.ad-anchor-tab[data-content-id="statsOverlay"]').click(); self.settle()
        self.assertTrue(self.page.locator('#statsOverlay .backToTreeBtn').is_visible())
        self.page.evaluate("w.manager.Find('statsOverlay').ToggleAutoHide();w.hide('statsOverlay');w.show('statsOverlay')")
        self.settle()
        self.assertJS("!w.manager.Find('statsOverlay').IsAutoHidden && w.require('statsOverlay').node===node")

    def test_08_splitter_keyboard_and_layout_history(self):
        self.load()
        before=self.page.locator('[data-dock-panel=tree-left]').bounding_box()['width']
        splitter=self.page.locator('.ad-splitter-vertical').last
        splitter.focus(); self.page.keyboard.press('ArrowRight'); self.settle()
        after=self.page.locator('[data-dock-panel=tree-left]').bounding_box()['width']
        self.assertGreater(after,before+4)
        self.page.evaluate("rb.execute('layout-undo')"); self.settle()
        self.assertAlmostEqual(before,self.page.locator('[data-dock-panel=tree-left]').bounding_box()['width'],delta=2)
        self.page.evaluate("rb.execute('layout-redo')"); self.settle()
        self.assertAlmostEqual(after,self.page.locator('[data-dock-panel=tree-left]').bounding_box()['width'],delta=2)

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
        self.page.locator('#renderingOverlayLayerManager .dxf-grid-actions').get_by_role('checkbox', name='On', exact=True).uncheck(); self.settle()
        self.assertJS("!document.querySelector('input[data-action=\"toggle-on\"]').checked")
        self.page.locator('#renderingOverlayLayerManager .dxf-grid-actions').get_by_role('checkbox', name='On', exact=True).check(); self.settle()
        self.assertGreater(self.colors(),4)
        self.assertJS("document.getElementById('renderingOverlayPropertyPanel').getAttribute('aria-hidden')==='false'")
        self.page.evaluate("w.manager.Find('rendering').Activate();rb.selectTab('drawing')"); self.settle()
        self.page.locator('ribbon-web').get_by_role('button', name='Distance', exact=True).click(); self.settle()
        self.assertJS("document.querySelector('[data-mode=distance]').getAttribute('aria-pressed')==='true' && !w.definitions.has('render-controls')")

    def test_11_export_import_keeps_content_and_model_types(self):
        self.load(); self.sample()
        self.page.evaluate("window.record=dw.current('left');window.node=record.node;window.tab=app.tabs[0];w.show('statsOverlay');window.saved=w.exportLayout();w.hide('statsOverlay');w.importLayout(saved)")
        self.settle()
        self.assertJS("w.isOpen('statsOverlay') && w.manager.Find(record.id).Content===node && app.tabs[0]===tab")
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
        if INJECTED:
            self.page.close(); self.page=self.context.new_page(); self.page.on('pageerror',lambda e:self.errors.append(str(e)))
            self.load(storage={'dxfparser.dockyard.parser.v1':'broken'})
        else:
            # Corrupt the next document before app startup, after the outgoing
            # workspace's pagehide autosave has finished. Poisoning the live
            # page instead would be repaired by its intentional reload save.
            self.page.add_init_script("localStorage.setItem('dxfparser.dockyard.parser.v1','broken')")
            self.page.reload(wait_until='domcontentloaded'); self.page.wait_for_function('window.app?.dockingWorkspace'); self.page.evaluate('window.w=app.dockingWorkspace'); self.settle()
        self.assertJS("w.isOpen('tree-right') && w.status.dataset.error==='true'")

    def test_14_reset_layout_and_presets_do_not_reset_files(self):
        self.load(); self.sample(); self.sample(True)
        self.page.evaluate('window.tab=app.tabs[0];window.right=app.tabsRight[0]')
        for preset in ['Review','Focus','Compare']:
            self.page.evaluate('(preset)=>rb.execute("workspace-preset",preset)',preset); self.settle()
            self.assertJS('app.tabs[0]===tab && app.tabsRight[0]===right')
            if preset == 'Review':
                self.page.evaluate("dw.activate(dw.current('left'))"); self.settle()
                self.assertJS('app.myTreeGridLeft.computeColumnFinalWidths().type >= 200')
                self.assertJS('app.treeViewContainer.scrollWidth > app.treeViewContainer.clientWidth')
                self.page.evaluate('app.treeViewContainer.scrollLeft=150')
                self.settle()
                self.assertJS("dw.current('left').header.parentElement.scrollLeft===150")
        self.page.evaluate("rb.execute('layout-reset')"); self.settle()
        self.assertJS("app.tabs[0]===tab && w.isOpen(dw.current('right').id)")

    def test_15_compact_default_and_float_bounds(self):
        self.page.set_viewport_size({'width':390,'height':844}); self.load()
        self.assertJS("w.preset==='Focus'")
        self.assertTrue(self.page.locator('ribbon-web .qat').get_by_role('button',name='Open DXF',exact=True).is_visible())
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
        self.page.evaluate("w.show('hexViewerOverlay');w.hide('hexViewerOverlay');rb.selectTab('workspace')");self.settle()
        self.page.locator('ribbon-web').get_by_role('button',name='Panels',exact=True).click()
        self.page.locator('ribbon-web').get_by_role('menuitem',name='Hex Viewer',exact=True).click();self.settle()
        self.assertJS("w.isOpen('hexViewerOverlay') && !w.definitions.has('tools')")


if __name__ == '__main__':
    print('INJECTED OFFLINE HARNESS (not an HTTP/storage certification)' if INJECTED else 'HTTP + real Chromium storage integration tests', flush=True)
    unittest.main(verbosity=2)
