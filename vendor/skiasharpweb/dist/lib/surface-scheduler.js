/** Coalesced, single-flight surface creation and repainting. No DOM dependency. */
export class SurfaceScheduler {
  constructor({ getConfiguration, createSurface, adoptSurface = () => {}, paint,
    onError = () => {}, requestFrame = callback => requestAnimationFrame(callback),
    cancelFrame = handle => cancelAnimationFrame(handle) }) {
    Object.assign(this, { getConfiguration, createSurface, adoptSurface, paint, onError,
      requestFrame, cancelFrame });
    this.Surface = null;
    this._enabled = false;
    this._epoch = 0;
    this._revision = 0;
    this._frame = null;
    this._running = false;
    this._pending = null;
    this._active = null;
    this.Statistics = { Invalidations: 0, Frames: 0, CreatedSurfaces: 0, ReusedSurfaces: 0,
      DiscardedSurfaces: 0, Errors: 0 };
  }
  Connect() {
    if (!this._enabled) { this._enabled = true; this._epoch++; }
    return this.Invalidate();
  }
  Disconnect() {
    this._enabled = false;
    this._epoch++;
    if (this._frame !== null) this.cancelFrame(this._frame);
    this._frame = null;
    this._pending?.resolve(false); this._pending = null;
    this._active?.resolve(false);
    const surface = this.Surface;
    this.Surface = null; this._configurationKey = undefined;
    this._dispose(surface);
  }
  Invalidate(recreate = false) {
    if (!this._enabled) return Promise.resolve(false);
    this.Statistics.Invalidations++;
    if (recreate) this._revision++;
    if (!this._pending) {
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      this._pending = { promise, resolve };
    }
    this._schedule();
    return this._pending.promise;
  }
  _schedule() {
    if (this._enabled && this._pending && !this._running && this._frame === null) {
      this._frame = this.requestFrame(() => { this._frame = null; void this._run(); });
    }
  }
  _key(configuration) { return `${this._revision}:${JSON.stringify(configuration)}`; }
  _dispose(surface) {
    if (!surface || surface.IsDisposed) return;
    try { surface.Dispose(); } catch (error) { this._error(error); }
  }
  _error(error) {
    this.Statistics.Errors++;
    // Errors in the consumer's error handler must not strand pending frames.
    try { this.onError(error); } catch { /* Error has already been surfaced. */ }
  }
  async _run() {
    if (!this._enabled || !this._pending || this._running) return;
    this._running = true;
    const batch = this._pending, epoch = this._epoch;
    this._active = batch; this._pending = null;
    let created = null;
    try {
      const configuration = this.getConfiguration(), key = this._key(configuration);
      if (!this.Surface || this.Surface.IsDisposed || key !== this._configurationKey) {
        created = await this.createSurface(configuration);
        if (!created) throw new Error('The surface factory returned no surface.');
        this.Statistics.CreatedSurfaces++;
        if (!this._enabled || epoch !== this._epoch || key !== this._key(this.getConfiguration())) {
          this.Statistics.DiscardedSurfaces++;
          batch.resolve(false);
          return;
        }
        const previous = this.Surface;
        this.adoptSurface(created, configuration);
        this.Surface = created; created = null; this._configurationKey = key;
        this._dispose(previous);
      } else this.Statistics.ReusedSurfaces++;
      // The paint callback is synchronous, like a .NET PaintSurface event.
      this.paint(this.Surface, configuration);
      if (this._enabled && epoch === this._epoch && !this.Surface.IsDisposed) this.Surface.Flush();
      this.Statistics.Frames++;
      batch.resolve(true);
    } catch (error) {
      if (this._enabled && epoch === this._epoch) this._error(error);
      batch.resolve(false);
    } finally {
      this._dispose(created);
      this._running = false; this._active = null;
      this._schedule();
    }
  }
}
