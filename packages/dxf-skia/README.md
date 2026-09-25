# @wieslawsoltes/dxf-skia

DXF input and document models, retained geometry compilation, picking/snapping,
and native SkiaSharpWeb rendering. Node and browser consumers share the same API.
The host supplies the Skia runtime and any image or font resources.

## Build and pack

```sh
npm run build --prefix packages/dxf-skia
npm pack ./packages/dxf-skia
```

Run these commands from the repository root. `npm pack` also builds automatically
through this package's self-contained `prepack` script. Generated `dist/` files
are included in the tarball, not tracked in Git. `npm test --prefix packages/dxf-skia`
builds before running this package's tests.

## Compile a drawing

```js
import {DxfDocument, SceneCompiler, prepareFrame} from '@wieslawsoltes/dxf-skia';

const document = new DxfDocument(dxfTextOrBytes);
const scene = new SceneCompiler(document).compile('Model');
const frame = prepareFrame(scene, {width: 1200, height: 800});
console.log(scene.diagnostics, frame.scale);
```

The default import and `require()` share constructor identity in Node. Use
`@wieslawsoltes/dxf-skia/browser` for standalone browser ESM, or the `/global`
entry point for a classic script exposing `DxfSkia`. ESM/CJS imports do not install
a global namespace. TypeScript declarations are supplied in `index.d.ts`.

`SkiaPainter` draws prepared frames onto native Skia canvases. `SurfaceHost` manages
scheduled presentation, backend recovery, PNG exports, and surface retirement.
Dispose painters, resource stores, and surface hosts when their owner closes.
Await export promises explicitly: `whenIdle()` is a presentation fence, not an
export-completion fence.

Supported input includes DXF text, byte buffers/slices, and supported modern/R12
binary DXF. The implementation is budget-limited and reports unsupported geometry;
it is not a DWG reader, ACIS kernel, or complete AutoCAD database/typography engine.
Resources are explicit and no font binaries are bundled.

See the [workbench README](../../README.md) for current application behavior,
rendering boundaries, test commands, and repository maintenance conventions.
