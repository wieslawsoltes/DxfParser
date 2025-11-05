**Parser Review**
- components/dxf-parser.js:314 calls `isHandleCode`, but the helper lives in components/utils.js:82 and is only reachable today because `utils.js` is loaded first. As soon as you package the parser, that implicit global disappears—inline the helper or import it explicitly.  
- components/dxf-parser.js:13 never resets `this.nextId`, so reusing one parser instance yields drifting IDs across parses. Reset the counter at the start of `parse()` (or generate IDs from the local stack) to keep results deterministic for a stand-alone API.  
- components/dxf-parser.js:1 defines `class DxfParser` in script scope without exporting or namespacing it. External consumers must rely on `<script>` order. Wrap it in an ES module (plus an optional UMD shim) and export both the class and pure helpers like `parseDxf(text)`.

**Rendering Review**
- components/rendering-document-builder.js:4, components/rendering-scene-graph.js:4, and components/rendering-renderer.js:3 all mutate `window.DxfRendering` and assume side-effects from sibling files. That namespace coupling blocks tree-shaking/bundlers; convert each module to explicit imports/exports or a factory that wires dependencies.  
- components/rendering-document-builder.js:5 expects `namespace.utils` to be populated by rendering-entities.js. If the load order changes, the builder fails—another blocker for a library build. Push the shared helpers into an import instead.  
- components/rendering-overlay.js:715-869 hardcodes dozens of `document.getElementById(...)` calls tied to today’s app DOM. Without refactoring the overlay to accept a host element (or to generate its own markup), it can’t be reused elsewhere.  
- components/rendering-overlay.js:1033 and components/rendering-overlay.js:5298 reach back into `app` (`updateBlockMetadata`, `handleLinkToHandle`, `toggleBlockHighlight`), so the overlay isn’t self-contained. Expose those hooks as injected callbacks when packaging.  
- components/rendering-text-layout.js:28-110 relies on `document` to create a measuring canvas. That’s fine in-browser but should be optional or injectable so tests/SSR clients don’t crash.

**Standalone Library Plan**
1. Refactor `components/dxf-parser.js` into a self-contained static file: inline the handle helper, reset `nextId` per parse, wrap the class in a UMD factory so it can be consumed as a global or via `require`, and keep it drop-in compatible with the current app (no build step).  
2. Gather the pure rendering pieces (`RenderableEntityFactory`, `RenderingDocumentBuilder`, `SceneGraphBuilder`, `RenderingSurfaceManager`, etc.) into standalone static JS files that expose globals (or simple factories) while keeping today’s load order working—again, no bundler required.  
3. Isolate `RenderingOverlayController` as an optional UI layer that accepts a root element and adapter callbacks instead of depending on global IDs or the `app` instance; ship it as a static file that can be included directly.  
4. Provide optional convenience entry points (e.g. `window.DxfRendering`) assembled via plain `<script>` concatenation so static HTML apps can consume the renderer without a build tool.  
5. Add smoke tests (sample DXF fixtures -> tags -> scene graph -> frame) to make sure the exported static files remain compatible with the existing app before detaching the code.

Next step: start with step 1 by hardening `components/dxf-parser.js` into the standalone static file so you can validate the no-build approach before restructuring the rendering pipeline.
