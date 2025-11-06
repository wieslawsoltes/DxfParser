# DXF 2018 Block & Insert Rendering Parity Plan

## Current Implementation Snapshot
- `components/rendering-entities.js:1400-1415` extracts INSERT entities with block name, translation, XY/Z scale factors, rotation, and array spacing so the renderer receives the basic placement data.
- `components/rendering-renderer.js:2413-2476` walks block instances, composing base-point shifts, unit conversions, local scale/rotation, and array offsets before rendering child geometry through `processEntity`.
- `components/rendering-renderer.js:380-478` resolves a single model/paper base matrix from UCS, VIEW, and VPORT tables, providing the parent transform that INSERT instances inherit.
- `components/rendering-document-builder.js:1155-1286` captures header settings such as `$INSUNITS`, `$INSUNITSDEFSOURCE/TARGET`, `$INSUNITSFAC`, `$INSBASE`, and UCS origins, exposing them on `sceneGraph.units` and `sceneGraph.coordinateDefaults`.
- `components/rendering-document-builder.js:5769-5794` records each block header’s base point, flags, and handles so block metadata is available during insert traversal.

## Gap Analysis

### Transform & Orientation Fidelity
- Entity metadata preserves extrusion normals and thickness (`components/rendering-entities.js:704-744`), yet the renderer operates entirely in 2D via the affine helpers at `components/rendering-renderer.js:60-103`, never consuming the stored extrusion, so out-of-plane blocks flatten incorrectly.
- INSERT geometry omits its own extrusion normal (`components/rendering-entities.js:1400-1415`), forcing the renderer’s transform composer (`components/rendering-renderer.js:2413-2476`) to assume WCS orientation for every reference.
- Drawing-level base points such as `$INSBASE` are parsed (`components/rendering-document-builder.js:1273-1286`), but `_buildFrame` only derives linetype scales from `insUnits` (`components/rendering-renderer.js:1438-1459`), leaving global insertion offsets unapplied.
- Layout insert bases are retained on each layout object (`components/rendering-document-builder.js:450-508`), yet the coordinate resolver still returns a single active VPORT basis (`components/rendering-renderer.js:472-478`), so paper-space inserts using alternate viewports deviate from AutoCAD.

### Header & Unit Semantics
- The scene graph stores `$INSUNITS`, `$INSUNITSDEFSOURCE`, `$INSUNITSDEFTARGET`, and `$INSUNITSFAC` (`components/rendering-document-builder.js:1155-1286`), but the renderer only converts between block record units (`components/rendering-renderer.js:2436-2457`) or dimension overrides (`components/rendering-renderer.js:3511-3523`), ignoring drawing-level defaults and scale factors.
- Layout and paper UCS origins are parsed (`components/rendering-document-builder.js:1189-1247`), yet block processing never re-resolves UCS bases as the stack changes, causing nested inserts defined in alternate UCSs to inherit the wrong orientation.
- There is no validation or fallback when insert arrays mix unit-less blocks with drawings that specify `INSUNITS` metadata, so mismatched units go undetected.

### Block & Attribute Semantics
- Colour index 0 is treated as a literal ACI (`components/rendering-entities.js:704-707`), and `_resolveColor` lacks BYBLOCK handling (`components/rendering-renderer.js:3114-3215`), so block references with ByBlock overrides render with fallback colours instead of inheriting the insert’s style.
- Block header flags and metadata (`components/rendering-document-builder.js:5769-5794`) are ignored by `_shouldRenderInsert` and the traversal logic (`components/rendering-renderer.js:2413-2479`, `components/rendering-renderer.js:7632-7674`), preventing support for behaviours such as “scale uniformly” or xref overlay visibility.
- Attribute references respect visibility toggles when queued (`components/rendering-renderer.js:2155-2266`), but the pipeline does not honour alignment points, lock-position flags, or per-attribute unit scaling, so insert-driven attribute layout diverges from AutoCAD.
- Block clipping data is never surfaced by the entity factory, leaving xref or block boundary clips unsupported during rendering.

