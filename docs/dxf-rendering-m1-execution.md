# DXF Rendering Overlay – Milestone 1 Execution

## Outcome Overview
- Consolidated UX requirements for invoking the DXF overlay from left and right panes, including keyboard shortcuts, context menus, and persistence rules.
- Defined overlay lifecycle, integration contract, and state diagram to align host panes and overlay controller behavior.
- Evaluated accelerated drawing stacks and selected WebGL2 + PixiJS as the primary renderer with an OffscreenCanvas-backed Canvas2D fallback.
- Produced rendering surface abstraction design with module responsibilities, public interfaces, and dependency guidelines.
- Specified render loop topology, diagnostic instrumentation, and overlay visibility toggles tied into pane controls and application state.

---

## Task 1.1 – UX Requirements for Overlay Entry Points

**Entry Triggers**
- Left pane: toolbar button (“Render DXF”), context menu action on DXF tab, and `Cmd/Ctrl+Shift+R` hotkey when left pane focused.
- Right pane: mirrored toolbar and context menu affordances, plus `Cmd/Ctrl+Alt+R` hotkey when right pane focused.
- Global menu: add `View → DXF Overlay…` to reinforce discoverability.

**Overlay Behavior**
- Overlay opens as modal dialog floating above the pane that invoked it; default docking side inherits from the caller (left/right).
- Supports drag-to-dock on opposite side; overlay remembers last docking preference per pane in `localStorage`.
- Overlay persists across tab switches until closed explicitly; auto-closes when pane tab is closed.

**Context Awareness**
- Overlay initializes with model tied to the active pane’s selected DXF document; cross-pane invocation requires confirmation if document not yet parsed.
- Context ribbon shows source pane, file name, active layout/view, and layer filter summary.
- Provides quick toggle chips for `Model Space` / `Paper Space` and viewport selection consistent with TrueView defaults.

**Accessibility & Input**
- Focus trap within overlay; `Esc` closes overlay, `Ctrl/Cmd+W` closes without affecting pane.
- High-contrast theme support, scalable font-size, screen-reader labels on toolbars.
- Mouse/trackpad gestures (two-finger pan, pinch zoom) align with Autodesk TrueView interactions.

---

## Task 1.2 – Overlay Lifecycle & Integration Contract

**Lifecycle States**
1. *Closed* – overlay DOM unmounted, no render loop.
2. *Initializing* – renderer bootstraps, loads scene graph snapshot, shows progress indicator.
3. *Interactive* – full controls active, render loop running.
4. *Suspended* – overlay hidden but keeps scene warm (pane minimized or background tab).
5. *Disposal* – renderer teardown, event listeners removed, GPU resources released.

**Events & Messaging**
- `overlay:open({ paneId, docId, initialLayout })`
- `overlay:close({ paneId, reason })`
- `overlay:update-context({ docId, layoutId, viewportId })`
- `overlay:toggle-visibility({ paneId, visible })`
- `overlay:request-state` / `overlay:state-snapshot`

**Integration Contract**
- Host pane provides async handlers: `getDxfDocument(docId)`, `getSceneGraphSnapshot(docId)`, and `subscribeToDocEvents(docId, cb)`.
- Overlay exposes imperative API: `setVisibility(Boolean)`, `focus()`, `destroy()`, `attachToPane(paneId)`.
- Shared `OverlayController` mediates state, ensures only one overlay instance per pane, and handles hotkey routing.

**State Management**
- Overlay stores UI state (camera, layer toggles, style presets) via StateManager namespace `overlay:<paneId>:<docId>`.
- Lifecycle hooks integrate with existing persistence (auto-save every 5 seconds) without blocking render loop.

---

## Task 1.3 – Rendering Backend Evaluation & Selection

| Criteria | WebGL2 + PixiJS | WebGL2 + regl | Canvas2D (Offscreen) |
| --- | --- | --- | --- |
| Performance / batching | Excellent batching, texture atlas & instancing out-of-box | Excellent control, requires custom batching | Moderate; CPU bound for heavy scenes |
| API surface | High-level scene graph, filters, text | Low-level functional, minimal abstractions | Immediate mode |
| Feature fit (TrueView parity) | Rich shader support, mesh rendering via PixiJS Mesh, supports WebGL2 extensions | Flexible shaders; more bespoke engineering | Challenging for 3D solids, custom shading costly |
| Ecosystem & maintenance | Active community, TypeScript support, plugin ecosystem | Smaller community, but lightweight | Native browser API, stable |
| Learning curve & team velocity | Moderate, consistent with game/UI dev patterns | Steeper; requires bespoke architecture | Low |
| Fallback strategy | Works with same asset pipeline; degrade features gracefully | Requires separate abstraction | Native fallback |

