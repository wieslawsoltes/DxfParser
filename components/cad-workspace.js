/* Native-renderer workbench: actual RibbonWeb commands, Dockyard tools and the
 * existing virtualized analysis control. No remote resource paths are executed. */
(function (global) {
    'use strict';
    const el = (tag, className, text) => { const e = document.createElement(tag); if (className)
        e.className = className; if (text != null)
        e.textContent = text; return e; };
    const views = { Top: [0, 0, 1], Bottom: [0, 0, -1], Front: [0, -1, 0], Back: [0, 1, 0], Left: [-1, 0, 0], Right: [1, 0, 0], Isometric: [1, -1, 1] };
    class CadWorkspace {
        constructor(app, mode = 'parser') {
            this.app = app;
            this.mode = mode;
            this.overlay = app.renderingOverlayController || app.getOverlayController?.();
            this.manager = this.overlay?.surfaceManager || app.getSurfaceManager?.();
            if (!this.manager)
                throw new Error('Initialize the Skia renderer before the CAD workspace.');
            this.abort = new AbortController();
            this.history = [];
            this.historyIndex = 0;
            this.disposed = false;
            this.views = [];
            this.compare = global.DxfCompare ? new global.DxfCompare.CompareController(this) : null;
            this.console = el('section', 'dxf-cad-console');
            this.log = el('div', 'dxf-cad-log');
            this.log.setAttribute('role', 'log');
            this.log.setAttribute('aria-label', 'CAD command history');
            const form = el('form', 'dxf-cad-command-form'), label = el('label', '', 'Command:');
            this.input = el('input');
            this.input.id = mode + 'CadCommand';
            this.input.autocomplete = 'off';
            this.input.spellcheck = false;
            this.input.placeholder = 'HELP · ZOOM EXTENTS · VIEW TOP · LAYOUT …';
            label.htmlFor = this.input.id;
            const run = el('button', '', 'Run');
            run.type = 'submit';
            form.append(label, this.input, run);
            this.console.append(this.log, form);
            form.addEventListener('submit', e => { e.preventDefault(); const text = this.input.value; this.input.value = ''; this.execute(text); }, { signal: this.abort.signal });
            this.input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                this.historyIndex = Math.max(0, Math.min(this.history.length, this.historyIndex + (e.key === 'ArrowUp' ? -1 : 1)));
                this.input.value = this.history[this.historyIndex] || '';
            } if (e.key === 'Escape')
                this.input.value = ''; }, { signal: this.abort.signal });
            this.issuePanel = el('section', 'dxf-cad-tool');
            this.issueSummary = el('p', 'dxf-cad-note', 'Unsupported, missing-resource and malformed-geometry reports appear here.');
            this.issueRows = el('div', 'dxf-cad-records');
            this.graphicsControls = el('div', 'dxf-cad-graphics-controls');
            const graphicsLabel = el('label', '', 'Graphics backend');
            this.backendSelect = el('select');
            this.backendSelect.setAttribute('aria-label', 'Graphics backend');
            for (const [value, text] of [['auto', 'Automatic'], ['webgpu', 'WebGPU / Graphite'], ['webgl', 'WebGL / Ganesh'], ['canvas', 'Skia raster']]) {
                const option = el('option', '', text); option.value = value; this.backendSelect.append(option);
            }
            this.backendSelect.value = this.manager.host.backend;
            this.retryGraphics = el('button', '', 'Retry graphics'); this.retryGraphics.type = 'button';
            this.graphicsNote = el('p', 'dxf-cad-note'); this.graphicsNote.setAttribute('role', 'status');
            this.backendSelect.addEventListener('change', () => this.setBackend(this.backendSelect.value), { signal: this.abort.signal });
            this.retryGraphics.addEventListener('click', () => this.setBackend(this.backendSelect.value), { signal: this.abort.signal });
            graphicsLabel.append(this.backendSelect); this.graphicsControls.append(graphicsLabel, this.retryGraphics);
            this.issuePanel.append(this.graphicsControls, this.graphicsNote, this.issueSummary, this.issueRows);
            this.resourcePanel = el('section', 'dxf-cad-tool');
            this.fileInput = el('input');
            this.fileInput.type = 'file';
            this.fileInput.multiple = true;
            this.fileInput.hidden = true;
            this.fileInput.accept = '.ttf,.otf,.ttc,.shx,.png,.jpg,.jpeg,.webp,.bmp,.gif';
            const load = el('button', '', 'Register local fonts / images…');
            load.type = 'button';
            load.onclick = () => this.fileInput.click();
            this.resourceRows = el('div', 'dxf-cad-records');
            this.resourcePanel.append(el('p', 'dxf-cad-note', 'Resources are matched by filename. Drawing paths are never fetched automatically. Register only files you are authorized to use.'), load, this.fileInput, this.resourceRows);
            this.fileInput.addEventListener('change', async () => { for (const file of this.fileInput.files) {
                try {
                    await this.manager.registerResource(file.name, await file.arrayBuffer());
                    this.write(`Registered ${file.name}`);
                }
                catch (error) {
                    this.write(error.message, true);
                }
            } this.fileInput.value = ''; this.refreshResources(); }, { signal: this.abort.signal });
            const viewport = this.overlay?.viewportEl || app.getViewportElement?.();
            this.footer = el('div', 'dxf-cad-status');
            this.layouts = el('div', 'dxf-cad-layouts');
            this.layouts.setAttribute('role', 'tablist');
            this.layouts.setAttribute('aria-label', 'Model and paper layouts');
            this.coordinates = el('span', 'dxf-cad-coordinates', 'X 0.000  Y 0.000  Z 0.000');
            this.status = el('span', 'dxf-cad-backend', 'Skia · waiting for drawing');
            this.footer.append(this.layouts, this.coordinates, this.status);
            viewport?.append(this.footer);
            viewport?.classList.add('dxf-cad-viewport');
            viewport?.addEventListener('pointermove', e => { const rect = viewport.getBoundingClientRect(), p = this.manager.lastFrame?.screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }); if (p)
                this.coordinates.textContent = `X ${p.x.toFixed(3)}  Y ${p.y.toFixed(3)}  Z ${p.z.toFixed(3)}`; }, { signal: this.abort.signal });
            const paint = this.manager.onPaint;
            this.manager.onPaint = stats => { paint?.(stats); this.refresh(stats); };
            const error = this.manager.onError;
            this.manager.onError = e => { error?.(e); this.status.textContent = 'Skia error: ' + e.message; this.graphicsNote.textContent = e.message + ' — choose a backend or Retry graphics.'; this.write(e.message, true); };
            this.previousPaint = paint;
            this.previousError = error;
            this.write('Native Skia drawing. Type HELP for available view commands.');
        }
        panels() { return [...(this.compare ? [{ id: 'render-compare', title: 'Drawing Compare', node: this.compare.panel, side: 'Right', width: 520 }] : []), { id: 'render-console', title: 'CAD Command Line', node: this.console, side: 'Bottom', height: 135 }, { id: 'render-diagnostics', title: 'Rendering Diagnostics', node: this.issuePanel, side: 'Right', width: 420 }, { id: 'render-resources', title: 'Drawing Resources', node: this.resourcePanel, side: 'Right', width: 380 }]; }
        attach(workspace) { this.workspace = workspace; workspace.abort.signal.addEventListener('abort', () => this.dispose(), { once: true }); workspace.unsubscribers.push(workspace.manager.ThemeChanged.add(() => { const theme = String(workspace.manager.Theme?.Name || workspace.manager.Theme || 'light'); for (const view of this.views)
            view.setTheme(theme); })); }
        write(message, error = false) { if (this.disposed)
            return; const line = el('div', error ? 'dxf-cad-error' : '', message); this.log.append(line); while (this.log.children.length > 150)
            this.log.firstChild.remove(); this.log.scrollTop = this.log.scrollHeight; }
        async setBackend(backend) {
            if (this.graphicsChanging) return;
            this.graphicsChanging = true; this.retryGraphics.disabled = true; this.backendSelect.disabled = true;
            try {
                this.manager.host.retryBackend(backend);
                await this.manager.ready;
                this.refresh(); this.write('Graphics backend: ' + (this.manager.activeSurface?.Backend || backend));
            } catch (error) { this.write(error.message, true); }
            finally { this.graphicsChanging = false; this.retryGraphics.disabled = false; this.backendSelect.disabled = false; }
        }
        active() { return !!this.manager.sceneGraph; }
        layout(name) { const frame = this.manager.setLayout(name); this.overlay?.applyViewState({ mode: 'auto' }); this.refresh(); return frame; }
        view(name) { const entry = Object.entries(views).find(([key]) => key.toUpperCase() === String(name).toUpperCase()); if (!entry)
            throw new Error('View must be Top, Bottom, Front, Back, Left, Right or Isometric.'); this.manager.setViewDirection(global.DxfSkia.geometry.vec(...entry[1])); this.overlay?.applyViewState({ mode: 'auto' }); this.refresh(); }
        async execute(text) {
            text = String(text || '').trim();
            if (!text)
                return;
            this.history.push(text);
            if (this.history.length > 100)
                this.history.shift();
            this.historyIndex = this.history.length;
            this.write('> ' + text);
            try {
                if (text.length > 2048)
                    throw new RangeError('Command length limit exceeded.');
                const args = (text.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(v => v.replace(/^["']|["']$/g, '')), command = args.shift().toUpperCase(), m = this.manager;
                if (command === 'HELP') {
                    this.write('ZOOM EXTENTS | ZOOM factor | PAN dx dy | VIEW name | MODEL | LAYOUT name | GRID ON/OFF | OSNAP ON/OFF | LAYER ON/OFF name | SELECT handle | ISOLATE handle | UNISOLATE | REGEN | RENDERER auto/webgpu/webgl/canvas | PNG | PDF | COMPARE [drawing name] | COMPARENEXT | COMPAREPREV | COMPARETOGGLE | COMPAREIMPORT | COMPAREEXPORT | COMPAREGROUP grouped/local/combined | COMPARESHAPE rectangular/polygonal | COMPARERCMARGIN units | COMPARESHOWRC ON/OFF | COMPARECLOSE. These are view commands; tree editing remains in Home.');
                    return;
                }
                if (this.compare && await this.compare.command(command, args)) return;
                if (command === 'RENDERER') { await this.setBackend((args[0] || this.manager.host.backend).toLowerCase()); return; }
                if (!this.active())
                    throw new Error('Open a DXF drawing and choose Render DXF first.');
                if (command === 'ZOOM' || command === 'Z') {
                    if (!args.length || /^(E|EXTENTS)$/i.test(args[0]))
                        this.overlay?.applyViewState({ mode: 'auto' });
                    else {
                        const n = Number(args[0]);
                        if (!(n > 0 && n <= 100))
                            throw new Error('Zoom factor must be positive and at most 100.');
                        this.overlay?.zoomView(n);
                    }
                }
                else if (command === 'PAN') {
                    const [x, y] = args.map(Number);
                    if (!Number.isFinite(x) || !Number.isFinite(y))
                        throw new Error('PAN expects two finite screen-pixel offsets.');
                    this.overlay?.panView(x, y);
                }
                else if (command === 'VIEW')
                    this.view(args.join(' '));
                else if (command === 'MODEL')
                    this.layout('Model');
                else if (command === 'LAYOUT')
                    this.layout(args.join(' '));
                else if (command === 'GRID' || command === 'OSNAP') {
                    if (!['ON', 'OFF'].includes(args[0]?.toUpperCase()))
                        throw new Error(command + ' expects ON or OFF.');
                    m[command === 'GRID' ? 'gridVisible' : 'snapEnabled'] = args[0].toUpperCase() === 'ON';
                    this.repaint();
                }
                else if (command === 'LAYER') {
                    const [on, ...name] = args;
                    if (!['ON', 'OFF'].includes(on?.toUpperCase()))
                        throw new Error('LAYER expects ON/OFF followed by a layer name.');
                    const requested = name.join(' '), layer = Object.keys(m.sceneGraph.tables.layers).find(n => n.toUpperCase() === requested.toUpperCase());
                    if (!layer)
                        throw new Error('Unknown layer.');
                    this.overlay.setLayerOverride(layer, 'isOn', on.toUpperCase() === 'ON');
                }
                else if (command === 'SELECT' || command === 'ISOLATE') {
                    const handle = args[0]?.toUpperCase();
                    if (!m.sceneGraph.document.byHandle.has(handle))
                        throw new Error('Unknown handle.');
                    this.overlay?.commitSelection([handle]);
                    if (command === 'ISOLATE') {
                        m.setEntityIsolation(new Set([handle]));
                        this.repaint();
                    }
                }
                else if (command === 'UNISOLATE') {
                    m.setEntityIsolation(null);
                    m.setBlockIsolation(null);
                    this.repaint();
                }
                else if (command === 'REGEN') {
                    m.compileRevision++;
                    this.repaint();
                }
                else if (command === 'PNG' || command === 'PDF')
                    await this.export(command.toLowerCase());
                else
                    throw new Error('Unknown command. Type HELP.');
                await m.ready;
                this.refresh();
            }
            catch (error) {
                this.write(error.message, true);
                this.workspace?.notify(error.message, true);
            }
        }
        repaint() { if (this.manager.sceneGraph) {
            this.manager.renderScene(this.manager.sceneGraph);
            this.manager.resume();
        } }
        async export(kind) { try {
            const bytes = kind === 'pdf' ? await this.manager.exportPdf() : await this.manager.exportPng(), blob = new Blob([bytes], { type: kind === 'pdf' ? 'application/pdf' : 'image/png' }), url = URL.createObjectURL(blob), a = el('a');
            a.href = url;
            a.download = (this.manager.sceneGraph?.document.fileName || 'drawing').replace(/\.dxf$/i, '') + '.' + kind;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            this.write('Exported ' + a.download);
        }
        catch (error) {
            this.write(error.message, true);
            throw error;
        } }
        createView(host, title, columns, rows) { if (!global.DxfAnalysis)
            return null; const view = new global.DxfAnalysis.AnalysisView(host, { title, columns, rows }); this.views.push(view); return view; }
        refresh(stats) {
            if (this.disposed)
                return;
            this.compare?.refresh();
            const m = this.manager, document = m.sceneGraph?.document;
            const layoutKey = document ? JSON.stringify([document.tabId, [...document.layouts.values()].map(x => x.name), m.layout]) : '';
            if (this.layoutKey !== layoutKey) {
                this.layoutKey = layoutKey;
                this.layouts.replaceChildren();
                for (const layout of document?.layouts.values() || []) {
                    const b = el('button', '', layout.name);
                    b.type = 'button';
                    b.setAttribute('role', 'tab');
                    b.setAttribute('aria-selected', String(layout.name.toUpperCase() === m.layout.toUpperCase()));
                    b.addEventListener('click', () => { try {
                        this.layout(layout.name);
                    }
                    catch (e) {
                        this.write(e.message, true);
                    } }, { signal: this.abort.signal });
                    this.layouts.append(b);
                }
            }
            const s = stats || m.stats;
            this.backendSelect.value = m.host.backend;
            this.graphicsNote.textContent = m.host.error ? m.host.error.message :
                (s?.fallbackReasons?.length ? 'Recovered: ' + s.fallbackReasons.join(' | ') : 'Native backend: ' + (s?.backend || m.host.backend));
            this.status.textContent = s ? `Skia ${s.backend} · ${(s.drawn || 0).toLocaleString()} visible · ${m.diagnostics.length} notices` : 'Skia · preparing';
            const stamp = JSON.stringify([document?.tabId, m.diagnostics]);
            if (stamp !== this.issueStamp) {
                this.issueStamp = stamp;
                const tabId = this.overlay?.currentTabId, rows = m.diagnostics.map((issue, i) => ({ key: `${i}:${issue.code}`, values: [issue.severity, issue.type || '', issue.handle || '', issue.message], actions: issue.handle && /^[0-9a-f]+$/i.test(issue.handle) ? [{ label: 'Show source', run: () => { const r = this.app.documentWorkspace?.findByTab(tabId); if (this.mode === 'parser' && !r)
                                throw new Error('Source drawing is closed.'); if (r)
                                this.app.documentWorkspace.activate(r); this.app.handleLinkToHandle?.(issue.handle); } }] : [] }));
                this.issueSummary.textContent = `${rows.length} notices for ${document?.fileName || 'drawing'}. Missing or unsupported content is reported rather than silently replaced.`;
                if (!this.issueView)
                    this.issueView = this.createView(this.issueRows, 'Rendering Diagnostics', ['Severity', 'Entity', 'Handle', 'Message'], rows);
                else
                    this.issueView.setRows(rows);
            }
            this.app.ribbonWorkspace?.schedule();
        }
        refreshResources() { const rows = [...(this.manager.resources?.entries.values() || [])].map(e => ({ key: e.key, values: [e.name, e.kind, e.size, e.native?.Width ? `${e.native.Width} × ${e.native.Height}` : e.shape?.name || 'Registered'], actions: [{ label: 'Unload', run: () => { this.manager.resources.remove(e.name); this.manager.compileRevision++; this.repaint(); this.refreshResources(); } }] })); if (!this.resourceView)
            this.resourceView = this.createView(this.resourceRows, 'Registered Resources', ['Name', 'Type', 'Bytes', 'Details'], rows);
        else
            this.resourceView.setRows(rows); }
        ribbonGroups(ribbon) {
            const cmd = (...a) => ribbon.command(...a), group = (id, header, items) => ({ id, header, items }), enabled = () => this.active();
            return [
                ...(this.compare ? [group('skia-compare', 'Drawing Compare', [
                    cmd('skia-compare-open', 'Compare drawings', () => this.compare.open(), { icon: 'layers', size: 'large', enabled }),
                    cmd('skia-compare-prev', 'Previous change', () => this.compare.run(() => this.compare.navigate(-1)), { enabled: () => !!this.manager.comparison }),
                    cmd('skia-compare-next', 'Next change', () => this.compare.run(() => this.compare.navigate(1)), { enabled: () => !!this.manager.comparison }),
                    cmd('skia-compare-toggle', 'Toggle comparison', () => this.compare.run(() => this.compare.toggle()), { enabled: () => !!this.manager.comparison }),
                    cmd('skia-compare-end', 'End comparison', () => this.compare.end(), { enabled: () => !!this.manager.comparison })
                ])] : []),
                group('skia-workspace', 'Native CAD', [
                    cmd('skia-cad-preset', 'CAD workspace', () => { if (this.mode === 'parser')
                        this.workspace.applyPreset('CAD');
                    else
                        this.workspace.show('viewport'); }, { icon: 'shapes', size: 'large' }),
                    cmd('skia-layout', 'Model / Layout', value => this.layout(value), { type: 'dropdown', items: [], enabled }),
                    cmd('skia-view', 'View', value => this.view(value), { type: 'dropdown', value: 'Top', items: Object.keys(views).map(value => ({ value, label: value })), enabled }),
                    cmd('skia-grid', 'Grid', () => { this.manager.gridVisible = !this.manager.gridVisible; this.repaint(); }, { type: 'toggle', enabled }),
                    cmd('skia-snap', 'Object snaps', () => { this.manager.snapEnabled = this.manager.snapEnabled === false; this.repaint(); }, { type: 'toggle', enabled })
                ]),
                group('skia-tools', 'Rendering Tools', [
                    cmd('skia-backend', 'Graphics backend', value => this.setBackend(value), { type: 'dropdown', value: this.manager.host.backend, items: [{value:'auto',label:'Automatic'},{value:'webgpu',label:'WebGPU / Graphite'},{value:'webgl',label:'WebGL / Ganesh'},{value:'canvas',label:'Skia raster'}] }),
                    cmd('skia-retry', 'Retry graphics', () => this.setBackend(this.manager.host.backend), { icon: 'refresh' }),
                    cmd('skia-command', 'Command line', () => { this.workspace.show('render-console'); this.input.focus(); }, { icon: 'code' }),
                    cmd('skia-diagnostics', 'Rendering diagnostics', () => this.workspace.show('render-diagnostics'), { icon: 'check' }),
                    cmd('skia-resources', 'Fonts / images', () => { this.workspace.show('render-resources'); this.refreshResources(); }, { icon: 'font' }),
                    cmd('skia-png', 'Export PNG', () => this.export('png'), { icon: 'save', enabled }), cmd('skia-pdf', 'Export PDF', () => this.export('pdf'), { icon: 'save', enabled })
                ])
            ];
        }
        updateRibbon(r) { const m = this.manager; r.update('skia-backend', {value:m.host.backend}); r.update('skia-layout', { items: [...(m.sceneGraph?.document.layouts.values() || [])].map(l => ({ value: l.name, label: l.name })), value: m.layout }); r.update('skia-grid', { checked: !!m.gridVisible }); r.update('skia-snap', { checked: m.snapEnabled !== false }); }
        dispose() { if (this.disposed)
            return; this.disposed = true; this.compare?.dispose(); this.abort.abort(); for (const v of this.views)
            v.dispose(); this.views = []; this.footer.remove(); this.manager.onPaint = this.previousPaint; this.manager.onError = this.previousError; this.manager.dispose(); }
    }
    global.DxfCad = { CadWorkspace, create(app, mode) { return app.cadWorkspace = new CadWorkspace(app, mode); } };
})(window);
