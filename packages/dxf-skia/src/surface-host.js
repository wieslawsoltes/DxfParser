/* Coalesced native surface lifetime with bounded, observable backend recovery.
 * DXF documents/resources are authoritative; a failed GPU surface is disposable.
 * Never retry a failed backend implicitly, or publish a stale completed frame. */
(function (root) {
    'use strict';
    const A = root.DxfSkia;
    const MODES = ['webgpu', 'webgl', 'canvas'];
    class SurfaceHost {
        constructor({ initialize, Skia, backend = 'auto', allowFallback = true, resources,
            maxPixels = 32000000, onPaint, onError, onCanvasReplaced, onRecovery } = {}) {
            if (!Skia && typeof initialize !== 'function') throw new TypeError('Inject Skia or an asynchronous initialize function.');
            if (backend !== 'auto' && !MODES.includes(backend)) throw new RangeError('Unknown rendering backend.');
            if (!Number.isSafeInteger(maxPixels) || maxPixels < 1) throw new RangeError('Positive integer pixel budget required.');
            Object.assign(this, { initializer: initialize, S: Skia, backend, allowFallback, resources, maxPixels, onPaint, onError, onCanvasReplaced, onRecovery });
            this.canvas = this.surface = this.painter = this.pending = this.lastFrame = this.presentedFrame = null;
            this.paintOptions = {};
            this.suspended = this.disposed = this.faulted = false;
            this.generation = this.requestId = this.paintCount = 0;
            this.error = this._running = this._init = null;
            this.failedBackends = new Set();
            this.recoveryEvents = [];
            this._reportedError = '';
            this._disposePromise = null;
            this._retirements = new WeakMap();
        }
        initialize(canvas) {
            if (this.disposed) throw new Error('Surface host is disposed.');
            if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('An HTML canvas is required.');
            if (this.surface && this.canvas !== canvas) throw new Error('Cannot change an active canvas; dispose the host first.');
            this.canvas = canvas;
            return this;
        }
        async ensureRuntime() {
            if (this.disposed) throw new Error('Surface host is disposed.');
            this.S = await (this._init ||= (this.S ? Promise.resolve(this.S) : Promise.resolve().then(this.initializer)).catch(error => { this._init = null; throw error; }));
            if (this.disposed) throw new Error('Surface host disposed during initialization.');
            if (!this.painter) {
                this.painter = new A.SkiaPainter(this.S, { resources: this.resources });
                this.resources = this.painter.resources;
            }
            return this.S;
        }
        request(frame, options = {}) {
            if (this.disposed) return;
            this.lastFrame = this.pending = frame;
            this.paintOptions = options;
            this.requestId++;
            if (!this.suspended && !this.faulted) this.schedule();
        }
        reportError(error) {
            this.error = error;
            const signature = error.name + ':' + error.message;
            if (signature !== this._reportedError) {
                this._reportedError = signature;
                try { this.onError?.(error); } catch { /* Consumer callbacks cannot start a rejection loop. */ }
            }
        }
        schedule() {
            if (this._running || this.disposed || this.suspended || this.faulted) return;
            this._running = Promise.resolve().then(() => this.drain()).catch(error => {
                this.pending = null;
                if (!this.disposed) this.reportError(error);
            }).finally(() => {
                this._running = null;
                if (this.pending && !this.suspended && !this.disposed && !this.faulted) this.schedule();
            });
        }
        candidates() {
            const start = this.backend === 'auto' ? 0 : MODES.indexOf(this.backend);
            return MODES.slice(start, this.allowFallback ? undefined : start + 1).filter(mode => !this.failedBackends.has(mode));
        }
        replaceCanvas() {
            const previous = this.canvas;
            if (!previous?.cloneNode) throw new Error('Backend recovery requires a replaceable HTML canvas.');
            const next = previous.cloneNode(false);
            previous.replaceWith?.(next);
            this.canvas = next;
            this.onCanvasReplaced?.(next, previous);
        }
        async releaseSurface(surface = this.surface) {
            if (!surface) return;
            if (this.surface === surface) this.surface = null;
            // All disposal callers join the same promise, including a loss during flush.
            if (this._retirements.has(surface)) return this._retirements.get(surface);
            const promise = (async () => {
                try { if (surface.DisposeAsync) await surface.DisposeAsync(); else surface.Dispose(); }
                catch (error) { this.disposalError = error; } // Native teardown failed; do not reuse it.
            })();
            this._retirements.set(surface, promise);
            this._retiring = { surface, promise };
            await promise;
        }
        recordFailure(mode, error) {
            if (this.failedBackends.has(mode)) return;
            this.failedBackends.add(mode);
            const event = Object.freeze({ backend: mode, message: String(error?.message || error).slice(0, 2048) });
            this.recoveryEvents.push(event);
            this.painter?.clearCache();
            try { this.onRecovery?.(event); } catch { /* Notification only. */ }
        }
        async ensureSurface(width, height) {
            const epoch = this.generation;
            if (this.surface && this.surface.Width === width && this.surface.Height === height) return;
            await this.releaseSurface();
            if (this.disposed || this.suspended || epoch !== this.generation) return;
            const choices = this.negotiatedBackend && !this.failedBackends.has(this.negotiatedBackend)
                ? [this.negotiatedBackend, ...this.candidates().filter(x => x !== this.negotiatedBackend)] : this.candidates();
            for (const mode of choices) {
                if (this.disposed || this.suspended || epoch !== this.generation) return;
                if (this._replaceBeforeCreate) { this.replaceCanvas(); this._replaceBeforeCreate = false; }
                this.canvas.width = width; this.canvas.height = height;
                let created = null, loss = null;
                try {
                    created = await this.S.SKSurface.Create(this.canvas, { backend: mode, allowFallback: false, onDeviceLost: info => {
                        loss = new Error('WebGPU device lost: ' + (info?.message || info?.reason || 'unknown reason'));
                        if (this.disposed || this.surface !== created || !created) return;
                        this.generation++;
                        this.recordFailure(mode, loss);
                        this._lostSurface = created;
                        this.pending = this.lastFrame;
                        this.schedule();
                    } });
                    if (this.disposed || this.suspended || epoch !== this.generation) {
                        await this.releaseSurface(created);
                        this._replaceBeforeCreate = true;
                        return;
                    }
                    if (loss) { await this.releaseSurface(created); throw loss; }
                    this.surface = created;
                    this.negotiatedBackend = created.Backend || mode;
                    if (created.Element && created.Element !== this.canvas) {
                        const previous = this.canvas;
                        this.canvas = created.Element;
                        this.onCanvasReplaced?.(this.canvas, previous);
                    }
                    if (this.canvas.dataset) {
                        this.canvas.dataset.skiaBackend = this.negotiatedBackend;
                        this.canvas.dataset.renderer = 'DxfSkia';
                    }
                    return;
                } catch (error) {
                    if (this.disposed || epoch !== this.generation) { this._replaceBeforeCreate = true; return; }
                    this.recordFailure(mode, error);
                    this._replaceBeforeCreate = true;
                }
            }
            this.faulted = true;
            throw new Error('All permitted rendering backends failed. ' + this.recoveryEvents.map(e => e.backend + ': ' + e.message).join(' | '));
        }
        dimensions(frame) {
            const { width, height, devicePixelRatio = 1 } = frame;
            if (![width, height, devicePixelRatio].every(Number.isFinite) || width <= 0 || height <= 0 || devicePixelRatio <= 0)
                throw new RangeError('Finite positive frame dimensions and device pixel ratio required.');
            const w = Math.max(1, Math.round(width * devicePixelRatio)), h = Math.max(1, Math.round(height * devicePixelRatio));
            if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w * h > this.maxPixels || w > 16384 || h > 16384)
                throw new RangeError('Native surface pixel budget exceeded.');
            return [w, h];
        }
        async drain() {
            await this.ensureRuntime();
            while (this.pending && !this.suspended && !this.disposed && !this.faulted) {
                if (this._lostSurface) {
                    await this.releaseSurface(this._lostSurface);
                    this._lostSurface = null;
                    this._replaceBeforeCreate = true;
                    this.negotiatedBackend = null;
                }
                const frame = this.pending, options = this.paintOptions, id = this.requestId, epoch = this.generation;
                this.pending = null;
                const [width, height] = this.dimensions(frame); // Invalid input is NOT a GPU failure.
                if (!this.canvas) throw new Error('Canvas is not attached.');
                await this.ensureSurface(width, height);
                if (this.disposed || this.suspended) return;
                if (this.pending || id !== this.requestId || epoch !== this.generation) continue;
                const surface = this.surface;
                try {
                    const stats = this.painter.draw(surface.Canvas, frame, options);
                    await surface.FlushAsync();
                    if (this.disposed || this.suspended || epoch !== this.generation || id !== this.requestId || this.surface !== surface) continue;
                    this.error = null; this._reportedError = '';
                    this.presentedFrame = frame;
                    this.paintCount++;
                    try {
                        this.onPaint?.({ ...stats, frame, paintCount: this.paintCount, backend: surface.Backend,
                            fallbackReasons: [...this.recoveryEvents.map(e => e.backend + ': ' + e.message), ...(surface.FallbackReasons || [])] });
                    } catch (error) { this.callbackError = error; } // A UI callback is not a GPU failure.
                } catch (error) {
                    if (this.disposed) return;
                    const mode = surface.Backend || this.negotiatedBackend;
                    this.recordFailure(mode, error);
                    await this.releaseSurface(surface);
                    this._replaceBeforeCreate = true;
                    this.negotiatedBackend = null;
                    if (!this.allowFallback || !this.candidates().length) { this.faulted = true; throw error; }
                    if (!this.suspended) this.pending ||= this.lastFrame;
                }
            }
        }
        async whenIdle() {
            while (this._running) await this._running;
            if (this.error) throw this.error;
            return this.presentedFrame;
        }
        retryBackend(backend = this.backend) {
            if (backend !== 'auto' && !MODES.includes(backend)) throw new RangeError('Unknown rendering backend.');
            if (this.disposed) throw new Error('Surface host is disposed.');
            this.backend = backend;
            this.failedBackends.clear(); this.recoveryEvents = [];
            this.error = null; this._reportedError = ''; this.faulted = false;
            this.generation++;
            this._lostSurface = this.surface;
            this.negotiatedBackend = null;
            this.pending = this.lastFrame;
            this.schedule();
        }
        resume() { if (this.disposed) return; this.suspended = false; if (this.lastFrame) this.pending = this.lastFrame; this.schedule(); }
        suspend() { this.suspended = true; this.generation++; this.pending = null; }
        async registerResource(name, bytes, options) {
            await this.ensureRuntime();
            const entry = this.resources.register(name, bytes, options);
            if (this.lastFrame) this.request(this.lastFrame, this.paintOptions);
            await this.whenIdle();
            return entry;
        }
        async exportPng() {
            if (this.suspended) throw new Error('Resume the drawing before exporting.');
            await this.whenIdle();
            const surface = this.surface, epoch = this.generation;
            if (!surface) throw new Error('No rendered surface.');
            const image = await surface.SnapshotAsync();
            try {
                if (this.disposed || this.suspended || epoch !== this.generation || this.surface !== surface)
                    throw new Error('Drawing changed while exporting.');
                const data = image.Encode(this.S.SKEncodedImageFormat.Png, 100);
                if (!data) throw new Error('PNG encoding failed.');
                try { return data.ToArray(); } finally { data.Dispose(); }
            } finally { image.Dispose(); }
        }
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
        dispose() {
            if (this._disposePromise) return this._disposePromise;
            this.disposed = true; this.generation++; this.pending = null;
            return this._disposePromise = (async () => {
                await this._running;
                await this.releaseSurface();
                await this._retiring?.promise;
                this.painter?.dispose(); this.painter = null; this.resources = null; this.canvas = null;
            })();
        }
    }
    A.SurfaceHost = SurfaceHost;
    if (typeof module === 'object' && module.exports) module.exports = A;
})(globalThis);
