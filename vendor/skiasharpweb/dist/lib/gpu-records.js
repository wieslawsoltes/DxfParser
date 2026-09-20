/** Graphite value records and an owned, bounded native image cache.
 * Install after createGpuAPI and the image overload adapters. Browser handles
 * are GPU objects; native process addresses cannot cross the JavaScript ABI. */
export function installGpuRecords(K, api) {
  if (api.SKGraphiteImageCache && api.SKGraphiteDawnBackendContextInit) return api;
  const identities = new WeakMap();
  let nextIdentity = 1;
  const identity = value => {
    let id = identities.get(value);
    if (!id) { id = nextIdentity++; identities.set(value, id); }
    return id;
  };
  const unsupported = message => { throw new api.SKNotSupportedError(message); };
  const reference = value => value == null ? null : value;
  const equal = (left, right) => left === right || (typeof left === 'number' && typeof right === 'number' && Number.isNaN(left) && Number.isNaN(right));
  const hash = values => {
    let result = 2166136261;
    for (const value of values) {
      const type = typeof value;
      const text = value == null ? 'null' : (type === 'object' || type === 'function') ? `ref:${identity(value)}` : `${type}:${String(value)}`;
      for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
      result = Math.imul(result ^ 255, 16777619);
    }
    return result | 0;
  };
  const rect = value => value == null ? [0, 0, 0, 0] : value.ToArray?.() ?? [value.Left, value.Top, value.Right, value.Bottom];
  function valueRecord(Type, fields) {
    Type.prototype.Equals = function (other) {
      if (!(other instanceof Type)) return false;
      const left = fields(this), right = fields(other);
      return left.every((value, index) => equal(value, right[index]));
    };
    Type.prototype.GetHashCode = function () { return hash(fields(this)); };
  }
  valueRecord(api.SKGraphiteContextOptions, v => [!!v.DisableDriverCorrectnessWorkarounds, v.InternalMultisampleCount, v.GpuBudgetInBytes, !!v.RequireOrderedRecordings, !!v.SetBackendLabels]);
  valueRecord(api.SKGraphiteSubmitInfo, v => [!!v.Sync, !!v.MarkBoundary, v.FrameID]);
  valueRecord(api.SKGraphiteInsertRecordingInfo, v => [reference(v.Recording), reference(v.TargetSurface), v.TargetTranslationX, v.TargetTranslationY, ...rect(v.TargetClip)]);

  function browserHandle(value, kind) {
    if (value == null) return null;
    if (typeof value === 'number' || typeof value === 'bigint') return unsupported(`${kind} requires a browser GPU object; native pointer addresses are unsupported.`);
    const member = { Device: 'createCommandEncoder', Queue: 'submit', Instance: 'requestAdapter' }[kind];
    if (typeof value !== 'object' || typeof value[member] !== 'function') throw new TypeError(`${kind} must be a GPU${kind === 'Instance' ? '' : kind} object.`);
    return value;
  }
  class SKGraphiteDawnBackendContextInit {
    constructor(options = {}) {
      if (typeof options?.createCommandEncoder === 'function') options = { Device: options };
      this.Instance = options.Instance ?? null;
      this.Device = options.Device ?? null;
      this.Queue = options.Queue ?? this.Device?.queue ?? null;
      this.NonYielding = options.NonYielding ?? true;
    }
    get Instance() { return this._instance; }
    set Instance(value) { this._instance = browserHandle(value, 'Instance'); }
    get Device() { return this._device; }
    set Device(value) { this._device = browserHandle(value, 'Device'); }
    get Queue() { return this._queue; }
    set Queue(value) { this._queue = browserHandle(value, 'Queue'); }
    get NonYielding() { return this._nonYielding; }
    set NonYielding(value) { this._nonYielding = !!value; }
    // The existing browser context factory consumes this alias; validate the
    // complete record when materializing it, after object-initializer setters.
    get WgpuDevice() {
      if (!this.Device) throw new TypeError('Device must be set before creating a Graphite context.');
      if (this.Queue !== this.Device.queue) return unsupported('Queue must be the selected GPUDevice.queue.');
      if (!this.NonYielding) return unsupported('Browser Graphite contexts require NonYielding=true; use asynchronous submission.');
      return this.Device;
    }
    get WgpuInstance() { return this.Instance; }
    get WgpuQueue() { return this.Queue; }
  }
  valueRecord(SKGraphiteDawnBackendContextInit, v => [v.Instance, v.Device, v.Queue, v.NonYielding]);

  function ownedImage(native, recorder) {
    if (!native) return null;
    const result = api.SKImage._fromNative(native);
    result._textureBacked = true;
    result.TextureImportMode = 'graphite-cache';
    result._gpuOwner = recorder;
    recorder._surfaces.add(result);
    const dispose = result.Dispose.bind(result);
    result.Dispose = () => {
      if (result.IsDisposed) return;
      dispose();
      recorder._surfaces.delete(result);
    };
    return result;
  }
  class SKGraphiteImageCache {
    constructor({ Capacity = 256, MaxBytes = 64 * 1024 * 1024 } = {}) {
      this._entries = new Map(); this._byIdentity = new Map();
      this._lookup = new WeakMap(); this._nativeIds = new WeakMap();
      this._serial = 0; this._hits = 0; this._uploads = 0; this._evictions = 0;
      this._retainedBytes = 0; this._bypasses = 0; this._aliasComparisons = 0;
      this.Capacity = Capacity; this.MaxBytes = MaxBytes;
    }
    _limit(value, name) {
      if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a nonnegative safe integer.`);
      return value;
    }
    get Capacity() { return this._capacity; }
    set Capacity(value) { this._capacity = this._limit(value, 'Capacity'); this._trim(); }
    get MaxBytes() { return this._maxBytes; }
    set MaxBytes(value) { this._maxBytes = this._limit(value, 'MaxBytes'); this._trim(); }
    _remove(key, eviction = false) {
      const entry = this._entries.get(key); if (!entry) return;
      this._entries.delete(key); this._retainedBytes -= entry.bytes;
      if (entry.identityKey !== null) this._byIdentity.delete(entry.identityKey);
      try { entry.uploaded.Dispose(); } finally { entry.source.delete(); }
      if (eviction) this._evictions++;
    }
    _trim(extra = 0) {
      while (this._entries.size && (this._entries.size > this._capacity ||
        this._retainedBytes + extra > this._maxBytes)) this._remove(this._entries.keys().next().value, true);
    }
    _estimateBytes(image, mipmapped) {
      // Logical texture storage estimate, not driver allocation accounting.
      const bpp = Math.max(4, image.Info?.BytesPerPixel ?? 4);
      let w = image.Width, h = image.Height, bytes = 0;
      do { bytes += w * h * bpp; if (!mipmapped || (w === 1 && h === 1)) break;
        w = Math.max(1, Math.floor(w / 2)); h = Math.max(1, Math.floor(h / 2));
      } while (true);
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RangeError('Image storage size exceeds the supported range.');
      return bytes;
    }
    FindOrCreate(recorder, image, mipmapped = false) {
      if (!(recorder instanceof api.SKGraphiteRecorder)) throw new TypeError('recorder must be an SKGraphiteRecorder.');
      if (!(image instanceof api.SKImage)) throw new TypeError('image must be an SKImage.');
      recorder.ThrowIfDisposed(); recorder.Context?.ThrowIfDisposed(); image.ThrowIfDisposed();
      if (image._gpuOwner instanceof api.SKGraphiteRecorder && image._gpuOwner !== recorder) throw new Error('The source texture belongs to another Graphite recorder.');
      if (!K.SkiaSharpImageToGraphiteTexture) return unsupported('Graphite image caching requires the compiled native Graphite extension.');
      mipmapped = !!mipmapped;
      let owners = this._lookup.get(image);
      if (!owners) this._lookup.set(image, owners = new WeakMap());
      let slots = owners.get(recorder);
      if (!slots) owners.set(recorder, slots = []);
      let key = slots[+mipmapped], entry = this._entries.get(key), identityKey = null;
      if (entry && (entry.uploaded.IsDisposed || entry.recorder.IsDisposed || entry.recorder.Context?.IsDisposed)) {
        this._remove(key, true); entry = null;
      }
      if (!entry && typeof K.SkiaSharpImageUniqueID === 'function') {
        let nativeId = this._nativeIds.get(image);
        if (nativeId === undefined) { nativeId = K.SkiaSharpImageUniqueID(image._native); this._nativeIds.set(image, nativeId); }
        identityKey = `${identity(recorder)}:${+mipmapped}:${nativeId}`;
        key = this._byIdentity.get(identityKey); entry = this._entries.get(key);
        if (entry && entry.uploaded.IsDisposed) { this._remove(key, true); entry = null; }
      } else if (!entry) {
        // Compatibility for older injected runtimes: identity-safe alias checks.
        for (const [candidate, value] of this._entries) {
          if (value.uploaded.IsDisposed || value.recorder.IsDisposed || value.recorder.Context?.IsDisposed) {
            this._remove(candidate, true); continue;
          }
          if (value.recorder === recorder && value.mipmapped === mipmapped) {
            this._aliasComparisons++;
            if (value.source.isAliasOf(image._native)) { key = candidate; entry = value; break; }
          }
        }
      }
      if (entry) {
        slots[+mipmapped] = key;
        this._entries.delete(key); this._entries.set(key, entry); this._hits++;
        return ownedImage(entry.uploaded._native.clone(), recorder);
      }
      const bytes = this._estimateBytes(image, mipmapped);
      const native = K.SkiaSharpImageToGraphiteTexture(recorder._native, image._native, mipmapped);
      if (!native) return null;
      this._uploads++;
      const uploaded = ownedImage(native, recorder);
      if (bytes > this._maxBytes || this._capacity === 0 || this._maxBytes === 0) {
        this._bypasses++; return uploaded;
      }
      let source;
      try { source = image._native.clone(); } catch (error) { uploaded.Dispose(); throw error; }
      while (this._entries.size >= this._capacity) this._remove(this._entries.keys().next().value, true);
      this._trim(bytes);
      key = ++this._serial;
      this._entries.set(key, { source, uploaded, recorder, mipmapped, identityKey, bytes });
      this._retainedBytes += bytes;
      if (identityKey !== null) this._byIdentity.set(identityKey, key);
      slots[+mipmapped] = key;
      return ownedImage(uploaded._native.clone(), recorder);
    }
    PurgeForRecorder(recorder) {
      for (const [key, entry] of this._entries) if (entry.recorder === recorder) this._remove(key);
    }
    Dispose() {
      for (const key of this._entries.keys()) this._remove(key);
      this._byIdentity.clear(); this._lookup = new WeakMap(); this._nativeIds = new WeakMap();
    }
    GetStatistics() {
      return Object.freeze({ Count: this._entries.size, Hits: this._hits, Uploads: this._uploads,
        Evictions: this._evictions, Capacity: this._capacity, MaxBytes: this._maxBytes,
        EstimatedBytes: this._retainedBytes, OversizeBypasses: this._bypasses,
        AliasComparisons: this._aliasComparisons,
        NativeIdentity: typeof K.SkiaSharpImageUniqueID === 'function' });
    }
    [Symbol.dispose]() { this.Dispose(); }
  }
  Object.assign(api, { SKGraphiteImageCache, SKGraphiteDawnBackendContextInit });
  return api;
}
