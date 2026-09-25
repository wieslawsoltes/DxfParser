#!/usr/bin/env python3
"""First-paint regressions over real HTTP, including delayed/failed module loads.

Unlike settled workspace screenshots, these tests sample every animation frame
from document creation and hold dependencies while the old markup is present.
They must not be replaced with the injected/offline harness.
"""
from __future__ import annotations

import base64
from contextlib import contextmanager
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('docking_harness', ROOT / 'tests/docking-workspace.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
ARTIFACTS = ROOT / 'test-results/startup'
LEGACY = '.top-header, .sidebar, #rowControls, #editorRibbon'
PROBE = '''() => {
    window.startupFrames = [];
    function sample() {
        const visible = node => node.checkVisibility({visibilityProperty:true, opacityProperty:true});
        const legacy = [...document.querySelectorAll('.top-header,.sidebar,#rowControls,#editorRibbon')].filter(visible);
        const ribbon = document.querySelector('ribbon-web');
        const app = window.app || window.DxfEditorApp;
        if (startupFrames.length < 1200) startupFrames.push({
            state: document.documentElement.dataset.workspaceState,
            legacy: legacy.map(n => n.id || n.className),
            ribbon: ribbon ? visible(ribbon) : false,
            theme: app?.dockingWorkspace?.manager.Theme?.Name || app?.dockingWorkspace?.manager.Theme
        });
        requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
}'''


class StartupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        h.DockingTests.setUpClass.__func__(cls)
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        (ARTIFACTS / 'environment.json').write_text(json.dumps({
            'browser': cls.browser.version, 'injected': False
        }, indent=2))

    @classmethod
    def tearDownClass(cls):
        h.DockingTests.tearDownClass.__func__(cls)

    def setUp(self):
        h.DockingTests.setUp(self)
        self.context.set_default_timeout(15000)
        self.context.add_init_script('(' + PROBE + ')()')
        self.allow_errors = False

    def tearDown(self):
        try:
            self.capture(self._testMethodName)
            (ARTIFACTS / f'{self._testMethodName}.json').write_text(json.dumps(
                self.page.evaluate('window.startupFrames || []'), indent=2))
        finally:
            self.context.close()
        if not self.allow_errors:
            self.assertEqual([], self.errors, 'Unexpected page errors')

    def capture(self, name, page=None):
        # Capture the current compositor frame, not an automatically settled page.
        # Playwright's normal screenshot waits for document.fonts.ready, which
        # itself waits for DOMContentLoaded: deliberately holding a module keeps
        # that promise pending. CDP makes the first-paint evidence independent of
        # document readiness without changing the app or its browser environment.
        page = page or self.page
        session = page.context.new_cdp_session(page)
        try:
            image = session.send('Page.captureScreenshot', {
                'format': 'png', 'captureBeyondViewport': False
            })
            (ARTIFACTS / f'{name}.png').write_bytes(base64.b64decode(image['data']))
        finally:
            session.detach()

    @contextmanager
    def hold(self, resource):
        pattern = '**/' + resource
        pending = []
        self.page.route(pattern, lambda route: pending.append(route))
        try:
            yield pending
        finally:
            # Resume before unroute: unregistering the handler can auto-resolve
            # outstanding routes. Always release even if an assertion fails.
            try:
                for route in pending:
                    route.continue_()
            finally:
                self.page.unroute(pattern)

    def hidden_legacy(self):
        for node in self.page.locator(LEGACY).all():
            self.assertFalse(node.is_visible(), 'Retained legacy controls must never be painted')
        self.assertTrue(self.page.evaluate('startupFrames.every(frame => frame.legacy.length === 0)'))
        self.assertTrue(self.page.evaluate('startupFrames.every(frame => !frame.ribbon || frame.state === "ready")'))

    def ready(self):
        self.page.wait_for_function('document.documentElement.dataset.workspaceState === "ready"')
        self.assertFalse(self.page.locator('#workspaceStartup').is_visible())
        self.assertTrue(self.page.locator('ribbon-web').is_visible())
        self.assertTrue(self.page.evaluate('''() => {
            const app = window.app || window.DxfEditorApp, w = app.dockingWorkspace;
            const root = document.querySelector('[data-startup-root]');
            return w.ready && w.host.clientHeight > 100 && w.host.clientWidth > 100 &&
                !root.inert && !root.hasAttribute('aria-hidden') && !root.hasAttribute('aria-busy') &&
                !!app.ribbonWorkspace.ribbon.shadowRoot.querySelector('[part="ribbon"]');
        }'''))
        self.page.wait_for_timeout(60) # Observe actual paint after release, not a reveal delay.
        self.hidden_legacy()

    def delayed(self, path='index.html', *, reload=False):
        with self.hold('components/ribbon-workspace.mjs') as pending:
            if reload:
                self.page.reload(wait_until='commit')
            else:
                self.page.goto(self.base + path, wait_until='commit')
            self.page.locator('[data-startup-root]').wait_for(state='attached')
            self.page.wait_for_timeout(180)
            self.assertEqual(1, len(pending))
            self.assertTrue(self.page.locator('#workspaceStartup').is_visible())
            self.assertEqual('loading', self.page.locator('html').get_attribute('data-workspace-state'))
            self.hidden_legacy()
            self.assertTrue(self.page.evaluate('''() => {
                const root = document.querySelector('[data-startup-root]');
                return root.inert && root.getBoundingClientRect().width > 0;
            }'''))
            # The loading guard prevents focus, but must not use display:none: docking
            # initialization still requires the retained DOM and its dimensions.
            self.page.evaluate('document.querySelector("[data-startup-root] button")?.focus()')
            self.assertFalse(self.page.evaluate('document.querySelector("[data-startup-root]").contains(document.activeElement)'))
            self.capture(self._testMethodName + '-pending')
        self.ready()

    def failure(self, resource, path='index.html'):
        self.allow_errors = True # Dependency failure can also reject the dependent app constructor.
        self.page.route('**/' + resource, lambda route: route.abort())
        self.page.goto(self.base + path, wait_until='domcontentloaded')
        self.page.wait_for_function('document.documentElement.dataset.workspaceState === "error"')
        self.assertTrue(self.page.locator('#workspaceStartup .startup-failure').is_visible())
        self.assertTrue(self.page.get_by_role('link', name='Reload page').is_visible())
        self.hidden_legacy()

    def test_01_parser_first_paint_waits_for_ribbon_module(self):
        self.delayed()
        self.page.locator('ribbon-web').get_by_role('tab', name='Analyze', exact=True).click()
        self.page.locator('ribbon-web').get_by_role('button', name='Batch Processing', exact=True).click()
        self.assertTrue(self.page.evaluate('app.dockingWorkspace.isOpen("batchProcessingOverlay")'))

    def test_02_editor_first_paint_waits_for_ribbon_module(self):
        self.delayed('editor/index.html')

    def test_03_parser_refresh_restores_drawing_layout_and_dark_theme_before_reveal(self):
        self.page.goto(self.base + 'index.html')
        self.ready()
        self.page.locator('#fileInputLeft').set_input_files(str(ROOT / 'tests/data/sample.dxf'))
        self.page.wait_for_function('app.tabs.length === 1')
        self.page.evaluate('''() => {
            const w = app.dockingWorkspace; w.applyPreset('Review'); w.manager.Theme = 'dark'; w.save();
            app.stateManager.saveAppState(app.tabs,app.tabsRight,app.activeTabId,app.activeTabIdRight,app.columnWidths);
        }''')
        self.delayed(reload=True)
        self.assertEqual('dark', self.page.locator('html').get_attribute('data-startup-theme'))
        self.assertTrue(self.page.evaluate('app.tabs.length===1 && app.tabs[0].name==="sample.dxf" && app.dockingWorkspace.preset==="Review"'))
        self.assertTrue(self.page.evaluate('startupFrames.filter(f=>f.ribbon).every(f=>String(f.theme).toLowerCase()==="dark")'))

    def test_04_editor_refresh_is_atomic(self):
        self.page.goto(self.base + 'editor/index.html')
        self.ready()
        self.delayed('editor/index.html', reload=True)

    def test_05_required_stylesheet_delay_never_exposes_staging_markup(self):
        with self.hold('components/ribbon-workspace.css') as pending:
            self.page.goto(self.base + 'index.html', wait_until='commit')
            self.page.wait_for_timeout(300)
            self.assertEqual(1, len(pending))
            self.assertNotEqual('ready', self.page.locator('html').get_attribute('data-workspace-state'))
            self.hidden_legacy()
        self.ready()

    def test_06_failed_parser_module_shows_reload_not_legacy_ui(self):
        self.failure('components/ribbon-workspace.mjs')
        self.assertIn('ribbon-workspace.mjs', self.page.locator('[data-startup-detail]').inner_text())

    def test_07_failed_editor_module_shows_reload_not_legacy_ui(self):
        self.failure('components/ribbon-workspace.mjs', 'editor/index.html')

    def test_08_failed_required_css_cannot_release_an_unstyled_workspace(self):
        self.failure('components/docking.css')
        self.assertIn('docking.css', self.page.locator('[data-startup-detail]').inner_text())

    def test_09_missing_startup_script_still_hides_legacy_with_inline_css(self):
        self.failure('scripts/workspace-startup.js')

    def test_10_disabled_javascript_has_accessible_status_and_no_old_interface(self):
        for path in ['index.html', 'editor/index.html']:
            with self.subTest(path=path):
                context = self.browser.new_context(java_script_enabled=False)
                try:
                    page = context.new_page()
                    page.goto(self.base + path)
                    # Text selectors omit noscript content even when scripting is
                    # disabled. Inspect the actual rendered paragraph and pixels.
                    notice = page.locator('#workspaceStartup noscript p')
                    self.assertTrue(notice.is_visible())
                    self.assertIn('JavaScript is required', notice.inner_text())
                    self.capture('no-js-' + path.replace('/', '-'), page)
                    self.assertTrue(page.get_by_role('link', name='Reload page').is_visible())
                    for node in page.locator(LEGACY).all():
                        self.assertFalse(node.is_visible())
                finally:
                    context.close()

    def test_11_constructor_exception_preserves_error_and_storage(self):
        self.allow_errors = True
        self.context.add_init_script("localStorage.setItem('startup-preservation','keep')")
        self.page.route('**/components/app.js', lambda route: route.fulfill(
            content_type='text/javascript', body='class App { constructor() { throw new Error("Controlled mount failure"); } }'))
        self.page.goto(self.base + 'index.html')
        self.page.wait_for_function('document.documentElement.dataset.workspaceState === "error"')
        self.assertEqual('Controlled mount failure', self.page.locator('[data-startup-detail]').inner_text())
        self.assertEqual('keep', self.page.evaluate("localStorage.getItem('startup-preservation')"))
        self.hidden_legacy()

    def test_12_corrupt_theme_snapshot_falls_back_without_stalling_startup(self):
        self.context.add_init_script("localStorage.setItem('dxfparser.dockyard.parser.v1','{broken')")
        self.page.goto(self.base + 'index.html')
        self.ready()
        self.assertEqual('light', self.page.locator('html').get_attribute('data-startup-theme'))

    def test_13_successful_workspace_is_not_hidden_by_late_errors_or_pagehide(self):
        self.page.goto(self.base + 'index.html')
        self.ready()
        self.page.evaluate('''() => {
            DxfWorkspaceStartup.complete(app.dockingWorkspace);
            DxfWorkspaceStartup.fail(new Error('Late non-startup failure'));
            window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}));
            window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}));
        }''')
        self.ready()
        self.assertIsNone(self.page.evaluate('DxfWorkspaceStartup.error'))

    def test_14_saved_high_contrast_is_used_during_loading(self):
        self.page.goto(self.base + 'index.html')
        self.ready()
        self.page.evaluate('app.dockingWorkspace.manager.Theme="contrast";app.dockingWorkspace.save()')
        self.delayed(reload=True)
        self.assertEqual('contrast', self.page.locator('html').get_attribute('data-startup-theme'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
