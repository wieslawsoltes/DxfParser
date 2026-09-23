# Analysis workbench

The current [linked visual workbench](analysis-visual-workbench.md) extends these
record views with diagrams and previews; the original inspection controls remain.

This revision repairs report usability after the original blanket GridWeb migration.
The main DXF tree control, document ownership/comparison roles, Dockyard layout,
RibbonWeb commands, GridWeb Excel engine and RichTextWeb Word engine remain intact.
The change is the analysis presentation and its data-specific models, not a new CAD
parser, renderer, diagnostic-rule engine or Office-format implementation.

## Library composition

`TreeDataGridWeb` is pinned to commit
`4fe97dc907cedb148639a456a3987125369f8f1c`. The unmodified global distribution is
vendored with its MIT license, upstream notice, identity and SHA-256 manifest. No
runtime CDN, npm installation, font downloads or new service is required.

TreeDataGridWeb owns the actual virtualized records, hierarchy, native DOM cells,
selection, sort, resize, reorder and scrolling. `DxfAnalysis.AnalysisView` composes
that control with an inspector and an optional genuine GridWeb spreadsheet. The
spreadsheet workbook is created only on request; ordinary record filtering does
not repeatedly rebuild workbooks. Dockyard retains the controls while docking or
floating them. RibbonWeb remains the command/launch surface. No additional reactive,
spatial or graphics dependencies are loaded simply to populate a dependency list.

## View-by-view changes

| Analysis surface | Presentation and preserved operations |
| --- | --- |
| Statistics | One type-distribution view, numeric counts/bars, shares, drawing metrics and a complete occurrence drill-down. Counts use the full source, not the main tree's filtered subset. |
| Frequencies / Cloud Data | Object-type and group-code records with a Kind facet, separate percentage denominators and every occurrence, including objects without handles. |
| Dependencies | Typed definitions and external-file/font references. Paths are inert values; availability is explicitly not probed. Complete raw DXF and incoming references are accessible. |
| Handle Map | Real owner/owned hierarchy. Cycles are cut for display and marked, missing/ambiguous owners remain visible, and duplicate handles are not overwritten. Actions resolve canonical source nodes rather than guessing from handle labels. |
| Fonts | Font file → STYLE → text reference hierarchy, big-font information, reference counts and explicit unresolved styles. TEXT, MTEXT, ATTRIB and ATTDEF usages are included. |
| Classes | Class/C++ class/application/ID columns, Application facet, raw definition and source navigation. The existing sequential CLASS ID convention is preserved. |
| Blocks & Inserts | Filterable block metadata and retained isolate/highlight/jump commands. Related views read complete renderer instances, attribute definitions and diagnostics, not the old 12-instance / 8-diagnostic card truncations. Source thumbnails and raw metadata remain available. |
| Block Definitions | Interactive definition records with highlight and retained metadata/preview actions. |
| Line Types | Definitions, built-ins and unresolved usages distinguished; numeric reference counts, basic dash/gap pattern preview and complete related usages. |
| Texts | Readable full text plus original formatting/raw DXF. MTEXT continuation groups are concatenated; layer/type/style filtering and inert markup handling. |
| Binary Objects | Chunk and byte counts; direct paged Hex/Office inspection and source navigation. |
| Proxy Objects | Class resolution, complete raw properties, incoming references and canonical source/class navigation. |
| Object Sizes | Numeric subtree character totals, largest first, source navigation and raw details. These are not serialized-file byte sizes and parent totals must not be summed with descendants. |
| Diagnostics | Each issue appears once. Severity cards, severity/category facets, full descriptions, raw results and original actions; asynchronous results retain the drawing they evaluated. Excel export uses the bound source's filename. |
| Rule configuration | One searchable/category-filtered view instead of a spreadsheet per category. Real inline enabled checkboxes, Enable/Disable filtered, global/profile commands, apply/cancel and collapsible profile management. |
| Layers / plot styles | Original checkbox/select operations in their record cells and the inspector. Sort/filter does not change which source layer a command modifies. |
| Drawing information / selection properties | Labelled key/value and section records with searchable complete values instead of clipped anonymous spreadsheets. |
| Batch results | Virtualized result records, readable long values, original file-at-line commands and unchanged full result data for exports. Appends coalesce per frame. |
| ZIP / hex | Same interactive report navigation; archive Preview/Download routes remain intact. Hex paging remains bounded to 2,048 rows / 32 KiB. |

## Common interactions

The **Records / Spreadsheet** switch changes presentation without losing the selected
record. The grid keeps numeric/natural sorting and stable record keys. Search all
columns or a specific column, combine categorical facets, and use Reset filters to
recover the entire result set. Hierarchy search retains matching descendants and
their ancestors; matching parents retain their children. Expand/Collapse all operates
on the actual hierarchical source and updates export/spreadsheet projections after
the library's batched row rebuild.

