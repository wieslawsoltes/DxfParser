# DXF 2018 Dimension Rendering Parity Plan

## Current Implementation Snapshot

- `components/rendering-entities.js:1418` captures the DXF DIMENSION definition/text points, arrow tips, arc samples, and style handles so downstream renderers receive the raw geometry plus the anonymous block name and measurement value.
- `components/rendering-renderer.js:3411` pulls a small subset of DIMSTYLE floats (scale, arrow size, text height, text gap, extension offsets) but does not yet apply most of them beyond sizing labels and arrowheads.
- `components/rendering-renderer.js:6991` sketches each base dimension family (linear/aligned, angular, radial, diameter, ordinate) by drawing straight segments between the sampled points and re-using the same open-V arrowhead helper for all cases.
- `components/rendering-renderer.js:4784` recomputes measurement values from the sampled geometry and substitutes `<>` placeholders before emitting a single TEXT draw call per dimension at `components/rendering-renderer.js:7183`.
- `components/rendering-renderer.js:4862` formats measurements with decimal output (plus simple degree/diameter/radius prefixes) and `components/rendering-renderer.js:4867` picks precision heuristically from the raw text height instead of DIMSTYLE settings.
- `components/rendering-renderer.js:4388` renders arrowheads as two unfilled segments, ignoring DIMSTYLE arrow/tick selections or custom blocks, while measurement labels stay rotated with the geometry plus any stored oblique angle (`components/rendering-renderer.js:7189`).

## Gap Analysis

### Geometry & Styling

- The renderer masks `dimensionType` with `& 7` (`components/rendering-renderer.js:6991`), ignoring higher-order DXF flags that encode baseline/continue states, ordinate axis (X/Y), user-supplied blocks, and associative behaviors. Those bits need to flow through ingestion and inform rendering decisions.
- Dimensional offsets from the style table (`textGap`, `extensionOffset`, `extensionExtension`) are retrieved (`components/rendering-renderer.js:3450`) but never applied, so extension lines always start at the witness point and text sits directly on the dimension line regardless of DIMSTYLE configuration.
- Angular dimensions join arrow points through a straight polyline with the optional center sample (`components/rendering-renderer.js:7040`), which produces chords instead of true arcs and misses DIMARC arc-length cases.
- Oblique linear dimensions only rotate text (`components/rendering-renderer.js:7189`) while the dimension/extension lines remain unskewed, so skewed dimensions render incorrectly.
- Ordinate measurements rely on `Math.max(|dx|, |dy|)` (`components/rendering-renderer.js:4827`), losing the axis intent (X or Y) and failing to mirror DIMSTYLE `DIMORD1` / `DIMORD2` flags or UCS alignment.
- Center marks/lines driven by `DIMCEN` and dimension line suppress flags (`DIMSD1`, `DIMSD2`) are absent, as is wildcard handling for suppressed extension lines specified by the style table.
- Arrowheads are hard-coded open V segments (`components/rendering-renderer.js:4388`) and do not respect `DIMBLK`, `DIMBLK1`, `DIMBLK2`, `DIMLDRBLK`, or tick/architectural arrow variants from the style.

### Measurement & Text Formatting

- `_calculateDimensionMeasurement` ignores `DIMSCALE`, `DIMLFAC`, and unit conversion to paper/model space so re-scaled dimensions report the raw model distance instead of styled values (`components/rendering-renderer.js:4784`).
- `_formatDimensionMeasurement` bypasses DIMSTYLE-driven unit modes (`DIMLUNIT`, `DIMAZIN`, `DIMAUNIT`, `DIMDEC`, `DIMADEC`) and omits support for architectural/engineering fractions, zero suppression, or angular precision (`components/rendering-renderer.js:4862`).
- Alternate and tolerance values (`DIMALT*`, `DIMALTD`, `DIMTOL`, `DIMTU`, `DIMTL`, `DIMUPT`) along with prefix/suffix strings (`DIMPOST`, `DIMAPOST`) never reach the label builder, so only a single decimal value is displayed.
- Text fit preferences (`DIMFIT`, `DIMJUST`, `DIMTIX`, `DIMTIH`, `DIMTOH`) are not consulted; the label remains at the provided `textPoint`, even when it should be forced outside, centered, or rotated horizontally per style.

### Style & Metadata Integration

- Per-style overrides for lineweight, color, and linetype (`DIMCLRD`, `DIMCLRE`, `DIMCLRT`, `DIMLWD`, `DIMLWE`) are ignored, leaving all dimension segments to inherit the entity defaults (`components/rendering-renderer.js:6994`).
- Anonymous dimension blocks (`blockName` from `components/rendering-entities.js:1447`) are never instantiated; this prevents rendering of custom arrowheads, inspection features, or TrueType glyphs embedded in those blocks.
- DIMSTYLE text style handles (`DIMTXSTY`) are not resolved when the entity omits an explicit `7` code, so style-defined shx/ttf fonts are skipped.
- Associative dimension metadata (handles to geometry, xref transforms, reactors) is parsed but not stored, preventing parity for features like dragging associative dimensions or resolving UCS adjustments.

### Testing & Diagnostics

