# @wieslawsoltes/dxf-workspace

A source-first workspace shell for host-owned Dockyard layouts and retained DOM
content. Includes panel registration, visibility bridges, toolbar actions, layout
history, bounded JSON import/export, persistence and resize/lifecycle coordination.
It wraps Dockyard; it does not reimplement or bundle a docking engine.

## Browser integration

Load a compatible Dockyard API and its theme stylesheet in the target window, plus
this package's `styles.css`. Importing the package neither touches the DOM/storage
nor installs globals. The factory binds to a supplied window; all registered
content, title and resize nodes must belong to that document.

```js
import { createDockingWorkspace } from '@wieslawsoltes/dxf-workspace';

const { Workspace } = createDockingWorkspace({ window, dockyard: Dockyard });
const content = document.createElement('section');
content.textContent = 'Project content';
const workspace = new Workspace({
  id: 'project', title: 'Project', shell: document.getElementById('workspace'),
  presets: ['Default'], defaultPreset: 'Default',
  panels: [{ id: 'document', title: 'Document', node: content, kind: 'document' }],
  layout(w) {
    return new Dockyard.LayoutRoot({
      RootPanel: new Dockyard.LayoutPanel({ Children: [
        new Dockyard.LayoutDocumentPane({ Children: [w.make('document')] })
      ] })
    });
  }
});
const detach = workspace.onDispose(() => releaseProjectResources());
// detach() unregisters the cleanup callback without disposing the workspace.
workspace.dispose();
```

Use a distinct workspace `id` within each document. Panel IDs need only be unique
inside their workspace. `show`, `hide`, `register`, `unregister`, `applyPreset`,
`exportLayout` and `importLayout` operate on the same retained content nodes.
`onDispose` is idempotent at the workspace level; all registered callbacks are
attempted even when one throws. Dispose does not destroy host content: nodes are
parked in the hidden storage container. The host may then reparent or remove them.

The default storage key is `dxf.workspace.<id>.v1`. Inject a Storage-compatible
object to change the backend, `storagePrefix` to isolate applications, or
`storage: null` to disable persistence. Storage failures do not prevent use.
Existing DxfParser layout files retain their versioned format; unknown content IDs
are ignored and panel types are validated. Layout input is limited to 1 MiB.
`shouldRestorePanel` is the host policy for restoring required missing panels.
Pending file imports are invalidated by newer imports, presets and disposal.

Package styles cover the shell and generic surfaces, not application-specific
panel content. The host owns vendor versions, content controllers and their data.

## Packaging

ESM is canonical. Node 22.13+ CommonJS consumers load the same exports through
`index.cjs`. No install-time dependencies or build are required; public TypeScript
contracts and CSS are included. `npm pack ./packages/dxf-workspace` creates a local
tarball from the repository root and does not publish to npm.

## License

[MIT](LICENSE). Host-supplied dependencies retain their own licenses.
