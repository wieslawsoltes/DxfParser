# Linked visual analysis workbench

The analysis tools now combine visual exploration with the existing, inspectable
record data. This extends the TreeDataGridWeb/optional GridWeb workbench; it does
not replace it, change the main DXF tree, introduce a new renderer, or reimplement
Office previews. Dockyard retains the views, RibbonWeb owns report commands,
TreeDataGridWeb owns the record hierarchy, and GridWeb is still instantiated only
when Spreadsheet is requested. The actual drawing remains native SkiaSharpWeb,
including WebGPU. Analytical diagrams use local, accessible SVG and native HTML;
no external chart service, font download or additional vendor payload is needed.

## Presentation and interaction

Wide, tall report surfaces automatically show **Visuals** above the records.
Compact dock panes start with records alone to preserve inspection space. Visuals
can always be enabled explicitly; **Focus visual** expands the diagram while
keeping the inspector available. Records and Spreadsheet also exit visual-focus
mode, without reconstructing the underlying controls. The horizontal separator
supports pointer resizing and Arrow Up/Down/Home. The separate inspector retains
its original width and full height in wide layouts.

Every view offers distributions, numeric histograms, count matrices, selected-row
relationships and paged preview cards. Hex additionally has a byte distribution.
Purpose-specific defaults and explanations prevent presenting unrelated columns
as interchangeable totals. All labels, missing values, counts, and units remain
available in the inspection data. An invalid numeric measure reports exclusions;
a numeric overflow reports a chart error, not NaN coordinates or a broken table.

Charts summarize the current **search and facet context**, before their own visual
filter. Clicking a bar, histogram bin or nonzero matrix cell applies an additional
stable-key filter to Records and Spreadsheet. Clicking the same bucket again, or
Clear visual filter, restores that context. Reset filters clears all three filter
sources. This deliberately does not shrink a chart to its selected bucket and
trap the user there. Hierarchical projections retain ancestors and, for a matching
parent, descendants as before; those context rows are not additional chart counts.
`contextRows` and `matchingRows` expose the distinction to integrations.

**Chart data** opens a full-width TreeDataGridWeb view of the exact, unrounded
values and source-record collections. Histogram metadata includes unrounded bounds
and indicates whether the upper bound is inclusive. The last bin alone includes
its upper boundary; a constant population is one bin. Inspect records returns to
the parent and applies that bucket's filter. Back/Escape restores the original
report, search, column configuration and selection. Spreadsheet and CSV continue
to use the current displayed tree projection, including expansion state.

**Pin record**, then select another record and **Compare**, opens a property-by-
property snapshot comparison with exact pinned/current values and Same/Changed
status. Pinning captures values, not a live reference to an editable row. Comparison
is report-local and is reset when a typed report switches source drawings. It does
not perform cross-file geometric comparison or change either drawing.

## Tool-specific defaults

| Tool | Visual aid and inspection path |
| --- | --- |
| Statistics | Weighted object-type distribution, exact counts, linked type records and all occurrences. Counts describe parsed objects, not only geometric entities. |
| Cloud / Frequencies | Separate object-type and group-code populations, preserving their different denominators. Both original sets remain in Records. |
| Dependencies | Definition/type distribution; selected-row incoming/outgoing handle and named-table references. External paths are inert, never fetched or asserted available. |
| Handle map | Ownership-status distribution and a selected-object relationship diagram. Duplicate candidates, missing targets and cyclic references remain explicit. |
| Fonts | Font-root usage distribution without summing font/style/leaf levels together; explicit root/all/leaf population selection and style/text relationships. |
| Classes | Application distribution and individual CLASS record relationships/raw fields. |
| Blocks & Inserts | Metadata/available thumbnail cards, instance counts, actual INSERT links, and existing complete instance/attribute/diagnostic collections. |
| Block Definitions | Definition cards alongside the existing highlight and property actions. |
| Line Types | Paged basic dash/gap previews, exact pattern values and all usage references. Complex shape/text linetypes still require the native drawing. |
| Texts | Readable full-text/attribute cards, layer distribution, canonical source selection and native drawing location. Raw MTEXT remains untouched. |
| Binary Objects | Payload-byte distribution by object type and original Hex/Office actions. |
| Proxy Objects | Class distribution, references and canonical raw object/class inspection. |
| Object Sizes | Subtree-character histogram. These are not file bytes; overlapping ancestor/descendant sizes must not be summed as file size. |
| Diagnostics | Severity-by-category matrix linked to actual engine findings. Affected-object relationships and location actions are added when existing rule results identify nodes. |
| Diagnostic Rules | Enabled-by-category matrix. Visual filtering scopes the existing Enable/Disable filtered controls; Apply/Cancel/profile handling is unchanged. |
| Hex Viewer | 16 byte-range bars with counts, printable ASCII and Shannon entropy for the **current page/search/facets only**. Clicking a range filters rows containing those bytes, not a fabricated byte-level record set. |
| Archive Entries | Kind/byte-size distribution and explicit existing Preview/Download actions. |
| Layers / plot styles | Configurable state/value distributions alongside real inline controls. No diagram click silently changes layer or plotting state. |
| Drawing information / selection properties | Metadata cards, grouping, exact values and pinned-record comparisons. |
| Batch results | Matching-record counts by file; optional line histograms, original file-at-line actions and unmodified full result exports. Line numbers are not summed as counts. |