- No automated fixtures or parity harnesses target dimension geometry; the `tests` directory lacks scenarios exercising style variations, alternate units, or tolerance formatting.
- Diagnostics only surface missing style handles in `components/dxf-diagnostics-engine.js:896` and do not flag suppressed extension overrides, unresolved dimension blocks, or unsupported unit modes, making regressions hard to spot.

## Roadmap to Parity

- [x] **Phase 1 – Data Fidelity & Style Decoding**
  - [x] Extend `RenderableEntityFactory` to preserve the full `dimensionType` bit field, DIMASSOC flags, and ordinate axis bits, exposing them via structured fields.
  - [x] Decode DIMSTYLE tables into a richer schema (arrow/tick identifiers, extension suppression booleans, center mark info, text movement/fit, color/lineweight overrides, scale factors, tolerance/alternate unit settings) and cache resolved handles for arrowhead blocks and text styles.
  - [x] Thread model/paper unit metadata plus `DIMLFAC`/`DIMSCALE` through the scene graph so measurement formatting routines can apply correct scale factors.

- [x] **Phase 2 – Geometry, Arrowheads, and Styling**
  - [x] Apply `extensionOffset`, `extensionExtension`, and suppression flags when constructing extension/dimension lines; honor `DIMSD1`, `DIMSD2`, and per-side linetype/lineweight overrides.
  - [x] Implement style-driven arrowhead selection: resolve built-in shapes (closed filled, architectural tick, oblique) and instantiate custom arrow/tick blocks referenced by `DIMBLK*`/`DIMLDRBLK`, including anonymous block transforms.
  - [x] Generate true arcs for angular and arc-length dimensions by sampling from center/radius data, adding support for `DIMARC` (dimension type 7/8) and center marks per `DIMCEN`.
  - [x] Honor oblique angles by skewing/rotating extension and dimension lines in addition to text, respecting UCS transforms and linear dimension axis vectors.
  - [x] Support baseline/continued dimensions by offsetting dimension lines per `DIMDLI`, chaining through their referenced dimensions, and avoiding duplicate extension segments.

- [x] **Phase 3 – Measurement & Text Formatting**
  - [x] Revise `_calculateDimensionMeasurement` and `_formatDimensionMeasurement` to respect `DIMSCALE`, `DIMLFAC`, unit modes (`DIMLUNIT`, `DIMFRAC`, `DIMAUNIT`), zero suppression (`DIMZIN`, `DIMAZIN`), and angular precision settings.
  - [x] Implement alternate unit output (`DIMALT`, `DIMALTF`, `DIMALTD`), tolerance formatting (`DIMTOL`, `DIMTM`, `DIMTP`, `DIMTU`, `DIMTL`), and suffix/prefix strings (`DIMPOST`, `DIMAPOST`) with layout that mirrors AutoCAD (stacked tolerances, brackets, line breaks).
  - [x] Apply text fit and justification flags, automatically relocating text outside or above the dimension line when `DIMFIT`, `DIMTIX`, or `DIMTIH` require it, while respecting user-overridden `textPoint` values.
  - [x] Resolve DIMSTYLE text styles (`DIMTXSTY`) and width factors, falling back to entity styles only when the style table omits them.

- [x] **Phase 4 – Edge Cases, Associativity, and Diagnostics**
  - [x] Handle ordinate axis orientation (X/Y) and user-selected leader direction (`DIMORD1`, `DIMORD2`), ensuring measurement text displays the correct coordinate component and arrow orientation.
  - [x] Respect associative metadata (reactor handles, referenced geometry) where available so regenerated dimensions track source geometry orientation and UCS changes.
  - [x] Provide diagnostics for unsupported style features (e.g., arrow block missing, tolerance not yet implemented) and expose them in the overlay to aid parity validation.

- [x] **Phase 5 – Validation & Regression Coverage**
  - [x] Assemble DXF fixtures covering each dimension style permutation (arrowhead types, tolerances, alt units, oblique, ordinate, baseline, arc-length) with TrueView reference captures.
  - [x] Extend the rendering parity harness to diff dimension geometry/text placements numerically (distance deltas, angular error) and visually (PNG diffs) against reference exports.
  - [x] Add unit tests for measurement formatting, zero suppression, tolerance stacking, and arrowhead selection to protect against regressions as formats evolve.

    - Regression scripts now include `tests/check-dimensions.js` for measurement/tolerance verification and `tests/baselines/dimensions.json` to exercise dimension-heavy parity snapshots.
    - Parity harness enriches `dimensions.*` metrics (counts, arrowheads, label samples) enabling lightweight numerical diffs alongside updated `tests/trueview/advanced.svg`.

## Success Criteria

- All dimension style knobs that affect geometry, styling, or measurement output in AutoCAD/TrueView produce matching results in the overlay (visual diff within tolerance, numerical measurement parity).
- Custom arrowheads and user-defined dimension blocks render identically, including fills and transforms, without manual overrides.
- Measurement strings respect unit, tolerance, and alternate unit settings, matching TrueView text exactly (content, formatting, prefix/suffix, stacking).
- Regression suites (unit + parity harness) cover every dimension family and style feature, failing fast when new DXF samples regress.
- Diagnostics highlight unsupported or missing features, keeping QA aware of intentional gaps until full parity is achieved.
