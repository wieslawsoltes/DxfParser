# @wieslawsoltes/dxf-tree-view

A virtualized source-tree viewport with editable group codes/values, structural
diff alignment, cell/row classification, column resizing and a diff overview rail.
It is a source inspection control, not the rendered CAD viewport.

```js
import { createTreeDataGrid } from '@wieslawsoltes/dxf-tree-view';
import { isHandleCode } from '@wieslawsoltes/dxf-inspector';

const TreeDataGrid = createTreeDataGrid({ window, isHandleCode });
const view = new TreeDataGrid(container, content, {
    headerElement: header,
    onEdit: node => documentStore.notifyChanged(node),
    getClassNameById: id => classIndex.get(id)?.name,
    navigateToClassById: id => navigation.showClass(id)
});
view.setData(sourceTree);
// When the owning component is removed:
view.dispose();
```

Load `styles.css` from this package. The host supplies a scrollable container of
known height containing the content element. The optional header uses `.tree-header`
and `.header-cell` elements with `data-field` values `line`, `code`, `type`,
`objectCount`, and `dataSize`. `headerRootId` remains available for existing hosts;
`headerElement` avoids document-wide selector coupling.

The factory does not read `window.app`. Class navigation, handles, editing,
copy/open/block actions and selection are callbacks. Instances share no selected
row, filter, scroll position or event lifetime. Container and header elements must
belong to the supplied window. Application-specific docking and theme overrides
remain the host's responsibility.

## Packaging

ES modules are the canonical sources. Native browser imports need no build or
repository-global bootstrap. Node.js **22.13 or later** also supports `require()`
through the package's synchronous ESM facade, sharing the same exported objects
as `import`. No generated distribution, install script, or bundled font is needed.
The package has no install-time dependencies; host APIs are injected explicitly.

Run `npm pack ./packages/dxf-tree-view` from the repository root to create a local tarball.
Packing does not publish to npm. Public exports and TypeScript declarations are
included. Tests and app adapters are not shipped.

## License

[MIT](LICENSE). Host-supplied libraries retain their own licenses.
