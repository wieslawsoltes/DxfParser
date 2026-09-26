import './analysis-services.mjs';
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
    { selector: '.block-overlay-list', title: 'Blocks & Inserts', columns: ['Block', {title:'Instances',bar:true}, 'Base point', 'Constraints', 'Block type', 'Units'],
      records: s => { const rows = records(s, ':scope > .block-card', n => {
        const lines = [...n.querySelectorAll(':scope > .block-card-line')].map(text);
        const values = ['Instances:', 'Base point:', 'Constraints:', 'Block type:', 'Units:'].map(prefix => (lines.find(line => line.toLowerCase().startsWith(prefix.toLowerCase())) || '').slice(prefix.length).trim());
        return [text(n.querySelector('h3')), Number.parseInt(values[0].replace(/,/g,''),10) || 0, ...values.slice(1)];
      }).map(row => ({...row, key: 'block:' + row.values[0]}));
        return global.app?.analysisReports?.enrichBlocks(rows) || rows; } },
    { selector: '.rendering-summary-grid', title: 'Drawing Information', columns: ['Property', 'Value'],
      records: s => records(s, ':scope > div', n => { const label = text(n.querySelector('.label')); return [label.replace(/:$/, ''), text(n).slice(label.length).trim()]; }).map(row => ({...row,key:row.values[0]})) },
    { selector: '#renderingBlocksGrid,[data-render-source-id="renderingBlocksGrid"]', title: 'Block Definitions', columns: ['Block', 'Details'],
      records: s => records(s, '.rendering-block-card', n => [text(n.querySelector('.rendering-block-name')), text(n.querySelector('.rendering-block-details'))]).map(row=>({...row,key:'block:'+row.values[0]})) },
    { selector: '#ruleConfigContent', title: 'Diagnostic Rules', columns: ['Rule', {title:'Enabled',width:85,control:row=>row.source.querySelector('input[type=checkbox]')}, 'Category', 'Severity', {title:'Description',width:350}],
      records: s => records(s, '.rule-item', n => [text(n.querySelector('.rule-title')), !!n.querySelector('input')?.checked, n.dataset.category || '', text(n.querySelector('.rule-severity')), text(n.querySelector('.rule-description'))])
        .map(row=>({...row,key:'rule:'+row.source.dataset.category+':'+row.source.dataset.rule})),
      onMount: view => {
        for (const enabled of [true,false]) {
          const b=DxfGrid.element('button','',enabled?'Enable filtered':'Disable filtered');b.type='button';
          b.addEventListener('click',()=>view.runAction(()=>{for(const row of view.filteredRows||view.visibleRows){const input=row.source?.querySelector('input[type=checkbox]');if(input&&!input.disabled){input.checked=enabled;input.dispatchEvent(new Event('change',{bubbles:true}));}}view.onSourceChange?.();}));view.bar.append(b);
        }
      } }
  ];
  function mount(container, options) {
    if (container._dataGrid && container._dataGrid.host.isConnected) {
      container._dataGrid.setRows(options.rows); return container._dataGrid;
    }
    container._dataGrid?.dispose(); container.replaceChildren();
    return container._dataGrid = new (global.DxfAnalysis?.AnalysisView || GridView)(container, options);
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
    // Typed reports are installed before the registry's first observation; old sources never flash.
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
        app.batchDataGrid.setTheme(theme);
      };
      workspace.unsubscribers.push(workspace.manager.ThemeChanged.add(updateTheme)); updateTheme();
      workspace.onDispose(() => { registry.dispose(); app.batchDataGrid.dispose();
        app.renderingOverlayController?.propertyGrid?.gridView?.dispose();
        for (const id of ['objectSizeList', 'hexContent']) byId(id)?._dataGrid?.dispose(); });
    }
  }
  const installLegacy = installApp;
  global.DxfGrid.installApp = app => { installLegacy(app); global.DxfAnalysis?.install(app); };
  global.DxfGrid.createRenderingRegistry = overlay => new ReportRegistry(
    [overlay.infoTabPanel, overlay.layersTabPanel, overlay.blocksTabPanel],
    descriptors.filter(d => d.selector.includes('rendering')));
  global.DxfGrid.mount = mount;
})(window);
