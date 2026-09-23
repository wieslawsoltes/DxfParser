/* Retained, independently dockable DXF documents. The DXF TreeDataGrid engine is reused. */
(function (global) {
  'use strict';
  const { element } = global.DxfDocking;
  const REPORT_METHODS = {
    updateClouds: 'cloudOverlay', updateStats: 'statsOverlay', updateDependencies: 'depsOverlay',
    updateHandleMap: 'handleMapOverlay', showBinaryObjectsOverlay: 'binaryObjectsOverlay',
    showProxyObjectsOverlay: 'proxyObjectsOverlay', updateFonts: 'fontsOverlay', updateClasses: 'classesOverlay',
    filterClassesByAppName: 'classesOverlay', showObjectSizeDialog: 'objectSizeOverlay',
    updateBlocksOverlay: 'blocksOverlay', updateLineTypes: 'lineTypesOverlay', updateTexts: 'textsOverlay',
    showDiagnosticsOverlay: 'diagnosticsOverlay', runDiagnostics: 'diagnosticsOverlay', openFiltersOverlay: null
  };

  class DocumentWorkspace {
    constructor(app, workspace) {
      this.app = app; this.workspace = workspace; this.manager = workspace.manager;
      this.records = new Map(); this.active = null; this.syncing = false; this.disposed = false;
      this.abort = new AbortController(); this.originalMethods = new Map();
      this.empty = {
        left: { grid: app.myTreeGridLeft, container: app.treeViewContainer, content: app.treeViewContent },
        right: { grid: app.myTreeGridRight, container: app.treeViewContainerRight, content: app.treeViewContentRight }
      };
      this.headerTemplate = document.getElementById('treeGridHeaderLeft').cloneNode(true);
      app.documentWorkspace = this;
      workspace.unsubscribers.push(
        this.manager.ActiveContentChanged.add((_sender, { Model }) => {
          const record = this.records.get(Model?.ContentId);
          if (record && !this.syncing) this.activate(record, { focus: false });
          app.ribbonWorkspace?.schedule();
        }),
        this.manager.DocumentClosing.add((_sender, args) => {
          const record = this.records.get(args.Document?.ContentId);
          if (record?.tab.isModified && !global.confirm(`Close “${record.tab.name}” without downloading your changes?`)) args.Cancel = true;
        }),
        this.manager.DocumentClosed.add((_sender, args) => {
          const record = this.records.get(args.Document?.ContentId);
          if (record && !this.syncing) this.remove(record);
        }),
        this.manager.LayoutChanged.add(() => {
          if (!this.syncing && !this.disposed) queueMicrotask(() => this.reconcileLayout());
        })
      );
      this.installReportContexts();
      this.installMutationTracking();
      const previousDispose = workspace.dispose.bind(workspace);
      workspace.dispose = () => { this.dispose(); previousDispose(); };
      global.addEventListener('beforeunload', event => {
        if ([...this.records.values()].some(r => r.tab.isModified)) { event.preventDefault(); event.returnValue = ''; }
      }, { signal: this.abort.signal });
      this.sync();
    }

    findByTab(id) { return this.records.get(`dxf:${id}`); }
    side() { return this.active?.side || 'left'; }
    current(side) { return this.findByTab(this.app.getComparisonTab(side)?.id); }

    create(tab, side) {
      const id = `dxf:${tab.id}`;
      const node = element('section', 'dxf-file-document');
      node.dataset.documentSide = side; node.dataset.documentId = String(tab.id);
      node.setAttribute('aria-label', tab.name); node.tabIndex = -1;
      const headerClip = element('div', 'dxf-tree-header-clip');
      const header = this.headerTemplate.cloneNode(true); header.id = `dxf-header-${String(tab.id).replace(/[^a-z0-9_-]/gi, '-')}`;
      headerClip.append(header);
      const container = element('div', 'dxf-document-tree');
      const content = element('div', 'dxf-document-tree-content');
      container.append(content); node.append(headerClip, container);
      const record = { id, tab, side, node, header, container, content, grid: null, abort: new AbortController() };
      // Headers must be connected before TreeDataGrid binds its resizers.
      this.workspace.parking.append(node);
      const run = fn => (...args) => { this.activate(record, { focus: false }); return fn(...args); };
      record.grid = new TreeDataGrid(container, content, {
        itemHeight: 24, headerRootId: header.id,
        columnWidths: { ...(tab.columnWidths || this.app.columnWidths) }, minimumColumnWidths: { type: 200 },
        copyCallback: run(id => this.app.handleCopy(id)),
        openCallback: run(id => record.side === 'right' ? this.app.handleOpenRight(id) : this.app.handleOpen(id)),
        openAndZoomCallback: run(id => this.app.handleOpenAndZoom(id)),
        openAndZoomPredicate: node => this.app.shouldShowOpenAndZoom(node),
        openBlockCallback: run(id => this.app.openBlockForPane(id, record.side)),
        openBlockPredicate: node => this.app.shouldShowOpenBlock(node),
        onToggleExpand: run(id => this.app.handleToggleExpand(id)),
        onHandleClick: run(handle => this.app.handleLinkToHandle(handle)),
        onRowSelect: run(id => { this.app.selectedNodeId = id; record.selectedNodeId = id; if (record.side === 'right') this.app.selectedNodeIdRight = id; this.app.ribbonWorkspace?.schedule(); }),
        hexViewerCallback: run(hex => this.app.showHexViewer(hex)), onEdit: () => this.markModified(record)
      });
      record.grid.setData(tab.currentTreeData || tab.originalTreeData || []);
      for (const type of ['pointerdown', 'focusin', 'contextmenu']) {
        node.addEventListener(type, () => this.activate(record, { focus: false }), { capture: true, signal: record.abort.signal });
      }
      for (const cell of header.querySelectorAll('.header-cell')) cell.addEventListener('click', event => {
        if (event.target.closest('.resizer')) return;
        this.activate(record, { focus: false }); this.app.handleHeaderClick(cell);
        if (this.app.sideBySideDiffEnabled) this.app.computeAndApplySideBySideDiff();
      }, { signal: record.abort.signal });
      node.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); }, { signal: record.abort.signal });
      node.addEventListener('drop', event => {
        if (!event.dataTransfer?.files.length) return;
        event.preventDefault(); event.stopPropagation(); this.app.handleFiles(event.dataTransfer.files, record.side);
      }, { signal: record.abort.signal });
      tab.columnWidths = record.grid.columnWidths;
      this.app.stateManager.saveTabState(tab);
      this.records.set(id, record);
      this.workspace.register({ id, title: tab.name, node, kind: 'document', keepOpen: true, fileSide: side,
        isModified: !!tab.isModified, onResize: () => record.grid.updateVisibleNodes() });
      this.insert(record);
      return record;
    }

    destination(side) {
      const A = global.AvalonDock;
      const placeholder = this.manager.Find(`tree-${side}`);
      if (placeholder?.Parent instanceof A.LayoutDocumentPane) return placeholder.Parent;
      const existing = [...this.records.values()].find(r => r.side === side && this.manager.Find(r.id)?.Parent instanceof A.LayoutDocumentPane);
      return existing ? this.manager.Find(existing.id).Parent : this.manager.FindById(`dxf-pane-${side}`);
    }

    insert(record) {
      let model = this.manager.Find(record.id);
      if (!model) {
        const pane = this.destination(record.side);
        model = this.workspace.make(record.id);
        this.manager.AddDocument(model, pane instanceof global.AvalonDock.LayoutDocumentPane ? pane : null);
      }
      this.removePlaceholder(record.side);
      return model;
    }

    removePlaceholder(side) {
      if (![...this.records.values()].some(r => r.side === side)) return;
      const empty = this.manager.Find(`tree-${side}`);
      if (empty?.Parent?.Children) empty.Parent.Children.Remove(empty);
    }

    /** Synchronize business records without recreating live DOM/grid instances. */
    sync() {
      if (this.syncing || this.disposed) return;
      this.syncing = true;
      let newRecord = null, changed = false;
      try {
        const live = new Set();
        for (const [side, tabs] of [['left', this.app.tabs], ['right', this.app.tabsRight]]) {
          for (const tab of tabs) {
            const id = `dxf:${tab.id}`; live.add(id);
            let record = this.records.get(id);
            if (!record) { record = this.create(tab, side); newRecord = record; changed = true; }
            else {
              if (record.tab !== tab) { record.tab = tab; record.grid.setData(tab.currentTreeData || tab.originalTreeData); }
              record.side = side; record.node.dataset.documentSide = side;
              Object.assign(this.workspace.require(id), {fileSide:side, title:tab.name, isModified:!!tab.isModified});
              record.node.setAttribute('aria-label',tab.name);
              const model = this.manager.Find(id); if (model) { model.Title = tab.name; model.IsModified = !!tab.isModified; }
            }
          }
        }
        for (const record of [...this.records.values()]) if (!live.has(record.id)) { this.release(record); changed = true; }
        const leftChanged = this.lastLeft !== this.app.activeTabId, rightChanged = this.lastRight !== this.app.activeTabIdRight;
        const chosen = newRecord || (rightChanged ? this.current('right') : leftChanged ? this.current('left') : null)
          || (this.active && this.records.get(this.active.id)) || this.current('left') || this.current('right') || null;
        this.bindOperands();
        if (chosen) this.activate(chosen, { focus: !!(newRecord || leftChanged || rightChanged), force: true });
        else { this.active = null; this.bindOperands(); }
        for (const side of ['left', 'right']) {
          if ([...this.records.values()].some(r => r.side === side)) this.removePlaceholder(side);
          else if (side === 'left' || this.workspace.preset === 'Compare') this.workspace.show(`tree-${side}`, { activate: false });
        }
        this.lastLeft = this.app.activeTabId; this.lastRight = this.app.activeTabIdRight;
        // Business-document lifetime is not layout undo. Never resurrect closed DXF records from history.
        if (changed) this.manager.ClearHistory();
      } finally { this.syncing = false; }
      this.workspace.scheduleResize(); this.app.ribbonWorkspace?.schedule();
    }

    bindOperands() {
      this.app.detachVerticalScrollSync();
      for (const side of ['left', 'right']) {
        const r = this.current(side) || this.empty[side]; const suffix = side === 'left' ? 'Left' : 'Right';
        this.app[`myTreeGrid${suffix}`] = r.grid;
        this.app[`treeViewContainer${suffix}`] = r.container;
        if (side === 'right') this.app.treeViewContentRight = r.content;
      }
      const r = this.active || this.current('left') || this.empty.left;
      this.app.myTreeGrid = r.grid; this.app.treeViewContainer = r.container; this.app.treeViewContent = r.content;
      this.app.selectedNodeId = r.selectedNodeId || null;
    }

    activate(record, { focus = true, force = false } = {}) {
      if (!record || !this.records.has(record.id) || this.disposed) return;
      const changed = this.active !== record;
      const operandChanged = this.app.getComparisonTab(record.side)?.id !== record.tab.id;
      if (changed || operandChanged || force) {
        if (operandChanged && this.app.sideBySideDiffEnabled) this.app.clearSideBySideDiff();
        this.active = record;
        if (record.side === 'right') this.app.activeTabIdRight = record.tab.id; else this.app.activeTabId = record.tab.id;
        this.bindOperands();
        this.lastLeft = this.app.activeTabId; this.lastRight = this.app.activeTabIdRight;
        this.app.updateNavHistoryUI(); this.app.updateNavButtons();
        if (this.app.sideBySideDiffEnabled) this.app.computeAndApplySideBySideDiff();
      }
      if (focus) this.insert(record).Activate();
      this.workspace.scheduleResize(); this.app.ribbonWorkspace?.schedule();
    }

    showSide(side, visible = true) {
      const r = this.current(side);
      // File documents are never destroyed by the old "hide right pane" preference.
      // Show/Compare now exposes them; closing a file is a separate explicit operation.
      if (r) { if (visible) this.workspace.show(r.id, { activate: false }); return; }
      this.workspace.setVisible(`tree-${side}`, visible);
    }

    assignSide(record, side) {
      if (!record || !['left', 'right'].includes(side) || record.side === side) return;
      if (this.app.sideBySideDiffEnabled) this.app.clearSideBySideDiff();
      const from = record.side === 'left' ? 'tabs' : 'tabsRight';
      const to = side === 'left' ? 'tabs' : 'tabsRight';
      this.app[from] = this.app[from].filter(tab => tab.id !== record.tab.id); this.app[to].push(record.tab);
      const oldKey = record.side === 'left' ? 'activeTabId' : 'activeTabIdRight';
      this.app[oldKey] = this.app[from][0]?.id ?? null;
      record.side = side; this.app[side === 'left' ? 'activeTabId' : 'activeTabIdRight'] = record.tab.id;
      this.sync(); this.activate(record); this.app.saveCurrentState();
    }

    remove(record) {
      const wasActive = this.active === record;
      this.syncing = true;
      try {
        this.app.clearSideBySideDiff();
        const array = record.side === 'left' ? 'tabs' : 'tabsRight';
        const key = record.side === 'left' ? 'activeTabId' : 'activeTabIdRight';
        this.app[array] = this.app[array].filter(tab => tab.id !== record.tab.id);
        if (this.app[key] === record.tab.id) this.app[key] = this.app[array][0]?.id ?? null;
        if (this.app.renderingOverlayController?.currentTabId === record.tab.id) this.workspace.hide('rendering');
        this.app.renderingDataController?.releaseDocument(record.tab.id);
        this.app.stateManager.removeTabState(record.tab.id);
        this.release(record);
        this.manager.ClearHistory();
      } finally { this.syncing = false; }
      this.sync();
      if (wasActive && this.active) this.activate(this.active);
      this.app.saveCurrentState(); this.workspace.save();
      // DocumentClosed is raised inside Dockyard's close transaction. Its
      // history entry is committed after the callback returns, so clear at the
      // microtask boundary as well as synchronously. Layout undo is not file undo.
      queueMicrotask(() => { if (!this.disposed) this.manager.ClearHistory(); });
    }

    release(record) {
      if (this.active === record) this.active = null;
      record.abort.abort(); record.grid.dispose();
      this.records.delete(record.id);
      this.workspace.unregister(record.id);
    }

    markModified(record = this.active) {
      if (!record || this.disposed) return;
      record.tab.isModified = true;
      // Rebuild lazily from the edited tree on the next rendering command, never from stale source bytes.
      record.tab.renderingSourceText = null;
      this.app.renderingDataController?.releaseDocument(record.tab.id);
      this.workspace.require(record.id).isModified = true;
      const model = this.manager.Find(record.id); if (model) model.IsModified = true;
      this.app.stateManager.saveTabState(record.tab);
      this.app.ribbonWorkspace?.schedule();
    }

    reconcileLayout() {
      if (this.syncing || this.disposed) return;
      this.syncing = true;
      try {
        for (const model of [...this.manager.Layout.Descendents()]) {
          if (model instanceof global.AvalonDock.LayoutDocument && model.ContentId?.startsWith('dxf:') && !this.records.has(model.ContentId)) model.Parent?.Children?.Remove(model);
        }
        for (const record of this.records.values()) this.insert(record);
      } finally { this.syncing = false; }
    }

    navigateToHandle(handle, addHistory = true) {
      const record = this.active;
      if (!record) return false;
      const tab = record.tab, path = this.app.findPathByHandle(tab.originalTreeData, handle);
      if (!path) { this.workspace.notify(`Handle ${handle} was not found in ${tab.name}.`, true); return false; }
      this.revealNode(record, path[path.length - 1], path);
      if (addHistory) {
        tab.navigationHistory ||= []; tab.currentHistoryIndex ??= -1;
        tab.navigationHistory.splice(tab.currentHistoryIndex + 1);
        tab.navigationHistory.push(handle); tab.currentHistoryIndex = tab.navigationHistory.length - 1;
      }
      this.app.updateNavHistoryUI(); this.app.updateNavButtons(); this.app.ribbonWorkspace?.schedule();
      return true;
    }

    revealNode(record, node, path) {
      if (!this.records.has(record.id)) return;
      const app = this.app;
      if (app.sideBySideDiffEnabled) app.clearSideBySideDiff();
      const expand = path || app.findPathByLine(record.tab.originalTreeData, node.line) || [];
      expand.forEach(n => n.expanded = true);
      record.tab.currentTreeData = record.tab.originalTreeData;
      record.grid.setData(record.tab.currentTreeData);
      this.activate(record);
      // Capture the actual target grid; switching files before the next frame cannot scroll a different file.
      requestAnimationFrame(() => {
        if (this.disposed || !this.records.has(record.id)) return;
        const index = record.grid.flatData.findIndex(item => String(item.node.id) === String(node.id));
        if (index < 0) return;
        record.container.scrollTop = index * record.grid.itemHeight;
        record.grid.selectedRowId = node.id; record.selectedNodeId = node.id;
        if (this.active === record) app.selectedNodeId = node.id;
        record.grid.updateVisibleNodes();
        const row = [...record.content.querySelectorAll('.tree-row')].find(row => row.dataset.id === String(node.id));
        row?.classList.add('dxf-navigation-target');
        this.workspace.notify(`${record.tab.name} · ${node.type || node.code || 'Row'} · line ${node.line ?? '—'}`);
      });
    }

    wrap(name, replacement) {
      const original = this.app[name];
      if (typeof original !== 'function') return;
      this.originalMethods.set(name, original);
      this.app[name] = replacement(original);
    }

    installMutationTracking() {
      const mutations = { addRowAbove: 1, addRowBelow: 1, addChildRow: 1, removeRow: 1,
        addDxfSection: 2, addDxfEntity: 2, addTableEntry: 2, addDxfObject: 2 };
      for (const [method, sideArgument] of Object.entries(mutations)) {
        this.wrap(method, original => (...args) => {
          const record = args[sideArgument] ? this.current(args[sideArgument]) : this.active;
          const result = original.apply(this.app, args);
          if (record && result === true) this.markModified(record);
          return result;
        });
      }
      this.wrap('handleCreateNewDxf', original => (...args) => { const result = original.apply(this.app, args); this.markModified(); return result; });
      this.wrap('handleDownloadDxf', original => (...args) => {
        const record = this.active, result = original.apply(this.app, args);
        // Download is a save-as handoff, not an assertion that the user wrote it to disk.
        if (record) { record.tab.isModified = false; this.workspace.require(record.id).isModified = false; const m = this.manager.Find(record.id); if (m) m.IsModified = false; this.app.stateManager.saveTabState(record.tab); }
        return result;
      });
      this.wrap('showInTree', original => node => this.active ? this.revealNode(this.active, node) : original.call(this.app, node));
    }

    bindReport(id, tab = this.app.getActiveTab()) {
      const definition = this.workspace.definitions.get(id);
      if (!definition) return;
      definition.sourceTabId = tab?.id ?? null;
      definition.node.dataset.sourceTabId = tab ? String(tab.id) : '';
      definition.node.dataset.sourceName = tab?.name || '';
      let caption = definition.node.querySelector(':scope > .dxf-report-source');
      if (!caption) { caption = element('div', 'dxf-report-source'); definition.node.prepend(caption); }
      caption.textContent = tab ? `Source: ${tab.name}` : 'No drawing selected';
    }

    installReportContexts() {
      for (const [method, id] of Object.entries(REPORT_METHODS)) {
        this.wrap(method, original => (...args) => {
          if (method === 'openFiltersOverlay') {
            const side = args[0] || 'left'; const record = this.current(side);
            if (record) this.activate(record, { focus: false });
            this.bindReport(side === 'left' ? 'filtersOverlayLeft' : 'filtersOverlayRight');
          } else this.bindReport(id);
          return original.apply(this.app, args);
        });
      }
      for (const d of this.workspace.definitions.values()) {
        if (!d.floating && !d.id.startsWith('render-')) continue;
        for (const type of ['click','change','input','keydown','focusin']) d.node.addEventListener(type, event => {
          if (!event.target.closest('button,a,input,select,[role="button"]')) return;
          if (event.target.closest('button[id^="close"],button[id^="cancel"],[data-action="close"]')) return;
          // AnalysisView guards all source actions and editing in runAction(),
          // including events across its grid's shadow boundary. Its local chart,
          // search, export and snapshot inspection must still work after close.
          // Keep the legacy-controller guard for controls outside that workbench.
          if (event.composedPath().some(node => node.analysisView && node.analysisView.host === node)) return;
          const record = this.findByTab(d.sourceTabId);
          if (record) this.activate(record, { focus: false });
          else if (d.sourceTabId != null && event.target.closest('button,a')) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.workspace.notify('The source drawing is closed. Refresh the report from an open drawing using Report Tools.', true);
          }
        }, { capture: true, signal: this.abort.signal });
      }
      const renderer = this.app.renderingOverlayController;
      const originalLink = renderer.adapters.handleLinkToHandle;
      renderer.adapters.handleLinkToHandle = handle => {
        const record = this.findByTab(renderer.currentTabId);
        if (record) { this.activate(record, { focus: false }); originalLink?.(handle); }
        else this.workspace.notify('The rendered source drawing is no longer open.', true);
      };
      this.abort.signal.addEventListener('abort', () => { renderer.adapters.handleLinkToHandle = originalLink; }, { once:true });
      this.wrap('openRenderingOverlay', original => (side = this.side()) => {
        const tab = this.app.getComparisonTab(side);
        for (const id of ['render-info', 'render-layers', 'render-blocks', 'render-properties']) this.bindReport(id, tab);
        return original.call(this.app, side);
      });
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true; this.abort.abort(); this.app.contextMenuLifetime?.abort();
      for (const record of this.records.values()) { record.abort.abort(); record.grid.dispose(); }
      for (const [name, method] of this.originalMethods) this.app[name] = method;
      this.records.clear();
    }
  }
  global.DxfDocking.DocumentWorkspace = DocumentWorkspace;
})(window);
