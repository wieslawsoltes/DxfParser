/** Bounded immutable-bitmap snapshots; mutable bitmaps keep uncached semantics. */
export function installRenderCache(K, api) {
  const entries = new Map();
  let retainedBytes = 0, maxBytes = 32 * 1024 * 1024;
  const stats = { Hits: 0, Misses: 0, Evictions: 0 };
  const remove = (bitmap, eviction = false) => {
    const entry = entries.get(bitmap); if (!entry) return;
    entries.delete(bitmap); retainedBytes -= entry.bytes; entry.image.Dispose();
    if (eviction) stats.Evictions++;
  };
  const evict = () => { while (retainedBytes > maxBytes && entries.size) remove(entries.keys().next().value, true); };
  const fromBitmap = api.SKImage.FromBitmap;
  const draw = api.SKCanvas.prototype.DrawBitmap;
  api.SKCanvas.prototype.DrawBitmap = function(bitmap, ...args) {
    this._check(); bitmap?.ThrowIfDisposed?.();
    if (!bitmap?.IsImmutable || !maxBytes || bitmap.IsEmpty) return draw.call(this, bitmap, ...args);
    let entry = entries.get(bitmap);
    if (!entry) {
      stats.Misses++;
      const bytes = bitmap.ByteCount;
      if (bytes > maxBytes) return draw.call(this, bitmap, ...args);
      const image = fromBitmap.call(api.SKImage, bitmap);
      if (!image) return draw.call(this, bitmap, ...args);
      entry = { image, bytes }; entries.set(bitmap, entry); retainedBytes += bytes; evict();
    } else { stats.Hits++; entries.delete(bitmap); entries.set(bitmap, entry); }
    return this.DrawImage(entry.image, ...args);
  };
  // Static codec factories can return the original bitmap base type. Install
  // lifecycle hooks on every bitmap prototype that owns a relevant method.
  for (let prototype = api.SKBitmap.prototype;
       prototype && prototype !== api.SKObject.prototype;
       prototype = Object.getPrototypeOf(prototype)) {
    for (const name of ['Dispose', 'NotifyPixelsChanged', '_clearAllocation']) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (typeof descriptor?.value !== 'function') continue;
      const original = descriptor.value;
      Object.defineProperty(prototype, name, { ...descriptor, value: function(...args) {
        remove(this); return original.apply(this, args);
      } });
    }
  }
  const purge = api.SKGraphics.PurgeResourceCache;
  const clearCache = () => { for (const bitmap of [...entries.keys()]) remove(bitmap); };
  api.SKGraphics.PurgeResourceCache = function() { clearCache(); return purge.call(this); };
  const purgeAll = api.SKGraphics.PurgeAllCaches;
  api.SKGraphics.PurgeAllCaches = function() { clearCache(); return purgeAll.call(this); };
  api.SKGraphics.GetBitmapCacheStatistics = () => Object.freeze({ ...stats, EntryCount: entries.size, RetainedBytes: retainedBytes, MaxBytes: maxBytes });
  api.SKGraphics.SetBitmapCacheLimit = value => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Bitmap cache limit must be a nonnegative safe integer.');
    const previous = maxBytes; maxBytes = value; evict(); return previous;
  };
  api.SKGraphics.PurgeBitmapCache = clearCache;
}
