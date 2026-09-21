# DxfParser — native Skia rendering

DXF inspection, independent dock documents, analysis records, spreadsheet/document
previews and a CAD-oriented native SkiaSharpWeb rendering workspace.

Serve the repository root over HTTP and open `index.html`:

```sh
python -m http.server 8080
```

Open a drawing, choose **CAD View → CAD workspace**, or keep the normal comparison
workspace and use **Render DXF**. The standalone editor is at `editor/index.html`.
No build or CDN is required to run the checked-in browser assets.

## Core guides

[New renderer and migration](docs/skia-renderer.md) ·
[0.2.0 WebGPU fixes and rendering improvements](docs/skia-renderer-improvements.md) ·
[0.2.1 export and backend lifetime fixes](docs/skia-renderer-lifetime.md) ·
[Reusable DxfSkia package](packages/dxf-skia/README.md) ·
[Rendering compatibility and limits](packages/dxf-skia/COMPATIBILITY.md) ·
[Ribbon and dock documents](docs/ribbon-document-workspace.md) ·
[Analysis workbench](docs/analysis-workbench.md) ·
[Office previews](docs/gridweb-document-previews.md)

The renderer uses a new document/geometry implementation and native SkiaSharpWeb,
not the former Canvas2D/WebGL renderer. Broad DXF support is present, but full
AutoCAD/all-entity fidelity is not complete. Unsupported content is reported, not
silently claimed to render. Native resource licenses/notices are retained under
`vendor/skiasharpweb`; the distribution contains no font binaries.

## Qualification

Node 22, a TypeScript compiler, Python and Chromium are needed for all checks:

```sh
npm install --global typescript@5.8.3
python -m pip install -r tests/requirements-browser.txt
python -m playwright install --with-deps chromium
bash tests/run-all.sh
xvfb-run -a python tests/skia-gpu.py
```

An existing Chromium executable may be supplied through `CHROMIUM_EXECUTABLE`.
The native font test uses an installed system font or `SKIA_TEST_FONT`; it skips
with an explicit reason when neither exists. It never packages those bytes.

The workflow `skia-renderer.yml` runs native pixels, package consumers and all
application integration suites, plus required real Graphite/WebGPU and Ganesh/WebGL
checks on software Vulkan/SwiftShader. Local qualification is not a GitHub Actions result.

Renderer 0.3.0: [native-vector performance, byte-aware DXF input and reproducible comparison benchmarks](docs/skia-renderer-performance.md).
