# DxfSkia 0.3.0 — native-vector performance and byte-aware DXF input

Baseline: `1342c38a5fb7f1a0944c37fb989bf3cba52b2ebc` (0.2.1).
The rendering backend remains SkiaSharpWeb, including native Graphite/WebGPU.
The vendored JavaScript, WASM, unsigned ABI corrections, checked GPU submission,
and per-surface snapshot/disposal FIFO are unchanged.

## Removing repeated work without reducing quality

### Camera, selection and spatial indexing

The retained scene owns exact bounds and a projection-local bounding-volume
hierarchy. A new camera frame queries this index for visibility but no longer
transforms every tessellated vertex into screen coordinates or allocates every
selection descriptor. Projected tessellation, pick descriptors and screen points
are materialized lazily. Point selection queries a small neighborhood and retains
reverse drawing order; object snaps query both geometry and an independent center
index, so an arc's center remains reachable outside its actual curve bounds.
Existing `frame.pickables` consumers still receive an array on first access.
`frame.interactionStats` exposes actual descriptor and screen-point work.

The BVH partitions a single private array around median centroids, instead of
sorting and copying both children at every level. A bounded partition fallback
handles degenerate input. Caller array order is unchanged. Drawing candidates are
still sorted by the original entity order. This is not an O(n) construction claim.

### Native paths and clipping

The default native path cache holds up to 32,768 entries, with an additional
32 MiB accounting budget. The current visible working set is protected during a
draw pass. An over-budget scene retains a subset and disposes temporary misses,
rather than cyclically evicting every path on every frame. Eviction and clear
explicitly dispose native objects. Paths keep the same float rebasing, conics,
curve flattening tolerances, anti-aliasing, stroke widths, fill rules and order.

Repeated hatch/viewport/INSERT clip objects share one screen-space native path
within a frame. The conversion and clip anti-aliasing are unchanged, and these
paths are disposed when the frame finishes. This does not merge drawing paths or
change overlapping alpha/stroke compositing.

### Typography

ResourceStore retains at most 64 native font/shaper sessions and 4,096 width
measurements, further bounded to one million stored characters. Successful resource
replacement/removal clears these caches. Failed replacement preserves the valid
resource and its cached state. The existing `createFont()` still returns a
caller-owned object; renderer sessions are internal borrowed objects.

Each text primitive is shaped once into a bounded native `SKPicture` recording.
Its glyph positions, font, masks and draw order are retained in text-local
coordinates. Camera updates replay that vector recording under the same native
matrix; there is no bitmap text cache, downsampling, quality mode or disabled
anti-aliasing. Selection has its own recording. The fallback stroke recording
includes its scale-dependent stroke width in the key. Native glyph bounds include
accents and overhangs in the recording cull rectangle.

Text recordings are limited to 1,024 entries and a 16 MiB accounting budget.
Resource revisions and a new compiled scene invalidate them. Cold shaping and
recording cost remains, and over-budget text is drawn with temporary recordings.

Path accounting estimates native/vector data as `128 + 64 * commandCount`.
Text accounting uses `SKPicture.ApproximateBytesUsed` plus a conservative string
allowance. These are bounded cache admission estimates, **not a measurement or
hard upper bound on all native allocator/GPU/font memory**. Skia has independent
GPU and glyph caches. Performance tests assert object lifetime and admission
counts, not a universal memory-consumption guarantee.

### DXF records and compilation

Text scanning now walks source offsets, supporting LF, CRLF and CR without a
whole-file line array. DxfDocument consumes records as the scanner yields them,
avoiding a second complete tag collection. Large records have a first-value index
for repeated property lookup; repeated-group order and `.all()` remain intact.
SORTENTSTABLE discovery and per-list draw ordering are reused across repeated
block instances. Geometry compilation itself remains synchronous and retains the
same vertex/primitive limits and tolerance policies.

Treat documents and compiled scenes as immutable render snapshots. Rebuild them
when editing source. Low-level consumers that mutate `record.tags` must call
`invalidateTagIndex()` before indexed reads; that alone does not rebuild derived
record fields, document tables, scenes or rendering caches. The application already
creates a fresh renderer document/scene after a tree mutation.

## Byte-aware input

`DxfDocument` now accepts `ArrayBuffer` and typed-array/DataView slices in addition
to strings and ordered tags. Subarray offsets and lengths are respected.
`decodeDxf()` exposes format, encoding, version and either text or ordered tags.
`dxfText()` supplies decoded/canonical text to the original application's tree parser.

