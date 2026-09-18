/* Batch query results use the same GridWeb surface as all other reports. */
class BatchDataGrid {
  constructor(tabHeadersContainer, tabContentsContainer) {
    this.tabHeadersContainer = tabHeadersContainer;
    this.tabContentsContainer = tabContentsContainer;
    this.tabs = Object.create(null); this.activeTabId = null; this.sequence = 0;
  }
  addTab(fileName) {
    const id = 'batch-tab-' + ++this.sequence;
    const header = document.createElement('div'); header.className = 'batch-tab-header';
    header.dataset.tabId = id; header.textContent = fileName; header.tabIndex = 0;
    header.setAttribute('role', 'tab');
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×';
    close.setAttribute('aria-label', 'Close ' + fileName);
    close.addEventListener('click', e => { e.stopPropagation(); this.removeTab(id); });
    header.append(close); header.addEventListener('click', () => this.switchTab(id));
    header.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.switchTab(id); } });
    const content = document.createElement('div'); content.className = 'batch-tab-content'; content.dataset.tabId = id;
    content.style.height = '100%'; content.setAttribute('role', 'tabpanel');
    this.tabHeadersContainer.append(header); this.tabContentsContainer.append(content);
    const view = new DxfGrid.GridView(content, { title: 'Batch Results · ' + fileName,
      columns: [{ title: '#', width: 70 }, { title: 'File', width: 300 }, { title: 'Line', width: 90 }, { title: 'Data', width: 500 }] });
    this.tabs[id] = { fileName, header, content, view, rows: [], frame: 0 };
    this.switchTab(id); return id;
  }
  addRow(id, row) {
    const tab = this.tabs[id]; if (!tab) return;
    tab.rows.push(row);
    // A batch query can append thousands of results in a single turn. Rebuild once per frame.
    if (!tab.frame) tab.frame = requestAnimationFrame(() => { tab.frame = 0; this.updateVirtualizedResults(id); });
  }
  updateVirtualizedResults(id) {
    const tab = this.tabs[id]; if (!tab) return;
    tab.view.setRows(tab.rows.map((row, index) => ({ key: index, values: [index + 1, row.file, row.line, row.data],
      actions: [{ label: 'Open file at line', run: () => window.app.openFileTab(row.fileObject, row.line) }] })));
  }
  syncHeaderWidths(id) { this.tabs[id]?.view.grid.Refresh(); }
  switchTab(id) {
    if (!this.tabs[id]) return;
    this.activeTabId = id;
    for (const [key, tab] of Object.entries(this.tabs)) {
      tab.content.style.display = key === id ? 'block' : 'none';
      tab.header.setAttribute('aria-selected', String(key === id));
      tab.header.style.fontWeight = key === id ? 'bold' : 'normal';
      if (key === id) tab.view.grid.Refresh();
    }
  }
  removeTab(id) {
    const tab = this.tabs[id]; if (!tab) return;
    cancelAnimationFrame(tab.frame); tab.view.dispose(); tab.header.remove(); tab.content.remove(); delete this.tabs[id];
    if (this.activeTabId === id) { this.activeTabId = null; const next = Object.keys(this.tabs)[0]; if (next) this.switchTab(next); }
  }
  getAllTabs() { return this.tabs; }
  dispose() { for (const id of Object.keys(this.tabs)) this.removeTab(id); }
}
let gOldText = '';
let gNewText = '';