**Decision**
- Adopt **WebGL2 + PixiJS** as the primary rendering backend to maximize batching, shader flexibility, and developer velocity.
- Provide **Canvas2D + OffscreenCanvas** fallback for browsers without WebGL2 or GPU restrictions; reuse rendering surface abstraction (Task 1.4) to swap backends dynamically.
- Investigate WebGPU once browser support stabilizes; conform abstraction so future upgrade targets minimal changes.

**Action Items**
- Create shared shader module for lineweights, dashed patterns, and Gouraud shading.
- Leverage PixiJS geometries for polyline meshes; extend to support DXF thickness and extrusion vectors.
- Pre-compute texture atlases for linetypes, hatch patterns; reuse across frames.

---

## Task 1.4 – Rendering Surface Abstraction Design

**Module Structure**
- `rendering/overlay-renderer.ts` – orchestrates renderer lifecycle, receives scene updates, and delegates to backend-specific surfaces.
- `rendering/backends/webgl2-surface.ts` – PixiJS-powered implementation.
- `rendering/backends/canvas2d-surface.ts` – OffscreenCanvas fallback.
- `rendering/interfaces.ts` – shared TypeScript interfaces and enums.

**Key Interface**
```ts
export interface RenderSurface {
  attach(canvas: HTMLCanvasElement, opts: SurfaceOptions): Promise<void>;
  resize(dimensions: { width: number; height: number }): void;
  render(frame: SceneFrame, diagnostics: FrameDiagnostics): void;
  suspend(): void;
  resume(): void;
  destroy(): void;
}
```

**Responsibilities**
- Surface handles GPU/context initialization, resource caches (meshes, textures), and draw call sequencing.
- Overlay renderer converts scene graph diffs into `SceneFrame` payloads (batched draw lists, camera matrices, lighting state).
- Strategy pattern: overlay renderer holds two surfaces (`primary`, `fallback`); runtime capability detection selects appropriate surface.
- Observability hook: each surface emits metrics (`contextLost`, `frameTimeMs`, `drawCalls`) forwarded to telemetry module.

**Dependency Guidelines**
- Surfaces depend only on rendering primitives and math utilities; no direct access to application state.
- Use event bus to inform overlay UI about GPU context loss, requiring UI prompt to refresh or switch to fallback.

---

## Task 1.5 – Render Loop, Diagnostics, and Controls

**Render Loop Design**
- Request animation frame driven; throttled to 60 FPS with adaptive downshift to 30 FPS when idle.
- Pipeline:
  1. Poll scene graph diff queue (entity adds/updates/removals).
  2. Rebuild dirty batches (layer change, linetype change, transform updates).
  3. Execute primary surface render with frame payload.
  4. Emit diagnostics event to overlay UI (`frameTime`, `gpuTime`, `entitiesDrawn`).
- Support manual refresh (`Shift+R`) for debugging; highlight diffing status in overlay HUD.

**Visibility & Pane Controls**
- Toggle buttons in pane headers call `OverlayController.setVisibility(paneId, visible)`.
- Hidden overlay transitions to *Suspended* state: render loop stops, but scene graph watchers stay active.
- When overlay is reopened, cached camera state and layer filters reinstate before first frame render.

**Diagnostics**
- On-screen FPS meter (corner overlay) with GPU/CPU breakdown.
- Perf panel accessible via `Ctrl/Cmd+P`: frame history chart, draw call counts, texture memory usage, WebGL extensions status.
- Log slow frames (`frameTime > 25ms`) to telemetry, capturing active document metadata and entity counts.

**Testing Hooks**
- Provide mock render loop when running automated tests: surfaces respond deterministically to fixed scene frames.
- Injectable clock for deterministic replay during regression testing.

---

## Follow-Up & Dependencies
- Coordinate with design to validate overlay layouts and confirm keyboard mappings against accessibility guidelines.
- Begin Milestone 2 by formalizing scene graph schema and hooking overlay controller to DXF parser output.
- Schedule spike to prototype PixiJS lineweight shaders to ensure compliance with TrueView visual fidelity requirements.

