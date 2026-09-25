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

## Integration boundary

There are no imports of the DxfParser app, its selectors, or its vendor paths.
Workspaces register their own custom elements and own the vendor API versions.
Factories require a real browser window when called, but module import is safe in
Node/SSR. Dispose every view and registry when its owner is removed; this package
does not own or dispose the supplied browser or vendor libraries.

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
