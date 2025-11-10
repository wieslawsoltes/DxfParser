(function (root) {
  'use strict';

  if (!root) {
    return;
  }

  const globalObject = root;
  const namespace = globalObject.DxfApp = globalObject.DxfApp || {};

  function ensureParser(options) {
    if (options && options.parser) {
      return options.parser;
    }
    if (options && typeof options.createParser === 'function') {
      const parser = options.createParser();
      if (parser) {
        return parser;
      }
    }
    if (typeof globalObject.DxfParser === 'function') {
      return new globalObject.DxfParser();
    }
    throw new Error('[DxfApp] DxfParser constructor is not available on the global scope.');
  }

  function ensureRenderingNamespace() {
    const rendering = globalObject.DxfRendering;
    if (!rendering) {
      throw new Error('[DxfApp] DxfRendering namespace is not available. Ensure rendering modules are loaded first.');
    }
    return rendering;
  }

  function createCoreServices(options) {
    const resolvedOptions = options || {};
    const parser = ensureParser(resolvedOptions);
    const rendering = ensureRenderingNamespace();
    const DataController = rendering.RenderingDataController;
    if (typeof DataController !== 'function') {
      throw new Error('[DxfApp] RenderingDataController is not available.');
    }
    const dataController = resolvedOptions.dataController || new DataController({ parser });
    return {
      parser,
      dataController
    };
  }

  function createSurfaceManager(options) {
    const resolvedOptions = options || {};
    const rendering = ensureRenderingNamespace();
    const SurfaceManager = rendering.RenderingSurfaceManager;
    if (typeof SurfaceManager !== 'function') {
      throw new Error('[DxfApp] RenderingSurfaceManager is not available.');
    }
    const manager = resolvedOptions.instance || new SurfaceManager();
    if (resolvedOptions.canvas) {
      manager.initialize(resolvedOptions.canvas);
    }
    return manager;
  }

  function createOverlayController(options) {
    const resolvedOptions = options || {};
    const core = resolvedOptions.core || {};

    const rendering = ensureRenderingNamespace();
    const OverlayController = rendering.RenderingOverlayController;
    if (typeof OverlayController !== 'function') {
      throw new Error('[DxfApp] RenderingOverlayController is not available.');
    }

    const controllerOptions = Object.assign({
      root: resolvedOptions.root || null,
      document: resolvedOptions.document || (typeof document !== 'undefined' ? document : null),
      global: globalObject,
      dataController: resolvedOptions.dataController || core.dataController || null,
      dxfParser: resolvedOptions.parser || core.parser || null,
      adapters: resolvedOptions.adapters || {}
    }, resolvedOptions.extra || {});

    const controller = resolvedOptions.instance || new OverlayController(controllerOptions);
    const shouldInitialize = resolvedOptions.autoInitialize !== false;
    if (shouldInitialize && controller && typeof controller.initializeDom === 'function') {
      controller.initializeDom();
    }
    return controller;
  }

  function bootstrapRenderer(options) {
    const resolvedOptions = options || {};
    const core = createCoreServices(resolvedOptions);

    let surfaceManager = null;
    if (resolvedOptions.canvas || resolvedOptions.surfaceManagerOptions) {
      surfaceManager = createSurfaceManager(Object.assign({
        canvas: resolvedOptions.canvas || null
      }, resolvedOptions.surfaceManagerOptions || {}));
    }

    let overlayController = null;
    if (resolvedOptions.overlay) {
      const overlayOptions = typeof resolvedOptions.overlay === 'object'
        ? resolvedOptions.overlay
        : {};
      overlayController = createOverlayController(Object.assign({
        core
      }, overlayOptions));
    }

    return Object.assign({}, core, {
      surfaceManager,
      overlayController
    });
  }

  namespace.createCoreServices = createCoreServices;
  namespace.createSurfaceManager = createSurfaceManager;
  namespace.createOverlayController = createOverlayController;
  namespace.bootstrapRenderer = bootstrapRenderer;
})(typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this)));
