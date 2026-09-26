/** Responsive presentation policy, independent of the DOM and docking engine. */
export function analysisArrangement(width, height, preset = 'auto') {
    if (!['auto', 'balanced', 'stacked', 'tabs'].includes(preset))
        throw new RangeError('Analysis layout must be auto, balanced, stacked or tabs.');
    if (preset !== 'auto') return preset;
    // Never trade away the usable record viewport merely to keep every pane visible.
    if (!(width >= 740 && height >= 320)) return 'tabs';
    return width >= 1080 ? 'balanced' : 'stacked';
}

const FORMAT = 'dxf-analysis-layout';
const MAX_BYTES = 64 * 1024;

/** Bind optional docking to a host's browser realm and Dockyard API. No globals,
 * application controllers, vendor imports or storage access occur on import.
 */
export function createAnalysisDocking({ window: win, dockyard: D } = {}) {
    if (!win?.document || !win.ResizeObserver || !win.AbortController)
        throw new TypeError('Analysis docking requires a browser window with DOM observers.');
    if (!D?.DockingManager || !D.LayoutAnchorable || !D.JsonLayoutSerializer)
        throw new TypeError('Analysis docking requires a compatible Dockyard API.');
    const doc = win.document;
    const element = (tag, className, text) => {
        const node = doc.createElement(tag); node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    return class AnalysisDocking {
        constructor({ container, records, details, visual, title = 'Analysis', onChange, onResize, onError,
            storage = null, storageKey = null } = {}) {
            const panels = [['records', 'Records', records], ['visual', 'Visualization', visual], ['details', 'Details', details]]
                .filter(([, , node]) => node != null);
            if (!container || !records || !details || [container, ...panels.map(p => p[2])].some(node =>
                !(node instanceof win.HTMLElement) || node.ownerDocument !== doc))
                throw new TypeError('Analysis panel containers must belong to the supplied window.');
            if (new Set(panels.map(p => p[2])).size !== panels.length || panels.some(([, , node]) =>
                node === container || node.contains(container) || panels.some(([, , other]) => other !== node && node.contains(other))))
                throw new TypeError('Analysis panels must own distinct, non-nested content.');
            if (storage != null && (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function'))
                throw new TypeError('Analysis storage must implement getItem and setItem.');
            for (const callback of [onChange, onResize, onError]) if (callback != null && typeof callback !== 'function')
                throw new TypeError('Analysis layout callbacks must be functions.');
            this.container = container; this.panels = new Map(panels.map(([id, label, node]) => [id, { label, node }]));
            this.onChange = onChange; this.onResize = onResize; this.onError = onError; this.storage = storage; this.storageKey = storageKey;
            this.abort = new win.AbortController(); this.disposed = false; this.preset = 'auto'; this.custom = false;
            this.focused = null; this.unfocused = null; this.frame = 0; this.timer = 0; this.suppress = 0;
            this.sizes = new Map(); this.visibility = new Map();
            this.host = element('div', 'analysis-dock-host');
            this.toolbar = element('div', 'analysis-layout-toolbar'); this.toolbar.setAttribute('role', 'toolbar');
            this.toolbar.setAttribute('aria-label', title + ' layout');
            this.layoutSelect = element('select', 'analysis-layout-select'); this.layoutSelect.setAttribute('aria-label', 'Analysis layout');
            for (const [value, label] of [['auto', 'Adaptive layout'], ['balanced', 'Side by side'], ['stacked', 'Stacked panels'], ['tabs', 'Tabbed panels']]) {
                const option = element('option', '', label); option.value = value; this.layoutSelect.append(option);
            }
            this.layoutSelect.addEventListener('change', () => this.setPreset(this.layoutSelect.value), { signal: this.abort.signal });
            this.toolbar.append(this.layoutSelect);
            this.makeButton('Reset layout', () => this.reset());
            this.undoButton = this.makeButton('Undo layout', () => this.manager.Undo());
            this.redoButton = this.makeButton('Redo layout', () => this.manager.Redo());
            this.restoreButton = this.makeButton('Restore panes', () => this.restoreFocus()); this.restoreButton.hidden = true;
            this.hint = element('span', 'analysis-layout-hint', 'Drag tabs to split or float'); this.toolbar.append(this.hint);
            this.parking = element('div', 'analysis-dock-parking'); this.parking.hidden = true;
            for (const { node } of this.panels.values()) this.parking.append(node);
            container.replaceChildren(this.toolbar, this.host, this.parking);
            const size = container.getBoundingClientRect();
            this.arrangement = analysisArrangement(size.width, size.height - 34);
            this.manager = new D.DockingManager(this.host, {
                Layout: this.build(this.arrangement), Theme: 'light', EnableHistory: true, HistoryLimit: 30,
                AutoSave: false, RestoreOnLoad: false, AllowMixedOrientation: true,
                GridSplitterWidth: 6, GridSplitterHeight: 6, FloatingWindowMinWidth: 180, FloatingWindowMinHeight: 130
            });
            this.host.setAttribute('aria-label', title + ' panels');
            this.fingerprint = this.structure();
            this.off = [
                this.manager.LayoutUpdated.add(() => this.changed()),
                this.manager.LayoutChanged.add(() => this.changed()),
                this.manager.ActiveContentChanged.add(() => this.schedule()),
                this.manager.HistoryChanged.add(() => this.schedule())
            ];
            // Keyboard events are handled by this manager first. Do not let layout
            // history/navigation mutate an enclosing workspace as well.
            this.host.addEventListener('keydown', e => { if (e.defaultPrevented) e.stopPropagation(); }, { signal: this.abort.signal });
            this.host.addEventListener('keyup', e => { if (e.defaultPrevented) e.stopPropagation(); }, { signal: this.abort.signal });
            this.observer = new win.ResizeObserver(() => this.schedule());
            this.observer.observe(this.host);
            for (const { node } of this.panels.values()) this.observer.observe(node);
            if (storage && storageKey) {
                try { const state = storage.getItem(storageKey); if (state) this.restoreState(JSON.parse(state)); }
                catch (_) { /* Old, unavailable or corrupt presentation state is disposable. */ }
            }
            this.schedule();
        }
        makeButton(label, action) {
            const node = element('button', '', label); node.type = 'button';
            node.addEventListener('click', action, { signal: this.abort.signal }); this.toolbar.append(node); return node;
        }
        notify(callback, ...args) {
            if (this.disposed) return;
            try { callback?.(...args); }
            catch (error) {
                if (this.disposed) return;
                // Report a consumer failure without aborting other pane updates.
                this.hint.textContent = String(error?.message || error);
                this.hint.setAttribute('role', 'alert');
                try { this.onError?.(error); } catch (_) { /* Error observers do not own layout lifetime. */ }
            }
        }
        make(id) {
            const { label, node } = this.panels.get(id);
            return new D.LayoutAnchorable({ ContentId: id, Title: label, Content: node,
                CanClose: false, CanHide: id !== 'records', CanAutoHide: false,
                CanFloat: true, CanMove: true, CanDock: true, CanDockAsTabbedDocument: true });
        }
        build(arrangement, ids = [...this.panels.keys()]) {
            const nodes = new Map([...this.panels.keys()].map(id => [id, this.make(id)]));
            const pane = (names, width = '1*', height = '1*') => new D.LayoutDocumentPane({
                DockWidth: width, DockHeight: height, DockMinWidth: 100, DockMinHeight: 90,
                Children: names.map(id => nodes.get(id))
            });
            let root;
            if (arrangement === 'tabs' || ids.length < 2) root = pane(ids);
            else if (arrangement === 'balanced') root = new D.LayoutPanel({ Orientation: 'Horizontal',
                Children: ids.map(id => pane([id], id === 'records' ? '2*' : '1*')) });
            else root = new D.LayoutPanel({ Orientation: 'Horizontal', Children: [pane([ids[0]], '1.6*'),
                new D.LayoutPanel({ Orientation: 'Vertical', DockWidth: '1*', Children: ids.slice(1).map(id => pane([id])) })] });
            const layout = new D.LayoutRoot({ RootPanel: new D.LayoutPanel({ Children: [root] }) });
            for (const [id, node] of nodes) if (!ids.includes(id)) layout.Hidden.Add(node);
            return layout;
        }
        require(id) {
            if (this.disposed) throw new Error('Analysis layout is disposed.');
            if (!this.panels.has(id)) throw new RangeError('Unknown analysis pane: ' + id);
            return this.manager.Find(id);
        }
        isOpen(id) { return !this.disposed && !!this.manager.Find(id) && !this.manager.Find(id).IsHidden; }
        isVisible(id) {
            if (!this.isOpen(id)) return false;
            const rect = this.panels.get(id).node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;
        }
        visualMode() { return this.isVisible('visual') ? (this.isVisible('records') ? 'split' : 'visual') : 'data'; }
        show(id) {
            let model = this.require(id);
            if (this.focused && this.focused !== id) { this.restoreFocus(); model = this.require(id); }
            this.manager.Show(model); this.manager.Activate(model); this.schedule();
        }
        hide(id) {
            this.require(id); if (id === 'records') throw new Error('The records pane cannot be hidden.');
            if (this.focused) this.restoreFocus();
            this.manager.Hide(this.require(id)); this.schedule();
        }
        focus(id) {
            this.require(id);
            if (this.focused === id) return this.restoreFocus();
            if (this.focused) this.restoreFocus();
            this.unfocused = this.saveState(); this.focused = id;
            this.suppress++;
            try { this.manager.Layout = this.build('tabs', [id]); this.manager.Activate(id); }
            finally { this.fingerprint = this.structure(); this.suppress--; }
            this.restoreButton.hidden = false; this.schedule();
        }
        restoreFocus() {
            if (!this.focused || this.disposed) return;
            const state = this.unfocused; this.focused = null; this.unfocused = null;
            this.restoreButton.hidden = true; this.restoreState(state); this.schedule();
        }
        setPreset(preset) {
            const mode = analysisArrangement(this.host.clientWidth, this.host.clientHeight, preset);
            if (this.disposed) return;
            this.focused = this.unfocused = null; this.preset = preset; this.arrangement = mode; this.custom = false;
            this.suppress++;
            try { this.manager.Layout = this.build(mode); this.manager.Activate('records'); }
            finally { this.fingerprint = this.structure(); this.suppress--; }
            this.layoutSelect.value = preset; this.restoreButton.hidden = true; this.persist(); this.schedule();
        }
        reset() { if (!this.disposed) { this.setPreset('auto'); this.manager.ClearHistory(); } }
        structure() {
            return JSON.stringify(JSON.parse(this.manager.SaveLayout()), (key, value) =>
                ['IsSelected', 'activeContentId', 'lastFocusedDocumentId', 'LastActivationTimeStamp'].includes(key) || key.startsWith('Actual') ? undefined : value);
        }
        changed() {
            if (this.disposed) return;
            const fingerprint = this.structure();
            if (fingerprint !== this.fingerprint) {
                this.fingerprint = fingerprint;
                if (!this.suppress) { this.custom = true; this.persist(); }
            }
            this.schedule();
        }
        schedule() {
            if (this.frame || this.disposed) return;
            this.frame = win.requestAnimationFrame(() => { this.frame = 0; this.resize(); });
        }
        resize() {
            if (this.disposed) return;
            const width = this.host.clientWidth, height = this.host.clientHeight;
            const next = analysisArrangement(width, height, this.preset);
            if (width > 0 && height > 0 && !this.custom && !this.focused && next !== this.arrangement) {
                const visible = [...this.panels.keys()].filter(id => this.isOpen(id));
                const active = this.manager.ActiveModel?.ContentId;
                this.arrangement = next; this.suppress++;
                try { this.manager.Layout = this.build(next, visible); this.manager.Activate(visible.includes(active) ? active : 'records'); }
                finally { this.fingerprint = this.structure(); this.suppress--; }
            }
            this.container.dataset.arrangement = this.custom ? 'custom' : this.arrangement;
            this.undoButton.disabled = !this.manager.CanUndo; this.redoButton.disabled = !this.manager.CanRedo;
            for (const [id, { node }] of this.panels) {
                const rect = node.getBoundingClientRect(), visible = this.isOpen(id) && rect.width > 0 && rect.height > 0;
                const key = visible ? `${rect.width}:${rect.height}` : 'hidden';
                if (this.sizes.get(id) !== key) { this.sizes.set(id, key); if (visible) this.notify(this.onResize, id); }
                if (this.disposed) return;
                this.visibility.set(id, visible);
            }
            this.notify(this.onChange);
        }
        saveState() {
            if (this.disposed) return null;
            // Focus is transient. Persist the user's complete arrangement, not a
            // one-panel inspection which would hide the other panes on reload.
            if (this.focused) return this.unfocused;
            return { format: FORMAT, version: 1, preset: this.preset, custom: this.custom,
                panels: [...this.panels.keys()], layout: JSON.parse(this.manager.SaveLayout()) };
        }
        restoreState(state) {
            if (this.disposed) return;
            const encoded = JSON.stringify(state);
            if (!encoded || new win.TextEncoder().encode(encoded).length > MAX_BYTES ||
                state?.format !== FORMAT || state.version !== 1 || !state.layout ||
                !['auto', 'balanced', 'stacked', 'tabs'].includes(state.preset) ||
                JSON.stringify(state.panels) !== JSON.stringify([...this.panels.keys()]))
                throw new TypeError('Incompatible analysis layout or layout exceeds 64 KiB.');
            analysisArrangement(0, 0, state.preset);
            const serializer = new D.JsonLayoutSerializer(this.manager), seen = new Set();
            serializer.LayoutSerializationCallback.add((_sender, args) => {
                const id = args.Model.ContentId;
                if (!this.panels.has(id) || seen.has(id) || !(args.Model instanceof D.LayoutAnchorable))
                    throw new TypeError('Unknown, duplicate or incorrectly typed analysis pane.');
                seen.add(id); args.Content = this.panels.get(id).node;
                args.Model.Title = this.panels.get(id).label; args.Model.CanClose = false;
                args.Model.CanHide = id !== 'records'; args.Model.CanAutoHide = false;
                args.Model.CanDockAsTabbedDocument = true; args.Model.CanMove = args.Model.CanDock = args.Model.CanFloat = args.Model.IsEnabled = true;
                if (id === 'records' && args.Model.IsHidden) throw new TypeError('The records pane must remain available.');
            });
            // Validate without mutating the live manager; hydration callbacks must
            // not be allowed to remove panes or import another report's content.
            const candidate = new D.DockingManager();
            try {
                const validation = new D.JsonLayoutSerializer(candidate);
                validation.LayoutSerializationCallback.add((_sender, args) => { args.Content = null; });
                validation.Deserialize(state.layout, { maxNodes: 64, maxDepth: 12, strict: true });
                const content = [...candidate.Layout.Descendents()].filter(n => n.ContentId != null);
                if (content.length !== this.panels.size || content.some(n => !this.panels.has(n.ContentId) || !(n instanceof D.LayoutAnchorable)) ||
                    candidate.Find('records')?.IsHidden) throw new TypeError('Analysis layout must retain every known pane and visible records.');
            } finally { candidate.Dispose(); }
            this.suppress++;
            try { serializer.Deserialize(state.layout, { maxNodes: 64, maxDepth: 12, strict: true }); }
            finally { this.fingerprint = this.structure(); this.suppress--; }
            this.preset = state.preset; this.custom = state.custom === true; this.layoutSelect.value = this.preset;
            this.focused = this.unfocused = null; this.restoreButton.hidden = true;
            this.persist(); this.schedule();
        }
        persist() {
            win.clearTimeout(this.timer);
            if (!this.storage || !this.storageKey || this.disposed) return;
            this.timer = win.setTimeout(() => { this.timer = 0; this.flush(); }, 180);
        }
        flush() { try { if (this.storage && this.storageKey) this.storage.setItem(this.storageKey, JSON.stringify(this.saveState())); } catch (_) {} }
        setTheme(theme) { if (!this.disposed) this.manager.Theme = /contrast/i.test(theme) ? 'contrast' : /dark/i.test(theme) ? 'dark' : 'light'; }
        dispose() {
            if (this.disposed) return;
            this.flush(); this.disposed = true; this.abort.abort(); this.observer.disconnect();
            win.cancelAnimationFrame(this.frame); win.clearTimeout(this.timer); this.off.forEach(off => off());
            for (const { node } of this.panels.values()) this.parking.append(node);
            this.manager.Dispose(); this.host.remove(); this.toolbar.remove();
            for (const { node } of this.panels.values()) this.container.append(node);
            this.parking.remove(); this.panels.clear(); this.sizes.clear(); this.visibility.clear();
            this.onChange = this.onResize = this.onError = this.storage = this.unfocused = null;
        }
    };
}
