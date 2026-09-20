/* Coalesced, generation-safe native surface lifetime. Initialization is injected;
 * a host can use a package, vendored runtime, or an already initialized namespace. */
(function (root) {
    'use strict';
    const A = root.DxfSkia;
    class SurfaceHost {
        constructor({ initialize, Skia, backend = 'auto', resources, maxPixels = 32000000, onPaint, onError, onCanvasReplaced } = {}) {
            if (!Skia && typeof initialize !== 'function')
                throw new TypeError('Inject Skia or an asynchronous initialize function.');
            Object.assign(this, { initializer: initialize, S: Skia, backend, resources, maxPixels, onPaint, onError, onCanvasReplaced });
            this.canvas = null;
            this.surface = null;
            this.painter = null;
            this.pending = null;
            this.lastFrame = null;
            this.paintOptions = {};
            this.suspended = false;
            this.disposed = false;
            this.generation = 0;
            this.error = null;
            this._running = null;
            this._init = null;
            this.paintCount = 0;
        }
        initialize(canvas) { if (this.disposed)
            throw new Error('Surface host is disposed.'); if (!canvas || typeof canvas.getContext !== 'function')
            throw new TypeError('An HTML canvas is required.'); this.canvas = canvas; return this; }
        async ensureRuntime() {
            if (this.disposed)
                throw new Error('Surface host is disposed.');
            this.S = await (this._init ||= (this.S ? Promise.resolve(this.S) : Promise.resolve().then(this.initializer)).catch(error => { this._init = null; throw error; }));
            if (this.disposed)
                throw new Error('Surface host disposed during initialization.');
            if (!this.painter) {
                this.painter = new A.SkiaPainter(this.S, { resources: this.resources });
                this.resources = this.painter.resources;
            }
            return this.S;
        }
        request(frame, options = {}) { if (this.disposed)
            return; this.lastFrame = frame; this.paintOptions = options; this.pending = frame; if (!this.suspended)
            this.schedule(); }
        schedule() {
            if (this._running || this.disposed || this.suspended)
                return;
            this._running = Promise.resolve().then(() => this.drain()).catch(error => { this.pending = null; this.error = error; this.onError?.(error); }).finally(() => { this._running = null; if (this.pending && !this.suspended && !this.disposed)
                this.schedule(); });
        }
        async drain() {
            await this.ensureRuntime();
            while (this.pending && !this.suspended && !this.disposed) {
                const frame = this.pending;
                this.pending = null;
                const width = Math.max(1, Math.round(frame.width * frame.devicePixelRatio)), height = Math.max(1, Math.round(frame.height * frame.devicePixelRatio));
                if (width * height > this.maxPixels || width > 16384 || height > 16384)
                    throw new RangeError('Native surface pixel budget exceeded.');
                if (!this.canvas)
                    throw new Error('Canvas is not attached.');
                const epoch = this.generation;
                if (!this.surface || this.surface.Width !== width || this.surface.Height !== height) {
                    const old = this.surface;
                    this.surface = null;
                    if (old)
                        await old.DisposeAsync();
                    if (this.disposed)
                        return;
                    this.canvas.width = width;
                    this.canvas.height = height;
                    const canvas = this.canvas, surface = await this.S.SKSurface.Create(canvas, { backend: this.negotiatedBackend || this.backend, allowFallback: true, onDeviceLost: () => {
                            if (!this.disposed && this.surface === surface) {
                                this.generation++;
                                this.negotiatedBackend = null;
                                this.surface = null;
                                surface.Dispose();
                                this.pending = this.lastFrame;
                                this.schedule();
                            }
                        } });
                    if (this.disposed || epoch !== this.generation) {
                        await surface.DisposeAsync();
                        if (!this.disposed)
                            this.pending = this.lastFrame;
                        continue;
                    }
                    this.surface = surface;
                    this.negotiatedBackend = surface.Backend;
                    if (surface.Element && surface.Element !== this.canvas) {
                        const previous = this.canvas;
                        this.canvas = surface.Element;
                        this.onCanvasReplaced?.(this.canvas, previous);
                    }
                    this.canvas.dataset.skiaBackend = surface.Backend;
                    this.canvas.dataset.renderer = 'DxfSkia';
                }
                if (this.pending)
                    continue; // Newer camera/size arrived during native initialization.
                const stats = this.painter.draw(this.surface.Canvas, frame, this.paintOptions);
                await this.surface.FlushAsync();
                if (this.disposed)
                    return;
                this.error = null;
                this.paintCount++;
                this.onPaint?.({ ...stats, frame, paintCount: this.paintCount, backend: this.surface.Backend, fallbackReasons: this.surface.FallbackReasons || [] });
            }
        }
        async whenIdle() { while (this._running) {
            await this._running;
        } if (this.error)
            throw this.error; return this.lastFrame; }
        resume() { if (this.disposed)
            return; this.suspended = false; if (this.lastFrame)
            this.pending = this.lastFrame; this.schedule(); }
        suspend() { this.suspended = true; this.pending = null; }
        async registerResource(name, bytes, options) { await this.ensureRuntime(); const entry = this.resources.register(name, bytes, options); if (this.lastFrame)
            this.request(this.lastFrame, this.paintOptions); await this.whenIdle(); return entry; }
        async exportPng() { if (this.suspended)
            throw new Error('Resume the drawing before exporting.'); await this.whenIdle(); if (!this.surface)
            throw new Error('No rendered surface.'); const image = await this.surface.SnapshotAsync(); try {
            const data = image.Encode(this.S.SKEncodedImageFormat.Png, 100);
            try {
                return data.ToArray();
            }
            finally {
                data.Dispose();
            }
        }
        finally {
            image.Dispose();
        } }
        async exportPdf({ width = 842, height = 595, background = '#ffffff' } = {}) {
            await this.ensureRuntime();
            if (!this.lastFrame)
                throw new Error('No drawing is loaded.');
            if (!(width > 0 && height > 0 && width <= 14400 && height <= 14400))
                throw new RangeError('Invalid PDF page dimensions.');
            const scene = new A.SceneCompiler(this.lastFrame.scene.document, { ...this.lastFrame.scene.compileOptions, background, printing: true }).compile(this.lastFrame.scene.layout), frame = A.prepareFrame(scene, { width, height, background, viewDirection: this.lastFrame.basis.z, viewState: { mode: 'auto', rotationRad: this.lastFrame.rotationRad } }), document = this.S.SKDocument.CreatePdf(null, { NativeBackend: true });
            try {
                const canvas = document.BeginPage(width, height);
                this.painter.draw(canvas, frame, { background });
                document.EndPage();
                document.Close();
                const data = document.ToData();
                try {
                    return data.ToArray();
                }
                finally {
                    data.Dispose();
                }
            }
            finally {
                document.Dispose();
            }
        }
        async dispose() { if (this.disposed)
            return; this.disposed = true; this.generation++; this.pending = null; await this._running; const surface = this.surface; this.surface = null; if (surface)
            await surface.DisposeAsync(); this.painter?.dispose(); this.painter = null; this.resources = null; this.canvas = null; }
    }
    A.SurfaceHost = SurfaceHost;
    if (typeof module === 'object' && module.exports)
        module.exports = A;
})(globalThis);
