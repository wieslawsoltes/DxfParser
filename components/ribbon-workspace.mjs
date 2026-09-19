/* RibbonWeb application composition. Document controllers remain the command authority. */
import { RibbonModel, traverseControls } from '../vendor/ribbonweb/index.js';

const iconAliases = { open:'page', new:'page', document:'page', folder:'page', code:'formula', object:'shape', shapes:'shape',
  line:'left', text:'left', font:'color', add:'plus', expand:'full', collapse:'indent', history:'clock', columns:'grid',
  compare:'copy', edit:'brush', fit:'full', zoomIn:'search', zoomOut:'search', move:'full', ruler:'shape',
  panel:'grid', layers:'copy', reset:'undo', refresh:'redo', window:'slides', pin:'comment' };
const byId = id => document.getElementById(id);
const option = (value, label = value) => ({ value: String(value), label });
const group = (id, header, items, extra = {}) => ({ id, header, items, ...extra });
const ANALYSIS = [
  ['cloudOverlay', 'Frequencies', 'showCloudOverlayBtn', 'chart', 'Overview'],
  ['statsOverlay', 'Statistics', 'showStatsOverlayBtn', 'chart', 'Overview'],
  ['depsOverlay', 'Dependencies', 'showDepsOverlayBtn', 'link', 'Overview'],
  ['handleMapOverlay', 'Handle Map', 'showHandleMapOverlayBtn', 'search', 'Inspect'],
  ['binaryObjectsOverlay', 'Binary Objects', 'showBinaryObjectsOverlayBtn', 'code', 'Inspect'],
  ['proxyObjectsOverlay', 'Proxy Objects', 'showProxyObjectsOverlayBtn', 'object', 'Inspect'],
  ['objectSizeOverlay', 'Object Sizes', 'showObjectSizeOverlayBtn', 'table', 'Inspect'],
  ['blocksOverlay', 'Blocks & Inserts', 'showBlocksOverlayBtn', 'shapes', 'Drawing Data'],
  ['lineTypesOverlay', 'Line Types', 'showLineTypesOverlayBtn', 'line', 'Drawing Data'],
  ['textsOverlay', 'Texts', 'showTextsOverlayBtn', 'text', 'Drawing Data'],
  ['fontsOverlay', 'Fonts', 'showFontsOverlayBtn', 'font', 'Definitions'],
  ['classesOverlay', 'Classes', 'showClassesOverlayBtn', 'code', 'Definitions'],
  ['diagnosticsOverlay', 'Diagnostics', 'showDiagnosticsOverlayBtn', 'check', 'Quality'],
  ['batchProcessingOverlay', 'Batch Processing', 'showBatchProcessOverlayBtn', 'folder', 'Quality']
];

