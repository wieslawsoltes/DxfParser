# DXF render comparison

Factory API shared by Node and the browser workbench. Pass the **same DxfSkia API instance** that creates your documents; no native GPU/DOM dependency is required by the comparison or import engine.

```js
const DxfSkia = require('@wieslawsoltes/dxf-skia');
const compare = require('@wieslawsoltes/dxf-compare')(DxfSkia);
const current = new DxfSkia.SceneCompiler(new DxfSkia.DxfDocument(currentText)).compile('Model');
const session = new compare.Session(new DxfSkia.DxfDocument(referenceText));
const combinedNativeScene = session.scene(current);
console.log(compare.report(session.result));
const transaction = compare.importObjects(currentText, referenceText,
    [session.result.referenceOnly[0].id]); // new text/document; never mutates input
```

## Semantics

Comparison units are visible root objects, not primitive counts or DXF handles. INSERT/MINSERT, dimensions and other compound objects retain their root identity while their compiled child geometry, clipping and resolved appearance participate in comparison. Exact signature matching uses multisets: duplicates do not disappear. Handles only suggest modified-object correspondence after geometric matching. Continuous line direction is normalized. Internal primitive order is preserved; different entity decompositions and alternative spline parameterizations are not guaranteed equivalent.

Precision is an integer 0–14 (default 6), implemented as decimal rounding of rendered coordinates and numeric properties, not a distance-radius search. Property bits are color 1, layer 2, linetype 4, linetype scale 8, lineweight 16, transparency 32 and thickness 64. This workbench defaults to **127**, intentionally comparing appearance properties; Autodesk documents a default COMPAREPROPS of 0. Geometrically extruded thickness still changes visible geometry even when property comparison is off.

Settings include text/hatch exclusion, category visibility, four colors, common opacity, reference/current draw order, cloud margin in drawing units, and local/combined native revision clouds. A session caches its composed scene across camera-only frames. A common selected layout is required. Layer visibility follows each document and the current renderer's shared layer overrides; current handle isolation is not applied to reference handles.

`snapshot`/`readSnapshot` store both exact source strings, settings and layout in a versioned JSON container. `report` produces a cycle-free change ledger. The snapshot is **not a DWG/DXF snapshot drawing**. Native PNG/PDF exports include the composed scene; comparison PDF exports preserve displayed categories instead of recompiling the current file alone.

## Import boundary

`importObjects` is non-deleting, model-space only and stages all changes before returning. It imports whole eligible reference objects, ordered POLYLINE/INSERT child sequences, recursive block definitions, supported symbol tables, renamed conflicting symbols, fresh handles and owner references. It updates HANDSEED and table counts, compensates global linetype scale, then verifies that both imported appearance and pre-existing current geometry remain unchanged.

Unresolved graph references, duplicate handles, external-reference blocks, reactors, extension dictionaries, unsupported objects and associative boundary references fail closed. Full dynamic-block, associative database and arbitrary OBJECTS graph transplantation is not claimed. Externally supplied fonts/images remain external resources. Import does not delete or replace current objects.

## Coverage and limits

Only geometry supported by DxfSkia is compared. Unsupported entities and compiler diagnostics are included in the result and prevent a complete-equality claim. Missing-font and native resource notices additionally appear in the workbench's Rendering Diagnostics. Image names/placement are compared, not external image bytes. This is not a pixel-diff engine, DWG reader, complete AutoCAD object database, live Xref filesystem watcher, or certification of AutoCAD parity. Native fallback glyphs do not establish font fidelity.

Autodesk references: [COMPAREPROPS](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-LT-MAC/files/GUID-FC52193A-3801-42D1-B5C3-873B192B36B2.htm), [COMPARETOLERANCE](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-LT-MAC/files/GUID-3131F7C8-7199-4EC5-9892-88C2D2A86F78.htm), [command reference](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-LT-MAC/files/GUID-94041C9F-750A-4131-9347-3714EB96DBB1.htm).
