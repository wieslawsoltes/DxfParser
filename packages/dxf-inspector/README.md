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

## Report source indexes

`inspectTree({ id, originalTreeData })` builds source-owned object, type, group-code,
handle, incoming-reference and subtree-size indexes without browser dependencies.
`referenceIndex(index)` builds and caches named/handle relationships for that
snapshot, retaining every ambiguous candidate and explicit unresolved endpoints.
The caller must rebuild after changing the source tree. Traversal terminates for
shared/cyclic malformed trees; only first-visit parent edges contribute to subtree
character totals. Character estimates are not DXF byte lengths. `mtextPlain` is a
bounded readable preview, not a replacement for renderer typography.

## Source filtering, search and ordering

Version 0.3.0 includes source-level queries used by the workbench and batch search:

```js
import { filterSourceTree, searchSourceTree, sortSourceTree, selectSourceNodes,
    setSourceExpansion } from '@wieslawsoltes/dxf-inspector';

const sourceMap = new WeakMap();
const visible = filterSourceTree(current, {
    objectTypes: ['LINE'], dataTerms: ['PIPES'], dataExact: true, sourceMap
});
const matches = searchSourceTree(current, { objectType: 'LINE', searchCode: 8 });
const objects = selectSourceNodes(current, node => node.type === 'INSERT');
sortSourceTree(visible, 'dataSize', false);
setSourceExpansion(visible, true);
```

Filtering produces fresh node and child/property arrays. The optional `sourceMap`
resolves projected nodes back to their canonical source; properties themselves
retain their original identity. Matching children retain their ancestors. Code
filters restrict properties rather than remove the containing object. Object-type
filters restrict objects but preserve parents of retained descendants. Text filters
match property values or object types. Line bounds are inclusive. No source is
mutated by filtering or search. Batch search returns every matching group pair,
including duplicate values, with its source node, property and line. Exact batch
values are case-sensitive by default; substrings are case-insensitive. `dataCase`
can explicitly override that choice. Empty criteria return no batch matches.

Stable sorting mutates only the supplied arrays, retaining node/tag identities.
Sort projections to avoid changing the original DXF order. Supported fields are
`line`, `code`, `type`, `objectCount` and `dataSize`. Subtree keys are computed once
per node, not on each comparison. Counts exclude property pseudo-nodes; data size
is a text-character estimate, not serialized or encoded DXF length. Expansion,
filtering, sorting and search are iterative, including deeply nested source trees.

All queries preflight tree topology with configurable `limits`: one million nodes,
four million properties and 16,384 levels by default. Cycles, shared node instances,
invalid array entries and exhausted budgets reject rather than silently dropping
source records. Duplicate handles or node ID values are not object identity and
are not deduplicated. Search and predicate selection also default to 250,000
results and reject overflow instead of returning a partial result. Sorting and
expansion validate their write targets before mutation. Inputs should be ordinary
host-owned data, not hostile proxies or accessors.

An optional `signal` supports pre-aborted and cooperatively interrupted operations.
Queries are synchronous; they do not yield to the event loop, run on a worker or
provide CPU isolation. `selectSourceNodes` accepts only a host-owned synchronous
predicate. Async predicates reject. The package never evaluates query strings;
the application's advanced JavaScript input remains explicitly trusted host code,
not a sandbox for code obtained from a DXF or another untrusted source.
