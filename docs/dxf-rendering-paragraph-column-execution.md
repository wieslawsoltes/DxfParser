# Paragraph & Column Layout Execution Notes

## Task 2.1 – Honour DXF Paragraph & Column Codes

### Implementation Summary
- Normalised MTEXT entity ingestion so `RenderableEntityFactory` threads attachment point (71), drawing direction (72), line spacing mode/value (73/44), background scale/offsets (45–49), and the full column metadata block (75–79, 160–179) into geometry descriptors (`components/rendering-entities.js:1191`). Column metadata now carries raw code echoes so downstream tools can surface unsupported permutations.
- Expanded `_decodeMText` to persist paragraph-level metadata—indent triplets, tab stops, list state, per-paragraph alignment, manual column breaks, and fraction runs—while tagging runs with paragraph indices (`components/rendering-text-layout.js:785`, `components/rendering-text-layout.js:1356`, `components/rendering-text-layout.js:1713`). Escape handlers now interpret `\li`, `\ln`, `\lt`, `\tc`, `\ta`, `\ts`, `\pi`, `\pn`, `\pl`, `\pt`, caret `^J`, `\S` stacked fractions, and `\X` column splits with stateful stacks so nested formatting resets correctly.
- Reworked `TextLayoutEngine` paragraph assembly to apply the captured metadata when measuring lines: hanging indent segments, list marker glyphs, tab stop spacing, per-paragraph alignment overrides, auto/manual column splitting, fraction segments, and background mask scaling derived from DXF offsets (`components/rendering-text-layout.js:370`, `components/rendering-text-layout.js:580`, `components/rendering-text-layout.js:2254`). Column breakdowns now record line spans and flow hints for renderer consumption.
- Canvas and overlay surfaces read `paragraphLayouts`/`columnLayouts` to render bullets, indents, tab spacing, stacked fractions, and multi-column text while respecting vertical-writing transforms and background offsets/scale (`components/rendering-surface-canvas.js:352`, `components/rendering-overlay.js:6551`).

### Validation Checklist
1. `node tests/check-mtext.js` &rarr; exercises column width metadata, hanging indents, tab stops, and manual `\X` breaks.
2. Visual QA with fixtures containing mixed column configurations (Auto height, newspaper flow) to confirm column counts, gutters, and manual breaks map to expected columns.
3. Toggle vertical MTEXT samples to ensure attachment/drawing direction (codes 71/72) reorient paragraphs without dropping indents or tabs.
4. Inspect diagnostics panel list to verify background offsets (46–49) and column raw codes surface for troubleshooting.

### Regression & Tooling Coverage
- Added targeted assertions to `tests/check-mtext.js` covering indent propagation, list metadata, tab stop spacing, vertical writing, auto/manual column layouts, stacked fractions, background mask offsets/scale, and multi-column raw metadata echoes.
- Canvas regression harness picks up adjusted text segments; column-aware snapshots now diff list markers and indent segments independently of main text payloads.

### Follow-ups
- Expand DXF fixture set with large column counts and irregular gutter widths to capture more TrueView parity screenshots.
- Integrate DOM renderer snapshot tests once browser automation infrastructure is in place.

## Task 2.2 – Bullet & Numbered List Layout

### Implementation Summary
- List state machines translate MTEXT escapes into structured metadata (kind, level, start, format, bullet glyph, indent triplets) that survive paragraph commits (`components/rendering-text-layout.js:1540`). Hanging indent values now drive explicit indent segments so markers occupy their own paint slot.
- Layout engine injects list marker segments ahead of text spans, sizing them off the current font metrics and honouring restart indices per paragraph (`components/rendering-text-layout.js:433`). Subsequent lines reuse the rest-indent to preserve hanging behaviour.
- Renderer surfaces display marker segments independently from content text, enabling consistent styling between Canvas and DOM pathways (`components/rendering-surface-canvas.js:373`, `components/rendering-overlay.js:6450`).

### Validation Checklist
1. Run `node tests/check-mtext.js` to confirm bullet glyphs, numbered list counters, and hanging indents remain stable.
2. Manual smoke test DXF fixtures with nested list levels to ensure level-based indentation and numbering restarts match AutoCAD outputs.
3. Confirm diagnostics flag unsupported list styles or missing indent metadata when parsing malformed MTEXT.

### Regression & Tooling Coverage
- Added bullet/list assertions within `tests/check-mtext.js` validating marker glyph selection, indent spacing, level propagation, and list start overrides.
- Existing canvas parity captures now diff list markers separately, preventing regression masking when text content remains unchanged.

### Follow-ups
- Add DOM renderer spans for custom list styles (e.g., Roman numerals) when DIMSTYLE-driven overrides arrive.
- Capture snapshots for nested lists with column breaks once fixture export pipeline is available.
