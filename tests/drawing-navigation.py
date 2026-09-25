#!/usr/bin/env python3
"""Linked navigation and transactional grids through HTTP, native Skia and Dockyard."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('multi_harness',ROOT/'tests/multiple-drawings.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
OUT=ROOT/'test-results/drawing-navigation'

class DrawingNavigationTests(h.MultipleDrawingTests):
    def tearDown(self):
        OUT.mkdir(parents=True,exist_ok=True)
        try:
            self.page.screenshot(path=str(OUT/(self._testMethodName+'.png')))
            state=self.page.evaluate('() => ({mode:app.drawingViews.navigation.mode,views:[...app.drawingViews.records.values()].map(r=>({id:r.id,open:r.open,visible:r.visible,camera:r.overlay.surfaceManager.lastFrame?DxfDocking.DrawingViewTools.captureCamera(r.overlay.surfaceManager.lastFrame):null}))})')
            (OUT/(self._testMethodName+'.json')).write_text(json.dumps(state,indent=2))
        finally:self.context.close()
        self.assertEqual([],self.errors,'Uncaught application errors')
    def same_world(self):
        self.assertJS('DxfDocking.DrawingViewTools.sameCamera(b.overlay.surfaceManager.lastFrame,DxfDocking.DrawingViewTools.transferCamera(DxfDocking.DrawingViewTools.captureCamera(a.overlay.surfaceManager.lastFrame),b.overlay.surfaceManager.lastFrame))')
    def test_nav_01_world_commands_preserve_documents_and_resources(self):
        self.two();self.focus('a')
        self.page.evaluate('() => { window.sceneA=a.overlay.surfaceManager.compiled;window.sceneB=b.overlay.surfaceManager.compiled;window.resourcesB=b.overlay.surfaceManager.resources; }')
        self.command('RENDERLINK world');self.command('ZOOM 2');self.command('PAN 50 25');self.same_world()
        self.assertJS('a.overlay.surfaceManager.compiled===sceneA && b.overlay.surfaceManager.compiled===sceneB && b.overlay.surfaceManager.resources===resourcesB && a.overlay.currentDoc!==b.overlay.currentDoc')
    def test_nav_02_wheel_focus_and_camera_are_synchronized(self):
        self.two();self.focus('a');self.command('RENDERLINK world')
        box=self.page.evaluate('b.overlay.viewportEl.getBoundingClientRect().toJSON()')
        self.page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);self.page.mouse.wheel(0,-100);self.settle()
        self.assertJS('views.active===b');self.same_world()
    def test_nav_03_projection_and_rotation_are_linked(self):
        self.two();self.focus('a');self.command('RENDERLINK world');self.command('VIEW ISOMETRIC')
        self.page.evaluate('() => { const f=a.overlay.surfaceManager.lastFrame;a.overlay.applyViewState({...f.viewState,mode:"custom",rotationRad:0.4}); }');self.settle()
        self.same_world();self.assertJS('b.overlay.surfaceManager.viewDirection.z<0.6 && b.overlay.surfaceManager.lastFrame.rotationRad===0.4')
    def test_nav_04_relative_camera_uses_each_drawing_extents(self):
        self.two();self.focus('a');self.command('RENDERLINK relative');self.command('ZOOM 2');self.command('PAN 40 -25')
        self.assertJS('(() => {const T=DxfDocking.DrawingViewTools,x=T.captureCamera(a.overlay.surfaceManager.lastFrame),y=T.captureCamera(b.overlay.surfaceManager.lastFrame);return Math.abs(x.zoom-y.zoom)<1e-8 && Math.abs(x.offset.x-y.offset.x)<1e-8 && Math.abs(x.offset.y-y.offset.y)<1e-8 && x.center.x!==y.center.x;})()')
    def test_nav_05_independent_mode_cancels_pending_propagation(self):
        self.two();self.focus('a')
        self.page.evaluate('() => {window.beforeB=JSON.stringify(b.overlay.surfaceManager.viewState);views.setNavigation("world");a.overlay.zoomView(2);views.setNavigation("off"); }');self.settle()
        self.assertJS('JSON.stringify(b.overlay.surfaceManager.viewState)===beforeB && views.navigation.pending===null')
    def test_nav_06_match_is_one_shot_and_keeps_followers_history_bounded(self):
        self.two();self.focus('a');self.command('ZOOM 2');self.command('RENDERMATCH');self.same_world()
        self.page.evaluate('() => {window.beforeB=JSON.stringify(b.overlay.surfaceManager.viewState); }');self.command('PAN 30 10')
        self.assertJS('views.navigation.mode==="off" && JSON.stringify(b.overlay.surfaceManager.viewState)===beforeB')
        self.command('RENDERLINK world')
        self.page.evaluate('() => {window.count=b.overlay.ensureViewContext().history.length;for(let i=0;i<30;i++)a.overlay.zoomView(1.01); }');self.settle()
        self.same_world();self.assertJS('b.overlay.ensureViewContext().history.length===count')
    def test_nav_07_hidden_views_stay_suspended_and_catch_up(self):
        self.two();self.focus('a');self.command('RENDERLINK world')
        self.page.evaluate('() => {w.hide(b.id);window.paints=b.overlay.surfaceManager.host.paintCount; }');self.command('PAN 50 50')
        self.assertJS('b.overlay.surfaceManager.suspended && b.overlay.surfaceManager.host.paintCount===paints')
        self.page.evaluate('() => {views.openById(b.tab.id);views.tile("horizontal"); }');self.settle();self.same_world()
    def test_nav_08_layout_mismatch_does_not_switch_or_overwrite_peer(self):
        self.two();self.focus('a');self.command('RENDERLINK world')
        paper=[(0,'LINE'),(5,'BB'),(67,1),(410,'Sheet A'),(10,0),(20,0),(11,50),(21,20)]
        self.page.evaluate('(text) => {app.renderingDataController.ingestDocument({tabId:b.tab.id,fileName:b.tab.name,sourceText:text});b.cad.layout("Sheet A");window.beforePaper=JSON.stringify(b.overlay.surfaceManager.viewState); }',h.h.drawing(h.h.LINE+paper))
        self.command('PAN 30 20')
        self.assertJS('b.overlay.surfaceManager.layout==="Sheet A" && JSON.stringify(b.overlay.surfaceManager.viewState)===beforePaper')
        self.page.evaluate('() => {b.cad.layout("Model"); }');self.settle();self.same_world()
    def four(self):
        self.two()
        for i in range(2):
            self.page.locator('#fileInputLeft').set_input_files({'name':f'extra-{i}.dxf','mimeType':'application/dxf','buffer':h.h.drawing(h.h.LINE).encode()})
        self.page.wait_for_function('app.tabs.length===4')
        self.page.evaluate('() => {views.renderAll();views.tile("grid"); }');self.settle()
        self.page.wait_for_function('[...views.records.values()].every(r=>r.visible && r.overlay.surfaceManager.stats)')
    def test_nav_09_four_view_grid_is_balanced_and_keeps_active_source(self):
        self.four();self.focus('a');self.command('RENDERTILE grid')
        self.assertJS('views.active===a && [...views.records.values()].every(r=>r.visible)')
        self.assertJS('(() => {const boxes=[...views.records.values()].map(r=>r.overlay.viewportEl.getBoundingClientRect());return Math.max(...boxes.map(b=>b.width))-Math.min(...boxes.map(b=>b.width))<3 && Math.max(...boxes.map(b=>b.height))-Math.min(...boxes.map(b=>b.height))<3 && new Set(boxes.map(b=>Math.round(b.top))).size===2;})()')
    def test_nav_10_grid_and_linear_tiling_are_single_undo_steps(self):
        self.four()
        self.page.evaluate('() => {w.manager.ClearHistory();views.tile("vertical"); }');self.settle()
        self.assertJS('w.manager._undo.length===1')
        self.page.evaluate('() => {w.manager.Undo(); }');self.settle()
        self.assertJS('new Set([...views.records.values()].map(r=>Math.round(r.overlay.viewportEl.getBoundingClientRect().top))).size===2')
        self.page.evaluate('() => {w.manager.Redo(); }');self.settle()
        self.assertJS('new Set([...views.records.values()].map(r=>Math.round(r.overlay.viewportEl.getBoundingClientRect().top))).size===4')
    def test_nav_11_locked_view_rejects_tiling_atomically(self):
        self.two();self.focus('a')
        self.page.evaluate('() => {w.manager.Find(b.id).CanMove=false; }');self.settle()
        # Focus the console before the snapshot: UI focus is an independent dock
        # activation, not a mutation performed by the rejected tile transaction.
        field=self.page.locator('#parserCadCommand');field.fill('RENDERTILE grid');self.settle()
        self.page.evaluate('() => {window.before=w.manager.SaveLayout(); }')
        field.press('Enter');self.settle()
        self.assertJS('a.cad.log.textContent.includes("movable")')
        self.assertJS('w.manager.SaveLayout()===before')
    def test_nav_12_reload_restores_navigation_mode_and_cameras(self):
        self.two();self.focus('a');self.command('RENDERLINK world');self.command('ZOOM 2')
        self.page.evaluate('() => {app.saveCurrentState();w.save(); }');self.page.reload(wait_until='domcontentloaded')
        self.page.wait_for_function('app.drawingViews.records.size===2');self.settle()
        self.assertJS('app.drawingViews.navigation.mode==="world"')
        self.page.evaluate('() => {window.views=app.drawingViews;[window.a,window.b]=[...views.records.values()]; }');self.same_world()
    def test_nav_13_closing_leader_does_not_retain_or_break_navigation(self):
        self.two();self.focus('a');self.command('RENDERLINK world')
        self.page.evaluate('() => {window.old=a.overlay.surfaceManager;dw.remove(dw.findByTab(a.tab.id)); }');self.settle()
        self.assertJS('old.frameListeners.size===0 && views.active===b && views.navigation.mode==="world"')
        self.command('ZOOM 2');self.assertJS('!b.overlay.surfaceManager.error && b.visible')
    def test_nav_14_ribbon_controls_and_invalid_navigation_command(self):
        self.two();self.focus('a')
        self.page.evaluate('() => {rb.execute("skia-navigation-link","relative"); }');self.settle()
        self.assertJS('views.navigation.mode==="relative"');self.command('RENDERLINK invalid')
        self.assertJS('views.navigation.mode==="relative" && a.cad.log.textContent.includes("off, world or relative")')
        self.page.evaluate('() => {rb.execute("skia-tile-grid"); }');self.settle();self.assertJS('a.visible && b.visible')

if __name__=='__main__':
    suite=unittest.TestSuite(DrawingNavigationTests(n) for n in sorted(n for n in dir(DrawingNavigationTests) if n.startswith('test_nav_')))
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