class RibbonWorkspace {
  constructor(app, workspace, mode) {
    this.app = app; this.workspace = workspace; this.mode = mode; this.state = new Map();
    this.availability = new Map(); this.sources = new Map(); this.contexts = new Map();
    this.abort = new AbortController(); this.commands = []; this.disposed = false;
    this.ribbon = document.createElement('ribbon-web'); this.ribbon.id = `${mode}RibbonWeb`;
    this.ribbon.className = 'dxf-ribbon'; this.ribbon.setAttribute('aria-label', `${workspace.options.title} commands`);
    this.ribbon.setAttribute('storage-key', `dxfparser.ribbon.${mode}.v1`);
    workspace.toolbar.hidden = true;
    app.officePreview.toolbar.hidden = true;
    workspace.ribbonElement = this.ribbon;
    workspace.host.before(this.ribbon);
    if (mode === 'parser') {
      // A retained slot avoids committing a text control on blur and replacing
      // the adjacent Go button between pointerdown and click during a re-render.
      this.navigation = byId('handleNavBar'); this.navigation.slot = 'handle-navigation';
      this.navigation.classList.add('dxf-ribbon-navigation');
      const input = byId('handleSearchInput'), go = byId('goToHandleBtn');
      input.setAttribute('aria-label', 'Go to handle'); input.setAttribute('list', 'dxf-handle-history');
      go.setAttribute('aria-label', 'Go to handle'); go.title = 'Go to handle (Enter)';
      this.handleHistory = document.createElement('datalist'); this.handleHistory.id = 'dxf-handle-history';
      this.navigation.append(this.handleHistory); this.ribbon.append(this.navigation);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); app.handleGoToHandle(); this.schedule(); } }, { signal: this.abort.signal });
      input.addEventListener('input', () => { const tab = app.getActiveTab(); if (tab) tab.navigationEntry = input.value; }, { signal: this.abort.signal });
    }
    const tabs = mode === 'parser' ? this.parserTabs() : this.editorTabs();
    tabs.push(this.layoutTab(), this.reportTab(), this.officeTab());
    this.ribbon.model = new RibbonModel({ id: `dxf-${mode}-ribbon`, title: workspace.options.title,
      tabs, backstage: this.backstage(), selectedTab: 'home', theme: mode === 'editor' ? 'dark' : 'light',
      quickAccessToolbar: [] });
    this.ribbon.setQuickAccess(mode === 'parser' ? ['file-open', 'file-save', 'nav-back', 'nav-forward'] : ['editor-open-drawing', 'editor-save-drawing', 'editor-undo', 'editor-redo']);
    // Stable IDs restore ribbon preferences independently from drawing data and docking snapshots.
    this.ribbon.loadCustomization();
    this.ribbon.addEventListener('ribbon-command', () => this.schedule(), { signal: this.abort.signal });
    this.ribbon.addEventListener('ribbon-error', event => workspace.notify(`Command failed: ${event.detail.error?.message || event.detail.id}`, true), { signal: this.abort.signal });
    this.ribbon.addEventListener('ribbon-layout-change', () => workspace.scheduleResize(), { signal: this.abort.signal });
    this.observer = new MutationObserver(() => this.schedule());
    const sources = mode === 'parser' ? Object.values(workspace.legacyCommandSources) : [byId('editorRibbon')];
    for (const source of sources) if (source) this.observer.observe(source, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'aria-pressed', 'aria-hidden', 'class'] });
    this.observer.observe(app.officePreview.node, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    workspace.unsubscribers.push(
      workspace.manager.LayoutUpdated.add(() => this.schedule()),
      workspace.manager.ActiveContentChanged.add(() => this.schedule()),
      workspace.manager.ThemeChanged.add(() => this.schedule()),
      workspace.manager.HistoryChanged.add(() => this.schedule())
    );
    document.addEventListener('keydown', event => {
      if (mode !== 'parser' || !event.ctrlKey && !event.metaKey || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === 'g') { event.preventDefault(); this.ribbon.selectTab('home'); requestAnimationFrame(() => byId('handleSearchInput')?.focus()); }
    }, { signal: this.abort.signal });
    const dispose = workspace.dispose.bind(workspace);
    workspace.dispose = () => { this.dispose(); dispose(); };
    this.refresh();
  }

  command(id, label, action, extra = {}) {
    const { enabled, ...config } = extra;
    config.icon = iconAliases[config.icon || 'document'] || config.icon;
    if (typeof enabled === 'function') this.availability.set(id, enabled);
    return { id, type: 'button', label, icon: 'document', ...config,
      enabled: typeof enabled === 'function' ? !!enabled() : enabled ?? true,
      command: (value, control) => {
        const result = action(value, control);
        this.schedule();
        return result?.then ? result.finally(() => this.schedule()) : result;
      } };
  }
  source(id, label, nodeOrId, extra = {}) {
    const node = typeof nodeOrId === 'string' ? byId(nodeOrId) : nodeOrId;
    if (!node) throw new Error(`Missing ribbon command source: ${id}`);
    const control = this.command(id, label, () => node.click(), { icon: 'document', ...extra,
      enabled: () => !node.disabled && (!extra.enabled || extra.enabled()) });
    this.sources.set(id, node); return control;
  }
  hasDrawing() { return this.mode === 'parser' ? !!this.app.getActiveTab() : !!this.app.getActiveDocument(); }
  currentReport() {
    const model = this.workspace.manager.ActiveModel;
    const definition = this.workspace.definitions.get(model?.ContentId);
    return definition && !definition.fileSide && definition.kind !== 'document' && definition.id !== 'document-preview' ? definition : null;
  }
  update(id, values) {
    const control = this.ribbon.getControl(id);
    if (!control) return;
    for (const [key, value] of Object.entries(values)) {
      const stamp = typeof value === 'object' ? JSON.stringify(value) : value;
      const stateKey = `${id}.${key}`;
      if (this.state.get(stateKey) === stamp) continue;
      this.state.set(stateKey, stamp); control[key] = value;
    }
  }
  context(id, value) {
    value = !!value;
    if (this.contexts.get(id) === value) return;
    this.contexts.set(id, value); this.ribbon.setContext(id, value);
  }
  schedule() {
    if (this.queued || this.disposed) return;
    this.queued = true;
    queueMicrotask(() => { this.queued = false; if (!this.disposed) this.refresh(); });
  }

  parserTabs() {
    const app = this.app, w = this.workspace, docs = app.documentWorkspace;
    const has = () => this.hasDrawing();
    const source = (...args) => this.source(...args);
    const cmd = (...args) => this.command(...args);
    const launch = (id, label, icon = 'document') => cmd(`analysis-${id}`, label, () => {
      docs.bindReport(id); w.requestOpen(id);
    }, { icon, size: 'large', enabled: () => id === 'batchProcessingOverlay' || has() });
    const analysisGroups = [...new Set(ANALYSIS.map(a => a[4]))].map(category => group(`analysis-${category.replaceAll(' ', '-').toLowerCase()}`, category,
      ANALYSIS.filter(a => a[4] === category).map(([id, label, , icon]) => launch(id, label, icon)),
      category === 'Quality' ? { launcher: () => w.requestOpen('ruleConfigOverlay') } : {}));
    const home = { id: 'home', header: 'Home', keyTip: 'H', groups: [
      group('files', 'Drawing', [
        cmd('file-open', 'Open DXF', () => byId('openLeftBtn').click(), { icon: 'open', size: 'large', keyTip: 'O', shortcut: 'Ctrl+O', type: 'split', items: [
          cmd('file-open-right', 'Open comparison drawing…', () => byId('openRightBtn').click(), { icon: 'open' }),
          cmd('file-new', 'New drawing', () => app.handleCreateNewDxf(), { icon: 'new', shortcut: 'Ctrl+N' })
        ] }),
        cmd('file-save', 'Download DXF', () => app.handleDownloadDxf(), { icon: 'save', size: 'large', keyTip: 'S', shortcut: 'Ctrl+S', enabled: has }),
        cmd('file-documents', 'Documents…', () => w.show('document-preview'), { icon: 'table', size: 'large', keyTip: 'D' })
      ], { priority: 100 }),
      group('tree-edit', 'Tree Editing', [
        cmd('row-add', 'Add row', () => app.handleAddRow(), { icon: 'add', enabled: () => has() && !!app.selectedNodeId }),
        cmd('row-remove', 'Remove row', () => app.handleRemoveRow(), { icon: 'delete', enabled: () => has() && !!app.selectedNodeId }),
        source('tree-excel', 'Export tree to Excel', 'downloadTreeExcelBtn', { icon: 'table', enabled: has })
      ]),
      group('navigate', 'Navigate', [
        cmd('nav-handle', 'Go to handle', () => { this.ribbon.selectTab('home'); requestAnimationFrame(() => byId('handleSearchInput').focus()); }, { type: 'custom', slot: 'handle-navigation', enabled: has }),
        cmd('nav-history', 'History', () => {}, { type: 'menu', icon: 'history', getItems: () => (app.getActiveTab()?.navigationHistory || []).map((handle, index) => cmd(`history-${index}`, handle, () => app.navigateToHandle(handle))) }),
        cmd('nav-back', 'Back', () => app.navigateBack(), { icon: 'undo', enabled: () => !byId('backBtn').disabled }),
        cmd('nav-forward', 'Forward', () => app.navigateForward(), { icon: 'redo', enabled: () => !byId('forwardBtn').disabled }),
        cmd('nav-clear', 'Clear history', () => app.clearNavigationHistory(), { icon: 'delete', enabled: has })
      ], { priority: 90 }),
      group('tree-view', 'Tree View', [
        cmd('tree-expand', 'Expand all', () => app.handleExpandAll(), { icon: 'expand', enabled: has }),
        cmd('tree-collapse', 'Collapse all', () => app.handleCollapseAll(), { icon: 'collapse', enabled: has }),
        cmd('tree-filters', 'Filters', () => app.openFiltersOverlay(docs.side()), { icon: 'filter', enabled: has, keyTip: 'F' })
      ], { launcher: () => app.openFiltersOverlay(docs.side()), priority: 80 }),
      group('render', 'Drawing View', [
        cmd('render-open', 'Render DXF', () => { app.openRenderingOverlay(docs.side()); this.context('drawing', true); this.ribbon.selectTab('drawing'); }, { size: 'large', icon: 'shapes', enabled: has, keyTip: 'R' })
      ])
    ] };
    const compare = { id: 'compare', header: 'Compare', contextualGroup: 'comparison', keyTip: 'C', groups: [
      group('compare-operands', 'Comparison Documents', [
        cmd('compare-left', 'Left', value => { const record = docs.findByTab(value); if (record) { docs.assignSide(record, 'left'); docs.activate(record); } }, { type: 'dropdown', items: [], width: 210 }),
        cmd('compare-right', 'Right', value => { const record = docs.findByTab(value); if (record) { docs.assignSide(record, 'right'); docs.activate(record); } }, { type: 'dropdown', items: [], width: 210 }),
        cmd('compare-arrange', 'Arrange side by side', () => w.applyPreset('Compare'), { icon: 'columns' })
      ], { priority: 100 }),
      group('diff', 'Tree Difference', [
        cmd('compare-diff', 'Tree Diff', () => app.toggleSideBySideDiff(), { type: 'toggle', size: 'large', icon: 'compare', enabled: () => !!app.getComparisonTab('left') && !!app.getComparisonTab('right') }),
        cmd('diff-added', 'Next addition', () => app.navigateDiff('added'), { icon: 'add', enabled: () => !!app.sideBySideDiffEnabled }),
        cmd('diff-removed', 'Next removal', () => app.navigateDiff('removed'), { icon: 'delete', enabled: () => !!app.sideBySideDiffEnabled }),
        cmd('diff-changed', 'Next change', () => app.navigateDiff('changed'), { icon: 'edit', enabled: () => !!app.sideBySideDiffEnabled })
      ]),
      group('compare-filters', 'Operand Filters', [
        cmd('compare-filter-left', 'Left filters', () => app.openFiltersOverlay('left'), { icon: 'filter', enabled: () => !!app.getComparisonTab('left') }),
        cmd('compare-filter-right', 'Right filters', () => app.openFiltersOverlay('right'), { icon: 'filter', enabled: () => !!app.getComparisonTab('right') })
      ])
    ] };
    const rendering = w.legacyCommandSources.viewControls;
    const view = value => rendering.querySelector(`[data-view="${value}"]`);
    const nav = value => rendering.querySelector(`[data-action="${value}"]`);
    const measurement = mode => rendering.querySelector(`[data-mode="${mode}"]`);
    const drawing = { id: 'drawing', header: 'Drawing', contextualGroup: 'drawing', keyTip: 'V', groups: [
      group('drawing-views', 'Orientation', ['home', 'top', 'right', 'bottom', 'left', 'iso'].map(value => source(`view-${value}`, { home: 'Fit drawing', iso: 'Isometric' }[value] || value[0].toUpperCase() + value.slice(1), view(value), { icon: value === 'home' ? 'fit' : 'shapes' }))),
      group('drawing-navigation', 'View Navigation', [
        source('view-undo', 'Previous view', 'viewUndoBtn', { icon: 'undo' }), source('view-redo', 'Next view', 'viewRedoBtn', { icon: 'redo' }),
        source('view-zoom-in', 'Zoom in', nav('zoom-in'), { icon: 'zoomIn' }), source('view-zoom-out', 'Zoom out', nav('zoom-out'), { icon: 'zoomOut' }),
        ...['pan-up', 'pan-down', 'pan-left', 'pan-right', 'orbit-left', 'orbit-right'].map(value => source(`view-${value}`, value.replace('-', ' '), nav(value), { icon: 'move' }))
      ]),
      group('drawing-style', 'Display', [
        cmd('drawing-style', 'Visual style', value => { const select = byId('renderingVisualStyleSelect'); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }, { type: 'dropdown', width: 170, items: [] }),
        ...[['toggleAttributeDefinitions', 'Attribute definitions'], ['toggleAttributeReferences', 'Attribute references'], ['toggleAttributeInvisible', 'Hidden attributes']].map(([id, label]) => cmd(`draw-${id}`, label, (_value, c) => { const input = byId(id); input.checked = c.checked; input.dispatchEvent(new Event('change', { bubbles: true })); }, { type: 'checkbox', icon: 'check' }))
      ]),
      group('drawing-measure', 'Measure', ['none', 'distance', 'area', 'angle'].map(mode => source(`measure-${mode}`, mode === 'none' ? 'Select' : mode[0].toUpperCase() + mode.slice(1), measurement(mode), { type: 'toggle', icon: 'ruler' }))),
      group('drawing-tools', 'Drawing Panels', [['render-layers', 'Layers'], ['render-blocks', 'Blocks'], ['render-info', 'Information'], ['render-properties', 'Properties']].map(([id, title]) => cmd(`show-${id}`, title, () => w.show(id), { icon: 'panel' })))
    ] };
    const selection = { id: 'selection', header: 'Selection', contextualGroup: 'selection', keyTip: 'S', groups: [
      group('selection-layers', 'Selected Layers', ['isolate-layers', 'lock-layers', 'unlock-layers', 'clear-layer-isolation'].map(value => source(`selection-${value}`, nav(value).textContent.trim(), nav(value), { icon: 'layers', size: 'large' }))),
      group('selection-objects', 'Selected Objects', ['isolate-objects', 'clear-object-isolation'].map(value => source(`selection-${value}`, nav(value).textContent.trim(), nav(value), { icon: 'shapes', size: 'large' })))
    ] };
    return [home, { id: 'analyze', header: 'Analyze', keyTip: 'A', groups: analysisGroups }, compare, drawing, selection];
  }

  editorTabs() {
    const result = [], seen = new Set();
    const root = byId('editorRibbon');
    const panels = [...root.querySelectorAll('.ribbon-panel')];
    for (const [index, panel] of panels.entries()) {
      const tabButton = root.querySelector(`[aria-controls="${panel.id}"]`);
      const id = index === 0 ? 'home' : `editor-${panel.id}`;
      const context = tabButton?.closest('.ribbon-contextual-tabset');
      const groups = [...panel.querySelectorAll('.ribbon-group')].map((g, gi) => {
        const items = [...g.querySelectorAll('button[data-command]:not(.ribbon-group-launcher)')].map((node, ni) => {
          const command = node.dataset.command;
          const cid = seen.has(command) ? `editor-${command}-${index}-${gi}-${ni}` : `editor-${command}`; seen.add(command);
          return this.source(cid, node.textContent.trim().replace(/\s+/g, ' '), node, { icon: 'shapes', size: node.classList.contains('ribbon-command--large') ? 'large' : 'small', tooltip: node.title || undefined });
        });
        const launcher = g.querySelector('.ribbon-group-launcher');
        return group(`editor-group-${index}-${gi}`, g.querySelector('.ribbon-group-caption')?.textContent.trim() || 'Commands', items,
          launcher ? { launcher: () => launcher.click() } : {});
      });
      result.push({ id, header: tabButton?.textContent.trim() || panel.id, groups,
        ...(context ? { contextualGroup: `editor-context-${context.id || index}` } : {}) });
      if (context) this.sources.set(`context:${id}`, context);
    }
    const files = [...root.querySelectorAll('.quick-access-toolbar [data-command],.quick-access [data-command]')];
    // Source class names differ between editor releases; stable data-command selectors are the fallback.
    const required = ['new-drawing', 'open-drawing', 'save-drawing', 'undo', 'redo'];
    const controls = required.filter(command => !seen.has(command)).map(command => {
      const node = root.querySelector(`[data-command="${command}"]`);
      return this.source(`editor-${command}`, { 'new-drawing': 'New drawing', 'open-drawing': 'Open DXF', 'save-drawing': 'Save drawing', undo: 'Undo', redo: 'Redo' }[command], node, { icon: { 'open-drawing': 'open', 'save-drawing': 'save', undo: 'undo', redo: 'redo' }[command] || 'new', size: 'large' });
    });
    result[0].groups.unshift(group('editor-files', 'Drawing', controls, { priority: 100 }));
    result[0].groups.push(group('editor-command-search', 'Commands', [this.command('editor-palette', 'Command palette', () => this.app.openCommandPalette(), { icon: 'search' })]));
    return result;
  }

  layoutTab() {
    const w = this.workspace, cmd = (...a) => this.command(...a);
    return { id: 'workspace', header: 'View & Layout', keyTip: 'W', groups: [
      group('workspace-panels', 'Workspace', [
        cmd('workspace-preset', 'Preset', value => w.applyPreset(value), { type: 'dropdown', items: w.options.presets.map(v => option(v)), value: w.preset }),
        cmd('workspace-panels', 'Panels', () => {}, { type: 'menu', icon: 'panel', keyTip: 'P', getItems: () => [...w.definitions.values()].filter(d => !d.fileSide).map(d => cmd(`panel-${d.id}`, `${w.isOpen(d.id) ? '✓ ' : ''}${d.title}`, () => w.isOpen(d.id) && d.closable ? w.hide(d.id) : w.requestOpen(d.id), { icon: 'panel' })) }),
        cmd('workspace-documents', 'Open drawings', () => {}, { type: 'menu', icon: 'document', getItems: () => [...this.app.documentWorkspace?.records.values() || []].map(r => cmd(`open-${r.id}`, r.tab.name, () => this.app.documentWorkspace.activate(r))) })
      ], { priority: 100 }),
      group('workspace-history', 'Layout', [
        cmd('layout-undo', 'Undo layout', () => w.manager.Undo(), { icon: 'undo', enabled: () => w.manager.CanUndo }),
        cmd('layout-redo', 'Redo layout', () => w.manager.Redo(), { icon: 'redo', enabled: () => w.manager.CanRedo }),
        cmd('layout-reset', 'Reset layout', () => { w.status.dataset.error = ''; w.applyPreset(w.options.defaultPreset); w.save(); }, { icon: 'reset' })
      ]),
      group('workspace-files', 'Layout Files', [
        cmd('layout-export', 'Export layout', () => this.download(w.exportLayout(), `dxf-${w.id}-workspace.json`), { icon: 'save' }),
        cmd('layout-import', 'Import layout', () => w.fileInput.click(), { icon: 'open' })
      ]),
      group('workspace-appearance', 'Appearance', [
        cmd('workspace-theme', 'Theme', value => { w.manager.Theme = value; w.changed(); }, { type: 'dropdown', items: ['light', 'dark', 'contrast'].map(v => option(v)), value: 'light' }),
        cmd('ribbon-layout', 'Ribbon', value => { this.ribbon.layout = value; this.ribbon.saveCustomization(); }, { type: 'dropdown', value: 'classic', items: [option('classic', 'Classic'), option('simplified', 'Simplified')] }),
        cmd('ribbon-customize', 'Customize ribbon', () => this.ribbon.openCustomization(), { icon: 'settings' })
      ])
    ] };
  }

  reportTab() {
    const w = this.workspace, cmd = (...a) => this.command(...a);
    const model = () => w.manager.ActiveModel;
    return { id: 'report', header: 'Report Tools', contextualGroup: 'report', keyTip: 'T', groups: [
      group('report-source', 'Data Source', [
        { id: 'report-source-name', type: 'label', label: '' },
        cmd('report-show-source', 'Show source drawing', () => { const d = this.currentReport(), r = this.app.documentWorkspace?.findByTab(d?.sourceTabId); if (r) this.app.documentWorkspace.activate(r); }, { icon: 'document', enabled: () => !!this.app.documentWorkspace?.findByTab(this.currentReport()?.sourceTabId) }),
        cmd('report-refresh', 'Refresh from active drawing', () => { const d = this.currentReport(); if (d?.openAction) { this.app.documentWorkspace?.bindReport(d.id); w.requestOpen(d.id); } }, { icon: 'refresh', enabled: () => !!this.currentReport()?.openAction && this.hasDrawing() })
      ], { priority: 100 }),
      group('report-presentation', 'Panel', [
        cmd('report-float', 'Float as dialog', () => model()?.Float(), { icon: 'window', enabled: () => !!model()?.CanFloat && !model()?.IsFloating }),
        cmd('report-dock', 'Dock back', () => model()?.Dock(), { icon: 'panel', enabled: () => !!model()?.IsFloating }),
        cmd('report-pin', 'Auto-hide / pin', () => model()?.ToggleAutoHide(), { icon: 'pin', enabled: () => !!model()?.CanAutoHide && !model()?.IsFloating }),
        cmd('report-close', 'Close panel', () => { const d = this.currentReport(); if (d) w.hide(d.id); }, { icon: 'close' })
      ])
    ] };
  }

  officeTab() {
    const office = this.app.officePreview, cmd = (...a) => this.command(...a);
    return { id: 'office', header: 'Document Preview', contextualGroup: 'office', keyTip: 'D', groups: [
      group('office-files', 'Document', [
        { id: 'office-name', type: 'label', label: 'No document loaded' },
        cmd('office-open', 'Open document', () => office.fileInput.click(), { icon: 'open', size: 'large' }),
        cmd('office-download', 'Download original', () => office.downloadOriginal(), { icon: 'save', size: 'large', enabled: () => !!office.original }),
        cmd('office-zoom', 'Zoom', value => { office.zoom.value = value; office.zoom.dispatchEvent(new Event('change')); }, { type: 'dropdown', items: [50, 75, 100, 125, 150, 200].map(n => option(n / 100, `${n}%`)), value: '1' })
      ]),
      group('office-sheet', 'Workbook', [
        cmd('office-sheet', 'Worksheet', value => { const button = [...office.tabs.querySelectorAll('button')][Number(value)]; button?.click(); }, { type: 'dropdown', width: 180, items: [], enabled: () => !!office.book })
      ])
    ] };
  }

  backstage() {
    const cmd = (...a) => this.command(...a), w = this.workspace;
    const close = action => () => { this.ribbon.closeBackstage(); return action(); };
    const open = this.mode === 'parser' ? () => byId('openLeftBtn').click() : () => this.app.openFilePicker();
    const save = this.mode === 'parser' ? () => this.app.handleDownloadDxf() : () => byId('editorRibbon').querySelector('[data-command="save-drawing"]').click();
    return [
      cmd('backstage-open', 'Open drawing…', close(open), { icon: 'open' }),
      cmd('backstage-save', 'Save / download drawing', close(save), { icon: 'save', enabled: () => this.hasDrawing() }),
      cmd('backstage-documents', 'Excel / Word preview…', close(() => w.show('document-preview')), { icon: 'table' }),
      ...(this.mode === 'parser' ? [
        cmd('backstage-new', 'New drawing', close(() => this.app.handleCreateNewDxf()), { icon: 'new' }),
        { id: 'backstage-session', label: 'Session & Parsing', description: 'Drawing data and layout files are stored separately. Loading a session replaces drawing records, not your ribbon preferences.', items: [
          cmd('session-save', 'Save session to file', () => this.app.handleSaveStateToFile(), { icon: 'save' }),
          cmd('session-load', 'Load session from file', () => this.app.triggerLoadStateFromFile(), { icon: 'open' }),
          cmd('session-reset', 'Reset application state', () => this.app.handleResetState(), { icon: 'reset' }),
          cmd('parser-stream', 'Use streamed parsing', (_value, c) => { byId('useStreamCheckbox').checked = c.checked; }, { type: 'checkbox' })
        ] }
      ] : []),
      { id: 'backstage-workspace', label: 'Workspace', description: 'Export docking geometry, switch layouts, or recover a hidden panel from View & Layout. Open drawing records are retained across layout changes.', items: [
        cmd('backstage-layout-save', 'Export layout', () => this.download(w.exportLayout(), `dxf-${w.id}-workspace.json`), { icon: 'save' }),
        cmd('backstage-layout-open', 'Import layout', () => w.fileInput.click(), { icon: 'open' })
      ] }
    ];
  }

  refresh() {
    const w = this.workspace, app = this.app, activeModel = w.manager.ActiveModel;
    const theme = String(w.manager.Theme?.Name || w.manager.Theme || 'light').toLowerCase();
    if (this.ribbon.theme !== (theme === 'dark' ? 'dark' : 'light')) this.ribbon.theme = theme === 'dark' ? 'dark' : 'light';
    this.ribbon.dataset.contrast = String(theme === 'contrast');
    this.update('workspace-theme', { value: theme }); this.update('workspace-preset', { value: w.preset });
    this.update('ribbon-layout', { value: this.ribbon.layout });
    for (const [id, enabled] of this.availability) this.update(id, { enabled: !!enabled() });
    for (const [id, node] of this.sources) {
      if (id.startsWith('context:')) continue;
      const values = {};
      if (node.hasAttribute('aria-pressed')) values.checked = node.getAttribute('aria-pressed') === 'true';
      this.update(id, values);
    }
    const report = this.currentReport(); this.context('report', !!report);
    this.context('office', activeModel?.ContentId === 'document-preview');
    this.update('report-source-name', { label: report?.node.dataset.sourceName ? `Source: ${report.node.dataset.sourceName}` : report?.title || '' });
    const office = app.officePreview;
    this.update('office-name', { label: office.name.textContent || 'No document loaded' });
    this.update('office-zoom', { value: office.zoom.value });
    this.update('office-sheet', { items: [...office.tabs.querySelectorAll('button')].map((b, i) => option(i, b.textContent)), value: String([...office.tabs.querySelectorAll('button')].findIndex(b => b.getAttribute('aria-selected') === 'true')) });
    if (this.mode === 'parser') {
      const doc = app.getActiveTab(), records = [...app.documentWorkspace.records.values()];
      const title = doc ? `${doc.isModified ? '● ' : ''}${doc.name} — DXF Parser` : 'DXF Parser';
      if (this.ribbon.model.title !== title) this.ribbon.model.title = title;
      this.context('comparison', records.length > 1);
      const drawing = activeModel?.ContentId === 'rendering' || activeModel?.ContentId?.startsWith('render-');
      this.context('drawing', drawing);
      this.context('selection', drawing && app.renderingOverlayController.selectionHandles?.size > 0);
      for (const side of ['left', 'right']) this.update(`compare-${side}`, { items: records.map(r => option(r.tab.id, `${r.side === 'left' ? 'L' : 'R'} · ${r.tab.name}`)), value: String(app.getComparisonTab(side)?.id ?? '') });
      this.update('compare-diff', { checked: !!app.sideBySideDiffEnabled });
      this.update('parser-stream', { checked: byId('useStreamCheckbox').checked });
      byId('handleSearchInput').disabled = !doc; byId('goToHandleBtn').disabled = !doc;
      if (this.navigationDocument !== doc?.id) { this.navigationDocument = doc?.id; byId('handleSearchInput').value = doc?.navigationEntry || ''; }
      const handles = JSON.stringify(doc?.navigationHistory || []);
      if (this.navigationHistory !== handles) {
        this.navigationHistory = handles;
        this.handleHistory.replaceChildren(...(doc?.navigationHistory || []).map(h => { const item = document.createElement('option'); item.value = h; return item; }));
      }
      const style = byId('renderingVisualStyleSelect');
      this.update('drawing-style', { value: style.value, items: [...style.options].map(o => option(o.value, o.textContent)) });
      for (const id of ['toggleAttributeDefinitions', 'toggleAttributeReferences', 'toggleAttributeInvisible']) this.update(`draw-${id}`, { checked: byId(id).checked });
    } else {
      const record = app.getActiveDocument();
      const title = record ? `${record.name} — DXF Editor` : 'DXF Editor'; if (this.ribbon.model.title !== title) this.ribbon.model.title = title;
      for (const tab of this.ribbon.model.tabs) if (tab.contextualGroup?.startsWith('editor-context-')) {
        const node = this.sources.get(`context:${tab.id}`); this.context(tab.contextualGroup, node && !node.classList.contains('is-hidden'));
      }
    }
    w.scheduleResize();
  }

  download(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort(); this.observer.disconnect();
    if (this.navigation) this.workspace.parking.append(this.navigation);
    this.ribbon.remove();
    const model = this.ribbon.model;
    for (const control of traverseControls(model)) control.Dispose?.();
    for (const tab of model.tabs) { for (const g of tab.groups) g.Dispose?.(); tab.Dispose?.(); } model.Dispose?.();
  }
}

globalThis.DxfRibbon = {
  ANALYSIS,
  mountParser: (app, workspace) => new RibbonWorkspace(app, workspace, 'parser'),
  mountEditor: (app, workspace) => new RibbonWorkspace(app, workspace, 'editor')
};
