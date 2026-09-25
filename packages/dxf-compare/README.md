# @wieslawsoltes/dxf-compare

Rendered-object comparison, proximity change sets, revision-cloud geometry,
versioned snapshots/reports, and guarded model-space reference import.

## Usage

Pass the same DxfSkia API instance used to create the source documents:

```js
const DxfSkia = require('@wieslawsoltes/dxf-skia');
const compare = require('@wieslawsoltes/dxf-compare')(DxfSkia);

const current = new DxfSkia.SceneCompiler(
    new DxfSkia.DxfDocument(currentText)
).compile('Model');
const session = new compare.Session(new DxfSkia.DxfDocument(referenceText));
const composed = session.scene(current);
const report = compare.report(session.result);

if (session.result.referenceOnly.length > 0) {
    const transaction = compare.importObjects(
        currentText, referenceText, [session.result.referenceOnly[0].id]
    );
    // Apply the returned staged transaction through the host's source/history owner.
}
```

The factory is also available as the default ESM export. Comparison itself does
not allocate native GPU resources or require a DOM. Build the sibling renderer
before direct Node consumption from a source checkout, or use the package test
script, which builds it automatically.

## Contracts

Comparison units are visible root objects, including compiled child geometry of
compound entities. Matching preserves duplicate-object multiplicity. Handles only
suggest modified-object correspondence after geometric matching. Internal primitive
order is significant; different entity decompositions are not generally equivalent.

Precision is decimal rounding, from 0 to 14 places, not a distance-radius tolerance.
The appearance mask uses color `1`, layer `2`, linetype `4`, linetype scale `8`,
lineweight `16`, transparency `32`, and thickness `64`; the default is `127`.
Geometry/property filters invalidate matching. Display-only settings reuse matches.

`groupChanges` builds change sets from margin-expanded bounds. `rectangleUnion`
returns polygon contours with counterclockwise outer rings and clockwise holes.
Grouping and cloud generation enforce work and output budgets. `report` returns
cycle-free records and exact change-set membership. `snapshot`/`readSnapshot` store
both DXF strings, settings, and layout in JSON, not a DWG/DXF snapshot drawing.

`importObjects` stages a non-deleting model-space import of eligible whole objects
and supported block/symbol dependencies, remaps handles, and checks appearance and
existing geometry before returning. Unsupported object graphs, unresolved references,
external-reference blocks, reactors, and extension dictionaries fail closed.

Only geometry supported by DxfSkia participates. Diagnostics prevent unsupported
content from being reported as complete equality. External image bytes are not
compared. This is not pixel differencing or full AutoCAD compatibility.

## Pack and test

From the repository root:

```sh
npm pack ./packages/dxf-compare
npm test --prefix packages/dxf-compare
```

See the [workbench README](../../README.md) for the current UI, source ownership,
import history, rendering limits, and complete test workflow.
