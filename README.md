# DxfParser

A browser-based DXF inspection and comparison workbench with native SkiaSharpWeb
rendering, dockable drawing views, structured analysis tools, and a standalone editor.

## Run locally

Serve the repository root with Python 3:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://localhost:8080/` for the workbench or
`http://localhost:8080/editor/` for the standalone editor. On systems where Python
is named `python`, use that executable instead. `npm start` is an equivalent
shortcut when Node.js is installed.

The browser applications load maintained source modules and pinned local vendor
assets. No npm install, generated `dist` directory, CDN, or application server is
required to run them. Serve over HTTP on localhost or deploy the repository root
to an HTTPS static host; opening the HTML directly with `file://` is not supported.
WebGPU is preferred when available, with WebGL and native Skia raster fallbacks.
The `.nojekyll` file allows branch-based GitHub Pages hosting of the source tree.

## Workbench

| Area | Current functionality |
| --- | --- |
| DXF inspection | Text and supported binary DXF input, source-tree inspection, handle navigation, filtering, structural comparison, diagnostics, and batch analysis. |
| Drawing rendering | Retained geometry compilation, model and paper layouts, layer controls, selection and snapping, measurements, local font/image resources, and native PNG/vector PDF export. |
| Visual comparison | Rendered-object matching, current/reference/common categories, appearance and text/hatch filters, change ledger, proximity groups, rectangular/polygonal revision clouds, and change navigation. |
| Multiple drawings | A separate dockable viewport per source, independent rendering state, balanced linear/grid tiling, and optional linked camera navigation. |
| Analysis and previews | Searchable/sortable records, linked charts and graphs, optional inspection spreadsheets, CSV/copy/export, and spreadsheet/document previews. |

The standalone editor uses the same renderer and docking/ribbon controls, but
retains a single-file UI. It is not a complete CAD authoring system.

### Render and arrange drawings

Open your DXF sources and choose **CAD View → Drawing Views → Render all drawings**.
Drag drawing tabs to split, float within the page, or redock them. The active
viewport determines which drawing the ribbon and shared tools control.

```text
RENDERALL
RENDERTILE grid
RENDERTILE horizontal
RENDERTILE vertical
RENDERDRAWING "drawing.dxf"
```

Each source owns its camera, layout, selection, resources, measurements, and
comparison session. Closing a viewport retains its in-memory state; closing its
source disposes that source's resources. The workspace supports up to 32 retained
source-owned drawing contexts. Tiling is undoable and preserves unrelated content.

**Navigation** defaults to **Independent**. **Linked coordinates** shares camera
coordinates and scale; **Linked relative view** shares proportional position and
fit-relative zoom. Only compatible visible layouts participate. Commands are
`RENDERLINK off|world|relative` and `RENDERMATCH` for a one-time camera match.
Linking does not convert units, register geometry, georeference, or overlay files.

### Compare revisions

Choose **CAD View → Compare drawings**, then select an open source or load a
reference DXF. Comparison uses visible rendered root objects, including supported
compound geometry; it is not a raw-handle comparison or a raster pixel diff.

**Import selected change** adds eligible reference objects and supported
block/symbol dependencies without deleting the current version. Import is limited
to model space in the parser workspace. Unsafe or unsupported dependency graphs
are rejected before applying a transaction; source-guarded undo/redo is available.

**Save snapshot** stores both DXF source strings, comparison settings, and layout
in a reloadable JSON container. This is not a DWG/DXF comparison drawing. PNG/PDF
exports retain the displayed comparison. Use **Refresh** after source-tree edits.

Workspace persistence stores supported source state, dock placement, layouts,
cameras, and navigation mode within browser-storage limits. External resource
bytes, selections, measurements, and comparison sessions are not restored by view
metadata; save comparison snapshots explicitly.

## Rendering boundaries

The renderer supports common lines, curves, polylines, blocks, meshes, hatches,
text, dimensions, images, clipping, and layouts, with diagnostics for unsupported
content. Coverage is not full AutoCAD fidelity. In particular:

- There is no DWG reader/writer, ACIS solid kernel, dynamic-block evaluator,
  automatic external-reference resolver, or arbitrary DXF object-graph importer.
- Advanced MTEXT typography, bigfont SHX, associative dimension behavior, plot
  styles, perspective/depth rendering, and proprietary objects are not exhaustive.
- Fonts and images must be supplied explicitly. Font binaries are not bundled;
  fallback glyphs do not establish typography fidelity. Comparison checks image
  placement and resource names, not external image bytes.

Compilation is synchronous and budget-limited. Visible rendering is scheduled
per surface; hidden views suspend presentation. Software-GPU checks exercise real
Skia/WebGPU/WebGL APIs but are not physical-device performance certification.

## Development and packages

Node.js **22.13 or later** is required for builds and JavaScript tests. The root npm
package is private and has no install-time dependencies.

```sh
npm run build        # Generate optional app and renderer distributions.
npm run build:check  # Verify those files match the current sources.
npm run clean        # Remove generated first-party distributions.
```

