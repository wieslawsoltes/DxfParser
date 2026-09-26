# @wieslawsoltes/dxf-state

Source-tree snapshot codecs and host-injected session persistence. Imports are
DOM-free and install no globals. The package does not own source files, schedule
autosave, access localStorage, render views, or discover an application instance.

## Storage and snapshots

```js
import { StateManager, StateCodec } from '@wieslawsoltes/dxf-state';

const state = new StateManager({
    storage: hostStorage, // Storage-compatible adapter; null disables persistence.
    storageKey: 'project.session', tabStatePrefix: 'project.source.',
    getUiState: () => ({ sideBySideDiffEnabled: comparisonEnabled }),
    onError: (error, operation) => reportPersistenceError(operation, error)
});
const tab = { id: 'source-a', name: 'a.dxf', originalTreeData: parsedSourceTree };
const saved = state.saveTabState(tab);
state.saveAppStateLight([tab], [], tab.id, null, { type: '*' });
const snapshot = state.buildExportSnapshot([tab], [], tab.id, null);
const text = state.codec.stringify(snapshot);
const restored = state.restoreFromSnapshot(text);
if (!restored) throw new Error('Invalid source snapshot. Existing sources are unchanged.');
// The host applies the validated sources and retires its old document controllers.
state.dispose();

// A throwing codec is also available independently of storage or a host:
const codec = new StateCodec({ maxTabs: 32 });
const detachedSnapshot = codec.restoreSnapshot(text);
```

The codec reads the existing version-1 DxfParser file format and legacy unversioned
storage manifests with `tabIds`/`activeTabId`. Default keys remain
`dxf_parser_state` and `dxf_tab_`. Layouts, images, fonts and comparison sessions
belong to their own components; they are not part of these source snapshots.

Restored values are independent copies. Modified flags, column widths, filters,
navigation history, class names, typed node IDs and expansion state are retained.
An explicitly empty expansion list collapses all nodes. Expansion restoration uses
an iterative traversal and set membership; it does not recurse or scan the full
expanded-ID array for each node. All nodes are validated before flags are changed.

## Validation and budgets

Unsupported snapshot versions, duplicate source IDs (including numeric/string
storage-key aliases), invalid source nodes, duplicate node IDs, cycles, accessors,
unsafe prototype keys and non-JSON values are rejected. A codec throws; the storage
facade reports errors through `onError` and returns a failure/null result. Errors
in the diagnostic callback cannot interrupt storage operations or cleanup.

Default configurable limits are 64 MiB of UTF-8 JSON, 256 source tabs, 1,000,000
nodes per tree, 256 tree levels and 8,000,000 JSON values. Serialized input is
size-checked before parsing; copied object graphs have value/depth/string budgets.
These are safety limits, not a promise to render that many source objects. JSON
serialization is synchronous. Callers should treat programmatic inputs as ordinary
data, not hostile Proxy objects. No script or callback is accepted from a file.

## Persistence failure semantics

`saveTabState` reports `saved`, `metadata-only`, `preserved`, `unavailable` or
`failed`. A failed storage write never intentionally replaces an existing source
with a metadata-only fallback. When a new source cannot fit, a minimal record may
be saved; it does not claim that the source can be restored. Hosts should offer an
explicit file export when persistence fails. No method writes through a null or
disposed storage adapter. Reading unavailable storage returns null/false.

`saveAppState` validates all selected sources before starting writes and publishes
the manifest last. Storage is still a multi-key best-effort operation, **not an
atomic database transaction**. Cross-tab coordination and durable persistence are
host responsibilities. The default retention window is seven days according to
the injected clock. Expiration/clear only removes the configured source namespace
and manifest, never workspace layouts, preferences or neighboring stores.

The host owns the Storage instance. Disposal is idempotent, drops host callbacks
and storage references, and does not clear persisted data. The application adapter
binds its timer, unload handler and pending state-file reads to workspace disposal.

## Packaging

Canonical ESM and a shared CommonJS facade require Node 22.13+ for Node consumers.
No dependencies, build, generated distributions, styles or font assets are needed.
Public TypeScript declarations and an MIT license are included.

```sh
npm pack ./packages/dxf-state
```

Packing creates a local tarball; it does not publish to the npm registry.

## License

[MIT](LICENSE).
