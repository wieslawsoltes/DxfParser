/* Presentation adapter for the parser, comparison grids and rendering tools. */
(function (global) {
  'use strict';
  const { Workspace, element } = global.DxfDocking;
  const byId = id => document.getElementById(id);

  function welcome(side) {
    const node = element('section', 'dxf-welcome-document');
    node.append(element('h2', '', side === 'left' ? 'DXF workspace' : 'Compare drawings'));
    node.append(element('p', '', 'Open a drawing to inspect, compare and analyze. Each file has its own dockable document.'));
    const open = element('button', '', side === 'left' ? 'Open DXF…' : 'Open comparison drawing…');
    open.type = 'button'; open.addEventListener('click', () => byId(side === 'left' ? 'openLeftBtn' : 'openRightBtn').click());
    node.append(open); return node;
  }
  function mountParser(app) {
    const A = global.AvalonDock;
    const shell = document.querySelector('.main-container');
    const originalContent = document.querySelector('.content-wrapper');
    const renderer = app.renderingOverlayController;
    const renderingTemplate = renderer.overlayRoot.cloneNode(true);
    // A narrow split must scroll rather than collapse the Data column to zero.
    for (const grid of [app.myTreeGridLeft, app.myTreeGridRight]) grid.minimumColumnWidths = { type: 200 };
    const commands = element('div', 'dxf-dock-commands');
    commands.append(document.querySelector('.top-header'), byId('rowControls'));
    const sidebar = document.querySelector('.sidebar');
    sidebar.style.width = '';
    const renderingRoot = byId('dxfRenderingOverlay');
    renderingRoot.classList.add('dxf-dock-rendering');
    const renderingHeader = renderingRoot.querySelector('.rendering-overlay-header');
    renderingHeader.hidden = true;
    const panels = [
      { id: 'tree-left', title: 'Open a drawing', node: welcome('left'), kind: 'document', closable: false, emptySide: 'left',
        onResize: () => app.myTreeGridLeft.updateVisibleNodes() },
      { id: 'tree-right', title: 'Open comparison drawing', node: welcome('right'), kind: 'document', emptySide: 'right',
        bridge: 'display', display: 'flex', toggleButton: byId('toggleRightPanelBtn'),
        onResize: () => app.myTreeGridRight.updateVisibleNodes() },
      { id: 'rendering', title: 'DXF Rendering', node: renderingRoot, kind: 'document', bridge: 'display',
        titleNode: byId('renderingOverlayTitle'), resizeNode: renderer.viewportEl,
        onResize: () => renderer.resizeCanvas(), onClose: () => renderer.close(),
        openAction: () => {
          const pane = app.documentWorkspace?.side() || (app.getComparisonTab('left') ? 'left' : 'right');
          if (app.getActiveTab() || app.getActiveTabRight()) app.openRenderingOverlay(pane);
          else app.dockingWorkspace.show('rendering');
        } }
    ];
    for (const [id, title, nodeId] of [
      ['render-info', 'Drawing Information', 'renderingOverlayInfoPanel'],
      ['render-layers', 'Layers', 'renderingOverlayLayersPanel'],
      ['render-blocks', 'Block Definitions', 'renderingOverlayBlocksPanel'],
      ['render-properties', 'Selection Properties', 'renderingOverlayPropertyPanel']
    ]) {
      const node = byId(nodeId);
      node.hidden = false;
      node.removeAttribute('role');
      node.removeAttribute('aria-labelledby');
      node.classList.add('dxf-dock-render-tool');
      panels.push({ id, title, node, width: 340, manageAria: true });
    }
    const viewControls = element('div', 'dxf-dock-render-tool dxf-dock-view-controls');
    viewControls.append(
      byId('renderingVisualStyleControl'), byId('renderingMeasurementToolbar'),
      byId('renderingSelectionToolbar'), renderingRoot.querySelector('.rendering-view-overlay'),
      byId('renderingNavigationWheel')
    );

    // These tabs are replaced by independent Dockyard tools, not a second nested docking system.
    renderingRoot.querySelector('.rendering-overlay-info').hidden = true;

    const dialogs = [
      ['filtersOverlayLeft', 'Filters · Left', 'filtersLeftBtn', 440, 570],
      ['filtersOverlayRight', 'Filters · Right', 'filtersRightBtn', 440, 570],
      ['cloudOverlay', 'Cloud Data', 'showCloudOverlayBtn'],
      ['statsOverlay', 'Statistics', 'showStatsOverlayBtn'],
      ['depsOverlay', 'Dependencies', 'showDepsOverlayBtn'],
      ['hexViewerOverlay', 'Hex Viewer', null],
      ['binaryObjectsOverlay', 'Binary Objects', 'showBinaryObjectsOverlayBtn'],
      ['handleMapOverlay', 'Handle Map', 'showHandleMapOverlayBtn'],
      ['proxyObjectsOverlay', 'Proxy Objects', 'showProxyObjectsOverlayBtn'],
      ['fontsOverlay', 'Fonts', 'showFontsOverlayBtn'],
      ['classesOverlay', 'Classes', 'showClassesOverlayBtn'],
      ['diagnosticsOverlay', 'Diagnostics', 'showDiagnosticsOverlayBtn', 1150, 740],
      ['ruleConfigOverlay', 'Diagnostic Rules', 'configureRulesBtn', 1100, 740],
      ['objectSizeOverlay', 'Object Sizes', 'showObjectSizeOverlayBtn'],
      ['blocksOverlay', 'Blocks & Inserts', 'showBlocksOverlayBtn'],
      ['lineTypesOverlay', 'Line Types', 'showLineTypesOverlayBtn'],
      ['textsOverlay', 'Texts', 'showTextsOverlayBtn'],
      ['batchProcessingOverlay', 'Batch Processing', 'showBatchProcessOverlayBtn', 1050, 680]
    ];
    for (const [id, title, buttonId, width = 1100, height = 720] of dialogs) {
      const node = byId(id);
      node.classList.add('dxf-dock-dialog');
      node.removeAttribute('aria-modal');
      const close = node.querySelector('button[id^="close"]');
      if (close) close.classList.add('dxf-dock-legacy-close');
      panels.push({
        id, title, node, bridge: 'display', floating: true, width, height,
        openAction: buttonId ? () => byId(buttonId).click() : null,
        onClose: id.startsWith('filtersOverlay')
          ? () => app.closeFiltersOverlay(id.endsWith('Right') ? 'right' : 'left')
          : null
      });
    }
    const documents = (w, side, width = '1*', extra = []) => {
      const ids = [...w.definitions.values()].filter(d => d.fileSide === side).map(d => d.id);
      return new A.LayoutDocumentPane({ Id: `dxf-pane-${side}`, DockWidth: width,
        DockMinWidth: 120, DockMinHeight: 100, Children: [...(ids.length ? ids : [`tree-${side}`]), ...extra].map(id => w.make(id)) });
    };
    if (global.DxfCad) panels.push(...global.DxfCad.create(app, 'parser').panels());
    if (global.DxfOffice) panels.push(global.DxfOffice.createPanel(app));
    for (const panel of panels) if (panel.id.startsWith('render-')) {
      const slot = element('div', 'dxf-render-tool-slot'); slot.append(panel.node);
      panel.node = slot;
    }
    const workspace = new Workspace({
      id: 'parser', title: 'DXF Parser', shell, panels, deferRestore: true,
      presets: ['Compare', 'Review', 'Focus', 'CAD'],
      defaultPreset: global.matchMedia('(max-width: 700px)').matches ? 'Focus' : 'Compare',
      layout(w, preset) {
        let main;
        if (preset === 'CAD') {
          const ids = [...w.definitions.values()].filter(d => d.fileSide).map(d => d.id);
          main = new A.LayoutPanel({ Orientation: 'Vertical', Children: [
            new A.LayoutPanel({ Orientation: 'Horizontal', Children: [
              new A.LayoutAnchorablePane({ DockWidth: 250, DockMinWidth: 180, Children: ['render-layers','render-blocks','render-resources'].map(id => w.make(id)) }),
              new A.LayoutDocumentPane({ Id: 'dxf-pane-left', DockWidth: '3*', Children: [...(app.drawingViews?.layoutIds() || ['rendering']),...ids].map(id => w.make(id)) }),
              new A.LayoutAnchorablePane({ DockWidth: 320, DockMinWidth: 200, Children: ['render-properties','render-diagnostics','render-info'].map(id => w.make(id)) })
            ] }),
            new A.LayoutAnchorablePane({ DockHeight: 140, DockMinHeight: 80, Children: [w.make('render-console')] })
          ] });
        } else if (preset === 'Focus') {
          const ids = [...w.definitions.values()].filter(d => d.fileSide).map(d => d.id);
          main = new A.LayoutDocumentPane({ Id: 'dxf-pane-left', Children: [...(ids.length ? ids : ['tree-left']), ...(app.drawingViews?.layoutIds() || ['rendering'])].map(id => w.make(id)) });
        } else if (preset === 'Review') {
          const ids = [...w.definitions.values()].filter(d => d.fileSide).map(d => d.id);
          main = new A.LayoutPanel({ Orientation: 'Horizontal', Children: [
            new A.LayoutDocumentPane({ Id: 'dxf-pane-left', DockWidth: '0.8*', Children: (ids.length ? ids : ['tree-left']).map(id => w.make(id)) }),
            new A.LayoutDocumentPane({ DockWidth: '1.8*', Children: (app.drawingViews?.layoutIds() || ['rendering']).map(id => w.make(id)) }),
            new A.LayoutPanel({ Orientation: 'Vertical', DockWidth: 300, DockMinWidth: 160, Children: [
              new A.LayoutAnchorablePane({ Children: ['render-layers', 'render-blocks', 'render-info'].map(id => w.make(id)) }),
              new A.LayoutAnchorablePane({ DockHeight: '0.7*', Children: [w.make('render-properties')] })
            ] })
          ] });
        } else main = new A.LayoutPanel({ Orientation: 'Horizontal', Children: [documents(w, 'left', '1*', app.drawingViews?.layoutIds(false) || []), documents(w, 'right')] });
        return new A.LayoutRoot({ RootPanel: new A.LayoutPanel({ Children: [main] }) });
      },
      onPreset(preset, w) {
        if (preset !== 'Compare') {
          if (app.getActiveTab() || app.getActiveTabRight()) w.requestOpen('rendering');
          else (app.documentWorkspace?.active ? w.manager.Find(app.documentWorkspace.active.id) : w.manager.Find('tree-left'))?.Activate();
        }
      },
      onRestore: w => w.refreshData?.()
    });
    app.dockingWorkspace = workspace;
    app.cadWorkspace?.attach(workspace);
    workspace.legacyCommandSources = { commands, sidebar, viewControls };
    workspace.parking.append(commands, sidebar, viewControls);
    app.documentWorkspace = new global.DxfDocking.DocumentWorkspace(app, workspace);
    app.officePreview?.attachWorkspace(workspace);
    renderer.dockingWorkspace = workspace;
    renderer.dockingInformationPanels = { info: 'render-info', layers: 'render-layers', blocks: 'render-blocks' };
    renderer.setInformationTab(renderer.activeInfoTab);
    byId('renderingOverlayPropertyPanel').setAttribute('aria-hidden', String(!workspace.isOpen('render-properties')));
    originalContent.hidden = true;
    byId('sidebarBackdrop').hidden = true;
    byId('compareSplitter').hidden = true;
    byId('closeSidebarBtn').hidden = true;
    // Keep a rendered canvas and the independent layer/property tools available from its context menu.
    const context = (_model, _manager, defaults) => defaults.filter(entry => entry?.Label !== 'Open in browser window');
    workspace.manager.DocumentContextMenu = (model, manager, defaults) => [
      ...(model.ContentId?.startsWith('dxf:') ? [
        { Label: 'Use as left comparison', Execute: () => app.documentWorkspace.assignSide(app.documentWorkspace.records.get(model.ContentId), 'left') },
        { Label: 'Use as right comparison', Execute: () => app.documentWorkspace.assignSide(app.documentWorkspace.records.get(model.ContentId), 'right') }, null
      ] : []),
      ...context(model, manager, defaults), null,
      ...['render-info', 'render-layers', 'render-blocks', 'render-properties'].map(id => ({
        Label: `Show ${workspace.require(id).title}`, Execute: () => workspace.show(id)
      }))
    ];
    workspace.manager.AnchorableContextMenu = context;
    // Legacy launchers must activate an existing tab even if display did not change.
    for (const [id, , buttonId] of dialogs) {
      if (!buttonId) continue;
      byId(buttonId).addEventListener('click', () => {
        if (workspace.require(id).node.style.display !== 'none') workspace.show(id);
      }, { signal: workspace.abort.signal });
    }
    workspace.refreshData = () => {
      if (!app.getActiveTab() && !app.getActiveTabRight()) return;
      if (workspace.isOpen('rendering')) workspace.requestOpen('rendering');
      for (const [id, , buttonId] of dialogs) {
        if (buttonId && workspace.isOpen(id)) {
          const source = app.documentWorkspace.findByTab(workspace.require(id).sourceTabId);
          if (source) app.documentWorkspace.activate(source, { focus: false });
          byId(buttonId).click();
        }
      }
    };
    app.drawingViews = new global.DxfDocking.DrawingViews(app, workspace, renderingTemplate);
    // Restoring an old app state still restores the comparison data; the new layout has its own key.
    return workspace;
  }
  global.DxfDocking.mountParser = mountParser;
})(window);
