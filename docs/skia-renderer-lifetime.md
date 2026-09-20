# Skia renderer 0.2.1 — export and recovery lifetime audit

This follow-up builds on the directly committed 0.2.0 unsigned WASM/WebGPU bridge
fix, checked GPU submission and bounded backend recovery. It does not replace that
fix with argument clamping or disable WebGPU. The vendor runtime/WASM is unchanged
from 0.2.0; all its patch provenance/checksum checks remain enforced.

## Reproduced problems

The 0.2.0 host waited for presentation before starting PNG export, but the resulting
asynchronous snapshot was outside its presentation/disposal lifetime. A resize,
backend switch, disposal or another export could overlap that native readback.
A same-size camera redraw did not change `generation`, so an export could return
an earlier drawing without detecting the new request. A second race existed
between `whenIdle()` resolution and export's continuation: a frame queued in that
gap could be associated with pixels from the previous frame.

An explicit backend retry clears the failed-backend set. An older in-flight flush
could subsequently reject and quarantine the freshly retried backend. Throwing
canvas-replacement notifications were also treated as graphics failures.

Seven of the initial eight new controlled regressions failed against the original
0.2.0 source. The separate presentation/export-await-gap regression reproduced the
wrong-frame capture during review. Native objects in these controlled tests are
mocked to deterministically order promises; they do not stand in for GPU tests.

## Implementation

`SurfaceHost.surfaceOperation()` orders drawing/flush, snapshot/encode and retirement
in a FIFO stored in a WeakMap keyed by the native surface. A rejected operation
settles its queue tail so later operations do not deadlock. Retirement remains
idempotent and joins the entire transaction, including native image/data disposal.
Frames coalesce while readback runs, and a queued stale frame is checked again
before entering native drawing. The latest valid request is subsequently presented.

PNG capture rechecks presentation after its await, stamps both request ID and
backend generation, and validates before/after native readback. Changed drawings
reject with `Drawing changed while exporting.`; PNG encoding failures release the
native image. Queued invalidated exports do not call SnapshotAsync. Readback-only
failures do not quarantine working backends. `dispose()` joins active native work.

A rejected flush from a retired generation only retires that old surface. Its
error cannot mutate the new retry cycle. Genuine device-loss notifications retain
the existing bounded recovery policy. Canvas-replacement callback exceptions are
recorded separately in `callbackError`, just like paint callback failures.

## Required verification

- 141 analytical/native/ABI/recovery tests, including 24 deterministic lifetime
  cases (12 new in this release).
- 11 required native GPU integration cases (four new): Graphite readback versus
  resize, concurrent native PNG exports, Ganesh readback versus disposal, and
  retry while an old submission rejects. The new tests gate asynchronous scheduling
  but still invoke the real native snapshot/flush and actual WebGPU/WebGL APIs.
- 114 retained application browser tests: 19 CAD, 18 Dockyard, 31 Ribbon/document,
  20 Office/GridWeb, and 26 analysis-workbench cases.
- Deterministic app/CJS/ESM/global bundles, packed consumers and TypeScript
  declarations, all vendor hashes, and no reintroduced legacy engine/font files.

The permanent `Native Skia DXF renderer` CI workflow runs the complete gate. GPU
cases require the actual Graphite/WebGPU or Ganesh/WebGL mode on SwiftShader;
unavailable adapters fail rather than skip or count raster as GPU success.
Software-adapter success is not physical Mac/Windows/Linux driver certification.

The export policy deliberately fails rather than silently delivering a superseded
frame. Callers should await/handle the export promise and retry after the drawing
settles. A hung native promise has no host watchdog; geometry, rich text, proprietary
entities and plotting boundaries remain in the [compatibility contract](../packages/dxf-skia/COMPATIBILITY.md).
