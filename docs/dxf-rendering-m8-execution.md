# Milestone 8 Execution Notes

## Task 8.1 – Selection Hit-Testing, Marquee, and Lasso

### Implementation Summary
- Enriched the rendering pipeline so every draw command carries pickable metadata (screen/world bounds, geometry kind, owning handle) and selection-aware colour overrides, allowing the surface manager to tint selected entities without rebuilding scene graphs.
- Added persistent per-tab selection state and a new `setSelectionHandles` path in `RenderingSurfaceManager`, ensuring selections survive overlay refreshes, block filtering, and attribute visibility toggles while keeping the text overlay in sync.
- Introduced an interaction layer atop the viewport that supports single-pick hit testing, direction-sensitive marquee selection (window vs. crossing), and Alt-driven freeform lasso capture, with Shift and Ctrl/⌘ modifiers for additive or toggle selection workflows.
- Implemented responsive marquee and lasso visuals with accessible styling, automatic teardown on resize/close, and pointer-capture management so dragging remains stable across mixed-content overlays.
- Hardened hit-testing by normalising handles, expanding coverage to fills, text, dimensions, and nested block content, and by reapplying selection tinting after any overlay-driven render (layer changes, diagnostics, or block isolation).

### UX Validation Checklist
1. Load a DXF scene, click a LINE entity to select it, verify the cyan highlight, then use Shift-click to add a second entity and Ctrl/⌘-click to toggle it off.
2. Drag a marquee left-to-right around several objects and confirm only fully enclosed geometry is selected (window mode); repeat dragging right-to-left to ensure intersecting geometry is also captured (crossing mode).
3. Hold Alt and sketch a lasso around curved elements or a block cluster; release to confirm the irregular selection snaps to the highlighted handles.
4. Close the rendering overlay, reopen it, and verify the previous selection is restored and remains in sync when layer visibility or block filters are toggled.
5. Resize the overlay viewport or trigger attribute visibility changes and confirm marquee/lasso overlays clear correctly while the active selection highlight persists.

### Parity / Regression Safeguards
- **Hit-test regression sweep:** Exercise `tests/rendering-parity.js --capture <baseline>` on representative drawings before/after selection runs to confirm entity counts and block metadata remain stable despite the added pickable annotations.
- **Manual DPI sweep:** Validate dragging and highlight rendering on high-DPI and standard displays to ensure pointer-to-screen coordinate transforms remain accurate after device pixel ratio adjustments.
- **Pointer capture audit:** Inspect browser devtools for pointer-capture warnings during prolonged marquee and lasso drags to ensure captures attach to the viewport and release on cancel paths.

### Follow-ups
- Feed the selection handle set into upcoming measurement and contextual toolbars (Tasks 8.2/8.3) so downstream tools inherit the hit-test infrastructure without additional wiring.
- Expand lasso processing with polyline distance checks for extremely thin geometry and consider snapping support once Task 8.4 lands.
- Integrate selection telemetry and keyboard affordances (e.g., Esc to clear, Ctrl+A to select all) once undoable navigation (Task 8.5) is available.

## Task 8.2 – Measurement Tools (Distance, Area, Angle)

### Implementation Summary
- Introduced a `MeasurementController` layered atop the existing interaction bus to orchestrate distance, area, and angle modes while reusing selection hit-test results for point acquisition and entity inference.
- Added live measurement overlays rendered via the HUD canvas with pixel-snapped leader lines, annotation glyphs, and configurable unit precision that respects drawing units, UCS, and per-viewport scale factors.
- Distance mode now supports chained segment picks with running totals, orthogonal deltas, and projected distances for 3D entities by leveraging the geometry evaluator introduced in Task 3.x.
- Area mode accepts both manual polygon picks and automatic boundary detection for closed polylines, splines, hatches, and regions, including hole subtraction by sampling island loops delivered from the scene graph.
- Angle mode recognises three-point and entity-based picks (arc, line, or spline tangents), displaying interior and exterior angles with toggle affordances and persisting the last measurement for clipboard export.

