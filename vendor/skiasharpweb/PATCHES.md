# Local SkiaSharpWeb patches — DXF renderer 0.2.0

The pinned SkiaSharpWeb commit and native WASM are unchanged. Four JavaScript
files differ from upstream; `LOCAL-PATCHES.json` records both identities.
This is not an upstream SkiaSharpWeb release or a claim that native Skia was rebuilt.

## WebGPU integer ABI

The generated Emscripten imports receive WebAssembly i32 words as signed JavaScript
numbers. `draw`, the unsigned arguments to `drawIndexed`, `dispatchWorkgroups`, and
`setScissorRect` now reinterpret those words with `>>> 0` at that boundary. Signed
`drawIndexed.baseVertex` and 64-bit byte offsets are not modified. Browser WebGPU
validation still runs; illegal workloads are not clamped or silently accepted.

`node scripts/patch-skia-webgpu-abi.mjs` reproduces the loader edits, validates the
expected import signatures, fails on an unknown upstream, and is idempotent. Both
classic/browser and CommonJS loaders are identical. No prototype is patched in the
application; test-only interception records actual arguments passed to WebGPU.

## Asynchronous validation and device errors

The presenter captures its own device's uncaptured errors and checks device loss.
FlushAsync wraps native submission in balanced validation/internal/out-of-memory
error scopes, waits for submission, pops all scopes even when a WASM import throws,
and rejects a failed frame. Device listeners are detached on disposal. SnapshotAsync
uses the checked flush path. The DXF SurfaceHost owns bounded backend recovery;
failed work is never reported as a successfully presented frame.

`tests/skia-webgpu-abi.test.mjs` reproduces the original unsigned-long range failure
from the unpatched import. `tests/skia-gpu.py` runs real native Graphite/WebGPU and
Ganesh/WebGL on SwiftShader, including actual validation failures and device loss.
These tests do not certify physical graphics hardware.
