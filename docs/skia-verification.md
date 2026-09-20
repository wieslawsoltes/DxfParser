# Local Skia renderer qualification

The following were executed against the new source and native SkiaSharpWeb runtime,
not mocked graphics or the removed rendering engine. All recorded processes returned
zero. These are **local results, not a GitHub Actions or merge result**.

| Suite | Passing tests |
| --- | ---: |
| Node geometry and native Skia | 75 |
| Native CAD browser | 16 |
| Dockyard browser | 18 |
| Ribbon/document browser | 31 |
| GridWeb/RichTextWeb browser | 20 |
| Analysis workbench browser | 26 |
| **Total** | **186** |

The 75 Node cases consist of 59 analytical/compiler/binary-resource tests and 16
actual native-WASM pixel/resource/export tests. The 111 browser cases ran over
normal HTTP with real modules, file inputs and browser storage. No test in the
recorded run was skipped. The font test used an installed system font; those font
bytes are not included in any delivered artifact.

Additional checks passed for the installed npm tarball, Node CJS/ESM constructor
identity, standalone ESM, strict TypeScript consumers, a native PNG drawn from the
installed package, deterministic bundles, all vendor checksums and absence of old
renderer modules and bundled font files.

Environment: Node v22.16.0, TypeScript 5.8.3, Python 3.13.5,
Chromium 143.0.7499.4. Native browser fallback selected **Skia raster canvas
presentation**. This does not qualify physical WebGPU/WebGL devices.

The compatibility contract deliberately records missing or approximate behavior,
including ACIS/proprietary entities, full materials/3D visibility, arbitrary rich
MTEXT, complete dimensions/linetypes, non-normal hatch islands and gradients.

The prior SVG snapshots belonged to the deleted engine. Their two known failures
are not waived here, nor claimed to be unchanged; those internal-API tests were
retired and replaced by the new geometry/native-pixel gate. Historical reference
files are labeled and not executed as acceptance tests.

Machine-readable results, exact base/dependency identity and log hashes are in
[verification/skia-renderer.json](verification/skia-renderer.json). The downloadable
evidence archive includes the corresponding logs and real browser/native outputs.
