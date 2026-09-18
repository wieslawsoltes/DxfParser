/* Presentation adapter for the parser, comparison grids and rendering tools. */
(function (global) {
  'use strict';
  const { Workspace, element } = global.DxfDocking;
  const byId = id => document.getElementById(id);

  function mountParser(app) {
    const A = global.AvalonDock;
    const shell = document.querySelector('.main-container');
    const originalContent = document.querySelector('.content-wrapper');
    const renderer = app.renderingOverlayController;
    const commands = element('div', 'dxf-dock-commands');
    commands.append(document.querySelector('.top-header'), byId('rowControls'));
    const sidebar = document.querySelector('.sidebar');
    sidebar.style.width = '';
    const renderingRoot = byId('dxfRenderingOverlay');
    renderingRoot.classList.add('dxf-dock-rendering');
    const renderingHeader = renderingRoot.querySelector('.rendering-overlay-header');
    renderingHeader.hidden = true;
    const panels = [
      { id: 'commands', title: 'Commands & Navigation', node: commands, side: 'Top' },
      { id: 'tools', title: 'Analysis Tools', node: sidebar, side: 'Left', width: 218,
        toggleButton: byId('toggleSidebarBtn') },
      { id: 'tree-left', title: 'DXF Tree · Left', node: byId('panelLeft'), kind: 'document', closable: false,
        onResize: () => app.myTreeGridLeft.updateVisibleNodes() },
      { id: 'tree-right', title: 'DXF Tree · Right', node: byId('panelRight'), kind: 'document',
        bridge: 'display', display: 'flex', toggleButton: byId('toggleRightPanelBtn'),
        onResize: () => app.myTreeGridRight.updateVisibleNodes() },
      { id: 'rendering', title: 'DXF Rendering', node: renderingRoot, kind: 'document', bridge: 'display',
        titleNode: byId('renderingOverlayTitle'), resizeNode: renderer.viewportEl,
        onResize: () => renderer.resizeCanvas(), onClose: () => renderer.close(),
        openAction: () => {
          const pane = app.getActiveTab() ? 'left' : 'right';
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
    panels.push({ id: 'render-controls', title: 'View & Measurement', node: viewControls, width: 340 });
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
      ['diagnosticsOverlay', 'Diagnostics', 'showDiagnosticsOverlayBtn', 1000, 670],
      ['ruleConfigOverlay', 'Diagnostic Rules', 'configureRulesBtn', 900, 650],
      ['objectSizeOverlay', 'Object Sizes', 'showObjectSizeOverlayBtn'],
      ['blocksOverlay', 'Blocks & Inserts', 'showBlocksOverlayBtn'],
      ['lineTypesOverlay', 'Line Types', 'showLineTypesOverlayBtn'],
      ['textsOverlay', 'Texts', 'showTextsOverlayBtn'],
      ['batchProcessingOverlay', 'Batch Processing', 'showBatchProcessOverlayBtn', 1050, 680]
    ];
    for (const [id, title, buttonId, width = 800, height = 570] of dialogs) {
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
    const pane = (w, id, width) => new A.LayoutAnchorablePane({
      DockWidth: width || '1*', DockMinWidth: 130, DockMinHeight: 70, Children: [w.make(id)]
    });
    const documents = (w, ids, width = '1*') => new A.LayoutDocumentPane({
      DockWidth: width, DockMinWidth: 120, DockMinHeight: 100, Children: ids.map(id => w.make(id))
    });
    const workspace = new Workspace({
      id: 'parser', title: 'DXF Parser', shell, panels,
      presets: ['Compare', 'Review', 'Focus'],
      defaultPreset: global.matchMedia('(max-width: 700px)').matches ? 'Focus' : 'Compare',
      layout(w, preset) {
        if (preset === 'Focus') {
          return new A.LayoutRoot({ RootPanel: new A.LayoutPanel({ Children: [documents(w, ['tree-left', 'rendering'])] }) });
        }
        const main = preset === 'Review'
          ? new A.LayoutPanel({ Orientation: 'Horizontal', Children: [
              documents(w, ['tree-left'], '0.8*'), documents(w, ['rendering'], '1.8*'),
              new A.LayoutPanel({ Orientation: 'Vertical', DockWidth: 300, DockMinWidth: 160, Children: [
                new A.LayoutAnchorablePane({ Children: ['render-layers', 'render-controls', 'render-blocks', 'render-info'].map(id => w.make(id)) }),
                new A.LayoutAnchorablePane({ DockHeight: '0.7*', Children: [w.make('render-properties')] })
              ] })
            ] })
          : new A.LayoutPanel({ Orientation: 'Horizontal', Children: [
              pane(w, 'tools', 218), documents(w, ['tree-left']), documents(w, ['tree-right'])
            ] });
        return new A.LayoutRoot({ RootPanel: new A.LayoutPanel({ Orientation: 'Vertical', Children: [
          new A.LayoutAnchorablePane({ DockHeight: 96, DockMinHeight: 80, Children: [w.make('commands')] }), main
        ] }) });
      },
      onPreset(preset, w) {
        if (preset !== 'Compare') {
          if (app.getActiveTab() || app.getActiveTabRight()) w.requestOpen('rendering');
          else w.manager.Find('tree-left')?.Activate();
        }
      },
      onRestore: w => w.refreshData?.()
    });
    app.dockingWorkspace = workspace;
    renderer.dockingWorkspace = workspace;
    renderer.dockingInformationPanels = { info: 'render-info', layers: 'render-layers', blocks: 'render-blocks' };
    renderer.setInformationTab(renderer.activeInfoTab);
    byId('renderingOverlayPropertyPanel').setAttribute('aria-hidden', String(!workspace.isOpen('render-properties')));
    originalContent.hidden = true;
    byId('sidebarBackdrop').hidden = true;
    byId('compareSplitter').hidden = true;
    byId('closeSidebarBtn').hidden = true;
    byId('toggleSidebarBtn').addEventListener('click', () => {
      workspace.setVisible('tools', !workspace.isOpen('tools'));
    }, { signal: workspace.abort.signal });
    // Keep a rendered canvas and the independent layer/property tools available from its context menu.
    const context = (_model, _manager, defaults) => defaults.filter(entry => entry?.Label !== 'Open in browser window');
    workspace.manager.DocumentContextMenu = (model, manager, defaults) => [
      ...context(model, manager, defaults), null,
      ...['render-controls', 'render-info', 'render-layers', 'render-blocks', 'render-properties'].map(id => ({
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
        if (buttonId && workspace.isOpen(id)) byId(buttonId).click();
      }
    };
    // Restoring an old app state still restores the comparison data; the new layout has its own key.
    return workspace;
  }
  global.DxfDocking.mountParser = mountParser;
})(window);
