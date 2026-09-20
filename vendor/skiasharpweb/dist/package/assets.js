/** URLs are computed lazily so importing the package during SSR does no I/O. */
export function GetAssetUrls(baseUrl) {
  const base = baseUrl === undefined
    ? new URL('../vendor/', import.meta.url)
    : new URL(String(baseUrl).replace(/\/?$/, '/'), globalThis.document?.baseURI ?? import.meta.url);
  if (!['http:', 'https:', 'file:'].includes(base.protocol)) {
    throw new TypeError('assetBaseUrl must use http:, https:, or file:.');
  }
  return Object.freeze({
    scriptUrl: new URL('canvaskit.js', base).href,
    wasmUrl: new URL('canvaskit.wasm', base).href,
    wasmBaseUrl: base.href
  });
}
export function NormalizeOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Options must be an object.');
  if (options.fonts !== undefined && options.fonts !== false && !Array.isArray(options.fonts)) {
    throw new TypeError('fonts must be false or an array of font descriptors.');
  }
  options.signal?.throwIfAborted();
  return { ...options, fonts: options.fonts ?? false };
}

/** Give package consumers one lifetime contract; preserve Graphite's instance fence. */
export function PrepareRuntime(api) {
  const prototype = api.SKSurface.prototype;
  if (typeof prototype.DisposeAsync !== 'function') {
    Object.defineProperty(prototype, 'DisposeAsync', {
      configurable: true, writable: true,
      value: async function () { await this.Dispose(); }
    });
  }
  return api;
}
