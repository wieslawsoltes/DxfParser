# Dockyard workspaces

> This documents the original Dockyard migration. For the current RibbonWeb command layout,
> independently dockable DXF file documents and source-aware tool navigation, see
> [RibbonWeb and dock documents](ribbon-document-workspace.md). The original commands/tools
> panels and nested file tab behavior below have been superseded.

The parser (`/index.html`) and standalone editor (`/editor/index.html`) now use the real
Dockyard layout model and DOM renderer. The previous sidebar drawer, comparison splitter,
fixed rendering inspector and application-dialog positioning are not a second layout system.

## Using the workspace

Drag a document tab or a tool's title to move it. Dockyard displays guides for tabbing and
splitting; hold Control while dragging to float without docking. Floating windows have
resize grips, maximize/restore, dock-back and close controls. A tool's pin button moves its
group to an auto-hide rail. Right-click a tab/title for docking and tab-group commands.

The permanent **Panels** menu can recover hidden commands, reports and tools, even when
all application command panels have been hidden. Closing a tree view or tool does not
close the DXF files it contains. File tabs remain inside their left/right comparison tree;
the two complete tree views can be floated, tabbed or split independently.

The parser has three starting arrangements:

| Preset | Arrangement |
| --- | --- |
| Compare | Commands/navigation above the analysis launcher and two independent tree documents. |
| Review | Tree and rendered drawing side by side, with independent layers, view/measurement, block, information and selection-property tools. |
| Focus | One document group; other tools remain recoverable through Panels. Also the first-load default below 701 CSS pixels. |

The editor offers **Drafting**, **Review** and **Focus**, covering its ribbon, project explorer,
drawing viewport, inspector, command/status bar and command palette. This is a presentation
migration: existing editor placeholders and unimplemented editing commands are not turned
into new CAD functionality by being docked.

The workspace toolbar provides layout undo/redo, reset, theme selection and JSON import/export.
Reset changes layout only, not drawing data, tree filters, loaded file tabs or editing records.
Layouts are saved separately for parser and editor, using these versioned local-storage keys:

```
dxfparser.dockyard.parser.v1
dxfparser.dockyard.editor.v1
```

Browser storage can be blocked or full. The workspace stays usable and displays a persistence
error instead of failing to initialize. Keep an exported layout for portability. Workspace files
contain layout metadata, not DXF documents; use the existing drawing/app-state exports for data.

Dockyard supports F6/Shift+F6 pane navigation, focused splitter arrow-key resizing, tab-strip
navigation, Shift+F10 context menus and Ctrl+F4 closing. Text input keeps its native editing
behavior. Toolbar layout undo/redo is separate from application editing operations.

## Migrated content

The parser registers 28 stable content IDs:

| IDs | Content |
| --- | --- |
| `commands`, `tools` | Existing main commands/navigation and analysis launcher. |
| `tree-left`, `tree-right`, `rendering` | Comparison tree documents and the actual rendered drawing. |
| `render-info`, `render-layers`, `render-blocks`, `render-properties`, `render-controls` | Independently dockable rendering tools, including view, selection and measurement commands. |
| `filtersOverlayLeft`, `filtersOverlayRight` | Independent modeless filters; both may stay open while comparing. |
| `cloudOverlay`, `statsOverlay`, `depsOverlay` | Cloud data, statistics and dependencies. |
| `hexViewerOverlay`, `binaryObjectsOverlay`, `handleMapOverlay`, `proxyObjectsOverlay` | Binary/handle/proxy inspection. |
| `fontsOverlay`, `classesOverlay`, `objectSizeOverlay` | Font, class and size reports. |
| `diagnosticsOverlay`, `ruleConfigOverlay` | Diagnostics and independently extracted rule configuration. |
| `blocksOverlay`, `lineTypesOverlay`, `textsOverlay`, `batchProcessingOverlay` | Block/insert, line-type, text and batch-process tools. |

Report dialogs first open as in-page floating tools and can then be docked anywhere. Their
original inputs, tables, callbacks and state are retained. Filters no longer dismiss on an
outside click or compete with Dockyard's dragging. The old rendering overlay is now a document;
its controls no longer overlap the canvas when the viewport is small.

The editor registers `ribbon`, `explorer`, `viewport`, `inspector`, `status` and `command-palette`.
Its palette remains connected to the real command dispatcher, search field and keyboard shortcut.

## Architecture and lifecycle

`components/docking-workspace.js` owns one manager, a stable-ID content registry, layout persistence,
validation, toolbar and resize scheduling. `docking-parser.js` and `docking-editor.js` adapt the two
applications. `docking.css` only overrides application presentation within these hosts; the vendored
Dockyard implementation is unmodified.

