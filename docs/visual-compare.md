# Native drawing comparison

Open a DXF and choose **CAD View → Compare drawings**. The **Drawing Compare** Dockyard tool accepts another open tab, a local DXF (including supported binary DXF), or a dropped reference file. It uses the current native SkiaSharpWeb renderer, camera and exports.

The panel provides colored current-only/reference-only/unchanged objects, property/text/hatch filters, decimal precision, draw order, fading and native revision clouds. Its AnalysisView change ledger retains search, sorting, CSV/copy and details. Previous/Next and Fit changes navigate the rendered change sets. Reference objects and clouds cannot alias current-file selection or snapping handles.

Use **Refresh** after source-tree edits. Re-ingested reference documents update an active comparison through the data-controller subscription. Closing a reference tab does not invalidate the captured reference; switching or closing the current drawing ends comparison. Async file reads are generation-guarded. The standalone editor supports comparing files, but import/undo transactions are currently limited to the parser workspace.

**Import selected change** adds the complete reference object, never deletes the current version, and includes supported dependent blocks/symbols. Unsafe object graphs are rejected before committing. Import updates the source tree and rendered document together, supports guarded Undo/Redo, and refuses to overwrite intervening tree edits. A maximum of ten comparison import transactions is retained within a 128 MiB source-history budget. Oversized transactions are rejected before modifying the current drawing. Repeated imports from the same reference are guarded while their transactions remain in undo history.

**Save snapshot** creates a reloadable JSON package containing both DXF source strings, options and layout. **Open snapshot** restores it into a new parser tab (or the standalone editor's active file). JSON reports, AnalysisView CSV and native PNG/PDF exports are available. PDF export retains the composed comparison, including revision clouds and category colors.

CAD commands: `COMPARE [open drawing name]`, `COMPARENEXT`, `COMPAREPREV`, `COMPARETOGGLE`, `COMPAREINFO`, `COMPAREPROPS mask`, `COMPARETOLERANCE precision`, `COMPAREIMPORT`, `COMPAREUNDO`, `COMPAREREDO`, `COMPAREEXPORT` (JSON snapshot), and `COMPARECLOSE`.

See [engine semantics and explicit parity limits](../packages/dxf-compare/README.md). This implementation does not claim full AutoCAD parity, all DXF entity rendering, DWG snapshot export, arbitrary object-graph import, or automatic Xref file monitoring.

## Validation

- `node scripts/build-rendering-bundle.js`
- `node --test packages/dxf-compare/tests/*.test.js`
- `node --test packages/dxf-skia/tests/*.test.js`
- `python tests/visual-compare.py` (real HTTP, Chromium and native Skia WASM)
- `python tests/skia-workspace.py` (existing native workbench regression suite)

Browser tests do not inject application scripts, mock Skia, replace the geometry compiler or use a different Canvas2D preview. Software/CI GPU execution is not a physical-device performance certification.
