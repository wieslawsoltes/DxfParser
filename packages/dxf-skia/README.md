# DxfSkia

An independent DXF tagged-document model, retained geometry compiler and native
SkiaSharpWeb painter. It is not a wrapper around DxfParser's former renderer.

The package has no mandatory runtime npm dependency. Inject an initialized
SkiaSharpWeb namespace; the application supplies the pinned local native runtime.
Importing the package performs no network request, native initialization, font
loading or global mutation. The explicitly named classic-browser build registers
`globalThis.DxfSkia`; the module builds have private namespaces.

## Node: compile and draw

```js
import fs from 'node:fs';
import {DxfDocument, SceneCompiler, prepareFrame, SkiaPainter}
  from '@wieslawsoltes/dxf-skia';
import {Initialize} from '@wieslawsoltes/skiasharpweb';

const S = await Initialize({fonts: false});
const document = new DxfDocument(fs.readFileSync('drawing.dxf'));
const scene = new SceneCompiler(document, {tolerance: 0.02}).compile('Model');
const surface = S.SKSurface.Create(new S.SKImageInfo(1200, 800));
const painter = new SkiaPainter(S);
try {
  const frame = prepareFrame(scene, {width: 1200, height: 800});
  const result = painter.draw(surface.Canvas, frame);
  console.log(result.diagnostics); // Unsupported content is explicit.
  const image = surface.Snapshot();
  try {
    const data = image.Encode(S.SKEncodedImageFormat.Png, 100);
    try { fs.writeFileSync('drawing.png', data.ToArray()); }
    finally { data.Dispose(); }
  } finally { image.Dispose(); }
} finally { painter.dispose(); surface.Dispose(); }
```

CommonJS `require('@wieslawsoltes/dxf-skia')` returns the same constructors as the
Node ESM entry. Browser-native ESM is at `@wieslawsoltes/dxf-skia/browser`, or
`dist/dxf-skia.mjs` when served without a bundler. A classic-script distribution
is available at `dist/dxf-skia.global.js`. Type declarations accompany the package.

## Browser: retained native surface

```js
import {DxfDocument, SceneCompiler, prepareFrame, SurfaceHost}
  from './dxf-skia/dist/dxf-skia.mjs';
import {Initialize} from './skia/dist/package/browser.js';

let canvas = document.querySelector('canvas');
const host = new SurfaceHost({
  initialize: () => Initialize({fonts: false}),
  backend: 'auto',
  onCanvasReplaced: replacement => { canvas = replacement; },
  onError: error => console.error(error),
});
host.initialize(canvas);
const model = new DxfDocument(await selectedFile.text());
const scene = new SceneCompiler(model).compile();
host.request(prepareFrame(scene, {
  width: 1000, height: 700, devicePixelRatio: window.devicePixelRatio,
}));
await host.whenIdle(); // Includes asynchronous native initialization and flush.
const pngBytes = await host.exportPng();
const pdfBytes = await host.exportPdf({width: 842, height: 595});
// On final teardown:
await host.dispose();
```

The native runtime may replace a canvas when negotiating incompatible browser
context types. Retain the replacement via the callback. After successful backend
negotiation, ordinary resize uses that backend without unnecessarily replacing the
element. Camera/resize requests coalesce to the newest frame. Suspension stops
new presentation; disposal invalidates pending initialization and awaits native
resource release. Call `resume()` before requesting a PNG from a suspended view.

## Fonts, images and resources

The package contains no font binaries. Explicitly register resource bytes using
`ResourceStore.register` or `SurfaceHost.registerResource`. Resources match
case-insensitive basenames; a DXF image/font path is never fetched automatically.
Failed replacement leaves the previous resource intact. A resource store may be
shared with a painter, but the caller then owns and disposes it.

```js
import {ResourceStore, SceneCompiler} from '@wieslawsoltes/dxf-skia';
const resources = new ResourceStore(S);
resources.register('engineering.ttf', await fontFile.arrayBuffer());
resources.register('plant.png', await imageFile.arrayBuffer());
const scene = new SceneCompiler(model, {
  textMeasurer: (primitive, text) => resources.measureText(primitive, text),
}).compile();
// Inject the same store into SkiaPainter or SurfaceHost.
```

Native fonts use shaped text and normalized cap-height metrics. Explicit SHX
standard/unifont files use the bounded interpreter. With no matching font, the
painter draws original, schematic single-stroke geometry and reports a missing-font
notice. That fallback is readable but is not the intended font or exact CAD text
layout; lowercase fallback glyphs use uppercase drafting forms.

