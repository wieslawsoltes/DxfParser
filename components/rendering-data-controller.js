(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], function () { return factory(root); });
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    factory(root);
  }
}((function () {
  if (typeof globalThis !== "undefined") return globalThis;
  if (typeof self !== "undefined") return self;
  if (typeof window !== "undefined") return window;
  if (typeof global !== "undefined") return global;
  return {};
}()), function (root) {
  'use strict';

  const namespace = root.DxfRendering = root.DxfRendering || {};

  class RenderingDataController {
    constructor(options = {}) {
      this.parser = options.parser || null;
      this.documents = new Map();
    }

    ingestDocument(payload) {
      const { tabId, fileName, sourceText } = payload || {};
      if (!tabId) {
        return null;
      }

      if (!this.parser || typeof this.parser.parseDxf !== 'function') {
        this.registerPlaceholder(tabId, {
          reason: 'parserUnavailable',
          fileName: fileName || null
        });
        return null;
      }

      if (typeof sourceText !== 'string') {
        this.registerPlaceholder(tabId, {
          reason: 'missingSource',
          fileName: fileName || null
        });
        return null;
      }

      try {
        const tags = this.parser.parseDxf(sourceText);
        const builder = new namespace.RenderingDocumentBuilder({ tags });
        const doc = builder.build();
        doc.status = 'ready';
        doc.tabId = tabId;
        doc.fileName = fileName || null;
        doc.createdAt = Date.now();
        doc.sourceLength = sourceText.length;
        this.documents.set(tabId, doc);
        return doc;
      } catch (err) {
        console.warn('RenderingDataController: unable to build rendering document', err);
        this.registerPlaceholder(tabId, {
          reason: 'buildError',
          fileName: fileName || null,
          message: err && err.message ? err.message : 'unknown error'
        });
        return null;
      }
    }

    registerPlaceholder(tabId, details = {}) {
      if (!tabId) {
        return;
      }
      this.documents.set(tabId, Object.assign({
        status: 'placeholder',
        createdAt: Date.now()
      }, details));
    }

    releaseDocument(tabId) {
      if (!tabId) {
        return;
      }
      this.documents.delete(tabId);
    }

    getDocument(tabId) {
      return this.documents.get(tabId) || null;
    }

    getSceneGraph(tabId) {
      const doc = this.getDocument(tabId);
      return doc && doc.sceneGraph ? doc.sceneGraph : null;
    }

    hasDocument(tabId) {
      return this.documents.has(tabId);
    }
  }

  namespace.RenderingDataController = RenderingDataController;

  return {
    RenderingDataController
  };
}));
