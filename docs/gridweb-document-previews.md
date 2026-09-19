# GridWeb reports and RichTextWeb document previews

The parser and standalone editor load local, pinned browser controls. No npm install,
CDN, remote document conversion service, or upload is required to use the application.
The DXF tree renderer is still `TreeDataGrid`, not GridWeb. The later
[RibbonWeb/document migration](ribbon-document-workspace.md) gives each parser file its
own retained dock document and tree instance, and moves top-level preview commands into
the contextual Document Preview ribbon tab.

## Report displays after the analysis usability revision

See [Analysis workbench](analysis-workbench.md) for the current report inventory and
interaction contract. Analysis reports now default to real **TreeDataGridWeb** record
views with inline actions/settings, hierarchical relationships, facets, and a resizable
detail inspector. Every record view has an explicit **Spreadsheet** mode backed by a
lazily constructed GridWeb workbook. The main DXF TreeDataGrid remains unchanged.

Statistics, frequencies, dependencies, ownership, fonts, classes, line types, text,
binary/proxy objects, object sizes and diagnostics use purpose-specific typed models.
Blocks use complete renderer metadata for related collections; existing renderer,
layer and rule callbacks remain connected through narrow adapters. Batch results,
ZIP entries and paged hex inspection use the same interactive record surface.

Excel documents still use **GridWeb directly**, including worksheet tabs, formatting,
zoom and selection/copy. Word documents and their embedded tables still belong to
**RichTextWeb**. These document-format engines have not been replaced by the record
control. Menus, histories, input forms and editor placeholders are not report tables.

## Using reports

Select a record for full values, actions and raw source. Expand ownership/font trees,
click sortable column headers, resize/reorder/hide columns, search all or one column,
and combine the report's categorical filters. Inline checkboxes and menus operate on
their canonical source record, even after sorting. Related collections can open in a
full report viewport with a Back command instead of a tiny nested spreadsheet.

**Records** copies selected records as TSV. **Spreadsheet** copies GridWeb's selected
cells. **CSV** exports the currently displayed, filtered/sorted tree projection;
expand branches to include their children. Formula-like string fields are escaped
in CSV and kept literal in GridWeb. Full details are outside the grid and stay readable
when columns are narrow. Source-aware navigation preserves docked panels.

## Document Preview

Both workspaces have a **Documents…** toolbar button and a recoverable **Document
Preview** panel. Use **Open document…**, worksheet tabs, the zoom selector and
**Download original**. The viewer can float, dock, tab and hide without replacing the
loaded workbook/document. Layout persistence stores panel geometry, not Office file
bytes. Reopen files after a browser reload.

The Hex Viewer detects raw embedded Open XML and supported compound Office files by
content, not just the filename. ZIP entries route to the same viewer. Generic text and
supported raster images retain local previews; unsupported binaries retain download
and hex inspection rather than being misrepresented as a document.

### Supported format boundaries

* **XLSX / XLSM / XLTX:** GridWeb's native XLSX importer; sheets, supported styles,
  formulas, merges and other implemented features. Import warnings are displayed.
  This is not arbitrary lossless Excel compatibility; macros and external data
  connections are not executed. Content detection also recognizes XLSB packages.
* **XLS / XLSB:** the existing `xlsx-js-style` decoder supplies cached values,
  number formats, column widths and merges to a real GridWeb workbook. Original
  formula expressions are retained as comments; binary-file formula evaluation,
  VBA and unsupported formatting are not invented.
* **CSV / TSV:** GridWeb import with `allowFormulas: false`; strings beginning with
  `=` remain literal. There is no HTML-sheet preview fallback.
* **DOCX / DOCM / DOTX and RTF:** RichTextWeb import and read-only paginated display.
  Supported text, formatting, tables and embedded media follow RichTextWeb's import
  contracts. Pagination is not Word-identical. Linked media is removed before display.
* **DOC:** RTF/HTML-disguised Word files use their corresponding importer. Word
  97–2003 compound files use a bounded FIB/CLX Unicode/compressed piece-table adapter
  for **main-story text only**, hosted in RichTextWeb. The viewer explicitly warns
  that binary formatting, images, headers/footers and other stories require DOCX.
  Older, malformed, encrypted and obfuscated binaries produce a visible error.

