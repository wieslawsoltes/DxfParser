# @wieslawsoltes/dxf-drawing-tools

Pure camera transfer, frame-coalesced linked navigation, and transactional,
balanced Dockyard layouts for independent drawing views.

```js
import { createDrawingViewTools } from '@wieslawsoltes/dxf-drawing-tools';

const tools = createDrawingViewTools(rendererApi, dockyardApi);
const snapshot = tools.captureCamera(sourceFrame, 'Model');
const camera = tools.transferCamera(snapshot, targetFrame, 'world', 'Model');
if (camera) {
    const frame = rendererApi.prepareFrame(targetFrame.scene, {
        width: targetFrame.width, height: targetFrame.height,
        viewDirection: camera.direction, viewState: camera.viewState
    });
    surfaceHost.request(frame);
}
tools.tileDrawings(dockingManager, drawingDocuments, 'grid', 1200, 800);
```

Supply the exact renderer and Dockyard API instances used by the host. The factory
uses renderer geometry/projection functions and Dockyard model constructors; it
does not load runtimes, create native surfaces, install globals, or import the app.
The host retains ownership of `surfaceHost` and its presentation lifetime.

`captureCamera`, `transferCamera`, `sameCamera`, `gridShape`, `tileDrawings`, and
`NavigationLink` are exported through the factory result. `NavigationLink` receives
callbacks for active records, visibility, frames, layouts, camera application,
scheduling, cancellation and errors. See `index.d.mts` for the host contract.

Coordinate linking transfers center, scale, projection direction and twist.
Relative linking transfers proportional position and fit-relative zoom. Layouts
must be compatible. Linking does not convert units or geometrically register
sources. Grid tiling uses public Dockyard transactions, rejects unmovable views
before mutation, and supports at most 32 documents per operation.

## Packaging

ES modules are the canonical sources. Native browser imports need no build or
repository-global bootstrap. Node.js **22.13 or later** also supports `require()`
through the package's synchronous ESM facade, sharing the same exported objects
as `import`. No generated distribution, install script, or bundled font is needed.
The package has no install-time dependencies; host APIs are injected explicitly.

Run `npm pack ./packages/dxf-drawing-tools` from the repository root to create a local tarball.
Packing does not publish to npm. Public exports and TypeScript declarations are
included. Tests and app adapters are not shipped.

## License

[MIT](LICENSE). Host-supplied libraries retain their own licenses.