### UX Validation Checklist
1. Toggle each measurement mode via the overlay toolbar or `M` hotkey cycle, confirming the HUD updates and inactive modes clear their overlays.
2. Perform a simple two-point distance measurement, verify linear/orthogonal deltas, then add a third point to ensure cumulative length updates correctly and 3D projections switch when the UCS is altered.
3. Capture an area measurement around a hatch with interior islands and confirm the subtraction of voids; repeat with a manually sketched polygon to validate editable vertices and undo of the last segment.
4. Measure an angle using both line entities and a three-point pick, checking that the tool snaps to tangents on arcs and that the overlay reports the correct quadrant (clockwise vs counter-clockwise).
5. Switch layouts/viewports mid-measurement to confirm overlays realign, the controller cancels invalid picks gracefully, and unit precision reflects the active viewport's scale.

### Parity / Regression Safeguards
- **Geometry evaluator regression:** Run `tests/geometry-evaluator.spec.ts` and `tests/measurement-modes.spec.ts` to confirm length/area/angle calculations remain within tolerance for canonical DXF samples.
- **Viewport integration smoke:** Execute `tests/rendering-parity.js --measure` across model/paper space fixtures to assert HUD overlays register in screenshots and do not disturb draw-order.
- **Precision audit:** Compare output against Autodesk TrueView for metric and imperial drawings, ensuring rounding rules and UCS-aware projections match within configured tolerances.

### Follow-ups
- Connect measurement overlays to snapping aides (Task 8.4) so future picks benefit from endpoint/midpoint inference without duplicating logic.
- Persist a measurement history panel with export to CSV/clipboard and consider multi-measure sharing once undoable navigation (Task 8.5) stabilises.
- Add telemetry events for measurement mode usage and error paths to prioritise UX refinements ahead of Milestone 9 benchmarking.

## Task 8.3 – Layer/Object Isolation & Contextual Toolbars

### Implementation Summary
- Injected a viewport selection toolbar that surfaces isolation, locking, and restore actions contextual to the active selection or persisted isolate states, with dynamic enablement to avoid invalid paths.
- Introduced per-tab layer isolation management that snapshots prior overrides, applies temporary visibility/lock overrides, and restores the original state on demand while updating layer diagnostics.
- Added object-level isolation by feeding selected handles into the rendering pipeline; the surface renderer now filters entities when an isolation set is active, preserving nested block traversal.
- Extended overlay summaries to track isolation status and wired selection changes, manual overrides, and toolbar actions so UI affordances stay in sync without redundant re-renders.
- Hardened override mutations so manual layer tweaks automatically clear stale isolation state, and locking/unlocking flows reuse existing override plumbing without disrupting active isolates.

### UX Validation Checklist
1. Select geometry across multiple layers and trigger **Isolate Layers**; verify only those layers remain visible and the isolation badge lists the expected names.
2. Press **Clear Layer Isolation** and confirm prior layer visibility, freeze, and lock states restore exactly, including any pre-existing overrides.
3. Lock a selection’s layers, observe the lock indicator in the layer manager, then unlock through the toolbar and ensure the previous lock state returns.
4. Isolate objects for a mixed selection, confirm only the chosen handles render (including entities nested inside blocks), then clear object isolation to bring the scene back.
5. Switch tabs (or close/reopen the overlay) with an isolate active and verify both layer and object isolation states persist per tab and continue to render correctly.

### Parity / Regression Safeguards
- **Layer override regression sweep:** Toggle isolate/clear across representative drawings and diff the resulting `layerOverrides` snapshot to guarantee restoration paths remain lossless.
- **Render filter sanity:** Run `tests/rendering-parity.js --capture` on baseline drawings after isolating objects to confirm entity counts align with the isolated set and no stray geometry leaks through.
- **UI affordance audit:** Exercise keyboard modifiers for selection (Shift/Ctrl/⌘) and ensure toolbar enablement tracks the resulting selection context without exposing dead buttons.

### Follow-ups
- Teach the renderer to treat additional container entities (e.g., MLEADER-owned blocks) as isolation pass-throughs once their nested handle graphs are catalogued.
- Add quick “Isolate Layer of Selection” context menu hooks outside the toolbar to streamline workflows from the layer manager and diagnostics panes.
- Instrument isolation usage and cancellation paths for telemetry once analytics plumbing lands, enabling prioritisation of parity gaps ahead of performance benchmarking.

## Task 8.4 – Snapping Aides and Marker Feedback

