#!/usr/bin/env python3
"""Standalone command consoles and source-owned CAD integration over normal HTTP."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('native_harness', ROOT/'tests/multiple-drawings.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
OUT=ROOT/'test-results/command-line'

class CommandLineTests(h.MultipleDrawingTests):
    def setUp(self):
        h.h.h.DockingTests.setUp(self)
        self.page.goto(self.base+'tests/command-line.html',wait_until='domcontentloaded')
        self.page.wait_for_function('!!window.demo')
        self.page.evaluate('() => { window.d=demo; }')
    def tearDown(self):
        OUT.mkdir(parents=True,exist_ok=True)
        try:self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')))
        finally:self.context.close()
        self.assertEqual([],self.errors,'Uncaught errors')
    def app(self):
        self.load()
    def test_command_01_standalone_controls_have_no_application_and_unique_labels(self):
        self.assertJS('!window.app && !window.DxfCad && d.a.input.id!==d.b.input.id')
        self.assertJS('d.a.input.labels.length===1 && d.b.input.labels.length===1')
        self.page.locator('#a input').fill('echo "Main Pipes"');self.page.locator('#a input').press('Enter')
        self.page.wait_for_function('d.calls.length===1 && d.a.session.pending===0')
        self.assertJS('d.calls[0][2]==="Main Pipes" && d.a.log.textContent.includes("A: Main Pipes") && !d.b.log.textContent.includes("Main Pipes")')
    def test_command_02_history_retains_draft_and_handles_escape(self):
        field=self.page.locator('#a input');field.fill('ECHO first');field.press('Enter')
        field.fill('unsubmitted draft');field.press('ArrowUp');self.assertEqual('ECHO first',field.input_value())
        field.press('ArrowDown');self.assertEqual('unsubmitted draft',field.input_value())
        field.press('ArrowDown');self.assertEqual('unsubmitted draft',field.input_value())
        field.press('Escape');self.assertEqual('',field.input_value())
    def test_command_03_parse_error_does_not_execute_or_corrupt_recall(self):
        self.assertJS('async () => (await d.a.execute(\'LAYOUT "unterminated\')).status==="error"')
        self.assertJS('d.calls.length===0 && d.a.session.history.entries.length===0 && d.errors.length===1')
        self.assertTrue(self.page.locator('#a .dxf-command-error').is_visible())
    def test_command_04_output_is_text_and_bounded_per_console(self):
        self.page.evaluate('() => { for(let i=0;i<20;i++)d.a.write(i+" "+"x".repeat(200));d.a.write("<img src=x onerror=alert(1)>"); }')
        self.assertJS('d.a.log.children.length===8 && [...d.a.log.children].every(n=>n.textContent.length<=120) && !d.a.log.querySelector("img") && d.b.log.children.length===1')
    def test_command_05_queue_is_serial_but_neighbor_stays_independent(self):
        self.page.evaluate('() => {window.done=Promise.all([d.a.execute("WAIT first"),d.a.execute("ECHO second"),d.b.execute("ECHO other")]);}')
        self.assertJS('async () => {await done;return d.calls.map(c=>c[0]+c[1]).join(",")==="AWAIT,BECHO,AECHO";}')
        self.assertJS('d.a.session.pending===0 && d.a.node.getAttribute("aria-busy")==="false"')
    def test_command_06_disposal_cancels_active_and_pending_callers(self):
        self.assertJS('''async () => {
            const first=d.a.execute('WAIT pending'),next=d.a.execute('ECHO cancelled');
            await Promise.resolve();d.a.dispose();d.a.dispose();
            return (await first).status==='cancelled' && (await next).status==='cancelled' && !d.a.node.isConnected && !d.b.disposed;
        }''')
        self.page.wait_for_timeout(150);self.assertJS('d.a.log.children.length===0 && d.calls.filter(c=>c[0]==="A").length===1')
    def test_command_07_duplicate_explicit_ids_reject_and_disposal_releases_ownership(self):
        self.assertJS('''() => {
            const Other=d.createCommandConsole({window}),first=new d.Console({inputId:'unique',execute(){}});let rejected=false;
            try{new Other({inputId:'unique',execute(){}});}catch(e){rejected=e.message.includes('owned');}
            first.dispose();const second=new Other({inputId:'unique',execute(){}});second.dispose();return rejected;
        }''')
    def test_command_08_small_console_retains_accessible_input_and_run_button(self):
        self.page.evaluate('() => {document.getElementById("a").style.width="260px";}')
        self.assertJS('d.a.input.getBoundingClientRect().width>=40 && d.a.runButton.getBoundingClientRect().right<=d.a.node.getBoundingClientRect().right')
        self.page.locator('#a input').fill('ECHO compact');self.page.locator('#a button').click()
        self.page.wait_for_function('d.a.log.textContent.includes("A: compact")')
    def test_command_09_ime_arrow_keys_do_not_recall_history(self):
        self.assertJS('''async () => {
            await d.a.execute('ECHO first');d.a.input.value='draft';
            d.a.input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',isComposing:true,bubbles:true}));
            return d.a.input.value==='draft';
        }''')
    def test_command_10_application_drawing_consoles_keep_identity_and_focus(self):
        self.app();self.two();self.focus('a');self.command('ZOOM 2');self.focus('b');self.command('GRID ON')
        self.assertJS('a.cad.input.id!==b.cad.input.id && a.cad.commandLine.session!==b.cad.commandLine.session && b.cad.history.at(-1)==="GRID ON"')
        self.focus('a');self.assertJS('a.cad.input.labels.length===1 && a.cad.history.at(-1)==="ZOOM 2" && !a.overlay.surfaceManager.gridVisible')
    def test_command_11_native_observers_survive_owner_disposal_without_wrappers(self):
        self.app();self.render()
        self.assertJS('''async () => {
            let count=0;const legacy=m.onPaint,detach=m.subscribePaint(()=>count++);
            await cad.execute('REGEN');const working=count>0 && m.onPaint===legacy;
            const console=cad.commandLine;cad.dispose();await m.dispose();detach();
            return working && console.disposed && m.paintListeners.size===0 && m.errorListeners.size===0;
        }''')
    def test_command_12_invalid_quotes_cannot_change_native_layout(self):
        self.app();self.render();self.command('LAYOUT "bad')
        self.assertJS('m.layout==="Model" && cad.log.textContent.includes("Unterminated") && !m.error')
    def test_command_13_editor_consumes_same_package(self):
        self.load('editor/index.html')
        self.assertJS('DxfEditorApp.cadWorkspace.commandLine.session && !DxfEditorApp.cadWorkspace.commandLine.disposed')
        self.page.evaluate('() => {DxfEditorApp.dockingWorkspace.show("render-console");}')
        field=self.page.locator('[data-cad-command=editor]');field.fill('HELP');field.press('Enter')
        self.page.wait_for_function('DxfEditorApp.cadWorkspace.log.textContent.includes("ZOOM EXTENTS")')

if __name__=='__main__':
    suite=unittest.TestSuite(CommandLineTests(n) for n in sorted(n for n in dir(CommandLineTests) if n.startswith('test_command_')))
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
