# DXF Skia renderer 0.2.0 — robustness and rendering review

Base: DxfParser `cb388c742ad16381a6a0235d44e713465ef7abc0`.
This change is a direct-main update; it does not bring back the removed renderer.
The compatibility contract remains the authoritative list of coverage and limits.

## Repeated unsigned-long WebGPU failure

The bundled Emscripten loader forwarded signed JavaScript representations of WASM
i32 words into WebGPU's unsigned draw arguments. A high-bit native uint32 therefore
arrived as a negative JavaScript number and threw before GPU validation:

```
Failed to execute 'draw' on 'GPURenderPassEncoder':
Value is outside the 'unsigned long' value range.
```

The exact native import is corrected with `>>> 0` for all four unsigned draw
arguments. Indexed draw preserves signed `baseVertex`; unsigned indexed arguments,
compute dispatch and scissor dimensions get the same boundary treatment. This is
bit reinterpretation of native integers, not clamping source geometry or changing
the browser's global prototypes. Invalid GPU workloads still fail validation.

`tests/skia-webgpu-abi.test.mjs` reverses the patch in memory to reproduce the
original exception, then tests high-bit boundaries through the patched imports.
It checks both distributed loaders and the patch script's fail-closed/idempotent
contract. We have not reproduced the user's exact drawing/device combination,
because neither a drawing nor a device trace was supplied.

## Checked submission and bounded recovery

Every asynchronous GPU flush has balanced validation/internal/out-of-memory error
scopes. Synchronous WASM failures, scoped validation errors and device loss reject
the frame, rather than logging an error and pretending to present successfully.
Device-specific uncaptured errors are propagated and their listeners disposed.

SurfaceHost tries each allowed backend at most once, starting with the requested
backend. Automatic mode uses Graphite/WebGPU, Ganesh/WebGL, then native Skia raster.
A failed surface is disposed, its incompatible HTML canvas replaced, its cached
native paths released, and the latest drawing frame replayed using the retained
ResourceStore. No failed backend is automatically revisited until explicit retry.
If all backends fail, the host stops and reports one terminal error instead of
repeatedly scheduling the same failed draw.

Generation and request IDs prevent stale frames completing during resize, retry,
suspension or disposal from becoming the presented frame. Concurrent disposal joins
a single native teardown promise. Consumer paint callbacks are not classified as
GPU faults. A malformed viewport/pixel budget is rejected before creating a surface
and a later valid viewport can recover without poisoning the backend list.

### Application controls

Open **CAD View → Rendering Diagnostics** and choose **Graphics backend**:
Automatic, WebGPU / Graphite, WebGL / Ganesh or Skia raster. **Retry graphics**
explicitly recreates the requested backend. Recovery reasons remain visible. The
same selector and retry command are available in the CAD ribbon. The command line
accepts `RENDERER canvas`, `RENDERER webgl`, `RENDERER webgpu` and `RENDERER auto`.
Use `RENDERER canvas` as an immediate workaround for a problematic GPU driver;
rendering still uses native Skia, not a resurrected Canvas2D drawing engine.

Backend changes preserve the drawing, camera, selection and loaded resources.
They do not persist an implicit permanent opt-out from WebGPU across browser reloads.

### Library API

```js
const host = new DxfSkia.SurfaceHost({
  initialize: initializeSkia,
  backend: 'auto',
  allowFallback: true,
  onRecovery: event => console.warn(event.backend, event.message),
  onError: error => showError(error.message),
  onPaint: statistics => showBackend(statistics.backend)
});
host.initialize(canvas);
host.request(frame);
await host.whenIdle();
// Explicit user retry; does not discard the authoritative document/resources.
host.retryBackend('webgpu');
await host.whenIdle();
await host.dispose();
```

`allowFallback: false` makes an explicit backend a strict requirement. Inspect
`faulted`, `error`, `recoveryEvents`, `failedBackends` and `presentedFrame` for state.
Requesting a new frame while faulted retains it, but does not start an error loop.