### Implementation Summary
- Added a snap candidate collector that iterates rendered pickables each frame, normalises world vertices, and derives endpoints, midpoints, centres, and node snaps with cached screen-space projections for fast lookup.
- Hooked measurement pointer flows so move/down events resolve against the snap cache, committing the snapped world position while tagging measurement points with snap metadata for downstream consumers.
- Introduced a snap overlay layer with crosshair markers and type-specific styling, ensuring feedback remains visible through re-renders and clears automatically when measurement mode exits or the overlay closes.
- Coloured measurement nodes based on snap type to provide persistent visual confirmation of the snapped context, complementing the transient HUD markers.

### UX Validation Checklist
1. Activate distance mode, hover near a line endpoint, and confirm the ENDPOINT marker appears while the committed node adopts endpoint styling.
2. Sweep along a polyline segment and verify MIDPOINT markers track the cursor, snapping the preview measurement node without jitter.
3. Hover an ARC or CIRCLE entity to observe concurrent midpoint and centre snaps, ensuring the centre marker aligns with the true geometric centre rather than polygon approximations.
4. Toggle between measurement modes or back to selection and confirm snap markers clear immediately with no lingering HUD artifacts.

### Parity / Regression Safeguards
- **Pickable regression sweep:** Run `node tests/rendering-parity.js --capture tests/baselines/simple.json` to confirm pickable counts/bounds remain unchanged after candidate extraction.
- **HiDPI audit:** Validate snapping thresholds and marker placement on high-DPI displays to ensure pixel ratio adjustments keep feedback aligned.
- **Large-scene smoke:** Load complex drawings to monitor cursor responsiveness and ensure cached candidates do not introduce stutter while hovering dense geometry.

### Follow-ups
- Expand the resolver with intersection/perpendicular snaps and expose toggles for advanced object-snap filters akin to TrueView.
- Surface snap metadata in measurement readouts and future contextual toolbars to enable one-click actions (e.g., lock to centre, repeat last snap type).
- Consider sharing the candidate cache over the interaction bus so selection and editing tools can reuse snap intelligence without redundant computation.

## Task 8.5 – Undoable View Navigation, View Cube, and Steering Wheel

### Implementation Summary
- Added persistent view-state support to `RenderingSurfaceManager`, allowing callers to provide explicit centre/scale/rotation overrides while emitting the active and autofit view states with each frame for downstream consumers.
- Normalised frame generation so default renders continue to auto-fit extents but now preserve the effective view metadata, enabling history snapshots without re-traversing scene graphs.
- Introduced per-tab view navigation contexts inside the overlay controller, tracking the current view plus bounded undo/redo stacks that survive overlay reopen and pane switching.
- Implemented zoom/pan/orbit operations with anchor-aware zooming, pointer-wheel gestures, and history-aware undo/redo pathways that recompute frames without disturbing selection or measurement overlays.
- Added an accessible floating view cube and navigation wheel set, covering canonical orientations, directional pans, zoom controls, and orbit nudges, all wired into the shared navigation controller.

### UX Validation Checklist
1. Use the view cube to swap between Top, Left, Right, and Iso views, confirm geometry re-renders instantly, and undo/redo returns to prior orientations.
2. Hover the viewport, scroll the mouse wheel to zoom in and out around different anchors, and verify the focal point remains under the cursor while history entries record each zoom.
3. Activate the navigation wheel buttons to pan along each axis and orbit ±15°; observe the Home button restoring the autofit view and the wheel Home control mirroring the action.
4. Switch between left and right panes of the same drawing and reopen the overlay; confirm the last custom view (and its history) persists per tab/pane without leaking across contexts.
5. Run selection, snapping, and measurement tools after several navigation changes to ensure overlays stay registered with the new frame transforms.

### Parity / Regression Safeguards
- `node tests/rendering-parity.js` (compare stats + SVG snapshot) – confirms renderables, counts, and frame metadata remain stable; note current SVG comparisons still flag known TrueView reference differences for select datasets.
- Manual smoke with very large DXFs to observe history footprint and ensure view recreation does not reparse source data.
- Keyboard and pointer audit (Esc, measurement hotkeys, selection modifiers) to ensure focus and event handling unaffected by additional wheel listeners and floating controls.

### Follow-ups
- Extend history storage with timestamped entries and expose a dropdown UI for direct jumps instead of sequential undo/redo only.
- Balance auto-fit behaviour against saved custom views when loading files with stored VPORT targets and explore parity with perspective/3D orbit options.
- Consider keyboard shortcuts (e.g., Shift+Mousewheel for orbit) and optional inertia-based pan/zoom to align more closely with TrueView navigation affordances.
