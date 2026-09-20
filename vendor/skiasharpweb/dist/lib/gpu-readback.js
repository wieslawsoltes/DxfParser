/** Precision-preserving GPU readback. Buffers retain their native component bits. */
export function installGpuReadback(K, api) {
  const value = x => x?.value ?? x;
  const uint = (x, name, minimum = 0) => {
    if (!Number.isSafeInteger(x) || x < minimum) throw new RangeError(`${name} must be an integer >= ${minimum}.`);
    return x;
  };
  const sizeLimit = (size, limit = 512 * 1024 * 1024) => {
    if (!Number.isSafeInteger(size) || size < 1 || size > limit) throw new RangeError('GPU readback exceeds the allocation limit.');
    return size;
  };
  const formats = new Map();
  for (const [channels, count] of [['r', 1], ['rg', 2], ['rgba', 4]]) {
    for (const bits of [8, 16, 32]) {
      for (const suffix of bits === 32 ? ['uint', 'sint', 'float'] : bits === 16 ? ['unorm', 'snorm', 'uint', 'sint', 'float'] : ['unorm', 'snorm', 'uint', 'sint']) {
        formats.set(`${channels}${bits}${suffix}`, count * bits / 8);
      }
    }
  }
  for (const name of ['rgba8unorm-srgb', 'bgra8unorm', 'bgra8unorm-srgb', 'rgb9e5ufloat', 'rgb10a2uint', 'rgb10a2unorm', 'rg11b10ufloat']) formats.set(name, 4);
  class SKGPUReadbackPool {
    constructor(device, { MaxBytes = 32 * 1024 * 1024, Capacity = 4 } = {}) {
      if (typeof device?.createBuffer !== 'function') throw new TypeError('A GPUDevice is required.');
      this.Device = device;
      Object.defineProperties(this, { MaxBytes: { value: uint(MaxBytes, 'MaxBytes'), enumerable: true }, Capacity: { value: uint(Capacity, 'Capacity'), enumerable: true } });
      this._idle = []; this._bytes = 0; this._disposed = false;
      this._statistics = { Allocations: 0, Reuses: 0, Active: 0, PeakActive: 0 };
      device.lost?.then(() => this.Dispose());
    }
    get IsDisposed() { return this._disposed; }
    _acquire(size) {
      if (this._disposed) throw new Error('Readback pool is disposed.');
      let index = -1;
      for (let i = 0; i < this._idle.length; i++) if (this._idle[i].size >= size && (index < 0 || this._idle[i].size < this._idle[index].size)) index = i;
      let entry;
      if (index >= 0) { entry = this._idle.splice(index, 1)[0]; this._bytes -= entry.size; this._statistics.Reuses++; }
      else { entry = { size, buffer: this.Device.createBuffer({ label: 'SkiaSharp pooled readback', size, usage: 9 }) }; this._statistics.Allocations++; }
      this._statistics.Active++; this._statistics.PeakActive = Math.max(this._statistics.PeakActive, this._statistics.Active);
      let released = false;
      return { buffer: entry.buffer, release: reusable => {
        if (released) return; released = true; this._statistics.Active--;
        if (!reusable || this._disposed || this.Capacity === 0 || entry.size > this.MaxBytes) { entry.buffer.destroy(); return; }
        while (this._idle.length && (this._idle.length >= this.Capacity || this._bytes + entry.size > this.MaxBytes)) {
          const old = this._idle.shift(); this._bytes -= old.size; old.buffer.destroy();
        }
        this._idle.push(entry); this._bytes += entry.size;
      } };
    }
    GetStatistics() { return Object.freeze({ ...this._statistics, IdleBuffers: this._idle.length, IdleBytes: this._bytes, MaxBytes: this.MaxBytes, Capacity: this.Capacity }); }
    Dispose() { if (this._disposed) return; this._disposed = true; for (const entry of this._idle) entry.buffer.destroy(); this._idle = []; this._bytes = 0; }
    [Symbol.dispose]() { this.Dispose(); }
  }
  const P = api.SKImageReadPixelsResult.prototype;
  P.GetPixelSpan = function (Type = Uint8Array, plane = 0) {
    if (typeof Type !== 'function' || !Number.isInteger(Type.BYTES_PER_ELEMENT)) throw new TypeError('A typed-array constructor is required.');
    const bytes = this.GetData(plane);
    if (bytes.byteOffset % Type.BYTES_PER_ELEMENT || bytes.byteLength % Type.BYTES_PER_ELEMENT) throw new RangeError('Pixel storage is not aligned for this typed-array view.');
    return new Type(bytes.buffer, bytes.byteOffset, bytes.byteLength / Type.BYTES_PER_ELEMENT);
  };
  const oldToImage = P.ToImage;
  P.ToImage = function () {
    this.ThrowIfDisposed();
    if (this.Format && !this.Info) throw new api.SKNotSupportedError(`Raw ${this.Format} data has no matching SKImageInfo. Use GetPixelSpan instead.`);
    return oldToImage.call(this);
  };
  api.ReadWebGPUTexture = async function (device, texture, options = {}) {
    const mipLevel = uint(options.mipLevel ?? 0, 'mipLevel');
    if (mipLevel >= (texture.mipLevelCount ?? 1)) throw new RangeError('Readback mip level is outside the texture.');
    const x = uint(options.x ?? 0, 'x'), y = uint(options.y ?? 0, 'y'), layer = uint(options.layer ?? 0, 'layer');
    const levelWidth = Math.max(1, Math.floor(texture.width / 2 ** mipLevel)), levelHeight = Math.max(1, Math.floor(texture.height / 2 ** mipLevel));
    const width = uint(options.width ?? levelWidth - x, 'width', 1), height = uint(options.height ?? levelHeight - y, 'height', 1);
    if (x + width > levelWidth || y + height > levelHeight || layer >= (texture.depthOrArrayLayers ?? 1)) throw new RangeError('Readback rectangle is outside the selected texture mip level.');
    if ((texture.sampleCount ?? 1) !== 1) throw new TypeError('Resolve multisampled textures before readback.');
    if (texture.dimension && texture.dimension !== '2d') throw new TypeError('Readback requires a 2D texture or array layer.');
    if (texture.usage !== undefined && !(texture.usage & 1)) throw new TypeError('The texture must include GPUTextureUsage.COPY_SRC.');
    const format = options.format ?? texture.format;
    if (options.format && texture.format && options.format !== texture.format) throw new TypeError('Readback cannot reinterpret a texture format.');
    const bpp = formats.get(format);
    if (!bpp) throw new api.SKNotSupportedError('Readback supports uncompressed color formats; compressed and depth/stencil planes require explicit decoding.');
    const rowBytes = width * bpp, padded = Math.ceil(rowBytes / 256) * 256;
    const size = sizeLimit(padded * height, Math.min(device.limits?.maxBufferSize ?? Infinity, 512 * 1024 * 1024));
    const pool = options.pool;
    if (pool && (!(pool instanceof SKGPUReadbackPool) || pool.Device !== device)) throw new TypeError('Readback pool must belong to the same GPUDevice.');
    const lease = pool ? pool._acquire(size) : null;
    const buffer = lease?.buffer ?? device.createBuffer({ label: 'SkiaSharp texture readback', size, usage: 9 });
    let success = false;
    try {
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture, mipLevel, origin: { x, y, z: layer } }, { buffer, bytesPerRow: padded, rowsPerImage: height }, { width, height, depthOrArrayLayers: 1 });
      device.queue.submit([encoder.finish()]); await buffer.mapAsync(1);
      const mapped = new Uint8Array(buffer.getMappedRange()), pixels = new Uint8Array(rowBytes * height);
      if (rowBytes === padded) pixels.set(mapped.subarray(0, pixels.length));
      else for (let row = 0; row < height; row++) pixels.set(mapped.subarray(row * padded, row * padded + rowBytes), row * rowBytes);
      const swizzle = format.startsWith('bgra') && options.swizzle !== false;
      if (swizzle) for (let i = 0; i < pixels.length; i += 4) { const r = pixels[i]; pixels[i] = pixels[i + 2]; pixels[i + 2] = r; }
      const result = new api.SKImageReadPixelsResult(pixels, rowBytes, width, height);
      result.Format = format; result.DataFormat = swizzle ? format.replace('bgra', 'rgba') : format; result.BytesPerPixel = bpp;
      const type = result.DataFormat.startsWith('rgba8unorm') ? K.ColorType.RGBA_8888 : result.DataFormat.startsWith('bgra8unorm') ? K.ColorType.BGRA_8888 : format === 'rgba16float' ? K.ColorType.RGBA_F16 : format === 'rgba32float' ? K.ColorType.RGBA_F32 : null;
      if (type) result.Info = new api.SKImageInfo(width, height, type, options.alphaType ?? K.AlphaType.Premul, options.colorSpace ?? null);
      success = true; return result;
    } finally {
      try { buffer.unmap(); } finally { if (lease) lease.release(success); else buffer.destroy(); }
    }
  };
  const C = api.SKGraphiteContext.prototype, oldSubmit = C.Submit, oldDispose = C.Dispose;
  C.Submit = function (info = new api.SKGraphiteSubmitInfo()) {
    const id = info.FrameID ?? 0;
    const numericId = typeof id === 'bigint' ? Number(id) : id;
    uint(numericId, 'FrameID');
    return oldSubmit.call(this, { ...info, FrameID: numericId });
  };
  C.SubmitAsync = async function (info = new api.SKGraphiteSubmitInfo()) {
    // Sync=true is fulfilled by awaiting the queue, never by blocking the UI.
    const success = this.Submit({ ...info, Sync: false });
    await this.Device.queue.onSubmittedWorkDone(); this.CheckAsyncWorkCompletion(); return success;
  };
  C.Dispose = function () {
    if (this._pendingReadbacks) throw new Error('Await pending Graphite readbacks before disposing their context.');
    return oldDispose.call(this);
  };
  C.RequestReadPixels = async function (surface, info, sourceRect, ...args) {
    this.ThrowIfDisposed(); surface.ThrowIfDisposed();
    if (surface.GraphiteRecorder?.Context !== this && surface.GraphiteContext !== this) throw new Error('Surface belongs to another Graphite context.');
    if (args.length !== 1 && args.length !== 3) throw new TypeError('Expected a callback, or rescale gamma, mode and callback.');
    const callback = args.at(-1); if (typeof callback !== 'function') throw new TypeError('RequestReadPixels requires a callback.');
    const gamma = args.length === 1 ? 0 : typeof args[0] === 'string' ? ['Src', 'Linear'].indexOf(args[0]) : value(args[0]);
    const mode = args.length === 1 ? 1 : typeof args[1] === 'string' ? ['Nearest', 'Linear', 'RepeatedLinear', 'RepeatedCubic'].indexOf(args[1]) : value(args[1]);
    if (![0, 1].includes(gamma) || ![0, 1, 2, 3].includes(mode)) throw new RangeError('Unknown rescale gamma or mode.');
    const width = uint(info.Width ?? info.width, 'width', 1), height = uint(info.Height ?? info.height, 'height', 1);
    const enumItem = (group, input, fallback) => input == null ? fallback : typeof input === 'number' ? group.values?.[input] ?? { value: input } : input;
    const ct = enumItem(K.ColorType, info.ColorType ?? info.colorType, K.ColorType.RGBA_8888), at = enumItem(K.AlphaType, info.AlphaType ?? info.alphaType, K.AlphaType.Premul);
    const space = info.ColorSpace ?? info.colorSpace ?? null; space?.ThrowIfDisposed?.();
    const publicInfo = new api.SKImageInfo(width, height, ct, at, space), rowBytes = width * publicInfo.BytesPerPixel;
    const total = sizeLimit(rowBytes * height);
    const rect = sourceRect?.ToArray?.() ?? [sourceRect?.Left, sourceRect?.Top, sourceRect?.Right, sourceRect?.Bottom];
    if (rect.length !== 4 || rect.some(x => !Number.isInteger(x)) || rect[0] < 0 || rect[1] < 0 || rect[2] <= rect[0] || rect[3] <= rect[1] || rect[2] > surface.Width || rect[3] > surface.Height) throw new RangeError('Readback source rectangle must lie inside the surface.');
    // Retain color metadata independently of the caller's wrapper lifetime.
    const nativeSpace = space?._native ?? space, ownedSpace = nativeSpace?.clone?.();
    const heldSpace = ownedSpace ? api.SKColorSpace._fromNative(ownedSpace) : null;
    this._pendingReadbacks = (this._pendingReadbacks ?? 0) + 1;
    try {
      surface.Flush();
      const pixels = await new Promise((resolve, reject) => {
        try {
          this._native.readPixels(surface._native, { width, height, colorType: ct, alphaType: at, colorSpace: ownedSpace ?? nativeSpace }, rect, gamma, mode, resolve);
          this.Submit();
          this.Device.queue.onSubmittedWorkDone().then(() => { try { this.CheckAsyncWorkCompletion(); } catch (error) { reject(error); } }, reject);
        } catch (error) { reject(error); }
      });
      let result = null;
      if (pixels) {
        const bytes = ArrayBuffer.isView(pixels) ? new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength).slice() : new Uint8Array(pixels);
        if (bytes.byteLength !== total) throw new Error('Native readback returned an unexpected byte count.');
        result = new api.SKImageReadPixelsResult(bytes, rowBytes, width, height);
        result.Info = new api.SKImageInfo(width, height, ct, at, heldSpace);
        const dispose = result.Dispose.bind(result); result.Dispose = () => { if (!result.IsDisposed) { dispose(); heldSpace?.Dispose(); } };
      }
      if (!result) heldSpace?.Dispose();
      try { callback(result); } catch (error) { result?.Dispose(); throw error; }
      return result;
    } catch (error) { heldSpace?.Dispose(); throw error; }
    finally { this._pendingReadbacks--; }
  };
  api.SKGPUReadbackPool = SKGPUReadbackPool;
  api.GPUReadbackFormats = Object.freeze([...formats.keys()]);
}
