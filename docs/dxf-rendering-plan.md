# DXF 2018 Rendering Overlay Plan

1. [x] **Milestone 1: Core Rendering Overlay Infrastructure**
    1. [x] Task 1.1: Capture UX requirements for opening the DXF overlay from both left and right panes, including hotkeys and context menu affordances. (see `docs/dxf-rendering-m1-execution.md#task-11-%E2%80%93-ux-requirements-for-overlay-entry-points`)
    2. [x] Task 1.2: Design overlay lifecycle (mount/unmount, focus management, resizing) and document integration contract for host panes. (see `docs/dxf-rendering-m1-execution.md#task-12-%E2%80%93-overlay-lifecycle--integration-contract`)
    3. [x] Task 1.3: Evaluate faster drawing APIs (e.g., WebGL2 via regl or PixiJS vs. Canvas2D with OffscreenCanvas) and select a primary + fallback stack. (see `docs/dxf-rendering-m1-execution.md#task-13-%E2%80%93-rendering-backend-evaluation--selection`)
    4. [x] Task 1.4: Implement rendering surface abstraction that can swap drawing backends without touching higher-level entity renderers. (see `docs/dxf-rendering-m1-execution.md#task-14-%E2%80%93-rendering-surface-abstraction-design`)
    5. [x] Task 1.5: Establish render loop, frame budget diagnostics, and overlay visibility toggles wired to pane controls. (see `docs/dxf-rendering-m1-execution.md#task-15-%E2%80%93-render-loop-diagnostics-and-controls`)

2. [x] **Milestone 2: DXF Document Loading & Scene Graph**
    1. [x] Task 2.1: Extend parser pipeline to emit fully typed DXF 2018 entity models with metadata required for rendering (layer, color, linetype, visual style). (see `docs/dxf-rendering-m2-execution.md#task-21-%E2%80%93-parser-enhancements-for-rendering-metadata`)
    2. [x] Task 2.2: Build scene graph schema separating model space, paper space, and block definitions with dependency tracking. (see `docs/dxf-rendering-m2-execution.md#task-22-%E2%80%93-scene-graph-schema--dependency-tracking`)
    3. [x] Task 2.3: Implement incremental loading and lazy hydration for large DXF files to support fast overlay startup. (see `docs/dxf-rendering-m2-execution.md#task-23-%E2%80%93-incremental-loading--lazy-hydration`)
    4. [x] Task 2.4: Add observers that notify renderer of entity mutations, layer toggles, and view changes. (see `docs/dxf-rendering-m2-execution.md#task-24-%E2%80%93-observers--real-time-updates`)
    5. [x] Task 2.5: Validate memory footprint with large assemblies and tune scene graph pruning thresholds. (see `docs/dxf-rendering-m2-execution.md#task-25-%E2%80%93-memory-profiling--tuning`)

3. [x] **Milestone 3: Core 2D & 3D Geometry Rendering**
    1. [x] Task 3.1: Render basic primitives (POINT, LINE, RAY, XLINE) with layer-driven styling and selection affordances.
    2. [x] Task 3.2: Support polyline variants (LWPOLYLINE, POLYLINE, 3DPOLYLINE, SPLINE, HELIX) with adaptive tessellation and curve smoothing.
    3. [x] Task 3.3: Implement circular entities (CIRCLE, ARC) and elliptical entities (ELLIPSE) with accurate sweep angles and thickness.
    4. [x] Task 3.4: Render solids and surfaces (3DFACE, TRACE, SOLID, REGION, SURFACE, 3DSOLID) with Gouraud shading and section cut handling.
    5. [x] Task 3.5: Add mesh/vertex rendering for POLYFACE_MESH and MESH entities with normal support and back-face culling.

