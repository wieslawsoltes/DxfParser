export const FORMAT = 'dxfparser-dockyard-workspace';
export const VERSION = 1;
export const MAX_LAYOUT_BYTES = 1024 * 1024;

/** Bind a workspace implementation to a browser realm and a host-owned Dockyard API. */
export function createDockingWorkspace({ window: win, dockyard, storage, storagePrefix = 'dxf.workspace' } = {}) {
  if (!win?.document?.createElement || !win.HTMLElement || !win.AbortController || !win.ResizeObserver)
    throw new TypeError('A browser window with DOM observers is required.');
  if (!dockyard?.DockingManager || !dockyard.JsonLayoutSerializer || !dockyard.LayoutDocument)
    throw new TypeError('A compatible Dockyard API is required.');
  if (storage != null && (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function'))
    throw new TypeError('Storage must implement getItem/setItem or be null.');
  const global = win, document = win.document;
  const { HTMLElement, AbortController, MutationObserver, ResizeObserver, Option, TextEncoder, Blob, URL } = win;
  const requestAnimationFrame = win.requestAnimationFrame.bind(win), cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  const setTimeout = win.setTimeout.bind(win), clearTimeout = win.clearTimeout.bind(win), queueMicrotask = win.queueMicrotask.bind(win);
  // Do not access localStorage during import or factory construction (sandboxed realms can throw).
  const getStorage = () => storage === undefined ? win.localStorage : storage;
  const assertNode = (node, label) => {
    if (!(node instanceof HTMLElement) || node.ownerDocument !== document) throw new TypeError(`${label} must belong to the supplied window.`);
  };
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** One manager, one registry of stable ContentIds, no serialized drawing data. */
  class Workspace {
    constructor(options) {
      assertNode(options?.shell, 'Workspace shell');
      if (typeof options.id !== 'string' || !options.id || typeof options.layout !== 'function' ||
          !Array.isArray(options.panels) || !Array.isArray(options.presets) || !options.presets.includes(options.defaultPreset))
        throw new TypeError('Workspace id, panels, presets, defaultPreset and layout factory are required.');
      if (options.shouldRestorePanel != null && typeof options.shouldRestorePanel !== 'function')
        throw new TypeError('shouldRestorePanel must be a function.');
      const ids = new Set(), nodes = new Set();
      for (const panel of options.panels) {
        assertNode(panel.node, 'Panel content');
        if (panel.titleNode) assertNode(panel.titleNode, 'Panel title');
        if (panel.resizeNode) assertNode(panel.resizeNode, 'Panel resize target');
        if (!panel.id || ids.has(panel.id)) throw new Error(`Duplicate dock panel: ${panel.id}`);
        if (nodes.has(panel.node)) throw new Error('Each panel must own distinct content.');
        ids.add(panel.id); nodes.add(panel.node);
      }
      this.api = dockyard;
      this.options = options;
      this.id = options.id;
      this.storageKey = `${storagePrefix}.${this.id}.v${VERSION}`;
      this.definitions = new Map();
      this.abort = new AbortController();
      this.unsubscribers = [];
      this.disposers = new Set();
      this.importGeneration = 0;
      this.disposed = false;
      this.ready = false;
      this.suppress = 0;
      this.resizeFrame = 0;
      this.saveTimer = 0;
      this.preset = options.defaultPreset;
      this.parking = element('div', 'dxf-dock-storage');
      this.parking.hidden = true;
      options.shell.append(this.parking);
      for (const definition of options.panels) this.register(definition);
      this.host = element('div', 'dxf-dock-host');
      this.host.id = `${this.id}DockWorkspace`;
      options.shell.append(this.host);
      this.manager = new this.api.DockingManager(this.host, {
        Theme: options.theme || 'light',
        Layout: this.buildLayout(this.preset),
        AllowMixedOrientation: true,
        EnableHistory: true,
        AutoSave: false,
        RestoreOnLoad: false,
        GridSplitterWidth: 5,
        GridSplitterHeight: 5,
        FloatingWindowMinWidth: 160,
        FloatingWindowMinHeight: 110
      });
      this.host.setAttribute('aria-label', `${options.title} docking workspace`);
      this.toolbar = this.createToolbar();
      this.host.before(this.toolbar);
      this.status = element('div', 'dxf-dock-status');
      this.status.setAttribute('role', 'status');
      this.status.setAttribute('aria-live', 'polite');
      this.host.after(this.status);
      this.unsubscribers.push(
        this.manager.LayoutUpdated.add(() => this.changed()),
        this.manager.LayoutChanged.add(() => this.changed()),
        this.manager.ActiveContentChanged.add(() => this.scheduleResize()),
        this.manager.Error.add((_sender, args) => this.notify(args.Error?.message || 'Docking operation failed.', true))
      );
      this.observer = new MutationObserver(records => this.observePresentation(records));
      this.observeDefinitions();
      this.resizeObserver = new ResizeObserver(() => this.scheduleResize());
      this.resizeObserver.observe(this.host);
      for (const definition of this.definitions.values()) {
        if (definition.onResize) this.resizeObserver.observe(definition.resizeNode || definition.node);
      }
      if (!options.deferRestore) { this.restore(); this.ready = true; }
      this.syncPresentation(false);
      this.scheduleResize();
      global.addEventListener('pagehide', () => this.save(), { signal: this.abort.signal });
      document.addEventListener('visibilitychange', () => {
        this.scheduleResize();
        if (document.visibilityState === 'hidden') this.save();
      }, { signal: this.abort.signal });
      options.shell.classList.add('dxf-dock-shell');
    }

    register(definition) {
      if (!definition.id || this.definitions.has(definition.id)) throw new Error(`Duplicate dock panel: ${definition.id}`);
      if (this.disposed) throw new Error('Workspace is disposed.');
      assertNode(definition.node, 'Panel content');
      if ([...this.definitions.values()].some(d => d.node === definition.node)) throw new Error('Each panel must own distinct content.');
      if (definition.titleNode) assertNode(definition.titleNode, 'Panel title');
      if (definition.resizeNode) assertNode(definition.resizeNode, 'Panel resize target');
      const record = {
        kind: 'tool', side: 'Right', closable: true, bridge: null,
        ...definition, bridgeVisible: false, wasOpen: false, everOpened: false, size: ''
      };
      record.node.classList.add('dxf-dock-surface');
      record.node.dataset.dockPanel = record.id;
      // Unseen panels must remain discoverable by the application's existing getElementById calls.
      this.parking.append(record.node);
      this.definitions.set(record.id, record);
      if (this.resizeObserver && record.onResize) this.resizeObserver.observe(record.resizeNode || record.node);
      this.observeDefinitions();
      return record;
    }

    observeDefinitions() {
      if (!this.observer) return;
      // MutationObserver has no unobserve; reconnect to release removed source nodes.
      this.observer.disconnect();
      for (const d of this.definitions.values()) {
        if (d.bridge) this.observer.observe(d.node, { attributes: true, attributeFilter: d.bridge === 'hidden' ? ['hidden'] : ['style'] });
        if (d.titleNode) this.observer.observe(d.titleNode, { childList: true, characterData: true, subtree: true });
      }
    }

    /** Register owned cleanup without replacing dispose(). Returns a detach function. */
    onDispose(callback) {
      if (typeof callback !== 'function') throw new TypeError('A disposal callback is required.');
      if (this.disposed) { callback(); return () => {}; }
      this.disposers.add(callback);
      return () => { this.disposers.delete(callback); };
    }

    unregister(id) {
      const d = this.definitions.get(id);
      if (!d) return;
      this.resizeObserver?.unobserve(d.resizeNode || d.node);
      const model = this.manager.Find(id);
      if (model?.Parent?.Children) model.Parent.Children.Remove(model);
      if (model?.IsHidden) this.manager.Layout.Hidden.Remove(model);
      this.definitions.delete(id);
      this.observeDefinitions();
      this.manager.Layout.CollectGarbage();
      this.manager.ReleaseContent(id);
      d.node.remove();
      this.changed();
    }

    /** Navigation dismisses a floating dialog, never an ordinary docked tool. */
    dismissAfterNavigation(id) {
      const model = this.manager.Find(id);
      if (model?.IsFloating) return this.hide(id);
      return false;
    }

    make(id) {
      const d = this.require(id);
      const Type = d.kind === 'document' ? this.api.LayoutDocument : this.api.LayoutAnchorable;
      return new Type({
        ContentId: id, Title: d.title, Content: d.node, IsModified: !!d.isModified,
        CanClose: d.kind === 'document' && d.closable,
        CanHide: d.closable,
        CanFloat: true, CanMove: true, CanDock: true,
        CanAutoHide: d.kind !== 'document', CanDockAsTabbedDocument: true,
        AutoHideWidth: d.width || 360, AutoHideHeight: d.height || 360,
        FloatingWidth: d.width || 760, FloatingHeight: d.height || 520
      });
    }

    require(id) {
      const definition = this.definitions.get(id);
      if (!definition) throw new Error(`Unknown dock panel: ${id}`);
      return definition;
    }

    buildLayout(preset) {
      const root = this.options.layout(this, preset);
      const ids = new Set(root.Descendents().map(node => node.ContentId).filter(Boolean));
      for (const d of this.definitions.values()) {
        if (d.kind !== 'document' && !ids.has(d.id)) root.Hidden.Add(this.make(d.id));
      }
      return root;
    }

    isOpen(id) {
      const model = this.manager.Find(id);
      return !!model && !model.IsHidden;
    }

    show(id, options = {}) {
      const d = this.require(id);
      const wasOpen = this.isOpen(id);
      // Show/Add can synchronously raise LayoutUpdated and update everOpened.
      const firstOpen = !d.everOpened;
      let model = this.manager.Find(id);
      if (!model) {
        model = this.make(id);
        if (d.kind === 'document') {
          const pane = d.returnPaneId && this.manager.FindById(d.returnPaneId);
          this.manager.AddDocument(model, pane instanceof this.api.LayoutDocumentPane ? pane : null);
        } else this.manager.AddAnchorable(model, d.side);
      } else if (model.IsHidden) model.Show();
      if (!wasOpen && (options.floating === true || (d.floating && firstOpen))) {
        const width = Math.max(160, Math.min(d.width || 760, this.host.clientWidth - 24));
        const height = Math.max(110, Math.min(d.height || 520, this.host.clientHeight - 24));
        this.manager.Float(model, {
          FloatingWidth: width, FloatingHeight: height,
          FloatingLeft: Math.max(8, (this.host.clientWidth - width) / 2),
          FloatingTop: Math.max(8, (this.host.clientHeight - height) / 2)
        });
      }
      d.everOpened = true;
      if (options.activate !== false) {
        model.Activate();
        if (model.IsAutoHidden) this.manager.ShowAutoHideWindow(model);
      }
      this.syncPresentation();
      this.scheduleResize();
      return model;
    }

    hide(id) {
      const d = this.require(id);
      if (!d.closable) return false;
      const model = this.manager.Find(id);
      if (!model || model.IsHidden) return true;
      if (model.Parent instanceof this.api.LayoutDocumentPane) d.returnPaneId = model.Parent.Id;
      if (d.kind === 'document') model.Close(); else model.Hide();
      this.syncPresentation();
      return !this.isOpen(id);
    }

    setVisible(id, visible) { return visible ? this.show(id) : this.hide(id); }

    requestOpen(id) {
      const d = this.require(id);
      if (d.openAction) d.openAction(); else this.show(id);
      // Re-select an already open tool as well as opening a hidden one.
      const visible = d.bridge === 'hidden' ? !d.node.hidden : d.node.style.display !== 'none';
      if (d.openAction && d.bridge && visible) this.show(id);
    }

    observePresentation(records) {
      if (this.disposed) return;
      for (const d of this.definitions.values()) {
        if (d.bridge && records.some(record => record.target === d.node)) {
          const visible = d.bridge === 'hidden' ? !d.node.hidden : d.node.style.display !== 'none';
          if (visible !== d.bridgeVisible) {
            d.bridgeVisible = visible;
            this.setVisible(d.id, visible);
          }
        }
        if (d.titleNode && records.some(record => record.target === d.titleNode || d.titleNode.contains(record.target))) {
          const title = d.titleNode.textContent.trim();
          const model = this.manager.Find(d.id);
          if (title && model && model.Title !== title) model.Title = title;
        }
      }
    }

    syncPresentation(cleanup = true) {
      if (this.suppress || this.disposed) return;
      for (const d of this.definitions.values()) {
        const open = this.isOpen(d.id);
        const closed = d.wasOpen && !open;
        d.wasOpen = open;
        d.everOpened ||= open;
        d.bridgeVisible = open;
        if (d.bridge === 'hidden') d.node.hidden = !open;
        else if (d.bridge) {
          const display = open ? (d.display || 'block') : 'none';
          if (d.node.style.display !== display) d.node.style.display = display;
        }
        // Independent tools are no longer children of an inaccessible overlay/tab panel.
        if (d.bridge || d.manageAria) d.node.setAttribute('aria-hidden', String(!open));
        if (d.toggleButton) d.toggleButton.setAttribute('aria-pressed', String(!open));
        if (closed && cleanup && this.ready) d.onClose?.();
      }
      if (this.undoButton) this.undoButton.disabled = !this.manager.CanUndo;
      if (this.redoButton) this.redoButton.disabled = !this.manager.CanRedo;
      if (this.status && !this.status.dataset.error) {
        const count = [...this.definitions.keys()].filter(id => this.isOpen(id)).length;
        this.status.textContent = `${count} open panels · Drag tabs to dock · Double-click to float · F6 changes pane · Layout auto-save enabled`;
      }
    }

    changed() {
      if (this.suppress || this.disposed) return;
      // Let legacy visibility requests reach the MutationObserver before an unrelated,
      // coalesced Dockyard property update writes presentation back to the same nodes.
      if (!this.presentationQueued) {
        this.presentationQueued = true;
        queueMicrotask(() => {
          this.presentationQueued = false;
          if (!this.disposed && !this.suppress) this.syncPresentation();
        });
      }
      this.scheduleResize();
      if (this.ready) {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.save(), 400);
      }
    }

    scheduleResize() {
      if (this.resizeFrame || this.disposed) return;
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = 0;
        const hostSize = `${this.host.clientWidth}:${this.host.clientHeight}`;
        if (this.hostSize !== hostSize) {
          this.hostSize = hostSize;
          this.clampFloatingWindows();
        }
        for (const d of this.definitions.values()) {
          if (!d.onResize) continue;
          const rect = (d.resizeNode || d.node).getBoundingClientRect();
          d.onVisibility?.(rect.width > 0 && rect.height > 0 && document.visibilityState !== 'hidden');
          const size = `${rect.width}:${rect.height}:${global.devicePixelRatio || 1}`;
          if (size === d.size) continue;
          d.size = size;
          if (rect.width > 0 && rect.height > 0) d.onResize(rect);
        }
      });
    }

    exportLayout() {
      return JSON.stringify({
        format: FORMAT, version: VERSION, workspace: this.id,
        preset: this.preset, theme: this.manager.Theme?.Name || this.manager.Theme || 'light',
        layout: JSON.parse(this.manager.SaveLayout())
      }, null, 2);
    }

    importLayout(text) {
      if (this.disposed) throw new Error('Workspace is disposed.');
      this.importGeneration++;
      if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_LAYOUT_BYTES) {
        throw new Error('Workspace file must be UTF-8 JSON no larger than 1 MiB.');
      }
      const data = JSON.parse(text);
      if (!data || data.format !== FORMAT || data.version !== VERSION || data.workspace !== this.id || !data.layout) {
        throw new Error('This file is not a compatible workspace layout for this application.');
      }
      const serializer = new this.api.JsonLayoutSerializer(this.manager);
      serializer.LayoutSerializationCallback.add((_sender, args) => {
        const d = this.definitions.get(args.Model.ContentId);
        if (!d) { args.Cancel = true; return; }
        const isDocument = args.Model instanceof this.api.LayoutDocument;
        if (isDocument !== (d.kind === 'document')) throw new Error(`Incorrect panel type: ${d.id}`);
        args.Content = d.node;
        args.Model.IsModified = !!d.isModified;
        args.Model.CanClose = isDocument && d.closable;
        if (!isDocument) {
          args.Model.CanHide = d.closable;
          args.Model.CanDockAsTabbedDocument = true;
        }
        args.Model.IsEnabled = true;
        if (!isDocument) args.Model.CanAutoHide = true;
        args.Model.CanMove = true;
        args.Model.CanFloat = true;
        args.Model.CanDock = true;
      });
      // Dockyard validates and hydrates the complete tree before replacing the current layout.
      this.suppress++;
      try {
        serializer.Deserialize(data.layout, { maxNodes: 512, maxDepth: 32, strict: true });
        this.preset = this.options.presets.includes(data.preset) ? data.preset : this.options.defaultPreset;
        if (['light', 'dark', 'contrast'].includes(data.theme)) this.manager.Theme = data.theme;
        for (const d of this.definitions.values()) {
          if ((!d.closable || d.keepOpen) && !this.manager.Find(d.id) &&
              this.options.shouldRestorePanel?.(d, this) !== false) {
            this.manager.AddDocument(this.make(d.id));
          }
        }
      } finally { this.suppress--; }
      this.presetSelect.value = this.preset;
      this.themeSelect.value = this.manager.Theme?.Name || this.manager.Theme;
      this.syncPresentation();
      this.changed();
      this.clampFloatingWindows();
    }

    clampFloatingWindows() {
      const width = this.host.clientWidth, height = this.host.clientHeight;
      if (!width || !height) return;
      for (const model of this.manager.Layout.FloatingWindows) {
        model.FloatingWidth = Math.max(160, Math.min(model.FloatingWidth, width - 16));
        model.FloatingHeight = Math.max(110, Math.min(model.FloatingHeight, height - 16));
        model.FloatingLeft = Math.max(0, Math.min(model.FloatingLeft, width - model.FloatingWidth));
        model.FloatingTop = Math.max(0, Math.min(model.FloatingTop, height - model.FloatingHeight));
      }
    }

    applyPreset(preset) {
      if (!this.options.presets.includes(preset)) throw new Error(`Unknown workspace preset: ${preset}`);
      this.importGeneration++;
      this.preset = preset;
      this.manager.Layout = this.buildLayout(preset);
      this.presetSelect.value = preset;
      this.syncPresentation();
      this.options.onPreset?.(preset, this);
      this.changed();
    }

    save() {
      if (this.disposed) return false;
      clearTimeout(this.saveTimer);
      try {
        const target = getStorage();
        if (!target) return false;
        target.setItem(this.storageKey, this.exportLayout());
        return true;
      } catch (error) {
        this.notify(`Layout is usable but cannot be saved locally: ${error.message}`, true);
        return false;
      }
    }

    restore() {
      try {
        const saved = getStorage()?.getItem(this.storageKey);
        if (saved) this.importLayout(saved);
      } catch (error) {
        this.notify(`Saved layout was not restored; using the default workspace. ${error.message}`, true);
      }
    }

    notify(message, error = false) {
      if (!this.status) return;
      this.status.textContent = message;
      this.status.dataset.error = error ? 'true' : '';
      this.status.classList.toggle('is-error', error);
    }

    createToolbar() {
      const bar = element('div', 'dxf-dock-toolbar');
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Workspace layout');
      bar.append(element('strong', 'dxf-dock-brand', this.options.title));
      const button = (label, action, title = label) => {
        const node = element('button', '', label);
        node.type = 'button'; node.title = title; node.setAttribute('aria-label', title);
        node.addEventListener('click', action, { signal: this.abort.signal });
        bar.append(node); return node;
      };
      this.panelsButton = button('Panels ▾', () => this.showPanelsMenu(), 'Show or hide workspace panels');
      this.presetSelect = element('select');
      this.presetSelect.setAttribute('aria-label', 'Workspace preset');
      for (const preset of this.options.presets) this.presetSelect.append(new Option(preset, preset));
      this.presetSelect.value = this.preset;
      this.presetSelect.addEventListener('change', () => this.applyPreset(this.presetSelect.value), { signal: this.abort.signal });
      bar.append(this.presetSelect);
      this.undoButton = button('↶', () => this.manager.Undo(), 'Undo layout change');
      this.redoButton = button('↷', () => this.manager.Redo(), 'Redo layout change');
      button('Reset layout', () => {
        this.status.dataset.error = '';
        this.status.classList.remove('is-error');
        this.applyPreset(this.options.defaultPreset);
        this.save();
      });
      const spacer = element('span', 'dxf-dock-toolbar-spacer'); bar.append(spacer);
      this.themeSelect = element('select');
      this.themeSelect.setAttribute('aria-label', 'Workspace theme');
      for (const theme of ['light', 'dark', 'contrast']) this.themeSelect.append(new Option(theme[0].toUpperCase() + theme.slice(1), theme));
      this.themeSelect.value = this.options.theme || 'light';
      this.themeSelect.addEventListener('change', () => {
        this.manager.Theme = this.themeSelect.value;
        this.changed();
      }, { signal: this.abort.signal });
      bar.append(this.themeSelect);
      button('Export layout', () => {
        const url = URL.createObjectURL(new Blob([this.exportLayout()], { type: 'application/json' }));
        const link = element('a'); link.href = url; link.download = `dxf-${this.id}-workspace.json`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      this.fileInput = element('input'); this.fileInput.type = 'file'; this.fileInput.accept = '.json,application/json'; this.fileInput.hidden = true;
      this.fileInput.setAttribute('aria-label', 'Import workspace layout file');
      this.fileInput.addEventListener('change', async () => {
        const file = this.fileInput.files?.[0]; this.fileInput.value = '';
        if (!file) return;
        const generation = ++this.importGeneration;
        let applying = false;
        try {
          if (file.size > MAX_LAYOUT_BYTES) throw new Error('Workspace files are limited to 1 MiB.');
          const text = await file.text();
          if (this.disposed || generation !== this.importGeneration) return;
          applying = true;
          this.importLayout(text);
          this.options.onRestore?.(this);
          this.notify('Workspace layout imported. Drawing data was not changed.');
        } catch (error) { if (!this.disposed && (applying || generation === this.importGeneration)) this.notify(`Layout import rejected: ${error.message}`, true); }
      }, { signal: this.abort.signal });
      bar.append(this.fileInput);
      button('Import layout', () => this.fileInput.click());
      return bar;
    }

    showPanelsMenu() {
      const rect = this.panelsButton.getBoundingClientRect();
      const entries = [...this.definitions.values()].map(d => ({
        Label: d.title, Checked: this.isOpen(d.id),
        CanExecute: d.closable || !this.isOpen(d.id),
        Execute: () => this.isOpen(d.id) ? this.hide(d.id) : this.requestOpen(d.id)
      }));
      this.manager.ShowMenu(entries, rect.left, rect.bottom);
    }

    dispose() {
      if (this.disposed) return;
      this.save();
      this.disposed = true;
      this.importGeneration++;
      const errors = [];
      for (const callback of this.disposers) { try { callback(); } catch (error) { errors.push(error); } }
      this.disposers.clear();
      clearTimeout(this.saveTimer);
      cancelAnimationFrame(this.resizeFrame);
      this.abort.abort();
      this.observer.disconnect(); this.resizeObserver.disconnect();
      for (const unsubscribe of this.unsubscribers) { try { unsubscribe(); } catch (error) { errors.push(error); } }
      this.unsubscribers.length = 0;
      // The application owns the nodes, not the docking manager.
      for (const d of this.definitions.values()) this.parking.append(d.node);
      this.manager.Dispose();
      this.host.remove(); this.toolbar.remove(); this.status.remove();
      if (errors.length) throw new AggregateError(errors, 'Workspace cleanup failed.');
    }
  }

  return { Workspace, element, FORMAT, VERSION, MAX_LAYOUT_BYTES };
}
