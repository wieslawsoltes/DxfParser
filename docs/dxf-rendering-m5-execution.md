# Milestone 5 Execution Notes

## Task 5.1 – Text, MText, and Tolerance Rendering Parity

### Implementation Summary
- Introduced a dedicated `TextLayoutEngine` that normalises DXF text content, interprets MTEXT formatting codes, applies word-wrapping against entity width constraints, and derives font metadata (including SHX fallbacks) from the scene graph’s style catalog.
- Extended the rendering pipeline so TEXT, MTEXT, and TOLERANCE entities carry full style/geometry metadata into `_buildFrame`, enabling rotation-aware bounding boxes and accurate alignment across nested block transforms.
- Reworked the overlay text layer to render multi-line content with font sizing, line spacing, alignment, background fills, and tolerance glyph substitutions, using CSS matrix transforms to mirror the engine output.
- Captured text style catalogues during document build, exposing font file hints and width factors for use in both rendering and diagnostics.

### Validation Checklist
1. Load a DXF featuring mixed TEXT/MTEXT (including width-factor variations and SHX fonts) and confirm overlay strings honour alignment, wrapping, and height across zoom levels.
2. Inspect a drawing with tolerance entities and verify symbol substitution (±, ⌀, etc.) and background fills render identically to TrueView reference imagery.
3. Switch between block isolation states to ensure text bounds participate in zoom extents (no clipping when isolating annotation-heavy blocks).
4. Run parity capture to snapshot text-heavy scenes:
   ```bash
   node tests/rendering-parity.js --capture tests/baselines/advanced.json
   ```
   Review `tests/outputs/advanced.snapshot.json` for text width/height deltas.
5. (Optional) Compare against TrueView raster exports when available:
   ```bash
   node tests/rendering-parity.js --png-diff tests/baselines/complex.json
   ```
   (Requires `sharp`, `pixelmatch`, and `pngjs`.)

### Follow-ups
- Add curated baselines exercising vertical MTEXT, stacked fractions, and SHX big-font usage to tighten regression coverage.
- Integrate real SHX font vector support (or custom glyph atlas) once licensing constraints are resolved.
- Emit telemetry for text layout fallback paths and width-factor approximation differences to guide future refinements.

## Task 5.2 – Full Dimension Family Rendering

### Implementation Summary
- Expanded DIMENSION parsing output to feed the renderer richer geometry (extension points, arc samples, arrow tips) and recompute live measurements, ensuring text strings substitute `<>` placeholders with up-to-date values.
- Upgraded `_addDimensionGeometry` to draw aligned/linear, angular (2-line and 3-point), radial, diameter, and ordinate dimensions including extension segments, arc sweeps, and stylised arrowheads sized from the dimension text height.
- Added measurement formatting helpers (degrees, radius, diameter prefixes) and aligned dimension text rotation to the underlying geometry, so annotations track block transforms and nested insert scaling.
- Hooked dimension text into the shared `TextLayoutEngine`, enabling consistent wrapping, SHX fallbacks, and background rendering alongside other annotation types.

### Validation Checklist
1. Load a DXF containing the full dimension family (aligned, angular, radial, diameter, ordinate) and confirm arrowheads, extension lines, and dimension text follow the source geometry.
2. Edit a source dimension so its associated measurement changes (e.g., tweak extension points) and reload—verify the renderer recomputes measurement values and updates any `<>` placeholders automatically.
3. Inspect angular dimensions with block rotations to ensure text rotates with the dimension arc instead of the global axes.
4. Run parity capture on a dimension-heavy scene:
   ```bash
   node tests/rendering-parity.js --capture tests/baselines/advanced.json
   ```
   Review `tests/outputs/advanced.snapshot.json` for text/line deltas tied to dimension updates.
5. (Optional) If TrueView comparison assets exist, run:
   ```bash
   node tests/rendering-parity.js --png-diff tests/baselines/complex.json
   ```
   to highlight arrowhead or text-placement divergences.

### Follow-ups
- Curate a dedicated dimension baseline (DXF + TrueView raster/vector) covering mixed linear/angular/radial cases for automated regression checks.
- Derive ordinate axis orientation directly from DIMSTYLE settings to distinguish X vs. Y measurement labels instead of heuristics.
- Investigate rendering of custom arrowhead blocks specified via DIMSTYLE so user-defined symbols mirror TrueView output.

## Task 5.3 – Leader, MLeader, and MultiLeaderStyle Rendering

### Implementation Summary
- Expanded the DXF ingestion pipeline to capture MULTILEADERSTYLE table data, leader arrow sizing, dogleg lengths, and block/text style handles for multileaders.
- Added `_addLeaderGeometry` to the renderer so LEADER and MLEADER entities now draw full leader polylines, include arrowheads sized from style settings, and honour dogleg offsets for landing segments.
- Hooked MLEADER text back into the shared layout engine and rendered referenced block content by resolving style/block handles, preserving highlight/isolation semantics via the existing insert recursion.
- Seeded style catalogs with handle metadata to align MULTILEADERSTYLE text styles with loaded text style definitions, ensuring SHX fallbacks carry over to multileader annotations.