4. [ ] **Milestone 4: Blocks, Inserts, Viewports, and References**
    1. [x] Task 4.1: Implement nested BLOCK and INSERT resolution with transformation stacks and attribute overrides.
    2. [x] Task 4.2: Support XREF, IMAGE, DGN, and PDF underlay rendering with caching, clipping, and unload controls.
    3. [x] Task 4.3: Render paper space layouts, named views, and tiled VIEWPORT configurations with regen-aware clipping.
    4. [x] Task 4.4: Add draw-order resolution for overlapping blocks, wipeouts, and underlays.
    5. [x] Task 4.5: Provide block browser UI within overlay for fast jumping and isolation of block instances.

5. [x] **Milestone 5: Annotation, Tables, and Dimensions**
    1. [x] Task 5.1: Render TEXT, MTEXT, and TOLERANCE entities with font fallback, SHX support, and line wrapping identical to TrueView.
    2. [x] Task 5.2: Implement full DIMENSION family (aligned, linear, angular, radius, diameter, ordinate) with associative updates.
    3. [x] Task 5.3: Support LEADER, MLEADER, and MULTILEADERSTYLE rendering with arrowheads, landing offsets, and block content.
    4. [x] Task 5.4: Render TABLE entities with cell styling, merged cells, formulas, and background fills.
    5. [x] Task 5.5: Handle attribute definitions (ATTDEF) and references (ATTRIB) with editing hooks and visibility states.

6. [ ] **Milestone 6: Fills, Hatches, Materials, and Visual Styles**
    1. [x] Task 6.1: Implement HATCH rendering with pattern libraries, gradient fills, island detection, and associative updates.
    2. [x] Task 6.2: Support SOLID fills, WIPEOUT masking, and TRANSFORMED gradient behavior in paper vs. model space.
    3. [x] Task 6.3: Integrate material definitions (MATERIAL) including textures, specularity, transparency, and self-illumination.
    4. [x] Task 6.4: Render lights (LIGHT), background (BACKGROUND), and sun studies with per-viewport settings.
    5. [x] Task 6.5: Implement TrueView-equivalent visual styles (visualstyle table) including wireframe, hidden, shaded, realistic, and conceptual.

7. [ ] **Milestone 7: Document Controls, Layers, and Metadata Parity**
    1. [x] Task 7.1: Implement layer manager overlay tab with freeze/lock/on/off, transparency, color, and plot style visualization. (see `docs/dxf-rendering-m7-execution.md#task-71-%E2%80%93-layer-manager-overlay-panel`)
    2. [x] Task 7.2: Render lineweights, linetypes (including complex shapes), and color book support. (see `docs/dxf-rendering-m7-execution.md#task-72-%E2%80%93-lineweights-linetypes-and-color-book-support`)
    3. [x] Task 7.3: Apply UCS, viewport UCS per view, and world coordinate transforms consistently across entities.
    4. [x] Task 7.4: Support named plot styles (STB/CTB), plot configuration, and background mask handling.
    5. [x] Task 7.5: Expose drawing properties (units, limits, metadata, geographic location) within the overlay overview tab that aggregates all document information.
        * Overlay layout now uses two tabs: `Overview` for the consolidated document information and `Layers` for the dedicated layer manager view, moving the previously stacked info into the overview tab.

8. [ ] **Milestone 8: Interaction, Selection, and Measurements**
    1. [x] Task 8.1: Implement selection hit-testing with marquee, lasso, and single-pick matching TrueView behavior. (see `docs/dxf-rendering-m8-execution.md#task-81-%E2%80%93-selection-hit-testing-marquee-and-lasso`)
    2. [x] Task 8.2: Provide measurement tools (distance, area, angle) leveraging accurate geometry evaluations.coed
    3. [x] Task 8.3: Add layer/object isolate/lock workflows and contextual toolbars within the overlay.
    4. [x] Task 8.4: Support snapping aides (endpoint, midpoint, center, node, etc.) and display marker feedback.
    5. [x] Task 8.5: Integrate undoable view navigation (zoom, pan, orbit) with view cube and steering wheel equivalents.

