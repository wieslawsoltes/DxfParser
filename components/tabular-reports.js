/* Display adapters only. Existing CAD controllers continue to own their actions. */
(function (global) {
  'use strict';
  const { GridView, ReportRegistry, text, directText, keyFor } = global.DxfGrid;
  const byId = id => document.getElementById(id);
  const match = (value, regex) => value.match(regex)?.[1] || '';
  const records = (source, selector, values) => [...source.querySelectorAll(selector)].map(node => ({
    key: keyFor(node), source: node, values: values(node), hidden: node.classList.contains('hidden')
  }));
  const descriptors = [
    { selector: '#binaryObjectsList', title: 'Binary Objects', columns: ['Type', 'Line', 'Handle', 'Details'],
      records: s => records(s, ':scope > div', n => { const t = directText(n); return [match(t, /Type: (.*?) \|/), Number(match(t, /Line: (\d+)/)), match(t, /Handle: ([^\s|]+)/), t]; }) },
    { selector: '#proxyObjectsList', title: 'Proxy Objects', columns: ['Proxy', 'Properties'],
      records: s => records(s, ':scope > div', n => [text(n.querySelector('h3,strong')), directText(n)]) },
    { selector: '.dxf-class-records', title: 'Classes', columns: ['Class', 'C++ class', 'Application'],
      records: s => records(s, '.class-record', n => [text(n.querySelector('h3')), text(n.querySelectorAll('p')[0]), text(n.querySelectorAll('p')[1])]) },
    { selector: '.block-overlay-list', title: 'Blocks & Inserts', columns: ['Block', 'Instances', 'Base point', 'Constraints', 'Block type', 'Units'],
      records: s => records(s, ':scope > .block-card', n => {
        const lines = [...n.querySelectorAll(':scope > .block-card-line')].map(text);
        return [text(n.querySelector('h3')), ...['Instances:', 'Base point:', 'Constraints:', 'Block type:', 'Units:'].map(prefix => lines.find(line => line.toLowerCase().startsWith(prefix.toLowerCase())) || '')];
      }) },
    { selector: '.rendering-summary-grid', title: 'Drawing Information', columns: ['Property', 'Value'],
      records: s => records(s, ':scope > div', n => { const label = text(n.querySelector('.label')); return [label.replace(/:$/, ''), text(n).slice(label.length).trim()]; }) },
    { selector: '.app-cloud', title: 'Class Applications', columns: ['Application', 'Count'],
      records: s => records(s, '.cloud-tag', n => [text(n).replace(/\s*\(\d+\)$/, ''), Number(match(text(n), /\((\d+)\)$/))]) },
    { selector: '#renderingBlocksGrid', title: 'Block Definitions', columns: ['Block', 'Details'],
      records: s => records(s, '.rendering-block-card', n => [text(n.querySelector('.rendering-block-name')), text(n.querySelector('.rendering-block-details'))]) },
    { selector: '.diagnostics-category-content', title: 'Diagnostic Issues', columns: ['Severity', 'Title', 'Description', 'Location'],
      records: s => records(s, ':scope > .diagnostic-item', n => ['.diagnostic-severity', '.diagnostic-title', '.diagnostic-description', '.diagnostic-location'].map(c => text(n.querySelector(c)))) },
    { selector: '.rule-category-body', title: 'Diagnostic Rules', columns: [{ title: 'Enabled', width: 80 }, 'Rule', 'Description', 'Severity'], preserve: '.rule-category-controls',
      records: s => records(s, ':scope > .rule-item', n => [!!n.querySelector('input')?.checked, ...['.rule-title', '.rule-description', '.rule-severity'].map(c => text(n.querySelector(c)))]) },
    { selector: '#diagnosticsStats', title: 'Diagnostics Summary', columns: ['Severity', 'Count'],
      records: s => records(s, '.diagnostics-stat', n => [text(n.querySelector('.diagnostics-stat-label')), Number(text(n.querySelector('.diagnostics-stat-number')))]) },
    { selector: '#overlayObjectCloud,#overlayCodeCloud', title: 'DXF Frequencies', columns: ['Value', 'Count'],
      records: s => records(s, '.cloud-tag', n => [text(n).replace(/\s*\(\d+\)$/, ''), Number(match(text(n), /\((\d+)\)$/))]) }
  ];
  function mount(container, options) {
    if (container._dataGrid && container._dataGrid.host.isConnected) {
      container._dataGrid.setRows(options.rows); return container._dataGrid;
    }
    container._dataGrid?.dispose(); container.replaceChildren();
    return container._dataGrid = new GridView(container, options);
  }
  function installApp(app) {
    const rootIds = ['cloudOverlay', 'statsOverlay', 'depsOverlay', 'hexViewerOverlay', 'binaryObjectsOverlay', 'handleMapOverlay',
      'proxyObjectsOverlay', 'fontsOverlay', 'classesOverlay', 'diagnosticsOverlay', 'ruleConfigOverlay', 'objectSizeOverlay',
      'blocksOverlay', 'lineTypesOverlay', 'textsOverlay', 'renderingOverlayInfoPanel', 'renderingOverlayLayersPanel',
      'renderingOverlayBlocksPanel', 'renderingOverlayPropertyPanel'];
    // Group only class records, leaving the application's filter/back controls in
    // their original update root. This avoids stale controls when a report rebuilds.
    for (const method of ['updateClasses', 'filterClassesByAppName']) {
      const original = app[method];
      app[method] = function (...args) {
        const result = original.apply(this, args);
        const nodes = [...byId('overlayClassesContent').querySelectorAll(':scope > .class-record')];
        if (nodes.length) { const group = document.createElement('div'); group.className = 'dxf-class-records'; nodes[0].before(group); group.append(...nodes); }
        return result;
      };
    }
    const registry = new ReportRegistry(rootIds.map(byId), descriptors);
    app.tabularReports = registry;
    app.renderObjectSizeList = function () {
      const nodes = this.sortedNodesByDataSize || [];
      mount(byId('objectSizeList'), { title: 'Object Sizes', columns: ['Type', 'Handle', 'Line', 'Characters'],
        rows: nodes.map(node => ({ key: node.id, values: [node.type, node.handle, node.line, this.myTreeGrid.computeDataSize(node)],
          actions: [{ label: 'Show in Tree', run: () => this.showInTreeById(node.id, node.line) }] })) });
    };
    app.virtualizeHexViewer = function (bytes) {
      const host = byId('hexContent'); host.onscroll = null;
      const PAGE_ROWS = 2048, pageBytes = PAGE_ROWS * 16;
      let start = 0;
      const draw = () => {
        const rows = [];
        for (let offset = start; offset < Math.min(bytes.length, start + pageBytes); offset += 16) {
          const chunk = bytes.subarray(offset, offset + 16);
          rows.push({ key: offset, values: [offset.toString(16).toUpperCase().padStart(8, '0'),
            [...chunk].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
            [...chunk].map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('')] });
        }
        return rows;
      };
      const view = mount(host, { title: 'Binary Data', columns: [{ title: 'Offset', width: 110 }, { title: 'Hexadecimal', width: 400 }, { title: 'ASCII', width: 180 }], rows: draw() });
      view.bar.querySelector('.dxf-hex-pager')?.remove();
      const pager = DxfGrid.element('span', 'dxf-hex-pager');
      const previous = DxfGrid.element('button', '', 'Previous'), next = DxfGrid.element('button', '', 'Next');
      const offset = DxfGrid.element('input'); offset.type = 'text'; offset.setAttribute('aria-label', 'Hex byte offset'); offset.value = '0';
      const count = DxfGrid.element('span');
      const update = () => { view.setRows(draw()); offset.value = start.toString(16).toUpperCase(); previous.disabled = start === 0; next.disabled = start + pageBytes >= bytes.length; count.textContent = `${start.toLocaleString()}–${Math.min(bytes.length, start + pageBytes).toLocaleString()} / ${bytes.length.toLocaleString()} bytes`; };
      previous.type = next.type = 'button';
      previous.onclick = () => { start = Math.max(0, start - pageBytes); update(); };
      next.onclick = () => { start = Math.min(Math.max(0, bytes.length - 1), start + pageBytes); update(); };
      offset.onchange = () => { const value = /^[0-9a-f]+$/i.test(offset.value) ? parseInt(offset.value, 16) : NaN; if (Number.isSafeInteger(value) && value >= 0 && value < bytes.length) { start = Math.floor(value / 16) * 16; update(); } else offset.value = start.toString(16).toUpperCase(); };
      pager.append(previous, next, offset, count); view.bar.append(pager); update();
    };
    const browseZip = app.browseZip;
    app.browseZip = function (bytes) { return this.officePreview.browseArchive(bytes, byId('zipContentsContainer')); };
    const originalHex = app.showHexViewer;
    app.showHexViewer = function (hex) {
      // Cancel previews from an earlier embedded object, including a pending archive decode.
      this.officePreview.cancelPending();
      originalHex.call(this, hex);
      const bytes = this.currentBinaryData;
      if (this.currentDetectedType === 'ZIP Archive' || bytes?.[0] === 0xd0) this.officePreview.open(bytes, 'Embedded document', { embedded: true });
    };
    registry.originalBrowseZip = browseZip;
    const workspace = app.dockingWorkspace;
    if (workspace) {
      const updateTheme = () => {
        const theme = String(workspace.manager.Theme?.Name || workspace.manager.Theme || 'light').toLowerCase();
        registry.setTheme(theme); app.renderingOverlayController?.propertyGrid?.gridView?.setTheme(theme);
        for (const tab of Object.values(app.batchDataGrid.tabs)) tab.view?.setTheme(theme);
      };
      workspace.unsubscribers.push(workspace.manager.ThemeChanged.add(updateTheme)); updateTheme();
      const dispose = workspace.dispose.bind(workspace);
      workspace.dispose = () => { registry.dispose(); app.batchDataGrid.dispose();
        app.renderingOverlayController?.propertyGrid?.gridView?.dispose();
        for (const id of ['objectSizeList', 'hexContent']) byId(id)?._dataGrid?.dispose(); dispose(); };
    }
  }
  global.DxfGrid.installApp = installApp;
  global.DxfGrid.mount = mount;
})(window);
