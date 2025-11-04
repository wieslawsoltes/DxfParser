# DXF Rendering Overlay – Milestone 2 Execution

## Outcome Overview
- Extend DXF parser pipeline to produce typed DXF 2018 entity models enriched with styling, layout, and metadata for rendering.
- Design and bootstrap a scene graph separating model space, paper space, blocks, and viewports with dependency tracking and diff-friendly data structures.
- Implement incremental loading and lazy hydration to minimize overlay startup latency for large drawings.
- Wire observers between parser, StateManager, and overlay controller to propagate document mutations in real time.
- Profile and tune memory usage for the scene graph, establishing guardrails for large assemblies.

---

## Task 2.1 – Parser Enhancements for Rendering Metadata

**Goals**
- Normalize DXF 2018 entities into strongly typed objects encapsulating raw tags plus derived properties (e.g., world transform, extrusion, thickness).
- Preserve references to tables (layers, linetypes, text styles, visual styles) and attach resolved styling to each entity at parse time when possible.
- Emit structured metadata required for rendering (e.g., per-entity color overrides, transparency, plot style flags).

**Plan**
- Introduce `parser/dxf-entity-factory.ts` that maps DXF type strings to constructors returning `RenderableEntity` objects.
- Add lookup stores for layers, linetypes, text styles during SECTION/TABLE parsing; expose getters for later resolution.
- Populate `RenderableEntity` with:
  - `id`, `handle`, `type`, `space` (`model`, `paper`), `blockRef`, `layerId`, `linetypeId`, `color`, `transparency`, `visualStyleId`.
  - Geometry payload (points, curves, meshes) normalized to overlay math primitives.
- Emit events from parser: `parser:entity`, `parser:block`, `parser:tableRecord` to enable streaming consumption by scene graph builder.
- Backfill unit tests / fixtures for representative entity types to ensure metadata accuracy versus raw tags.

**Deliverables**
- Updated `components/dxf-parser.js` (or TypeScript port) with modular architecture.
- New TypeScript definitions in `types/renderable-entity.d.ts`.
- Parser benchmark script to compare throughput pre/post refactor.

---

## Task 2.2 – Scene Graph Schema & Dependency Tracking

**Structure**
- `SceneGraph` composed of:
  - `ModelSpace`, `PaperSpaceCollection`, `BlocksRegistry`.
  - `Viewports` referencing `SceneNode` subsets.
- Nodes typed as `GeometryNode`, `AnnotationNode`, `ReferenceNode`, `ViewportNode`.
- Maintain adjacency lists for dependencies (e.g., INSERT → Block → Entities).

**Data Model**
- Each node includes:
  - `entityId`, `worldMatrix`, `layerState`, `drawOrder`, `visibility`.
  - Cached render key (hash of material/style to assist batching).
  - Dirty flags: `transformDirty`, `styleDirty`, `geometryDirty`.

**Scene Graph Builder**
- New module `rendering/scene-graph/graph-builder.ts` consumes parser events to incrementally assemble graph.
- Use topological insertion for blocks: track unresolved dependencies and complete once referenced block parsed.
- Provide snapshots: `getSnapshot(layoutId)` returning immutable structures, diffable by overlay renderer.

**Diff Strategy**
- Maintain versioned `SceneFrameIndex` storing entity revisions; overlay renderer pulls delta sets (adds/updates/removals).
- Integrate with StateManager for cross-session persistence of viewport/camera state.

---

## Task 2.3 – Incremental Loading & Lazy Hydration

**Initialization Pipeline**
1. Parse header/table sections to build dictionaries (layers, linetypes, text styles) before overlay opens.
2. Kick off entity streaming; push `SceneGraph` updates in batches (e.g., 5k entities per frame) to prevent UI stalls.
3. Prioritize visible layout entities (active model/paper space) before off-screen blocks or frozen layers.

**Lazy Hydration**
- Defer heavy computations (curve tessellation, hatch triangulation) until entity becomes visible in active view.
- Introduce `HydrationQueue` managed by overlay controller; surfaces request hydration when entity enters viewport.
- Cache hydrated results with eviction policy (LRU) based on GPU memory telemetry.

**User Feedback**
- Overlay displays loading indicator with entity counts and current phase (tables, model space, paper space, blocks).
- Provide cancellable operation if user closes overlay during hydration.

---

## Task 2.4 – Observers & Real-Time Updates

**Observation Points**
- StateManager events: layer visibility, freeze/lock, visual style changes, UCS updates.
- Parser-powered updates: ATTDEF/ATTRIB edits, block redefinitions, XREF reloads.
- External actions: measurement overlays, selection highlights (from Milestone 8) feeding back to scene graph.

**Implementation**
- Event bus (`eventing/overlay-events.ts`) centralizes subscriptions; overlay controller registers to sync scene state.
- Scene graph exposes `subscribe(callback)` returning stream of diffs: `SceneDiff = { added: [], updated: [], removed: [] }`.
- Ensure overlay can operate in suspended mode: diffs queued until overlay resumes, then applied in order.

**Testing**
- Simulate property toggles via automated tests verifying that scene graph emits appropriate diffs and overlay surfaces update without full rebuild.
- Include regression tests for block edits ensuring nested INSERT hierarchies refresh correctly.

---

## Task 2.5 – Memory Profiling & Tuning

**Measurements**
- Instrument scene graph builder to record:
  - Entity count per category (geometry, annotation, reference).
  - Memory usage estimates (byte size of geometry arrays, material caches).
  - Hydration cache hit/miss rates.
- Provide developer command (`window.__dxfOverlay.debugScene()`) to dump stats for current document.

**Optimization Strategies**
- Adjustable pruning: collapse off-screen block instances, release hydration caches for frozen layers.
- Configurable thresholds (`maxHydratedEntities`, `maxCachedTextures`) stored in overlay settings.
- Monitor GC pressure; ensure OffscreenCanvas fallback releases contexts when suspended.

**Validation**
- Create benchmark suite with large DXF datasets (e.g., mechanical assembly, architectural plan, civil drawing) to evaluate memory growth.
- Define pass criteria (e.g., overlay stays under 250 MB heap usage for 1M entity drawing) aligning with TrueView parity expectations.

---

## Integration & Next Steps
- Coordinate with Milestone 1 owners to hook scene graph snapshots into overlay renderer prototypes.
- Establish shared TypeScript models between parser, scene graph, and renderer to avoid serialization overhead.
- Prepare developer guide describing streaming pipeline, lazy hydration hooks, and observer integration for future milestones (dimensions, hatches, interaction layers).
