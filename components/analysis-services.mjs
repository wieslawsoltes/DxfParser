// Browser application composition only. Reusable views have no window.app dependency.
import { createAnalysisUI } from '../packages/dxf-analysis/index.mjs';
import * as models from '../packages/dxf-analysis/src/models.mjs';
const ui = createAnalysisUI({
    window,
    gridWeb: window.GridWeb,
    treeDataGridCore: window.TreeDataGridCore,
    treeDataGridWeb: window.TreeDataGridWeb,
    activateSource(id) {
        const workspace = window.app?.documentWorkspace;
        if (!workspace) return;
        const record = workspace.findByTab(id);
        if (!record) throw new Error('The source drawing is closed. Refresh this report from an open drawing.');
        workspace.activate(record, { focus: false });
    }
});
const { GridView, ReportRegistry, element, scalar, text, directText, keyFor, valueOf,
    AnalysisView, flatten, listRecords, sourceControls, labelOf, AnalysisVisuals } = ui;
window.DxfGrid = { GridView, ReportRegistry, element, scalar, text, directText, keyFor, valueOf };
window.DxfAnalysis = { AnalysisView, flatten, listRecords, sourceControls, labelOf, AnalysisVisuals };
window.DxfAnalysisVisualModel = models;
