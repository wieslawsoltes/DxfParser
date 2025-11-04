(function (global) {
  'use strict';

  const namespace = global.DxfRendering = global.DxfRendering || {};

  class RenderingOverlayController {
    constructor(options = {}) {
      this.dataController = options.dataController || null;
      this.dxfParser = options.dxfParser || null;
      this.app = options.app || null;

      this.overlayRoot = null;
      this.closeBtn = null;
      this.titleEl = null;
      this.summaryContainer = null;
      this.layerManagerContainer = null;
      this.layerManagerStatus = null;
      this.layerManagerFilterInput = null;
      this.layerManagerHideInactiveCheckbox = null;
      this.layerManagerResetButton = null;
      this.canvas = null;
      this.currentTabId = null;
      this.currentPane = null;
      this.currentSceneGraph = null;
      this.currentDoc = null;
      this.surfaceManager = null;
      this.textLayer = null;
      this.viewportEl = null;
      this.interactionLayer = null;
      this.marqueeElement = null;
      this.lassoSvg = null;
      this.lassoPathElement = null;
      this.layerCatalogByTab = new Map();
      this.layerOverridesByTab = new Map();
      this.currentLayerCatalog = null;
      this.currentLayerOverrides = null;
      this.layerManagerFilterText = '';
      this.layerManagerHideInactiveFlag = false;
      this.selectionByTab = new Map();
      this.selectionHandles = new Set();
      this.currentInteraction = null;
      this.activePointerId = null;
      this.pointerListenersAttached = false;
      this.attributeDisplayState = {
        showDefinitions: false,
        showInvisible: false,
        showReferences: true
      };
      this.attributeDefinitionCheckbox = null;
      this.attributeInvisibleCheckbox = null;
      this.attributeReferencesCheckbox = null;
      this.measurementToolbar = null;
      this.measurementToolbarButtons = [];
      this.measurementButtonHandlers = new Map();
      this.measurementLayer = null;
      this.measurementSummaryEl = null;
      this.measurementMode = 'none';
      this.measurementModeOrder = ['none', 'distance', 'area', 'angle'];
      this.measurementState = {
        points: [],
        previewPoint: null
      };
      this.snapLayer = null;
      this.snapMarkerEl = null;
      this.snapMarkerLabelEl = null;
      this.snapState = {
        active: false,
        type: null,
        label: null,
        world: null,
        screen: null,
        sourceHandle: null,
        isPreview: false
      };
      this.snapCandidatesCache = null;
      this.selectionToolbar = null;
      this.selectionToolbarButtons = [];
      this.selectionToolbarHandlers = new Map();
      this.isolationSummaryEl = null;
      this.layerIsolationState = null;
      this.layerIsolationStateByTab = new Map();
      this.objectIsolationState = null;
      this.objectIsolationStateByTab = new Map();
      this.viewContexts = new Map();
      this.viewCubeEl = null;
      this.navigationWheelEl = null;
      this.viewUndoButton = null;
      this.viewRedoButton = null;
      this.viewHomeButton = null;
      this.viewNavHandlers = new Map();
      this.viewWheelHandler = null;
      this.viewNavigationMode = null;
      this.navigationDragState = null;

      this.boundClose = () => this.close();
      this.boundOnKeyDown = (event) => this.handleOverlayKeyDown(event);
      this.boundPointerDown = (event) => this.handlePointerDown(event);
      this.boundPointerMove = (event) => this.handlePointerMove(event);
      this.boundPointerUp = (event) => this.handlePointerUp(event);
      this.boundPointerCancel = (event) => this.handlePointerCancel(event);
    }

    normalizeHandle(value) {
      if (value == null) {
        return null;
      }
      const stringValue = typeof value === 'string' ? value : String(value);
      const trimmed = stringValue.trim();
      return trimmed ? trimmed.toUpperCase() : null;
    }

    escapeHtml(value) {
      if (value == null) {
        return '';
      }
      return String(value).replace(/[&<>"']/g, (char) => {
        switch (char) {
          case '&': return '&amp;';
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '"': return '&quot;';
          case "'": return '&#39;';
          default: return char;
        }
      });
    }

    normalizeAngle(value) {
      if (!Number.isFinite(value)) {
        return 0;
      }
      let angle = value % (Math.PI * 2);
      if (angle > Math.PI) {
        angle -= Math.PI * 2;
      } else if (angle <= -Math.PI) {
        angle += Math.PI * 2;
      }
      return angle;
    }

    cloneViewState(viewState) {
      if (!viewState || typeof viewState !== 'object') {
        return null;
      }
      const mode = viewState.mode === 'auto' ? 'auto' : 'custom';
      const centerCandidate = viewState.center;
      const center = centerCandidate && typeof centerCandidate === 'object'
        ? {
            x: Number.isFinite(centerCandidate.x) ? centerCandidate.x : 0,
            y: Number.isFinite(centerCandidate.y) ? centerCandidate.y : 0
          }
        : null;
      const scale = Number.isFinite(viewState.scale) && viewState.scale > 0
        ? viewState.scale
        : null;
      let rotationRad = 0;
      if (Number.isFinite(viewState.rotationRad)) {
        rotationRad = viewState.rotationRad;
      } else if (Number.isFinite(viewState.rotationDeg)) {
        rotationRad = viewState.rotationDeg * Math.PI / 180;
      }
      rotationRad = this.normalizeAngle(rotationRad);
      return {
        mode,
        center,
        scale,
        rotationRad,
        rotationDeg: rotationRad * 180 / Math.PI
      };
    }

    normalizeViewState(viewState, fallback = null) {
      if (!viewState || typeof viewState !== 'object') {
        return fallback ? this.cloneViewState(fallback) : null;
      }
      if (viewState.mode === 'auto') {
        return { mode: 'auto' };
      }
      const fallbackState = fallback ? this.cloneViewState(fallback) : null;
      const clone = this.cloneViewState(viewState);
      if (!clone) {
        return fallbackState;
      }
      if (!clone.center && fallbackState && fallbackState.center) {
        clone.center = { x: fallbackState.center.x, y: fallbackState.center.y };
      }
      if (!Number.isFinite(clone.scale) || clone.scale <= 0) {
        clone.scale = fallbackState && Number.isFinite(fallbackState.scale) && fallbackState.scale > 0
          ? fallbackState.scale
          : 1;
      }
      if (!Number.isFinite(clone.rotationRad)) {
        clone.rotationRad = fallbackState && Number.isFinite(fallbackState.rotationRad)
          ? fallbackState.rotationRad
          : 0;
        clone.rotationDeg = clone.rotationRad * 180 / Math.PI;
      }
      clone.mode = 'custom';
      return clone;
    }

    areViewStatesEqual(a, b, epsilon = 1e-6) {
      if (!a && !b) {
        return true;
      }
      if (!a || !b) {
        return false;
      }
      if (a.mode === 'auto' || b.mode === 'auto') {
        return a.mode === b.mode;
      }
      const centerA = a.center || { x: 0, y: 0 };
      const centerB = b.center || { x: 0, y: 0 };
      const scaleA = Number.isFinite(a.scale) ? a.scale : 1;
      const scaleB = Number.isFinite(b.scale) ? b.scale : 1;
      const rotA = Number.isFinite(a.rotationRad) ? this.normalizeAngle(a.rotationRad) : 0;
      const rotB = Number.isFinite(b.rotationRad) ? this.normalizeAngle(b.rotationRad) : 0;
      return Math.abs(centerA.x - centerB.x) <= epsilon &&
        Math.abs(centerA.y - centerB.y) <= epsilon &&
        Math.abs(scaleA - scaleB) <= epsilon * Math.max(1, Math.abs(scaleA), Math.abs(scaleB)) &&
        Math.abs(rotA - rotB) <= epsilon;
    }

    getViewContextKey(tabId = this.currentTabId, pane = this.currentPane) {
      if (!tabId) {
        return null;
      }
      const paneKey = (pane || 'left').toLowerCase();
      return `${tabId}::${paneKey}`;
    }

    ensureViewContext(create = true) {
      const key = this.getViewContextKey();
      if (!key) {
        return null;
      }
      if (!this.viewContexts.has(key) && create) {
        this.viewContexts.set(key, {
          key,
          current: null,
          auto: null,
          history: [],
          index: -1
        });
      }
      return this.viewContexts.get(key) || null;
    }

    updateViewContextFromFrame(context, frame, options = {}) {
      if (!context || !frame) {
        return;
      }
      const sanitizedCurrent = this.cloneViewState(frame.viewState);
      const sanitizedAuto = this.cloneViewState(frame.autoViewState);
      if (sanitizedAuto) {
        context.auto = sanitizedAuto;
      }
      if (sanitizedCurrent) {
        context.current = sanitizedCurrent;
      }
      if (!Array.isArray(context.history) || !context.history.length) {
        if (sanitizedCurrent) {
          context.history = [this.cloneViewState(sanitizedCurrent)];
          context.index = 0;
        } else {
          context.history = [];
          context.index = -1;
        }
      } else if (options.updateCurrent === true && context.index >= 0 && context.index < context.history.length && sanitizedCurrent) {
        context.history[context.index] = this.cloneViewState(sanitizedCurrent);
      }
    }

    recordViewHistory(context, state) {
      if (!context || !state) {
        return;
      }
      const entry = this.cloneViewState(state);
      if (!entry) {
        return;
      }
      const currentHistory = Array.isArray(context.history) ? context.history : [];
      const safeIndex = Math.max(context.index != null ? context.index : -1, -1);
      const truncated = currentHistory.slice(0, safeIndex + 1);
      if (truncated.length && this.areViewStatesEqual(truncated[truncated.length - 1], entry)) {
        context.history = truncated;
        context.index = truncated.length - 1;
        return;
      }
      truncated.push(entry);
      const maxEntries = 64;
      if (truncated.length > maxEntries) {
        const removeCount = truncated.length - maxEntries;
        truncated.splice(0, removeCount);
      }
      context.history = truncated;
      context.index = truncated.length - 1;
    }

    getActiveViewState(frameOverride) {
      const context = this.ensureViewContext(false);
      if (context && context.current) {
        return this.cloneViewState(context.current);
      }
      const frame = frameOverride || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      if (frame && frame.viewState) {
        return this.cloneViewState(frame.viewState);
      }
      return null;
    }

    getAutoViewState(frameOverride) {
      const context = this.ensureViewContext(false);
      if (context && context.auto) {
        return this.cloneViewState(context.auto);
      }
      const frame = frameOverride || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      if (frame && frame.autoViewState) {
        return this.cloneViewState(frame.autoViewState);
      }
      return null;
    }

    renderCurrentFrameWithView(viewStateOverride) {
      if (!this.surfaceManager || !this.currentSceneGraph) {
        return null;
      }
      const options = {};
      if (viewStateOverride && viewStateOverride.mode === 'auto') {
        options.viewState = { mode: 'auto' };
      } else if (viewStateOverride) {
        options.viewState = this.cloneViewState(viewStateOverride);
      } else {
        options.viewState = { mode: 'auto' };
      }
      const frame = this.surfaceManager.renderScene(this.currentSceneGraph, options);
      this.surfaceManager.resume();
      this.refreshViewportOverlays(frame);
      return frame;
    }

    applyViewState(viewState, options = {}) {
      const context = this.ensureViewContext();
      if (!context) {
        return;
      }
      let normalized = null;
      if (viewState && viewState.mode === 'auto') {
        normalized = { mode: 'auto' };
      } else {
        const fallback = this.getActiveViewState();
        normalized = this.normalizeViewState(viewState, fallback);
        if (!normalized) {
          normalized = fallback || { mode: 'auto' };
        }
      }
      const frame = this.renderCurrentFrameWithView(normalized);
      if (!frame) {
        return;
      }
      const shouldUpdateCurrent = options.recordHistory === false;
      this.updateViewContextFromFrame(context, frame, { updateCurrent: shouldUpdateCurrent });
      if (options.recordHistory !== false) {
        this.recordViewHistory(context, frame.viewState);
      }
      this.updateViewNavigationUi();
    }

    zoomView(factor, options = {}) {
      if (!Number.isFinite(factor) || factor <= 0) {
        return;
      }
      const frame = this.surfaceManager ? this.surfaceManager.lastFrame : null;
      if (!frame) {
        return;
      }
      const context = this.ensureViewContext();
      if (!context) {
        return;
      }
      const current = this.getActiveViewState(frame) || this.getAutoViewState(frame);
      if (!current) {
        return;
      }
      const scale = Number.isFinite(current.scale) && current.scale > 0 ? current.scale : frame.scale || 1;
      const targetScale = Math.max(1e-9, Math.min(scale * factor, 1e12));
      const width = Number.isFinite(frame.width) && frame.width > 0
        ? frame.width
        : (this.viewportEl ? this.viewportEl.clientWidth : 0);
      const height = Number.isFinite(frame.height) && frame.height > 0
        ? frame.height
        : (this.viewportEl ? this.viewportEl.clientHeight : 0);
      const anchor = options.anchor || {
        x: width * 0.5,
        y: height * 0.5
      };
      const anchorWorld = this.screenToWorld(anchor, frame);
      const rotation = Number.isFinite(current.rotationRad) ? current.rotationRad : 0;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const dx = ((anchor.x ?? (width * 0.5)) - width * 0.5) / targetScale;
      const dy = (height * 0.5 - (anchor.y ?? (height * 0.5))) / targetScale;
      const offsetX = cos * dx + sin * dy;
      const offsetY = -sin * dx + cos * dy;
      const baseCenter = current.center || frame.worldCenter || { x: 0, y: 0 };
      const nextCenter = anchorWorld
        ? { x: anchorWorld.x - offsetX, y: anchorWorld.y - offsetY }
        : baseCenter;
      this.applyViewState({
        mode: 'custom',
        center: nextCenter,
        scale: targetScale,
        rotationRad: rotation
      });
    }

    panView(deltaX, deltaY) {
      if (!Number.isFinite(deltaX) && !Number.isFinite(deltaY)) {
        return;
      }
      const frame = this.surfaceManager ? this.surfaceManager.lastFrame : null;
      if (!frame) {
        return;
      }
      const context = this.ensureViewContext();
      if (!context) {
        return;
      }
      const current = this.getActiveViewState(frame) || this.getAutoViewState(frame);
      if (!current) {
        return;
      }
      const scale = Number.isFinite(current.scale) && current.scale > 0 ? current.scale : frame.scale || 1;
      const rotation = Number.isFinite(current.rotationRad) ? current.rotationRad : 0;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const screenDx = Number.isFinite(deltaX) ? deltaX : 0;
      const screenDy = Number.isFinite(deltaY) ? deltaY : 0;
      const dx = screenDx / scale;
      const dy = -screenDy / scale;
      const worldDx = cos * dx + sin * dy;
      const worldDy = -sin * dx + cos * dy;
      const baseCenter = current.center || frame.worldCenter || { x: 0, y: 0 };
      const nextCenter = {
        x: baseCenter.x - worldDx,
        y: baseCenter.y - worldDy
      };
      this.applyViewState({
        mode: 'custom',
        center: nextCenter,
        scale,
        rotationRad: rotation
      });
    }

    orbitView(deltaDegrees) {
      if (!Number.isFinite(deltaDegrees) || deltaDegrees === 0) {
        return;
      }
      const frame = this.surfaceManager ? this.surfaceManager.lastFrame : null;
      if (!frame) {
        return;
      }
      const context = this.ensureViewContext();
      if (!context) {
        return;
      }
      const current = this.getActiveViewState(frame) || this.getAutoViewState(frame);
      if (!current) {
        return;
      }
      const scale = Number.isFinite(current.scale) && current.scale > 0 ? current.scale : frame.scale || 1;
      const baseCenter = current.center || frame.worldCenter || { x: 0, y: 0 };
      const rotation = this.normalizeAngle((Number.isFinite(current.rotationRad) ? current.rotationRad : 0) + deltaDegrees * Math.PI / 180);
      this.applyViewState({
        mode: 'custom',
        center: baseCenter,
        scale,
        rotationRad: rotation
      });
    }

    resetViewNavigation() {
      const context = this.ensureViewContext(false);
      const target = context && context.auto ? context.auto : { mode: 'auto' };
      this.applyViewState(target);
    }

    undoViewNavigation() {
      const context = this.ensureViewContext(false);
      if (!context || !Array.isArray(context.history) || context.index <= 0) {
        return;
      }
      context.index -= 1;
      const target = context.history[context.index];
      this.applyViewState(target, { recordHistory: false });
      this.updateViewNavigationUi();
    }

    redoViewNavigation() {
      const context = this.ensureViewContext(false);
      if (!context || !Array.isArray(context.history) || context.index < 0 || context.index >= context.history.length - 1) {
        return;
      }
      context.index += 1;
      const target = context.history[context.index];
      this.applyViewState(target, { recordHistory: false });
      this.updateViewNavigationUi();
    }

    updateViewNavigationUi() {
      const context = this.ensureViewContext(false);
      const history = context && Array.isArray(context.history) ? context.history : [];
      const undoDisabled = !context || context.index <= 0;
      const redoDisabled = !context || context.index < 0 || context.index >= history.length - 1;
      if (this.viewUndoButton) {
        this.viewUndoButton.disabled = undoDisabled;
      }
      if (this.viewRedoButton) {
        this.viewRedoButton.disabled = redoDisabled;
      }
      if (this.viewHomeButton) {
        this.viewHomeButton.disabled = !context || !context.auto;
      }
      if (this.viewCubeEl) {
        const buttons = Array.from(this.viewCubeEl.querySelectorAll('button[data-view]'));
        const activeState = this.getActiveViewState();
        let activeKey = activeState && activeState.mode === 'auto' ? 'home' : null;
        if (activeState && activeState.mode !== 'auto' && Number.isFinite(activeState.rotationRad)) {
          const deg = this.normalizeAngle(activeState.rotationRad) * 180 / Math.PI;
          if (deg > -22.5 && deg <= 22.5) {
            activeKey = 'top';
          } else if (deg > 22.5 && deg <= 67.5) {
            activeKey = 'iso';
          } else if (deg > 67.5 && deg <= 112.5) {
            activeKey = 'left';
          } else if (deg > 112.5 || deg <= -157.5) {
            activeKey = 'bottom';
          } else if (deg > -67.5 && deg <= -22.5) {
            activeKey = 'iso';
          } else if (deg > -112.5 && deg <= -67.5) {
            activeKey = 'right';
          } else {
            activeKey = 'bottom';
          }
        }
        buttons.forEach((button) => {
          const isActive = activeKey && button.dataset.view === activeKey;
          button.classList.toggle('active', !!isActive);
          button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
      }
    }

    handleViewCubeSelection(orientation) {
      if (!orientation) {
        return;
      }
      this.onViewCubeOrientation(orientation.toLowerCase());
    }

    onViewCubeOrientation(orientation) {
      if (!orientation) {
        return;
      }
      if (orientation === 'home') {
        this.resetViewNavigation();
        return;
      }
      const frame = this.surfaceManager ? this.surfaceManager.lastFrame : null;
      if (!frame) {
        return;
      }
      const current = this.getActiveViewState(frame) || this.getAutoViewState(frame);
      if (!current) {
        return;
      }
      const scale = Number.isFinite(current.scale) && current.scale > 0 ? current.scale : frame.scale || 1;
      const center = current.center || frame.worldCenter || { x: 0, y: 0 };
      let rotationDeg = 0;
      switch (orientation) {
        case 'top':
          rotationDeg = 0;
          break;
        case 'bottom':
        case 'back':
          rotationDeg = 180;
          break;
        case 'left':
          rotationDeg = 90;
          break;
        case 'right':
          rotationDeg = -90;
          break;
        case 'iso':
        case 'isometric':
          rotationDeg = 45;
          break;
        case 'iso-left':
          rotationDeg = 135;
          break;
        case 'iso-right':
          rotationDeg = -45;
          break;
        case 'front':
        default:
          rotationDeg = 0;
          break;
      }
      const rotationRad = this.normalizeAngle(rotationDeg * Math.PI / 180);
      this.applyViewState({
        mode: 'custom',
        center,
        scale,
        rotationRad
      });
    }

    handleNavigationWheelAction(action) {
      if (!action) {
        return;
      }
      const frame = this.surfaceManager ? this.surfaceManager.lastFrame : null;
      if (!frame && action !== 'home') {
        return;
      }
      switch (action) {
        case 'pan-up':
          this.panView(0, this.getPanStep(frame));
          break;
        case 'pan-down':
          this.panView(0, -this.getPanStep(frame));
          break;
        case 'pan-left':
          this.panView(this.getPanStep(frame), 0);
          break;
        case 'pan-right':
          this.panView(-this.getPanStep(frame), 0);
          break;
        case 'zoom-in':
          this.zoomView(1.2);
          break;
        case 'zoom-out':
          this.zoomView(1 / 1.2);
          break;
        case 'orbit-left':
          this.orbitView(15);
          break;
        case 'orbit-right':
          this.orbitView(-15);
          break;
        case 'home':
          this.resetViewNavigation();
          break;
        default:
          break;
      }
    }

    handleViewportWheel(event) {
      if (!event) {
        return;
      }
      if (!this.surfaceManager || !this.surfaceManager.lastFrame) {
        return;
      }
      const delta = event.deltaY;
      if (!Number.isFinite(delta) || delta === 0) {
        return;
      }
      const rect = this.viewportEl ? this.viewportEl.getBoundingClientRect() : null;
      const anchor = rect
        ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
        : null;
      const factor = delta < 0 ? 1.1 : 1 / 1.1;
      if (anchor) {
        this.zoomView(factor, { anchor });
      } else {
        this.zoomView(factor);
      }
      event.preventDefault();
    }

    getViewportSize(frameOverride) {
      const frame = frameOverride || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      let width = frame && Number.isFinite(frame.width) ? frame.width : null;
      let height = frame && Number.isFinite(frame.height) ? frame.height : null;
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        const rect = this.viewportEl ? this.viewportEl.getBoundingClientRect() : null;
        if (rect) {
          width = rect.width;
          height = rect.height;
        }
      }
      return {
        width: Number.isFinite(width) && width > 0 ? width : 0,
        height: Number.isFinite(height) && height > 0 ? height : 0
      };
    }

    getPanStep(frameOverride) {
      const size = this.getViewportSize(frameOverride);
      const base = Math.max(size.width, size.height);
      if (!base) {
        return 80;
      }
      return Math.max(48, base * 0.12);
    }

    initializeDom() {
      if (this.overlayRoot) {
        return;
      }
      this.overlayRoot = document.getElementById('dxfRenderingOverlay');
      if (!this.overlayRoot) {
        console.warn('RenderingOverlayController: overlay root not found in DOM.');
        return;
      }
      this.closeBtn = document.getElementById('closeRenderingOverlayBtn');
      this.titleEl = document.getElementById('renderingOverlayTitle');
      this.summaryContainer = document.getElementById('renderingOverlaySummary');
      this.layerManagerContainer = document.getElementById('renderingOverlayLayerManager');
      this.layerManagerStatus = document.getElementById('layerManagerStatus');
      this.layerManagerFilterInput = document.getElementById('layerManagerFilter');
      this.layerManagerHideInactiveCheckbox = document.getElementById('layerManagerHideInactive');
      this.layerManagerResetButton = document.getElementById('layerManagerReset');
      this.canvas = document.getElementById('renderingOverlayCanvas');
      this.textLayer = document.getElementById('renderingOverlayTextLayer');
      this.attributeDefinitionCheckbox = document.getElementById('toggleAttributeDefinitions');
      this.attributeInvisibleCheckbox = document.getElementById('toggleAttributeInvisible');
      this.attributeReferencesCheckbox = document.getElementById('toggleAttributeReferences');
      this.viewportEl = this.canvas ? this.canvas.parentElement : null;
      this.interactionLayer = document.getElementById('renderingOverlayInteractionLayer');
      this.measurementLayer = document.getElementById('renderingOverlayMeasurementLayer');
      this.snapLayer = document.getElementById('renderingOverlaySnapLayer');
      this.snapMarkerEl = null;
      this.snapMarkerLabelEl = null;
      this.measurementToolbar = document.getElementById('renderingMeasurementToolbar');
      this.measurementToolbarButtons = [];
      this.measurementButtonHandlers.clear();
      if (this.measurementToolbar) {
        const toolbarButtons = Array.from(this.measurementToolbar.querySelectorAll('.measurement-tool-btn'));
        toolbarButtons.forEach((button) => {
          const mode = (button.dataset.mode || 'none').toLowerCase();
          const handler = () => this.handleMeasurementButtonClick(mode);
          button.addEventListener('click', handler);
          this.measurementButtonHandlers.set(button, handler);
        });
        this.measurementToolbarButtons = toolbarButtons;
      }
      this.selectionToolbar = document.getElementById('renderingSelectionToolbar');
      this.selectionToolbarButtons = [];
      this.selectionToolbarHandlers.clear();
      if (this.selectionToolbar) {
        const selectionButtons = Array.from(this.selectionToolbar.querySelectorAll('button[data-action]'));
        selectionButtons.forEach((button) => {
          const action = (button.dataset.action || '').toLowerCase();
          const handler = () => this.handleSelectionToolbarAction(action);
          button.addEventListener('click', handler);
          this.selectionToolbarHandlers.set(button, handler);
        });
        this.selectionToolbarButtons = selectionButtons;
        this.selectionToolbar.setAttribute('aria-hidden', 'true');
        this.selectionToolbar.style.display = 'none';
      }
      if (this.viewportEl && !this.pointerListenersAttached) {
        this.viewportEl.addEventListener('pointerdown', this.boundPointerDown, true);
        this.viewportEl.addEventListener('pointermove', this.boundPointerMove);
        this.viewportEl.addEventListener('pointerup', this.boundPointerUp);
        this.viewportEl.addEventListener('pointercancel', this.boundPointerCancel);
        this.pointerListenersAttached = true;
      }
      this.viewCubeEl = document.getElementById('renderingViewCube');
      if (this.viewCubeEl) {
        const cubeButtons = Array.from(this.viewCubeEl.querySelectorAll('button[data-view]'));
        cubeButtons.forEach((button) => {
          const viewKey = (button.dataset.view || '').toLowerCase();
          if (!viewKey) {
            return;
          }
          if (this.viewNavHandlers.has(button)) {
            return;
          }
          const handler = () => this.handleViewCubeSelection(viewKey);
          button.addEventListener('click', handler);
          this.viewNavHandlers.set(button, handler);
          button.setAttribute('aria-pressed', 'false');
        });
      }
      this.navigationWheelEl = document.getElementById('renderingNavigationWheel');
      if (this.navigationWheelEl) {
        const wheelButtons = Array.from(this.navigationWheelEl.querySelectorAll('button[data-action]'));
        wheelButtons.forEach((button) => {
          const action = (button.dataset.action || '').toLowerCase();
          if (!action || this.viewNavHandlers.has(button)) {
            return;
          }
          const handler = () => this.handleNavigationWheelAction(action);
          button.addEventListener('click', handler);
          this.viewNavHandlers.set(button, handler);
          if (action === 'home' && !this.viewHomeButton) {
            this.viewHomeButton = button;
          }
        });
      }
      this.viewUndoButton = document.getElementById('viewUndoBtn');
      if (this.viewUndoButton && !this.viewNavHandlers.has(this.viewUndoButton)) {
        const handler = () => this.undoViewNavigation();
        this.viewUndoButton.addEventListener('click', handler);
        this.viewNavHandlers.set(this.viewUndoButton, handler);
      }
      this.viewRedoButton = document.getElementById('viewRedoBtn');
      if (this.viewRedoButton && !this.viewNavHandlers.has(this.viewRedoButton)) {
        const handler = () => this.redoViewNavigation();
        this.viewRedoButton.addEventListener('click', handler);
        this.viewNavHandlers.set(this.viewRedoButton, handler);
      }
      const homeButton = document.getElementById('viewHomeBtn');
      if (homeButton && !this.viewNavHandlers.has(homeButton)) {
        const handler = () => this.resetViewNavigation();
        homeButton.addEventListener('click', handler);
        this.viewNavHandlers.set(homeButton, handler);
        this.viewHomeButton = homeButton;
      }
      if (this.viewportEl && !this.viewWheelHandler) {
        this.viewWheelHandler = (event) => this.handleViewportWheel(event);
        this.viewportEl.addEventListener('wheel', this.viewWheelHandler, { passive: false });
      }
      if (this.canvas && namespace.RenderingSurfaceManager && !this.surfaceManager) {
        try {
          this.surfaceManager = new namespace.RenderingSurfaceManager();
          this.surfaceManager.initialize(this.canvas);
          this.surfaceManager.setCanvasReplacementCallback((replacementCanvas) => {
            this.canvas = replacementCanvas;
            this.viewportEl = this.canvas ? this.canvas.parentElement : null;
          });
        } catch (err) {
          console.warn('RenderingOverlayController: unable to initialize rendering surface manager', err);
        }
      }
      const onAttributeControlChange = () => this.applyAttributeVisibilityControls();
      if (this.attributeDefinitionCheckbox) {
        this.attributeDefinitionCheckbox.checked = !!this.attributeDisplayState.showDefinitions;
        this.attributeDefinitionCheckbox.addEventListener('change', onAttributeControlChange);
      }
      if (this.attributeReferencesCheckbox) {
        this.attributeReferencesCheckbox.checked = !!this.attributeDisplayState.showReferences;
        this.attributeReferencesCheckbox.addEventListener('change', onAttributeControlChange);
      }
      if (this.attributeInvisibleCheckbox) {
        this.attributeInvisibleCheckbox.checked = !!this.attributeDisplayState.showInvisible;
        this.attributeInvisibleCheckbox.addEventListener('change', onAttributeControlChange);
      }
      if (this.layerManagerFilterInput) {
        this.layerManagerFilterInput.addEventListener('input', () => {
          this.layerManagerFilterText = this.layerManagerFilterInput.value || '';
          this.renderLayerManagerTable();
        });
      }
      if (this.layerManagerHideInactiveCheckbox) {
        this.layerManagerHideInactiveCheckbox.addEventListener('change', () => {
          this.layerManagerHideInactiveFlag = !!this.layerManagerHideInactiveCheckbox.checked;
          this.renderLayerManagerTable();
        });
      }
      if (this.layerManagerResetButton) {
        this.layerManagerResetButton.addEventListener('click', () => this.resetLayerOverrides());
      }

      if (this.closeBtn) {
        this.closeBtn.addEventListener('click', this.boundClose);
      }
      if (this.overlayRoot) {
        this.overlayRoot.addEventListener('click', (event) => {
          if (event.target === this.overlayRoot) {
            this.close();
          }
        });
      }
      document.addEventListener('keydown', this.boundOnKeyDown);
      this.syncAttributeVisibilityControls();
      this.updateMeasurementToolbarUI();
      this.updateSelectionToolbarUI();
      this.updateViewNavigationUi();
    }

    dispose() {
      if (this.closeBtn) {
        this.closeBtn.removeEventListener('click', this.boundClose);
      }
      document.removeEventListener('keydown', this.boundOnKeyDown);
      if (this.measurementButtonHandlers && this.measurementButtonHandlers.size) {
        this.measurementButtonHandlers.forEach((handler, button) => {
          if (button && handler) {
            button.removeEventListener('click', handler);
          }
        });
        this.measurementButtonHandlers.clear();
      }
      this.measurementToolbarButtons = [];
      if (this.selectionToolbarHandlers && this.selectionToolbarHandlers.size) {
        this.selectionToolbarHandlers.forEach((handler, button) => {
          if (button && handler) {
            button.removeEventListener('click', handler);
          }
        });
        this.selectionToolbarHandlers.clear();
      }
      this.selectionToolbarButtons = [];
      if (this.viewNavHandlers && this.viewNavHandlers.size) {
        this.viewNavHandlers.forEach((handler, element) => {
          if (element && handler) {
            element.removeEventListener('click', handler);
          }
        });
        this.viewNavHandlers.clear();
      }
      if (this.viewportEl && this.pointerListenersAttached) {
        this.viewportEl.removeEventListener('pointerdown', this.boundPointerDown, true);
        this.viewportEl.removeEventListener('pointermove', this.boundPointerMove);
        this.viewportEl.removeEventListener('pointerup', this.boundPointerUp);
        this.viewportEl.removeEventListener('pointercancel', this.boundPointerCancel);
        this.pointerListenersAttached = false;
      }
      if (this.viewportEl && this.viewWheelHandler) {
        this.viewportEl.removeEventListener('wheel', this.viewWheelHandler);
        this.viewWheelHandler = null;
      }
      this.clearInteractionOverlay();
      this.clearSnapIndicator({ silent: true });
      this.resetMeasurementState({ silent: true });
      if (this.surfaceManager && typeof this.surfaceManager.clear === 'function') {
        this.surfaceManager.clear();
      }
      this.surfaceManager = null;
      this.refreshViewportOverlays(null);
      this.overlayRoot = null;
      this.closeBtn = null;
      this.titleEl = null;
      this.summaryContainer = null;
      this.layerManagerContainer = null;
      this.layerManagerStatus = null;
      this.layerManagerFilterInput = null;
      this.layerManagerHideInactiveCheckbox = null;
      this.layerManagerResetButton = null;
      this.canvas = null;
      this.textLayer = null;
      this.measurementLayer = null;
      this.measurementToolbar = null;
      this.measurementSummaryEl = null;
      this.isolationSummaryEl = null;
      this.selectionToolbar = null;
      this.snapLayer = null;
      this.snapMarkerEl = null;
      this.snapMarkerLabelEl = null;
      this.snapCandidatesCache = null;
      this.viewportEl = null;
      this.interactionLayer = null;
      this.marqueeElement = null;
      this.lassoSvg = null;
      this.lassoPathElement = null;
      this.currentInteraction = null;
      this.activePointerId = null;
      this.viewCubeEl = null;
      this.navigationWheelEl = null;
      this.viewUndoButton = null;
      this.viewRedoButton = null;
      this.viewHomeButton = null;
    }

    open(payload = {}) {
      if (!this.overlayRoot) {
        this.initializeDom();
      }
      if (!this.overlayRoot) {
        alert('Rendering overlay is unavailable.');
        return;
      }

      const pane = payload.pane || 'left';
      const tab = payload.tab || null;
      if (!tab) {
        alert('No DXF tab is active for rendering.');
        return;
      }

      const doc = this.ensureDocumentForTab(tab);
      this.currentTabId = tab.id;

      if (!doc || doc.status !== 'ready') {
        this.renderPlaceholder(tab, doc);
      } else {
        this.renderSceneGraph(tab, doc, pane);
      }

      this.overlayRoot.style.display = 'block';
      this.overlayRoot.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => this.resizeCanvas());
    }

    ensureDocumentForTab(tab) {
      if (!tab || !this.dataController) {
        return null;
      }
      const existing = this.dataController.getDocument(tab.id);
      if (existing && existing.status === 'ready') {
        if (this.app && typeof this.app.updateBlockMetadata === 'function' && existing.blockMetadata) {
          this.app.updateBlockMetadata(tab.id, existing.blockMetadata);
        }
        return existing;
      }

      let sourceText = tab.renderingSourceText;
      if (!sourceText) {
        if (this.dxfParser && tab.originalTreeData) {
          try {
            sourceText = this.dxfParser.serializeTree(tab.originalTreeData);
          } catch (err) {
            console.warn('RenderingOverlayController: unable to serialize tab for rendering', err);
          }
        }
      }
      if (!sourceText) {
        this.dataController.registerPlaceholder(tab.id, {
          reason: 'noSource',
          fileName: tab.name || null
        });
        return this.dataController.getDocument(tab.id);
      }

      const doc = this.dataController.ingestDocument({
        tabId: tab.id,
        fileName: tab.name,
        sourceText
      });
      if (doc && doc.status === 'ready') {
        tab.renderingSourceText = sourceText;
        if (this.app && typeof this.app.updateBlockMetadata === 'function' && doc.blockMetadata) {
          this.app.updateBlockMetadata(tab.id, doc.blockMetadata);
        }
      }
      return doc;
    }

    renderPlaceholder(tab, doc) {
      if (this.titleEl) {
        this.titleEl.textContent = `DXF Rendering – ${tab.name || 'Untitled'}`;
      }
      this.currentSceneGraph = null;
      this.currentDoc = doc || null;
      this.currentPane = null;
      if (this.summaryContainer) {
        const reason = doc && doc.reason ? doc.reason : 'unavailable';
        const message = doc && doc.message ? doc.message : '';
      this.summaryContainer.innerHTML = `
          <p><strong>Scene graph unavailable.</strong></p>
          <p>Reason: ${reason}</p>
          ${message ? `<p>${message}</p>` : ''}
          <p>Try reloading the DXF or saving the document to rebuild the rendering model.</p>
        `;
        this.measurementSummaryEl = null;
        this.isolationSummaryEl = null;
      }
      this.currentLayerCatalog = null;
      this.currentLayerOverrides = null;
      if (this.layerManagerContainer) {
        this.layerManagerContainer.innerHTML = '<p>Layer data unavailable.</p>';
      }
      if (this.layerManagerStatus) {
        this.layerManagerStatus.textContent = 'Layer metadata unavailable';
      }
      if (this.surfaceManager) {
        if (typeof this.surfaceManager.setLayerState === 'function') {
          this.surfaceManager.setLayerState(null);
        }
        if (typeof this.surfaceManager.setEntityIsolation === 'function') {
          this.surfaceManager.setEntityIsolation(null);
        }
        this.surfaceManager.renderMessage('Scene graph not available');
      }
      this.layerIsolationState = null;
      this.objectIsolationState = null;
      if (this.currentTabId) {
        this.layerIsolationStateByTab.delete(this.currentTabId);
        this.objectIsolationStateByTab.delete(this.currentTabId);
      }
      this.resetMeasurementState({ silent: true });
      this.refreshViewportOverlays(null);
      this.updateMeasurementToolbarUI();
      this.updateIsolationSummary();
      this.updateSelectionToolbarUI();
      this.updateViewNavigationUi();
    }

    renderSceneGraph(tab, doc, pane) {
      if (!doc || !doc.sceneGraph) {
        this.renderPlaceholder(tab, doc);
        return;
      }
      if (this.surfaceManager && typeof this.surfaceManager.setAttributeDisplay === 'function') {
        this.surfaceManager.setAttributeDisplay(this.attributeDisplayState || {
          showDefinitions: false,
          showInvisible: false,
          showReferences: true
        });
      }
      this.syncAttributeVisibilityControls();
      this.resetMeasurementState({ silent: true });
      this.currentSceneGraph = doc.sceneGraph;
      this.currentDoc = doc;
      this.currentPane = pane;
      if (this.titleEl) {
        this.titleEl.textContent = `DXF Rendering – ${tab.name || 'Untitled'} (${pane.toUpperCase()})`;
      }

      const stats = doc.sceneGraph.stats || doc.stats || {};
      const tables = doc.sceneGraph.tables || {};
      const statsHtml = this.renderSceneStats(stats);
      const drawingPropertiesHtml = this.renderDrawingPropertiesSummary(doc.drawingProperties || null);
      const plotSummaryHtml = this.renderPlotConfigurationSummary(tables);
      const summarySections = [statsHtml, drawingPropertiesHtml, plotSummaryHtml].filter(Boolean);
      if (this.summaryContainer) {
        this.summaryContainer.innerHTML = summarySections.length
          ? summarySections.join('')
          : '<p>No drawing metadata available.</p>';
        this.measurementSummaryEl = null;
        this.isolationSummaryEl = null;
      }

      this.prepareLayerManager(doc);
      this.syncIsolationStateForCurrentTab();

      if (this.app && typeof this.app.updateBlockMetadata === 'function' && doc.blockMetadata) {
        this.app.updateBlockMetadata(tab.id, doc.blockMetadata);
      }

      const viewContext = this.ensureViewContext();

      if (this.surfaceManager) {
        const isolation = this.app && this.app.blockIsolation ? this.app.blockIsolation : null;
        const highlight = this.app && this.app.blockHighlights ? this.app.blockHighlights : null;
        this.surfaceManager.setBlockIsolation(isolation);
        this.surfaceManager.setBlockHighlights(highlight);
        if (typeof this.surfaceManager.setEntityIsolation === 'function') {
          const handles = this.objectIsolationState && this.objectIsolationState.handles instanceof Set
            ? this.objectIsolationState.handles
            : null;
          this.surfaceManager.setEntityIsolation(handles && handles.size ? handles : null);
        }
        const selectionSet = this.ensureSelectionSetForCurrentTab(false) || new Set();
        this.selectionHandles = new Set(selectionSet);
        this.surfaceManager.setSelectionHandles(selectionSet);
      }

      let frame = null;
      if (this.surfaceManager) {
        const viewOptions = {};
        if (viewContext && viewContext.current && viewContext.current.mode !== 'auto') {
          viewOptions.viewState = this.cloneViewState(viewContext.current);
        } else if (viewContext && viewContext.current && viewContext.current.mode === 'auto') {
          viewOptions.viewState = { mode: 'auto' };
        } else {
          viewOptions.viewState = { mode: 'auto' };
        }
        frame = this.surfaceManager.renderScene(doc.sceneGraph, viewOptions);
        this.surfaceManager.resume();
      }
      this.refreshViewportOverlays(frame);
      if (frame && viewContext) {
        this.updateViewContextFromFrame(viewContext, frame, { updateCurrent: true });
      }
      this.updateSelectionSummary();
      this.updateIsolationSummary();
      this.updateMeasurementToolbarUI();
      this.updateSelectionToolbarUI();
      this.updateViewNavigationUi();
    }

    prepareLayerManager(doc) {
      if (!doc || !doc.sceneGraph) {
        this.currentLayerCatalog = null;
        this.currentLayerOverrides = null;
        if (this.layerManagerContainer) {
          this.layerManagerContainer.innerHTML = '<p>No layer metadata available.</p>';
        }
        if (this.layerManagerStatus) {
          this.layerManagerStatus.textContent = 'Layer metadata unavailable';
        }
        if (this.surfaceManager && typeof this.surfaceManager.setLayerState === 'function') {
          this.surfaceManager.setLayerState(null);
        }
        return;
      }
      const tabId = doc.tabId || this.currentTabId || null;
      this.currentLayerCatalog = this.buildLayerCatalog(doc);
      let overrides = null;
      if (tabId && this.layerOverridesByTab.has(tabId)) {
        overrides = this.layerOverridesByTab.get(tabId);
      } else {
        overrides = new Map();
        if (tabId) {
          this.layerOverridesByTab.set(tabId, overrides);
        }
      }
      const catalog = this.currentLayerCatalog || new Map();
      overrides.forEach((_, key) => {
        if (!catalog.has(key)) {
          overrides.delete(key);
        }
      });
      this.currentLayerOverrides = overrides;
      this.renderLayerManagerTable(doc.sceneGraph);
      this.applyLayerStateToSurface({ reRender: false });
    }

    buildLayerCatalog(doc) {
      const catalog = new Map();
      if (!doc || !doc.sceneGraph) {
        return catalog;
      }
      const sceneGraph = doc.sceneGraph;
      const tables = sceneGraph.tables || {};
      const layerEntries = tables.layers || {};
      const colorBooks = tables.colorBooks || null;
      const plotStyles = tables.plotStyles || null;
      const plotStyleMode = Number.isInteger(tables.plotStyleMode) ? tables.plotStyleMode : (plotStyles ? plotStyles.mode : null);
      const usageList = this.computeLayerStats(sceneGraph) || [];
      const usageMap = new Map();
      usageList.forEach((entry) => usageMap.set(entry.name, entry));

      const registerLayer = (rawName, entry) => {
        const name = (rawName || entry?.name || '').trim();
        if (!name) {
          return;
        }
        const key = name.toUpperCase();
        if (catalog.has(key)) {
          return;
        }
        const flags = Number(entry?.flags) || 0;
        const colorNumber = Number.isInteger(entry?.colorNumber) ? entry.colorNumber : null;
        const trueColor = entry?.trueColor || null;
        const colorBook = entry?.colorBook || null;
        const colorBookResolved = entry?.colorBookResolved || null;
        const transparency = entry?.transparency || null;
        const usage = usageMap.get(name) || { count: 0, spaces: [] };
        const baseIsOn = colorNumber == null ? true : colorNumber >= 0;
        const baseIsFrozen = (flags & 1) === 1;
        const baseIsLocked = (flags & 4) === 4;
        const baseTransparencyAlpha = transparency && typeof transparency.alpha === 'number'
          ? Math.max(0, Math.min(1, transparency.alpha))
          : 1;
        const colorInfo = this.computeLayerColorInfo({
          colorNumber,
          trueColor,
          colorBook,
          colorBookResolved
        }, colorBooks);
        const plotStyleHandle = entry?.plotStyle || null;
        const resolvedPlotStyle = this.resolvePlotStyleDescriptor(plotStyleHandle, plotStyles);
        let plotStyleLabel = '—';
        let plotStyleDisplay = null;
        if (resolvedPlotStyle) {
          plotStyleLabel = resolvedPlotStyle.label || '—';
          plotStyleDisplay = resolvedPlotStyle.displayName || plotStyleLabel;
        } else if (plotStyleHandle) {
          plotStyleLabel = plotStyleHandle;
          plotStyleDisplay = plotStyleHandle;
        } else if (plotStyleMode != null) {
          plotStyleLabel = plotStyleMode === 1 ? 'By Color' : 'By Style';
          plotStyleDisplay = plotStyleMode === 1 ? 'By Color (CTB)' : 'By Style (STB)';
        }
        catalog.set(key, {
          name,
          baseFlags: flags,
          baseIsOn,
          baseIsFrozen,
          baseIsLocked,
          baseColorNumber: colorNumber,
          baseTrueColor: trueColor,
          baseColorBook: colorBook,
          baseColorBookResolved: colorBookResolved,
          basePlotStyleHandle: plotStyleHandle,
          basePlotStyleDescriptor: resolvedPlotStyle,
          basePlotStyle: plotStyleLabel,
          basePlotStyleDisplay: plotStyleDisplay,
          baseLinetype: entry?.linetype || null,
          baseLineweight: Number.isFinite(entry?.lineweight) ? entry.lineweight : null,
          baseMaterial: entry?.material || null,
          baseTransparency: transparency,
          baseTransparencyAlpha,
          baseTransparencyPercent: Math.round((1 - baseTransparencyAlpha) * 100),
          baseColorCss: colorInfo.css,
          baseColorLabel: colorInfo.label,
          usageCount: usage.count || 0,
          usageSpaces: Array.isArray(usage.spaces) ? usage.spaces : []
        });
      };

      Object.keys(layerEntries).forEach((name) => registerLayer(name, layerEntries[name]));
      usageMap.forEach((_, name) => {
        if (!layerEntries[name]) {
          registerLayer(name, null);
        }
      });
      if (!catalog.has('0')) {
        registerLayer('0', layerEntries['0'] || { name: '0' });
      }
      return catalog;
    }

    computeLayerColorInfo(metadata = {}, colorBooks = null) {
      const trueColor = metadata.trueColor || null;
      const colorNumber = metadata.colorNumber;
      const colorBookResolved = metadata.colorBookResolved || this.resolveColorBookDescriptor(metadata.colorBook, colorBooks);
      if (colorBookResolved) {
        if (colorBookResolved.trueColor && colorBookResolved.trueColor.hex) {
          const hex = String(colorBookResolved.trueColor.hex).toUpperCase();
          const label = `${colorBookResolved.bookName || (metadata.colorBook && metadata.colorBook.book) || ''}:${colorBookResolved.name || ''}`.replace(/:+$/, '');
          return {
            css: hex,
            label: label || hex
          };
        }
        if (Number.isInteger(colorBookResolved.aci)) {
          const aci = Math.abs(colorBookResolved.aci);
          const rgb = this.lookupAciColor(aci);
          const label = `${colorBookResolved.bookName || (metadata.colorBook && metadata.colorBook.book) || ''}:${colorBookResolved.name || ''}`.replace(/:+$/, '');
          return {
            css: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
            label: label || `ACI ${aci}`
          };
        }
      }
      if (trueColor && trueColor.hex) {
        const hex = String(trueColor.hex).toUpperCase();
        return {
          css: hex,
          label: hex
        };
      }
      if (Number.isInteger(colorNumber)) {
        const aci = Math.abs(colorNumber);
        const rgb = this.lookupAciColor(aci);
        return {
          css: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
          label: `ACI ${aci}`
        };
      }
      return {
        css: 'rgba(210,227,255,1)',
        label: 'ByLayer'
      };
    }

    resolveColorBookDescriptor(reference, colorBooks) {
      if (!reference || !colorBooks) {
        return null;
      }
      const byKey = colorBooks.byKey || null;
      const byHandle = colorBooks.byHandle || null;
      const books = colorBooks.books || null;
      if (reference.handle && byHandle) {
        const handleKey = String(reference.handle).trim().toUpperCase();
        if (handleKey && byHandle[handleKey]) {
          return byHandle[handleKey];
        }
      }
      const bookKey = reference.book ? String(reference.book).trim().toUpperCase() : null;
      const colorKey = reference.colorName ? String(reference.colorName).trim().toUpperCase() : null;
      if (bookKey && colorKey && byKey) {
        const composite = `${bookKey}::${colorKey}`;
        if (byKey[composite]) {
          return byKey[composite];
        }
      }
      if (bookKey && books && books[bookKey] && colorKey) {
        const book = books[bookKey];
        if (book && book.colors && book.colors[colorKey]) {
          return book.colors[colorKey];
        }
      }
      return null;
    }

    resolvePlotStyleDescriptor(handle, plotStyles) {
      if (!plotStyles) {
        return null;
      }
      const lookup = plotStyles.handleLookup || {};
      const normalized = this.normalizeHandle(handle);
      if (!normalized) {
        return null;
      }
      const descriptor = lookup[normalized];
      if (!descriptor) {
        return null;
      }
      const type = descriptor.type || (plotStyles.modeLabel === 'colorDependent' ? 'colorDependent' : 'named');
      const result = {
        type,
        name: descriptor.name || descriptor.nameUpper || null,
        handle: descriptor.handle || handle,
        handleUpper: descriptor.handleUpper || normalized,
        dictionaryHandle: descriptor.dictionaryHandle || null,
        isDefault: !!descriptor.isDefault,
        placeholder: descriptor.placeholder || null
      };
      let label = result.name || result.handleUpper || result.handle || normalized;
      if (type === 'colorDependent') {
        const candidate = (descriptor.name || '').trim();
        if (/^[0-9A-Fa-f]{2}$/.test(candidate)) {
          const colorIndex = parseInt(candidate, 16);
          if (Number.isFinite(colorIndex)) {
            result.colorIndex = colorIndex;
            label = `Color ${colorIndex}`;
          }
        }
        if (!label) {
          label = 'Color Dependent';
        }
      } else if (!label) {
        label = 'Normal';
      }
      const typeLabel = type === 'colorDependent' ? 'CTB' : 'STB';
      result.label = label;
      result.displayName = `${label}${typeLabel ? ` (${typeLabel})` : ''}`;
      return result;
    }

    lookupAciColor(index) {
      const table = {
        1: { r: 255, g: 0, b: 0 },
        2: { r: 255, g: 255, b: 0 },
        3: { r: 0, g: 255, b: 0 },
        4: { r: 0, g: 255, b: 255 },
        5: { r: 0, g: 0, b: 255 },
        6: { r: 255, g: 0, b: 255 },
        7: { r: 255, g: 255, b: 255 }
      };
      return table[index] || { r: 180, g: 200, b: 220 };
    }

    renderPlotConfigurationSummary(tables) {
      if (!tables) {
        return '';
      }
      const plotStyles = tables.plotStyles || null;
      const plotConfigurations = tables.plotConfigurations || null;
      const layouts = tables.layouts || null;
      const modeRaw = Number.isInteger(tables.plotStyleMode) ? tables.plotStyleMode : (plotStyles ? plotStyles.mode : null);
      const modeLabel = (() => {
        if (plotStyles && plotStyles.modeLabel) {
          return plotStyles.modeLabel === 'colorDependent'
            ? 'CTB (Color-Dependent)'
            : (plotStyles.modeLabel === 'named' ? 'STB (Named)' : plotStyles.modeLabel);
        }
        if (modeRaw === 1) {
          return 'CTB (Color-Dependent)';
        }
        if (modeRaw === 0) {
          return 'STB (Named)';
        }
        return null;
      })();

      const layoutEntries = [];
      const byHandle = plotConfigurations && plotConfigurations.byHandle ? plotConfigurations.byHandle : {};
      const byName = plotConfigurations && plotConfigurations.byName ? plotConfigurations.byName : {};

      if (layouts && Array.isArray(layouts.ordered) && layouts.ordered.length) {
        layouts.ordered.forEach((layout) => {
          const handleKey = layout.handleUpper || this.normalizeHandle(layout.handle);
          let config = null;
          if (handleKey && byHandle[handleKey]) {
            config = byHandle[handleKey];
          } else if (layout.nameUpper && byName[layout.nameUpper]) {
            config = byName[layout.nameUpper];
          }
          layoutEntries.push({ layout, config });
        });
      } else if (plotConfigurations && Object.keys(byName).length) {
        Object.keys(byName).forEach((nameKey) => {
          layoutEntries.push({
            layout: { name: nameKey, nameUpper: nameKey },
            config: byName[nameKey]
          });
        });
      }

      if (!modeLabel && !layoutEntries.length) {
        return '';
      }

      const rows = layoutEntries.map((entry) => {
        const layoutName = entry.layout && entry.layout.name
          ? entry.layout.name
          : (entry.config && entry.config.layoutName ? entry.config.layoutName : 'Layout');
        const config = entry.config || {};
        let sheet = config.plotStyleTable || '';
        if (!sheet) {
          if (config.plotStyleMode === 1 || modeRaw === 1) {
            sheet = 'By Color (CTB)';
          } else if (config.plotStyleMode === 0 || modeRaw === 0) {
            sheet = 'By Style (STB)';
          } else {
            sheet = '—';
          }
        }
        const device = config.plotConfigurationFile || '—';
        let paper = config.paperSize || '';
        if (!paper && config.paper && (config.paper.width || config.paper.height)) {
          const width = config.paper.width != null ? config.paper.width.toFixed(1) : '?';
          const height = config.paper.height != null ? config.paper.height.toFixed(1) : '?';
          paper = `${width} × ${height} mm`;
        }
        if (!paper) {
          paper = '—';
        }
        const usesPlotStyles = config.flags != null ? ((config.flags & 32) === 32) : null;
        const usesLabel = usesPlotStyles == null ? '—' : (usesPlotStyles ? 'Yes' : 'No');
        return `
          <tr>
            <td>${this.escapeHtml(layoutName)}</td>
            <td>${this.escapeHtml(sheet)}</td>
            <td>${this.escapeHtml(device)}</td>
            <td>${this.escapeHtml(paper)}</td>
            <td>${usesLabel}</td>
          </tr>
        `;
      }).join('');

      const tableHtml = rows
        ? `
          <table class="plot-summary-table">
            <thead>
              <tr>
                <th>Layout</th>
                <th>Style Sheet</th>
                <th>Device</th>
                <th>Paper</th>
                <th>Use Plot Styles</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        `
        : '<p>No plot configuration metadata available.</p>';

      return `
        <div class="plot-summary">
          ${modeLabel ? `<div class="plot-summary-mode">Plot Styles: ${this.escapeHtml(modeLabel)}</div>` : ''}
          ${tableHtml}
        </div>
      `;
    }

    renderSceneStats(stats = {}) {
      const totals = {
        'Model Space': stats.modelSpaceEntities ?? 0,
        'Paper Layouts': stats.paperSpaceLayouts ?? 0,
        'Paper Entities': stats.paperSpaceEntities ?? 0,
        Blocks: stats.blockCount ?? 0,
        'Block Entities': stats.blockEntities ?? 0,
        'Total Renderables': stats.renderableEntities ?? 0
      };
      const rows = Object.keys(totals).map((label) => {
        const value = this.escapeHtml(String(totals[label]));
        return this.renderSummaryRow(label, value);
      }).join('');
      return `
        <div class="rendering-summary-section">
          <h4>Entity Totals</h4>
          <div class="rendering-summary-grid">
            ${rows}
          </div>
        </div>
      `;
    }

    renderDrawingPropertiesSummary(drawingProperties) {
      if (!drawingProperties || typeof drawingProperties !== 'object') {
        return '';
      }
      const units = drawingProperties.units || {};
      const limits = drawingProperties.limits || {};
      const extents = drawingProperties.extents || {};
      const metadata = drawingProperties.metadata || {};
      const geographic = drawingProperties.geographic || {};
      const unitLabel = this.getUnitsLabel(units.insUnits);
      const measurementLabel = this.getMeasurementLabel(units.measurement);
      const basePointText = this.formatPoint3D(units.basePoint);
      const scaleFactorText = this.formatNumber(units.scaleFactor, { maxDigits: 6 });
      const sourceLabel = this.getUnitsLabel(units.insUnitsSource);
      const targetLabel = this.getUnitsLabel(units.insUnitsTarget);
      let conversionDisplay = '';
      if (sourceLabel || targetLabel) {
        conversionDisplay = `${sourceLabel || '—'} → ${targetLabel || '—'}`;
      }

      const unitsRows = [
        this.renderSummaryRow('Insertion Units', unitLabel ? this.escapeHtml(unitLabel) : '—'),
        this.renderSummaryRow('Measurement', measurementLabel ? this.escapeHtml(measurementLabel) : '—'),
        this.renderSummaryRow('Base Point', this.escapeHtml(basePointText)),
        this.renderSummaryRow('Scale Factor', scaleFactorText != null ? this.escapeHtml(scaleFactorText) : '—'),
        conversionDisplay ? this.renderSummaryRow('Source → Target', this.escapeHtml(conversionDisplay)) : ''
      ].filter(Boolean).join('');

      const modelLimitText = this.formatRange2D(limits.model);
      const paperLimitText = this.formatRange2D(limits.paper);
      const modelExtentText = this.formatRange3D(extents.model);
      const paperExtentText = this.formatRange3D(extents.paper);

      const limitsRows = [
        this.renderSummaryRow('Model Limits', this.escapeHtml(modelLimitText)),
        this.renderSummaryRow('Paper Limits', this.escapeHtml(paperLimitText)),
        this.renderSummaryRow('Model Extents', this.escapeHtml(modelExtentText)),
        this.renderSummaryRow('Paper Extents', this.escapeHtml(paperExtentText))
      ].join('');

      const createdText = this.formatTimestamp(metadata.created);
      const updatedText = this.formatTimestamp(metadata.updated);
      const totalEditingText = this.formatDuration(metadata.totalEditingTime);
      const userTimerText = this.formatDuration(metadata.userTimer);
      const timezoneText = this.formatTimezoneOffset(metadata.timezoneMinutes);

      const metadataRows = [
        this.renderSummaryRow('ACAD Version', metadata.acadVersion ? this.escapeHtml(metadata.acadVersion) : '—'),
        this.renderSummaryRow('Code Page', metadata.codePage ? this.escapeHtml(metadata.codePage) : '—'),
        this.renderSummaryRow('Last Saved By', metadata.lastSavedBy ? this.escapeHtml(metadata.lastSavedBy) : '—'),
        this.renderSummaryRow('Project Name', metadata.projectName ? this.escapeHtml(metadata.projectName) : '—'),
        this.renderSummaryRow('Created', createdText ? this.escapeHtml(createdText) : '—'),
        this.renderSummaryRow('Updated', updatedText ? this.escapeHtml(updatedText) : '—'),
        this.renderSummaryRow('Editing Time', totalEditingText ? this.escapeHtml(totalEditingText) : '—'),
        this.renderSummaryRow('User Timer', userTimerText ? this.escapeHtml(userTimerText) : '—'),
        this.renderSummaryRow('Time Zone', timezoneText ? this.escapeHtml(timezoneText) : '—')
      ].join('');

      const geoStatus = geographic.hasGeoData ? 'Configured' : 'Not configured';
      const latitudeText = this.formatLatitude(geographic.latitude);
      const longitudeText = this.formatLongitude(geographic.longitude);
      const elevationNumeric = this.formatNumber(geographic.elevation, { maxDigits: 3 });
      const elevationDisplay = elevationNumeric != null
        ? `${elevationNumeric}${geographic.units ? ` ${geographic.units}` : ''}`
        : null;
      const coordinateSystem = geographic.coordinateSystem ? this.escapeHtml(geographic.coordinateSystem) : null;
      const description = geographic.description ? this.escapeHtml(geographic.description) : null;
      const unitsDisplay = geographic.units ? this.escapeHtml(String(geographic.units)) : null;
      const geoObject = geographic.object || null;
      const designPointText = geoObject ? this.formatPoint3D(geoObject.designPoint) : null;
      const referencePointText = geoObject ? this.formatPoint3D(geoObject.referencePoint) : null;
      const northDirectionText = geoObject ? this.formatPoint3D(geoObject.northDirection) : null;

      const geoRows = [
        this.renderSummaryRow('Status', this.escapeHtml(geoStatus)),
        latitudeText ? this.renderSummaryRow('Latitude', this.escapeHtml(latitudeText)) : '',
        longitudeText ? this.renderSummaryRow('Longitude', this.escapeHtml(longitudeText)) : '',
        elevationDisplay ? this.renderSummaryRow('Elevation', this.escapeHtml(elevationDisplay)) : '',
        coordinateSystem ? this.renderSummaryRow('Coordinate System', coordinateSystem) : '',
        description ? this.renderSummaryRow('Description', description) : '',
        unitsDisplay ? this.renderSummaryRow('Units', unitsDisplay) : '',
        designPointText && designPointText !== '—' ? this.renderSummaryRow('Design Point', this.escapeHtml(designPointText)) : '',
        referencePointText && referencePointText !== '—' ? this.renderSummaryRow('Reference Point', this.escapeHtml(referencePointText)) : '',
        northDirectionText && northDirectionText !== '—' ? this.renderSummaryRow('North Direction', this.escapeHtml(northDirectionText)) : ''
      ].filter(Boolean).join('');

      const sections = [];
      if (unitsRows) {
        sections.push(`
          <div class="rendering-summary-section">
            <h4>Units</h4>
            <div class="rendering-summary-grid">
              ${unitsRows}
            </div>
          </div>
        `);
      }
      if (limitsRows) {
        sections.push(`
          <div class="rendering-summary-section">
            <h4>Limits &amp; Extents</h4>
            <div class="rendering-summary-grid">
              ${limitsRows}
            </div>
          </div>
        `);
      }
      if (metadataRows) {
        sections.push(`
          <div class="rendering-summary-section">
            <h4>Metadata</h4>
            <div class="rendering-summary-grid">
              ${metadataRows}
            </div>
          </div>
        `);
      }
      if (geoRows) {
        sections.push(`
          <div class="rendering-summary-section">
            <h4>Geographic Location</h4>
            <div class="rendering-summary-grid">
              ${geoRows}
            </div>
          </div>
        `);
      }

      return sections.join('');
    }

    renderSummaryRow(label, value) {
      const safeLabel = this.escapeHtml(label);
      const content = value != null && value !== '' ? value : '—';
      return `<div><span class="label">${safeLabel}:</span> ${content}</div>`;
    }

    formatNumber(value, options = {}) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return null;
      }
      const maxDigits = Number.isInteger(options.maxDigits) ? options.maxDigits : 4;
      let text = numeric.toFixed(maxDigits);
      if (options.trimZeros !== false) {
        text = text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      }
      if (text === '-0') {
        text = '0';
      }
      return text;
    }

    formatPoint2D(point) {
      if (!point || point.x == null || point.y == null) {
        return '—';
      }
      const x = this.formatNumber(point.x);
      const y = this.formatNumber(point.y);
      if (x == null || y == null) {
        return '—';
      }
      return `(${x}, ${y})`;
    }

    formatPoint3D(point) {
      if (!point || point.x == null || point.y == null) {
        return '—';
      }
      const x = this.formatNumber(point.x);
      const y = this.formatNumber(point.y);
      const z = point.z != null ? this.formatNumber(point.z) : null;
      if (x == null || y == null) {
        return '—';
      }
      const coords = [x, y];
      if (z != null) {
        coords.push(z);
      }
      return `(${coords.join(', ')})`;
    }

    formatRange2D(range) {
      if (!range) {
        return '—';
      }
      const start = this.formatPoint2D(range.min || {});
      const end = this.formatPoint2D(range.max || {});
      if (start === '—' && end === '—') {
        return '—';
      }
      return `${start} → ${end}`;
    }

    formatRange3D(range) {
      if (!range) {
        return '—';
      }
      const start = this.formatPoint3D(range.min || {});
      const end = this.formatPoint3D(range.max || {});
      if (start === '—' && end === '—') {
        return '—';
      }
      return `${start} → ${end}`;
    }

    formatTimestamp(descriptor) {
      if (!descriptor || typeof descriptor !== 'object') {
        return null;
      }
      if (descriptor.locale) {
        return descriptor.locale;
      }
      if (descriptor.iso) {
        return descriptor.iso;
      }
      if (descriptor.julian != null) {
        return `Julian ${descriptor.julian}`;
      }
      return null;
    }

    formatDuration(duration) {
      if (!duration || typeof duration !== 'object') {
        return null;
      }
      if (Number.isFinite(duration.hours)) {
        const hoursText = this.formatNumber(duration.hours, { maxDigits: 2 });
        const daysText = Number.isFinite(duration.days) ? this.formatNumber(duration.days, { maxDigits: 2 }) : null;
        if (hoursText && daysText) {
          return `${hoursText} h (${daysText} d)`;
        }
        if (hoursText) {
          return `${hoursText} h`;
        }
      }
      if (Number.isFinite(duration.days)) {
        return `${this.formatNumber(duration.days, { maxDigits: 2 })} d`;
      }
      return null;
    }

    formatTimezoneOffset(minutes) {
      if (!Number.isFinite(minutes)) {
        return null;
      }
      const totalMinutes = Number(minutes);
      const sign = totalMinutes <= 0 ? '+' : '-';
      const absMinutes = Math.abs(totalMinutes);
      const hours = Math.floor(absMinutes / 60);
      const mins = absMinutes % 60;
      const hh = String(hours).padStart(2, '0');
      const mm = String(mins).padStart(2, '0');
      return `UTC${sign}${hh}:${mm} (${totalMinutes} min)`;
    }

    formatLatitude(value) {
      if (!Number.isFinite(value)) {
        return null;
      }
      const suffix = value >= 0 ? 'N' : 'S';
      const magnitude = this.formatNumber(Math.abs(value), { maxDigits: 6 });
      return magnitude ? `${magnitude}° ${suffix}` : null;
    }

    formatLongitude(value) {
      if (!Number.isFinite(value)) {
        return null;
      }
      const suffix = value >= 0 ? 'E' : 'W';
      const magnitude = this.formatNumber(Math.abs(value), { maxDigits: 6 });
      return magnitude ? `${magnitude}° ${suffix}` : null;
    }

    getUnitsLabel(code) {
      const unitMap = {
        0: 'Unitless',
        1: 'Inches',
        2: 'Feet',
        3: 'Miles',
        4: 'Millimeters',
        5: 'Centimeters',
        6: 'Meters',
        7: 'Kilometers',
        8: 'Micro-inches',
        9: 'Mils',
        10: 'Yards',
        11: 'Angstroms',
        12: 'Nanometers',
        13: 'Micrometers',
        14: 'Decimeters',
        15: 'Decameters',
        16: 'Hectometers',
        17: 'Gigameters',
        18: 'Astronomical units',
        19: 'Light years',
        20: 'Parsecs',
        21: 'US survey feet'
      };
      if (!Number.isFinite(code)) {
        return null;
      }
      return unitMap[code] || `Custom (${code})`;
    }

    getMeasurementLabel(code) {
      if (!Number.isFinite(code)) {
        return null;
      }
      if (code === 0) {
        return 'Imperial';
      }
      if (code === 1) {
        return 'Metric';
      }
      return `Custom (${code})`;
    }

    getEffectiveLayerState(layerName) {
      if (!layerName) {
        return null;
      }
      const key = String(layerName).trim().toUpperCase();
      const catalog = this.currentLayerCatalog;
      if (!catalog || !catalog.has(key)) {
        return {
          name: layerName,
          effectiveIsOn: true,
          effectiveIsFrozen: false,
          effectiveIsLocked: false,
          effectiveTransparencyAlpha: 1,
          effectiveTransparencyPercent: 0,
          effectiveColorCss: 'rgba(210,227,255,1)',
          basePlotStyleHandle: null,
          basePlotStyleDescriptor: null,
          basePlotStyle: '—',
          basePlotStyleDisplay: '—',
          usageCount: 0,
          usageSpaces: [],
          hasOverrides: false
        };
      }
      const base = catalog.get(key);
      const overrides = this.currentLayerOverrides && this.currentLayerOverrides.get(key) ? this.currentLayerOverrides.get(key) : null;
      const resolveFlag = (prop, fallback) => {
        if (overrides && Object.prototype.hasOwnProperty.call(overrides, prop)) {
          return !!overrides[prop];
        }
        return !!fallback;
      };
      const effectiveIsOn = resolveFlag('isOn', base.baseIsOn);
      const effectiveIsFrozen = resolveFlag('isFrozen', base.baseIsFrozen);
      const effectiveIsLocked = resolveFlag('isLocked', base.baseIsLocked);

      let effectiveTransparencyAlpha = 1;
      if (overrides && Object.prototype.hasOwnProperty.call(overrides, 'transparencyAlpha')) {
        const overrideAlpha = overrides.transparencyAlpha;
        if (typeof overrideAlpha === 'number' && !Number.isNaN(overrideAlpha)) {
          effectiveTransparencyAlpha = Math.max(0, Math.min(1, overrideAlpha));
        }
      } else if (base.baseTransparency && typeof base.baseTransparency.alpha === 'number') {
        effectiveTransparencyAlpha = Math.max(0, Math.min(1, base.baseTransparency.alpha));
      }

      return Object.assign({}, base, {
        effectiveIsOn,
        effectiveIsFrozen,
        effectiveIsLocked,
        effectiveTransparencyAlpha,
        effectiveTransparencyPercent: Math.round((1 - effectiveTransparencyAlpha) * 100),
        effectiveColorCss: base.baseColorCss,
        hasOverrides: !!(overrides && Object.keys(overrides).length)
      });
    }

    renderLayerManagerTable(sceneGraph) {
      if (!this.layerManagerContainer) {
        return;
      }
      if (this.layerManagerFilterInput && this.layerManagerFilterInput.value !== this.layerManagerFilterText) {
        this.layerManagerFilterInput.value = this.layerManagerFilterText;
      }
      if (this.layerManagerHideInactiveCheckbox) {
        this.layerManagerHideInactiveCheckbox.checked = !!this.layerManagerHideInactiveFlag;
      }
      if (!this.currentLayerCatalog || !this.currentLayerCatalog.size) {
        this.layerManagerContainer.innerHTML = '<p>No layer metadata available.</p>';
        if (this.layerManagerStatus) {
          this.layerManagerStatus.textContent = 'No layers detected';
        }
        return;
      }

      const statsSource = sceneGraph || this.currentSceneGraph || {};
      const usageList = this.computeLayerStats(statsSource) || [];
      const usageMap = new Map();
      usageList.forEach((entry) => usageMap.set(entry.name, entry));

      const filter = (this.layerManagerFilterText || '').trim().toLowerCase();
      const hideInactive = !!this.layerManagerHideInactiveFlag;

      const rows = [];
      this.currentLayerCatalog.forEach((base, key) => {
        const effective = this.getEffectiveLayerState(base.name);
        if (filter && base.name.toLowerCase().indexOf(filter) === -1) {
          return;
        }
        if (hideInactive && (!effective.effectiveIsOn || effective.effectiveIsFrozen)) {
          return;
        }
        const usage = usageMap.get(base.name) || {
          count: base.usageCount || 0,
          spaces: base.usageSpaces || []
        };
        const overrides = this.currentLayerOverrides && this.currentLayerOverrides.get(key);
        rows.push({ base, effective, usage, overrides });
      });

      rows.sort((a, b) => a.base.name.localeCompare(b.base.name, undefined, { sensitivity: 'base' }));

      if (!rows.length) {
        this.layerManagerContainer.innerHTML = '<p>No layers match the current filters.</p>';
      } else {
        const body = rows.map((row) => {
        const rowClasses = [
          'layer-manager-row',
          !row.effective.effectiveIsOn ? 'layer-manager-row--off' : '',
          row.effective.effectiveIsFrozen ? 'layer-manager-row--frozen' : '',
          row.effective.effectiveIsLocked ? 'layer-manager-row--locked' : '',
          row.overrides && Object.keys(row.overrides).length ? 'layer-manager-row--overridden' : ''
        ].filter(Boolean).join(' ');
        const spacesLabel = row.usage.spaces && row.usage.spaces.length
          ? row.usage.spaces.join(', ')
          : '—';
        const plotStyleDescriptor = row.base.basePlotStyleDescriptor || null;
        const plotStyleLabel = plotStyleDescriptor
          ? (plotStyleDescriptor.label || '—')
          : (row.base.basePlotStyle || '—');
        const plotStyleTitle = plotStyleDescriptor
          ? (plotStyleDescriptor.displayName || plotStyleLabel)
          : (row.base.basePlotStyleDisplay || plotStyleLabel);
        return `
            <tr class="${rowClasses}" data-layer="${row.base.name}">
              <td class="layer-manager-cell layer-manager-name">
                <span class="layer-color-swatch" style="background:${row.effective.effectiveColorCss};"></span>
                <div class="layer-name-block">
                  <div class="layer-name-text">${row.base.name}</div>
                  <div class="layer-name-meta">Entities: ${row.usage.count || 0} • Spaces: ${spacesLabel}</div>
                </div>
              </td>
              <td class="layer-manager-cell layer-manager-toggle">
                <label>
                  <input type="checkbox" data-action="toggle-on" data-layer="${row.base.name}" ${row.effective.effectiveIsOn ? 'checked' : ''}>
                  <span>On</span>
                </label>
              </td>
              <td class="layer-manager-cell layer-manager-toggle">
                <label>
                  <input type="checkbox" data-action="toggle-frozen" data-layer="${row.base.name}" ${row.effective.effectiveIsFrozen ? 'checked' : ''}>
                  <span>Frozen</span>
                </label>
              </td>
              <td class="layer-manager-cell layer-manager-toggle">
                <label>
                  <input type="checkbox" data-action="toggle-locked" data-layer="${row.base.name}" ${row.effective.effectiveIsLocked ? 'checked' : ''}>
                  <span>Locked</span>
                </label>
              </td>
              <td class="layer-manager-cell layer-manager-transparency">
                <input type="range" min="0" max="90" step="5" value="${row.effective.effectiveTransparencyPercent}" data-action="transparency" data-layer="${row.base.name}">
                <span class="layer-transparency-value">${row.effective.effectiveTransparencyPercent}%</span>
              </td>
              <td class="layer-manager-cell layer-manager-plot-style" title="${this.escapeHtml(plotStyleTitle)}">${this.escapeHtml(plotStyleLabel)}</td>
            </tr>
          `;
        }).join('');

        this.layerManagerContainer.innerHTML = `
          <table class="layer-manager-table">
            <thead>
              <tr>
                <th>Layer</th>
                <th>On</th>
                <th>Frozen</th>
                <th>Locked</th>
                <th>Transparency</th>
                <th>Plot Style</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        `;
      }

      this.bindLayerManagerEvents();

      if (this.layerManagerStatus) {
        this.layerManagerStatus.textContent = this.computeLayerVisibilitySummary();
      }
    }

    bindLayerManagerEvents() {
      if (!this.layerManagerContainer) {
        return;
      }
      const onToggles = this.layerManagerContainer.querySelectorAll('input[data-action="toggle-on"]');
      onToggles.forEach((input) => {
        input.addEventListener('change', (event) => {
          const layer = event.target.dataset.layer;
          this.setLayerOverride(layer, 'isOn', event.target.checked);
        });
      });
      const frozenToggles = this.layerManagerContainer.querySelectorAll('input[data-action="toggle-frozen"]');
      frozenToggles.forEach((input) => {
        input.addEventListener('change', (event) => {
          const layer = event.target.dataset.layer;
          this.setLayerOverride(layer, 'isFrozen', event.target.checked);
        });
      });
      const lockedToggles = this.layerManagerContainer.querySelectorAll('input[data-action="toggle-locked"]');
      lockedToggles.forEach((input) => {
        input.addEventListener('change', (event) => {
          const layer = event.target.dataset.layer;
          this.setLayerOverride(layer, 'isLocked', event.target.checked);
        });
      });
      const transparencySliders = this.layerManagerContainer.querySelectorAll('input[data-action="transparency"]');
      transparencySliders.forEach((slider) => {
        slider.addEventListener('input', (event) => {
          const layer = event.target.dataset.layer;
          const percent = Number(event.target.value);
          this.setLayerTransparency(layer, percent, { reRenderTable: false });
          const label = event.target.parentElement ? event.target.parentElement.querySelector('.layer-transparency-value') : null;
          if (label) {
            label.textContent = `${percent}%`;
          }
        });
        slider.addEventListener('change', () => {
          this.renderLayerManagerTable();
        });
      });
    }

    computeLayerVisibilitySummary() {
      if (!this.currentLayerCatalog || !this.currentLayerCatalog.size) {
        return 'No layers detected';
      }
      let total = 0;
      let visible = 0;
      let frozen = 0;
      let locked = 0;
      let overrides = 0;
      this.currentLayerCatalog.forEach((base, key) => {
        total += 1;
        const effective = this.getEffectiveLayerState(base.name);
        if (effective.effectiveIsOn && !effective.effectiveIsFrozen) {
          visible += 1;
        }
        if (effective.effectiveIsFrozen) {
          frozen += 1;
        }
        if (effective.effectiveIsLocked) {
          locked += 1;
        }
        if (this.currentLayerOverrides && this.currentLayerOverrides.has(key)) {
          overrides += 1;
        }
      });
      const parts = [`${visible}/${total} visible`];
      if (frozen) {
        parts.push(`${frozen} frozen`);
      }
      if (locked) {
        parts.push(`${locked} locked`);
      }
      if (overrides) {
        parts.push(`${overrides} overrides`);
      }
      return parts.join(' · ');
    }

    getLayerBaseValue(base, property) {
      switch (property) {
        case 'isOn':
          return !!base.baseIsOn;
        case 'isFrozen':
          return !!base.baseIsFrozen;
        case 'isLocked':
          return !!base.baseIsLocked;
        case 'transparencyAlpha':
          if (base.baseTransparency && typeof base.baseTransparency.alpha === 'number') {
            return Math.max(0, Math.min(1, base.baseTransparency.alpha));
          }
          return 1;
        default:
          return null;
      }
    }

    normalizeLayerOverrideValue(property, value) {
      if (property === 'transparencyAlpha') {
        if (typeof value !== 'number' || Number.isNaN(value)) {
          return 1;
        }
        return Math.max(0, Math.min(1, value));
      }
      return !!value;
    }

    areLayerValuesEqual(property, a, b) {
      if (property === 'transparencyAlpha') {
        const safeA = typeof a === 'number' ? a : 1;
        const safeB = typeof b === 'number' ? b : 1;
        return Math.abs(safeA - safeB) < 0.001;
      }
      return !!a === !!b;
    }

    setLayerOverride(layerName, property, value, options = {}) {
      if (!layerName) {
        return;
      }
      const key = String(layerName).trim().toUpperCase();
      if (!key) {
        return;
      }
      const catalog = this.currentLayerCatalog;
      if (!catalog || !catalog.has(key)) {
        return;
      }
      const base = catalog.get(key);
      const { reRenderSurface = true, reRenderTable = true, preserveIsolation = false } = options;
      if (!preserveIsolation) {
        this.invalidateLayerIsolation({ silent: true });
      }
      let overridesMap = this.currentLayerOverrides;
      if (!overridesMap) {
        overridesMap = new Map();
        this.currentLayerOverrides = overridesMap;
      }
      if (this.currentTabId && !this.layerOverridesByTab.has(this.currentTabId)) {
        this.layerOverridesByTab.set(this.currentTabId, overridesMap);
      }
      let overrides = overridesMap.get(key);
      if (!overrides) {
        overrides = {};
        overridesMap.set(key, overrides);
      }

      const baseValue = this.getLayerBaseValue(base, property);
      const normalizedValue = this.normalizeLayerOverrideValue(property, value);

      if (this.areLayerValuesEqual(property, baseValue, normalizedValue)) {
        if (Object.prototype.hasOwnProperty.call(overrides, property)) {
          delete overrides[property];
        }
      } else {
        overrides[property] = normalizedValue;
      }

      if (!Object.keys(overrides).length) {
        overridesMap.delete(key);
      }

      if (this.currentTabId) {
        this.layerOverridesByTab.set(this.currentTabId, overridesMap);
      }
      this.currentLayerOverrides = overridesMap;

      this.applyLayerStateToSurface({ reRender: reRenderSurface });

      if (reRenderTable) {
        this.renderLayerManagerTable();
      }
      if (!preserveIsolation) {
        this.updateIsolationSummary();
      }
      this.updateSelectionToolbarUI();
    }

    setLayerTransparency(layerName, percent, options = {}) {
      const percentLimit = Math.max(0, Math.min(90, Number(percent) || 0));
      const alpha = 1 - percentLimit / 100;
      this.setLayerOverride(layerName, 'transparencyAlpha', alpha, {
        reRenderSurface: options.reRenderSurface !== false,
        reRenderTable: options.reRenderTable !== false,
        preserveIsolation: options.preserveIsolation === true
      });
    }

    resetLayerOverrides() {
      this.invalidateLayerIsolation({ silent: true });
      if (this.currentLayerOverrides) {
        this.currentLayerOverrides.clear();
      } else {
        this.currentLayerOverrides = new Map();
      }
      if (this.currentTabId) {
        this.layerOverridesByTab.set(this.currentTabId, this.currentLayerOverrides);
      }
      this.renderLayerManagerTable();
      this.applyLayerStateToSurface({ reRender: true });
      this.updateIsolationSummary();
      this.updateSelectionToolbarUI();
    }

    applyLayerStateToSurface(options = {}) {
      if (!this.surfaceManager || typeof this.surfaceManager.setLayerState !== 'function') {
        return;
      }
      const { reRender = true } = options;
      if (!this.currentLayerCatalog || !this.currentLayerCatalog.size) {
        this.surfaceManager.setLayerState(null);
        if (reRender && this.currentSceneGraph) {
          const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
          this.surfaceManager.resume();
          this.refreshViewportOverlays(frame);
        }
        return;
      }
      const state = new Map();
      this.currentLayerCatalog.forEach((base, key) => {
        const effective = this.getEffectiveLayerState(base.name);
        state.set(key, {
          name: base.name,
          isOn: effective.effectiveIsOn,
          isFrozen: effective.effectiveIsFrozen,
          isLocked: effective.effectiveIsLocked,
          transparencyAlpha: effective.effectiveTransparencyAlpha
        });
      });
      this.surfaceManager.setLayerState(state);
      if (reRender && this.currentSceneGraph) {
        const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
        this.surfaceManager.resume();
        this.refreshViewportOverlays(frame);
      }
    }

    computeLayerStats(sceneGraph) {
      const counts = new Map();

      const record = (entity, space) => {
        if (!entity) return;
        const layerName = entity.layer || '0';
        if (!counts.has(layerName)) {
          counts.set(layerName, { name: layerName, count: 0, spaces: new Set() });
        }
        const entry = counts.get(layerName);
        entry.count += 1;
        entry.spaces.add(space);
      };

      if (sceneGraph.modelSpace) {
        sceneGraph.modelSpace.forEach((entity) => record(entity, 'Model'));
      }
      if (sceneGraph.paperSpaces) {
        Object.keys(sceneGraph.paperSpaces).forEach((layout) => {
          sceneGraph.paperSpaces[layout].forEach((entity) => record(entity, `Paper:${layout}`));
        });
      }
      if (sceneGraph.blocks) {
        Object.keys(sceneGraph.blocks).forEach((blockName) => {
          const block = sceneGraph.blocks[blockName];
          if (block && Array.isArray(block.entities)) {
            block.entities.forEach((entity) => record(entity, `Block:${blockName}`));
          }
        });
      }

      return Array.from(counts.values())
        .map((entry) => ({
          name: entry.name,
          count: entry.count,
          spaces: Array.from(entry.spaces)
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }

    drawOverlayMessage(message) {
      if (this.surfaceManager) {
        this.surfaceManager.renderMessage(message);
      }
      this.refreshViewportOverlays(null);
    }

    drawOverview(sceneGraph) {
      const frame = this.surfaceManager ? this.surfaceManager.renderScene(sceneGraph) : null;
      this.refreshViewportOverlays(frame);
    }

    resizeCanvas() {
      if (!this.canvas) {
        return;
      }
      const container = this.canvas.parentElement;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(320, rect.width);
      const height = Math.max(240, rect.height);
      if (this.canvas.width !== Math.floor(width * dpr) || this.canvas.height !== Math.floor(height * dpr)) {
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);
      }
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      if (this.surfaceManager) {
        this.surfaceManager.resize(width, height, dpr);
        this.refreshViewportOverlays(this.surfaceManager.lastFrame);
      }
      if (this.textLayer) {
        this.textLayer.style.width = `${width}px`;
        this.textLayer.style.height = `${height}px`;
      }
      this.clearInteractionOverlay();
    }

    close() {
      if (this.overlayRoot) {
        this.overlayRoot.style.display = 'none';
        this.overlayRoot.setAttribute('aria-hidden', 'true');
      }
      this.clearInteractionOverlay();
      if (this.surfaceManager) {
        this.surfaceManager.suspend();
      }
      this.resetMeasurementState({ silent: true });
      this.clearSnapIndicator({ silent: true });
      this.refreshViewportOverlays(null);
      this.updateMeasurementToolbarUI();
      this.currentTabId = null;
      this.currentPane = null;
      this.currentSceneGraph = null;
      this.currentDoc = null;
    }

    applyBlockFilters(options = {}) {
      if (!this.surfaceManager) {
        return;
      }
      const toSetOrNull = (value) => {
        if (!value) {
          return null;
        }
        if (value instanceof Set) {
          return value;
        }
        if (Array.isArray(value)) {
          return value.length ? new Set(value) : null;
        }
        return null;
      };
      const isolationSource = Object.prototype.hasOwnProperty.call(options, 'isolation')
        ? options.isolation
        : (this.app ? this.app.blockIsolation : null);
      const highlightSource = Object.prototype.hasOwnProperty.call(options, 'highlight')
        ? options.highlight
        : (this.app ? this.app.blockHighlights : null);

      const isolation = toSetOrNull(isolationSource);
      const highlight = toSetOrNull(highlightSource);

      this.surfaceManager.setBlockIsolation(isolation);
      this.surfaceManager.setBlockHighlights(highlight);
      this.surfaceManager.setSelectionHandles(this.selectionHandles || new Set());

      if (this.currentSceneGraph) {
        const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
        this.surfaceManager.resume();
        this.refreshViewportOverlays(frame);
      }
    }

    syncAttributeVisibilityControls() {
      if (!this.attributeDisplayState) {
        this.attributeDisplayState = {
          showDefinitions: false,
          showInvisible: false,
          showReferences: true
        };
      }
      if (this.attributeDefinitionCheckbox) {
        this.attributeDefinitionCheckbox.checked = !!this.attributeDisplayState.showDefinitions;
      }
      if (this.attributeReferencesCheckbox) {
        this.attributeReferencesCheckbox.checked = !!this.attributeDisplayState.showReferences;
      }
      if (this.attributeInvisibleCheckbox) {
        this.attributeInvisibleCheckbox.checked = !!this.attributeDisplayState.showInvisible;
      }
    }

    applyAttributeVisibilityControls() {
      const nextState = {
        showDefinitions: this.attributeDefinitionCheckbox ? !!this.attributeDefinitionCheckbox.checked : (this.attributeDisplayState?.showDefinitions || false),
        showReferences: this.attributeReferencesCheckbox ? !!this.attributeReferencesCheckbox.checked : (this.attributeDisplayState?.showReferences !== false),
        showInvisible: this.attributeInvisibleCheckbox ? !!this.attributeInvisibleCheckbox.checked : (this.attributeDisplayState?.showInvisible || false)
      };
      this.attributeDisplayState = nextState;
      if (this.surfaceManager && typeof this.surfaceManager.setAttributeDisplay === 'function') {
        this.surfaceManager.setAttributeDisplay(nextState);
      }
      this.syncAttributeVisibilityControls();
      if (this.currentSceneGraph && this.surfaceManager) {
        const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
        this.surfaceManager.resume();
        this.refreshViewportOverlays(frame);
      }
    }

    ensureSelectionSetForCurrentTab(createIfMissing = true) {
      const tabId = this.currentTabId;
      if (!tabId) {
        return createIfMissing ? new Set() : null;
      }
      if (!this.selectionByTab.has(tabId)) {
        if (!createIfMissing) {
          return null;
        }
        this.selectionByTab.set(tabId, new Set());
      }
      return this.selectionByTab.get(tabId);
    }

    normalizeHandle(handle) {
      if (handle == null) {
        return null;
      }
      const str = typeof handle === 'string' ? handle : String(handle);
      const trimmed = str.trim();
      return trimmed ? trimmed.toUpperCase() : null;
    }

    applySelectionHandles(selectionSet, options = {}) {
      if (!selectionSet) {
        selectionSet = new Set();
      }
      const nextHandles = selectionSet instanceof Set ? new Set(selectionSet) : new Set(selectionSet || []);
      const tabId = this.currentTabId;
      if (tabId) {
        this.selectionByTab.set(tabId, new Set(nextHandles));
      }
      let changed = false;
      if (this.selectionHandles.size !== nextHandles.size) {
        changed = true;
      } else {
        for (const handle of nextHandles) {
          if (!this.selectionHandles.has(handle)) {
            changed = true;
            break;
          }
        }
      }
      this.selectionHandles = nextHandles;
      if (this.surfaceManager && (changed || !this.surfaceManager.lastFrame)) {
        this.surfaceManager.setSelectionHandles(this.selectionHandles);
        if (this.currentSceneGraph) {
          const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
          this.surfaceManager.resume();
          this.refreshViewportOverlays(frame);
        }
      }
      if (!options.suppressSummary) {
        this.updateSelectionSummary();
      }
      this.updateSelectionToolbarUI();
    }

    updateSelectionSummary() {
      if (!this.summaryContainer) {
        return;
      }
      const selectionSet = this.ensureSelectionSetForCurrentTab(false);
      const count = selectionSet ? selectionSet.size : 0;
      let badge = this.summaryContainer.querySelector('.rendering-selection-summary');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'rendering-selection-summary';
        this.summaryContainer.appendChild(badge);
      }
      if (count === 0) {
        badge.textContent = 'Selection: none';
        badge.classList.add('empty');
      } else {
        badge.textContent = `Selection: ${count} ${count === 1 ? 'handle' : 'handles'}`;
        badge.classList.remove('empty');
      }
    }

    updateIsolationSummary() {
      if (!this.summaryContainer) {
        return;
      }
      if (!this.isolationSummaryEl || !this.summaryContainer.contains(this.isolationSummaryEl)) {
        this.isolationSummaryEl = document.createElement('div');
        this.isolationSummaryEl.className = 'rendering-isolation-summary';
        this.summaryContainer.appendChild(this.isolationSummaryEl);
      }
      const parts = [];
      if (this.layerIsolationState && Array.isArray(this.layerIsolationState.layerNames) && this.layerIsolationState.layerNames.length) {
        const names = this.layerIsolationState.layerNames.slice();
        const display = names.length > 3 ? `${names.slice(0, 3).join(', ')}, …` : names.join(', ');
        parts.push(`Layers (${names.length}) – ${display}`);
      }
      if (this.objectIsolationState && this.objectIsolationState.handles instanceof Set && this.objectIsolationState.handles.size) {
        parts.push(`Objects (${this.objectIsolationState.handles.size})`);
      }
      if (!parts.length) {
        this.isolationSummaryEl.textContent = 'Isolation: none';
        this.isolationSummaryEl.classList.add('empty');
      } else {
        this.isolationSummaryEl.textContent = `Isolation: ${parts.join(' • ')}`;
        this.isolationSummaryEl.classList.remove('empty');
      }
    }

    updateSelectionToolbarUI() {
      if (!this.selectionToolbar) {
        return;
      }
      const selectionSet = this.ensureSelectionSetForCurrentTab(false);
      const selectionCount = selectionSet ? selectionSet.size : 0;
      const hasLayerIsolation = !!(this.layerIsolationState && Array.isArray(this.layerIsolationState.layerKeys) && this.layerIsolationState.layerKeys.length);
      const hasObjectIsolation = !!(this.objectIsolationState && this.objectIsolationState.handles instanceof Set && this.objectIsolationState.handles.size);
      let context = null;
      if (selectionCount > 0) {
        context = this.computeSelectionContext({ selectionSet });
      }
      const layersAvailable = !!(context && context.layers && context.layers.size);
      const lockedLayersCount = context && context.lockedLayers ? context.lockedLayers.size : 0;
      const hasFrame = !!(this.surfaceManager && this.surfaceManager.lastFrame && !this.surfaceManager.lastFrame.isEmpty);
      this.selectionToolbarButtons.forEach((button) => {
        if (!button) {
          return;
        }
        const action = (button.dataset.action || '').toLowerCase();
        switch (action) {
          case 'isolate-layers':
            button.disabled = !layersAvailable;
            break;
          case 'lock-layers':
            button.disabled = !layersAvailable;
            break;
          case 'unlock-layers':
            button.disabled = !layersAvailable || lockedLayersCount === 0;
            break;
          case 'isolate-objects':
            button.disabled = !(selectionCount > 0 && hasFrame);
            break;
          case 'clear-layer-isolation':
            button.disabled = !hasLayerIsolation;
            break;
          case 'clear-object-isolation':
            button.disabled = !hasObjectIsolation;
            break;
          default:
            break;
        }
      });
      const shouldShow = selectionCount > 0 || hasLayerIsolation || hasObjectIsolation;
      if (shouldShow) {
        this.selectionToolbar.setAttribute('aria-hidden', 'false');
        this.selectionToolbar.style.display = 'inline-flex';
      } else {
        this.selectionToolbar.setAttribute('aria-hidden', 'true');
        this.selectionToolbar.style.display = 'none';
      }
    }

    computeSelectionContext(options = {}) {
      const selectionSet = options.selectionSet || this.ensureSelectionSetForCurrentTab(false);
      if (!selectionSet || !selectionSet.size) {
        return {
          handles: new Set(),
          layers: new Map(),
          layerKeys: new Set(),
          layerNames: [],
          lockedLayers: new Set()
        };
      }
      const handles = new Set();
      selectionSet.forEach((handle) => {
        const normalized = this.normalizeHandle(handle);
        if (normalized) {
          handles.add(normalized);
        }
      });
      const pickables = this.getPickables();
      const pickableByHandle = new Map();
      pickables.forEach((pickable) => {
        const normalized = this.normalizeHandle(pickable && pickable.handle);
        if (normalized) {
          pickableByHandle.set(normalized, pickable);
        }
      });
      const layers = new Map();
      handles.forEach((handle) => {
        const pick = pickableByHandle.get(handle);
        if (pick && pick.layer) {
          const rawName = pick.layer;
          const key = String(rawName).trim().toUpperCase();
          if (key && !layers.has(key)) {
            layers.set(key, rawName);
          }
        }
      });
      const layerKeys = new Set(layers.keys());
      const layerNames = Array.from(layers.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      const lockedLayers = new Set();
      layers.forEach((name, key) => {
        const state = this.getEffectiveLayerState(name);
        if (state && state.effectiveIsLocked) {
          lockedLayers.add(key);
        }
      });
      return {
        handles,
        layers,
        layerKeys,
        layerNames,
        lockedLayers
      };
    }

    handleSelectionToolbarAction(action) {
      switch ((action || '').toLowerCase()) {
        case 'isolate-layers':
          this.handleIsolateLayersAction();
          break;
        case 'lock-layers':
          this.handleLayerLockToggle(true);
          break;
        case 'unlock-layers':
          this.handleLayerLockToggle(false);
          break;
        case 'isolate-objects':
          this.handleIsolateObjectsAction();
          break;
        case 'clear-layer-isolation':
          this.clearLayerIsolation();
          break;
        case 'clear-object-isolation':
          this.clearObjectIsolation();
          break;
        default:
          break;
      }
    }

    handleIsolateLayersAction() {
      if (!this.currentLayerCatalog || !this.currentLayerCatalog.size) {
        return;
      }
      const context = this.computeSelectionContext();
      if (!context.layerKeys || !context.layerKeys.size) {
        return;
      }
      this.applyLayerIsolation({
        layerKeys: context.layerKeys,
        layerNames: context.layerNames
      });
    }

    handleLayerLockToggle(shouldLock) {
      const context = this.computeSelectionContext();
      if (!context.layerNames || !context.layerNames.length) {
        return;
      }
      const targets = context.layerNames;
      targets.forEach((layerName, index) => {
        this.setLayerOverride(layerName, 'isLocked', !!shouldLock, {
          reRenderSurface: index === targets.length - 1,
          reRenderTable: index === targets.length - 1,
          preserveIsolation: true
        });
      });
      this.updateSelectionToolbarUI();
    }

    handleIsolateObjectsAction() {
      const selectionSet = this.ensureSelectionSetForCurrentTab(false);
      if (!selectionSet || !selectionSet.size) {
        return;
      }
      const handles = new Set();
      selectionSet.forEach((handle) => {
        const normalized = this.normalizeHandle(handle);
        if (normalized) {
          handles.add(normalized);
        }
      });
      if (!handles.size) {
        return;
      }
      if (this.objectIsolationState && this.objectIsolationState.handles instanceof Set && this.setsAreEqual(this.objectIsolationState.handles, handles)) {
        this.clearObjectIsolation();
        return;
      }
      this.applyObjectIsolation(handles);
    }

    applyLayerIsolation(context) {
      if (!context || !context.layerKeys || !context.layerKeys.size || !this.currentLayerCatalog) {
        return;
      }
      const catalog = this.currentLayerCatalog;
      const snapshot = this.captureLayerOverridesSnapshot();
      const overrides = new Map();
      const selectedNames = new Set();
      context.layerKeys.forEach((key) => {
        if (catalog.has(key)) {
          selectedNames.add(catalog.get(key).name);
        }
      });
      catalog.forEach((base, key) => {
        if (context.layerKeys.has(key)) {
          const desired = {};
          if (!base.baseIsOn) {
            desired.isOn = true;
          }
          if (base.baseIsFrozen) {
            desired.isFrozen = false;
          }
          if (base.baseIsLocked) {
            desired.isLocked = false;
          }
          if (Object.keys(desired).length) {
            overrides.set(key, desired);
          }
        } else {
          overrides.set(key, { isOn: false });
        }
      });
      this.replaceLayerOverrides(overrides, { reRenderSurface: true, reRenderTable: true });
      const state = {
        layerKeys: Array.from(context.layerKeys),
        layerNames: Array.from(selectedNames).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        snapshot
      };
      this.layerIsolationState = state;
      if (this.currentTabId) {
        this.layerIsolationStateByTab.set(this.currentTabId, this.cloneLayerIsolationState(state));
      }
      this.updateIsolationSummary();
      this.updateSelectionToolbarUI();
    }

    clearLayerIsolation(options = {}) {
      if (!this.layerIsolationState) {
        return;
      }
      const snapshot = Array.isArray(this.layerIsolationState.snapshot) ? this.layerIsolationState.snapshot : [];
      this.applyLayerOverridesSnapshot(snapshot, {
        reRenderSurface: options.reRenderSurface !== false,
        reRenderTable: options.reRenderTable !== false
      });
      this.layerIsolationState = null;
      if (this.currentTabId) {
        this.layerIsolationStateByTab.delete(this.currentTabId);
      }
      if (!options.silent) {
        this.updateIsolationSummary();
        this.updateSelectionToolbarUI();
      }
    }

    applyObjectIsolation(handlesSet) {
      if (!this.surfaceManager || typeof this.surfaceManager.setEntityIsolation !== 'function') {
        return;
      }
      const nextHandles = handlesSet instanceof Set ? handlesSet : new Set(handlesSet || []);
      if (!nextHandles.size) {
        this.clearObjectIsolation();
        return;
      }
      this.surfaceManager.setEntityIsolation(nextHandles);
      if (this.currentSceneGraph) {
        const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
        this.surfaceManager.resume();
        this.refreshViewportOverlays(frame);
      }
      this.objectIsolationState = { handles: new Set(nextHandles) };
      if (this.currentTabId) {
        this.objectIsolationStateByTab.set(this.currentTabId, { handles: Array.from(nextHandles) });
      }
      this.updateIsolationSummary();
      this.updateSelectionToolbarUI();
    }

    clearObjectIsolation(options = {}) {
      if (this.surfaceManager && typeof this.surfaceManager.setEntityIsolation === 'function') {
        this.surfaceManager.setEntityIsolation(null);
        if (!options.skipRender && this.currentSceneGraph) {
          const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
          this.surfaceManager.resume();
          this.refreshViewportOverlays(frame);
        }
      }
      this.objectIsolationState = null;
      if (this.currentTabId) {
        this.objectIsolationStateByTab.delete(this.currentTabId);
      }
      if (!options.silent) {
        this.updateIsolationSummary();
        this.updateSelectionToolbarUI();
      }
    }

    captureLayerOverridesSnapshot() {
      const snapshot = [];
      if (this.currentLayerOverrides && this.currentLayerOverrides.size) {
        this.currentLayerOverrides.forEach((value, key) => {
          snapshot.push([key, Object.assign({}, value)]);
        });
      }
      return snapshot;
    }

    applyLayerOverridesSnapshot(snapshot, options = {}) {
      const overrides = new Map();
      if (Array.isArray(snapshot)) {
        snapshot.forEach((entry) => {
          if (Array.isArray(entry) && entry.length === 2) {
            const key = entry[0];
            const value = entry[1];
            if (typeof key === 'string' && value && typeof value === 'object') {
              overrides.set(key, Object.assign({}, value));
            }
          }
        });
      }
      this.replaceLayerOverrides(overrides, options);
    }

    replaceLayerOverrides(overridesMap, options = {}) {
      const nextMap = overridesMap instanceof Map
        ? overridesMap
        : this.cloneLayerOverridesMap(overridesMap);
      this.currentLayerOverrides = nextMap;
      if (this.currentTabId) {
        this.layerOverridesByTab.set(this.currentTabId, nextMap);
      }
      if (options.reRenderTable !== false) {
        this.renderLayerManagerTable();
      }
      const shouldRenderSurface = options.reRenderSurface !== false;
      this.applyLayerStateToSurface({ reRender: shouldRenderSurface });
    }

    cloneLayerOverridesMap(source) {
      const result = new Map();
      if (!source) {
        return result;
      }
      if (source instanceof Map) {
        source.forEach((value, key) => {
          if (value && typeof value === 'object') {
            result.set(key, Object.assign({}, value));
          }
        });
        return result;
      }
      if (typeof source === 'object') {
        Object.keys(source).forEach((key) => {
          const entry = source[key];
          if (entry && typeof entry === 'object') {
            result.set(key, Object.assign({}, entry));
          }
        });
      }
      return result;
    }

    invalidateLayerIsolation(options = {}) {
      if (!this.layerIsolationState) {
        if (!options.silent) {
          this.updateIsolationSummary();
          this.updateSelectionToolbarUI();
        }
        return;
      }
      this.layerIsolationState = null;
      if (this.currentTabId) {
        this.layerIsolationStateByTab.delete(this.currentTabId);
      }
      if (!options.silent) {
        this.updateIsolationSummary();
        this.updateSelectionToolbarUI();
      }
    }

    syncIsolationStateForCurrentTab() {
      const tabId = this.currentTabId;
      if (!tabId) {
        this.layerIsolationState = null;
        this.objectIsolationState = null;
        return;
      }
      const layerState = this.layerIsolationStateByTab.get(tabId) || null;
      this.layerIsolationState = layerState ? this.cloneLayerIsolationState(layerState) : null;
      const objectState = this.objectIsolationStateByTab.get(tabId) || null;
      this.objectIsolationState = objectState ? this.cloneObjectIsolationState(objectState) : null;
    }

    cloneLayerIsolationState(state) {
      if (!state) {
        return null;
      }
      return {
        layerKeys: Array.isArray(state.layerKeys) ? state.layerKeys.slice() : [],
        layerNames: Array.isArray(state.layerNames) ? state.layerNames.slice() : [],
        snapshot: Array.isArray(state.snapshot)
          ? state.snapshot.map((entry) => {
              if (Array.isArray(entry) && entry.length === 2) {
                return [entry[0], Object.assign({}, entry[1])];
              }
              return entry;
            })
          : []
      };
    }

    cloneObjectIsolationState(state) {
      if (!state) {
        return null;
      }
      if (state.handles instanceof Set) {
        return { handles: new Set(state.handles) };
      }
      if (Array.isArray(state.handles)) {
        const normalized = new Set();
        state.handles.forEach((handle) => {
          const normalizedHandle = this.normalizeHandle(handle);
          if (normalizedHandle) {
            normalized.add(normalizedHandle);
          }
        });
        return { handles: normalized };
      }
      return { handles: new Set() };
    }

    setsAreEqual(a, b) {
      if (a === b) {
        return true;
      }
      if (!a || !b || a.size !== b.size) {
        return false;
      }
      for (const value of a) {
        if (!b.has(value)) {
          return false;
        }
      }
      return true;
    }

    getPickables() {
      if (!this.surfaceManager || !this.surfaceManager.lastFrame) {
        return [];
      }
      const frame = this.surfaceManager.lastFrame;
      if (!frame || !Array.isArray(frame.pickables)) {
        return [];
      }
      return frame.pickables;
    }

    clearInteractionOverlay() {
      if (this.marqueeElement && this.marqueeElement.parentNode) {
        this.marqueeElement.parentNode.removeChild(this.marqueeElement);
      }
      if (this.lassoSvg && this.lassoSvg.parentNode) {
        this.lassoSvg.parentNode.removeChild(this.lassoSvg);
      }
      this.marqueeElement = null;
      this.lassoSvg = null;
      this.lassoPathElement = null;
    }

    showMarquee(start, current, crossing) {
      if (!this.interactionLayer) {
        return;
      }
      if (!this.marqueeElement) {
        const div = document.createElement('div');
        div.className = 'selection-marquee';
        this.interactionLayer.appendChild(div);
        this.marqueeElement = div;
      }
      this.updateMarquee(current, crossing, start);
    }

    updateMarquee(current, crossing, startOverride) {
      if (!this.marqueeElement || !this.currentInteraction) {
        return;
      }
      const origin = startOverride || this.currentInteraction.start;
      const left = Math.min(origin.x, current.x);
      const top = Math.min(origin.y, current.y);
      const width = Math.abs(current.x - origin.x);
      const height = Math.abs(current.y - origin.y);
      this.marqueeElement.style.left = `${left}px`;
      this.marqueeElement.style.top = `${top}px`;
      this.marqueeElement.style.width = `${width}px`;
      this.marqueeElement.style.height = `${height}px`;
      if (crossing) {
        this.marqueeElement.classList.add('crossing');
      } else {
        this.marqueeElement.classList.remove('crossing');
      }
    }

    hideMarquee() {
      if (this.marqueeElement && this.marqueeElement.parentNode) {
        this.marqueeElement.parentNode.removeChild(this.marqueeElement);
      }
      this.marqueeElement = null;
    }

    showLasso(points, crossing) {
      if (!this.interactionLayer) {
        return;
      }
      if (!this.lassoSvg) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'selection-lasso');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        svg.appendChild(path);
        this.interactionLayer.appendChild(svg);
        this.lassoSvg = svg;
        this.lassoPathElement = path;
      }
      this.updateLasso(points, crossing);
    }

    updateLasso(points, crossing) {
      if (!this.lassoSvg || !this.lassoPathElement) {
        return;
      }
      const filtered = Array.isArray(points) ? points.slice() : [];
      if (!filtered.length && this.currentInteraction && Array.isArray(this.currentInteraction.path)) {
        filtered.push(...this.currentInteraction.path);
      }
      if (!filtered.length) {
        return;
      }
      const pathData = filtered.map((pt, index) => {
        const prefix = index === 0 ? 'M' : 'L';
        return `${prefix}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }).join(' ');
      const closedPath = `${pathData}${filtered.length > 2 ? ' Z' : ''}`;
      this.lassoPathElement.setAttribute('d', closedPath);
      if (crossing) {
        this.lassoSvg.classList.add('crossing');
      } else {
        this.lassoSvg.classList.remove('crossing');
      }
    }

    hideLasso() {
      if (this.lassoSvg && this.lassoSvg.parentNode) {
        this.lassoSvg.parentNode.removeChild(this.lassoSvg);
      }
      this.lassoSvg = null;
      this.lassoPathElement = null;
    }

    handlePointerDown(event) {
      if (!this.viewportEl || event.button !== 0) {
        return;
      }
      if (event.target && typeof event.target.closest === 'function') {
        if (event.target.closest('.rendering-measurement-toolbar') || event.target.closest('.rendering-selection-toolbar')) {
          return;
        }
        const attributeNode = event.target.closest('.rendering-text-attribute');
        if (attributeNode) {
          return;
        }
      }
      if (this.measurementMode !== 'none') {
        this.handleMeasurementPointerDown(event);
        return;
      }
      if (!this.surfaceManager || !this.surfaceManager.lastFrame) {
        return;
      }
      const point = this.getPointerPosition(event);
      this.clearInteractionOverlay();
      const interaction = {
        pointerId: event.pointerId,
        start: point,
        last: point,
        path: event.altKey ? [point] : [],
        mode: event.altKey ? 'lasso' : 'pending',
        shiftKey: !!event.shiftKey,
        ctrlKey: !!(event.ctrlKey || event.metaKey),
        metaKey: !!event.metaKey,
        altKey: !!event.altKey,
        crossing: false
      };
      this.currentInteraction = interaction;
      this.activePointerId = event.pointerId;
      if (this.viewportEl.setPointerCapture) {
        try {
          this.viewportEl.setPointerCapture(event.pointerId);
        } catch (captureErr) {
          // Ignore pointer capture errors in browsers that disallow capture here.
        }
      }
      if (interaction.mode === 'lasso') {
        this.showLasso(interaction.path, true);
      }
      event.preventDefault();
    }

    handlePointerMove(event) {
      if (this.measurementMode !== 'none') {
        this.handleMeasurementPointerMove(event);
        return;
      }
      const interaction = this.currentInteraction;
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return;
      }
      const point = this.getPointerPosition(event);
      const dx = point.x - interaction.start.x;
      const dy = point.y - interaction.start.y;
      const distanceSq = dx * dx + dy * dy;
      const thresholdSq = 16;
      if (interaction.mode === 'pending' && distanceSq > thresholdSq) {
        interaction.mode = 'marquee';
        const crossing = point.x < interaction.start.x;
        this.showMarquee(interaction.start, point, crossing);
      }
      if (interaction.mode === 'marquee') {
        interaction.crossing = point.x < interaction.start.x;
        this.updateMarquee(point, interaction.crossing, interaction.start);
      } else if (interaction.mode === 'lasso') {
        const lastPoint = interaction.path[interaction.path.length - 1];
        if (!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) >= 2) {
          interaction.path.push(point);
        }
        this.updateLasso(interaction.path, true);
      }
      interaction.last = point;
      event.preventDefault();
    }

    handlePointerUp(event) {
      if (this.measurementMode !== 'none') {
        this.handleMeasurementPointerUp(event);
        return;
      }
      const interaction = this.currentInteraction;
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return;
      }
      if (this.viewportEl.releasePointerCapture) {
        try {
          this.viewportEl.releasePointerCapture(event.pointerId);
        } catch (releaseErr) {
          // Ignore release issues.
        }
      }
      const point = this.getPointerPosition(event);
      interaction.last = point;
      if (interaction.mode === 'pending') {
        this.performSinglePick(point, interaction);
      } else if (interaction.mode === 'marquee') {
        interaction.crossing = point.x < interaction.start.x;
        const handles = this.computeRectangleSelection(
          interaction.start,
          point,
          interaction.crossing ? 'crossing' : 'window'
        );
        this.commitSelection(handles, this.resolveSelectionCommitMode(interaction));
      } else if (interaction.mode === 'lasso') {
        const path = interaction.path.slice();
        if (!path.length || path[path.length - 1] !== point) {
          path.push(point);
        }
        const handles = this.computeLassoSelection(path);
        this.commitSelection(handles, this.resolveSelectionCommitMode(interaction));
      }
      this.clearInteractionOverlay();
      this.currentInteraction = null;
      this.activePointerId = null;
      event.preventDefault();
    }

    handlePointerCancel(event) {
      if (this.measurementMode !== 'none') {
        this.handleMeasurementPointerCancel(event);
        return;
      }
      if (this.viewportEl && this.viewportEl.releasePointerCapture) {
        try {
          this.viewportEl.releasePointerCapture(event.pointerId);
        } catch (err) {
          // ignore
        }
      }
      this.clearInteractionOverlay();
      this.currentInteraction = null;
      this.activePointerId = null;
    }

    handleMeasurementPointerDown(event) {
      if (this.measurementMode === 'none') {
        return;
      }
      if (event.target && typeof event.target.closest === 'function') {
        if (event.target.closest('.rendering-measurement-toolbar') || event.target.closest('.rendering-selection-toolbar')) {
          return;
        }
      }
      const frame = this.surfaceManager ? this.surfaceManager.lastFrame : null;
      const screenPoint = this.getPointerPosition(event);
      if (!screenPoint) {
        return;
      }
      if (event.detail && event.detail > 1) {
        this.resetMeasurementState({ silent: true });
      }
      if (this.measurementMode === 'angle' && this.measurementState.points.length >= 3) {
        this.resetMeasurementState({ silent: true });
      }
      const snapCandidate = frame ? this.findSnapCandidate(screenPoint, frame) : null;
      let worldPoint = null;
      if (snapCandidate && snapCandidate.world) {
        worldPoint = snapCandidate.world;
        this.setActiveSnapCandidate(snapCandidate, frame, { isPreview: false });
      } else {
        worldPoint = this.screenToWorld(screenPoint, frame);
        this.clearSnapIndicator({ silent: true });
      }
      if (!worldPoint) {
        return;
      }
      this.measurementState.points.push({
        world: worldPoint,
        snap: this.createMeasurementSnap(snapCandidate)
      });
      this.measurementState.previewPoint = null;
      this.renderMeasurementOverlay(frame);
      this.updateMeasurementSummary();
      event.preventDefault();
    }

    handleMeasurementPointerMove(event) {
      if (this.measurementMode === 'none') {
        return;
      }
      if (event.target && typeof event.target.closest === 'function') {
        if (event.target.closest('.rendering-measurement-toolbar') || event.target.closest('.rendering-selection-toolbar')) {
          return;
        }
      }
      const frame = this.surfaceManager ? this.surfaceManager.lastFrame : null;
      const screenPoint = this.getPointerPosition(event);
      if (!screenPoint) {
        return;
      }
      const snapCandidate = frame ? this.findSnapCandidate(screenPoint, frame) : null;
      let worldPoint = null;
      if (snapCandidate && snapCandidate.world) {
        worldPoint = snapCandidate.world;
        this.setActiveSnapCandidate(snapCandidate, frame, { isPreview: true });
      } else {
        worldPoint = this.screenToWorld(screenPoint, frame);
        this.clearSnapIndicator({ silent: true });
      }
      if (!worldPoint) {
        return;
      }
      this.measurementState.previewPoint = {
        world: worldPoint,
        snap: this.createMeasurementSnap(snapCandidate)
      };
      this.renderMeasurementOverlay(frame);
      this.updateMeasurementSummary();
    }

    handleMeasurementPointerUp(event) {
      if (this.measurementMode === 'none') {
        return;
      }
      if (event && event.target && typeof event.target.closest === 'function') {
        if (event.target.closest('.rendering-measurement-toolbar')) {
          return;
        }
      }
      if (this.measurementState.previewPoint) {
        this.measurementState.previewPoint = null;
      }
      this.clearSnapIndicator({ silent: true });
      this.renderMeasurementOverlay();
      this.updateMeasurementSummary();
      if (event) {
        event.preventDefault();
      }
    }

    handleMeasurementPointerCancel() {
      if (this.measurementMode === 'none') {
        return;
      }
      if (this.measurementState.previewPoint) {
        this.measurementState.previewPoint = null;
      }
      this.clearSnapIndicator({ silent: true });
      this.renderMeasurementOverlay();
      this.updateMeasurementSummary();
    }

    getPointerPosition(event) {
      const reference = this.canvas || this.viewportEl;
      if (!reference) {
        return { x: event.clientX, y: event.clientY };
      }
      const rect = reference.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    resolveSelectionCommitMode(interaction) {
      if (!interaction) {
        return 'replace';
      }
      if (interaction.ctrlKey || interaction.metaKey) {
        return 'toggle';
      }
      if (interaction.shiftKey) {
        return 'add';
      }
      return 'replace';
    }

    performSinglePick(point, interaction) {
      const pickable = this.hitTestPickable(point);
      if (!pickable || !pickable.handle) {
        if (this.resolveSelectionCommitMode(interaction) === 'replace') {
          this.commitSelection([], 'replace');
        }
        return;
      }
      this.commitSelection([pickable.handle], this.resolveSelectionCommitMode(interaction));
    }

    handleOverlayKeyDown(event) {
      if (!event || typeof event.key !== 'string') {
        return;
      }
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'Escape') {
        if (this.measurementMode !== 'none' && (this.measurementState.points.length || this.measurementState.previewPoint)) {
          this.resetMeasurementState();
          this.renderMeasurementOverlay();
          this.updateMeasurementSummary();
          event.preventDefault();
          return;
        }
        this.close();
        event.preventDefault();
        return;
      }
      if (event.key === 'm' || event.key === 'M') {
        this.cycleMeasurementMode(event.shiftKey ? -1 : 1);
        event.preventDefault();
      }
    }

    handleMeasurementButtonClick(mode) {
      const normalized = this.normalizeMeasurementMode(mode);
      if (normalized === this.measurementMode && normalized !== 'none') {
        this.setMeasurementMode('none');
      } else {
        this.setMeasurementMode(normalized);
      }
    }

    normalizeMeasurementMode(mode) {
      const value = typeof mode === 'string' ? mode.toLowerCase() : 'none';
      if (value === 'distance' || value === 'area' || value === 'angle') {
        return value;
      }
      return 'none';
    }

    setMeasurementMode(mode) {
      const normalized = this.normalizeMeasurementMode(mode);
      if (normalized === this.measurementMode) {
        if (normalized !== 'none') {
          this.resetMeasurementState();
          this.renderMeasurementOverlay();
          this.updateMeasurementSummary();
        }
        this.updateMeasurementToolbarUI();
        return;
      }
      this.measurementMode = normalized;
      this.resetMeasurementState({ silent: true });
      this.renderMeasurementOverlay();
      this.updateMeasurementSummary();
      this.updateMeasurementToolbarUI();
    }

    cycleMeasurementMode(direction = 1) {
      const order = Array.isArray(this.measurementModeOrder) && this.measurementModeOrder.length
        ? this.measurementModeOrder
        : ['none', 'distance', 'area', 'angle'];
      const currentIndex = Math.max(0, order.indexOf(this.measurementMode));
      const step = direction >= 0 ? 1 : -1;
      let nextIndex = currentIndex + step;
      if (nextIndex < 0) {
        nextIndex = order.length - 1;
      } else if (nextIndex >= order.length) {
        nextIndex = 0;
      }
      this.setMeasurementMode(order[nextIndex] || 'none');
    }

    updateMeasurementToolbarUI() {
      if (!Array.isArray(this.measurementToolbarButtons) || !this.measurementToolbarButtons.length) {
        return;
      }
      const hasFrame = !!(this.surfaceManager && this.surfaceManager.lastFrame && !this.surfaceManager.lastFrame.isEmpty);
      this.measurementToolbarButtons.forEach((button) => {
        if (!button) {
          return;
        }
        const mode = this.normalizeMeasurementMode(button.dataset.mode);
        const isActive = mode === this.measurementMode || (mode === 'none' && this.measurementMode === 'none');
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        if (mode === 'none') {
          button.disabled = false;
        } else {
          button.disabled = !hasFrame;
        }
      });
    }

    resetMeasurementState(options = {}) {
      const silent = options && options.silent === true;
      this.measurementState.points = [];
      this.measurementState.previewPoint = null;
      this.clearSnapIndicator({ silent: true });
      if (!silent) {
        this.renderMeasurementOverlay();
        this.updateMeasurementSummary();
      }
    }

    getMeasurementStatePoints(includePreview = false) {
      const committed = Array.isArray(this.measurementState.points)
        ? this.measurementState.points.slice()
        : [];
      if (includePreview && this.measurementState.previewPoint) {
        committed.push(this.measurementState.previewPoint);
      }
      return committed;
    }

    commitSelection(handlesIterable, mode = 'replace') {
      const selectionSet = this.ensureSelectionSetForCurrentTab(true);
      const normalizedHandles = new Set();
      if (handlesIterable) {
        for (const handle of handlesIterable) {
          const normalized = this.normalizeHandle(handle);
          if (normalized) {
            normalizedHandles.add(normalized);
          }
        }
      }
      if (mode === 'replace') {
        selectionSet.clear();
        normalizedHandles.forEach((handle) => selectionSet.add(handle));
      } else if (mode === 'add') {
        normalizedHandles.forEach((handle) => selectionSet.add(handle));
      } else if (mode === 'toggle') {
        normalizedHandles.forEach((handle) => {
          if (selectionSet.has(handle)) {
            selectionSet.delete(handle);
          } else {
            selectionSet.add(handle);
          }
        });
      }
      if (mode === 'replace' && normalizedHandles.size === 0) {
        selectionSet.clear();
      }
      this.applySelectionHandles(selectionSet);
    }

    computeRectangleSelection(start, end, strategy = 'window') {
      if (!start || !end) {
        return new Set();
      }
      const rect = {
        minX: Math.min(start.x, end.x),
        minY: Math.min(start.y, end.y),
        maxX: Math.max(start.x, end.x),
        maxY: Math.max(start.y, end.y)
      };
      const pickables = this.getPickables();
      const handles = new Set();
      pickables.forEach((pickable) => {
        if (!pickable || !pickable.handle || !pickable.screenBounds) {
          return;
        }
        const bounds = pickable.screenBounds;
        const matches = strategy === 'window'
          ? this.boundsContains(rect, bounds)
          : this.boundsIntersect(rect, bounds);
        if (matches) {
          handles.add(pickable.handle);
        }
      });
      return handles;
    }

    computeLassoSelection(points) {
      if (!Array.isArray(points) || points.length < 3) {
        return new Set();
      }
      const polygon = points.map((pt) => ({ x: pt.x, y: pt.y }));
      const first = polygon[0];
      const last = polygon[polygon.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) > 1.5) {
        polygon.push({ x: first.x, y: first.y });
      }
      const pickables = this.getPickables();
      const handles = new Set();
      pickables.forEach((pickable) => {
        if (!pickable || !pickable.handle || !pickable.screenBounds) {
          return;
        }
        const bounds = pickable.screenBounds;
        const center = {
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2
        };
        if (this.pointInPolygon(center, polygon) || this.polygonIntersectsBounds(polygon, bounds)) {
          handles.add(pickable.handle);
        }
      });
      return handles;
    }

    hitTestPickable(point) {
      const pickables = this.getPickables();
      let candidate = null;
      let bestScore = Infinity;
      pickables.forEach((pickable) => {
        if (!pickable || !pickable.handle || !pickable.screenBounds) {
          return;
        }
        const bounds = pickable.screenBounds;
        const tolerance = Math.max(3, (pickable.weight || 1.5) * 1.6);
        if (!this.pointInsideBounds(point, bounds, tolerance)) {
          return;
        }
        const area = Math.max(1, (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY));
        const score = area;
        if (score < bestScore) {
          bestScore = score;
          candidate = pickable;
        }
      });
      return candidate;
    }

    pointInsideBounds(point, bounds, padding = 0) {
      if (!point || !bounds) {
        return false;
      }
      return point.x >= bounds.minX - padding &&
        point.x <= bounds.maxX + padding &&
        point.y >= bounds.minY - padding &&
        point.y <= bounds.maxY + padding;
    }

    boundsContains(outer, inner) {
      if (!outer || !inner) {
        return false;
      }
      return inner.minX >= outer.minX &&
        inner.maxX <= outer.maxX &&
        inner.minY >= outer.minY &&
        inner.maxY <= outer.maxY;
    }

    boundsIntersect(a, b) {
      if (!a || !b) {
        return false;
      }
      return !(b.maxX < a.minX || b.minX > a.maxX || b.maxY < a.minY || b.minY > a.maxY);
    }

    polygonIntersectsBounds(polygon, bounds) {
      if (!Array.isArray(polygon) || polygon.length < 2 || !bounds) {
        return false;
      }
      for (let i = 0; i < polygon.length; i++) {
        if (this.pointInsideBounds(polygon[i], bounds)) {
          return true;
        }
      }
      const corners = [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.maxY }
      ];
      for (let i = 0; i < corners.length; i++) {
        if (this.pointInPolygon(corners[i], polygon)) {
          return true;
        }
      }
      for (let i = 0; i < polygon.length - 1; i++) {
        const p1 = polygon[i];
        const p2 = polygon[i + 1];
        if (this.segmentIntersectsRect(p1, p2, bounds)) {
          return true;
        }
      }
      return false;
    }

    segmentIntersectsRect(p1, p2, rect) {
      if (!p1 || !p2 || !rect) {
        return false;
      }
      if (this.pointInsideBounds(p1, rect) || this.pointInsideBounds(p2, rect)) {
        return true;
      }
      const edges = [
        [{ x: rect.minX, y: rect.minY }, { x: rect.maxX, y: rect.minY }],
        [{ x: rect.maxX, y: rect.minY }, { x: rect.maxX, y: rect.maxY }],
        [{ x: rect.maxX, y: rect.maxY }, { x: rect.minX, y: rect.maxY }],
        [{ x: rect.minX, y: rect.maxY }, { x: rect.minX, y: rect.minY }]
      ];
      for (let i = 0; i < edges.length; i++) {
        const [q1, q2] = edges[i];
        if (this.segmentsIntersect(p1, p2, q1, q2)) {
          return true;
        }
      }
      return false;
    }

    segmentsIntersect(p1, p2, q1, q2) {
      const o1 = this.orientation(p1, p2, q1);
      const o2 = this.orientation(p1, p2, q2);
      const o3 = this.orientation(q1, q2, p1);
      const o4 = this.orientation(q1, q2, p2);
      if (o1 !== o2 && o3 !== o4) {
        return true;
      }
      if (o1 === 0 && this.onSegment(p1, q1, p2)) return true;
      if (o2 === 0 && this.onSegment(p1, q2, p2)) return true;
      if (o3 === 0 && this.onSegment(q1, p1, q2)) return true;
      if (o4 === 0 && this.onSegment(q1, p2, q2)) return true;
      return false;
    }

    orientation(a, b, c) {
      const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(value) < 1e-9) {
        return 0;
      }
      return value > 0 ? 1 : 2;
    }

    onSegment(a, b, c) {
      return b.x <= Math.max(a.x, c.x) + 1e-9 &&
        b.x + 1e-9 >= Math.min(a.x, c.x) &&
        b.y <= Math.max(a.y, c.y) + 1e-9 &&
        b.y + 1e-9 >= Math.min(a.y, c.y);
    }

    pointInPolygon(point, polygon) {
      if (!point || !Array.isArray(polygon) || polygon.length < 3) {
        return false;
      }
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const pi = polygon[i];
        const pj = polygon[j];
        const intersect = ((pi.y > point.y) !== (pj.y > point.y)) &&
          (point.x < (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y + 1e-12) + pi.x);
        if (intersect) {
          inside = !inside;
        }
      }
      return inside;
    }

    computeMeasurementReport(options = {}) {
      if (this.measurementMode === 'none') {
        return null;
      }
      const includePreview = options && options.includePreview !== false;
      const committed = Array.isArray(this.measurementState.points)
        ? this.measurementState.points.slice()
        : [];
      const active = includePreview ? this.getMeasurementStatePoints(true) : committed;
      switch (this.measurementMode) {
        case 'distance':
          return this.computeDistanceReport(committed, active);
        case 'area':
          return this.computeAreaReport(committed, active);
        case 'angle':
          return this.computeAngleReport(committed, active);
        default:
          return null;
      }
    }

    computeDistanceReport(committed, active) {
      const result = {
        mode: 'distance',
        hasData: false,
        label: 'Distance: click to start',
        detail: '',
        unitLabel: this.getLinearUnitLabel(),
        segments: [],
        totalLength: 0,
        labelWorld: null,
        hasPreview: Array.isArray(active) && Array.isArray(committed) ? active.length > committed.length : false
      };
      if (!Array.isArray(active) || active.length < 2) {
        return result;
      }
      const committedCount = Array.isArray(committed) ? committed.length : 0;
      let total = 0;
      const segments = [];
      for (let i = 1; i < active.length; i++) {
        const start = active[i - 1]?.world;
        const end = active[i]?.world;
        if (!start || !end) {
          continue;
        }
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (!Number.isFinite(length)) {
          continue;
        }
        total += length;
        segments.push({
          start,
          end,
          length,
          dx,
          dy,
          isPreview: i >= committedCount
        });
      }
      if (!segments.length) {
        result.label = active.length === 1 ? 'Distance: select second point' : 'Distance: add another point';
        return result;
      }
      result.segments = segments;
      result.totalLength = total;
      result.labelWorld = active[active.length - 1]?.world || null;
      result.hasData = true;
      const lengthText = this.formatNumber(total, { maxDigits: 6 });
      result.label = lengthText != null
        ? `Distance: ${lengthText}${result.unitLabel ? ` ${result.unitLabel}` : ''}`
        : 'Distance: —';
      const lastSegment = segments[segments.length - 1];
      if (lastSegment) {
        const parts = [];
        const segText = this.formatNumber(lastSegment.length, { maxDigits: 6 });
        if (segText != null) {
          parts.push(`Segment ${segText}${result.unitLabel ? ` ${result.unitLabel}` : ''}`);
        }
        const dxText = this.formatNumber(lastSegment.dx, { maxDigits: 6 });
        const dyText = this.formatNumber(lastSegment.dy, { maxDigits: 6 });
        if (dxText != null && dyText != null) {
          parts.push(`ΔX ${dxText}`, `ΔY ${dyText}`);
        }
        result.detail = parts.join(' · ');
      }
      return result;
    }

    computeAreaReport(committed, active) {
      const result = {
        mode: 'area',
        hasData: false,
        label: 'Area: add more points',
        detail: '',
        unitLabel: this.getLinearUnitLabel(),
        areaUnitLabel: null,
        area: 0,
        perimeter: 0,
        centroidWorld: null,
        labelWorld: null,
        hasPreview: Array.isArray(active) && Array.isArray(committed) ? active.length > committed.length : false
      };
      if (!Array.isArray(active) || active.length < 3) {
        if (!Array.isArray(active) || active.length === 0) {
          result.label = 'Area: click to start';
        } else if (active.length === 1) {
          result.label = 'Area: select second point';
        } else {
          result.label = 'Area: select third point';
        }
        return result;
      }
      const points = active.map((entry) => entry && entry.world ? entry.world : null).filter(Boolean);
      if (points.length < 3) {
        return result;
      }
      let areaAccumulator = 0;
      let centroidX = 0;
      let centroidY = 0;
      let perimeter = 0;
      for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        const cross = current.x * next.y - next.x * current.y;
        areaAccumulator += cross;
        centroidX += (current.x + next.x) * cross;
        centroidY += (current.y + next.y) * cross;
        const segmentLength = Math.hypot(next.x - current.x, next.y - current.y);
        if (Number.isFinite(segmentLength)) {
          perimeter += segmentLength;
        }
      }
      const rawArea = areaAccumulator / 2;
      const area = Math.abs(rawArea);
      let centroid;
      if (Math.abs(areaAccumulator) > 1e-9) {
        centroid = {
          x: centroidX / (3 * areaAccumulator),
          y: centroidY / (3 * areaAccumulator)
        };
      } else {
        const sum = points.reduce((acc, pt) => {
          acc.x += pt.x;
          acc.y += pt.y;
          return acc;
        }, { x: 0, y: 0 });
        centroid = {
          x: sum.x / points.length,
          y: sum.y / points.length
        };
      }
      result.area = area;
      result.perimeter = perimeter;
      result.centroidWorld = centroid;
      result.labelWorld = centroid;
      result.areaUnitLabel = this.getAreaUnitLabel(result.unitLabel);
      const areaText = this.formatNumber(area, { maxDigits: 6 });
      result.label = areaText != null
        ? `Area: ${areaText}${result.areaUnitLabel ? ` ${result.areaUnitLabel}` : ''}`
        : 'Area: —';
      const perimeterText = this.formatNumber(perimeter, { maxDigits: 6 });
      if (perimeterText != null) {
        result.detail = `Perimeter: ${perimeterText}${result.unitLabel ? ` ${result.unitLabel}` : ''}`;
      }
      result.hasData = area > 0;
      if (!result.hasData) {
        result.label = 'Area: insufficient span';
      }
      return result;
    }

    computeAngleReport(committed, active) {
      const result = {
        mode: 'angle',
        hasData: false,
        label: 'Angle: click first point',
        detail: '',
        labelWorld: null,
        arc: null,
        usesPreview: Array.isArray(active) && Array.isArray(committed) ? active.length > committed.length : false
      };
      if (!Array.isArray(committed) || committed.length === 0) {
        return result;
      }
      const base = committed[0]?.world;
      if (!base) {
        return result;
      }
      if (committed.length === 1) {
        result.label = 'Angle: select vertex';
        result.labelWorld = base;
        return result;
      }
      const vertex = committed[1]?.world;
      if (!vertex) {
        result.label = 'Angle: select vertex';
        result.labelWorld = base;
        return result;
      }
      result.labelWorld = vertex;
      const targetEntry = committed.length >= 3
        ? committed[2]
        : (Array.isArray(active) && active.length >= 3 ? active[2] : null);
      if (!targetEntry || !targetEntry.world) {
        result.label = 'Angle: select third point';
        return result;
      }
      const target = targetEntry.world;
      const v1 = { x: base.x - vertex.x, y: base.y - vertex.y };
      const v2 = { x: target.x - vertex.x, y: target.y - vertex.y };
      const len1 = Math.hypot(v1.x, v1.y);
      const len2 = Math.hypot(v2.x, v2.y);
      if (len1 < 1e-9 || len2 < 1e-9) {
        result.label = 'Angle: insufficient span';
        return result;
      }
      const dot = v1.x * v2.x + v1.y * v2.y;
      const cross = v1.x * v2.y - v1.y * v2.x;
      const angleRad = Math.atan2(Math.abs(cross), dot);
      const angleDeg = angleRad * 180 / Math.PI;
      const reflexDeg = 360 - angleDeg;
      const angleText = this.formatNumber(angleDeg, { maxDigits: 4 });
      const reflexText = this.formatNumber(reflexDeg, { maxDigits: 4 });
      result.label = angleText != null ? `Angle: ${angleText}°` : 'Angle: —';
      result.detail = reflexText != null ? `Reflex: ${reflexText}°` : '';
      const normalize = (vec, length) => ({ x: vec.x / length, y: vec.y / length });
      const nv1 = normalize(v1, len1);
      const nv2 = normalize(v2, len2);
      let bisector = { x: nv1.x + nv2.x, y: nv1.y + nv2.y };
      let bisectorMag = Math.hypot(bisector.x, bisector.y);
      if (bisectorMag < 1e-6) {
        bisector = { x: -nv1.y, y: nv1.x };
        bisectorMag = Math.hypot(bisector.x, bisector.y);
      }
      const radius = Math.min(len1, len2) * 0.45;
      if (bisectorMag > 1e-6 && radius > 0) {
        const factor = (radius * 1.3) / bisectorMag;
        result.labelWorld = {
          x: vertex.x + bisector.x * factor,
          y: vertex.y + bisector.y * factor
        };
      } else {
        result.labelWorld = vertex;
      }
      result.arc = {
        vertexWorld: vertex,
        baseWorld: base,
        targetWorld: target,
        radius,
        orientation: cross >= 0 ? 1 : -1,
        angleRad,
        usesPreview: committed.length < 3
      };
      result.hasData = true;
      return result;
    }

    getLinearUnitLabel() {
      const units = this.currentDoc && this.currentDoc.drawingProperties
        ? this.currentDoc.drawingProperties.units
        : null;
      if (units) {
        const unitLabel = this.getUnitsLabel(units.insUnits);
        if (unitLabel) {
          return unitLabel;
        }
        const measurementLabel = this.getMeasurementLabel(units.measurement);
        if (measurementLabel) {
          return measurementLabel;
        }
      }
      return 'Units';
    }

    getAreaUnitLabel(linearLabel) {
      if (!linearLabel || linearLabel === 'Units') {
        return 'Units²';
      }
      if (linearLabel.endsWith('²')) {
        return linearLabel;
      }
      return `${linearLabel}²`;
    }

    getMeasurementModeLabel(mode) {
      switch (mode) {
        case 'distance':
          return 'Distance';
        case 'area':
          return 'Area';
        case 'angle':
          return 'Angle';
        default:
          return 'Measurement';
      }
    }

    renderMeasurementOverlay(frameOverride) {
      if (!this.measurementLayer) {
        return;
      }
      this.measurementLayer.textContent = '';
      if (this.measurementMode === 'none') {
        this.clearSnapIndicator({ silent: true });
        return;
      }
      const frame = frameOverride || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      if (!frame) {
        this.clearSnapIndicator({ silent: true });
        return;
      }
      const committedCount = Array.isArray(this.measurementState.points) ? this.measurementState.points.length : 0;
      const screenPoints = [];
      if (committedCount) {
        this.measurementState.points.forEach((entry) => {
          if (!entry || !entry.world) {
            return;
          }
          const screen = this.worldToScreen(entry.world, frame);
          if (screen) {
            screenPoints.push({
              world: entry.world,
              screen,
              isPreview: false,
              snap: entry.snap || null
            });
          }
        });
      }
      if (this.measurementState.previewPoint) {
        const previewScreen = this.worldToScreen(this.measurementState.previewPoint.world, frame);
        if (previewScreen) {
          screenPoints.push({
            world: this.measurementState.previewPoint.world,
            screen: previewScreen,
            isPreview: true,
            snap: this.measurementState.previewPoint.snap || null
          });
        }
      }
      if (!screenPoints.length) {
        this.renderSnapOverlay(frame);
        return;
      }
      let width = Number.isFinite(frame.width) ? frame.width : null;
      let height = Number.isFinite(frame.height) ? frame.height : null;
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        const rect = this.viewportEl ? this.viewportEl.getBoundingClientRect() : null;
        if (rect) {
          width = rect.width;
          height = rect.height;
        }
      }
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return;
      }
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      this.measurementLayer.appendChild(svg);
      const report = this.computeMeasurementReport({ includePreview: true });
      switch (this.measurementMode) {
        case 'distance':
          this.drawDistanceOverlay(svg, screenPoints, committedCount);
          break;
        case 'area':
          this.drawAreaOverlay(svg, screenPoints, committedCount);
          break;
        case 'angle':
          this.drawAngleOverlay(svg, screenPoints, committedCount, report, frame);
          break;
        default:
          break;
      }
      this.drawMeasurementNodes(svg, screenPoints);
      if (report && report.label) {
        let anchorScreen = null;
        if (report.labelWorld) {
          anchorScreen = this.worldToScreen(report.labelWorld, frame);
        }
        if (!anchorScreen && screenPoints.length) {
          const lastPoint = screenPoints[screenPoints.length - 1];
          anchorScreen = { x: lastPoint.screen.x, y: lastPoint.screen.y };
        }
        anchorScreen = this.clampScreenPoint(anchorScreen, width, height, 18);
        if (anchorScreen) {
          const labelEl = document.createElement('div');
          labelEl.className = 'measurement-label';
          labelEl.textContent = report.label;
          if (report.detail) {
            const detailSpan = document.createElement('span');
            detailSpan.className = 'secondary';
            detailSpan.textContent = report.detail;
            labelEl.appendChild(detailSpan);
          }
          labelEl.style.left = `${anchorScreen.x.toFixed(2)}px`;
          labelEl.style.top = `${anchorScreen.y.toFixed(2)}px`;
          this.measurementLayer.appendChild(labelEl);
        }
      }
      this.renderSnapOverlay(frame);
    }

    drawDistanceOverlay(svg, points, committedCount) {
      if (!svg || !Array.isArray(points)) {
        return;
      }
      if (points.length < 2 && committedCount === 0) {
        return;
      }
      const ns = 'http://www.w3.org/2000/svg';
      if (committedCount >= 2) {
        const pathData = this.buildSvgPathFromMeasurementPoints(points.slice(0, committedCount));
        if (pathData) {
          const path = document.createElementNS(ns, 'path');
          path.setAttribute('class', 'measurement-segment');
          path.setAttribute('d', pathData);
          svg.appendChild(path);
        }
      }
      if (points.length > committedCount && committedCount >= 1) {
        const previewData = this.buildSvgPathFromMeasurementPoints([
          points[committedCount - 1],
          points[committedCount]
        ]);
        if (previewData) {
          const previewPath = document.createElementNS(ns, 'path');
          previewPath.setAttribute('class', 'measurement-segment measurement-preview');
          previewPath.setAttribute('d', previewData);
          svg.appendChild(previewPath);
        }
      }
    }

    drawAreaOverlay(svg, points, committedCount) {
      if (!svg || !Array.isArray(points) || !points.length) {
        return;
      }
      const ns = 'http://www.w3.org/2000/svg';
      if (points.length >= 3) {
        const polygonPoints = points
          .map((pt) => pt && pt.screen ? `${pt.screen.x.toFixed(2)},${pt.screen.y.toFixed(2)}` : null)
          .filter(Boolean)
          .join(' ');
        if (polygonPoints) {
          const polygon = document.createElementNS(ns, 'polygon');
          polygon.setAttribute('class', 'measurement-area-fill');
          polygon.setAttribute('points', polygonPoints);
          svg.appendChild(polygon);
        }
      }
      if (committedCount >= 2) {
        const outlineData = this.buildSvgPathFromMeasurementPoints(
          points.slice(0, committedCount),
          { close: committedCount >= 3 }
        );
        if (outlineData) {
          const outline = document.createElementNS(ns, 'path');
          outline.setAttribute('class', 'measurement-area-outline');
          outline.setAttribute('d', outlineData);
          svg.appendChild(outline);
        }
      }
      if (points.length > committedCount && committedCount >= 1) {
        const tailData = this.buildSvgPathFromMeasurementPoints([
          points[committedCount - 1],
          points[committedCount]
        ]);
        if (tailData) {
          const tail = document.createElementNS(ns, 'path');
          tail.setAttribute('class', 'measurement-area-outline measurement-preview');
          tail.setAttribute('d', tailData);
          svg.appendChild(tail);
        }
        if (committedCount >= 2) {
          const closureData = this.buildSvgPathFromMeasurementPoints([
            points[committedCount],
            points[0]
          ]);
          if (closureData) {
            const closure = document.createElementNS(ns, 'path');
            closure.setAttribute('class', 'measurement-area-outline measurement-preview');
            closure.setAttribute('d', closureData);
            svg.appendChild(closure);
          }
        }
      }
    }

    drawAngleOverlay(svg, points, committedCount, report, frame) {
      if (!svg || !Array.isArray(points) || points.length < 2) {
        return;
      }
      const ns = 'http://www.w3.org/2000/svg';
      if (committedCount >= 2 && points.length >= 2) {
        const leg1 = this.buildSvgPathFromMeasurementPoints(points.slice(0, 2));
        if (leg1) {
          const legPath = document.createElementNS(ns, 'path');
          legPath.setAttribute('class', 'measurement-angle-segment');
          legPath.setAttribute('d', leg1);
          svg.appendChild(legPath);
        }
      }
      const hasPreview = points.length > committedCount;
      if (committedCount >= 3 || (committedCount >= 2 && hasPreview)) {
        const targetPoint = committedCount >= 3 ? points[2] : points[committedCount];
        if (targetPoint) {
          const leg2 = this.buildSvgPathFromMeasurementPoints([
            points[1],
            targetPoint
          ]);
          if (leg2) {
            const classes = ['measurement-angle-segment'];
            if (targetPoint.isPreview) {
              classes.push('measurement-preview');
            }
            const legPath = document.createElementNS(ns, 'path');
            legPath.setAttribute('class', classes.join(' '));
            legPath.setAttribute('d', leg2);
            svg.appendChild(legPath);
          }
        }
      }
      if (report && report.arc) {
        const arcPathData = this.buildAngleArcPath(report.arc, frame);
        if (arcPathData) {
          const classes = ['measurement-angle-arc'];
          if (report.arc.usesPreview) {
            classes.push('measurement-preview');
          }
          const arcPath = document.createElementNS(ns, 'path');
          arcPath.setAttribute('class', classes.join(' '));
          arcPath.setAttribute('d', arcPathData);
          svg.appendChild(arcPath);
        }
      }
    }

    drawMeasurementNodes(svg, points) {
      if (!svg || !Array.isArray(points)) {
        return;
      }
      const ns = 'http://www.w3.org/2000/svg';
      points.forEach((pt) => {
        if (!pt || !pt.screen) {
          return;
        }
        const circle = document.createElementNS(ns, 'circle');
        const classes = ['measurement-node'];
        if (pt.snap && pt.snap.type) {
          classes.push('snap');
          classes.push(`snap-${pt.snap.type}`);
        }
        if (pt.isPreview) {
          classes.push('preview');
        }
        circle.setAttribute('class', classes.join(' '));
        circle.setAttribute('cx', pt.screen.x.toFixed(2));
        circle.setAttribute('cy', pt.screen.y.toFixed(2));
        circle.setAttribute('r', '4');
        svg.appendChild(circle);
      });
    }

    createMeasurementSnap(candidate) {
      if (!candidate || !candidate.type) {
        return null;
      }
      return {
        type: this.normalizeSnapType(candidate.type),
        label: candidate.label || this.getSnapTypeLabel(candidate.type),
        sourceHandle: candidate.sourceHandle || null
      };
    }

    normalizeSnapType(type) {
      if (!type) {
        return null;
      }
      return String(type).trim().toLowerCase();
    }

    getSnapTypeLabel(type) {
      const normalized = this.normalizeSnapType(type);
      switch (normalized) {
        case 'endpoint':
          return 'ENDPOINT';
        case 'midpoint':
          return 'MIDPOINT';
        case 'center':
          return 'CENTER';
        case 'node':
          return 'NODE';
        default:
          return normalized ? normalized.toUpperCase() : 'SNAP';
      }
    }

    getSnapPriority(type) {
      const normalized = this.normalizeSnapType(type);
      switch (normalized) {
        case 'endpoint':
          return 0;
        case 'midpoint':
          return 1;
        case 'center':
          return 2;
        case 'node':
          return 3;
        default:
          return 4;
      }
    }

    setActiveSnapCandidate(candidate, frame, options = {}) {
      if (!candidate || !candidate.world) {
        this.clearSnapIndicator({ silent: options && options.silent === true });
        return;
      }
      const type = this.normalizeSnapType(candidate.type);
      this.snapState.active = true;
      this.snapState.type = type;
      this.snapState.label = candidate.label || this.getSnapTypeLabel(type);
      this.snapState.world = candidate.world;
      this.snapState.screen = candidate.screen || null;
      this.snapState.sourceHandle = candidate.sourceHandle || null;
      this.snapState.isPreview = !!options.isPreview;
      this.snapState.layer = candidate.layer || null;
      if (frame) {
        this.renderSnapOverlay(frame);
      }
    }

    clearSnapIndicator(options = {}) {
      if (!this.snapState) {
        return;
      }
      this.snapState.active = false;
      this.snapState.type = null;
      this.snapState.label = null;
      this.snapState.world = null;
      this.snapState.screen = null;
      this.snapState.sourceHandle = null;
      this.snapState.layer = null;
      this.snapState.isPreview = false;
      if (this.snapMarkerEl) {
        this.snapMarkerEl.style.display = 'none';
      }
      if (!options || options.silent !== true) {
        this.renderSnapOverlay();
      }
    }

    ensureSnapMarkerElement() {
      if (!this.snapLayer) {
        return null;
      }
      if (this.snapMarkerEl && this.snapMarkerEl.parentNode === this.snapLayer) {
        return this.snapMarkerEl;
      }
      const marker = document.createElement('div');
      marker.className = 'snap-marker';
      const glyph = document.createElement('div');
      glyph.className = 'snap-glyph';
      const label = document.createElement('div');
      label.className = 'snap-label';
      marker.appendChild(glyph);
      marker.appendChild(label);
      marker.style.display = 'none';
      this.snapLayer.appendChild(marker);
      this.snapMarkerEl = marker;
      this.snapMarkerLabelEl = label;
      return marker;
    }

    renderSnapOverlay(frameOverride) {
      if (!this.snapLayer) {
        return;
      }
      const frame = frameOverride || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      if (!this.snapState || !this.snapState.active || !this.snapState.world || !frame) {
        if (this.snapMarkerEl) {
          this.snapMarkerEl.style.display = 'none';
        }
        return;
      }
      const marker = this.ensureSnapMarkerElement();
      if (!marker) {
        return;
      }
      const screen = this.worldToScreen(this.snapState.world, frame);
      if (!screen) {
        marker.style.display = 'none';
        return;
      }
      this.snapState.screen = screen;
      marker.style.display = 'flex';
      marker.style.left = `${screen.x.toFixed(2)}px`;
      marker.style.top = `${screen.y.toFixed(2)}px`;
      const typeClass = this.snapState.type ? `snap-${this.snapState.type}` : 'snap-generic';
      marker.className = `snap-marker ${typeClass}`;
      if (this.snapMarkerLabelEl) {
        this.snapMarkerLabelEl.textContent = this.snapState.label || this.getSnapTypeLabel(this.snapState.type);
      }
    }

    findSnapCandidate(screenPoint, frame, options = {}) {
      if (!screenPoint || !frame) {
        return null;
      }
      const candidates = this.getSnapCandidates(frame);
      if (!candidates.length) {
        return null;
      }
      const dpr = Number.isFinite(frame.devicePixelRatio) ? frame.devicePixelRatio : (window.devicePixelRatio || 1);
      const threshold = Math.max(6, (options.thresholdPixels || 14) * Math.max(1, dpr * 0.75));
      let bestCandidate = null;
      let bestDistance = Infinity;
      candidates.forEach((candidate) => {
        const screen = candidate.screen;
        if (!screen) {
          return;
        }
        const dx = screen.x - screenPoint.x;
        const dy = screen.y - screenPoint.y;
        const distance = Math.hypot(dx, dy);
        if (distance > threshold) {
          return;
        }
        if (!bestCandidate ||
          distance < bestDistance - 0.25 ||
          (Math.abs(distance - bestDistance) < 0.25 && candidate.priority < bestCandidate.priority)) {
          bestCandidate = candidate;
          bestDistance = distance;
        }
      });
      if (!bestCandidate) {
        return null;
      }
      return Object.assign({}, bestCandidate, { distance: bestDistance });
    }

    getSnapCandidates(frame) {
      if (!frame) {
        this.snapCandidatesCache = null;
        return [];
      }
      if (this.snapCandidatesCache && this.snapCandidatesCache.frame === frame) {
        return this.snapCandidatesCache.candidates;
      }
      const candidates = this.computeSnapCandidates(frame);
      this.snapCandidatesCache = { frame, candidates };
      return candidates;
    }

    computeSnapCandidates(frame) {
      const pickables = Array.isArray(frame && frame.pickables) ? frame.pickables : [];
      if (!pickables.length) {
        return [];
      }
      const candidates = [];
      const seen = new Map();
      const addCandidate = (type, world, pickable) => {
        if (!world || typeof world.x !== 'number' || typeof world.y !== 'number') {
          return;
        }
        const screen = this.worldToScreen(world, frame);
        if (!screen) {
          return;
        }
        const normalizedType = this.normalizeSnapType(type) || 'snap';
        const key = `${normalizedType}|${world.x.toFixed(6)}|${world.y.toFixed(6)}`;
        if (seen.has(key)) {
          return;
        }
        const candidate = {
          type: normalizedType,
          world,
          screen,
          sourceHandle: pickable && pickable.handle ? this.normalizeHandle(pickable.handle) : null,
          layer: pickable && pickable.layer ? pickable.layer : null,
          priority: this.getSnapPriority(normalizedType),
          label: this.getSnapTypeLabel(normalizedType)
        };
        seen.set(key, candidate);
        candidates.push(candidate);
      };
      pickables.forEach((pickable) => this.collectSnapCandidatesForPickable(pickable, frame, addCandidate));
      return candidates;
    }

    collectSnapCandidatesForPickable(pickable, frame, addCandidate) {
      if (!pickable || typeof addCandidate !== 'function') {
        return;
      }
      const type = (pickable.type || '').toUpperCase();
      if (type === 'HATCH' || type === 'SOLID') {
        return;
      }
      const points = this.normalizePickableWorldPoints(pickable);
      if (type === 'POINT') {
        if (points.length) {
          addCandidate('node', points[0], pickable);
        }
        return;
      }
      if (type === 'CIRCLE') {
        const center = this.estimateCircularCenter(points);
        if (center) {
          addCandidate('center', center, pickable);
        }
        return;
      }
      if (type === 'ARC') {
        if (points.length >= 1) {
          addCandidate('endpoint', points[0], pickable);
        }
        if (points.length >= 2) {
          const endPoint = points[points.length - 1];
          if (!this.pointsApproximatelyEqual(endPoint, points[0])) {
            addCandidate('endpoint', endPoint, pickable);
          }
        }
        if (points.length >= 3) {
          const midPoint = points[Math.floor(points.length / 2)];
          addCandidate('midpoint', midPoint, pickable);
        }
        const center = this.estimateCircularCenter(points);
        if (center) {
          addCandidate('center', center, pickable);
        }
        return;
      }
      const isClosed = !!pickable.isClosed;
      if (!points.length) {
        return;
      }
      if (!isClosed) {
        addCandidate('endpoint', points[0], pickable);
        if (points.length > 1) {
          addCandidate('endpoint', points[points.length - 1], pickable);
        }
      }
      points.forEach((pt) => addCandidate('node', pt, pickable));
      for (let i = 0; i < points.length - 1; i++) {
        const midpoint = this.computeSegmentMidpoint(points[i], points[i + 1]);
        if (midpoint) {
          addCandidate('midpoint', midpoint, pickable);
        }
      }
      if (isClosed && points.length > 2) {
        const closingMidpoint = this.computeSegmentMidpoint(points[points.length - 1], points[0]);
        if (closingMidpoint) {
          addCandidate('midpoint', closingMidpoint, pickable);
        }
      }
    }

    normalizePickableWorldPoints(pickable) {
      if (!pickable || !Array.isArray(pickable.worldPoints)) {
        return [];
      }
      const isClosed = !!pickable.isClosed;
      const normalized = [];
      let last = null;
      pickable.worldPoints.forEach((point) => {
        if (!point) {
          return;
        }
        const x = Number.isFinite(point.x) ? point.x : null;
        const y = Number.isFinite(point.y) ? point.y : null;
        if (x === null || y === null) {
          return;
        }
        const current = { x, y };
        if (last && this.pointsApproximatelyEqual(current, last)) {
          return;
        }
        normalized.push(current);
        last = current;
      });
      if (isClosed && normalized.length >= 2) {
        const first = normalized[0];
        const lastPoint = normalized[normalized.length - 1];
        if (this.pointsApproximatelyEqual(first, lastPoint)) {
          normalized.pop();
        }
      }
      return normalized;
    }

    pointsApproximatelyEqual(a, b, epsilon = 1e-6) {
      if (!a || !b) {
        return false;
      }
      return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
    }

    computeSegmentMidpoint(start, end) {
      if (!start || !end || this.pointsApproximatelyEqual(start, end)) {
        return null;
      }
      return {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2
      };
    }

    estimateCircularCenter(points) {
      if (!Array.isArray(points) || points.length < 3) {
        return null;
      }
      let a = null;
      let b = null;
      let c = null;
      for (let i = 0; i < points.length; i++) {
        const candidate = points[i];
        if (!candidate) {
          continue;
        }
        if (!a) {
          a = candidate;
          continue;
        }
        if (!b && !this.pointsApproximatelyEqual(candidate, a)) {
          b = candidate;
          continue;
        }
        if (!this.pointsApproximatelyEqual(candidate, a) && !this.pointsApproximatelyEqual(candidate, b)) {
          const area = Math.abs((b.x - a.x) * (candidate.y - a.y) - (b.y - a.y) * (candidate.x - a.x));
          if (area > 1e-6) {
            c = candidate;
            break;
          }
        }
      }
      if (!a || !b || !c) {
        return null;
      }
      const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
      if (Math.abs(d) < 1e-9) {
        return null;
      }
      const ux = ((a.x * a.x + a.y * a.y) * (b.y - c.y) +
        (b.x * b.x + b.y * b.y) * (c.y - a.y) +
        (c.x * c.x + c.y * c.y) * (a.y - b.y)) / d;
      const uy = ((a.x * a.x + a.y * a.y) * (c.x - b.x) +
        (b.x * b.x + b.y * b.y) * (a.x - c.x) +
        (c.x * c.x + c.y * c.y) * (b.x - a.x)) / d;
      if (!Number.isFinite(ux) || !Number.isFinite(uy)) {
        return null;
      }
      return { x: ux, y: uy };
    }

    buildSvgPathFromMeasurementPoints(points, options = {}) {
      if (!Array.isArray(points) || !points.length) {
        return null;
      }
      const screens = points
        .map((pt) => pt && pt.screen ? { x: pt.screen.x, y: pt.screen.y } : null)
        .filter(Boolean);
      return this.buildSvgPathFromScreens(screens, options && options.close === true);
    }

    buildSvgPathFromScreens(points, closePath = false) {
      if (!Array.isArray(points) || !points.length) {
        return null;
      }
      const commands = [];
      points.forEach((pt, index) => {
        if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
          return;
        }
        commands.push(`${index === 0 ? 'M' : 'L'}${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`);
      });
      if (!commands.length) {
        return null;
      }
      if (closePath) {
        commands.push('Z');
      }
      return commands.join(' ');
    }

    buildAngleArcPath(arc, frame) {
      if (!arc || !frame || !Number.isFinite(arc.radius) || arc.radius <= 0) {
        return null;
      }
      const startAngle = Math.atan2(arc.baseWorld.y - arc.vertexWorld.y, arc.baseWorld.x - arc.vertexWorld.x);
      let delta = Number.isFinite(arc.angleRad) ? arc.angleRad : 0;
      if (delta <= 0) {
        return null;
      }
      if (arc.orientation < 0) {
        delta = -delta;
      }
      const steps = Math.max(12, Math.round(Math.abs(delta) * 180 / Math.PI / 6));
      const pathPoints = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const theta = startAngle + delta * t;
        const worldPoint = {
          x: arc.vertexWorld.x + Math.cos(theta) * arc.radius,
          y: arc.vertexWorld.y + Math.sin(theta) * arc.radius
        };
        const screen = this.worldToScreen(worldPoint, frame);
        if (screen) {
          pathPoints.push(screen);
        }
      }
      return this.buildSvgPathFromScreens(pathPoints, false);
    }

    clampScreenPoint(point, width, height, padding = 12) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return null;
      }
      const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
      const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;
      return {
        x: Math.min(Math.max(point.x, padding), safeWidth - padding),
        y: Math.min(Math.max(point.y, padding), safeHeight - padding)
      };
    }

    screenToWorld(point, frameOverride) {
      const frame = frameOverride || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      if (!frame || !point) {
        return null;
      }
      const scale = Number.isFinite(frame.scale) && Math.abs(frame.scale) > 1e-9 ? frame.scale : 1;
      const center = frame.worldCenter || { x: 0, y: 0 };
      let width = Number.isFinite(frame.width) ? frame.width : null;
      let height = Number.isFinite(frame.height) ? frame.height : null;
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        const rect = this.viewportEl ? this.viewportEl.getBoundingClientRect() : null;
        if (rect) {
          width = rect.width;
          height = rect.height;
        }
      }
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return null;
      }
      const rotation = Number.isFinite(frame.rotationRad) ? frame.rotationRad : 0;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const dx = (point.x - width / 2) / scale;
      const dy = (height / 2 - point.y) / scale;
      const worldDx = cos * dx + sin * dy;
      const worldDy = -sin * dx + cos * dy;
      return {
        x: center.x + worldDx,
        y: center.y + worldDy
      };
    }

    worldToScreen(world, frameOverride) {
      const frame = frameOverride || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      if (!frame || !world) {
        return null;
      }
      const scale = Number.isFinite(frame.scale) && Math.abs(frame.scale) > 1e-9 ? frame.scale : 1;
      const center = frame.worldCenter || { x: 0, y: 0 };
      let width = Number.isFinite(frame.width) ? frame.width : null;
      let height = Number.isFinite(frame.height) ? frame.height : null;
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        const rect = this.viewportEl ? this.viewportEl.getBoundingClientRect() : null;
        if (rect) {
          width = rect.width;
          height = rect.height;
        }
      }
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return null;
      }
      const rotation = Number.isFinite(frame.rotationRad) ? frame.rotationRad : 0;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const dx = world.x - center.x;
      const dy = world.y - center.y;
      const rx = cos * dx - sin * dy;
      const ry = sin * dx + cos * dy;
      return {
        x: rx * scale + width / 2,
        y: height / 2 - ry * scale
      };
    }

    ensureMeasurementSummaryElement() {
      if (!this.summaryContainer) {
        this.measurementSummaryEl = null;
        return null;
      }
      if (this.measurementSummaryEl && this.measurementSummaryEl.parentNode === this.summaryContainer) {
        return this.measurementSummaryEl;
      }
      let element = this.summaryContainer.querySelector('.rendering-measurement-summary');
      if (!element) {
        element = document.createElement('div');
        element.className = 'rendering-measurement-summary empty';
        element.textContent = 'Measurement: inactive';
        this.summaryContainer.appendChild(element);
      }
      this.measurementSummaryEl = element;
      return element;
    }

    updateMeasurementSummary() {
      if (!this.summaryContainer) {
        this.measurementSummaryEl = null;
        return;
      }
      const summaryEl = this.ensureMeasurementSummaryElement();
      if (!summaryEl) {
        return;
      }
      if (this.measurementMode === 'none') {
        summaryEl.textContent = 'Measurement: selection only';
        summaryEl.classList.add('empty');
        return;
      }
      const report = this.computeMeasurementReport({ includePreview: true });
      if (!report) {
        summaryEl.textContent = `${this.getMeasurementModeLabel(this.measurementMode)} measurement`;
        summaryEl.classList.add('empty');
        return;
      }
      let text = report.label || `${this.getMeasurementModeLabel(this.measurementMode)} measurement`;
      if (report.detail) {
        text += ` (${report.detail})`;
      }
      summaryEl.textContent = text;
      if (report.hasData) {
        summaryEl.classList.remove('empty');
      } else {
        summaryEl.classList.add('empty');
      }
    }

    refreshViewportOverlays(frame) {
      this.updateTextLayer(frame);
      this.renderMeasurementOverlay(frame);
      this.renderSnapOverlay(frame);
      this.updateMeasurementSummary();
    }

    updateTextLayer(frame) {
      if (!this.textLayer) {
        return;
      }
      while (this.textLayer.firstChild) {
        this.textLayer.removeChild(this.textLayer.firstChild);
      }
      if (!frame || !frame.texts || !frame.texts.length) {
        return;
      }
      frame.texts.forEach((text) => {
        if (!text || !text.screenPosition) return;
        const span = document.createElement('div');
        span.className = 'rendering-text-run';
        span.textContent = Array.isArray(text.lines) ? text.lines.join('\n') : (text.rawContent || '');
        span.style.position = 'absolute';
        span.style.left = '0px';
        span.style.top = '0px';
        const widthFactor = text.widthFactor || 1;
        const rotationRad = text.rotationRad != null ? text.rotationRad : (text.rotationDeg || 0) * Math.PI / 180;
        const cos = Math.cos(rotationRad);
        const sin = Math.sin(rotationRad);
        const anchorX = text.anchor && typeof text.anchor.x === 'number' ? text.anchor.x : 0;
        const anchorY = text.anchor && typeof text.anchor.y === 'number' ? text.anchor.y : 0;
        const a = widthFactor * cos;
        const b = widthFactor * sin;
        const c = -sin;
        const d = cos;
        const e = text.screenPosition[0] + widthFactor * cos * anchorX - sin * anchorY;
        const f = text.screenPosition[1] + widthFactor * sin * anchorX + cos * anchorY;
        span.style.transform = `matrix(${a.toFixed(6)}, ${b.toFixed(6)}, ${c.toFixed(6)}, ${d.toFixed(6)}, ${e.toFixed(2)}, ${f.toFixed(2)})`;
        span.style.transformOrigin = '0 0';
        span.style.fontFamily = text.fontFamily || 'Arial, "Helvetica Neue", Helvetica, sans-serif';
        span.style.fontSize = `${Math.max(6, text.fontSize || 10)}px`;
        span.style.lineHeight = `${Math.max(6, text.lineHeight || text.fontSize || 10)}px`;
        span.style.fontStyle = text.fontStyle || 'normal';
        span.style.fontWeight = text.fontWeight || '400';
        span.style.color = text.colorCss || '#e8f1ff';
        span.style.whiteSpace = 'pre';
        const interaction = text.interaction || text.rawText?.interaction || null;
        const isAttribute = interaction && interaction.type === 'attribute';
        if (isAttribute) {
          span.classList.add('rendering-text-attribute');
          span.dataset.attributeTag = interaction.tag || '';
          span.dataset.attributeKind = interaction.attributeKind || '';
          span.dataset.visibility = interaction.visibility || text.attributeVisibility || 'visible';
          span.dataset.constant = interaction.isConstant ? 'true' : 'false';
          const valueSummary = interaction.attributeKind === 'reference'
            ? (interaction.value ?? '')
            : (interaction.defaultValue ?? '');
          if (!span.textContent && interaction.tag) {
            span.textContent = `<${interaction.tag}>`;
          }
          const labelParts = [];
          if (interaction.tag) {
            labelParts.push(`Tag ${interaction.tag}`);
          }
          if (interaction.attributeKind === 'definition') {
            labelParts.push('definition');
          } else {
            labelParts.push('reference');
          }
          if (interaction.visibility === 'hidden' || interaction.isInvisible) {
            labelParts.push('hidden');
          }
          if (interaction.isConstant) {
            labelParts.push('constant');
          }
          const ariaLabel = labelParts.join(', ');
          if (ariaLabel) {
            span.setAttribute('aria-label', ariaLabel);
          }
          if (interaction.tag) {
            span.title = `${interaction.tag}${valueSummary ? `: ${valueSummary}` : ''}`;
          }
          span.style.pointerEvents = 'auto';
          span.style.userSelect = 'text';
          span.style.cursor = 'pointer';
          span.tabIndex = 0;
          const activate = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.handleAttributeInteraction(interaction);
          };
          span.addEventListener('click', activate);
          span.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              activate(event);
            }
          });
        } else {
          span.style.pointerEvents = 'none';
          span.style.userSelect = 'none';
        }
        span.style.textAlign = text.textAlign || 'left';
        if (text.baseWidthPx) {
          span.style.width = `${text.baseWidthPx}px`;
        }
        if (text.backgroundCss) {
          span.style.background = text.backgroundCss;
          span.style.padding = '0.1em 0.2em';
          span.style.borderRadius = '2px';
        }
        this.textLayer.appendChild(span);
      });
    }

    handleAttributeInteraction(interaction) {
      if (!interaction) {
        return;
      }
      const targetHandle = interaction.handle || interaction.ownerHandle || interaction.insertHandle || null;
      if (targetHandle && this.app && typeof this.app.handleLinkToHandle === 'function') {
        this.app.handleLinkToHandle(targetHandle);
        return;
      }
      if (interaction.blockName && this.app && typeof this.app.toggleBlockHighlight === 'function') {
        this.app.toggleBlockHighlight(interaction.blockName);
      }
    }
  }

  namespace.RenderingOverlayController = RenderingOverlayController;
})(window);
