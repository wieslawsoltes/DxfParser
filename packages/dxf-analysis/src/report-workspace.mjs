import { ReportBuffer } from './report-buffer.mjs';

let sequence = 0;
const modes = ['tabs', 'horizontal', 'vertical'];

/** Pure sizing policy: compact hosts use tabs instead of a squeezed query sidebar. */
export function reportWorkspaceArrangement(width, height, mode = 'tabs') {
    if (!modes.includes(mode)) throw new RangeError('Result layout must be tabs, horizontal or vertical.');
    return { compact: !(width >= 760 && height >= 300), mode };
}

/** Retained result documents and optional host-owned query controls. No application
 * code, vendor paths, element registration or storage are accessed on import.
 */
export function createReportWorkspace({ window: win, dockyard: D, createView } = {}) {
    if (!win?.document || !win.HTMLElement || !win.ResizeObserver || !win.AbortController)
        throw new TypeError('Report workspace requires a browser window with DOM observers.');
    if (!D?.DockingManager || !D.LayoutDocument || !D.LayoutAnchorable || !D.JsonLayoutSerializer)
        throw new TypeError('Report workspace requires a compatible Dockyard API.');
    if (typeof createView !== 'function') throw new TypeError('A report-view factory is required.');
    const document = win.document;
    const element = (tag, className, text) => {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const assertNode = node => {
        if (!(node instanceof win.HTMLElement) || node.ownerDocument !== document)
            throw new TypeError('Report workspace nodes must belong to the supplied window.');
    };

    return class ReportWorkspace {
        constructor({ container, controls = null, controlsTitle = 'Query', title = 'Analysis results',
            maxDocuments = 32, maxRows = 250000, onClose, onActiveChange, onError } = {}) {
            assertNode(container);
            if (controls) {
                assertNode(controls);
                if (controls === container || controls.contains(container))
                    throw new TypeError('Query controls cannot contain the workspace.');
            }
            if (![maxDocuments, maxRows].every(value => Number.isSafeInteger(value) && value > 0))
                throw new RangeError('Report document and row limits must be positive safe integers.');
            for (const callback of [onClose, onActiveChange, onError])
                if (callback != null && typeof callback !== 'function') throw new TypeError('Report callbacks must be functions.');
            this.container = container;
            this.controls = controls;
            this.controlsTitle = controlsTitle;
            this.maxDocuments = maxDocuments;
            this.maxRows = maxRows;
            this.onClose = onClose;
            this.onActiveChange = onActiveChange;
            this.onError = onError;
            this.entries = new Map();
            this.prefix = `report-workspace-${++sequence}-`;
            this.controlsId = this.prefix + 'controls';
            this.nextId = 0;
            this.activeId = null;
            this.mode = 'tabs';
            this.theme = 'light';
            this.frame = null;
            this.disposed = false;
            this.custom = false;
            this.suppress = 0;
            this.sizes = new Map();
            this.abort = new win.AbortController();
            this.root = element('section', 'dxf-report-workspace');
            this.root.setAttribute('aria-label', title);
            this.toolbar = element('div', 'report-workspace-toolbar');
            this.toolbar.setAttribute('role', 'toolbar');
            this.toolbar.setAttribute('aria-label', title + ' layout');
            this.controlsButton = this.button(controlsTitle, () => this.showControls());
            this.controlsButton.hidden = !controls;
            this.select = element('select', 'report-workspace-select');
            this.select.setAttribute('aria-label', 'Active result');
            this.select.addEventListener('change', () => this.perform(() => this.activate(this.select.value)), { signal: this.abort.signal });
            this.toolbar.append(this.select);
            this.layoutSelect = element('select', 'report-workspace-arrangement');
            this.layoutSelect.setAttribute('aria-label', 'Result layout');
            for (const [value, label] of [['tabs', 'Tabbed results'], ['horizontal', 'Results side by side'], ['vertical', 'Results stacked']]) {
                const option = element('option', '', label); option.value = value; this.layoutSelect.append(option);
            }
            this.layoutSelect.addEventListener('change', () => this.perform(() => this.arrange(this.layoutSelect.value)), { signal: this.abort.signal });
            this.toolbar.append(this.layoutSelect);
            this.focusButton = this.button('Focus results', () => this.focusResults());
            this.focusButton.hidden = !controls;
            this.closeButton = this.button('Close result', () => this.remove(this.activeId));
            this.status = element('span', 'report-workspace-status');
            this.status.setAttribute('role', 'status'); this.toolbar.append(this.status);
            this.host = element('div', 'report-workspace-host');
            this.host.setAttribute('aria-label', title + ' documents');
            this.empty = element('div', 'report-workspace-empty', 'Run a query to create a result document.');
            this.parking = element('div', 'report-workspace-parking'); this.parking.hidden = true;
            this.message = element('div', 'report-workspace-message');
            this.message.setAttribute('role', 'alert'); this.message.hidden = true;
            this.root.append(this.toolbar, this.message, this.host, this.parking);
            container.append(this.root);
            if (controls) this.parking.append(controls);
            this.compact = reportWorkspaceArrangement(container.clientWidth, container.clientHeight).compact;
            this.manager = new D.DockingManager(this.host, {
                Layout: this.build(), Theme: this.theme, EnableHistory: false, AutoSave: false, RestoreOnLoad: false,
                AllowMixedOrientation: true, GridSplitterWidth: 6, GridSplitterHeight: 6,
                FloatingWindowMinWidth: 240, FloatingWindowMinHeight: 220
            });
            this.fingerprint = this.structure();
            this.off = [
                this.manager.DocumentClosed.add((_sender, args) => this.release(args.Document?.ContentId)),
                this.manager.ActiveContentChanged.add((_sender, args) => {
                    if (!this.suppress && this.entries.has(args.Model?.ContentId)) this.setActive(args.Model.ContentId);
                    this.schedule();
                }),
                this.manager.LayoutUpdated.add(() => this.changed()),
                this.manager.LayoutChanged.add(() => this.changed())
            ];
            this.host.addEventListener('keydown', event => {
                if (event.defaultPrevented) event.stopPropagation();
            }, { signal: this.abort.signal });
            this.observer = new win.ResizeObserver(() => this.schedule());
            this.observer.observe(this.host);
            this.updateUI(); this.schedule();
        }

        button(label, action) {
            const node = element('button', '', label); node.type = 'button';
            node.addEventListener('click', () => this.perform(action), { signal: this.abort.signal });
            this.toolbar.append(node); return node;
        }
        perform(action) {
            try { action(); } catch (error) { this.error(error); this.updateUI(); }
        }
        error(error) {
            if (!this.disposed) { this.message.textContent = String(error?.message || error); this.message.hidden = false; }
            try { this.onError?.(error); } catch (_) { /* An observer does not own report lifetime. */ }
        }
        notify(callback, value) { try { callback?.(value); } catch (error) { this.error(error); } }
        assertActive() { if (this.disposed) throw new Error('Report workspace is disposed.'); }
        require(id) { this.assertActive(); const entry = this.entries.get(id); if (!entry) throw new RangeError('Unknown result document.'); return entry; }
        model(entry) { return new D.LayoutDocument({ ContentId: entry.id, Title: entry.title, Content: entry.content, CanClose: true, CanFloat: true, CanMove: true }); }
        queryModel() { return new D.LayoutAnchorable({ ContentId: this.controlsId, Title: this.controlsTitle, Content: this.controls,
            CanClose: false, CanHide: true, CanAutoHide: false, CanDockAsTabbedDocument: true }); }
        build() {
            const documents = [...this.entries.values()].map(entry => this.model(entry));
            const pane = children => new D.LayoutDocumentPane({ DockWidth: '1*', DockHeight: '1*', DockMinWidth: 180, DockMinHeight: 160, Children: children });
            const query = this.controls ? this.queryModel() : null;
            let results = pane(documents);
            if (documents.length > 1 && this.mode !== 'tabs' && !this.compact) results = new D.LayoutPanel({
                Orientation: this.mode === 'horizontal' ? 'Horizontal' : 'Vertical', DockWidth: '1*', DockHeight: '1*',
                Children: documents.map(model => pane([model]))
            });
            let children = [results];
            if (query) {
                if (this.compact) children = [pane([query, ...documents])];
                else children.unshift(new D.LayoutAnchorablePane({ DockWidth: 300, DockMinWidth: 230, Children: [query] }));
            }
            return new D.LayoutRoot({ RootPanel: new D.LayoutPanel({ Orientation: 'Horizontal', Children: children }) });
        }
        structure() {
            return JSON.stringify(JSON.parse(this.manager.SaveLayout()), (key, value) =>
                ['IsSelected', 'activeContentId', 'lastFocusedDocumentId', 'LastActivationTimeStamp'].includes(key) || key.startsWith('Actual') ? undefined : value);
        }
        changed() {
            if (this.disposed) return;
            const fingerprint = this.structure();
            if (fingerprint !== this.fingerprint && !this.suppress) this.custom = true;
            this.fingerprint = fingerprint;
            this.schedule();
        }
        mutate(action) {
            this.suppress++;
            try { return action(); }
            finally { this.fingerprint = this.structure(); this.suppress--; }
        }

        add({ id = this.prefix + ++this.nextId, title = 'Results', rows = [], ...options } = {}) {
            this.assertActive();
            if (typeof id !== 'string' || !id || id === this.controlsId || this.entries.has(id)) throw new TypeError('Result IDs must be unique nonempty strings.');
            if (this.entries.size >= this.maxDocuments) throw new RangeError('Close a result document before creating another.');
            if (!Array.isArray(rows) || rows.length > this.maxRows) throw new RangeError('Invalid rows or report row limit exceeded.');
            const previousLayout = this.manager.SaveLayout(), previousCustom = this.custom;
            let layoutChanged = false;
            const content = element('section', 'report-workspace-document');
            const entry = { id, title: String(title), content, view: null, buffer: null, disposed: false };
            content.dataset.reportId = id;
            // Build the view off-screen before changing the live docking layout.
            this.parking.append(content);
            try {
                entry.view = createView(content, { ...options, title: entry.title, rows: [] });
                if (!entry.view || typeof entry.view.setRows !== 'function' || typeof entry.view.dispose !== 'function')
                    throw new TypeError('Report factory must return setRows and dispose.');
                entry.view.setTheme?.(this.theme);
                entry.buffer = new ReportBuffer({ publish: value => { entry.view.setRows(value); this.schedule(); },
                    schedule: callback => win.requestAnimationFrame(callback), cancel: token => win.cancelAnimationFrame(token),
                    onError: error => this.error(error), maxRows: this.maxRows });
                entry.buffer.replace(rows); entry.buffer.flush();
                this.entries.set(id, entry); this.observer.observe(content);
                layoutChanged = true;
                this.mutate(() => this.manager.AddDocument(this.model(entry)));
                this.activate(id); this.updateUI(); this.schedule();
                return entry;
            } catch (error) {
                this.entries.delete(id); this.observer.unobserve(content);
                entry.buffer?.dispose(); try { entry.view?.dispose(); } catch (_) {}
                content.remove();
                if (layoutChanged) {
                    this.mutate(() => {
                        const serializer = new D.JsonLayoutSerializer(this.manager);
                        serializer.LayoutSerializationCallback.add((_sender, args) => {
                            args.Content = args.Model.ContentId === this.controlsId ? this.controls : this.entries.get(args.Model.ContentId)?.content;
                        });
                        serializer.Deserialize(previousLayout);
                    });
                    this.custom = previousCustom;
                    this.manager.ReleaseContent(id);
                }
                throw error;
            }
        }
        append(id, row) { return this.appendMany(id, [row]); }
        appendMany(id, rows) {
            const entry = this.require(id);
            try { return entry.buffer.appendMany(rows); }
            catch (error) { this.error(error); throw error; }
        }
        flush(id) { this.require(id).buffer.flush(); }
        setActive(id) {
            if (this.activeId === id) return;
            this.activeId = id; this.updateUI(); this.notify(this.onActiveChange, this.entries.get(id) || null);
        }
        activate(id) {
            const entry = this.require(id); entry.buffer.flush();
            this.manager.Activate(id); this.setActive(id); this.schedule();
        }
        remove(id) {
            if (!this.entries.has(id) || this.disposed) return false;
            return this.manager.Close(this.manager.Find(id));
        }
        release(id) {
            const entry = this.entries.get(id); if (!entry || entry.disposed) return;
            entry.disposed = true; this.entries.delete(id); this.observer.unobserve(entry.content); this.sizes.delete(id);
            entry.buffer.dispose();
            try { entry.view.dispose(); } catch (error) { this.error(error); }
            entry.content.remove(); this.manager.ReleaseContent(id);
            if (this.activeId === id) {
                const active = this.manager.ActiveModel?.ContentId;
                this.setActive(this.entries.has(active) ? active : (this.entries.keys().next().value || null));
            }
            this.notify(this.onClose, entry); this.updateUI(); this.schedule();
        }
        rebuild() {
            const id = this.manager.ActiveModel?.ContentId || this.activeId;
            this.mutate(() => { this.manager.Layout = this.build(); if (this.manager.Find(id)) this.manager.Activate(id); });
        }
        arrange(mode) {
            this.assertActive(); reportWorkspaceArrangement(0, 0, mode);
            for (const entry of this.entries.values()) {
                if (this.manager.Find(entry.id)?.CanMove === false) throw new Error('Every result must be movable before arranging documents.');
            }
            this.mode = mode; this.custom = false;
            this.compact = reportWorkspaceArrangement(this.host.clientWidth, this.host.clientHeight, mode).compact;
            this.rebuild(); this.updateUI(); this.schedule();
        }
        showControls() {
            this.assertActive(); if (!this.controls) return;
            this.manager.Show(this.manager.Find(this.controlsId)); this.manager.Activate(this.controlsId); this.schedule();
        }
        focusResults() {
            this.assertActive(); if (!this.controls || !this.activeId) return;
            const query = this.manager.Find(this.controlsId);
            if (query.IsHidden) this.manager.Show(query); else this.manager.Hide(query);
            this.activate(this.activeId); this.schedule();
        }
        setTheme(theme) {
            this.assertActive(); this.theme = /contrast/i.test(theme) ? 'contrast' : /dark/i.test(theme) ? 'dark' : 'light';
            this.root.dataset.theme = this.theme; this.manager.Theme = this.theme;
            for (const entry of this.entries.values()) entry.view.setTheme?.(this.theme);
        }
        updateUI() {
            if (this.disposed) return;
            const signature = JSON.stringify([...this.entries.values()].map(entry => [entry.id, entry.title]));
            if (signature !== this.optionSignature) {
                this.optionSignature = signature; this.select.replaceChildren();
                for (const entry of this.entries.values()) {
                    const option = element('option', '', entry.title); option.value = entry.id; this.select.append(option);
                }
            }
            if (this.select.value !== (this.activeId || '')) this.select.value = this.activeId || '';
            this.select.disabled = this.closeButton.disabled = !this.entries.size;
            this.layoutSelect.disabled = this.entries.size < 2;
            this.layoutSelect.value = this.mode;
            this.focusButton.disabled = !this.entries.size;
            const focusLabel = this.manager.Find(this.controlsId)?.IsHidden ? 'Restore query' : 'Focus results';
            if (this.focusButton.textContent !== focusLabel) this.focusButton.textContent = focusLabel;
            const summary = `${this.entries.size} result${this.entries.size === 1 ? '' : 's'}`;
            if (this.status.textContent !== summary) this.status.textContent = summary;
            if (!this.entries.size && !this.empty.isConnected) this.host.append(this.empty);
            this.empty.hidden = this.entries.size > 0;
        }
        schedule() {
            if (this.disposed || this.frame !== null) return;
            this.frame = win.requestAnimationFrame(() => { this.frame = null; this.refreshLayout(); });
        }
        refreshLayout() {
            if (this.disposed) return;
            const width = this.host.clientWidth, height = this.host.clientHeight;
            const { compact } = reportWorkspaceArrangement(width, height, this.mode);
            if (width > 0 && height > 0 && !this.custom && compact !== this.compact) {
                this.compact = compact; this.rebuild();
            }
            for (const entry of this.entries.values()) {
                const rect = entry.content.getBoundingClientRect();
                const size = rect.width > 0 && rect.height > 0 ? `${rect.width}:${rect.height}` : 'hidden';
                if (size !== this.sizes.get(entry.id)) {
                    this.sizes.set(entry.id, size);
                    if (size !== 'hidden') {
                        try { entry.buffer.flush(); entry.view.refreshLayout?.(); }
                        catch (error) { this.error(error); }
                    }
                }
            }
            this.updateUI();
        }
        dispose() {
            if (this.disposed) return;
            this.disposed = true; this.abort.abort(); this.observer.disconnect();
            if (this.frame !== null) win.cancelAnimationFrame(this.frame);
            this.frame = null; this.off.forEach(off => off());
            for (const entry of this.entries.values()) {
                entry.disposed = true; entry.buffer.dispose();
                try { entry.view.dispose(); } catch (error) { this.error(error); }
                entry.content.remove(); this.notify(this.onClose, entry);
            }
            this.entries.clear(); this.sizes.clear(); this.activeId = null;
            // The query form belongs to the host, not to this result collection.
            if (this.controls) this.container.append(this.controls);
            this.manager.Dispose(); this.root.remove();
            this.onClose = this.onActiveChange = this.onError = this.controls = null;
        }
    };
}