Supported input paths:

* Text DXF: UTF-8 for AC1021 and later, declared legacy Windows/codepage encodings,
  and UTF-8/UTF-16 BOMs. An explicit encoding or `decodeString` callback takes
  precedence. Unknown or unavailable codepages fail rather than inventing text.
* Binary DXF: modern two-byte group codes and R12 single-byte/255-escaped codes,
  the complete 22-byte sentinel, little-endian numeric groups, byte booleans,
  zero-terminated strings, and length-prefixed binary chunks. 64-bit integers
  remain exact decimal strings; numeric conversion is explicit. Codes 280–289
  remain 16-bit values, unlike byte boolean codes 290–299.
* Framing, missing terminators, truncated payloads, invalid booleans, nonfinite
  numbers, reserved group types and trailing binary data are checked. Binary tags
  retain byte offsets; canonical tree navigation uses synthesized text line numbers.

Byte decoding defaults to 128 MiB and four million tags. Text parsing retains its
64 MiB **code-unit** `maxBytes` compatibility setting. Strict encoding is the default;
`fatalEncoding:false` explicitly permits replacement characters. A binary string
containing a literal newline is valid for direct renderer byte input but cannot be
faithfully represented in the line-based tree, so `dxfText()` rejects it explicitly.
No DWG parsing, arbitrary codepage guessing or implicit external resource loading
is added.

Parser open, streamed file input, batch reading and standalone-editor open use the
same decoder. Streamed input buffers bounded byte chunks before decoding; it is
**not** a worker, incremental geometry compiler or constant-memory file reader.
The renderer library can consume binary ordered tags directly; the application
keeps canonical text to preserve its existing tree editing/export/navigation model.

## Verification and reproducible measurements

```
python tests/check-docking-regressions.py
node scripts/benchmark-skia.mjs .performance-reference
xvfb-run -a python tests/skia-gpu.py
xvfb-run -a python tests/skia-performance-gpu.py
python tests/skia-workspace.py
python tests/docking-workspace.py
python tests/ribbon-workspace.py
python tests/gridweb-previews.py
python tests/analysis-views.py
```

`.performance-reference` is a read-only checkout of the exact baseline commit,
not an arbitrary current branch. The benchmark loads both libraries independently
with the same Skia runtime and local system font. No font binaries are committed.
Reports go to `test-results/skia-performance/` and CI uploads them as evidence.

The Node benchmark compares native RGBA output for mixed text/geometry/masks,
rotation, selection, mirrored typography and schematic fallback. The GPU suite
independently compares native **Graphite/WebGPU** output, then measures 5,000 curves
and 64 native text labels through real drawing, flush and readback. The GPU workload
also compares warm-frame pixels and verifies retained native object reuse. Local
CPU timings use 80 labels. Timings are descriptive medians, not unstable wall-time
pass/fail thresholds or guarantees for other drawings/devices.

The acceptance criteria are unchanged pixels on the tested same-backend fixtures,
no lowered rendering quality settings, bounded native object ownership and
retained application behavior. Cross-backend raster-vs-GPU equality, exhaustive
AutoCAD parity and physical hardware qualification are not claimed. The required
GPU tests use actual browser APIs and Graphite on SwiftShader; they fail if that
pipeline is unavailable instead of treating raster fallback as success.

## Format references

Autodesk's DXF reference, Binary DXF and Group Code Value Types chapters:
https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-FC1C3C69-DBC2-49E4-893A-000D6538C0FE.htm
https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-2553CF98-44F6-4828-82DD-FE3BC7448113.htm

Interoperability cross-check: ezdxf's binary loader and numeric type definitions,
`src/ezdxf/lldxf/tagger.py` and `types.py` in https://github.com/mozman/ezdxf.
The implementation here is JavaScript and does not copy the Python loader.

## Import failure regression qualification

The first qualification run passed native-pixel equivalence, both GPU suites and
all 169 analytical/native tests, but the malformed-input browser test timed out.
Its `page.evaluate` expression ended in assigning an alert function; Playwright
invoked that function, creating an extra undefined notification before the import.
The corrected check observes the actual browser dialog without replacing alert.
Direct and streamed inputs now require one actionable filename/decoder error and
preservation of the original document, native scene, resources and canvas. A
truncated binary file must also leave the file input ready for a successful retry.
Streamed parsing includes the decoder detail instead of a generic error message.
These checks do not skip malformed input or relax the strict decoder.
