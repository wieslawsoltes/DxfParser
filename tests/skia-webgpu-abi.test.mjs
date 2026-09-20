import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { patch, substitutions } from '../scripts/patch-skia-webgpu-abi.mjs';
const source = fs.readFileSync(new URL('../vendor/skiasharpweb/dist/vendor/canvaskit.js', import.meta.url), 'utf8');
const checked = (value, signed = false) => {
  if (!Number.isInteger(value) || value < (signed ? -2147483648 : 0) || value > (signed ? 2147483647 : 4294967295))
    throw new TypeError("Value is outside the 'unsigned long' value range.");
};
function binding(text, name, method, signedIndex = -1) {
  let received;
  const pass = { [method](...args) { args.forEach((n, i) => checked(n, i === signedIndex)); received = args; } };
  const context = { WebGPU: { mgrRenderPassEncoder: {get: () => pass}, mgrComputePassEncoder: {get: () => pass} } };
  const body = text.match(new RegExp('var _' + name + '=\\([^]*?\\};'))?.[0];
  assert.ok(body, 'Pinned import must exist: ' + name);
  vm.runInNewContext(body + ';this.call=_' + name, context);
  return { call: context.call, received: () => received };
}
test('reproduces original signed-i32 to unsigned-long draw exception and fixes exact import', () => {
  const original = source.replace(substitutions[0][1], substitutions[0][0]);
  assert.throws(() => binding(original, 'wgpuRenderPassEncoderDraw', 'draw').call(1, 3, 1, -2147483648, -1), /unsigned long/);
  const draw = binding(source, 'wgpuRenderPassEncoderDraw', 'draw');
  draw.call(1, 3, 1, -2147483648, -1);
  assert.deepEqual(draw.received(), [3, 1, 2147483648, 4294967295]);
});
test('draw preserves every unsigned bit for counts, first vertex and first instance', () => {
  const draw = binding(source, 'wgpuRenderPassEncoderDraw', 'draw');
  for (const value of [0, 1, 2147483647, -2147483648, -2, -1]) {
    draw.call(1, value, value, value, value);
    assert.deepEqual(draw.received(), Array(4).fill(value >>> 0));
  }
});
test('indexed draw reinterprets unsigned arguments while preserving signed baseVertex', () => {
  const draw = binding(source, 'wgpuRenderPassEncoderDrawIndexed', 'drawIndexed', 3);
  draw.call(1, -1, 1, -2147483648, -17, -2);
  assert.deepEqual(draw.received(), [4294967295, 1, 2147483648, -17, 4294967294]);
});
test('compute and scissor arguments use the same native uint32 ABI', () => {
  const dispatch = binding(source, 'wgpuComputePassEncoderDispatchWorkgroups', 'dispatchWorkgroups');
  dispatch.call(1, -1, -2147483648, 1);assert.deepEqual(dispatch.received(), [4294967295, 2147483648, 1]);
  const scissor = binding(source, 'wgpuRenderPassEncoderSetScissorRect', 'setScissorRect');
  scissor.call(1, -1, 1, -2147483648, 0);assert.deepEqual(scissor.received(), [4294967295, 1, 2147483648, 0]);
});
test('local vendor patch is idempotent, fail-closed, identical in browser and CJS loaders', () => {
  assert.equal(patch(source), source);
  assert.throws(() => patch('unexpected new upstream'), /Unexpected native ABI/);
  assert.equal(source, fs.readFileSync(new URL('../vendor/skiasharpweb/dist/vendor/canvaskit.cjs', import.meta.url), 'utf8'));
});