9. [ ] **Milestone 9: Performance, Testing, and Parity Validation**
    1. [ ] Task 9.1: Automate frame timing benchmarks across representative DXF datasets and enforce budget thresholds.
    2. [ ] Task 9.2: Build regression test fixtures comparing rendered outputs against Autodesk TrueView screenshots/vector exports.
    3. [ ] Task 9.3: Add fuzz testing for entity combinations, malformed inputs, and stress cases to ensure graceful degradation.
    4. [ ] Task 9.4: Implement telemetry hooks to capture overlay usage, rendering errors, and slow paths.
    5. [ ] Task 9.5: Establish release-readiness checklist and sign-off criteria for 100% feature parity.

10. [ ] **Milestone 10: Documentation, Rollout, and Developer Experience**
    1. [ ] Task 10.1: Document rendering architecture, extension points, and backend switching guides in docs.
    2. [ ] Task 10.2: Provide sample DXF packs annotated to highlight coverage of each 2018 feature.
    3. [ ] Task 10.3: Add onboarding guides for designers and QA covering overlay controls and parity expectations.
    4. [ ] Task 10.4: Prepare rollout plan with feature toggles, staged releases, and telemetry-driven exit criteria.
    5. [ ] Task 10.5: Host internal review comparing overlay experience vs. TrueView and capture follow-up actions.

Ran through the rendering stack; key gaps vs DXF 2018 are below.

- Entities beyond the 34 cases handled in `RenderableEntityFactory` fall straight into the raw fallback, so DXF 2018 entities such as `MLINE`, `MPOINT`, `ARCALIGNEDTEXT`, `CENTERLINE`, `CENTERMARK`, `SHAPE`, `BODY`, `POLYSOLID`, `POINTCLOUD`, `GEOPOSITIONMARKER`, `SECTION`, `ACAD_PROXY_ENTITY`, `OLEFRAME/OLE2FRAME`, etc. are silently ignored (`components/rendering-entities.js:823-1720`). That prevents parity with TrueView for any drawing that contains the newer annotation or 3D primitives.
- Table/object coverage is also narrow: `processTableRecord` only understands LAYER/LTYPE/STYLE/BLOCK_RECORD/VISUALSTYLE/MULTILEADERSTYLE/UCS/VPORT (`components/rendering-document-builder.js:2473-2723`), and the object passes stop at DICTIONARY/ACDBPLACEHOLDER/PLOTSETTINGS/LAYOUT plus MATERIAL/BACKGROUND/SUN/ACDBCOLOR (`components/rendering-document-builder.js:1921-1996`, `components/rendering-document-builder.js:2284-2435`). Required definitions such as `DIMSTYLE`, `APPID`, `REGAPP`, `VIEW`, `TABLESTYLE`, `MLINESTYLE`, `SCALE`, `IMAGEDEF`, `IMAGEDEF_REACTOR`, `RASTERVARIABLES`, `PDFUNDERLAYDEFINITION`, `POINTCLOUD*`, `DATALINK`, `DICTIONARYVAR`, and `LIGHTLIST` never get parsed, so referenced entities (dimensions, images, underlays, point clouds, tables, etc.) cannot resolve their style/resource data.
- Header ingestion only grabs units/extents/metadata and is surfaced solely in the overlay summary (`components/rendering-document-builder.js:1009-1159`; `components/rendering-overlay.js:1753-1779`). Rendering ignores core header controls—`$LTSCALE`, `$CELTSCALE`, `$PSLTSCALE`, `$CELTYPE`, `$CELWEIGHT`, `$CELTEXTSTYLE`, `$PDMODE`, `$PDSIZE`, `$FILLMODE`, `$MIRRTEXT`, `$TEXTSTYLE`, `$TEXTSIZE`, `$DIM*`, `$VIEWDIR`, `$UCS*`, `$VISRETAIN`, etc.—so defaults for linetypes, text, dimensions, point glyphs, fills, and UCS/view orientation cannot match AutoCAD.

