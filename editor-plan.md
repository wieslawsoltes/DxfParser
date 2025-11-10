# Standalone Editor App Plan

## Phase 1: Project Skeleton and Shared Core
- [x] 1.1 Create `editor/` sub-folder with `index.html`, `styles.css`, and `main.js` that mirrors the current app's asset layout but without build tooling.
- [x] 1.2 Ensure both apps load the canonical `components/` parsing/rendering scripts directly so changes propagate identically without additional build tooling.
- [x] 1.3 Expose a framework-free bootstrap API (`window.DxfApp`) that wires parser and renderer initialization for vanilla script usage.

## Phase 2: UI Layout and Ribbon Controls
- [x] 2.1 Implement AutoCAD-style ribbon markup in `editor/index.html`, including primary tabs (Home, View, Annotate) and contextual panels.
- [x] 2.2 Add ribbon interaction wiring in `editor/main.js` that forwards commands (zoom, pan, layer toggles) to the shared renderer.
  - [x] Hook Draw/Modify tool buttons with event dispatch stubs so future editing APIs can attach (line/polyline/circle, move/rotate/scale workflows).
- [x] 2.3 Build status bar and command palette widgets with plain HTML/CSS, reusing existing event handlers where possible.
  - [x] Surface command feedback and cursor hints in the status bar.
  - [x] Provide quick command launcher palette with keyboard focus support.
  - [x] Expose renderer state (active layer, snap mode, view info) in status widgets.
  - [x] Wire upcoming editing API via `DxfEditorApp.addCommandListener` to activate Draw/Modify workflows.
  - [x] Replace placeholder layer/snap summaries once renderer exposes live metadata.
- [x] 2.4 Align ribbon structure with the AutoCAD Web layout (group ordering, collapsed sections, iconography parity).

## Phase 3: Editing and Persistence Features
- [ ] 3.1 Enable entity editing tools (select, move, rotate, delete) via shared renderer state while keeping DOM-only controls.
  - [ ] Register project-specific editing engine via `DxfEditorApp.registerEditingApi` (default dispatcher lives in `editor/editing-adapter.js`).
  - [ ] Feed editing results back into the scene graph and refresh overlays/status automatically.
  - [x] Replace default dispatcher stub with first interactive tools (Line, Move) wired to overlay selection helpers.
  - [x] Sync command cancellation/edit completion signals with ribbon button disabled states to avoid double activation.
- [ ] 3.2 Implement DXF import/export flows in `editor/main.js`, supporting drag-and-drop and file picker inputs.
  - [x] DXF open/drag-drop → shared parser/render pipeline.
  - [x] Save/export edited geometry (round-trip to DXF using serialized scene graph state).
  - [x] Integrate serializer built on parsed DXF tree so Save produces usable drawings (prep for “Save As” variations).
  - [x] Disable save/export ribbon commands until a document is active; surface tooltip status messaging.
- [ ] 3.3 Persist user settings (recent files, UI layout) with `localStorage`, ensuring graceful fallback when unavailable.
  - [ ] Remember last-open document metadata.
  - [x] Restore last-used ribbon tab state on load.
  - [x] Cache command palette history and view toggle preferences.
- [x] 3.4 Connect DXF open/render pipeline to shared parser/renderer (wire file pickers, render-first-load, status feedback).
  - [ ] Surface layer manager affordances (overlay selectors, freeze/isolation toggles, layer stats in status bar).
  - [ ] Expose snap/grid/UCS toggles in UI and mirror state back to renderer snapshots.
  - [ ] Audit ribbon command wiring for missing overlay integrations (pan/orbit step sizing, zoom window placeholder).

## Phase 4: Validation and Documentation
- [ ] 4.1 Manually verify rendering and editing parity between existing app and the new editor across supported browsers.
- [ ] 4.2 Capture performance metrics (initial load, first paint, edit latency) and record results in `docs/editor-app.md`.
- [ ] 4.3 Update repository documentation (README and relevant guides) to explain dual-app setup and shared module usage.

## Immediate Next Actions
- [x] Stand up first real editing workflow (Line tool) using dispatcher hooks and record real mutations.
- [x] Implement DXF serializer hook so Save command exports usable drawings.
- [x] Persist ribbon, palette, and view toggle state across reload.
- [x] Rework ribbon layout and collapse behaviour to mirror AutoCAD’s fixed-height horizontal command groups.
- [ ] Flesh out layer manager integration so ribbon Layer commands reflect actual overlay behavior.
- [ ] Track last-open document metadata for quick reload and recent file list groundwork.
