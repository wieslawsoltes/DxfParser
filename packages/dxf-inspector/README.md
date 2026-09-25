# @wieslawsoltes/dxf-inspector

Source-level DXF inspection: text-to-tree parsing, structural diff alignment,
diagnostic rules, and binary payload inspection utilities. This is the original
workbench source model, now independent of the DOM and application startup.

```js
import { DxfParser, TreeDiffEngine, DXFDiagnosticsEngine } from '@wieslawsoltes/dxf-inspector';

const parser = new DxfParser();
const current = parser.parse(currentDxfText);
const reference = parser.parse(referenceDxfText);
const difference = TreeDiffEngine.computeDiff(current, reference, {
    ignoreHandles: true,
    respectExpanded: false
});
const report = await new DXFDiagnosticsEngine(current, 'current.dxf')
    .runFullDiagnostics((percent, step) => console.log(percent, step));
```

`DxfParser` also exposes group-pair parsing, iterative node lookup and source-tree
serialization. Parsed node IDs are local to a parse; do not use them as persistent
or cross-document identities. Structural comparison returns aligned row indices
and per-row/per-cell classifications. It is different from the rendered-object
comparison in `@wieslawsoltes/dxf-compare`.

The utility exports are `hexStringToByteArray`, `hexDump`, `detectHeader`, and
`isHandleCode`. The hex utility preserves the workbench's permissive decoding;
validate untrusted payload syntax separately when strict validation is required.

## Boundaries

Input is DXF **text**, not DWG or binary DXF. Use the renderer package's decoder
before parsing binary input. Rules preserve the existing diagnostic heuristics;
they are not a complete validator for every DXF release. Create a new diagnostics
engine for each run. Importing the package never reads storage, registers browser
listeners, creates a workbench, or installs global constructors.

## Packaging

ES modules are the canonical sources. Native browser imports need no build or
repository-global bootstrap. Node.js **22.13 or later** also supports `require()`
through the package's synchronous ESM facade, sharing the same exported objects
as `import`. No generated distribution, install script, or bundled font is needed.
The package has no install-time dependencies; host APIs are injected explicitly.

Run `npm pack ./packages/dxf-inspector` from the repository root to create a local tarball.
Packing does not publish to npm. Public exports and TypeScript declarations are
included. Tests and app adapters are not shipped.

## License

[MIT](LICENSE). Host-supplied libraries retain their own licenses.