Next steps:
1. Build a DXF 2018 entity/object coverage matrix and extend `RenderableEntityFactory`/scene ingestion to cover the missing entities, starting with the high-impact ones (MLINE, body/polysolid, arc-aligned text, point cloud, section/detail annotations, proxy entities).
2. Expand table/object parsing so `RenderingDocumentBuilder` collects and normalises DIMSTYLE, TABLESTYLE, IMAGEDEF/UNDERLAY/RASTER definitions, SCALE dictionaries, VIEW/APPID/REGAPP data, etc., and wire those into entity resolution.
3. Broaden header handling to ingest and apply the rendering-critical variables (linetype scaling, default layer/lineweight/text/dimension settings, fill flags, UCS/view settings) so the renderer’s behaviour aligns with AutoCAD defaults.

## MTEXT Rendering & Parsing Parity Plan (DXF 2018)

### Current State Snapshot
- **Parsing:** `_decodeMText` handles basic toggles (`\L`, `\O`, `\K`, `\F`, `\H`, `\W`, `\T`, `\Q`, `\S`) but ignores color (`\C`), background mask directives (`\bg`, `\Bc`), list/tab escapes, fields, Unicode `\U+`, and AutoCAD’s numbered/bulleted list controls. Column metadata, paragraph spacing, and mask settings from entity group codes (44, 73, 90–95, etc.) are not propagated beyond raw tags.
- **Layout:** `TextLayoutEngine.layout` flattens all runs to plain text, so width scaling, tracking, oblique angles, stacked fractions, and column breaks do not affect measurement or wrapping. Paragraph alignment (`\A`) and tabs are ignored; vertical writing modes and multi-column flow are unavailable.
- **Rendering:** Canvas renderer draws a single run with uniform styling (no per-run color/fills/underline). Overlay DOM applies limited styling (bold/italic/underline/overline, font, height scale) but omits width scaling, oblique, tracking, color, and stacked fractions. Background masks, column gutters, and vertical flow are not rendered.

### Parity Targets (DXF 2018)
1. [ ] **Inline Formatting Coverage**
   - [ ] Support the full escape set: `\A`, `\P`, `\X`, `\C`/`\c`, `\L`/`\l`, `\O`/`\o`, `\K`/`\k`, `\W`, `\H`, `\T`, `\Q`, `\F`, `\S` (all fraction modes), Unicode escapes (`\U+xxxx`), literal escapes (`\\`, `\{`, `\}`), caret toggles (`^I`, `^J`), list/bullet modifiers (`\li`, `\ln`, `\pi`, `\pn`), and field codes (`\AcVar`, `\f`).
2. [ ] **Paragraph & Column Layout**
   - [ ] Honour DXF group codes 71/72/73 (attachment/drawing direction/line spacing), 44 (line spacing), 45–48 (background offsets), 75–84 (column flow), and tab stops (`\tc`, `\ta`, `\ts`) with proper indent handling.
   - [ ] Implement bullet/numbered lists with hanging indents and resets as per AutoCAD behaviour.
3. [ ] **Background Masks & Frames**
   - [ ] Render background masks defined via group codes 90–95, 63, 421, 423, 441 with correct alpha, offsets, and per-column application.
4. [ ] **Writing Direction & Extrusion**
   - [ ] Apply full 3D orientation using MTEXT normal/extrusion; support vertical writing (drawing direction 1/3) with correct glyph sequencing and column stacking.
5. [ ] **Per-Run Rendering**
   - [ ] Canvas: render each run with individual color, font, width scaling (context scale), oblique (skew transform), tracking (manual glyph positioning), underline/overline/strike, and stacked fraction layout.
   - [ ] Overlay DOM: mirror features via nested spans (CSS `transform`, `letter-spacing`, `writing-mode`, etc.) and background mask elements.
6. [ ] **Diagnostics & Regression**
   - [ ] Provide diagnostics panel visualizing parsed runs/paragraphs, unsupported escapes, and column layout. Add regression fixtures comparing against AutoCAD/TrueView renders.

### Execution Roadmap
**Phase MT1 – Parser Expansion**
1. [ ] Refactor `_decodeMText` into tokenizer + interpreter aligned with AutoCAD’s MTEXT grammar; add unit tests covering every escape and nesting scenario.
2. [ ] Extend entity extraction to capture column/background codes, paragraph spacing, list state, tab definitions, and store structured metadata alongside runs.
3. [ ] Normalise color/truecolor parsing (ACI palette + RGB), font descriptors (`\Ffont|bBig|cCharset|pPitch`), and stacked fraction parameters (horizontal/diagonal/tolerance).

