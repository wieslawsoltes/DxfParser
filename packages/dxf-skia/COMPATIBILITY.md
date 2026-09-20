# Rendering compatibility contract — 0.1.0 candidate

“Implemented” below describes actual code paths, not exhaustive CAD behavioral
parity. Entity attributes not covered by those paths can still require work. The
current renderer is a bounded retained 2D/orthographic engine; it is not a solid
modeler or a proprietary CAD object-enabler.

| Area | Implemented path | Explicit boundary |
| --- | --- | --- |
| Input | ASCII DXF and decoded ordered tags; headers, tables, blocks, entities, objects, layouts | Binary DXF needs an upstream decoder; no DWG parser. |
| Curves | LINE, POINT modes, ARC/CIRCLE/ELLIPSE native conics, RAY/XLINE, bulges | Analytic bounds/picking flattening uses tolerance; no complete analytic intersection snap. |
| Polylines | Lightweight/classic sequences, closed paths, widths, OCS, 3D lines, polyface/polymesh | Wide joins are segment-based; no exhaustive curve-fit/spline-fit legacy polyline semantics. Wide-polyline thickness is not synthesized. |
| Solids/mesh | SOLID/TRACE, 3DFACE, MESH control faces; ordinary extrusion thickness | Subdivision is not a solid model; native faces are unlit and draw-order based, not a depth-buffer renderer. |
| Splines/helix | Rational B-spline control geometry; sampled helix fallback | Fit-only spline data is a diagnosed polygon approximation; not full constrained interpolation. |
| Blocks | Nested INSERT/MINSERT, rotated arrays, scale/mirror/base point/OCS, attribute references and constants, isolation | No dynamic-block evaluator or external XREF resolver. Stored geometry is used; unresolved resources are not fetched. |
| Hatches | Polyline/line/arc/ellipse/spline edges, normal even-odd islands, bounded explicit dash/gap patterns | Non-normal island styles currently fall back with a notice. Gradient fill is a diagnosed solid-color fallback; no complete procedural hatch catalog. |
| Text | Native explicitly registered TTF/OTF shaping; standard/unifont SHX; alignment/rotation/mirror; basic MTEXT wrapping/paragraphs/masks | No SHX bigfont; no exact full MTEXT typography, mixed inline rich runs, complete fields, multicolumn/stacked-text semantics or automatic font substitution. |
| Dimensions/leaders | Stored anonymous dimension blocks; simple generated missing-block dimensions; basic LEADER/MLEADER paths | Advanced DIMSTYLE overrides, angular/ordinate variants without stored geometry and complete MLEADER contexts are not exhaustive. |
| Images/wipeout | Explicit local image resources, native affine placement, clips, brightness/contrast/fade and wipeout | Underlay formats, OLE, point clouds, automatic paths and external attachment loading are not implemented. |
| Clipping/layouts | Basic spatial-filter INSERT clipping; model/named paper layouts; orthographic clipped paper viewports and frozen layers | No general perspective/depth clipping; inverted XCLIP round-trip metadata and every viewport override are not exhaustive. |
| Style/order | ACI/truecolor, layer inheritance, BYBLOCK/BYLAYER, visibility/transparency, ordinary lineweights/dash arrays, SORTENTSTABLE | Complex text/shape linetype elements, complete CTB/STB plot styles, materials/lights/render-environment/PBR are not supported. |
| Proxy graphics | Bounded common polygon/polyline/circle/arc/mesh/shell and state/matrix commands | Unknown commands, bit-packed proxy LWPLINE/text and per-vertex/face traits require providers and are diagnosed. |
| Proprietary geometry | Preserved original tags plus explicit, application-owned provider registration | ACIS/SAT/SAB, 3DSOLID/REGION/BODY, procedural surfaces and vendor object enablers are not reimplemented. |
| Navigation | Cursor-centered pan/zoom, model/layout tabs, seven orthographic directions, geometry picking, endpoint/midpoint/center/quadrant/node snaps | Not a general CAD command/editing language or full AutoCAD selection/snap behavior. |
| Export | Real native PNG and vector PDF; PDF recompiles for white paper/printing visibility | No promise of printer/plotter/AutoCAD-identical output, PDF/A/X compliance or color-managed print certification. |

## Resource and workload limits

The default text parser limits source length to 64 MiB code units and four million
tags; the option is named `maxBytes` for compatibility but measures string length,
not UTF-8 bytes. Geometry compilation defaults to 500,000 primitives, three million
sample vertices, 48 block levels, 100,000 instances and 20,000 hatch pattern lines.
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

The included native pixel tests run Skia raster WASM. Browser tests negotiate an
available native backend and wait for its flush; the recorded local environment
used Skia raster presentation. Graphite/WebGPU and Ganesh/WebGL are supplied by
SkiaSharpWeb but have not been certified here on representative physical hardware.
Old-renderer snapshots and their two previously known SVG mismatches are not the
new acceptance gate. No unchanged-baseline or complete-AutoCAD-parity claim is made.
