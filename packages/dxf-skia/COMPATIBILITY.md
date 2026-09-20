# Rendering compatibility contract — 0.2.0

“Implemented” below describes actual code paths, not exhaustive CAD behavioral
parity. Entity attributes not covered by those paths can still require work. The
current renderer is a bounded retained 2D/orthographic engine; it is not a solid
modeler or a proprietary CAD object-enabler.

| Area | Implemented path | Explicit boundary |
| --- | --- | --- |
| Input | ASCII DXF and decoded ordered tags; headers, tables, blocks, entities, objects, layouts | Binary DXF needs an upstream decoder; no DWG parser. |
| Curves | LINE, POINT modes, ARC/CIRCLE/ELLIPSE native conics, RAY/XLINE, bulges | Exact conic/cubic bounds; picking still uses bounded flattening. No complete analytic intersection snap. |
| Polylines | Lightweight/classic sequences, closed paths, widths, OCS, 3D lines, polyface/polymesh | Wide joins are segment-based; no exhaustive curve-fit/spline-fit legacy polyline semantics. Wide-polyline thickness is not synthesized. |
| Solids/mesh | SOLID/TRACE, 3DFACE, MESH control faces; ordinary extrusion thickness | Subdivision is not a solid model; native faces are unlit and draw-order based, not a depth-buffer renderer. |
| Splines/helix | Rational B-spline control geometry; chord-length C2 fit-point interpolation, natural/clamped and periodic closed splines; sampled helix fallback | Fit-only interpolation uses an explicit chord-length policy, not reconstructed proprietary knot/parameter choices. Constraints beyond endpoint tangents are not exhaustive. |
| Blocks | Nested INSERT/MINSERT, rotated arrays, scale/mirror/base point/OCS, attribute references and constants, isolation | No dynamic-block evaluator or external XREF resolver. Stored geometry is used; unresolved resources are not fetched. |
| Hatches | Polyline/line/arc/ellipse/spline edges, normal/outer/ignore island styles from boundary flags, bounded phase-preserving explicit dash/gap patterns; native LINEAR, CYLINDER, INVCYLINDER, SPHERICAL and INVSPHERICAL shaders with rotation/tint/affine transforms | Other gradient families remain diagnosed solid-color fallbacks. No complete procedural hatch catalog or certified AutoCAD gradient normalization. Imported boundary classification flags must be meaningful. |
| Text | Native explicitly registered TTF/OTF shaping; standard/unifont SHX; alignment/rotation/mirror; basic MTEXT wrapping/paragraphs/masks | No SHX bigfont; no exact full MTEXT typography, mixed inline rich runs, complete fields, multicolumn/stacked-text semantics or automatic font substitution. |
| Dimensions/leaders | Stored anonymous dimension blocks; generated linear/aligned/radius/diameter/ordinate and two-line/three-point angular dimensions; basic DIMSTYLE formatting, extensions and arrows; basic LEADER/MLEADER paths | Advanced entity DIMSTYLE overrides, custom arrow blocks, fit/tolerance rules, nondecimal unit formatting and complete MLEADER contexts are not exhaustive. |
| Images/wipeout | Explicit local image resources, native affine placement, clips, brightness/contrast/fade and wipeout | Underlay formats, OLE, point clouds, automatic paths and external attachment loading are not implemented. |
| Clipping/layouts | Basic spatial-filter INSERT clipping; model/named paper layouts; orthographic paper viewports with rectangular/circle/ellipse/closed-polyline/spline clips and frozen layers | No general perspective/depth clipping; inverted XCLIP round-trip metadata and every viewport override are not exhaustive. |
| Style/order | ACI/truecolor, layer inheritance, BYBLOCK/BYLAYER, visibility/transparency, ordinary lineweights/dash arrays, SORTENTSTABLE | Complex text/shape linetype elements, complete CTB/STB plot styles, materials/lights/render-environment/PBR are not supported. |
| Proxy graphics | Bounded common polygon/polyline/circle/arc/mesh/shell and state/matrix commands | Unknown commands, bit-packed proxy LWPLINE/text and per-vertex/face traits require providers and are diagnosed. |
| Proprietary geometry | Preserved original tags plus explicit, application-owned provider registration | ACIS/SAT/SAB, 3DSOLID/REGION/BODY, procedural surfaces and vendor object enablers are not reimplemented. |
| Navigation | Cursor-centered pan/zoom, model/layout tabs, seven orthographic directions, geometry picking, semantic endpoint/midpoint/center/quadrant/node snaps plus optional bounded nearest snap | Not a general CAD command/editing language or full AutoCAD selection/snap behavior. |
| Export | Real native PNG and vector PDF; PDF recompiles for white paper/printing visibility | No promise of printer/plotter/AutoCAD-identical output, PDF/A/X compliance or color-managed print certification. |

## Resource and workload limits

The default text parser limits source length to 64 MiB code units and four million
tags; the option is named `maxBytes` for compatibility but measures string length,
not UTF-8 bytes. Geometry compilation defaults to 500,000 primitives, three million
sample vertices, 48 block levels, 100,000 instances, 20,000 hatch pattern lines and 4,096 hatch loops.
Fit interpolation defaults to 10,000 fit points and linear-time tridiagonal solves.
Over-limit operations are rejected or omitted with diagnostics; these are limits,
not a performance guarantee at their maximum.

Resources default to 128 MiB of encoded data and a 64-million-pixel decoded image
check. Decoding itself uses the native codec, so the pixel check does not eliminate
all transient codec memory. Surface presentation is limited to 32 million pixels
and 16,384 in either dimension. Text and SHX/proxy operations have additional bounds.
Malformed native resource input must still be treated as untrusted.

There is no implicit network/resource resolution, script evaluation or macro
execution. Files remain in the browser unless the application explicitly exports
them. Built-in rendering diagnostics retain source identity and cap message volume.

## Performance and qualification

Compilation/indexing are synchronous in-memory operations. Only presentation is
coalesced; this candidate does not claim a worker-based/incremental document compiler.
Exact conics remain native, while most picking, wide-polyline construction and
spline geometry use bounded approximation. The BVH build uses recursive sorting;
no claim of linear-time construction is made. Large-coordinate rebasing cannot
recover precision already lost when a source coordinate became a JavaScript number.

The native pixel tests run Skia raster WASM. The required GPU suite separately runs
actual Graphite/WebGPU and Ganesh/WebGL on SwiftShader under Xvfb, checks real pixels,
injects a WebGPU validation error, destroys a real GPUDevice and verifies recovery.
Missing adapters fail that suite; raster fallback is not counted as GPU success.
These are software GPU results, not qualification on representative physical hardware.

The bundled JavaScript loaders have a documented unsigned WebGPU ABI correction;
SkiaSharpWeb's checked FlushAsync propagates validation/device errors. The native
WASM is unchanged. See `vendor/skiasharpweb/PATCHES.md`. SurfaceHost remembers failed
backends and downgrades WebGPU → WebGL → raster at most once each per recovery cycle.
If none succeeds, it stops rather than spinning. Explicit retry resets the circuit;
strict callers can set `allowFallback: false`. Drawing data/resources remain owned
independently of the surface. This cannot make an unsupported native/driver feature
work; it makes that failure observable and recoverable.
Old-renderer snapshots and their two previously known SVG mismatches are not the
new acceptance gate. No unchanged-baseline or complete-AutoCAD-parity claim is made.
