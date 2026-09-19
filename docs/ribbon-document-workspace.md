# RibbonWeb and independently dockable DXF documents

This change replaces the parser's top toolbar, Commands & Navigation panel, Analysis Tools
panel and View & Measurement panel with the actual RibbonWeb component. The standalone
editor also uses RibbonWeb instead of its previous HTML ribbon. Dockyard still owns
all document and tool-window geometry; GridWeb and RichTextWeb continue rendering their
existing reports and Office previews. The DXF trees still use `TreeDataGrid`, not GridWeb.

## Command organization

| Tab / surface | Commands |
| --- | --- |
| Home | Open/new/download DXF, Office previews, row editing, Excel export, handle/history navigation, tree expansion/filtering and rendering |
| Analyze | Overview (frequencies, statistics, dependencies), Inspect (handles, binary/proxy data, sizes), Drawing Data (blocks/inserts, line types, texts), Definitions (fonts, classes), Quality (diagnostics, batch processing, rules launcher) |
| Compare (contextual) | Explicit left/right drawing operands, tree diff and change navigation |
| Drawing (contextual) | View orientations/history, zoom/pan/orbit, visual styles, measurement modes and individual rendering panels |
| Selection (contextual) | Selected-object/layer isolation, layer locking and restoration |
| Report Tools (contextual) | Source identity, source drawing activation, explicit refresh, float, dock, auto-hide/pin and close |
| Document Preview (contextual) | Open/download original Office document, zoom and worksheet selection |
| View & Layout | Presets, recoverable Panels menu, open-drawing navigator, layout undo/redo/reset/import/export, theme, classic/simplified ribbon and customization |
| File / backstage | Drawing commands, Office previews, session file load/save/reset, streamed parsing and layout files |
| Quick Access | Open/download and navigation (parser); existing open/save/undo/redo commands (editor) |

Commands use the existing application controllers, with live availability and toggle states.
They are not independent mock implementations. Unimplemented CAD commands in the original
standalone editor remain unimplemented; replacing their presentation does not add geometry tools.
The editor's original command groups are mapped to RibbonWeb, including contextual groups.

RibbonWeb supplies command search, overflow, keyboard navigation/key tips, customization,
minimization and classic/simplified modes. Parser shortcuts include Ctrl+O (open), Ctrl+N
(new), Ctrl+S (download) and Ctrl/Cmd+G (focus handle navigation). The handle field is retained
in a native ribbon slot: changing focus cannot replace the adjacent Go button mid-click.
The ribbon remains outside Dockyard so it cannot accidentally be closed as a tool window.

## Document ownership, not cosmetic tabs

Each parser DXF file is represented by one `LayoutDocument` with a stable `dxf:<tab.id>`
ContentId. Each record has its own retained DOM node, `TreeDataGrid`, scroll container,
header, column widths, expansion/filter/sort state, selection and navigation history.
Tabs can be dragged, reordered, grouped, split, floated and closed independently.
The original nested left/right file tab strips are no longer displayed.

The application maintains **business comparison roles** separately from **visual docking**.
Moving a document from left to right on screen does not reassign its role in the comparison.
Use Compare's operand controls or a document context menu's “Use as left/right comparison”
commands to change that role explicitly. Clicking a document makes it the command target.
The renderer is a retained shared rendering document; Render and the Review/Focus presets
load the active drawing, including a drawing assigned to the right comparison role.

The Compare preset presents both comparison groups. Review presents the open trees alongside
the rendering document and independent rendering inspectors. Focus collects documents into
one group. Applying a preset or importing layout metadata retains all currently open file
records and their real content. Empty-side welcome documents disappear when files are opened.

Inline property edits and actual row/context-menu mutations mark only the affected document
dirty. No-op or stale/foreign selections do not. Closing a modified file asks for confirmation;
downloading it clears the in-app dirty marker but is not a guarantee of filesystem persistence.
Closing removes that file's saved state, rendering cache, grid subscriptions and registry entry.
Layout undo/redo is not file undo: closing a file clears related layout history, and stale layout
imports cannot recreate closed file records. The application also requests a before-unload
confirmation for modified open files; browsers decide how that confirmation is presented.

Tree editing resolves filtered view nodes to their canonical source with a WeakMap, rather
than mutating filtered copies or another file with the same parser-generated node ID. New
edited rows use opaque IDs independent of the parser's resettable counter. “Open” on a subtree
creates an independent snapshot, not an alias through which edits change the source drawing.
Tree context menus capture both record identity and node identity, so virtualized row reuse,
a later document activation, or closing the original document cannot retarget a pending edit.
An edit invalidates cached rendering data; the next rendering command rebuilds from the edited tree.

## Navigation and report lifetimes

