import { Initialize as InitializeCore } from '../lib/index.js';
import { registerCanvasElement } from '../lib/web-component.js';
import { GetAssetUrls, NormalizeOptions, PrepareRuntime } from './assets.js';
export { Version } from './version.js';
export { GetAssetUrls } from './assets.js';

/** Package initialization never downloads fonts implicitly. The gallery keeps its own defaults. */
export function Initialize(options = {}) {
  try {
    const normalized = NormalizeOptions(options);
    const urls = GetAssetUrls(normalized.assetBaseUrl);
    return InitializeCore({ ...urls, ...normalized }).then(PrepareRuntime);
  } catch (error) { return Promise.reject(error); }
}
export async function RegisterWebComponent(options = {}) {
  if (typeof globalThis.customElements === 'undefined') throw new Error('RegisterWebComponent requires a browser with custom elements.');
  const api = await Initialize(options);
  registerCanvasElement(api);
  return api;
}
export default Initialize;
