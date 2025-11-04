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
    1. [x] Task 7.1: Implement layer manager overlay panel with freeze/lock/on/off, transparency, color, and plot style visualization. (see `docs/dxf-rendering-m7-execution.md#task-71-%E2%80%93-layer-manager-overlay-panel`)
    2. [x] Task 7.2: Render lineweights, linetypes (including complex shapes), and color book support. (see `docs/dxf-rendering-m7-execution.md#task-72-%E2%80%93-lineweights-linetypes-and-color-book-support`)
    3. [x] Task 7.3: Apply UCS, viewport UCS per view, and world coordinate transforms consistently across entities.
    4. [x] Task 7.4: Support named plot styles (STB/CTB), plot configuration, and background mask handling.
    5. [x] Task 7.5: Expose drawing properties (units, limits, metadata, geographic location) within overlay info panels.

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
