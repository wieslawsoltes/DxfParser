import { Version } from '../package/version.js';
import { installTextMeasureCompletion } from './text-measure-completion.js';
import { installPaintCompletion } from './paint-completion.js';
import { installTextPathCompletion } from './text-path-completion.js';
import { installDataCompletion } from './data-completion.js';
import { installPathQueryCache } from './path-query-cache.js';
import { installDocumentCompletion } from './document-completion.js';
import { installPathMeasureCompletion } from './path-measure-completion.js';
import { installNativeDocumentPolicy } from './native-document-policy.js';
import { installPixelAlpha } from './pixel-alpha.js';
import { installInteropValues } from './interop-values.js';
import { installFontPathCallbacks } from './font-path-callbacks.js';
import { installRenderCache } from './render-cache.js';
import { installGpuReadback } from './gpu-readback.js';
import { registerCanvasElement } from './web-component.js';
import { installMemoryTracing } from './memory.js';
import { installGpuRecords } from './gpu-records.js';
import { installSurfaceFormats } from './surface-formats.js';
import { createCore } from './core.js';
import { createPaths } from './paths.js';
import { createFonts } from './fonts.js';
import { createImages } from './images.js';
import { createCanvasAPI } from './canvas.js';
import { createWebGPUBackend } from './webgpu.js';
import { createRegions } from './regions.js';
import { createEffectExtensions } from './effects.js';
import { createPathEffectExtensions } from './path-effects.js';
import { createAnimationAPI } from './animation.js';
import { installOverloads } from './overloads.js';
import { installCanvasEffects } from './canvas-effects.js';
import { createDocuments } from './documents.js';
import { createGpuAPI } from './gpu.js';
import { installLayerEffects } from './layer-effects.js';
import { createSpecializedAPI } from './specialized.js';
import { installConformance } from './conformance.js';
import { installAssetExtensions } from './assets.js';

let defaultRuntime;
let defaultInitialization;
let loaderPromise;
export function Initialize(options = {}) {
  if (options.isolated) return initializeRuntime(options);
  if (defaultRuntime) return Promise.resolve(defaultRuntime);
  return defaultInitialization ??= initializeRuntime(options).catch(error => {
    defaultInitialization = undefined;
    throw error;
  });
}
async function initializeRuntime(options = {}) {
  if (defaultRuntime && !options.isolated) return defaultRuntime;
  const root = new URL('../', import.meta.url);
  let K = options.CanvasKit;
  if (!K) {
    if (!globalThis.CanvasKitInit) {
      if (typeof document === 'undefined') throw new Error('In Node, pass an initialized CanvasKit instance to Initialize({ CanvasKit }).');
      await (loaderPromise ??= new Promise((resolve, reject) => {
        const s = document.createElement('script'); s.src = options.scriptUrl || new URL('vendor/canvaskit.js', root).href;
        s.onload = resolve; s.onerror = () => reject(new Error('Could not load the bundled Skia engine.')); document.head.append(s);
      }).catch(error => { loaderPromise = undefined; throw error; }));
    }
    K = await globalThis.CanvasKitInit({ locateFile: file => new URL(file, options.wasmBaseUrl || new URL('vendor/', root)).href });
  }
  const api = createCore(K);
  Object.assign(api, createPaths(K, api));
  Object.assign(api, createFonts(K, api));
  Object.assign(api, createImages(K, api));
  Object.assign(api, createCanvasAPI(K, api, createWebGPUBackend));
  Object.assign(api, createRegions(K, api));
  Object.assign(api, createEffectExtensions(K, api));
  Object.assign(api, createPathEffectExtensions(K, api));
  Object.assign(api, createAnimationAPI(K, api));
  Object.assign(api, createGpuAPI(K, api));
  installOverloads(K, api);
  installCanvasEffects(K, api);
  installLayerEffects(K, api);
  Object.assign(api, createSpecializedAPI(K, api));
  installAssetExtensions(K, api);
  Object.assign(api, createDocuments(K, api));
  installConformance(K, api);
  installSurfaceFormats(K, api);
  installGpuRecords(K, api);
  installMemoryTracing(K, api);
  installGpuReadback(K, api);
  installRenderCache(K, api);
  installDocumentCompletion(K, api);
  installPathMeasureCompletion(K, api);
  installNativeDocumentPolicy(K, api);
  installPixelAlpha(K, api);
  installInteropValues(K, api);
  installFontPathCallbacks(K, api);
  installPaintCompletion(K, api);
  installTextPathCompletion(K, api);
  installTextMeasureCompletion(K, api);
  installPathQueryCache(K, api);
  installDataCompletion(K, api);
  api.CanvasKit = K;
  api.Version = Version;
  api.BackendCapabilities = Object.freeze({ WebGL: 'Skia GPU renderer', Canvas: 'Skia software rasterizer presented through Canvas 2D', WebGPU: 'Native Skia Graphite/Dawn; injected runtimes without Graphite use the primitive/raster presenter' });
  if (options.fonts !== false) {
    const fonts = options.fonts || [
      { url: new URL('fonts/DejaVuSans.ttf', root).href, family: 'DejaVu Sans' },
      { url: new URL('fonts/DejaVuSerif.ttf', root).href, family: 'DejaVu Serif' },
      { url: new URL('fonts/DejaVuSansMono.ttf', root).href, family: 'DejaVu Sans Mono' }
    ];
    if (!Array.isArray(fonts)) throw new TypeError('fonts must be false or an array of font descriptors.');
    // Overlap I/O but register in the supplied order: fallback precedence is stable.
    const buffers = await Promise.all(fonts.map(async font => {
      if (font.data) return font.data;
      const response = await fetch(font.url, { signal: options.signal });
      if (!response.ok) throw new Error('Font request failed: ' + response.status);
      return new Uint8Array(await response.arrayBuffer());
    }));
    options.signal?.throwIfAborted();
    const manager = api.SKFontManager.Default;
    try {
      for (let i = 0; i < fonts.length; i++) manager.RegisterFont(buffers[i], fonts[i].family).Dispose();
    } catch (error) {
      manager.Dispose(); api.SKFontCache?.Clear(); throw error;
    }
  }
  if (!options.isolated) defaultRuntime = api;
  return api;
}

export async function RegisterWebComponent(options = {}) {
  const api = await Initialize(options);
  registerCanvasElement(api);
  return api;
}

export default Initialize;
