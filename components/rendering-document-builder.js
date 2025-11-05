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
  if (!namespace.utils && typeof require === "function") {
    try {
      const entitiesModule = require("./rendering-entities.js");
      if (entitiesModule && entitiesModule.utils) {
        namespace.utils = entitiesModule.utils;
      }
    } catch (err) {
      // Ignore resolution failures; fall back to existing namespace utils.
    }
  }
  const utils = namespace.utils || {};

  function toColorObject(intValue, alpha = 1) {
    if (!Number.isFinite(intValue)) {
      return null;
    }
    const r = ((intValue >> 16) & 0xff) / 255;
    const g = ((intValue >> 8) & 0xff) / 255;
    const b = (intValue & 0xff) / 255;
    const a = Math.min(Math.max(alpha, 0), 1);
    return {
      r,
      g,
      b,
      a,
      css: `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a.toFixed(3)})`
    };
  }

  function boolFromValue(value) {
    const num = utils.toInt ? utils.toInt(value) : parseInt(value, 10);
    if (!Number.isFinite(num)) {
      return false;
    }
    return num !== 0;
  }

  function ensureArray(target, key) {
    if (!target[key]) {
      target[key] = [];
    }
    return target[key];
  }

  function normalizeHandle(value) {
    if (value == null) {
      return null;
    }
    const stringValue = typeof value === 'string' ? value : String(value);
    const trimmed = stringValue.trim();
    return trimmed ? trimmed.toUpperCase() : null;
  }

  function classifyVisualStyleName(name) {
    if (!name) {
      return 'custom';
    }
    const upper = String(name).trim().toUpperCase();
    if (!upper) {
      return 'custom';
    }
    if (upper.includes('WIREFRAME')) {
      return 'wireframe';
    }
    if (upper.includes('HIDDEN')) {
      return 'hidden';
    }
    if (upper.includes('REALISTIC')) {
      return 'realistic';
    }
    if (upper.includes('CONCEPT')) {
      return 'conceptual';
    }
    if (upper.includes('SHADED') || upper.includes('SHADE')) {
      return 'shaded';
    }
    if (upper.includes('ILLUSTRATION') || upper.includes('TECHNICAL')) {
      return 'conceptual';
    }
    return 'custom';
  }

  function parseDictionaryObject(tags) {
    const dictionary = {
      type: 'DICTIONARY',
      handle: null,
      handleUpper: null,
      owner: null,
      ownerUpper: null,
      entries: [],
      defaultEntry: null,
      defaultEntryUpper: null,
      duplicateRecordCloning: null,
      subclassMarkers: [],
      rawTags: []
    };
    let pendingEntryName = null;

    tags.forEach((tag) => {
      const code = Number(tag.code);
      const rawValue = tag.value;
      const stringValue = typeof rawValue === 'string'
        ? rawValue
        : (rawValue != null ? String(rawValue) : '');
      dictionary.rawTags.push({ code, value: rawValue });

      switch (code) {
        case 5: {
          const handle = stringValue.trim();
          dictionary.handle = handle || null;
          dictionary.handleUpper = normalizeHandle(handle);
          break;
        }
        case 330: {
          const owner = stringValue.trim();
          dictionary.owner = owner || null;
          dictionary.ownerUpper = normalizeHandle(owner);
          break;
        }
        case 100:
          dictionary.subclassMarkers.push(stringValue.trim());
          break;
        case 281: {
          const cloningMode = parseInt(stringValue, 10);
          dictionary.duplicateRecordCloning = Number.isFinite(cloningMode) ? cloningMode : null;
          break;
        }
        case 102:
          // reactor strings, ignore
          break;
        case 3:
          pendingEntryName = stringValue.trim();
          break;
        case 350:
        case 360: {
          const entryHandleRaw = stringValue.trim();
          if (pendingEntryName) {
            dictionary.entries.push({
              name: pendingEntryName,
              nameUpper: pendingEntryName.toUpperCase(),
              handle: entryHandleRaw || null,
              handleUpper: normalizeHandle(entryHandleRaw),
              code
            });
            pendingEntryName = null;
          }
          break;
        }
        case 340: {
          const defaultHandle = stringValue.trim();
          dictionary.defaultEntry = defaultHandle || null;
          dictionary.defaultEntryUpper = normalizeHandle(defaultHandle);
          break;
        }
        default:
          break;
      }
    });

    if (dictionary.subclassMarkers.includes('ACDBDICTIONARYWDFLT')) {
      dictionary.type = 'ACDBDICTIONARYWDFLT';
    }

    return dictionary;
  }

  function parsePlaceholderObject(tags) {
    const placeholder = {
      handle: null,
      handleUpper: null,
      owner: null,
      ownerUpper: null,
      rawTags: []
    };
    tags.forEach((tag) => {
      const code = Number(tag.code);
      const rawValue = tag.value;
      const stringValue = typeof rawValue === 'string'
        ? rawValue
        : (rawValue != null ? String(rawValue) : '');
      placeholder.rawTags.push({ code, value: rawValue });
      if (code === 5) {
        const handle = stringValue.trim();
        placeholder.handle = handle || null;
        placeholder.handleUpper = normalizeHandle(handle);
      } else if (code === 330) {
        const owner = stringValue.trim();
        placeholder.owner = owner || null;
        placeholder.ownerUpper = normalizeHandle(owner);
      }
    });
    return placeholder;
  }

  function toFloat(value) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
  }

  function toInt(value) {
    const num = parseInt(value, 10);
    return Number.isFinite(num) ? num : null;
  }

  function convertJulianDay(value) {
    const numeric = toFloat(value);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    const millis = (numeric - 2440587.5) * 86400000;
    if (!Number.isFinite(millis)) {
      return { julian: numeric };
    }
    const date = new Date(millis);
    if (Number.isNaN(date.getTime())) {
      return { julian: numeric };
    }
    return {
      julian: numeric,
      unixMillis: millis,
      iso: date.toISOString(),
      locale: date.toString()
    };
  }

  function convertDurationDays(value) {
    const numeric = toFloat(value);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    const hours = numeric * 24;
    return {
      days: numeric,
      hours,
      minutes: hours * 60,
      seconds: hours * 3600
    };
  }

  function createCssFromRgb(rgb, alpha = 1) {
    if (!rgb || !Number.isFinite(rgb.r) || !Number.isFinite(rgb.g) || !Number.isFinite(rgb.b)) {
      return null;
    }
    const r = Math.max(0, Math.min(255, Math.round(rgb.r)));
    const g = Math.max(0, Math.min(255, Math.round(rgb.g)));
    const b = Math.max(0, Math.min(255, Math.round(rgb.b)));
    const a = Math.max(0, Math.min(1, alpha));
    if (a >= 0.999) {
      return `rgb(${r}, ${g}, ${b})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
  }

  function updateColorDescriptor(descriptor, code, rawValue, utilsRef) {
    const target = descriptor || {
      aci: null,
      trueColor: null,
      name: null,
      css: null,
      transparency: null
    };
    switch (code) {
      case 62:
      case 63: {
        const aci = utilsRef.toInt ? utilsRef.toInt(rawValue) : parseInt(rawValue, 10);
        if (Number.isInteger(aci)) {
          target.aci = aci;
        }
        break;
      }
      case 420:
      case 421: {
        if (utilsRef.parseTrueColor) {
          const parsed = utilsRef.parseTrueColor(rawValue);
          if (parsed) {
            target.trueColor = parsed;
            target.css = createCssFromRgb({
              r: parsed.r,
              g: parsed.g,
              b: parsed.b
            }, target.transparency != null ? target.transparency : 1);
          }
        }
        break;
      }
      case 430:
      case 431: {
        if (rawValue != null && rawValue !== '') {
          target.name = String(rawValue).trim();
        }
        break;
      }
      case 440: {
        if (utilsRef.parseTransparency) {
          const transparency = utilsRef.parseTransparency(rawValue);
          if (transparency && transparency.alpha != null) {
            target.transparency = transparency.alpha;
            if (target.trueColor) {
              target.css = createCssFromRgb({
                r: target.trueColor.r,
                g: target.trueColor.g,
                b: target.trueColor.b
              }, target.transparency);
            }
          }
        }
        break;
      }
      default:
        break;
    }
    return target;
  }

  function isLatitude(value) {
    return Number.isFinite(value) && value >= -90 && value <= 90;
  }

  function isLongitude(value) {
    return Number.isFinite(value) && value >= -180 && value <= 180;
  }

  function parsePlotSettingsObject(tags) {
    const plotSettings = {
      handle: null,
      handleUpper: null,
      owner: null,
      ownerUpper: null,
      subclassMarkers: [],
      strings: Object.create(null),
      numbers: Object.create(null),
      bools: Object.create(null),
      rawTags: []
    };
    let currentSubclass = null;

    const stringMap = {
      1: 'pageSetupName',
      2: 'plotConfigurationFile',
      4: 'paperSize',
      6: 'plotViewName',
      7: 'currentStyleSheet'
    };

    const floatMap = {
      40: 'leftMargin',
      41: 'bottomMargin',
      42: 'rightMargin',
      43: 'topMargin',
      44: 'paperWidth',
      45: 'paperHeight',
      46: 'plotOriginXOffset',
      47: 'plotOriginYOffset',
      48: 'plotWindowX1',
      49: 'plotWindowY1',
      140: 'plotWindowX2',
      141: 'plotWindowY2',
      142: 'scaleNumerator',
      143: 'scaleDenominator',
      147: 'unitFactor',
      148: 'paperImageOriginX',
      149: 'paperImageOriginY'
    };

    const intMap = {
      70: 'plotLayoutFlags',
      72: 'plotPaperUnits',
      73: 'plotRotation',
      74: 'plotType',
      75: 'standardScaleType',
      76: 'shadePlotMode',
      77: 'shadePlotResolutionLevel',
      78: 'shadePlotCustomDpi'
    };

    tags.forEach((tag) => {
      const code = Number(tag.code);
      const rawValue = tag.value;
      const stringValue = typeof rawValue === 'string'
        ? rawValue
        : (rawValue != null ? String(rawValue) : '');
      plotSettings.rawTags.push({ code, value: rawValue });

      if (code === 5) {
        const handle = stringValue.trim();
        plotSettings.handle = handle || null;
        plotSettings.handleUpper = normalizeHandle(handle);
        return;
      }
      if (code === 330) {
        const owner = stringValue.trim();
        plotSettings.owner = owner || null;
        plotSettings.ownerUpper = normalizeHandle(owner);
        return;
      }
      if (code === 100) {
        currentSubclass = stringValue.trim();
        plotSettings.subclassMarkers.push(currentSubclass);
        return;
      }
      if (currentSubclass !== 'AcDbPlotSettings') {
        return;
      }
      if (stringMap[code]) {
        const label = stringMap[code];
        plotSettings.strings[label] = stringValue;
        return;
      }
      if (floatMap[code]) {
        const label = floatMap[code];
        plotSettings.numbers[label] = toFloat(rawValue);
        return;
      }
      if (intMap[code]) {
        const label = intMap[code];
        plotSettings.numbers[label] = toInt(rawValue);
        return;
      }
      if (code >= 290 && code <= 299) {
        const label = `bool${code}`;
        plotSettings.bools[label] = !!toInt(rawValue);
        return;
      }
      if (code === 333) {
        plotSettings.strings.shadePlotHandle = stringValue.trim();
      }
    });

    return plotSettings;
  }

  function parseLayoutObject(tags) {
    const layout = {
      handle: null,
      handleUpper: null,
      owner: null,
      ownerUpper: null,
      subclassMarkers: [],
      name: null,
      nameUpper: null,
      layoutFlags: null,
      tabOrder: null,
      limits: {
        min: { x: null, y: null },
        max: { x: null, y: null }
      },
      insertBase: { x: null, y: null, z: null },
      extents: {
        min: { x: null, y: null, z: null },
        max: { x: null, y: null, z: null }
      },
      elevation: null,
      ucsOrigin: { x: null, y: null, z: null },
      ucsXAxis: { x: null, y: null, z: null },
      ucsYAxis: { x: null, y: null, z: null },
      ucsType: null,
      blockRecordHandle: null,
      viewportHandle: null,
      ucsHandle: null,
      baseUcsHandle: null,
      plotSettings: null,
      rawTags: []
    };

    let currentSubclass = null;
    const plotSettings = parsePlotSettingsObject(tags);
    if (plotSettings) {
      layout.plotSettings = {
        strings: Object.assign({}, plotSettings.strings),
        numbers: Object.assign({}, plotSettings.numbers),
        bools: Object.assign({}, plotSettings.bools)
      };
    } else {
      layout.plotSettings = {
        strings: Object.create(null),
        numbers: Object.create(null),
        bools: Object.create(null)
      };
    }

    const pointCache = {
      limmin: { x: null, y: null },
      limmax: { x: null, y: null },
      insertBase: { x: null, y: null, z: null },
      extmin: { x: null, y: null, z: null },
      extmax: { x: null, y: null, z: null },
      ucsOrigin: { x: null, y: null, z: null },
      ucsXAxis: { x: null, y: null, z: null },
      ucsYAxis: { x: null, y: null, z: null }
    };

    tags.forEach((tag) => {
      const code = Number(tag.code);
      const rawValue = tag.value;
      const stringValue = typeof rawValue === 'string'
        ? rawValue
        : (rawValue != null ? String(rawValue) : '');
      layout.rawTags.push({ code, value: rawValue });

      if (code === 5) {
        const handle = stringValue.trim();
        layout.handle = handle || null;
        layout.handleUpper = normalizeHandle(handle);
        return;
      }
      if (code === 330) {
        if (!currentSubclass || currentSubclass === 'AcDbEntity' || currentSubclass === 'AcDbPlotSettings') {
          const owner = stringValue.trim();
          layout.owner = owner || null;
          layout.ownerUpper = normalizeHandle(owner);
          return;
        }
      }
      if (code === 100) {
        currentSubclass = stringValue.trim();
        layout.subclassMarkers.push(currentSubclass);
        return;
      }

      if (currentSubclass === 'AcDbLayout') {
        switch (code) {
          case 1: {
            const name = stringValue.trim();
            layout.name = name || null;
            layout.nameUpper = name ? name.toUpperCase() : null;
            break;
          }
          case 70:
            layout.layoutFlags = toInt(rawValue);
            break;
          case 71:
            layout.tabOrder = toInt(rawValue);
            break;
          case 10:
          case 20:
            pointCache.limmin[code === 10 ? 'x' : 'y'] = toFloat(rawValue);
            break;
          case 11:
          case 21:
            pointCache.limmax[code === 11 ? 'x' : 'y'] = toFloat(rawValue);
            break;
          case 12:
          case 22:
          case 32:
            pointCache.insertBase[code === 12 ? 'x' : (code === 22 ? 'y' : 'z')] = toFloat(rawValue);
            break;
          case 14:
          case 24:
          case 34:
            pointCache.extmin[code === 14 ? 'x' : (code === 24 ? 'y' : 'z')] = toFloat(rawValue);
            break;
          case 15:
          case 25:
          case 35:
            pointCache.extmax[code === 15 ? 'x' : (code === 25 ? 'y' : 'z')] = toFloat(rawValue);
            break;
          case 146:
            layout.elevation = toFloat(rawValue);
            break;
          case 13:
          case 23:
          case 33:
            pointCache.ucsOrigin[code === 13 ? 'x' : (code === 23 ? 'y' : 'z')] = toFloat(rawValue);
            break;
          case 16:
          case 26:
          case 36:
            pointCache.ucsXAxis[code === 16 ? 'x' : (code === 26 ? 'y' : 'z')] = toFloat(rawValue);
            break;
          case 17:
          case 27:
          case 37:
            pointCache.ucsYAxis[code === 17 ? 'x' : (code === 27 ? 'y' : 'z')] = toFloat(rawValue);
            break;
          case 76:
            layout.ucsType = toInt(rawValue);
            break;
          case 330: {
            const handle = stringValue.trim();
            layout.blockRecordHandle = handle || null;
            layout.blockRecordHandleUpper = normalizeHandle(handle);
            break;
          }
          case 331: {
            const handle = stringValue.trim();
            layout.viewportHandle = handle || null;
            layout.viewportHandleUpper = normalizeHandle(handle);
            break;
          }
          case 345: {
            const handle = stringValue.trim();
            layout.ucsHandle = handle || null;
            layout.ucsHandleUpper = normalizeHandle(handle);
            break;
          }
          case 346: {
            const handle = stringValue.trim();
            layout.baseUcsHandle = handle || null;
            layout.baseUcsHandleUpper = normalizeHandle(handle);
            break;
          }
          case 348: {
            const handle = stringValue.trim();
            layout.visualStyleHandle = handle || null;
            layout.visualStyleHandleUpper = normalizeHandle(handle);
            break;
          }
          case 361: {
            const handle = stringValue.trim();
            layout.sunHandle = handle || null;
            layout.sunHandleUpper = normalizeHandle(handle);
            break;
          }
          case 332: {
            const handle = stringValue.trim();
            layout.backgroundHandle = handle || null;
            layout.backgroundHandleUpper = normalizeHandle(handle);
            break;
          }
          default:
            break;
        }
      }
    });

    layout.limits.min = pointCache.limmin;
    layout.limits.max = pointCache.limmax;
    layout.insertBase = pointCache.insertBase;
    layout.extents.min = pointCache.extmin;
    layout.extents.max = pointCache.extmax;
    layout.ucsOrigin = pointCache.ucsOrigin;
    layout.ucsXAxis = pointCache.ucsXAxis;
    layout.ucsYAxis = pointCache.ucsYAxis;

    return layout;
  }

  function buildPlotStyleCatalog(dictionaryHandle, dictionaryMap, placeholderMap, type) {
    const empty = {
      type,
      dictionaryHandle: null,
      dictionaryHandleUpper: null,
      defaultHandle: null,
      defaultHandleUpper: null,
      ordered: [],
      entries: [],
      byHandle: Object.create(null),
      byName: Object.create(null)
    };
    if (!dictionaryHandle) {
      return empty;
    }
    const normalizedHandle = normalizeHandle(dictionaryHandle);
    const dictionary = dictionaryMap.get(normalizedHandle) || dictionaryMap.get(dictionaryHandle);
    if (!dictionary) {
      return empty;
    }
    const ordered = [];
    const byHandle = Object.create(null);
    const byName = Object.create(null);

    dictionary.entries.forEach((entry, index) => {
      const descriptor = {
        type,
        index,
        name: entry.name || null,
        nameUpper: entry.nameUpper || (entry.name ? entry.name.toUpperCase() : null),
        handle: entry.handle || null,
        handleUpper: entry.handleUpper || normalizeHandle(entry.handle),
        dictionaryHandle: dictionary.handle,
        dictionaryHandleUpper: dictionary.handleUpper,
        isDefault: !!(dictionary.defaultEntryUpper && entry.handleUpper &&
          dictionary.defaultEntryUpper === entry.handleUpper),
        placeholder: entry.handleUpper ? (placeholderMap.get(entry.handleUpper) || null) : null
      };
      ordered.push(descriptor);
      if (descriptor.handleUpper) {
        byHandle[descriptor.handleUpper] = descriptor;
      }
      if (descriptor.nameUpper) {
        byName[descriptor.nameUpper] = descriptor;
      }
    });

    return {
      type,
      dictionaryHandle: dictionary.handle,
      dictionaryHandleUpper: dictionary.handleUpper,
      defaultHandle: dictionary.defaultEntry,
      defaultHandleUpper: dictionary.defaultEntryUpper,
      ordered,
      entries: ordered,
      byHandle,
      byName
    };
  }

  class RenderingDocumentBuilder {
    constructor(options = {}) {
      this.tags = options.tags || [];
      this.entityCounter = 1;
      this.blockCounter = 1;
    }

    build() {
      const tables = this.extractTables();
      const drawingProperties = this.extractDrawingProperties();
      const plotInfrastructure = this.extractPlotInfrastructure();
      if (plotInfrastructure) {
        if (plotInfrastructure.plotStyles) {
          tables.plotStyles = plotInfrastructure.plotStyles;
        }
        if (plotInfrastructure.layouts) {
          tables.layouts = plotInfrastructure.layouts;
        }
        if (plotInfrastructure.plotConfigurations) {
          tables.plotConfigurations = plotInfrastructure.plotConfigurations;
        }
        if (plotInfrastructure.plotSettings) {
          tables.plotSettings = plotInfrastructure.plotSettings;
        }
        if (Number.isInteger(plotInfrastructure.plotStyleMode)) {
          tables.plotStyleMode = plotInfrastructure.plotStyleMode;
        }
      }
      const colorBooks = this.extractColorBooks();
      if (colorBooks) {
        tables.colorBooks = colorBooks;
      }
      const materialCatalog = this.extractMaterials();
      const backgroundCatalog = this.extractBackgrounds();
      const sunCatalog = this.extractSuns();
      const { entities, blocks } = this.extractEntities(tables, materialCatalog);

      if (colorBooks && tables.layers) {
        const resolveColorBookReference = (reference) => {
          if (!reference) {
            return null;
          }
          const byKey = colorBooks.byKey || null;
          const byHandle = colorBooks.byHandle || null;
          const booksMap = colorBooks.books || null;
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
          if (bookKey && booksMap && booksMap[bookKey] && colorKey) {
            const bookEntry = booksMap[bookKey];
            if (bookEntry && bookEntry.colors && bookEntry.colors[colorKey]) {
              return bookEntry.colors[colorKey];
            }
          }
          return null;
        };

        Object.keys(tables.layers).forEach((layerKey) => {
          const layerEntry = tables.layers[layerKey];
          if (layerEntry && layerEntry.colorBook) {
            const resolved = resolveColorBookReference(layerEntry.colorBook);
            if (resolved) {
              layerEntry.colorBookResolved = resolved;
            }
          }
        });
      }

      if (backgroundCatalog && backgroundCatalog.byHandle) {
        tables.backgroundsByHandle = backgroundCatalog.byHandle;
      }
      if (sunCatalog && sunCatalog.byHandle) {
        tables.sunsByHandle = sunCatalog.byHandle;
      }
      if (tables.visualStyles) {
        const visualStylesByHandle = Object.create(null);
        const visualStylesByName = Object.create(null);
        Object.keys(tables.visualStyles).forEach((key) => {
          const entry = tables.visualStyles[key];
          if (!entry || typeof entry !== 'object') {
            return;
          }
          if (entry.handleUpper) {
            visualStylesByHandle[entry.handleUpper] = entry;
          }
          const entryName = entry.name || key;
          if (entryName) {
            visualStylesByName[entryName.toUpperCase()] = entry;
          }
        });
        tables.visualStylesByHandle = visualStylesByHandle;
        tables.visualStylesByName = visualStylesByName;
      }

      const sceneGraphBuilder = new namespace.SceneGraphBuilder({
        tables,
        materials: materialCatalog.byHandle,
        backgrounds: backgroundCatalog.byHandle,
        suns: sunCatalog.byHandle
      });

      entities.forEach((entity) => sceneGraphBuilder.ingestEntity(entity));
      blocks.forEach((blockDef) => sceneGraphBuilder.ingestBlockDefinition(blockDef));

      const sceneGraph = sceneGraphBuilder.finalize();
      const blockMetadata = this.computeBlockMetadata(sceneGraph);
      if (sceneGraph && typeof sceneGraph === 'object') {
        sceneGraph.blockMetadata = blockMetadata;
        sceneGraph.textStyleCatalog = this.computeTextStyleCatalog(tables);
      }
      const stats = Object.assign({}, sceneGraph.stats, {
        renderableEntities: entities.length,
        blockDefinitions: blocks.length,
        materialDefinitions: materialCatalog.list.length
      });

      return {
        tables,
        materials: materialCatalog,
        colorBooks,
        entities,
        blocks,
        sceneGraph,
        blockMetadata,
        textStyles: sceneGraph ? sceneGraph.textStyleCatalog : this.computeTextStyleCatalog(tables),
        stats,
        drawingProperties,
        backgrounds: backgroundCatalog,
        suns: sunCatalog
      };
    }

    extractDrawingProperties() {
      const units = {
        insUnits: null,
        insUnitsTarget: null,
        insUnitsSource: null,
        measurement: null,
        scaleFactor: null,
        basePoint: { x: null, y: null, z: null }
      };

      const limits = {
        model: {
          min: { x: null, y: null },
          max: { x: null, y: null }
        },
        paper: {
          min: { x: null, y: null },
          max: { x: null, y: null }
        }
      };

      const extents = {
        model: {
          min: { x: null, y: null, z: null },
          max: { x: null, y: null, z: null }
        },
        paper: {
          min: { x: null, y: null, z: null },
          max: { x: null, y: null, z: null }
        }
      };

      const metadata = {
        acadVersion: null,
        codePage: null,
        lastSavedBy: null,
        projectName: null,
        created: null,
        updated: null,
        totalEditingTime: null,
        userTimer: null,
        timezoneMinutes: null
      };

      const geoHeaderVars = Object.create(null);
      let geoObject = null;

      let section = null;
      let currentHeaderVar = null;
      let i = 0;

      const registerGeoHeaderValue = (varName, code, rawValue, stringValue) => {
        if (!varName) {
          return;
        }
        const key = varName.toUpperCase();
        if (!geoHeaderVars[key]) {
          geoHeaderVars[key] = {
            values: [],
            byCode: Object.create(null)
          };
        }
        let value = null;
        const numeric = toFloat(rawValue);
        if (Number.isFinite(numeric)) {
          value = numeric;
        } else if (typeof stringValue === 'string' && stringValue.trim()) {
          value = stringValue.trim();
        } else if (rawValue != null) {
          value = rawValue;
        }
        if (value != null) {
          geoHeaderVars[key].values.push(value);
          if (geoHeaderVars[key].byCode[code] == null) {
            geoHeaderVars[key].byCode[code] = value;
          } else if (Array.isArray(geoHeaderVars[key].byCode[code])) {
            geoHeaderVars[key].byCode[code].push(value);
          } else {
            geoHeaderVars[key].byCode[code] = [geoHeaderVars[key].byCode[code], value];
          }
        }
      };

      while (i < this.tags.length) {
        const tag = this.tags[i];
        const code = Number(tag.code);
        const rawValue = tag.value;
        const stringValue = typeof rawValue === 'string'
          ? rawValue
          : (rawValue != null ? String(rawValue) : '');
        const trimmedValue = stringValue.trim();
        const upperValue = trimmedValue.toUpperCase();

        if (code === 0) {
          if (upperValue === 'SECTION') {
            section = null;
            currentHeaderVar = null;
            i += 1;
            while (i < this.tags.length) {
              const lookahead = this.tags[i];
              if (Number(lookahead.code) === 2) {
                section = String(lookahead.value || '').trim().toUpperCase();
                i += 1;
                break;
              }
              if (Number(lookahead.code) === 0) {
                break;
              }
              i += 1;
            }
            continue;
          }

          if (upperValue === 'ENDSEC') {
            section = null;
            currentHeaderVar = null;
            i += 1;
            continue;
          }

          if (section === 'OBJECTS' && (upperValue === 'GEODATA' || upperValue === 'GEOGRAPHICLOCATION')) {
            const { tags: geoTags, nextIndex } = this.collectEntityTags(i + 1);
            const parsedGeo = this.parseGeographicObject(upperValue, geoTags);
            if (parsedGeo) {
              geoObject = parsedGeo;
            }
            i = nextIndex;
            continue;
          }
        }

        if (section === 'HEADER') {
          if (code === 9) {
            currentHeaderVar = trimmedValue ? trimmedValue.toUpperCase() : null;
            i += 1;
            continue;
          }

          if (!currentHeaderVar) {
            i += 1;
            continue;
          }

          if (currentHeaderVar.startsWith('$GEO')) {
            registerGeoHeaderValue(currentHeaderVar, code, rawValue, stringValue);
          }

          const floatVal = toFloat(rawValue);
          const intVal = toInt(rawValue);

          switch (currentHeaderVar) {
            case '$INSUNITS':
              if (intVal != null) {
                units.insUnits = intVal;
              }
              break;
            case '$INSUNITSDEFTARGET':
              if (intVal != null) {
                units.insUnitsTarget = intVal;
              }
              break;
            case '$INSUNITSDEFSOURCE':
              if (intVal != null) {
                units.insUnitsSource = intVal;
              }
              break;
            case '$MEASUREMENT':
              if (intVal != null) {
                units.measurement = intVal;
              }
              break;
            case '$INSBASE':
              if (code === 10) {
                units.basePoint.x = floatVal;
              } else if (code === 20) {
                units.basePoint.y = floatVal;
              } else if (code === 30) {
                units.basePoint.z = floatVal;
              }
              break;
            case '$INSUNITSFAC':
            case '$INSUNITSFACTOR':
              if (floatVal != null) {
                units.scaleFactor = floatVal;
              }
              break;
            case '$LIMMIN':
              if (code === 10) {
                limits.model.min.x = floatVal;
              } else if (code === 20) {
                limits.model.min.y = floatVal;
              }
              break;
            case '$LIMMAX':
              if (code === 10) {
                limits.model.max.x = floatVal;
              } else if (code === 20) {
                limits.model.max.y = floatVal;
              }
              break;
            case '$PLIMMIN':
              if (code === 10) {
                limits.paper.min.x = floatVal;
              } else if (code === 20) {
                limits.paper.min.y = floatVal;
              }
              break;
            case '$PLIMMAX':
              if (code === 10) {
                limits.paper.max.x = floatVal;
              } else if (code === 20) {
                limits.paper.max.y = floatVal;
              }
              break;
            case '$EXTMIN':
              if (code === 10) {
                extents.model.min.x = floatVal;
              } else if (code === 20) {
                extents.model.min.y = floatVal;
              } else if (code === 30) {
                extents.model.min.z = floatVal;
              }
              break;
            case '$EXTMAX':
              if (code === 10) {
                extents.model.max.x = floatVal;
              } else if (code === 20) {
                extents.model.max.y = floatVal;
              } else if (code === 30) {
                extents.model.max.z = floatVal;
              }
              break;
            case '$PEXTMIN':
              if (code === 10) {
                extents.paper.min.x = floatVal;
              } else if (code === 20) {
                extents.paper.min.y = floatVal;
              } else if (code === 30) {
                extents.paper.min.z = floatVal;
              }
              break;
            case '$PEXTMAX':
              if (code === 10) {
                extents.paper.max.x = floatVal;
              } else if (code === 20) {
                extents.paper.max.y = floatVal;
              } else if (code === 30) {
                extents.paper.max.z = floatVal;
              }
              break;
            case '$DWGCODEPAGE':
              if (trimmedValue) {
                metadata.codePage = trimmedValue;
              }
              break;
            case '$LASTSAVEDBY':
              if (trimmedValue) {
                metadata.lastSavedBy = trimmedValue;
              }
              break;
            case '$PROJECTNAME':
              if (trimmedValue) {
                metadata.projectName = trimmedValue;
              }
              break;
            case '$ACADVER':
              if (trimmedValue) {
                metadata.acadVersion = trimmedValue;
              }
              break;
            case '$TDCREATE': {
              const descriptor = convertJulianDay(rawValue);
              if (descriptor) {
                metadata.created = descriptor;
              }
              break;
            }
            case '$TDUPDATE': {
              const descriptor = convertJulianDay(rawValue);
              if (descriptor) {
                metadata.updated = descriptor;
              }
              break;
            }
            case '$TDINDWG': {
              const duration = convertDurationDays(rawValue);
              if (duration) {
                metadata.totalEditingTime = duration;
              }
              break;
            }
            case '$TDUSRTIMER': {
              const duration = convertDurationDays(rawValue);
              if (duration) {
                metadata.userTimer = duration;
              }
              break;
            }
            case '$TIMEZONE':
              if (intVal != null) {
                metadata.timezoneMinutes = intVal;
              }
              break;
            default:
              break;
          }

          i += 1;
          continue;
        }

        i += 1;
      }

      const geoHeaderSummary = {
        latitude: null,
        longitude: null,
        elevation: null,
        timeZone: null,
        coordinateSystem: null,
        units: null,
        description: null
      };

      const geoHeaderPlain = Object.create(null);
      Object.keys(geoHeaderVars).forEach((key) => {
        const entry = geoHeaderVars[key];
        geoHeaderPlain[key] = {
          values: entry.values.slice(),
          byCode: Object.assign({}, entry.byCode)
        };
        const numericValues = entry.values.filter((value) => typeof value === 'number' && Number.isFinite(value));
        const stringValues = entry.values.filter((value) => typeof value === 'string' && value);
        const firstNumeric = numericValues.length ? numericValues[0] : null;
        const firstString = stringValues.length ? stringValues[0] : null;
        const name = key.toUpperCase();
        if (firstNumeric != null) {
          if (!geoHeaderSummary.latitude && name.includes('LAT')) {
            geoHeaderSummary.latitude = firstNumeric;
          }
          if (!geoHeaderSummary.longitude && (name.includes('LON') || name.includes('LONG'))) {
            geoHeaderSummary.longitude = firstNumeric;
          }
          if (!geoHeaderSummary.elevation && name.includes('ELEV')) {
            geoHeaderSummary.elevation = firstNumeric;
          }
          if (!geoHeaderSummary.timeZone && name.includes('TIME')) {
            geoHeaderSummary.timeZone = firstNumeric;
          }
        }
        if (!geoHeaderSummary.coordinateSystem && firstString && (name.includes('GCS') || name.includes('COORD'))) {
          geoHeaderSummary.coordinateSystem = firstString;
        }
        if (!geoHeaderSummary.units && firstString && name.includes('UNIT')) {
          geoHeaderSummary.units = firstString;
        }
        if (!geoHeaderSummary.description && firstString && (name.includes('DESC') || name.includes('NOTES'))) {
          geoHeaderSummary.description = firstString;
        }
      });

      const geoSummary = {
        latitude: null,
        longitude: null,
        elevation: null,
        coordinateSystem: null,
        description: null,
        units: null,
        timeZone: null
      };

      if (geoObject) {
        geoSummary.latitude = geoObject.latitude != null ? geoObject.latitude : null;
        geoSummary.longitude = geoObject.longitude != null ? geoObject.longitude : null;
        geoSummary.elevation = geoObject.elevation != null ? geoObject.elevation : null;
        geoSummary.coordinateSystem = geoObject.coordinateSystem || null;
        geoSummary.description = geoObject.description || geoObject.horizontalDatum || geoObject.verticalDatum || null;
        geoSummary.units = geoObject.units || null;
        geoSummary.timeZone = geoObject.timeZone != null ? geoObject.timeZone : null;
      }

      const latitude = geoSummary.latitude != null ? geoSummary.latitude : geoHeaderSummary.latitude;
      const longitude = geoSummary.longitude != null ? geoSummary.longitude : geoHeaderSummary.longitude;
      const elevation = geoSummary.elevation != null ? geoSummary.elevation : geoHeaderSummary.elevation;
      const coordinateSystem = geoSummary.coordinateSystem || geoHeaderSummary.coordinateSystem || null;
      const description = geoSummary.description || geoHeaderSummary.description || null;
      const unitsLabel = geoSummary.units || geoHeaderSummary.units || null;
      const timeZone = geoSummary.timeZone != null ? geoSummary.timeZone : geoHeaderSummary.timeZone;

      const geographic = {
        hasGeoData: latitude != null || longitude != null || !!coordinateSystem || !!(geoObject && geoObject.designPoint),
        latitude,
        longitude,
        elevation,
        coordinateSystem,
        description,
        units: unitsLabel,
        timeZone,
        headerVariables: geoHeaderPlain,
        headerSummary: geoHeaderSummary,
        objectSummary: geoSummary,
        object: geoObject
      };

      return {
        units,
        limits,
        extents,
        metadata,
        geographic
      };
    }

    parseGeographicObject(type, tags) {
      if (!Array.isArray(tags)) {
        return null;
      }
      const result = {
        type,
        latitude: null,
        longitude: null,
        elevation: null,
        scale: null,
        rotation: null,
        timeZone: null,
        units: null,
        coordinateSystem: null,
        description: null,
        horizontalDatum: null,
        verticalDatum: null,
        designPoint: { x: null, y: null, z: null },
        referencePoint: { x: null, y: null, z: null },
        northDirection: { x: null, y: null, z: null },
        properties: Object.create(null),
        rawTags: []
      };

      tags.forEach((tag) => {
        const code = Number(tag.code);
        const rawValue = tag.value;
        const stringValue = typeof rawValue === 'string'
          ? rawValue
          : (rawValue != null ? String(rawValue) : '');
        result.rawTags.push({ code, value: rawValue });
        const trimmed = stringValue.trim();
        const numeric = toFloat(rawValue);

        switch (code) {
          case 1:
            if (trimmed) {
              result.coordinateSystem = trimmed;
            }
            break;
          case 2:
            if (trimmed) {
              result.description = trimmed;
            }
            break;
          case 3:
            if (trimmed) {
              result.horizontalDatum = trimmed;
            }
            break;
          case 4:
            if (trimmed) {
              result.verticalDatum = trimmed;
            }
            break;
          case 10:
            result.designPoint.x = numeric;
            break;
          case 20:
            result.designPoint.y = numeric;
            break;
          case 30:
            result.designPoint.z = numeric;
            break;
          case 11:
            result.referencePoint.x = numeric;
            break;
          case 21:
            result.referencePoint.y = numeric;
            break;
          case 31:
            result.referencePoint.z = numeric;
            break;
          case 210:
            result.northDirection.x = numeric;
            break;
          case 220:
            result.northDirection.y = numeric;
            break;
          case 230:
            result.northDirection.z = numeric;
            break;
          case 40:
            if (isLatitude(numeric)) {
              result.latitude = numeric;
            } else {
              result.scale = numeric;
            }
            break;
          case 41:
            if (isLongitude(numeric)) {
              result.longitude = numeric;
            } else if (result.latitude == null && isLatitude(numeric)) {
              result.latitude = numeric;
            } else if (numeric != null) {
              result.scale = numeric;
            }
            break;
          case 42:
            result.elevation = numeric;
            break;
          case 43:
            result.scale = numeric;
            break;
          case 44:
            result.rotation = numeric;
            break;
          case 45:
            result.timeZone = numeric;
            break;
          case 70:
          case 71:
          case 72:
          case 73:
          case 74:
          case 75:
          case 76:
          case 77:
          case 90:
          case 91:
          case 92:
          case 93:
          case 94:
          case 95:
          case 96:
          case 97:
          case 98:
          case 99:
            result.properties[code] = toInt(rawValue);
            break;
          case 280:
          case 281:
          case 282:
          case 283:
          case 284:
          case 285:
          case 286:
          case 287:
          case 288:
          case 289:
            result.properties[code] = !!toInt(rawValue);
            break;
          default:
            if (result.properties[code] == null) {
              if (Number.isFinite(numeric)) {
                result.properties[code] = numeric;
              } else if (trimmed) {
                result.properties[code] = trimmed;
              } else if (rawValue != null) {
                result.properties[code] = rawValue;
              }
            } else if (Array.isArray(result.properties[code])) {
              if (Number.isFinite(numeric)) {
                result.properties[code].push(numeric);
              } else if (trimmed) {
                result.properties[code].push(trimmed);
              }
            } else {
              const existing = result.properties[code];
              const list = [];
              if (existing != null) {
                list.push(existing);
              }
              if (Number.isFinite(numeric)) {
                list.push(numeric);
              } else if (trimmed) {
                list.push(trimmed);
              }
              result.properties[code] = list;
            }
            break;
        }
      });

      return result;
    }

    computeBlockMetadata(sceneGraph) {
      if (!sceneGraph || typeof sceneGraph !== 'object') {
        return { byName: {}, ordered: [], count: 0 };
      }

      const blocks = sceneGraph.blocks || {};
      const metadataMap = new Map();

      const ensureEntry = (name) => {
        if (!name) {
          return null;
        }
        if (!metadataMap.has(name)) {
          metadataMap.set(name, {
            name,
            handle: null,
            description: null,
            basePoint: { x: 0, y: 0, z: 0 },
            attributeDefinitions: [],
            attributeTags: new Set(),
            attributePreview: new Map(),
            instances: [],
            stats: {
              total: 0,
              model: 0,
              paper: 0,
              block: 0
            },
            layoutUsage: new Map(),
            ownerUsage: new Map(),
            parentBlocks: new Set(),
            instancesWithAttributes: 0
          });
        }
        return metadataMap.get(name);
      };

      const registerAttributeDefinition = (blockName, entity) => {
        const entry = ensureEntry(blockName);
        if (!entry || !entity || !entity.geometry) {
          return;
        }
        const geometry = entity.geometry;
        const tag = geometry.tag || null;
        if (!tag || entry.attributeTags.has(tag)) {
          return;
        }
        entry.attributeTags.add(tag);
        entry.attributeDefinitions.push({
          tag,
          prompt: geometry.prompt || '',
          defaultValue: geometry.defaultValue || '',
          textStyle: geometry.textStyle || null,
          position: geometry.position || null,
          alignmentPoint: geometry.alignmentPoint || null,
          height: geometry.height ?? null,
          widthFactor: geometry.widthFactor ?? null,
          rotation: geometry.rotation ?? 0,
          alignment: geometry.alignment || { horizontal: 0, vertical: 0 },
          fieldLength: geometry.fieldLength ?? null,
          visibility: geometry.visibility || 'visible',
          isInvisible: !!geometry.isInvisible,
          isConstant: !!geometry.isConstant,
          requiresVerification: !!geometry.requiresVerification,
          isPreset: !!geometry.isPreset,
          isMultipleLine: !!geometry.isMultipleLine,
          lockPosition: !!geometry.lockPosition,
          flags: geometry.flags ?? 0
        });
      };

      const registerAttributePreview = (blockName, entity) => {
        const entry = ensureEntry(blockName);
        if (!entry || !entity || !entity.geometry) {
          return;
        }
        const geometry = entity.geometry;
        const tag = geometry.tag || null;
        if (!tag) {
          return;
        }
        if (!entry.attributePreview.has(tag) && geometry.value != null) {
          entry.attributePreview.set(tag, {
            value: String(geometry.value),
            visibility: geometry.visibility || 'visible',
            isInvisible: !!geometry.isInvisible,
            isConstant: !!geometry.isConstant,
            isPreset: !!geometry.isPreset,
            requiresVerification: !!geometry.requiresVerification,
            flags: geometry.flags ?? 0
          });
        }
      };

      const registerInstance = (entity, context = {}) => {
        if (!entity || !entity.geometry || !entity.geometry.blockName) {
          return;
        }
        const blockName = entity.geometry.blockName;
        const entry = ensureEntry(blockName);
        if (!entry) {
          return;
        }

        const instanceSpace = context.space || entity.space || 'model';
        const layoutName = context.layout || entity.layout || null;
        const ownerBlock = context.ownerBlock || entity.blockName || null;

        const instance = {
          handle: entity.handle || entity.id || null,
          ownerHandle: entity.owner || null,
          space: instanceSpace,
          layout: instanceSpace === 'paper' ? layoutName : null,
          layer: entity.layer || null,
          ownerBlock,
          hasAttributes: !!(entity.geometry && entity.geometry.hasAttributes),
          rows: entity.geometry.rowCount || 1,
          columns: entity.geometry.columnCount || 1
        };
        entry.instances.push(instance);

        entry.stats.total += 1;
        if (instanceSpace === 'model') {
          entry.stats.model += 1;
        } else if (instanceSpace === 'paper') {
          entry.stats.paper += 1;
          if (layoutName) {
            entry.layoutUsage.set(layoutName, (entry.layoutUsage.get(layoutName) || 0) + 1);
          }
        } else if (instanceSpace === 'block') {
          entry.stats.block += 1;
          if (ownerBlock) {
            entry.parentBlocks.add(ownerBlock);
          }
        }

        if (ownerBlock) {
          entry.ownerUsage.set(ownerBlock, (entry.ownerUsage.get(ownerBlock) || 0) + 1);
        }

        if (instance.hasAttributes) {
          entry.instancesWithAttributes += 1;
        }
      };

      Object.keys(blocks).forEach((blockName) => {
        const block = blocks[blockName] || {};
        const entry = ensureEntry(blockName);
        if (!entry) {
          return;
        }
        if (block.header) {
          const header = block.header;
          entry.handle = header.handle || entry.handle;
          entry.description = header.description || entry.description;
          entry.basePoint = header.basePoint
            ? {
                x: header.basePoint.x ?? 0,
                y: header.basePoint.y ?? 0,
                z: header.basePoint.z ?? 0
              }
            : entry.basePoint;
        }
        if (Array.isArray(block.entities)) {
          block.entities.forEach((entity) => {
            if (!entity || !entity.type) {
              return;
            }
            const type = String(entity.type).toUpperCase();
            if (type === 'ATTDEF') {
              registerAttributeDefinition(blockName, entity);
              return;
            }
            if (type === 'ATTRIB') {
              registerAttributePreview(blockName, entity);
            }
          });
        }
      });

      const gatherInserts = (entities, context = {}) => {
        if (!Array.isArray(entities)) {
          return;
        }
        entities.forEach((entity) => {
          if (!entity || String(entity.type).toUpperCase() !== 'INSERT') {
            return;
          }
          registerInstance(entity, context);
        });
      };

      gatherInserts(sceneGraph.modelSpace, { space: 'model' });

      const paperSpaces = sceneGraph.paperSpaces || {};
      Object.keys(paperSpaces).forEach((layoutName) => {
        gatherInserts(paperSpaces[layoutName], { space: 'paper', layout: layoutName });
      });

      Object.keys(blocks).forEach((blockName) => {
        const block = blocks[blockName] || {};
        gatherInserts(block.entities, { space: 'block', ownerBlock: blockName });
      });

      const byName = {};
      const ordered = [];

      metadataMap.forEach((entry, blockName) => {
        const attributeDefinitions = entry.attributeDefinitions.slice();
        const attributeTags = Array.from(entry.attributeTags);
        const attributePreview = Array.from(entry.attributePreview.entries())
          .map(([tag, preview]) => {
            if (preview && typeof preview === 'object' && Object.prototype.hasOwnProperty.call(preview, 'value')) {
              return Object.assign({ tag }, preview);
            }
            return { tag, value: String(preview ?? ''), visibility: 'visible' };
          });
        const layoutUsage = Array.from(entry.layoutUsage.entries())
          .map(([layout, count]) => ({ layout, count }))
          .sort((a, b) => b.count - a.count || a.layout.localeCompare(b.layout));
        const ownerUsage = Array.from(entry.ownerUsage.entries())
          .map(([owner, count]) => ({ owner, count }))
          .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
        const parentBlocks = Array.from(entry.parentBlocks);

        const plainEntry = {
          name: blockName,
          handle: entry.handle,
          description: entry.description,
          basePoint: entry.basePoint,
          attributeDefinitions,
          attributeTags,
          attributePreview,
          attributeCount: attributeTags.length,
          instances: entry.instances,
          instanceCount: entry.instances.length,
          instancesWithAttributes: entry.instancesWithAttributes,
          stats: entry.stats,
          layoutUsage,
          ownerUsage,
          parentBlocks,
          hasParentBlocks: parentBlocks.length > 0,
          hasAttributes: attributeTags.length > 0 || entry.instancesWithAttributes > 0
        };

        byName[blockName] = plainEntry;
        ordered.push(plainEntry);
      });

      ordered.sort((a, b) => {
        if (b.instanceCount !== a.instanceCount) {
          return b.instanceCount - a.instanceCount;
        }
        return a.name.localeCompare(b.name);
      });

      return {
        byName,
        ordered,
        count: ordered.length
      };
    }

    computeTextStyleCatalog(tables = {}) {
      const styles = tables && tables.textStyles ? tables.textStyles : {};
      const catalog = {};
      Object.keys(styles).forEach((styleName) => {
        const style = styles[styleName] || {};
        const fontFile = style.fontFile ? String(style.fontFile).trim() : null;
        const bigFontFile = style.bigFontFile ? String(style.bigFontFile).trim() : null;
        const normalizedFont = fontFile ? fontFile.replace(/\\/g, '/').split('/').pop() : null;
        const normalizedBigFont = bigFontFile ? bigFontFile.replace(/\\/g, '/').split('/').pop() : null;
        const lowerFont = normalizedFont ? normalizedFont.toLowerCase() : null;
        const lowerBigFont = normalizedBigFont ? normalizedBigFont.toLowerCase() : null;
        const extension = lowerFont ? lowerFont.split('.').pop() : null;
        const bigExtension = lowerBigFont ? lowerBigFont.split('.').pop() : null;
        catalog[styleName] = {
          name: styleName,
          handle: style.handle || null,
          fontFile,
          fontFileName: normalizedFont,
          bigFontFile,
          bigFontFileName: normalizedBigFont,
          isShx: extension === 'shx',
          isBigShx: bigExtension === 'shx',
          isTrueType: extension === 'ttf' || extension === 'otf' || extension === 'ttc',
          flags: style.flags ?? 0,
          fixedHeight: style.fixedHeight ?? null,
          widthFactor: style.widthFactor ?? 1,
          obliqueAngle: style.obliqueAngle ?? 0
        };
      });
      return catalog;
    }

    nextEntityId(type) {
      const sanitizedType = type || 'ENTITY';
      const id = `${sanitizedType}_${this.entityCounter}`;
      this.entityCounter += 1;
      return id;
    }

    nextBlockName() {
      const name = `BLOCK_${this.blockCounter}`;
      this.blockCounter += 1;
      return name;
    }

    extractTables() {
      const layerMap = new Map();
      const linetypeMap = new Map();
      const textStyleMap = new Map();
      const visualStyleMap = new Map();
      const blockRecordMap = new Map();
      const multiLeaderStyleMap = new Map();
      const ucsMap = new Map();
      const vportMap = new Map();

      const collections = {
        LAYER: layerMap,
        LTYPE: linetypeMap,
        STYLE: textStyleMap,
        VISUALSTYLE: visualStyleMap,
        BLOCK_RECORD: blockRecordMap,
        MULTILEADERSTYLE: multiLeaderStyleMap,
        UCS: ucsMap,
        VPORT: vportMap
      };

      let section = null;
      let currentTable = null;
      let i = 0;

      while (i < this.tags.length) {
        const tag = this.tags[i];
        const code = Number(tag.code);
        const value = typeof tag.value === 'string' ? tag.value.trim() : tag.value;
        const upperValue = value ? String(value).toUpperCase() : '';

        if (code === 0) {
          if (upperValue === 'SECTION') {
            section = null;
            currentTable = null;
            i += 1;
            while (i < this.tags.length) {
              const lookahead = this.tags[i];
              if (Number(lookahead.code) === 2) {
                section = String(lookahead.value || '').trim().toUpperCase();
                i += 1;
                break;
              }
              if (Number(lookahead.code) === 0) {
                break;
              }
              i += 1;
            }
            continue;
          }

          if (upperValue === 'ENDSEC') {
            section = null;
            currentTable = null;
            i += 1;
            continue;
          }

          if (section === 'TABLES') {
            if (upperValue === 'TABLE') {
              currentTable = null;
              i += 1;
              while (i < this.tags.length) {
                const lookahead = this.tags[i];
                if (Number(lookahead.code) === 2) {
                  currentTable = String(lookahead.value || '').trim().toUpperCase();
                  i += 1;
                  break;
                }
                if (Number(lookahead.code) === 0) {
                  break;
                }
                i += 1;
              }
              continue;
            }

            if (upperValue === 'ENDTAB') {
              currentTable = null;
              i += 1;
              continue;
            }

            if (currentTable && collections[currentTable]) {
              const recordType = upperValue;
              const recordTags = [];
              i += 1;
              while (i < this.tags.length) {
                const lookahead = this.tags[i];
                if (Number(lookahead.code) === 0) {
                  break;
                }
                recordTags.push(lookahead);
                i += 1;
              }
              this.processTableRecord(collections, currentTable, recordType, recordTags);
              continue;
            }
          }
        }

        i += 1;
      }

      return {
        layers: utils.mapToPlainObject(layerMap),
        linetypes: utils.mapToPlainObject(linetypeMap),
        textStyles: utils.mapToPlainObject(textStyleMap),
        visualStyles: utils.mapToPlainObject(visualStyleMap),
        blockRecords: utils.mapToPlainObject(blockRecordMap),
        multiLeaderStyles: utils.mapToPlainObject(multiLeaderStyleMap),
        ucs: utils.mapToPlainObject(ucsMap),
        vports: utils.mapToPlainObject(vportMap)
      };
    }

    extractPlotInfrastructure() {
      const dictionaryMap = new Map();
      const placeholderMap = new Map();
      const layoutMap = new Map();
      const plotSettingsMap = new Map();

      let section = null;
      let currentHeaderVar = null;
      let pstyleMode = null;
      let i = 0;

      while (i < this.tags.length) {
        const tag = this.tags[i];
        const code = Number(tag.code);
        const rawValue = tag.value;
        const stringValue = typeof rawValue === 'string'
          ? rawValue
          : (rawValue != null ? String(rawValue) : '');
        const trimmedValue = stringValue ? stringValue.trim() : '';
        const upperValue = trimmedValue.toUpperCase();

        if (code === 0) {
          if (upperValue === 'SECTION') {
            section = null;
            currentHeaderVar = null;
            i += 1;
            while (i < this.tags.length) {
              const lookahead = this.tags[i];
              if (Number(lookahead.code) === 2) {
                section = String(lookahead.value || '').trim().toUpperCase();
                i += 1;
                break;
              }
              if (Number(lookahead.code) === 0) {
                break;
              }
              i += 1;
            }
            continue;
          }

          if (upperValue === 'ENDSEC') {
            section = null;
            currentHeaderVar = null;
            i += 1;
            continue;
          }

          if (section === 'OBJECTS') {
            if (upperValue === 'DICTIONARY' || upperValue === 'ACDBDICTIONARYWDFLT') {
              const { tags: dictTags, nextIndex } = this.collectEntityTags(i + 1);
              const dictionary = parseDictionaryObject(dictTags);
              dictionary.type = upperValue;
              if (dictionary.handleUpper) {
                dictionaryMap.set(dictionary.handleUpper, dictionary);
              } else if (dictionary.handle) {
                dictionaryMap.set(dictionary.handle, dictionary);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'ACDBPLACEHOLDER') {
              const { tags: placeholderTags, nextIndex } = this.collectEntityTags(i + 1);
              const placeholder = parsePlaceholderObject(placeholderTags);
              if (placeholder.handleUpper) {
                placeholderMap.set(placeholder.handleUpper, placeholder);
              } else if (placeholder.handle) {
                placeholderMap.set(placeholder.handle, placeholder);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'PLOTSETTINGS') {
              const { tags: plotSettingsTags, nextIndex } = this.collectEntityTags(i + 1);
              const plotSettings = parsePlotSettingsObject(plotSettingsTags);
              if (plotSettings && plotSettings.handleUpper) {
                plotSettingsMap.set(plotSettings.handleUpper, plotSettings);
              } else if (plotSettings && plotSettings.handle) {
                plotSettingsMap.set(plotSettings.handle, plotSettings);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'LAYOUT') {
              const { tags: layoutTags, nextIndex } = this.collectEntityTags(i + 1);
              const layout = parseLayoutObject(layoutTags);
              if (layout && layout.handleUpper) {
                layoutMap.set(layout.handleUpper, layout);
              } else if (layout && layout.handle) {
                layoutMap.set(layout.handle, layout);
              }
              i = nextIndex;
              continue;
            }
          }

          i += 1;
          continue;
        }

        if (section === 'HEADER') {
          if (code === 9) {
            currentHeaderVar = trimmedValue ? trimmedValue.toUpperCase() : null;
          } else if (currentHeaderVar === '$PSTYLEMODE') {
            const mode = toInt(rawValue);
            if (Number.isFinite(mode)) {
              pstyleMode = mode;
            }
          }
        }

        i += 1;
      }

      let namedDictHandle = null;
      let colorDictHandle = null;
      dictionaryMap.forEach((dict) => {
        dict.entries.forEach((entry) => {
          if (!namedDictHandle && entry.nameUpper === 'ACAD_PLOTSTYLENAME') {
            namedDictHandle = entry.handle || entry.handleUpper || null;
          }
          if (!colorDictHandle && entry.nameUpper === 'ACAD_COLOR_DEPENDENT_PLOT_STYLES') {
            colorDictHandle = entry.handle || entry.handleUpper || null;
          }
        });
      });

      const namedCatalog = buildPlotStyleCatalog(namedDictHandle, dictionaryMap, placeholderMap, 'named');
      const colorCatalog = buildPlotStyleCatalog(colorDictHandle, dictionaryMap, placeholderMap, 'colorDependent');

      const handleLookup = Object.create(null);
      [namedCatalog, colorCatalog].forEach((catalog) => {
        catalog.ordered.forEach((entry) => {
          if (entry.handleUpper) {
            handleLookup[entry.handleUpper] = entry;
          }
        });
      });

      const plotStyles = {
        mode: pstyleMode,
        modeLabel: (pstyleMode === 1 ? 'colorDependent' : (pstyleMode === 0 ? 'named' : 'unspecified')),
        dictionaries: {
          named: namedCatalog.dictionaryHandle,
          colorDependent: colorCatalog.dictionaryHandle
        },
        named: namedCatalog,
        colorDependent: colorCatalog,
        handleLookup
      };

      const layoutsOrdered = Array.from(layoutMap.values())
        .sort((a, b) => {
          const aOrder = Number.isFinite(a.tabOrder) ? a.tabOrder : Number.MAX_SAFE_INTEGER;
          const bOrder = Number.isFinite(b.tabOrder) ? b.tabOrder : Number.MAX_SAFE_INTEGER;
          return aOrder - bOrder;
        });

      const layoutsByHandle = Object.create(null);
      const layoutsByName = Object.create(null);
      layoutsOrdered.forEach((layout) => {
        if (layout.handleUpper) {
          layoutsByHandle[layout.handleUpper] = layout;
        }
        if (layout.nameUpper) {
          layoutsByName[layout.nameUpper] = layout;
        }
      });

      const plotConfigurationsByHandle = Object.create(null);
      const plotConfigurationsByName = Object.create(null);

      layoutsOrdered.forEach((layout) => {
        const ps = layout.plotSettings || { strings: {}, numbers: {}, bools: {} };
        const numbers = ps.numbers || {};
        const strings = ps.strings || {};
        const flags = Number.isFinite(numbers.plotLayoutFlags) ? numbers.plotLayoutFlags : null;
        const config = {
          layoutHandle: layout.handle,
          layoutHandleUpper: layout.handleUpper,
          layoutName: layout.name,
          layoutNameUpper: layout.nameUpper,
          plotStyleMode: pstyleMode,
          plotStyleType: plotStyles.modeLabel,
          pageSetupName: strings.pageSetupName || '',
          plotConfigurationFile: strings.plotConfigurationFile || '',
          paperSize: strings.paperSize || '',
          plotViewName: strings.plotViewName || '',
          plotStyleTable: strings.currentStyleSheet || '',
          margins: {
            left: numbers.leftMargin ?? null,
            bottom: numbers.bottomMargin ?? null,
            right: numbers.rightMargin ?? null,
            top: numbers.topMargin ?? null
          },
          paper: {
            width: numbers.paperWidth ?? null,
            height: numbers.paperHeight ?? null
          },
          plotOrigin: {
            x: numbers.plotOriginXOffset ?? null,
            y: numbers.plotOriginYOffset ?? null
          },
          plotWindow: {
            lowerLeft: {
              x: numbers.plotWindowX1 ?? null,
              y: numbers.plotWindowY1 ?? null
            },
            upperRight: {
              x: numbers.plotWindowX2 ?? null,
              y: numbers.plotWindowY2 ?? null
            }
          },
          scale: {
            numerator: numbers.scaleNumerator ?? null,
            denominator: numbers.scaleDenominator ?? null,
            standardScaleType: numbers.standardScaleType ?? null,
            unitFactor: numbers.unitFactor ?? null
          },
          plotPaperUnits: numbers.plotPaperUnits ?? null,
          plotRotation: numbers.plotRotation ?? null,
          plotType: numbers.plotType ?? null,
          shadePlot: {
            mode: numbers.shadePlotMode ?? null,
            resolutionLevel: numbers.shadePlotResolutionLevel ?? null,
            customDpi: numbers.shadePlotCustomDpi ?? null
          },
          flags,
          flagDetails: flags != null ? {
            plotViewportBorders: (flags & 1) === 1,
            showPlotStyles: (flags & 2) === 2,
            plotCentered: (flags & 4) === 4,
            plotHidden: (flags & 8) === 8,
            useStandardScale: (flags & 16) === 16,
            usePlotStyles: (flags & 32) === 32,
            scaleLineweights: (flags & 64) === 64,
            printLineweights: (flags & 128) === 128,
            drawViewportsFirst: (flags & 512) === 512,
            modelType: (flags & 1024) === 1024,
            updatePaper: (flags & 2048) === 2048,
            zoomToPaperOnUpdate: (flags & 4096) === 4096,
            initializing: (flags & 8192) === 8192,
            prevPlotInit: (flags & 16384) === 16384
          } : null
        };

        if (layout.handleUpper) {
          plotConfigurationsByHandle[layout.handleUpper] = config;
        }
        if (layout.nameUpper) {
          plotConfigurationsByName[layout.nameUpper] = config;
        }
      });

      const plotSettingsPlain = Object.create(null);
      plotSettingsMap.forEach((value, key) => {
        plotSettingsPlain[key] = value;
      });

      return {
        plotStyleMode: pstyleMode,
        plotStyles,
        layouts: {
          byHandle: layoutsByHandle,
          byName: layoutsByName,
          ordered: layoutsOrdered
        },
        plotConfigurations: {
          byHandle: plotConfigurationsByHandle,
          byName: plotConfigurationsByName
        },
        plotSettings: plotSettingsPlain
      };
    }

    extractBackgrounds() {
      const byHandle = Object.create(null);
      const list = [];

      let section = null;
      let i = 0;

      while (i < this.tags.length) {
        const tag = this.tags[i];
        const code = Number(tag.code);
        const value = typeof tag.value === 'string' ? tag.value.trim() : tag.value;
        const upperValue = value ? String(value).toUpperCase() : '';

        if (code === 0) {
          if (upperValue === 'SECTION') {
            section = null;
            i += 1;
            while (i < this.tags.length) {
              const lookahead = this.tags[i];
              if (Number(lookahead.code) === 2) {
                section = String(lookahead.value || '').trim().toUpperCase();
                i += 1;
                break;
              }
              if (Number(lookahead.code) === 0) {
                break;
              }
              i += 1;
            }
            continue;
          }

          if (upperValue === 'ENDSEC') {
            section = null;
            i += 1;
            continue;
          }

          if (section === 'OBJECTS' && upperValue === 'BACKGROUND') {
            const { tags: backgroundTags, nextIndex } = this.collectEntityTags(i + 1);
            const background = this.parseBackgroundObject(backgroundTags);
            if (background) {
              if (background.handleUpper) {
                byHandle[background.handleUpper] = background;
              }
              if (background.handle && !byHandle[background.handle]) {
                byHandle[background.handle] = background;
              }
              list.push(background);
            }
            i = nextIndex;
            continue;
          }
        }

        i += 1;
      }

      return {
        byHandle,
        list
      };
    }

    extractSuns() {
      const byHandle = Object.create(null);
      const list = [];

      let section = null;
      let i = 0;

      while (i < this.tags.length) {
        const tag = this.tags[i];
        const code = Number(tag.code);
        const value = typeof tag.value === 'string' ? tag.value.trim() : tag.value;
        const upperValue = value ? String(value).toUpperCase() : '';

        if (code === 0) {
          if (upperValue === 'SECTION') {
            section = null;
            i += 1;
            while (i < this.tags.length) {
              const lookahead = this.tags[i];
              if (Number(lookahead.code) === 2) {
                section = String(lookahead.value || '').trim().toUpperCase();
                i += 1;
                break;
              }
              if (Number(lookahead.code) === 0) {
                break;
              }
              i += 1;
            }
            continue;
          }

          if (upperValue === 'ENDSEC') {
            section = null;
            i += 1;
            continue;
          }

          if (section === 'OBJECTS' && upperValue === 'SUN') {
            const { tags: sunTags, nextIndex } = this.collectEntityTags(i + 1);
            const sun = this.parseSunObject(sunTags);
            if (sun) {
              if (sun.handleUpper) {
                byHandle[sun.handleUpper] = sun;
              }
              if (sun.handle && !byHandle[sun.handle]) {
                byHandle[sun.handle] = sun;
              }
              list.push(sun);
            }
            i = nextIndex;
            continue;
          }
        }

        i += 1;
      }

      return {
        byHandle,
        list
      };
    }

    extractMaterials() {
      const byHandle = Object.create(null);
      const byName = Object.create(null);
      const list = [];

      let section = null;
      let i = 0;

      while (i < this.tags.length) {
        const tag = this.tags[i];
        const code = Number(tag.code);
        const value = typeof tag.value === 'string' ? tag.value.trim() : tag.value;
        const upperValue = value ? String(value).toUpperCase() : '';

        if (code === 0) {
          if (upperValue === 'SECTION') {
            section = null;
            i += 1;
            while (i < this.tags.length) {
              const lookahead = this.tags[i];
              if (Number(lookahead.code) === 2) {
                section = String(lookahead.value || '').trim().toUpperCase();
                i += 1;
                break;
              }
              if (Number(lookahead.code) === 0) {
                break;
              }
              i += 1;
            }
            continue;
          }

          if (upperValue === 'ENDSEC') {
            section = null;
            i += 1;
            continue;
          }

          if (section === 'OBJECTS' && upperValue === 'MATERIAL') {
            const { tags: materialTags, nextIndex } = this.collectEntityTags(i + 1);
            const material = this.parseMaterial(materialTags);
            if (material) {
              if (material.handle) {
                byHandle[material.handle] = material;
              }
              if (material.name) {
                byName[material.name] = material;
              }
              list.push(material);
            }
            i = nextIndex;
            continue;
          }
        }

        i += 1;
      }

      return {
        byHandle,
        byName,
        list
      };
    }

    extractColorBooks() {
      const books = Object.create(null);
      const byKey = Object.create(null);
      const byHandle = Object.create(null);

      const ensureBook = (name) => {
        if (!name) {
          return null;
        }
        const normalized = String(name).trim();
        if (!normalized) {
          return null;
        }
        const key = normalized.toUpperCase();
        if (!books[key]) {
          books[key] = {
            name: normalized,
            colors: Object.create(null)
          };
        }
        return { entry: books[key], key };
      };

      const registerColor = (colorEntry) => {
        if (!colorEntry || !colorEntry.bookName || !colorEntry.colorName) {
          return;
        }
        const bookInfo = ensureBook(colorEntry.bookName);
        if (!bookInfo) {
          return;
        }
        const colorKey = colorEntry.colorName.trim().toUpperCase();
        const descriptor = {
          name: colorEntry.colorName.trim(),
          trueColor: colorEntry.trueColor,
          aci: colorEntry.aci,
          description: colorEntry.description || null,
          handle: colorEntry.handle || null,
          bookName: colorEntry.bookName.trim()
        };
        bookInfo.entry.colors[colorKey] = descriptor;
        const globalKey = `${bookInfo.key}::${colorKey}`;
        byKey[globalKey] = descriptor;
        if (descriptor.handle) {
          const handleKey = descriptor.handle.trim().toUpperCase();
          byHandle[handleKey] = descriptor;
        }
      };

      let section = null;
      let i = 0;

      while (i < this.tags.length) {
        const tag = this.tags[i];
        const code = Number(tag.code);
        const value = typeof tag.value === 'string' ? tag.value.trim() : tag.value;
        const upperValue = value ? String(value).toUpperCase() : '';

        if (code === 0) {
          if (upperValue === 'SECTION') {
            section = null;
            i += 1;
            while (i < this.tags.length) {
              const lookahead = this.tags[i];
              if (Number(lookahead.code) === 2) {
                section = String(lookahead.value || '').trim().toUpperCase();
                i += 1;
                break;
              }
              if (Number(lookahead.code) === 0) {
                break;
              }
              i += 1;
            }
            continue;
          }

          if (upperValue === 'ENDSEC') {
            section = null;
            i += 1;
            continue;
          }

          if (section === 'OBJECTS' && upperValue === 'ACDBCOLOR') {
            const { tags: colorTags, nextIndex } = this.collectEntityTags(i + 1);
            const colorEntry = this.parseColorBookEntry(colorTags, value);
            if (colorEntry) {
              registerColor(colorEntry);
            }
            i = nextIndex;
            continue;
          }
        }

        i += 1;
      }

      return {
        books,
        byKey,
        byHandle
      };
    }

    parseColorBookEntry(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const bookName = utils.getFirstCodeValue(tags, 430) || utils.getFirstCodeValue(tags, 3) || null;
      const colorName = utils.getFirstCodeValue(tags, 431) || utils.getFirstCodeValue(tags, 2) || null;
      if (!bookName || !colorName) {
        return null;
      }
      const trueColorRaw = utils.getFirstCodeValue(tags, 420) || null;
      const trueColor = trueColorRaw ? utils.parseTrueColor(trueColorRaw) : null;
      const aci = utils.toInt(utils.getFirstCodeValue(tags, 62));
      const description = utils.getFirstCodeValue(tags, 4) || utils.getFirstCodeValue(tags, 1) || null;
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      return {
        bookName,
        colorName,
        trueColor,
        aci,
        description,
        handle
      };
    }

    processTableRecord(collections, tableName, recordType, recordTags) {
      const upperTable = tableName.toUpperCase();
      const name = (utils.getFirstCodeValue(recordTags, 2) ||
        utils.getFirstCodeValue(recordTags, 3) || '').trim();

      if (!name) {
        return;
      }

      if (upperTable === 'LAYER' && recordType === 'LAYER') {
        const transparencyRaw = utils.getFirstCodeValue(recordTags, 440);
        const colorBookName = utils.getFirstCodeValue(recordTags, 430) || null;
        const colorBookColorName = utils.getFirstCodeValue(recordTags, 431) || null;
        const colorBookHandle = utils.getFirstCodeValue(recordTags, 437) || null;
        collections[upperTable].set(name, {
          name,
          flags: utils.toInt(utils.getFirstCodeValue(recordTags, 70)) || 0,
          colorNumber: utils.toInt(utils.getFirstCodeValue(recordTags, 62)),
          trueColor: (() => {
            const raw = utils.getFirstCodeValue(recordTags, 420);
            return raw ? utils.parseTrueColor(raw) : null;
          })(),
          linetype: (utils.getFirstCodeValue(recordTags, 6) || '').trim() || null,
          plotStyle: utils.getFirstCodeValue(recordTags, 390) || null,
          lineweight: utils.toInt(utils.getFirstCodeValue(recordTags, 370)),
          material: utils.getFirstCodeValue(recordTags, 347) || null,
          colorBook: colorBookName ? {
            book: colorBookName,
            colorName: colorBookColorName || null,
            handle: colorBookHandle || null
          } : null,
          transparency: transparencyRaw ? utils.parseTransparency(transparencyRaw) : null
        });
        return;
      }

      if (upperTable === 'LTYPE' && recordType === 'LTYPE') {
        const description = utils.getFirstCodeValue(recordTags, 3) || null;
        const patternLength = utils.toFloat(utils.getFirstCodeValue(recordTags, 40));
        const elementCount = utils.toInt(utils.getFirstCodeValue(recordTags, 73)) || 0;
        const elements = [];
        let currentElement = null;

        const pushElement = (length) => {
          const value = utils.toFloat(length);
          currentElement = {
            length: Number.isFinite(value) ? value : 0,
            rawLength: Number.isFinite(value) ? value : 0,
            shapeType: 0,
            kind: value === 0 ? 'dot' : (value > 0 ? 'line' : 'gap'),
            shapeNumber: null,
            styleHandle: null,
            text: null,
            shapeName: null,
            rotation: 0,
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            alignment: 0
          };
          elements.push(currentElement);
        };

        for (let idx = 0; idx < recordTags.length; idx++) {
          const tag = recordTags[idx];
          const code = Number(tag.code);
          const rawValue = tag.value;
          switch (code) {
            case 49:
              pushElement(rawValue);
              break;
            case 74:
              if (currentElement) {
                const typeCode = utils.toInt(rawValue) || 0;
                currentElement.shapeType = typeCode;
                if (typeCode === 1) {
                  currentElement.kind = 'shape';
                } else if (typeCode === 2) {
                  currentElement.kind = 'text';
                }
              }
              break;
            case 75:
              if (currentElement) {
                currentElement.shapeNumber = utils.toInt(rawValue);
              }
              break;
            case 340:
              if (currentElement) {
                currentElement.styleHandle = rawValue ? String(rawValue).trim() : null;
              }
              break;
            case 46:
              if (currentElement) {
                const scaleVal = utils.toFloat(rawValue);
                currentElement.scale = Number.isFinite(scaleVal) && scaleVal !== 0 ? scaleVal : 1;
              }
              break;
            case 50:
              if (currentElement) {
                currentElement.rotation = utils.toFloat(rawValue) || 0;
              }
              break;
            case 44:
              if (currentElement) {
                currentElement.offsetX = utils.toFloat(rawValue) || 0;
              }
              break;
            case 45:
              if (currentElement) {
                currentElement.offsetY = utils.toFloat(rawValue) || 0;
              }
              break;
            case 9:
              if (currentElement) {
                currentElement.text = String(rawValue || '');
                currentElement.kind = 'text';
              }
              break;
            case 6:
              if (currentElement) {
                currentElement.shapeName = String(rawValue || '');
                currentElement.kind = currentElement.kind === 'text' ? 'text' : 'shape';
              }
              break;
            case 79:
              if (currentElement) {
                currentElement.alignment = utils.toInt(rawValue) || 0;
              }
              break;
            default:
              break;
          }
        }

        collections[upperTable].set(name, {
          name,
          description,
          patternLength,
          elementCount,
          elements
        });
        return;
      }

      if (upperTable === 'STYLE' && recordType === 'STYLE') {
        collections[upperTable].set(name, {
          name,
          handle: utils.getFirstCodeValue(recordTags, 5) || null,
          flags: utils.toInt(utils.getFirstCodeValue(recordTags, 70)) || 0,
          fontFile: utils.getFirstCodeValue(recordTags, 3) || null,
          bigFontFile: utils.getFirstCodeValue(recordTags, 4) || null,
          fixedHeight: utils.toFloat(utils.getFirstCodeValue(recordTags, 40)),
          widthFactor: utils.toFloat(utils.getFirstCodeValue(recordTags, 41)),
          obliqueAngle: utils.toFloat(utils.getFirstCodeValue(recordTags, 50))
        });
        return;
      }

      if (upperTable === 'BLOCK_RECORD' && recordType === 'BLOCK_RECORD') {
        collections[upperTable].set(name, {
          name,
          handle: utils.getFirstCodeValue(recordTags, 5) || null,
          layoutHandle: utils.getFirstCodeValue(recordTags, 340) || null,
          designCenterPath: utils.getFirstCodeValue(recordTags, 402) || null,
          flags: utils.toInt(utils.getFirstCodeValue(recordTags, 70)) || 0
        });
        return;
      }

      if (upperTable === 'VISUALSTYLE' && recordType === 'VISUALSTYLE') {
        const entry = this.parseVisualStyleRecord(recordTags, name);
        if (entry && entry.name) {
          collections[upperTable].set(entry.name, entry);
        }
        return;
      }

      if (upperTable === 'MULTILEADERSTYLE' && recordType === 'MULTILEADERSTYLE') {
        collections[upperTable].set(name, {
          name,
          handle: utils.getFirstCodeValue(recordTags, 5) || null,
          textStyleHandle: utils.getFirstCodeValue(recordTags, 340) || null,
          leaderLineTypeHandle: utils.getFirstCodeValue(recordTags, 341) || null,
          contentBlockHandle: utils.getFirstCodeValue(recordTags, 342) || null,
          arrowSymbolHandle: utils.getFirstCodeValue(recordTags, 343) || null,
          doglegLength: utils.toFloat(utils.getFirstCodeValue(recordTags, 174)),
          landingGap: utils.toFloat(utils.getFirstCodeValue(recordTags, 176)),
          textHeight: utils.toFloat(utils.getFirstCodeValue(recordTags, 178)),
          arrowSize: utils.toFloat(utils.getFirstCodeValue(recordTags, 41)),
          scale: utils.toFloat(utils.getFirstCodeValue(recordTags, 40)),
          maxLeaderSegments: utils.toInt(utils.getFirstCodeValue(recordTags, 171)),
          rawTags: recordTags.map((tag) => ({
            code: Number(tag.code),
            value: tag.value
          }))
        });
        return;
      }

      if (upperTable === 'UCS' && recordType === 'UCS') {
        const origin = {
          x: utils.toFloat(utils.getFirstCodeValue(recordTags, 10)) ?? 0,
          y: utils.toFloat(utils.getFirstCodeValue(recordTags, 20)) ?? 0,
          z: utils.toFloat(utils.getFirstCodeValue(recordTags, 30)) ?? 0
        };
        const xAxis = {
          x: utils.toFloat(utils.getFirstCodeValue(recordTags, 11)) ?? 1,
          y: utils.toFloat(utils.getFirstCodeValue(recordTags, 21)) ?? 0,
          z: utils.toFloat(utils.getFirstCodeValue(recordTags, 31)) ?? 0
        };
        const yAxis = {
          x: utils.toFloat(utils.getFirstCodeValue(recordTags, 12)) ?? 0,
          y: utils.toFloat(utils.getFirstCodeValue(recordTags, 22)) ?? 1,
          z: utils.toFloat(utils.getFirstCodeValue(recordTags, 32)) ?? 0
        };
        collections[upperTable].set(name, {
          name,
          handle: utils.getFirstCodeValue(recordTags, 5) || null,
          flags: utils.toInt(utils.getFirstCodeValue(recordTags, 70)) || 0,
          origin,
          xAxis,
          yAxis,
          elevation: utils.toFloat(utils.getFirstCodeValue(recordTags, 146)),
          orthographicType: utils.toInt(utils.getFirstCodeValue(recordTags, 79)) || 0,
          baseUcsHandle: utils.getFirstCodeValue(recordTags, 331) || null,
          baseUcsName: utils.getFirstCodeValue(recordTags, 3) || null,
          rawTags: recordTags.map((tag) => ({
            code: Number(tag.code),
            value: tag.value
          }))
        });
        return;
      }

      if (upperTable === 'VPORT' && recordType === 'VPORT') {
        const toPoint2D = (xCode, yCode) => ({
          x: utils.toFloat(utils.getFirstCodeValue(recordTags, xCode)) ?? 0,
          y: utils.toFloat(utils.getFirstCodeValue(recordTags, yCode)) ?? 0
        });
        const toPoint3D = (xCode, yCode, zCode) => ({
          x: utils.toFloat(utils.getFirstCodeValue(recordTags, xCode)) ?? 0,
          y: utils.toFloat(utils.getFirstCodeValue(recordTags, yCode)) ?? 0,
          z: utils.toFloat(utils.getFirstCodeValue(recordTags, zCode)) ?? 0
        });
        const entry = {
          name,
          handle: utils.getFirstCodeValue(recordTags, 5) || null,
          flags: utils.toInt(utils.getFirstCodeValue(recordTags, 70)) || 0,
          lowerLeft: toPoint2D(10, 20),
          upperRight: toPoint2D(11, 21),
          viewCenter: toPoint2D(12, 22),
          snapBase: toPoint2D(13, 23),
          snapSpacing: toPoint2D(14, 24),
          gridSpacing: toPoint2D(15, 25),
          viewTarget: toPoint3D(17, 27, 37),
          viewDirection: toPoint3D(16, 26, 36),
          viewHeight: utils.toFloat(utils.getFirstCodeValue(recordTags, 40)),
          aspectRatio: utils.toFloat(utils.getFirstCodeValue(recordTags, 41)),
          lensLength: utils.toFloat(utils.getFirstCodeValue(recordTags, 42)),
          frontClip: utils.toFloat(utils.getFirstCodeValue(recordTags, 43)),
          backClip: utils.toFloat(utils.getFirstCodeValue(recordTags, 44)),
          snapRotation: utils.toFloat(utils.getFirstCodeValue(recordTags, 50)) || 0,
          viewTwist: utils.toFloat(utils.getFirstCodeValue(recordTags, 51)) || 0,
          circleZoomPercent: utils.toFloat(utils.getFirstCodeValue(recordTags, 49)),
          ucsPerViewport: (utils.toInt(utils.getFirstCodeValue(recordTags, 71)) || 0) === 1,
          fastZoom: (utils.toInt(utils.getFirstCodeValue(recordTags, 73)) || 0) === 1,
          ucsIcon: utils.toInt(utils.getFirstCodeValue(recordTags, 74)) || 0,
          snapOn: (utils.toInt(utils.getFirstCodeValue(recordTags, 75)) || 0) === 1,
          gridOn: (utils.toInt(utils.getFirstCodeValue(recordTags, 76)) || 0) === 1,
          snapStyle: utils.toInt(utils.getFirstCodeValue(recordTags, 77)) || 0,
          snapIsometricPlane: utils.toInt(utils.getFirstCodeValue(recordTags, 78)) || 0,
          ucsOrthographicType: utils.toInt(utils.getFirstCodeValue(recordTags, 79)) || 0,
          ucsOrigin: toPoint3D(110, 120, 130),
          ucsXAxis: toPoint3D(111, 121, 131),
          ucsYAxis: toPoint3D(112, 122, 132),
          ucsHandle: utils.getFirstCodeValue(recordTags, 345) || null,
          baseUcsHandle: utils.getFirstCodeValue(recordTags, 346) || null,
          ucsName: utils.getFirstCodeValue(recordTags, 1) || null,
          visualStyleHandle: utils.getFirstCodeValue(recordTags, 348) || null,
          sunHandle: utils.getFirstCodeValue(recordTags, 361) || null,
          backgroundHandle: utils.getFirstCodeValue(recordTags, 332) || null,
          shadePlotHandle: utils.getFirstCodeValue(recordTags, 364) || null,
          defaultLightingOn: (utils.toInt(utils.getFirstCodeValue(recordTags, 292)) || 0) === 1,
          defaultLightingType: utils.toInt(utils.getFirstCodeValue(recordTags, 282)),
          brightness: utils.toFloat(utils.getFirstCodeValue(recordTags, 141)),
          contrast: utils.toFloat(utils.getFirstCodeValue(recordTags, 142)),
          ambientColorNumber: utils.toInt(utils.getFirstCodeValue(recordTags, 63)),
          ambientTrueColor: (() => {
            const raw = utils.getFirstCodeValue(recordTags, 421);
            return raw ? utils.parseTrueColor(raw) : null;
          })(),
          ambientColorName: utils.getFirstCodeValue(recordTags, 431) || null,
          rawTags: recordTags.map((tag) => ({
            code: Number(tag.code),
            value: tag.value
          }))
        };
        collections[upperTable].set(name, entry);
        return;
      }
    }

    parseBackgroundObject(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }

      const background = {
        handle: null,
        handleUpper: null,
        owner: null,
        ownerUpper: null,
        type: 'unknown',
        version: null,
        solid: null,
        gradient: null,
        image: null,
        sky: null,
        ground: null,
        rawTags: []
      };

      let currentSubclass = null;
      let currentGradientStop = null;

      const ensureSolid = () => {
        if (!background.solid) {
          background.solid = {
            color: null,
            version: null,
            flags: Object.create(null)
          };
        }
        return background.solid;
      };

      const ensureGradient = () => {
        if (!background.gradient) {
          background.gradient = {
            colors: [],
            version: null,
            properties: Object.create(null)
          };
        }
        return background.gradient;
      };

      const ensureImage = () => {
        if (!background.image) {
          background.image = {
            properties: Object.create(null)
          };
        }
        return background.image;
      };

      const ensureSky = () => {
        if (!background.sky) {
          background.sky = {
            properties: Object.create(null)
          };
        }
        return background.sky;
      };

      const ensureGround = () => {
        if (!background.ground) {
          background.ground = {
            properties: Object.create(null)
          };
        }
        return background.ground;
      };

      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        const code = Number(tag.code);
        const rawValue = tag.value;
        background.rawTags.push({ code, value: rawValue });
        switch (code) {
          case 5: {
            const handle = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue || '');
            background.handle = handle || null;
            background.handleUpper = normalizeHandle(handle);
            break;
          }
          case 330: {
            const owner = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue || '');
            background.owner = owner || null;
            background.ownerUpper = normalizeHandle(owner);
            break;
          }
          case 100: {
            const marker = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue || '');
            const upper = marker.toUpperCase();
            if (upper === 'ACDBBACKGROUND') {
              currentSubclass = 'base';
            } else if (upper === 'ACDBSOLIDBACKGROUND') {
              currentSubclass = 'solid';
              background.type = 'solid';
              ensureSolid();
            } else if (upper === 'ACDBGRADIENTBACKGROUND') {
              currentSubclass = 'gradient';
              background.type = 'gradient';
              ensureGradient();
              currentGradientStop = null;
            } else if (upper === 'ACDBIMAGEBACKGROUND') {
              currentSubclass = 'image';
              if (background.type === 'unknown') {
                background.type = 'image';
              }
              ensureImage();
            } else if (upper === 'ACDBSKYBACKGROUND') {
              currentSubclass = 'sky';
              if (background.type === 'unknown') {
                background.type = 'sky';
              }
              ensureSky();
            } else if (upper === 'ACDBGROUNDPLANEBACKGROUND') {
              currentSubclass = 'ground';
              if (background.type === 'unknown') {
                background.type = 'ground';
              }
              ensureGround();
            } else {
              currentSubclass = upper || null;
            }
            break;
          }
          case 90: {
            if (currentSubclass === 'solid') {
              ensureSolid().version = toInt(rawValue);
            } else if (currentSubclass === 'gradient') {
              ensureGradient().version = toInt(rawValue);
            } else if (!currentSubclass || currentSubclass === 'base') {
              background.version = toInt(rawValue);
            }
            break;
          }
          default: {
            if (currentSubclass === 'solid') {
              const solid = ensureSolid();
              if ([62, 63, 420, 421, 430, 431, 440].includes(code)) {
                solid.color = updateColorDescriptor(solid.color, code, rawValue, utils);
              } else if (code >= 290 && code < 300) {
                solid.flags[`f${code}`] = boolFromValue(rawValue);
              } else if (code >= 40 && code < 90) {
                solid.flags[`f${code}`] = toFloat(rawValue);
              }
            } else if (currentSubclass === 'gradient') {
              const gradient = ensureGradient();
              if ([62, 63, 420, 421].includes(code)) {
                currentGradientStop = {
                  color: updateColorDescriptor(null, code, rawValue, utils),
                  position: null
                };
                gradient.colors.push(currentGradientStop);
              } else if ([430, 431, 440].includes(code)) {
                if (!currentGradientStop) {
                  currentGradientStop = { color: null, position: null };
                  gradient.colors.push(currentGradientStop);
                }
                currentGradientStop.color = updateColorDescriptor(currentGradientStop.color, code, rawValue, utils);
              } else if (code === 40 || code === 41 || code === 42 || code === 43) {
                if (!currentGradientStop) {
                  currentGradientStop = { color: null, position: null };
                  gradient.colors.push(currentGradientStop);
                }
                const numeric = toFloat(rawValue);
                if (Number.isFinite(numeric)) {
                  currentGradientStop.position = numeric;
                }
              } else {
                const key = `c${code}`;
                if (!Object.prototype.hasOwnProperty.call(gradient.properties, key)) {
                  gradient.properties[key] = rawValue;
                } else if (Array.isArray(gradient.properties[key])) {
                  gradient.properties[key].push(rawValue);
                } else {
                  gradient.properties[key] = [gradient.properties[key], rawValue];
                }
              }
            } else if (currentSubclass === 'image') {
              const image = ensureImage();
              const key = `c${code}`;
              if (!Object.prototype.hasOwnProperty.call(image.properties, key)) {
                image.properties[key] = rawValue;
              } else if (Array.isArray(image.properties[key])) {
                image.properties[key].push(rawValue);
              } else {
                image.properties[key] = [image.properties[key], rawValue];
              }
            } else if (currentSubclass === 'sky') {
              const sky = ensureSky();
              const key = `c${code}`;
              if (!Object.prototype.hasOwnProperty.call(sky.properties, key)) {
                sky.properties[key] = rawValue;
              } else if (Array.isArray(sky.properties[key])) {
                sky.properties[key].push(rawValue);
              } else {
                sky.properties[key] = [sky.properties[key], rawValue];
              }
            } else if (currentSubclass === 'ground') {
              const ground = ensureGround();
              const key = `c${code}`;
              if (!Object.prototype.hasOwnProperty.call(ground.properties, key)) {
                ground.properties[key] = rawValue;
              } else if (Array.isArray(ground.properties[key])) {
                ground.properties[key].push(rawValue);
              } else {
                ground.properties[key] = [ground.properties[key], rawValue];
              }
            }
            break;
          }
        }
      }

      if (background.solid && background.solid.color && !background.solid.color.css && background.solid.color.trueColor) {
        background.solid.color.css = createCssFromRgb({
          r: background.solid.color.trueColor.r,
          g: background.solid.color.trueColor.g,
          b: background.solid.color.trueColor.b
        }, background.solid.color.transparency != null ? background.solid.color.transparency : 1);
      }

      if (background.gradient && Array.isArray(background.gradient.colors)) {
        const stops = background.gradient.colors;
        for (let idx = 0; idx < stops.length; idx++) {
          const stop = stops[idx];
          if (stop && stop.color && !stop.color.css && stop.color.trueColor) {
            stop.color.css = createCssFromRgb({
              r: stop.color.trueColor.r,
              g: stop.color.trueColor.g,
              b: stop.color.trueColor.b
            }, stop.color.transparency != null ? stop.color.transparency : 1);
          }
          if (!Number.isFinite(stop.position)) {
            stop.position = stops.length > 1 ? idx / (stops.length - 1) : 0;
          } else {
            stop.position = Math.max(0, Math.min(1, stop.position));
          }
        }
      }

      return background;
    }

    parseSunObject(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }

      const sun = {
        handle: null,
        handleUpper: null,
        owner: null,
        ownerUpper: null,
        version: null,
        status: false,
        color: null,
        intensity: null,
        shadowsEnabled: false,
        shadowType: null,
        shadowMapSize: null,
        shadowSoftness: null,
        julianDay: null,
        timeSeconds: null,
        daylightSavings: null,
        datetime: null,
        rawTags: []
      };

      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        const code = Number(tag.code);
        const rawValue = tag.value;
        sun.rawTags.push({ code, value: rawValue });
        switch (code) {
          case 5: {
            const handle = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue || '');
            sun.handle = handle || null;
            sun.handleUpper = normalizeHandle(handle);
            break;
          }
          case 330: {
            const owner = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue || '');
            sun.owner = owner || null;
            sun.ownerUpper = normalizeHandle(owner);
            break;
          }
          case 90:
            sun.version = toInt(rawValue);
            break;
          case 290:
            sun.status = boolFromValue(rawValue);
            break;
          case 63:
          case 62:
          case 420:
          case 421:
          case 430:
          case 431:
          case 440:
            sun.color = updateColorDescriptor(sun.color, code, rawValue, utils);
            break;
          case 40:
            sun.intensity = toFloat(rawValue);
            break;
          case 291:
            sun.shadowsEnabled = boolFromValue(rawValue);
            break;
          case 91:
            sun.julianDay = toFloat(rawValue);
            break;
          case 92:
            sun.timeSeconds = toFloat(rawValue);
            break;
          case 292:
            sun.daylightSavings = boolFromValue(rawValue);
            break;
          case 70:
            sun.shadowType = toInt(rawValue);
            break;
          case 71:
            sun.shadowMapSize = toInt(rawValue);
            break;
          case 280:
            sun.shadowSoftness = toFloat(rawValue);
            break;
          default:
            break;
        }
      }

      if (sun.color && sun.color.trueColor && !sun.color.css) {
        sun.color.css = createCssFromRgb({
          r: sun.color.trueColor.r,
          g: sun.color.trueColor.g,
          b: sun.color.trueColor.b
        }, sun.color.transparency != null ? sun.color.transparency : 1);
      }

      if (Number.isFinite(sun.julianDay)) {
        let combined = sun.julianDay;
        if (Number.isFinite(sun.timeSeconds)) {
          combined += (sun.timeSeconds || 0) / 86400;
        }
        const converted = convertJulianDay(combined);
        if (converted) {
          sun.datetime = converted;
        }
      }

      return sun;
    }

    parseMaterial(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }

      const toFloat = utils.toFloat ? utils.toFloat.bind(utils) : (val) => {
        const num = parseFloat(val);
        return Number.isFinite(num) ? num : null;
      };
      const toInt = utils.toInt ? utils.toInt.bind(utils) : (val) => {
        const num = parseInt(val, 10);
        return Number.isFinite(num) ? num : null;
      };

      const handleRaw = utils.getFirstCodeValue(tags, 5);
      const ownerRaw = utils.getFirstCodeValue(tags, 330);
      const handle = handleRaw ? String(handleRaw).trim().toUpperCase() : null;
      const owner = ownerRaw ? String(ownerRaw).trim().toUpperCase() : null;

      const material = {
        handle,
        owner,
        name: null,
        description: null,
        ambient: { factor: null, color: null, override: false },
        diffuse: { factor: null, color: null, override: false },
        specular: { factor: null, color: null, gloss: null, override: false, colorFactor: null },
        opacity: { factor: null },
        reflection: {},
        refraction: { index: null, translucence: null },
        bump: {},
        normal: { strength: null, method: null },
        selfIllumination: { value: 0, enabled: false, luminance: null, mode: null },
        illuminationModel: null,
        channelFlags: null,
        reflectivity: null,
        reflectanceScale: null,
        transmittanceScale: null,
        colorBleedScale: null,
        indirectBumpScale: null,
        globalIlluminationMode: null,
        finalGatherMode: null,
        translucence: null,
        isTwoSided: null,
        isAnonymous: null,
        generator: {},
        maps: {},
        textureScale: { u: null },
        rawTags: tags.map((tag) => ({
          code: Number(tag.code),
          value: tag.value
        }))
      };

      const maps = material.maps;
      const getMap = (key) => {
        if (!maps[key]) {
          maps[key] = {
            file: null,
            blend: null,
            useImage: null,
            projection: null,
            tiling: null,
            autoTransform: null,
            transform: []
          };
        }
        return maps[key];
      };

      const setColorFromInt = (target, intValue) => {
        const intVal = toInt(intValue);
        if (!Number.isFinite(intVal)) {
          return;
        }
        const color = toColorObject(intVal, 1);
        if (color) {
          target.color = color;
        }
      };

      let code3Index = 0;
      let code42Index = 0;
      let code72Index = 0;
      let code73Index = 0;
      let code74Index = 0;
      let code75Index = 0;
      let code90Index = 0;
      let code270Index = 0;
      let code271Index = 0;
      let code272Index = 0;
      let code273Index = 0;
      let readingNormal = false;

      tags.forEach((tag) => {
        const code = Number(tag.code);
        const rawValue = tag.value;

        switch (code) {
          case 1:
            material.name = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            break;
          case 2:
            material.description = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            break;
          case 3: {
            const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            if (code3Index === 0) {
              getMap('diffuse').file = value || null;
              readingNormal = false;
            } else if (code3Index === 1) {
              getMap('normal').file = value || null;
              readingNormal = true;
            }
            code3Index += 1;
            break;
          }
          case 4:
            getMap('specular').file = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            break;
          case 6:
            getMap('reflection').file = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            break;
          case 7:
            getMap('opacity').file = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            break;
          case 8:
            getMap('bump').file = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            break;
          case 9:
            getMap('refraction').file = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            break;
          case 40:
            material.ambient.factor = toFloat(rawValue);
            break;
          case 41:
            material.diffuse.factor = toFloat(rawValue);
            break;
          case 42: {
            const value = toFloat(rawValue);
            if (code42Index === 0) {
              getMap('diffuse').blend = value;
              readingNormal = false;
            } else if (code42Index === 1) {
              getMap('normal').blend = value;
              readingNormal = true;
            }
            code42Index += 1;
            break;
          }
          case 43: {
            const targetMap = readingNormal ? getMap('normal') : getMap('diffuse');
            ensureArray(targetMap, 'transform').push(toFloat(rawValue) ?? 0);
            break;
          }
          case 44:
            material.specular.gloss = toFloat(rawValue);
            break;
          case 45:
            material.specular.colorFactor = toFloat(rawValue);
            break;
          case 46:
            getMap('specular').blend = toFloat(rawValue);
            break;
          case 47:
            ensureArray(getMap('specular'), 'transform').push(toFloat(rawValue) ?? 0);
            break;
          case 48:
            getMap('reflection').blend = toFloat(rawValue);
            break;
          case 49:
            ensureArray(getMap('reflection'), 'transform').push(toFloat(rawValue) ?? 0);
            break;
          case 62:
            material.generator.colorIndex = toInt(rawValue);
            break;
          case 70:
            material.ambient.override = boolFromValue(rawValue);
            break;
          case 71:
            material.diffuse.override = boolFromValue(rawValue);
            break;
          case 72: {
            const flag = boolFromValue(rawValue);
            if (code72Index === 0) {
              getMap('diffuse').useImage = flag;
              readingNormal = false;
            } else if (code72Index === 1) {
              getMap('normal').useImage = flag;
              readingNormal = true;
            }
            code72Index += 1;
            break;
          }
          case 73: {
            const value = toInt(rawValue);
            if (code73Index === 0) {
              getMap('diffuse').projection = value;
              readingNormal = false;
            } else if (code73Index === 1) {
              getMap('normal').projection = value;
              readingNormal = true;
            }
            code73Index += 1;
            break;
          }
          case 74: {
            const value = toInt(rawValue);
            if (code74Index === 0) {
              getMap('diffuse').tiling = value;
              readingNormal = false;
            } else if (code74Index === 1) {
              getMap('normal').tiling = value;
              readingNormal = true;
            }
            code74Index += 1;
            break;
          }
          case 75: {
            const value = toInt(rawValue);
            if (code75Index === 0) {
              getMap('diffuse').autoTransform = value;
              readingNormal = false;
            } else if (code75Index === 1) {
              getMap('normal').autoTransform = value;
              readingNormal = true;
            }
            code75Index += 1;
            break;
          }
          case 76:
            material.specular.override = boolFromValue(rawValue);
            break;
          case 77:
            getMap('specular').useImage = boolFromValue(rawValue);
            break;
          case 78:
            getMap('specular').projection = toInt(rawValue);
            break;
          case 79:
            getMap('specular').tiling = toInt(rawValue);
            break;
          case 90: {
            const intValue = toInt(rawValue);
            if (code90Index === 0) {
              setColorFromInt(material.ambient, intValue);
            } else if (code90Index === 1) {
              const amount = Number.isFinite(intValue) ? intValue : 0;
              material.selfIllumination.value = amount;
              material.selfIllumination.enabled = amount > 0;
            }
            code90Index += 1;
            break;
          }
          case 91:
            setColorFromInt(material.diffuse, rawValue);
            break;
          case 92:
            setColorFromInt(material.specular, rawValue);
            break;
          case 93:
            material.illuminationModel = toInt(rawValue);
            break;
          case 94:
            material.channelFlags = toInt(rawValue);
            break;
          case 140:
            material.opacity.factor = toFloat(rawValue);
            break;
          case 141:
            getMap('opacity').blend = toFloat(rawValue);
            break;
          case 142:
            ensureArray(getMap('opacity'), 'transform').push(toFloat(rawValue) ?? 0);
            break;
          case 143:
            getMap('bump').blend = toFloat(rawValue);
            break;
          case 144:
            ensureArray(getMap('bump'), 'transform').push(toFloat(rawValue) ?? 0);
            break;
          case 145:
            material.refraction.index = toFloat(rawValue);
            break;
          case 146:
            getMap('refraction').blend = toFloat(rawValue);
            break;
          case 147:
            ensureArray(getMap('refraction'), 'transform').push(toFloat(rawValue) ?? 0);
            break;
          case 148:
            material.refraction.translucence = toFloat(rawValue);
            material.translucence = material.refraction.translucence;
            break;
          case 170:
            getMap('specular').autoTransform = toInt(rawValue);
            break;
          case 171:
            getMap('reflection').useImage = boolFromValue(rawValue);
            break;
          case 172:
            getMap('reflection').projection = toInt(rawValue);
            break;
          case 173:
            getMap('reflection').tiling = toInt(rawValue);
            break;
          case 174:
            getMap('reflection').autoTransform = toInt(rawValue);
            break;
          case 175:
            getMap('opacity').useImage = boolFromValue(rawValue);
            break;
          case 176:
            getMap('opacity').projection = toInt(rawValue);
            break;
          case 177:
            getMap('opacity').tiling = toInt(rawValue);
            break;
          case 178:
            getMap('opacity').autoTransform = toInt(rawValue);
            break;
          case 179:
            getMap('bump').useImage = boolFromValue(rawValue);
            break;
          case 270: {
            const value = toInt(rawValue);
            if (code270Index === 0) {
              getMap('bump').projection = value;
            } else if (code270Index === 1) {
              material.selfIllumination.mode = value;
            } else if (code270Index === 2) {
              material.textureScale.u = value;
            }
            code270Index += 1;
            break;
          }
          case 271: {
            const value = toInt(rawValue);
            if (code271Index === 0) {
              getMap('bump').tiling = value;
            } else if (code271Index === 1) {
              material.normal.method = value;
            } else if (code271Index === 2) {
              material.generator.integerValue = value;
            }
            code271Index += 1;
            break;
          }
          case 272: {
            const value = toInt(rawValue);
            if (code272Index === 0) {
              getMap('bump').autoTransform = value;
            } else if (code272Index === 1) {
              material.globalIlluminationMode = value;
            }
            code272Index += 1;
            break;
          }
          case 273: {
            const flagValue = toInt(rawValue);
            if (code273Index === 0) {
              getMap('refraction').useImage = flagValue != null ? flagValue !== 0 : null;
            } else if (code273Index === 1) {
              material.finalGatherMode = flagValue;
            }
            code273Index += 1;
            break;
          }
          case 274:
            getMap('refraction').projection = toInt(rawValue);
            break;
          case 275:
            getMap('refraction').tiling = toInt(rawValue);
            break;
          case 276:
            getMap('refraction').autoTransform = toInt(rawValue);
            break;
          case 290:
            material.isTwoSided = rawValue === true || rawValue === '1' || rawValue === 1;
            break;
          case 291:
            material.generator.booleanValue = rawValue === true || rawValue === '1' || rawValue === 1;
            break;
          case 292:
            material.generator.tableEnd = rawValue === true || rawValue === '1' || rawValue === 1;
            break;
          case 293:
            material.isAnonymous = rawValue === true || rawValue === '1' || rawValue === 1;
            break;
          case 300:
            material.generator.name = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            break;
          case 301:
            material.generator.textValue = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            break;
          case 420:
            material.generator.colorRgb = toInt(rawValue);
            break;
          case 430:
            material.generator.colorName = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
            break;
          case 460:
            material.colorBleedScale = toFloat(rawValue);
            break;
          case 461:
            material.indirectBumpScale = toFloat(rawValue);
            break;
          case 462:
            material.reflectanceScale = toFloat(rawValue);
            break;
          case 463:
            material.transmittanceScale = toFloat(rawValue);
            break;
          case 464:
            material.selfIllumination.luminance = toFloat(rawValue);
            break;
          case 465:
            material.normal.strength = toFloat(rawValue);
            break;
          case 468:
            material.reflectivity = toFloat(rawValue);
            break;
          case 469:
            material.generator.realValue = toFloat(rawValue);
            break;
          default:
            break;
        }
      });

      return material;
    }

    extractEntities(tables, materialCatalog = {}) {
      const entities = [];
      const blocks = [];
      let section = null;
      let currentBlock = null;
      const pendingStack = [];
      let i = 0;
      const materialsByHandle = materialCatalog && materialCatalog.byHandle
        ? materialCatalog.byHandle
        : {};

      const peekPending = () => pendingStack[pendingStack.length - 1] || null;

      while (i < this.tags.length) {
        const tag = this.tags[i];
        const code = Number(tag.code);
        const value = typeof tag.value === 'string' ? tag.value.trim() : tag.value;
        const upperValue = value ? String(value).toUpperCase() : '';

        if (code !== 0) {
          i += 1;
          continue;
        }

        if (upperValue === 'SECTION') {
          section = null;
          currentBlock = null;
          pendingStack.length = 0;
          i += 1;
          while (i < this.tags.length) {
            const lookahead = this.tags[i];
            if (Number(lookahead.code) === 2) {
              section = String(lookahead.value || '').trim().toUpperCase();
              i += 1;
              break;
            }
            if (Number(lookahead.code) === 0) {
              break;
            }
            i += 1;
          }
          continue;
        }

        if (upperValue === 'ENDSEC') {
          section = null;
          currentBlock = null;
          pendingStack.length = 0;
          i += 1;
          continue;
        }

        if (upperValue === 'VERTEX') {
          const { tags: vertexTags, nextIndex } = this.collectEntityTags(i + 1);
          const pending = peekPending();
          if (pending) {
            const vertex = namespace.RenderableEntityFactory.parseVertexTags(vertexTags, {
              family: pending.family,
              is3d: pending.entity && pending.entity.geometry && pending.entity.geometry.is3d
            });
            this.attachVertexToComplex(pending, vertex);
          } else {
            const context = {
              blockName: section === 'BLOCKS' && currentBlock ? currentBlock.name : undefined,
              tables,
              materials: materialsByHandle,
              createEntityId: (entType) => this.nextEntityId(entType)
            };
            const vertexEntity = namespace.RenderableEntityFactory.fromTags('VERTEX', vertexTags, context);
            if (section === 'BLOCKS' && currentBlock) {
              currentBlock.entities.push(vertexEntity);
            } else if (section === 'ENTITIES') {
              entities.push(vertexEntity);
            }
          }
          i = nextIndex;
          continue;
        }

        if (upperValue === 'SEQEND') {
          const { nextIndex } = this.collectEntityTags(i + 1);
          const pending = pendingStack.pop();
          if (pending && pending.container) {
            pending.container.push(pending.entity);
          }
          i = nextIndex;
          continue;
        }

        if (section === 'BLOCKS') {
          if (upperValue === 'BLOCK') {
            const { tags: headerTags, nextIndex } = this.collectEntityTags(i + 1);
            const header = this.buildBlockHeader(headerTags);
            currentBlock = {
              name: header.name,
              header,
              entities: []
            };
            blocks.push(currentBlock);
            i = nextIndex;
            continue;
          }

          if (upperValue === 'ENDBLK') {
            const { nextIndex } = this.collectEntityTags(i + 1);
            currentBlock = null;
            pendingStack.length = 0;
            i = nextIndex;
            continue;
          }

          const context = {
            blockName: currentBlock ? currentBlock.name : undefined,
            tables,
            materials: materialsByHandle,
            createEntityId: (entType) => this.nextEntityId(entType)
          };
          const { tags: entityTags, nextIndex } = this.collectEntityTags(i + 1);
          if (upperValue === 'POLYLINE' || upperValue === 'POLYFACE_MESH' || upperValue === 'MESH') {
            const entity = namespace.RenderableEntityFactory.fromTags(upperValue, entityTags, context);
            const entry = {
              family: upperValue === 'POLYLINE' ? 'polyline' : (upperValue === 'POLYFACE_MESH' ? 'polyface' : 'mesh'),
              entity,
              container: currentBlock ? currentBlock.entities : entities
            };
            this.ensureComplexGeometryInitialised(entry);
            pendingStack.push(entry);
          } else {
            const entity = namespace.RenderableEntityFactory.fromTags(upperValue, entityTags, context);
            if (currentBlock) {
              currentBlock.entities.push(entity);
            } else {
              entities.push(entity);
            }
          }
          i = nextIndex;
          continue;
        }

        if (section === 'ENTITIES') {
          const context = {
            tables,
            materials: materialsByHandle,
            createEntityId: (entType) => this.nextEntityId(entType)
          };
          const { tags: entityTags, nextIndex } = this.collectEntityTags(i + 1);
          if (upperValue === 'POLYLINE' || upperValue === 'POLYFACE_MESH' || upperValue === 'MESH') {
            const entity = namespace.RenderableEntityFactory.fromTags(upperValue, entityTags, context);
            const entry = {
              family: upperValue === 'POLYLINE' ? 'polyline' : (upperValue === 'POLYFACE_MESH' ? 'polyface' : 'mesh'),
              entity,
              container: entities
            };
            this.ensureComplexGeometryInitialised(entry);
            pendingStack.push(entry);
          } else {
            const entity = namespace.RenderableEntityFactory.fromTags(upperValue, entityTags, context);
            entities.push(entity);
          }
          i = nextIndex;
          continue;
        }

        i += 1;
      }

      while (pendingStack.length) {
        const pending = pendingStack.pop();
        if (pending && pending.container) {
          pending.container.push(pending.entity);
        }
      }

      return { entities, blocks };
    }

    collectEntityTags(startIndex) {
      const entityTags = [];
      let idx = startIndex;
      while (idx < this.tags.length) {
        const lookahead = this.tags[idx];
        if (Number(lookahead.code) === 0) {
          break;
        }
        entityTags.push(lookahead);
        idx += 1;
      }
      return { tags: entityTags, nextIndex: idx };
    }

    ensureComplexGeometryInitialised(entry) {
      if (!entry || !entry.entity) {
        return;
      }
      entry.entity.geometry = entry.entity.geometry || {};
      const geom = entry.entity.geometry;
      if (!Array.isArray(geom.vertices)) {
        geom.vertices = [];
      }
      if (entry.family === 'polyface') {
        if (!Array.isArray(geom.faces)) {
          geom.faces = [];
        }
      }
      if (entry.family === 'mesh') {
        if (!Array.isArray(geom.faces)) {
          geom.faces = [];
        }
      }
    }

    attachVertexToComplex(entry, vertex) {
      if (!entry || !entry.entity || !entry.entity.geometry || !vertex) {
        return;
      }
      const geom = entry.entity.geometry;
      geom.vertices = Array.isArray(geom.vertices) ? geom.vertices : [];
      if (entry.family === 'polyface' && vertex.isFaceRecord) {
        geom.faces = Array.isArray(geom.faces) ? geom.faces : [];
        const indices = [
          vertex.indices.v1,
          vertex.indices.v2,
          vertex.indices.v3,
          vertex.indices.v4
        ].filter((index) => Number.isInteger(index) && index !== 0);
        geom.faces.push({
          indices,
          flags: vertex.flags
        });
      } else {
        geom.vertices.push(vertex);
      }
    }

    parseVisualStyleRecord(recordTags, fallbackName) {
      const nameCandidate = (utils.getFirstCodeValue(recordTags, 2)
        || utils.getFirstCodeValue(recordTags, 3)
        || fallbackName
        || '').trim();
      if (!nameCandidate) {
        return null;
      }
      const handleRaw = utils.getFirstCodeValue(recordTags, 5) || null;
      const ownerRaw = utils.getFirstCodeValue(recordTags, 330) || null;
      const description = utils.getFirstCodeValue(recordTags, 4) || null;
      const numbers = Object.create(null);
      const bools = Object.create(null);
      const strings = Object.create(null);
      const handles = Object.create(null);
      recordTags.forEach((tag) => {
        const code = Number(tag.code);
        const rawValue = tag.value;
        if (code >= 40 && code <= 59) {
          numbers[`n${code}`] = utils.toFloat ? utils.toFloat(rawValue) : parseFloat(rawValue);
        } else if ((code >= 70 && code <= 79) || (code >= 170 && code <= 179) ||
          (code >= 270 && code <= 279) || (code >= 400 && code <= 499)) {
          numbers[`f${code}`] = utils.toInt ? utils.toInt(rawValue) : parseInt(rawValue, 10);
        } else if (code >= 280 && code <= 289) {
          numbers[`f${code}`] = utils.toInt ? utils.toInt(rawValue) : parseInt(rawValue, 10);
        } else if (code >= 290 && code <= 299) {
          const intVal = utils.toInt ? utils.toInt(rawValue) : parseInt(rawValue, 10);
          bools[`b${code}`] = intVal === 1;
        } else if (code >= 300 && code <= 399) {
          strings[`s${code}`] = typeof rawValue === 'string'
            ? rawValue
            : (rawValue != null ? String(rawValue) : '');
        } else if ((code >= 330 && code <= 369) || (code >= 430 && code <= 439)) {
          const handle = typeof rawValue === 'string'
            ? rawValue.trim()
            : (rawValue != null ? String(rawValue).trim() : '');
          if (handle) {
            handles[`h${code}`] = handle;
          }
        }
      });
      return {
        name: nameCandidate,
        handle: handleRaw || null,
        handleUpper: normalizeHandle(handleRaw),
        owner: ownerRaw || null,
        ownerUpper: normalizeHandle(ownerRaw),
        description,
        category: classifyVisualStyleName(nameCandidate),
        settings: {
          numbers,
          bools,
          strings,
          handles
        },
        rawTags: recordTags.map((tag) => ({
          code: Number(tag.code),
          value: tag.value
        }))
      };
    }

    buildBlockHeader(tags) {
      const name = (utils.getFirstCodeValue(tags, 2) ||
        utils.getFirstCodeValue(tags, 3) || '').trim() || this.nextBlockName();

      return {
        name,
        basePoint: {
          x: utils.toFloat(utils.getFirstCodeValue(tags, 10)) ?? 0,
          y: utils.toFloat(utils.getFirstCodeValue(tags, 20)) ?? 0,
          z: utils.toFloat(utils.getFirstCodeValue(tags, 30)) ?? 0
        },
        flags: utils.toInt(utils.getFirstCodeValue(tags, 70)) || 0,
        description: utils.getFirstCodeValue(tags, 4) || null,
        xrefPath: utils.getFirstCodeValue(tags, 1) || null,
        layoutHandle: utils.getFirstCodeValue(tags, 340) || null,
        handle: utils.getFirstCodeValue(tags, 5) || null,
        rawTags: tags.map((tag) => ({
          code: Number(tag.code),
          value: tag.value
        }))
      };
    }
  }

  namespace.RenderingDocumentBuilder = RenderingDocumentBuilder;

  return {
    RenderingDocumentBuilder
  };
}));
