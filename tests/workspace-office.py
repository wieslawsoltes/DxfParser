#!/usr/bin/env python3
"""Standalone workspace and Office consumers with real host-supplied controls."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('docking_harness', ROOT / 'tests/docking-workspace.py')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
OUT = ROOT / 'test-results/workspace-office'

class WorkspaceOfficeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        h.DockingTests.setUpClass.__func__(cls); OUT.mkdir(parents=True, exist_ok=True)
    @classmethod
    def tearDownClass(cls): h.DockingTests.tearDownClass.__func__(cls)
    def setUp(self):
        h.DockingTests.setUp(self)
        self.page.goto(self.base + 'tests/workspace-office.html', wait_until='domcontentloaded')
        self.page.wait_for_function('!!window.libraryDemo')
        self.page.evaluate('() => { window.d=libraryDemo;window.a=d.a;window.b=d.b; }')
        self.page.wait_for_timeout(120)
    def tearDown(self):
        try: self.page.screenshot(path=str(OUT / (self._testMethodName + '.png')))
        finally: self.context.close()
        self.assertEqual([], self.errors)
    assertJS = h.DockingTests.assertJS

    def test_01_no_application_globals_and_two_independent_controls(self):
        self.assertJS('!window.app && !window.DxfOffice && !window.DxfDocking && !window.DxfGrid && !window.DxfAnalysis')
        self.assertJS('a.preview.book!==b.preview.book && a.preview.control.ReadOnly && b.preview.control.ReadOnly')
        self.assertJS('a.preview.book.ActiveWorksheet.GetCell("A2").Value==="Pump" && b.preview.book.ActiveWorksheet.GetCell("A2").Value==="Valve"')
    def test_02_storage_is_host_injected_and_layout_restore_preserves_nodes(self):
        self.page.evaluate('() => { a.workspace.save();b.workspace.save();window.content=a.preview.node;a.workspace.importLayout(a.workspace.exportLayout()); }')
        self.assertJS('d.values.has("dxf.workspace.one.v1") && d.values.has("dxf.workspace.two.v1") && a.workspace.manager.Find("document").Content===content && b.preview.node.isConnected')
    def test_03_optional_grid_rejects_before_replacing_text(self):
        self.assertJS('''async () => {
          const Preview=d.createOfficePreview({window}), p=new Preview();document.body.append(p.node);
          await p.open(new TextEncoder().encode('retained'), 'readme.txt'); const control=p.control;
          const result=await p.open(new TextEncoder().encode('A,B'), 'new.csv');
          const valid=!result && p.control===control && p.filename==='readme.txt' && p.status.textContent.includes('GridWeb');
          p.dispose();p.node.remove();return valid;
        }''')
    def test_04_stale_file_read_cannot_replace_new_preview(self):
        self.assertJS('''async () => {
          let resolve;const old=a.preview.openFile({size:5,name:'old.txt',arrayBuffer:()=>new Promise(r=>resolve=r)});
          await a.preview.open(new TextEncoder().encode('new'), 'new.txt');
          resolve(new TextEncoder().encode('old').buffer);
          return !await old && a.preview.filename==='new.txt' && a.preview.control.textContent==='new';
        }''')
    def test_05_image_and_download_urls_are_released_on_dispose(self):
        self.assertJS('''async () => {
          const revoke=URL.revokeObjectURL.bind(URL), revoked=[];
          URL.revokeObjectURL=url=>{revoked.push(url);revoke(url);};
          try {
            await a.preview.open(new Uint8Array([137,80,78,71]),'image.png');const image=a.preview.imageURL;
            a.preview.saveBytes(new Uint8Array([1]),'test.bin');const download=[...a.preview.downloads.keys()][0];
            a.preview.dispose();a.preview.dispose();
            return revoked.includes(image) && revoked.includes(download) && a.preview.downloads.size===0 && !b.preview.disposed;
          } finally { URL.revokeObjectURL=revoke; }
        }''')
    def test_06_foreign_archive_container_rejects_without_mutation(self):
        self.assertJS('''async () => {
          const document2=document.implementation.createHTMLDocument('foreign'), node=document2.body;node.textContent='sentinel';
          try{await a.preview.browseArchive(new Uint8Array(),node,new Map());return false;}
          catch(error){return error instanceof TypeError && node.textContent==='sentinel';}
        }''')
    def test_07_dynamic_title_registration_and_removal(self):
        self.page.evaluate('''() => {
          window.titleNode=document.createElement('span');titleNode.textContent='Initial';
          window.panel=document.createElement('div');panel.append(titleNode);
          a.workspace.register({id:'dynamic',title:'Initial',node:panel,titleNode});a.workspace.show('dynamic');
          titleNode.textContent='Updated';
        }''')
        self.page.wait_for_function('a.workspace.manager.Find("dynamic").Title==="Updated"')
        self.page.evaluate('() => { a.workspace.unregister("dynamic");titleNode.textContent="Detached"; }')
        self.assertJS('!a.workspace.definitions.has("dynamic") && !panel.isConnected && b.preview.node.isConnected')
    def test_08_invalid_workspace_panels_reject_before_reparenting(self):
        self.assertJS('''() => {
          const shell=document.createElement('div'), content=document.createElement('div');shell.append(content);document.body.append(shell);
          const foreign=document.implementation.createHTMLDocument('foreign').createElement('div');
          let rejected=false;try{new d.Workspace({id:'foreign',title:'Foreign',shell,presets:['Default'],defaultPreset:'Default',layout:()=>{},panels:[{id:'ok',node:content},{id:'bad',node:foreign}]});}catch(error){rejected=error instanceof TypeError;}
          const valid=rejected && content.parentNode===shell && shell.children.length===1;shell.remove();return valid;
        }''')
    def test_09_disposal_callbacks_do_not_patch_manager_or_damage_neighbors(self):
        self.assertJS('''() => {
          let removed=0,called=0;const detach=a.workspace.onDispose(()=>removed++);detach();
          a.workspace.onDispose(()=>{called++;throw new Error('cleanup error');});a.workspace.onDispose(()=>called++);
          let aggregated=false;try{a.workspace.dispose();}catch(error){aggregated=error instanceof AggregateError;}
          a.workspace.dispose();return aggregated && called===2 && removed===0 && a.preview.disposed && !a.workspace.host.isConnected && !b.preview.disposed && b.workspace.host.isConnected;
        }''')
    def test_10_pending_layout_file_cannot_override_a_new_preset(self):
        value=self.page.evaluate('() => { const value=JSON.parse(a.workspace.exportLayout());value.theme="dark";return JSON.stringify(value); }')
        self.page.evaluate('() => { File.prototype.text=function(){return new Promise(resolve=>{window.resolveLayout=resolve;});}; }')
        self.page.locator('#one input[aria-label="Import workspace layout file"]').set_input_files({'name':'layout.json','mimeType':'application/json','buffer':value.encode()})
        self.page.wait_for_function('typeof resolveLayout==="function"')
        self.page.evaluate('(text) => { a.workspace.applyPreset("Default");resolveLayout(text); }', value)
        self.page.wait_for_timeout(100)
        self.assertJS('(a.workspace.manager.Theme.Name||a.workspace.manager.Theme)==="light"')
    def test_11_archives_use_supplied_view_and_remain_independent(self):
        self.assertJS('''async () => {
          const zip=new JSZip();zip.file('readme.txt','archive text');const bytes=await zip.generateAsync({type:'uint8array'});
          await a.preview.open(bytes,'files.zip');
          const archive=d.archives.at(-1);if(!archive || archive.rows.length!==1)return false;
          await archive.rows[0].actions[0].run();
          return a.preview.filename==='readme.txt' && a.preview.control.textContent==='archive text' && b.preview.filename==='two.csv';
        }''')
    def test_12_richtext_uses_host_registration_and_sanitizes_media(self):
        self.assertJS('''async () => {
          const ok=await a.preview.open(new TextEncoder().encode('<p>Review</p><img src="https://invalid.test/image.png">'),'review.html');
          return ok && a.preview.control.IsReadOnly && !JSON.stringify(a.preview.control.Document.ToJSON()).includes('https://invalid.test');
        }''')
    def test_13_disposed_preview_cannot_finish_an_import(self):
        self.assertJS('''async () => {
          let resolve;const pending=a.preview.openFile({size:3,name:'late.txt',arrayBuffer:()=>new Promise(r=>resolve=r)});
          a.workspace.dispose();resolve(new TextEncoder().encode('old').buffer);
          return !await pending && a.preview.original===null && !b.preview.disposed;
        }''')
    def test_14_declining_storage_keeps_workspace_functional(self):
        self.assertJS('''() => {
          const {Workspace}=d.createDockingWorkspace({window,dockyard:AvalonDock,storage:{getItem(){throw new Error('storage denied');},setItem(){throw new Error('quota');}}});
          const shell=document.createElement('section');document.body.append(shell);const node=document.createElement('div');
          const w=new Workspace({...a.workspace.options,id:'blocked',shell,panels:[{id:'document',title:'Document',node,kind:'document'}]});
          const valid=!w.save() && w.isOpen('document') && w.status.dataset.error==='true';w.dispose();shell.remove();return valid;
        }''')

if __name__ == '__main__': unittest.main(verbosity=2)