Reports bind to the drawing that generated their current data. A visible source caption and
Report Tools make that association explicit. Clicking report actions activates the captured
source before invoking the existing callbacks. Navigating to a handle or row captures the
actual target grid across the next animation frame and reveals/selects it there.

Navigation uses `Workspace.dismissAfterNavigation(id)`:

- A floating in-page dialog is dismissed after navigation / Apply where appropriate.
- A docked, tabbed or auto-hidden tool is not closed by a navigation action.
- Explicit Close/Cancel commands remain explicit operations regardless of docking location.

A report whose source file was closed cannot silently navigate or mutate an unrelated drawing.
Use Report Tools → Refresh from active drawing to intentionally rebind it. A filter dialog's
source remains its original file even if that file is explicitly reassigned to the opposite
comparison role. The left/right IDs of the retained filter forms do not determine data ownership.
Source associations and report data are session-local, not an additional persisted report database.

## Integration and persistence

`components/ribbon-workspace.mjs` imports the pinned RibbonWeb ESM entry and composes controls
around existing controllers. `components/docking-documents.js` owns the dynamic document
registry, comparison aliases, mutations and report-source routing. `docking-parser.js` and
`docking-editor.js` compose the appropriate layouts. `docking-workspace.js` handles bounded
layout serialization, panel recovery and geometry. `ribbon-workspace.css` handles only the host
integration; RibbonWeb supplies its own Shadow DOM appearance and interaction behavior.

Startup order is deliberate: create controllers → mount the registry → restore DXF session
records → deserialize docking geometry against those ContentIds → mount RibbonWeb. Old layout
entries for removed command/tools panels are ignored; open drawing data is not discarded.
App session and layout exports are separate. Layout files never contain executable commands
or drawing bytes. Existing 1 MiB, 512-node, 32-level bounds and model-type validation remain
in force, and failed imports do not partially replace the live workspace.

Dock layouts retain the existing `dxfparser.dockyard.parser.v1` and
`dxfparser.dockyard.editor.v1` keys. Ribbon customization has separate
`dxfparser.ribbon.parser.v1` and `dxfparser.ribbon.editor.v1` keys. Storage failures are reported
without destroying the live workspace. Large drawing sessions can exceed browser storage
quotas; session-file export is the explicit portable data-save mechanism.

Existing buttons and controller-owned input nodes are parked in a connected hidden container
where legacy listeners still find them. This is a compatibility boundary, not a second visible
command UI. The adapter removes its event subscriptions, observers and grids on disposal.
Native browser file pickers/prompts stay native. Floating is in-page; cross-window pop-outs
remain excluded because existing controllers use the owning document.

## Dependency provenance

RibbonWeb is vendored as unmodified ESM JavaScript and declarations at
`wieslawsoltes/RibbonWeb@d4f8f53c038e7b21e5942c8084eae211d3d4e4a1`.
See `vendor/ribbonweb/UPSTREAM.txt`, `LICENSE` and `SHA256SUMS`. There is no new CDN or runtime
npm dependency. Serve both applications over HTTP(S); no build step is needed to run them.
The existing Dockyard, GridWeb, RichTextWeb and compatibility dependencies are unchanged.

## Verification

```sh
python -m pip install -r tests/requirements-browser.txt
python -m playwright install --with-deps chromium
python tests/ribbon-workspace.py
python tests/docking-workspace.py
python tests/gridweb-previews.py
(cd vendor/ribbonweb && sha256sum -c SHA256SUMS)
node scripts/build-rendering-bundle.js
git diff --exit-code -- dist/dxf-rendering.global.js
# Existing regression gate against an independently checked-out base:
python tests/check-docking-regressions.py --baseline /path/to/base-checkout
```

The ribbon suite has **31 browser integration groups**, covering actual RibbonWeb controls,
all analysis launchers, native module startup, keyboard/pickers, independently retained trees,
source-bound navigation, dirty close/cancel, context-menu record identity, filtered-row edits,
subtree isolation, rendering invalidation, role reassignment, presets/import/reload, Office
contexts, the standalone editor, mobile overflow, customization and disposal. Existing **18
docking** and **20 GridWeb/Office** groups run alongside it. Screenshots and browser/environment
metadata are uploaded by the three read-only PR workflows.

`--injected` is an explicitly labeled offline harness for environments where loopback navigation
is blocked. It embeds native module dependencies as data-URL modules without modifying production
assets. It is not HTTP or real-origin storage certification. Normal CI runs without that flag and
loads the real pages, native relative ESM imports and browser localStorage over HTTP.

The existing renderer baseline has two SVG snapshot mismatches (`advanced-geometry` and
`dimension-parity`). The regression gate accepts only those same failures with identical captured
SVG/JSON frames compared to the base, alongside eleven passing existing test groups. This change
does not regenerate expected snapshots or claim to fix unrelated renderer parity.
