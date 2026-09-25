# Multiple native drawing views

The parser workspace can render several open DXF sources simultaneously. Each **Drawing · filename** document is an independent Dockyard document: drag its tab to split, float, redock or rearrange it. File-tree documents and left/right comparison assignments remain independent of rendering placement.

## Open and arrange drawings

Open the source DXF files, then use **CAD View → Drawing Views → Render all drawings**. This opens a native viewport for every source and arranges them side by side. **Tile side by side** and **Tile stacked** arrange currently open rendering views. The **Active drawing** dropdown opens or focuses a particular source; the usual Render drawing action remains available.

The command line exposes `RENDERALL`, `RENDERTILE horizontal`, `RENDERTILE vertical`, and `RENDERDRAWING "filename.dxf"`. A source tab ID can be used instead of a filename when names are duplicated. Names must resolve uniquely. The parser retains at most 32 source-owned rendering contexts; Render all validates the limit before modifying the workspace.

## Ownership and active tools

Each rendered source owns its native surface host, compiled scene, spatial index, camera and navigation history, model/paper layout, selection, layer and object visibility, measurements, diagnostics, local image/font resources, command history, and drawing-comparison controller. Drawing handles are never used as cross-document identifiers. Focus a drawing by clicking its viewport or tab. The ribbon and shared docked tool windows follow that source. Async resource loading and exports remain bound to the drawing that initiated them, even after focus changes.

The Skia runtime initializer is shared; surfaces, native caches and resources are not. Every visible split or floating viewport can present its own frame. Covered, minimized, closed and page-hidden views suspend presentation. Native render scheduling retains the existing per-surface generation guards and serialized readback behavior.

Closing a rendering tab only hides its view. Reopening it preserves the in-memory state and registered resources while its source file remains open. Closing the **source file** disposes that source's viewport, tools, native resources and subscriptions, without disposing neighboring drawings. Closing the last source leaves a usable empty workspace.

## Comparison, refresh and persistence

Each drawing can have a different comparison reference, settings, change selection and import history. Switching focus no longer ends another drawing's comparison. Explicit Compare close ends only the active session. Opening a comparison snapshot creates a new source tab and rendering view, leaving existing sources and sessions untouched. The existing guarded-import and renderer coverage limitations still apply.

Re-ingesting a source updates its own viewport. A valid selected layout and camera are retained; selected handles absent from the new document are removed. Tree edits still require the normal rendering/comparison refresh action; cache invalidation alone does not mean that a file has closed.

Workspace persistence stores view identities, open/closed state, layout selection and cameras alongside the existing Dockyard layout. On reload, contexts are reconstructed only for restored, still-open source tabs. Comparison sessions, measurements, selection, external font/image bytes and native resources are not serialized by this view metadata. Save a comparison snapshot explicitly to retain its sources and settings. LocalStorage availability and the existing source-state size limits still apply.

This feature provides one native viewport per source file in the parser workspace, not multiple independent cameras on the same source. The standalone editor retains its single-file UI. Dockyard floating panels remain within the current browser page; new browser windows are not introduced. Multiple-drawing presentation does not overlay unrelated drawings into one coordinate system.

## Validation

`python tests/multiple-drawings.py` runs the multi-document workflows through normal HTTP loading, Chromium, the real native Skia WASM renderer and Dockyard. It covers simultaneous native surfaces, focus routing, duplicate handles, independent layers/cameras/comparisons, floating and tiled layouts, source closure, reload, resource-read races and export ownership. Run `bash tests/run-all.sh` for the retained renderer, comparison and workspace regression gates. CI/software-GPU results are not physical-device performance certification.