### Diagnostics & Testing
- Block metadata summarises instances and attributes (`components/rendering-document-builder.js:1784-2037`), yet there are no fixtures or automated checks that exercise nested insert transforms, BYBLOCK inheritance, or unit conversions.
- The renderer exposes no debugging overlay for per-insert transform matrices or unit scales, making parity validation ad hoc and manual.

## Improvement Roadmap

### 1. [ ] Milestone 1: Transform Stack Fidelity
1. [x] Replace the 2D helper matrices with a unified 3D affine representation that consumes entity and insert extrusions before projecting to screen space (`components/rendering-renderer.js:60-103`).
2. [x] Extend INSERT parsing to capture extrusion normals and any owner OCS basis (`components/rendering-entities.js:1400-1415`), threading those values through `processEntity` so nested references honour arbitrary planes (`components/rendering-renderer.js:2413-2476`).
3. [x] Apply drawing- and layout-level base points (`components/rendering-document-builder.js:450-508`, `components/rendering-document-builder.js:1273-1286`) when computing model/paper matrices, ensuring block stacks inherit global offsets.
4. [x] Recompute UCS bases per viewport and per block stack by resolving the active UCS handle whenever traversal enters a new insert context (`components/rendering-renderer.js:380-478`).

### 2. [ ] Milestone 2: Header & Unit Semantics
1. [x] Incorporate `$INSUNITSFAC`/`$INSUNITSFACTOR`, `$INSUNITSDEFSOURCE`, and `$INSUNITSDEFTARGET` when deriving default insert scale so unit-less blocks adopt drawing defaults (`components/rendering-document-builder.js:1155-1286`, `components/rendering-renderer.js:2436-2457`).
2. [x] Honour block-record `scaleUniformly` and related flags to prevent unsupported non-uniform scaling while surfacing diagnostics for offenders (`components/rendering-document-builder.js:1913-2037`).
3. [x] Emit diagnostics that report the computed source/target units and applied scale per insert, catching mismatches early.

### 3. [ ] Milestone 3: Block & Attribute Behaviour
1. [x] Implement BYBLOCK inheritance for colour, linetype, and lineweight by propagating insert overrides into child render state before drawing (`components/rendering-entities.js:704-707`, `components/rendering-renderer.js:3114-3270`).
2. [x] Respect block header flags for explodability, overlay visibility, and uniform scaling during traversal (`components/rendering-document-builder.js:5769-5794`, `components/rendering-renderer.js:2413-2479`).
3. [x] Surface block clipping boundaries from auxiliary objects and apply them as clip masks when rendering child entities.
4. [x] Honour attribute alignment, lock-position, and width/field constraints by applying `geometry.alignmentPoint` and related metadata during `_queueSingleLineText` (`components/rendering-renderer.js:5867-5939`).
5. [x] Respect dimension style suppression flags for dimension lines and text, and surface them in block diagnostics (`components/rendering-renderer.js:8440-8895`, `components/rendering-document-builder.js:1780-2520`, `components/app.js:5449-5855`).

### 4. [ ] Milestone 4: Diagnostics & Regression Safety
1. [ ] Assemble fixtures covering nested inserts with UCS rotations, unit conversions, BYBLOCK overrides, and clipped xrefs, pairing them with AutoCAD reference renders.
2. [ ] Extend the overlay to visualise each insert’s transform matrix, unit scale, and inherited style overrides for rapid parity inspection.
3. [ ] Document manual parity steps and bake automated checks into CI to guard against regressions.

## Testing & Validation Strategy
- Add unit tests for the transform compositor to verify extrusion handling, base-point application, and BYBLOCK inheritance logic.
- Capture AutoCAD/TrueView render snapshots for parity fixtures and compare via image or geometry diffs after each milestone.
- Instrument diagnostics so regression suites assert expected unit factors, UCS bases, and inherited style metadata per insert.

## Success Criteria
- Inserts with arbitrary extrusions or UCS rotations render within pixel tolerance of AutoCAD in both model and paper space.
- BYBLOCK colour, linetype, and lineweight overrides propagate identically to AutoCAD, confirmed via automated metadata comparisons.
- Unit conversions honour drawing-level defaults and scale factors, eliminating manual rescaling when inserting foreign-unit blocks.
- Regression fixtures covering nested inserts, unit mismatches, and clipped xrefs run in CI and remain green across releases.