## Independent geometry providers

A provider may supply geometry for an application-specific entity. The compiler
still applies transforms, identity, clipping and budgets. No source strings are
executed, no module is loaded from a drawing, and providers are never automatic.

```js
const scene = new SceneCompiler(model, {
  plugins: new Map([['MY_ENTITY', (record, {geometry: G}) => [{
    kind: 'path',
    path: G.pathFromPoints([record.point(10), record.point(11)]),
  }]]),
}).compile();
```

## Geometry and fidelity

World geometry and camera calculations use doubles; native path coordinates are
rebased locally before conversion to Skia's float representation. Circular and
elliptical arcs remain rational quadratic conics, including affine block/OCS
transforms. Rational B-splines use validated de Boor evaluation and bounded adaptive
subdivision. BVHs index retained geometry and projected bounds; native paths use
a bounded LRU. Picking and snapping operate on geometry, not DOM elements.

This is a broad rendering candidate, **not complete AutoCAD or all-DXF parity**.
Read [COMPATIBILITY.md](COMPATIBILITY.md) before relying on omitted or approximated
entities. Unsupported content remains tagged data and produces diagnostics.

## Building and qualification in DxfParser

From the repository root:

```sh
node scripts/build-rendering-bundle.js
python tests/check-docking-regressions.py
python tests/skia-workspace.py
```

The gate validates analytical geometry, bounded malformed inputs, real native
Skia pixels, package installation, strict TypeScript consumers, vendor checksums
and deterministic distribution. Existing application integration suites separately
exercise Dockyard, RibbonWeb, analysis records and Office previews. Hardware GPU
qualification and AutoCAD-authored golden-image comparisons are separate work.

## 0.2.0 GPU recovery and geometry additions

`SurfaceHost` accepts `allowFallback` and `onRecovery`, exposes failure/recovery state,
and provides `retryBackend('auto' | 'webgpu' | 'webgl' | 'canvas')`. Each failed backend
is retired at most once per explicit retry cycle. No failed native frame is reported
as presented. The application adds backend selection/retry without discarding files.

`geometry.pathBounds()` computes exact path extrema. `geometry.interpolateFitPoints()`
constructs chord-length C2 native cubic paths with natural/clamped/periodic endpoints.
`maxHatchLoops` bounds hatch boundary processing. `snap()` accepts a fourth iterable
of modes, including optional `nearest`; native curve endpoint/midpoint/quadrant modes
avoid artificial tessellation endpoints. See COMPATIBILITY.md for the expanded
hatch, clipping and dimension coverage and the remaining fidelity limits.

In DxfParser, `xvfb-run -a python tests/skia-gpu.py` additionally requires actual
Graphite/WebGPU and Ganesh/WebGL on SwiftShader. A missing adapter fails the suite;
software GPU execution is not physical-hardware certification.

## 0.2.1 export and backend lifetime fixes

PNG readback, drawing/flush and retirement are serialized per surface. Resize,
backend retry and disposal wait for in-flight native snapshots. Queued exports
cancel before native entry when invalidated, and a newer frame invalidates an
in-flight export instead of returning an image of the wrong drawing. Rejected
readbacks release the queue; successful PNG data and native image objects have
explicit ownership/cleanup. A late flush failure from a retired generation no
longer cancels a newly requested retry. Canvas-replacement notifications cannot
misclassify consumer callback exceptions as graphics-driver failures.

`await host.dispose()` joins pending native readbacks. `await host.whenIdle()`
remains the presentation fence; await `host.exportPng()` for its export result.

## Performance and input (0.3.0)

`new DxfDocument(bytes)` detects text or modern/R12 binary DXF. Typed slices retain
byte offsets and lengths; version/codepage metadata drives text decoding. Use
`decodeDxf(bytes, options)` to inspect the format and `dxfText(bytes, options)` when
integrating with a line-based parser. Text remains available as a direct input.

Camera frames lazily materialize picking geometry. Native paths, font/shaper
sessions, width measurements and vector `SKPicture` text recordings are retained;
zoom still rasterizes native vectors at full current resolution. `SkiaPainter`
accepts `cacheLimit`, `cacheBytes`, `textCacheLimit` and `textCacheBytes`. Its
`metrics` reports native builds/hits; `frame.interactionStats` reports lazy selection
work. Scenes are immutable snapshots; recompile after source edits.

See [the performance/input contract](../../docs/skia-renderer-performance.md) for
cache accounting, exact baseline pixel tests, supported codepages and limitations.
