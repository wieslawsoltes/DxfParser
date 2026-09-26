import { createReportWorkspace } from '../packages/dxf-analysis/index.mjs';
import './analysis-services.mjs';

// Application bridge only: result hosting and buffering belong to dxf-analysis.
const ReportWorkspace = createReportWorkspace({
    window, dockyard: window.AvalonDock,
    createView: (container, options) => new window.DxfAnalysis.AnalysisView(container, options)
});

class BatchDataGrid {
    constructor(tabHeadersContainer, tabContentsContainer) {
        this.tabs = Object.create(null);
        this.sequence = 0;
        this.disposed = false;
        this.tabHeadersContainer = tabHeadersContainer;
        this.tabContentsContainer = tabContentsContainer;
        const overlay = document.getElementById('batchProcessingOverlay');
        const controls = overlay.querySelector('.batch-search-container');
        this.controls = controls;
        tabHeadersContainer.hidden = true;
        overlay.classList.add('analysis-batch-workspace');
        controls.classList.add('analysis-batch-query');
        this.documents = new ReportWorkspace({
            container: tabContentsContainer, controls, title: 'Batch analysis', controlsTitle: 'Query',
            onClose: entry => { delete this.tabs[entry.id]; }
        });
    }

    get activeTabId() { return this.documents.activeId; }
    addTab(fileName) {
        const id = 'batch-tab-' + ++this.sequence;
        const entry = this.documents.add({ id, title: 'Batch Results · ' + fileName,
            columns: [{ title: '#', width: 70 }, { title: 'File', width: 300 }, { title: 'Line', width: 90 }, { title: 'Data', width: 500 }] });
        this.tabs[id] = { fileName, content: entry.content, view: entry.view, rows: [] };
        return id;
    }
    addRow(id, row) {
        const tab = this.tabs[id]; if (!tab || this.disposed) return;
        const index = tab.rows.length;
        this.documents.append(id, { key: index, values: [index + 1, row.file, row.line, row.data],
            actions: [{ label: 'Open file at line', run: () => window.app.openFileTab(row.fileObject, row.line) }] });
        tab.rows.push(row);
    }
    updateVirtualizedResults(id) { if (this.tabs[id]) this.documents.flush(id); }
    syncHeaderWidths() { this.documents.refreshLayout(); }
    switchTab(id) { if (this.tabs[id]) this.documents.activate(id); }
    removeTab(id) { return this.documents.remove(id); }
    getAllTabs() { return this.tabs; }
    setTheme(theme) { if (!this.disposed) this.documents.setTheme(theme); }
    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.documents.dispose(); this.tabs = Object.create(null);
    }
}
window.BatchDataGrid = BatchDataGrid;
