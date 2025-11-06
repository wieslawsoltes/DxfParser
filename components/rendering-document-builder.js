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
      const resolvedEntityDefaults = this.resolveEntityDefaults(
        drawingProperties ? drawingProperties.entityDefaults : null,
        tables
      );
      const resolvedDisplaySettings = this.resolveDisplaySettings(
        drawingProperties ? drawingProperties.display : null
      );
      const resolvedCoordinateDefaults = this.resolveCoordinateDefaults(
        drawingProperties ? drawingProperties.coordinate : null
      );
      if (drawingProperties) {
        drawingProperties.entityDefaults = resolvedEntityDefaults;
        drawingProperties.display = resolvedDisplaySettings;
        drawingProperties.coordinate = resolvedCoordinateDefaults;
      }
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
      const auxiliaryObjects = this.extractAuxiliaryObjects();
      const pointCloudResources = auxiliaryObjects.pointClouds || {
        definitions: { byHandle: Object.create(null), list: [] },
        reactors: { byHandle: Object.create(null), list: [] },
        exRecords: { byHandle: Object.create(null), list: [] }
      };
      const imageDefinitionsByHandle = auxiliaryObjects.imageDefinitions && auxiliaryObjects.imageDefinitions.byHandle
        ? auxiliaryObjects.imageDefinitions.byHandle
        : Object.create(null);
      const underlayDefinitionsByHandle = auxiliaryObjects.underlayDefinitions && auxiliaryObjects.underlayDefinitions.byHandle
        ? auxiliaryObjects.underlayDefinitions.byHandle
        : Object.create(null);
      const sectionViewStylesByHandle = auxiliaryObjects.sectionViewStyles && auxiliaryObjects.sectionViewStyles.byHandle
        ? auxiliaryObjects.sectionViewStyles.byHandle
        : Object.create(null);
      const detailViewStylesByHandle = auxiliaryObjects.detailViewStyles && auxiliaryObjects.detailViewStyles.byHandle
        ? auxiliaryObjects.detailViewStyles.byHandle
        : Object.create(null);
      const sectionObjectsByHandle = auxiliaryObjects.sectionObjects && auxiliaryObjects.sectionObjects.byHandle
        ? auxiliaryObjects.sectionObjects.byHandle
        : Object.create(null);
      const sectionGeometriesByHandle = auxiliaryObjects.sectionGeometries && auxiliaryObjects.sectionGeometries.byHandle
        ? auxiliaryObjects.sectionGeometries.byHandle
        : Object.create(null);
      const detailViewObjectsByHandle = auxiliaryObjects.detailViewObjects && auxiliaryObjects.detailViewObjects.byHandle
        ? auxiliaryObjects.detailViewObjects.byHandle
        : Object.create(null);
      const proxyObjectsByHandle = auxiliaryObjects.proxyObjects && auxiliaryObjects.proxyObjects.byHandle
        ? auxiliaryObjects.proxyObjects.byHandle
        : Object.create(null);
      const datalinksByHandle = auxiliaryObjects.datalinks && auxiliaryObjects.datalinks.byHandle
        ? auxiliaryObjects.datalinks.byHandle
        : Object.create(null);
      const dictionaryVariablesByName = auxiliaryObjects.dictionaryVariables && auxiliaryObjects.dictionaryVariables.byName
        ? auxiliaryObjects.dictionaryVariables.byName
        : Object.create(null);
      const lightListsByHandle = auxiliaryObjects.lightLists && auxiliaryObjects.lightLists.byHandle
        ? auxiliaryObjects.lightLists.byHandle
        : Object.create(null);
      const dictionariesByHandle = auxiliaryObjects.dictionaries && auxiliaryObjects.dictionaries.byHandle
        ? auxiliaryObjects.dictionaries.byHandle
        : Object.create(null);
      const xrecordsByHandle = auxiliaryObjects.xrecords && auxiliaryObjects.xrecords.byHandle
        ? auxiliaryObjects.xrecords.byHandle
        : Object.create(null);
      const spatialFiltersByHandle = auxiliaryObjects.spatialFilters && auxiliaryObjects.spatialFilters.byHandle
        ? auxiliaryObjects.spatialFilters.byHandle
        : Object.create(null);
      const { entities, blocks } = this.extractEntities(
        tables,
        materialCatalog,
        auxiliaryObjects,
        resolvedEntityDefaults,
        resolvedCoordinateDefaults,
        resolvedDisplaySettings,
        drawingProperties
      );

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
        suns: sunCatalog.byHandle,
        units: drawingProperties ? drawingProperties.units || null : null,
        entityDefaults: resolvedEntityDefaults || null,
        displaySettings: resolvedDisplaySettings || null,
        coordinateDefaults: resolvedCoordinateDefaults || null,
        imageDefinitions: imageDefinitionsByHandle,
        underlayDefinitions: underlayDefinitionsByHandle,
        pointClouds: pointCloudResources,
        sectionViewStyles: sectionViewStylesByHandle,
        detailViewStyles: detailViewStylesByHandle,
        sectionObjects: sectionObjectsByHandle,
        sectionGeometries: sectionGeometriesByHandle,
        detailViewObjects: detailViewObjectsByHandle,
        rasterVariables: auxiliaryObjects.rasterVariables || null,
        proxyObjects: proxyObjectsByHandle,
        datalinks: datalinksByHandle,
        dictionaryVariables: dictionaryVariablesByName,
        lightLists: lightListsByHandle,
        dictionaries: dictionariesByHandle,
        xrecords: xrecordsByHandle,
        spatialFilters: spatialFiltersByHandle
      });

      entities.forEach((entity) => sceneGraphBuilder.ingestEntity(entity));
      blocks.forEach((blockDef) => sceneGraphBuilder.ingestBlockDefinition(blockDef));

      const sceneGraph = sceneGraphBuilder.finalize();
      const blockMetadata = this.computeBlockMetadata(sceneGraph);
      if (sceneGraph && typeof sceneGraph === 'object') {
        sceneGraph.blockMetadata = blockMetadata;
        sceneGraph.textStyleCatalog = this.computeTextStyleCatalog(tables);
        if (!sceneGraph.fieldContext) {
          sceneGraph.fieldContext = {
            drawingProperties,
            metadata: drawingProperties ? drawingProperties.metadata : null,
            geographic: drawingProperties ? drawingProperties.geographic : null,
            headerVariables: drawingProperties && drawingProperties.geographic
              ? drawingProperties.geographic.headerVariables
              : null
          };
        }
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
        suns: sunCatalog,
        imageDefinitions: auxiliaryObjects.imageDefinitions,
        imageDefReactors: auxiliaryObjects.imageDefReactors,
        rasterVariables: auxiliaryObjects.rasterVariables,
        underlayDefinitions: auxiliaryObjects.underlayDefinitions,
        pointClouds: auxiliaryObjects.pointClouds,
        sectionViewStyles: auxiliaryObjects.sectionViewStyles,
        detailViewStyles: auxiliaryObjects.detailViewStyles,
        sectionObjects: auxiliaryObjects.sectionObjects,
        sectionGeometries: auxiliaryObjects.sectionGeometries,
        detailViewObjects: auxiliaryObjects.detailViewObjects,
        proxyObjects: auxiliaryObjects.proxyObjects,
        datalinks: auxiliaryObjects.datalinks,
        dictionaryVariables: auxiliaryObjects.dictionaryVariables,
        lightLists: auxiliaryObjects.lightLists,
        dictionaries: auxiliaryObjects.dictionaries,
        xrecords: auxiliaryObjects.xrecords,
        spatialFilters: auxiliaryObjects.spatialFilters
      };
    }

    extractDrawingProperties() {
      const units = {
        insUnits: null,
        insUnitsTarget: null,
        insUnitsSource: null,
        measurement: null,
        scaleFactor: null,
        basePoint: { x: null, y: null, z: null },
        ltScale: 1,
        celTScale: 1,
        psLtScale: 1
      };

      const entityDefaults = {
        linetype: null,
        linetypeHandle: null,
        lineweight: null,
        textStyle: null,
        textStyleHandle: null,
        dimStyle: null,
        dimStyleHandle: null
      };

      const display = {
        pointMode: 0,
        pointSize: null,
        fillMode: 1,
        mirrorText: 1,
        traceWidth: null
      };

      const coordinate = {
        modelUcs: {
          name: null,
          origin: { x: null, y: null, z: null },
          xAxis: { x: null, y: null, z: null },
          yAxis: { x: null, y: null, z: null }
        },
        paperUcs: {
          name: null,
          origin: { x: null, y: null, z: null },
          xAxis: { x: null, y: null, z: null },
          yAxis: { x: null, y: null, z: null }
        },
        view: {
          direction: { x: null, y: null, z: null },
          vpoint: { x: null, y: null, z: null },
          target: { x: null, y: null, z: null },
          twist: null
        }
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
            case '$LTSCALE':
              if (floatVal != null) {
                units.ltScale = floatVal;
              }
              break;
            case '$CELTYPE':
              if (trimmedValue) {
                entityDefaults.linetype = trimmedValue;
              }
              if (code === 340 && trimmedValue) {
                entityDefaults.linetypeHandle = trimmedValue;
              }
              break;
            case '$CELTSCALE':
              if (floatVal != null) {
                units.celTScale = floatVal;
              }
              break;
            case '$PSLTSCALE':
              if (intVal != null) {
                units.psLtScale = intVal;
              }
              break;
            case '$CELWEIGHT':
              if (intVal != null) {
                entityDefaults.lineweight = intVal;
              }
              break;
            case '$UCSNAME':
              coordinate.modelUcs.name = trimmedValue || null;
              break;
            case '$UCSORG':
              if (code === 10) {
                coordinate.modelUcs.origin.x = floatVal;
              } else if (code === 20) {
                coordinate.modelUcs.origin.y = floatVal;
              } else if (code === 30) {
                coordinate.modelUcs.origin.z = floatVal;
              }
              break;
            case '$UCSXDIR':
              if (code === 10) {
                coordinate.modelUcs.xAxis.x = floatVal;
              } else if (code === 20) {
                coordinate.modelUcs.xAxis.y = floatVal;
              } else if (code === 30) {
                coordinate.modelUcs.xAxis.z = floatVal;
              }
              break;
            case '$UCSYDIR':
              if (code === 10) {
                coordinate.modelUcs.yAxis.x = floatVal;
              } else if (code === 20) {
                coordinate.modelUcs.yAxis.y = floatVal;
              } else if (code === 30) {
                coordinate.modelUcs.yAxis.z = floatVal;
              }
              break;
            case '$PUCSNAME':
              coordinate.paperUcs.name = trimmedValue || null;
              break;
            case '$PUCSORG':
              if (code === 10) {
                coordinate.paperUcs.origin.x = floatVal;
              } else if (code === 20) {
                coordinate.paperUcs.origin.y = floatVal;
              } else if (code === 30) {
                coordinate.paperUcs.origin.z = floatVal;
              }
              break;
            case '$PUCSXDIR':
              if (code === 10) {
                coordinate.paperUcs.xAxis.x = floatVal;
              } else if (code === 20) {
                coordinate.paperUcs.xAxis.y = floatVal;
              } else if (code === 30) {
                coordinate.paperUcs.xAxis.z = floatVal;
              }
              break;
            case '$PUCSYDIR':
              if (code === 10) {
                coordinate.paperUcs.yAxis.x = floatVal;
              } else if (code === 20) {
                coordinate.paperUcs.yAxis.y = floatVal;
              } else if (code === 30) {
                coordinate.paperUcs.yAxis.z = floatVal;
              }
              break;
            case '$PDMODE':
              if (intVal != null) {
                display.pointMode = intVal;
              }
              break;
            case '$PDSIZE':
              if (floatVal != null) {
                display.pointSize = floatVal;
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
            case '$CELTEXTSTYLE':
              if (trimmedValue) {
                entityDefaults.textStyle = trimmedValue;
              }
              if (code === 340 && trimmedValue) {
                entityDefaults.textStyleHandle = trimmedValue;
              }
              break;
            case '$TEXTSTYLE':
              if (trimmedValue) {
                entityDefaults.textStyle = trimmedValue;
              }
              if (code === 340 && trimmedValue) {
                entityDefaults.textStyleHandle = trimmedValue;
              }
              break;
            case '$DIMSTYLE':
              if (trimmedValue) {
                entityDefaults.dimStyle = trimmedValue;
              }
              if (code === 340 && trimmedValue) {
                entityDefaults.dimStyleHandle = trimmedValue;
              }
              break;
            case '$FILLMODE':
              if (intVal != null) {
                display.fillMode = intVal;
              }
              break;
            case '$MIRRTEXT':
              if (intVal != null) {
                display.mirrorText = intVal;
              }
              break;
            case '$TRACEWID':
              if (floatVal != null) {
                display.traceWidth = floatVal;
              }
              break;
            case '$VIEWDIR':
              if (code === 16) {
                coordinate.view.direction.x = floatVal;
              } else if (code === 26) {
                coordinate.view.direction.y = floatVal;
              } else if (code === 36) {
                coordinate.view.direction.z = floatVal;
              }
              break;
            case '$VPOINT':
              if (code === 16) {
                coordinate.view.vpoint.x = floatVal;
              } else if (code === 26) {
                coordinate.view.vpoint.y = floatVal;
              } else if (code === 36) {
                coordinate.view.vpoint.z = floatVal;
              }
              break;
            case '$VIEWTWIST':
              if (floatVal != null) {
                coordinate.view.twist = floatVal;
              }
              break;
            case '$TARGET':
            case '$VIEWTARGET':
              if (code === 10 || code === 17) {
                coordinate.view.target.x = floatVal;
              } else if (code === 20 || code === 27) {
                coordinate.view.target.y = floatVal;
              } else if (code === 30 || code === 37) {
                coordinate.view.target.z = floatVal;
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
        geographic,
        entityDefaults,
        display,
        coordinate
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

      const normalizeUnitsCode = (code) => {
        if (code == null) {
          return null;
        }
        const numeric = Number(code);
        if (!Number.isFinite(numeric)) {
          return null;
        }
        const coerced = Math.trunc(numeric);
        return Number.isFinite(coerced) ? coerced : null;
      };

      const unitNameLookup = {
        0: 'unitless',
        1: 'inches',
        2: 'feet',
        3: 'miles',
        4: 'millimeters',
        5: 'centimeters',
        6: 'meters',
        7: 'kilometers',
        8: 'micro-inches',
        9: 'mils',
        10: 'yards',
        11: 'angstroms',
        12: 'nanometers',
        13: 'micrometers',
        14: 'decimeters',
        15: 'decameters',
        16: 'hectometers',
        17: 'gigameters',
        18: 'astronomical units',
        19: 'light years',
        20: 'parsecs',
        21: 'us survey feet'
      };

      const formatUnitShort = (code) => {
        if (code === 'unitless') {
          return 'unitless';
        }
        const normalized = normalizeUnitsCode(code);
        if (normalized == null) {
          return 'unspecified';
        }
        return unitNameLookup[normalized] || `code ${normalized}`;
      };

      const formatNumber = (value) => {
        if (!Number.isFinite(value)) {
          return 'NaN';
        }
        const abs = Math.abs(value);
        if (abs === 0) {
          return '0';
        }
        if (abs >= 10000 || abs < 1e-4) {
          return value.toExponential(3).replace(/e\+?0*/, 'e');
        }
        return value.toFixed(6).replace(/\.?0+$/, '');
      };

      const formatVector = (vector) => {
        if (!vector || typeof vector !== 'object') {
          return '0/0/0';
        }
        const safe = (value) => {
          if (!Number.isFinite(value)) {
            return 'NaN';
          }
          return formatNumber(value);
        };
        return `${safe(vector.x ?? 0)}/${safe(vector.y ?? 0)}/${safe(vector.z ?? 0)}`;
      };

      const unitFactorFromCode = (code) => {
        const normalized = normalizeUnitsCode(code);
        if (normalized == null) {
          return 1;
        }
        if (Object.prototype.hasOwnProperty.call(unitNameLookup, normalized)) {
          switch (normalized) {
            case 0: return 1;
            case 1: return 0.0254;
            case 2: return 0.3048;
            case 3: return 1609.344;
            case 4: return 0.001;
            case 5: return 0.01;
            case 6: return 1;
            case 7: return 1000;
            case 8: return 2.54e-7;
            case 9: return 2.54e-5;
            case 10: return 0.9144;
            case 11: return 1e-10;
            case 12: return 1e-9;
            case 13: return 1e-6;
            case 14: return 0.1;
            case 15: return 10;
            case 16: return 100;
            case 17: return 1e9;
            case 18: return 1.495978707e11;
            case 19: return 9.460730472e15;
            case 20: return 3.085677582e16;
            case 21: return 0.3048006096012192;
            default: break;
          }
        }
        return 1;
      };

      const unitConversionFactor = (source, target) => {
        const sourceFactor = unitFactorFromCode(source);
        const targetFactor = unitFactorFromCode(target);
        if (!Number.isFinite(sourceFactor) || !Number.isFinite(targetFactor) || targetFactor === 0) {
          return 1;
        }
        return sourceFactor / targetFactor;
      };

      const unitsContext = sceneGraph.units || {};
      const normalizedPrimaryUnits = normalizeUnitsCode(unitsContext.insUnits);
      const normalizedDefaultSourceUnits = normalizeUnitsCode(unitsContext.insUnitsSource);
      const normalizedDefaultTargetUnits = normalizeUnitsCode(unitsContext.insUnitsTarget);
      const defaultInsertScaleFactor = Number.isFinite(unitsContext.scaleFactor) && unitsContext.scaleFactor !== 0
        ? Math.abs(unitsContext.scaleFactor)
        : 1;

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
            units: null,
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
            instancesWithAttributes: 0,
            constraints: {
              allowExploding: null,
              scaleUniformly: null
            },
            diagnostics: [],
            counters: {
              nonUniformScaling: 0,
              unitConversions: 0,
              unitMismatches: 0,
              unitWarnings: 0,
              nestedOverlayReferences: 0,
              suppressedDimensionText: 0,
              suppressedDimensionLines: 0
            },
            flagsInfo: null
          });
        }
        return metadataMap.get(name);
      };

      const createUnitDiagnostics = (options = {}) => {
        const geometryScale = options.geometryScale || { x: 1, y: 1, z: 1 };
        const normalizedGeometry = {
          x: Number.isFinite(geometryScale.x) ? geometryScale.x : 1,
          y: Number.isFinite(geometryScale.y) ? geometryScale.y : 1,
          z: Number.isFinite(geometryScale.z) ? geometryScale.z : 1
        };

        const normalizedBlockUnits = normalizeUnitsCode(options.blockUnits);
        const normalizedActiveUnits = normalizeUnitsCode(options.activeUnits);
        const targetUnits = normalizedActiveUnits != null
          ? normalizedActiveUnits
          : (normalizedDefaultTargetUnits != null ? normalizedDefaultTargetUnits : null);
        let sourceUnits = null;
        let sourceKind = 'unspecified';
        let fallbackReason = null;
        let unitScale = 1;
        let defaultScaleApplied = false;

        const applyDefaultScale = () => {
          if (Number.isFinite(defaultInsertScaleFactor) && defaultInsertScaleFactor !== 1) {
            unitScale *= defaultInsertScaleFactor;
            defaultScaleApplied = true;
          }
        };

        if (normalizedBlockUnits != null) {
          if (normalizedBlockUnits === 0) {
            sourceUnits = normalizedDefaultSourceUnits != null ? normalizedDefaultSourceUnits : targetUnits;
            sourceKind = normalizedDefaultSourceUnits != null ? 'defaultSource' : 'context';
            fallbackReason = 'unitless-block';
            if (sourceUnits != null && targetUnits != null && sourceUnits !== targetUnits) {
              unitScale *= unitConversionFactor(sourceUnits, targetUnits);
            }
            applyDefaultScale();
          } else {
            sourceUnits = normalizedBlockUnits;
            sourceKind = 'block';
            if (targetUnits != null && sourceUnits !== targetUnits) {
              unitScale *= unitConversionFactor(sourceUnits, targetUnits);
            }
          }
        } else {
          sourceUnits = normalizedDefaultSourceUnits != null ? normalizedDefaultSourceUnits : targetUnits;
          if (normalizedDefaultSourceUnits != null) {
            sourceKind = 'defaultSource';
          } else if (targetUnits != null) {
            sourceKind = 'context';
          } else {
            sourceKind = 'unspecified';
          }
          fallbackReason = 'missing-block-units';
          if (sourceUnits != null && targetUnits != null && sourceUnits !== targetUnits) {
            unitScale *= unitConversionFactor(sourceUnits, targetUnits);
          }
          applyDefaultScale();
        }

        if (!Number.isFinite(unitScale) || unitScale === 0) {
          unitScale = 1;
        }

        const effectiveScale = {
          x: normalizedGeometry.x * unitScale,
          y: normalizedGeometry.y * unitScale,
          z: normalizedGeometry.z * unitScale
        };

        const unitsDiffer = sourceUnits != null && targetUnits != null && sourceUnits !== targetUnits;
        const missingUnits = sourceUnits == null || targetUnits == null;
        const scaleChanged = Math.abs(unitScale - 1) > 1e-6;
        const severity = (missingUnits || fallbackReason || defaultScaleApplied || scaleChanged) ? 'warning' : 'info';
        const targetKind = normalizedActiveUnits != null ? 'context'
          : (targetUnits != null ? 'defaultTarget' : 'unspecified');

        const sourceSummary = (() => {
          if (normalizedBlockUnits != null) {
            if (normalizedBlockUnits === 0) {
              if (sourceUnits != null) {
                const qualifier = sourceKind === 'defaultSource' ? 'default' : 'context';
                return `block unitless (${qualifier} ${formatUnitShort(sourceUnits)})`;
              }
              return 'block unitless';
            }
            return `block ${formatUnitShort(normalizedBlockUnits)}`;
          }
          if (sourceUnits != null) {
            if (sourceKind === 'defaultSource') {
              return `default ${formatUnitShort(sourceUnits)}`;
            }
            if (sourceKind === 'context') {
              return `context ${formatUnitShort(sourceUnits)}`;
            }
            return formatUnitShort(sourceUnits);
          }
          return 'source unspecified';
        })();

        const targetSummary = (() => {
          if (targetUnits == null) {
            return 'target unspecified';
          }
          if (targetKind === 'context') {
            return `context ${formatUnitShort(targetUnits)}`;
          }
          if (targetKind === 'defaultTarget') {
            return `default target ${formatUnitShort(targetUnits)}`;
          }
          return formatUnitShort(targetUnits);
        })();

        const sourceShort = (() => {
          if (normalizedBlockUnits === 0) {
            return 'unitless';
          }
          if (sourceUnits != null) {
            return formatUnitShort(sourceUnits);
          }
          if (normalizedBlockUnits != null) {
            return formatUnitShort(normalizedBlockUnits);
          }
          return 'unspecified';
        })();

        const targetShort = targetUnits != null ? formatUnitShort(targetUnits) : 'unspecified';

        const detailParts = [];
        if (fallbackReason === 'missing-block-units') {
          detailParts.push('block units missing');
        } else if (fallbackReason === 'unitless-block') {
          detailParts.push('unitless block');
        }
        if (defaultScaleApplied) {
          detailParts.push(`INSUNITSFAC ${formatNumber(defaultInsertScaleFactor)}`);
        }
        if (unitsDiffer || scaleChanged) {
          detailParts.push('conversion applied');
        }
        const detailStr = detailParts.length ? ` [${detailParts.join(', ')}]` : '';

        const message = `Units: ${sourceSummary} \u2192 ${targetSummary} (factor ${formatNumber(unitScale)})${detailStr}; geometry scale ${formatVector(normalizedGeometry)}; effective scale ${formatVector(effectiveScale)}.`;

        return {
          blockUnits: normalizedBlockUnits,
          sourceUnits,
          sourceKind,
          targetUnits,
          targetKind,
          fallbackReason,
          unitsDiffer,
          missingUnits,
          conversionFactor: unitScale,
          defaultScaleApplied,
          defaultScaleFactor: defaultInsertScaleFactor,
          geometryScale: normalizedGeometry,
          effectiveScale,
          geometryScaleDisplay: formatVector(normalizedGeometry),
          effectiveScaleDisplay: formatVector(effectiveScale),
          conversionFactorDisplay: formatNumber(unitScale),
          sourceSummary,
          targetSummary,
          summary: `${sourceSummary} \u2192 ${targetSummary}`,
          summaryShort: `${sourceShort}\u2192${targetShort}`,
          detail: detailParts,
          message,
          severity
        };
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

        const scale = entity.geometry.scale || null;
        const rawScaleX = scale && Number.isFinite(scale.x) ? scale.x : 1;
        let rawScaleY = scale && Number.isFinite(scale.y) ? scale.y : null;
        const rawScaleZ = scale && Number.isFinite(scale.z) ? scale.z : 1;
        if (rawScaleY == null || rawScaleY === 0) {
          rawScaleY = rawScaleZ !== 0 ? rawScaleZ : 1;
        }
        const safeScaleX = rawScaleX !== 0 ? rawScaleX : 1;
        const safeScaleY = rawScaleY !== 0 ? rawScaleY : 1;
        const safeScaleZ = rawScaleZ !== 0 ? rawScaleZ : 1;
        const instanceScale = {
          x: safeScaleX,
          y: safeScaleY,
          z: safeScaleZ
        };

        const instance = {
          handle: entity.handle || entity.id || null,
          ownerHandle: entity.owner || null,
          space: instanceSpace,
          layout: instanceSpace === 'paper' ? layoutName : null,
          layer: entity.layer || null,
          ownerBlock,
          hasAttributes: !!(entity.geometry && entity.geometry.hasAttributes),
          rows: entity.geometry.rowCount || 1,
          columns: entity.geometry.columnCount || 1,
          scale: instanceScale
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

        const requiresUniformScale = entry.constraints && entry.constraints.scaleUniformly === true;
        if (requiresUniformScale) {
          const tolerance = 1e-6;
          const compare = (a, b) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
          const uniformXY = compare(instanceScale.x, instanceScale.y);
          const uniformXZ = compare(instanceScale.x, instanceScale.z);
          if (!uniformXY || !uniformXZ) {
            entry.counters.nonUniformScaling += 1;
            entry.diagnostics.push({
              severity: 'warning',
              category: 'uniform-scaling',
              code: 'block.nonUniformScaling',
              message: `INSERT ${instance.handle || '(no handle)'} applies non-uniform scale (${instanceScale.x}, ${instanceScale.y}, ${instanceScale.z}) to block "${blockName}" requiring uniform scaling.`,
              block: blockName,
              instanceHandle: instance.handle || null,
              ownerBlock,
              space: instanceSpace,
              layout: instance.layout,
              scale: instanceScale
            });
          }
        }

        if (entry.flagsInfo && entry.flagsInfo.isOverlay && instanceSpace === 'block') {
          entry.counters.nestedOverlayReferences += 1;
          const overlayOwner = ownerBlock || '(unknown parent)';
          entry.diagnostics.push({
            severity: 'info',
            category: 'overlay',
            code: 'block.overlayNested',
            message: `Overlay block "${blockName}" referenced inside parent block "${overlayOwner}" will be suppressed when nested.`,
            block: blockName,
            instanceHandle: instance.handle || null,
            ownerBlock,
            space: instanceSpace,
            layout: instance.layout,
            scale: instanceScale
          });
        }

        const unitDiagnostics = createUnitDiagnostics({
          blockUnits: entry.units,
          activeUnits: context.units,
          geometryScale: instanceScale
        });
        instance.unitDiagnostics = unitDiagnostics;
        entry.counters.unitConversions += 1;
        if (unitDiagnostics.unitsDiffer || unitDiagnostics.defaultScaleApplied || unitDiagnostics.fallbackReason || unitDiagnostics.missingUnits) {
          entry.counters.unitMismatches += 1;
        }
        if (unitDiagnostics.severity === 'warning') {
          entry.counters.unitWarnings += 1;
        }
        entry.diagnostics.push({
          severity: unitDiagnostics.severity,
          category: 'unit-conversion',
          code: 'block.unitConversion',
          message: unitDiagnostics.message,
          block: blockName,
          instanceHandle: instance.handle || null,
          ownerBlock,
          space: instanceSpace,
          layout: instance.layout,
          scale: instanceScale,
          effectiveScale: unitDiagnostics.effectiveScale,
          unitConversion: {
            summary: unitDiagnostics.summary,
            summaryShort: unitDiagnostics.summaryShort,
            sourceSummary: unitDiagnostics.sourceSummary,
            targetSummary: unitDiagnostics.targetSummary,
            sourceUnits: unitDiagnostics.sourceUnits,
            targetUnits: unitDiagnostics.targetUnits,
            blockUnits: unitDiagnostics.blockUnits,
            conversionFactor: unitDiagnostics.conversionFactor,
            conversionFactorDisplay: unitDiagnostics.conversionFactorDisplay,
            defaultScaleApplied: unitDiagnostics.defaultScaleApplied,
            defaultScaleFactor: unitDiagnostics.defaultScaleFactor,
            fallbackReason: unitDiagnostics.fallbackReason,
            detail: unitDiagnostics.detail,
            geometryScale: unitDiagnostics.geometryScale,
            geometryScaleDisplay: unitDiagnostics.geometryScaleDisplay,
            effectiveScale: unitDiagnostics.effectiveScale,
            effectiveScaleDisplay: unitDiagnostics.effectiveScaleDisplay
          }
        });
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
          entry.flagsInfo = parseBlockFlags(header.flags);
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
              return;
            }
            if (type === 'DIMENSION') {
              const geom = entity.geometry || {};
              const dimFlags = Number.isFinite(geom.dimensionFlags) ? geom.dimensionFlags : 0;
              const suppressText = (dimFlags & 0x80) === 0x80 || geom.textSuppress === true || geom.textSuppressed === true;
              const suppressLine = (dimFlags & 0x40) === 0x40 || geom.dimensionLineSuppressed === true;
              if (suppressText) {
                entry.counters.suppressedDimensionText += 1;
                entry.diagnostics.push({
                  severity: 'info',
                  category: 'dimension',
                  code: 'dimension.suppressText',
                  message: `Dimension ${entity.handle || entity.id || ''} suppresses its dimension text.`,
                  block: blockName,
                  instanceHandle: null,
                  ownerBlock: blockName,
                  space: 'block'
                });
              }
              if (suppressLine) {
                entry.counters.suppressedDimensionLines += 1;
                entry.diagnostics.push({
                  severity: 'info',
                  category: 'dimension',
                  code: 'dimension.suppressLine',
                  message: `Dimension ${entity.handle || entity.id || ''} suppresses its dimension line.`,
                  block: blockName,
                  instanceHandle: null,
                  ownerBlock: blockName,
                  space: 'block'
                });
              }
            }
          });
        }
      });

      const blockRecords = sceneGraph.tables && sceneGraph.tables.blockRecords
        ? sceneGraph.tables.blockRecords
        : null;
      if (blockRecords && typeof blockRecords === 'object') {
        Object.keys(blockRecords).forEach((key) => {
          const record = blockRecords[key];
          if (!record) {
            return;
          }
          const entry = ensureEntry(record.name || key);
          if (!entry) {
            return;
          }
          if (record.handle && !entry.handle) {
            entry.handle = record.handle;
          }
          if (Number.isFinite(record.units)) {
            entry.units = record.units;
          }
          if (record.flags != null && entry.flagsInfo == null) {
            entry.flagsInfo = parseBlockFlags(record.flags);
          }
          if (record.allowExploding != null) {
            entry.constraints.allowExploding = !!record.allowExploding;
          }
          if (record.scaleUniformly != null) {
            entry.constraints.scaleUniformly = !!record.scaleUniformly;
          }
        });
      }

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

      const modelContextUnits = normalizedPrimaryUnits != null
        ? normalizedPrimaryUnits
        : (normalizedDefaultTargetUnits != null ? normalizedDefaultTargetUnits : null);
      const paperContextUnits = normalizedDefaultTargetUnits != null
        ? normalizedDefaultTargetUnits
        : (normalizedPrimaryUnits != null ? normalizedPrimaryUnits : null);

      gatherInserts(sceneGraph.modelSpace, { space: 'model', units: modelContextUnits });

      const paperSpaces = sceneGraph.paperSpaces || {};
      Object.keys(paperSpaces).forEach((layoutName) => {
        gatherInserts(paperSpaces[layoutName], {
          space: 'paper',
          layout: layoutName,
          units: paperContextUnits
        });
      });

      Object.keys(blocks).forEach((blockName) => {
        const block = blocks[blockName] || {};
        const ownerEntry = ensureEntry(blockName);
        const blockContextUnits = ownerEntry && ownerEntry.units != null
          ? normalizeUnitsCode(ownerEntry.units)
          : null;
        gatherInserts(block.entities, {
          space: 'block',
          ownerBlock: blockName,
          units: blockContextUnits
        });
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
        const constraints = {
          allowExploding: entry.constraints ? entry.constraints.allowExploding : null,
          scaleUniformly: entry.constraints ? entry.constraints.scaleUniformly : null
        };
        const diagnostics = Array.isArray(entry.diagnostics) ? entry.diagnostics.slice() : [];
        const flagsInfo = entry.flagsInfo ? Object.assign({}, entry.flagsInfo) : null;
        if (constraints && constraints.allowExploding === false &&
          !diagnostics.some((diag) => diag && diag.code === 'block.notExplodable')) {
          diagnostics.push({
            severity: 'info',
            category: 'explodability',
            code: 'block.notExplodable',
            message: `Block "${blockName}" is marked as not explodable.`,
            block: blockName
          });
        }
        if (flagsInfo && flagsInfo.isExternallyDependent && !flagsInfo.isResolved &&
          !diagnostics.some((diag) => diag && diag.code === 'block.xrefUnresolved')) {
          diagnostics.push({
            severity: 'warning',
            category: 'overlay',
            code: 'block.xrefUnresolved',
            message: `Block "${blockName}" references an unresolved external dependency.`,
            block: blockName
          });
        }
        const counters = entry.counters
          ? Object.assign({
            nonUniformScaling: 0,
            unitConversions: 0,
            unitMismatches: 0,
            unitWarnings: 0,
            nestedOverlayReferences: 0,
            suppressedDimensionText: 0,
            suppressedDimensionLines: 0
          }, entry.counters)
          : {
            nonUniformScaling: 0,
            unitConversions: 0,
            unitMismatches: 0,
            unitWarnings: 0,
            nestedOverlayReferences: 0,
            suppressedDimensionText: 0,
            suppressedDimensionLines: 0
          };
        const visibility = {
          isOverlay: flagsInfo ? !!flagsInfo.isOverlay : false,
          isXref: flagsInfo ? !!flagsInfo.isXref : false,
          isExternallyDependent: flagsInfo ? !!flagsInfo.isExternallyDependent : false,
          isResolved: flagsInfo ? !!flagsInfo.isResolved : false
        };

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
          hasAttributes: attributeTags.length > 0 || entry.instancesWithAttributes > 0,
          constraints,
          diagnostics,
          diagnosticCount: diagnostics.length,
          counters,
          flags: flagsInfo,
          visibility,
          hasUniformScaleViolations: counters.nonUniformScaling > 0,
          hasUnitDiagnostics: counters.unitConversions > 0,
          hasUnitMismatches: counters.unitMismatches > 0,
          hasOverlayIssues: counters.nestedOverlayReferences > 0,
          hasDimensionSuppression: counters.suppressedDimensionText > 0 || counters.suppressedDimensionLines > 0
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

    _lookupTableNameByHandle(table, handle) {
      if (!table || !handle) {
        return null;
      }
      const normalized = normalizeHandle(handle);
      if (!normalized) {
        return null;
      }
      const entries = Object.keys(table);
      for (let idx = 0; idx < entries.length; idx += 1) {
        const name = entries[idx];
        const entry = table[name];
        if (!entry) {
          continue;
        }
        const entryHandle = entry.handle ? normalizeHandle(entry.handle) : null;
        if (entryHandle && entryHandle === normalized) {
          return name;
        }
      }
      return null;
    }

    _matchTableNameCaseInsensitive(table, candidate) {
      if (!table || !candidate) {
        return null;
      }
      const trimmed = String(candidate).trim();
      if (!trimmed) {
        return null;
      }
      if (Object.prototype.hasOwnProperty.call(table, trimmed)) {
        return trimmed;
      }
      const upper = trimmed.toUpperCase();
      const entries = Object.keys(table);
      for (let idx = 0; idx < entries.length; idx += 1) {
        const name = entries[idx];
        if (String(name).toUpperCase() === upper) {
          return name;
        }
      }
      return null;
    }

    resolveEntityDefaults(defaults, tables = {}) {
      if (!defaults || typeof defaults !== 'object') {
        return null;
      }
      const result = {
        linetype: null,
        linetypeHandle: null,
        lineweight: Number.isFinite(defaults.lineweight) ? defaults.lineweight : null,
        textStyle: null,
        textStyleHandle: null,
        dimStyle: null,
        dimStyleHandle: null
      };

      if (defaults.linetype) {
        const lt = String(defaults.linetype).trim();
        if (lt) {
          result.linetype = lt;
        }
      }
      if (defaults.linetypeHandle) {
        const normalized = normalizeHandle(defaults.linetypeHandle);
        if (normalized) {
          result.linetypeHandle = normalized;
        }
      }
      if (!result.linetype && result.linetypeHandle && tables && tables.linetypes) {
        const name = this._lookupTableNameByHandle(tables.linetypes, result.linetypeHandle);
        if (name) {
          result.linetype = name;
        }
      }

      if (defaults.textStyleHandle) {
        const normalized = normalizeHandle(defaults.textStyleHandle);
        if (normalized) {
          result.textStyleHandle = normalized;
        }
      }
      if (defaults.textStyle) {
        const resolved = this._matchTableNameCaseInsensitive(tables.textStyles, defaults.textStyle) || String(defaults.textStyle).trim();
        if (resolved) {
          result.textStyle = resolved;
        }
      }
      if (!result.textStyle && result.textStyleHandle && tables && tables.textStyles) {
        const name = this._lookupTableNameByHandle(tables.textStyles, result.textStyleHandle);
        if (name) {
          result.textStyle = name;
        }
      }

      if (defaults.dimStyleHandle) {
        const normalized = normalizeHandle(defaults.dimStyleHandle);
        if (normalized) {
          result.dimStyleHandle = normalized;
        }
      }
      if (defaults.dimStyle) {
        const resolved = this._matchTableNameCaseInsensitive(tables.dimStyles, defaults.dimStyle) || String(defaults.dimStyle).trim();
        if (resolved) {
          result.dimStyle = resolved;
        }
      }
      if (!result.dimStyle && result.dimStyleHandle && tables && tables.dimStyles) {
        const name = this._lookupTableNameByHandle(tables.dimStyles, result.dimStyleHandle);
        if (name) {
          result.dimStyle = name;
        }
      }

      const hasValue = Object.keys(result).some((key) => result[key] != null);
      return hasValue ? result : null;
    }

    resolveDisplaySettings(settings) {
      if (!settings || typeof settings !== 'object') {
        return null;
      }
      const pointMode = Number.isFinite(settings.pointMode) ? settings.pointMode : 0;
      const pointSize = Number.isFinite(settings.pointSize) ? settings.pointSize : null;
      const fillMode = settings.fillMode != null ? settings.fillMode : 1;
      const mirrorText = settings.mirrorText != null ? settings.mirrorText : 1;
      const traceWidth = Number.isFinite(settings.traceWidth) ? settings.traceWidth : null;
      return {
        point: {
          mode: pointMode,
          size: pointSize
        },
        fillMode,
        mirrorText,
        traceWidth
      };
    }

    resolveCoordinateDefaults(source) {
      if (!source || typeof source !== 'object') {
        return null;
      }

      const coerce = (value) => {
        const floatVal = toFloat(value);
        if (floatVal != null) {
          return floatVal;
        }
        if (Number.isFinite(value)) {
          return value;
        }
        return null;
      };

      const ensureVector = (vec, fallback) => {
        const result = {
          x: fallback && Number.isFinite(fallback.x) ? fallback.x : 0,
          y: fallback && Number.isFinite(fallback.y) ? fallback.y : 0,
          z: fallback && Number.isFinite(fallback.z) ? fallback.z : 0
        };
        if (vec && typeof vec === 'object') {
          const x = coerce(vec.x);
          const y = coerce(vec.y);
          const z = coerce(vec.z);
          if (x != null) result.x = x;
          if (y != null) result.y = y;
          if (z != null) result.z = z;
        }
        return result;
      };

      const vectorLength = (vector) => {
        if (!vector) return 0;
        return Math.hypot(
          Number.isFinite(vector.x) ? vector.x : 0,
          Number.isFinite(vector.y) ? vector.y : 0,
          Number.isFinite(vector.z) ? vector.z : 0
        );
      };

      const normalizeVectorLocal = (vector, fallback) => {
        const length = vectorLength(vector);
        if (length < 1e-9) {
          if (fallback) {
            return { x: fallback.x, y: fallback.y, z: fallback.z };
          }
          return null;
        }
        return {
          x: (Number.isFinite(vector.x) ? vector.x : 0) / length,
          y: (Number.isFinite(vector.y) ? vector.y : 0) / length,
          z: (Number.isFinite(vector.z) ? vector.z : 0) / length
        };
      };

      const cross = (a, b) => ({
        x: (a.y || 0) * (b.z || 0) - (a.z || 0) * (b.y || 0),
        y: (a.z || 0) * (b.x || 0) - (a.x || 0) * (b.z || 0),
        z: (a.x || 0) * (b.y || 0) - (a.y || 0) * (b.x || 0)
      });

      const defaultXAxis = { x: 1, y: 0, z: 0 };
      const defaultYAxis = { x: 0, y: 1, z: 0 };
      const defaultZAxis = { x: 0, y: 0, z: 1 };

      const model = source.modelUcs || {};
      const modelOrigin = ensureVector(model.origin, { x: 0, y: 0, z: 0 });
      let modelXAxis = normalizeVectorLocal(ensureVector(model.xAxis, defaultXAxis), defaultXAxis);
      if (!modelXAxis) modelXAxis = { x: 1, y: 0, z: 0 };
      let modelYAxis = normalizeVectorLocal(ensureVector(model.yAxis, defaultYAxis), null);
      if (!modelYAxis) {
        modelYAxis = { x: 0, y: 1, z: 0 };
      }
      let modelZAxis = normalizeVectorLocal(cross(modelXAxis, modelYAxis), defaultZAxis);
      if (!modelZAxis) {
        modelZAxis = { x: 0, y: 0, z: 1 };
      }
      modelYAxis = normalizeVectorLocal(cross(modelZAxis, modelXAxis), defaultYAxis) || { x: 0, y: 1, z: 0 };

      const paper = source.paperUcs || {};
      const paperOrigin = ensureVector(paper.origin, { x: 0, y: 0, z: 0 });
      let paperXAxis = normalizeVectorLocal(ensureVector(paper.xAxis, defaultXAxis), defaultXAxis);
      if (!paperXAxis) paperXAxis = { x: 1, y: 0, z: 0 };
      let paperYAxis = normalizeVectorLocal(ensureVector(paper.yAxis, defaultYAxis), null);
      if (!paperYAxis) {
        paperYAxis = { x: 0, y: 1, z: 0 };
      }
      let paperZAxis = normalizeVectorLocal(cross(paperXAxis, paperYAxis), defaultZAxis);
      if (!paperZAxis) {
        paperZAxis = { x: 0, y: 0, z: 1 };
      }
      paperYAxis = normalizeVectorLocal(cross(paperZAxis, paperXAxis), defaultYAxis) || { x: 0, y: 1, z: 0 };

      const view = source.view || {};
      const viewDirectionRaw = ensureVector(view.direction, null);
      const viewPointRaw = ensureVector(view.vpoint, null);
      const viewDirection = normalizeVectorLocal(viewDirectionRaw, null)
        || normalizeVectorLocal(viewPointRaw, defaultZAxis)
        || { x: 0, y: 0, z: 1 };
      const viewTarget = ensureVector(view.target, modelOrigin);
      const viewTwist = Number.isFinite(view.twist) ? view.twist : 0;

      return {
        modelUcs: {
          name: (model.name && String(model.name).trim()) || null,
          origin: modelOrigin,
          xAxis: modelXAxis,
          yAxis: modelYAxis,
          zAxis: modelZAxis
        },
        paperUcs: {
          name: (paper.name && String(paper.name).trim()) || null,
          origin: paperOrigin,
          xAxis: paperXAxis,
          yAxis: paperYAxis,
          zAxis: paperZAxis
        },
        view: {
          direction: viewDirection,
          vpoint: normalizeVectorLocal(viewPointRaw, defaultZAxis) || { x: 0, y: 0, z: 1 },
          target: viewTarget,
          twist: viewTwist
        }
      };
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
      const dimStyleMap = new Map();
      const tableStyleMap = new Map();
      const mlineStyleMap = new Map();
      const scaleMap = new Map();
      const appIdMap = new Map();
      const regAppMap = new Map();
      const viewMap = new Map();

      const collections = {
        LAYER: layerMap,
        LTYPE: linetypeMap,
        STYLE: textStyleMap,
        VISUALSTYLE: visualStyleMap,
        BLOCK_RECORD: blockRecordMap,
        MULTILEADERSTYLE: multiLeaderStyleMap,
        UCS: ucsMap,
        VPORT: vportMap,
        DIMSTYLE: dimStyleMap,
        TABLESTYLE: tableStyleMap,
        MLINESTYLE: mlineStyleMap,
        SCALE: scaleMap,
        APPID: appIdMap,
        REGAPP: regAppMap,
        VIEW: viewMap
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
        vports: utils.mapToPlainObject(vportMap),
        dimStyles: utils.mapToPlainObject(dimStyleMap),
        tableStyles: utils.mapToPlainObject(tableStyleMap),
        mlineStyles: utils.mapToPlainObject(mlineStyleMap),
        scales: utils.mapToPlainObject(scaleMap),
        appIds: utils.mapToPlainObject(appIdMap),
        regApps: utils.mapToPlainObject(regAppMap),
        views: utils.mapToPlainObject(viewMap)
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

    extractAuxiliaryObjects() {
      const imageDefinitions = { byHandle: Object.create(null), list: [] };
      const imageDefReactors = { byHandle: Object.create(null), list: [] };
      let rasterVariables = null;
      const underlayDefinitions = { byHandle: Object.create(null), list: [] };
      const pointCloudDefinitions = { byHandle: Object.create(null), list: [] };
      const pointCloudReactors = { byHandle: Object.create(null), list: [] };
      const pointCloudExRecords = { byHandle: Object.create(null), list: [] };
      const sectionViewStyles = { byHandle: Object.create(null), list: [] };
      const detailViewStyles = { byHandle: Object.create(null), list: [] };
      const sectionObjects = { byHandle: Object.create(null), list: [] };
      const sectionGeometries = { byHandle: Object.create(null), list: [] };
      const detailViewObjects = { byHandle: Object.create(null), list: [] };
      const proxyObjects = { byHandle: Object.create(null), list: [] };
      const datalinks = { byHandle: Object.create(null), list: [] };
      const dictionaryVariables = { byName: Object.create(null), list: [] };
      const lightLists = { byHandle: Object.create(null), list: [] };
      const dictionaries = { byHandle: Object.create(null), list: [] };
      const xrecords = { byHandle: Object.create(null), list: [] };
      const spatialFilters = { byHandle: Object.create(null), list: [] };

      let section = null;
      let i = 0;

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

          if (section === 'OBJECTS') {
            if (upperValue === 'DICTIONARY' || upperValue === 'ACDBDICTIONARYWDFLT') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const dictionary = parseDictionaryObject(objectTags);
              dictionary.type = upperValue;
              if (dictionary) {
                if (dictionary.handleUpper) {
                  dictionaries.byHandle[dictionary.handleUpper] = dictionary;
                }
                if (dictionary.handle && !dictionaries.byHandle[dictionary.handle]) {
                  dictionaries.byHandle[dictionary.handle] = dictionary;
                }
                dictionaries.list.push(dictionary);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'XRECORD') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const xrecord = this.parseXRecord(objectTags);
              if (xrecord) {
                if (xrecord.handleUpper) {
                  xrecords.byHandle[xrecord.handleUpper] = xrecord;
                }
                if (xrecord.handle && !xrecords.byHandle[xrecord.handle]) {
                  xrecords.byHandle[xrecord.handle] = xrecord;
                }
                xrecords.list.push(xrecord);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'SPATIAL_FILTER') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const filter = this.parseSpatialFilter(objectTags);
              if (filter) {
                if (filter.handleUpper) {
                  spatialFilters.byHandle[filter.handleUpper] = filter;
                }
                if (filter.handle && !spatialFilters.byHandle[filter.handle]) {
                  spatialFilters.byHandle[filter.handle] = filter;
                }
                spatialFilters.list.push(filter);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'IMAGEDEF') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const descriptor = this.parseImageDefinition(objectTags);
              if (descriptor) {
                if (descriptor.handleUpper) {
                  imageDefinitions.byHandle[descriptor.handleUpper] = descriptor;
                }
                if (descriptor.handle && !imageDefinitions.byHandle[descriptor.handle]) {
                  imageDefinitions.byHandle[descriptor.handle] = descriptor;
                }
                imageDefinitions.list.push(descriptor);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'IMAGEDEF_REACTOR') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const reactor = this.parseImageDefReactor(objectTags);
              if (reactor) {
                if (reactor.handleUpper) {
                  imageDefReactors.byHandle[reactor.handleUpper] = reactor;
                }
                if (reactor.handle && !imageDefReactors.byHandle[reactor.handle]) {
                  imageDefReactors.byHandle[reactor.handle] = reactor;
                }
                imageDefReactors.list.push(reactor);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'RASTERVARIABLES') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              rasterVariables = this.parseRasterVariables(objectTags);
              i = nextIndex;
              continue;
            }

            if (upperValue === 'PDFUNDERLAYDEFINITION' ||
              upperValue === 'DWFUNDERLAYDEFINITION' ||
              upperValue === 'DGNUNDERLAYDEFINITION') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const def = this.parseUnderlayDefinition(upperValue, objectTags);
              if (def) {
                const handleKey = def.handleUpper || def.handle;
                if (handleKey) {
                  underlayDefinitions.byHandle[handleKey] = def;
                }
                underlayDefinitions.list.push(def);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'POINTCLOUDDEF') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const def = this.parsePointCloudDefinition(objectTags);
              if (def) {
                const handleKey = def.handleUpper || def.handle;
                if (handleKey) {
                  pointCloudDefinitions.byHandle[handleKey] = def;
                }
                pointCloudDefinitions.list.push(def);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'POINTCLOUDDEF_REACTOR') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const reactor = this.parsePointCloudDefReactor(objectTags);
              if (reactor) {
                const handleKey = reactor.handleUpper || reactor.handle;
                if (handleKey) {
                  pointCloudReactors.byHandle[handleKey] = reactor;
                }
                pointCloudReactors.list.push(reactor);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'POINTCLOUDDEF_EX') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const exRecord = this.parsePointCloudExRecord(objectTags);
              if (exRecord) {
                const handleKey = exRecord.handleUpper || exRecord.handle;
                if (handleKey) {
                  pointCloudExRecords.byHandle[handleKey] = exRecord;
                }
                pointCloudExRecords.list.push(exRecord);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'SECTIONVIEWSTYLE' || upperValue === 'DETAILVIEWSTYLE') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const style = this.parseViewStyle(upperValue, objectTags);
              if (style) {
                const handleKey = style.handleUpper || style.handle;
                if (upperValue === 'SECTIONVIEWSTYLE') {
                  if (handleKey) {
                    sectionViewStyles.byHandle[handleKey] = style;
                  }
                  sectionViewStyles.list.push(style);
                } else {
                  if (handleKey) {
                    detailViewStyles.byHandle[handleKey] = style;
                  }
                  detailViewStyles.list.push(style);
                }
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'SECTIONOBJECT') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const sectionObject = this.parseSectionObject(objectTags);
              if (sectionObject) {
                const handleKey = sectionObject.handleUpper || sectionObject.handle;
                if (handleKey) {
                  sectionObjects.byHandle[handleKey] = sectionObject;
                }
                sectionObjects.list.push(sectionObject);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'SECTIONGEOMETRY') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const sectionGeometry = this.parseSectionGeometry(objectTags);
              if (sectionGeometry) {
                const handleKey = sectionGeometry.handleUpper || sectionGeometry.handle;
                if (handleKey) {
                  sectionGeometries.byHandle[handleKey] = sectionGeometry;
                }
                sectionGeometries.list.push(sectionGeometry);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'DETAILVIEWOBJECT') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const detailObject = this.parseDetailViewObject(objectTags);
              if (detailObject) {
                const handleKey = detailObject.handleUpper || detailObject.handle;
                if (handleKey) {
                  detailViewObjects.byHandle[handleKey] = detailObject;
                }
                detailViewObjects.list.push(detailObject);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'ACAD_PROXY_OBJECT') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const proxy = this.parseProxyObject(objectTags);
              if (proxy) {
                const handleKey = proxy.handleUpper || proxy.handle;
                if (handleKey) {
                  proxyObjects.byHandle[handleKey] = proxy;
                }
                proxyObjects.list.push(proxy);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'DATALINK') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const link = this.parseDatalinkObject(objectTags);
              if (link) {
                const handleKey = link.handleUpper || link.handle;
                if (handleKey) {
                  datalinks.byHandle[handleKey] = link;
                }
                datalinks.list.push(link);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'DICTIONARYVAR') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const dictVar = this.parseDictionaryVar(objectTags);
              if (dictVar) {
                const key = dictVar.nameUpper || dictVar.name || dictVar.handleUpper || dictVar.handle;
                if (key) {
                  dictionaryVariables.byName[key] = dictVar;
                }
                dictionaryVariables.list.push(dictVar);
              }
              i = nextIndex;
              continue;
            }

            if (upperValue === 'LIGHTLIST') {
              const { tags: objectTags, nextIndex } = this.collectEntityTags(i + 1);
              const listEntry = this.parseLightList(objectTags);
              if (listEntry) {
                const handleKey = listEntry.handleUpper || listEntry.handle;
                if (handleKey) {
                  lightLists.byHandle[handleKey] = listEntry;
                }
                lightLists.list.push(listEntry);
              }
              i = nextIndex;
              continue;
            }
          }
        }

        i += 1;
      }

      return {
        imageDefinitions,
        imageDefReactors,
        rasterVariables,
        underlayDefinitions,
        pointClouds: {
          definitions: pointCloudDefinitions,
          reactors: pointCloudReactors,
          exRecords: pointCloudExRecords
        },
        sectionViewStyles,
        detailViewStyles,
        sectionObjects,
        sectionGeometries,
        detailViewObjects,
        proxyObjects,
        datalinks,
        dictionaryVariables,
        lightLists,
        dictionaries,
        xrecords,
        spatialFilters
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

    parseImageDefinition(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      return {
        type: 'IMAGEDEF',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        filePath: utils.getFirstCodeValue(tags, 1) || null,
        className: utils.getFirstCodeValue(tags, 2) || null,
        imageSize: {
          width: utils.toFloat(utils.getFirstCodeValue(tags, 10)),
          height: utils.toFloat(utils.getFirstCodeValue(tags, 20))
        },
        pixelSize: {
          width: utils.toFloat(utils.getFirstCodeValue(tags, 11)),
          height: utils.toFloat(utils.getFirstCodeValue(tags, 21))
        },
        resolution: {
          x: utils.toFloat(utils.getFirstCodeValue(tags, 12)),
          y: utils.toFloat(utils.getFirstCodeValue(tags, 22))
        },
        loaded: (utils.toInt(utils.getFirstCodeValue(tags, 280)) || 0) !== 0,
        codeValues: this._buildCodeLookup(tags),
        rawTags: this._mapRawTags(tags)
      };
    }

    parseImageDefReactor(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      return {
        type: 'IMAGEDEF_REACTOR',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        imageDefinitionHandle: utils.getFirstCodeValue(tags, 331) || null,
        imageEntityHandle: utils.getFirstCodeValue(tags, 340) || null,
        rawTags: this._mapRawTags(tags)
      };
    }

    parseRasterVariables(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      return {
        type: 'RASTERVARIABLES',
        displayFrame: utils.toInt(utils.getFirstCodeValue(tags, 70)) || 0,
        displayQuality: utils.toInt(utils.getFirstCodeValue(tags, 71)) || 0,
        units: utils.toInt(utils.getFirstCodeValue(tags, 72)) || 0,
        brightness: utils.toInt(utils.getFirstCodeValue(tags, 280)) ?? null,
        contrast: utils.toInt(utils.getFirstCodeValue(tags, 281)) ?? null,
        fade: utils.toInt(utils.getFirstCodeValue(tags, 282)) ?? null,
        codeValues: this._buildCodeLookup(tags),
        rawTags: this._mapRawTags(tags)
      };
    }

    parseUnderlayDefinition(type, tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      return {
        type,
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        sourceFile: utils.getFirstCodeValue(tags, 1) || null,
        name: utils.getFirstCodeValue(tags, 2) || null,
        description: utils.getFirstCodeValue(tags, 3) || null,
        flags: utils.toInt(utils.getFirstCodeValue(tags, 70)) || 0,
        codeValues: this._buildCodeLookup(tags),
        rawTags: this._mapRawTags(tags)
      };
    }

    parsePointCloudDefinition(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      const codeLookup = this._buildCodeLookup(tags);
      return {
        type: 'POINTCLOUDDEF',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        filePath: utils.getFirstCodeValue(tags, 1) || null,
        dataSource: utils.getFirstCodeValue(tags, 3) || null,
        description: utils.getFirstCodeValue(tags, 300) || null,
        pointCount: utils.toInt(utils.getFirstCodeValue(tags, 90)) || null,
        codeValues: codeLookup,
        rawTags: this._mapRawTags(tags)
      };
    }

    parsePointCloudDefReactor(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      return {
        type: 'POINTCLOUDDEF_REACTOR',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        pointCloudHandle: utils.getFirstCodeValue(tags, 331) || null,
        entityHandle: utils.getFirstCodeValue(tags, 340) || null,
        rawTags: this._mapRawTags(tags)
      };
    }

    parsePointCloudExRecord(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      return {
        type: 'POINTCLOUDDEF_EX',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        codeValues: this._buildCodeLookup(tags),
        rawTags: this._mapRawTags(tags)
      };
    }

    parseXRecord(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      return {
        type: 'XRECORD',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        codeValues: this._buildCodeLookup(tags),
        rawTags: this._mapRawTags(tags)
      };
    }

    parseSpatialFilter(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      const safeFloat = (value, fallback = 0) => {
        const numeric = utils.toFloat ? utils.toFloat(value) : parseFloat(value);
        return Number.isFinite(numeric) ? numeric : fallback;
      };
      const safeInt = (value, fallback = 0) => {
        const numeric = utils.toInt ? utils.toInt(value) : parseInt(value, 10);
        return Number.isFinite(numeric) ? numeric : fallback;
      };
      const boundary = [];
      let pointCount = null;
      const extrusion = { x: 0, y: 0, z: 1 };
      const origin = { x: 0, y: 0, z: 0 };
      let clippingEnabled = null;
      let frontClipEnabled = null;
      let backClipEnabled = null;
      let frontClipDistance = null;
      let backClipDistance = null;
      const matrixValues = [];
      tags.forEach((tag) => {
        const code = Number(tag.code);
        const raw = tag.value;
        switch (code) {
          case 70:
            pointCount = safeInt(raw, null);
            break;
          case 10:
            boundary.push({
              x: safeFloat(raw, 0),
              y: 0
            });
            break;
          case 20:
            if (boundary.length) {
              boundary[boundary.length - 1].y = safeFloat(raw, 0);
            }
            break;
          case 210:
            extrusion.x = safeFloat(raw, extrusion.x);
            break;
          case 220:
            extrusion.y = safeFloat(raw, extrusion.y);
            break;
          case 230:
            extrusion.z = safeFloat(raw, extrusion.z);
            break;
          case 11:
            origin.x = safeFloat(raw, origin.x);
            break;
          case 21:
            origin.y = safeFloat(raw, origin.y);
            break;
          case 31:
            origin.z = safeFloat(raw, origin.z);
            break;
          case 71:
            clippingEnabled = safeInt(raw, 0) !== 0;
            break;
          case 72:
            frontClipEnabled = safeInt(raw, 0) !== 0;
            break;
          case 73:
            backClipEnabled = safeInt(raw, 0) !== 0;
            break;
          case 40: {
            const numeric = safeFloat(raw, 0);
            if (frontClipEnabled && frontClipDistance == null) {
              frontClipDistance = numeric;
            } else {
              matrixValues.push(numeric);
            }
            break;
          }
          case 41: {
            const numeric = safeFloat(raw, 0);
            if (backClipEnabled && backClipDistance == null) {
              backClipDistance = numeric;
            } else {
              matrixValues.push(numeric);
            }
            break;
          }
          default:
            break;
        }
      });
      if (pointCount != null && boundary.length > pointCount) {
        boundary.length = pointCount;
      }
      const toMatrixValues = (values) => {
        if (!Array.isArray(values) || values.length < 12) {
          return null;
        }
        return values.slice(0, 12).map((value) => (Number.isFinite(value) ? value : 0));
      };
      let inverseInsertMatrix = null;
      let clipBoundaryMatrix = null;
      if (matrixValues.length >= 24) {
        const trimmed = matrixValues.slice(-24);
        inverseInsertMatrix = toMatrixValues(trimmed.slice(0, 12));
        clipBoundaryMatrix = toMatrixValues(trimmed.slice(12));
      }
      return {
        type: 'SPATIAL_FILTER',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        pointCount,
        boundary,
        extrusion,
        origin,
        clippingEnabled,
        frontClip: {
          enabled: frontClipEnabled === true,
          distance: frontClipDistance
        },
        backClip: {
          enabled: backClipEnabled === true,
          distance: backClipDistance
        },
        inverseInsertMatrix,
        clipBoundaryMatrix,
        rawTags: this._mapRawTags(tags)
      };
    }

    parseSectionObject(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      const lookup = this._buildCodeLookup(tags);
      return {
        type: 'SECTIONOBJECT',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        name: utils.getFirstCodeValue(tags, 2) || null,
        description: utils.getFirstCodeValue(tags, 3) || null,
        sectionType: utils.toInt(utils.getFirstCodeValue(tags, 70)) || 0,
        state: utils.toInt(utils.getFirstCodeValue(tags, 90)) || 0,
        parameters: lookup,
        rawTags: this._mapRawTags(tags)
      };
    }

    parseSectionGeometry(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      const lookup = this._buildCodeLookup(tags);
      return {
        type: 'SECTIONGEOMETRY',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        linkedSection: utils.getFirstCodeValue(tags, 331) || null,
        parameters: lookup,
        rawTags: this._mapRawTags(tags)
      };
    }

    parseDetailViewObject(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      const lookup = this._buildCodeLookup(tags);
      return {
        type: 'DETAILVIEWOBJECT',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        label: utils.getFirstCodeValue(tags, 3) || null,
        scale: utils.toFloat(utils.getFirstCodeValue(tags, 40)) ?? null,
        viewStyleHandle: utils.getFirstCodeValue(tags, 340) || null,
        parameters: lookup,
        rawTags: this._mapRawTags(tags)
      };
    }

    parseViewStyle(type, tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      return {
        type,
        name: utils.getFirstCodeValue(tags, 2) || null,
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        description: utils.getFirstCodeValue(tags, 3) || null,
        flags: utils.toInt(utils.getFirstCodeValue(tags, 70)) || 0,
        codeValues: this._buildCodeLookup(tags),
        rawTags: this._mapRawTags(tags)
      };
    }

    parseProxyObject(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      const graphicsData = [];
      const stringData = [];
      tags.forEach((tag) => {
        const code = Number(tag.code);
        if (code === 310 || code === 311 || code === 312) {
          graphicsData.push(tag.value);
        } else if (code === 1000 || code === 1001) {
          stringData.push(tag.value);
        }
      });
      return {
        type: 'ACAD_PROXY_OBJECT',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        applicationClassId: utils.toInt(utils.getFirstCodeValue(tags, 90)) || null,
        originalDxfClassName: utils.getFirstCodeValue(tags, 91) || utils.getFirstCodeValue(tags, 1) || null,
        graphicsData,
        stringData,
        rawTags: this._mapRawTags(tags)
      };
    }

    parseDatalinkObject(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      return {
        type: 'DATALINK',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        name: utils.getFirstCodeValue(tags, 3) || null,
        description: utils.getFirstCodeValue(tags, 2) || null,
        connectionString: utils.getFirstCodeValue(tags, 1) || null,
        updateOption: utils.toInt(utils.getFirstCodeValue(tags, 70)) || 0,
        codeValues: this._buildCodeLookup(tags),
        rawTags: this._mapRawTags(tags)
      };
    }

    parseDictionaryVar(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      const name = utils.getFirstCodeValue(tags, 280) || utils.getFirstCodeValue(tags, 3) || null;
      return {
        type: 'DICTIONARYVAR',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        name,
        nameUpper: name ? String(name).trim().toUpperCase() : null,
        value: utils.getFirstCodeValue(tags, 1) || null,
        flags: utils.toInt(utils.getFirstCodeValue(tags, 70)) || 0,
        rawTags: this._mapRawTags(tags)
      };
    }

    parseLightList(tags) {
      if (!Array.isArray(tags) || !tags.length) {
        return null;
      }
      const handle = utils.getFirstCodeValue(tags, 5) || null;
      const owner = utils.getFirstCodeValue(tags, 330) || null;
      const lightHandles = [];
      tags.forEach((tag) => {
        if (Number(tag.code) === 330) {
          lightHandles.push(tag.value);
        }
      });
      return {
        type: 'LIGHTLIST',
        handle,
        handleUpper: normalizeHandle(handle),
        owner,
        ownerUpper: normalizeHandle(owner),
        lightHandles,
        rawTags: this._mapRawTags(tags)
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
        let flags = null;
        let units = null;
        let allowExploding = null;
        let scaleUniformly = null;
        for (let idx = 0; idx < recordTags.length; idx += 1) {
          const tag = recordTags[idx];
          const code = Number(tag.code);
          const parsed = utils.toInt(tag.value);
          if (code === 70) {
            if (Number.isFinite(parsed)) {
              flags = parsed;
            }
          } else if (code === 280) {
            if (parsed != null) {
              if (parsed === 0 || parsed === 1) {
                allowExploding = parsed !== 0;
              } else if (!Number.isFinite(units) && Number.isFinite(parsed)) {
                units = parsed;
              }
            }
          } else if (code === 281) {
            if (parsed != null) {
              scaleUniformly = parsed !== 0;
            }
          }
        }
        collections[upperTable].set(name, {
          name,
          handle: utils.getFirstCodeValue(recordTags, 5) || null,
          layoutHandle: utils.getFirstCodeValue(recordTags, 340) || null,
          designCenterPath: utils.getFirstCodeValue(recordTags, 402) || null,
          flags: Number.isFinite(flags) ? flags : 0,
          units: Number.isFinite(units) ? units : null,
          allowExploding: allowExploding,
          scaleUniformly: scaleUniformly
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

      if (upperTable === 'DIMSTYLE' && recordType === 'DIMSTYLE') {
        const handle = utils.getFirstCodeValue(recordTags, 5) || null;
        const owner = utils.getFirstCodeValue(recordTags, 330) || null;
        const codeLookup = this._buildCodeLookup(recordTags);
        const parsedDimStyle = this._decodeDimStyle(codeLookup);
        collections[upperTable].set(name, {
          name,
          handle,
          handleUpper: normalizeHandle(handle),
          owner,
          ownerUpper: normalizeHandle(owner),
          description: utils.getFirstCodeValue(recordTags, 3) || null,
          flags: utils.toInt(utils.getFirstCodeValue(recordTags, 70)) || 0,
          dimensionType: utils.toInt(utils.getFirstCodeValue(recordTags, 71)) || 0,
          parameters: parsedDimStyle.parameters,
          toggles: parsedDimStyle.toggles,
          measurement: parsedDimStyle.measurement,
          alternateUnits: parsedDimStyle.alternateUnits,
          references: parsedDimStyle.references,
          colors: parsedDimStyle.colors,
          lineweights: parsedDimStyle.lineweights,
          rawFlagCodes: parsedDimStyle.rawFlagCodes,
          codeValues: codeLookup,
          rawTags: this._mapRawTags(recordTags)
        });
        return;
      }

      if (upperTable === 'TABLESTYLE' && recordType === 'TABLESTYLE') {
        const handle = utils.getFirstCodeValue(recordTags, 5) || null;
        const owner = utils.getFirstCodeValue(recordTags, 330) || null;
        const codeLookup = this._buildCodeLookup(recordTags);
        const cellMeta = new Map();
        let currentCell = null;
        recordTags.forEach((tag) => {
          const code = Number(tag.code);
          switch (code) {
            case 171:
              if (currentCell) {
                cellMeta.set(`cell-${currentCell.id}`, currentCell);
              }
              currentCell = {
                id: utils.toInt(tag.value) || 0,
                properties: Object.create(null)
              };
              break;
            case 172:
            case 173:
            case 174:
            case 175:
            case 176:
            case 177:
            case 178:
            case 179:
            case 271:
            case 272:
            case 273:
              if (currentCell) {
                currentCell.properties[`i${code}`] = utils.toInt(tag.value) || 0;
              }
              break;
            case 90:
            case 91:
            case 92:
              if (currentCell) {
                currentCell.properties[`n${code}`] = utils.toFloat(tag.value) ?? null;
              }
              break;
            default:
              break;
          }
        });
        if (currentCell) {
          cellMeta.set(`cell-${currentCell.id}`, currentCell);
        }
        collections[upperTable].set(name, {
          name,
          handle,
          handleUpper: normalizeHandle(handle),
          owner,
          ownerUpper: normalizeHandle(owner),
          description: utils.getFirstCodeValue(recordTags, 3) || null,
          flags: utils.toInt(utils.getFirstCodeValue(recordTags, 70)) || 0,
          codeValues: codeLookup,
          cellStyles: utils.mapToPlainObject(cellMeta),
          rawTags: this._mapRawTags(recordTags)
        });
        return;
      }

      if (upperTable === 'MLINESTYLE' && recordType === 'MLINESTYLE') {
        const handle = utils.getFirstCodeValue(recordTags, 5) || null;
        const owner = utils.getFirstCodeValue(recordTags, 330) || null;
        const codeLookup = this._buildCodeLookup(recordTags);
        const elements = [];
        let currentElement = null;
        recordTags.forEach((tag) => {
          const code = Number(tag.code);
          const rawValue = tag.value;
          switch (code) {
            case 49:
              if (currentElement) {
                elements.push(currentElement);
              }
              currentElement = {
                offset: utils.toFloat(rawValue) ?? 0,
                colorNumber: null,
                trueColor: null,
                linetype: null,
                lineweight: null
              };
              break;
            case 62:
              if (currentElement) {
                currentElement.colorNumber = utils.toInt(rawValue) ?? null;
              }
              break;
            case 420:
            case 421:
              if (currentElement) {
                currentElement.trueColor = utils.parseTrueColor
                  ? utils.parseTrueColor(rawValue)
                  : null;
              }
              break;
            case 6:
              if (currentElement) {
                currentElement.linetype = typeof rawValue === 'string'
                  ? rawValue.trim()
                  : (rawValue != null ? String(rawValue) : null);
              }
              break;
            case 51:
              if (currentElement) {
                currentElement.lineweight = utils.toFloat(rawValue) ?? null;
              }
              break;
            default:
              break;
          }
        });
        if (currentElement) {
          elements.push(currentElement);
        }
        const flags = utils.toInt(utils.getFirstCodeValue(recordTags, 70)) || 0;
        const capsFlags = utils.toInt(utils.getFirstCodeValue(recordTags, 71)) || 0;
        collections[upperTable].set(name, {
          name,
          handle,
          handleUpper: normalizeHandle(handle),
          owner,
          ownerUpper: normalizeHandle(owner),
          description: utils.getFirstCodeValue(recordTags, 3) || null,
          flags,
          caps: {
            startSuppressed: (capsFlags & 2) !== 0,
            endSuppressed: (capsFlags & 4) !== 0,
            jointsDisplayed: (capsFlags & 8) !== 0
          },
          fillColor: (() => {
            const colorNumber = utils.toInt(utils.getFirstCodeValue(recordTags, 62));
            const trueColorRaw = utils.getFirstCodeValue(recordTags, 421) || utils.getFirstCodeValue(recordTags, 420);
            return {
              colorNumber,
              trueColor: trueColorRaw ? utils.parseTrueColor(trueColorRaw) : null
            };
          })(),
          elements,
          codeValues: codeLookup,
          rawTags: this._mapRawTags(recordTags)
        });
        return;
      }

      if (upperTable === 'SCALE' && recordType === 'SCALE') {
        const handle = utils.getFirstCodeValue(recordTags, 5) || null;
        const owner = utils.getFirstCodeValue(recordTags, 330) || null;
        const codeLookup = this._buildCodeLookup(recordTags);
        collections[upperTable].set(name, {
          name,
          handle,
          handleUpper: normalizeHandle(handle),
          owner,
          ownerUpper: normalizeHandle(owner),
          description: utils.getFirstCodeValue(recordTags, 3) || null,
          flags: utils.toInt(utils.getFirstCodeValue(recordTags, 70)) || 0,
          paperUnits: utils.toFloat(utils.getFirstCodeValue(recordTags, 40)) ?? null,
          drawingUnits: utils.toFloat(utils.getFirstCodeValue(recordTags, 41)) ?? null,
          codeValues: codeLookup,
          rawTags: this._mapRawTags(recordTags)
        });
        return;
      }

      if (upperTable === 'APPID' && recordType === 'APPID') {
        const handle = utils.getFirstCodeValue(recordTags, 5) || null;
        const owner = utils.getFirstCodeValue(recordTags, 330) || null;
        collections[upperTable].set(name, {
          name,
          handle,
          handleUpper: normalizeHandle(handle),
          owner,
          ownerUpper: normalizeHandle(owner),
          flags: utils.toInt(utils.getFirstCodeValue(recordTags, 70)) || 0,
          rawTags: this._mapRawTags(recordTags)
        });
        return;
      }

      if (upperTable === 'REGAPP' && recordType === 'REGAPP') {
        const handle = utils.getFirstCodeValue(recordTags, 5) || null;
        const owner = utils.getFirstCodeValue(recordTags, 330) || null;
        collections[upperTable].set(name, {
          name,
          handle,
          handleUpper: normalizeHandle(handle),
          owner,
          ownerUpper: normalizeHandle(owner),
          flags: utils.toInt(utils.getFirstCodeValue(recordTags, 70)) || 0,
          rawTags: this._mapRawTags(recordTags)
        });
        return;
      }

      if (upperTable === 'VIEW' && recordType === 'VIEW') {
        const handle = utils.getFirstCodeValue(recordTags, 5) || null;
        const owner = utils.getFirstCodeValue(recordTags, 330) || null;
        const codeLookup = this._buildCodeLookup(recordTags);
        collections[upperTable].set(name, {
          name,
          handle,
          handleUpper: normalizeHandle(handle),
          owner,
          ownerUpper: normalizeHandle(owner),
          description: utils.getFirstCodeValue(recordTags, 3) || null,
          flags: utils.toInt(utils.getFirstCodeValue(recordTags, 70)) || 0,
          height: utils.toFloat(utils.getFirstCodeValue(recordTags, 40)) ?? null,
          width: utils.toFloat(utils.getFirstCodeValue(recordTags, 41)) ?? null,
          center: this._extractPointFromLookup(codeLookup, 10, 20, 30),
          target: this._extractPointFromLookup(codeLookup, 11, 21, 31),
          direction: this._extractPointFromLookup(codeLookup, 16, 26, 36),
          lensLength: utils.toFloat(utils.getFirstCodeValue(recordTags, 42)) ?? null,
          frontClip: utils.toFloat(utils.getFirstCodeValue(recordTags, 43)) ?? null,
          backClip: utils.toFloat(utils.getFirstCodeValue(recordTags, 44)) ?? null,
          twist: utils.toFloat(utils.getFirstCodeValue(recordTags, 50)) ?? null,
          viewMode: utils.toInt(utils.getFirstCodeValue(recordTags, 71)) || 0,
          renderMode: utils.toInt(utils.getFirstCodeValue(recordTags, 72)) || 0,
          codeValues: codeLookup,
          rawTags: this._mapRawTags(recordTags)
        });
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

    extractEntities(
      tables,
      materialCatalog = {},
      auxiliaryObjects = {},
      entityDefaults = null,
      coordinateDefaults = null,
      displaySettings = null,
      drawingProperties = null
    ) {
      const entities = [];
      const blocks = [];
      let section = null;
      let currentBlock = null;
      const pendingStack = [];
      let i = 0;
      const materialsByHandle = materialCatalog && materialCatalog.byHandle
        ? materialCatalog.byHandle
        : {};
      const pointCloudResources = auxiliaryObjects.pointClouds || {};
      const pointCloudDefinitionsByHandle = pointCloudResources.definitions && pointCloudResources.definitions.byHandle
        ? pointCloudResources.definitions.byHandle
        : {};
      const pointCloudReactorsByHandle = pointCloudResources.reactors && pointCloudResources.reactors.byHandle
        ? pointCloudResources.reactors.byHandle
        : {};
      const pointCloudExRecordsByHandle = pointCloudResources.exRecords && pointCloudResources.exRecords.byHandle
        ? pointCloudResources.exRecords.byHandle
        : {};
      const dictionariesByHandle = auxiliaryObjects.dictionaries && auxiliaryObjects.dictionaries.byHandle
        ? auxiliaryObjects.dictionaries.byHandle
        : {};
      const xrecordsByHandle = auxiliaryObjects.xrecords && auxiliaryObjects.xrecords.byHandle
        ? auxiliaryObjects.xrecords.byHandle
        : {};
      const spatialFiltersByHandle = auxiliaryObjects.spatialFilters && auxiliaryObjects.spatialFilters.byHandle
        ? auxiliaryObjects.spatialFilters.byHandle
        : {};
      const imageDefinitionsByHandle = auxiliaryObjects.imageDefinitions && auxiliaryObjects.imageDefinitions.byHandle
        ? auxiliaryObjects.imageDefinitions.byHandle
        : {};
      const imageDefReactorsByHandle = auxiliaryObjects.imageDefReactors && auxiliaryObjects.imageDefReactors.byHandle
        ? auxiliaryObjects.imageDefReactors.byHandle
        : {};
      const underlayDefinitionsByHandle = auxiliaryObjects.underlayDefinitions && auxiliaryObjects.underlayDefinitions.byHandle
        ? auxiliaryObjects.underlayDefinitions.byHandle
        : {};
      const sectionViewStylesByHandle = auxiliaryObjects.sectionViewStyles && auxiliaryObjects.sectionViewStyles.byHandle
        ? auxiliaryObjects.sectionViewStyles.byHandle
        : {};
      const detailViewStylesByHandle = auxiliaryObjects.detailViewStyles && auxiliaryObjects.detailViewStyles.byHandle
        ? auxiliaryObjects.detailViewStyles.byHandle
        : {};
      const sectionObjectsByHandle = auxiliaryObjects.sectionObjects && auxiliaryObjects.sectionObjects.byHandle
        ? auxiliaryObjects.sectionObjects.byHandle
        : {};
      const sectionGeometriesByHandle = auxiliaryObjects.sectionGeometries && auxiliaryObjects.sectionGeometries.byHandle
        ? auxiliaryObjects.sectionGeometries.byHandle
        : {};
      const detailViewObjectsByHandle = auxiliaryObjects.detailViewObjects && auxiliaryObjects.detailViewObjects.byHandle
        ? auxiliaryObjects.detailViewObjects.byHandle
        : {};
      const proxyObjectsByHandle = auxiliaryObjects.proxyObjects && auxiliaryObjects.proxyObjects.byHandle
        ? auxiliaryObjects.proxyObjects.byHandle
        : {};
      const datalinksByHandle = auxiliaryObjects.datalinks && auxiliaryObjects.datalinks.byHandle
        ? auxiliaryObjects.datalinks.byHandle
        : {};
      const dictionaryVariablesByName = auxiliaryObjects.dictionaryVariables && auxiliaryObjects.dictionaryVariables.byName
        ? auxiliaryObjects.dictionaryVariables.byName
        : {};
      const lightListsByHandle = auxiliaryObjects.lightLists && auxiliaryObjects.lightLists.byHandle
        ? auxiliaryObjects.lightLists.byHandle
        : {};
      const resolvedEntityDefaults = entityDefaults && typeof entityDefaults === 'object'
        ? entityDefaults
        : null;
      const resolvedCoordinateDefaults = coordinateDefaults && typeof coordinateDefaults === 'object'
        ? coordinateDefaults
        : null;
      const resolvedDisplaySettings = displaySettings && typeof displaySettings === 'object'
        ? displaySettings
        : null;
      const textStylesByHandle = new Map();
      if (tables && tables.textStyles) {
        Object.keys(tables.textStyles).forEach((name) => {
          const entry = tables.textStyles[name];
          if (!entry || !entry.handle) {
            return;
          }
          const normalized = normalizeHandle(entry.handle);
          if (normalized) {
            textStylesByHandle.set(normalized, name);
          }
        });
      }
      const dimStylesByHandle = new Map();
      if (tables && tables.dimStyles) {
        Object.keys(tables.dimStyles).forEach((name) => {
          const entry = tables.dimStyles[name];
          if (!entry || !entry.handle) {
            return;
          }
          const normalized = normalizeHandle(entry.handle);
          if (normalized) {
            dimStylesByHandle.set(normalized, name);
          }
        });
      }

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
              imageDefinitions: imageDefinitionsByHandle,
              imageDefReactors: imageDefReactorsByHandle,
              underlayDefinitions: underlayDefinitionsByHandle,
              pointClouds: {
                definitions: pointCloudDefinitionsByHandle,
                reactors: pointCloudReactorsByHandle,
                exRecords: pointCloudExRecordsByHandle
              },
              sectionViewStyles: sectionViewStylesByHandle,
              detailViewStyles: detailViewStylesByHandle,
              proxyObjects: proxyObjectsByHandle,
              datalinks: datalinksByHandle,
              dictionaryVariables: dictionaryVariablesByName,
              lightLists: lightListsByHandle,
              dictionaries: dictionariesByHandle,
              xrecords: xrecordsByHandle,
              spatialFilters: spatialFiltersByHandle,
              rasterVariables: auxiliaryObjects.rasterVariables || null,
              createEntityId: (entType) => this.nextEntityId(entType),
              entityDefaults: resolvedEntityDefaults,
              coordinateDefaults: resolvedCoordinateDefaults,
              displaySettings: resolvedDisplaySettings,
              textStylesByHandle,
              dimStylesByHandle,
              units: drawingProperties ? (drawingProperties.units || null) : null
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
            imageDefinitions: imageDefinitionsByHandle,
            imageDefReactors: imageDefReactorsByHandle,
            underlayDefinitions: underlayDefinitionsByHandle,
            pointClouds: {
              definitions: pointCloudDefinitionsByHandle,
              reactors: pointCloudReactorsByHandle,
              exRecords: pointCloudExRecordsByHandle
            },
            sectionViewStyles: sectionViewStylesByHandle,
            detailViewStyles: detailViewStylesByHandle,
            sectionObjects: sectionObjectsByHandle,
            sectionGeometries: sectionGeometriesByHandle,
            detailViewObjects: detailViewObjectsByHandle,
            proxyObjects: proxyObjectsByHandle,
            datalinks: datalinksByHandle,
            dictionaryVariables: dictionaryVariablesByName,
            lightLists: lightListsByHandle,
            dictionaries: dictionariesByHandle,
            xrecords: xrecordsByHandle,
            spatialFilters: spatialFiltersByHandle,
            rasterVariables: auxiliaryObjects.rasterVariables || null,
            createEntityId: (entType) => this.nextEntityId(entType),
            entityDefaults: resolvedEntityDefaults,
            coordinateDefaults: resolvedCoordinateDefaults,
            displaySettings: resolvedDisplaySettings,
            textStylesByHandle,
            dimStylesByHandle,
            units: drawingProperties ? (drawingProperties.units || null) : null
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
            imageDefinitions: imageDefinitionsByHandle,
            imageDefReactors: imageDefReactorsByHandle,
            underlayDefinitions: underlayDefinitionsByHandle,
            pointClouds: {
              definitions: pointCloudDefinitionsByHandle,
              reactors: pointCloudReactorsByHandle,
              exRecords: pointCloudExRecordsByHandle
            },
            sectionViewStyles: sectionViewStylesByHandle,
            detailViewStyles: detailViewStylesByHandle,
            sectionObjects: sectionObjectsByHandle,
            sectionGeometries: sectionGeometriesByHandle,
            detailViewObjects: detailViewObjectsByHandle,
            proxyObjects: proxyObjectsByHandle,
            datalinks: datalinksByHandle,
            dictionaryVariables: dictionaryVariablesByName,
            lightLists: lightListsByHandle,
            rasterVariables: auxiliaryObjects.rasterVariables || null,
            createEntityId: (entType) => this.nextEntityId(entType),
            entityDefaults: resolvedEntityDefaults,
            coordinateDefaults: resolvedCoordinateDefaults,
            displaySettings: resolvedDisplaySettings,
            textStylesByHandle,
            dimStylesByHandle,
            units: drawingProperties ? (drawingProperties.units || null) : null
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

    _mapRawTags(tags) {
      if (!Array.isArray(tags)) {
        return [];
      }
      return tags.map((tag) => ({
        code: Number(tag.code),
        value: tag.value
      }));
    }

    _decodeDimStyle(codeLookup) {
      const pickFirst = (code) => {
        if (!codeLookup || !Object.prototype.hasOwnProperty.call(codeLookup, code)) {
          return null;
        }
        const values = codeLookup[code];
        if (!Array.isArray(values)) {
          return values != null ? values : null;
        }
        for (let i = 0; i < values.length; i += 1) {
          if (values[i] != null) {
            return values[i];
          }
        }
        return null;
      };
      const pickString = (code) => {
        const raw = pickFirst(code);
        if (raw == null) {
          return null;
        }
        const stringValue = typeof raw === 'string' ? raw : String(raw);
        const trimmed = stringValue.trim();
        return trimmed ? trimmed : null;
      };
      const pickFloat = (code) => {
        const raw = pickFirst(code);
        if (raw == null) {
          return null;
        }
        const numeric = utils.toFloat ? utils.toFloat(raw) : parseFloat(raw);
        return Number.isFinite(numeric) ? numeric : null;
      };
      const pickInt = (code) => {
        const raw = pickFirst(code);
        if (raw == null) {
          return null;
        }
        const numeric = utils.toInt ? utils.toInt(raw) : parseInt(raw, 10);
        return Number.isFinite(numeric) ? numeric : null;
      };
      const pickBool = (code) => {
        const numeric = pickInt(code);
        if (numeric == null) {
          return null;
        }
        return numeric !== 0;
      };
      const pickHandle = (code) => {
        const handle = pickString(code);
        if (!handle) {
          return null;
        }
        const normalized = normalizeHandle(handle);
        return {
          handle,
          handleUpper: normalized
        };
      };
      const prune = (record) => {
        if (!record || typeof record !== 'object') {
          return null;
        }
        const result = {};
        Object.keys(record).forEach((key) => {
          const value = record[key];
          if (value == null) {
            return;
          }
          if (typeof value === 'object' && !Array.isArray(value)) {
            const nested = prune(value);
            if (nested && Object.keys(nested).length) {
              result[key] = nested;
            }
          } else {
            result[key] = value;
          }
        });
        return Object.keys(result).length ? result : null;
      };

      const parameters = prune({
        overallScale: pickFloat(40),
        arrowSize: pickFloat(41),
        extensionOffset: pickFloat(42),
        dimensionLineIncrement: pickFloat(43),
        extensionExtension: pickFloat(44),
        roundDistance: pickFloat(45),
        dimensionLineExtension: pickFloat(46),
        tolerancePlus: pickFloat(47),
        toleranceMinus: pickFloat(48),
        jogAngle: pickFloat(49),
        textHeight: pickFloat(140),
        centerMarkSize: pickFloat(141),
        tickSize: pickFloat(142),
        alternateUnitScale: pickFloat(143),
        linearFactor: pickFloat(144),
        textVerticalPosition: pickFloat(145),
        toleranceScale: pickFloat(146),
        textGap: pickFloat(147),
        alternateUnitRounding: pickFloat(148)
      });

      const toggles = prune({
        textInsideHorizontal: pickBool(73),
        textOutsideHorizontal: pickBool(74),
        suppressFirstDimensionLine: pickBool(75),
        suppressSecondDimensionLine: pickBool(76),
        suppressExtensionLine1: pickBool(280),
        suppressExtensionLine2: pickBool(281),
        textInsideAlign: pickBool(282),
        textOutsideAlign: pickBool(283),
        forceTextInsideExtensions: pickBool(284),
        suppressOutsideExtensionLines: pickBool(285),
        arrowheadsMatchDimensionStyle: pickBool(286),
        scaleDimensionLineByOverallScale: pickBool(287),
        textFlipArrow: pickBool(288),
        suppressDimensionLine: pickBool(289)
      });

      const measurement = prune({
        toleranceEnabled: pickBool(71),
        limitsEnabled: pickBool(72),
        linearUnitFormat: pickInt(270),
        linearPrecision: pickInt(271),
        tolerancePrecision: pickInt(272),
        alternateUnitFormat: pickInt(273),
        alternateUnitPrecision: pickInt(274),
        angularUnitFormat: pickInt(275),
        angularPrecision: pickInt(276),
        fractionalFormat: pickInt(277),
        zeroSuppression: pickInt(278),
        angularZeroSuppression: pickInt(279),
        toleranceJustification: pickInt(175),
        toleranceZeroSuppression: pickInt(179),
        textMovement: pickInt(289),
        textJustification: pickInt(290)
      });

      const alternateUnits = prune({
        enabled: pickBool(170),
        multiplier: pickFloat(171),
        precision: pickInt(172),
        tolerancePrecision: pickInt(173),
        zeroSuppression: pickInt(174),
        toleranceZeroSuppression: pickInt(175),
        format: pickInt(176),
        rounding: pickFloat(148)
      });

      const text = prune({
        primary: pickString(3),
        alternate: pickString(4)
      });

      const references = prune({
        textStyle: pickHandle(340),
        leaderArrowBlock: pickHandle(341),
        arrowBlock: pickHandle(342),
        firstArrowBlock: pickHandle(343),
        secondArrowBlock: pickHandle(344),
        dimensionLineLinetype: pickHandle(346),
        extensionLine1Linetype: pickHandle(347),
        extensionLine2Linetype: pickHandle(348)
      });

      const colors = prune({
        dimensionLineColorNumber: pickInt(62),
        extensionLineColorNumber: pickInt(63),
        textColorNumber: pickInt(64),
        dimensionLineTrueColor: pickFirst(420),
        extensionLineTrueColor: pickFirst(421)
      });

      const lineweights = prune({
        dimensionLine: pickInt(371),
        extensionLine1: pickInt(372),
        extensionLine2: pickInt(373)
      });

      const rawFlagCodes = {};
      const flagCodes = [
        280, 281, 282, 283, 284, 285, 286, 287, 288, 289,
        290, 291, 292, 293, 294, 295, 296, 297, 298, 299
      ];
      flagCodes.forEach((code) => {
        const value = pickInt(code);
        if (value != null) {
          rawFlagCodes[code] = value;
        }
      });

      return {
        parameters,
        toggles,
        measurement,
        alternateUnits,
        text,
        references,
        colors,
        lineweights,
        rawFlagCodes: Object.keys(rawFlagCodes).length ? rawFlagCodes : null
      };
    }

    _buildCodeLookup(tags) {
      const lookup = Object.create(null);
      if (!Array.isArray(tags)) {
        return lookup;
      }
      tags.forEach((tag) => {
        const code = Number(tag.code);
        if (!Number.isFinite(code)) {
          return;
        }
        if (!lookup[code]) {
          lookup[code] = [];
        }
        lookup[code].push(tag.value);
      });
      return lookup;
    }

    _extractPointFromLookup(lookup, xCode, yCode, zCode) {
      if (!lookup) {
        return null;
      }
      const xRaw = Array.isArray(lookup[xCode]) ? lookup[xCode][0] : lookup[xCode];
      const yRaw = Array.isArray(lookup[yCode]) ? lookup[yCode][0] : lookup[yCode];
      const zRaw = Array.isArray(lookup[zCode]) ? lookup[zCode][0] : lookup[zCode];
      const hasValue = xRaw != null || yRaw != null || zRaw != null;
      if (!hasValue) {
        return null;
      }
      return {
        x: utils.toFloat(xRaw) ?? 0,
        y: utils.toFloat(yRaw) ?? 0,
        z: utils.toFloat(zRaw) ?? 0
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
function collectPointCloudClip(map) {
  const planeCount = toInt((map.get(73) || [])[0]) || 0;
  if (planeCount <= 0) {
    return null;
  }
  const coefficients = [];
  const aVals = (map.get(170) || []).map(toFloat);
  const bVals = (map.get(171) || []).map(toFloat);
  const cVals = (map.get(172) || []).map(toFloat);
  const dVals = (map.get(173) || []).map(toFloat);
  const eVals = (map.get(174) || []).map(toFloat);
  const fVals = (map.get(175) || []).map(toFloat);
  for (let i = 0; i < planeCount; i++) {
    coefficients.push({
      a: aVals[i] ?? 0,
      b: bVals[i] ?? 0,
      c: cVals[i] ?? 0,
      d: dVals[i] ?? 0,
      e: eVals[i] ?? 0,
      f: fVals[i] ?? 0
    });
  }
  return coefficients.length ? coefficients : null;
}
      const parseBlockFlags = (flags) => {
        const value = Number(flags) || 0;
        return {
          raw: value,
          isAnonymous: (value & 1) === 1,
          hasNonConstantAttributes: (value & 2) === 2,
          isXref: (value & 4) === 4,
          isOverlay: (value & 8) === 8,
          isExternallyDependent: (value & 16) === 16,
          isResolved: (value & 32) === 32,
          isReferenced: (value & 64) === 64
        };
      };
