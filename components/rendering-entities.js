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

  /**
   * Utility helpers shared across rendering modules.
   */
  function toFloat(value) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
  }

  function toInt(value) {
    const num = parseInt(value, 10);
    return Number.isFinite(num) ? num : null;
  }

  function buildCodeLookup(tags) {
    const map = new Map();
    tags.forEach((tag) => {
      const code = Number(tag.code);
      if (!map.has(code)) {
        map.set(code, []);
      }
      map.get(code).push(tag.value);
    });
    return map;
  }

  function getFirstCodeValue(tags, code) {
    for (let i = 0; i < tags.length; i++) {
      if (Number(tags[i].code) === code) {
        return tags[i].value;
      }
    }
    return null;
  }

  function getAllCodeValues(tags, code) {
    const values = [];
    tags.forEach((tag) => {
      if (Number(tag.code) === code) {
        values.push(tag.value);
      }
    });
    return values;
  }

  function parseTrueColor(value) {
    const intVal = parseInt(value, 10);
    if (!Number.isFinite(intVal)) {
      return null;
    }
    const r = (intVal >> 16) & 0xff;
    const g = (intVal >> 8) & 0xff;
    const b = intVal & 0xff;
    const hex = [
      '#',
      r.toString(16).padStart(2, '0'),
      g.toString(16).padStart(2, '0'),
      b.toString(16).padStart(2, '0')
    ].join('');
    return { r, g, b, hex };
  }

  function parseTransparency(value) {
    const intVal = parseInt(value, 10);
    if (!Number.isFinite(intVal)) {
      return null;
    }
    const mask = 0x02000000;
    const hasTransparency = (intVal & mask) !== 0;
    const raw = intVal & 0x00ffffff;
    if (!hasTransparency) {
      return { raw: intVal, alpha: 1 };
    }
    const normalized = raw / 0x01000000;
    const alpha = Math.max(0, Math.min(1, 1 - normalized));
    return { raw: intVal, alpha };
  }

  function normalizeHandle(value) {
    if (value == null) {
      return null;
    }
    const stringValue = typeof value === 'string' ? value : String(value);
    const trimmed = stringValue.trim();
    return trimmed ? trimmed.toUpperCase() : null;
  }

  function lookupHandleMap(map, handle) {
    if (!map || !handle) {
      return null;
    }
    const normalized = normalizeHandle(handle);
    if (map instanceof Map) {
      if (normalized && map.has(normalized)) {
        return map.get(normalized);
      }
      if (map.has(handle)) {
        return map.get(handle);
      }
      return null;
    }
    if (normalized && Object.prototype.hasOwnProperty.call(map, normalized)) {
      return map[normalized];
    }
    if (Object.prototype.hasOwnProperty.call(map, handle)) {
      return map[handle];
    }
    return null;
  }

  function extractHandlesFromRawTags(rawTags) {
    if (!Array.isArray(rawTags) || !rawTags.length) {
      return [];
    }
    const handles = [];
    rawTags.forEach((tag) => {
      if (!tag || tag.code == null) {
        return;
      }
      const code = Number(tag.code);
      if (!Number.isFinite(code)) {
        return;
      }
      if (code >= 330 && code <= 369) {
        const rawHandle = tag.value != null ? String(tag.value).trim() : '';
        if (rawHandle) {
          handles.push(rawHandle);
        }
      }
    });
    return handles;
  }

  function collectSpatialFilters(handle, context, visitedDictionaries = new Set(), visitedFilters = new Set()) {
    if (!handle || !context) {
      return [];
    }
    const dictionaries = context.dictionaries || {};
    const spatialFilters = context.spatialFilters || {};
    const xrecords = context.xrecords || {};
    const dictionary = lookupHandleMap(dictionaries, handle);
    if (!dictionary) {
      const filter = lookupHandleMap(spatialFilters, handle);
      if (!filter) {
        return [];
      }
      const filterKey = filter.handleUpper || normalizeHandle(filter.handle || handle);
      if (filterKey && visitedFilters.has(filterKey)) {
        return [];
      }
      if (filterKey) {
        visitedFilters.add(filterKey);
      }
      return [filter];
    }
    const dictKey = dictionary.handleUpper || normalizeHandle(dictionary.handle || handle);
    if (dictKey && visitedDictionaries.has(dictKey)) {
      return [];
    }
    if (dictKey) {
      visitedDictionaries.add(dictKey);
    }
    const results = [];
    (dictionary.entries || []).forEach((entry) => {
      if (!entry) {
        return;
      }
      const entryHandle = entry.handleUpper || entry.handle;
      if (!entryHandle) {
        return;
      }
      const directFilter = lookupHandleMap(spatialFilters, entryHandle);
      if (directFilter) {
        const filterKey = directFilter.handleUpper || normalizeHandle(directFilter.handle || entryHandle);
        if (!filterKey || visitedFilters.has(filterKey)) {
          return;
        }
        visitedFilters.add(filterKey);
        results.push(directFilter);
        return;
      }
      const nestedDictionary = lookupHandleMap(dictionaries, entryHandle);
      if (nestedDictionary) {
        results.push(...collectSpatialFilters(entryHandle, context, visitedDictionaries, visitedFilters));
        return;
      }
      const xrecord = lookupHandleMap(xrecords, entryHandle);
      if (xrecord) {
        const relatedHandles = extractHandlesFromRawTags(xrecord.rawTags || []);
        relatedHandles.forEach((candidate) => {
          const nestedFilter = lookupHandleMap(spatialFilters, candidate);
          if (nestedFilter) {
            const filterKey = nestedFilter.handleUpper || normalizeHandle(nestedFilter.handle || candidate);
            if (filterKey && !visitedFilters.has(filterKey)) {
              visitedFilters.add(filterKey);
              results.push(nestedFilter);
            }
            return;
          }
          const extraDictionary = lookupHandleMap(dictionaries, candidate);
          if (extraDictionary) {
            results.push(...collectSpatialFilters(candidate, context, visitedDictionaries, visitedFilters));
          }
        });
      }
    });
    return results;
  }

  function convertSpatialFilterRecord(record) {
    if (!record || typeof record !== 'object') {
      return null;
    }
    const ensureVector = (vector, fallback) => {
      const result = {
        x: fallback && Number.isFinite(fallback.x) ? fallback.x : 0,
        y: fallback && Number.isFinite(fallback.y) ? fallback.y : 0,
        z: fallback && Number.isFinite(fallback.z) ? fallback.z : 0
      };
      if (vector && typeof vector === 'object') {
        if (Number.isFinite(vector.x)) result.x = vector.x;
        if (Number.isFinite(vector.y)) result.y = vector.y;
        if (Number.isFinite(vector.z)) result.z = vector.z;
      }
      return result;
    };
    const boundary = Array.isArray(record.boundary)
      ? record.boundary.map((pt) => ({
          x: Number.isFinite(pt && pt.x) ? pt.x : 0,
          y: Number.isFinite(pt && pt.y) ? pt.y : 0
        }))
      : [];
    const convertMatrixValues = (values) => {
      if (!Array.isArray(values) || values.length < 12) {
        return null;
      }
      const safe = (index) => {
        const value = values[index];
        return Number.isFinite(value) ? value : 0;
      };
      const array = new Float64Array(16);
      array[0] = safe(0);
      array[1] = safe(4);
      array[2] = safe(8);
      array[3] = safe(3);
      array[4] = safe(1);
      array[5] = safe(5);
      array[6] = safe(9);
      array[7] = safe(7);
      array[8] = safe(2);
      array[9] = safe(6);
      array[10] = safe(10);
      array[11] = safe(11);
      array[12] = 0;
      array[13] = 0;
      array[14] = 0;
      array[15] = 1;
      return array;
    };
    return {
      handle: record.handle || record.handleUpper || null,
      boundary,
      origin: ensureVector(record.origin, { x: 0, y: 0, z: 0 }),
      extrusion: ensureVector(record.extrusion, { x: 0, y: 0, z: 1 }),
      clippingEnabled: record.clippingEnabled != null ? !!record.clippingEnabled : true,
      frontClip: {
        enabled: !!(record.frontClip && record.frontClip.enabled),
        distance: record.frontClip ? record.frontClip.distance : null
      },
      backClip: {
        enabled: !!(record.backClip && record.backClip.enabled),
        distance: record.backClip ? record.backClip.distance : null
      },
      inverseInsertMatrix: convertMatrixValues(record.inverseInsertMatrix),
      clipBoundaryMatrix: convertMatrixValues(record.clipBoundaryMatrix)
    };
  }

  function resolveInsertClipFilters(metadata, context) {
    if (!metadata) {
      return [];
    }
    const dictionaries = context && context.dictionaries;
    const spatialFilters = context && context.spatialFilters;
    if (!dictionaries || !spatialFilters) {
      return [];
    }
    const dictionaryHandle = metadata.extensionDictionaryUpper
      || metadata.extensionDictionary
      || null;
    if (!dictionaryHandle) {
      return [];
    }
    const filters = collectSpatialFilters(dictionaryHandle, {
      dictionaries,
      spatialFilters,
      xrecords: context && context.xrecords
    });
    return filters
      .map((record) => convertSpatialFilterRecord(record))
      .filter((value) => value != null);
  }

  function extractExtrusion(tags) {
    const nx = toFloat(getFirstCodeValue(tags, 210));
    const ny = toFloat(getFirstCodeValue(tags, 220));
    const nz = toFloat(getFirstCodeValue(tags, 230));
    if (nx === null && ny === null && nz === null) {
      return null;
    }
    return {
      x: nx ?? 0,
      y: ny ?? 0,
      z: nz ?? 1
    };
  }

  function mapToPlainObject(map) {
    const obj = Object.create(null);
    map.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }

  function joinTextFragments(map, codes) {
    const fragments = [];
    codes.forEach((code) => {
      const values = map.get(code) || [];
      values.forEach((value) => {
        if (typeof value === 'string') {
          fragments.push(value);
        }
      });
    });
    return fragments.join('');
  }

  function pointFromCodeMap(codeMap, xCode, yCode, zCode) {
    if (!codeMap || typeof codeMap.get !== 'function') {
      return { x: 0, y: 0, z: 0 };
    }
    const xValues = codeMap.get(xCode) || [];
    const yValues = codeMap.get(yCode) || [];
    const zValues = codeMap.get(zCode) || [];
    return {
      x: toFloat(xValues[0]) ?? 0,
      y: toFloat(yValues[0]) ?? 0,
      z: toFloat(zValues[0]) ?? 0
    };
  }

  const HATCH_BOUNDARY_FLAGS = {
    EXTERNAL: 1,
    POLYLINE: 2,
    DERIVED: 4,
    TEXTBOX: 8,
    OUTERMOST: 16
  };

  function normalizeHatchBoundaryFlags(value) {
    const flags = toInt(value) || 0;
    return {
      raw: flags,
      isExternal: (flags & HATCH_BOUNDARY_FLAGS.EXTERNAL) !== 0,
      isPolyline: (flags & HATCH_BOUNDARY_FLAGS.POLYLINE) !== 0,
      isDerived: (flags & HATCH_BOUNDARY_FLAGS.DERIVED) !== 0,
      isTextbox: (flags & HATCH_BOUNDARY_FLAGS.TEXTBOX) !== 0,
      isOutermost: (flags & HATCH_BOUNDARY_FLAGS.OUTERMOST) !== 0
    };
  }

  function gatherHatchLoops(tags) {
    const loops = [];
    const seedPoints = [];
    let currentLoop = null;
    let currentEdge = null;
    let pendingVertexX = null;
    let pendingSeedX = null;
    let readingSeedPoints = false;
    let remainingSeedPoints = 0;

    const finalizeCurrentLoop = () => {
      if (currentLoop) {
        if (!currentLoop.vertices || currentLoop.vertices.length === 0) {
          currentLoop.vertices = [];
        }
        if (!currentLoop.edges || currentLoop.edges.length === 0) {
          currentLoop.edges = [];
        }
        if (!currentLoop.sourceHandles) {
          currentLoop.sourceHandles = [];
        }
        loops.push(currentLoop);
      }
      currentLoop = null;
      currentEdge = null;
    };

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const code = Number(tag.code);
      const rawValue = tag.value;
      const intVal = toInt(rawValue);
      const floatVal = toFloat(rawValue);

      if (readingSeedPoints) {
        if (code === 10) {
          pendingSeedX = floatVal ?? 0;
          continue;
        }
        if (code === 20) {
          const pt = {
            x: pendingSeedX ?? 0,
            y: floatVal ?? 0
          };
          pendingSeedX = null;
          seedPoints.push(pt);
          remainingSeedPoints = Math.max(0, remainingSeedPoints - 1);
          if (remainingSeedPoints === 0) {
            readingSeedPoints = false;
          }
          continue;
        }
        if (code === 30) {
          if (seedPoints.length > 0) {
            seedPoints[seedPoints.length - 1].z = floatVal ?? 0;
          }
          continue;
        }
      }

      if (code === 98) {
        remainingSeedPoints = intVal || 0;
        readingSeedPoints = remainingSeedPoints > 0;
        pendingSeedX = null;
        continue;
      }

      if (code === 91) {
        // Number of paths; informational only.
        continue;
      }

      if (code === 92) {
        finalizeCurrentLoop();
        const flags = normalizeHatchBoundaryFlags(rawValue);
        currentLoop = Object.assign({
          boundaryType: flags.raw,
          isPolyline: flags.isPolyline,
          isExternal: flags.isExternal,
          isDerived: flags.isDerived,
          isTextbox: flags.isTextbox,
          isOutermost: flags.isOutermost,
          vertices: [],
          bulges: [],
          edges: [],
          sourceHandles: []
        }, flags);
        currentEdge = null;
        pendingVertexX = null;
        continue;
      }

      if (!currentLoop) {
        continue;
      }

      if (currentLoop.isPolyline) {
        switch (code) {
          case 72: {
            currentLoop.expectedVertexCount = intVal || 0;
            break;
          }
          case 73: {
            currentLoop.isClosed = (intVal || 0) !== 0;
            break;
          }
          case 10: {
            pendingVertexX = floatVal ?? 0;
            break;
          }
          case 20: {
            if (pendingVertexX == null) {
              break;
            }
            currentLoop.vertices.push({
              x: pendingVertexX,
              y: floatVal ?? 0
            });
            pendingVertexX = null;
            break;
          }
          case 42: {
            if (currentLoop.vertices.length > 0) {
              currentLoop.bulges[currentLoop.vertices.length - 1] = floatVal ?? 0;
            }
            break;
          }
          case 97: {
            currentLoop.expectedSourceCount = intVal || 0;
            if (!currentLoop.sourceHandles) {
              currentLoop.sourceHandles = [];
            }
            break;
          }
          case 330: {
            if (!currentLoop.sourceHandles) {
              currentLoop.sourceHandles = [];
            }
            currentLoop.sourceHandles.push(String(rawValue));
            break;
          }
          default:
            break;
        }
        continue;
      }

      switch (code) {
        case 93: {
          currentLoop.expectedEdgeCount = intVal || 0;
          break;
        }
        case 72: {
          currentEdge = {
            edgeType: intVal || 0,
            codes: []
          };
          currentLoop.edges.push(currentEdge);
          break;
        }
        case 97: {
          currentLoop.expectedSourceCount = intVal || 0;
          if (!currentLoop.sourceHandles) {
            currentLoop.sourceHandles = [];
          }
          break;
        }
        case 330: {
          if (!currentLoop.sourceHandles) {
            currentLoop.sourceHandles = [];
          }
          currentLoop.sourceHandles.push(String(rawValue));
          break;
        }
        default: {
          if (!currentEdge) {
            break;
          }
          const value = (code >= 70 && code <= 99)
            ? (intVal ?? 0)
            : (floatVal != null ? floatVal : rawValue);
          currentEdge.codes.push({
            code,
            value
          });
          break;
        }
      }
    }

    finalizeCurrentLoop();

    const uniqueSeedPoints = seedPoints.filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y));

    return {
      loops,
      seedPoints: uniqueSeedPoints
    };
  }

  function parseHatchPatternDefinitions(tags) {
    const lines = [];
    let pendingLine = null;
    let remainingLines = 0;
    let expectedLines = 0;
    let expectedDashCount = 0;

    const finalizeLine = () => {
      if (pendingLine) {
        if (typeof pendingLine.angle !== 'number') {
          pendingLine.angle = 0;
        }
        if (!pendingLine.base) {
          pendingLine.base = { x: 0, y: 0 };
        }
        if (!pendingLine.offset) {
          pendingLine.offset = { x: 0, y: 0 };
        }
        if (!Array.isArray(pendingLine.dashPattern)) {
          pendingLine.dashPattern = [];
        }
        lines.push(pendingLine);
        if (remainingLines > 0) {
          remainingLines -= 1;
        }
      }
      pendingLine = null;
      expectedDashCount = 0;
    };

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const code = Number(tag.code);
      const rawValue = tag.value;

      if (expectedLines > 0 && lines.length >= expectedLines) {
        break;
      }

      if (code === 78) {
        expectedLines = toInt(rawValue) || 0;
        remainingLines = expectedLines;
        if (remainingLines <= 0) {
          pendingLine = null;
        }
        continue;
      }

      if (remainingLines <= 0) {
        continue;
      }

      if (code === 53) {
        finalizeLine();
        pendingLine = {
          angle: toFloat(rawValue) ?? 0,
          base: { x: 0, y: 0 },
          offset: { x: 0, y: 0 },
          dashPattern: []
        };
        expectedDashCount = 0;
        continue;
      }

      if (!pendingLine) {
        continue;
      }

      switch (code) {
        case 43:
          pendingLine.base.x = toFloat(rawValue) ?? 0;
          break;
        case 44:
          pendingLine.base.y = toFloat(rawValue) ?? 0;
          break;
        case 45:
          pendingLine.offset.x = toFloat(rawValue) ?? 0;
          break;
        case 46:
          pendingLine.offset.y = toFloat(rawValue) ?? 0;
          break;
        case 79:
          expectedDashCount = toInt(rawValue) || 0;
          if (!Array.isArray(pendingLine.dashPattern)) {
            pendingLine.dashPattern = [];
          }
          break;
        case 49:
          pendingLine.dashPattern.push(toFloat(rawValue) ?? 0);
          if (expectedDashCount > 0 && pendingLine.dashPattern.length >= expectedDashCount) {
            expectedDashCount = 0;
          }
          break;
        default:
          break;
      }
    }

    finalizeLine();

    if (!lines.length) {
      return [];
    }
    const targetCount = expectedLines > 0 ? expectedLines : lines.length;
    return lines.slice(0, targetCount);
  }

  function parseHatchGradient(tags) {
    let gradient = null;
    let currentColor = null;
    let lastColorStartCode = null;

    const ensureGradient = () => {
      if (!gradient) {
        gradient = {
          enabled: false,
          type: 0,
          angle: 0,
          shift: 0,
          tint: null,
          name: null,
          colorCount: 0,
          colors: []
        };
      }
      return gradient;
    };

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const code = Number(tag.code);
      const rawValue = tag.value;
      switch (code) {
        case 450: {
          const grad = ensureGradient();
          grad.type = toInt(rawValue) || 0;
          grad.enabled = grad.type !== 0 || grad.enabled;
          break;
        }
        case 451: {
          const grad = ensureGradient();
          grad.reserved1 = toInt(rawValue) || 0;
          break;
        }
        case 452: {
          const grad = ensureGradient();
          grad.reserved2 = toInt(rawValue) || 0;
          break;
        }
        case 453: {
          const grad = ensureGradient();
          grad.colorCount = toInt(rawValue) || 0;
          break;
        }
        case 460: {
          const grad = ensureGradient();
          grad.angle = toFloat(rawValue) ?? 0;
          break;
        }
        case 461: {
          const grad = ensureGradient();
          grad.shift = toFloat(rawValue) ?? 0;
          break;
        }
        case 462: {
          const grad = ensureGradient();
          grad.tint = toFloat(rawValue) ?? 0;
          break;
        }
        case 463: {
          const grad = ensureGradient();
          if (!currentColor || lastColorStartCode === 463) {
            currentColor = {
              position: toFloat(rawValue) ?? 0,
              trueColor: null,
              color: null,
              aci: null,
              transparency: null
            };
            grad.colors.push(currentColor);
          } else {
            currentColor.position = toFloat(rawValue) ?? currentColor.position ?? 0;
          }
          lastColorStartCode = 463;
          break;
        }
        case 470: {
          const grad = ensureGradient();
          grad.name = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue || '');
          break;
        }
        case 421:
        case 420: {
          const grad = ensureGradient();
          const trueColor = parseTrueColor(rawValue);
          currentColor = {
            position: null,
            trueColor,
            color: trueColor,
            aci: null,
            transparency: null
          };
          grad.colors.push(currentColor);
          lastColorStartCode = code;
          break;
        }
        case 63: {
          const grad = ensureGradient();
          const aci = toInt(rawValue) || 0;
          if (!currentColor || lastColorStartCode === 63) {
            currentColor = {
              position: null,
              trueColor: null,
              color: null,
              aci,
              transparency: null
            };
            grad.colors.push(currentColor);
          } else {
            currentColor.aci = aci;
          }
          lastColorStartCode = 63;
          break;
        }
        case 419: {
          const grad = ensureGradient();
          const transparency = parseTransparency(rawValue);
          if (!currentColor) {
            currentColor = {
              position: null,
              trueColor: null,
              color: null,
              aci: null,
              transparency
            };
            grad.colors.push(currentColor);
          } else {
            currentColor.transparency = transparency;
          }
          break;
        }
        default:
          break;
      }
    }

    if (!gradient || gradient.colors.length === 0) {
      return null;
    }

    gradient.enabled = true;
    if (!gradient.colorCount) {
      gradient.colorCount = gradient.colors.length;
    }
    return gradient;
  }

  function extractACISData(map) {
    const chunks = [];
    (map.get(1) || []).forEach((value) => chunks.push(String(value)));
    (map.get(3) || []).forEach((value) => chunks.push(String(value)));
    (map.get(310) || []).forEach((value) => chunks.push(String(value)));
    return chunks.length ? chunks.join('\n') : null;
  }

  function extractSingleLineTextBase(map, options = {}) {
    const horizontalCode = options.horizontalCode || 72;
    const verticalCode = options.verticalCode || 73;
    const alignment = {
      horizontal: toInt(map.get(horizontalCode)?.[0]) || 0,
      vertical: toInt(map.get(verticalCode)?.[0]) || 0
    };
    const position = pointFromCodeMap(map, 10, 20, 30);
    const hasAlignmentPoint = map.has(11) || map.has(21) || map.has(31);
    const alignmentPoint = hasAlignmentPoint ? pointFromCodeMap(map, 11, 21, 31) : null;
    return {
      position,
      alignmentPoint,
      height: toFloat(map.get(40)?.[0]) ?? 0,
      widthFactor: toFloat(map.get(41)?.[0]) ?? 1,
      rotation: toFloat(map.get(50)?.[0]) ?? 0,
      oblique: toFloat(map.get(51)?.[0]) ?? 0,
      alignment,
      generationFlags: toInt(map.get(71)?.[0]) || 0,
      textStyle: map.get(7)?.[0] || null,
      thickness: toFloat(map.get(39)?.[0]) ?? null
    };
  }

  function decodeAttributeFlags(rawFlags) {
    const flags = Number.isFinite(rawFlags) ? rawFlags : 0;
    return {
      isInvisible: (flags & 1) === 1,
      isConstant: (flags & 2) === 2,
      requiresVerification: (flags & 4) === 4,
      isPreset: (flags & 8) === 8,
      isMultipleLine: (flags & 16) === 16,
      lockPosition: (flags & 32) === 32
    };
  }

  function extractCommonMetadata(type, tags, context) {
    const handle = getFirstCodeValue(tags, 5);
    const owner = getFirstCodeValue(tags, 330);
    const layer = getFirstCodeValue(tags, 8) || '0';
    const linetype = getFirstCodeValue(tags, 6);
    const lineweight = toInt(getFirstCodeValue(tags, 370));
    const linetypeScale = toFloat(getFirstCodeValue(tags, 48));
    const colorNumber = toInt(getFirstCodeValue(tags, 62));
    const trueColorRaw = getFirstCodeValue(tags, 420);
    const plotStyle = getFirstCodeValue(tags, 390);
    const material = getFirstCodeValue(tags, 347);
    const transparencyRaw = getFirstCodeValue(tags, 440);
    const layout = getFirstCodeValue(tags, 410);
    const textStyle = getFirstCodeValue(tags, 7);
    const thickness = toFloat(getFirstCodeValue(tags, 39));
    const elevation = toFloat(getFirstCodeValue(tags, 38));
    const spaceFlag = toInt(getFirstCodeValue(tags, 67));
    const visualStyle = getFirstCodeValue(tags, 348) || getFirstCodeValue(tags, 160);
    const shadowMode = toInt(getFirstCodeValue(tags, 284));
    const isInBlock = !!context.blockName;
    const colorBookName = getFirstCodeValue(tags, 430);
    const colorBookColor = getFirstCodeValue(tags, 431);
    const colorBookHandle = getFirstCodeValue(tags, 437) || null;

    let color = null;
    const trueColor = trueColorRaw ? parseTrueColor(trueColorRaw) : null;
    if (trueColor) {
      color = { type: 'true', value: trueColor };
    } else if (Number.isInteger(colorNumber)) {
      if (colorNumber === 0) {
        color = { type: 'byBlock', value: null };
      } else if (colorNumber === 256) {
        color = { type: 'byLayer', value: null };
      } else {
        color = { type: 'aci', value: colorNumber };
      }
    } else {
      color = { type: 'byLayer', value: null };
    }

    const transparency = transparencyRaw ? parseTransparency(transparencyRaw) : null;
    const extrusion = extractExtrusion(tags);
    const flags = {};
    const tableFlagCodes = [70, 71, 72, 73, 74, 75, 76, 77, 78];
    tableFlagCodes.forEach((code) => {
      const flagValue = toInt(getFirstCodeValue(tags, code));
      if (flagValue !== null) {
        flags['f' + code] = flagValue;
      }
    });

    const space = isInBlock ? 'block' : (spaceFlag === 1 ? 'paper' : 'model');
    const colorBook = colorBookName ? {
      book: colorBookName,
      colorName: colorBookColor || null,
      handle: colorBookHandle
    } : null;

    let extensionDictionaryHandle = null;
    const reactorHandlesRaw = [];
    if (Array.isArray(tags)) {
      const markerStack = [];
      tags.forEach((tag) => {
        if (!tag || tag.code == null) {
          return;
        }
        const code = Number(tag.code);
        if (!Number.isFinite(code)) {
          return;
        }
        if (code === 102) {
          const rawMarker = typeof tag.value === 'string'
            ? tag.value.trim()
            : (tag.value != null ? String(tag.value).trim() : '');
          if (!rawMarker) {
            return;
          }
          if (rawMarker === '}') {
            markerStack.pop();
            return;
          }
          if (rawMarker.startsWith('{')) {
            const label = rawMarker.slice(1).trim().toUpperCase();
            if (label) {
              markerStack.push(label);
            }
          }
          return;
        }
        if (!markerStack.length) {
          return;
        }
        const activeMarker = markerStack[markerStack.length - 1];
        if (activeMarker === 'ACAD_XDICTIONARY' && code === 360) {
          const rawHandle = tag.value != null ? String(tag.value).trim() : '';
          if (rawHandle) {
            extensionDictionaryHandle = rawHandle;
          }
          return;
        }
        if (activeMarker === 'ACAD_REACTORS' && code >= 330 && code <= 369) {
          const rawHandle = tag.value != null ? String(tag.value).trim() : '';
          if (rawHandle) {
            reactorHandlesRaw.push(rawHandle);
          }
        }
      });
    }
    const normalizedExtensionDictionary = extensionDictionaryHandle
      ? normalizeHandle(extensionDictionaryHandle)
      : null;
    const reactorHandles = reactorHandlesRaw
      .map((value) => normalizeHandle(value))
      .filter((value, index, array) => value && array.indexOf(value) === index);

    const metadata = {
      handle: handle || null,
      owner: owner || null,
      layer,
      linetype: linetype || null,
      lineweight,
      linetypeScale,
      color,
      trueColor,
      plotStyle: plotStyle || null,
      material: material || null,
      transparency,
      layout: layout || null,
      textStyle: textStyle || null,
      thickness,
      elevation,
      extrusion,
      flags,
      space,
      visualStyle: visualStyle || null,
      shadowMode,
      spaceFlag,
      colorBook,
      extensionDictionary: extensionDictionaryHandle || null,
      extensionDictionaryUpper: normalizedExtensionDictionary,
      reactors: reactorHandles
    };

    const defaults = context && context.entityDefaults ? context.entityDefaults : null;
    if (defaults && typeof defaults === 'object') {
      if ((!metadata.linetype || !String(metadata.linetype).trim()) && defaults.linetype) {
        metadata.linetype = defaults.linetype;
      }
      if ((metadata.lineweight == null || Number.isNaN(metadata.lineweight)) && defaults.lineweight != null) {
        metadata.lineweight = defaults.lineweight;
      }
      if ((!metadata.textStyle || !String(metadata.textStyle).trim()) && defaults.textStyle) {
        metadata.textStyle = defaults.textStyle;
      }
    }

    return metadata;
  }

  function extractGeometry(type, tags) {
    const map = buildCodeLookup(tags);
    const upperType = type ? String(type).trim().toUpperCase() : 'UNKNOWN';

    function pointFromCodes(xCode, yCode, zCode) {
      return pointFromCodeMap(map, xCode, yCode, zCode);
    }

  function collectSeries(xCode, yCode, zCode) {
      const xs = (map.get(xCode) || []).map(toFloat);
      const ys = (map.get(yCode) || []).map(toFloat);
      const zs = (map.get(zCode) || []).map(toFloat);
      const points = [];
      const count = Math.max(xs.length, ys.length, zs.length);
      for (let i = 0; i < count; i++) {
        points.push({
          x: xs[i] ?? 0,
          y: ys[i] ?? 0,
          z: zs[i] ?? 0
        });
    }
    return points;
  }

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

function collectUnderlayClip(map) {
    const vertexCount = toInt((map.get(91) || [])[0]) || 0;
    if (vertexCount <= 0) {
      return null;
    }
    const points = [];
    const xs = (map.get(14) || []).map(toFloat);
    const ys = (map.get(24) || []).map(toFloat);
    for (let i = 0; i < vertexCount; i++) {
      const x = xs[i] ?? 0;
      const y = ys[i] ?? 0;
      points.push({ x, y });
    }
    return points.length ? points : null;
  }

  function collectViewportClip(map) {
    const vertexCount = toInt((map.get(90) || [])[0]) || 0;
    if (vertexCount <= 0) {
      return null;
    }
    const xs = (map.get(14) || []).map(toFloat);
    const ys = (map.get(24) || []).map(toFloat);
    const clip = [];
    for (let i = 0; i < vertexCount; i++) {
      clip.push({ x: xs[i] ?? 0, y: ys[i] ?? 0 });
    }
    return clip.length ? clip : null;
  }

  function collectViewportClip(map) {
    const vertexCount = toInt((map.get(90) || [])[0]) || 0;
    if (vertexCount <= 0) {
      return null;
    }
    const xs = (map.get(14) || []).map(toFloat);
    const ys = (map.get(24) || []).map(toFloat);
    const clip = [];
    for (let i = 0; i < vertexCount; i++) {
      const x = xs[i] ?? 0;
      const y = ys[i] ?? 0;
      clip.push({ x, y });
    }
    return clip.length ? clip : null;
  }

    switch (type) {
      case 'LINE': {
        return {
          type: 'line',
          start: pointFromCodes(10, 20, 30),
          end: pointFromCodes(11, 21, 31)
        };
      }
      case 'XLINE': {
        return {
          type: 'xline',
          point: pointFromCodes(10, 20, 30),
          direction: {
            x: toFloat(map.get(11)?.[0]) ?? 0,
            y: toFloat(map.get(21)?.[0]) ?? 0,
            z: toFloat(map.get(31)?.[0]) ?? 0
          }
        };
      }
      case 'RAY': {
        return {
          type: 'ray',
          start: pointFromCodes(10, 20, 30),
          direction: {
            x: toFloat(map.get(11)?.[0]) ?? 0,
            y: toFloat(map.get(21)?.[0]) ?? 0,
            z: toFloat(map.get(31)?.[0]) ?? 0
          }
        };
      }
      case 'POINT': {
        return {
          type: 'point',
          position: pointFromCodes(10, 20, 30)
        };
      }
      case 'MPOINT': {
        return {
          type: 'mpoint',
          points: collectSeries(10, 20, 30),
          basePoint: pointFromCodes(12, 22, 32),
          direction: {
            x: toFloat(map.get(11)?.[0]) ?? 0,
            y: toFloat(map.get(21)?.[0]) ?? 0,
            z: toFloat(map.get(31)?.[0]) ?? 0
          },
          flags: toInt(map.get(70)?.[0]) || 0,
          normal: extractExtrusion(tags)
        };
      }
      case 'LIGHT': {
        const position = pointFromCodes(10, 20, 30);
        const target = pointFromCodes(11, 21, 31);
        const lightType = toInt(map.get(70)?.[0]) || 2;
        const status = (toInt(map.get(290)?.[0]) || 0) !== 0;
        const plotGlyph = (toInt(map.get(291)?.[0]) || 0) !== 0;
        const intensity = toFloat(map.get(40)?.[0]);
        const attenuationType = toInt(map.get(72)?.[0]) || 0;
        const useLimits = (toInt(map.get(292)?.[0]) || 0) !== 0;
        const attenuationStart = toFloat(map.get(41)?.[0]);
        const attenuationEnd = toFloat(map.get(42)?.[0]);
        const hotspot = toFloat(map.get(50)?.[0]);
        const falloff = toFloat(map.get(51)?.[0]);
        const castShadows = (toInt(map.get(293)?.[0]) || 0) !== 0;
        const shadowType = toInt(map.get(73)?.[0]);
        const shadowMapSize = toInt(map.get(91)?.[0]);
        const shadowSoftness = toFloat(map.get(280)?.[0]);
        const name = map.get(1)?.[0] ? String(map.get(1)?.[0]).trim() : null;
        return {
          type: 'light',
          name: name || null,
          status,
          plotGlyph,
          lightType,
          intensity,
          position,
          target,
          attenuation: {
            type: attenuationType,
            useLimits,
            start: attenuationStart,
            end: attenuationEnd
          },
          hotspot,
          falloff,
          castShadows,
          shadow: {
            type: shadowType,
            mapSize: shadowMapSize,
            softness: shadowSoftness
          }
        };
      }
      case 'CIRCLE': {
        return {
          type: 'circle',
          center: pointFromCodes(10, 20, 30),
          radius: toFloat(map.get(40)?.[0]) ?? 0
        };
      }
      case 'ARC': {
        return {
          type: 'arc',
          center: pointFromCodes(10, 20, 30),
          radius: toFloat(map.get(40)?.[0]) ?? 0,
          startAngle: toFloat(map.get(50)?.[0]) ?? 0,
          endAngle: toFloat(map.get(51)?.[0]) ?? 0
        };
      }
      case 'ELLIPSE': {
        return {
          type: 'ellipse',
          center: pointFromCodes(10, 20, 30),
          majorAxis: {
            x: toFloat(map.get(11)?.[0]) ?? 0,
            y: toFloat(map.get(21)?.[0]) ?? 0,
            z: toFloat(map.get(31)?.[0]) ?? 0
          },
          ratio: toFloat(map.get(40)?.[0]) ?? 0,
          startAngle: toFloat(map.get(41)?.[0]) ?? 0,
          endAngle: toFloat(map.get(42)?.[0]) ?? 0
        };
      }
      case 'SHAPE': {
        return {
          type: 'shape',
          position: pointFromCodes(10, 20, 30),
          name: map.get(2)?.[0] || null,
          style: map.get(3)?.[0] || null,
          size: toFloat(map.get(40)?.[0]) ?? null,
          scale: toFloat(map.get(41)?.[0]) ?? 1,
          rotation: toFloat(map.get(50)?.[0]) ?? 0,
          oblique: toFloat(map.get(51)?.[0]) ?? 0,
          widthFactor: toFloat(map.get(44)?.[0]) ?? 1,
          thickness: toFloat(map.get(39)?.[0]) ?? null,
          normal: extractExtrusion(tags)
        };
      }
      case 'MLINE': {
        const styleName = map.get(2)?.[0] || null;
        const scale = toFloat(map.get(40)?.[0]) ?? 1;
        const justification = toInt(map.get(70)?.[0]) || 0;
        const flags = toInt(map.get(71)?.[0]) || 0;
        const vertexCount = toInt(map.get(73)?.[0]) || null;
        const vertices = collectSeries(10, 20, 30);
        const directions = collectSeries(11, 21, 31);
        const segmentVectors = collectSeries(12, 22, 32);
        const miterAngles = (map.get(51) || []).map(toFloat);
        return {
          type: 'mline',
          style: styleName,
          styleHandle: map.get(340)?.[0] || null,
          scale,
          justification,
          flags,
          vertexCount,
          vertices,
          directions,
          segmentVectors,
          miterAngles,
          isClosed: (flags & 1) === 1,
          normal: extractExtrusion(tags)
        };
      }
      case 'HATCH': {
        const { loops, seedPoints } = gatherHatchLoops(tags);
        const gradient = parseHatchGradient(tags);
        const patternDefinition = parseHatchPatternDefinitions(tags);
        const hatchStyle = toInt(map.get(75)?.[0]) || 0;
        const patternType = toInt(map.get(76)?.[0]) || 0;
        const patternAngle = toFloat(map.get(52)?.[0]);
        const patternScale = toFloat(map.get(41)?.[0]);
        const patternName = map.get(2)?.[0] || null;
        const sourceHandles = [];
        loops.forEach((loop) => {
          if (!loop || !Array.isArray(loop.sourceHandles)) {
            return;
          }
          loop.sourceHandles.forEach((handle) => {
            if (!handle) {
              return;
            }
            if (!sourceHandles.includes(handle)) {
              sourceHandles.push(handle);
            }
          });
        });
        return {
          type: 'hatch',
          pattern: patternName,
          angle: Number.isFinite(patternAngle) ? patternAngle : 0,
          scale: Number.isFinite(patternScale) ? patternScale : 1,
          isSolid: (toInt(map.get(70)?.[0]) || 0) === 1,
          associative: (toInt(map.get(71)?.[0]) || 0) === 1,
          patternDouble: (toInt(map.get(77)?.[0]) || 0) === 1,
          hatchStyle,
          patternType,
          loops,
          seedPoints,
          sourceHandles,
          patternDefinition,
          gradient,
          hasGradient: !!(gradient && gradient.enabled),
          normal: extractExtrusion(tags)
        };
      }
      case 'HELIX': {
        const axisBase = pointFromCodes(10, 20, 30);
        const axisVector = {
          x: toFloat(map.get(11)?.[0]) ?? 0,
          y: toFloat(map.get(21)?.[0]) ?? 0,
          z: toFloat(map.get(31)?.[0]) ?? 1
        };
        const startPoint = pointFromCodes(12, 22, 32);
        const startRadius = toFloat(map.get(40)?.[0]) ?? 0;
        const endRadius = toFloat(map.get(41)?.[0]) ?? startRadius;
        const turns = Math.max(0.25, Math.abs(toFloat(map.get(42)?.[0]) ?? 1));
        const pitch = toFloat(map.get(43)?.[0]) ?? 0;
        const rightHand = (toInt(map.get(290)?.[0]) || 0) !== 0 ? 1 : -1;

        const axisMag = Math.hypot(axisVector.x, axisVector.y, axisVector.z);
        const axisDir = axisMag > 1e-6 ? {
          x: axisVector.x / axisMag,
          y: axisVector.y / axisMag,
          z: axisVector.z / axisMag
        } : { x: 0, y: 0, z: 1 };

        const baseOffset = {
          x: startPoint.x - axisBase.x,
          y: startPoint.y - axisBase.y
        };
        const baseLen = Math.hypot(baseOffset.x, baseOffset.y);
        const referenceAngle = baseLen > 1e-6 ? Math.atan2(baseOffset.y, baseOffset.x) : 0;

        const pitchPerTurn = pitch !== 0 ? pitch : axisVector.z || axisMag || 1;
        const totalHeight = pitchPerTurn * turns;
        const samples = Math.max(48, Math.round(turns * 96));

        const points = [];
        for (let i = 0; i <= samples; i++) {
          const t = i / samples;
          const radius = startRadius + (endRadius - startRadius) * t;
          const angle = referenceAngle + rightHand * Math.PI * 2 * turns * t;
          const axialOffset = totalHeight * t;
          const center = {
            x: axisBase.x + axisDir.x * axialOffset,
            y: axisBase.y + axisDir.y * axialOffset,
            z: axisBase.z + axisDir.z * axialOffset
          };
          const x = center.x + radius * Math.cos(angle);
          const y = center.y + radius * Math.sin(angle);
          const z = center.z;
          points.push({ x, y, z });
        }

        return {
          type: 'helix',
          axisBase,
          axisVector,
          startPoint,
          points
        };
      }
      case 'ARCALIGNEDTEXT': {
        const textHeight = toFloat(map.get(141)?.[0]) ?? null;
        const widthFactor = toFloat(map.get(41)?.[0]) ?? 1;
        const offset = toFloat(map.get(73)?.[0]) ?? 0;
        const characterSpacing = toFloat(map.get(42)?.[0]) ?? null;
        return {
          type: 'arcalignedtext',
          text: map.get(1)?.[0] || '',
          textStyle: map.get(7)?.[0] || null,
          center: pointFromCodes(10, 20, 30),
          radius: toFloat(map.get(40)?.[0]) ?? 0,
          startAngle: toFloat(map.get(50)?.[0]) ?? 0,
          endAngle: toFloat(map.get(51)?.[0]) ?? 0,
          alignment: toInt(map.get(72)?.[0]) || 0,
          offset,
          widthFactor,
          textHeight,
          characterSpacing,
          reverse: (toInt(map.get(74)?.[0]) || 0) === 1,
          extrusion: extractExtrusion(tags)
        };
      }
      case 'GEOPOSITIONMARKER': {
        return {
          type: 'geopositionmarker',
          position: pointFromCodes(10, 20, 30),
          designPoint: pointFromCodes(11, 21, 31),
          referencePoint: pointFromCodes(12, 22, 32),
          markerType: toInt(map.get(70)?.[0]) || 0,
          displayMode: toInt(map.get(280)?.[0]) || 0,
          text: map.get(304)?.join('') || map.get(3)?.join('') || map.get(1)?.join('') || '',
          textHeight: toFloat(map.get(40)?.[0]) ?? null,
          unitScale: toFloat(map.get(41)?.[0]) ?? null,
          normal: extractExtrusion(tags)
        };
      }
      case 'TEXT': {
        const textBase = extractSingleLineTextBase(map, { verticalCode: 73 });
        const backgroundFill = toInt(map.get(90)?.[0]) || 0;
        const backgroundColorNumber = toInt(map.get(63)?.[0]);
        const backgroundTrueColorRaw = map.get(421)?.[0] || map.get(420)?.[0] || null;
        const backgroundTrueColor = backgroundTrueColorRaw ? parseTrueColor(backgroundTrueColorRaw) : null;
        const backgroundTransparencyRaw = map.get(441)?.[0];
        return {
          type: 'text',
          content: map.get(1)?.[0] || '',
          position: textBase.position,
          alignmentPoint: textBase.alignmentPoint,
          height: textBase.height,
          widthFactor: textBase.widthFactor,
          rotation: textBase.rotation,
          oblique: textBase.oblique,
          alignment: textBase.alignment,
          generationFlags: textBase.generationFlags,
          textStyle: textBase.textStyle,
          thickness: textBase.thickness,
          background: {
            fillType: backgroundFill,
            colorNumber: Number.isFinite(backgroundColorNumber) ? backgroundColorNumber : null,
            trueColor: backgroundTrueColor,
            transparency: backgroundTransparencyRaw ? parseTransparency(backgroundTransparencyRaw) : null
          }
        };
      }
      case 'MTEXT': {
        const direction = {
          x: toFloat(map.get(11)?.[0]) ?? 1,
          y: toFloat(map.get(21)?.[0]) ?? 0,
          z: toFloat(map.get(31)?.[0]) ?? 0
        };
        const backgroundOffsetCodes = [46, 47, 48, 49];
        const backgroundOffsetsByCode = {};
        backgroundOffsetCodes.forEach((code) => {
          const values = map.get(code);
          if (values && values.length) {
            const numeric = toFloat(values[0]);
            if (numeric != null) {
              backgroundOffsetsByCode[String(code)] = numeric;
            }
          }
        });
        const columnCodes = [
          75, 76, 77, 78, 79,
          160, 161, 162, 163, 164,
          170, 171, 172, 173, 174,
          175, 176, 177, 178, 179
        ];
        const columnRaw = {};
        columnCodes.forEach((code) => {
          const values = map.get(code);
          if (values && values.length) {
            columnRaw[String(code)] = values.map((value) => {
              const floatVal = toFloat(value);
              if (floatVal != null) {
                const intVal = toInt(value);
                if (intVal != null && Math.abs(floatVal - intVal) < 1e-9) {
                  return intVal;
                }
                return floatVal;
              }
              return value;
            });
          }
        });
        const columns = Object.keys(columnRaw).length
          ? {
              type: toInt(map.get(75)?.[0]) || 0,
              count: toInt(map.get(76)?.[0]) ?? null,
              flow: toInt(map.get(77)?.[0]) ?? null,
              raw: columnRaw
            }
          : null;
        return {
          type: 'mtext',
          position: pointFromCodes(10, 20, 30),
          direction,
          height: toFloat(map.get(40)?.[0]) ?? 0,
          referenceWidth: toFloat(map.get(41)?.[0]) ?? 0,
          rotation: toFloat(map.get(50)?.[0]) ?? 0,
          attachment: toInt(map.get(71)?.[0]) || 0,
          drawingDirection: toInt(map.get(72)?.[0]) || 0,
          lineSpacingStyle: toInt(map.get(73)?.[0]) || 1,
          lineSpacing: toFloat(map.get(44)?.[0]) ?? 1,
          backgroundFill: toInt(map.get(90)?.[0]) || 0,
          backgroundScale: toFloat(map.get(45)?.[0]) ?? null,
          backgroundColorNumber: toInt(map.get(63)?.[0]) ?? null,
          backgroundTrueColor: (() => {
            const raw = map.get(421)?.[0] || map.get(420)?.[0] || null;
            return raw ? parseTrueColor(raw) : null;
          })(),
          backgroundTransparency: (() => {
            const raw = map.get(441)?.[0] || null;
            return raw ? parseTransparency(raw) : null;
          })(),
          backgroundOffsets: Object.keys(backgroundOffsetsByCode).length ? backgroundOffsetsByCode : null,
          columns,
          text: joinTextFragments(map, [3, 1, 2])
        };
      }
      case 'ATTDEF': {
        const textBase = extractSingleLineTextBase(map, { verticalCode: 74 });
        const flagsValue = toInt(map.get(70)?.[0]) || 0;
        const decodedFlags = decodeAttributeFlags(flagsValue);
        const fieldLength = toInt(map.get(73)?.[0]);
        const raw280 = map.get(280);
        const versionRaw = Array.isArray(raw280) ? toInt(raw280[0]) : null;
        const secondary280 = Array.isArray(raw280) && raw280.length > 1
          ? raw280.slice(1)
              .map((value) => toInt(value))
              .filter((value) => Number.isFinite(value))
          : [];
        return {
          type: 'attdef',
          tag: map.get(2)?.[0] || '',
          prompt: map.get(3)?.[0] || '',
          defaultValue: map.get(1)?.[0] || '',
          content: map.get(1)?.[0] || '',
          textStyle: textBase.textStyle,
          position: textBase.position,
          alignmentPoint: textBase.alignmentPoint,
          height: textBase.height,
          widthFactor: textBase.widthFactor,
          rotation: textBase.rotation,
          oblique: textBase.oblique,
          alignment: textBase.alignment,
          generationFlags: textBase.generationFlags,
          thickness: textBase.thickness,
          fieldLength: Number.isFinite(fieldLength) ? fieldLength : null,
          flags: flagsValue,
          visibility: decodedFlags.isInvisible ? 'hidden' : 'visible',
          isInvisible: decodedFlags.isInvisible,
          isConstant: decodedFlags.isConstant,
          requiresVerification: decodedFlags.requiresVerification,
          isPreset: decodedFlags.isPreset,
          isMultipleLine: decodedFlags.isMultipleLine,
          lockPosition: decodedFlags.lockPosition,
          attributeVersion: Number.isFinite(versionRaw) ? versionRaw : null,
          extendedFlags: secondary280.length ? secondary280 : null
        };
      }
      case 'ATTRIB': {
        const textBase = extractSingleLineTextBase(map, { verticalCode: 74 });
        const flagsValue = toInt(map.get(70)?.[0]) || 0;
        const decodedFlags = decodeAttributeFlags(flagsValue);
        const fieldLength = toInt(map.get(73)?.[0]);
        return {
          type: 'attrib',
          tag: map.get(2)?.[0] || '',
          value: map.get(1)?.[0] || '',
          content: map.get(1)?.[0] || '',
          prompt: map.get(3)?.[0] || '',
          textStyle: textBase.textStyle,
          position: textBase.position,
          alignmentPoint: textBase.alignmentPoint,
          height: textBase.height,
          widthFactor: textBase.widthFactor,
          rotation: textBase.rotation,
          oblique: textBase.oblique,
          alignment: textBase.alignment,
          generationFlags: textBase.generationFlags,
          thickness: textBase.thickness,
          fieldLength: Number.isFinite(fieldLength) ? fieldLength : null,
          flags: flagsValue,
          visibility: decodedFlags.isInvisible ? 'hidden' : 'visible',
          isInvisible: decodedFlags.isInvisible,
          isConstant: decodedFlags.isConstant,
          requiresVerification: decodedFlags.requiresVerification,
          isPreset: decodedFlags.isPreset,
          isMultipleLine: decodedFlags.isMultipleLine,
          lockPosition: decodedFlags.lockPosition
        };
      }
      case 'TOLERANCE': {
        const orientation = {
          x: toFloat(map.get(11)?.[0]) ?? 1,
          y: toFloat(map.get(21)?.[0]) ?? 0,
          z: toFloat(map.get(31)?.[0]) ?? 0
        };
        return {
          type: 'tolerance',
          position: pointFromCodes(10, 20, 30),
          direction: orientation,
          height: toFloat(map.get(40)?.[0]) ?? 0,
          rotation: toFloat(map.get(50)?.[0]) ?? 0,
          text: map.get(3)?.join('') || map.get(1)?.join('') || '',
          segments: (map.get(304) || map.get(305) || []).map((value) => String(value)),
          hasDatum: (toInt(map.get(71)?.[0]) || 0) !== 0,
          textStyle: map.get(7)?.[0] || null
        };
      }
      case 'POINTCLOUD':
      case 'POINTCLOUDATTACH': {
        const transparencyRaw = map.get(441)?.[0] || map.get(440)?.[0] || null;
        const definitionHandle = map.get(331)?.[0] || map.get(340)?.[0] || null;
        const reactorHandle = map.get(360)?.[0] || null;
        const exRecordHandle = map.get(361)?.[0] || null;
        return {
          type: 'pointcloud',
          subtype: upperType,
          position: pointFromCodes(10, 20, 30),
          scale: {
            x: toFloat(map.get(41)?.[0]) ?? 1,
            y: toFloat(map.get(42)?.[0]) ?? 1,
            z: toFloat(map.get(43)?.[0]) ?? 1
          },
          rotation: toFloat(map.get(50)?.[0]) ?? 0,
          hasClip: (toInt(map.get(70)?.[0]) || 0) !== 0,
          showIntensity: (toInt(map.get(71)?.[0]) || 0) !== 0,
          definitionHandle,
          pointCloudDef: definitionHandle,
          reactorHandle,
          exRecordHandle,
          density: toFloat(map.get(90)?.[0]) ?? null,
          renderMode: toInt(map.get(280)?.[0]) || 0,
          colorSource: toInt(map.get(281)?.[0]) || 0,
          intensityLimits: {
            min: toFloat(map.get(91)?.[0]) ?? null,
            max: toFloat(map.get(92)?.[0]) ?? null
          },
          clipPlanes: collectPointCloudClip(map),
          planeNormal: {
            x: toFloat(map.get(210)?.[0]) ?? 0,
            y: toFloat(map.get(220)?.[0]) ?? 0,
            z: toFloat(map.get(230)?.[0]) ?? 1
          },
          trueColor: (() => {
            const raw = map.get(420)?.[0] || map.get(421)?.[0] || null;
            return raw ? parseTrueColor(raw) : null;
          })(),
          transparency: transparencyRaw ? parseTransparency(transparencyRaw) : null,
          extrusion: extractExtrusion(tags)
        };
      }
      case 'INSERT': {
        return {
          type: 'insert',
          blockName: map.get(2)?.[0] || null,
          position: pointFromCodes(10, 20, 30),
          scale: {
            x: toFloat(map.get(41)?.[0]) ?? 1,
            y: toFloat(map.get(42)?.[0]) ?? 1,
            z: toFloat(map.get(43)?.[0]) ?? 1
          },
          rotation: toFloat(map.get(50)?.[0]) ?? 0,
          columnCount: toInt(map.get(70)?.[0]) || 1,
          rowCount: toInt(map.get(71)?.[0]) || 1,
          columnSpacing: toFloat(map.get(44)?.[0]) ?? 0,
          rowSpacing: toFloat(map.get(45)?.[0]) ?? 0,
          hasAttributes: (toInt(map.get(66)?.[0]) || 0) === 1,
          extrusion: extractExtrusion(tags)
        };
      }
      case 'DIMENSION': {
        const dimensionStyleName = map.get(3)?.[0] || null;
        const dimensionStyleHandle = map.get(107)?.[0] || map.get(340)?.[0] || null;
        const dimensionTypeRaw = toInt(map.get(70)?.[0]) || 0;
        const dimensionSubtype = dimensionTypeRaw & 7;
        const dimensionFlagBits = dimensionTypeRaw & ~7;
        const dimensionAssociativity = toInt(map.get(280)?.[0]) ?? null;
        const dimensionAssociativityPoint = toInt(map.get(281)?.[0]) ?? null;
        const ordinateType = dimensionSubtype === 6
          ? ((dimensionTypeRaw >> 3) & 3)
          : null;
        const extension1 = pointFromCodes(14, 24, 34);
        const extension2 = pointFromCodes(15, 25, 35);
        const arrow1 = pointFromCodes(16, 26, 36);
        const arrow2 = pointFromCodes(17, 27, 37);
        const arcPoint1 = pointFromCodes(18, 28, 38);
        const arcPoint2 = pointFromCodes(19, 29, 39);
        const oblique = toFloat(map.get(52)?.[0]) ?? null;
        const textHeight = toFloat(map.get(40)?.[0]) ?? null;
        const arcDefinitionPoints = [];
        if (arcPoint1) arcDefinitionPoints.push(arcPoint1);
        if (arcPoint2) arcDefinitionPoints.push(arcPoint2);
        const associativeHandleCodes = new Set([331, 332, 361, 362, 363, 364]);
        const associativeHandlesSet = new Set();
        tags.forEach((tag) => {
          const code = Number(tag.code);
          if (!Number.isFinite(code)) {
            return;
          }
          if (associativeHandleCodes.has(code)) {
            const rawHandle = tag.value != null ? String(tag.value).trim() : '';
            if (rawHandle) {
              associativeHandlesSet.add(rawHandle.toUpperCase());
            }
          }
        });
        const associativeHandles = Array.from(associativeHandlesSet);
        return {
          type: 'dimension',
          dimensionType: dimensionTypeRaw,
          dimensionSubtype,
          dimensionFlags: dimensionFlagBits,
          dimensionAssociativity,
          dimensionAssociativityPoint,
          ordinateType,
          definitionPoint: pointFromCodes(10, 20, 30),
          textPoint: pointFromCodes(11, 21, 31),
          dimensionLinePoint: pointFromCodes(13, 23, 33),
          extensionLine1Point: extension1,
          extensionLine2Point: extension2,
          arrow1Point: arrow1,
          arrow2Point: arrow2,
          arcDefinitionPoints,
          obliqueAngle: oblique,
          text: map.get(1)?.[0] || '',
          measurement: toFloat(map.get(42)?.[0]) ?? null,
          textHeight,
          rotation: toFloat(map.get(50)?.[0]) ?? null,
          blockName: map.get(2)?.[0] || null,
          dimensionStyle: dimensionStyleName,
          dimensionStyleHandle,
          associativeHandles,
          dimensionAssociativeHandles: associativeHandles.slice()
        };
      }
      case 'LEADER': {
        const arrowSize = toFloat(map.get(40)?.[0]) ?? null;
        return {
          type: 'leader',
          vertices: collectSeries(10, 20, 30),
          annotationType: toInt(map.get(72)?.[0]) || 0,
          hookLineDirection: toInt(map.get(73)?.[0]) || 0,
          style: map.get(3)?.[0] || null,
          arrowSize
        };
      }
      case 'MLEADER': {
        const textFragments = (map.get(304) || map.get(3) || []).map((value) => String(value));
        return {
          type: 'mleader',
          vertexPoints: collectSeries(10, 20, 30),
          scale: toFloat(map.get(40)?.[0]) ?? 1,
          doglegLength: toFloat(map.get(41)?.[0]) ?? 0,
          contentType: toInt(map.get(170)?.[0]) || 0,
          styleHandle: map.get(340)?.[0] || null,
          blockContentId: map.get(341)?.[0] || null,
          arrowSize: toFloat(map.get(42)?.[0]) ?? null,
          landingGap: toFloat(map.get(43)?.[0]) ?? null,
          textHeight: toFloat(map.get(44)?.[0]) ?? null,
          text: textFragments.join(''),
          textStyleHandle: map.get(344)?.[0] || null
        };
      }
      case 'TABLE': {
        const position = pointFromCodes(10, 20, 30);
        const horizontalDirection = pointFromCodes(11, 21, 31);
        const verticalDirection = pointFromCodes(12, 22, 32);
        const rowCount = toInt(map.get(94)?.[0]) || 0;
        const columnCount = toInt(map.get(95)?.[0]) || 0;
        const titleRowCount = toInt(map.get(96)?.[0]) || 0;
        const headerRowCount = toInt(map.get(97)?.[0]) || 0;
        const rowHeights = (map.get(141) || []).map(toFloat);
        const columnWidths = (map.get(142) || []).map(toFloat);
        const defaultRowHeight = toFloat(map.get(143)?.[0]) ?? null;
        const defaultColumnWidth = toFloat(map.get(144)?.[0]) ?? null;
        const tableStyleHandle = map.get(343)?.[0] || map.get(342)?.[0] || map.get(340)?.[0] || null;
        const tableStyleName = map.get(3)?.[0] || null;
        const titleSuppressed = (toInt(map.get(91)?.[0]) || 0) !== 0;
        const headerSuppressed = (toInt(map.get(92)?.[0]) || 0) !== 0;

        const cells = [];
        let currentCell = null;

        const finalizeCell = () => {
          if (!currentCell) {
            return;
          }
          if (!Array.isArray(currentCell.textSegments)) {
            currentCell.textSegments = [];
          }
          currentCell.text = currentCell.textSegments.join('');
          delete currentCell.textSegments;
          cells.push(currentCell);
          currentCell = null;
        };

        tags.forEach((tag) => {
          const code = Number(tag.code);
          const rawValue = tag.value;
          const stringValue = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
          switch (code) {
            case 171:
              finalizeCell();
              currentCell = {
                row: toInt(rawValue) || 0,
                column: 0,
                type: 0,
                rowSpan: 1,
                columnSpan: 1,
                textSegments: [],
                rawTags: []
              };
              break;
            case 172:
              if (currentCell) {
                currentCell.column = toInt(rawValue) || 0;
              }
              break;
            case 173:
              if (currentCell) {
                currentCell.type = toInt(rawValue) || 0;
              }
              break;
            case 174:
              if (currentCell) {
                currentCell.textHeight = toFloat(rawValue) ?? currentCell.textHeight;
              }
              break;
            case 175:
              if (currentCell) {
                currentCell.alignment = toInt(rawValue) || 0;
              }
              break;
            case 176:
              if (currentCell) {
                currentCell.textRotation = toFloat(rawValue) ?? 0;
              }
              break;
            case 177:
              if (currentCell) {
                currentCell.rowSpan = Math.max(1, toInt(rawValue) || 1);
              }
              break;
            case 178:
              if (currentCell) {
                currentCell.columnSpan = Math.max(1, toInt(rawValue) || 1);
              }
              break;
            case 179:
              if (currentCell) {
                currentCell.isMerged = (toInt(rawValue) || 0) !== 0;
              }
              break;
            case 180:
              if (currentCell) {
                currentCell.backgroundEnabled = (toInt(rawValue) || 0) !== 0;
              }
              break;
            case 181:
              if (currentCell) {
                currentCell.autofit = (toInt(rawValue) || 0) !== 0;
              }
              break;
            case 182:
              if (currentCell) {
                currentCell.borderColorNumber = toInt(rawValue) || null;
              }
              break;
            case 183:
              if (currentCell) {
                currentCell.borderLineweight = toFloat(rawValue) ?? null;
              }
              break;
            case 184:
              if (currentCell) {
                currentCell.borderTransparency = toFloat(rawValue) ?? null;
              }
              break;
            case 63:
              if (currentCell) {
                currentCell.backgroundColorNumber = toInt(rawValue) || null;
              }
              break;
            case 420:
              if (currentCell) {
                currentCell.backgroundTrueColor = parseTrueColor(rawValue);
              }
              break;
            case 298:
            case 300:
            case 301:
            case 302:
            case 303:
            case 304:
            case 305:
            case 1:
            case 3:
            case 7:
              if (currentCell) {
                currentCell.textSegments.push(stringValue);
              }
              break;
            case 340:
            case 341:
            case 342:
            case 344:
            case 361:
            case 362:
              if (currentCell) {
                currentCell.textStyleHandle = currentCell.textStyleHandle || stringValue.trim();
              } else if (!tableStyleHandle) {
                tableStyleHandle = stringValue.trim();
              }
              break;
            case 331:
            case 360:
              if (currentCell) {
                currentCell.blockHandle = stringValue.trim();
              }
              break;
            default:
              break;
          }
          if (currentCell) {
            currentCell.rawTags.push({
              code,
              value: rawValue
            });
          }
        });
        finalizeCell();

        const processedCells = cells.map((cell) => ({
          row: Math.max(0, cell.row || 0),
          column: Math.max(0, cell.column || 0),
          rowSpan: Math.max(1, cell.rowSpan || 1),
          columnSpan: Math.max(1, cell.columnSpan || 1),
          type: cell.type || 0,
          alignment: cell.alignment || 0,
          text: cell.text || '',
          textHeight: cell.textHeight || null,
          textRotation: cell.textRotation || 0,
          textStyleHandle: cell.textStyleHandle || null,
          blockHandle: cell.blockHandle || null,
          backgroundEnabled: cell.backgroundEnabled ?? false,
          backgroundColorNumber: cell.backgroundColorNumber ?? null,
          backgroundTrueColor: cell.backgroundTrueColor || null,
          rawTags: cell.rawTags || []
        }));

        return {
          type: 'table',
          position,
          horizontalDirection,
          verticalDirection,
          rowCount,
          columnCount,
          rowHeights,
          columnWidths,
          defaultRowHeight,
          defaultColumnWidth,
          titleRowCount,
          headerRowCount,
          titleSuppressed,
          headerSuppressed,
          tableStyleHandle,
          tableStyleName,
          cells: processedCells,
          rawTags: tags.map((tag) => ({
            code: Number(tag.code),
            value: tag.value
          }))
        };
      }
      case 'POLYLINE': {
        const flagsValue = toInt(map.get(70)?.[0]) || 0;
        return {
          type: 'polyline',
          flags: flagsValue,
          mVertexCount: toInt(map.get(71)?.[0]) || 0,
          nVertexCount: toInt(map.get(72)?.[0]) || 0,
          mDensity: toInt(map.get(73)?.[0]) || null,
          nDensity: toInt(map.get(74)?.[0]) || null,
          curveType: toInt(map.get(75)?.[0]) || null,
          elevation: toFloat(map.get(30)?.[0]) ?? 0,
          thickness: toFloat(map.get(39)?.[0]) ?? null,
          is3d: (flagsValue & 8) === 8,
          vertices: [],
          faces: []
        };
      }
      case 'POLYFACE_MESH': {
        return {
          type: 'polyfaceMesh',
          flags: toInt(map.get(70)?.[0]) || 0,
          vertexCount: toInt(map.get(71)?.[0]) || 0,
          faceCount: toInt(map.get(72)?.[0]) || 0,
          vertices: [],
          faces: []
        };
      }
      case 'MESH': {
        return {
          type: 'mesh',
          vertexCount: toInt(map.get(71)?.[0]) || 0,
          faceCount: toInt(map.get(72)?.[0]) || 0,
          subdivisionLevel: toInt(map.get(91)?.[0]) || 0,
          vertices: [],
          faces: []
        };
      }
      case 'LWPOLYLINE': {
        const xs = (map.get(10) || []).map(toFloat);
        const ys = (map.get(20) || []).map(toFloat);
        const zs = (map.get(30) || []).map(toFloat);
        const bulges = (map.get(42) || []).map(toFloat);
        const startWidths = (map.get(40) || []).map(toFloat);
        const endWidths = (map.get(41) || []).map(toFloat);
        const points = [];
        const count = Math.max(xs.length, ys.length, zs.length);
        for (let i = 0; i < count; i++) {
          points.push({
            x: xs[i] ?? 0,
            y: ys[i] ?? 0,
            z: zs[i] ?? 0,
            bulge: bulges[i] ?? 0,
            startWidth: startWidths[i] ?? null,
            endWidth: endWidths[i] ?? null
          });
        }
        const flags = map.get(70)?.[0];
        const isClosed = flags ? (toInt(flags) & 1) === 1 : false;
        return {
          type: 'lwpolyline',
          points,
          isClosed
        };
      }
      case 'SPLINE': {
        return {
          type: 'spline',
          degree: toInt(map.get(71)?.[0]),
          controlPoints: collectSeries(10, 20, 30),
          fitPoints: collectSeries(11, 21, 31),
          knots: (map.get(40) || []).map(toFloat),
          weights: (map.get(41) || []).map(toFloat),
          toleranceKnot: toFloat(map.get(43)?.[0]) ?? null,
          toleranceControlPoint: toFloat(map.get(44)?.[0]) ?? null,
          toleranceFitPoint: toFloat(map.get(45)?.[0]) ?? null,
          flags: map.get(70)?.map(toInt) || []
        };
      }
      case 'POLYSOLID': {
        const pathPoints = collectSeries(10, 20, 30);
        const sweepDirection = pointFromCodes(12, 22, 32);
        const elevation = toFloat(map.get(38)?.[0]) ?? 0;
        const defaultWidth = toFloat(map.get(40)?.[0]) ?? null;
        const startWidth = toFloat(map.get(41)?.[0]) ?? null;
        const endWidth = toFloat(map.get(42)?.[0]) ?? null;
        return {
          type: 'polysolid',
          points: pathPoints,
          height: toFloat(map.get(43)?.[0]) ?? null,
          defaultWidth,
          startWidth,
          endWidth,
          justification: toInt(map.get(70)?.[0]) || 0,
          sweepDirection,
          elevation,
          isClosed: (toInt(map.get(71)?.[0]) || 0) !== 0,
          extrusion: extractExtrusion(tags)
        };
      }
      case '3DFACE':
      case 'TRACE':
      case 'SOLID':
      case 'WIPEOUT': {
        const vertices = [];
        const xs = (map.get(10) || []).map(toFloat);
        const ys = (map.get(20) || []).map(toFloat);
        const zs = (map.get(30) || []).map(toFloat);
        const count = Math.max(xs.length, ys.length, zs.length);
        for (let i = 0; i < count; i++) {
          vertices.push({
            x: xs[i] ?? 0,
            y: ys[i] ?? 0,
            z: zs[i] ?? 0
          });
        }
        return {
          type: 'surface',
          vertices
        };
      }
      case 'BODY':
      case '3DSOLID':
      case 'REGION':
      case 'SURFACE': {
        const pointCodes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
        const outlinePoints = [];
        pointCodes.forEach((code) => {
          const xs = (map.get(code) || []).map(toFloat);
          const ys = (map.get(code + 10) || []).map(toFloat);
          const zs = (map.get(code + 20) || []).map(toFloat);
          const count = Math.max(xs.length, ys.length, zs.length);
          for (let i = 0; i < count; i++) {
            const x = xs[i] ?? 0;
            const y = ys[i] ?? 0;
            const z = zs[i] ?? 0;
            if (Number.isFinite(x) && Number.isFinite(y)) {
              outlinePoints.push({ x, y, z });
            }
          }
        });
        let boundingBox = null;
        if (outlinePoints.length) {
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          outlinePoints.forEach((pt) => {
            if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
          });
          if (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity) {
            boundingBox = { minX, minY, maxX, maxY };
          }
        }
        return {
          type: type.toLowerCase(),
          acisData: extractACISData(map),
          outline2D: outlinePoints.length ? outlinePoints.map(({ x, y }) => ({ x, y })) : null,
          boundingBox
        };
      }
      case 'SECTION': {
        const boundaryXs = (map.get(40) || []).map(toFloat);
        const boundaryYs = (map.get(41) || []).map(toFloat);
        const boundaryZs = (map.get(42) || []).map(toFloat);
        const boundary = [];
        const boundaryCount = Math.max(boundaryXs.length, boundaryYs.length, boundaryZs.length);
        for (let idx = 0; idx < boundaryCount; idx++) {
          boundary.push({
            x: boundaryXs[idx] ?? 0,
            y: boundaryYs[idx] ?? 0,
            z: boundaryZs[idx] ?? 0
          });
        }
        const sectionObjectHandle = map.get(331)?.[0] || null;
        const sectionGeometryHandle = map.get(332)?.[0] || null;
        const detailViewHandle = map.get(333)?.[0] || null;
        return {
          type: 'section',
          name: map.get(2)?.[0] || null,
          state: toInt(map.get(70)?.[0]) || 0,
          liveSection: (toInt(map.get(71)?.[0]) || 0) !== 0,
          planeOrigin: pointFromCodes(10, 20, 30),
          targetPoint: pointFromCodes(11, 21, 31),
          viewDirection: pointFromCodes(12, 22, 32),
          verticalDirection: pointFromCodes(13, 23, 33),
          normal: pointFromCodes(210, 220, 230),
          boundary,
          elevation: toFloat(map.get(38)?.[0]) ?? null,
          viewStyleHandle: map.get(340)?.[0] || null,
          backStyleHandle: map.get(341)?.[0] || null,
          sectionObjectHandle,
          sectionGeometryHandle,
          detailViewHandle
        };
      }
      case 'IMAGE': {
        return {
          type: 'image',
          insertionPoint: pointFromCodes(10, 20, 30),
          uVector: {
            x: toFloat(map.get(11)?.[0]) ?? 1,
            y: toFloat(map.get(21)?.[0]) ?? 0,
            z: toFloat(map.get(31)?.[0]) ?? 0
          },
          vVector: {
            x: toFloat(map.get(12)?.[0]) ?? 0,
            y: toFloat(map.get(22)?.[0]) ?? 1,
            z: toFloat(map.get(32)?.[0]) ?? 0
          },
          displaySize: {
            u: toFloat(map.get(13)?.[0]) ?? 0,
            v: toFloat(map.get(23)?.[0]) ?? 0
          },
          displayProps: {
            brightness: toInt(map.get(281)?.[0]) ?? 50,
            contrast: toInt(map.get(282)?.[0]) ?? 50,
            fade: toInt(map.get(283)?.[0]) ?? 0
          },
          definitionHandle: map.get(340)?.[0] || null,
          imageDef: map.get(340)?.[0] || null,
          reactorHandle: map.get(360)?.[0] || null,
          clipState: toInt(map.get(280)?.[0]) || 0
        };
      }
      case 'ACAD_PROXY_ENTITY': {
        const graphicsData = (map.get(310) || []).map((value) => value);
        const entityData = (map.get(100) || []).map((value) => value);
        const codeLookup = buildCodeLookup(tags);
        return {
          type: 'proxyEntity',
          proxyType: toInt(map.get(90)?.[0]) || null,
          applicationId: toInt(map.get(91)?.[0]) || null,
          originalClassName: map.get(1)?.[0] || null,
          lastUpdatedVersion: toInt(map.get(92)?.[0]) || null,
          wmfbits: graphicsData,
          persistentData: entityData,
          position: pointFromCodes(10, 20, 30),
          ownerHandle: map.get(330)?.[0] || null,
          codeValues: codeLookup
        };
      }
      case 'OLEFRAME':
      case 'OLE2FRAME':
      case 'UNDERLAYFRAME':
      case 'OVERLAYFRAME': {
        const rawPoints = collectSeries(10, 20, 30);
        let framePoints = rawPoints.slice();
        if (framePoints.length === 2) {
          const p1 = framePoints[0];
          const p2 = framePoints[1];
          framePoints = [
            { x: p1.x, y: p1.y, z: p1.z },
            { x: p2.x, y: p1.y, z: p1.z },
            { x: p2.x, y: p2.y, z: p2.z },
            { x: p1.x, y: p2.y, z: p2.z }
          ];
        }
        return {
          type: 'frame',
          frameType: upperType,
          points: framePoints,
          normal: extractExtrusion(tags)
        };
      }
      case 'PDFUNDERLAY':
      case 'DGNUNDERLAY':
      case 'DWFUNDERLAY': {
        return {
          type: 'underlay',
          underlayType: upperType,
          position: pointFromCodes(10, 20, 30),
          scale: {
            x: toFloat(map.get(41)?.[0]) ?? 1,
            y: toFloat(map.get(42)?.[0]) ?? 1,
            z: toFloat(map.get(43)?.[0]) ?? 1
          },
          rotation: toFloat(map.get(50)?.[0]) ?? 0,
          normal: {
            x: toFloat(map.get(210)?.[0]) ?? 0,
            y: toFloat(map.get(220)?.[0]) ?? 0,
            z: toFloat(map.get(230)?.[0]) ?? 1
          },
          contrast: toInt(map.get(280)?.[0]) ?? 50,
          fade: toInt(map.get(281)?.[0]) ?? 0,
          isOn: (toInt(map.get(70)?.[0]) || 0) === 0,
          isMonochrome: (toInt(map.get(290)?.[0]) || 0) === 1,
          clip: collectUnderlayClip(map),
          definitionHandle: map.get(340)?.[0] || null,
          underlayId: map.get(340)?.[0] || null,
          reactorHandle: map.get(360)?.[0] || null
        };
      }
      case 'VIEWPORT': {
        return {
          type: 'viewport',
          lowerLeft: pointFromCodes(10, 20, 30),
          upperRight: pointFromCodes(11, 21, 31),
          viewCenter: pointFromCodes(12, 22, 32),
          snapBase: pointFromCodes(13, 23, 33),
          snapSpacing: {
            x: toFloat(map.get(14)?.[0]) ?? 0,
            y: toFloat(map.get(24)?.[0]) ?? 0
          },
          viewTarget: pointFromCodes(17, 27, 37),
          viewDirection: {
            x: toFloat(map.get(16)?.[0]) ?? 0,
            y: toFloat(map.get(26)?.[0]) ?? 0,
            z: toFloat(map.get(36)?.[0]) ?? 1
          },
          viewHeight: toFloat(map.get(40)?.[0]) ?? null,
          aspectRatio: toFloat(map.get(41)?.[0]) ?? null,
          lensLength: toFloat(map.get(42)?.[0]) ?? null,
          frontClip: toFloat(map.get(43)?.[0]) ?? null,
          backClip: toFloat(map.get(44)?.[0]) ?? null,
          twist: toFloat(map.get(51)?.[0]) ?? 0,
          viewMode: toInt(map.get(71)?.[0]) || 0,
          circleZoom: toInt(map.get(74)?.[0]) || 0,
          status: toInt(map.get(68)?.[0]) || 0,
          logicalId: map.get(69)?.[0] || null,
          clipOn: (toInt(map.get(90)?.[0]) || 0) === 1,
          clipBoundary: collectViewportClip(map)
        };
      }
      case 'PDFUNDERLAY':
      case 'DGNUNDERLAY':
      case 'DWFUNDERLAY': {
        return {
          type: 'underlay',
          underlayType: upperType,
          position: pointFromCodes(10, 20, 30),
          scale: {
            x: toFloat(map.get(41)?.[0]) ?? 1,
            y: toFloat(map.get(42)?.[0]) ?? 1,
            z: toFloat(map.get(43)?.[0]) ?? 1
          },
          rotation: toFloat(map.get(50)?.[0]) ?? 0,
          normal: {
            x: toFloat(map.get(210)?.[0]) ?? 0,
            y: toFloat(map.get(220)?.[0]) ?? 0,
            z: toFloat(map.get(230)?.[0]) ?? 1
          },
          contrast: toInt(map.get(280)?.[0]) ?? 50,
          fade: toInt(map.get(281)?.[0]) ?? 0,
          isOn: (toInt(map.get(70)?.[0]) || 0) === 0,
          isMonochrome: (toInt(map.get(290)?.[0]) || 0) === 1,
          clip: this._collectUnderlayClip(map),
          underlayId: map.get(340)?.[0] || null
        };
      }
      default: {
        return {
          type: 'raw',
          codes: tags.map((tag) => ({
            code: Number(tag.code),
            value: tag.value
          }))
        };
      }
    }
  }

  class RenderableEntityFactory {
    constructor() {}

    static resolveColorBookReference(colorBooks, reference) {
      if (!colorBooks || !reference) {
        return null;
      }
      const byKey = colorBooks.byKey || null;
      const byHandle = colorBooks.byHandle || null;
      const books = colorBooks.books || null;
      const handleKey = reference.handle ? String(reference.handle).trim().toUpperCase() : null;
      if (handleKey && byHandle && byHandle[handleKey]) {
        return byHandle[handleKey];
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

    static resolvePlotStyleReference(plotStyles, handle) {
      if (!plotStyles || !handle) {
        return null;
      }
      const lookup = plotStyles.handleLookup || {};
      const normalized = normalizeHandle(handle);
      if (!normalized || !lookup[normalized]) {
        return null;
      }
      const descriptor = lookup[normalized];
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
      if (type === 'colorDependent' && descriptor.name) {
        const candidate = descriptor.name.trim();
        if (/^[0-9A-Fa-f]{2}$/.test(candidate)) {
          const colorIndex = parseInt(candidate, 16);
          if (Number.isFinite(colorIndex)) {
            result.colorIndex = colorIndex;
          }
        }
      }
      return result;
    }

    static fromTags(type, tags, context = {}) {
      const upperType = type ? String(type).trim().toUpperCase() : 'UNKNOWN';
      const defaults = context.entityDefaults || null;
      const dimStylesByHandle = context.dimStylesByHandle instanceof Map
        ? context.dimStylesByHandle
        : null;
      const textStylesByHandle = context.textStylesByHandle instanceof Map
        ? context.textStylesByHandle
        : null;
      const displaySettings = context.displaySettings || null;
      const pointDisplayDefaults = displaySettings && displaySettings.point ? displaySettings.point : null;
      const metadata = extractCommonMetadata(upperType, tags, context);
      const geometry = extractGeometry(upperType, tags);
      if (metadata.textStyle && context.tables && context.tables.textStyles
        && !context.tables.textStyles[metadata.textStyle]) {
        const normalizedTextHandle = normalizeHandle(metadata.textStyle);
        if (normalizedTextHandle && textStylesByHandle && textStylesByHandle.get(normalizedTextHandle)) {
          metadata.textStyle = textStylesByHandle.get(normalizedTextHandle);
        } else if (normalizedTextHandle) {
          const tablesTextStyles = context.tables.textStyles;
          const matchedName = Object.keys(tablesTextStyles).find((name) => {
            const entry = tablesTextStyles[name];
            return entry && normalizeHandle(entry.handle) === normalizedTextHandle;
          });
          if (matchedName) {
            metadata.textStyle = matchedName;
          }
        }
      } else if (!metadata.textStyle && defaults && defaults.textStyle) {
        metadata.textStyle = defaults.textStyle;
      }
      const entityId = metadata.handle ||
        (typeof context.createEntityId === 'function'
          ? context.createEntityId(upperType)
          : `${upperType}_${Date.now()}`);

      const materialHandle = metadata.material
        ? String(metadata.material).trim().toUpperCase()
        : null;
      const materialLookup = context.materials
        || (context.tables && context.tables.materialsByHandle)
        || (context.tables && context.tables.materials)
        || null;
      const resolvedColorBook = metadata.colorBook && context.tables && context.tables.colorBooks
        ? RenderableEntityFactory.resolveColorBookReference(context.tables.colorBooks, metadata.colorBook)
        : null;
      const resolveByHandle = (container, handle) => {
        if (!container || !handle) {
          return null;
        }
        const normalized = normalizeHandle(handle);
        if (normalized && Object.prototype.hasOwnProperty.call(container, normalized)) {
          return container[normalized];
        }
        return Object.prototype.hasOwnProperty.call(container, handle) ? container[handle] : null;
      };
      const pointCloudDefinitions = context.pointClouds && context.pointClouds.definitions
        ? context.pointClouds.definitions
        : null;
      const pointCloudReactors = context.pointClouds && context.pointClouds.reactors
        ? context.pointClouds.reactors
        : null;
      const pointCloudExRecords = context.pointClouds && context.pointClouds.exRecords
        ? context.pointClouds.exRecords
        : null;
      const dimStylesTable = context.tables && context.tables.dimStyles
        ? context.tables.dimStyles
        : null;
      const geometryDimStyleName = geometry && geometry.dimensionStyle
        ? String(geometry.dimensionStyle).trim()
        : null;
      const geometryDimStyleHandle = geometry && geometry.dimensionStyleHandle
        ? geometry.dimensionStyleHandle
        : null;
      let dimensionStyleName = geometryDimStyleName || (defaults && defaults.dimStyle) || null;
      let dimensionStyleHandle = geometryDimStyleHandle || (defaults && defaults.dimStyleHandle) || null;
      let normalizedDimStyleHandle = null;
      if (dimensionStyleHandle) {
        normalizedDimStyleHandle = normalizeHandle(dimensionStyleHandle);
        if (normalizedDimStyleHandle) {
          dimensionStyleHandle = normalizedDimStyleHandle;
        }
      }
      if (!dimensionStyleName && dimensionStyleHandle && dimStylesByHandle) {
        const mapped = dimStylesByHandle.get(dimensionStyleHandle);
        if (mapped) {
          dimensionStyleName = mapped;
        }
      }
      if (dimensionStyleName && dimStylesTable && !dimStylesTable[dimensionStyleName]) {
        const upperName = dimensionStyleName.toUpperCase();
        const match = Object.keys(dimStylesTable).find((name) => String(name).toUpperCase() === upperName);
        if (match) {
          dimensionStyleName = match;
        }
      }
      let resolvedDimensionStyle = null;
      if (dimStylesTable) {
        if (dimensionStyleName && dimStylesTable[dimensionStyleName]) {
          resolvedDimensionStyle = dimStylesTable[dimensionStyleName];
        } else if (dimensionStyleHandle) {
          if (dimStylesByHandle && dimStylesByHandle.get(dimensionStyleHandle)) {
            const mapped = dimStylesByHandle.get(dimensionStyleHandle);
            resolvedDimensionStyle = mapped && dimStylesTable[mapped] ? dimStylesTable[mapped] : null;
            if (!dimensionStyleName && mapped && dimStylesTable[mapped]) {
              dimensionStyleName = mapped;
            }
          } else {
            const matchedName = Object.keys(dimStylesTable).find((name) => {
              const entry = dimStylesTable[name];
              return entry && normalizeHandle(entry.handle) === dimensionStyleHandle;
            });
            if (matchedName) {
              resolvedDimensionStyle = dimStylesTable[matchedName];
              if (!dimensionStyleName) {
                dimensionStyleName = matchedName;
              }
            }
          }
        }
      }

      if (geometry && upperType === 'DIMENSION') {
        if (!geometry.units && context.units) {
          const units = context.units || null;
          geometry.units = units
            ? {
                insUnits: units.insUnits != null ? units.insUnits : null,
                insUnitsSource: units.insUnitsSource != null ? units.insUnitsSource : null,
                insUnitsTarget: units.insUnitsTarget != null ? units.insUnitsTarget : null
              }
            : null;
        }

        const dimStyleParams = resolvedDimensionStyle && resolvedDimensionStyle.parameters
          ? resolvedDimensionStyle.parameters
          : null;
        if (dimStyleParams) {
          if (dimStyleParams.linearFactor != null && !Number.isNaN(dimStyleParams.linearFactor)) {
            geometry.dimensionLinearFactor = dimStyleParams.linearFactor;
          }
          if (dimStyleParams.overallScale != null && !Number.isNaN(dimStyleParams.overallScale)) {
            geometry.dimensionScaleFactor = dimStyleParams.overallScale;
          }
          if (dimStyleParams.toleranceScale != null && !Number.isNaN(dimStyleParams.toleranceScale)) {
            geometry.dimensionToleranceScale = dimStyleParams.toleranceScale;
          }
          const dimScaleFactor = geometry.dimensionScaleFactor != null && !Number.isNaN(geometry.dimensionScaleFactor)
            ? geometry.dimensionScaleFactor
            : 1;
          if (dimStyleParams.dimensionLineIncrement != null && !Number.isNaN(dimStyleParams.dimensionLineIncrement)) {
            geometry.dimensionLineIncrement = dimStyleParams.dimensionLineIncrement * dimScaleFactor;
          }
          if (dimStyleParams.dimensionLineExtension != null && !Number.isNaN(dimStyleParams.dimensionLineExtension)) {
            geometry.dimensionLineExtension = dimStyleParams.dimensionLineExtension * dimScaleFactor;
          }
          if (dimStyleParams.tickSize != null && !Number.isNaN(dimStyleParams.tickSize)) {
            geometry.dimensionTickSize = dimStyleParams.tickSize * dimScaleFactor;
          }
          if (dimStyleParams.tolerancePlus != null && !Number.isNaN(dimStyleParams.tolerancePlus)) {
            geometry.dimensionToleranceUpper = dimStyleParams.tolerancePlus;
          }
          if (dimStyleParams.toleranceMinus != null && !Number.isNaN(dimStyleParams.toleranceMinus)) {
            geometry.dimensionToleranceLower = dimStyleParams.toleranceMinus;
          }
        }

        const dimStyleToggles = resolvedDimensionStyle && resolvedDimensionStyle.toggles
          ? resolvedDimensionStyle.toggles
          : null;
        if (dimStyleToggles && dimStyleToggles.suppressExtensionLine1 != null) {
          geometry.extensionLine1Suppressed = dimStyleToggles.suppressExtensionLine1;
        }
        if (dimStyleToggles && dimStyleToggles.suppressExtensionLine2 != null) {
          geometry.extensionLine2Suppressed = dimStyleToggles.suppressExtensionLine2;
        }
        if (dimStyleToggles) {
          geometry.dimensionStyleToggles = dimStyleToggles;
        }

        const dimStyleMeasurement = resolvedDimensionStyle && resolvedDimensionStyle.measurement
          ? resolvedDimensionStyle.measurement
          : null;
        if (dimStyleMeasurement) {
          geometry.dimensionMeasurementSettings = dimStyleMeasurement;
        }

        const dimStyleAlternateUnits = resolvedDimensionStyle && resolvedDimensionStyle.alternateUnits
          ? resolvedDimensionStyle.alternateUnits
          : null;
        if (dimStyleAlternateUnits) {
          geometry.dimensionAlternateUnits = dimStyleAlternateUnits;
        }

        const dimStyleText = resolvedDimensionStyle && resolvedDimensionStyle.text
          ? resolvedDimensionStyle.text
          : null;
        if (dimStyleText) {
          geometry.dimensionTextOverrides = dimStyleText;
        }

        const dimStyleReferences = resolvedDimensionStyle && resolvedDimensionStyle.references
          ? resolvedDimensionStyle.references
          : null;
        if (dimStyleReferences) {
          const extractHandle = (entry) => {
            if (!entry) {
              return null;
            }
            if (entry.handleUpper) {
              return entry.handleUpper;
            }
            if (entry.handle) {
              return normalizeHandle(entry.handle);
            }
            return null;
          };
          const textStyleHandle = extractHandle(dimStyleReferences.textStyle);
          if (textStyleHandle) {
            geometry.dimensionTextStyleHandle = textStyleHandle;
            if (!metadata.textStyle) {
              const resolvedTextStyle = textStylesByHandle
                ? (textStylesByHandle.get(textStyleHandle) ||
                  textStylesByHandle.get(String(textStyleHandle).toUpperCase()))
                : null;
              if (resolvedTextStyle) {
                metadata.textStyle = resolvedTextStyle;
                geometry.dimensionTextStyle = resolvedTextStyle;
              }
            }
          }
          geometry.dimensionArrowBlocks = {
            primary: extractHandle(dimStyleReferences.arrowBlock),
            first: extractHandle(dimStyleReferences.firstArrowBlock),
            second: extractHandle(dimStyleReferences.secondArrowBlock),
            leader: extractHandle(dimStyleReferences.leaderArrowBlock)
          };
          geometry.dimensionLineLinetypeHandle = extractHandle(dimStyleReferences.dimensionLineLinetype);
          geometry.extensionLine1LinetypeHandle = extractHandle(dimStyleReferences.extensionLine1Linetype);
          geometry.extensionLine2LinetypeHandle = extractHandle(dimStyleReferences.extensionLine2Linetype);
        }

        if (!Array.isArray(geometry.dimensionAssociativeHandles)) {
          const rawAssocHandles = Array.isArray(geometry.associativeHandles) ? geometry.associativeHandles : [];
          geometry.dimensionAssociativeHandles = rawAssocHandles
            .map((handle) => normalizeHandle(handle))
            .filter(Boolean);
        }
      }

      if (geometry && (upperType === 'POINT' || upperType === 'MPOINT')) {
        if (pointDisplayDefaults) {
          if (!Number.isFinite(geometry.pointSize) && Number.isFinite(pointDisplayDefaults.size)) {
            geometry.pointSize = pointDisplayDefaults.size;
          }
          if (!Number.isFinite(geometry.pointMode) && Number.isFinite(pointDisplayDefaults.mode)) {
            geometry.pointMode = pointDisplayDefaults.mode;
          }
        }
        if (!Number.isFinite(geometry.pointMode)) {
          geometry.pointMode = 0;
        }
      }

      if (geometry && upperType === 'TRACE' && displaySettings && Number.isFinite(displaySettings.traceWidth)) {
        geometry.traceWidth = displaySettings.traceWidth;
      }

      if (geometry && upperType === 'INSERT') {
        const clipFilters = resolveInsertClipFilters(metadata, context);
        if (clipFilters.length) {
          geometry.clipFilters = clipFilters;
        }
      }

      return {
        id: entityId,
        type: upperType,
        space: metadata.space,
        layer: metadata.layer,
        linetype: metadata.linetype,
        lineweight: metadata.lineweight,
        linetypeScale: metadata.linetypeScale,
        color: metadata.color,
        trueColor: metadata.trueColor,
        transparency: metadata.transparency,
        layout: metadata.layout,
        textStyle: metadata.textStyle,
        thickness: metadata.thickness,
        elevation: metadata.elevation,
        extrusion: metadata.extrusion,
        extensionDictionary: metadata.extensionDictionary || null,
        extensionDictionaryUpper: metadata.extensionDictionaryUpper || null,
        reactors: Array.isArray(metadata.reactors) ? metadata.reactors.slice() : [],
        flags: metadata.flags,
        owner: metadata.owner,
        handle: metadata.handle,
        blockName: context.blockName || null,
        material: metadata.material,
        plotStyle: metadata.plotStyle,
        visualStyle: metadata.visualStyle,
        shadowMode: metadata.shadowMode,
        spaceFlag: metadata.spaceFlag,
        colorBook: metadata.colorBook,
        dimensionStyle: dimensionStyleName || null,
        dimensionStyleHandle: dimensionStyleHandle || null,
        geometry,
        rawTags: tags.map((tag) => ({
          code: Number(tag.code),
          value: tag.value
        })),
        resolved: {
          layer: context.tables && context.tables.layers
            ? context.tables.layers[metadata.layer] || null
            : null,
          linetype: context.tables && context.tables.linetypes
            ? context.tables.linetypes[metadata.linetype] || null
            : null,
          textStyle: metadata.textStyle && context.tables && context.tables.textStyles
            ? context.tables.textStyles[metadata.textStyle] || null
            : null,
          material: materialHandle && materialLookup
            ? materialLookup[materialHandle] || null
            : null,
          plotStyle: metadata.plotStyle && context.tables && context.tables.plotStyles
            ? RenderableEntityFactory.resolvePlotStyleReference(context.tables.plotStyles, metadata.plotStyle)
            : null,
          colorBook: resolvedColorBook,
          dimensionStyle: resolvedDimensionStyle,
          imageDefinition: resolveByHandle(context.imageDefinitions, geometry && (geometry.definitionHandle || geometry.imageDef)),
          imageDefReactor: resolveByHandle(context.imageDefReactors, geometry && geometry.reactorHandle),
          underlayDefinition: resolveByHandle(context.underlayDefinitions, geometry && (geometry.definitionHandle || geometry.underlayId)),
          pointCloudDefinition: resolveByHandle(pointCloudDefinitions, geometry && (geometry.definitionHandle || geometry.pointCloudDef)),
          pointCloudReactor: resolveByHandle(pointCloudReactors, geometry && geometry.reactorHandle),
          pointCloudExRecord: resolveByHandle(pointCloudExRecords, geometry && geometry.exRecordHandle),
          sectionViewStyle: resolveByHandle(context.sectionViewStyles, geometry && geometry.viewStyleHandle),
          detailViewStyle: resolveByHandle(context.detailViewStyles, geometry && geometry.backStyleHandle),
          sectionObject: resolveByHandle(context.sectionObjects, geometry && geometry.sectionObjectHandle),
          sectionGeometry: resolveByHandle(context.sectionGeometries, geometry && geometry.sectionGeometryHandle),
          detailViewObject: resolveByHandle(context.detailViewObjects, geometry && geometry.detailViewHandle),
          proxyObject: resolveByHandle(context.proxyObjects, metadata.handle),
          rasterVariables: context.rasterVariables || null,
          associativity: (geometry && (geometry.dimensionAssociativity != null || (geometry.dimensionAssociativeHandles && geometry.dimensionAssociativeHandles.length)))
            ? {
                mode: geometry.dimensionAssociativity != null ? geometry.dimensionAssociativity : null,
                pointIndex: geometry.dimensionAssociativityPoint != null ? geometry.dimensionAssociativityPoint : null,
                handles: Array.isArray(geometry.dimensionAssociativeHandles)
                  ? geometry.dimensionAssociativeHandles.slice()
                  : []
              }
            : null
        }
      };
    }

    static parseVertexTags(tags, context = {}) {
      const map = buildCodeLookup(tags);
      const handle = getFirstCodeValue(tags, 5);
      const flags = toInt(map.get(70)?.[0]) || 0;
      const vertex = {
        type: 'vertex',
        handle: handle || null,
        position: {
          x: toFloat(map.get(10)?.[0]) ?? 0,
          y: toFloat(map.get(20)?.[0]) ?? 0,
          z: toFloat(map.get(30)?.[0]) ?? 0
        },
        startWidth: toFloat(map.get(40)?.[0]) ?? null,
        endWidth: toFloat(map.get(41)?.[0]) ?? null,
        bulge: toFloat(map.get(42)?.[0]) ?? 0,
        flags,
        isFaceRecord: (flags & 128) === 128,
        indices: {
          v1: toInt(map.get(71)?.[0]) ?? null,
          v2: toInt(map.get(72)?.[0]) ?? null,
          v3: toInt(map.get(73)?.[0]) ?? null,
          v4: toInt(map.get(74)?.[0]) ?? null
        },
        extrusion: extractExtrusion(tags),
        rawTags: tags.map((tag) => ({
          code: Number(tag.code),
          value: tag.value
        }))
      };
      if (context.family === 'polyline') {
        vertex.is3d = !!context.is3d;
      }
      return vertex;
    }
  }

  namespace.utils = {
    toFloat,
    toInt,
    buildCodeLookup,
    getFirstCodeValue,
    getAllCodeValues,
    parseTrueColor,
    parseTransparency,
    extractExtrusion,
    mapToPlainObject
  };

  namespace.RenderableEntityFactory = RenderableEntityFactory;

  return {
    RenderableEntityFactory,
    utils: namespace.utils
  };
}));
