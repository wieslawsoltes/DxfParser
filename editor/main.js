(function () {
  const defaultStatus = {
    message: 'Ready',
    command: '—',
    cursor: '—',
    layerSummary: '—',
    snapSummary: 'Off',
    viewSummary: 'Auto'
  };

  const VIEW_TOGGLE_DEFAULTS = {
    grid: false,
    ucsIcon: true,
    annotations: true,
    sectionPlanes: false
  };

  const storage = createPersistentStorage('dxfEditor');
  const persistedState = {
    viewToggles: storage.get('viewToggles', null),
    ribbonTab: storage.get('ribbonTab', null),
    ribbonCollapsed: storage.get('ribbonCollapsed', null),
    paletteHistory: storage.get('paletteHistory', [])
  };

  const dom = {
    statusMessage: null,
    statusCommand: null,
    statusCursor: null,
    statusLayer: null,
    statusSnap: null,
    statusView: null,
    commandPalette: null,
    commandPaletteInput: null,
    commandPaletteList: null,
    commandPaletteButton: null,
    ribbon: null,
    ribbonPanels: null,
    viewport: null,
    openFileInput: null
  };

  const COMMAND_METADATA = [
    // Clipboard
    { id: 'clipboard-dialog', label: 'Clipboard Options', category: 'Clipboard' },
    { id: 'cut', label: 'Cut', category: 'Clipboard', hint: 'Select objects' },
    { id: 'copy', label: 'Copy', category: 'Clipboard', hint: 'Select objects' },
    { id: 'copybase', label: 'Copy with Base Point', category: 'Clipboard', hint: 'Specify base point' },
    { id: 'paste', label: 'Paste', category: 'Clipboard', hint: 'Specify placement point' },
    { id: 'match-properties', label: 'Match Properties', category: 'Clipboard', hint: 'Select source object' },
    // Application
    { id: 'new-drawing', label: 'New Drawing', category: 'Application' },
    { id: 'open-drawing', label: 'Open Drawing', category: 'Application' },
    { id: 'save-drawing', label: 'Save Drawing', category: 'Application' },
    { id: 'workspace-switcher', label: 'Workspace Switcher', category: 'Application' },
    { id: 'toggle-help', label: 'Toggle Help', category: 'Application' },
    { id: 'user-account', label: 'User Account', category: 'Application' },
    { id: 'minimize-ribbon', label: 'Minimize Ribbon', category: 'Application' },
    // Properties
    { id: 'properties-dialog', label: 'Open Properties Palette', category: 'Properties' },
    { id: 'properties-color', label: 'Color', category: 'Properties', hint: 'Select object color' },
    { id: 'properties-linetype', label: 'Linetype', category: 'Properties', hint: 'Select linetype' },
    { id: 'properties-lineweight', label: 'Lineweight', category: 'Properties', hint: 'Select lineweight' },
    { id: 'properties-transparency', label: 'Transparency', category: 'Properties', hint: 'Set transparency' },
    // Layers
    { id: 'layer-properties', label: 'Layer Properties Manager', category: 'Layers' },
    { id: 'layer-on', label: 'Layer On', category: 'Layers' },
    { id: 'layer-off', label: 'Layer Off', category: 'Layers' },
    { id: 'layer-freeze', label: 'Freeze Layer', category: 'Layers' },
    { id: 'layer-thaw', label: 'Thaw Layer', category: 'Layers' },
    // Draw
    { id: 'line', label: 'Line', category: 'Draw', hint: 'Specify first point' },
    { id: 'polyline', label: 'Polyline', category: 'Draw', hint: 'Specify start point' },
    { id: 'circle', label: 'Circle', category: 'Draw', hint: 'Specify center point' },
    { id: 'arc', label: 'Arc', category: 'Draw', hint: 'Specify start point' },
    { id: 'rectangle', label: 'Rectangle', category: 'Draw', hint: 'Specify first corner' },
    { id: 'spline', label: 'Spline', category: 'Draw', hint: 'Specify start point' },
    { id: 'ellipse', label: 'Ellipse', category: 'Draw', hint: 'Specify axis endpoint' },
    { id: 'polygon', label: 'Polygon', category: 'Draw', hint: 'Specify center or edge' },
    { id: 'hatch', label: 'Hatch', category: 'Draw', hint: 'Select boundary' },
    // Modify
    { id: 'move', label: 'Move', category: 'Modify', hint: 'Select objects' },
    { id: 'rotate', label: 'Rotate', category: 'Modify', hint: 'Select objects' },
    { id: 'scale', label: 'Scale', category: 'Modify', hint: 'Select objects' },
    { id: 'mirror', label: 'Mirror', category: 'Modify', hint: 'Select objects' },
    { id: 'offset', label: 'Offset', category: 'Modify', hint: 'Specify offset distance' },
    { id: 'trim', label: 'Trim', category: 'Modify', hint: 'Select cutting edges' },
    { id: 'extend', label: 'Extend', category: 'Modify', hint: 'Select boundary edges' },
    { id: 'erase', label: 'Erase', category: 'Modify', hint: 'Select objects' },
    { id: 'fillet', label: 'Fillet', category: 'Modify', hint: 'Select first object' },
    // Annotation
    { id: 'mtext', label: 'Multiline Text', category: 'Annotation', hint: 'Specify insertion point' },
    { id: 'single-line-text', label: 'Single Line Text', category: 'Annotation', hint: 'Specify start point' },
    { id: 'text-style', label: 'Text Style', category: 'Annotation' },
    { id: 'field', label: 'Field', category: 'Annotation' },
    { id: 'dim-linear', label: 'Linear Dimension', category: 'Annotation', hint: 'Specify first extension line origin' },
    { id: 'dim-aligned', label: 'Aligned Dimension', category: 'Annotation' },
    { id: 'dim-radius', label: 'Radius Dimension', category: 'Annotation' },
    { id: 'dim-diameter', label: 'Diameter Dimension', category: 'Annotation' },
    { id: 'dim-angle', label: 'Angular Dimension', category: 'Annotation' },
    { id: 'dim-ordinate', label: 'Ordinate Dimension', category: 'Annotation' },
    { id: 'leader', label: 'Leader', category: 'Annotation', hint: 'Specify arrowhead location' },
    { id: 'mleader', label: 'Multileader', category: 'Annotation', hint: 'Specify leader point' },
    { id: 'mleader-style', label: 'Multileader Style', category: 'Annotation' },
    { id: 'center-mark', label: 'Center Mark', category: 'Annotation' },
    { id: 'table', label: 'Table', category: 'Annotation', hint: 'Specify insertion point' },
    { id: 'table-style', label: 'Table Style', category: 'Annotation' },
    // Blocks and Insert
    { id: 'insert-block', label: 'Insert Block', category: 'Block', hint: 'Specify insertion point' },
    { id: 'insert-block-create', label: 'Create Block', category: 'Block' },
    { id: 'insert-block-edit', label: 'Block Editor', category: 'Block' },
    { id: 'insert-block-attributes', label: 'Block Attributes', category: 'Block' },
    { id: 'insert-attach', label: 'Attach Reference', category: 'Insert' },
    { id: 'insert-xref', label: 'Attach DWG', category: 'Insert' },
    { id: 'insert-image', label: 'Attach Image', category: 'Insert' },
    { id: 'insert-pdf', label: 'Attach PDF', category: 'Insert' },
    { id: 'insert-data-link', label: 'Data Link', category: 'Insert' },
    // View and Visual Styles
    { id: 'undo', label: 'Undo View', category: 'View' },
    { id: 'redo', label: 'Redo View', category: 'View' },
    { id: 'zoom-extents', label: 'Zoom to Extents', category: 'View' },
    { id: 'zoom-window', label: 'Zoom Window', category: 'View' },
    { id: 'zoom-in', label: 'Zoom In', category: 'View' },
    { id: 'zoom-out', label: 'Zoom Out', category: 'View' },
    { id: 'pan', label: 'Pan', category: 'View' },
    { id: 'orbit', label: 'Orbit', category: 'View' },
    { id: 'view-home', label: 'View Home', category: 'View' },
    { id: 'view-previous', label: 'Previous View', category: 'View' },
    { id: 'show-grid', label: 'Toggle Grid', category: 'View' },
    { id: 'show-ucs', label: 'Toggle UCS Icon', category: 'View' },
    { id: 'toggle-annotations', label: 'Toggle Annotations', category: 'View' },
    { id: 'toggle-section-planes', label: 'Toggle Section Planes', category: 'View' },
    { id: 'view-manager', label: 'View Manager', category: 'View' },
    { id: 'view-named-views', label: 'Named Views', category: 'View' },
    { id: 'view-layout-manager', label: 'Layouts', category: 'View' },
    { id: 'visual-wireframe', label: 'Visual Style · Wireframe', category: 'Visual Style' },
    { id: 'visual-shaded', label: 'Visual Style · Shaded', category: 'Visual Style' },
    { id: 'visual-realistic', label: 'Visual Style · Realistic', category: 'Visual Style' },
    { id: 'visual-xray', label: 'Visual Style · X-Ray', category: 'Visual Style' },
    // Text formatting
    { id: 'font-bold', label: 'Bold', category: 'Text Formatting' },
    { id: 'font-italic', label: 'Italic', category: 'Text Formatting' },
    { id: 'font-underline', label: 'Underline', category: 'Text Formatting' },
    { id: 'align-left', label: 'Align Left', category: 'Text Formatting' },
    { id: 'align-center', label: 'Align Center', category: 'Text Formatting' },
    { id: 'align-right', label: 'Align Right', category: 'Text Formatting' },
    { id: 'line-spacing-1', label: 'Line Spacing 1.0', category: 'Text Formatting' },
    { id: 'line-spacing-15', label: 'Line Spacing 1.5', category: 'Text Formatting' },
    { id: 'line-spacing-2', label: 'Line Spacing 2.0', category: 'Text Formatting' },
    { id: 'paragraph-settings', label: 'Paragraph Settings', category: 'Text Formatting' },
    // Image
    { id: 'image-brightness', label: 'Brightness', category: 'Image' },
    { id: 'image-contrast', label: 'Contrast', category: 'Image' },
    { id: 'image-fade', label: 'Fade', category: 'Image' },
    { id: 'image-clip', label: 'Clip', category: 'Image' },
    { id: 'image-reload', label: 'Reload', category: 'Image' },
    { id: 'image-path', label: 'Path', category: 'Image' },
    { id: 'image-manager', label: 'Image Manager', category: 'Image' }
  ];

  const COMMAND_INDEX = new Map(COMMAND_METADATA.map((cmd) => [cmd.id, cmd]));
  const COMMAND_HINTS = {};
  COMMAND_METADATA.forEach((cmd) => {
    if (cmd.hint) {
      COMMAND_HINTS[cmd.id] = cmd.hint;
    }
  });

  function defaultDocumentSerializer({ record }) {
    if (!record || !record.doc) {
      return typeof record?.sourceText === 'string' ? record.sourceText : '';
    }
    const parser = state.parser || (typeof window !== "undefined" && window.DxfParser ? new window.DxfParser() : null);
    if (!parser || typeof parser.parse !== "function" || typeof parser.serializeTree !== "function") {
      return typeof record.sourceText === 'string' ? record.sourceText : '';
    }
    const sourceText = typeof record.sourceText === 'string' ? record.sourceText : '';
    let nodes = null;
    if (sourceText) {
      try {
        nodes = parser.parse(sourceText);
      } catch (error) {
        console.warn("[editor] Failed to parse DXF for serialization; falling back to skeleton.", error);
      }
    }
    if (!Array.isArray(nodes) || !nodes.length) {
      nodes = buildEmptyDxfSkeleton();
    }
    let nextId = getMaxNodeId(nodes) + 1;
    const ensure = ensureEntitiesSection(nodes, nextId);
    const entitiesSection = ensure.section;
    let endMarker = ensure.endMarker;
    nextId = ensure.nextId;
    const built = buildEntityNodesFromDocument(record, record.doc, nextId);
    const entityNodes = built.nodes;
    nextId = built.nextId;
    if (!endMarker) {
      endMarker = createEndSectionNode('ENTITIES');
      endMarker.id = nextId++;
    }
    entitiesSection.children = entityNodes.concat(endMarker ? [endMarker] : []);
    return parser.serializeTree(nodes);
  }

  function buildEmptyDxfSkeleton() {
    const sections = ['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'];
    const nodes = [];
    let nextId = 1;
    sections.forEach((name) => {
      const sectionNode = createSectionNode(name);
      sectionNode.id = nextId++;
      if (Array.isArray(sectionNode.children)) {
        sectionNode.children.forEach((child) => {
          child.id = nextId++;
        });
      }
      nodes.push(sectionNode);
    });
    const eofNode = createEofNode();
    eofNode.id = nextId++;
    nodes.push(eofNode);
    return nodes;
  }

  function createSectionNode(name) {
    return {
      id: 0,
      type: 'SECTION',
      line: 0,
      code: 0,
      properties: [{ code: 2, value: name }],
      children: [createEndSectionNode(name)],
      expanded: false,
      isContainer: true,
      parentType: null,
      sectionName: name
    };
  }

  function createEndSectionNode(name) {
    return {
      id: 0,
      type: 'ENDSEC',
      line: 0,
      code: 0,
      properties: [],
      children: [],
      expanded: false,
      isContainer: false,
      parentType: 'SECTION',
      sectionName: name || 'ENTITIES',
      isEndMarker: true
    };
  }

  function createEofNode() {
    return {
      id: 0,
      type: 'EOF',
      line: 0,
      code: 0,
      properties: [],
      children: [],
      expanded: false,
      isEOF: true
    };
  }

  function getMaxNodeId(nodes) {
    let maxId = 0;
    const visit = (node) => {
      if (!node) {
        return;
      }
      const numericId = Number(node.id);
      if (Number.isFinite(numericId) && numericId > maxId) {
        maxId = numericId;
      }
      if (Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    };
    if (Array.isArray(nodes)) {
      nodes.forEach(visit);
    }
    return maxId;
  }

  function ensureEntitiesSection(nodes, startId) {
    let nextId = Number.isFinite(startId) ? startId : getMaxNodeId(nodes) + 1;
    let section = null;
    if (Array.isArray(nodes)) {
      section = nodes.find((node) => node && node.sectionName === 'ENTITIES');
    }
    if (!section) {
      section = createSectionNode('ENTITIES');
      section.id = nextId++;
      if (Array.isArray(section.children)) {
        section.children.forEach((child) => { child.id = nextId++; });
      }
      const eofIndex = Array.isArray(nodes)
        ? nodes.findIndex((node) => node && node.type === 'EOF')
        : -1;
      if (Array.isArray(nodes)) {
        if (eofIndex >= 0) {
          nodes.splice(eofIndex, 0, section);
        } else {
          nodes.push(section);
        }
      }
      return { section, endMarker: section.children[section.children.length - 1], nextId };
    }
    section.sectionName = section.sectionName || 'ENTITIES';
    section.isContainer = true;
    if (!Array.isArray(section.properties) || !section.properties.length) {
      section.properties = [{ code: 2, value: 'ENTITIES' }];
    }
    if (!Array.isArray(section.children)) {
      section.children = [];
    }
    let endMarker = section.children.find((child) => child && child.type === 'ENDSEC');
    if (!endMarker) {
      endMarker = createEndSectionNode('ENTITIES');
      endMarker.id = nextId++;
    } else {
      endMarker.sectionName = endMarker.sectionName || 'ENTITIES';
    }
    return { section, endMarker, nextId };
  }

  function buildEntityNodesFromDocument(record, doc, startId) {
    const entityList = Array.isArray(doc && doc.entities) ? doc.entities : [];
    let nextId = Number.isFinite(startId) ? startId : 1;
    const entities = [];
    entityList.forEach((entity) => {
      if (!entity || typeof entity !== "object") {
        return;
      }
      const node = createEntityNode(entity, nextId++);
      entities.push(node);
    });
    return { nodes: entities, nextId };
  }

  function createEntityNode(entity, nodeId) {
    const tags = [];
    const raw = Array.isArray(entity.rawTags) ? entity.rawTags : [];
    raw.forEach((tag) => {
      if (!tag) {
        return;
      }
      const codeNumeric = Number(tag.code);
      const code = Number.isFinite(codeNumeric) ? codeNumeric : tag.code;
      tags.push({
        code,
        value: formatDxfValue(tag.value)
      });
    });

    const ensureTag = (code, value, options = {}) => {
      const existing = tags.find((tag) => Number(tag.code) === Number(code));
      if (existing) {
        existing.value = formatDxfValue(value);
        return;
      }
      const entry = { code: Number(code), value: formatDxfValue(value) };
      if (options.prepend) {
        tags.unshift(entry);
      } else {
        tags.push(entry);
      }
    };

    if (entity.handle) {
      ensureTag(5, String(entity.handle).trim().toUpperCase(), { prepend: true });
    }
    ensureTag(8, entity.layer || '0', { prepend: true });

    const node = {
      id: nodeId,
      type: entity.type ? String(entity.type).trim().toUpperCase() : 'ENTITY',
      line: 0,
      code: 0,
      properties: tags.map((tag) => ({
        code: tag.code,
        value: formatDxfValue(tag.value)
      })),
      children: [],
      expanded: false,
      isContainer: false,
      parentType: 'SECTION',
      sectionName: 'ENTITIES'
    };
    return node;
  }

  function formatDxfValue(value) {
    if (value == null) {
      return '0';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return '0';
      }
      const fixed = value.toFixed(6);
      return fixed.replace(/\.?0+$/, '') || '0';
    }
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }
    return String(value);
  }

  const state = {
    bootstrapped: false,
    resizeObserver: null,
    parser: null,
    dataController: null,
    surfaceManager: null,
    overlayController: null,
    ribbonInitialized: false,
    editingApi: null,
    activeCommand: null,
    commandListeners: new Set(),
    documents: new Map(),
    currentDocId: null,
    serializer: null,
    ribbonPeekActive: false,
    ribbonPeekTimer: null,
    ribbonPeekBound: false,
    ribbonHotkeysBound: false,
    ribbonGlobalPointerBound: false,
    status: Object.assign({}, defaultStatus),
    palette: {
      open: false,
      filter: '',
      activeIndex: 0,
      previousFocus: null,
      commands: COMMAND_METADATA.slice(),
      filtered: COMMAND_METADATA.slice(),
      history: Array.isArray(persistedState.paletteHistory)
        ? persistedState.paletteHistory.filter((id, index, arr) => typeof id === 'string' && arr.indexOf(id) === index).slice(0, 15)
        : [],
      renderItems: COMMAND_METADATA.slice().map((meta) => ({ meta, isRecent: false }))
    },
    globalDragBound: false,
    viewToggles: Object.assign({}, VIEW_TOGGLE_DEFAULTS, persistedState.viewToggles && typeof persistedState.viewToggles === 'object'
      ? persistedState.viewToggles
      : {}),
    disabledCommands: new Set(),
    persistence: {
      ribbonTab: typeof persistedState.ribbonTab === 'string' ? persistedState.ribbonTab : null,
      ribbonCollapsed: typeof persistedState.ribbonCollapsed === 'boolean' ? persistedState.ribbonCollapsed : false,
      storageAvailable: storage.available()
    }
  };
  const statusMessages = {
    noRenderer: 'DXF renderer not ready yet.',
    noScene: 'Load a DXF drawing to use this control.'
  };

  function ensureStatusDom() {
    if (!dom.statusMessage) {
      dom.statusMessage = document.getElementById("editorStatusMessage");
      dom.statusCommand = document.getElementById("editorStatusCommand");
      dom.statusCursor = document.getElementById("editorStatusCursor");
      dom.statusLayer = document.getElementById("editorStatusLayer");
      dom.statusSnap = document.getElementById("editorStatusSnap");
      dom.statusView = document.getElementById("editorStatusView");
    }
  }

  function renderStatusBar() {
    ensureStatusDom();
    if (dom.statusMessage) {
      dom.statusMessage.textContent = state.status.message;
    }
    if (dom.statusCursor) {
      dom.statusCursor.textContent = `Cursor: ${state.status.cursor}`;
    }
    if (dom.statusCommand) {
      dom.statusCommand.textContent = `Command: ${state.status.command}`;
    }
    if (dom.statusLayer) {
      dom.statusLayer.textContent = `Layers: ${state.status.layerSummary}`;
    }
    if (dom.statusSnap) {
      dom.statusSnap.textContent = `Snap: ${state.status.snapSummary}`;
    }
    if (dom.statusView) {
      dom.statusView.textContent = `View: ${state.status.viewSummary}`;
    }
  }

  function updateStatus(message) {
    state.status.message = message || defaultStatus.message;
    renderStatusBar();
  }

  function getCommandMeta(commandId) {
    return commandId ? (COMMAND_INDEX.get(commandId) || { id: commandId, label: commandId, category: 'General' }) : null;
  }

  function getCommandLabel(commandId) {
    const meta = getCommandMeta(commandId);
    return meta && meta.label ? meta.label : (commandId || '—');
  }

  function setCommandStatusLabel(label) {
    const resolved = label || defaultStatus.command;
    state.status.command = resolved;
    renderStatusBar();
    return resolved;
  }

  function setCommandStatus(commandId) {
    return setCommandStatusLabel(getCommandLabel(commandId));
  }

  function setCursorHint(hint) {
    state.status.cursor = hint || defaultStatus.cursor;
    renderStatusBar();
  }

  function resetCursorHint() {
    setCursorHint(defaultStatus.cursor);
  }

  function setLayerSummary(summary) {
    state.status.layerSummary = summary != null && summary !== ''
      ? summary
      : defaultStatus.layerSummary;
    renderStatusBar();
  }

  function setSnapSummary(summary) {
    state.status.snapSummary = summary != null && summary !== ''
      ? summary
      : defaultStatus.snapSummary;
    renderStatusBar();
  }

  function refreshRendererStatus() {
    const overlay = state.overlayController;
    if (!overlay || !overlay.currentSceneGraph) {
      const record = state.currentDocId ? state.documents.get(state.currentDocId) : null;
      if (record && record.doc && record.doc.sceneGraph && record.doc.sceneGraph.tables && record.doc.sceneGraph.tables.layers) {
        const layerTable = record.doc.sceneGraph.tables.layers;
        const totalLayers = layerTable && typeof layerTable === 'object'
          ? Object.keys(layerTable).length
          : 0;
        state.status.layerSummary = totalLayers ? `${totalLayers} layers` : defaultStatus.layerSummary;
      } else {
        state.status.layerSummary = defaultStatus.layerSummary;
      }
      state.status.snapSummary = defaultStatus.snapSummary;
      state.status.viewSummary = buildViewSummary(defaultStatus.viewSummary);
      renderStatusBar();
      return;
    }

    let layerSummary = defaultStatus.layerSummary;
    if (typeof overlay.computeLayerVisibilitySummary === "function") {
      const summary = overlay.computeLayerVisibilitySummary();
      if (summary) {
        layerSummary = summary;
      }
    } else if (overlay.currentLayerCatalog && overlay.currentLayerCatalog.size) {
      layerSummary = `${overlay.currentLayerCatalog.size} total`;
    }
    state.status.layerSummary = layerSummary;

    let snapSummary = defaultStatus.snapSummary;
    const snapState = overlay.snapState;
    if (snapState && snapState.active) {
      const label = snapState.label || (typeof overlay.getSnapTypeLabel === "function"
        ? overlay.getSnapTypeLabel(snapState.type)
        : snapState.type);
      if (label) {
        snapSummary = label;
      }
    }
    state.status.snapSummary = snapSummary;

    let viewSummary = defaultStatus.viewSummary;
    if (typeof overlay.getActiveViewState === "function") {
      const viewState = overlay.getActiveViewState();
      if (viewState && viewState.mode !== 'auto') {
        const scale = Number.isFinite(viewState.scale) ? viewState.scale : null;
        const rotation = Number.isFinite(viewState.rotationRad) ? (viewState.rotationRad * 180 / Math.PI) : 0;
        const normalizedRotation = ((rotation % 360) + 360) % 360;
        const rotationLabel = Math.abs(normalizedRotation) < 0.05 ? '0°' : `${normalizedRotation.toFixed(1)}°`;
        const scaleLabel = scale ? scale.toFixed(scale >= 100 ? 0 : 2) : '—';
        viewSummary = `Scale ${scaleLabel}, ${rotationLabel}`;
      }
    }
    state.status.viewSummary = buildViewSummary(viewSummary);
    renderStatusBar();
  }

  function buildViewSummary(baseSummary) {
    const toggles = state.viewToggles || {};
    const defaults = VIEW_TOGGLE_DEFAULTS;
    const extras = [];
    if (toggles.grid !== defaults.grid) extras.push(toggles.grid ? 'Grid' : 'Grid Off');
    if (toggles.ucsIcon !== defaults.ucsIcon) extras.push(toggles.ucsIcon ? 'UCS' : 'UCS Off');
    if (toggles.annotations !== defaults.annotations) extras.push(toggles.annotations ? 'Annot On' : 'Annot Off');
    if (toggles.sectionPlanes !== defaults.sectionPlanes) extras.push(toggles.sectionPlanes ? 'Sections' : 'Sections Off');
    if (!extras.length) {
      return baseSummary;
    }
    return `${baseSummary} (${extras.join(', ')})`;
  }

  function createPersistentStorage(namespace) {
    if (typeof window === "undefined" || !window) {
      return {
        get() { return null; },
        set() { return false; },
        remove() { return false; },
        available() { return false; }
      };
    }
    const prefix = `dxf:${namespace || 'storage'}:`;
    let available = false;
    try {
      if (window.localStorage) {
        const probeKey = `${prefix}__probe__`;
        window.localStorage.setItem(probeKey, "1");
        window.localStorage.removeItem(probeKey);
        available = true;
      }
    } catch (error) {
      console.warn("[editor] localStorage unavailable:", error);
      available = false;
    }
    const safeGet = (key, fallback) => {
      if (!available || !window.localStorage) {
        return fallback;
      }
      try {
        const raw = window.localStorage.getItem(prefix + key);
        if (raw == null) {
          return fallback;
        }
        return JSON.parse(raw);
      } catch (error) {
        console.warn("[editor] Failed reading storage key", key, error);
        return fallback;
      }
    };
    const safeSet = (key, value) => {
      if (!available || !window.localStorage) {
        return false;
      }
      try {
        if (value === undefined) {
          window.localStorage.removeItem(prefix + key);
        } else {
          window.localStorage.setItem(prefix + key, JSON.stringify(value));
        }
        return true;
      } catch (error) {
        console.warn("[editor] Failed persisting storage key", key, error);
        available = false;
        return false;
      }
    };
    const safeRemove = (key) => {
      if (!available || !window.localStorage) {
        return false;
      }
      try {
        window.localStorage.removeItem(prefix + key);
        return true;
      } catch (error) {
        console.warn("[editor] Failed removing storage key", key, error);
        return false;
      }
    };
    return {
      get: safeGet,
      set: safeSet,
      remove: safeRemove,
      available() {
        return available;
      }
    };
  }

  function setViewToggle(key, value, label) {
    if (typeof value !== "boolean") {
      value = !state.viewToggles[key];
    }
    if (state.viewToggles[key] === value) {
      return value;
    }
    state.viewToggles[key] = value;
    applyViewTogglesToSurface();
    updateStatus(`${label || key} ${value ? 'enabled' : 'disabled'}.`);
    persistViewToggles();
    refreshRendererStatus();
    return value;
  }

  function toggleViewToggle(key, label) {
    return setViewToggle(key, !state.viewToggles[key], label);
  }

  function applyViewTogglesToSurface() {
    if (!state.surfaceManager) {
      return;
    }
    if (!state.surfaceManager.viewToggles) {
      state.surfaceManager.viewToggles = {};
    }
    Object.assign(state.surfaceManager.viewToggles, state.viewToggles);
    reRenderSurfaceWithCurrentView();
  }

  function scheduleStatusRefresh() {
    window.requestAnimationFrame(() => refreshRendererStatus());
  }

  function persistViewToggles() {
    if (!storage || typeof storage.set !== "function") {
      return;
    }
    storage.set("viewToggles", state.viewToggles);
  }

  function ensureLayoutDom() {
    if (!dom.ribbon) {
      dom.ribbon = document.getElementById("editorRibbon");
    }
    if (!dom.ribbonPanels) {
      dom.ribbonPanels = dom.ribbon
        ? dom.ribbon.querySelector(".ribbon-panels")
        : document.querySelector(".ribbon-panels");
    }
    if (!dom.viewport) {
      dom.viewport = document.getElementById("editorViewport");
    }
    if (!dom.openFileInput) {
      dom.openFileInput = document.getElementById("editorOpenFileInput");
    }
  }

  function updateRibbonDensity() {
    ensureLayoutDom();
    if (!dom.ribbon) {
      return;
    }
    const collapsed = dom.ribbon.classList.contains("is-collapsed");
    if (collapsed && !state.ribbonPeekActive) {
      return;
    }
    const activePanel = document.querySelector(".ribbon-panel.is-visible") ||
      document.querySelector(".ribbon-panel:not([hidden])");
    if (!activePanel) {
      return;
    }
    const shouldCondense = activePanel.scrollWidth - activePanel.clientWidth > 8;
    dom.ribbon.classList.toggle("is-condensed", shouldCondense);
  }

  function getOverlayController() {
    return state.overlayController || null;
  }

  function getSurfaceManager() {
    return state.surfaceManager || null;
  }

  function getViewportElementRef() {
    ensureLayoutDom();
    return dom.viewport || null;
  }

  function attachOverlayHooks(overlay) {
    if (!overlay || overlay.__editorHooksAttached) {
      return;
    }
    if (!overlay.viewportEl) {
      ensureLayoutDom();
      overlay.viewportEl = dom.viewport || document.getElementById("editorViewport") || null;
    }
    const wrap = (method, after) => {
      if (!overlay || typeof overlay[method] !== "function") {
        return;
      }
      const original = overlay[method].bind(overlay);
      overlay[method] = function (...args) {
        const result = original(...args);
        try {
          after(result, args);
        } catch (error) {
          console.error(`[editor] Overlay hook for ${method} failed:`, error);
        }
        return result;
      };
    };
    wrap("setActiveSnapCandidate", () => scheduleStatusRefresh());
    wrap("clearSnapIndicator", () => scheduleStatusRefresh());
    wrap("applyLayerStateToSurface", () => scheduleStatusRefresh());
    wrap("renderSceneGraph", () => scheduleStatusRefresh());
    wrap("renderPlaceholder", () => scheduleStatusRefresh());
    overlay.__editorHooksAttached = true;
  }

  let dragDepth = 0;

  function bindFileHandlers() {
    ensureLayoutDom();
    if (dom.openFileInput && !dom.openFileInput.__editorBound) {
      dom.openFileInput.addEventListener("change", handleFileInputChange);
      dom.openFileInput.__editorBound = true;
    }
    const viewport = dom.viewport || document.body;
    if (viewport && !viewport.__editorDragBound) {
      const onDragOver = (event) => {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "copy";
        }
      };
      const onDragEnter = (event) => {
        event.preventDefault();
        dragDepth += 1;
        viewport.classList.add("is-dragover");
      };
      const onDragLeave = (event) => {
        event.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) {
          viewport.classList.remove("is-dragover");
        }
      };
      const onDrop = (event) => {
        event.preventDefault();
        dragDepth = 0;
        viewport.classList.remove("is-dragover");
        const files = event.dataTransfer ? event.dataTransfer.files : null;
        if (files && files.length) {
          handleFiles(files);
        }
      };
      viewport.addEventListener("dragenter", onDragEnter);
      viewport.addEventListener("dragleave", onDragLeave);
      viewport.addEventListener("dragover", onDragOver);
      viewport.addEventListener("drop", onDrop);
      viewport.__editorDragBound = true;
    }
    if (!state.globalDragBound) {
      ["dragenter", "dragover", "dragleave", "drop"].forEach((type) => {
        window.addEventListener(type, (event) => {
          if (type === "dragover" || type === "dragenter") {
            event.preventDefault();
          }
          if (type === "drop") {
            event.preventDefault();
            dragDepth = 0;
            if (dom.viewport) {
              dom.viewport.classList.remove("is-dragover");
            }
          }
          if (type === "dragleave" && event.target === document) {
            dragDepth = 0;
            if (dom.viewport) {
              dom.viewport.classList.remove("is-dragover");
            }
          }
        });
      });
      state.globalDragBound = true;
    }
  }

  function handleFileInputChange(event) {
    const input = event.target;
    if (!input) {
      return;
    }
    const files = input.files;
    if (files && files.length) {
      handleFiles(files);
    }
    input.value = "";
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file && file.name);
    if (!files.length) {
      updateStatus("No files to load.");
      return false;
    }
    loadDxfFile(files[0]);
    return true;
  }

  function loadDxfFile(file) {
    if (!file) {
      return;
    }
    if (!/\.dxf$/i.test(file.name)) {
      updateStatus(`Unsupported file type: ${file.name}. Only DXF files are supported.`);
      return;
    }
    updateStatus(`Loading ${file.name}...`);
    const reader = new FileReader();
    reader.onerror = () => {
      updateStatus(`Failed to read ${file.name}.`);
    };
    reader.onload = () => {
      const sourceText = reader.result;
      if (typeof sourceText !== "string") {
        updateStatus(`Unable to decode ${file.name}.`);
        return;
      }
      ingestDxfDocument({ name: file.name, sourceText });
    };
    reader.readAsText(file);
  }

  function ingestDxfDocument({ name, sourceText }) {
    if (!state.dataController) {
      updateStatus("Renderer not ready.");
      return;
    }
    try {
      const previousId = state.currentDocId;
      const docId = `doc-${Date.now()}`;
    const doc = state.dataController.ingestDocument({
      tabId: docId,
      fileName: name || 'Untitled',
      sourceText
    });
      if (!doc || !doc.sceneGraph) {
        updateStatus(`Unable to parse ${name || 'drawing'}.`);
        return;
      }
      doc.tabId = docId;
      const record = {
        id: docId,
        name: name || 'Untitled',
        sourceText,
        doc,
        tab: { id: docId, name: name || 'Untitled' },
        pane: 'model',
        mutations: [],
        dirty: false
      };
      if (previousId && previousId !== docId) {
        state.dataController.releaseDocument(previousId);
      }
      state.documents.clear();
      state.documents.set(docId, record);
      state.currentDocId = docId;
      state.viewToggles = Object.assign({}, VIEW_TOGGLE_DEFAULTS);
      renderDocument(record);
      updateStatus(`Loaded ${record.name}.`);
    } catch (error) {
      console.error('[editor] Failed to ingest DXF:', error);
      updateStatus(`Failed to load ${name || 'drawing'}.`);
    }
  }

  function getActiveDocumentRecord() {
    return state.currentDocId ? state.documents.get(state.currentDocId) : null;
  }

  function renderDocument(record) {
    if (!record || !record.doc || !state.surfaceManager) {
      return false;
    }
    attachOverlayHooks(state.overlayController);
    sizeViewportLayers();
    let frame = null;
    try {
      frame = state.surfaceManager.renderScene(record.doc.sceneGraph);
    } catch (error) {
      console.error("[editor] surfaceManager.renderScene failed:", error);
    }
    if (state.overlayController && typeof state.overlayController.renderSceneGraph === "function") {
      try {
        state.overlayController.renderSceneGraph(record.tab, record.doc, record.pane || 'model');
      } catch (error) {
        console.error("[editor] overlay.renderSceneGraph failed:", error);
        if (!frame) {
          frame = state.surfaceManager.renderScene(record.doc.sceneGraph);
        }
      }
    } else if (!frame) {
      frame = state.surfaceManager.renderScene(record.doc.sceneGraph);
    }
  if (typeof state.surfaceManager.resume === "function") {
    state.surfaceManager.resume();
  }
  updateRibbonDensity();
  setCommandStatusLabel(record.name || '—');
    updateDocumentTitle(record);
    applyViewTogglesToSurface();
    updateCommandAvailability();
    scheduleStatusRefresh();
    return true;
  }

  function rerenderActiveDocument() {
    const record = getActiveDocumentRecord();
    if (!record) {
      return false;
    }
    return renderDocument(record);
  }

  function updateDocumentTitle(record) {
    const docTitleEl = document.getElementById("ribbonActiveDocument");
    if (!docTitleEl) {
      return;
    }
    const name = record && record.name ? record.name : 'Untitled.dxf';
    const suffix = record && record.dirty ? '*' : '';
    docTitleEl.textContent = `${name}${suffix}`;
  }

  function markDocumentDirty(record, mutation) {
    if (!record) {
      return;
    }
    record.dirty = true;
    if (mutation) {
      record.mutations.push(mutation);
      if (record.doc && record.doc.sceneGraph) {
        const log = record.doc.sceneGraph._mutationLog || (record.doc.sceneGraph._mutationLog = []);
        log.push(Object.assign({ timestamp: mutation.timestamp || Date.now() }, mutation));
      }
    }
    updateDocumentTitle(record);
    setCommandStatusLabel(record.name ? `${record.name}${record.dirty ? '*' : ''}` : 'Unsaved');
  }

  function recordMutation(mutation) {
    const record = getActiveDocumentRecord();
    if (!record) {
      return;
    }
    markDocumentDirty(record, mutation);
    updateStatus(mutation && mutation.message
      ? mutation.message
      : 'Document updated.');
    refreshRendererStatus();
  }

  function clearActiveDocument(message) {
    const currentRecord = getActiveDocumentRecord();
    if (currentRecord && state.dataController) {
      state.dataController.releaseDocument(currentRecord.id);
    }
    state.documents.clear();
    state.currentDocId = null;
    if (state.surfaceManager) {
      if (typeof state.surfaceManager.clear === "function") {
        state.surfaceManager.clear();
      }
      if (typeof state.surfaceManager.renderMessage === "function") {
        state.surfaceManager.renderMessage('Open a DXF file to begin editing.');
      }
    }
    setLayerSummary(defaultStatus.layerSummary);
    setSnapSummary(defaultStatus.snapSummary);
    state.status.viewSummary = defaultStatus.viewSummary;
    resetCursorHint();
    setCommandStatusLabel(defaultStatus.command);
    updateDocumentTitle(null);
    state.viewToggles = Object.assign({}, VIEW_TOGGLE_DEFAULTS);
    renderStatusBar();
    updateStatus(message || 'Workspace cleared.');
    updateCommandAvailability();
  }

  function triggerDownload(filename, contents, mimeType) {
    const blob = new Blob([contents], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    requestAnimationFrame(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  function handleNewDrawingCommand() {
    clearActiveDocument('Started a new drawing.');
    return true;
  }

  function handleOpenDrawingCommand() {
    ensureLayoutDom();
    if (!dom.openFileInput) {
      updateStatus('Open command unavailable.');
      return true;
    }
    dom.openFileInput.value = '';
    dom.openFileInput.click();
    return true;
  }

  function handleSaveDrawingCommand() {
    const record = getActiveDocumentRecord();
    if (!record) {
      updateStatus('No drawing loaded to save.');
      return true;
    }
    const filename = record.name && /\.dxf$/i.test(record.name)
      ? record.name
      : `${record.name || 'drawing'}.dxf`;
    let contents;
    let mimeType = 'application/dxf';

    if (typeof state.serializer === "function") {
      try {
        const serializerResult = state.serializer({
          record,
          parser: state.parser,
          dataController: state.dataController,
          mutations: record.mutations ? record.mutations.slice() : []
        });
        if (typeof serializerResult === "string") {
          contents = serializerResult;
        } else if (serializerResult && typeof serializerResult === "object") {
          if (serializerResult.name) {
            filename = serializerResult.name;
          }
          if (serializerResult.mimeType) {
            mimeType = serializerResult.mimeType;
          }
          if (typeof serializerResult.contents === "string") {
            contents = serializerResult.contents;
          } else if (typeof serializerResult.data === "string") {
            contents = serializerResult.data;
          }
        }
      } catch (error) {
        console.error("[editor] Custom serializer failed:", error);
        updateStatus("Custom save handler failed; falling back to default export.");
      }
    }

    if (!contents) {
      if (record.mutations && record.mutations.length) {
        contents = JSON.stringify({
          name: record.name,
          savedAt: new Date().toISOString(),
          mutations: record.mutations,
          sceneGraph: record.doc && record.doc.sceneGraph ? record.doc.sceneGraph : null
        }, null, 2);
        mimeType = 'application/json';
      } else if (typeof record.sourceText === 'string') {
        contents = record.sourceText;
      } else {
        contents = JSON.stringify(record.doc, null, 2);
        mimeType = 'application/json';
      }
    }

    triggerDownload(filename, contents, mimeType);
    record.dirty = false;
    record.mutations = [];
    if (mimeType === 'application/dxf' && typeof contents === 'string') {
      record.sourceText = contents;
    }
    updateDocumentTitle(record);
    updateStatus(`Saved ${filename}.`);
    return true;
  }

  function defaultStubCommand(label) {
    updateStatus(`${label} is not available yet.`);
    return true;
  }

  function handleWorkspaceSwitchCommand() {
    return defaultStubCommand('Workspace switching');
  }

  function handleToggleHelpCommand() {
    return defaultStubCommand('Help panel');
  }

  function handleUserAccountCommand() {
    return defaultStubCommand('Account management');
  }

  function isRibbonCollapsed() {
    ensureLayoutDom();
    return !!(dom.ribbon && dom.ribbon.classList.contains('is-collapsed'));
  }

  function cancelRibbonPeekHide() {
    if (state.ribbonPeekTimer) {
      window.clearTimeout(state.ribbonPeekTimer);
      state.ribbonPeekTimer = null;
    }
  }

  function collapseRibbonPeek(immediate) {
    if (!state.ribbonPeekActive) {
      cancelRibbonPeekHide();
      return false;
    }
    if (!dom.ribbon) {
      state.ribbonPeekActive = false;
      cancelRibbonPeekHide();
      return false;
    }
    if (immediate) {
      dom.ribbon.classList.remove('is-peek');
      dom.ribbon.classList.remove('is-condensed');
      state.ribbonPeekActive = false;
      cancelRibbonPeekHide();
      return true;
    }
    cancelRibbonPeekHide();
    state.ribbonPeekTimer = window.setTimeout(() => {
      dom.ribbon.classList.remove('is-peek');
      dom.ribbon.classList.remove('is-condensed');
      state.ribbonPeekActive = false;
      cancelRibbonPeekHide();
    }, 220);
    return true;
  }

  function ensureRibbonPeek() {
    ensureLayoutDom();
    if (!dom.ribbon || !isRibbonCollapsed()) {
      return false;
    }
    if (!state.ribbonPeekActive) {
      dom.ribbon.classList.add('is-peek');
      state.ribbonPeekActive = true;
      window.requestAnimationFrame(() => updateRibbonDensity());
    } else {
      cancelRibbonPeekHide();
    }
    bindRibbonPeekGuards();
    bindGlobalRibbonGuards();
    return true;
  }

  function bindRibbonPeekGuards() {
    ensureLayoutDom();
    if (!dom.ribbon || state.ribbonPeekBound) {
      return;
    }
    const onPointerEnter = () => cancelRibbonPeekHide();
    const onPointerLeave = () => {
      if (isRibbonCollapsed()) {
        collapseRibbonPeek(false);
      }
    };
    const onFocusOut = (event) => {
      if (!dom.ribbon) {
        return;
      }
      if (!dom.ribbon.contains(event.relatedTarget)) {
        collapseRibbonPeek(false);
      }
    };
    dom.ribbon.addEventListener("pointerenter", onPointerEnter);
    dom.ribbon.addEventListener("pointerleave", onPointerLeave);
    dom.ribbon.addEventListener("focusin", onPointerEnter);
    dom.ribbon.addEventListener("focusout", onFocusOut);
    state.ribbonPeekBound = true;
  }

  function bindGlobalRibbonGuards() {
    if (state.ribbonGlobalPointerBound) {
      return;
    }
    document.addEventListener("pointerdown", (event) => {
      if (!state.ribbonPeekActive || !dom.ribbon) {
        return;
      }
      if (dom.ribbon.contains(event.target)) {
        return;
      }
      collapseRibbonPeek(true);
    });
    state.ribbonGlobalPointerBound = true;
  }

  function bindRibbonHotkeys() {
    if (state.ribbonHotkeysBound) {
      return;
    }
    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented) {
        return;
      }
      const key = event.key;
      if (key === "F1" && event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        handleMinimizeRibbonCommand();
        return;
      }
      if (key === "Escape" && state.ribbonPeekActive && isRibbonCollapsed()) {
        collapseRibbonPeek(true);
      }
    });
    state.ribbonHotkeysBound = true;
  }

  function handleMinimizeRibbonCommand() {
    ensureLayoutDom();
    if (!dom.ribbon) {
      return false;
    }
    const collapsed = dom.ribbon.classList.toggle('is-collapsed');
    updateRibbonCollapseAffordance(collapsed);
    if (collapsed) {
      dom.ribbon.classList.remove("is-condensed");
    }
    collapseRibbonPeek(true);
    if (state.persistence) {
      state.persistence.ribbonCollapsed = collapsed;
      if (storage && typeof storage.set === "function") {
        storage.set("ribbonCollapsed", collapsed);
      }
    }
    window.requestAnimationFrame(() => {
      sizeViewportLayers();
      refreshRendererStatus();
      if (!collapsed) {
        updateRibbonDensity();
      }
    });
    updateStatus(collapsed ? 'Ribbon collapsed.' : 'Ribbon expanded.');
    return true;
  }

  function updateRibbonCollapseAffordance(collapsed) {
    const toggle = document.querySelector('[data-command="minimize-ribbon"]');
    if (!toggle) {
      return;
    }
    toggle.textContent = collapsed ? '▾' : '▴';
    toggle.setAttribute('aria-label', collapsed ? 'Expand ribbon' : 'Minimize ribbon');
    toggle.setAttribute('title', collapsed ? 'Expand ribbon' : 'Minimize ribbon');
  }

  function handleLayerPropertiesCommand() {
    if (!state.overlayController) {
      updateStatus('Layer manager unavailable.');
      return true;
    }
    if (typeof state.overlayController.setInformationTab === "function") {
      state.overlayController.setInformationTab('layers', { focus: true });
      updateStatus('Layer manager ready.');
    } else {
      updateStatus('Layer manager controls not available.');
    }
    return true;
  }

  function handlePropertiesDialogCommand() {
    return defaultStubCommand('Properties palette');
  }

  function handleClipboardDialogCommand() {
    return defaultStubCommand('Clipboard options');
  }

  function showLayerManager() {
    if (!state.overlayController || typeof state.overlayController.setInformationTab !== "function") {
      updateStatus('Layer manager unavailable.');
      return false;
    }
    state.overlayController.setInformationTab('layers', { focus: true });
    updateStatus('Layer manager ready.');
    return true;
  }

  function registerEditingApi(api) {
    setEditingApi(api || null);
    if (api && typeof api.onRegister === "function") {
      try {
        api.onRegister(window.DxfEditorApp);
      } catch (error) {
        console.error("[editor] Editing API onRegister failed:", error);
      }
    }
    return () => {
      if (getEditingApi() === api) {
        setEditingApi(null);
      }
    };
  }

  function unregisterEditingApi(api) {
    if (!api || getEditingApi() === api) {
      setEditingApi(null);
    }
  }

  function setDocumentSerializer(fn) {
    state.serializer = typeof fn === "function" ? fn : null;
  }

  function cancelActiveCommand(message) {
    if (!state.activeCommand) {
      return;
    }
    const commandName = getCommandLabel(state.activeCommand.id);
    updateStatus(message || `${commandName} canceled.`);
    state.activeCommand = null;
    resetCursorHint();
    setCommandStatusLabel(defaultStatus.command);
    refreshRendererStatus();
  }

  function completeEditingCommand(result = {}) {
    const commandId = result.command || (state.activeCommand && state.activeCommand.id);
    if (typeof result.layerSummary !== "undefined") {
      setLayerSummary(result.layerSummary);
    }
    if (typeof result.snapSummary !== "undefined") {
      setSnapSummary(result.snapSummary);
    }
    if (commandId) {
      setCommandStatusLabel(getCommandLabel(commandId));
    } else {
      setCommandStatusLabel(defaultStatus.command);
    }
    updateStatus(result.message || (commandId ? `${getCommandLabel(commandId)} complete.` : 'Command complete.'));
    state.activeCommand = null;
    resetCursorHint();
    refreshRendererStatus();
  }

  function ensurePaletteDom() {
    if (!dom.commandPalette) {
      dom.commandPalette = document.getElementById("editorCommandPalette");
      dom.commandPaletteInput = document.getElementById("commandPaletteInput");
      dom.commandPaletteList = document.getElementById("commandPaletteList");
      dom.commandPaletteButton = document.getElementById("commandPaletteButton");
    }
  }

  function filterPaletteCommands(query) {
    const text = (query || '').trim().toLowerCase();
    const results = [];
    const seen = new Set();
    const commands = state.palette.commands.slice();
    const pushResult = (meta, isRecent = false) => {
      if (!meta || !meta.id) {
        return;
      }
      if (seen.has(meta.id)) {
        return;
      }
      results.push({ meta, isRecent: !!isRecent });
      seen.add(meta.id);
    };
    if (!text) {
      if (Array.isArray(state.palette.history)) {
        state.palette.history.forEach((commandId) => {
          const meta = COMMAND_INDEX.get(commandId);
          if (meta) {
            pushResult(meta, true);
          }
        });
      }
      commands.forEach((meta) => pushResult(meta, false));
      return results;
    }
    const historySet = new Set(Array.isArray(state.palette.history) ? state.palette.history : []);
    commands.forEach((meta) => {
      const label = meta.label ? meta.label.toLowerCase() : '';
      const id = meta.id ? meta.id.toLowerCase() : '';
      const category = meta.category ? meta.category.toLowerCase() : '';
      if (!text || label.includes(text) || id.includes(text) || category.includes(text)) {
        pushResult(meta, historySet.has(meta.id));
      }
    });
    return results;
  }

  function buildPaletteRenderItems(results, query) {
    const items = [];
    if (!Array.isArray(results) || !results.length) {
      return items;
    }
    const hasQuery = !!(query && query.trim());
    const firstNonRecentIndex = results.findIndex((entry) => !entry.isRecent);
    if (!hasQuery && firstNonRecentIndex > 0) {
      items.push({ type: "header", label: "Recent" });
      for (let i = 0; i < firstNonRecentIndex; i++) {
        items.push({ type: "command", meta: results[i].meta, isRecent: true });
      }
      const remaining = results.slice(firstNonRecentIndex);
      if (remaining.length) {
        items.push({ type: "header", label: "All Commands" });
        remaining.forEach((entry) => {
          items.push({ type: "command", meta: entry.meta, isRecent: !!entry.isRecent });
        });
      }
      return items;
    }
    results.forEach((entry) => {
      items.push({ type: "command", meta: entry.meta, isRecent: !!entry.isRecent });
    });
    return items;
  }

  function findFirstEnabledPaletteIndex(results) {
    if (!Array.isArray(results) || !results.length) {
      return 0;
    }
    for (let i = 0; i < results.length; i++) {
      const meta = results[i] && results[i].meta;
      if (!meta) {
        continue;
      }
      if (state.disabledCommands && state.disabledCommands.has(meta.id)) {
        continue;
      }
      return i;
    }
    return 0;
  }

  function recomputePaletteResults(query) {
    const results = filterPaletteCommands(query || '');
    state.palette.filtered = results;
    state.palette.renderItems = buildPaletteRenderItems(results, query || '');
    state.palette.activeIndex = findFirstEnabledPaletteIndex(results);
  }

  function renderCommandPalette() {
    ensurePaletteDom();
    if (!dom.commandPaletteList) {
      return;
    }
    const list = dom.commandPaletteList;
    list.innerHTML = '';

    const renderItems = Array.isArray(state.palette.renderItems)
      ? state.palette.renderItems
      : [];
    const commandEntries = Array.isArray(state.palette.filtered)
      ? state.palette.filtered
      : [];

    if (!commandEntries.length) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "command-palette-empty";
      emptyItem.textContent = "No commands found.";
      list.appendChild(emptyItem);
      return;
    }

    const fragment = document.createDocumentFragment();
    let commandIndex = -1;
    renderItems.forEach((entry) => {
      if (!entry) {
        return;
      }
      if (entry.type === "header") {
        const headerItem = document.createElement("li");
        headerItem.className = "command-palette-section";
        headerItem.setAttribute("role", "presentation");
        headerItem.textContent = entry.label || '';
        fragment.appendChild(headerItem);
        return;
      }
      if (entry.type !== "command" || !entry.meta) {
        return;
      }
      commandIndex += 1;
      const cmd = entry.meta;
      const item = document.createElement("li");
      item.className = "command-palette-item";
      const isActive = commandIndex === state.palette.activeIndex;
      if (isActive) {
        item.classList.add("is-active");
      }
      if (entry.isRecent) {
        item.classList.add("is-recent");
      }
      const disabled = state.disabledCommands && state.disabledCommands.has(cmd.id);
      if (disabled) {
        item.classList.add("is-disabled");
        item.setAttribute("aria-disabled", "true");
      } else {
        item.setAttribute("aria-disabled", "false");
      }
      item.dataset.command = cmd.id;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", isActive ? "true" : "false");

      const labelSpan = document.createElement("span");
      labelSpan.className = "command-palette-item-label";
      labelSpan.textContent = cmd.label || cmd.id;
      item.appendChild(labelSpan);

      if (cmd.category) {
        const metaSpan = document.createElement("span");
        metaSpan.className = "command-palette-item-meta";
        metaSpan.textContent = cmd.category;
        item.appendChild(metaSpan);
      }

      fragment.appendChild(item);
    });

    list.appendChild(fragment);
    scrollActivePaletteItemIntoView();
  }

  function scrollActivePaletteItemIntoView() {
    ensurePaletteDom();
    if (!dom.commandPaletteList) {
      return;
    }
    const activeItem = dom.commandPaletteList.querySelector(".command-palette-item.is-active");
    if (activeItem && typeof activeItem.scrollIntoView === "function") {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }

  function setPaletteActiveIndex(index) {
    const count = state.palette.filtered.length;
    if (!count) {
      state.palette.activeIndex = 0;
      return;
    }
    let normalized = (index % count + count) % count;
    let guard = 0;
    while (guard < count) {
      const entry = state.palette.filtered[normalized];
      const meta = entry && entry.meta;
      if (meta && (!state.disabledCommands || !state.disabledCommands.has(meta.id))) {
        state.palette.activeIndex = normalized;
        renderCommandPalette();
        return;
      }
      normalized = (normalized + 1) % count;
      guard += 1;
    }
    state.palette.activeIndex = 0;
    renderCommandPalette();
  }

  function openCommandPalette() {
    ensurePaletteDom();
    if (!dom.commandPalette || state.palette.open) {
      return;
    }
    state.palette.open = true;
    state.palette.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    state.palette.filter = '';
    recomputePaletteResults('');
    dom.commandPalette.classList.add("show");
    dom.commandPalette.removeAttribute("hidden");
    renderCommandPalette();
    window.requestAnimationFrame(() => {
      if (dom.commandPaletteInput) {
        dom.commandPaletteInput.value = '';
        dom.commandPaletteInput.focus();
        dom.commandPaletteInput.select();
      }
    });
  }

  function closeCommandPalette() {
    ensurePaletteDom();
    if (!dom.commandPalette || !state.palette.open) {
      return;
    }
    state.palette.open = false;
    dom.commandPalette.classList.remove("show");
    dom.commandPalette.setAttribute("hidden", "true");
    if (state.palette.previousFocus && typeof state.palette.previousFocus.focus === "function") {
      state.palette.previousFocus.focus();
    }
    state.palette.previousFocus = null;
  }

  function selectPaletteCommand(commandId) {
    if (!commandId) {
      return;
    }
    if (state.disabledCommands && state.disabledCommands.has(commandId)) {
      updateStatus('Open a DXF drawing to use this command.');
      return;
    }
    closeCommandPalette();
    dispatchRibbonCommand(commandId);
  }

  function handlePaletteInputChange(event) {
    state.palette.filter = event.target.value;
    recomputePaletteResults(state.palette.filter);
    renderCommandPalette();
  }

  function handlePaletteInputKeydown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setPaletteActiveIndex(state.palette.activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setPaletteActiveIndex(state.palette.activeIndex - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const active = state.palette.filtered[state.palette.activeIndex];
      if (active) {
        selectPaletteCommand(active.meta ? active.meta.id : active.id);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeCommandPalette();
    }
  }

  function handlePaletteListClick(event) {
    const item = event.target.closest(".command-palette-item");
    if (!item || !item.dataset.command) {
      return;
    }
    if (item.classList.contains("is-disabled")) {
      updateStatus('Open a DXF drawing to use this command.');
      return;
    }
    selectPaletteCommand(item.dataset.command);
  }

  function handleGlobalKeyDown(event) {
    const isPaletteShortcut = (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'p';
    if (isPaletteShortcut) {
      event.preventDefault();
      if (state.palette.open) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
      return;
    }

    if (state.palette.open && event.key === "Escape") {
      event.preventDefault();
      closeCommandPalette();
    }
  }

  function bindCommandPalette() {
    ensurePaletteDom();
    if (dom.commandPaletteButton) {
      dom.commandPaletteButton.addEventListener("click", (event) => {
        event.preventDefault();
        if (state.palette.open) {
          closeCommandPalette();
        } else {
          openCommandPalette();
        }
      });
    }
    if (dom.commandPaletteInput) {
      dom.commandPaletteInput.addEventListener("input", handlePaletteInputChange);
      dom.commandPaletteInput.addEventListener("keydown", handlePaletteInputKeydown);
    }
    if (dom.commandPaletteList) {
      dom.commandPaletteList.addEventListener("click", handlePaletteListClick);
    }
    const paletteNode = document.getElementById("editorCommandPalette");
    if (paletteNode) {
      paletteNode.querySelectorAll("[data-close-command-palette]").forEach((node) => {
        node.addEventListener("click", (event) => {
          event.preventDefault();
          closeCommandPalette();
        });
      });
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
  }

  function initializeStatusBar() {
    ensureStatusDom();
    renderStatusBar();
  }

  function sizeViewportLayers() {
    const viewport = document.getElementById("editorViewport");
    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const layers = viewport.querySelectorAll(".viewport-layer");
    layers.forEach((canvas) => {
      const pixelWidth = Math.max(1, Math.floor(width * devicePixelRatio));
      const pixelHeight = Math.max(1, Math.floor(height * devicePixelRatio));
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // Reset any 2D canvas transforms so device pixel ratio scaling looks crisp.
      if (canvas.id === "editorCanvas2D") {
        const context2d = canvas.getContext && canvas.getContext("2d");
        if (context2d && typeof context2d.setTransform === "function") {
          context2d.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        }
      }
    });

    if (state.surfaceManager && typeof state.surfaceManager.resize === "function") {
      state.surfaceManager.resize(width, height, devicePixelRatio);
    }
    updateRibbonDensity();
  }

  function withSurface(callback) {
    const surface = state.surfaceManager;
    if (!surface) {
      updateStatus(statusMessages.noRenderer);
      console.warn("[editor] Surface manager unavailable for command.");
      return false;
    }
    try {
      return callback(surface) !== false;
    } catch (error) {
      console.error("[editor] Surface command failed:", error);
      updateStatus("Command failed. Check console for details.");
      return false;
    }
  }

  function withOverlay(callback, options = {}) {
    const overlay = state.overlayController;
    if (!overlay) {
      updateStatus(statusMessages.noRenderer);
      console.warn("[editor] Overlay controller unavailable for command.");
      return false;
    }
    if (options.requireScene && !overlay.currentSceneGraph) {
      updateStatus(statusMessages.noScene);
      return false;
    }
    try {
      return callback(overlay) !== false;
    } catch (error) {
      console.error("[editor] Overlay command failed:", error);
      updateStatus("Command failed. Check console for details.");
      return false;
    }
  }

  function withScene(callback) {
    return withOverlay((overlay) => callback(overlay), { requireScene: true });
  }

  function reRenderSurfaceWithCurrentView() {
    const overlay = state.overlayController;
    const surface = state.surfaceManager;
    if (!overlay || !surface || !overlay.currentSceneGraph || typeof overlay.renderCurrentFrameWithView !== "function") {
      return false;
    }
    const viewState = typeof overlay.getActiveViewState === "function"
      ? overlay.getActiveViewState()
      : null;
    overlay.renderCurrentFrameWithView(viewState || { mode: "auto" });
    refreshRendererStatus();
    return true;
  }

  function dispatchEditorCommand(command, payload = {}) {
    const detail = Object.assign({ command }, payload);
    const event = new CustomEvent("dxf-editor-command", { detail });
    window.dispatchEvent(event);
    state.commandListeners.forEach((listener) => {
      try {
        listener(detail);
      } catch (error) {
        console.error("[editor] Command listener failed:", error);
      }
    });
  }

  function startEditingCommand(command, options = {}) {
    if (!command) {
      return false;
    }
    if (!hasActiveDocument()) {
      updateStatus('Open a DXF drawing to use editing commands.');
      return true;
    }
    state.activeCommand = {
      id: command,
      startedAt: Date.now(),
      options
    };
    const detail = {
      kind: 'editing',
      options: Object.assign({}, options || {}),
      startedAt: state.activeCommand.startedAt,
      activeDocumentId: state.currentDocId,
      status: {
        layer: state.status.layerSummary,
        snap: state.status.snapSummary
      }
    };
    dispatchEditorCommand(command, detail);
    const forwarded = invokeEditingApi(command, Object.assign({ command }, detail));
    if (!forwarded) {
      cancelActiveCommand(`${getCommandLabel(command)} unavailable — editing engine not registered.`);
      return true;
    }
    updateStatus(`Command ready: ${getCommandLabel(command)}`);
    setCommandStatus(command);
    setCursorHint(COMMAND_HINTS[command] || 'Specify next point or select entities');
    recordCommandUsage(command);
    refreshRendererStatus();
    return true;
  }

  function mutateAllLayers(property, value, message) {
    return withScene((overlay) => {
      const catalog = overlay.currentLayerCatalog;
      if (!catalog || !catalog.size) {
        updateStatus("No layer metadata available.");
        return false;
      }
      let mutated = false;
      catalog.forEach((base) => {
        if (!base || !base.name) {
          return;
        }
        overlay.setLayerOverride(base.name, property, value, {
          reRenderSurface: false,
          reRenderTable: false,
          preserveIsolation: true
        });
        mutated = true;
      });
      if (!mutated) {
        updateStatus("Layers unchanged.");
        return false;
      }
      overlay.applyLayerStateToSurface({ reRender: true });
      if (typeof overlay.renderLayerManagerTable === "function") {
        overlay.renderLayerManagerTable();
      }
      if (typeof overlay.updateIsolationSummary === "function") {
        overlay.updateIsolationSummary();
      }
      if (typeof overlay.updateSelectionToolbarUI === "function") {
        overlay.updateSelectionToolbarUI();
      }
      updateStatus(message);
      refreshRendererStatus();
      return true;
    });
  }

  function applyVisualStyle(specifier, label) {
    return withSurface((surface) => {
      if (typeof surface.setVisualStyle !== "function") {
        updateStatus("Visual style controls are unavailable.");
        return false;
      }
      surface.setVisualStyle(specifier);
      reRenderSurfaceWithCurrentView();
      updateStatus(`Visual style: ${label}`);
      setCommandStatusLabel(label);
      refreshRendererStatus();
      return true;
    });
  }

  function defaultCommandFeedback(command) {
    updateStatus(`Command '${command}' is not implemented yet.`);
    return false;
  }

  function hasActiveDocument() {
    const record = getActiveDocumentRecord();
    return !!(record && record.doc && record.doc.status === "ready");
  }

  function recordCommandUsage(commandId) {
    if (!commandId) {
      return;
    }
    if (!state.palette) {
      return;
    }
    if (!state.palette.history) {
      state.palette.history = [];
    }
    const history = state.palette.history;
    const normalized = String(commandId);
    const existingIndex = history.indexOf(normalized);
    if (existingIndex !== -1) {
      history.splice(existingIndex, 1);
    }
    history.unshift(normalized);
    if (history.length > 20) {
      history.length = 20;
    }
    if (storage && typeof storage.set === "function") {
      storage.set("paletteHistory", history);
    }
  }

  function commandRequiresDocument(commandId) {
    if (!commandId) {
      return false;
    }
    return DOCUMENT_REQUIRED_COMMANDS.has(commandId);
  }

  function updateCommandAvailability() {
    const shouldEnable = hasActiveDocument();
    const nextDisabled = new Set();
    DOCUMENT_REQUIRED_COMMANDS.forEach((commandId) => {
      if (!shouldEnable) {
        nextDisabled.add(commandId);
      }
    });
    const changed = (() => {
      if (state.disabledCommands.size !== nextDisabled.size) {
        return true;
      }
      for (const id of nextDisabled) {
        if (!state.disabledCommands.has(id)) {
          return true;
        }
      }
      return false;
    })();
    state.disabledCommands = nextDisabled;
    ensureLayoutDom();
    const nodes = Array.from(document.querySelectorAll("[data-command]"));
    nodes.forEach((node) => {
      if (!node || typeof node.getAttribute !== "function") {
        return;
      }
      const commandId = node.getAttribute("data-command");
      if (!commandId) {
        return;
      }
      const disabled = nextDisabled.has(commandId);
      if (disabled) {
        node.setAttribute("disabled", "true");
        node.setAttribute("aria-disabled", "true");
        node.classList.add("is-disabled");
        if (!node.dataset.originalTitle && node.hasAttribute("title")) {
          node.dataset.originalTitle = node.getAttribute("title");
        }
        const reason = node.getAttribute("data-command-disabled-message") || "Open a DXF drawing to use this command.";
        node.setAttribute("title", reason);
      } else {
        node.removeAttribute("disabled");
        node.removeAttribute("aria-disabled");
        node.classList.remove("is-disabled");
        if (node.dataset.originalTitle) {
          node.setAttribute("title", node.dataset.originalTitle);
        }
      }
    });
    if (changed && state.palette && state.palette.open) {
      renderCommandPalette();
    }
  }

  const EDITING_COMMANDS = new Set([
    "line",
    "polyline",
    "circle",
    "arc",
    "rectangle",
    "spline",
    "ellipse",
    "polygon",
    "hatch",
    "move",
    "rotate",
    "scale",
    "mirror",
    "offset",
    "trim",
    "extend",
    "erase",
    "fillet",
    "cut",
    "copy",
    "copybase",
    "paste",
    "match-properties",
    "mtext",
    "single-line-text",
    "dim-linear",
    "dim-aligned",
    "dim-radius",
    "dim-diameter",
    "dim-angle",
    "dim-ordinate",
    "leader",
    "mleader",
    "mleader-style",
    "center-mark",
    "table",
    "table-style",
    "field",
    "insert-block",
    "insert-block-create",
    "insert-block-edit",
    "insert-block-attributes",
    "insert-attach",
    "insert-xref",
    "insert-image",
    "insert-pdf",
    "insert-data-link"
  ]);

  const DOCUMENT_REQUIRED_COMMANDS = new Set([
    "save-drawing",
    "layer-properties",
    "layer-on",
    "layer-off",
    "layer-freeze",
    "layer-thaw",
    "undo",
    "redo",
    "zoom-extents",
    "zoom-window",
    "zoom-in",
    "zoom-out",
    "pan",
    "orbit",
    "visual-wireframe",
    "visual-shaded",
    "visual-realistic",
    "visual-xray",
    "view-home",
    "view-previous",
    "show-grid",
    "show-ucs",
    "toggle-annotations",
    "toggle-section-planes"
  ]);

  EDITING_COMMANDS.forEach((commandId) => DOCUMENT_REQUIRED_COMMANDS.add(commandId));

  function isEditingCommand(commandId) {
    return EDITING_COMMANDS.has(commandId);
  }

  function getEditingApi() {
    return state.editingApi || null;
  }

  function setEditingApi(api) {
    state.editingApi = api || null;
  }

  function invokeEditingApi(command, detail) {
    const api = getEditingApi();
    if (!api || typeof api.startCommand !== "function") {
      return false;
    }
    try {
      api.startCommand(command, detail);
      return true;
    } catch (error) {
      console.error("[editor] Editing API startCommand failed:", error);
      updateStatus(`Editing API error for ${getCommandLabel(command)}.`);
      return false;
    }
  }

  const COMMAND_ACTIONS = {
    "new-drawing": () => handleNewDrawingCommand(),
    "open-drawing": () => handleOpenDrawingCommand(),
    "save-drawing": () => handleSaveDrawingCommand(),
    "workspace-switcher": () => handleWorkspaceSwitchCommand(),
    "toggle-help": () => handleToggleHelpCommand(),
    "user-account": () => handleUserAccountCommand(),
    "minimize-ribbon": () => handleMinimizeRibbonCommand(),
    "clipboard-dialog": () => handleClipboardDialogCommand(),
    "properties-dialog": () => handlePropertiesDialogCommand(),
    "layer-properties": () => handleLayerPropertiesCommand(),
    undo: () => withScene((overlay) => {
      if (typeof overlay.undoViewNavigation === "function") {
        overlay.undoViewNavigation();
        updateStatus("View navigation undone.");
        return true;
      }
      return false;
    }),
    redo: () => withScene((overlay) => {
      if (typeof overlay.redoViewNavigation === "function") {
        overlay.redoViewNavigation();
        updateStatus("View navigation redone.");
        return true;
      }
      return false;
    }),
    "zoom-extents": () => withScene((overlay) => {
      if (typeof overlay.resetViewNavigation === "function") {
        overlay.resetViewNavigation();
        updateStatus("Zoomed to drawing extents.");
        return true;
      }
      return false;
    }),
    "zoom-in": () => withScene((overlay) => {
      if (typeof overlay.zoomView === "function") {
        overlay.zoomView(1.15);
        updateStatus("Zoomed in.");
        return true;
      }
      return false;
    }),
    "zoom-out": () => withScene((overlay) => {
      if (typeof overlay.zoomView === "function") {
        overlay.zoomView(1 / 1.15);
        updateStatus("Zoomed out.");
        return true;
      }
      return false;
    }),
    "zoom-window": () => {
      updateStatus("Window zoom is not available yet.");
      return false;
    },
    pan: () => withScene((overlay) => {
      if (typeof overlay.panView !== "function") {
        return false;
      }
      const frame = overlay.surfaceManager ? overlay.surfaceManager.lastFrame : null;
      const step = typeof overlay.getPanStep === "function" ? overlay.getPanStep(frame) : 120;
      overlay.panView(0, step * 0.5);
      updateStatus("Panned view.");
      return true;
    }),
    orbit: () => withScene((overlay) => {
      if (typeof overlay.orbitView === "function") {
        overlay.orbitView(15);
        updateStatus("Orbited view by 15°.");
        return true;
      }
      return false;
    }),
    "visual-wireframe": () => applyVisualStyle("wireframe", "Wireframe"),
    "visual-shaded": () => applyVisualStyle("shaded", "Shaded"),
    "visual-realistic": () => applyVisualStyle("realistic", "Realistic"),
    "visual-xray": () => applyVisualStyle("xray", "X-Ray"),
    "layer-on": () => mutateAllLayers("isOn", true, "All layers turned on."),
    "layer-off": () => mutateAllLayers("isOn", false, "All layers turned off."),
    "layer-freeze": () => mutateAllLayers("isFrozen", true, "All layers frozen."),
    "layer-thaw": () => mutateAllLayers("isFrozen", false, "All layers thawed."),
    "view-home": () => withScene((overlay) => {
      if (typeof overlay.resetViewNavigation === "function") {
        overlay.resetViewNavigation();
        updateStatus("Returned to home view.");
        refreshRendererStatus();
        return true;
      }
      return false;
    }),
    "view-previous": () => withScene((overlay) => {
      if (typeof overlay.undoViewNavigation === "function") {
        overlay.undoViewNavigation();
        updateStatus("Returned to previous view.");
        refreshRendererStatus();
        return true;
      }
      return false;
    }),
    "show-grid": () => {
      toggleViewToggle('grid', 'Grid display');
      return true;
    },
    "show-ucs": () => {
      toggleViewToggle('ucsIcon', 'UCS icon');
      return true;
    },
    "toggle-annotations": () => {
      const next = toggleViewToggle('annotations', 'Annotations');
      // annotations toggle indicates visibility; invert for message clarity already handled.
      return true;
    },
    "toggle-section-planes": () => {
      toggleViewToggle('sectionPlanes', 'Section planes');
      return true;
    }
  };

  function dispatchRibbonCommand(command, trigger) {
    if (!command) {
      return false;
    }
    if (state.disabledCommands && state.disabledCommands.has(command)) {
      updateStatus('Open a DXF drawing to use this command.');
      return false;
    }
    let handled = false;
    const handler = COMMAND_ACTIONS[command];
    if (handler) {
      handled = handler(command, trigger);
    } else if (EDITING_COMMANDS.has(command)) {
      handled = startEditingCommand(command, { source: "ribbon" });
    } else {
      handled = defaultCommandFeedback(command);
    }
    if (handled && !EDITING_COMMANDS.has(command)) {
      setCommandStatus(command);
      resetCursorHint();
      refreshRendererStatus();
      recordCommandUsage(command);
    }
    if (handled && trigger) {
      trigger.classList.add("command-flash");
      window.setTimeout(() => trigger.classList.remove("command-flash"), 180);
    }
    if (handled && state.ribbonPeekActive && isRibbonCollapsed()) {
      collapseRibbonPeek(false);
    }
    return handled;
  }

  function bindRibbonTabs() {
    const allTabs = Array.from(document.querySelectorAll('.ribbon-tab[role="tab"]'));
    if (!allTabs.length) {
      return;
    }
    const panels = Array.from(document.querySelectorAll('.ribbon-panel[role="tabpanel"]'));

    const isTabVisible = (button) => {
      if (!button) {
        return false;
      }
      if (button.hasAttribute("hidden") || button.getAttribute("aria-disabled") === "true") {
        return false;
      }
      const contextualHost = button.closest(".ribbon-contextual-tabset");
      if (contextualHost && contextualHost.classList.contains("is-hidden")) {
        return false;
      }
      return button.offsetParent !== null;
    };

    function getNavigableTabs() {
      return allTabs.filter(isTabVisible);
    }

    function activateTab(targetButton, options = {}) {
      if (!targetButton) {
        return;
      }
      const panelId = targetButton.getAttribute("aria-controls");
      allTabs.forEach((button) => {
        const isActive = button === targetButton;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
        button.setAttribute("tabindex", isActive ? "0" : "-1");
      });
      panels.forEach((panel) => {
        if (!panel.id) {
          return;
        }
        const isTarget = panel.id === panelId;
        if (isTarget) {
          panel.classList.add("is-visible");
          panel.removeAttribute("hidden");
        } else {
          panel.classList.remove("is-visible");
          panel.setAttribute("hidden", "true");
        }
      });
      updateRibbonDensity();
      if (panelId && options.persist !== false && storage && typeof storage.set === "function") {
        state.persistence.ribbonTab = panelId;
        storage.set("ribbonTab", panelId);
      }
    }

    function handleTabActivation(button, { viaKeyboard } = {}) {
      const wasActive = button.classList.contains("is-active");
      if (!wasActive) {
        activateTab(button);
      }
      if (isRibbonCollapsed()) {
        if (state.ribbonPeekActive && wasActive && !viaKeyboard) {
          collapseRibbonPeek(false);
        } else {
          ensureRibbonPeek();
        }
      }
    }

    allTabs.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        handleTabActivation(button, { viaKeyboard: false });
      });
      button.addEventListener("dblclick", (event) => {
        event.preventDefault();
        handleMinimizeRibbonCommand();
      });
      button.addEventListener("pointerenter", () => {
        if (!isRibbonCollapsed() || !state.ribbonPeekActive) {
          return;
        }
        cancelRibbonPeekHide();
        if (!button.classList.contains("is-active")) {
          activateTab(button, { persist: false });
        }
      });
      button.addEventListener("keydown", (event) => {
        const key = event.key;
        if (key === "Enter" || key === " ") {
          event.preventDefault();
          handleTabActivation(button, { viaKeyboard: true });
          return;
        }
        const navigable = getNavigableTabs();
        const index = navigable.indexOf(button);
        if (index === -1) {
          return;
        }
        let targetIndex = index;
        if (key === "ArrowRight" || key === "ArrowDown") {
          targetIndex = (index + 1) % navigable.length;
        } else if (key === "ArrowLeft" || key === "ArrowUp") {
          targetIndex = (index - 1 + navigable.length) % navigable.length;
        } else if (key === "Home") {
          targetIndex = 0;
        } else if (key === "End") {
          targetIndex = navigable.length - 1;
        } else {
          return;
        }
        event.preventDefault();
        const nextTab = navigable[targetIndex];
        if (nextTab && nextTab !== button) {
          nextTab.focus();
          activateTab(nextTab);
          if (isRibbonCollapsed()) {
            ensureRibbonPeek();
          }
        } else if (isRibbonCollapsed()) {
          ensureRibbonPeek();
        }
      });
    });

    const storedPanelId = state.persistence && state.persistence.ribbonTab;
    let initial = null;
    if (storedPanelId) {
      initial = allTabs.find((button) => button.getAttribute("aria-controls") === storedPanelId) || null;
    }
    if (!initial || !isTabVisible(initial)) {
      const activeMarked = allTabs.find((button) => button.classList.contains("is-active") && isTabVisible(button));
      initial = activeMarked || getNavigableTabs()[0] || null;
    }
    if (initial) {
      activateTab(initial, { persist: false });
    }
    updateRibbonDensity();
  }

  function bindRibbonCommands() {
    const ribbon = document.getElementById("editorRibbon");
    if (!ribbon) {
      return;
    }
    ribbon.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-command]");
      if (!trigger || trigger.disabled) {
        return;
      }
      const command = trigger.getAttribute("data-command");
      if (!command) {
        return;
      }
      event.preventDefault();
      dispatchRibbonCommand(command, trigger);
    });
  }

  function initializeRibbonUi() {
    if (state.ribbonInitialized) {
      return;
    }
    ensureLayoutDom();
    if (dom.ribbon && state.persistence) {
      const persistedCollapse = !!state.persistence.ribbonCollapsed;
      dom.ribbon.classList.toggle('is-collapsed', persistedCollapse);
      if (!persistedCollapse) {
        dom.ribbon.classList.remove('is-peek');
      }
    }
    bindRibbonTabs();
    bindRibbonCommands();
    bindRibbonHotkeys();
    bindRibbonPeekGuards();
    bindGlobalRibbonGuards();
    updateRibbonCollapseAffordance(dom.ribbon ? dom.ribbon.classList.contains('is-collapsed') : false);
    state.ribbonInitialized = true;
  }

  function attachResizeHandling() {
    const viewport = document.getElementById("editorViewport");
    if (!viewport || state.resizeObserver) {
      return;
    }

    if (typeof ResizeObserver !== "function") {
      console.warn("[editor] ResizeObserver not supported; viewport resizes will rely on window resize fallback.");
      const legacyHandler = () => window.requestAnimationFrame(sizeViewportLayers);
      window.addEventListener("resize", legacyHandler);
      state.resizeObserver = { disconnect() { window.removeEventListener("resize", legacyHandler); } };
      return;
    }

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(sizeViewportLayers);
    });
    observer.observe(viewport);
    state.resizeObserver = observer;
  }

  function bootstrapRendererCore() {
    const api = window.DxfApp;
    if (!api || typeof api.bootstrapRenderer !== "function") {
      console.warn("[editor] DxfApp bootstrap API is unavailable. Shared rendering will not initialise.");
      return false;
    }

    const canvas2d = document.getElementById("editorCanvas2D");
    const overlayRoot = document.getElementById("editorOverlay");
    try {
      const bootstrap = api.bootstrapRenderer({
        canvas: canvas2d,
        overlay: overlayRoot
          ? {
              root: overlayRoot,
              autoInitialize: false,
              document
            }
          : false
      });

      state.parser = bootstrap.parser || null;
      state.dataController = bootstrap.dataController || null;
      state.surfaceManager = bootstrap.surfaceManager || null;
      state.overlayController = bootstrap.overlayController || null;
      ensureLayoutDom();
      if (state.overlayController) {
        if (typeof state.overlayController.initializeDom === "function" && !state.overlayController.__editorInitialized) {
          try {
            state.overlayController.initializeDom();
            state.overlayController.__editorInitialized = true;
          } catch (error) {
            console.warn("[editor] Overlay DOM initialisation skipped:", error);
          }
        }
        if (!state.overlayController.viewportEl) {
          state.overlayController.viewportEl = dom.viewport || document.getElementById("editorViewport") || null;
        }
        attachOverlayHooks(state.overlayController);
      }
      refreshRendererStatus();
      sizeViewportLayers();
      return true;
    } catch (error) {
      console.error("[editor] Failed to bootstrap shared renderer:", error);
      updateStatus("Renderer initialisation failed. Check console output.");
      return false;
    }
  }

  function initializeSkeleton() {
    initializeStatusBar();
    ensureLayoutDom();
    sizeViewportLayers();
    window.requestAnimationFrame(sizeViewportLayers);
    attachResizeHandling();
    const bootstrapped = bootstrapRendererCore();
    if (bootstrapped) {
      updateStatus("Ready – DXF core initialised.");
    } else {
      updateStatus("Ready – awaiting DXF core modules.");
    }
    refreshRendererStatus();
    initializeRibbonUi();
    updateRibbonDensity();
    bindCommandPalette();
    recomputePaletteResults(state.palette.filter || '');
    bindFileHandlers();
    if (!state.serializer) {
      setDocumentSerializer(defaultDocumentSerializer);
    }
    updateCommandAvailability();
    if (state.surfaceManager && typeof state.surfaceManager.renderMessage === "function") {
      state.surfaceManager.renderMessage('Open a DXF file to begin editing.');
    }
    applyViewTogglesToSurface();
  }

  function boot() {
    if (state.bootstrapped) {
      return;
    }

    state.bootstrapped = true;

    if (!("ResizeObserver" in window)) {
      console.warn("[editor] ResizeObserver not available; viewport sizing may be unstable.");
    }

    initializeSkeleton();
    console.info("[editor] DXF Editor skeleton initialized.");
  }

  window.DxfEditorApp = {
    boot,
    setStatusMessage: updateStatus,
    setCursorHint,
    setCommandStatus: setCommandStatusLabel,
    setLayerSummary,
    setSnapSummary,
    refreshRendererStatus,
    getOverlayController,
    getSurfaceManager,
    getViewportElement: getViewportElementRef,
    rerenderActiveDocument,
    isEditingCommand,
    registerEditingApi,
    unregisterEditingApi,
    completeEditingCommand,
    cancelActiveCommand,
    resetActiveCommand(message) {
      cancelActiveCommand(message);
    },
    setSerializer: setDocumentSerializer,
    showLayerManager,
    recordMutation,
    openCommandPalette,
    closeCommandPalette,
    addCommandListener(callback) {
      if (typeof callback === "function") {
        state.commandListeners.add(callback);
      }
    },
    removeCommandListener(callback) {
      if (callback && state.commandListeners.has(callback)) {
        state.commandListeners.delete(callback);
      }
    },
    openFilePicker: handleOpenDrawingCommand,
    loadDxfSource: ingestDxfDocument,
    getActiveDocument: getActiveDocumentRecord
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
