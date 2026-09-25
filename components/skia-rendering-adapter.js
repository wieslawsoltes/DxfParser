/* Thin application boundary. DxfRendering remains a UI service name only; every
 * document, curve, paint operation and native surface is implemented by DxfSkia. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, G = A.geometry, N = root.DxfRendering = root.DxfRendering || {};
    const scriptUrl = typeof document !== 'undefined' ? document.currentScript?.src : null;
    const runtimeUrl = scriptUrl ? new URL('../vendor/skiasharpweb/dist/package/browser.js', scriptUrl).href : null;
    let runtime;
    const initializeSkia = () => runtime ||= (runtimeUrl ? import(runtimeUrl).then(m => m.Initialize({ fonts: false })) : Promise.reject(new Error('Provide Skia initialization outside the browser.'))).catch(e => { runtime = null; throw e; });
    class RenderingDataController {
        constructor(options = {}) { this.options = options; this.documents = new Map(); this.listeners = new Set(); }
        ingestDocument({ tabId, fileName, sourceText, sourceBytes } = {}) {
            if (!tabId)
                return null;
            try {
                const document = new A.DxfDocument(sourceBytes ?? sourceText, this.options);
                Object.assign(document, { tabId, fileName, createdAt: Date.now(), sourceLength: sourceBytes?.byteLength ?? sourceText?.length ?? 0, comparisonSourceText: typeof sourceText === "string" && sourceBytes == null ? sourceText : null });
                // A binary string with embedded newlines can render but cannot round-trip through the line-based editor.
                if (sourceBytes != null) { try { document.comparisonSourceText = A.dxfText(sourceBytes, this.options); } catch { /* Rendering remains usable; source transactions require representable text. */ } }
                this.documents.set(tabId, document);
                for (const listener of this.listeners) { try { listener({ type: 'ingest', document }); } catch (error) { console.warn('DXF document observer:', error); } }
                return document;
            }
            catch (error) {
                this.registerPlaceholder(tabId, { fileName, reason: 'buildError', message: error.message });
                return null;
            }
        }
        subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
        registerPlaceholder(id, details = {}) { this.documents.set(id, { status: 'placeholder', ...details }); }
        getDocument(id) { return this.documents.get(id) || null; }
        getSceneGraph(id) { return this.getDocument(id)?.sceneGraph || null; }
        hasDocument(id) { return this.documents.has(id); }
        releaseDocument(id) { this.documents.delete(id); }
    }
    class RenderingDocumentBuilder {
        constructor({ tags } = {}) { this.tags = tags; }
        build() { return new A.DxfDocument(this.tags); }
    }
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    class RenderingSurfaceManager {
        constructor(options = {}) {
            this.options = { background: '#212830', lineweights: true, ...options };
            this.width = 800;
            this.height = 600;
            this.devicePixelRatio = 1;
            this.sceneGraph = null;
            this.compiled = null;
            this.layout = 'Model';
            this.viewDirection = G.vec(0, 0, 1);
            this.viewState = { mode: 'auto' };
            this.selectionHandles = new Set();
            this.blockHighlights = new Set();
            this.compileRevision = 0;
            this.builtRevision = -1;
            this.lastFrame = null;
            this.visualStyle = '2dwireframe';
            this.gridVisible = false;
            this.suspended = false;
            this.error = null;
            this.diagnostics = [];
            this.host = new A.SurfaceHost({ initialize: options.initialize || initializeSkia, Skia: options.Skia, backend: options.backend || 'auto', onCanvasReplaced: (canvas) => { this.canvas = canvas; this.onCanvasReplaced?.(canvas); }, onPaint: stats => {
                    this.error = null;
                    this.stats = stats;
                    this.diagnostics = stats.diagnostics;
                    this.onPaint?.(stats);
                    this.canvas?.dispatchEvent(new CustomEvent('dxf-skia-painted', { detail: stats }));
                }, onError: error => { this.error = error; this.onError?.(error); this.canvas?.dispatchEvent(new CustomEvent('dxf-skia-error', { detail: error })); } });
        }
        static getVisualStylePresets() { return [{ key: '2dwireframe', id: '2dwireframe', name: '2D Wireframe', label: '2D Wireframe', category: 'wireframe' }, { key: 'shaded', id: 'shaded', name: 'Filled faces', label: 'Filled faces', category: 'shaded' }]; }
        initialize(canvas) { this.canvas = canvas; this.host.initialize(canvas); const rect = canvas.getBoundingClientRect(); this.width = Math.max(1, rect.width || canvas.width || 800); this.height = Math.max(1, rect.height || canvas.height || 600); return this; }
        setCanvasReplacementCallback(callback) { this.onCanvasReplaced = callback; }
        get activeSurface() { return this.host.surface; }
        get resources() { return this.host.resources; }
        get ready() { return this.host.whenIdle(); }
        change(name, value) { if (!same(this.options[name], value)) {
            this.options[name] = value;
            this.compileRevision++;
        } }
        setLayerState(value) { this.change('layerState', value instanceof Map ? Object.fromEntries(value) : value); }
        setBlockIsolation(value) { const next = new Set(Array.from(value || [], A.key)); if ([...next].join('|') !== [...(this.options.blockIsolation || [])].join('|')) {
            this.options.blockIsolation = next;
            this.compileRevision++;
        } }
        setEntityIsolation(value) { const next = new Set(value || []); if ([...next].join('|') !== [...(this.options.entityIsolation || [])].join('|')) {
            this.options.entityIsolation = next;
            this.compileRevision++;
        } }
        setBlockHighlights(value) { this.blockHighlights = new Set(Array.from(value || [], A.key)); }
        setSelectionHandles(value) { this.selectionHandles = new Set(value || []); }
        setAttributeDisplay(value) { for (const key of ['showDefinitions', 'showReferences', 'showInvisible'])
            if (key in value)
                this.change(key, !!value[key]); }
        setVisualStyle(value) { this.visualStyle = typeof value === 'object' ? value.name || value.key : value || '2dwireframe'; if (!['2dwireframe', 'shaded'].includes(this.visualStyle))
            this.visualStyle = '2dwireframe'; }
        getVisualStyleOverride() { return { value: this.visualStyle }; }
        setLayout(layout) { if (!this.sceneGraph?.document)
            throw new Error('Load a drawing first.'); this.sceneGraph.document.getEntities(layout); this.layout = layout; this.compileRevision++; this.viewState = { mode: 'auto' }; return this.renderScene(this.sceneGraph); }
        setViewDirection(direction) { this.viewDirection = G.normal(direction); this.viewState = { mode: 'auto' }; return this.sceneGraph ? this.renderScene(this.sceneGraph) : null; }
        setComparison(session) { this.comparison = session; this.comparisonTarget = this.sceneGraph?.document.tabId ?? this.sceneGraph?.document; this.comparisonError = null; }
        renderScene(sceneGraph, options = {}) {
            if (!sceneGraph?.document)
                throw new TypeError('Only DxfSkia scene graphs are accepted.');
            if (this.comparison && this.comparisonTarget !== (sceneGraph.document.tabId ?? sceneGraph.document)) this.setComparison(null);
            if (this.sceneGraph !== sceneGraph) {
                this.sceneGraph = sceneGraph;
                this.layout = 'Model';
                this.compileRevision++;
                this.viewState = { mode: 'auto' };
            }
            if (options.viewState)
                this.viewState = options.viewState;
            if (!this.compiled || this.builtRevision !== this.compileRevision) {
                this.compiled = new A.SceneCompiler(sceneGraph.document, { ...this.options, textMeasurer: this.resources ? (p, t) => this.resources.measureText(p, t) : undefined }).compile(this.layout);
                this.builtRevision = this.compileRevision;
            }
            let displayScene = this.compiled;
            if (this.comparison?.enabled) {
                try { displayScene = this.comparison.scene(this.compiled); this.comparisonError = null; }
                catch (error) { this.comparisonError = error; this.comparison.enabled = false; }
            }
            const frame = A.prepareFrame(displayScene, { width: this.width, height: this.height, devicePixelRatio: this.devicePixelRatio, viewState: this.viewState, viewDirection: this.viewDirection, visualStyle: this.visualStyle, background: this.options.background });
            this.lastFrame = frame;
            this.diagnostics = displayScene.diagnostics;
            this.host.request(frame, { selection: this.selectionHandles, blockHighlights: this.blockHighlights, grid: this.gridVisible });
            return frame;
        }
        resize(width, height, dpr = 1) { if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(dpr))
            throw new RangeError('Finite viewport dimensions required.'); this.width = Math.max(1, width); this.height = Math.max(1, height); this.devicePixelRatio = G.clamp(dpr, 1, 3); if (this.sceneGraph)
            this.renderScene(this.sceneGraph); }
        resume() { this.suspended = false; this.host.resume(); }
        suspend() { this.suspended = true; this.host.suspend(); }
        clear() { this.setComparison(null); this.host.suspend(); this.sceneGraph = null; this.compiled = null; this.lastFrame = null; this.host.lastFrame = null; this.host.pending = null; this.host.painter?.clearCache(); }
        renderMessage(message) { this.message = String(message); this.onError?.(new Error(message)); }
        async registerResource(...args) { await this.host.ensureRuntime(); const result = this.resources.register(...args); this.compileRevision++; if (this.sceneGraph)
            this.renderScene(this.sceneGraph); await this.ready; return result; }
        async exportPng() { return this.host.exportPng(); }
        async exportPdf(options) { return this.host.exportPdf(options); }
        async dispose() { this.clear(); await this.host.dispose(); }
        destroy() { return this.dispose(); }
    }
    Object.assign(N, { RenderingDataController, RenderingDocumentBuilder, RenderingSurfaceManager, initializeSkia });
    if (typeof module === 'object' && module.exports)
        module.exports = N;
})(globalThis);
