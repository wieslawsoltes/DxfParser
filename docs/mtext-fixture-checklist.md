# MTEXT Regression Fixture Checklist

> Status: _capturing sample DXF files is blocked until MTEXT-rich drawings are available._

To complete Phase MT4 of the MTEXT Rendering & Parsing Parity Plan we still need real-world DXF inputs that exercise every formatting feature.  Capture or request drawings that cover the following scenarios, then drop them into `tests/data/` (or a dedicated `tests/data/mtext/` subfolder):

| Fixture | Focus | Notes |
| --- | --- | --- |
| `mtext_basic.dxf` | Single column text with mixed bold/italic, underline, stacked fractions | Confirms baseline parsing + stacked fraction layout |
| `mtext_columns.dxf` | Two and three column MTEXT entities (group codes 75–84, 170–179) | Validates column layouts, flow options, background offsets |
| `mtext_vertical.dxf` | Vertical writing modes (drawing direction 1/3) | Ensures layout + canvas vertical rendering |
| `mtext_masks.dxf` | Background mask variations (true color, ACI, transparency) | Verifies mask colour + alpha propagation |
| `mtext_lists_tabs.dxf` | Numbered/bulleted lists, tab stops (`\li`, `\ln`, `\tc`, `\ta`, `\ts`) | Needed for upcoming paragraph alignment work |
| `mtext_fields.dxf` | Embedded fields (`\AcVar`, `\f`, diesel expressions) | Currently parsed but not evaluated—captures raw metadata for diagnostics |

For each fixture:

1. Export a DXF 2018 version directly from AutoCAD/TrueView to avoid down-level group code loss.
2. Record a reference render (PNG and/or SVG) from AutoCAD TrueView for visual parity comparisons.
3. Update `tests/check-mtext.js` or a new parity script to load the DXF via `RenderingDocumentBuilder`, assert MTEXT metadata, and optionally verify rendered bounds.
4. Register the fixture in `tests/rendering-parity.js` once the parity pipeline supports rich text diffing.

_When fixtures become available, Phase MT4 tasks and the corresponding roadmap checkboxes in `docs/dxf-rendering-plan.md` can be marked complete._
