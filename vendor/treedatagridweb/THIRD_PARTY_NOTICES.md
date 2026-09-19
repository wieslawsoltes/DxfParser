# Source provenance and notices

## TreeDataGrid

This JavaScript implementation was developed by inspecting and translating the public model/control contracts and selected algorithms of:

- Repository: https://github.com/wieslawsoltes/TreeDataGrid
- Pinned revision: **3ca47316d724e5e040ab0281a880e8df999b25fc**
- Core: `src/TreeDataGrid.Core`
- Browser-control reference: `src/Avalonia.Controls.TreeDataGrid`
- Primary sample reference: `samples/TreeDataGridCoreDemo`
- Architecture reference: `docs/framework-neutral-core.md`
- License reference: `LICENSE-AVALONIA`

Important inspected files include `Models/Columns.cs`, `FlatTreeDataGridSource.cs`, `HierarchicalTreeDataGridSource.cs`, `IndexPath.cs`, `Selection/ITreeSelectionModel.cs`, `Selection/TreeDataGridCellSelectionModel.cs`, `Selection/TreeSelectionModelBase.cs`, `Models/IRows.cs`, `TreeDataGrid.cs`, `TreeDataGrid.V12.cs`, and `CoreDemoViewModel.cs`.

The upstream MIT notice credits **.NET Foundation and Contributors**. Its `IndexPath.cs` also records adaptation from the Microsoft WinUI project under the MIT license. The original license text is preserved in this distribution. Repository stewardship and current additions are attributable to their upstream contributors, including the referenced repository owner, rather than to this web port.

This is a source-informed port, **not a clean-room implementation claim**, not a binary-compatible .NET build, and not an official release or endorsement by the upstream project. A pinned source review is not an exhaustive translation or validation of all repository files.

## Assets and runtime dependencies

The default sample uses original SVG UI icons, CSS, text and deterministic fixtures. No upstream country dataset, image feed cache, Avalonia assembly, font file or proprietary asset is embedded. The optional user-initiated Wikimedia request is external content and is not part of this archive's default dataset. Network availability and external content terms remain the responsibility of that integration.

Core and web runtime packages have no third-party runtime dependencies other than the web package's companion Core package. Node and browser platform APIs are used directly. TypeScript and Python Playwright are development/test tools; they are not redistributed inside the runtime bundles.
