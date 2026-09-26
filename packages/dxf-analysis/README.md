# @wieslawsoltes/dxf-analysis

Reusable read-only record tables, linked analytical visualizations, optional
spreadsheet presentation, and bounded aggregation models. Presentation is hosted
by TreeDataGridWeb and GridWeb; the package does not replace their renderers.

## Pure models

```js
import { aggregate, histogram } from '@wieslawsoltes/dxf-analysis/models';
const rows = [
    { key: 'a', values: ['Pipe', 12] },
    { key: 'b', values: ['Valve', 3] }
];
const groups = aggregate(rows, 0, 1);
const distribution = histogram(rows, 1, 8);
```

Model exports also include `label`, `numeric`, `top`, `matrix`, `byteStats`, and
`compareRows`. They retain typed row keys and do not modify input row order. Model
imports require no window, custom elements, storage, application or vendor APIs.

## Browser presentation

Register compatible TreeDataGridWeb custom elements in the target window, supply
the matching core/web API objects, and load this package's `styles.css`. Supply
GridWeb and register its `grid-web` element when spreadsheet mode will be used.
Without GridWeb, the spreadsheet button is disabled and programmatic switching
is rejected before changing presentation state. Containers must belong to the
supplied window.

```js
import { createAnalysisUI } from '@wieslawsoltes/dxf-analysis';

const ui = createAnalysisUI({
    window,
    treeDataGridCore,
    treeDataGridWeb,
    gridWeb,
    activateSource(sourceId) {
        // Optional application boundary: validate/activate this source or throw.
        documentStore.activate(sourceId);
    }
});
const view = new ui.AnalysisView(document.getElementById('report'), {
    title: 'Equipment', columns: ['Type', 'Count'], rows,
    visualization: { kind: 'distribution', group: 0, measure: 1 }
});
view.setTheme('dark');
// When the owning component is removed:
view.dispose();
```

The returned API includes `GridView`, `AnalysisView`, `AnalysisVisuals`,
`ReportRegistry`, and the DOM projection helpers used by the workbench. Each
factory call owns its dependency references and presentation bookkeeping; the
factory does not overwrite `window.DxfGrid` or `window.DxfAnalysis`.

Rows may supply action callbacks, child rows, metadata, or retained DOM sources.
Source-bound actions invoke `activateSource` when the view is beneath an element
with `data-source-tab-id`. Without that callback, source lifecycle belongs entirely
to the host. Do not pass executable actions from untrusted documents. Clipboard
and download actions retain the browser's normal permission requirements.

## Dockable analysis panels

`createAnalysisDocking({ window, dockyard })` returns a retained panel-layout
controller using the host's Dockyard instance and stylesheet. Supply it through
`createAnalysisUI({ ...host, createLayout: options => new Layout(options) })`.
Every full analysis view then owns independent Records, Visualization, and Details
panes: drag their tabs to resize, split, reorder, float or redock them. Records and
Spreadsheet remain alternate presentations of the same records pane. The original
record model, chart filter, selection and detail content are retained across moves.

Adaptive layout chooses side-by-side or stacked panes for large hosts and tabs for
narrow/short hosts. Manual arrangements are retained until Reset layout; automatic
resizing does not undo a user's docking choices. Focus visual and Restore panes
provide temporary full-size inspection. The compact Details/Visuals buttons reveal
the corresponding tab. Layout history belongs to the report, not its outer workspace.
`onExpand` is an optional host callback for expanding an entire analysis tool.

The controller supports `setPreset('auto' | 'balanced' | 'stacked' | 'tabs')`,
`show`, `hide`, `focus`, `restoreFocus`, `saveState`, `restoreState`, and `dispose`.
States contain layout metadata only, validate known pane identities and types, and
are limited to 64 KiB, 64 nodes and 12 levels. Optional injected storage persists
presentation under a host-selected `storageKey`. No storage is accessed by default.
Use `docking: false` for small embedded related tables; full drill-down views can
still have docking. Disposing a report retires its layout and all owned controls.

## Dockable result documents

`createReportWorkspace` hosts several independent report documents and optional
host-owned query controls in a native Dockyard layout. It receives a registered
Dockyard API and a report-view factory; it does not import an application or start
one. Load the host's Dockyard theme and this package's `styles.css`.

```js
import { createReportWorkspace } from '@wieslawsoltes/dxf-analysis';
const Results = createReportWorkspace({
    window, dockyard: Dockyard,
    createView: (container, options) => new ui.AnalysisView(container, options)
});
const reports = new Results({
    container: document.getElementById('results'),
    controls: document.getElementById('query'), controlsTitle: 'Query'
});
const first = reports.add({ title: 'Equipment', columns: ['Tag', 'Type'] });
reports.appendMany(first.id, [
    { key: 1, values: ['P-101', 'Pump'] },
    { key: 2, values: ['V-201', 'Valve'] }
]);
reports.arrange('horizontal');
// When removing the owning component:
reports.dispose();
```

Result tabs can be split, floated in-page, redocked, and closed independently.
Query controls use a resizable sidebar when there is sufficient space, and share
the tab strip in compact hosts. **Focus results** hides the query pane without
resetting the report; **Query** reveals it again. Automatic width changes preserve
the active pane and stop rearranging a manually customized layout. Explicit result
arrangements reset that customization. Nested AnalysisView records, charts, details,
filters, selection and spreadsheet state are retained when moving documents.

Each result owns a `ReportBuffer`: appends publish once per animation frame;
`flush(id)` provides synchronous publication. Default limits are 32 open results
and 250,000 rows per result. Exceeding a limit rejects before appending rows or
creating a document. These are configurable host budgets, not rendering-performance
claims. Closing a result cancels pending publication, disposes its view and releases
Dockyard's retained content. Late appends to closed IDs reject. Cleanup observers
cannot stop other documents from being disposed. Query controls remain host-owned
and are returned to the container on disposal.

The outer result-document manager intentionally has no layout history or storage:
closing a query result is final and cannot resurrect disposed callbacks or source
files through layout undo. Per-report pane history remains available. Hosts own
query execution, cancellation, row actions and any result export/persistence.

`ReportBuffer` is also usable without a DOM. Its scheduler must invoke callbacks
asynchronously. Failed publication keeps rows for an explicit retry and reports the
error without creating an automatic retry loop. Snapshot arrays are copies; row
objects and action closures remain host-owned values, not serialized data.

## Integration boundary

There are no imports of the DxfParser app, its selectors, or its vendor paths.
Workspaces register their own custom elements and own the vendor API versions.
Factories require a real browser window when called, but module import is safe in
Node/SSR. Dispose every view and registry when its owner is removed; this package
does not own or dispose the supplied browser or vendor libraries.

Docked bar charts use pane-sized SVG geometry to retain readable labels. Dense
matrices and relationship graphs scroll instead of reducing text to miniature sizes;
preview cards adapt to the pane width.

## Packaging

ES modules are the canonical sources. Native browser imports need no build or
repository-global bootstrap. Node.js **22.13 or later** also supports `require()`
through the package's synchronous ESM facade, sharing the same exported objects
as `import`. No generated distribution, install script, or bundled font is needed.
The package has no install-time dependencies; host APIs are injected explicitly.

Run `npm pack ./packages/dxf-analysis` from the repository root to create a local tarball.
Packing does not publish to npm. Public exports and TypeScript declarations are
included. Tests and app adapters are not shipped.

## License

[MIT](LICENSE). Host-supplied libraries retain their own licenses.
