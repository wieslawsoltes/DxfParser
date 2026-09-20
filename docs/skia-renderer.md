# Native Skia renderer replacement

## Ownership and migration

`packages/dxf-skia` is the new independent library. Its layers are:

```text
ASCII/ordered DXF tags
  → DxfDocument (identity, tables, layouts, blocks and unmodified data)
  → SceneCompiler (typed retained world geometry, clipping, styles and diagnostics)
  → projected scene/BVH + double-precision camera
  → SkiaPainter (rebased native paths, native glyphs/images and clips)
  → SurfaceHost (SkiaSharpWeb native surface, asynchronous flush and disposal)
```

The app-boundary file `components/skia-rendering-adapter.js` preserves the
`DxfRendering` service name used by existing UI controllers. It does not preserve
or call the former entity factories, compiler, tessellator or backends. Both parser
and editor instantiate the new compiler/painter. Block thumbnails also use native
Skia and release their temporary resources after asynchronous presentation.

The former rendering engine files are removed: `rendering-entities`,
`rendering-scene-graph`, `rendering-document-builder`, `rendering-data-controller`,
`rendering-renderer`, `rendering-tessellation`, `rendering-surface-canvas`,
`rendering-surface-webgl`, `rendering-text-layout`, `shx-font-loader`, `acis-parser`,
`procedural-surfaces`, `catmull-clark-subdivision` and `point-cloud-loader`.

`rendering-overlay.js` and `rendering-property-grid.js` remain as application UI,
not as a second geometry implementation. Their former SVG text painter and simple
Canvas fallback are removed. Picking, snaps, view transforms, thumbnails and export
now use the new library. Existing selection/measurement interaction overlays remain
UI affordances. Skia's raster backend may use a 2D canvas to present native pixels;
that is not the former JavaScript Canvas2D geometry renderer.

`dist/dxf-rendering.global.js` keeps its URL to avoid breaking the app shell, but
is regenerated solely from the new library and the retained UI adapters. The
build script also emits standalone CJS, native ESM and classic-browser packages.
CommonJS and Node ESM imports share constructors; browser ESM has its own private
namespace and the classic script intentionally defines `globalThis.DxfSkia`.

## CAD workspace

**CAD View** is a real RibbonWeb tab, with Model/Layout, orthographic direction,
Grid, Object snaps, command line, resources, diagnostics, PNG and PDF commands.
The **CAD workspace** preset uses Dockyard with native drawing at the center,
layers/blocks/resources at the left, inspection/diagnostics at the right and a
usable command line at the bottom. Ordinary Compare/Review/Focus remain available.
The toolbar does not replace independent DXF document ownership or source-aware
analysis navigation.

The canvas footer exposes actual Model and named paper-space tabs, coordinates
and the negotiated native backend. Footer controls are excluded from drawing
pointer capture, so clicking a paper-layout tab cannot become a selection gesture.
Top/Bottom/Front/Back/Left/Right/Isometric change the true orthographic view basis;
these are not a renamed set of 2D rotations. The view cube uses the same basis.

The command line is a bounded view-command parser, not `eval` and not an imitation
of unimplemented drawing/editing commands. Supported commands:

```text
HELP
ZOOM EXTENTS          ZOOM 1.5
PAN 40 -20            VIEW ISOMETRIC
MODEL                 LAYOUT "Sheet A"
GRID ON               OSNAP OFF
LAYER OFF "Pipework"  LAYER ON "Pipework"
SELECT AB             ISOLATE AB
UNISOLATE             REGEN
PNG                   PDF
```

History is bounded to 100 commands and 150 displayed log entries; Up/Down recall
commands and Escape clears input. Invalid numeric values and unknown commands are
reported. Home/tree editing continues to use existing application operations.