Each registry entry owns exactly one existing HTMLElement. No canvas, form, tree or editor is
cloned to move it. Initially unseen content is placed in an attached, hidden parking container;
Dockyard also retains materialized content when tabs become inactive. Existing `getElementById`
calls continue to work even for a hidden report. Layout import/history can recreate model wrappers,
so callbacks resolve current models by `ContentId` rather than capturing stale model instances.

Visibility bridges reconcile legacy `display`/`hidden` requests with the real layout. Layout-driven
closures call application cleanup where needed, notably rendering-controller shutdown and palette
focus restoration. Repeated launcher clicks activate existing panels rather than creating duplicates.
The nested diagnostic rules dialog is registered independently, not left inside a hidden diagnostics
parent. Native browser alert/confirm/prompt/file pickers remain browser primitives, not fake dock tabs.

ResizeObserver notifications are coalesced into animation frames. Tree virtualization is refreshed
when its retained container changes size. Narrow tree panes retain a readable Data column and
scroll horizontally with a synchronized header rather than collapsing that column to zero. Hidden canvases are not reallocated. A visible rendering
resize updates backing pixels using device-pixel ratio and redraws the scene while preserving camera
state; Canvas2D would otherwise remain cleared after a backing-store resize. The controller changes
are also included in the regenerated `dist/dxf-rendering.global.js`.

`Workspace.dispose()` removes adapter listeners, observers, scheduled work, manager subscriptions and
view chrome. Application-owned nodes are parked, not destroyed. It does not dispose the host App's
own persistence timers or renderer; that remains the application's lifecycle responsibility.

## Persistence and trust boundary

The JSON envelope uses `format: "dxfparser-dockyard-workspace"`, `version: 1`, application workspace
ID, preset, theme and Dockyard's versioned JSON layout. Import rejects the wrong application/version,
malformed JSON, input above 1 MiB, invalid model types and invalid Dockyard trees. Parsing is limited
to 512 nodes and depth 32. Only known content IDs rebind to existing nodes; unknown content is discarded.
Application capabilities are reimposed, including the nonclosable primary tree/viewport. Serialized
layout properties cannot replace content with arbitrary markup or scripts. No drawing source, tree
data or command implementations are serialized into layouts.

Floating bounds are constrained to the current host on restoration and viewport changes. In-page
floating is supported. The browser-pop-out menu entry is deliberately excluded because these legacy
controllers access the owning document directly. This migration does not claim safe cross-browser-window
content ownership or cross-manager pointer dragging.

## Dependency and reproducibility

Dockyard's classic distribution, CSS, MIT license and notices are vendored in `vendor/dockyard`,
pinned to upstream commit `7b2b56b281ccf71555c21a1bef4bdf38df67e034`.
`UPSTREAM.txt` records provenance; `SHA256SUMS` records the unmodified bytes. No npm install, bundler
or CDN is needed for docking. The application's existing JSZip/XLSX CDN references are unchanged.

Serve the repository with any static server:

```sh
python -m http.server 8080
# Parser: http://localhost:8080/
# Editor: http://localhost:8080/editor/
```

## Verification

```sh
python -m pip install -r tests/requirements-browser.txt
python -m playwright install --with-deps chromium
python tests/docking-workspace.py

# Existing suite, without suppressing any historical failures:
bash tests/run-all.sh

# Base-aware regression gate (supply a checkout of the target/base commit):
python tests/check-docking-regressions.py --baseline /path/to/base-checkout
```

The 18 browser groups exercise both real applications: connected/unique retained nodes, DXF file
inputs, right-pane toggling, all report launchers, nested rules, simultaneous filters, reactivation,
pointer floating/resizing, dock-back, auto-hide/pinning, keyboard splitters, layout undo/redo, canvas
pixel redraws, layer controls, properties accessibility, import validation, persistence/reload,
corrupt-layout recovery, presets, compact layouts, editor palette/data retention, disposal and recovery
menus. Screenshots and Chromium version are saved under `test-results/docking` and uploaded by CI.

For a browser environment that forbids all navigation, `--injected` runs the same groups against
injected local source files with an in-memory Storage substitute. This is explicitly not HTTP or
real browser-storage verification. CI always uses the normal served application.

The untouched baseline had two SVG mismatches in `rendering-parity.js`: `advanced-geometry` and
`dimension-parity`. The other 11 existing groups passed. The new regression gate tolerates those
specific failures only when the base commit reproduces exactly the same output and **every captured
SVG/JSON frame is byte-identical**. A new failure, changed frame, different failure set or exception
fails CI. No rendering baselines were silently regenerated to make the migration pass.

Manual release checks remain useful on representative touch devices and assistive technologies.
Browser-native dialogs, blocked optional CDNs, actual remote cloud-data access and full screen-reader
certification are not covered by this docking regression suite.