Files up to 32 MiB are accepted. ZIP parsing enforces at most 3,000 entries, 16 MiB
per expanded entry and 64 MiB total expansion, with CRC, path and structural checks.
Excel import is limited to 250,000 stored cells. The original bytes are kept separately
for download. An import error leaves the last successfully loaded document intact;
generation counters prevent a slower, older load from replacing a newer selection.
No claim is made that these caps make all possible malicious Office files inexpensive
to parse. This is not a sandbox for executing Office code; no macros are executed.

## Integration and ownership

`components/data-grid.js` provides `DxfGrid.GridView` and `ReportRegistry`.
`components/tabular-reports.js` owns the explicit report inventory, object-size and
paged-hex adapters. `components/office-preview.js` owns document and archive lifetime.
`components/batch-data-grid.js` keeps the existing application-facing batch API.

A report view accepts `columns` and rows of `{ key, values, actions?, source? }`.
Values are assigned using the workbook's literal `.Values` API, not formula `.Input`.
Actions receive the selected row, not a viewport index. Direct-data views are used
for batch results, object sizes, hex data, archives and selection properties.

Other existing controllers still generate their report DOM. An explicit projection
bridge retains those nodes **hidden and connected** to preserve existing delegated
handlers, IDs, filtering and serialization. GridWeb is the only visible report
renderer. The bridge does not observe or replace either main DXF tree. This is not a
claim that the legacy controllers were rewritten as a headless data service: their
hidden source DOM still consumes memory. Mutation notifications are coalesced; stale
projections, workbooks, row-action listeners and nested views are disposed.

`GridView.dispose()`, `ReportRegistry.dispose()` and `OfficePreview.dispose()` are
idempotent. Dockyard reparenting retains the control instances; destructive workspace
teardown releases their subscriptions, workbooks and object URLs. Renderer bundle
consumers without `DxfGrid` retain the renderer's original standalone property view;
the DxfParser app loads GridWeb and always uses its GridWeb path.

## Dependency provenance

| Dependency | Pin |
|---|---|
| GridWeb 0.5.0 | `79fe32584e646a614a6549c8a14ea12e976b2e02` |
| RichTextWeb 0.5.0 | `7f6242b6355b7448bf975a96f12aa18a161ea9a7` |
| JSZip | 3.10.2 from RichTextWeb's pinned package lock |
| xlsx-js-style | 1.2.0, existing export/legacy-decoder dependency |

Licenses, linked dependency notices, upstream identities and SHA-256 manifests are
under `vendor/gridweb`, `vendor/richtextweb` and `vendor/office-compat`. No fonts are
bundled. The upstream GridWeb and RichTextWeb source is unmodified. Browser globals
are built from their public entries using RichTextWeb's locked esbuild toolchain.

To rebuild, check out the exact upstream commits, install RichTextWeb's locked
build dependencies, then run:

```sh
node scripts/build-office-controls.mjs /path/to/GridWeb /path/to/RichTextWeb
node scripts/build-rendering-bundle.js
```

The Office compatibility assets are the upstream `jszip/dist/jszip.min.js` and
`xlsx-js-style/dist/xlsx.min.js` distributions. The latter remains a **decoder/exporter**,
not a replacement display control. Build output can contain upstream license comments
with path spelling dependent on the checkout location; review regenerated vendor diffs.

## Verification

```sh
python -m pip install -r tests/requirements-browser.txt
python -m playwright install chromium
python tests/docking-workspace.py
python tests/gridweb-previews.py
python tests/check-docking-regressions.py --baseline /path/to/base-worktree
```

The first suite retains 18 docking groups. The second adds 20 groups for actual
controls, report actions, filters/sorts, rules/layers, nested metadata, batch records,
paged hex, real XLSX/XLS/XLSB/CSV/TSV/DOCX/RTF/DOC inputs, embedded objects, archives,
lifecycle, stale loads and failure/security boundaries. Fixtures are generated with
real format APIs; a small independently constructed binary DOC tests the CLX adapter.
Screenshots and environment metadata are CI artifacts. Both CI suites use ordinary
HTTP loading and actual browser storage. `--injected` is a separately labeled local
harness for environments that prohibit loopback navigation, not an HTTP certification.

The pre-existing regression gate continues to require identical captured frames for
the two baseline SVG snapshot mismatches (`advanced-geometry`, `dimension-parity`).
No baselines are regenerated to hide changes.
