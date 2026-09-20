/** Browser GPU interop. Desktop pointer-based APIs cannot be imported into a browser. */
export function createGpuAPI(K, api) {
  const { SKObject, SKNotSupportedError = Error } = api;
  const unwrap = x => x?._native ?? x;
  const unsupported = message => { throw new SKNotSupportedError(message); };
  const positive = (x, name) => { if (!Number.isInteger(x) || x < 1) throw new RangeError(`${name} must be a positive integer.`); return x; };
  const nonnegative = (x, name) => { if (!Number.isSafeInteger(x) || x < 0) throw new RangeError(`${name} must be a non-negative safe integer.`); return x; };
  const GRBackend = Object.freeze({ Metal: 0, OpenGL: 1, Vulkan: 2, Dawn: 3, Direct3D: 4, Unsupported: 5 });
  const GRSurfaceOrigin = Object.freeze({ TopLeft: 0, BottomLeft: 1 });
  const GRGlBackendState = Object.freeze({ None: 0, RenderTarget: 1, TextureBinding: 2, View: 4, Blend: 8, MSAAEnable: 16, Vertex: 32, Stencil: 64, PixelStore: 128, Program: 256, FixedFunction: 512, Misc: 1024, PathRendering: 2048, All: 65535 });
  const GRBackendState = Object.freeze({ None: 0, All: 0xffffffff });
  const SKGraphiteBackend = Object.freeze({ Dawn: 0, Metal: 1, Vulkan: 2, Unknown: -1 });
  const SKGraphiteInsertStatus = Object.freeze({ Success: 0, InvalidRecording: 1, PromiseInstantiationFailed: 2, AddCommandsFailed: 3, AsyncShaderCompilesFailed: 4, OutOfOrderRecording: 5 });
  const nativeGraphite = () => K.SkiaSharpNativeGpuVersion === 1 && typeof K.SkiaSharpMakeGraphiteDawn === 'function';
  const dimensions = (width, height) => ({ Size: api.SKSizeI ? new api.SKSizeI(width, height) : { Width: width, Height: height }, Rect: api.SKRectI ? new api.SKRectI(0, 0, width, height) : new api.SKRect(0, 0, width, height) });
  const imageInfo = info => ({ width: info.Width ?? info.width, height: info.Height ?? info.height, colorType: info.ColorType ?? info.colorType ?? K.ColorType.RGBA_8888, alphaType: info.AlphaType ?? info.alphaType ?? K.AlphaType.Premul, colorSpace: unwrap(info.ColorSpace ?? info.colorSpace) ?? K.ColorSpace.SRGB });
  const desktopOnly = name => unsupported(`${name} requires process-local native driver handles. Browser applications use CreateGl with WebGL or CreateDawn with a GPUDevice and the native Graphite extension.`);
  class GRGlFramebufferInfo {
    constructor(framebufferObjectId = 0, format = 0x8058) { this.FramebufferObjectId = framebufferObjectId; this.Format = format; this.Protected = false; }
    Equals(other) { return other instanceof GRGlFramebufferInfo && this.FramebufferObjectId === other.FramebufferObjectId && this.Format === other.Format && this.Protected === other.Protected; }
    GetHashCode() { return (Number(this.FramebufferObjectId) ^ this.Format ^ Number(this.Protected)) | 0; }
  }
  class GRGlTextureInfo {
    constructor(target = 0x0de1, id = null, format = 0x8058) { this.Target = target; this.Id = id; this.Format = format; this.Protected = false; }
    Equals(other) { return other instanceof GRGlTextureInfo && this.Target === other.Target && this.Id === other.Id && this.Format === other.Format && this.Protected === other.Protected; }
    GetHashCode() { return (this.Target ^ Number(this.Id) ^ this.Format ^ Number(this.Protected)) | 0; }
  }
  class GRBackendRenderTarget extends SKObject {
    constructor(width, height, sampleCount = 0, stencilBits = 0, glInfo = new GRGlFramebufferInfo()) {
      super(null, false); this.Width = positive(width, 'width'); this.Height = positive(height, 'height'); this.SampleCount = nonnegative(sampleCount, 'sampleCount'); this.StencilBits = nonnegative(stencilBits, 'stencilBits');
      if (!(glInfo instanceof GRGlFramebufferInfo)) desktopOnly('GRBackendRenderTarget');
      this._info = new GRGlFramebufferInfo(glInfo.FramebufferObjectId, glInfo.Format); this._info.Protected = glInfo.Protected; this.Backend = GRBackend.OpenGL;
    }
    get IsValid() { return !this.IsDisposed && !this._info.Protected; }
    get Size() { return dimensions(this.Width, this.Height).Size; }
    get Rect() { return dimensions(this.Width, this.Height).Rect; }
    GetGlFramebufferInfo(out) { this.ThrowIfDisposed(); const result = new GRGlFramebufferInfo(this._info.FramebufferObjectId, this._info.Format); result.Protected = this._info.Protected; if (out) { Object.assign(out, result); return true; } return result; }
  }
  class GRBackendTexture extends SKObject {
    constructor(width, height, mipmapped = false, glInfo) {
      super(null, false); this.Width = positive(width, 'width'); this.Height = positive(height, 'height'); this.HasMipMaps = !!mipmapped;
      if (!(glInfo instanceof GRGlTextureInfo)) desktopOnly('GRBackendTexture');
      this._info = new GRGlTextureInfo(glInfo.Target, glInfo.Id, glInfo.Format); this._info.Protected = glInfo.Protected; this.Backend = GRBackend.OpenGL;
    }
    get IsValid() { return !this.IsDisposed && this._info.Id != null && this._info.Id !== 0 && !this._info.Protected; }
    get Size() { return dimensions(this.Width, this.Height).Size; }
    get Rect() { return dimensions(this.Width, this.Height).Rect; }
    GetGlTextureInfo(out) { this.ThrowIfDisposed(); const result = new GRGlTextureInfo(this._info.Target, this._info.Id, this._info.Format); result.Protected = this._info.Protected; if (out) { Object.assign(out, result); return true; } return result; }
  }
  class GRGlInterface extends SKObject {
    constructor(handle, gl = null, ownsHandle = false) { super(null, false); this.Handle = handle; this.WebGLContext = gl; this._ownsHandle = ownsHandle; this._users = 0; }
    static Create(target, attributes = {}) { return this.CreateWebGl(target, attributes); }
    static CreateWebGl(target, attributes = {}) {
      if (target instanceof GRGlInterface) { target.ThrowIfDisposed(); return target; }
      if (typeof target === 'number') { if (target <= 0) return null; return new GRGlInterface(target); }
      if (typeof target === 'function') return unsupported('WebGL does not expose native procedure pointers. Pass a canvas, WebGLRenderingContext, or CanvasKit context handle.');
      if (!target) { if (typeof OffscreenCanvas !== 'undefined') target = new OffscreenCanvas(1, 1); else if (typeof document !== 'undefined') target = document.createElement('canvas'); else return null; }
      const element = target.canvas ?? target;
      if (!element?.getContext) throw new TypeError('A canvas or a WebGL context is required.');
      if (typeof K.GetWebGLContext !== 'function') return null;
      const handle = K.GetWebGLContext(element, { alpha: 1, stencil: 8, preserveDrawingBuffer: 1, ...attributes });
      if (!handle || handle < 0) return null;
      const gl = target.canvas ? target : element.getContext('webgl2') || element.getContext('webgl') || element.getContext('experimental-webgl');
      return new GRGlInterface(handle, gl, true);
    }
    static CreateGles(...args) { return this.CreateWebGl(...args); }
    static CreateAngle(...args) { return this.CreateWebGl(...args); }
    static CreateOpenGl(...args) { return this.CreateWebGl(...args); }
    Validate() { this.ThrowIfDisposed(); return this.Handle > 0 && !this.WebGLContext?.isContextLost?.(); }
    HasExtension(extension) { this.ThrowIfDisposed(); return !!this.WebGLContext?.getExtension(extension); }
    _retain() { this.ThrowIfDisposed(); this._users++; }
    _release() { this._users--; if (this._users === 0 && this._pendingDispose) this.Dispose(); }
    Dispose() { if (this.IsDisposed) return; if (this._users) { this._pendingDispose = true; return; } if (this._ownsHandle && this.Handle) K.deleteContext(this.Handle); this.Handle = 0; super.Dispose(); }
  }
  class GRContextOptions {
    constructor(options = {}) { Object.assign(this, { AvoidStencilBuffers: false, RuntimeProgramCacheSize: 256, GlyphCacheTextureMaximumBytes: 0, AllowPathMaskCaching: true, DoManualMipmapping: false, BufferMapThreshold: -1 }, options); }
  }
  class GRRecordingContext extends SKObject {
    get Backend() { return GRBackend.OpenGL; }
    get IsAbandoned() { return this.IsDisposed || this._abandoned || !!this.WebGLContext?.isContextLost?.(); }
    get MaxTextureSize() { this._check(); return this._native.maxTextureSize?.() ?? this.WebGLContext?.getParameter(this.WebGLContext.MAX_TEXTURE_SIZE) ?? unsupported('Texture limits require a WebGL context or native extension.'); }
    get MaxRenderTargetSize() { this._check(); return this._native.maxRenderTargetSize?.() ?? this.WebGLContext?.getParameter(this.WebGLContext.MAX_RENDERBUFFER_SIZE) ?? unsupported('Render-target limits require a WebGL context or native extension.'); }
    GetMaxSurfaceSampleCount(colorType = K.ColorType.RGBA_8888) {
      this._check(); if (K.SkiaSharpGaneshMaxSampleCount) return K.SkiaSharpGaneshMaxSampleCount(this._native, colorType);
      const gl = this.WebGLContext; if (!gl?.getInternalformatParameter) return 0;
      if (colorType !== K.ColorType.RGBA_8888 && colorType !== K.ColorType.BGRA_8888) return unsupported('Format-specific Skia sample limits require the native extension.');
      const counts = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA8, gl.SAMPLES); return counts?.length ? Math.max(...counts) : 0;
    }
  }
  class GRContext extends GRRecordingContext {
    constructor(native, glInterface, ownsNative = true) { super(native, ownsNative); if (!native) throw new Error('Skia could not create the Ganesh context.'); this.Interface = glInterface; glInterface?._retain(); this.WebGLContext = glInterface?.WebGLContext; this._surfaces = new Set(); this._abandoned = false; }
    static CreateGl(backendContext, options) {
      if (backendContext instanceof GRContextOptions || backendContext && !backendContext.getContext && !backendContext.canvas && !(backendContext instanceof GRGlInterface) && typeof backendContext === 'object') { options = backendContext; backendContext = undefined; }
      const ownInterface = !(backendContext instanceof GRGlInterface), iface = GRGlInterface.Create(backendContext);
      if (!iface) return null;
      const configured = options && Object.keys(options).some(k => options[k] !== new GRContextOptions()[k]);
      if (configured && !K.SkiaSharpMakeGaneshGl) { if (ownInterface) iface.Dispose(); return unsupported('Non-default GRContextOptions require the native Ganesh extension.'); }
      let native;
      try { native = configured ? K.SkiaSharpMakeGaneshGl(iface.Handle, options) : K.MakeWebGLContext(iface.Handle); if (!native) { if (ownInterface) iface.Dispose(); return null; } const result = new GRContext(native, iface); result._ownsInterface = ownInterface; return result; }
      catch (error) { native?.delete(); if (ownInterface) iface.Dispose(); throw error; }
    }
    static CreateVulkan() { return desktopOnly('GRContext.CreateVulkan'); }
    static CreateMetal() { return desktopOnly('GRContext.CreateMetal'); }
    static CreateDirect3D() { return desktopOnly('GRContext.CreateDirect3D'); }
    static FromSurface(surface) {
      surface.ThrowIfDisposed(); if (!surface._grContext) return null;
      if (surface._gpuContext && !surface._gpuContext.IsDisposed) return surface._gpuContext;
      const gl = surface.Element?.getContext?.('webgl2') || surface.Element?.getContext?.('webgl');
      const result = new GRContext(surface._grContext, new GRGlInterface(surface._glHandle, gl), false); result._sourceSurface = surface; result._surfaces.add(surface); surface._gpuContext = result; return result;
    }
    _check() { this.ThrowIfDisposed(); this._sourceSurface?.ThrowIfDisposed(); if (this.IsAbandoned) throw new Error('The GPU context has been abandoned or lost.'); }
    _current() { this._check(); if (K.SkiaSharpSetCurrentContext) K.SkiaSharpSetCurrentContext(this.Interface.Handle); else this._native.getResourceCacheLimitBytes(); }
    GetResourceCacheLimit() { this._current(); return Number(this._native._getResourceCacheLimitBytes()); }
    SetResourceCacheLimit(bytes) { this._check(); nonnegative(bytes, 'bytes'); this._native.setResourceCacheLimitBytes(bytes); }
    GetResourceCacheUsage(resourceCount, resourceBytes) {
      this._current(); const count = K.SkiaSharpGaneshResourceCount ? K.SkiaSharpGaneshResourceCount(this._native) : null; const bytes = Number(this._native._getResourceCacheUsageBytes());
      if (resourceCount) resourceCount.value = count; if (resourceBytes) resourceBytes.value = bytes;
      return { ResourceCount: count, ResourceBytes: bytes, ResourceCountAvailable: count !== null };
    }
    ResetContext(state = GRBackendState.All) {
      this._current(); if (K.SkiaSharpGaneshResetContext) { K.SkiaSharpGaneshResetContext(this._native, state >>> 0); return; }
      if (state === 0) return;
      if (state !== GRGlBackendState.TextureBinding) return unsupported('ResetContext with this state mask requires the native Ganesh extension; stock CanvasKit exposes texture-binding reset only.');
      this._getControlSurface()._resetContext();
    }
    _getControlSurface() { this._check(); if (!this._controlSurface) this._controlSurface = K.MakeRenderTarget(this._native, 1, 1); if (!this._controlSurface) throw new Error('Unable to create GPU control surface.'); return this._controlSurface; }
    Flush(targetOrSubmit = false, synchronous = false) {
      this._check(); if (targetOrSubmit?._native) { targetOrSubmit.Flush?.(); if (!targetOrSubmit.Flush && K.SkiaSharpGaneshFlushImage) K.SkiaSharpGaneshFlushImage(this._native, targetOrSubmit._native); else if (!targetOrSubmit.Flush) this.Flush(); return; }
      if (K.SkiaSharpGaneshFlush) { this._current(); K.SkiaSharpGaneshFlush(this._native); } else { for (const surface of this._surfaces) if (!surface.IsDisposed) surface.Flush(); this._controlSurface?.flush(); }
      if (targetOrSubmit || synchronous) this.Submit(synchronous);
    }
    Submit(synchronous = false) { this._current(); if (K.SkiaSharpGaneshSubmit) K.SkiaSharpGaneshSubmit(this._native, !!synchronous); else { const gl = this.WebGLContext; if (!gl) return unsupported('Submitting requires a WebGL context or the native extension.'); if (synchronous) gl.finish(); else gl.flush(); } }
    async SubmitAsync() { this.Flush(true); await waitForGL(this.WebGLContext); if (K.SkiaSharpGaneshCheckAsync) this.CheckAsyncWorkCompletion(); }
    CheckAsyncWorkCompletion() { this._current(); if (!K.SkiaSharpGaneshCheckAsync) return unsupported('Native asynchronous completion callbacks require the Ganesh extension. SubmitAsync waits for browser GL completion independently.'); K.SkiaSharpGaneshCheckAsync(this._native); }
    PurgeResources() { this._current(); if (K.SkiaSharpGaneshPurge) K.SkiaSharpGaneshPurge(this._native); else { const limit = this.GetResourceCacheLimit(); try { this.SetResourceCacheLimit(0); } finally { this.SetResourceCacheLimit(limit); } } }
    PurgeUnlockedResources(bytesOrScratch = false, preferScratch = false) { this._current(); if (K.SkiaSharpGaneshPurgeUnlocked) return K.SkiaSharpGaneshPurgeUnlocked(this._native, typeof bytesOrScratch === 'boolean' ? -1 : bytesOrScratch, typeof bytesOrScratch === 'boolean' ? bytesOrScratch : preferScratch); if (bytesOrScratch === false) return this.PurgeResources(); return unsupported('Selective GPU cache purging requires the native Ganesh extension.'); }
    PurgeUnusedResources(milliseconds) { this._current(); nonnegative(milliseconds, 'milliseconds'); if (K.SkiaSharpGaneshDeferredCleanup) return K.SkiaSharpGaneshDeferredCleanup(this._native, milliseconds); if (milliseconds === 0) return this.PurgeResources(); return unsupported('Age-selective GPU cache purging requires the native Ganesh extension.'); }
    AbandonContext(releaseResources = false) { this._check(); if (K.SkiaSharpGaneshAbandon) K.SkiaSharpGaneshAbandon(this._native, releaseResources); else if (releaseResources) this._native.releaseResourcesAndAbandonContext(); else return unsupported('Non-releasing abandonment requires the native Ganesh extension. Call AbandonContext(true) while the GL context remains valid.'); this._abandoned = true; }
    Dispose() { if (this.IsDisposed) return; const live = [...this._surfaces].filter(x => !x.IsDisposed); if (this._ownsNative && live.length) throw new Error('Dispose surfaces before their owning GRContext.'); this._controlSurface?.dispose(); this._controlSurface = null; super.Dispose(); this.Interface?._release(); if (this._ownsInterface) this.Interface?.Dispose(); }
  }
  function attachSurface(native, context, element = null) {
    if (!native) return null; const surface = new api.SKSurface(native, 'webgl', element); surface._gpuContext = context; context._surfaces.add(surface);
    const dispose = surface.Dispose.bind(surface); surface.Dispose = () => { if (surface.IsDisposed) return; dispose(); context._surfaces.delete(surface); }; return surface;
  }
  function createRenderTarget(context, budgeted, info, sampleCount = 0, origin = GRSurfaceOrigin.BottomLeft, properties = null, shouldCreateWithMips = false) {
    context._check(); const ii = imageInfo(info); positive(ii.width, 'width'); positive(ii.height, 'height');
    if (K.SkiaSharpGaneshRenderTarget) { context._current(); return attachSurface(K.SkiaSharpGaneshRenderTarget(context._native, !!budgeted, ii, sampleCount, origin, !!shouldCreateWithMips), context); }
    if (sampleCount !== 0 || origin !== GRSurfaceOrigin.BottomLeft || properties || shouldCreateWithMips || budgeted === false) return unsupported('Custom render-target budget, samples, origin, properties or mipmaps require the native Ganesh extension.');
    return attachSurface(K.MakeRenderTarget(context._native, ii), context);
  }
  function createBackendSurface(context, target, origin = GRSurfaceOrigin.BottomLeft, colorType = K.ColorType.RGBA_8888, colorSpace = null) {
    context._check(); target.ThrowIfDisposed(); if (!target.IsValid) return null;
    if (K.SkiaSharpGaneshWrapFramebuffer) { context._current(); return attachSurface(K.SkiaSharpGaneshWrapFramebuffer(context._native, target.Width, target.Height, target.SampleCount, target.StencilBits, target._info.FramebufferObjectId, target._info.Format, origin, colorType, unwrap(colorSpace)), context); }
    if (target._info.FramebufferObjectId !== 0 || origin !== GRSurfaceOrigin.BottomLeft || colorType !== K.ColorType.RGBA_8888 || target._info.Format !== 0x8058) return unsupported('This framebuffer format, origin or external framebuffer requires the native Ganesh extension. Stock CanvasKit wraps only the default RGBA framebuffer.');
    return attachSurface(K.MakeOnScreenGLSurface(context._native, target.Width, target.Height, unwrap(colorSpace) ?? K.ColorSpace.SRGB, target.SampleCount, target.StencilBits), context, context.WebGLContext?.canvas);
  }
  function importTexture(context, backendTexture, origin = GRSurfaceOrigin.TopLeft, colorType = K.ColorType.RGBA_8888, alphaType = K.AlphaType.Premul, colorSpace = null, releaseCallback = null, releaseContext = null) {
    context._check(); backendTexture.ThrowIfDisposed(); if (!backendTexture.IsValid) return null;
    if (origin !== GRSurfaceOrigin.TopLeft || colorType !== K.ColorType.RGBA_8888 || backendTexture._info.Target !== 0x0de1) return unsupported('Browser texture copy import currently requires a top-left RGBA8888 TEXTURE_2D.');
    const gl = context.WebGLContext, source = backendTexture._info.Id; if (!gl || typeof source !== 'object' || !gl.isTexture(source)) throw new TypeError('GRGlTextureInfo.Id must be a live WebGLTexture belonging to this context.');
    const oldFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING), oldTexture = gl.getParameter(gl.TEXTURE_BINDING_2D), framebuffer = gl.createFramebuffer(); let copied = null, native = null;
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, source, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('The supplied texture is not framebuffer-complete.');
      copied = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, copied); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, backendTexture.Width, backendTexture.Height, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, oldFramebuffer); gl.bindTexture(gl.TEXTURE_2D, oldTexture);
      const control = context._getControlSurface(); control._resetContext(); native = control.makeImageFromTexture(copied, { width: backendTexture.Width, height: backendTexture.Height, colorType, alphaType, colorSpace: unwrap(colorSpace) ?? K.ColorSpace.SRGB });
      if (!native) throw new Error('Skia could not import the copied WebGL texture.'); copied = null;
      const image = api.SKImage._fromNative(native); image.TextureImportMode = 'gpu-copy'; try { releaseCallback?.(releaseContext); } catch (error) { image.Dispose(); throw error; } return image;
    } finally { gl.bindFramebuffer(gl.FRAMEBUFFER, oldFramebuffer); gl.bindTexture(gl.TEXTURE_2D, oldTexture); gl.deleteFramebuffer(framebuffer); if (copied) gl.deleteTexture(copied); }
  }
  class SKGraphiteDawnBackendContext extends SKObject { constructor(device, instance = null, queue = device?.queue) { super(null, false); this.WgpuDevice = device; this.WgpuInstance = instance; this.WgpuQueue = queue; } }
  class SKGraphiteContextOptions { constructor(options = {}) { Object.assign(this, { DisableDriverCorrectnessWorkarounds: false, InternalMultisampleCount: 4, GpuBudgetInBytes: 256 * 1024 * 1024, RequireOrderedRecordings: false, SetBackendLabels: false }, options); } }
  class SKGraphiteSubmitInfo { constructor(options = {}) { Object.assign(this, { Sync: false, MarkBoundary: false, FrameID: 0 }, options); } }
  class SKGraphiteInsertRecordingInfo { constructor(recording, options = {}) { Object.assign(this, { Recording: recording, TargetSurface: null, TargetTranslationX: 0, TargetTranslationY: 0, TargetClip: null }, options); } }
  class SKGraphiteContext extends SKObject {
    static IsBackendAvailable(backend) { return backend === SKGraphiteBackend.Dawn && nativeGraphite(); }
    static CreateDawn(backendContext, options = new SKGraphiteContextOptions()) {
      if (!nativeGraphite()) return unsupported('The loaded CanvasKit binary does not contain the native Graphite bridge. Build native/skiasharp_gpu.cpp and initialize with that CanvasKit module. A WebGPU texture presenter is not a Graphite context.');
      backendContext?.ThrowIfDisposed?.(); const device = backendContext?.WgpuDevice ?? backendContext;
      if (!device?.queue) throw new TypeError('CreateDawn requires a WebGPU GPUDevice.');
      const native = K.SkiaSharpMakeGraphiteDawn(device, options); if (!native) return null;
      const result = new SKGraphiteContext(native); result.Device = device; result._children = new Set(); result._lost = false; device.lost?.then(() => { result._lost = true; }); return result;
    }
    static CreateMetal() { return desktopOnly('SKGraphiteContext.CreateMetal'); }
    static CreateVulkan() { return desktopOnly('SKGraphiteContext.CreateVulkan'); }
    get Backend() { return SKGraphiteBackend.Dawn; }
    get IsDeviceLost() { return this.IsDisposed || this._lost || this._native.isDeviceLost(); }
    get MaxTextureSize() { this.ThrowIfDisposed(); return this._native.maxTextureSize(); }
    get SupportsProtectedContent() { this.ThrowIfDisposed(); return this._native.supportsProtectedContent(); }
    get CurrentBudgetedBytes() { this.ThrowIfDisposed(); return Number(this._native.currentBudgetedBytes()); }
    get MaxBudgetedBytes() { this.ThrowIfDisposed(); return Number(this._native.maxBudgetedBytes()); }
    CreateRecorder(budget = -1) { this.ThrowIfDisposed(); const native = this._native.makeRecorder(budget); if (!native) return null; const recorder = new SKGraphiteRecorder(native); recorder.Context = this; recorder._surfaces = new Set(); this._children.add(recorder); return recorder; }
    InsertRecording(value) { this.ThrowIfDisposed(); const info = value instanceof SKGraphiteInsertRecordingInfo ? value : new SKGraphiteInsertRecordingInfo(value); info.Recording?.ThrowIfDisposed(); if (info.Recording?.Context !== this) throw new Error('Recording belongs to another Graphite context.'); return this._native.insertRecording(info.Recording._native, unwrap(info.TargetSurface), info.TargetTranslationX, info.TargetTranslationY, info.TargetClip?.ToArray?.() ?? [0, 0, 0, 0]); }
    Submit(info = new SKGraphiteSubmitInfo()) { this.ThrowIfDisposed(); if (info.Sync) return unsupported('Synchronous Graphite submit cannot block the browser main thread. Await SubmitAsync instead.'); return this._native.submit(!!info.MarkBoundary, info.FrameID ?? 0); }
    async SubmitAsync(info) { const success = this.Submit(info); await this.Device.queue.onSubmittedWorkDone(); this.CheckAsyncWorkCompletion(); return success; }
    CheckAsyncWorkCompletion() { this.ThrowIfDisposed(); this._native.checkAsyncWorkCompletion(); }
    FreeGpuResources() { this.ThrowIfDisposed(); this._native.freeGpuResources(); }
    PerformDeferredCleanup(duration) { this.ThrowIfDisposed(); this._native.performDeferredCleanup(duration?.TotalMilliseconds ?? duration); }
    DeleteBackendTexture(texture) { this.ThrowIfDisposed(); texture.ThrowIfDisposed(); this._native.deleteBackendTexture(texture._native); texture.Dispose(); }
    async RequestReadPixels(surface, info, sourceRect, ...args) {
      this.ThrowIfDisposed(); surface.ThrowIfDisposed(); const ii = imageInfo(info); if (ii.colorType !== K.ColorType.RGBA_8888 && ii.colorType !== K.ColorType.BGRA_8888) throw new TypeError('Graphite readback currently requires an RGBA8888 or BGRA8888 destination.'); const callback = args.at(-1); if (typeof callback !== 'function') throw new TypeError('RequestReadPixels requires a callback.');
      surface.Flush(); const rect = sourceRect.ToArray?.() ?? [sourceRect.Left, sourceRect.Top, sourceRect.Right, sourceRect.Bottom];
      const result = await new Promise((resolve, reject) => { try { this._native.readPixels(surface._native, imageInfo(info), rect, args.length > 1 ? args[0] : 0, args.length > 2 ? args[1] : 0, resolve); this.Submit(); this.Device.queue.onSubmittedWorkDone().then(() => { try { this.CheckAsyncWorkCompletion(); } catch (error) { reject(error); } }, reject); } catch (error) { reject(error); } });
      const data = result ? new SKImageReadPixelsResult(new Uint8Array(result), (info.Width ?? info.width) * 4, info.Width ?? info.width, info.Height ?? info.height) : null; callback(data); return data;
    }
    Dispose() { if (this.IsDisposed) return; if ([...this._children].some(x => !x.IsDisposed)) throw new Error('Dispose Graphite recorders and recordings before their context.'); if (this._native.hasUnfinishedGpuWork()) throw new Error('Await SubmitAsync() or DisposeAsync() before disposing a Graphite context with unfinished GPU work.'); super.Dispose(); }
    async DisposeAsync() { if (this.IsDisposed) return; await this.Device.queue.onSubmittedWorkDone(); this.CheckAsyncWorkCompletion(); this.Dispose(); }
  }
  class SKGraphiteRecorder extends SKObject {
    get Backend() { return SKGraphiteBackend.Dawn; }
    get MaxTextureSize() { this.ThrowIfDisposed(); return this._native.maxTextureSize(); }
    GetImageCacheStatistics(){this.ThrowIfDisposed();if(!this._native.imageCacheStats)return null;return this._native.imageCacheStats();}
    PurgeImageCache(){this.ThrowIfDisposed();this._native.purgeImageCache?.();}
    Snap() { this.ThrowIfDisposed(); const native = this._native.snap(); if (!native) return null; const recording = new SKGraphiteRecording(native); recording.Context = this.Context; this.Context._children.add(recording); return recording; }
    CreateBackendTexture(width, height, info) { this.ThrowIfDisposed(); const native = this._native.createBackendTexture(positive(width, 'width'), positive(height, 'height'), unwrap(info)); return SKGraphiteBackendTexture._fromNative(native); }
    DeleteBackendTexture(texture) { this.ThrowIfDisposed(); texture.ThrowIfDisposed(); this._native.deleteBackendTexture(texture._native); texture.Dispose(); }
    Dispose() { if (this.IsDisposed) return; if ([...this._surfaces].some(x => !x.IsDisposed)) throw new Error('Dispose Graphite surfaces before their recorder.'); super.Dispose(); this.Context?._children.delete(this); }
  }
  class SKGraphiteRecording extends SKObject { Dispose() { if (this.IsDisposed) return; super.Dispose(); this.Context?._children.delete(this); } }
  class SKGraphiteTextureInfo extends SKObject {
    static CreateDawn(format = 'rgba8unorm', usage = 0x1f, sampleCount = 1, mipmapped = false) { if (!nativeGraphite()) return unsupported('Native Graphite texture descriptors require the native Graphite extension.'); return this._fromNative(K.SkiaSharpGraphiteTextureInfo(format, usage, sampleCount, mipmapped)); }
    static CreateVulkan() { return desktopOnly('SKGraphiteTextureInfo.CreateVulkan'); }
    get IsValid() { return !this.IsDisposed && this._native.isValid(); }
    get Backend() { return SKGraphiteBackend.Dawn; }
    get SampleCount() { this.ThrowIfDisposed(); return this._native.sampleCount(); }
    get Mipmapped() { this.ThrowIfDisposed(); return this._native.mipmapped(); }
  }
  class SKGraphiteBackendTexture extends SKObject {
    static CreateDawn(texture) { if (!nativeGraphite()) return unsupported('Native Graphite texture import requires the native Graphite extension.'); return this._fromNative(K.SkiaSharpGraphiteTexture(texture)); }
    static CreateMetal() { return desktopOnly('SKGraphiteBackendTexture.CreateMetal'); }
    static CreateVulkan() { return desktopOnly('SKGraphiteBackendTexture.CreateVulkan'); }
    get IsValid() { return !this.IsDisposed && this._native.isValid(); }
    get Backend() { return SKGraphiteBackend.Dawn; }
    get Dimensions() { this.ThrowIfDisposed(); return dimensions(this._native.width(), this._native.height()).Size; }
  }
  class SKImageReadPixelsResult extends SKObject {
    constructor(bytes, rowBytes, width, height) { super(null, false); this._bytes = bytes; this.RowBytes = rowBytes; this.Width = width; this.Height = height; }
    get Count() { this.ThrowIfDisposed(); return this._bytes ? 1 : 0; }
    GetData(plane = 0) { this.ThrowIfDisposed(); if (plane !== 0) throw new RangeError('Only one RGBA plane is present.'); return this._bytes; }
    GetRowBytes(plane = 0) { this.GetData(plane); return this.RowBytes; }
    Dispose() { this._bytes = null; super.Dispose(); }
  }
  async function readWebGPUTexture(device, texture, { width = texture.width, height = texture.height, x = 0, y = 0, format = texture.format, mipLevel = 0 } = {}) {
    positive(width, 'width'); positive(height, 'height'); nonnegative(x, 'x'); nonnegative(y, 'y'); nonnegative(mipLevel, 'mipLevel');
    const levelWidth = Math.max(1, Math.floor(texture.width / 2 ** mipLevel)), levelHeight = Math.max(1, Math.floor(texture.height / 2 ** mipLevel));
    if (x + width > levelWidth || y + height > levelHeight || texture.mipLevelCount !== undefined && mipLevel >= texture.mipLevelCount) throw new RangeError('Readback rectangle is outside the selected texture mip level.');
    if (texture.usage !== undefined && !(texture.usage & 0x01)) throw new TypeError('The texture must include GPUTextureUsage.COPY_SRC.');
    if (!['rgba8unorm', 'rgba8unorm-srgb', 'bgra8unorm', 'bgra8unorm-srgb'].includes(format)) throw new TypeError('Readback supports RGBA8 and BGRA8 textures.');
    const rowBytes = width * 4, padded = Math.ceil(rowBytes / 256) * 256;
    const buffer = device.createBuffer({ label: 'SkiaSharp texture readback', size: padded * height, usage: 0x0001 | 0x0008 });
    try { const encoder = device.createCommandEncoder(); encoder.copyTextureToBuffer({ texture, mipLevel, origin: { x, y, z: 0 } }, { buffer, bytesPerRow: padded, rowsPerImage: height }, { width, height, depthOrArrayLayers: 1 }); device.queue.submit([encoder.finish()]); await buffer.mapAsync(1); const mapped = new Uint8Array(buffer.getMappedRange()), pixels = new Uint8Array(rowBytes * height); for (let row = 0; row < height; row++) pixels.set(mapped.subarray(row * padded, row * padded + rowBytes), row * rowBytes); if (format.startsWith('bgra')) for (let i = 0; i < pixels.length; i += 4) { const r = pixels[i]; pixels[i] = pixels[i + 2]; pixels[i + 2] = r; } return new SKImageReadPixelsResult(pixels, rowBytes, width, height); } finally { buffer.unmap(); buffer.destroy(); }
  }
  function createGraphiteSurface(recorder, target, colorType = K.ColorType.RGBA_8888, colorSpace = null) {
    recorder.ThrowIfDisposed(); target.ThrowIfDisposed(); const native = K.SkiaSharpGraphiteSurface(recorder._native, target._native, colorType, unwrap(colorSpace) ?? K.ColorSpace.SRGB); if (!native) return null;
    const surface = new api.SKSurface(native, 'graphite-webgpu'); surface.GraphiteRecorder = recorder; surface.RenderMode = 'skia-graphite-webgpu'; recorder._surfaces.add(surface);
    surface.Flush = () => { surface.ThrowIfDisposed(); const recording = recorder.Snap(); if (!recording) return; try { const status = recorder.Context.InsertRecording(recording); if (status !== SKGraphiteInsertStatus.Success) throw new Error(`Graphite recording insertion failed: ${status}`); recorder.Context.Submit(); } finally { recording.Dispose(); } };
    const dispose = surface.Dispose.bind(surface); surface.Dispose = () => { if (surface.IsDisposed) return; dispose(); recorder._surfaces.delete(surface); }; return surface;
  }
  if (api.SKSurface) {
    const create = api.SKSurface.Create; api.SKSurface.Create = function(target, ...args) { if (target instanceof GRContext) { if (args[0] instanceof GRBackendRenderTarget) return createBackendSurface(target, ...args); if (typeof args[0] === 'boolean') return createRenderTarget(target, ...args); } if (target instanceof SKGraphiteRecorder) return createGraphiteSurface(target, ...args); return create.call(this, target, ...args); };
    api.SKSurface.CreateRenderTarget = createRenderTarget; api.SKSurface.CreateFromBackendRenderTarget = createBackendSurface; api.SKSurface.CreateGraphite = createGraphiteSurface;
    Object.defineProperty(api.SKSurface.prototype, 'Context', { configurable: true, get() { this.ThrowIfDisposed(); return this._gpuContext && !this._gpuContext.IsDisposed ? this._gpuContext : GRContext.FromSurface(this); } });
  }
  if (api.SKImage) api.SKImage.FromTexture = importTexture;
  const NativeGpuCapabilities = Object.freeze({ GaneshWebGL: typeof K.MakeWebGLContext === 'function', GaneshExtended: K.SkiaSharpNativeGpuVersion === 1 && typeof K.SkiaSharpGaneshResetContext === 'function', GraphiteDawn: nativeGraphite(), BrowserReadback: true, DesktopNativeHandles: false });
  return { GRBackend, GRSurfaceOrigin, GRGlBackendState, GRBackendState, GRGlFramebufferInfo, GRGlTextureInfo, GRBackendRenderTarget, GRBackendTexture, GRGlInterface, GRContextOptions, GRRecordingContext, GRContext, SKGraphiteBackend, SKGraphiteInsertStatus, SKGraphiteDawnBackendContext, SKGraphiteContextOptions, SKGraphiteSubmitInfo, SKGraphiteInsertRecordingInfo, SKGraphiteContext, SKGraphiteRecorder, SKGraphiteRecording, SKGraphiteTextureInfo, SKGraphiteBackendTexture, SKImageReadPixelsResult, ReadWebGPUTexture: readWebGPUTexture, NativeGpuCapabilities };
}
async function waitForGL(gl) {
  if (!gl) throw new Error('A browser WebGL context is required for asynchronous GPU completion.');
  if (!gl.fenceSync) { gl.finish(); return; }
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
  try { for (;;) { if (gl.isContextLost()) throw new Error('WebGL context was lost while waiting for GPU completion.'); const status = gl.clientWaitSync(sync, 0, 0); if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return; if (status === gl.WAIT_FAILED) throw new Error('WebGL GPU completion wait failed.'); await new Promise(resolve => setTimeout(resolve, 0)); } } finally { gl.deleteSync(sync); }
}
