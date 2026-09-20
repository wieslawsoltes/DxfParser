# Compatibility and remaining boundaries — 0.4

This is a browser-oriented JavaScript adaptation of the SkiaSharp API, backed by a compiled Skia runtime. It is not a CLR, a native-driver pointer bridge, or a certified complete SkiaSharp replacement. Names, overload adapters and test evidence are tracked separately.

## Current declaration audit

Running `node scripts/audit-conformance.mjs` against the assembled 0.4 namespace and the pinned 3,995-entry inventory gives:

| Classification | Declarations |
| --- | ---: |
| Implemented according to the audit's evidence rules | 1,936 |
| Partial or not fully verified | 1,042 |
| Not applicable to the browser adaptation | 873 |
| Missing | 144 |

These are source declaration classifications, not feature percentages or an exhaustive semantic proof. The inventory includes native platform structures, generated/operator/lifetime surfaces and overloads sharing implementations. `docs/OVERLOAD_CONFORMANCE.md` explains the classifier; regenerate its JSON/Markdown for the currently loaded runtime. Native memory tracing is now compiled and tested, but one newly detected facade must not be counted as proof of an entire API family.

The remaining missing rows are predominantly desktop Vulkan/Metal/Direct3D interop and CLR/COM lifetime surfaces. They are not silently emulated with fake browser handles. Other partial rows still need additional overload-specific and differential evidence. The new 832-case deterministic geometry corpus passes against two .NET versions, but it does not cover all 3,995 declarations.

## Rendering

| Route | Actual implementation |
| --- | --- |
| WebGPU / `skia-graphite-webgpu` | Compiled native Skia Graphite/Dawn renders into a persistent GPU texture, presented without uploading a CPU frame. |
| WebGL | Compiled Skia Ganesh uses WebGL. |
| Canvas | Skia rasterizes in WebAssembly, then presents through Canvas 2D. |
| Offscreen raster | A native raster surface without an HTML canvas. |
| Injected older CanvasKit / WebGPU | A compatibility primitive renderer or raster-upload presenter when the injected runtime lacks Graphite. |

The bundled runtime includes the native Graphite implementation, specialized effects, document/font extensions, memory tracing and native image identity. It is no longer an uncompiled extension proposal. `Backend`, `RenderMode`, `FallbackReasons` and capability APIs expose the actual route.

`auto` tries WebGPU, WebGL, then Canvas. `allowFallback:false` requires the requested backend. If an unsuccessful context attempt locks the original canvas to another API, `surface.Element` can be a replacement. Graphite CPU readback is asynchronous: use `SnapshotAsync` or the async pixel APIs. `DisposeAsync` waits for GPU cleanup; `Dispose` invalidates the wrapper immediately and schedules cleanup.

Chromium 143 checks passed for all 44 scenes on all three backends, with actual presented pixels and zero Graphite CPU-frame uploads. The adapter was SwiftShader software Vulkan. This verifies execution of the GPU API/shader pipeline on software, **not physical GPU hardware or vendor-driver certification**. A separate runner mode rejects software/fallback adapters when physical evidence is required.

## Effects, regions and fonts

The bundled native extension implements compound path effects and region scan conversion using Skia geometry, replacing the previous sampled fallback in the default route. Specialized image/color effects stay native. With an independently injected stock engine, fallback effect graphs use Float32 captures and intermediates; RGBA8 conversion occurs at the explicitly requested pixel boundary. Some fallback scalar rounding and geometric boundary cases differ from native Skia and are documented in `docs/EFFECT_FIDELITY.md`.

CFF2 font rendering retains the resolved hint programs. CFF2-to-CFF1 document conversion preserves stems, hint/counter masks, private dictionaries and expanded local/global subroutines. Independent hinted pixel fixtures and negative controls exercise these paths. This is not exhaustive coverage of every legal or malformed OpenType font.

Font-manager discovery covers registered/imported fonts, not an unrestricted enumeration of the operating system's installed font collection. Native shaping, fallback, glyph metrics/outlines, variable instances, palettes and supported color-font formats use the supplied font data. Cache limits estimate retained source/pixel bytes, not total JavaScript, native heap or driver allocations.

## Documents and interchange

`SKDocument.CreatePdf` selects native Skia PDF when available. Supported text/fonts and geometry stay vector/searchable. Native Skia can rasterize unsupported PDF operations internally. Its per-operation fallback list is not exposed: `RasterFallbackReporting` is `UnavailableNative` and `RasterFallbacks` is `null`, not an empty list.

`NativeBackend:false` or `Backend:'JavaScript'` selects the managed PDF writer. XPS uses the managed OPC/FixedPage writer. Those routes report bounded raster patches per unsupported operation. Destination-dependent compositing can flatten preceding vectors within the affected rectangle. `StrictVector:true` rejects an unrepresentable operation rather than claiming exact vector fidelity. Sweep/conical shaders, some blend/effect combinations, and native callbacks can require fallback. Conic/vector decompositions have documented tolerances. PDF, PDF/A and XPS standards certification is not claimed.

Pictures, codecs, streams, native Skottie and resource providers are implemented within their documented surfaces. Codec operations depend on format support in the compiled engine. Native Skottie determines supported Lottie semantics; the retained scene-node API is a documented web extension. Browser paths refer to mounted files or selected/loaded bytes, not arbitrary desktop file access.

## JavaScript porting conventions

PascalCase types/members are retained. Object initializers become constructor options or assignments; value operators become named methods. Arrays/typed arrays replace spans. `ref`/`out` use documented mutable outputs or convenience result objects. Onscreen creation, URL loading and WebGPU readback require `await`; offscreen raster creation remains synchronous. Hex colors use ARGB ordering. Explicit disposal is required for owned native resources; borrowed canvas/pixel views cannot outlive owners.

The custom component coalesces redraw requests, reuses unchanged surfaces, and handles resize, stale initialization, disconnect/reconnect and device loss. It is not a native .NET UI control. The source snapshot excludes font binaries; repository/deployed assets are separate from generated source/test reports.

## Verification scope

See [the current verification report](./docs/VERIFICATION.md) for tests, independent .NET cases, browser results and artifact provenance. Passing tests do not establish universal native-pointer equivalence, all fonts/documents/Lottie inputs, an exhaustive .NET differential corpus, long-running production memory behavior, or physical GPU/browser certification. These boundaries are retained rather than counted as completed features.

## Additional 0.4 precision and audit evidence

[Release details](./docs/RELEASE-0.4.md) include HDR data ownership, cache budgets, native matrix/clip tests, the bitmap benchmark and evidence-specific conformance reviews. Existing verification and provenance above are retained.