**Phase MT2 – Layout Engine Upgrade**
1. [ ] Introduce a paragraph model (paragraphs → lines → runs) with alignment, spacing, tabs, lists, columns, and background metadata.
2. [ ] Rework measurement to apply width scaling, tracking, oblique; implement stacked fraction layout (baseline offsets, fraction bars).
3. [ ] Handle columns (auto height, gutter, direction) and vertical writing by transforming layout coordinates prior to projection.
4. [ ] Add unit tests comparing measured extents against reference DXF fixtures (capture from AutoCAD via `MTEXPORT` or PDF).

**Phase MT3 – Rendering Fidelity**
1. [ ] Update canvas renderer to iterate runs, apply styles, draw masks, fractions, underline/overline/strike, and honour vertical flow.
2. [ ] Upgrade overlay DOM renderer: generate spans per run, apply CSS transforms, set colors/weights, render masks as absolutely positioned elements.
3. [ ] Integrate per-run color with selection/highlight logic; support background mask toggles in diagnostics.

**Phase MT4 – Validation & Tooling**
1. [ ] Assemble MTEXT-focused DXF fixtures (all escapes, columns, vertical text, masks, lists, fields) and capture AutoCAD/TrueView baseline images.
2. [ ] Add regression harness (canvas snapshot diff + DOM screenshot diff) to CI.
3. [ ] Document supported features, limitations, and debugging workflows; expose parsed run tree in diagnostics panel.

### Milestones & Success Criteria
- **MT1 Complete:** Parser handles full DXF 2018 escape set with 100% unit-test coverage; no “unsupported escape” diagnostics on fixtures.
- **MT2 Complete:** Layout engine produces accurate wraps and column flows; measurement diffs against reference within tolerance (<1 px).
- **MT3 Complete:** Canvas + overlay visually match AutoCAD for all fixtures (manual review + automated diff).
- **MT4 Complete:** Regression suite integrated; documentation updated; diagnostics expose run metadata.

### Risks & Mitigations
- **SHX Metric Gaps:** Without SHX glyph metrics, width scaling may deviate (plan to approximate and schedule SHX measurement work).
- **Performance Regressions:** Rich layout may affect frame time (mitigate via layout caching keyed by MTEXT content + style hash).
- **Browser Limitations:** Vertical writing or oblique transforms may need per-browser workarounds (provide canvas fallback, test across supported browsers).
- **Field Evaluation Scope:** Complex field evaluation (e.g., DIESEL) remains out of scope—capture raw tokens for future processing.

## DXF 2018 Coverage Matrix

### Entities

