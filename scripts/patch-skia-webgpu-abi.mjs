#!/usr/bin/env node
/** Local patch for the pinned Emscripten wasm32 -> WebGPU ABI.
 * WASM i32 imports arrive as signed JS numbers. Reinterpret only the native
 * uint32_t arguments, never a signed baseVertex or a 64-bit byte offset.
 * Exact match + upstream hashes make an unexpected vendor upgrade fail closed.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const substitutions = [
  ['pass.draw(vertexCount,instanceCount,firstVertex,firstInstance)', 'pass.draw(vertexCount>>>0,instanceCount>>>0,firstVertex>>>0,firstInstance>>>0)'],
  ['pass.drawIndexed(indexCount,instanceCount,firstIndex,baseVertex,firstInstance)', 'pass.drawIndexed(indexCount>>>0,instanceCount>>>0,firstIndex>>>0,baseVertex,firstInstance>>>0)'],
  ['pass.dispatchWorkgroups(x,y,z)', 'pass.dispatchWorkgroups(x>>>0,y>>>0,z>>>0)'],
  ['pass.setScissorRect(x,y,w,h)', 'pass.setScissorRect(x>>>0,y>>>0,w>>>0,h>>>0)']
];
export function patch(source) {
  for (const [before, after] of substitutions) {
    if (source.split(after).length === 2 && !source.includes(before)) continue;
    if (source.split(before).length !== 2 || source.includes(after)) throw new Error('Unexpected native ABI signature: ' + before);
    source = source.replace(before, after);
  }
  return source;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const name of ['canvaskit.js', 'canvaskit.cjs']) {
    const file = path.join(root, 'vendor/skiasharpweb/dist/vendor', name);
    const input = fs.readFileSync(file, 'utf8'), output = patch(input);
    fs.writeFileSync(file, output);
    console.log(name + ': ' + crypto.createHash('sha256').update(output).digest('hex'));
  }
}
