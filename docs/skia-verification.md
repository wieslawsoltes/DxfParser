# Skia renderer 0.2.0 qualification

All following tests passed locally against the final code over normal HTTP and
native SkiaSharpWeb. No tests in this recorded run were skipped. GitHub Actions
results are separate from this local record and are checked after publication.

| Suite | Passing tests |
| --- | ---: |
| Analytical geometry, compiler, binary resources, native Skia pixels, unsigned WebGPU ABI and bounded surface recovery | 129 |
| Native CAD browser | 19 |
| Dockyard browser | 18 |
| Ribbon/document browser | 31 |
| GridWeb/RichTextWeb browser | 20 |
| Analysis workbench browser | 26 |
| Required native Graphite/WebGPU and Ganesh/WebGL on SwiftShader | 7 |
| **Total** | **250** |

The 129 Node cases include analytical tests, 21 real native raster pixel/resource
cases, five tests of the exact generated WASM→WebGPU imports, and twelve controlled
surface-lifetime/failure tests. The last twelve use deterministic mocked native
objects to cover races, not to claim GPU rendering. The seven GPU browser cases
separately use real WebGPU/Ganesh APIs and native Skia, actual pixel readbacks,
validation scopes and GPUDevice destruction; raster fallback cannot pass their
strict backend checks. The other 114 browser tests exercise the real application.

The required GPU environment is Chromium 143.0.7499.4 with its SwiftShader Vulkan
ICD under Xvfb. Graphite reports `skia-graphite-webgpu`; the separate Ganesh case
requires `webgl`. This is software-device qualification, not physical hardware.
Node v22.16.0, TypeScript 5.8.3 and Python 3.13.5 ran the local gates.

Additional passing checks cover the installed npm tarball, CommonJS/ESM identity,
strict public declarations including the new API, native PNG from an outside
consumer, deterministic generated bundles, all vendor hashes, patched native-loader
manifest, unchanged WASM, old-engine removal and absence of bundled font binaries.
The native font case uses a local system font; its bytes are never distributed.

The pre-existing malformed `advanced-geometry.dxf` fixture is explicitly rejected
at line 97 in the GPU fixture test, with last-valid-frame retention asserted.
This is not a skipped test, repaired golden file or a claim of rendering invalid
syntax. All other repository DXF fixtures are submitted to the actual Graphite
pipeline, retaining unsupported-content diagnostics where applicable.

See [the implementation review](skia-renderer-improvements.md), [coverage contract](../packages/dxf-skia/COMPATIBILITY.md)
and [machine-readable results/log hashes](verification/skia-renderer.json).
No complete AutoCAD parity, physical-driver certification or user-file reproduction
is claimed. The old renderer's SVG snapshots remain historical, not acceptance tests.
