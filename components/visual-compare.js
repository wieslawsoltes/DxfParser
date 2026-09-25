/* Dockyard/AnalysisView comparison workbench. Native drawing and export stay in
 * the existing Skia surface; no parallel Canvas2D preview is introduced. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, C = root.DxfCompare, G = A.geometry;
    const asset = typeof document !== 'undefined' && document.currentScript?.src;
    const element = (tag, text, className) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (className) e.className = className; return e; };
    class CompareController {
        constructor(cad) {
            this.cad = cad; this.manager = cad.manager; this.overlay = cad.overlay; this.app = cad.app;
            this.abort = new AbortController(); this.settings = { ...C.defaults }; this.loadGeneration = 0;
            this.undoStack = []; this.redoStack = []; this.controls = new Map(); this.selectedIndex = -1;
            this.panel = element('section', null, 'dxf-compare-panel'); this.panel.setAttribute('aria-label', 'Drawing comparison');
            if (!document.querySelector('link[data-dxf-compare]') && asset) { const css = element('link'); css.rel = 'stylesheet'; css.href = new URL('../components/visual-compare.css', asset).href; css.dataset.dxfCompare = ''; document.head.append(css); }
            const heading = element('div', null, 'dxf-compare-heading'); heading.append(element('strong', 'Drawing Compare'), element('span', 'Native Skia · object changes'));
            const source = element('div', null, 'dxf-compare-tools'); this.sources = element('select'); this.sources.setAttribute('aria-label', 'Reference drawing');
            source.append(this.sources); this.button(source, 'Compare tab', () => this.startTab()); this.button(source, 'Open reference DXF…', () => this.file.click());
            this.file = element('input'); this.file.type = 'file'; this.file.accept = '.dxf'; this.file.hidden = true;
            this.file.addEventListener('change', () => this.run(async () => { const file = this.file.files[0]; this.file.value = ''; if (file) await this.loadFile(file); }), { signal: this.abort.signal });
            this.snapshotFile = element('input'); this.snapshotFile.type = 'file'; this.snapshotFile.accept = '.json'; this.snapshotFile.hidden = true;
            this.snapshotFile.addEventListener('change', () => this.run(async () => { const file = this.snapshotFile.files[0]; this.snapshotFile.value = ''; if (file) { if (file.size > 128 * 1024 * 1024) throw new RangeError('Snapshot is too large.'); this.restoreSnapshot(await file.text()); } }), { signal: this.abort.signal });
            this.summary = element('p', 'Choose a reference drawing to compare with the active rendered DXF.', 'dxf-compare-summary'); this.summary.setAttribute('role', 'status'); this.summary.setAttribute('aria-live', 'polite');
            this.message = element('p', '', 'dxf-compare-message'); this.message.setAttribute('role', 'alert');
            const nav = element('div', null, 'dxf-compare-tools');
            this.button(nav, 'Previous', () => this.navigate(-1)); this.button(nav, 'Next', () => this.navigate(1)); this.button(nav, 'Fit changes', () => this.focus(this.require().result.bounds));
            this.toggleButton = this.button(nav, 'Hide comparison', () => this.toggle()); this.button(nav, 'Refresh', () => this.refreshComparison()); this.button(nav, 'End', () => this.end());
            const details = element('details', null, 'dxf-compare-settings'); details.append(element('summary', 'Comparison settings'));
            for (const [name, label] of [['showCurrent', 'Current only'], ['showReference', 'Reference only'], ['showCommon', 'Unchanged'], ['clouds', 'Revision clouds'], ['text', 'Compare text'], ['hatch', 'Compare hatches'], ['currentFirst', 'Reference in front']]) this.field(details, name, label, 'checkbox');
            for (const [name, label] of [['currentColor', 'Current color'], ['referenceColor', 'Reference color'], ['commonColor', 'Unchanged color'], ['cloudColor', 'Cloud color']]) this.field(details, name, label, 'color');
            this.field(details, 'precision', 'Decimal precision (0–14)', 'number', 0, 14, 1);
            this.field(details, 'margin', 'Cloud margin · drawing units', 'number', 0, 1e12, .1);
            this.field(details, 'commonOpacity', 'Unchanged opacity', 'range', 0, 1, .05);
            const mode = element('label', 'Cloud grouping'); this.cloudMode = element('select'); this.cloudMode.setAttribute('aria-label', 'Cloud grouping');
            for (const [value, label] of [['local', 'One cloud per change'], ['combined', 'One combined cloud']]) { const option = element('option', label); option.value = value; this.cloudMode.append(option); }
            this.cloudMode.addEventListener('change', () => this.run(() => this.configure({ cloudMode: this.cloudMode.value })), { signal: this.abort.signal }); mode.append(this.cloudMode); details.append(mode);
            const properties = element('fieldset'); properties.append(element('legend', 'Property changes · COMPAREPROPS'));
            for (const [name, bit] of Object.entries(C.propBits)) {
                const label = element('label', name.replace(/([A-Z])/g, ' $1')), input = element('input'); input.type = 'checkbox'; input.checked = true; input.dataset.compareProperty = name;
                input.addEventListener('change', () => this.run(() => this.configure({ properties: input.checked ? this.settings.properties | bit : this.settings.properties & ~bit })), { signal: this.abort.signal }); label.prepend(input); properties.append(label);
            }
            details.append(properties);
            const actions = element('div', null, 'dxf-compare-tools');
            this.importButton = this.button(actions, 'Import selected change', () => this.importSelected()); this.button(actions, 'Import all reference-only', () => this.importReference(this.require().result.referenceOnly.map(g => g.id)));
            this.button(actions, 'Undo import', () => this.undo()); this.button(actions, 'Redo import', () => this.redo());
            const exports = element('div', null, 'dxf-compare-tools');
            this.button(exports, 'Save snapshot', () => this.saveSnapshot()); this.button(exports, 'Open snapshot…', () => this.snapshotFile.click());
            this.button(exports, 'JSON report', () => this.download('compare-report.json', JSON.stringify(C.report(this.require().result), null, 2), 'application/json'));
            this.button(exports, 'PNG', () => this.cad.export('png')); this.button(exports, 'PDF', () => this.cad.export('pdf'));
            this.rowsHost = element('div', null, 'dxf-compare-records');
            const note = element('p', 'Comparison covers compiled visible objects in the selected layout, including nested blocks. Source handles are not identity. Unsupported geometry, fonts and external content can limit coverage. Imports add complete eligible model-space objects; unsafe dependencies are rejected.', 'dxf-cad-note');
            this.panel.append(heading, source, this.file, this.snapshotFile, this.summary, this.message, nav, details, actions, exports, this.rowsHost, note);
            this.panel.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); }, { signal: this.abort.signal });
            this.panel.addEventListener('drop', e => { if (e.dataTransfer?.files.length) { e.preventDefault(); this.run(() => this.loadFile(e.dataTransfer.files[0])); } }, { signal: this.abort.signal });
            const data = this.overlay?.dataController;
            this.unsubscribe = data?.subscribe?.(event => {
                if (!this.manager.comparison || event.type !== 'ingest') return;
                if (event.document.tabId === this.referenceTabId) {
                    this.referenceText = event.document.comparisonSourceText; this.manager.comparison.setReference(event.document); this.repaint();
                }
            });
        }
        button(host, label, action) { const b = element('button', label); b.type = 'button'; b.addEventListener('click', () => this.run(action), { signal: this.abort.signal }); host.append(b); return b; }
        async run(action) { try { this.message.textContent = ''; return await action(); } catch (error) { this.message.textContent = error.message; this.cad.write(error.message, true); return null; } }
        field(host, name, label, type, min, max, step) {
            const l = element('label', label), input = element('input'); input.type = type; input.setAttribute('aria-label', label); input.dataset.compare = name;
            if (type === 'checkbox') input.checked = this.settings[name]; else input.value = this.settings[name];
            if (min != null) { input.min = min; input.max = max; input.step = step; }
            input.addEventListener('change', () => this.run(() => this.configure({ [name]: type === 'checkbox' ? input.checked : type === 'color' ? input.value : Number(input.value) })), { signal: this.abort.signal });
            type === 'checkbox' ? l.prepend(input) : l.append(input); host.append(l); this.controls.set(name, input);
        }
        tabs() { return [...(this.app.tabs || []), ...(this.app.tabsRight || [])]; }
        currentTab() { return this.tabs().find(t => t.id === this.manager.sceneGraph?.document.tabId); }
        sourceFor(tab) { return tab.originalTreeData && this.app.dxfParser ? this.app.dxfParser.serializeTree(tab.originalTreeData) : tab.renderingSourceText; }
        currentText() { const text = this.manager.sceneGraph?.document.comparisonSourceText; if (typeof text !== 'string') throw new Error('This drawing has no losslessly representable text source; source transactions and snapshots are unavailable.'); return text; }
        require() { const session = this.manager.comparison; if (!session?.result) throw new Error('Start a drawing comparison first.'); if (this.manager.comparisonError) throw this.manager.comparisonError; return session; }
        open() { this.cad.workspace?.show('render-compare'); this.refreshSources(); this.sources.focus(); }
        refreshSources() {
            const tabs = this.tabs().filter(t => t.id !== this.manager.sceneGraph?.document.tabId), stamp = JSON.stringify(tabs.map(t => [t.id, t.name]));
            if (stamp === this.sourceStamp) return; this.sourceStamp = stamp; const selected = this.sources.value; this.sources.replaceChildren();
            for (const tab of tabs) { const option = element('option', tab.name); option.value = String(tab.id); this.sources.append(option); }
            if (tabs.some(t => String(t.id) === selected)) this.sources.value = selected;
            if (!tabs.length) { const o = element('option', 'No other open drawings'); o.value = ''; this.sources.append(o); }
        }
        startTab() {
            const tab = this.tabs().find(t => String(t.id) === this.sources.value); if (!tab) throw new Error('Open another DXF tab or choose a local reference file.');
            this.start(this.sourceFor(tab), tab.name, this.settings, tab.id);
        }
        async loadFile(file) {
            if (!/\.dxf$/i.test(file.name)) throw new TypeError('Reference files must be DXF.');
            if (file.size > 128 * 1024 * 1024) throw new RangeError('Reference DXF exceeds 128 MiB.');
            const generation = ++this.loadGeneration, target = this.manager.sceneGraph?.document;
            const text = A.dxfText(await file.arrayBuffer());
            if (generation !== this.loadGeneration || target !== this.manager.sceneGraph?.document || this.abort.signal.aborted) return;
            this.start(text, file.name);
        }
        start(text, name = 'reference.dxf', settings = this.settings, tabId = null) {
            if (!this.manager.compiled) throw new Error('Render the current DXF before starting comparison.');
            const document = new A.DxfDocument(text), session = new C.Session(document, settings);
            document.fileName = name; session.scene(this.manager.compiled); // validate before replacing a working session
            this.referenceText = text; this.referenceName = name; this.referenceTabId = tabId; this.selectedIndex = -1; this.seenResult = null;
            this.settings = C.options(settings); this.syncControls(); this.manager.setComparison(session); this.repaint(); this.refresh(); return session;
        }
        configure(patch) { const settings = C.options({ ...this.settings, ...patch }); this.settings = settings; this.manager.comparison?.configure(patch); this.syncControls(); this.repaint(); this.refresh(); }
        syncControls() {
            for (const [name, control] of this.controls) control.type === 'checkbox' ? control.checked = this.settings[name] : control.value = this.settings[name];
            this.cloudMode.value = this.settings.cloudMode;
            for (const input of this.panel.querySelectorAll('[data-compare-property]')) input.checked = !!(this.settings.properties & C.propBits[input.dataset.compareProperty]);
        }
        toggle() { const s = this.require(); s.enabled = !s.enabled; this.repaint(); this.refresh(); }
        end() {
            this.loadGeneration++; this.manager.setComparison(null); this.referenceText = null; this.referenceName = null; this.referenceTabId = null; this.seenResult = null;
            this.selectedIndex = -1; this.view?.setRows([]); this.repaint(); this.refresh();
        }
        repaint() { this.cad.repaint(); }
        refreshComparison() {
            const session = this.require(), tab = this.currentTab(), referenceTab = this.tabs().find(t => t.id === this.referenceTabId);
            if (tab) {
                const text = this.sourceFor(tab);
                if (text !== this.currentText()) this.applySource(text, this.currentText(), false);
            }
            if (referenceTab) { this.referenceText = this.sourceFor(referenceTab); session.setReference(new A.DxfDocument(this.referenceText)); }
            this.manager.compileRevision++; session.revision++; this.repaint(); this.refresh();
        }
        refresh() {
            if (this.abort.signal.aborted) return;
            this.refreshSources(); const s = this.manager.comparison;
            if (!s) {
                this.summary.textContent = 'Comparison inactive. Choose a reference DXF or another open drawing.';
                if (this.seenResult) { this.view?.setRows([]); this.seenResult = null; }
                this.referenceText = null; this.referenceTabId = null; this.importButton.disabled = true; return;
            }
            this.toggleButton.textContent = s.enabled ? 'Hide comparison' : 'Show comparison';
            const r = s.result; if (!r) return;
            const count = r.counts;
            this.summary.textContent = `${count.currentOnly} current only · ${count.referenceOnly} reference only · ${count.common} unchanged · ${count.changes} change sets. Reference: ${this.referenceName || 'drawing'}${s.enabled ? '' : ' · hidden'}.`;
            const issueCount = this.manager.diagnostics?.filter(d => d.severity !== 'info').length || 0;
            if (this.manager.comparisonError) this.message.textContent = this.manager.comparisonError.message;
            else if (r.incomplete || issueCount) this.message.textContent = `Coverage warning: ${Math.max(r.notices.length, issueCount)} rendering notices. Equal visible geometry is not proof of equal DXF databases; inspect Rendering Diagnostics.`;
            if (this.seenResult !== r) {
                this.seenResult = r; this.selectedIndex = Math.min(this.selectedIndex, r.changes.length - 1);
                const rows = r.changes.map((c, i) => ({ key: c.id, changeIndex: i, values: [c.status, c.current?.type || c.reference?.type, c.current?.handle || '—', c.reference?.handle || '—', c.current?.layer || c.reference?.layer],
                    raw: JSON.stringify({ status: c.status, bounds: G.isEmpty(c.bounds) ? null : c.bounds }, null, 2) }));
                if (!this.view && root.DxfAnalysis) this.view = new root.DxfAnalysis.AnalysisView(this.rowsHost, { title: 'Drawing changes', columns: ['Status', 'Entity', 'Current handle', 'Reference handle', 'Layer'], rows, visualization: false,
                    onSelect: row => { const current = this.manager.comparison?.result, change = current?.changes[row.changeIndex]; this.selectedIndex = row.changeIndex; this.focus(change?.bounds); this.importButton.disabled = !change?.reference; } });
                else this.view?.setRows(rows);
            }
            this.importButton.disabled = !r.changes[this.selectedIndex]?.reference || this.manager.layout.toUpperCase() !== 'MODEL';
        }
        focus(bounds) {
            if (!bounds || G.isEmpty(bounds)) return;
            const frame = this.manager.lastFrame, points = [];
            for (const x of [bounds.minX, bounds.maxX]) for (const y of [bounds.minY, bounds.maxY]) for (const z of [bounds.minZ, bounds.maxZ]) points.push(G.project(G.vec(x, y, z), frame.basis));
            const b = G.bounds(points), center = G.center(b), size = Math.max(b.maxX - b.minX, b.maxY - b.minY, .01);
            const scale = Math.max(1e-9, Math.min(this.manager.width / Math.max(b.maxX - b.minX, size * .1), this.manager.height / Math.max(b.maxY - b.minY, size * .1)) * .7);
            this.overlay?.applyViewState({ mode: 'custom', center, scale, rotationRad: 0 });
        }
        navigate(delta) {
            const r = this.require().result; if (!r.changes.length) return;
            this.selectedIndex = (this.selectedIndex + delta + r.changes.length) % r.changes.length;
            const c = r.changes[this.selectedIndex]; this.view?.selectKey(c.id); this.focus(c.bounds); this.refresh();
        }
        importSelected() { const c = this.require().result.changes[this.selectedIndex]; if (!c?.reference) throw new Error('Select a change with a reference object.'); return this.importReference([c.reference.id]); }
        importReference(ids) {
            this.require(); if (this.manager.layout.toUpperCase() !== 'MODEL') throw new Error('Import is currently supported in model space only.');
            if (!this.currentTab()) throw new Error('Import into the parser workspace is supported; the standalone editor remains comparison-only.');
            const before = this.currentText(), tab = this.currentTab(), beforeTree = this.sourceFor(tab);
            const repeated = this.undoStack.some(item => item.tabId === tab.id && item.referenceText === this.referenceText && ids.some(id => item.referenceIds?.includes(id)));
            if (repeated) throw new Error('This reference object was already imported. Undo that import before importing it again.');
            // Never overwrite unrendered tree edits. Refresh updates the comparison first.
            if (this.app.dxfParser.serializeTree(this.app.dxfParser.parse(before)) !== beforeTree) throw new Error('The source tree changed. Refresh the comparison before importing.');
            const transaction = C.importObjects(before, this.referenceText, ids, { ...this.settings, compileOptions: this.manager.compiled.compileOptions });
            const item = { tabId: tab.id, before, after: transaction.text, referenceText: this.referenceText, referenceIds: [...ids] };
            const bytes = entry => 2 * (entry.before.length + entry.after.length + entry.referenceText.length);
            if (bytes(item) > 128 * 1024 * 1024) throw new RangeError('Import exceeds the 128 MiB undo-history budget; no changes were applied.');
            this.applySource(transaction.text, before);
            this.undoStack.push(item); this.redoStack = [];
            while (this.undoStack.length > 10 || this.undoStack.reduce((total, entry) => total + bytes(entry), 0) > 128 * 1024 * 1024) this.undoStack.shift();
            this.cad.write(`Imported ${transaction.imported} reference objects (${transaction.recordCount} records). Current objects were not deleted.`);
            return transaction;
        }
        applySource(text, expected, recordUndo = true) {
            const tab = this.currentTab(); if (!tab) throw new Error('Current source tab is closed.');
            if (this.currentText() !== expected) throw new Error('Drawing changed since this transaction. Refresh instead of overwriting newer edits.');
            const parsed = this.app.dxfParser.parse(text), document = new A.DxfDocument(text);
            Object.assign(document, { tabId: tab.id, fileName: tab.name, comparisonSourceText: text });
            // All fallible parsing/compilation occurs before the tree and renderer swap.
            new A.SceneCompiler(document, this.manager.compiled.compileOptions).compile(this.manager.layout);
            const previous = { originalTreeData: tab.originalTreeData, currentTreeData: tab.currentTreeData, renderingSourceText: tab.renderingSourceText, isModified: tab.isModified }, oldDoc = this.manager.sceneGraph.document;
            try {
                Object.assign(tab, { originalTreeData: parsed, currentTreeData: parsed, renderingSourceText: text, isModified: true });
                this.overlay.dataController.documents.set(tab.id, document); this.app.applyTabFilters(tab);
                this.overlay.renderSceneGraph(tab, document, this.overlay.currentPane);
            } catch (error) {
                Object.assign(tab, previous); this.overlay.dataController.documents.set(tab.id, oldDoc);
                this.app.applyTabFilters(tab); this.overlay.renderSceneGraph(tab, oldDoc, this.overlay.currentPane); throw error;
            }
            this.app.updateTabUI(); this.app.saveCurrentState(); this.refresh();
        }
        history(from, to, undo) {
            const item = from.at(-1), tab = this.currentTab(); if (!item || tab?.id !== item.tabId) throw new Error('No comparison import to ' + (undo ? 'undo' : 'redo') + ' in this drawing.');
            const expected = undo ? item.after : item.before;
            if (this.sourceFor(tab) !== this.app.dxfParser.serializeTree(this.app.dxfParser.parse(expected))) throw new Error('Source tree has intervening edits; import history will not overwrite them.');
            this.applySource(undo ? item.before : item.after, expected, false); from.pop(); to.push(item);
        }
        undo() { this.history(this.undoStack, this.redoStack, true); }
        redo() { this.history(this.redoStack, this.undoStack, false); }
        download(name, data, type) { const url = URL.createObjectURL(new Blob([data], { type })), link = element('a'); link.download = name; link.href = url; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        saveSnapshot() {
            this.require(); const text = C.snapshot(this.currentText(), this.referenceText, this.settings, { currentName: this.manager.sceneGraph.document.fileName, referenceName: this.referenceName, layout: this.manager.layout });
            this.download('drawing-compare.snapshot.json', text, 'application/json');
        }
        restoreSnapshot(text) {
            const value = C.readSnapshot(text); this.end();
            if (this.cad.mode === 'editor') this.app.loadDxfSource({ name: value.metadata?.currentName || 'snapshot.dxf', sourceText: value.currentText });
            else {
                this.app.handleCreateNewDxf(); const tab = this.app.getActiveTab();
                tab.name = value.metadata?.currentName || 'snapshot.dxf';
                this.overlay.open({ tab, pane: 'left' }); this.applySource(value.currentText, this.currentText(), false);
            }
            const layout = value.metadata?.layout || 'Model'; this.manager.setLayout(layout);
            this.start(value.referenceText, value.metadata?.referenceName || 'reference.dxf', value.options); this.open();
        }
        async command(command, args = []) {
            if (!/^COMPARE/.test(command)) return false;
            if (command === 'COMPARE') { this.open(); if (args.length) { const tab = this.tabs().find(t => t.name.toUpperCase() === args.join(' ').toUpperCase()); if (!tab) throw new Error('No open reference tab with that name.'); this.start(this.sourceFor(tab), tab.name, this.settings, tab.id); } }
            else if (command === 'COMPARECLOSE') this.end();
            else if (command === 'COMPARETOGGLE') this.toggle();
            else if (command === 'COMPARENEXT') this.navigate(1);
            else if (command === 'COMPAREPREV') this.navigate(-1);
            else if (command === 'COMPAREIMPORT') this.importSelected();
            else if (command === 'COMPAREUNDO') this.undo();
            else if (command === 'COMPAREREDO') this.redo();
            else if (command === 'COMPAREEXPORT') this.saveSnapshot();
            else if (command === 'COMPAREINFO') this.cad.write(JSON.stringify(C.report(this.require().result).counts));
            else if (command === 'COMPAREPROPS') this.configure({ properties: Number(args[0]) });
            else if (command === 'COMPARETOLERANCE') this.configure({ precision: Number(args[0]) });
            else throw new Error('Unknown comparison command. Use COMPARE, COMPARENEXT, COMPAREPREV, COMPARETOGGLE, COMPAREIMPORT, COMPAREEXPORT or COMPARECLOSE.');
            await this.manager.ready; return true;
        }
        dispose() { this.abort.abort(); this.loadGeneration++; this.unsubscribe?.(); this.manager.comparison = null; this.referenceText = null; this.view?.dispose(); this.undoStack = []; this.redoStack = []; }
    }
    C.CompareController = CompareController;
})(globalThis);