The existing filter/configuration inputs and non-tabular dialog actions are
retained; visualizations are attached to their report results rather than replacing
input forms. Office previews remain real GridWeb/RichTextWeb documents.

## Reference graphs and source-aware drawing navigation

The reference model builds lazily once per report snapshot. It indexes actual DXF
handle-reference properties (excluding identity codes 5/105), plus named LAYER,
LTYPE, STYLE, DIMSTYLE and INSERT-to-BLOCK references. Handle/name maps retain all
candidates. A missing target is a labeled unresolved record, not a guessed match.
The selected object's directed ego diagram shows up to six incoming and six
outgoing links with explicit displayed/total counts. **All relationships** exposes
every link and its DXF reference code/type in a full-width inspection table. Graph
nodes select/expand their canonical report row or open a related-object inspector;
they never recover identity from a rendered label. Structural font-group children
remain available even when the group has no physical DXF identity.

**Locate in Drawing** activates the original source document, selects its matching
native layout when known, focuses the compiled visible geometry and highlights
that handle through the existing Skia overlay. The analysis tool remains open when
docked. Ambiguous handles, removed objects, closed source documents, hidden geometry
and superseded requests produce actionable messages instead of selecting an
unrelated drawing. **Show in Tree** retains the existing dock/dialog dismissal
policy. Native location is not a miniature substitute renderer and does not fetch
fonts, images, external references, or other resources implicitly.

RibbonWeb's contextual **Report Tools / Explore & Inspect** group adds Visual +
data, Data only, Reset report filters, Pin comparison record, Inspect chart data
and **Refresh source drawing report**. The original Refresh from active drawing
command remains explicitly distinct. Source refresh activates the bound drawing
first instead of rebinding a report merely because another file was selected.

## Bounds, accessibility, lifecycle and limits

Distribution diagrams show at most six bars in split mode and fourteen when
focused. Other contains the exact remaining keys and totals; Chart data is never
truncated. Matrices retain at most eight groups per axis, with exact Other buckets.
Cards page six records at a time. A diagram is not an all-node graph layout engine.
Tables remain virtualized, but report aggregation/filtering/indexing works over
the in-memory records; this is not out-of-core or worker-based analysis.

Visual updates coalesce on animation frames and are deferred while disabled. A
ResizeObserver adjusts presentation without reconstructing the record control.
Disposal cancels scheduled work, disconnects the observer, releases diagram data
and disposes nested views. Refresh closes stale drill-downs; saved visual mode,
measure, population, filter keys, inspector and pinned values restore together.
The existing bounded session state cache is separate from saved Dockyard geometry.

Bars/cells/nodes are keyboard-operable buttons with names and numeric labels,
independent of color. Cards retain keyboard focus during selection. Chart controls retain keyboard focus after filtering. Cards follow the selected
record sort order while keeping the pre-visual-filter population. Focusing a
diagram rebuilds its larger group budget immediately. SVG exports
contain literal text, a resolved background, and per-element computed theme styles without scripts, remote images or
embedded font binaries. Exports describe the currently displayed diagram, while
CSV/Spreadsheet/Chart data expose the underlying values. Dark/high-contrast theme
and compact dock sizing remain supported.

Text previews intentionally are not full MTEXT typesetting. Basic linetype previews
are not complete CAD complex-line rendering. Entropy is not a file-type detector,
security verdict or compression estimator. Existing diagnostics remain the source
of findings; a matrix does not certify their completeness or correctness. Renderer
and Office compatibility contracts are unchanged.

## Verification

```
node --test tests/analysis-visual-model.test.cjs
python tests/analysis-visuals.py
python tests/analysis-views.py
python tests/workspace-startup.py
python tests/check-docking-regressions.py
python tests/skia-workspace.py
python tests/docking-workspace.py
python tests/ribbon-workspace.py
python tests/gridweb-previews.py
```

Thirteen pure-model tests verify typed identity, totals, Other, histogram boundaries,
finite extremes/overflow, matrix membership, page byte counts/entropy, exact
comparison and a 50,000-record population. Thirty-four new browser groups cover
linked controls, all typed report launchers, native drawing navigation, references,
source lifetime, bulk rule operations, previews, state restoration, SVG export,
20,000-record virtualization, dark/narrow layouts and keyboard interactions.
The existing 26 analysis groups and application/startup/renderer suites remain
independent regression gates. Native HTTP/module loading and actual Skia navigation
must pass in CI; the optional injected harness is only a local diagnostic aid.

The permanent read-only analysis workflow publishes environment records and actual
browser screenshots. It runs the pure model and both analysis browser suites.

## Continued inspection after a source closes

Analysis controls no longer pass every click through the legacy source-activation
handler. Local chart filtering, table searches, column changes, CSV/SVG exports,
chart-data drill-down and pinned comparisons operate on the retained snapshot.
The existing `AnalysisView.runAction()` source guard still protects drawing actions
and inline edits, including TreeDataGridWeb shadow-root controls. Explicitly local
chart-data actions set `requiresSource: false`; this is trusted application
configuration, never a flag parsed from DXF content. Legacy buttons outside the
analysis workbench keep their existing guard and dock/dialog closing policy.
