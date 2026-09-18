/* Dock the editor's existing ribbon, viewport, tools, status and command palette. */
(function (global) {
  'use strict';
  const { Workspace } = global.DxfDocking;
  const byId = id => document.getElementById(id);
  function mountEditor(app) {
    const A = global.AvalonDock;
    const shell = byId('editorAppRoot');
    const oldMain = shell.querySelector('.editor-shell');
    const palette = byId('editorCommandPalette');
    palette.classList.add('dxf-dock-command-palette');
    palette.querySelector('.command-palette-panel').removeAttribute('aria-modal');
    palette.querySelector('.command-palette-panel').setAttribute('role', 'region');
    const viewport = byId('editorViewport');
    viewport.tabIndex = 0;
    const title = byId('ribbonActiveDocument');
    const workspace = new Workspace({
      id: 'editor', title: 'DXF Editor', shell, theme: 'dark',
      presets: ['Drafting', 'Review', 'Focus'], defaultPreset: 'Drafting',
      panels: [
        { id: 'ribbon', title: 'Ribbon & Commands', node: byId('editorRibbon'), side: 'Top', height: 230 },
        { id: 'explorer', title: 'Project Explorer', node: byId('editorSidebar'), side: 'Left', width: 220 },
        { id: 'viewport', title: 'Drawing Viewport', node: viewport, kind: 'document', closable: false, titleNode: title,
          onResize: () => app.rerenderActiveDocument() },
        { id: 'inspector', title: 'Inspector', node: byId('editorInspector'), width: 280 },
        { id: 'status', title: 'Command & Drawing Status', node: byId('editorStatusBar'), side: 'Bottom', height: 75 },
        { id: 'command-palette', title: 'Command Palette', node: palette, bridge: 'hidden', floating: true, width: 660, height: 550,
          openAction: () => app.openCommandPalette(), onClose: () => app.closeCommandPalette() }
      ],
      layout(w, preset) {
        const documentPane = new A.LayoutDocumentPane({ DockMinWidth: 100, DockMinHeight: 90, Children: [w.make('viewport')] });
        const tool = (id, size = {}) => new A.LayoutAnchorablePane({ DockMinWidth: 100, DockMinHeight: 45, ...size, Children: [w.make(id)] });
        const center = preset === 'Focus' ? documentPane : new A.LayoutPanel({ Orientation: 'Horizontal', Children: [
          ...(preset === 'Drafting' ? [tool('explorer', { DockWidth: 210 })] : []),
          documentPane, tool('inspector', { DockWidth: 270 })
        ] });
        return new A.LayoutRoot({ RootPanel: new A.LayoutPanel({ Orientation: 'Vertical', Children: [
          ...(preset === 'Focus' ? [] : [tool('ribbon', { DockHeight: 228, DockMinHeight: 80 })]),
          center, tool('status', { DockHeight: 75 })
        ] }) });
      },
      onPreset(preset) {
        shell.querySelector('[data-command="workspace-switcher"]').textContent = `Workspace: ${preset}`;
      },
      onRestore(w) {
        if (w.isOpen('command-palette')) app.openCommandPalette();
      }
    });
    app.dockingWorkspace = workspace;
    oldMain.hidden = true;
    const context = (_model, _manager, defaults) => defaults.filter(entry => entry?.Label !== 'Open in browser window');
    workspace.manager.DocumentContextMenu = context;
    workspace.manager.AnchorableContextMenu = context;
    if (workspace.isOpen('command-palette')) app.openCommandPalette();
    shell.querySelector('[data-command="workspace-switcher"]').textContent = `Workspace: ${workspace.preset}`;
    return workspace;
  }
  global.DxfDocking.mountEditor = mountEditor;
})(window);