Generated `/dist/` and `/packages/*/dist/` directories are ignored by Git. The
`vendor/` tree is different: its checked-in distributions are runtime dependencies,
with retained licenses, notices, and checksum manifests. Do not remove them when
cleaning build output. `node scripts/clean.mjs --tests` also removes test evidence.

| Package | Purpose |
| --- | --- |
| [`@wieslawsoltes/dxf-skia`](packages/dxf-skia/README.md) | DXF input/document model, retained scene compiler, geometry, picking/snapping, native painter, and surface lifetime management. |
| [`@wieslawsoltes/dxf-compare`](packages/dxf-compare/README.md) | Rendered-object comparison, change grouping/clouds, snapshots/reports, and guarded reference import. |
| [`@wieslawsoltes/dxf-inspector`](packages/dxf-inspector/README.md) | Source-tree parser, structural diff, diagnostics and binary inspection helpers. |
| [`@wieslawsoltes/dxf-analysis`](packages/dxf-analysis/README.md) | Pure aggregation models and host-injected record/spreadsheet/visual report UI. |
| [`@wieslawsoltes/dxf-tree-view`](packages/dxf-tree-view/README.md) | Source-tree viewport, editing callbacks, diff alignment and overview rail. |
| [`@wieslawsoltes/dxf-workspace`](packages/dxf-workspace/README.md) | Host-injected Dockyard shell, panel registration, layout persistence and lifecycle. |
| [`@wieslawsoltes/dxf-office-preview`](packages/dxf-office-preview/README.md) | Host-injected Office/text/image/archive preview UI and legacy decoder helpers. |
| [`@wieslawsoltes/dxf-drawing-tools`](packages/dxf-drawing-tools/README.md) | Host-injected camera linking and transactional drawing layout helpers. |

```sh
npm pack ./packages/dxf-skia
npm pack ./packages/dxf-compare
npm pack ./packages/dxf-inspector
npm pack ./packages/dxf-analysis
npm pack ./packages/dxf-tree-view
npm pack ./packages/dxf-drawing-tools
npm pack ./packages/dxf-workspace
npm pack ./packages/dxf-office-preview
```

The renderer's `prepack` builds its CJS, ESM, and classic-browser artifacts from
source. These commands produce local tarballs; they do not publish to npm.
The extracted component packages use canonical ES modules and need no build.
Their CJS facades use synchronous ESM loading on Node 22.13+, so `import` and
`require` share the same API instance. UI factories receive browser/vendor APIs
explicitly and do not install globals. Package-owned CSS is exported as
the `styles.css` subpaths of `dxf-analysis`, `dxf-tree-view`, `dxf-workspace`,
and `dxf-office-preview`.

`components/` retains application orchestration, source-owned document controllers,
renderer adapters, source persistence, report builders and startup. Docking and
Office adapters provide panel identities, storage namespaces and host callbacks;
the reusable packages contain no application or vendor-relative imports. Small service adapters
connect package exports to the existing app API. The diagnostics engine no longer
starts the application; `components/app-startup.mjs` owns workbench startup.
Both browser entry points import the same packages without generated `dist` files.

## Tests

Install the declaration checker and browser tooling:

```sh
npm install --global typescript@5.8.3
python3 -m pip install -r tests/requirements-browser.txt
python3 -m playwright install --with-deps chromium
```

```sh
npm test                         # Source/build contracts, models, native pixels, isolated packed consumers.
npm run test:browser              # All current HTTP application suites.
npm run test:all                  # Models and browser suites, excluding the strict GPU group.
python3 tests/run.py gpu          # Required WebGPU/WebGL pipelines and current cache checks.
python3 tests/run.py --list       # Show the default test inventory without running it.
```

On Linux CI, the GPU group runs under `xvfb-run -a`. Missing GPU adapters fail that
group rather than counting a raster fallback as a GPU pass. Individual browser
groups are `workspace`, `analysis`, and `drawings`; all are defined in
[`tests/suites.json`](tests/suites.json) and used by the same local/CI runner.
JavaScript `*.test.js`, `*.test.cjs`, and `*.test.mjs` files are discovered automatically.
`bash tests/run-all.sh` delegates to that runner.

`CHROMIUM_EXECUTABLE` selects an existing Chromium installation. `SKIA_TEST_FONT`
selects a local font for native-font checks; a native test reports an explicit skip
when no suitable system font is available. Test logs, measurements, and screenshots
are written to ignored `test-results/` directories and uploaded as CI artifacts.
Browser CI deliberately runs without generated distributions or injected scripts.

## Repository layout

```text
components/  App startup, orchestration, service adapters, docking, ribbon and rendering integration.
editor/      Single-file editor entry point and editing integration.
packages/    Reusable inspection, report UI, source-tree, navigation, renderer and comparison packages.
scripts/     Build, cleanup, vendor maintenance and distribution/package checks.
tests/       Current native and HTTP regression suites, fixtures and shared runner.
vendor/      Pinned runtime dependencies, licenses, notices and checksums.
```

## License

First-party code is licensed under the [MIT License](LICENSE). Vendored components
retain their respective license and attribution files in `vendor/`.