Rendering Diagnostics and Drawing Resources use the existing real TreeDataGridWeb
analysis control, not a second custom table. Diagnostic navigation retains the
source document and refuses a closed source. Missing fonts/images do not trigger
network requests. Register authorized local bytes through Fonts / images; successful
font registration recompiles text bounds with real native metrics. Unload also
invalidates compilation so old font metrics cannot survive resource removal.

## Geometry, memory and lifecycle

Matrices, model coordinates, hit tests and camera calculations use JavaScript
doubles. Before native float path storage, geometry is locally rebased per
primitive. Direction transforms use the matrix's linear part, avoiding cancellation
from subtracting two large translated origins. Native conics preserve circles and
ellipses under affine transforms; validated de Boor sampling handles rational
B-splines. Extrusion, nested references and paper-space clipping are applied before
projection.

Native surfaces and image/font/paint/path objects have explicit owners. A painter
owns an implicitly created ResourceStore; a caller-supplied store stays caller-owned.
Paths use a bounded LRU. The host serializes native initialization/flush/disposal
and coalesces pending camera/size requests. Disposing during initialization prevents
later surface attachment. Browser context negotiation may replace the initial
canvas once; all app/controller references are updated. Normal resize reuses the
successful backend. Runtime GPU failures use a bounded fallback chain with explicit
user retry; retained resources and the latest frame survive backend replacement. Native surface allocation limits fail explicitly and a later
valid-size request can recover.

PNG exports the presented native surface. PDF recompiles against white paper,
applies plotting visibility and exports an actual native vector page. PDF output
is not an AutoCAD plot or archival-compliance certification.

## Acceptance and retired tests

The previous renderer tests were tightly coupled to deleted internal factories and
its generated SVG approximation. Their runner is removed rather than preserved by
loading the old engine in tests. **The previous two known SVG mismatches are not
claimed to remain unchanged.** Old captures are retained under tests/baselines,
outputs and trueview only as labeled historical fixture material, not as acceptance
or trusted third-party golden renders.

The replacement gate has independent mathematical assertions and real native
pixels: conics, OCS/blocks/arrays, rational splines, thickness, hatches/islands,
styles/visibility/order, clips/layouts, huge coordinates, native text/image resource
lifetime, SHX/proxy bounds, picking, PNG and vector PDF. The package checker installs
the packed tarball into a separate consumer, validates CJS/ESM identity and strict
TypeScript, then draws native Skia pixels using that installed package.

Existing Dockyard (18), Ribbon/document (31), Office preview (20), and analysis
workbench (26) integration groups are retained. The added native CAD browser suite
exercises real module/WASM loading, pointer selection, camera/view/layout commands,
resource upload/unload, downloads, resize, suspension and disposal. It waits for
native flush instead of accepting a CSS-colored or uninitialized canvas.

Exact results and environment are recorded in the delivered verification report.
Local checks do not establish GitHub CI, deployed-site or physical-GPU qualification.
Full AutoCAD/all-DXF fidelity remains outside this candidate's current scope; consult
[the compatibility contract](../packages/dxf-skia/COMPATIBILITY.md).

## Provenance

The native runtime is pinned to SkiaSharpWeb at
`1f26ba6e5ab8731bdbd08d18a45e65c9763a57d3`. Its source identity, notices and SHA-256
manifest are under `vendor/skiasharpweb`. Release 0.2.0 adds documented local JavaScript
patches for the WebGPU ABI and checked submission; the native WASM is unchanged.
See [the improvement review](skia-renderer-improvements.md) and the vendor patch manifest. Dockyard, RibbonWeb, TreeDataGridWeb, GridWeb
and RichTextWeb retain their existing pinned distributions and licenses.

This implementation was prepared against DxfParser feature commit
`a21f103eef26e529b464d42dc933d4ef6d08241e`, whose exact Git tree was reconstructed and
verified before applying the change set. Publishing status belongs in the handoff
report, not in an unverified “merged” statement.

## 0.2.0 follow-up

[WebGPU failure analysis, new rendering features and recovery controls](skia-renderer-improvements.md).