Resize or reorder headers; use Columns for visibility. The first identifying column
cannot be hidden. It is frozen only where there is enough viewport width, so a narrow
dock can still scroll to action columns. Ctrl/Cmd+F focuses the report search rather
than browser search. Grid editing/navigation does not trigger Dockyard layout undo.

**Details** is a resizable inspector, not a disclosure below a 300px sheet. It includes
full values, relevant actions, metadata, thumbnails/previews, **Related** collections
and **Raw data**. Previous/Next traverses the displayed result order. The separator
supports pointer resizing and Arrow Left/Right/Home. In narrow panes the inspector
stacks below the records and can be hidden with the Details toggle.

Related collections offer **Open full view** and **Back**; Escape returns to the
parent report, retaining its search, facets, selection and scroll. Child views are
created on demand and disposed when leaving the drill-down or parent selection.
Block collections expose all metadata records available from the existing renderer;
this does not expand the renderer's original DXF compatibility.

**Copy** in Records produces selected-record TSV; in Spreadsheet it uses native
GridWeb cell selection. **CSV** exports the displayed tree projection (current search,
facets, ordering and expansion), with a UTF-8 BOM, quoted fields and formula-like
string escaping. Expand branches to include collapsed descendants. Numeric negative
values remain numbers. Copy/export commands do not modify DXF data.

## Identity, source safety and lifecycle

`AnalysisReports` captures the actual drawing and source nodes. Stable per-node keys
survive inserts before a selected node. Owner handles are multimaps, not a lossy
object keyed by handle. Identity group codes 5/105 are excluded from incoming-reference
counts. A reference with several target candidates opens explicit candidate records
rather than silently choosing the first duplicate.

Report actions activate their original source document. Navigating dismisses floating
dialogs where appropriate but leaves docked tools open. Closed-source actions report
an error instead of falling through to another drawing. This guard also runs inside
custom-element Shadow DOM cell controls, where document-level event retargeting would
otherwise miss the originating button. Rejected control changes restore the proxy's
visual state. Explicit Close commands are unchanged.

Typed reports use direct models. Legacy DOM producers remain only where existing
renderer/rule callbacks own behavior; their source nodes stay hidden and connected.
The adapter exposes owned actions only, never all of a parent's descendant actions.
Complete block relations come from the attached renderer metadata, not label parsing.
Filters, selection, expansion, widths, visibility and details survive these source
rebuilds. A 128-entry session presentation-state cache is separate from persisted
Dockyard layout geometry; report state/source associations are not a new on-disk data
format. Document bytes and layout persistence follow the existing contracts.

Disposal is idempotent: observers, subscriptions, controls, model sources, nested
views and optional workbooks are released. Async diagnostics use generation checks
on completion; this does not claim cancellation of computation already running in
the existing diagnostic engine. No-op or stale navigation must not dirty a drawing.

## Deliberate boundaries

The readable MTEXT preview covers common formatting controls, not full CAD typesetting;
raw text/DXF remains accessible and the renderer retains its existing text engine.
The linetype preview covers basic dash/gap strokes; it is not shape/font-dependent
complex-linetype rendering. External file references are neither fetched nor tested
for existence. Diagnostic findings come from the existing rules; a redesigned view
does not certify those rules or suppress their existing false positives.

The record control virtualizes realized DOM rows/cells. Report indexing, filtering,
facets and sort still work on the complete in-memory result set; they are not a
server query, constant-time operation or complete out-of-core analysis engine.

## Verification

```sh
python -m pip install -r tests/requirements-browser.txt
python -m playwright install --with-deps chromium
python tests/analysis-views.py
python tests/docking-workspace.py
python tests/ribbon-workspace.py
python tests/gridweb-previews.py
python tests/check-docking-regressions.py --baseline /path/to/base/worktree
node scripts/build-rendering-bundle.js
git diff --exit-code -- dist/dxf-rendering.global.js
(cd vendor/treedatagridweb && sha256sum -c SHA256SUMS)
```

The analysis suite has 26 browser groups and a real DXF workbench fixture. It exercises
header sorting, actual inline controls, lazy GridWeb, hierarchy/ancestor filtering,
owner cycles/duplicates/missing owners, MTEXT, raw/related navigation, large block
collections, source lifetime, async diagnostics, CSV safety, full-width drill-down,
20,000-record virtualization, resize and dark/narrow layouts. The existing 69 browser
groups protect docking, ribbon/document ownership and Office previews. HTTP loading,
local browser storage and native controls are used in normal runs; an explicitly
labelled injected harness remains available for restricted environments.

Read-only GitHub Actions publish screenshots and browser/environment evidence.
The current regression gate validates the replacement native Skia renderer, package
consumers, deterministic distributions and local vendor checksums. The historical
SVG snapshot gate from the initial analysis migration was retired with the legacy
renderer; see the native renderer and performance documentation for current pixel
comparison coverage.
