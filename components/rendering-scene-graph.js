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

  function mapValues(map, transform) {
    const result = Object.create(null);
    map.forEach((value, key) => {
      result[key] = transform ? transform(value) : value;
    });
    return result;
  }

  class SceneGraphBuilder {
    constructor(options = {}) {
      this.tables = options.tables || {};
      this.materials = options.materials || {};
      this.backgrounds = options.backgrounds || {};
      this.suns = options.suns || {};
      this.units = options.units || null;
      this.entityDefaults = options.entityDefaults || null;
      this.displaySettings = options.displaySettings || null;
      this.coordinateDefaults = options.coordinateDefaults || null;
      this.imageDefinitions = options.imageDefinitions || {};
      this.underlayDefinitions = options.underlayDefinitions || {};
      this.pointClouds = options.pointClouds || {};
      this.sectionViewStyles = options.sectionViewStyles || {};
      this.detailViewStyles = options.detailViewStyles || {};
      this.sectionObjects = options.sectionObjects || {};
      this.sectionGeometries = options.sectionGeometries || {};
      this.detailViewObjects = options.detailViewObjects || {};
      this.rasterVariables = options.rasterVariables || null;
      this.proxyObjects = options.proxyObjects || {};
      this.datalinks = options.datalinks || {};
      this.dictionaryVariables = options.dictionaryVariables || {};
      this.lightLists = options.lightLists || {};
      this.modelSpace = [];
      this.paperSpaces = new Map();
      this.blockDefinitions = new Map();
    }

    ingestEntity(entity) {
      if (!entity) {
        return;
      }

      if (entity.space === 'paper') {
        const layoutKey = entity.layout || 'PAPERSPACE';
        if (!this.paperSpaces.has(layoutKey)) {
          this.paperSpaces.set(layoutKey, []);
        }
        this.paperSpaces.get(layoutKey).push(entity);
        return;
      }

      if (entity.space === 'model') {
        this.modelSpace.push(entity);
        return;
      }

      // Entities linked to block definitions are stored on the related block entry.
      if (entity.space === 'block' && entity.blockName) {
        if (!this.blockDefinitions.has(entity.blockName)) {
          this.blockDefinitions.set(entity.blockName, {
            name: entity.blockName,
            header: null,
            entities: []
          });
        }
        const block = this.blockDefinitions.get(entity.blockName);
        block.entities.push(entity);
      }
    }

    ingestBlockDefinition(definition) {
      if (!definition || !definition.name) {
        return;
      }
      const existing = this.blockDefinitions.get(definition.name);
      if (existing) {
        existing.header = definition.header || existing.header;
        if (definition.entities && definition.entities.length) {
          existing.entities = definition.entities;
        }
      } else {
        this.blockDefinitions.set(definition.name, {
          name: definition.name,
          header: definition.header || null,
          entities: definition.entities || []
        });
      }
    }

    finalize() {
      const paperSpacesObject = mapValues(this.paperSpaces);
      const blocksObject = mapValues(this.blockDefinitions, (block) => ({
        name: block.name,
        header: block.header,
        entities: block.entities
      }));

      const paperEntityCount = Object.values(paperSpacesObject)
        .reduce((total, list) => total + list.length, 0);
      const blockEntityCount = Object.values(blocksObject)
        .reduce((total, block) => total + (block.entities ? block.entities.length : 0), 0);

      return {
        modelSpace: this.modelSpace,
        paperSpaces: paperSpacesObject,
        blocks: blocksObject,
        tables: this.tables,
        materials: this.materials,
        backgrounds: this.backgrounds,
        suns: this.suns,
        units: this.units,
        imageDefinitions: this.imageDefinitions,
        underlayDefinitions: this.underlayDefinitions,
        pointClouds: this.pointClouds,
        sectionViewStyles: this.sectionViewStyles,
        detailViewStyles: this.detailViewStyles,
        sectionObjects: this.sectionObjects,
        sectionGeometries: this.sectionGeometries,
        detailViewObjects: this.detailViewObjects,
        rasterVariables: this.rasterVariables,
        proxyObjects: this.proxyObjects,
        datalinks: this.datalinks,
        dictionaryVariables: this.dictionaryVariables,
        lightLists: this.lightLists,
        entityDefaults: this.entityDefaults,
        displaySettings: this.displaySettings,
        coordinateDefaults: this.coordinateDefaults,
        environment: {
          backgrounds: this.backgrounds,
          suns: this.suns
        },
        stats: {
          modelSpaceEntities: this.modelSpace.length,
          paperSpaceLayouts: Object.keys(paperSpacesObject).length,
          paperSpaceEntities: paperEntityCount,
          blockCount: Object.keys(blocksObject).length,
          blockEntities: blockEntityCount
        }
      };
    }
  }

  namespace.SceneGraphBuilder = SceneGraphBuilder;

  return {
    SceneGraphBuilder
  };
}));
