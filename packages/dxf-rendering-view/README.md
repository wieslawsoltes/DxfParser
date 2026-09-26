# @wieslawsoltes/dxf-rendering-view

Host-injected DXF document services, retained native viewport orchestration, and a
read-only property inspector. The package wraps a supplied DxfSkia renderer; it
does not bundle Skia, implement another renderer, or own application documents.

## Render a drawing

```js
import { createRenderingServices } from '@wieslawsoltes/dxf-rendering-view';

const { RenderingDataController, RenderingSurfaceManager } = createRenderingServices({
    renderer, // The host's compatible DxfSkia API.
    initialize: () => initializeSkia({ fonts: false }),
    onObserverError: error => console.warn(error)
});
const documents = new RenderingDataController();
const document = documents.ingestDocument({ tabId: 'revision-a', fileName: 'a.dxf', sourceText });
if (!document) throw new Error('Invalid or unsupported drawing input.');
const view = new RenderingSurfaceManager({ backend: 'auto' });
view.initialize(canvas);
view.renderScene(document.sceneGraph);
await view.ready;
const detach = view.subscribeFrame(frame => updateCoordinates(frame.worldCenter));
// When the owner is removed:
detach();
await view.dispose();
documents.dispose();
```

Supply either `initialize` or an initialized `Skia` object when constructing a
surface manager. A factory does not initialize the runtime. Reuse the host's
initializer promise to share a runtime; each manager owns a separate SurfaceHost,
camera, compilation state, resources, selection and comparison session. No imports
resolve to repository vendor paths. A document store can also be used without a
browser or a Skia initializer; parsing and scene compilation belong to the renderer.

`setLayout`, `setViewDirection`, layer/attribute/isolation controls, comparison
composition and resource registration reuse the existing retained render path.
Camera-only updates reuse compilation. `subscribeFrame`, `subscribePaint` and `subscribeError` return independent,
detachable subscriptions. Legacy `onPaint`/`onError` callbacks remain supported;
subscribers never wrap or replace them. Delivery snapshots subscriptions, skips
removed listeners and stops on disposal. All subscriptions are cleared on disposal; observer
errors cannot corrupt the document store or quarantine a working GPU backend.
DOM paint/error events are created in the attached canvas's browser realm.

The host owns pointer/keyboard gestures, layout placement, sizing, source-file
lifetime and comparison-session construction. `resize` accepts CSS dimensions and
clamps pixel ratio to 1–3. `allowFallback` and `maxPixels` pass through to SurfaceHost.
`clear` removes the scene and suspends presentation; call `resume` when revealing
it again. `dispose` invalidates use immediately, joins native retirement, clears
subscriptions, and returns the same promise on repeated calls. A resource operation
still waiting for runtime initialization cannot repopulate a disposed view.

## Inspect properties

```js
import { createPropertyInspector } from '@wieslawsoltes/dxf-rendering-view';
const Inspector = createPropertyInspector({ window });
const inspector = new Inspector(document.getElementById('properties'));
inspector.setSections([{ title: 'Entity', properties: [{ name: 'Layer', value: 'PIPES' }] }]);
inspector.setTheme('dark');
// inspector.dispose() when the host removes it.
```

Load `styles.css` for the built-in semantic-table presentation. A host may inject
`createRecordView(container, { title, columns, rows })` to use a richer record grid;
it must return `setRows`, `dispose`, and optionally `setTheme`. That host also loads
its record-view styles and registers any vendor custom elements. The DxfParser
adapter supplies its existing AnalysisView, keeping sorting/search/export behavior.
Containers must belong to the supplied window. Properties are copied into the
control; text is not executed as HTML. Legacy `isHtml` values are tag-stripped for
compatibility. Disposal affects the owned record view and container contents only,
not the host library or neighboring inspectors.

## Packaging and scope

ESM sources are canonical. Node 22.13+ `require()` loads the same exports through
`index.cjs`. Imports are DOM-free and install no globals. There are no install-time
dependencies, generated distributions or bundled fonts. TypeScript declarations,
CSS and MIT license are included. From the repository root:

```sh
npm pack ./packages/dxf-rendering-view
```

This creates a local tarball, not a registry publication. Rendering/export/input
coverage and GPU recovery are those of the supplied renderer. This package does
not add DWG support, a CAD command UI, automatic resource resolution or registration
between coordinate systems. PNG/PDF export remains the native renderer's operation.

## License

[MIT](LICENSE). Host-supplied dependencies retain their own licenses.
