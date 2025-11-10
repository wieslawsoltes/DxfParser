/* eslint-disable no-console */
(function () {
  function init() {
    const app = window.DxfEditorApp;
    if (!app || typeof app.registerEditingApi !== "function") {
      return;
    }

    let dispatcher = window.DxfToolDispatcher;
    if (!dispatcher || typeof dispatcher.handleCommand !== "function") {
      dispatcher = window.DxfToolDispatcher = createDefaultDispatcher();
    }

    const helpers = {
      setCursor(hint) {
        if (app.setCursorHint) {
          app.setCursorHint(hint);
        }
      },
      setStatus(message) {
        if (app.setStatusMessage) {
          app.setStatusMessage(message);
        }
      },
      recordMutation(mutation) {
        if (app.recordMutation) {
          app.recordMutation(mutation);
        }
      },
      complete(result) {
        if (app.completeEditingCommand) {
          app.completeEditingCommand(result || {});
        }
      },
      cancel(reason) {
        if (app.cancelActiveCommand) {
          app.cancelActiveCommand(reason);
        }
      }
    };

    const bridge = {
      startCommand(command, detail = {}) {
        try {
          dispatcher.handleCommand(command, detail, helpers);
        } catch (error) {
          console.error("[editing-adapter] Tool dispatcher failed:", error);
          if (helpers.cancel) {
            helpers.cancel(`Command '${command}' failed.`);
          }
        }
      },
      onRegister(appInstance) {
        if (typeof dispatcher.initialize === "function") {
          try {
            dispatcher.initialize(appInstance, helpers);
          } catch (error) {
            console.error("[editing-adapter] Tool dispatcher initialize failed:", error);
          }
        }
      }
    };

    const unregister = app.registerEditingApi(bridge);

    window.DxfEditingBridge = {
      dispatcher,
      helpers,
      unregister
    };
  }

  function createDefaultDispatcher() {
    const state = {
      app: null,
      helpers: null,
      activeTool: null
    };

    function activateTool(factory) {
      if (state.activeTool && typeof state.activeTool.cancel === "function") {
        state.activeTool.cancel("Command superseded.");
      }
      if (typeof factory !== "function") {
        state.activeTool = null;
        return;
      }
      let toolRef = null;
      const release = () => {
        if (state.activeTool === toolRef) {
          state.activeTool = null;
        }
      };
      toolRef = factory(release);
      if (toolRef && typeof toolRef === "object") {
        state.activeTool = toolRef;
      } else {
        release();
      }
    }

    function defaultFeedback(commandName, helpers) {
      const label = (commandName || 'command').toUpperCase();
      if (helpers && typeof helpers.setStatus === "function") {
        helpers.setStatus(`Command '${label}' is not available yet.`);
      }
      if (helpers && typeof helpers.complete === "function") {
        helpers.complete({
          command: commandName,
          message: `Command '${label}' is not available yet.`
        });
      }
    }

    return {
      initialize(appInstance, helpers) {
        state.app = appInstance || null;
        state.helpers = helpers || null;
      },
      handleCommand(command, detail, helpersOverride) {
        const helpers = helpersOverride || state.helpers || {};
        const normalized = (command || '').toLowerCase();
        if (normalized === 'line') {
          activateTool((release) => startLineTool(state.app, helpers, release));
          return;
        }
        if (normalized === 'move') {
          activateTool((release) => startMoveTool(state.app, helpers, release));
          return;
        }
        defaultFeedback(normalized, helpers);
      }
    };
  }

  const RESOLVED_DEFAULTS_TEMPLATE = {
    layer: null,
    linetype: null,
    textStyle: null,
    material: null,
    plotStyle: null,
    colorBook: null,
    dimensionStyle: null,
    imageDefinition: null,
    imageDefReactor: null,
    underlayDefinition: null,
    pointCloudDefinition: null,
    pointCloudReactor: null,
    pointCloudExRecord: null,
    sectionViewStyle: null,
    detailViewStyle: null,
    sectionObject: null,
    sectionGeometry: null,
    detailViewObject: null,
    proxyObject: null,
    rasterVariables: null,
    associativity: null
  };

  const MOVABLE_ENTITY_TYPES = new Set(['LINE']);

  function startLineTool(app, helpers, release) {
    const record = getActiveRecord(app);
    const overlay = getOverlayController(app);
    const viewport = getViewportElement(app);
    if (!record || !overlay || !viewport) {
      if (helpers && typeof helpers.cancel === "function") {
        helpers.cancel('Line command unavailable.');
      }
      release();
      return null;
    }

    const startPoint = { current: null };

    const pointerHandler = (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      const worldPoint = extractWorldPoint(event, overlay, viewport);
      if (!worldPoint) {
        if (helpers && typeof helpers.setStatus === "function") {
          helpers.setStatus('Line: unable to determine point.');
        }
        return;
      }
      if (!startPoint.current) {
        startPoint.current = worldPoint;
        if (helpers && typeof helpers.setStatus === "function") {
          helpers.setStatus('Line: specify next point.');
        }
        if (helpers && typeof helpers.setCursor === "function") {
          helpers.setCursor('Specify next point');
        }
        return;
      }

      const entity = addLineEntity(record, startPoint.current, worldPoint);
      cleanup();
      if (!entity) {
        if (helpers && typeof helpers.cancel === "function") {
          helpers.cancel('Line creation failed.');
        }
        release();
        return;
      }

      if (helpers && typeof helpers.recordMutation === "function") {
        helpers.recordMutation({
          command: 'line',
          timestamp: Date.now(),
          message: 'Line created.',
          detail: {
            handle: entity.handle || null,
            start: startPoint.current,
            end: worldPoint
          }
        });
      }
      rerenderApp(app);
      if (helpers && typeof helpers.complete === "function") {
        helpers.complete({
          command: 'line',
          message: 'Line created.'
        });
      }
      release();
    };

    const keyHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cleanup();
        if (helpers && typeof helpers.cancel === "function") {
          helpers.cancel('Line canceled.');
        }
        release();
      }
    };

    const cleanup = () => {
      viewport.removeEventListener('pointerdown', pointerHandler);
      window.removeEventListener('keydown', keyHandler, true);
      startPoint.current = null;
    };

    viewport.addEventListener('pointerdown', pointerHandler);
    window.addEventListener('keydown', keyHandler, true);
    if (helpers && typeof helpers.setCursor === "function") {
      helpers.setCursor('Specify first point');
    }
    if (helpers && typeof helpers.setStatus === "function") {
      helpers.setStatus('Line: specify first point.');
    }

    return {
      cancel(reason) {
        cleanup();
        if (helpers && typeof helpers.cancel === "function") {
          helpers.cancel(reason || 'Line canceled.');
        }
        release();
      }
    };
  }

  function startMoveTool(app, helpers, release) {
    const record = getActiveRecord(app);
    const overlay = getOverlayController(app);
    const viewport = getViewportElement(app);
    if (!record || !overlay || !viewport) {
      if (helpers && typeof helpers.cancel === "function") {
        helpers.cancel('Move command unavailable.');
      }
      release();
      return null;
    }

    const selection = {
      handle: null,
      basePoint: null
    };

    const pointerHandler = (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      const screenPoint = extractScreenPoint(event, viewport);
      if (!selection.handle) {
        const pick = overlay && typeof overlay.hitTestPickable === "function"
          ? overlay.hitTestPickable(screenPoint)
          : null;
        const nextHandle = pick && pick.handle ? normalizeHandle(pick.handle) : null;
        const entity = nextHandle ? findEntityByHandle(record, nextHandle) : null;
        if (!entity || !canMoveEntity(entity)) {
          if (helpers && typeof helpers.setStatus === "function") {
            helpers.setStatus('Move: select a supported entity.');
          }
          if (overlay && typeof overlay.commitSelection === "function") {
            overlay.commitSelection([], 'replace');
          }
          selection.handle = null;
          return;
        }
        selection.handle = nextHandle;
        if (overlay && typeof overlay.commitSelection === "function") {
          overlay.commitSelection([selection.handle], 'replace');
        }
        if (helpers && typeof helpers.setStatus === "function") {
          helpers.setStatus('Move: specify base point.');
        }
        if (helpers && typeof helpers.setCursor === "function") {
          helpers.setCursor('Specify base point');
        }
        return;
      }

      const worldPoint = extractWorldPoint(event, overlay, viewport);
      if (!worldPoint) {
        if (helpers && typeof helpers.setStatus === "function") {
          helpers.setStatus('Move: unable to determine point.');
        }
        return;
      }

      if (!selection.basePoint) {
        selection.basePoint = worldPoint;
        if (helpers && typeof helpers.setStatus === "function") {
          helpers.setStatus('Move: specify target point.');
        }
        if (helpers && typeof helpers.setCursor === "function") {
          helpers.setCursor('Specify target point');
        }
        return;
      }

      const entity = findEntityByHandle(record, selection.handle);
      const delta = {
        x: (worldPoint.x || 0) - (selection.basePoint.x || 0),
        y: (worldPoint.y || 0) - (selection.basePoint.y || 0),
        z: (worldPoint.z || 0) - (selection.basePoint.z || 0)
      };
      cleanup();
      if (!entity || !applyMoveDelta(entity, delta)) {
        if (helpers && typeof helpers.cancel === "function") {
          helpers.cancel('Move failed.');
        }
        release();
        return;
      }
      if (helpers && typeof helpers.recordMutation === "function") {
        helpers.recordMutation({
          command: 'move',
          timestamp: Date.now(),
          message: 'Move complete.',
          detail: {
            handle: selection.handle,
            delta
          }
        });
      }
      rerenderApp(app);
      if (helpers && typeof helpers.complete === "function") {
        helpers.complete({
          command: 'move',
          message: 'Move complete.'
        });
      }
      release();
    };

    const keyHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cleanup();
        if (helpers && typeof helpers.cancel === "function") {
          helpers.cancel('Move canceled.');
        }
        release();
      }
    };

    const cleanup = () => {
      viewport.removeEventListener('pointerdown', pointerHandler);
      window.removeEventListener('keydown', keyHandler, true);
      selection.handle = null;
      selection.basePoint = null;
    };

    viewport.addEventListener('pointerdown', pointerHandler);
    window.addEventListener('keydown', keyHandler, true);
    if (helpers && typeof helpers.setCursor === "function") {
      helpers.setCursor('Select entity to move');
    }
    if (helpers && typeof helpers.setStatus === "function") {
      helpers.setStatus('Move: select an entity.');
    }

    return {
      cancel(reason) {
        cleanup();
        if (helpers && typeof helpers.cancel === "function") {
          helpers.cancel(reason || 'Move canceled.');
        }
        release();
      }
    };
  }

  function getActiveRecord(app) {
    if (!app || typeof app.getActiveDocument !== "function") {
      return null;
    }
    return app.getActiveDocument();
  }

  function getOverlayController(app) {
    if (!app || typeof app.getOverlayController !== "function") {
      return null;
    }
    return app.getOverlayController();
  }

  function getViewportElement(app) {
    if (!app || typeof app.getViewportElement !== "function") {
      return null;
    }
    return app.getViewportElement();
  }

  function rerenderApp(app) {
    if (app && typeof app.rerenderActiveDocument === "function") {
      app.rerenderActiveDocument();
    }
    if (app && typeof app.refreshRendererStatus === "function") {
      app.refreshRendererStatus();
    }
  }

  function extractScreenPoint(event, viewport) {
    if (!viewport || typeof viewport.getBoundingClientRect !== "function") {
      return null;
    }
    const rect = viewport.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function extractWorldPoint(event, overlay, viewport) {
    const screen = extractScreenPoint(event, viewport);
    if (!screen || !overlay || typeof overlay.screenToWorld !== "function") {
      return null;
    }
    return overlay.screenToWorld(screen);
  }

  function clonePoint(point) {
    if (!point || typeof point !== "object") {
      return { x: 0, y: 0, z: 0 };
    }
    return {
      x: Number(point.x) || 0,
      y: Number(point.y) || 0,
      z: Number(point.z) || 0
    };
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) {
      return '0';
    }
    const fixed = value.toFixed(6);
    return fixed.replace(/\.?0+$/, '') || '0';
  }

  function generateEditorHandle(record) {
    if (!record.__editorHandleSeed) {
      record.__editorHandleSeed = 1;
    }
    const seed = record.__editorHandleSeed++;
    const timeHex = (Date.now() & 0xffffff).toString(16).toUpperCase();
    const seedHex = seed.toString(16).toUpperCase();
    return `E${timeHex}${seedHex}`.slice(-8);
  }

  function buildLineRawTags(handle, start, end) {
    return [
      { code: 5, value: handle },
      { code: 8, value: '0' },
      { code: 10, value: formatNumber(start.x) },
      { code: 20, value: formatNumber(start.y) },
      { code: 30, value: formatNumber(start.z || 0) },
      { code: 11, value: formatNumber(end.x) },
      { code: 21, value: formatNumber(end.y) },
      { code: 31, value: formatNumber(end.z || 0) }
    ];
  }

  function addLineEntity(record, start, end) {
    const doc = record && record.doc;
    if (!doc) {
      return null;
    }
    const handle = generateEditorHandle(record);
    const entity = {
      id: `LINE_${handle}`,
      type: 'LINE',
      space: 'model',
      layer: '0',
      linetype: null,
      lineweight: null,
      linetypeScale: null,
      color: { type: 'byLayer', value: null },
      trueColor: null,
      transparency: null,
      layout: null,
      textStyle: null,
      thickness: null,
      elevation: null,
      extrusion: null,
      extensionDictionary: null,
      extensionDictionaryUpper: null,
      reactors: [],
      flags: {},
      owner: null,
      handle,
      blockName: null,
      material: null,
      plotStyle: null,
      visualStyle: null,
      shadowMode: null,
      spaceFlag: null,
      colorBook: null,
      dimensionStyle: null,
      dimensionStyleHandle: null,
      geometry: {
        type: 'line',
        start: clonePoint(start),
        end: clonePoint(end)
      },
      rawTags: buildLineRawTags(handle, clonePoint(start), clonePoint(end)),
      resolved: Object.assign({}, RESOLVED_DEFAULTS_TEMPLATE)
    };
    if (!Array.isArray(doc.entities)) {
      doc.entities = [];
    }
    doc.entities.push(entity);
    if (doc.sceneGraph) {
      if (Array.isArray(doc.sceneGraph.modelSpace)) {
        doc.sceneGraph.modelSpace.push(entity);
      }
      if (doc.sceneGraph.stats && typeof doc.sceneGraph.stats.modelSpaceEntities === "number") {
        doc.sceneGraph.stats.modelSpaceEntities += 1;
      }
    }
    return entity;
  }

  function normalizeHandle(handle) {
    if (handle == null) {
      return null;
    }
    const text = String(handle).trim();
    return text ? text.toUpperCase() : null;
  }

  function findEntityByHandle(record, handle) {
    const doc = record && record.doc;
    if (!doc || !Array.isArray(doc.entities)) {
      return null;
    }
    const normalized = normalizeHandle(handle);
    if (!normalized) {
      return null;
    }
    for (let i = 0; i < doc.entities.length; i += 1) {
      const entity = doc.entities[i];
      if (!entity) {
        continue;
      }
      if (normalizeHandle(entity.handle) === normalized) {
        return entity;
      }
      if (normalizeHandle(entity.id) === normalized) {
        return entity;
      }
    }
    return null;
  }

  function canMoveEntity(entity) {
    const type = entity && entity.type ? String(entity.type).toUpperCase() : '';
    return MOVABLE_ENTITY_TYPES.has(type);
  }

  function applyMoveDelta(entity, delta) {
    const type = entity && entity.type ? String(entity.type).toUpperCase() : '';
    if (type === 'LINE') {
      return translateLineEntity(entity, delta);
    }
    return false;
  }

  function translateLineEntity(entity, delta) {
    if (!entity.geometry || !entity.geometry.start || !entity.geometry.end) {
      return false;
    }
    const start = entity.geometry.start;
    const end = entity.geometry.end;
    start.x = (start.x || 0) + delta.x;
    start.y = (start.y || 0) + delta.y;
    start.z = (start.z || 0) + (delta.z || 0);
    end.x = (end.x || 0) + delta.x;
    end.y = (end.y || 0) + delta.y;
    end.z = (end.z || 0) + (delta.z || 0);
    if (!Array.isArray(entity.rawTags)) {
      entity.rawTags = [];
    }
    updateRawTag(entity.rawTags, 10, start.x);
    updateRawTag(entity.rawTags, 20, start.y);
    updateRawTag(entity.rawTags, 30, start.z || 0);
    updateRawTag(entity.rawTags, 11, end.x);
    updateRawTag(entity.rawTags, 21, end.y);
    updateRawTag(entity.rawTags, 31, end.z || 0);
    return true;
  }

  function updateRawTag(tags, code, value) {
    const numericCode = Number(code);
    const formatted = formatNumber(value);
    const existing = tags.find((tag) => Number(tag.code) === numericCode);
    if (existing) {
      existing.value = formatted;
    } else {
      tags.push({ code: numericCode, value: formatted });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
