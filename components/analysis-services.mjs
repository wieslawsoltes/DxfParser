// Browser application composition only. Reusable views have no window.app dependency.
import { createAnalysisUI, createAnalysisDocking } from '../packages/dxf-analysis/index.mjs';
import * as models from '../packages/dxf-analysis/src/models.mjs';
const AnalysisDocking = createAnalysisDocking({ window, dockyard: window.AvalonDock });
const ui = createAnalysisUI({
    createLayout(options) {
        let storage = null; try { storage = window.localStorage; } catch (_) {}
        return new AnalysisDocking({ ...options, storage, storageKey: 'dxfparser.analysis-layout.v1.' + options.title });
    },
    onExpand(view) {
        const workspace = (window.app || window.DxfEditorApp)?.dockingWorkspace;
        // Reports can live in a result-document manager inside this workspace.
        // Resolve the actual enclosing application content, not the nearest
        // nested manager's ContentId (which may also be reused by other views).
        let model = null;
        for (let node = view.host; workspace?.host.contains(node); node = node.parentElement) {
            const id = node.dataset?.adContent, candidate = id && workspace.manager.Find(id);
            if (candidate?.Content?.contains?.(view.host)) { model = candidate; break; }
        }
        if (!model) return;
        const A = window.AvalonDock, manager = workspace.manager;
        manager.Transaction('Expand analysis', () => {
            if (!model.IsFloating) manager.Float(model, {
                FloatingWidth: Math.max(320, workspace.host.clientWidth - 24),
                FloatingHeight: Math.max(240, workspace.host.clientHeight - 24), FloatingLeft: 12, FloatingTop: 12
            });
            const floating = model.FindParent(A.LayoutFloatingWindow);
            if (floating) floating.IsMaximized = !floating.IsMaximized;
            manager.Activate(model);
        });
        workspace.scheduleResize();
    },
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