## Rendering review and completed features

| Area | Change and acceptance |
| --- | --- |
| Bounds | Exact cubic/quadratic/rational-conic extrema, including affine projection and large-coordinate rebasing. Culling/snap bounds do not depend on sampling density. |
| Fit-only SPLINE | O(n) chord-length C2 cubic interpolation through every fit point, optional endpoint tangents and periodic closed seams. Native cubic paths replace the former polygon fallback. The interpolation policy is explicit. |
| Curve snapping | Actual arc endpoints/angular midpoints, circle/ellipse quadrants, transformed/mirrored INSERT geometry, arc centers outside arc bounds, and optional nearest projection. Transparent entities cannot attract picks/snaps. |
| Hatch islands | Normal, outer and ignore styles select boundary loops using DXF EXTERNAL/OUTERMOST flags. Native pixels and picking agree on holes. |
| Hatch gradients | Five native Skia gradient families; RGB/ACI stops, one-color tint, rotation and affine INSERT/OCS bases. Actual pixels checked on raster and Graphite. Four additional families remain documented fallbacks. |
| Hatch patterns | Correct per-line phase relative to the pattern origin; imported already-scaled patterns are not transformed twice. Safe integer indices, loop/line budgets and finite native dash checks. |
| Viewport clipping | Circular/elliptical, closed polyline including bulges, and closed spline boundary paths remain native paths. Boundary geometry is independent of its visible/plot layer. Invalid clipping falls back explicitly without discarding valid model content. |
| Dimensions | Native angular dimension arcs, correct sector selection, radius/diameter arrows, ordinate origins, explicit text positions even at zero, basic DIMSTYLE decimal suppression/separators/prefix/suffix/scale/extension behavior. Stored anonymous geometry stays authoritative. |
| Text | One-pass DXF escape decoding preserves literal braces/backslashes, consumes exactly four Unicode hex digits, handles surrogate pairs and retains unknown escapes visibly. Rich mixed-run MTEXT is still not complete. |
| Validation | Reject nonfinite float32 path coordinates/conic weights/dash cycles before native calls; free paths on failure; validate public parser budgets and viewport parameters; actual drawn/omitted counts replace optimistic counts. |

## Verification strategy

The analytical/native gate runs through `python tests/check-docking-regressions.py`.
The independent GPU gate is `xvfb-run -a python tests/skia-gpu.py`. It requires actual
native WebGPU and WebGL pipelines; no mocked surface or raster fallback is accepted
for backend qualification. SwiftShader is a software Vulkan device, not hardware.

GPU tests cover native RGBA readback, PNG, gradient fills, a real validation error,
actual device destruction, resize/explicit retry and all existing DXF fixture files.
The pre-existing malformed `advanced-geometry.dxf` is explicitly rejected at line 97
and tested to leave the last valid drawing intact; it is not silently skipped or
repaired into a different fixture. Other fixture content may still produce the
renderer's documented unsupported-content notices.

The required native-renderer workflow also runs all retained CAD, docking, ribbon,
Office preview and analysis workbench checks. Local results are recorded separately
from GitHub Actions. No test establishes complete AutoCAD visual equivalence.

## Dependency provenance and remaining work

The upstream SkiaSharpWeb commit remains
`1f26ba6e5ab8731bdbd08d18a45e65c9763a57d3`; the native WASM hash is unchanged.
`vendor/skiasharpweb/LOCAL-PATCHES.json` records original/patched JavaScript hashes.
The corresponding patched native manifest and SHA256SUMS are verified in CI. No
font binary, network resource resolver or old rendering backend was introduced.

Remaining material gaps include ACIS/vendor geometry, depth-correct lit 3D, rich
MTEXT/multicolumn/fields, SHX bigfonts, complete DIMSTYLE/MLEADER semantics,
complex linetype elements, CTB/STB, four hatch-gradient families, inverted XCLIP,
external XREFs/underlays/point clouds and worker/incremental compilation. They are
not marked complete merely because the renderer exposes a provider extension.
