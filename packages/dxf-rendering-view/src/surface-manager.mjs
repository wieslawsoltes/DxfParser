/** Retained viewport orchestration. The supplied renderer owns native surfaces and caches. */
export function createSurfaceManager(A, initialize, reportObserverError) {
    const G = A.geometry;
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const sameSet = (a, b) => a.size === b.size && [...a].every(value => b.has(value));

    return class RenderingSurfaceManager {
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
            this.disposed = false;
            this.error = null;
            this.diagnostics = [];
            this.frameListeners = new Set();
            this.paintListeners = new Set();
            this.errorListeners = new Set();
            this.host = new A.SurfaceHost({
                initialize: options.initialize || initialize, Skia: options.Skia,
                backend: options.backend || 'auto', allowFallback: options.allowFallback,
                maxPixels: options.maxPixels,
                onCanvasReplaced: canvas => {
                    if (this.disposed) return;
                    this.canvas = canvas;
                    this.notify(this.onCanvasReplaced, canvas);
                },
                onPaint: stats => {
                    if (this.disposed) return;
                    this.error = null;
                    this.stats = stats;
                    this.diagnostics = stats.diagnostics;
                    this.notify(this.onPaint, stats);
                    this.emit(this.paintListeners, stats);
                    this.dispatch('dxf-skia-painted', stats);
                },
                onError: error => {
                    if (this.disposed) return;
                    this.error = error;
                    this.notify(this.onError, error);
                    this.emit(this.errorListeners, error);
                    this.dispatch('dxf-skia-error', error);
                }
            });
        }

        assertAlive() {
            if (this.disposed) throw new Error('Rendering surface is disposed.');
        }

        notify(listener, value) {
            if (!listener) return;
            try { listener(value); } catch (error) { reportObserverError(error); }
        }

        dispatch(type, detail) {
            if (this.disposed) return;
            const canvas = this.canvas;
            // Events must belong to the canvas realm, not a captured process/window global.
            const Event = canvas?.ownerDocument?.defaultView?.CustomEvent;
            if (Event && typeof canvas.dispatchEvent === 'function') {
                try { canvas.dispatchEvent(new Event(type, { detail })); }
                catch (error) { reportObserverError(error); }
            }
        }

        subscribe(listeners, listener) {
            this.assertAlive();
            if (typeof listener !== 'function') throw new TypeError('An observer function is required.');
            // Separate tokens allow independent consumers to subscribe the same callback.
            const entry = { listener };
            listeners.add(entry);
            return () => listeners.delete(entry);
        }
        emit(listeners, value) {
            for (const entry of [...listeners]) {
                if (this.disposed) break;
                if (listeners.has(entry)) this.notify(entry.listener, value);
            }
        }
        subscribeFrame(listener) { return this.subscribe(this.frameListeners, listener); }
        subscribePaint(listener) { return this.subscribe(this.paintListeners, listener); }
        subscribeError(listener) { return this.subscribe(this.errorListeners, listener); }

        static getVisualStylePresets() {
            return [
                { key: '2dwireframe', id: '2dwireframe', name: '2D Wireframe', label: '2D Wireframe', category: 'wireframe' },
                { key: 'shaded', id: 'shaded', name: 'Filled faces', label: 'Filled faces', category: 'shaded' }
            ];
        }

        initialize(canvas) {
            this.assertAlive();
            if (!canvas || typeof canvas.getContext !== 'function' || typeof canvas.getBoundingClientRect !== 'function')
                throw new TypeError('An HTML canvas is required.');
            const rect = canvas.getBoundingClientRect();
            this.host.initialize(canvas);
            this.canvas = canvas;
            this.width = Math.max(1, rect.width || canvas.width || 800);
            this.height = Math.max(1, rect.height || canvas.height || 600);
            return this;
        }

        setCanvasReplacementCallback(callback) { this.assertAlive(); this.onCanvasReplaced = callback; }
        get activeSurface() { return this.host.surface; }
        get resources() { return this.host.resources; }
        get ready() { return this.host.whenIdle(); }

        change(name, value) {
            this.assertAlive();
            if (!same(this.options[name], value)) {
                this.options[name] = value;
                this.compileRevision++;
            }
        }

        setLayerState(value) { this.change('layerState', value instanceof Map ? Object.fromEntries(value) : value); }
        setIsolation(name, value) {
            this.assertAlive();
            const next = new Set(value || []);
            if (!sameSet(next, this.options[name] || new Set())) {
                this.options[name] = next;
                this.compileRevision++;
            }
        }
        setBlockIsolation(value) { this.setIsolation('blockIsolation', Array.from(value || [], A.key)); }
        setEntityIsolation(value) { this.setIsolation('entityIsolation', value); }
        setBlockHighlights(value) { this.assertAlive(); this.blockHighlights = new Set(Array.from(value || [], A.key)); }
        setSelectionHandles(value) { this.assertAlive(); this.selectionHandles = new Set(value || []); }

        setAttributeDisplay(value) {
            this.assertAlive();
            for (const key of ['showDefinitions', 'showReferences', 'showInvisible'])
                if (key in value) this.change(key, !!value[key]);
        }

        setVisualStyle(value) {
            this.assertAlive();
            const style = typeof value === 'object' && value ? value.key || value.id || value.name : value;
            this.visualStyle = ['2dwireframe', 'shaded'].includes(style) ? style : '2dwireframe';
        }
        getVisualStyleOverride() { return { value: this.visualStyle }; }

        setLayout(layout) {
            this.assertAlive();
            if (!this.sceneGraph?.document) throw new Error('Load a drawing first.');
            this.sceneGraph.document.getEntities(layout);
            this.layout = layout;
            this.compileRevision++;
            this.viewState = { mode: 'auto' };
            return this.renderScene(this.sceneGraph);
        }

        setViewDirection(direction) {
            this.assertAlive();
            this.viewDirection = G.normal(direction);
            this.viewState = { mode: 'auto' };
            return this.sceneGraph ? this.renderScene(this.sceneGraph) : null;
        }

        setComparison(session) {
            this.assertAlive();
            this.comparison = session;
            this.comparisonTarget = this.sceneGraph?.document.tabId ?? this.sceneGraph?.document;
            this.comparisonError = null;
        }

        renderScene(sceneGraph, options = {}) {
            this.assertAlive();
            if (!sceneGraph?.document) throw new TypeError('Only DxfSkia scene graphs are accepted.');
            if (this.comparison && this.comparisonTarget !== (sceneGraph.document.tabId ?? sceneGraph.document))
                this.setComparison(null);
            if (this.sceneGraph !== sceneGraph) {
                const sameTab = sceneGraph.document.tabId != null && sceneGraph.document.tabId === this.sceneGraph?.document.tabId;
                const layout = sameTab && [...sceneGraph.document.layouts.values()].find(l => l.name.toUpperCase() === this.layout.toUpperCase());
                this.sceneGraph = sceneGraph;
                this.layout = layout ? layout.name : 'Model';
                this.compileRevision++;
                if (!sameTab) this.viewState = { mode: 'auto' };
            }
            if (options.viewState) this.viewState = options.viewState;
            if (!this.compiled || this.builtRevision !== this.compileRevision) {
                this.compiled = new A.SceneCompiler(sceneGraph.document, {
                    ...this.options,
                    textMeasurer: this.resources ? (p, t) => this.resources.measureText(p, t) : undefined
                }).compile(this.layout);
                this.builtRevision = this.compileRevision;
            }
            let displayScene = this.compiled;
            if (this.comparison?.enabled) {
                try { displayScene = this.comparison.scene(this.compiled); this.comparisonError = null; }
                catch (error) { this.comparisonError = error; this.comparison.enabled = false; }
            }
            const frame = A.prepareFrame(displayScene, {
                width: this.width, height: this.height, devicePixelRatio: this.devicePixelRatio,
                viewState: this.viewState, viewDirection: this.viewDirection,
                visualStyle: this.visualStyle, background: this.options.background
            });
            this.lastFrame = frame;
            this.diagnostics = displayScene.diagnostics;
            this.host.request(frame, { selection: this.selectionHandles, blockHighlights: this.blockHighlights, grid: this.gridVisible });
            this.emit(this.frameListeners, frame);
            return frame;
        }

        resize(width, height, dpr = 1) {
            this.assertAlive();
            if (![width, height, dpr].every(Number.isFinite)) throw new RangeError('Finite viewport dimensions required.');
            this.width = Math.max(1, width);
            this.height = Math.max(1, height);
            this.devicePixelRatio = G.clamp(dpr, 1, 3);
            if (this.sceneGraph) this.renderScene(this.sceneGraph);
        }

        resume() {
            this.assertAlive();
            if (this.canPresent && !this.canPresent()) { this.suspend(); return; }
            this.suspended = false;
            this.host.resume();
        }
        suspend() { if (!this.disposed) { this.suspended = true; this.host.suspend(); } }

        clear() {
            this.assertAlive();
            this.comparison = this.comparisonTarget = this.comparisonError = null;
            this.host.suspend();
            this.suspended = true;
            this.sceneGraph = this.compiled = this.lastFrame = null;
            this.host.lastFrame = this.host.pending = null;
            this.host.painter?.clearCache();
            this.selectionHandles.clear();
            this.blockHighlights.clear();
            this.diagnostics = [];
        }

        renderMessage(message) { this.assertAlive(); this.message = String(message); this.notify(this.onError, new Error(message)); }
        async registerResource(...args) {
            this.assertAlive();
            await this.host.ensureRuntime();
            this.assertAlive();
            const result = this.resources.register(...args);
            this.compileRevision++;
            if (this.sceneGraph) this.renderScene(this.sceneGraph);
            await this.ready;
            return result;
        }
        async exportPng() { this.assertAlive(); return this.host.exportPng(); }
        async exportPdf(options) { this.assertAlive(); return this.host.exportPdf(options); }

        dispose() {
            if (!this.disposed) {
                this.clear();
                this.disposed = true;
                this.frameListeners.clear();
                this.paintListeners.clear();
                this.errorListeners.clear();
                this.onPaint = this.onError = this.onCanvasReplaced = this.canPresent = null;
                this.disposePromise = this.host.dispose();
            }
            return this.disposePromise;
        }
        destroy() { return this.dispose(); }
    };
}
