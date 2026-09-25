import { createTreeDataGrid } from '../packages/dxf-tree-view/index.mjs';
import { isHandleCode } from '../packages/dxf-inspector/index.mjs';
window.TreeDataGrid = createTreeDataGrid({
    window, isHandleCode,
    getClassNameById: id => window.app?.getClassNameById(id),
    navigateToClassById: id => window.app?.navigateToClassById(id)
});
