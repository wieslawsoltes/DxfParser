/* Retained, source-owned native drawing documents. Dock placement, comparison
 * operands and render-view ownership are deliberately independent concepts. */
(function (global) {
    'use strict';
    const N = global.DxfDocking, A = global.AvalonDock, R = global.DxfRendering;
    const TOOL_FIELDS = { 'render-info': 'infoTabPanel', 'render-layers': 'layersTabPanel',
        'render-blocks': 'blocksTabPanel', 'render-properties': 'propertyPanel' };
    class DrawingViews {
        constructor(app, workspace, template) {
            this.app = app; this.workspace = workspace; this.template = template;
            this.records = new Map(); this.abort = new AbortController(); this.retirements = new Set();
            this.maxViews = 32; this.serial = 0; this.activating = false; this.disposed = false;
            this.storageKey = workspace.storageKey + '.drawing-views.v1';
            this.slots = new Map([...workspace.definitions.values()].filter(d => d.id.startsWith('render-')).map(d => [d.id, d.node]));
            this.base = { id: 'rendering', node: app.renderingOverlayController.overlayRoot,
                overlay: app.renderingOverlayController, cad: app.cadWorkspace,
                controls: workspace.legacyCommandSources.viewControls, tools: new Map(), stash: document.createDocumentFragment(),
                blockIsolation: app.blockIsolation, blockHighlights: app.blockHighlights, abort: new AbortController() };
            for (const [id, slot] of this.slots) this.base.tools.set(id, slot.firstElementChild);
            this.active = this.base;
            this.navigation = new N.DrawingViewTools.NavigationLink({
                records: () => this.records.values(), active: () => this.active,
                visible: r => r.visible && this.isVisible(r), frame: r => r.overlay.surfaceManager.lastFrame,
                layout: r => r.overlay.surfaceManager.layout,
                schedule: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id),
                apply: (r, camera, history) => {
                    r.overlay.surfaceManager.viewDirection = { ...camera.direction };
                    r.overlay.applyViewState(camera.viewState, { recordHistory: history });
                    r.cad.refresh();
                },
                changed: () => { this.scheduleSave(); this.app.ribbonWorkspace?.schedule(); },
                error: error => this.workspace.notify(error.message, true)
            });
            this.selectors = { ...this.base.overlay.selectors };
            // The ribbon keeps this facade. Every asynchronous action is bound to
            // its original CadWorkspace; only ribbon factory closures remain dynamic.
            const owner = this;
            // Never use a source-owned controller as the Proxy target: even a
            // disposed target would otherwise stay reachable for the entire app.
            const facadeTarget = Object.create(Object.getPrototypeOf(this.base.cad));
            app.cadWorkspace = new Proxy(facadeTarget, {
                get(_target, key) {
                    const cad = owner.active?.cad || owner.base.cad, value = cad[key];
                    return typeof value === 'function' && key !== 'ribbonGroups' ? value.bind(cad) : value;
                },
                set(_target, key, value) { (owner.active?.cad || owner.base.cad)[key] = value; return true; }
            });
            Object.defineProperty(app, 'renderingOverlayController', { configurable: true,
                get: () => (this.active || this.base).overlay });
            for (const key of ['blockIsolation', 'blockHighlights']) Object.defineProperty(app, key, { configurable: true,
                get: () => (this.active || this.base)[key], set: value => { (this.active || this.base)[key] = value; } });
            // Direct overlay callers (notably snapshots) must never hijack a view.
            this.installRouting(this.base);
            workspace.unsubscribers.push(
                workspace.manager.ActiveContentChanged.add((_s, { Model }) => {
                    const record = [...this.records.values()].find(r => r.id === Model?.ContentId);
                    if (record) this.activate(record);
                }),
                workspace.manager.ThemeChanged.add(() => {
                    for (const r of this.records.values()) {
                        const theme = workspace.manager.Theme?.Name || workspace.manager.Theme;
                        for (const view of r.cad.views) view.setTheme(theme);
                        r.registry?.setTheme(theme); r.overlay.propertyGrid?.gridView?.setTheme(theme); r.cad.compare?.view?.setTheme(theme);
                    }
                })
            );
            this.unsubscribe = app.renderingDataController.subscribe(event => {
                const record = this.records.get(event.document?.tabId);
                if (event.type === 'ingest' && record && !record.updating) this.updateDocument(record, event.document);
            });
            const requestOpen = workspace.requestOpen.bind(workspace);
            workspace.requestOpen = id => {
                if (id !== 'rendering') return requestOpen(id);
                const tab = this.app.documentWorkspace.active?.tab || this.tabs()[0];
                if (tab) this.open({ tab }); else workspace.show('rendering');
            };
            const save = workspace.save.bind(workspace);
            workspace.save = () => { this.save(); return save(); };
            workspace.abort.signal.addEventListener('abort', () => this.dispose(), { once: true });
            document.addEventListener('visibilitychange', () => this.updateVisibility(), { signal: this.abort.signal });
        }
        tabs() { return [...this.app.tabs, ...this.app.tabsRight]; }
        find(id) { return this.records.get(this.tabs().find(t => String(t.id) === String(id))?.id); }
        layoutIds(placeholder = true) {
            const ids = [...this.records.values()].filter(r => r.open).map(r => r.id);
            return ids.length ? ids : placeholder ? ['rendering'] : [];
        }
        viewWorkspace(record) {
            const w = this.workspace, owner = this;
            return new Proxy(w, { get(target, key) {
                if (['show', 'hide', 'isOpen', 'requestOpen', 'setVisible'].includes(key)) return (id, ...args) => {
                    if ((key === 'show' || key === 'requestOpen') && id.startsWith('render-')) owner.activate(record);
                    return target[key](id === 'rendering' ? record.id : id, ...args);
                };
                const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
            }});
        }
        installRouting(record) {
            const o = record.overlay, originalOpen = o.open.bind(o);
            record.openOverlay = originalOpen;
            o.open = payload => { this.open(payload); };
            o.close = () => { if (record.tab && this.workspace.isOpen(record.id)) this.workspace.hide(record.id); else record.overlay.surfaceManager?.suspend(); };
            o.isInputActive = event => this.active === record && record.open && record.visible !== false &&
                (record.node.contains(event.target) || [...this.slots.values()].some(slot => slot.contains(event.target)) ||
                    event.target === document.body && this.workspace.manager.ActiveModel?.ContentId === record.id);
            o.dockingWorkspace = this.viewWorkspace(record);
            o.dockingInformationPanels = { info: 'render-info', layers: 'render-layers', blocks: 'render-blocks' };
            o.adapters = { ...o.adapters,
                getBlockIsolation: () => record.blockIsolation,
                getBlockHighlights: () => record.blockHighlights,
                toggleBlockHighlight: name => { this.activate(record); this.app.toggleBlockHighlight(name); },
                handleLinkToHandle: handle => {
                    const source = this.app.documentWorkspace.findByTab(record.tab?.id);
                    if (source) { this.app.documentWorkspace.activate(source, { focus: false }); this.app.handleLinkToHandle(handle); }
                    else this.workspace.notify('The rendered source drawing is closed.', true);
                }
            };
            record.cad.workspace = o.dockingWorkspace;
            const unsubscribeFrame = o.surfaceManager.subscribeFrame(frame => {
                if (record.disposed || !record.tab) return;
                const manager = o.surfaceManager;
                const stamp = JSON.stringify([manager.layout, manager.viewState, manager.viewDirection]);
                if (record.cameraStamp !== stamp) { record.cameraStamp = stamp; this.scheduleSave(); }
                this.navigation.onFrame(record, frame);
            });
            record.abort.signal.addEventListener('abort', unsubscribeFrame, { once: true });
            o.surfaceManager.canPresent = () => !record.disposed && this.isVisible(record);
            for (const type of ['pointerdown', 'focusin', 'wheel']) record.node.addEventListener(type, () => this.activate(record), { capture: true, signal: record.abort.signal });
        }
        createContext(id, suffix) {
                const node = this.template.cloneNode(true), ids = new Map();
                for (const e of [node, ...node.querySelectorAll('[id]')]) if (e.id) { const next = suffix ? e.id + '-' + suffix : e.id; ids.set(e.id, next); e.dataset.renderSourceId = e.id; e.id = next; }
                for (const e of node.querySelectorAll('[for],[aria-labelledby],[aria-controls],[aria-describedby]')) for (const attr of ['for', 'aria-labelledby', 'aria-controls', 'aria-describedby']) {
                    const value = e.getAttribute(attr); if (value) e.setAttribute(attr, value.split(/\s+/).map(id => ids.get(id) || id).join(' '));
                }
                const selectors = Object.fromEntries(Object.entries(this.selectors).map(([k, selector]) => [k, selector.replace(/#([\w-]+)/g, (_m, id) => '#' + (ids.get(id) || id))]));
                const overlay = new R.RenderingOverlayController({ root: node, selectors, document,
                    dataController: this.app.renderingDataController, dxfParser: this.app.dxfParser,
                    adapters: this.base.overlay.adapters });
                overlay.initializeDom();
                const cad = new global.DxfCad.CadWorkspace(this.app, 'parser', overlay);
                const record = { id, node, overlay, cad,
                    tools: new Map(), controls: N.element('div', 'dxf-dock-render-tool dxf-dock-view-controls'),
                    stash: document.createDocumentFragment(), blockIsolation: null, blockHighlights: new Set(), abort: new AbortController() };
                node.classList.add('dxf-dock-rendering');
                node.querySelector('.rendering-overlay-header').hidden = true;
                for (const [id, field] of Object.entries(TOOL_FIELDS)) {
                    const tool = overlay[field]; tool.hidden = false; tool.removeAttribute('role'); tool.removeAttribute('aria-labelledby'); tool.classList.add('dxf-dock-render-tool');
                    record.tools.set(id, tool); record.stash.append(tool);
                }
                for (const tool of cad.panels()) { record.tools.set(tool.id, tool.node); record.stash.append(tool.node); }
                for (const originalId of ['renderingVisualStyleControl', 'renderingMeasurementToolbar', 'renderingSelectionToolbar']) record.controls.append(node.querySelector(`[data-render-source-id="${originalId}"]`));
                record.controls.append(node.querySelector('.rendering-view-overlay'), overlay.navigationWheelEl);
                record.stash.append(record.controls); node.querySelector('.rendering-overlay-info').hidden = true;
                this.installRouting(record);
                record.registry = global.DxfGrid.createRenderingRegistry?.(overlay);
                return record;
        }
        create(tab, pane, preferredId) {
            if (this.records.size >= this.maxViews) throw new RangeError(`At most ${this.maxViews} retained drawing views may be open. Close source drawings to release their views.`);
            let record;
            if (!this.baseUsed && (!preferredId || preferredId === 'rendering')) {
                this.baseUsed = true; record = this.base;
            } else {
                record = this.createContext(preferredId || 'rendering:' + tab.id, 'drawing-view-' + (++this.serial));
                const {node, overlay} = record;
                this.workspace.register({ id: record.id, title: 'Drawing · ' + tab.name, kind: 'document', node,
                    onResize: () => overlay.resizeCanvas(), resizeNode: overlay.viewportEl,
                    onVisibility: visible => this.syncVisibility(record, visible), onClose: () => this.closed(record),
                    openAction: () => this.open({ tab: record.tab, pane: record.pane }) });
            }
            Object.assign(record, { tab, pane, open: true, visible: false, disposed: false });
            record.node.dataset.renderTabId = String(tab.id); record.node.tabIndex = 0;
            this.records.set(tab.id, record);
            const definition = this.workspace.require(record.id);
            Object.assign(definition, { title: 'Drawing · ' + tab.name, onResize: () => record.overlay.resizeCanvas(),
                onVisibility: visible => this.syncVisibility(record, visible), onClose: () => this.closed(record) });
            // The launcher must always resolve the current source, not a previously rendered tab.
            if (record !== this.base) definition.openAction = () => this.open({ tab: record.tab, pane: record.pane });
            record.overlay.currentTabId = tab.id;
            return record;
        }
        open({ tab, pane = 'left' } = {}) {
            if (this.disposed) throw new Error('Drawing workspace is disposed.');
            if (!tab || !this.tabs().includes(tab)) throw new Error('Choose an open source drawing.');
            pane = this.app.documentWorkspace.findByTab(tab.id)?.side || pane;
            const record = this.records.get(tab.id) || this.create(tab, pane);
            const doc = record.overlay.ensureDocumentForTab(tab);
            record.open = true; this.activate(record); this.workspace.show(record.id);
            if (doc && doc.status === 'ready' && doc !== record.overlay.currentDoc) this.updateDocument(record, doc);
            else if (!doc || doc.status !== 'ready') record.overlay.renderPlaceholder(tab, doc);
            record.node.style.display = 'block'; record.node.setAttribute('aria-hidden', 'false');
            this.workspace.require(record.id).title = 'Drawing · ' + tab.name;
            this.workspace.manager.Find(record.id).Title = 'Drawing · ' + tab.name;
            this.workspace.scheduleResize(); this.save();
            return record;
        }
        openById(id) { const tab = this.tabs().find(t => String(t.id) === String(id)); if (!tab) throw new Error('Source drawing is no longer open.'); return this.open({ tab }); }
        activateTab(id) { const r = this.records.get(id); if (r?.open && !this.activating) this.activate(r); }
        activate(record) {
            if (record.disposed || this.disposed || this.activating) return;
            this.activating = true;
            try {
                const changed = this.active !== record;
                if (changed) {
                    const previous = this.active;
                    if (previous) for (const [id, tool] of previous.tools) if (this.slots.get(id)?.contains(tool)) previous.stash.append(tool);
                    this.active = record;
                    for (const [id, tool] of record.tools) {
                        const slot = this.slots.get(id); if (!slot) continue;
                        slot.replaceChildren(tool); this.workspace.require(id).sourceTabId = record.tab?.id;
                    }
                }
                for (const [id, slot] of this.slots) { this.workspace.require(id).sourceTabId = record.tab?.id; slot.dataset.sourceTabId = record.tab?.id ?? ''; }
                const source = this.app.documentWorkspace.findByTab(record.tab?.id);
                if (source) this.app.documentWorkspace.activate(source, { focus: false });
                for (const r of this.records.values()) r.node.dataset.activeDrawing = String(r === record);
                if (changed) {
                    this.navigation.focus(record);
                    record.cad.refresh(); record.cad.refreshResources(); record.registry?.schedule();
                }
                this.app.ribbonWorkspace?.schedule();
            } finally { this.activating = false; }
        }
        updateDocument(record, doc) {
            if (record.disposed || !record.tab || doc.status !== 'ready') return;
            record.updating = true;
            try {
                const o = record.overlay;
                o.currentTabId = record.tab.id;
                const selected = new Set([...o.selectionHandles].filter(h => doc.byHandle.has(h)));
                o.selectionByTab.set(record.tab.id, selected);
                o.renderSceneGraph(record.tab, doc, record.pane);
                record.cad.refresh();
            } finally { record.updating = false; }
            this.setVisibility(record, this.isVisible(record));
        }
        isVisible(r) {
            const rect = r.overlay.viewportEl.getBoundingClientRect();
            return r.open && document.visibilityState !== 'hidden' && rect.width > 0 && rect.height > 0;
        }
        syncVisibility(record, visible) {
            if (record.disposed) return;
            // Layout deserialization and undo may reopen a model without its launcher.
            record.open = this.workspace.isOpen(record.id);
            this.setVisibility(record, visible);
        }
        setVisibility(record, visible) {
            if (record.disposed) return;
            visible = !!visible && record.open;
            record.visible = visible;
            const manager = record.overlay.surfaceManager;
            if (visible && manager.suspended) { manager.resume(); record.overlay.resizeCanvas(); }
            else if (!visible && !manager.suspended) manager.suspend();
            if (visible && manager.lastFrame) {
                if (record === this.active) this.navigation.focus(record);
                else this.navigation.onFrame(record, manager.lastFrame);
            }
        }
        updateVisibility() { for (const record of this.records.values()) this.setVisibility(record, this.isVisible(record)); }
        closed(record) {
            if (record.disposed) return;
            record.open = false; this.setVisibility(record, false);
            // A closed view keeps its state while its source file is still open.
            // Source close, not layout close, is the native-resource lifetime boundary.
            this.save(); this.app.ribbonWorkspace?.schedule();
        }
        syncFiles() {
            if (this.disposed) return;
            const tabs = new Map(this.tabs().map(t => [t.id, t]));
            for (const r of [...this.records.values()]) {
                const tab = tabs.get(r.tab.id); if (!tab) { this.release(r.tab.id); continue; }
                r.tab = tab;
                const side = this.app.documentWorkspace.findByTab(tab.id)?.side || r.pane;
                if (side !== r.pane) {
                    const oldKey = r.overlay.getViewContextKey(tab.id, r.pane), newKey = r.overlay.getViewContextKey(tab.id, side);
                    if (r.overlay.viewContexts.has(oldKey)) r.overlay.viewContexts.set(newKey, r.overlay.viewContexts.get(oldKey));
                    r.pane = side; r.overlay.currentPane = side;
                }
                const model = this.workspace.manager.Find(r.id);
                const title = 'Drawing · ' + tab.name; this.workspace.require(r.id).title = title;
                if (model) { model.Title = title; model.IsModified = !!tab.isModified; }
            }
        }
        renderAll() {
            const tabs = this.tabs();
            if (tabs.length > this.maxViews) throw new RangeError(`Render all supports at most ${this.maxViews} source drawings.`);
            for (const tab of tabs) this.open({ tab });
            if (tabs.length > 1) this.tile('horizontal');
        }
        tile(direction = 'horizontal') {
            const records = [...this.records.values()].filter(r => r.open && !r.disposed);
            const w = this.workspace, active = this.active, wasActivating = this.activating;
            this.activating = true;
            try {
                N.DrawingViewTools.tileDrawings(w.manager, records.map(r => w.manager.Find(r.id)), direction,
                    Math.max(1, w.host.clientWidth), Math.max(1, w.host.clientHeight));
            } finally { this.activating = wasActivating; }
            if (active && !active.disposed) this.activate(active);
            w.syncPresentation(); w.scheduleResize(); this.save();
        }
        setNavigation(mode) { this.navigation.setMode(mode); }
        matchView() { this.navigation.match(); }
        command(command, args) {
            if (command === 'RENDERLINK') {
                if (args.length > 1) throw new Error('RENDERLINK expects off, world or relative.');
                if (args.length) this.setNavigation(args[0].toLowerCase());
                else this.active?.cad.write('Drawing navigation: ' + this.navigation.mode);
            }
            else if (command === 'RENDERMATCH') {
                if (args.length) throw new Error('RENDERMATCH takes no arguments.');
                this.matchView();
            }
            else if (command === 'RENDERALL') this.renderAll();
            else if (command === 'RENDERTILE') {
                if (args.length > 1) throw new Error('RENDERTILE expects horizontal, vertical or grid.');
                this.tile((args[0] || 'horizontal').toLowerCase());
            }
            else if (command === 'RENDERDRAWING') {
                const name = args.join(' '), tabs = this.tabs().filter(t => String(t.id) === name || t.name.toUpperCase() === name.toUpperCase());
                if (tabs.length !== 1) throw new Error('Specify one unique drawing name or source tab ID.');
                this.open({ tab: tabs[0] });
            } else return false;
            return true;
        }
        restoreComparison(value) {
            // Validate before creating a business tab. Existing views/sessions are untouched.
            if (this.records.size >= this.maxViews) throw new RangeError('Close a source drawing before opening another comparison snapshot.');
            const C = global.DxfCompare, S = global.DxfSkia, document = new S.DxfDocument(value.currentText);
            const layout = value.metadata?.layout || 'Model';
            const scene = new S.SceneCompiler(document).compile(layout);
            new C.Session(new S.DxfDocument(value.referenceText), value.options).scene(scene);
            const parsed = this.app.dxfParser.parse(value.currentText);
            this.app.handleCreateNewDxf(); const tab = this.app.getActiveTab();
            Object.assign(tab, { name: value.metadata?.currentName || 'snapshot.dxf', originalTreeData: parsed,
                currentTreeData: parsed, renderingSourceText: value.currentText, isModified: true });
            this.app.applyTabFilters(tab); this.app.renderingDataController.ingestDocument({tabId: tab.id, fileName: tab.name, sourceText: value.currentText});
            this.app.updateTabUI(); const record = this.open({ tab, pane: 'left' });
            record.cad.layout(layout); record.cad.compare.start(value.referenceText, value.metadata?.referenceName || 'reference.dxf', value.options);
            record.cad.compare.open(); this.app.saveCurrentState(); return record;
        }
        scheduleSave() {
            if (this.disposed) return;
            clearTimeout(this.cameraSaveTimer);
            this.cameraSaveTimer = setTimeout(() => { this.cameraSaveTimer = null; this.save(); }, 200);
        }
        save() {
            if (this.disposed) return;
            clearTimeout(this.cameraSaveTimer); this.cameraSaveTimer = null;
            try {
                const views = [...this.records.values()].map(r => ({ tabId: r.tab.id, id: r.id, open: r.open,
                    layout: r.overlay.surfaceManager.layout, viewState: r.overlay.surfaceManager.viewState,
                    viewDirection: r.overlay.surfaceManager.viewDirection }));
                localStorage.setItem(this.storageKey, JSON.stringify({version: 1, active: this.active?.tab?.id, navigation: this.navigation.mode, views}));
            } catch (error) { this.persistenceError = error; }
        }
        restore() {
            let saved;
            try { const text = localStorage.getItem(this.storageKey); if (!text || text.length > 128 * 1024) return; saved = JSON.parse(text); } catch { return; }
            if (saved.version !== 1 || !Array.isArray(saved.views) || saved.views.length > this.maxViews) return;
            for (const item of saved.views) {
                const tab = this.tabs().find(t => t.id === item.tabId); if (!tab || this.records.has(tab.id)) continue;
                const id = item.id === 'rendering' && !this.baseUsed ? 'rendering' : 'rendering:' + tab.id;
                const r = this.create(tab, this.app.documentWorkspace.findByTab(tab.id)?.side || 'left', id);
                const doc = r.overlay.ensureDocumentForTab(tab); if (doc?.status !== 'ready') continue;
                this.updateDocument(r, doc); r.open = !!item.open;
                try {
                    const m = r.overlay.surfaceManager; m.setLayout(item.layout || 'Model');
                    if (item.viewDirection) m.setViewDirection(item.viewDirection);
                    if (item.viewState) r.overlay.applyViewState(item.viewState);
                } catch { /* Corrupt optional camera settings never prevent opening a source. */ }
                this.setVisibility(r, false);
            }
            const active = this.records.get(saved.active); if (active) this.activate(active);
            // Enabling an empty link is deferred until the restored dock layout exposes a view.
            if (['world', 'relative'].includes(saved.navigation)) this.navigation.mode = saved.navigation;
        }
        release(tabId) {
            const r = this.records.get(tabId); if (!r || r.disposed) return;
            this.records.delete(tabId); r.disposed = true; r.open = false; r.abort.abort();
            if (this.active === r) {
                for (const [id, tool] of r.tools) if (this.slots.get(id)?.contains(tool)) r.stash.append(tool);
                this.active = null;
            }
            const manager = r.overlay.surfaceManager;
            this.app.tabularReports?.removeRoots([...r.tools.values()]);
            r.registry?.dispose(); r.cad.dispose(); r.overlay.dispose();
            const retirement = manager.dispose().finally(() => this.retirements.delete(retirement));
            this.retirements.add(retirement);
            if (r !== this.base) this.workspace.unregister(r.id);
            else if (!this.disposed) {
                const w = this.workspace, def = w.require('rendering'), model = w.manager.Find(r.id);
                model?.Parent?.Children?.Remove(model); w.manager.ReleaseContent(r.id);
                w.resizeObserver.unobserve(def.resizeNode || def.node); r.node.remove();
                this.base = this.createContext('rendering', null); this.baseUsed = false;
                const {node, overlay} = this.base;
                node.classList.add('dxf-dock-surface'); node.dataset.dockPanel = 'rendering';
                node.style.display = 'none'; w.parking.append(node);
                Object.assign(def, { node, titleNode: overlay.titleEl, resizeNode: overlay.viewportEl,
                    onResize: () => overlay.resizeCanvas(), wasOpen: false, bridgeVisible: false });
                delete def.onVisibility; delete def.onClose;
                w.resizeObserver.observe(overlay.viewportEl);
                w.observer.observe(node, {attributes: true, attributeFilter: ['style']});
                w.observer.observe(overlay.titleEl, {childList: true, characterData: true, subtree: true});
            }
            r.stash.replaceChildren(); r.tools.clear(); r.tab = null;
            if (!this.active && !this.disposed) this.activate([...this.records.values()].find(r => r.open) || this.base);
            this.workspace.manager.ClearHistory(); this.save();
        }
        dispose() {
            if (this.disposed) return;
            this.save(); this.disposed = true; clearTimeout(this.cameraSaveTimer);
            this.navigation.dispose(); this.abort.abort(); this.unsubscribe?.();
            for (const r of [...this.records.values()]) this.release(r.tab.id);
            this.base.abort.abort(); this.base.registry?.dispose(); this.base.cad.dispose(); this.base.overlay.dispose();
        }
    }
    N.DrawingViews = DrawingViews;
})(window);