| Entity | Status | Notes |
| --- | --- | --- |
| LINE, XLINE, RAY, POINT | Supported | Geometry + metadata already normalised via `RenderableEntityFactory`. |
| CIRCLE, ARC, ELLIPSE | Supported | Accurate sweep/radius parsing in `components/rendering-entities.js`. |
| HATCH | Supported | Pattern, gradient, boundary loops extracted. |
| HELIX | Supported | Parametric sampling implemented (96 samples/turn). |
| TEXT, MTEXT | Supported | Alignment, styling, background masks parsed. |
| ATTDEF, ATTRIB | Supported | Attribute flags decoded; block ingestion handles previews. |
| TOLERANCE | Supported | All segment strings preserved for symbol reconstitution. |
| INSERT | Supported | Block insertions, scaling, attribute flag detection handled. |
| DIMENSION | Supported | Generic dimension geometry + block name resolved. |
| LEADER, MLEADER | Supported | Vertex series captured with style handles. |
| TABLE | Supported | Cell iteration builds merged text + styling metadata. |
| POLYLINE, LWPOLYLINE | Supported | Vertices, bulges, widths populated. |
| POLYFACE_MESH, MESH | Supported | Vertex/face arrays initialised for scene graph expansion. |
| SPLINE | Supported | Degree, knots, weights, tolerance arrays parsed. |
| 3DFACE, TRACE, SOLID, WIPEOUT | Supported | Vertex fans captured; wipeout flagged via entity type. |
| 3DSOLID, REGION, SURFACE, BODY | Partial | ACIS payloads surfaced; triangulation still deferred to viewers. |
| IMAGE | Supported | Definition handle, clip state, brightness/contrast captured. |
| PDFUNDERLAY, DGNUNDERLAY, DWFUNDERLAY | Supported | Clipping polygon + display parameters ingested. |
| VIEWPORT | Supported | View, snap, clip metadata collected. |
| LIGHT | Supported | Photometric + shadow settings processed. |
| MLINE | Partial | Style/scale/vertex sets captured; graphics reconstruction pending. |
| POLYSOLID | Partial | Path, widths, heights parsed; tessellation TODO. |
| ARCALIGNEDTEXT | Partial | Arc geometry and text metadata extracted; glyph layout TBD. |
| POINTCLOUD, POINTCLOUDATTACH | Partial | Placement, definition handles, overrides captured; octree/voxels unparsed. |
| SECTION | Partial | Cutting plane, boundary, state tracked; slice geometry generation pending. |
| ACAD_PROXY_ENTITY | Partial | Proxy metadata + binary payload preserved for downstream adapters. |
| SHAPE, MPOINT, GEOPOSITIONMARKER, UNDERLAYFRAME, OVERLAYFRAME, other niche 2018 entities | Missing | No handlers yet; they fall back to raw tag dumps. |

### Tables & Objects

| Table/Object | Status | Notes |
| --- | --- | --- |
| LAYER, LTYPE, STYLE, BLOCK_RECORD | Supported | Normalisation performed in `RenderingDocumentBuilder.processTableRecord`. |
| VISUALSTYLE, MULTILEADERSTYLE, UCS, VPORT | Supported | Enriched lookups emitted for scene graph. |
| DICTIONARY, ACDBDICTIONARYWDFLT, PLOTSETTINGS, LAYOUT | Supported | Dictionary tree walked; layouts cross-linked with plot settings. |
| MATERIAL, BACKGROUND, SUN, ACDBCOLOR | Supported | Catalogues emitted with handle/name lookups. |
| COLORBOOK, plot style catalogs (STB/CTB) | Supported | Color book + plot style dictionaries flattened. |
| DIMSTYLE, TABLESTYLE, MLINESTYLE, SCALE | Missing | Not yet parsed from TABLES/OBJECTS; prevents style resolution. |
| APPID, REGAPP, VIEW, VIEWPORT entity settings | Missing | APP/REGAPP/VIEW records ignored, blocking named view fidelity. |
| IMAGEDEF, IMAGEDEF_REACTOR, RASTERVARIABLES | Missing | Image underlay resources unresolved; impacts IMAGE entity parity. |
| UNDERLAYDEFINITION (PDF/DWF/DGN) | Missing | Underlay defs not captured; proxies only include handles. |
| POINTCLOUDDEF, POINTCLOUDDEF_REACTOR, POINTCLOUDDEF_EX | Missing | Cloud metadata absent; intensity/color mapping incomplete. |
| SECTIONVIEWSTYLE, DETAILVIEWSTYLE | Missing | Section/detail annotation styles unavailable for references. |
| ACAD_PROXY_OBJECT | Missing | Proxy objects ignored; no metadata surfaced. |
| DATALINK, DICTIONARYVAR, VBA_PROJECT, LIGHTLIST | Missing | Additional OBJECTS records skipped during ingestion. |

Status key: “Supported” indicates full ingestion by parser + scene builder; “Partial” exposes structured metadata but lacks downstream rendering parity; “Missing” currently falls back to raw tags.

## Parity Completion Roadmap

