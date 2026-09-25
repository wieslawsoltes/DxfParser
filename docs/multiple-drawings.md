# Multiple native drawing views

The parser workspace can render several open DXF sources simultaneously. Each **Drawing · filename** document is an independent Dockyard document: drag its tab to split, float, redock or rearrange it. File-tree documents and left/right comparison assignments remain independent of rendering placement.

## Open and arrange drawings

Open the source DXF files, then use **CAD View → Drawing Views → Render all drawings**. This opens a native viewport for every source and arranges them side by side. **Tile side by side** and **Tile stacked** arrange currently open rendering views. **Tile grid** builds an aspect-aware grid with equal-size rows and columns (the final row fills its available width). Every tiling action is one undoable Dockyard transaction, preserves the active source and unrelated document/tool content, and redocks floating drawing views. Locked/unmovable drawings reject the entire action before any layout change. The **Active drawing** dropdown opens or focuses a particular source; the usual Render drawing action remains available.

The command line exposes `RENDERALL`, `RENDERTILE horizontal`, `RENDERTILE vertical`, `RENDERTILE grid`, and `RENDERDRAWING "filename.dxf"`. A source tab ID can be used instead of a filename when names are duplicated. Names must resolve uniquely. The parser retains at most 32 source-owned rendering contexts; Render all validates the limit before modifying the workspace.

## Linked navigation

The **Navigation** dropdown defaults to **Independent**. **Linked coordinates** synchronizes the active rendered camera into every visible drawing using the same layout name, without switching layouts or altering any source data. Center, orthographic view direction, view twist and CSS-pixels-per-drawing-unit scale are shared; unequal viewport sizes therefore display different extents around the same center. This assumes compatible drawing coordinates and units: it does not convert `$INSUNITS`, georeference, register or overlay drawings.

**Linked relative view** instead transfers the center offset as fractions of each drawing's projected extents and the zoom factor relative to its own fit-to-view scale. This is useful for proportionally exploring drawings with different origins or sizes; it is not geometric registration. Projection and twist still follow the active camera. Empty/degenerate drawings use finite renderer-consistent fallback extents. Fit ratios follow the rendered scene, including an enabled comparison.

Pan, wheel/pinch zoom, view history, fit, projection and comparison-change navigation all feed the same camera path. Updates are coalesced once per animation frame. Propagated frames cannot feed back into the leader, and repeated follower updates do not append hundreds of local history entries. Focus changes apply the latest queued camera before a new gesture. Hidden/closed views remain suspended and catch up when shown; views with different layout names are skipped. Source scenes, resources, selections, layers and comparison sessions remain independent.

**Match active view** performs a one-time coordinate-camera transfer into compatible visible drawings without enabling a link. Command equivalents are `RENDERLINK off|world|relative`, `RENDERLINK` (report current mode), and `RENDERMATCH`. Turning navigation off cancels queued transfers. Closing the last source clears the linked camera but retains the chosen mode, so the next source starts with its own camera. The mode and each source camera are saved with view metadata; camera-only changes are debounce-saved, and page hiding flushes the existing workspace save path.

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

`node --test tests/drawing-view-tools.test.cjs` checks camera math, coalescing, native pixel equivalence, and layout transaction/rollback behavior without a DOM. `python tests/drawing-navigation.py` exercises linked navigation, grids, undo, resource isolation and reload through the normal browser application.

`python tests/multiple-drawings.py` runs the multi-document workflows through normal HTTP loading, Chromium, the real native Skia WASM renderer and Dockyard. It covers simultaneous native surfaces, focus routing, duplicate handles, independent layers/cameras/comparisons, floating and tiled layouts, source closure, reload, resource-read races and export ownership. Run `bash tests/run-all.sh` for the retained renderer, comparison and workspace regression gates. CI/software-GPU results are not physical-device performance certification.