### Validation Checklist
1. Load a DXF containing simple LEADER entities and confirm arrowheads, hooks, and linework render in the overlay.
2. Open a drawing with MLEADER annotations that mix text and block content; verify dogleg landings, block inserts, and text positioning mirror TrueView.
3. Toggle block isolation/highlight while leaders with block content are visible to ensure nested inserts respect the overlay filters.
4. Run parity capture for a leader-heavy dataset:
   ```bash
   node tests/rendering-parity.js --capture tests/baselines/advanced.json
   ```
   Inspect the snapshot output for leader polyline/arrow regressions.
5. (Optional) Execute the PNG diff workflow against TrueView imagery once leader baselines exist:
   ```bash
   node tests/rendering-parity.js --png-diff tests/baselines/complex.json
   ```

### Follow-ups
- Curate a multileader-focused baseline (text + block variants) paired with TrueView captures to lock down regression detection.
- Map additional MULTILEADERSTYLE properties (e.g., landing gap orientation, text justification) for richer fidelity.
- Evaluate support for custom arrowhead blocks and spline leaders when leveraging non-standard MULTILEADERSTYLE definitions.

## Task 5.4 – TABLE Entity Rendering

### Implementation Summary
- Extended the DXF ingestion layer to capture TABLE geometry: row/column sizing, span metadata, background overrides, and block/text style handles per cell, along with table style catalog references.
- Added `_addTableGeometry` to the renderer to construct cell rectangles with background fills, honor row/column spans, and feed cell content through the shared text layout engine for wrapping and alignment.
- Enabled block content rendering from table cells by resolving handles back into block definitions, wiring through existing isolation/highlight plumbing.
- Introduced helper color utilities to translate ACI/true-color overrides so fills and text adopt the same palette behavior as TrueView.

### Validation Checklist
1. Load a DXF containing title/header/data rows with merged cells; confirm spans suppress interior borders and background fills render correctly.
2. Verify text wrapping/headings respect column widths (especially auto-fit cells) and compare against TrueView for a known reference drawing.
3. Exercise block-backed table cells (e.g., symbol tables) and ensure the embedded blocks participate in overlay isolation/highlight workflows.
4. Capture parity output on a table-centric dataset:
   ```bash
   node tests/rendering-parity.js --capture tests/baselines/advanced.json
   ```
   Inspect the snapshot JSON for table row/column delta regressions.
5. When TrueView baselines are available, run:
   ```bash
   node tests/rendering-parity.js --png-diff tests/baselines/complex.json
   ```
   to identify fill/text placement variances.

### Follow-ups
- Curate a dedicated table baseline (DXF + TrueView raster/vector) covering merged cells, formulas, and block content to tighten automated regression checks.
- Map additional cell style overrides (borders, text justification, numeric formatting) from TABLESTYLE definitions for parity completeness.
- Investigate formula evaluation hooks so computed cells can be displayed alongside stored textual values in future iterations.

## Task 5.5 – Attribute Definitions & References

### Implementation Summary
- Enriched ATTDEF/ATTRIB parsing so renderable geometry carries insertion point, alignment, and full bit-flag metadata (invisible, constant, preset, verify, multi-line, locked) alongside prompts and default/reference values.
- Updated the rendering pipeline to treat attribute definitions and references as first-class text primitives with context-aware placeholders, block-stack awareness, and per-item interaction payloads that drive editing/navigation hooks.
- Added overlay controls that let users toggle definition geometry, hide/show invisible references, and click rendered attributes to jump to the owning entity; block metadata cards now surface attribute definition details and representative values for quick inspection.

### Validation Checklist
1. Load a DXF containing block attributes (visible, hidden, constant, and preset variants) and confirm references render in place while definition geometry only appears when "Show block attribute definitions" is enabled.
2. Toggle "Show hidden attributes" and verify invisible references/definitions gain placeholder markers without affecting overall zoom extents.
3. Click rendered attribute text and ensure the tree view jumps to the corresponding entity handle, enabling direct editing; confirm block metadata cards list definition flags and sample values.
4. Switch block isolation/highlight filters to confirm attribute rendering honors block visibility states and still responds to the attribute toggles above.
5. Run the parity capture to guard against regressions in annotation layers:
   ```bash
   node tests/rendering-parity.js --capture tests/baselines/advanced.json
   ```
   Inspect the resulting snapshot for attribute diff noise when toggles are off vs. on.

### Follow-ups
- Extend the click handler to open a dedicated attribute editor overlay with in-place value updates and preset/verify toggles.
- Persist attribute visibility preferences per workspace and expose them through the main app settings panel.
- Add automated baselines that exercise nested block attributes, MText-backed attributes, and mult-line ATTDEF flows to strengthen regression coverage.
