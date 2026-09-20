import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { Initialize as InitializeCore } from '../lib/index.js';
import { NormalizeOptions, PrepareRuntime } from './assets.js';
export { Version } from './version.js';
export { GetAssetUrls } from './assets.js';
const require = createRequire(import.meta.url);
let enginePromise;
async function LoadEngine() {
  // Share only the compiled module. isolated:true creates independent SK namespace/cache state,
  // not a new WASM heap; inject a separate CanvasKit instance for a separate heap.
  return enginePromise ??= (async () => {
    const wasmBinary = await readFile(new URL('../vendor/canvaskit.wasm', import.meta.url));
    return require('../vendor/canvaskit.cjs')({ wasmBinary });
  })().catch(error => { enginePromise = undefined; throw error; });
}
export async function Initialize(options = {}) {
  const normalized = NormalizeOptions(options);
  const CanvasKit = normalized.CanvasKit ?? await LoadEngine();
  normalized.signal?.throwIfAborted();
  const fonts = normalized.fonts === false ? false : await Promise.all(normalized.fonts.map(async font => {
    if (font.data || !String(font.url).startsWith('file:')) return font;
    return { ...font, data: new Uint8Array(await readFile(new URL(font.url), { signal: normalized.signal })) };
  }));
  return PrepareRuntime(await InitializeCore({ ...normalized, CanvasKit, fonts }));
}
export async function RegisterWebComponent() {
  throw new Error('RegisterWebComponent requires the @wieslawsoltes/skiasharpweb/browser entry and a browser DOM.');
}
export default Initialize;