### Phase 1: Remaining Entity & Object Coverage
- [x] Task 1.1: Parse and render legacy primitives (SHAPE, MPOINT, GEOPOSITIONMARKER, OLE/OLE2_FRAME, UNDERLAYFRAME/OVERLAYFRAME), including block fallback geometry.
- [x] Task 1.2: Extend point cloud handling with reactor/ex-record lookups, full clip boundaries, intensity/true-color channel support, and shader-ready metadata.
- [x] Task 1.3: Ingest associative section/detail result entities (`SECTIONOBJECT`, `DETAILVIEWOBJECT`, etc.) and wire their geometry into the scene graph.
- [x] Task 1.4: Surface proxy object/entity subclasses with glyph previews, binary payload descriptors, and diagnostics so the renderer can display placeholders.

### Phase 2: Header-Driven Defaults & View State
- [x] Task 2.1: Apply linetype scaling controls (`$LTSCALE`, `$CELTSCALE`, `$PSLTSCALE`) during scene build and in renderer sampling.
- [x] Task 2.2: Honor default linetype/lineweight/textstyle/dimstyle (`$CELTYPE`, `$CELWEIGHT`, `$TEXTSTYLE`, `$DIMSTYLE`, etc.) when entities omit explicit overrides.
- [x] Task 2.3: Implement point display flags (`$PDMODE`, `$PDSIZE`) and fill toggles (`$FILLMODE`, `$MIRRTEXT`, `$TRACEWID`) in geometry extraction and draw order.
- [x] Task 2.4: Sync UCS/view header variables (`$UCS*`, `$VIEWDIR`, `$VPOINT`) with viewport construction so model/paper views match AutoCAD.

### Phase 3: 3D Geometry Fidelity
- [x] Task 3.1: Integrate an ACIS/mesh tessellation pipeline for BODY/3DSOLID/REGION/SURFACE entities to support shaded/hidden/realistic visual styles.
- [x] Task 3.2: Replace POLYSOLID placeholder polylines with volumetric extrusion meshes and correct end-cap geometry.
- [x] Task 3.3: Generate section cut solids (hatching, boundary profiles, depth) for SECTION entities and linked annotations.
- [ ] Task 3.4: Validate tessellated geometry against TrueView in hidden/shaded visual styles and capture performance baselines.

### Phase 4: Parity Fixtures & Regression Suite
- [ ] Task 4.1: Assemble DXF fixtures targeting the newly supported entity families (point clouds, proxies, sections, shapes, 3D solids).
- [ ] Task 4.2: Capture TrueView renders (SVG + raster) for each fixture and add them to the parity baseline harness.
- [ ] Task 4.3: Expand automated parity checks to include header-driven scenarios (different `$LTSCALE`, UCS, point display) with tolerance thresholds.
- [ ] Task 4.4: Document coverage status per fixture and bake the checks into release gating for DXF 2018 parity.

### Phase 5: Section & Style Fidelity
- [x] Task 5.1: Drive section cut fills/hatching from `SECTIONVIEWSTYLE` definitions (hatch families, background fills, bend line visibility).
- [x] Task 5.2: Associate section fills with `SECTIONOBJECT` metadata (source handles, associative updates, live state).
- [x] Task 5.3: Extend coordinate defaults to resolve per-layout paper UCS matrices and named view overrides.
    * Section cut rendering now resolves `SECTIONVIEWSTYLE` color/visibility flags so fills, hatches, and bend lines honor style metadata.
    * Section fills now emit associative metadata linking back to `SECTIONOBJECT`/geometry handles (including live-state flags) for update tracking.
    * Paper-space matrices now honor layout-specific UCS or named view overrides, ensuring per-layout scenes inherit the correct orientation.

### Phase 6: Tessellation Robustness & QA
- [x] Task 6.1: Improve polysolid tessellation to honor variable widths, miters, and self-intersections.
- [ ] Task 6.2: Support solids/regions with holes or multiple loops; fallback to constrained triangulation when ACIS data lacks outlines.
- [ ] Task 6.3: Add parity fixtures for complex solids/sections and validate against TrueView shaded/hidden outputs.
    * Polysolid tessellation now computes miter-aware offsets with variable segment widths and robust polygon triangulation to avoid self-crossing outlines.
