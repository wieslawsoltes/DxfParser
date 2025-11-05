// Auto-generated convenience bundle.
// Concatenates core rendering modules for direct <script> inclusion.
// Source modules:
//   components/rendering-entities.js
//   components/rendering-data-controller.js
//   components/rendering-surface-canvas.js
//   components/rendering-surface-webgl.js
//   components/rendering-text-layout.js
//   components/rendering-document-builder.js
//   components/rendering-scene-graph.js
//   components/rendering-tessellation.js
//   components/rendering-renderer.js
//   components/rendering-overlay.js


// ---- Begin: components/rendering-entities.js ----
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
      color = { type: 'aci', value: colorNumber };
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
      colorBook
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
          hasAttributes: (toInt(map.get(66)?.[0]) || 0) === 1
        };
      }
      case 'DIMENSION': {
        const dimensionStyleName = map.get(3)?.[0] || null;
        const dimensionStyleHandle = map.get(107)?.[0] || map.get(340)?.[0] || null;
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
        return {
          type: 'dimension',
          dimensionType: toInt(map.get(70)?.[0]) || 0,
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
          blockName: map.get(2)?.[0] || null,
          dimensionStyle: dimensionStyleName,
          dimensionStyleHandle
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
          rasterVariables: context.rasterVariables || null
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

// ---- End: components/rendering-entities.js ----

// ---- Begin: components/rendering-data-controller.js ----
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

// ---- End: components/rendering-data-controller.js ----

// ---- Begin: components/rendering-surface-canvas.js ----
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
  const globalScope = root;
  const documentRef = root.document || (typeof document !== 'undefined' ? document : null);

  class CanvasSurface {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.devicePixelRatio = (globalScope && globalScope.devicePixelRatio) || 1;
      this.background = '#0b1828';
      this.backgroundFill = { type: 'color', css: this.background };
    }

    attach(canvas, options = {}) {
      if (!canvas) {
        throw new Error('CanvasSurface requires a canvas element.');
      }
      const onCanvasReplaced = typeof options.onCanvasReplaced === 'function'
        ? options.onCanvasReplaced
        : null;
      const desiredDpr = options.devicePixelRatio || this.devicePixelRatio;
      const tryGetContext = (canvasEl) => {
        if (!canvasEl || typeof canvasEl.getContext !== 'function') {
          return null;
        }
        return canvasEl.getContext('2d')
          || canvasEl.getContext('2d', { willReadFrequently: true })
          || canvasEl.getContext('2d', { alpha: false });
      };

      let targetCanvas = canvas;
      let context = tryGetContext(targetCanvas);

      if (!context && targetCanvas && targetCanvas.parentNode && targetCanvas.ownerDocument) {
        const replacement = targetCanvas.cloneNode(false);
        const width = targetCanvas.width || Math.max(1, Math.floor((targetCanvas.clientWidth || 1) * (desiredDpr || 1)));
        const height = targetCanvas.height || Math.max(1, Math.floor((targetCanvas.clientHeight || 1) * (desiredDpr || 1)));
        replacement.width = width;
        replacement.height = height;
        targetCanvas.parentNode.replaceChild(replacement, targetCanvas);
        targetCanvas = replacement;
        context = tryGetContext(targetCanvas);
      }

      if (!context) {
        throw new Error('Canvas 2D context is unavailable.');
      }

      this.canvas = targetCanvas;
      this.ctx = context;
      this.devicePixelRatio = desiredDpr;
      if (onCanvasReplaced) {
        onCanvasReplaced(targetCanvas);
      }
    }

    resize({ width, height, devicePixelRatio } = {}) {
      if (typeof devicePixelRatio === 'number' && !Number.isNaN(devicePixelRatio)) {
        this.devicePixelRatio = devicePixelRatio;
      }
      // Width and height adjustments are handled by the overlay controller.
      // We simply make sure the context is aware of the new pixel ratio.
    }

    clear() {
      if (!this.ctx || !this.canvas) return;
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const fill = this.backgroundFill || { type: 'color', css: this.background };
      if (fill.type === 'gradient' && Array.isArray(fill.stops) && fill.stops.length >= 2) {
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        fill.stops.forEach((stop) => {
          if (!stop) {
            return;
          }
          const position = Math.max(0, Math.min(1, Number.isFinite(stop.position) ? stop.position : 0));
          gradient.addColorStop(position, stop.css || this.background);
        });
        this.ctx.fillStyle = gradient;
      } else if (fill.type === 'pattern' && fill.pattern && typeof fill.pattern === 'function') {
        this.ctx.fillStyle = fill.pattern(this.ctx, this.canvas) || this.background;
      } else {
        this.ctx.fillStyle = fill.css || this.background;
      }
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }

    render(frame) {
      if (!this.ctx || !frame) return;
      this._updateBackgroundFill(frame.environment ? frame.environment.background : null);

      const hasGeometry =
        (frame.polylines && frame.polylines.length > 0) ||
        (frame.points && frame.points.length > 0) ||
        (frame.fills && frame.fills.length > 0);

      this.clear();
      if (!hasGeometry) {
        return;
      }

      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(this.devicePixelRatio, this.devicePixelRatio);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const fills = frame.fills || [];
      for (let i = 0; i < fills.length; i++) {
        const fill = fills[i];
        if (fill.triangles && fill.triangles.length >= 6 && fill.type === 'solid') {
          ctx.fillStyle = fill.colorCss || 'rgba(210, 227, 255, 0.35)';
          ctx.globalAlpha = fill.color ? fill.color.a : 1;
          for (let t = 0; t < fill.triangles.length; t += 6) {
            ctx.beginPath();
            ctx.moveTo(fill.triangles[t], fill.triangles[t + 1]);
            ctx.lineTo(fill.triangles[t + 2], fill.triangles[t + 3]);
            ctx.lineTo(fill.triangles[t + 4], fill.triangles[t + 5]);
            ctx.closePath();
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          continue;
        }
        if (fill.screenContours && fill.screenContours.length) {
          ctx.save();
          const brush = this._createFillBrush(ctx, fill);
          ctx.fillStyle = brush || (fill.colorCss || 'rgba(210, 227, 255, 0.35)');
          ctx.globalAlpha = fill.color ? fill.color.a : 1;
          fill.screenContours.forEach((contour) => {
            const points = contour.points || [];
            if (!points.length) {
              return;
            }
            ctx.beginPath();
            for (let p = 0; p < points.length; p++) {
              const pt = points[p];
              if (p === 0) {
                ctx.moveTo(pt.x, pt.y);
              } else {
                ctx.lineTo(pt.x, pt.y);
              }
            }
            ctx.closePath();
            const fillRule = contour.winding && contour.winding.toLowerCase() === 'evenodd'
              ? 'evenodd'
              : 'nonzero';
            ctx.fill(fillRule);
          });
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }

      const polylines = frame.polylines || [];
      for (let i = 0; i < polylines.length; i++) {
        const polyline = polylines[i];
        if (!polyline.screenPoints || polyline.screenPoints.length < 4) {
          continue;
        }
        const strokeCss = polyline.colorCss || 'rgba(210, 227, 255, 1)';
        ctx.lineWidth = Math.max(0.6, polyline.weight || 1);
        ctx.strokeStyle = strokeCss;
        ctx.globalAlpha = polyline.color ? polyline.color.a : 1;
        ctx.beginPath();
        ctx.moveTo(polyline.screenPoints[0], polyline.screenPoints[1]);
        for (let p = 2; p < polyline.screenPoints.length; p += 2) {
          ctx.lineTo(polyline.screenPoints[p], polyline.screenPoints[p + 1]);
        }
        if (polyline.closed) {
          ctx.closePath();
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const points = frame.points || [];
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (!point.screenPosition) continue;
        ctx.save();
        ctx.translate(point.screenPosition[0], point.screenPosition[1]);
        const size = Math.max(1.5, point.size || 4);
        const radius = size / 2;
        ctx.fillStyle = point.colorCss || 'rgba(255, 224, 125, 1)';
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const texts = frame.texts || [];
      for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        if (!text || !text.lines || !text.lines.length) {
          continue;
        }
        ctx.save();
        ctx.translate(text.screenPosition[0], text.screenPosition[1]);
        ctx.rotate(text.rotationRad || 0);
        ctx.fillStyle = text.colorCss || '#e8f1ff';
        ctx.font = `${text.fontStyle || 'normal'} ${text.fontWeight || '400'} ${Math.max(6, text.fontSize || 10)}px ${text.fontFamily || 'Arial, \"Helvetica Neue\", Helvetica, sans-serif'}`;
        ctx.textAlign = text.textAlign || 'left';
        ctx.textBaseline = 'top';
        const lineHeight = Math.max(6, text.lineHeight || text.fontSize || 10);
        for (let l = 0; l < text.lines.length; l++) {
          const line = text.lines[l];
          ctx.fillText(line, 0, lineHeight * l);
        }
        ctx.restore();
      }

      ctx.restore();
    }

    renderMessage(message) {
      this.clear();
      if (!this.ctx || !message) {
        return;
      }
      const ctx = this.ctx;
      const width = this.canvas ? this.canvas.width : 0;
      const height = this.canvas ? this.canvas.height : 0;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(this.devicePixelRatio, this.devicePixelRatio);
      ctx.fillStyle = 'rgba(210, 227, 255, 0.75)';
      ctx.font = '16px Arial, "Helvetica Neue", Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(message, (width / this.devicePixelRatio) / 2, (height / this.devicePixelRatio) / 2);
      ctx.restore();
    }

    suspend() {
      // no-op for pure canvas surface.
    }

    resume() {
      // no-op for pure canvas surface.
    }

    destroy() {
      this.canvas = null;
      this.ctx = null;
    }

    _updateBackgroundFill(background) {
      if (!background) {
        this.backgroundFill = { type: 'color', css: this.background };
        return;
      }
      if (background.type === 'solid' && background.solid && background.solid.css) {
        this.backgroundFill = { type: 'color', css: background.solid.css };
        return;
      }
      if (background.solidFallback && background.solidFallback.css) {
        this.backgroundFill = { type: 'color', css: background.solidFallback.css };
        return;
      }
      this.backgroundFill = { type: 'color', css: this.background };
    }

    _createFillBrush(ctx, fill) {
      if (!fill) {
        return null;
      }
      if (fill.gradient) {
        return this._createGradientBrush(ctx, fill);
      }
      if (fill.pattern) {
        return this._createPatternBrush(ctx, fill);
      }
      return null;
    }

    _computeBounds(contours) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      contours.forEach((contour) => {
        (contour.points || []).forEach((pt) => {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        });
      });
      if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
        return null;
      }
      return { minX, minY, maxX, maxY };
    }

    _createGradientBrush(ctx, fill) {
      const gradientInfo = fill.gradient;
      const bounds = this._computeBounds(fill.screenContours || []);
      if (!gradientInfo || !bounds) {
        return null;
      }
      const angle = gradientInfo.angle || 0;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      const radius = Math.sqrt(width * width + height * height) / 2;
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      const shift = gradientInfo.shift || 0;
      const shiftOffset = shift * radius;
      const startX = centerX - cos * (radius + shiftOffset);
      const startY = centerY - sin * (radius + shiftOffset);
      const endX = centerX + cos * (radius - shiftOffset);
      const endY = centerY + sin * (radius - shiftOffset);
      const brush = ctx.createLinearGradient(startX, startY, endX, endY);
      const stops = gradientInfo.colors || [];
      if (!stops.length) {
        return null;
      }
      stops.forEach((stop) => {
        const position = Math.min(Math.max(stop.position ?? 0, 0), 1);
        const css = stop.color && stop.color.css ? stop.color.css : 'rgba(210, 227, 255, 0.35)';
        brush.addColorStop(position, css);
      });
      return brush;
    }

    _createPatternBrush(ctx, fill) {
      const patternInfo = fill.pattern;
      if (!patternInfo || !Array.isArray(patternInfo.definition) || !patternInfo.definition.length) {
        return null;
      }
      if (!documentRef || typeof documentRef.createElement !== 'function') {
        return null;
      }

      const scale = patternInfo.scale || 1;
      const baseSize = Math.max(16, 32 * scale);
      const maxOffset = patternInfo.definition.reduce((acc, line) => {
        if (!line || !line.offset) return acc;
        const offsetMag = Math.hypot(line.offset.x || 0, line.offset.y || 0);
        return Math.max(acc, offsetMag);
      }, 0) * scale;
      const tileSizeValue = Math.max(baseSize, Math.ceil((maxOffset || 0) * 4));
      const tileSize = Math.max(16, tileSizeValue);
      const tileCanvas = documentRef.createElement('canvas');
      tileCanvas.width = tileCanvas.height = Math.ceil(tileSize);
      const tileCtx = tileCanvas.getContext('2d');
      if (!tileCtx) {
        return null;
      }

      tileCtx.save();
      tileCtx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
      const rotation = (patternInfo.angle || 0) * Math.PI / 180;
      tileCtx.translate(tileCanvas.width / 2, tileCanvas.height / 2);
      tileCtx.rotate(rotation);
      tileCtx.translate(-tileCanvas.width / 2, -tileCanvas.height / 2);

      const strokeCss = fill.color && fill.color.css ? fill.color.css : 'rgba(210, 227, 255, 0.6)';
      tileCtx.strokeStyle = strokeCss;
      tileCtx.lineWidth = Math.max(0.6, scale * 0.75);
      tileCtx.lineCap = 'butt';
      patternInfo.definition.forEach((line) => {
        const angle = (line.angle || 0) * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const baseX = line.base ? line.base.x * scale : 0;
        const baseY = line.base ? -line.base.y * scale : 0;
        const offsetX = line.offset ? line.offset.x * scale : 0;
        const offsetY = line.offset ? -line.offset.y * scale : 0;
        const spacing = Math.max(4, Math.hypot(offsetX, offsetY) || baseSize / 2);
        const steps = Math.ceil((tileCanvas.width + tileCanvas.height) / spacing) + 2;
        const dash = Array.isArray(line.dashPattern)
          ? line.dashPattern.map((value) => Math.abs(value) * scale)
          : [];
        tileCtx.setLineDash(dash);
        for (let n = -steps; n <= steps; n++) {
          const shiftX = baseX + offsetX * n + tileCanvas.width / 2;
          const shiftY = baseY + offsetY * n + tileCanvas.height / 2;
          tileCtx.beginPath();
          tileCtx.moveTo(
            shiftX - cos * tileCanvas.width,
            shiftY - sin * tileCanvas.width
          );
          tileCtx.lineTo(
            shiftX + cos * tileCanvas.width,
            shiftY + sin * tileCanvas.width
          );
          tileCtx.stroke();
        }
        tileCtx.setLineDash([]);
      });
      tileCtx.restore();

      const pattern = ctx.createPattern(tileCanvas, 'repeat');
      return pattern;
    }
  }

  namespace.CanvasSurface = CanvasSurface;

  return {
    CanvasSurface
  };
}));

// ---- End: components/rendering-surface-canvas.js ----

// ---- Begin: components/rendering-surface-webgl.js ----
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
  const globalScope = root;

  class WebGLSurface {
    constructor() {
      this.canvas = null;
      this.gl = null;
      this.program = null;
      this.positionLocation = null;
      this.resolutionLocation = null;
      this.colorLocation = null;
      this.pointSizeLocation = null;
      this.positionBuffer = null;
      this.devicePixelRatio = (globalScope && globalScope.devicePixelRatio) || 1;
      this.clearColor = { r: 0.043, g: 0.089, b: 0.145, a: 1.0 };
    }

    attach(canvas, options = {}) {
      if (!canvas) {
        throw new Error('WebGLSurface requires a canvas element.');
      }
      const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: false })
        || canvas.getContext('experimental-webgl', { antialias: true, preserveDrawingBuffer: false });
      if (!gl) {
        throw new Error('WebGL context is unavailable.');
      }
      this.canvas = canvas;
      this.gl = gl;
      this.devicePixelRatio = options.devicePixelRatio || this.devicePixelRatio;
      this.program = this._createProgram(gl);
      gl.useProgram(this.program);

      this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
      this.resolutionLocation = gl.getUniformLocation(this.program, 'u_resolution');
      this.colorLocation = gl.getUniformLocation(this.program, 'u_color');
      this.pointSizeLocation = gl.getUniformLocation(this.program, 'u_pointSize');

      this.positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.enableVertexAttribArray(this.positionLocation);
      gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.clear();
    }

    resize() {
      if (!this.gl || !this.canvas) return;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    clear() {
      if (!this.gl) return;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.gl.clearColor(
        Number.isFinite(this.clearColor.r) ? this.clearColor.r : 0.043,
        Number.isFinite(this.clearColor.g) ? this.clearColor.g : 0.089,
        Number.isFinite(this.clearColor.b) ? this.clearColor.b : 0.145,
        Number.isFinite(this.clearColor.a) ? this.clearColor.a : 1.0
      );
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }

    render(frame) {
      if (!this.gl) return;

      this._updateClearColor(frame && frame.environment ? frame.environment.background : null);
      this.clear();

      if (!frame || frame.isEmpty) {
        return;
      }

      const gl = this.gl;
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.enableVertexAttribArray(this.positionLocation);
      gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(this.resolutionLocation, frame.width, frame.height);

      const fills = frame.fills || [];
      for (let i = 0; i < fills.length; i++) {
        const fill = fills[i];
        if (!fill.triangles || fill.triangles.length < 6) continue;
        gl.bufferData(gl.ARRAY_BUFFER, fill.triangles, gl.STREAM_DRAW);
        const c = fill.color || { r: 0.82, g: 0.89, b: 1, a: 0.35 };
        gl.uniform4f(this.colorLocation, c.r, c.g, c.b, c.a);
        gl.uniform1f(this.pointSizeLocation, 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, fill.triangles.length / 2);
      }

      const polylines = frame.polylines || [];
      for (let i = 0; i < polylines.length; i++) {
        const polyline = polylines[i];
        if (!polyline.screenPoints || polyline.screenPoints.length < 4) continue;
        const triangles = this._buildThickLineTriangles(
          polyline.screenPoints,
          Math.max(0.8, polyline.weight || 1) * (frame.devicePixelRatio || this.devicePixelRatio)
        );
        if (!triangles || triangles.length === 0) continue;
        gl.bufferData(gl.ARRAY_BUFFER, triangles, gl.STREAM_DRAW);
        const c = polyline.color || { r: 0.82, g: 0.89, b: 1, a: 1 };
        gl.uniform4f(this.colorLocation, c.r, c.g, c.b, c.a);
        gl.uniform1f(this.pointSizeLocation, 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, triangles.length / 2);
      }

      const points = frame.points || [];
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (!point.screenPosition) continue;
        gl.bufferData(gl.ARRAY_BUFFER, point.screenPosition, gl.STREAM_DRAW);
        const c = point.color || { r: 1, g: 0.88, b: 0.54, a: 1 };
        const size = Math.max(1.5, point.size || 4) * (frame.devicePixelRatio || this.devicePixelRatio);
        gl.uniform4f(this.colorLocation, c.r, c.g, c.b, c.a);
        gl.uniform1f(this.pointSizeLocation, size);
        gl.drawArrays(gl.POINTS, 0, 1);
      }
    }

    renderMessage() {
      this.clear();
    }

    suspend() {
      // No-op; consumer controls render loop cadence.
    }

    resume() {
      // No-op for now.
    }

    destroy() {
      if (this.gl) {
        if (this.program) {
          this.gl.deleteProgram(this.program);
        }
        if (this.positionBuffer) {
          this.gl.deleteBuffer(this.positionBuffer);
        }
        const loseContextExt = this.gl.getExtension('WEBGL_lose_context');
        if (loseContextExt && typeof loseContextExt.loseContext === 'function') {
          loseContextExt.loseContext();
        } else if (this.canvas) {
          const resetWidth = this.canvas.width || Math.max(1, this.canvas.clientWidth || 1);
          const resetHeight = this.canvas.height || Math.max(1, this.canvas.clientHeight || 1);
          this.canvas.width = 0;
          this.canvas.height = 0;
          this.canvas.width = resetWidth;
          this.canvas.height = resetHeight;
        }
      }
      this.gl = null;
      this.canvas = null;
      this.program = null;
      this.positionBuffer = null;
    }

    _createProgram(gl) {
      const vertexSource = `
        attribute vec2 a_position;
        uniform vec2 u_resolution;
        uniform float u_pointSize;
        void main() {
          vec2 zeroToOne = a_position / u_resolution;
          vec2 clipSpace = vec2(zeroToOne.x * 2.0 - 1.0, 1.0 - zeroToOne.y * 2.0);
          gl_Position = vec4(clipSpace, 0.0, 1.0);
          gl_PointSize = u_pointSize;
        }
      `;

      const fragmentSource = `
        precision mediump float;
        uniform vec4 u_color;
        void main() {
          gl_FragColor = u_color;
        }
      `;

      const vertexShader = this._compileShader(gl, gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = this._compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error('Failed to link WebGL program: ' + info);
      }

      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return program;
    }

    _compileShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error('Failed to compile WebGL shader: ' + info);
      }
      return shader;
    }

    _updateClearColor(background) {
      if (!background) {
        this.clearColor = { r: 0.043, g: 0.089, b: 0.145, a: 1.0 };
        return;
      }
      let resolved = null;
      if (background.type === 'solid' && background.solid && background.solid.resolved) {
        resolved = background.solid.resolved;
      } else if (background.solidFallback && background.solidFallback.resolved) {
        resolved = background.solidFallback.resolved;
      }
      if (resolved && Number.isFinite(resolved.r) && Number.isFinite(resolved.g) && Number.isFinite(resolved.b)) {
        this.clearColor = {
          r: Math.max(0, Math.min(1, resolved.r)),
          g: Math.max(0, Math.min(1, resolved.g)),
          b: Math.max(0, Math.min(1, resolved.b)),
          a: Number.isFinite(resolved.a) ? Math.max(0, Math.min(1, resolved.a)) : 1
        };
      } else {
        this.clearColor = { r: 0.043, g: 0.089, b: 0.145, a: 1.0 };
      }
    }

    _buildThickLineTriangles(points, thickness) {
      if (!points || points.length < 4) return null;
      const triangles = [];
      for (let i = 0; i < points.length - 2; i += 2) {
        const x0 = points[i];
        const y0 = points[i + 1];
        const x1 = points[i + 2];
        const y1 = points[i + 3];
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        if (len === 0) {
          continue;
        }
        const nx = -dy / len;
        const ny = dx / len;
        const offsetX = nx * thickness * 0.5;
        const offsetY = ny * thickness * 0.5;

        const v0x = x0 - offsetX;
        const v0y = y0 - offsetY;
        const v1x = x0 + offsetX;
        const v1y = y0 + offsetY;
        const v2x = x1 - offsetX;
        const v2y = y1 - offsetY;
        const v3x = x1 + offsetX;
        const v3y = y1 + offsetY;

        triangles.push(
          v0x, v0y,
          v2x, v2y,
          v1x, v1y,

          v1x, v1y,
          v2x, v2y,
          v3x, v3y
        );
      }
      return triangles.length ? new Float32Array(triangles) : null;
    }
  }

  WebGLSurface.isSupported = function isSupported(canvas) {
    if (!canvas) return false;
    try {
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return !!gl;
    } catch (err) {
      return false;
    }
  };

  namespace.WebGLSurface = WebGLSurface;

  return {
    WebGLSurface
  };
}));

// ---- End: components/rendering-surface-webgl.js ----

// ---- Begin: components/rendering-text-layout.js ----
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
  const globalScope = root;
  const DEFAULT_SANS = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
  const DEFAULT_SERIF = '"Times New Roman", Times, serif';
  const DEFAULT_MONO = '"Consolas", "Liberation Mono", Menlo, monospace';

  const SHX_FALLBACKS = {
    'txt': DEFAULT_MONO,
    'simplex': DEFAULT_SANS,
    'romans': DEFAULT_SERIF,
    'romand': DEFAULT_SERIF,
    'romant': DEFAULT_SERIF,
    'gdt': DEFAULT_SANS,
    'iso': DEFAULT_SANS,
    'iso3098': DEFAULT_SANS,
    'arial': DEFAULT_SANS
  };

  const DEGREE = '\u00B0';
  const DIAMETER = '\u2300';
  const PLUS_MINUS = '\u00B1';
  const CENTERLINE = '\u2104';
  const SQUARE = '\u00B2';
  const CUBIC = '\u00B3';

  class TextLayoutEngine {
    constructor(options = {}) {
      this.styleCatalog = options.styleCatalog || {};
      this.devicePixelRatio = options.devicePixelRatio || ((globalScope && globalScope.devicePixelRatio) || 1);
      this._document = options.document || (globalScope && globalScope.document) || null;
      this._styleCache = Object.create(null);
      this._canvas = null;
      this._ctx = null;
      this._measurementAvailable = !!this._document;
    }

    configure(options = {}) {
      if (options.styleCatalog) {
        this.styleCatalog = options.styleCatalog;
      }
      if (options.document) {
        this._document = options.document;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'devicePixelRatio')) {
        this.devicePixelRatio = options.devicePixelRatio || 1;
      } else {
        this.devicePixelRatio = (globalScope && globalScope.devicePixelRatio) || this.devicePixelRatio || 1;
      }
      this._measurementAvailable = !!this._document;
      this._styleCache = Object.create(null);
    }

    layout(rawText, env = {}) {
      if (!rawText) {
        return null;
      }
      const kind = rawText.kind || rawText.type || 'TEXT';
      const style = this._resolveTextStyle(rawText);
      const baseContent = this._extractContent(kind, rawText);
      if (baseContent == null || baseContent.length === 0) {
        return null;
      }

      const frameScale = env.frameScale || 1;
      const worldHeight = rawText.worldHeight || (rawText.baseHeight || 12);
      const fontSizePx = Math.max(4, worldHeight * frameScale);
      const lineHeightMultiplier = this._computeLineSpacing(kind, rawText, style);
      const lineHeightPx = fontSizePx * lineHeightMultiplier;

      const effectiveWidthFactor = this._resolveWidthFactor(rawText, style);
      const maxWidthWorld = this._resolveReferenceWidth(kind, rawText);
      const maxWidthPx = maxWidthWorld ? maxWidthWorld * frameScale : null;

      const decodedLines = this._splitIntoLines(baseContent);
      const measured = this._wrapLines(decodedLines, {
        fontSizePx,
        widthFactor: effectiveWidthFactor,
        maxWidthPx,
        font: style.font
      });

      const lines = measured.lines;
      if (!lines.length) {
        return null;
      }

      const widthPx = measured.maxEffectiveWidth || 0;
      const baseWidthPx = widthPx && effectiveWidthFactor !== 0
        ? widthPx / effectiveWidthFactor
        : measured.maxBaseWidth || 0;
      const heightPx = lineHeightPx * lines.length;

      const rotationRad = rawText.rotation || 0;
      const rotationDeg = rotationRad * 180 / Math.PI;

      const alignments = this._resolveAlignment(kind, rawText);
      const anchor = this._computeAnchorOffsets(baseWidthPx, heightPx, alignments.horizontal, alignments.vertical, lineHeightPx, kind);

      const backgroundCss = this._resolveBackground(rawText);

      return {
        kind,
        screenPosition: rawText.screenPosition || [0, 0],
        rotationRad,
        rotationDeg,
        colorCss: rawText.color && rawText.color.css ? rawText.color.css : '#ffffff',
        fontFamily: style.fontFamily,
        fontStyle: style.fontStyle,
        fontWeight: style.fontWeight,
        fontSize: fontSizePx,
        lineHeight: lineHeightPx,
        textAlign: alignments.textAlign,
        widthPx,
        baseWidthPx,
        heightPx,
        maxWidth: maxWidthPx,
        lines,
        anchor,
        backgroundCss,
        widthFactor: effectiveWidthFactor,
        rawContent: baseContent
      };
    }

    _extractContent(kind, rawText) {
      switch (kind) {
        case 'TEXT':
          return this._decodeDxfText(rawText.content || rawText.geometry?.content || '');
        case 'MTEXT': {
          const content = rawText.geometry ? rawText.geometry.text : rawText.content;
          return this._decodeMText(content || '');
        }
        case 'TOLERANCE': {
          if (rawText.geometry && Array.isArray(rawText.geometry.segments) && rawText.geometry.segments.length) {
            const joined = rawText.geometry.segments.join('\n');
            return this._decodeDxfText(joined);
          }
          const fallback = rawText.geometry?.text || rawText.content || '';
          return this._decodeDxfText(fallback);
        }
        case 'ATTDEF':
        case 'ATTRIB': {
          const geometry = rawText.geometry || {};
          const source = rawText.content != null
            ? rawText.content
            : (geometry.content ?? geometry.value ?? geometry.defaultValue ?? '');
          return this._decodeDxfText(source);
        }
        default:
          return this._decodeDxfText(rawText.content || '');
      }
    }

    _decodeMText(value) {
      if (!value || typeof value !== 'string') {
        return '';
      }
      let text = '';
      for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '\\') {
          const next = value[i + 1];
          if (next === 'P' || next === 'p' || next === 'N' || next === 'n') {
            text += '\n';
            i += 1;
            continue;
          }
          if (next === '\\') {
            text += '\\';
            i += 1;
            continue;
          }
          if (next === '~') {
            text += '\u00A0';
            i += 1;
            continue;
          }
          // Skip formatting codes such as \A, \H, \W, etc.
          const formatMatch = value.slice(i + 1).match(/^([AaCHwWQqTtObBlL])[^\\;]*[;x]?/);
          if (formatMatch) {
            i += formatMatch[0].length;
            continue;
          }
        }
        if (ch === '{' || ch === '}') {
          continue;
        }
        text += ch;
      }
      return this._decodeDxfText(text);
    }

    _decodeDxfText(value) {
      if (!value || typeof value !== 'string') {
        return '';
      }
      return value
        .replace(/%%c/gi, DIAMETER)
        .replace(/%%d/gi, DEGREE)
        .replace(/%%p/gi, PLUS_MINUS)
        .replace(/%%v/gi, CENTERLINE)
        .replace(/%%²/gi, SQUARE)
        .replace(/%%³/gi, CUBIC)
        .replace(/\\~/g, '\u00A0')
        .replace(/\\n/gi, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\([^\\])/g, '$1');
    }

    _splitIntoLines(content) {
      return content.split(/\r?\n/);
    }

    _wrapLines(lines, options) {
      const assembled = [];
      let maxBaseWidth = 0;
      let maxEffectiveWidth = 0;
      lines.forEach((line) => {
        if (line === '') {
          assembled.push({ text: '', baseWidth: 0, effectiveWidth: 0 });
          return;
        }
        if (!options.maxWidthPx || options.maxWidthPx <= 0) {
          const baseWidth = this._measureWidth(line, options.fontSizePx, options.font);
          const effectiveWidth = baseWidth * options.widthFactor;
          maxBaseWidth = Math.max(maxBaseWidth, baseWidth);
          maxEffectiveWidth = Math.max(maxEffectiveWidth, effectiveWidth);
          assembled.push({ text: line, baseWidth, effectiveWidth });
          return;
        }
        const wrapped = this._wrapParagraph(line, options);
        wrapped.lines.forEach((segment) => {
          maxBaseWidth = Math.max(maxBaseWidth, segment.baseWidth);
          maxEffectiveWidth = Math.max(maxEffectiveWidth, segment.effectiveWidth);
          assembled.push(segment);
        });
      });

      const limit = options.maxWidthPx && options.maxWidthPx > 0 ? options.maxWidthPx : null;
      if (limit != null) {
        maxEffectiveWidth = Math.min(maxEffectiveWidth, limit);
      }

      return {
        lines: assembled.map((segment) => segment.text),
        maxBaseWidth: assembled.length ? maxBaseWidth : 0,
        maxEffectiveWidth: assembled.length ? maxEffectiveWidth : 0
      };
    }

    _wrapParagraph(text, options) {
      const words = text.split(/\s+/);
      const maxWidth = options.maxWidthPx;
      const segments = [];
      let current = '';
      let currentBaseWidth = 0;

      words.forEach((word, index) => {
        if (word === '') {
          return;
        }
        const candidate = current ? `${current} ${word}` : word;
        const baseWidth = this._measureWidth(candidate, options.fontSizePx, options.font);
        const effectiveWidth = baseWidth * options.widthFactor;

        if (effectiveWidth <= maxWidth || current === '') {
          current = candidate;
          currentBaseWidth = baseWidth;
        } else {
          segments.push({
            text: current,
            baseWidth: currentBaseWidth,
            effectiveWidth: currentBaseWidth * options.widthFactor
          });
          current = word;
          currentBaseWidth = this._measureWidth(current, options.fontSizePx, options.font);
        }

        if (index === words.length - 1 && current) {
          segments.push({
            text: current,
            baseWidth: currentBaseWidth,
            effectiveWidth: currentBaseWidth * options.widthFactor
          });
        }
      });

      if (!segments.length && current) {
        const baseWidth = this._measureWidth(current, options.fontSizePx, options.font);
        segments.push({
          text: current,
          baseWidth,
          effectiveWidth: baseWidth * options.widthFactor
        });
      }

      if (!segments.length) {
        segments.push({ text: '', baseWidth: 0, effectiveWidth: 0 });
      }

      return { lines: segments };
    }

    _measureWidth(text, fontSizePx, font) {
      if (!text || !text.length) {
        return 0;
      }
      const ctx = this._ensureContext();
      let baseWidth;
      if (ctx) {
        ctx.font = font.replace('{size}', `${fontSizePx}px`);
        baseWidth = ctx.measureText(text).width;
      } else {
        baseWidth = text.length * fontSizePx * 0.6;
      }
      return baseWidth;
    }

    _ensureContext() {
      if (!this._measurementAvailable || !this._document) {
        return null;
      }
      if (!this._canvas) {
        try {
          this._canvas = this._document.createElement('canvas');
          this._ctx = this._canvas.getContext('2d');
        } catch (err) {
          this._measurementAvailable = false;
          this._canvas = null;
          this._ctx = null;
          return null;
        }
      }
      return this._ctx;
    }

    _resolveTextStyle(rawText) {
      const styleKey = rawText.styleName || rawText.entity?.textStyle || rawText.geometry?.textStyle || 'STANDARD';
      if (this._styleCache[styleKey]) {
        return this._styleCache[styleKey];
      }
      const catalogEntry = this.styleCatalog[styleKey] || {};
      const fontFamily = this._deriveFontFamily(catalogEntry);
      const fontStyle = Math.abs(catalogEntry.obliqueAngle || 0) > 1 ? 'oblique' : 'normal';
      const fontWeight = (catalogEntry.flags & 1) ? 'bold' : '400';
      const font = `${fontStyle} ${fontWeight} {size} ${fontFamily}`;
      const style = {
        name: styleKey,
        fontFamily,
        fontStyle,
        fontWeight,
        font,
        widthFactor: catalogEntry.widthFactor || 1,
        lineSpacing: catalogEntry.lineSpacing || 1
      };
      this._styleCache[styleKey] = style;
      return style;
    }

    _deriveFontFamily(styleEntry) {
      if (!styleEntry) {
        return DEFAULT_SANS;
      }
      const fileName = styleEntry.fontFileName ? styleEntry.fontFileName.toLowerCase() : null;
      if (!fileName) {
        return DEFAULT_SANS;
      }
      const baseName = fileName.replace(/\.[^.]+$/, '');
      if (styleEntry.isShx) {
        const fallback = SHX_FALLBACKS[baseName] || DEFAULT_SANS;
        return fallback;
      }
      if (styleEntry.isTrueType && baseName) {
        return `"${baseName}", ${DEFAULT_SANS}`;
      }
      return DEFAULT_SANS;
    }

    _computeLineSpacing(kind, rawText, style) {
      if (kind === 'MTEXT') {
        const geometry = rawText.geometry || {};
        const spacingStyle = geometry.lineSpacingStyle || 1;
        const spacingFactor = geometry.lineSpacing || 1;
        if (spacingStyle === 2 && spacingFactor > 0) {
          return spacingFactor;
        }
        return Math.max(1.0, spacingFactor || 1);
      }
      return 1.2;
    }

    _resolveReferenceWidth(kind, rawText) {
      if (kind === 'MTEXT') {
        const geometry = rawText.geometry || {};
        if (geometry.referenceWidth && geometry.referenceWidth > 0) {
          const scale = rawText.scaleMagnitude || 1;
          return geometry.referenceWidth * scale;
        }
      }
      return null;
    }

    _resolveWidthFactor(rawText, style) {
      const geometry = rawText.geometry || {};
      if (geometry.widthFactor && geometry.widthFactor > 0) {
        return geometry.widthFactor;
      }
      return style.widthFactor || 1;
    }

    _resolveAlignment(kind, rawText) {
      if (kind === 'MTEXT') {
        const attachment = rawText.geometry?.attachment || 1;
        const horizontal = ((attachment - 1) % 3);
        const vertical = Math.floor((attachment - 1) / 3);
        const mapH = ['left', 'center', 'right'];
        const mapV = ['top', 'middle', 'bottom'];
        return {
          horizontal: mapH[horizontal] || 'left',
          vertical: mapV[vertical] || 'top',
          textAlign: mapH[horizontal] || 'left'
        };
      }
      const alignment = rawText.geometry?.alignment || {};
      const mapH = {
        0: 'left',
        1: 'center',
        2: 'right',
        3: 'center',
        4: 'center',
        5: 'left'
      };
      const mapV = {
        0: 'bottom',
        1: 'bottom',
        2: 'middle',
        3: 'top'
      };
      const horizontal = mapH[alignment.horizontal] || 'left';
      const vertical = mapV[alignment.vertical] || 'bottom';
      return {
        horizontal,
        vertical,
        textAlign: horizontal
      };
    }

    _computeAnchorOffsets(widthPx, heightPx, horizontal, vertical, lineHeightPx, kind) {
      let offsetX = 0;
      if (horizontal === 'center') {
        offsetX = -widthPx / 2;
      } else if (horizontal === 'right') {
        offsetX = -widthPx;
      }

      let offsetY = 0;
      if (vertical === 'middle') {
        offsetY = -heightPx / 2;
      } else if (vertical === 'bottom' || vertical === 'baseline') {
        offsetY = -heightPx;
      } else if (vertical === 'top') {
        offsetY = 0;
      }
      if (kind === 'TEXT' && vertical === 'bottom') {
        offsetY += lineHeightPx * 0.15;
      }
      return { x: offsetX, y: offsetY };
    }

    _resolveBackground(rawText) {
      const geometry = rawText.geometry || {};
      const background = geometry.background || {};
      const fillFlag = geometry.backgroundFill != null
        ? geometry.backgroundFill
        : (background.fillType != null ? background.fillType : 0);
      if (!fillFlag) {
        return null;
      }
      const transparency = geometry.backgroundTransparency || background.transparency || null;
      const alpha = transparency && typeof transparency.alpha === 'number'
        ? Math.max(0, Math.min(1, transparency.alpha))
        : 1;
      if (geometry.backgroundTrueColor) {
        return this._createRgba(geometry.backgroundTrueColor, alpha);
      }
      if (Number.isInteger(geometry.backgroundColorNumber)) {
        return this._createRgba(this._aciToRgb(geometry.backgroundColorNumber), alpha);
      }
      if (background.trueColor) {
        return this._createRgba(background.trueColor, alpha);
      }
      if (Number.isInteger(background.colorNumber)) {
        return this._createRgba(this._aciToRgb(background.colorNumber), alpha);
      }
      if (rawText.entity && rawText.entity.trueColor) {
        return this._createRgba(rawText.entity.trueColor, Math.max(0.05, Math.min(1, alpha * 0.2)));
      }
      const fallbackAlpha = Math.max(0.05, Math.min(1, alpha * 0.25));
      return `rgba(0,0,0,${fallbackAlpha.toFixed(3)})`;
    }

    _createRgba(color, alphaFallback) {
      if (!color) {
        return `rgba(0,0,0,${alphaFallback})`;
      }
      if (color.css) {
        return color.css;
      }
      const r = Math.round((color.r ?? 0) * 255);
      const g = Math.round((color.g ?? 0) * 255);
      const b = Math.round((color.b ?? 0) * 255);
      const a = color.a != null ? color.a : alphaFallback;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    _aciToRgb(index) {
      const table = {
        1: { r: 255, g: 0, b: 0 },
        2: { r: 255, g: 255, b: 0 },
        3: { r: 0, g: 255, b: 0 },
        4: { r: 0, g: 255, b: 255 },
        5: { r: 0, g: 0, b: 255 },
        6: { r: 255, g: 0, b: 255 },
        7: { r: 255, g: 255, b: 255 }
      };
      if (table[index]) {
        return table[index];
      }
      return { r: 210, g: 227, b: 255 };
    }
  }

  namespace.TextLayoutEngine = TextLayoutEngine;

  return {
    TextLayoutEngine
  };
}));

// ---- End: components/rendering-text-layout.js ----

// ---- Begin: components/rendering-document-builder.js ----
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
      const { entities, blocks } = this.extractEntities(
        tables,
        materialCatalog,
        auxiliaryObjects,
        resolvedEntityDefaults,
        resolvedCoordinateDefaults,
        resolvedDisplaySettings
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
        lightLists: lightListsByHandle
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
        lightLists: auxiliaryObjects.lightLists
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
        lightLists
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

      if (upperTable === 'DIMSTYLE' && recordType === 'DIMSTYLE') {
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
          dimensionType: utils.toInt(utils.getFirstCodeValue(recordTags, 71)) || 0,
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
      displaySettings = null
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
              rasterVariables: auxiliaryObjects.rasterVariables || null,
              createEntityId: (entType) => this.nextEntityId(entType),
              entityDefaults: resolvedEntityDefaults,
              coordinateDefaults: resolvedCoordinateDefaults,
              displaySettings: resolvedDisplaySettings,
              textStylesByHandle,
              dimStylesByHandle
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
            rasterVariables: auxiliaryObjects.rasterVariables || null,
            createEntityId: (entType) => this.nextEntityId(entType),
            entityDefaults: resolvedEntityDefaults,
            coordinateDefaults: resolvedCoordinateDefaults,
            displaySettings: resolvedDisplaySettings,
            textStylesByHandle,
            dimStylesByHandle
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
            dimStylesByHandle
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

// ---- End: components/rendering-document-builder.js ----

// ---- Begin: components/rendering-scene-graph.js ----
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

// ---- End: components/rendering-scene-graph.js ----

// ---- Begin: components/rendering-tessellation.js ----
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

  function vectorLength(vector) {
    if (!vector || typeof vector !== 'object') {
      return 0;
    }
    const x = Number.isFinite(vector.x) ? vector.x : 0;
    const y = Number.isFinite(vector.y) ? vector.y : 0;
    const z = Number.isFinite(vector.z) ? vector.z : 0;
    return Math.hypot(x, y, z);
  }

  function normalizeVector(vector, fallback) {
    const length = vectorLength(vector);
    if (length < 1e-9) {
      if (fallback) {
        return { x: fallback.x || 0, y: fallback.y || 0, z: fallback.z || 0 };
      }
      return { x: 0, y: 0, z: 0 };
    }
    return {
      x: (Number.isFinite(vector.x) ? vector.x : 0) / length,
      y: (Number.isFinite(vector.y) ? vector.y : 0) / length,
      z: (Number.isFinite(vector.z) ? vector.z : 0) / length
    };
  }

  function triangulateFan(points) {
    if (!Array.isArray(points) || points.length < 3) {
      return [];
    }
    const triangles = [];
    const base = points[0];
    for (let i = 1; i < points.length - 1; i += 1) {
      const p1 = points[i];
      const p2 = points[i + 1];
      triangles.push([base, p1, p2]);
    }
    return triangles;
  }

  function buildBoundingBoxTriangles(outline) {
    if (!outline || outline.length < 4) {
      return [];
    }
    return triangulateFan(outline.slice(0, 4));
  }

  function polygonArea2D(points) {
    if (!Array.isArray(points) || points.length < 3) {
      return 0;
    }
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const x1 = Number.isFinite(p1.x) ? p1.x : 0;
      const y1 = Number.isFinite(p1.y) ? p1.y : 0;
      const x2 = Number.isFinite(p2.x) ? p2.x : 0;
      const y2 = Number.isFinite(p2.y) ? p2.y : 0;
      area += (x1 * y2) - (x2 * y1);
    }
    return area * 0.5;
  }

  function pointInTriangle2D(point, a, b, c) {
    const px = Number.isFinite(point.x) ? point.x : 0;
    const py = Number.isFinite(point.y) ? point.y : 0;
    const ax = Number.isFinite(a.x) ? a.x : 0;
    const ay = Number.isFinite(a.y) ? a.y : 0;
    const bx = Number.isFinite(b.x) ? b.x : 0;
    const by = Number.isFinite(b.y) ? b.y : 0;
    const cx = Number.isFinite(c.x) ? c.x : 0;
    const cy = Number.isFinite(c.y) ? c.y : 0;

    const v0x = cx - ax;
    const v0y = cy - ay;
    const v1x = bx - ax;
    const v1y = by - ay;
    const v2x = px - ax;
    const v2y = py - ay;

    const dot00 = v0x * v0x + v0y * v0y;
    const dot01 = v0x * v1x + v0y * v1y;
    const dot02 = v0x * v2x + v0y * v2y;
    const dot11 = v1x * v1x + v1y * v1y;
    const dot12 = v1x * v2x + v1y * v2y;

    const denom = (dot00 * dot11) - (dot01 * dot01);
    if (Math.abs(denom) < 1e-12) {
      return false;
    }
    const invDenom = 1 / denom;
    const u = ((dot11 * dot02) - (dot01 * dot12)) * invDenom;
    const v = ((dot00 * dot12) - (dot01 * dot02)) * invDenom;
    return u >= -1e-9 && v >= -1e-9 && (u + v) <= 1 + 1e-9;
  }

  function triangulatePolygon2D(points) {
    if (!Array.isArray(points) || points.length < 3) {
      return [];
    }
    const area = polygonArea2D(points);
    if (Math.abs(area) < 1e-12) {
      return [];
    }
    const orientation = area > 0 ? 1 : -1;
    const vertices = points.map((pt) => ({
      x: Number.isFinite(pt.x) ? pt.x : 0,
      y: Number.isFinite(pt.y) ? pt.y : 0
    }));
    const indices = vertices.map((_, idx) => idx);
    const triangles = [];
    let guard = 0;
    const maxIterations = indices.length * indices.length;

    while (indices.length > 2 && guard < maxIterations) {
      let earFound = false;
      for (let i = 0; i < indices.length; i += 1) {
        const prevIdx = indices[(i - 1 + indices.length) % indices.length];
        const currIdx = indices[i];
        const nextIdx = indices[(i + 1) % indices.length];
        const prev = vertices[prevIdx];
        const curr = vertices[currIdx];
        const next = vertices[nextIdx];

        const cross = ((curr.x - prev.x) * (next.y - prev.y)) - ((curr.y - prev.y) * (next.x - prev.x));
        if (orientation > 0 ? cross <= 1e-9 : cross >= -1e-9) {
          continue;
        }

        let hasPointInside = false;
        for (let j = 0; j < indices.length; j += 1) {
          const testIndex = indices[j];
          if (testIndex === prevIdx || testIndex === currIdx || testIndex === nextIdx) {
            continue;
          }
          if (pointInTriangle2D(vertices[testIndex], prev, curr, next)) {
            hasPointInside = true;
            break;
          }
        }
        if (hasPointInside) {
          continue;
        }

        triangles.push([prev, curr, next]);
        indices.splice(i, 1);
        earFound = true;
        break;
      }
      if (!earFound) {
        break;
      }
      guard += 1;
    }

    return triangles;
  }

  // Earcut triangulation (https://github.com/mapbox/earcut) - MIT License
  function earcut(data, holeIndices, dim) {
    dim = dim || 2;
    const hasHoles = holeIndices && holeIndices.length;
    const outerLen = hasHoles ? holeIndices[0] * dim : data.length;

    let outerNode = linkedList(data, 0, outerLen, dim, true);
    if (!outerNode) {
      return [];
    }

    const triangles = [];
    let minX;
    let minY;
    let maxX;
    let maxY;
    let x;
    let y;
    let size;

    if (hasHoles) {
      outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
    }

    if (data.length > 80 * dim) {
      minX = maxX = data[0];
      minY = maxY = data[1];

      for (let i = dim; i < outerLen; i += dim) {
        x = data[i];
        y = data[i + 1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }

      size = Math.max(maxX - minX, maxY - minY);
    }

    earcutLinked(outerNode, triangles, dim, minX, minY, size);

    return triangles;
  }

  function linkedList(data, start, end, dim, clockwise) {
    let last = null;

    if (clockwise === (signedArea(data, start, end, dim) > 0)) {
      for (let i = start; i < end; i += dim) {
        last = insertNode(i, data[i], data[i + 1], last);
      }
    } else {
      for (let i = end - dim; i >= start; i -= dim) {
        last = insertNode(i, data[i], data[i + 1], last);
      }
    }

    if (last && equals(last, last.next)) {
      removeNode(last);
      last = last.next;
    }

    return last;
  }

  function filterPoints(start, end = null) {
    if (!start) {
      return start;
    }
    if (!end) {
      end = start;
    }
    let node = start;
    let again;
    do {
      again = false;
      if (!node.steiner && (equals(node, node.next) || area(node.prev, node, node.next) === 0)) {
        removeNode(node);
        node = end = node.prev;
        if (node === node.next) {
          return null;
        }
        again = true;
      } else {
        node = node.next;
      }
    } while (again || node !== end);
    return end;
  }

  function earcutLinked(ear, triangles, dim, minX, minY, size, pass = 0) {
    if (!ear) {
      return;
    }

    if (!pass && size) {
      indexCurve(ear, minX, minY, size);
    }

    let stop = ear;
    let prev;
    let next;

    while (ear.prev !== ear.next) {
      prev = ear.prev;
      next = ear.next;

      if (size ? isEarHashed(ear, minX, minY, size) : isEar(ear)) {
        triangles.push(prev.i / dim);
        triangles.push(ear.i / dim);
        triangles.push(next.i / dim);

        removeNode(ear);

        ear = next.next;
        stop = next.next;

        continue;
      }

      ear = next;

      if (ear === stop) {
        if (!pass) {
          earcutLinked(filterPoints(ear), triangles, dim, minX, minY, size, 1);
        } else if (pass === 1) {
          ear = cureLocalIntersections(filterPoints(ear), triangles, dim);
          earcutLinked(ear, triangles, dim, minX, minY, size, 2);
        } else if (pass === 2) {
          splitEarcut(ear, triangles, dim, minX, minY, size);
        }
        break;
      }
    }
  }

  function isEar(ear) {
    const a = ear.prev;
    const b = ear;
    const c = ear.next;

    if (area(a, b, c) >= 0) {
      return false;
    }

    let p = ear.next.next;

    while (p !== ear.prev) {
      if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && area(p.prev, p, p.next) >= 0) {
        return false;
      }
      p = p.next;
    }

    return true;
  }

  function isEarHashed(ear, minX, minY, size) {
    const a = ear.prev;
    const b = ear;
    const c = ear.next;

    if (area(a, b, c) >= 0) {
      return false;
    }

    const minTX = Math.min(a.x, b.x, c.x);
    const minTY = Math.min(a.y, b.y, c.y);
    const maxTX = Math.max(a.x, b.x, c.x);
    const maxTY = Math.max(a.y, b.y, c.y);

    const minZ = zOrder(minTX, minTY, minX, minY, size);
    const maxZ = zOrder(maxTX, maxTY, minX, minY, size);

    let node = ear.prevZ;
    let prevZ;
    let nextZ;

    while (node && node.z >= minZ && node !== ear) {
      if (node.x >= minTX && node.y >= minTY && node.x <= maxTX && node.y <= maxTY &&
        node !== a && node !== c &&
        pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, node.x, node.y) &&
        area(node.prev, node, node.next) >= 0) {
        return false;
      }
      node = node.prevZ;
    }

    node = ear.nextZ;

    while (node && node.z <= maxZ && node !== ear) {
      if (node.x >= minTX && node.y >= minTY && node.x <= maxTX && node.y <= maxTY &&
        node !== a && node !== c &&
        pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, node.x, node.y) &&
        area(node.prev, node, node.next) >= 0) {
        return false;
      }
      node = node.nextZ;
    }

    return true;
  }

  function cureLocalIntersections(start, triangles, dim) {
    let node = start;
    do {
      const a = node.prev;
      const b = node.next.next;

      if (!equals(a, b) &&
        intersects(a, node, node.next, b) &&
        locallyInside(a, b) &&
        locallyInside(b, a)) {
        triangles.push(a.i / dim);
        triangles.push(node.i / dim);
        triangles.push(b.i / dim);

        removeNode(node);
        removeNode(node.next);

        node = start = b;
      }
      node = node.next;
    } while (node !== start);

    return filterPoints(node);
  }

  function splitEarcut(start, triangles, dim, minX, minY, size) {
    let node = start;
    do {
      let a = node.prev;
      let b = node.next.next;
      if (!equals(a, b) && intersects(a, node, node.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
        const splits = splitPolygon(node, b);
        node = splits[0];
        const splitNode = splits[1];
        filterPoints(node, node.next);
        filterPoints(splitNode, splitNode.next);
        earcutLinked(node, triangles, dim, minX, minY, size);
        earcutLinked(splitNode, triangles, dim, minX, minY, size);
        return;
      }
      node = node.next;
    } while (node !== start);
  }

  function eliminateHoles(data, holeIndices, outerNode, dim) {
    const queue = [];
    for (let i = 0, len = holeIndices.length; i < len; i += 1) {
      const start = holeIndices[i] * dim;
      const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
      const list = linkedList(data, start, end, dim, false);
      if (list) {
        queue.push(getLeftmost(list));
      }
    }
    queue.sort((a, b) => a.x - b.x);
    queue.forEach((hole) => {
      eliminateHole(hole, outerNode);
      outerNode = filterPoints(outerNode, outerNode.next);
    });
    return outerNode;
  }

  function eliminateHole(hole, outerNode) {
    outerNode = findHoleBridge(hole, outerNode);
    if (outerNode) {
      const b = splitPolygon(outerNode, hole);
      filterPoints(b[0], b[0].next);
    }
  }

  function findHoleBridge(hole, outerNode) {
    let p = outerNode;
    const hx = hole.x;
    const hy = hole.y;
    let qx = -Infinity;
    let m;

    do {
      if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
        const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
        if (x <= hx && x > qx) {
          qx = x;
          if (x === hx) {
            if (hy === p.y) {
              return p;
            }
            if (hy === p.next.y) {
              return p.next;
            }
          }
          m = p.x < p.next.x ? p : p.next;
        }
      }
      p = p.next;
    } while (p !== outerNode);

    if (!m) {
      return null;
    }

    const stop = m;
    let mx = m.x;
    let my = m.y;
    let tanMin = Infinity;
    let tan;

    p = m;
    do {
      if (hx >= p.x && p.x >= mx && hx !== p.x && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
        tan = Math.abs(hy - p.y) / (hx - p.x);
        if ((locallyInside(p, hole) && locallyInside(hole, p) && (tan < tanMin ||
            (tan === tanMin && p.x > m.x)))) {
          m = p;
          tanMin = tan;
        }
      }
      p = p.next;
    } while (p !== stop);

    return m;
  }

  function indexCurve(start, minX, minY, size) {
    let node = start;
    do {
      if (node.z === null) {
        node.z = zOrder(node.x, node.y, minX, minY, size);
      }
      node.prevZ = node.prev;
      node.nextZ = node.next;
      node = node.next;
    } while (node !== start);
    node.prevZ.nextZ = null;
    node.prevZ = null;
    sortLinked(node);
  }

  function sortLinked(list) {
    let inSize = 1;
    let numMerges;
    let p;
    let q;
    let pSize;
    let qSize;
    let e;

    do {
      p = list;
      list = null;
      let tail = null;
      numMerges = 0;

      while (p) {
        numMerges += 1;
        q = p;
        pSize = 0;
        for (let i = 0; i < inSize; i += 1) {
          pSize += 1;
          q = q.nextZ;
          if (!q) {
            break;
          }
        }
        qSize = inSize;

        while (pSize > 0 || (qSize > 0 && q)) {
          if (pSize === 0) {
            e = q;
            q = q.nextZ;
            qSize -= 1;
          } else if (qSize === 0 || !q) {
            e = p;
            p = p.nextZ;
            pSize -= 1;
          } else if (p.z <= q.z) {
            e = p;
            p = p.nextZ;
            pSize -= 1;
          } else {
            e = q;
            q = q.nextZ;
            qSize -= 1;
          }

          if (tail) {
            tail.nextZ = e;
          } else {
            list = e;
          }

          e.prevZ = tail;
          tail = e;
        }

        p = q;
      }

      tail.nextZ = null;
      inSize *= 2;
    } while (numMerges > 1);

    return list;
  }

  function signedArea(data, start, end, dim) {
    let sum = 0;
    for (let i = start, j = end - dim; i < end; i += dim) {
      sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
      j = i;
    }
    return sum;
  }

  function insertNode(i, x, y, last) {
    const node = {
      i,
      x,
      y,
      prev: null,
      next: null,
      z: null,
      prevZ: null,
      nextZ: null,
      steiner: false
    };

    if (!last) {
      node.prev = node;
      node.next = node;
    } else {
      node.next = last.next;
      node.prev = last;
      last.next.prev = node;
      last.next = node;
    }
    return node;
  }

  function removeNode(node) {
    node.next.prev = node.prev;
    node.prev.next = node.next;

    if (node.prevZ) {
      node.prevZ.nextZ = node.nextZ;
    }
    if (node.nextZ) {
      node.nextZ.prevZ = node.prevZ;
    }
  }

  function equals(p1, p2) {
    return p1.x === p2.x && p1.y === p2.y;
  }

  function area(p, q, r) {
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  }

  function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return ((cx - px) * (ay - py) - (ax - px) * (cy - py)) >= 0 &&
      ((ax - px) * (by - py) - (bx - px) * (ay - py)) >= 0 &&
      ((bx - px) * (cy - py) - (cx - px) * (by - py)) >= 0;
  }

  function getLeftmost(start) {
    let p = start;
    let leftmost = start;
    do {
      if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) {
        leftmost = p;
      }
      p = p.next;
    } while (p !== start);
    return leftmost;
  }

  function locallyInside(a, b) {
    return area(a.prev, a, a.next) < 0
      ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0
      : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
  }

  function intersects(p1, q1, p2, q2) {
    if ((equals(p1, q1) && equals(p2, q2)) || (equals(p1, q2) && equals(p2, q1))) {
      return true;
    }
    return (area(p1, q1, p2) > 0) !== (area(p1, q1, q2) > 0) &&
      (area(p2, q2, p1) > 0) !== (area(p2, q2, q1) > 0);
  }

  function splitPolygon(a, b) {
    const a2 = insertNode(a.i, a.x, a.y, a);
    const b2 = insertNode(b.i, b.x, b.y, b);

    const an = a.next;
    const bp = b.prev;

    a.next = b;
    b.prev = a;

    a2.next = an;
    an.prev = a2;

    b2.next = a2;
    a2.prev = b2;

    bp.next = b2;
    b2.prev = bp;

    return [a2, b2];
  }

  function zOrder(x, y, minX, minY, size) {
    x = 32767 * (x - minX) / size;
    y = 32767 * (y - minY) / size;

    x = (x | (x << 8)) & 0x00ff00ff;
    x = (x | (x << 4)) & 0x0f0f0f0f;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;

    y = (y | (y << 8)) & 0x00ff00ff;
    y = (y | (y << 4)) & 0x0f0f0f0f;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;

    return x | (y << 1);
  }

  class TessellationEngine {
    constructor() {}

    tessellateSolid(geometry) {
      if (!geometry) {
        return null;
      }

      const collectLoops = () => {
        const loops = [];
        if (Array.isArray(geometry.outline2D) && geometry.outline2D.length) {
          const outline = geometry.outline2D;
          if (Array.isArray(outline[0])) {
            outline.forEach((loop) => {
              if (Array.isArray(loop) && loop.length >= 3) {
                loops.push(loop);
              }
            });
          } else if (outline.length >= 3) {
            loops.push(outline);
          }
        }
        if (Array.isArray(geometry.loops) && geometry.loops.length) {
          geometry.loops.forEach((loop) => {
            if (Array.isArray(loop) && loop.length >= 3) {
              loops.push(loop);
            }
          });
        }
        return loops;
      };

      const rawLoops = collectLoops();
      const sanitizeLoop = (loop) => {
        const sanitized = [];
        loop.forEach((pt) => {
          const x = Number.isFinite(pt.x) ? pt.x : 0;
          const y = Number.isFinite(pt.y) ? pt.y : 0;
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
          }
          if (sanitized.length) {
            const last = sanitized[sanitized.length - 1];
            if (Math.hypot(x - last.x, y - last.y) < 1e-9) {
              return;
            }
          }
          sanitized.push({ x, y });
        });
        if (sanitized.length >= 3) {
          const first = sanitized[0];
          const last = sanitized[sanitized.length - 1];
          if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-9) {
            sanitized.pop();
          }
        }
        return sanitized.length >= 3 ? sanitized : null;
      };

      const sanitizedLoops = rawLoops
        .map(sanitizeLoop)
        .filter(Boolean);

      let outlineLoops = sanitizedLoops;

      if ((!outlineLoops || !outlineLoops.length) && geometry.boundingBox) {
        const box = geometry.boundingBox;
        if ([box.minX, box.minY, box.maxX, box.maxY].every((v) => Number.isFinite(v))) {
          outlineLoops = [[
            { x: box.minX, y: box.minY },
            { x: box.maxX, y: box.minY },
            { x: box.maxX, y: box.maxY },
            { x: box.minX, y: box.maxY }
          ]];
        }
      }

      if (!outlineLoops || !outlineLoops.length) {
        return null;
      }

      const loopsProcessed = outlineLoops.map((loop, index) => {
        const area = polygonArea2D(loop);
        const shouldBePositive = index === 0;
        const normalized = area === 0
          ? loop.slice()
          : (shouldBePositive ? (area > 0 ? loop.slice() : loop.slice().reverse())
            : (area < 0 ? loop.slice() : loop.slice().reverse()));
        const closed = this._ensureClosedOutline(normalized);
        return {
          open: normalized,
          closed,
          area: polygonArea2D(normalized)
        };
      }).filter((entry) => entry.open.length >= 3);

      if (!loopsProcessed.length) {
        return null;
      }

      const flattened = [];
      const holeIndices = [];
      const pointRefs = [];
      loopsProcessed.forEach((entry, loopIndex) => {
        if (loopIndex > 0) {
          holeIndices.push(flattened.length / 2);
        }
        entry.open.forEach((pt) => {
          flattened.push(pt.x, pt.y);
          pointRefs.push(pt);
        });
      });

      let triangles = [];
      if (flattened.length >= 6) {
        const indices = earcut(flattened, holeIndices.length ? holeIndices : null, 2);
        if (indices && indices.length >= 3) {
          for (let i = 0; i < indices.length; i += 3) {
            const a = pointRefs[indices[i]];
            const b = pointRefs[indices[i + 1]];
            const c = pointRefs[indices[i + 2]];
            if (a && b && c) {
              triangles.push([a, b, c]);
            }
          }
        }
      }

      if (!triangles.length) {
        triangles = triangulateFan(loopsProcessed[0].closed);
      }

      const outlines = loopsProcessed.map((entry) => entry.closed);

      return {
        triangles,
        outlines
      };
    }

    tessellateMesh(geometry) {
      if (!geometry || !Array.isArray(geometry.vertices) || geometry.vertices.length === 0) {
        return null;
      }

      const vertices = geometry.vertices.map((vertex) => {
        const pos = vertex.position || vertex;
        return {
          x: Number.isFinite(pos.x) ? pos.x : 0,
          y: Number.isFinite(pos.y) ? pos.y : 0,
          z: Number.isFinite(pos.z) ? pos.z : 0
        };
      });

      const triangleList = [];
      const outlines = [];

      if (Array.isArray(geometry.faces) && geometry.faces.length) {
        geometry.faces.forEach((face) => {
          const indices = Array.isArray(face.indices) ? face.indices : [];
          if (indices.length < 3) {
            return;
          }
          const facePoints = indices.map((idx) => {
            const normalizedIndex = Math.abs(idx) - 1;
            return vertices[normalizedIndex] || null;
          }).filter(Boolean);
          if (facePoints.length < 3) {
            return;
          }
          const flattened = facePoints.map((pt) => ({ x: pt.x, y: pt.y }));
          const localTriangles = triangulateFan(flattened);
          triangleList.push(...localTriangles);
          outlines.push(this._ensureClosedOutline(flattened));
        });
      }

      if (!triangleList.length) {
        return null;
      }

      return {
        triangles: triangleList,
        outlines
      };
    }

    _ensureClosedOutline(points) {
      if (!Array.isArray(points) || points.length === 0) {
        return [];
      }
      const outline = points.map((pt) => ({
        x: Number.isFinite(pt.x) ? pt.x : 0,
        y: Number.isFinite(pt.y) ? pt.y : 0
      }));
      const first = outline[0];
      const last = outline[outline.length - 1];
      if (Math.abs(first.x - last.x) > 1e-6 || Math.abs(first.y - last.y) > 1e-6) {
        outline.push({ x: first.x, y: first.y });
      }
      return outline;
    }
  }

  namespace.TessellationEngine = TessellationEngine;

  TessellationEngine.prototype.tessellatePolysolid = function tessellatePolysolid(geometry) {
    if (!geometry || !Array.isArray(geometry.points) || geometry.points.length < 2) {
      return null;
    }
    const EPS = 1e-6;
    const MIN_WIDTH = 1e-3;

    const rawPoints = geometry.points.map((pt) => ({
      x: Number.isFinite(pt.x) ? pt.x : 0,
      y: Number.isFinite(pt.y) ? pt.y : 0
    }));

    const sanitized = [];
    rawPoints.forEach((pt) => {
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
        return;
      }
      if (sanitized.length) {
        const last = sanitized[sanitized.length - 1];
        if (Math.hypot(pt.x - last.x, pt.y - last.y) < EPS) {
          return;
        }
      }
      sanitized.push({ x: pt.x, y: pt.y });
    });

    if (sanitized.length < 2) {
      return null;
    }

    let isClosed = !!geometry.isClosed;
    if (sanitized.length >= 3) {
      const first = sanitized[0];
      const last = sanitized[sanitized.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) < EPS) {
        sanitized.pop();
        isClosed = true;
      }
    } else {
      isClosed = false;
    }

    const vertexCount = sanitized.length;
    if (vertexCount < 2) {
      return null;
    }

    const segments = [];
    const segmentByStart = new Array(vertexCount).fill(null);
    let totalLength = 0;
    for (let i = 0; i < vertexCount; i += 1) {
      let nextIndex = i + 1;
      if (nextIndex >= vertexCount) {
        if (!isClosed) {
          break;
        }
        nextIndex = 0;
      }
      const start = sanitized[i];
      const end = sanitized[nextIndex];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      if (length < EPS) {
        continue;
      }
      const dir = { x: dx / length, y: dy / length };
      const segment = {
        startIndex: i,
        endIndex: nextIndex,
        length,
        direction: dir
      };
      segments.push(segment);
      segmentByStart[i] = segment;
      totalLength += length;
    }

    if (!segments.length) {
      return null;
    }

    const cumulative = new Array(vertexCount).fill(0);
    let running = 0;
    for (let i = 0; i < vertexCount; i += 1) {
      cumulative[i] = running;
      const segment = segmentByStart[i];
      if (segment) {
        running += segment.length;
      }
    }

    const candidateWidths = [
      geometry.startWidth,
      geometry.defaultWidth,
      geometry.width,
      geometry.endWidth
    ];
    let fallbackWidth = 0;
    candidateWidths.forEach((value) => {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && Math.abs(numeric) > EPS && fallbackWidth === 0) {
        fallbackWidth = Math.abs(numeric);
      }
    });
    if (fallbackWidth <= 0) {
      fallbackWidth = 1;
    }
    const startWidthRaw = Number(geometry.startWidth);
    const endWidthRaw = Number(geometry.endWidth);
    const defaultWidthRaw = Number(geometry.defaultWidth);
    const startWidth = Number.isFinite(startWidthRaw) && Math.abs(startWidthRaw) > EPS
      ? Math.abs(startWidthRaw)
      : fallbackWidth;
    const endWidth = Number.isFinite(endWidthRaw) && Math.abs(endWidthRaw) > EPS
      ? Math.abs(endWidthRaw)
      : startWidth;
    const defaultWidth = Number.isFinite(defaultWidthRaw) && Math.abs(defaultWidthRaw) > EPS
      ? Math.abs(defaultWidthRaw)
      : fallbackWidth;

    const widths = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i += 1) {
      let widthValue;
      if (!isClosed) {
        if (totalLength > EPS) {
          const t = cumulative[i] / totalLength;
          widthValue = startWidth + (endWidth - startWidth) * Math.min(Math.max(t, 0), 1);
        } else {
          widthValue = startWidth;
        }
      } else {
        widthValue = defaultWidth;
      }
      widths[i] = Math.max(Math.abs(widthValue) || fallbackWidth, MIN_WIDTH);
    }
    if (!isClosed && vertexCount >= 2) {
      widths[vertexCount - 1] = Math.max(Math.abs(endWidth) || fallbackWidth, MIN_WIDTH);
      widths[0] = Math.max(Math.abs(startWidth) || fallbackWidth, MIN_WIDTH);
    }

    const computeDirection = (from, to) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len < EPS) {
        return null;
      }
      return { x: dx / len, y: dy / len };
    };

    const rotateLeft = (vec) => ({ x: -vec.y, y: vec.x });
    const rotateRight = (vec) => ({ x: vec.y, y: -vec.x });

    const computeOffsetPoint = (point, prevDirIn, nextDirIn, halfWidth, isLeft) => {
      const normalizeDir = (dir) => {
        if (!dir) {
          return null;
        }
        const len = Math.hypot(dir.x, dir.y);
        if (len < EPS) {
          return null;
        }
        return { x: dir.x / len, y: dir.y / len };
      };

      let prevDir = normalizeDir(prevDirIn);
      let nextDir = normalizeDir(nextDirIn);
      if (!prevDir && nextDir) {
        prevDir = { x: -nextDir.x, y: -nextDir.y };
      } else if (!nextDir && prevDir) {
        nextDir = { x: -prevDir.x, y: -prevDir.y };
      }
      if (!prevDir && !nextDir) {
        return { x: point.x, y: point.y };
      }

      const perpendicular = isLeft ? rotateLeft : rotateRight;

      if (!prevDir || !nextDir) {
        const dir = prevDir || nextDir || { x: 1, y: 0 };
        const normal = perpendicular(dir);
        return {
          x: point.x + normal.x * halfWidth,
          y: point.y + normal.y * halfWidth
        };
      }

      const normalPrev = perpendicular(prevDir);
      const normalNext = perpendicular(nextDir);
      const tangent = {
        x: normalPrev.x + normalNext.x,
        y: normalPrev.y + normalNext.y
      };
      const tangentLength = Math.hypot(tangent.x, tangent.y);
      if (tangentLength < EPS) {
        const normal = perpendicular(prevDir);
        return {
          x: point.x + normal.x * halfWidth,
          y: point.y + normal.y * halfWidth
        };
      }

      const miter = {
        x: tangent.x / tangentLength,
        y: tangent.y / tangentLength
      };
      let denom = (miter.x * normalNext.x) + (miter.y * normalNext.y);
      if (Math.abs(denom) < EPS) {
        const normal = perpendicular(prevDir);
        return {
          x: point.x + normal.x * halfWidth,
          y: point.y + normal.y * halfWidth
        };
      }
      let distance = halfWidth / denom;
      if (!Number.isFinite(distance)) {
        distance = halfWidth;
      }
      const maxDistance = halfWidth * 8;
      if (Math.abs(distance) > maxDistance) {
        distance = distance < 0 ? -maxDistance : maxDistance;
      }
      return {
        x: point.x + miter.x * distance,
        y: point.y + miter.y * distance
      };
    };

    const leftPoints = new Array(vertexCount);
    const rightPoints = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i += 1) {
      const point = sanitized[i];
      const widthValue = widths[i];
      const halfWidth = Math.max(widthValue / 2, MIN_WIDTH);
      const prevIndex = i === 0 ? (isClosed ? vertexCount - 1 : -1) : i - 1;
      const nextIndex = i === vertexCount - 1 ? (isClosed ? 0 : -1) : i + 1;
      const prevPoint = prevIndex >= 0 ? sanitized[prevIndex] : null;
      const nextPoint = nextIndex >= 0 ? sanitized[nextIndex] : null;
      const prevDir = prevPoint ? computeDirection(prevPoint, point) : null;
      const nextDir = nextPoint ? computeDirection(point, nextPoint) : null;
      leftPoints[i] = computeOffsetPoint(point, prevDir, nextDir, halfWidth, true);
      rightPoints[i] = computeOffsetPoint(point, prevDir, nextDir, halfWidth, false);
    }

    const outlineSequence = [];
    for (let i = 0; i < vertexCount; i += 1) {
      outlineSequence.push({ x: leftPoints[i].x, y: leftPoints[i].y });
    }
    for (let i = vertexCount - 1; i >= 0; i -= 1) {
      outlineSequence.push({ x: rightPoints[i].x, y: rightPoints[i].y });
    }

    const outlineClosed = this._ensureClosedOutline(outlineSequence);
    const outlineForTriangulation = outlineClosed.length > 1
      ? outlineClosed.slice(0, outlineClosed.length - 1)
      : outlineClosed.slice();

    let triangles = triangulatePolygon2D(outlineForTriangulation);

    if (!triangles.length) {
      triangles = [];
      const segmentCount = isClosed ? vertexCount : vertexCount - 1;
      for (let i = 0; i < segmentCount; i += 1) {
        const nextIndex = (i + 1) % vertexCount;
        const quad = [
          leftPoints[i],
          leftPoints[nextIndex],
          rightPoints[nextIndex],
          rightPoints[i]
        ];
        const area1 = ((quad[1].x - quad[0].x) * (quad[2].y - quad[0].y)) -
          ((quad[1].y - quad[0].y) * (quad[2].x - quad[0].x));
        if (Math.abs(area1) > EPS) {
          triangles.push([quad[0], quad[1], quad[2]]);
        }
        const area2 = ((quad[2].x - quad[0].x) * (quad[3].y - quad[0].y)) -
          ((quad[2].y - quad[0].y) * (quad[3].x - quad[0].x));
        if (Math.abs(area2) > EPS) {
          triangles.push([quad[0], quad[2], quad[3]]);
        }
      }
    }

    return {
      triangles,
      outlines: outlineClosed.length >= 3 ? [outlineClosed] : []
    };
  };

  return {
    TessellationEngine,
    triangulateFan
  };
}));

// ---- End: components/rendering-tessellation.js ----

// ---- Begin: components/rendering-renderer.js ----
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
  const globalScope = root;

  if (!namespace.TessellationEngine && typeof require === 'function') {
    try {
      const tessellationModule = require('./rendering-tessellation.js');
      if (tessellationModule && tessellationModule.TessellationEngine) {
        namespace.TessellationEngine = tessellationModule.TessellationEngine;
      }
    } catch (err) {
      // Optional tessellation module not available; fall back to legacy paths.
    }
  }

  const MAX_BLOCK_DEPTH = 8;
  const WIPEOUT_MASK_COLOR = {
    r: 11 / 255,
    g: 24 / 255,
    b: 40 / 255,
    a: 1,
    css: 'rgba(11,24,40,1)'
  };
  const SELECTION_COLOR = {
    r: 135 / 255,
    g: 209 / 255,
    b: 255 / 255,
    a: 1,
    css: 'rgba(135,209,255,1)'
  };

  function identityMatrix() {
    return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  }

  function translateMatrix(x, y) {
    return { a: 1, b: 0, c: 0, d: 1, tx: x, ty: y };
  }

  function scaleMatrix(sx, sy) {
    return { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
  }

  function rotateMatrix(rad) {
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { a: cos, b: sin, c: -sin, d: cos, tx: 0, ty: 0 };
  }

  function multiplyMatrix(m1, m2) {
    return {
      a: m1.a * m2.a + m1.c * m2.b,
      b: m1.b * m2.a + m1.d * m2.b,
      c: m1.a * m2.c + m1.c * m2.d,
      d: m1.b * m2.c + m1.d * m2.d,
      tx: m1.a * m2.tx + m1.c * m2.ty + m1.tx,
      ty: m1.b * m2.tx + m1.d * m2.ty + m1.ty
    };
  }

  function applyMatrix(matrix, point) {
    return {
      x: matrix.a * point.x + matrix.c * point.y + matrix.tx,
      y: matrix.b * point.x + matrix.d * point.y + matrix.ty
    };
  }

  function applyMatrixToVector(matrix, vector) {
    return {
      x: matrix.a * vector.x + matrix.c * vector.y,
      y: matrix.b * vector.x + matrix.d * vector.y
    };
  }

  function matrixRotation(matrix) {
    return Math.atan2(matrix.b, matrix.a);
  }

  function matrixScale(matrix) {
    const sx = Math.hypot(matrix.a, matrix.b);
    const sy = Math.hypot(matrix.c, matrix.d);
    return { sx, sy };
  }

  function transformPoints(points, matrix) {
    return points.map((pt) => applyMatrix(matrix, pt));
  }

  function triangulateFan(points) {
    if (!points || points.length < 3) return [];
    const triangles = [];
    const base = points[0];
    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      triangles.push(base.x, base.y, p1.x, p1.y, p2.x, p2.y);
    }
    return triangles;
  }

  function cloneColor(color) {
    if (!color) {
      return {
        r: 0.82,
        g: 0.89,
        b: 1,
        a: 1,
        css: 'rgba(210, 227, 255, 1)'
      };
    }
    return {
      r: color.r,
      g: color.g,
      b: color.b,
      a: color.a,
      css: color.css
    };
  }

  function applyAlphaMultiplier(color, multiplier) {
    if (!color) {
      return null;
    }
    const clone = cloneColor(color);
    const baseAlpha = Number.isFinite(clone.a) ? clone.a : 1;
    const alpha = Math.max(0, Math.min(1, baseAlpha * multiplier));
    clone.a = alpha;
    clone.css = `rgba(${Math.round(clone.r * 255)}, ${Math.round(clone.g * 255)}, ${Math.round(clone.b * 255)}, ${alpha.toFixed(3)})`;
    return clone;
  }

  function desaturateColor(color, amount) {
    if (!color) {
      return null;
    }
    const clampAmount = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0));
    if (clampAmount === 0) {
      return cloneColor(color);
    }
    const base = cloneColor(color);
    const intensity = base.r * 0.2126 + base.g * 0.7152 + base.b * 0.0722;
    base.r = Math.max(0, Math.min(1, base.r + (intensity - base.r) * clampAmount));
    base.g = Math.max(0, Math.min(1, base.g + (intensity - base.g) * clampAmount));
    base.b = Math.max(0, Math.min(1, base.b + (intensity - base.b) * clampAmount));
    base.css = `rgba(${Math.round(base.r * 255)}, ${Math.round(base.g * 255)}, ${Math.round(base.b * 255)}, ${base.a.toFixed(3)})`;
    return base;
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

  const VISUAL_STYLE_PRESETS = Object.freeze({
    wireframe: Object.freeze({
      id: 'wireframe',
      label: 'Wireframe',
      showEdges: true,
      showFaces: false,
      showHatches: true,
      showWipeouts: true,
      faceOpacity: 0,
      hatchOpacity: 1,
      edgeOpacity: 1,
      edgeWeightScale: 1,
      preferCanvas: false,
      enableMaterials: false,
      enableTextures: false,
      edgeColorMode: 'inherit'
    }),
    hidden: Object.freeze({
      id: 'hidden',
      label: 'Hidden',
      showEdges: true,
      showFaces: false,
      showHatches: false,
      showWipeouts: true,
      faceOpacity: 0,
      hatchOpacity: 0.35,
      edgeOpacity: 0.85,
      edgeWeightScale: 1,
      preferCanvas: false,
      enableMaterials: false,
      enableTextures: false,
      edgeColorMode: 'monochrome',
      edgeMonochrome: { r: 0.75, g: 0.78, b: 0.82 }
    }),
    shaded: Object.freeze({
      id: 'shaded',
      label: 'Shaded',
      showEdges: true,
      showFaces: true,
      showHatches: true,
      showWipeouts: true,
      faceOpacity: 1,
      hatchOpacity: 0.85,
      edgeOpacity: 0.65,
      edgeWeightScale: 1,
      preferCanvas: true,
      enableMaterials: false,
      enableTextures: false,
      edgeColorMode: 'inherit'
    }),
    realistic: Object.freeze({
      id: 'realistic',
      label: 'Realistic',
      showEdges: true,
      showFaces: true,
      showHatches: true,
      showWipeouts: true,
      faceOpacity: 1,
      hatchOpacity: 0.9,
      edgeOpacity: 0.5,
      edgeWeightScale: 1,
      preferCanvas: true,
      enableMaterials: true,
      enableTextures: true,
      edgeColorMode: 'inherit'
    }),
    conceptual: Object.freeze({
      id: 'conceptual',
      label: 'Conceptual',
      showEdges: true,
      showFaces: true,
      showHatches: true,
      showWipeouts: true,
      faceOpacity: 0.8,
      hatchOpacity: 0.6,
      edgeOpacity: 0.9,
      edgeWeightScale: 1.1,
      preferCanvas: true,
      enableMaterials: false,
      enableTextures: false,
      edgeColorMode: 'desaturate',
      edgeDesaturate: 0.6
    }),
    custom: Object.freeze({
      id: 'custom',
      label: 'Custom',
      showEdges: true,
      showFaces: true,
      showHatches: true,
      showWipeouts: true,
      faceOpacity: 1,
      hatchOpacity: 1,
      edgeOpacity: 0.75,
      edgeWeightScale: 1,
      preferCanvas: true,
      enableMaterials: true,
      enableTextures: true,
      edgeColorMode: 'inherit'
    })
  });

  const VISUAL_STYLE_PRESET_DESCRIPTOR = Object.freeze(
    Object.keys(VISUAL_STYLE_PRESETS)
      .filter((key) => key !== 'custom')
      .map((key) => {
        const preset = VISUAL_STYLE_PRESETS[key];
        const label = preset.label || key.replace(/(^|[-_\\s])([a-z])/gi, (match, p1, p2) => `${p1 ? ' ' : ''}${p2.toUpperCase()}`);
        return Object.freeze({
          id: preset.id || key,
          label,
          category: preset.id || key
        });
      })
  );

  function normalizeVisualStyleCategory(value) {
    if (!value && value !== 0) {
      return 'wireframe';
    }
    const text = String(value).trim().toLowerCase();
    if (!text) {
      return 'wireframe';
    }
    if (text === '2dwireframe' || text === 'wireframe' || text.includes('wireframe')) {
      return 'wireframe';
    }
    if (text === '3dhidden' || text === 'hidden' || text.includes('hidden')) {
      return 'hidden';
    }
    if (text.includes('realistic')) {
      return 'realistic';
    }
    if (text.includes('concept')) {
      return 'conceptual';
    }
    if (text.includes('shade')) {
      return 'shaded';
    }
    if (Object.prototype.hasOwnProperty.call(VISUAL_STYLE_PRESETS, text)) {
      return text;
    }
    return text;
  }

  function vectorLength(vector) {
    if (!vector || typeof vector !== 'object') {
      return 0;
    }
    const x = Number.isFinite(vector.x) ? vector.x : 0;
    const y = Number.isFinite(vector.y) ? vector.y : 0;
    const z = Number.isFinite(vector.z) ? vector.z : 0;
    return Math.hypot(x, y, z);
  }

  function normalizeVector(vector, fallback) {
    const length = vectorLength(vector);
    if (length < 1e-9) {
      if (fallback) {
        return { x: fallback.x || 0, y: fallback.y || 0, z: fallback.z || 0 };
      }
      return { x: 0, y: 0, z: 0 };
    }
    return {
      x: (Number.isFinite(vector.x) ? vector.x : 0) / length,
      y: (Number.isFinite(vector.y) ? vector.y : 0) / length,
      z: (Number.isFinite(vector.z) ? vector.z : 0) / length
    };
  }

  function crossProduct(a, b) {
    if (!a || !b) {
      return { x: 0, y: 0, z: 0 };
    }
    const ax = Number.isFinite(a.x) ? a.x : 0;
    const ay = Number.isFinite(a.y) ? a.y : 0;
    const az = Number.isFinite(a.z) ? a.z : 0;
    const bx = Number.isFinite(b.x) ? b.x : 0;
    const by = Number.isFinite(b.y) ? b.y : 0;
    const bz = Number.isFinite(b.z) ? b.z : 0;
    return {
      x: ay * bz - az * by,
      y: az * bx - ax * bz,
      z: ax * by - ay * bx
    };
  }

  class CoordinateSystemResolver {
    constructor(sceneGraph) {
      this.sceneGraph = sceneGraph || {};
      const tables = this.sceneGraph.tables || {};
      this.tables = tables;
      this.coordinateDefaults = this.sceneGraph.coordinateDefaults || null;
      this.activeVport = null;
      this.ucsLookup = this._buildUcsLookup(tables.ucs || {});
      this.viewLookup = this._buildViewLookup(tables.views || {});
      this.vportLookup = this._buildVportLookup(tables.vports || {});
      this.modelMatrix = this._computeModelMatrix(tables);
      this.paperMatrices = this._computePaperMatrices(tables);
    }

    _buildUcsLookup(raw) {
      const byName = new Map();
      const byHandle = new Map();
      if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach((key) => {
          const entry = raw[key];
          if (!entry || typeof entry !== 'object') {
            return;
          }
          const name = (entry.name || key || '').trim();
          if (name) {
            byName.set(name.toUpperCase(), entry);
          }
          if (entry.handle) {
            const handleKey = String(entry.handle).trim();
            if (handleKey) {
              byHandle.set(handleKey.toUpperCase(), entry);
            }
          }
        });
      }
      return { byName, byHandle };
    }

    _buildViewLookup(raw) {
      const byName = new Map();
      const byHandle = new Map();
      if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach((key) => {
          const entry = raw[key];
          if (!entry || typeof entry !== 'object') {
            return;
          }
          const name = ((entry.name != null ? entry.name : key) || '').toString().trim();
          if (name) {
            byName.set(name.toUpperCase(), entry);
          }
          if (entry.handle) {
            const handleKey = String(entry.handle).trim();
            if (handleKey) {
              byHandle.set(handleKey.toUpperCase(), entry);
            }
          }
          if (entry.handleUpper) {
            byHandle.set(String(entry.handleUpper).trim().toUpperCase(), entry);
          }
        });
      }
      return { byName, byHandle };
    }

    _buildVportLookup(raw) {
      const byName = new Map();
      const byHandle = new Map();
      if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach((key) => {
          const entry = raw[key];
          if (!entry || typeof entry !== 'object') {
            return;
          }
          const name = ((entry.name != null ? entry.name : key) || '').toString().trim();
          if (name) {
            byName.set(name.toUpperCase(), entry);
          }
          if (entry.handle) {
            const handleKey = String(entry.handle).trim();
            if (handleKey) {
              byHandle.set(handleKey.toUpperCase(), entry);
            }
          }
          if (entry.handleUpper) {
            byHandle.set(String(entry.handleUpper).trim().toUpperCase(), entry);
          }
        });
      }
      return { byName, byHandle };
    }

    _computeModelMatrix(tables) {
      const vports = tables && tables.vports ? tables.vports : {};
      const vport = this._selectVport(vports);
      this.activeVport = vport || null;
      const basis = this._basisFromVport(vport, tables);
      return this._matrixFromBasis(basis);
    }

    _computePaperMatrices(tables) {
      const matrices = new Map();
      const defaults = this.coordinateDefaults && this.coordinateDefaults.paperUcs;
      let defaultMatrix = null;
      if (defaults && defaults.origin && defaults.xAxis && defaults.yAxis) {
        const basis = this._basisFromAxes(defaults.origin, defaults.xAxis, defaults.yAxis);
        if (basis) {
          defaultMatrix = this._matrixFromBasis(basis);
        }
      }
      if (defaultMatrix) {
        matrices.set('PAPERSPACE', defaultMatrix);
        matrices.set('*PAPER_SPACE', defaultMatrix);
      }

      const layoutsOrdered = tables && tables.layouts && Array.isArray(tables.layouts.ordered)
        ? tables.layouts.ordered
        : null;
      let fallbackMatrix = defaultMatrix;
      if (layoutsOrdered) {
        layoutsOrdered.forEach((layout) => {
          if (!layout || typeof layout !== 'object') {
            return;
          }
          const basis = this._basisForLayout(layout);
          if (!basis) {
            return;
          }
          const matrix = this._matrixFromBasis(basis);
          if (!fallbackMatrix) {
            fallbackMatrix = matrix;
          }
          const keys = new Set();
          if (layout.name) {
            keys.add(layout.name.trim().toUpperCase());
          }
          if (layout.nameUpper) {
            keys.add(String(layout.nameUpper).trim().toUpperCase());
          }
          if (layout.handleUpper) {
            keys.add(String(layout.handleUpper).trim().toUpperCase());
          }
          if (layout.blockRecordHandleUpper) {
            keys.add(String(layout.blockRecordHandleUpper).trim().toUpperCase());
          }
          keys.forEach((key) => {
            if (!key) {
              return;
            }
            matrices.set(key, matrix);
          });
        });
      }

      if (!matrices.has('PAPERSPACE')) {
        const matrix = fallbackMatrix || this._matrixFromBasis(this._defaultBasis());
        matrices.set('PAPERSPACE', matrix);
      }
      if (!matrices.has('*PAPER_SPACE')) {
        matrices.set('*PAPER_SPACE', matrices.get('PAPERSPACE'));
      }

      return matrices;
    }

    _selectVport(vports) {
      if (!vports || typeof vports !== 'object') {
        return null;
      }
      const entries = Object.keys(vports);
      if (!entries.length) {
        return null;
      }
      const lookup = new Map();
      entries.forEach((key) => {
        if (!key) {
          return;
        }
        lookup.set(key.trim().toUpperCase(), vports[key]);
      });
      const preferred = ['*ACTIVE', '*MODEL_SPACE', 'MODEL', '*PAPER_SPACE', 'STANDARD'];
      for (let i = 0; i < preferred.length; i++) {
        const candidate = preferred[i];
        if (lookup.has(candidate)) {
          return lookup.get(candidate);
        }
      }
      if (entries.length) {
        const candidate = vports[entries[0]];
        if (candidate) {
          return Object.assign({}, candidate);
        }
      }
      const fallback = this._vportFromCoordinateDefaults();
      return fallback ? fallback : null;
    }

    getActiveVport() {
      if (!this.activeVport) {
        return null;
      }
      return Object.assign({}, this.activeVport);
    }

    _basisFromVport(vport, tables) {
      if (!vport || typeof vport !== 'object') {
        return this._defaultBasis();
      }

      if (vport.ucsPerViewport && vport.ucsOrigin && vport.ucsXAxis && vport.ucsYAxis) {
        const basis = this._basisFromAxes(vport.ucsOrigin, vport.ucsXAxis, vport.ucsYAxis);
        if (basis) {
          return basis;
        }
      }

      const ucsCandidate = this._lookupUcs(vport.ucsHandle, vport.ucsName) ||
        this._lookupUcs(vport.baseUcsHandle, null);
      if (ucsCandidate) {
          return this._basisFromAxes(ucsCandidate.origin, ucsCandidate.xAxis, ucsCandidate.yAxis);
      }

      return this._basisFromView(vport);
    }

    _lookupUcs(handle, name) {
      if (handle) {
        const handleKey = String(handle).trim().toUpperCase();
        if (handleKey && this.ucsLookup.byHandle.has(handleKey)) {
          return this.ucsLookup.byHandle.get(handleKey);
        }
      }
      if (name) {
        const nameKey = String(name).trim().toUpperCase();
        if (nameKey && this.ucsLookup.byName.has(nameKey)) {
          return this.ucsLookup.byName.get(nameKey);
        }
      }
      return null;
    }

    _lookupView(handle, name) {
      if (handle) {
        const handleKey = String(handle).trim().toUpperCase();
        if (handleKey && this.viewLookup.byHandle.has(handleKey)) {
          return this.viewLookup.byHandle.get(handleKey);
        }
      }
      if (name) {
        const nameKey = String(name).trim().toUpperCase();
        if (nameKey && this.viewLookup.byName.has(nameKey)) {
          return this.viewLookup.byName.get(nameKey);
        }
      }
      return null;
    }

    _lookupVport(handle, name) {
      if (handle) {
        const handleKey = String(handle).trim().toUpperCase();
        if (handleKey && this.vportLookup.byHandle.has(handleKey)) {
          return this.vportLookup.byHandle.get(handleKey);
        }
      }
      if (name) {
        const nameKey = String(name).trim().toUpperCase();
        if (nameKey && this.vportLookup.byName.has(nameKey)) {
          return this.vportLookup.byName.get(nameKey);
        }
      }
      return null;
    }

    _basisFromAxes(origin, xAxis, yAxis) {
      if (!origin || !xAxis || !yAxis) {
        return null;
      }
      const basisOrigin = {
        x: Number.isFinite(origin.x) ? origin.x : 0,
        y: Number.isFinite(origin.y) ? origin.y : 0,
        z: Number.isFinite(origin.z) ? origin.z : 0
      };
      const normalizedX = normalizeVector(xAxis, { x: 1, y: 0, z: 0 });
      let normalizedY = normalizeVector(yAxis, { x: 0, y: 1, z: 0 });
      let normalizedZ = crossProduct(normalizedX, normalizedY);
      if (vectorLength(normalizedZ) < 1e-6) {
        normalizedZ = { x: 0, y: 0, z: 1 };
      } else {
        normalizedZ = normalizeVector(normalizedZ, { x: 0, y: 0, z: 1 });
      }
      normalizedY = crossProduct(normalizedZ, normalizedX);
      normalizedY = normalizeVector(normalizedY, { x: 0, y: 1, z: 0 });
      return {
        origin: basisOrigin,
        xAxis: normalizedX,
        yAxis: normalizedY,
        zAxis: normalizedZ
      };
    }

    _isFiniteVector3(vector) {
      return !!(vector &&
        Number.isFinite(vector.x) &&
        Number.isFinite(vector.y) &&
        Number.isFinite(vector.z));
    }

    _basisForLayout(layout) {
      if (!layout || typeof layout !== 'object') {
        return null;
      }
      if (this._isFiniteVector3(layout.ucsOrigin) &&
        this._isFiniteVector3(layout.ucsXAxis) &&
        this._isFiniteVector3(layout.ucsYAxis)) {
        const basis = this._basisFromAxes(layout.ucsOrigin, layout.ucsXAxis, layout.ucsYAxis);
        if (basis) {
          return basis;
        }
      }

      const ucsCandidate = this._lookupUcs(layout.ucsHandle, layout.ucsName) ||
        this._lookupUcs(layout.baseUcsHandle, null);
      if (ucsCandidate) {
        const basis = this._basisFromAxes(ucsCandidate.origin, ucsCandidate.xAxis, ucsCandidate.yAxis);
        if (basis) {
          return basis;
        }
      }

      const viewBasis = this._basisFromLayoutView(layout);
      if (viewBasis) {
        return viewBasis;
      }

      const vportCandidate = this._lookupVport(layout.viewportHandle, layout.viewportName);
      if (vportCandidate) {
        return this._basisFromVport(vportCandidate, this.tables);
      }

      return null;
    }

    _basisFromLayoutView(layout) {
      if (!layout || !layout.plotSettings) {
        return null;
      }
      const strings = layout.plotSettings.strings || {};
      const viewName = strings.plotViewName || strings.viewToPlot || null;
      let viewEntry = null;
      if (viewName) {
        viewEntry = this._lookupView(null, viewName);
      }
      if (!viewEntry && layout.viewHandle) {
        viewEntry = this._lookupView(layout.viewHandle, null);
      }
      if (!viewEntry) {
        return null;
      }
      const adapted = {
        viewDirection: viewEntry.direction || viewEntry.viewDirection || null,
        viewTarget: viewEntry.target || viewEntry.viewTarget || null,
        viewTwist: Number.isFinite(viewEntry.twist)
          ? viewEntry.twist
          : (Number.isFinite(viewEntry.viewTwist) ? viewEntry.viewTwist : null)
      };
      return this._basisFromView(adapted);
    }

    _basisFromView(vport) {
      const fallbackDir = this._fallbackViewDirection();
      const viewDir = normalizeVector(vport.viewDirection, fallbackDir);
      const defaultUp = Math.abs(viewDir.z) > 0.999
        ? { x: 0, y: 1, z: 0 }
        : { x: 0, y: 0, z: 1 };
      let xAxis = crossProduct(defaultUp, viewDir);
      if (vectorLength(xAxis) < 1e-6) {
        xAxis = { x: 1, y: 0, z: 0 };
      } else {
        xAxis = normalizeVector(xAxis, { x: 1, y: 0, z: 0 });
      }
      let yAxis = crossProduct(viewDir, xAxis);
      if (vectorLength(yAxis) < 1e-6) {
        yAxis = { x: 0, y: 1, z: 0 };
      } else {
        yAxis = normalizeVector(yAxis, { x: 0, y: 1, z: 0 });
      }
      const headerTwist = this.coordinateDefaults && this.coordinateDefaults.view
        ? Number(this.coordinateDefaults.view.twist) || 0
        : 0;
      const twistDeg = Number.isFinite(vport.viewTwist) ? vport.viewTwist : headerTwist;
      if (Math.abs(twistDeg) > 1e-6) {
        const twistRad = twistDeg * Math.PI / 180;
        const cos = Math.cos(twistRad);
        const sin = Math.sin(twistRad);
        const rotatedX = {
          x: xAxis.x * cos + yAxis.x * sin,
          y: xAxis.y * cos + yAxis.y * sin,
          z: xAxis.z * cos + yAxis.z * sin
        };
        const rotatedY = {
          x: -xAxis.x * sin + yAxis.x * cos,
          y: -xAxis.y * sin + yAxis.y * cos,
          z: -xAxis.z * sin + yAxis.z * cos
        };
        xAxis = rotatedX;
        yAxis = rotatedY;
      }
      const origin = vport.viewTarget && typeof vport.viewTarget === 'object'
        ? {
            x: Number.isFinite(vport.viewTarget.x) ? vport.viewTarget.x : 0,
            y: Number.isFinite(vport.viewTarget.y) ? vport.viewTarget.y : 0,
            z: Number.isFinite(vport.viewTarget.z) ? vport.viewTarget.z : 0
          }
        : this._fallbackModelOrigin();
      return {
        origin,
        xAxis,
        yAxis,
        zAxis: viewDir
      };
    }

    _defaultBasis() {
      return {
        origin: { x: 0, y: 0, z: 0 },
        xAxis: { x: 1, y: 0, z: 0 },
        yAxis: { x: 0, y: 1, z: 0 },
        zAxis: { x: 0, y: 0, z: 1 }
      };
    }

    _matrixFromBasis(basis) {
      const effectiveBasis = basis || this._defaultBasis();
      const origin = effectiveBasis.origin || { x: 0, y: 0, z: 0 };
      const xAxis = normalizeVector(effectiveBasis.xAxis, { x: 1, y: 0, z: 0 });
      let yAxis = normalizeVector(effectiveBasis.yAxis, { x: 0, y: 1, z: 0 });
      const zAxis = normalizeVector(effectiveBasis.zAxis, { x: 0, y: 0, z: 1 });
      if (vectorLength(yAxis) < 1e-6) {
        yAxis = normalizeVector(crossProduct(zAxis, xAxis), { x: 0, y: 1, z: 0 });
      }
      return {
        a: xAxis.x,
        b: xAxis.y,
        c: yAxis.x,
        d: yAxis.y,
        tx: -(xAxis.x * origin.x + yAxis.x * origin.y),
        ty: -(xAxis.y * origin.x + yAxis.y * origin.y)
      };
    }

    getModelMatrix() {
      return Object.assign({ },
        this.modelMatrix || identityMatrix());
    }

    getPaperMatrix(layoutName) {
      if (!layoutName) {
        return identityMatrix();
      }
      const key = String(layoutName).trim().toUpperCase();
      if (this.paperMatrices.has(key)) {
        return Object.assign({}, this.paperMatrices.get(key));
      }
      return identityMatrix();
    }

    _vportFromCoordinateDefaults() {
      if (!this.coordinateDefaults) {
        return null;
      }
      const model = this.coordinateDefaults.modelUcs || {};
      const view = this.coordinateDefaults.view || {};
      const vport = {};
      if (model.origin && model.xAxis && model.yAxis) {
        vport.ucsPerViewport = true;
        vport.ucsOrigin = Object.assign({}, model.origin);
        vport.ucsXAxis = Object.assign({}, model.xAxis);
        vport.ucsYAxis = Object.assign({}, model.yAxis);
      }
      if (view.direction) {
        vport.viewDirection = Object.assign({}, view.direction);
      }
      if (view.target) {
        vport.viewTarget = Object.assign({}, view.target);
      }
      if (Number.isFinite(view.twist)) {
        vport.viewTwist = view.twist;
      }
      return Object.keys(vport).length ? vport : null;
    }

    _fallbackViewDirection() {
      const defaults = this.coordinateDefaults && this.coordinateDefaults.view;
      if (!defaults) {
        return { x: 0, y: 0, z: 1 };
      }
      const dir = normalizeVector(defaults.direction, null);
      if (dir && vectorLength(dir) >= 1e-6) {
        return dir;
      }
      const vpoint = normalizeVector(defaults.vpoint, null);
      if (vpoint && vectorLength(vpoint) >= 1e-6) {
        return vpoint;
      }
      return { x: 0, y: 0, z: 1 };
    }

    _fallbackModelOrigin() {
      const defaults = this.coordinateDefaults && this.coordinateDefaults.modelUcs;
      if (!defaults || !defaults.origin) {
        return { x: 0, y: 0, z: 0 };
      }
      return {
        x: Number.isFinite(defaults.origin.x) ? defaults.origin.x : 0,
        y: Number.isFinite(defaults.origin.y) ? defaults.origin.y : 0,
        z: Number.isFinite(defaults.origin.z) ? defaults.origin.z : 0
      };
    }
  }

  namespace.CoordinateSystemResolver = CoordinateSystemResolver;

  class RenderingSurfaceManager {
    constructor() {
      this.canvas = null;
      this.devicePixelRatio = (globalScope && globalScope.devicePixelRatio) || 1;
      this.width = 0;
      this.height = 0;
      this.activeSurface = null;
      this.lastFrame = null;
      this.blockIsolation = null;
      this.blockHighlight = new Set();
      this.highlightColor = { r: 1, g: 0.85, b: 0.2, a: 1, css: 'rgba(255,217,51,1)' };
      this.selectionHandles = new Set();
      this.entityIsolation = null;
      this.selectionColor = cloneColor(SELECTION_COLOR);
      this.textLayoutEngine = namespace.TextLayoutEngine ? new namespace.TextLayoutEngine() : null;
      this.attributeDisplay = {
        showDefinitions: false,
        showReferences: true,
        showInvisible: false
      };
      this.hatchPatternLibrary = this._buildDefaultHatchPatternLibrary();
      this.surfaceKind = null;
      this.materialDescriptorCache = new Map();
      this._materialCacheSource = null;
      this.layerState = new Map();
      this.viewState = null;
      this.autoViewState = null;
      this.onCanvasReplaced = null;
      this.environment = null;
      this.visualStyleOverride = null;
      this.linetypeSettings = {
        ltScale: 1,
        celTScale: 1,
        psLtScale: null
      };
      this.displaySettings = {
        point: {
          mode: 0,
          size: null
        },
        fillMode: 1,
        mirrorText: 1,
        traceWidth: null
      };
      this.tessellator = namespace.TessellationEngine
        ? new namespace.TessellationEngine()
        : null;
    }

    static getVisualStylePresets() {
      return VISUAL_STYLE_PRESET_DESCRIPTOR.map((entry) => Object.assign({}, entry));
    }

    initialize(canvas) {
      if (!canvas) {
        throw new Error('RenderingSurfaceManager requires a canvas element.');
      }
      this.canvas = canvas;
      this.width = canvas.clientWidth || canvas.width || 1;
      this.height = canvas.clientHeight || canvas.height || 1;
      this.devicePixelRatio = (globalScope && globalScope.devicePixelRatio) || 1;

      const attachOptions = {
        devicePixelRatio: this.devicePixelRatio,
        onCanvasReplaced: (replacement) => this._handleCanvasReplacement(replacement)
      };

      if (namespace.WebGLSurface && typeof namespace.WebGLSurface.isSupported === 'function' && namespace.WebGLSurface.isSupported(canvas)) {
        try {
          const webglSurface = new namespace.WebGLSurface();
          webglSurface.attach(canvas, attachOptions);
          this.activeSurface = webglSurface;
          this.surfaceKind = 'webgl';
        } catch (err) {
          console.warn('[RenderingSurfaceManager] WebGL surface unavailable:', err);
        }
      }

      if (!this.activeSurface) {
        const surface = new namespace.CanvasSurface();
        surface.attach(canvas, attachOptions);
        this.activeSurface = surface;
        this.surfaceKind = 'canvas';
      }
    }

    _resetCanvasElement() {
      if (!this.canvas || typeof this.canvas.getContext !== 'function') {
        return;
      }
      const fallbackWidth = Math.max(1, Math.floor((this.canvas.clientWidth || this.canvas.width || 1) * (this.devicePixelRatio || 1)));
      const fallbackHeight = Math.max(1, Math.floor((this.canvas.clientHeight || this.canvas.height || 1) * (this.devicePixelRatio || 1)));

      const targetWidth = this.canvas.width || fallbackWidth;
      const targetHeight = this.canvas.height || fallbackHeight;

      this.canvas.width = 0;
      this.canvas.height = 0;
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }

    setCanvasReplacementCallback(callback) {
      this.onCanvasReplaced = typeof callback === 'function' ? callback : null;
      if (this.onCanvasReplaced && this.canvas) {
        this.onCanvasReplaced(this.canvas);
      }
    }

    _handleCanvasReplacement(newCanvas) {
      if (!newCanvas) {
        return;
      }
      this.canvas = newCanvas;
      this.width = newCanvas.clientWidth || newCanvas.width || this.width || 1;
      this.height = newCanvas.clientHeight || newCanvas.height || this.height || 1;
      if (typeof this.onCanvasReplaced === 'function') {
        this.onCanvasReplaced(newCanvas);
      }
    }

    resize(width, height, devicePixelRatio) {
      if (!this.canvas) return;
      this.width = width || this.width;
      this.height = height || this.height;
      if (typeof devicePixelRatio === 'number' && !Number.isNaN(devicePixelRatio)) {
        this.devicePixelRatio = devicePixelRatio;
      }
      if (this.activeSurface && typeof this.activeSurface.resize === 'function') {
        this.activeSurface.resize({
          width: this.width,
          height: this.height,
          devicePixelRatio: this.devicePixelRatio
        });
      }
    }

    suspend() {
      if (this.activeSurface && typeof this.activeSurface.suspend === 'function') {
        this.activeSurface.suspend();
      }
    }

    resume() {
      if (this.activeSurface && typeof this.activeSurface.resume === 'function') {
        this.activeSurface.resume();
      }
    }

    renderScene(sceneGraph, options = {}) {
      if (this.textLayoutEngine && sceneGraph) {
        this.textLayoutEngine.configure({
          styleCatalog: sceneGraph.textStyleCatalog || {},
          devicePixelRatio: this.devicePixelRatio
        });
      }
      const buildOptions = options && typeof options === 'object'
        ? Object.assign({}, options)
        : {};
      if (!Object.prototype.hasOwnProperty.call(buildOptions, 'viewState') && this.viewState) {
        buildOptions.viewState = this.viewState;
      }
      const frame = this._buildFrame(sceneGraph, buildOptions);
      this.lastFrame = frame;
      if (frame && frame.viewState) {
        this.viewState = this._cloneViewState(frame.viewState);
      }
      if (frame && frame.autoViewState) {
        this.autoViewState = this._cloneViewState(frame.autoViewState);
      }
      this._ensureSurfaceForFrame(frame);
      if (this.activeSurface && typeof this.activeSurface.render === 'function') {
        if (frame && !frame.isEmpty) {
          this.activeSurface.render(frame);
        } else {
          this.activeSurface.renderMessage('No visible entities', frame);
        }
      }
      return frame;
    }

    _ensureSurfaceForFrame(frame) {
      if (!frame || !frame.surface || !this.canvas) {
        return;
      }
      if (frame.surface === 'canvas' && this.surfaceKind !== 'canvas') {
        if (this.activeSurface && typeof this.activeSurface.destroy === 'function') {
          try {
            this.activeSurface.destroy();
          } catch (err) {
            console.warn('[RenderingSurfaceManager] Failed to destroy previous surface:', err);
          }
        }
        this._resetCanvasElement();
        const canvasSurface = new namespace.CanvasSurface();
        canvasSurface.attach(this.canvas, {
          devicePixelRatio: this.devicePixelRatio,
          onCanvasReplaced: (replacement) => this._handleCanvasReplacement(replacement)
        });
        this.activeSurface = canvasSurface;
        this.surfaceKind = 'canvas';
        if (typeof this.activeSurface.resize === 'function') {
          this.activeSurface.resize({
            width: this.width,
            height: this.height,
            devicePixelRatio: this.devicePixelRatio
          });
        }
      }
    }

    renderMessage(message) {
      this.lastFrame = null;
      if (this.activeSurface && typeof this.activeSurface.renderMessage === 'function') {
        this.activeSurface.renderMessage(message, {
          width: this.width,
          height: this.height,
          devicePixelRatio: this.devicePixelRatio
        });
      }
    }

    clear() {
      this.lastFrame = null;
      this.viewState = null;
      this.autoViewState = null;
      if (this.activeSurface && typeof this.activeSurface.clear === 'function') {
        this.activeSurface.clear();
      }
    }

    setVisualStyle(specifier) {
      if (specifier == null || (typeof specifier === 'string' && !specifier.trim())) {
        this.visualStyleOverride = null;
        return;
      }
      if (typeof specifier === 'string') {
        this.visualStyleOverride = { value: specifier.trim() };
        return;
      }
      if (typeof specifier === 'object') {
        this.visualStyleOverride = Object.assign({}, specifier);
      }
    }

    getVisualStyleOverride() {
      return this.visualStyleOverride ? Object.assign({}, this.visualStyleOverride) : null;
    }

    getVisualStylePresets() {
      return RenderingSurfaceManager.getVisualStylePresets();
    }

    setBlockIsolation(blockNames) {
      if (blockNames && blockNames.size) {
        this.blockIsolation = new Set(blockNames);
      } else {
        this.blockIsolation = null;
      }
    }

    setBlockHighlights(blockNames) {
      if (blockNames && blockNames.size) {
        this.blockHighlight = new Set(blockNames);
      } else {
        this.blockHighlight = new Set();
      }
    }

    setSelectionHandles(handles) {
      if (!handles || !handles.size) {
        this.selectionHandles = new Set();
        return;
      }
      const next = new Set();
      handles.forEach((handle) => {
        const normalized = this._normalizeHandle(handle);
        if (normalized) {
          next.add(normalized);
        }
      });
      this.selectionHandles = next;
    }

    setEntityIsolation(handles) {
      if (!handles || !handles.size) {
        this.entityIsolation = null;
        return;
      }
      const next = new Set();
      handles.forEach((handle) => {
        const normalized = this._normalizeHandle(handle);
        if (normalized) {
          next.add(normalized);
        }
      });
      this.entityIsolation = next.size ? next : null;
    }

    setLayerState(layerState) {
      if (!layerState) {
        this.layerState = new Map();
        return;
      }
      const next = new Map();
      if (layerState instanceof Map) {
        layerState.forEach((value, key) => {
          const normalizedKey = typeof key === 'string' ? key.trim().toUpperCase() : String(key || '');
          if (!normalizedKey) {
            return;
          }
          const normalizedValue = this._normalizeLayerState(value);
          next.set(normalizedKey, normalizedValue);
        });
      } else if (typeof layerState === 'object') {
        Object.keys(layerState).forEach((key) => {
          const normalizedKey = String(key || '').trim().toUpperCase();
          if (!normalizedKey) {
            return;
          }
          const normalizedValue = this._normalizeLayerState(layerState[key]);
          next.set(normalizedKey, normalizedValue);
        });
      }
      this.layerState = next;
    }

    setAttributeDisplay(options = {}) {
      const current = this.attributeDisplay || {
        showDefinitions: false,
        showReferences: true,
        showInvisible: false
      };
      const next = {
        showDefinitions: current.showDefinitions,
        showReferences: current.showReferences,
        showInvisible: current.showInvisible
      };
      if (Object.prototype.hasOwnProperty.call(options, 'showDefinitions')) {
        next.showDefinitions = !!options.showDefinitions;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'showReferences')) {
        next.showReferences = !!options.showReferences;
      }
      if (Object.prototype.hasOwnProperty.call(options, 'showInvisible')) {
        next.showInvisible = !!options.showInvisible;
      }
      this.attributeDisplay = next;
    }

    setViewState(viewState) {
      const normalized = this._normalizeViewState(viewState, this.viewState || null);
      this.viewState = normalized ? this._cloneViewState(normalized) : null;
    }

    getViewState() {
      return this._cloneViewState(this.viewState);
    }

    resetViewState() {
      this.viewState = null;
    }

    _cloneViewState(state) {
      if (!state || typeof state !== 'object') {
        return null;
      }
      const rotationRad = Number.isFinite(state.rotationRad)
        ? state.rotationRad
        : (Number.isFinite(state.rotationDeg) ? state.rotationDeg * Math.PI / 180 : 0);
      const normalizedAngle = this._normalizeAngle(rotationRad || 0);
      const center = state.center && typeof state.center === 'object'
        ? {
            x: Number.isFinite(state.center.x) ? state.center.x : 0,
            y: Number.isFinite(state.center.y) ? state.center.y : 0
          }
        : null;
      const scale = Number.isFinite(state.scale) && state.scale > 0 ? state.scale : null;
      const mode = state.mode === 'auto' ? 'auto' : 'custom';
      return {
        mode,
        center,
        scale,
        rotationRad: normalizedAngle,
        rotationDeg: normalizedAngle * 180 / Math.PI
      };
    }

    _normalizeAngle(angleRad) {
      if (!Number.isFinite(angleRad)) {
        return 0;
      }
      let value = angleRad;
      const twoPi = Math.PI * 2;
      value %= twoPi;
      if (value > Math.PI) {
        value -= twoPi;
      } else if (value <= -Math.PI) {
        value += twoPi;
      }
      return value;
    }

    _normalizeViewState(viewState, fallback = null) {
      if (!viewState || typeof viewState !== 'object') {
        return null;
      }
      const result = {
        mode: viewState.mode === 'auto' ? 'auto' : 'custom'
      };
      const centerCandidate = viewState.center || viewState.target || viewState.focus;
      if (centerCandidate && typeof centerCandidate === 'object') {
        const x = Number.isFinite(centerCandidate.x) ? centerCandidate.x : null;
        const y = Number.isFinite(centerCandidate.y) ? centerCandidate.y : null;
        if (x != null && y != null) {
          result.center = { x, y };
        }
      }
      const scaleCandidate = Number.isFinite(viewState.scale) ? viewState.scale
        : (Number.isFinite(viewState.zoom) ? viewState.zoom : null);
      if (scaleCandidate && scaleCandidate > 0) {
        result.scale = Math.max(1e-9, Math.min(scaleCandidate, 1e12));
      }
      let rotationRad = null;
      if (Number.isFinite(viewState.rotationRad)) {
        rotationRad = viewState.rotationRad;
      } else if (Number.isFinite(viewState.rotationDeg)) {
        rotationRad = viewState.rotationDeg * Math.PI / 180;
      } else if (viewState.orbit && typeof viewState.orbit === 'object') {
        if (Number.isFinite(viewState.orbit.yaw)) {
          rotationRad = viewState.orbit.yaw * Math.PI / 180;
        } else if (Number.isFinite(viewState.orbit.twist)) {
          rotationRad = viewState.orbit.twist * Math.PI / 180;
        }
      } else if (Number.isFinite(viewState.twist)) {
        rotationRad = viewState.twist * Math.PI / 180;
      }
      if (rotationRad != null) {
        result.rotationRad = this._normalizeAngle(rotationRad);
      }
      if (!result.center && fallback && fallback.center) {
        result.center = {
          x: Number.isFinite(fallback.center.x) ? fallback.center.x : 0,
          y: Number.isFinite(fallback.center.y) ? fallback.center.y : 0
        };
      }
      if (!result.scale && fallback && Number.isFinite(fallback.scale)) {
        result.scale = fallback.scale;
      }
      if (result.rotationRad == null && fallback && Number.isFinite(fallback.rotationRad)) {
        result.rotationRad = this._normalizeAngle(fallback.rotationRad);
      }
      if (result.rotationRad == null) {
        result.rotationRad = 0;
      }
      result.rotationDeg = result.rotationRad * 180 / Math.PI;
      return result;
    }

    _resolveViewState(baseView, override) {
      const base = this._cloneViewState(baseView);
      if (!override) {
        return {
          applied: Object.assign({}, base, { mode: 'auto' }),
          auto: Object.assign({}, base, { mode: 'auto' })
        };
      }
      const normalized = this._normalizeViewState(override, base);
      if (!normalized || normalized.mode === 'auto') {
        return {
          applied: Object.assign({}, base, { mode: 'auto' }),
          auto: Object.assign({}, base, { mode: 'auto' })
        };
      }
      const applied = this._cloneViewState(normalized);
      applied.mode = 'custom';
      if (!applied.center && base && base.center) {
        applied.center = { x: base.center.x, y: base.center.y };
      }
      if (!Number.isFinite(applied.scale) && base && Number.isFinite(base.scale)) {
        applied.scale = base.scale;
      }
      if (!Number.isFinite(applied.rotationRad) && base && Number.isFinite(base.rotationRad)) {
        applied.rotationRad = base.rotationRad;
        applied.rotationDeg = base.rotationDeg;
      } else {
        applied.rotationDeg = applied.rotationRad * 180 / Math.PI;
      }
      return {
        applied,
        auto: Object.assign({}, base, { mode: 'auto' })
      };
    }

    _buildFrame(sceneGraph, options = {}) {
      const frame = {
        width: this.width,
        height: this.height,
        devicePixelRatio: this.devicePixelRatio,
        polylines: [],
        fills: [],
        points: [],
        texts: [],
        pickables: [],
        bounds: null,
        scale: 1,
        isEmpty: true
      };

      if (!sceneGraph) {
        frame.worldCenter = { x: 0, y: 0 };
        frame.rotationRad = 0;
        frame.rotationDeg = 0;
        const defaultView = this._cloneViewState({
          mode: 'auto',
          center: { x: 0, y: 0 },
          scale: 1,
          rotationRad: 0
        });
        frame.viewState = defaultView;
        frame.autoViewState = defaultView ? this._cloneViewState(defaultView) : null;
        return frame;
      }

      const buildOptions = options && typeof options === 'object' ? options : {};

      const materials = sceneGraph.materials || {};
      frame.materials = materials;
      if (this._materialCacheSource !== materials) {
        this.materialDescriptorCache.clear();
        this._materialCacheSource = materials;
      }
      const tables = sceneGraph.tables || {};
      const units = sceneGraph.units || {};
      const normalizeScale = (value, fallback) => {
        if (Number.isFinite(value) && value !== 0) {
          return Math.abs(value);
        }
        return fallback;
      };
      const linetypeSettings = {
        ltScale: normalizeScale(units.ltScale, 1),
        celTScale: normalizeScale(units.celTScale, 1),
        psLtScale: Number.isFinite(units.psLtScale) ? units.psLtScale : null
      };
      this.linetypeSettings = linetypeSettings;
      frame.linetypeSettings = Object.assign({}, linetypeSettings);

      const displaySettings = this._normalizeDisplaySettings(sceneGraph.displaySettings || null);
      this.displaySettings = displaySettings;
      frame.displaySettings = {
        point: {
          mode: displaySettings.point.mode,
          size: displaySettings.point.size
        },
        fillMode: displaySettings.fillMode,
        mirrorText: displaySettings.mirrorText,
        traceWidth: displaySettings.traceWidth
      };

      const coordinateResolver = namespace.CoordinateSystemResolver
        ? new namespace.CoordinateSystemResolver(sceneGraph)
        : null;
      const defaultBaseMatrix = identityMatrix();
      const modelBaseMatrix = coordinateResolver
        ? coordinateResolver.getModelMatrix()
        : defaultBaseMatrix;
      const paperMatrixCache = new Map();
      const environmentDescriptor = this._resolveEnvironment(sceneGraph, coordinateResolver, buildOptions);
      frame.environment = environmentDescriptor;
      frame.background = environmentDescriptor ? environmentDescriptor.background || null : null;
      this.environment = environmentDescriptor;
      const visualStyleDescriptor = this._resolveVisualStyle(sceneGraph, buildOptions, environmentDescriptor, coordinateResolver);
      frame.visualStyle = visualStyleDescriptor;
      const styleConfig = visualStyleDescriptor
        ? Object.assign({}, visualStyleDescriptor.config || {})
        : this._getVisualStylePreset('shaded');
      frame.visualStyleConfig = Object.assign({}, styleConfig);
      frame.visualStyleSource = visualStyleDescriptor ? visualStyleDescriptor.source : 'default';
      const resolveBaseMatrixForEntity = (entity) => {
        if (!entity || !coordinateResolver) {
          return defaultBaseMatrix;
        }
        if ((entity.space || '').toLowerCase() === 'paper') {
          const layoutKey = String(entity.layout || 'PAPERSPACE').trim().toUpperCase();
          if (!paperMatrixCache.has(layoutKey)) {
            paperMatrixCache.set(layoutKey, coordinateResolver.getPaperMatrix(entity.layout || null));
          }
          return paperMatrixCache.get(layoutKey);
        }
        return modelBaseMatrix;
      };

      const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      const updateBounds = (x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return;
        }
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      };

      const rawPolylines = [];
      const rawPoints = [];
      const rawFills = [];
      const rawTexts = [];
      const rawLights = [];
      const attributeDisplay = this.attributeDisplay || {
        showDefinitions: false,
        showReferences: true,
        showInvisible: false
      };
      let requiresCanvas = !!(environmentDescriptor && environmentDescriptor.background
        && environmentDescriptor.background.type === 'gradient');
      if (styleConfig && styleConfig.preferCanvas) {
        requiresCanvas = true;
      }

      const blocks = sceneGraph.blocks || {};

      const blockHandleLookup = new Map();
      if (sceneGraph.tables && sceneGraph.tables.blockRecords) {
        Object.keys(sceneGraph.tables.blockRecords).forEach((key) => {
          const record = sceneGraph.tables.blockRecords[key];
          if (record && record.handle) {
            blockHandleLookup.set(record.handle, record.name || key);
            blockHandleLookup.set(String(record.handle).toUpperCase(), record.name || key);
          }
        });
      }

      Object.keys(blocks).forEach((blockName) => {
        const block = blocks[blockName];
        if (block && block.header && block.header.handle) {
          blockHandleLookup.set(block.header.handle, blockName);
          blockHandleLookup.set(String(block.header.handle).toUpperCase(), blockName);
        }
      });

      const getBlockNameByHandle = (handle) => {
        if (!handle) {
          return null;
        }
        const normalized = String(handle).trim();
        if (blocks[normalized]) {
          return normalized;
        }
        const upper = normalized.toUpperCase();
        return blockHandleLookup.get(normalized) || blockHandleLookup.get(upper) || null;
      };

      const multiLeaderStyles = (sceneGraph.tables && sceneGraph.tables.multiLeaderStyles) || {};
      const multiLeaderStylesByHandle = new Map();
      Object.keys(multiLeaderStyles).forEach((key) => {
        const entry = multiLeaderStyles[key];
        if (entry && entry.handle) {
          multiLeaderStylesByHandle.set(entry.handle, entry);
          multiLeaderStylesByHandle.set(String(entry.handle).toUpperCase(), entry);
        }
      });

      const textStylesByHandle = new Map();
      const textStylesTable = (sceneGraph.tables && sceneGraph.tables.textStyles) || {};
      Object.keys(textStylesTable).forEach((key) => {
        const entry = textStylesTable[key];
        if (entry && entry.handle) {
          textStylesByHandle.set(entry.handle, key);
          textStylesByHandle.set(String(entry.handle).toUpperCase(), key);
        }
      });

      let renderBlockContent = () => {};

      const processEntity = (entity, transform, depth, visitedBlocks, blockStack, highlightActive) => {
        if (!entity || depth > MAX_BLOCK_DEPTH) {
          return;
        }
        const type = (entity.type || '').toUpperCase();
        const geometry = entity.geometry || {};
        blockStack = blockStack || [];
        highlightActive = !!highlightActive;
        const handle = this._normalizeHandle(entity.handle || entity.id || null);
        const isolationActive = this.entityIsolation && this.entityIsolation.size > 0;
        const isContainerEntity = type === 'INSERT';
        const handleIsIsolated = handle && isolationActive ? this.entityIsolation.has(handle) : false;
        if (isolationActive && !handleIsIsolated && !isContainerEntity) {
          return;
        }
        const isSelected = this._isHandleSelected(handle);
        const layerState = this._getLayerState(entity.layer || '0');
        if (layerState) {
          if (!layerState.isOn || layerState.isFrozen) {
            return;
          }
        }

        const baseColor = cloneColor(this._resolveColor(entity));
        if (layerState && typeof layerState.transparencyAlpha === 'number') {
          const alpha = Math.max(0, Math.min(1, layerState.transparencyAlpha));
          const currentAlpha = Number.isFinite(baseColor.a) ? baseColor.a : 1;
          const appliedAlpha = Math.min(currentAlpha, alpha);
          baseColor.a = appliedAlpha;
          baseColor.css = `rgba(${Math.round(baseColor.r * 255)}, ${Math.round(baseColor.g * 255)}, ${Math.round(baseColor.b * 255)}, ${appliedAlpha.toFixed(3)})`;
        }
        const color = this._getEffectiveColor(baseColor, highlightActive, isSelected);
        const material =
          (entity && entity.resolved && entity.resolved.material)
            ? entity.resolved.material
            : (entity && entity.material
              ? materials[String(entity.material).trim().toUpperCase()] || null
              : null);
        const materialDescriptor = material ? this._createMaterialDescriptor(material) : null;

        const makeMeta = (overrides = {}) => Object.assign({
          handle,
          type,
          layer: entity.layer || '0',
          space: entity.space || 'model',
          blockStack: Array.isArray(blockStack) ? blockStack.slice() : [],
          isSelected,
          highlightActive,
          visualStyle: entity.visualStyle || (entity.resolved && entity.resolved.visualStyle) || null
        }, overrides);

        switch (type) {
          case 'LINE': {
            if (!geometry.start || !geometry.end) return;
            const transformed = transformPoints([geometry.start, geometry.end], transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: this._resolveLineweight(entity),
              linetype: this._resolveLinetype(entity, tables),
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed: false })
            });
            break;
          }
          case 'LWPOLYLINE': {
            if (!geometry.points || geometry.points.length < 2) return;
            const transformed = transformPoints(geometry.points, transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            const isClosed = !!geometry.isClosed && transformed.length > 2;
            if (isClosed) {
              transformed.push({ x: transformed[0].x, y: transformed[0].y });
            }
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: this._resolveLineweight(entity),
              linetype: this._resolveLinetype(entity, tables),
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed })
            });
            break;
          }
          case 'POLYLINE': {
            if (!geometry.vertices || geometry.vertices.length < 2) return;
            const verts = geometry.vertices
              .filter((v) => !v.isFaceRecord && v.position)
              .map((v) => ({ x: v.position.x, y: v.position.y }));
            if (verts.length < 2) return;
            const transformed = transformPoints(verts, transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            const isClosed = !!geometry.isClosed && transformed.length > 2;
            if (isClosed && (transformed[0].x !== transformed[transformed.length - 1].x ||
              transformed[0].y !== transformed[transformed.length - 1].y)) {
              transformed.push({ x: transformed[0].x, y: transformed[0].y });
            }
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: this._resolveLineweight(entity),
              linetype: this._resolveLinetype(entity, tables),
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed })
            });
            break;
          }
          case 'MLINE': {
            if (!geometry.vertices || geometry.vertices.length < 2) return;
            const verts = geometry.vertices.map((pt) => ({
              x: Number.isFinite(pt.x) ? pt.x : 0,
              y: Number.isFinite(pt.y) ? pt.y : 0
            }));
            const transformed = transformPoints(verts, transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            const isClosed = !!geometry.isClosed && transformed.length > 2;
            if (isClosed && !this._pointsApproxEqual(transformed[0], transformed[transformed.length - 1])) {
              transformed.push({ x: transformed[0].x, y: transformed[0].y });
            }
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: this._resolveLineweight(entity),
              linetype: this._resolveLinetype(entity, tables),
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed, family: 'mline', style: geometry.style || null })
            });
            break;
          }
          case 'ARC': {
            if (!geometry.center || !Number.isFinite(geometry.radius)) return;
            const arcPoints = this._sampleArc(
              geometry.center,
              geometry.radius,
              geometry.startAngle,
              geometry.endAngle,
              false
            );
            const transformed = transformPoints(arcPoints, transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: this._resolveLineweight(entity),
              linetype: this._resolveLinetype(entity, tables),
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed: false })
            });
            break;
          }
          case 'CIRCLE': {
            if (!geometry.center || !Number.isFinite(geometry.radius)) return;
            const arcPoints = this._sampleArc(geometry.center, geometry.radius, 0, 360, true);
            const transformed = transformPoints(arcPoints, transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: this._resolveLineweight(entity),
              linetype: this._resolveLinetype(entity, tables),
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed: true })
            });
            break;
          }
          case 'ELLIPSE': {
            const ellipsePoints = this._sampleEllipse(geometry);
            if (!ellipsePoints) return;
            const transformed = transformPoints(ellipsePoints, transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            const start = geometry.startAngle != null ? geometry.startAngle : 0;
            const end = geometry.endAngle != null ? geometry.endAngle : Math.PI * 2;
            let sweep = end - start;
            if (sweep < 0) {
              sweep += Math.PI * 2;
            }
            const isClosed = Math.abs(Math.abs(sweep) - Math.PI * 2) < 1e-4;
            if (isClosed && (transformed[0].x !== transformed[transformed.length - 1].x ||
              transformed[0].y !== transformed[transformed.length - 1].y)) {
              transformed.push({ x: transformed[0].x, y: transformed[0].y });
            }
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: this._resolveLineweight(entity),
              linetype: this._resolveLinetype(entity, tables),
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed })
            });
            break;
          }
          case 'SPLINE': {
            let splinePoints = geometry.fitPoints && geometry.fitPoints.length >= 2
              ? geometry.fitPoints
              : geometry.controlPoints;
            if (!splinePoints || splinePoints.length < 2) return;
            const transformed = transformPoints(splinePoints, transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            const isClosed = !!geometry.isClosed ||
              (transformed.length >= 2 && this._pointsApproxEqual(transformed[0], transformed[transformed.length - 1]));
            if (isClosed && !this._pointsApproxEqual(transformed[0], transformed[transformed.length - 1])) {
              transformed.push({ x: transformed[0].x, y: transformed[0].y });
            }
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: this._resolveLineweight(entity),
              linetype: this._resolveLinetype(entity, tables),
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed })
            });
            break;
          }
          case 'POLYSOLID': {
            this._addPolysolidGeometry(entity, geometry, transform, updateBounds, rawPolylines, rawFills, color, materialDescriptor, makeMeta);
            break;
          }
          case 'POINT': {
            if (!geometry.position) return;
            const config = this._resolvePointDisplayConfig(geometry, transform);
            const worldPoint = applyMatrix(transform, geometry.position);
            updateBounds(worldPoint.x, worldPoint.y);
            if (!config) {
              rawPoints.push({
                position: [worldPoint.x, worldPoint.y],
                color,
                colorCss: color && color.css ? color.css : undefined,
                size: 4,
                worldBounds: { minX: worldPoint.x, minY: worldPoint.y, maxX: worldPoint.x, maxY: worldPoint.y },
                meta: makeMeta({ geometryKind: 'point', pointMode: 0 })
              });
              break;
            }
            if (config.shapes.circle) {
              rawPoints.push({
                position: [worldPoint.x, worldPoint.y],
                color,
                colorCss: color && color.css ? color.css : undefined,
                size: config.pixelSize,
                worldBounds: { minX: worldPoint.x, minY: worldPoint.y, maxX: worldPoint.x, maxY: worldPoint.y },
                meta: makeMeta({ geometryKind: 'point', pointMode: config.mode })
              });
            }
            this._emitPointShapes({
              center: geometry.position,
              transform,
              updateBounds,
              polylineCollector: rawPolylines,
              color,
              lineweight: this._resolveLineweight(entity),
              makeMeta,
              config,
              family: 'point'
            });
            break;
          }
          case 'MPOINT': {
            if (!geometry.points || !geometry.points.length) return;
            const config = this._resolvePointDisplayConfig(geometry, transform);
            if (!config) {
              geometry.points.forEach((pt) => {
                const mapped = applyMatrix(transform, pt);
                updateBounds(mapped.x, mapped.y);
                rawPoints.push({
                  position: [mapped.x, mapped.y],
                  color,
                  colorCss: color && color.css ? color.css : undefined,
                  size: 4,
                  worldBounds: { minX: mapped.x, minY: mapped.y, maxX: mapped.x, maxY: mapped.y },
                  meta: makeMeta({ geometryKind: 'point', family: 'mpoint', pointMode: 0 })
                });
              });
              break;
            }
            geometry.points.forEach((pt) => {
              const mapped = applyMatrix(transform, pt);
              updateBounds(mapped.x, mapped.y);
              if (config.shapes.circle) {
                rawPoints.push({
                  position: [mapped.x, mapped.y],
                  color,
                  colorCss: color && color.css ? color.css : undefined,
                  size: config.pixelSize,
                  worldBounds: { minX: mapped.x, minY: mapped.y, maxX: mapped.x, maxY: mapped.y },
                  meta: makeMeta({ geometryKind: 'point', family: 'mpoint', pointMode: config.mode })
                });
              }
              this._emitPointShapes({
                center: pt,
                transform,
                updateBounds,
                polylineCollector: rawPolylines,
                color,
                lineweight: this._resolveLineweight(entity),
                makeMeta,
                config,
                family: 'mpoint'
              });
            });
            break;
          }
          case 'SHAPE': {
            if (!geometry.position) return;
            const content = geometry.name || geometry.style || 'SHAPE';
            this._queueSingleLineText({
              kind: 'SHAPE',
              entity,
              geometry: {
                position: geometry.position,
                rotation: geometry.rotation || 0,
                height: geometry.size || 12,
                textStyle: geometry.style || null,
                content
              },
              transform,
              rawTexts,
              updateBounds,
              color,
              meta: makeMeta({ geometryKind: 'text', textKind: 'SHAPE' })
            });
            break;
          }
        case 'LIGHT': {
          if (!geometry.position) return;
          const mapped = applyMatrix(transform, geometry.position);
          updateBounds(mapped.x, mapped.y);
          const worldPosition = {
            x: Number.isFinite(geometry.position.x) ? geometry.position.x : 0,
            y: Number.isFinite(geometry.position.y) ? geometry.position.y : 0,
            z: Number.isFinite(geometry.position.z) ? geometry.position.z : 0
          };
          const intensity = Number.isFinite(geometry.intensity) ? geometry.intensity : null;
          const displayColor = geometry.status === false
            ? (this._createColorFromRgb({ r: 170, g: 180, b: 190 }, 0.8) || color)
            : color;
          const size = Math.max(4.5, intensity != null ? Math.max(3, intensity * 6) : 6);
          rawLights.push({
            handle,
            type: geometry.lightType || 2,
            status: geometry.status !== false,
            plotGlyph: !!geometry.plotGlyph,
            intensity,
            attenuation: geometry.attenuation || null,
            hotspot: Number.isFinite(geometry.hotspot) ? geometry.hotspot : null,
            falloff: Number.isFinite(geometry.falloff) ? geometry.falloff : null,
            castShadows: !!geometry.castShadows,
            shadow: geometry.shadow || null,
            color: displayColor,
            worldPosition,
            target: geometry.target || null,
            projectedPosition: { x: mapped.x, y: mapped.y },
            meta: makeMeta({ geometryKind: 'light' })
          });
          rawPoints.push({
            position: [mapped.x, mapped.y],
            color: displayColor || color,
            size,
            worldBounds: {
              minX: worldPosition.x,
              minY: worldPosition.y,
              maxX: worldPosition.x,
              maxY: worldPosition.y
            },
            meta: makeMeta({ geometryKind: 'light' })
          });
          break;
        }
        case 'HATCH': {
          if (!this._isFillEnabled()) {
            this._emitHatchOutlines({
              entity,
              geometry,
              transform,
              updateBounds,
              polylineCollector: rawPolylines,
              color,
              makeMeta
            });
            break;
          }
          this._processHatchEntity({
            entity,
            geometry,
            transform,
              updateBounds,
              fillCollector: rawFills,
              color,
              material: materialDescriptor,
              meta: makeMeta({ geometryKind: 'fill', fillKind: 'hatch' })
            });
            break;
          }
          case 'TRACE':
          case 'SOLID': {
            if (!this._isFillEnabled()) {
              this._emitSolidOutline({
                entity,
                geometry,
                transform,
                updateBounds,
                polylineCollector: rawPolylines,
                color,
                lineweight: this._resolveLineweight(entity),
                makeMeta
              });
              break;
            }
            this._processSolidEntity({
              geometry,
              transform,
              updateBounds,
              fillCollector: rawFills,
              color,
              material: materialDescriptor,
              meta: makeMeta({ geometryKind: 'fill', fillKind: 'solid' })
            });
            break;
          }
        case 'WIPEOUT': {
            this._processWipeoutEntity({
              geometry,
              transform,
              updateBounds,
              fillCollector: rawFills,
              highlightActive,
              material: materialDescriptor,
              meta: makeMeta({ geometryKind: 'fill', fillKind: 'wipeout' })
            });
            break;
          }
          case 'HELIX': {
            if (!geometry.points || geometry.points.length < 2) return;
            const transformed = transformPoints(geometry.points, transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: this._resolveLineweight(entity),
              linetype: this._resolveLinetype(entity, tables)
            });
            break;
          }
        case 'IMAGE':
        case 'UNDERLAY': {
          this._queueUnderlay(entity, geometry, transform, updateBounds, rawFills, rawTexts, highlightActive);
          break;
        }
        case 'VIEWPORT': {
          this._queueViewport(entity, geometry, transform, updateBounds, rawPolylines, rawFills, rawTexts, color);
          break;
        }
        case 'LEADER': {
          this._addLeaderGeometry({
            kind: 'leader',
            entity,
            geometry,
            transform,
            updateBounds,
            polylineCollector: rawPolylines,
            textCollector: rawTexts,
            color,
            lineweight: entity.lineweight,
            styleEntry: null,
            multiLeaderStylesByHandle,
            multiLeaderStyles,
            textStylesByHandle,
            renderBlockContent,
            getBlockNameByHandle,
            depth,
            visitedBlocks,
            blockStack,
            highlightActive
          });
          break;
        }
        case 'MLEADER': {
          this._addLeaderGeometry({
            kind: 'mleader',
            entity,
            geometry,
            transform,
            updateBounds,
            polylineCollector: rawPolylines,
            textCollector: rawTexts,
            color,
            lineweight: entity.lineweight,
            multiLeaderStylesByHandle,
            multiLeaderStyles,
            textStylesByHandle,
            renderBlockContent,
            getBlockNameByHandle,
            depth,
            visitedBlocks,
            blockStack,
            highlightActive
          });
          break;
        }
        case 'TABLE': {
          this._addTableGeometry({
            entity,
            geometry,
            transform,
            updateBounds,
            polylineCollector: rawPolylines,
            fillCollector: rawFills,
            textCollector: rawTexts,
            baseColor: color,
            lineweight: entity.lineweight,
            renderBlockContent,
            getBlockNameByHandle,
            textStylesByHandle,
            depth,
            visitedBlocks,
            blockStack,
            highlightActive
          });
          break;
        }
        case 'ARCALIGNEDTEXT': {
            if (!geometry || !geometry.center) {
              break;
            }
            const radius = Number.isFinite(geometry.radius) ? geometry.radius : 0;
            const startRad = Number.isFinite(geometry.startAngle) ? geometry.startAngle * Math.PI / 180 : 0;
            const endRad = Number.isFinite(geometry.endAngle) ? geometry.endAngle * Math.PI / 180 : startRad;
            const midAngle = startRad + (endRad - startRad) / 2;
            const anchorX = geometry.center.x + radius * Math.cos(midAngle);
            const anchorY = geometry.center.y + radius * Math.sin(midAngle);
            const tangentAngle = midAngle + (geometry.reverse ? Math.PI / 2 : -Math.PI / 2);
            const textGeometry = {
              position: { x: anchorX, y: anchorY },
              rotation: tangentAngle * 180 / Math.PI,
              height: geometry.textHeight || geometry.height || Math.max(Math.abs(radius) * 0.05, 8),
              textStyle: geometry.textStyle || null,
              widthFactor: geometry.widthFactor ?? 1,
              content: geometry.text || ''
            };
            this._queueSingleLineText({
              kind: 'ARCALIGNEDTEXT',
              entity,
              geometry: textGeometry,
              transform,
              rawTexts,
              updateBounds,
              color,
              meta: makeMeta({ geometryKind: 'text', textKind: 'ARCALIGNEDTEXT' })
            });
            break;
          }
        case 'TEXT': {
            this._queueSingleLineText({
              kind: 'TEXT',
              entity,
              geometry,
              transform,
              rawTexts,
              updateBounds,
              color,
              meta: makeMeta({ geometryKind: 'text', textKind: 'TEXT' })
            });
            break;
          }
        case 'ATTDEF': {
            if (!attributeDisplay.showDefinitions) {
              break;
            }
            if (!geometry || !geometry.position) {
              break;
            }
            if (geometry.isInvisible && !attributeDisplay.showInvisible) {
              break;
            }
            const blockContext = Array.isArray(blockStack) && blockStack.length
              ? blockStack[blockStack.length - 1]
              : entity.blockName || null;
            let content = geometry.content || geometry.defaultValue || '';
            if (!content) {
              content = geometry.tag ? `<${geometry.tag}>` : '';
            }
            const interaction = {
              type: 'attribute',
              attributeKind: 'definition',
              tag: geometry.tag || '',
              prompt: geometry.prompt || '',
              defaultValue: geometry.defaultValue || '',
              value: geometry.defaultValue || '',
              handle: entity.handle || entity.id || null,
              ownerHandle: entity.owner || null,
              blockName: blockContext,
              blockStack: Array.isArray(blockStack) ? blockStack.slice() : [],
              visibility: geometry.visibility || 'visible',
              isInvisible: !!geometry.isInvisible,
              isConstant: !!geometry.isConstant,
              requiresVerification: !!geometry.requiresVerification,
              isPreset: !!geometry.isPreset,
              isMultipleLine: !!geometry.isMultipleLine,
              lockPosition: !!geometry.lockPosition,
              flags: geometry.flags ?? 0,
              space: entity.space || 'model'
            };
            this._queueSingleLineText({
              kind: 'ATTDEF',
              entity,
              geometry,
              transform,
              rawTexts,
              updateBounds,
              color,
              contentOverride: content,
              interaction,
              meta: makeMeta({
                geometryKind: 'text',
                textKind: 'ATTDEF',
                attributeKind: 'definition'
              })
            });
            break;
          }
        case 'ATTRIB': {
            if (!attributeDisplay.showReferences) {
              break;
            }
            if (!geometry || !geometry.position) {
              break;
            }
            if (geometry.isInvisible && !attributeDisplay.showInvisible) {
              break;
            }
            let content = geometry.content;
            if (!content || content.length === 0) {
              if (geometry.isInvisible || attributeDisplay.showInvisible) {
                content = geometry.tag ? `<${geometry.tag}>` : '';
              } else {
                content = '';
              }
            }
            const interaction = {
              type: 'attribute',
              attributeKind: 'reference',
              tag: geometry.tag || '',
              value: geometry.value != null ? geometry.value : '',
              defaultValue: geometry.defaultValue || '',
              handle: entity.handle || entity.id || null,
              ownerHandle: entity.owner || null,
              blockName: entity.blockName || null,
              blockStack: Array.isArray(blockStack) ? blockStack.slice() : [],
              visibility: geometry.visibility || 'visible',
              isInvisible: !!geometry.isInvisible,
              isConstant: !!geometry.isConstant,
              requiresVerification: !!geometry.requiresVerification,
              isPreset: !!geometry.isPreset,
              isMultipleLine: !!geometry.isMultipleLine,
              lockPosition: !!geometry.lockPosition,
              flags: geometry.flags ?? 0,
              space: entity.space || 'model',
              layer: entity.layer || null,
              insertHandle: entity.owner || null
            };
            this._queueSingleLineText({
              kind: 'ATTRIB',
              entity,
              geometry,
              transform,
              rawTexts,
              updateBounds,
              color,
              contentOverride: content,
              interaction,
              meta: makeMeta({
                geometryKind: 'text',
                textKind: 'ATTRIB',
                attributeKind: 'reference'
              })
            });
            break;
          }
        case 'MTEXT': {
            if (!geometry.position) return;
            const worldPosition = applyMatrix(transform, geometry.position);
            updateBounds(worldPosition.x, worldPosition.y);
            const localRotation = geometry.rotation ? geometry.rotation * Math.PI / 180 : 0;
            const rotation = matrixRotation(transform) + localRotation;
            let appliedRotation = rotation;
            if (this.displaySettings && this.displaySettings.mirrorText === 0) {
              const det = (transform.a * transform.d) - (transform.b * transform.c);
              if (det < 0) {
                appliedRotation += Math.PI;
              }
            }
            const scales = matrixScale(transform);
            const avgScale = ((Math.abs(scales.sx) + Math.abs(scales.sy)) / 2) || 1;
            const baseHeight = geometry.height || 12;
            const worldHeight = baseHeight * avgScale;
            const referenceWidthWorld = geometry.referenceWidth ? geometry.referenceWidth * avgScale : null;
            const styleName = entity.textStyle ||
              (entity.resolved && entity.resolved.textStyle ? entity.resolved.textStyle.name : (geometry.textStyle || null));
            rawTexts.push({
              kind: 'MTEXT',
              entity,
              geometry,
              color,
              worldPosition,
              rotation: appliedRotation,
              worldHeight,
              baseHeight,
              scaleMagnitude: avgScale,
              referenceWidthWorld,
              styleName,
              content: geometry.text || '',
              meta: makeMeta({ geometryKind: 'text', textKind: 'MTEXT' })
            });
            break;
          }
        case 'TOLERANCE': {
            if (!geometry.position) return;
            const worldPosition = applyMatrix(transform, geometry.position);
            updateBounds(worldPosition.x, worldPosition.y);
            const localRotation = geometry.rotation ? geometry.rotation * Math.PI / 180 : 0;
            const rotation = matrixRotation(transform) + localRotation;
            let appliedRotation = rotation;
            if (this.displaySettings && this.displaySettings.mirrorText === 0) {
              const det = (transform.a * transform.d) - (transform.b * transform.c);
              if (det < 0) {
                appliedRotation += Math.PI;
              }
            }
            const scales = matrixScale(transform);
            const avgScale = ((Math.abs(scales.sx) + Math.abs(scales.sy)) / 2) || 1;
            const baseHeight = geometry.height || 6;
            const worldHeight = baseHeight * avgScale;
            const styleName = entity.textStyle ||
              (entity.resolved && entity.resolved.textStyle ? entity.resolved.textStyle.name : (geometry.textStyle || null));
            rawTexts.push({
              kind: 'TOLERANCE',
              entity,
              geometry,
              color,
              worldPosition,
              rotation: appliedRotation,
              worldHeight,
              baseHeight,
              scaleMagnitude: avgScale,
              styleName,
              content: geometry.text || '',
              meta: makeMeta({ geometryKind: 'text', textKind: 'TOLERANCE' })
            });
            break;
          }
        case 'GEOPOSITIONMARKER': {
            const position = geometry.position || { x: 0, y: 0 };
            const mapped = applyMatrix(transform, position);
            updateBounds(mapped.x, mapped.y);
            const unitScale = geometry.unitScale != null ? Math.abs(geometry.unitScale) : 1;
            const size = Math.max(8, unitScale * 6);
            rawPoints.push({
              position: [mapped.x, mapped.y],
              color,
              size,
              worldBounds: { minX: mapped.x, minY: mapped.y, maxX: mapped.x, maxY: mapped.y },
              meta: makeMeta({ geometryKind: 'geolocation' })
            });
            if (geometry.text) {
              this._queueSingleLineText({
                kind: 'GEOPOSITIONMARKER',
                entity,
                geometry: {
                  position,
                  rotation: 0,
                  height: geometry.textHeight || 12,
                  textStyle: geometry.textStyle || null,
                  content: geometry.text
                },
                transform,
                rawTexts,
                updateBounds,
                color,
                meta: makeMeta({ geometryKind: 'text', textKind: 'GEOPOSITION' })
              });
            }
            break;
          }
        case 'POINTCLOUD':
        case 'POINTCLOUDATTACH': {
            const basePosition = geometry.position || { x: 0, y: 0 };
            const mapped = applyMatrix(transform, basePosition);
            updateBounds(mapped.x, mapped.y);
            const scale = geometry.scale || { x: 1, y: 1, z: 1 };
            const scaleMagnitude = Math.max(Math.abs(scale.x || 1), Math.abs(scale.y || 1), Math.abs(scale.z || 1));
            rawPoints.push({
              position: [mapped.x, mapped.y],
              color,
              size: Math.max(6, scaleMagnitude * 4),
              worldBounds: { minX: mapped.x, minY: mapped.y, maxX: mapped.x, maxY: mapped.y },
              meta: makeMeta({
                geometryKind: 'pointcloud',
                definitionHandle: geometry.definitionHandle || null,
                intensityEnabled: geometry.showIntensity || false,
                intensityLimits: geometry.intensityLimits || null,
                colorSource: geometry.colorSource || 0
              })
            });
            break;
          }
        case 'INSERT': {
          if (!geometry.blockName) return;
          const blockName = geometry.blockName;
          const block = blocks[blockName];
          if (!block || !Array.isArray(block.entities)) {
            return;
          }
          if (visitedBlocks.includes(blockName)) {
            return;
          }
          const visitedStack = visitedBlocks.concat(blockName);

          if (!this._shouldRenderInsert(blockName, blockStack)) {
            return;
          }

          const nextHighlight = highlightActive || (this.blockHighlight && this.blockHighlight.has(blockName));

          const basePoint = block.header && block.header.basePoint
            ? block.header.basePoint
            : { x: 0, y: 0 };
          const baseTransform = translateMatrix(-basePoint.x, -basePoint.y);

          const sx = geometry.scale && Number.isFinite(geometry.scale.x) ? geometry.scale.x : 1;
          const sy = geometry.scale && Number.isFinite(geometry.scale.y) ? geometry.scale.y : 1;
          const sz = geometry.scale && Number.isFinite(geometry.scale.z) ? geometry.scale.z : 1;
          const localScale = scaleMatrix(sx, sy !== 0 ? sy : sz || 1);
          const rotation = rotateMatrix((geometry.rotation || 0) * Math.PI / 180);
          const translate = translateMatrix(
            geometry.position ? geometry.position.x : 0,
            geometry.position ? geometry.position.y : 0
          );

          const insertTransform = multiplyMatrix(transform, multiplyMatrix(translate, multiplyMatrix(rotation, localScale)));

          const columnCount = geometry.columnCount || 1;
          const rowCount = geometry.rowCount || 1;
          const columnSpacing = geometry.columnSpacing || 0;
          const rowSpacing = geometry.rowSpacing || 0;

          for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < columnCount; col++) {
              const offset = translateMatrix(col * columnSpacing, row * rowSpacing);
              const composedTransform = multiplyMatrix(insertTransform, multiplyMatrix(offset, baseTransform));
              block.entities.forEach((child) => processEntity(child, composedTransform, depth + 1, visitedStack, (blockStack || []).concat(blockName), nextHighlight));
            }
          }
          break;
        }
        case 'DIMENSION': {
          this._addDimensionGeometry(entity, geometry, transform, updateBounds, rawPolylines, rawTexts, color, makeMeta);
          break;
        }
        case 'MESH':
        case 'POLYFACE_MESH': {
          this._addMeshGeometry(entity, geometry, transform, updateBounds, rawPolylines, rawFills, color, materialDescriptor, makeMeta);
          break;
        }
        case 'BODY':
        case '3DSOLID':
        case 'REGION':
        case 'SURFACE': {
          this._addSolidGeometry(entity, geometry, transform, updateBounds, rawPolylines, rawFills, color, materialDescriptor, makeMeta);
          break;
        }
        case 'SECTION': {
          this._addSectionCutGeometry({
            entity,
            geometry,
            transform,
            updateBounds,
            polylineCollector: rawPolylines,
            fillCollector: rawFills,
            color,
            material: materialDescriptor,
            makeMeta,
            tables
          });
          break;
        }
        case 'FRAME': {
          if (!geometry.points || geometry.points.length < 2) {
            break;
          }
          const transformed = transformPoints(geometry.points, transform);
          transformed.forEach((pt) => updateBounds(pt.x, pt.y));
          if (!this._pointsApproxEqual(transformed[0], transformed[transformed.length - 1])) {
            transformed.push({ x: transformed[0].x, y: transformed[0].y });
          }
          rawPolylines.push({
            points: transformed,
            color,
            lineweight: this._resolveLineweight(entity),
            linetype: this._resolveLinetype(entity, tables),
            worldBounds: this._computeBoundsFromPoints(transformed),
            meta: makeMeta({ geometryKind: 'polyline', isClosed: true, family: geometry.frameType ? geometry.frameType.toLowerCase() : 'frame' })
          });
          break;
        }
        case 'PROXYENTITY': {
          if (geometry.position) {
            const projected = applyMatrix(transform, geometry.position);
            updateBounds(projected.x, projected.y);
            const size = Math.max(6, this._resolveLineweight(entity) || 6);
            rawPoints.push({
              position: [projected.x, projected.y],
              color,
              size,
              worldBounds: { minX: projected.x, minY: projected.y, maxX: projected.x, maxY: projected.y },
              meta: makeMeta({ geometryKind: 'proxy' })
            });
          }
          break;
        }
        default: {
          break;
        }
      }
      };

      renderBlockContent = (blockName, matrix, depthValue, visitedStackValue, blockStackValue, highlightValue) => {
        const resolvedName = blockName || null;
        if (!resolvedName) {
          return;
        }
        const blockRef = blocks[resolvedName];
        if (!blockRef || !Array.isArray(blockRef.entities)) {
          return;
        }
        const nextDepth = (depthValue || 0) + 1;
        if (nextDepth > MAX_BLOCK_DEPTH) {
          return;
        }
        const nextVisited = (visitedStackValue || []).concat(resolvedName);
        const nextStack = (blockStackValue || []).concat(resolvedName);
        blockRef.entities.forEach((child) => processEntity(child, matrix, nextDepth, nextVisited, nextStack, highlightValue || false));
      };

      const processModelSpace = sceneGraph.modelSpace || [];
      processModelSpace.forEach((entity) => {
        const baseMatrix = resolveBaseMatrixForEntity(entity);
        processEntity(entity, baseMatrix, 0, [], [], false);
      });

      if (bounds.minX === Infinity) {
        bounds.minX = bounds.minY = 0;
        bounds.maxX = bounds.maxY = 1;
      }

      const viewportWidth = Math.max(1, this.width);
      const viewportHeight = Math.max(1, this.height);
      const padding = Math.min(viewportWidth, viewportHeight) * 0.08 + 20;
      const width = Math.max(1, bounds.maxX - bounds.minX);
      const height = Math.max(1, bounds.maxY - bounds.minY);
      const scaleX = (viewportWidth - padding * 2) / width;
      const scaleY = (viewportHeight - padding * 2) / height;
      let scale = Math.max(Math.min(scaleX, scaleY), 0.0001);
      const baseScale = scale;
      const baseCenterX = (bounds.maxX + bounds.minX) / 2;
      const baseCenterY = (bounds.maxY + bounds.minY) / 2;
      const baseViewState = {
        mode: 'auto',
        center: { x: baseCenterX, y: baseCenterY },
        scale: baseScale,
        rotationRad: 0
      };
      const resolvedView = this._resolveViewState(baseViewState, buildOptions.viewState || null);
      const effectiveView = resolvedView.applied || baseViewState;
      const autoView = resolvedView.auto || baseViewState;
      const centerX = effectiveView.center ? effectiveView.center.x : baseCenterX;
      const centerY = effectiveView.center ? effectiveView.center.y : baseCenterY;
      if (Number.isFinite(effectiveView.scale) && effectiveView.scale > 0) {
        scale = effectiveView.scale;
      }
      const rotationRad = Number.isFinite(effectiveView.rotationRad) ? effectiveView.rotationRad : 0;
      const rotationDeg = rotationRad * 180 / Math.PI;
      const cosTheta = Math.cos(rotationRad);
      const sinTheta = Math.sin(rotationRad);
      const viewportCenterX = viewportWidth / 2;
      const viewportCenterY = viewportHeight / 2;

      const toScreen = (x, y) => {
        const dx = x - centerX;
        const dy = y - centerY;
        const rx = dx * cosTheta - dy * sinTheta;
        const ry = dx * sinTheta + dy * cosTheta;
        const screenX = rx * scale + viewportCenterX;
        const screenY = viewportCenterY - ry * scale;
        return [screenX, screenY];
      };

      rawPolylines.forEach((polyline) => {
        if (styleConfig && styleConfig.showEdges === false) {
          return;
        }
        const coords = [];
        const worldPoints = [];
        let screenMinX = Infinity;
        let screenMinY = Infinity;
        let screenMaxX = -Infinity;
        let screenMaxY = -Infinity;
        polyline.points.forEach((pt) => {
          if (!pt) {
            return;
          }
          const mapped = toScreen(pt.x, pt.y);
          coords.push(mapped[0], mapped[1]);
          worldPoints.push({ x: pt.x, y: pt.y });
          screenMinX = Math.min(screenMinX, mapped[0]);
          screenMinY = Math.min(screenMinY, mapped[1]);
          screenMaxX = Math.max(screenMaxX, mapped[0]);
          screenMaxY = Math.max(screenMaxY, mapped[1]);
        });
        if (coords.length >= 4) {
          const styleInfo = this._computeLinetypeStyle(polyline, scale, (x, y) => toScreen(x, y));
          if (styleInfo && styleInfo.dashPattern && styleInfo.dashPattern.length) {
            requiresCanvas = true;
          }
          if (styleInfo && styleInfo.shapes && styleInfo.shapes.length) {
            requiresCanvas = true;
            frame.linetypeShapes = frame.linetypeShapes || [];
            frame.linetypeShapes.push(...styleInfo.shapes);
          }
          const baseWeightPx = this._lineweightToPx(polyline.lineweight);
          const edgeWeightScale = Number.isFinite(styleConfig && styleConfig.edgeWeightScale)
            ? Math.max(0.05, styleConfig.edgeWeightScale)
            : 1;
          const weightPx = baseWeightPx * edgeWeightScale;
          const styledColor = this._applyVisualStyleToEdgeColor(polyline.color, styleConfig);
          const finalColor = styledColor || polyline.color || cloneColor(null);
          const screenPoints = new Float32Array(coords);
          frame.polylines.push({
            screenPoints,
            color: finalColor,
            colorCss: finalColor.css,
            weight: Math.max(0.75, weightPx),
            lineDash: styleInfo && styleInfo.dashPattern ? styleInfo.dashPattern : null,
            lineDashOffset: styleInfo && typeof styleInfo.dashOffset === 'number'
              ? styleInfo.dashOffset
              : 0,
            meta: polyline.meta || null
          });
          const screenBounds = screenMinX === Infinity
            ? null
            : {
                minX: screenMinX,
                minY: screenMinY,
                maxX: screenMaxX,
                maxY: screenMaxY
              };
          frame.pickables.push({
            handle: polyline.meta && polyline.meta.handle ? polyline.meta.handle : null,
            type: polyline.meta && polyline.meta.type ? polyline.meta.type : 'ENTITY',
            geometryKind: (polyline.meta && polyline.meta.geometryKind) || 'polyline',
            layer: polyline.meta && polyline.meta.layer ? polyline.meta.layer : null,
            space: polyline.meta && polyline.meta.space ? polyline.meta.space : 'model',
            blockStack: polyline.meta && Array.isArray(polyline.meta.blockStack) ? polyline.meta.blockStack : [],
            isClosed: !!(polyline.meta && polyline.meta.isClosed),
            isSelected: !!(polyline.meta && polyline.meta.isSelected),
            highlightActive: !!(polyline.meta && polyline.meta.highlightActive),
            screenPoints,
            worldPoints,
            worldBounds: polyline.worldBounds || this._computeBoundsFromPoints(polyline.points),
            screenBounds,
            weight: Math.max(0.75, weightPx),
            linetype: polyline.linetype || null,
            source: 'polyline'
          });
        }
      });

      rawPoints.forEach((pt) => {
        const mapped = toScreen(pt.position[0], pt.position[1]);
        const screenPosition = new Float32Array(mapped);
        const size = pt.size || 4;
        frame.points.push({
          screenPosition,
          color: pt.color,
          colorCss: pt.color.css,
          size,
          meta: pt.meta || null
        });
        const halfSize = size * 0.5;
        frame.pickables.push({
          handle: pt.meta && pt.meta.handle ? pt.meta.handle : null,
          type: pt.meta && pt.meta.type ? pt.meta.type : 'POINT',
          geometryKind: (pt.meta && pt.meta.geometryKind) || 'point',
          layer: pt.meta && pt.meta.layer ? pt.meta.layer : null,
          space: pt.meta && pt.meta.space ? pt.meta.space : 'model',
          blockStack: pt.meta && Array.isArray(pt.meta.blockStack) ? pt.meta.blockStack : [],
          isSelected: !!(pt.meta && pt.meta.isSelected),
          highlightActive: !!(pt.meta && pt.meta.highlightActive),
          screenPoints: screenPosition,
          worldPoints: [{ x: pt.position[0], y: pt.position[1] }],
          worldBounds: pt.worldBounds || this._computeBoundsFromPoints([{ x: pt.position[0], y: pt.position[1] }]),
          screenBounds: {
            minX: mapped[0] - halfSize,
            minY: mapped[1] - halfSize,
            maxX: mapped[0] + halfSize,
            maxY: mapped[1] + halfSize
          },
          pointSize: size,
          source: 'point'
        });
      });

      const hatchAssociations = [];

      const cloneSectionAssociation = (assoc) => {
        if (!assoc) {
          return null;
        }
        const copy = Object.assign({}, assoc);
        if (Array.isArray(assoc.sourceHandles)) {
          copy.sourceHandles = assoc.sourceHandles.slice();
        }
        if (Array.isArray(assoc.boundary)) {
          copy.boundary = assoc.boundary.map((pt) => ({
            x: Number.isFinite(pt.x) ? pt.x : 0,
            y: Number.isFinite(pt.y) ? pt.y : 0
          }));
        }
        if (assoc.worldBounds) {
          copy.worldBounds = Object.assign({}, assoc.worldBounds);
        }
        return copy;
      };

      rawFills.forEach((rawFill) => {
        const normalized = this._normalizeRawFillEntry(rawFill);
        if (!normalized || !Array.isArray(normalized.contours) || !normalized.contours.length) {
          return;
        }

        const screenContours = normalized.contours.map((contour) => {
          const mappedPoints = contour.points.map((pt) => {
            const mapped = toScreen(pt.x, pt.y);
            return { x: mapped[0], y: mapped[1] };
          });
          if (mappedPoints.length && !this._pointsApproxEqual(mappedPoints[0], mappedPoints[mappedPoints.length - 1])) {
            mappedPoints.push({ x: mappedPoints[0].x, y: mappedPoints[0].y });
          }
          return {
            isHole: !!contour.isHole,
            points: mappedPoints
          };
        }).filter((contour) => contour.points.length >= 3);

        if (!screenContours.length) {
          return;
        }

        const hasHoles = screenContours.some((contour) => contour.isHole);
        let triangles = null;
        if (normalized.type === 'solid' && !hasHoles && screenContours.length === 1) {
          triangles = this._triangulateSimplePolygon(screenContours[0].points);
        }
        const geometryRequiresCanvas = !triangles || triangles.length < 6;
        const fillTypeRequiresCanvas = normalized.type === 'gradient' || normalized.type === 'pattern';

        let allWorldPoints = [];
        normalized.contours.forEach((contour) => {
          if (Array.isArray(contour.points)) {
            allWorldPoints = allWorldPoints.concat(contour.points);
          }
        });
        const worldBounds = normalized.worldBounds || this._computeBoundsFromPoints(allWorldPoints);
        const fillRecord = {
          type: normalized.type || 'solid',
          color: normalized.color || null,
          colorCss: normalized.color && normalized.color.css ? normalized.color.css : null,
          gradient: normalized.gradient || null,
          pattern: normalized.pattern || null,
          screenContours,
          worldContours: normalized.contours,
          sourceHandles: Array.isArray(normalized.sourceHandles) ? normalized.sourceHandles.slice() : [],
          associative: !!normalized.associative,
          sectionAssociation: cloneSectionAssociation(normalized.sectionAssociation),
          material: normalized.material || null,
          hasHoles,
          meta: normalized.meta || null,
          worldBounds
        };
        if (fillRecord.material) {
          fillRecord.materialHandle = fillRecord.material.handle || null;
          fillRecord.materialName = fillRecord.material.name || null;
        }

        if (triangles && triangles.length >= 6) {
          fillRecord.triangles = new Float32Array(triangles);
        }

        if (!this._visualStyleAllowsFill(fillRecord, styleConfig)) {
          return;
        }

        this._applyVisualStyleToFill(fillRecord, styleConfig);

        if (geometryRequiresCanvas) {
          requiresCanvas = true;
        }
        if (fillTypeRequiresCanvas) {
          requiresCanvas = true;
        }

        if (fillRecord.material && this._materialHasTexture(fillRecord.material)) {
          requiresCanvas = true;
          fillRecord.hasMaterialTexture = true;
        } else {
          fillRecord.hasMaterialTexture = false;
        }

        frame.fills.push(fillRecord);

        let screenMinX = Infinity;
        let screenMinY = Infinity;
        let screenMaxX = -Infinity;
        let screenMaxY = -Infinity;
        screenContours.forEach((contour) => {
          contour.points.forEach((pt) => {
            screenMinX = Math.min(screenMinX, pt.x);
            screenMinY = Math.min(screenMinY, pt.y);
            screenMaxX = Math.max(screenMaxX, pt.x);
            screenMaxY = Math.max(screenMaxY, pt.y);
          });
        });
        const screenBounds = screenMinX === Infinity
          ? null
          : {
              minX: screenMinX,
              minY: screenMinY,
              maxX: screenMaxX,
              maxY: screenMaxY
            };
        frame.pickables.push({
          handle: fillRecord.meta && fillRecord.meta.handle ? fillRecord.meta.handle : null,
          type: fillRecord.meta && fillRecord.meta.type ? fillRecord.meta.type : 'HATCH',
          geometryKind: (fillRecord.meta && fillRecord.meta.geometryKind) || 'fill',
          layer: fillRecord.meta && fillRecord.meta.layer ? fillRecord.meta.layer : null,
          space: fillRecord.meta && fillRecord.meta.space ? fillRecord.meta.space : 'model',
          blockStack: fillRecord.meta && Array.isArray(fillRecord.meta.blockStack) ? fillRecord.meta.blockStack : [],
          isSelected: !!(fillRecord.meta && fillRecord.meta.isSelected),
          highlightActive: !!(fillRecord.meta && fillRecord.meta.highlightActive),
          screenContours,
          screenBounds,
          worldContours: normalized.contours,
          worldBounds,
          fillType: fillRecord.type,
          hasHoles,
          sourceHandles: fillRecord.sourceHandles.slice(),
          source: 'fill',
          sectionAssociation: cloneSectionAssociation(fillRecord.sectionAssociation)
        });

        if (fillRecord.associative && fillRecord.sourceHandles.length) {
          hatchAssociations.push({
            hatch: fillRecord,
            handles: fillRecord.sourceHandles.slice(),
            sectionAssociation: cloneSectionAssociation(fillRecord.sectionAssociation)
          });
        }
      });

      frame.requiresCanvas = requiresCanvas;
      if (requiresCanvas) {
        frame.surface = 'canvas';
      }
      if (!frame.devicePixelRatio) {
        frame.devicePixelRatio = this.devicePixelRatio;
      }
      if (hatchAssociations.length) {
        frame.hatchAssociations = hatchAssociations;
      }

      rawTexts.forEach((text) => {
        const registerTextPickable = (layoutObj) => {
          if (!layoutObj) {
            return;
          }
          const meta = layoutObj.meta || text.meta || null;
          const entityInfo = text.entity || {};
          const handle = meta && meta.handle
            ? meta.handle
            : this._normalizeHandle(entityInfo.handle || entityInfo.id || null);
          const type = meta && meta.type
            ? meta.type
            : ((entityInfo.type || layoutObj.kind || 'TEXT').toUpperCase());
          const layer = meta && meta.layer != null
            ? meta.layer
            : (entityInfo.layer || null);
          const space = meta && meta.space
            ? meta.space
            : (entityInfo.space || 'model');
          const blockStack = meta && Array.isArray(meta.blockStack)
            ? meta.blockStack
            : [];
          const screenBounds = this._computeTextScreenBounds(layoutObj);
          const rotation = layoutObj.rotationRad != null
            ? layoutObj.rotationRad
            : ((layoutObj.rotationDeg || 0) * Math.PI / 180);
          frame.pickables.push({
            handle,
            type,
            geometryKind: 'text',
            layer,
            space,
            blockStack,
            isSelected: !!(meta && meta.isSelected),
            highlightActive: !!(meta && meta.highlightActive),
            screenBounds,
            screenPosition: Array.isArray(layoutObj.screenPosition)
              ? layoutObj.screenPosition.slice()
              : null,
            worldPosition: text.worldPosition
              ? { x: text.worldPosition.x, y: text.worldPosition.y }
              : null,
            textKind: meta && meta.textKind ? meta.textKind : (layoutObj.kind || 'TEXT'),
            textLines: Array.isArray(layoutObj.lines) ? layoutObj.lines.slice() : [],
            widthFactor: layoutObj.widthFactor || 1,
            rotationRad: rotation,
            fontSize: layoutObj.fontSize || null,
            backgroundCss: layoutObj.backgroundCss || null,
            meta: meta || null,
            source: 'text'
          });
        };
        const mapped = toScreen(text.worldPosition.x, text.worldPosition.y);
        text.screenPosition = mapped;
        if (this.textLayoutEngine) {
          const layout = this.textLayoutEngine.layout(text, { frameScale: scale });
          if (layout) {
            layout.interaction = text.interaction || null;
            layout.rawText = text;
            layout.meta = text.meta || null;
            if (text.attributeTag) {
              layout.attributeTag = text.attributeTag;
            }
            if (text.attributeVisibility) {
              layout.attributeVisibility = text.attributeVisibility;
            }
            if (!layout.backgroundCss) {
              const backgroundCss = this._resolveTextBackgroundCss(text);
              if (backgroundCss) {
                layout.backgroundCss = backgroundCss;
              }
            }
            frame.texts.push(layout);
            this._updateBoundsForText(layout, text, updateBounds, scale);
            registerTextPickable(layout);
            return;
          }
        }
        const fallbackSize = Math.max(6, (text.worldHeight || 12) * scale);
        const fallbackBackgroundCss = this._resolveTextBackgroundCss(text);
        const fallbackLayout = {
          kind: text.kind || 'TEXT',
          screenPosition: mapped,
          rotationRad: text.rotation || 0,
          rotationDeg: (text.rotation || 0) * 180 / Math.PI,
          fontSize: fallbackSize,
          lineHeight: fallbackSize * 1.2,
          fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
          fontStyle: 'normal',
          fontWeight: '400',
          textAlign: 'left',
          lines: [text.content || ''],
          anchor: { x: -(text.content ? text.content.length : 1) * (fallbackSize * 0.3), y: -fallbackSize },
          baseWidthPx: (text.content ? text.content.length : 1) * fallbackSize * 0.6,
          widthPx: (text.content ? text.content.length : 1) * fallbackSize * 0.6,
          heightPx: fallbackSize * 1.2,
          colorCss: text.color && text.color.css ? text.color.css : '#ffffff',
          widthFactor: 1,
          backgroundCss: fallbackBackgroundCss
        };
        fallbackLayout.meta = text.meta || null;
        frame.texts.push(fallbackLayout);
        fallbackLayout.interaction = text.interaction || null;
        fallbackLayout.rawText = text;
        if (text.attributeTag) {
          fallbackLayout.attributeTag = text.attributeTag;
        }
        if (text.attributeVisibility) {
          fallbackLayout.attributeVisibility = text.attributeVisibility;
        }
        this._updateBoundsForText(fallbackLayout, text, updateBounds, scale);
        registerTextPickable(fallbackLayout);
      });

      const resolvedLights = rawLights.map((light) => {
        const projected = light.projectedPosition || { x: light.worldPosition ? light.worldPosition.x : 0, y: light.worldPosition ? light.worldPosition.y : 0 };
        const screenPosition = toScreen(projected.x, projected.y);
        return Object.assign({}, light, {
          projectedPosition: projected,
          screenPosition
        });
      });
      frame.lights = resolvedLights;
      if (frame.environment) {
        frame.environment.lights = resolvedLights;
      }

      frame.bounds = bounds;
      frame.scale = scale;
      frame.worldCenter = { x: centerX, y: centerY };
      frame.rotationRad = rotationRad;
      frame.rotationDeg = rotationDeg;
      const currentViewState = this._cloneViewState({
        mode: effectiveView.mode || (buildOptions.viewState && buildOptions.viewState.mode) || 'custom',
        center: { x: centerX, y: centerY },
        scale,
        rotationRad
      });
      if (currentViewState) {
        currentViewState.mode = effectiveView.mode || (buildOptions.viewState && buildOptions.viewState.mode) || 'custom';
        currentViewState.center = { x: centerX, y: centerY };
        currentViewState.scale = scale;
        currentViewState.rotationRad = rotationRad;
        currentViewState.rotationDeg = rotationDeg;
      }
      const autoViewState = this._cloneViewState({
        mode: 'auto',
        center: autoView && autoView.center
          ? { x: autoView.center.x, y: autoView.center.y }
          : { x: baseCenterX, y: baseCenterY },
        scale: autoView && Number.isFinite(autoView.scale) && autoView.scale > 0 ? autoView.scale : baseScale,
        rotationRad: autoView && Number.isFinite(autoView.rotationRad) ? autoView.rotationRad : 0
      });
      if (autoViewState) {
        autoViewState.mode = 'auto';
        if (!autoViewState.center) {
          autoViewState.center = { x: baseCenterX, y: baseCenterY };
        }
        if (!Number.isFinite(autoViewState.scale) || autoViewState.scale <= 0) {
          autoViewState.scale = baseScale;
        }
        autoViewState.rotationRad = Number.isFinite(autoViewState.rotationRad) ? autoViewState.rotationRad : 0;
        autoViewState.rotationDeg = autoViewState.rotationRad * 180 / Math.PI;
      }
      frame.viewState = currentViewState;
      frame.autoViewState = autoViewState;
      frame.worldBounds = {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY
      };
      frame.devicePixelRatio = this.devicePixelRatio;
      frame.isEmpty = !frame.polylines.length && !frame.points.length && !frame.fills.length && !frame.texts.length && !(frame.lights && frame.lights.length);
      return frame;
    }

    _resolveColor(entity) {
      const defaultColor = { r: 0.82, g: 0.89, b: 1.0, a: 1.0, css: 'rgba(210, 227, 255, 1)' };
      if (!entity) return defaultColor;

      const toColorObject = (rgb, alpha = 1) => {
        const clamped = {
          r: Math.min(Math.max(rgb.r / 255, 0), 1),
          g: Math.min(Math.max(rgb.g / 255, 0), 1),
          b: Math.min(Math.max(rgb.b / 255, 0), 1),
          a: Math.min(Math.max(alpha, 0), 1)
        };
        clamped.css = `rgba(${Math.round(clamped.r * 255)}, ${Math.round(clamped.g * 255)}, ${Math.round(clamped.b * 255)}, ${clamped.a.toFixed(3)})`;
        return clamped;
      };

      const resolvedMaterial = entity.resolved && entity.resolved.material ? entity.resolved.material : null;
      if (resolvedMaterial) {
        const descriptor = this._createMaterialDescriptor(resolvedMaterial);
        if (descriptor) {
          let baseColor = descriptor.diffuse && descriptor.diffuse.color
            ? cloneColor(descriptor.diffuse.color)
            : (descriptor.ambient && descriptor.ambient.color ? cloneColor(descriptor.ambient.color) : null);
          if (baseColor) {
            const factor = descriptor.diffuse && Number.isFinite(descriptor.diffuse.factor)
              ? descriptor.diffuse.factor
              : 1;
            if (Number.isFinite(factor) && factor !== 1) {
              baseColor.r = Math.min(Math.max(baseColor.r * factor, 0), 1);
              baseColor.g = Math.min(Math.max(baseColor.g * factor, 0), 1);
              baseColor.b = Math.min(Math.max(baseColor.b * factor, 0), 1);
            }
            const opacity = descriptor.opacity && Number.isFinite(descriptor.opacity.factor)
              ? Math.max(0, Math.min(1, descriptor.opacity.factor))
              : (baseColor.a != null ? Math.max(0, Math.min(1, baseColor.a)) : 1);
            baseColor.a = opacity;
            baseColor.css = `rgba(${Math.round(baseColor.r * 255)}, ${Math.round(baseColor.g * 255)}, ${Math.round(baseColor.b * 255)}, ${opacity.toFixed(3)})`;
            return baseColor;
          }
        }
      }

      if (entity.colorBook && entity.resolved && entity.resolved.colorBook) {
        const bookEntry = entity.resolved.colorBook;
        if (bookEntry.trueColor) {
          const rgb = bookEntry.trueColor;
          const r = rgb.r ?? parseInt(rgb.hex.slice(1, 3), 16);
          const g = rgb.g ?? parseInt(rgb.hex.slice(3, 5), 16);
          const b = rgb.b ?? parseInt(rgb.hex.slice(5, 7), 16);
          const alpha = entity.transparency ? entity.transparency.alpha ?? 1 : 1;
          return toColorObject({ r, g, b }, alpha);
        }
        if (Number.isInteger(bookEntry.aci)) {
          const rgb = this._aciToRgb(bookEntry.aci);
          const alpha = entity.transparency ? entity.transparency.alpha ?? 1 : 1;
          return toColorObject(rgb, alpha);
        }
      }

      if (entity.trueColor && entity.trueColor.hex) {
        const r = entity.trueColor.r ?? parseInt(entity.trueColor.hex.slice(1, 3), 16);
        const g = entity.trueColor.g ?? parseInt(entity.trueColor.hex.slice(3, 5), 16);
        const b = entity.trueColor.b ?? parseInt(entity.trueColor.hex.slice(5, 7), 16);
        const alpha = entity.transparency ? entity.transparency.alpha ?? 1 : 1;
        return toColorObject({ r, g, b }, alpha);
      }

      if (entity.color && entity.color.type === 'aci') {
        const rgb = this._aciToRgb(entity.color.value);
        const alpha = entity.transparency ? entity.transparency.alpha ?? 1 : 1;
        return toColorObject(rgb, alpha);
      }

      if (entity.resolved && entity.resolved.layer && entity.resolved.layer.trueColor) {
        const rgb = entity.resolved.layer.trueColor;
        const r = rgb.r ?? parseInt(rgb.hex.slice(1, 3), 16);
        const g = rgb.g ?? parseInt(rgb.hex.slice(3, 5), 16);
        const b = rgb.b ?? parseInt(rgb.hex.slice(5, 7), 16);
        return toColorObject({ r, g, b });
      }

      if (entity.resolved && entity.resolved.layer && entity.resolved.layer.colorBookResolved) {
        const resolved = entity.resolved.layer.colorBookResolved;
        if (resolved.trueColor) {
          const rgb = resolved.trueColor;
          const r = rgb.r ?? parseInt(rgb.hex.slice(1, 3), 16);
          const g = rgb.g ?? parseInt(rgb.hex.slice(3, 5), 16);
          const b = rgb.b ?? parseInt(rgb.hex.slice(5, 7), 16);
          return toColorObject({ r, g, b });
        }
        if (Number.isInteger(resolved.aci)) {
          const rgb = this._aciToRgb(resolved.aci);
          return toColorObject(rgb);
        }
      }

      if (entity.resolved && entity.resolved.layer && Number.isInteger(entity.resolved.layer.colorNumber)) {
        const rgb = this._aciToRgb(entity.resolved.layer.colorNumber);
        return toColorObject(rgb);
      }

      return defaultColor;
    }

    _resolveLineweight(entity) {
      if (!entity) {
        return null;
      }
      const explicit = Number(entity.lineweight);
      if (Number.isFinite(explicit) && explicit > 0) {
        return explicit;
      }
      if (explicit === -1 && entity.resolved && entity.resolved.layer && Number.isFinite(entity.resolved.layer.lineweight) && entity.resolved.layer.lineweight > 0) {
        return entity.resolved.layer.lineweight;
      }
      if (entity.resolved && entity.resolved.layer && Number.isFinite(entity.resolved.layer.lineweight) && entity.resolved.layer.lineweight > 0) {
        return entity.resolved.layer.lineweight;
      }
      return null;
    }

    _lineweightToPx(lineweight) {
      if (!Number.isFinite(lineweight) || lineweight <= 0) return 1;
      return Math.max(0.4, lineweight / 100);
    }

    _resolveLinetype(entity, tables) {
      if (!entity || !tables || !tables.linetypes) {
        return null;
      }
      const catalog = tables.linetypes;
      const directName = entity.linetype ? String(entity.linetype).trim() : '';
      const normalizedDirect = directName.toUpperCase();
      const isByLayer = !normalizedDirect || normalizedDirect === 'BYLAYER';
      const isByBlock = normalizedDirect === 'BYBLOCK';

      const lookupEntry = (name) => {
        if (!name) return null;
        const key = String(name).trim();
        if (!key) {
          return null;
        }
        return catalog[key] || catalog[key.toUpperCase()] || null;
      };

      let entry = null;
      if (!isByLayer && !isByBlock) {
        entry = entity.resolved && entity.resolved.linetype
          ? entity.resolved.linetype
          : lookupEntry(directName);
      }
      if (!entry && entity.resolved && entity.resolved.layer && entity.resolved.layer.linetype) {
        entry = lookupEntry(entity.resolved.layer.linetype);
      }
      if (!entry || !Array.isArray(entry.elements) || !entry.elements.length) {
        return null;
      }
      const settings = this.linetypeSettings || {};
      const globalScale = Number.isFinite(settings.ltScale) && settings.ltScale !== 0
        ? Math.abs(settings.ltScale)
        : 1;
      const defaultEntityScale = Number.isFinite(settings.celTScale) && settings.celTScale !== 0
        ? Math.abs(settings.celTScale)
        : 1;
      let entityScale = Number.isFinite(entity.linetypeScale) && entity.linetypeScale !== 0
        ? Math.abs(entity.linetypeScale)
        : defaultEntityScale;
      if (!Number.isFinite(entityScale) || entityScale === 0) {
        entityScale = 1;
      }
      let effectiveScale = entityScale * globalScale;
      const space = (entity.space || '').toLowerCase();
      if (space === 'paper') {
        const psSetting = settings.psLtScale;
        if (psSetting === 1) {
          effectiveScale = entityScale;
        } else if (Number.isFinite(psSetting) && psSetting !== 0 && psSetting !== 1) {
          effectiveScale = entityScale * Math.abs(psSetting);
        }
      }
      if (!Number.isFinite(effectiveScale) || effectiveScale === 0) {
        effectiveScale = 1;
      }
      return {
        name: entry.name || directName || (entity.resolved && entity.resolved.layer && entity.resolved.layer.linetype) || null,
        description: entry.description || null,
        patternLength: entry.patternLength || null,
        elements: entry.elements,
        scale: effectiveScale
      };
    }

    _normalizeDisplaySettings(settings) {
      const normalized = {
        point: {
          mode: 0,
          size: null
        },
        fillMode: 1,
        mirrorText: 1,
        traceWidth: null
      };
      if (!settings || typeof settings !== 'object') {
        return normalized;
      }
      if (settings.point && typeof settings.point === 'object') {
        if (Number.isFinite(settings.point.mode)) {
          normalized.point.mode = settings.point.mode;
        }
        if (Number.isFinite(settings.point.size)) {
          normalized.point.size = settings.point.size;
        }
      }
      if (settings.fillMode != null) {
        normalized.fillMode = settings.fillMode;
      }
      if (settings.mirrorText != null) {
        normalized.mirrorText = settings.mirrorText;
      }
      if (Number.isFinite(settings.traceWidth)) {
        normalized.traceWidth = settings.traceWidth;
      }
      return normalized;
    }

    _decodePointMode(mode) {
      const normalized = Number.isFinite(mode) ? mode : 0;
      const shapes = {
        circle: false,
        square: false,
        plus: false,
        cross: false,
        tick: false
      };
      const base = normalized & 31;
      switch (base) {
        case 0:
          shapes.circle = true;
          break;
        case 1:
          break;
        case 2:
          shapes.plus = true;
          break;
        case 3:
          shapes.cross = true;
          break;
        case 4:
          shapes.tick = true;
          break;
        default:
          shapes.circle = true;
          break;
      }
      if (normalized & 32) {
        shapes.circle = true;
      }
      if (normalized & 64) {
        shapes.square = true;
      }
      if (normalized & 128) {
        shapes.plus = true;
      }
      if (normalized & 256) {
        shapes.cross = true;
      }
      return shapes;
    }

    _resolvePointDisplayConfig(geometry, transform) {
      if (!geometry || !transform) {
        return null;
      }
      const display = this.displaySettings || {};
      const pointDefaults = display.point || {};
      const mode = Number.isFinite(geometry.pointMode)
        ? geometry.pointMode
        : (Number.isFinite(pointDefaults.mode) ? pointDefaults.mode : 0);
      const shapes = this._decodePointMode(mode);
      const hasShape = shapes.circle || shapes.square || shapes.plus || shapes.cross || shapes.tick;
      if (!hasShape) {
        return null;
      }
      let sizeCandidate = Number.isFinite(geometry.pointSize) ? geometry.pointSize : null;
      if (!Number.isFinite(sizeCandidate) && Number.isFinite(pointDefaults.size)) {
        sizeCandidate = pointDefaults.size;
      }
      const scales = matrixScale(transform);
      const avgScale = ((Math.abs(scales.sx) + Math.abs(scales.sy)) / 2) || 1;
      let pixelSize;
      let worldSize;
      if (!Number.isFinite(sizeCandidate) || sizeCandidate === 0) {
        pixelSize = 4;
        worldSize = pixelSize / avgScale;
      } else if (sizeCandidate < 0) {
        pixelSize = Math.abs(sizeCandidate);
        worldSize = pixelSize / avgScale;
      } else {
        worldSize = Math.abs(sizeCandidate);
        pixelSize = Math.abs(worldSize * avgScale);
      }
      pixelSize = Math.max(1.5, pixelSize);
      worldSize = Math.max(1e-6, worldSize);
      return {
        mode,
        pixelSize,
        worldSize,
        shapes,
        avgScale
      };
    }

    _pointsToFloatArray(points) {
      if (!Array.isArray(points)) {
        return [];
      }
      const data = [];
      points.forEach((pt) => {
        const x = Number.isFinite(pt.x) ? pt.x : 0;
        const y = Number.isFinite(pt.y) ? pt.y : 0;
        data.push(x, y);
      });
      return data;
    }

    _ensureClosedPolyline(points) {
      if (!Array.isArray(points) || points.length === 0) {
        return [];
      }
      const closed = points.slice();
      const first = closed[0];
      const last = closed[closed.length - 1];
      if (!this._pointsApproxEqual(first, last)) {
        closed.push({ x: first.x, y: first.y });
      }
      return closed;
    }

    _trianglesFromOutline(outline) {
      if (!Array.isArray(outline) || outline.length < 3) {
        return [];
      }
      const triangles = [];
      const base = outline[0];
      for (let i = 1; i < outline.length - 1; i += 1) {
        triangles.push([base, outline[i], outline[i + 1]]);
      }
      return triangles;
    }

    _adjustColorAlpha(color, factor, minimum = 0) {
      const base = cloneColor(color);
      const currentAlpha = base.a != null ? base.a : 1;
      const alpha = Math.max(minimum, Math.min(1, currentAlpha * factor));
      base.a = alpha;
      base.css = `rgba(${Math.round(base.r * 255)}, ${Math.round(base.g * 255)}, ${Math.round(base.b * 255)}, ${alpha.toFixed(3)})`;
      return base;
    }

    _intColorToRgb(value) {
      const intVal = Number(value);
      if (!Number.isFinite(intVal)) {
        return null;
      }
      return {
        r: (intVal >> 16) & 0xff,
        g: (intVal >> 8) & 0xff,
        b: intVal & 0xff
      };
    }

    _resolveSectionFillColor(entity, fallbackColor) {
      const style = entity && entity.resolved ? entity.resolved.sectionViewStyle : null;
      const codeValues = style && style.codeValues ? style.codeValues : null;
      if (codeValues) {
        if (codeValues[420] && codeValues[420].length) {
          const rgb = this._intColorToRgb(codeValues[420][0]);
          if (rgb) {
            return this._createColorFromRgb(rgb, 1);
          }
        }
        if (codeValues[62] && codeValues[62].length) {
          const index = Number(codeValues[62][0]);
          if (Number.isFinite(index)) {
            const rgb = this._aciToRgb(index);
            return this._createColorFromRgb(rgb, 1);
          }
        }
      }
      return cloneColor(fallbackColor);
    }

    _resolveSectionStyle(entity, fallbackColor) {
      const style = entity && entity.resolved ? entity.resolved.sectionViewStyle : null;
      const fillColor = this._resolveSectionFillColor(entity, fallbackColor);
      const codeValues = style && style.codeValues ? style.codeValues : null;
      const flags = style && Number.isFinite(style.flags) ? style.flags : 0;

      const getValues = (code) => {
        if (!codeValues) {
          return null;
        }
        const key = String(code);
        const raw = codeValues[key];
        if (raw == null) {
          return null;
        }
        return Array.isArray(raw) ? raw : [raw];
      };

      const toBoolean = (raw) => {
        if (raw == null) {
          return null;
        }
        if (typeof raw === 'boolean') {
          return raw;
        }
        if (typeof raw === 'number') {
          return Number.isFinite(raw) ? Math.abs(raw) > 1e-9 : null;
        }
        const text = String(raw).trim().toLowerCase();
        if (!text) {
          return null;
        }
        if (text === 'true' || text === 't' || text === 'yes' || text === 'y' || text === 'on') {
          return true;
        }
        if (text === 'false' || text === 'f' || text === 'no' || text === 'n' || text === 'off') {
          return false;
        }
        const numeric = Number(text);
        if (Number.isFinite(numeric)) {
          return Math.abs(numeric) > 1e-9;
        }
        return null;
      };

      const toNumber = (raw) => {
        if (raw == null) {
          return null;
        }
        if (typeof raw === 'number') {
          return Number.isFinite(raw) ? raw : null;
        }
        const text = String(raw).trim();
        if (!text) {
          return null;
        }
        const numeric = Number(text);
        return Number.isFinite(numeric) ? numeric : null;
      };

      const toStringValue = (raw) => {
        if (raw == null) {
          return null;
        }
        const text = String(raw).trim();
        return text || null;
      };

      const clampByte = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          return null;
        }
        return Math.min(Math.max(Math.round(num), 0), 255);
      };

      const toColor = (raw, alpha = 1) => {
        if (raw == null) {
          return null;
        }
        if (typeof raw === 'object' && raw !== null) {
          const r = clampByte(raw.r);
          const g = clampByte(raw.g);
          const b = clampByte(raw.b);
          if ([r, g, b].every((component) => component != null)) {
            return this._createColorFromRgb({ r, g, b }, alpha);
          }
        }
        if (typeof raw === 'number') {
          if (Number.isFinite(raw) && Math.abs(raw) >= 256) {
            return this._createColorFromRgb(this._intColorToRgb(raw), alpha);
          }
          return null;
        }
        const text = String(raw).trim();
        if (!text) {
          return null;
        }
        if (/^0x[0-9a-f]{6,8}$/i.test(text)) {
          const numeric = parseInt(text, 16);
          return this._createColorFromRgb(this._intColorToRgb(numeric), alpha);
        }
        if (/^#?[0-9a-f]{6}$/i.test(text)) {
          const hex = text.startsWith('#') ? text.slice(1) : text;
          const numeric = parseInt(hex, 16);
          const r = (numeric >> 16) & 0xff;
          const g = (numeric >> 8) & 0xff;
          const b = numeric & 0xff;
          return this._createColorFromRgb({ r, g, b }, alpha);
        }
        const rgbMatch = text.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
        if (rgbMatch) {
          const r = clampByte(rgbMatch[1]);
          const g = clampByte(rgbMatch[2]);
          const b = clampByte(rgbMatch[3]);
          if ([r, g, b].every((component) => component != null)) {
            return this._createColorFromRgb({ r, g, b }, alpha);
          }
        }
        const numeric = Number(text);
        if (Number.isFinite(numeric) && Math.abs(numeric) >= 256) {
          return this._createColorFromRgb(this._intColorToRgb(numeric), alpha);
        }
        return null;
      };

      const booleanCache = new Map();

      const readBoolean = (code) => {
        if (booleanCache.has(code)) {
          return booleanCache.get(code);
        }
        const values = getValues(code);
        if (!values) {
          booleanCache.set(code, null);
          return null;
        }
        let value = null;
        for (let i = 0; i < values.length; i += 1) {
          value = toBoolean(values[i]);
          if (value != null) {
            break;
          }
        }
        booleanCache.set(code, value);
        return value;
      };

      const parseBoolean = (codes, fallback) => {
        const list = Array.isArray(codes) ? codes : [codes];
        for (let i = 0; i < list.length; i += 1) {
          const value = readBoolean(list[i]);
          if (value != null) {
            return value;
          }
        }
        return fallback;
      };

      const parseNumber = (codes, fallback) => {
        const list = Array.isArray(codes) ? codes : [codes];
        for (let i = 0; i < list.length; i += 1) {
          const values = getValues(list[i]);
          if (!values) {
            continue;
          }
          for (let j = 0; j < values.length; j += 1) {
            const numeric = toNumber(values[j]);
            if (numeric != null) {
              return numeric;
            }
          }
        }
        return fallback;
      };

      const parseString = (codes, fallback) => {
        const list = Array.isArray(codes) ? codes : [codes];
        for (let i = 0; i < list.length; i += 1) {
          const values = getValues(list[i]);
          if (!values) {
            continue;
          }
          for (let j = 0; j < values.length; j += 1) {
            const text = toStringValue(values[j]);
            if (text) {
              return text;
            }
          }
        }
        return fallback;
      };

      const parseColor = (trueColorCodes, colorIndexCodes, alpha = 1) => {
        const colorCodes = Array.isArray(trueColorCodes) ? trueColorCodes : [trueColorCodes];
        for (let i = 0; i < colorCodes.length; i += 1) {
          const values = getValues(colorCodes[i]);
          if (!values) {
            continue;
          }
          for (let j = 0; j < values.length; j += 1) {
            const color = toColor(values[j], alpha);
            if (color) {
              return color;
            }
          }
        }
        const indexCodes = Array.isArray(colorIndexCodes) ? colorIndexCodes : [colorIndexCodes];
        for (let i = 0; i < indexCodes.length; i += 1) {
          const values = getValues(indexCodes[i]);
          if (!values) {
            continue;
          }
          for (let j = 0; j < values.length; j += 1) {
            const numeric = toNumber(values[j]);
            if (numeric == null) {
              continue;
            }
            const rgb = this._aciToRgb(Math.round(numeric));
            if (rgb) {
              return this._createColorFromRgb(rgb, alpha);
            }
          }
        }
        return null;
      };

      const backgroundColor = parseColor([421, 423, 433, 435], [63, 64], 0.65);
      const hatchColor = parseColor([422, 424, 434], [94, 95], 0.85)
        || (fillColor ? this._adjustColorAlpha(fillColor, 0.85, 0.4) : null);
      const patternName = parseString([430, 3, 300], null);
      const patternLibrary = parseString([431, 4, 301], null);
      const hatchAngle = parseNumber([50, 40, 53], 0);
      const hatchScale = parseNumber([41, 44, 54], 1);
      const hatchSpacing = parseNumber([42, 55], null);

      const cutHatchEnabled = parseBoolean([290], true);
      const backgroundFillEnabled = parseBoolean([291], !!backgroundColor);
      const bendLinesEnabled = parseBoolean([292], true);

      const boolMeta = Object.create(null);
      if (codeValues) {
        const trackedCodes = [290, 291, 292, 293, 294, 295, 296, 297, 298, 299];
        trackedCodes.forEach((code) => {
          const value = readBoolean(code);
          if (value != null) {
            boolMeta[code] = value;
          }
        });
      }

      const styleColor = fillColor ? cloneColor(fillColor) : cloneColor(fallbackColor);
      return {
        cutFillColor: styleColor,
        backgroundColor: backgroundColor ? cloneColor(backgroundColor) : null,
        hatchColor: hatchColor ? cloneColor(hatchColor) : null,
        hatchPattern: patternName || null,
        hatchLibrary: patternLibrary || null,
        hatchAngle,
        hatchScale,
        hatchSpacing,
        cutHatchEnabled,
        backgroundFillEnabled,
        bendLinesEnabled,
        meta: {
          name: style && style.name ? style.name : null,
          handle: style && (style.handleUpper || style.handle) ? (style.handleUpper || style.handle) : null,
          flags,
          hatchPattern: patternName || null,
          hatchLibrary: patternLibrary || null,
          bools: Object.keys(boolMeta).length ? boolMeta : null
        }
      };
    }

    _getSectionParamFloat(parameters, code, index = 0) {
      if (!parameters || !Object.prototype.hasOwnProperty.call(parameters, code)) {
        return null;
      }
      const values = parameters[code];
      const raw = Array.isArray(values) ? values[index] : values;
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? numeric : null;
    }

    _resolveSectionDepth(entity) {
      const sectionObject = entity && entity.resolved ? entity.resolved.sectionObject : null;
      const parameters = sectionObject ? sectionObject.parameters : null;
      if (!parameters) {
        return null;
      }
      const depthCodes = [42, 41, 43, 45, 112];
      for (let i = 0; i < depthCodes.length; i += 1) {
        const value = this._getSectionParamFloat(parameters, depthCodes[i]);
        if (value != null && Math.abs(value) > 1e-6) {
          return value;
        }
      }
      return null;
    }

    _emitPointShapes({ center, transform, updateBounds, polylineCollector, color, lineweight, makeMeta, config, family }) {
      if (!center || !config || !polylineCollector) {
        return;
      }
      const half = config.worldSize * 0.5;
      const segments = [];
      if (config.shapes.plus) {
        segments.push([
          { x: center.x - half, y: center.y },
          { x: center.x + half, y: center.y }
        ]);
        segments.push([
          { x: center.x, y: center.y - half },
          { x: center.x, y: center.y + half }
        ]);
      }
      if (config.shapes.cross) {
        segments.push([
          { x: center.x - half, y: center.y - half },
          { x: center.x + half, y: center.y + half }
        ]);
        segments.push([
          { x: center.x - half, y: center.y + half },
          { x: center.x + half, y: center.y - half }
        ]);
      }
      if (config.shapes.tick && !config.shapes.cross) {
        segments.push([
          { x: center.x - half, y: center.y - half * 0.25 },
          { x: center.x + half, y: center.y + half }
        ]);
      }
      const metaBase = { geometryKind: 'polyline', isClosed: false, family: family || 'point', pointMode: config.mode };
      const lw = Number.isFinite(lineweight) ? lineweight : null;
      segments.forEach((segment, index) => {
        const transformed = transformPoints(segment, transform);
        transformed.forEach((pt) => updateBounds(pt.x, pt.y));
        polylineCollector.push({
          points: transformed,
          color: cloneColor(color),
          lineweight: lw,
          worldBounds: this._computeBoundsFromPoints(transformed),
          meta: makeMeta(Object.assign({}, metaBase, { shape: 'segment', segmentIndex: index }))
        });
      });
      if (config.shapes.square) {
        const square = [
          { x: center.x - half, y: center.y - half },
          { x: center.x + half, y: center.y - half },
          { x: center.x + half, y: center.y + half },
          { x: center.x - half, y: center.y + half },
          { x: center.x - half, y: center.y - half }
        ];
        const transformed = transformPoints(square, transform);
        transformed.forEach((pt) => updateBounds(pt.x, pt.y));
        polylineCollector.push({
          points: transformed,
          color: cloneColor(color),
          lineweight: lw,
          worldBounds: this._computeBoundsFromPoints(transformed),
          meta: makeMeta(Object.assign({}, metaBase, { isClosed: true, shape: 'square' }))
        });
      }
    }

    _isFillEnabled() {
      const settings = this.displaySettings || {};
      return settings.fillMode !== 0;
    }

    _emitHatchOutlines({ entity, geometry, transform, updateBounds, polylineCollector, color, makeMeta }) {
      if (!geometry || !polylineCollector) {
        return;
      }
      const contours = this._normalizeHatchContours(geometry);
      if (!contours || !contours.length) {
        return;
      }
      const lineweight = this._resolveLineweight(entity);
      contours.forEach((contour, index) => {
        if (!contour || !Array.isArray(contour.points) || contour.points.length < 2) {
          return;
        }
        const transformed = transformPoints(contour.points, transform);
        transformed.forEach((pt) => updateBounds(pt.x, pt.y));
        polylineCollector.push({
          points: transformed,
          color: cloneColor(color),
          lineweight,
          worldBounds: this._computeBoundsFromPoints(transformed),
          meta: makeMeta({ geometryKind: 'polyline', isClosed: true, family: 'hatch-outline', contourIndex: index })
        });
      });
    }

    _emitSolidOutline({ entity, geometry, transform, updateBounds, polylineCollector, color, lineweight, makeMeta }) {
      if (!geometry || !polylineCollector) {
        return;
      }
      const outline = this._extractSolidOutline(geometry);
      if (!outline || outline.length < 3) {
        return;
      }
      const transformed = transformPoints(outline, transform);
      if (!transformed || transformed.length < 3) {
        return;
      }
      const firstPoint = transformed[0];
      const lastPoint = transformed[transformed.length - 1];
      if (!this._pointsApproxEqual(firstPoint, lastPoint)) {
        transformed.push({ x: firstPoint.x, y: firstPoint.y });
      }
      transformed.forEach((pt) => updateBounds(pt.x, pt.y));
      let effectiveLineweight = Number.isFinite(lineweight) ? lineweight : null;
      if (effectiveLineweight == null && entity && typeof entity.type === 'string' && entity.type.toUpperCase() === 'TRACE') {
        if (this.displaySettings && Number.isFinite(this.displaySettings.traceWidth)) {
          effectiveLineweight = Math.abs(this.displaySettings.traceWidth * 100);
        }
      }
      if (effectiveLineweight == null && geometry && Number.isFinite(geometry.traceWidth)) {
        effectiveLineweight = Math.abs(geometry.traceWidth * 100);
      }
      polylineCollector.push({
        points: transformed,
        color: cloneColor(color),
        lineweight: effectiveLineweight,
        worldBounds: this._computeBoundsFromPoints(transformed),
        meta: makeMeta({ geometryKind: 'polyline', isClosed: true, family: (entity && entity.type ? entity.type.toLowerCase() : 'solid-outline') })
      });
    }

    _colorFromCellColor(colorData, fallbackColor) {
      if (!colorData) {
        return fallbackColor ? cloneColor(fallbackColor) : null;
      }
      if (colorData.type === 'trueColor' && colorData.value) {
        return this._createColorFromRgb(colorData.value, colorData.alpha ?? 1);
      }
      if (colorData.type === 'aci' && Number.isInteger(colorData.value)) {
        return this._createColorFromRgb(this._aciToRgb(colorData.value), colorData.alpha ?? 1);
      }
      if (colorData.backgroundTrueColor) {
        return this._createColorFromRgb(colorData.backgroundTrueColor, 1);
      }
      if (Number.isInteger(colorData.backgroundColorNumber)) {
        return this._createColorFromRgb(this._aciToRgb(colorData.backgroundColorNumber), 1);
      }
      return fallbackColor ? cloneColor(fallbackColor) : null;
    }

    _resolveTextBackgroundCss(text) {
      if (!text || !text.geometry) {
        return null;
      }
      const geometry = text.geometry;
      const background = geometry.background || {};
      const fillFlag = geometry.backgroundFill != null
        ? geometry.backgroundFill
        : (background.fillType != null ? background.fillType : 0);
      if (!fillFlag) {
        return null;
      }

      const resolveAlpha = () => {
        if (geometry.backgroundTransparency && typeof geometry.backgroundTransparency.alpha === 'number') {
          return Math.max(0, Math.min(1, geometry.backgroundTransparency.alpha));
        }
        if (background.transparency && typeof background.transparency.alpha === 'number') {
          return Math.max(0, Math.min(1, background.transparency.alpha));
        }
        return 1;
      };
      const alpha = resolveAlpha();

      const createCss = (rgb) => {
        if (!rgb) {
          return null;
        }
        const color = this._createColorFromRgb(rgb, alpha);
        return color ? color.css : null;
      };

      if (geometry.backgroundTrueColor) {
        return createCss(geometry.backgroundTrueColor);
      }
      if (Number.isInteger(geometry.backgroundColorNumber)) {
        return createCss(this._aciToRgb(geometry.backgroundColorNumber));
      }
      if (background.trueColor) {
        return createCss(background.trueColor);
      }
      if (Number.isInteger(background.colorNumber)) {
        return createCss(this._aciToRgb(background.colorNumber));
      }
      if (text.entity && text.entity.trueColor) {
        const color = this._createColorFromRgb(text.entity.trueColor, Math.max(0.05, Math.min(1, alpha * 0.3)));
        return color ? color.css : null;
      }
      const fallbackAlpha = Math.max(0.05, Math.min(1, alpha * 0.25));
      return `rgba(0, 0, 0, ${fallbackAlpha.toFixed(3)})`;
    }

    _createColorFromRgb(rgb, alpha = 1) {
      if (!rgb) {
        return null;
      }
      const r = Math.min(Math.max((rgb.r ?? 0) / 255, 0), 1);
      const g = Math.min(Math.max((rgb.g ?? 0) / 255, 0), 1);
      const b = Math.min(Math.max((rgb.b ?? 0) / 255, 0), 1);
      const a = Math.min(Math.max(alpha, 0), 1);
      return {
        r,
        g,
        b,
        a,
        css: `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a.toFixed(3)})`
      };
    }

    _buildPolylineMetrics(points) {
      if (!Array.isArray(points) || points.length < 2) {
        return null;
      }
      const segments = [];
      let total = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        if (!start || !end) {
          continue;
        }
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (length <= 1e-6) {
          continue;
        }
        segments.push({
          start,
          end,
          length,
          unit: { x: dx / length, y: dy / length }
        });
        total += length;
      }
      if (!segments.length) {
        return null;
      }
      return { segments, total };
    }

    _pointAtDistance(metrics, distance) {
      if (!metrics || !metrics.segments || !metrics.segments.length) {
        return null;
      }
      const total = metrics.total;
      if (!(total > 0)) {
        return null;
      }
      let remaining = Math.max(0, Math.min(distance, total));
      for (let i = 0; i < metrics.segments.length; i++) {
        const seg = metrics.segments[i];
        if (remaining <= seg.length) {
          const ratio = seg.length > 1e-6 ? (remaining / seg.length) : 0;
          const x = seg.start.x + (seg.end.x - seg.start.x) * ratio;
          const y = seg.start.y + (seg.end.y - seg.start.y) * ratio;
          return {
            point: { x, y },
            tangent: seg.unit
          };
        }
        remaining -= seg.length;
      }
      const last = metrics.segments[metrics.segments.length - 1];
      return last
        ? {
            point: { x: last.end.x, y: last.end.y },
            tangent: last.unit
          }
        : null;
    }

    _computeLinetypeStyle(polyline, scale, toScreen) {
      if (!polyline || !polyline.linetype || !Array.isArray(polyline.linetype.elements)) {
        return null;
      }
      const worldPoints = polyline.points;
      if (!Array.isArray(worldPoints) || worldPoints.length < 2) {
        return null;
      }
      const patternScale = Math.abs(polyline.linetype.scale) > 1e-6 ? Math.abs(polyline.linetype.scale) : 1;
      const patternEntries = [];
      let totalPatternLength = 0;
      polyline.linetype.elements.forEach((element) => {
        const rawLength = Number.isFinite(element.rawLength) ? element.rawLength : (Number.isFinite(element.length) ? element.length : 0);
        const scaledLength = Math.abs(rawLength) * patternScale;
        patternEntries.push({
          element,
          length: scaledLength,
          sign: rawLength >= 0 ? 1 : -1
        });
        totalPatternLength += scaledLength;
      });
      if (!patternEntries.length || totalPatternLength <= 1e-6) {
        return null;
      }
      const dashPattern = patternEntries.map((entry) => Math.max(0.25, entry.length * scale));
      let dashOffset = 0;
      if (patternEntries.length && patternEntries[0].sign < 0) {
        const first = dashPattern.shift();
        if (typeof first === 'number') {
          dashPattern.push(first);
          dashOffset = first;
        }
      }
      const metrics = this._buildPolylineMetrics(worldPoints);
      if (!metrics) {
        return {
          dashPattern,
          dashOffset,
          shapes: []
        };
      }
      const shapes = this._generateLinetypeShapes(metrics, patternEntries, polyline, patternScale, scale, toScreen);
      return {
        dashPattern,
        dashOffset,
        shapes
      };
    }

    _generateLinetypeShapes(metrics, patternEntries, polyline, patternScale, scale, toScreen) {
      if (!metrics || !patternEntries || !patternEntries.length) {
        return [];
      }
      const hasComplexElements = patternEntries.some((entry) => {
        const kind = entry.element && entry.element.kind;
        return kind === 'shape' || kind === 'text' || entry.element?.shapeType === 1 || entry.element?.shapeType === 2;
      });
      if (!hasComplexElements) {
        return [];
      }
      const shapes = [];
      const totalLength = metrics.total;
      if (!(totalLength > 0)) {
        return shapes;
      }
      const patternLength = patternEntries.reduce((sum, entry) => sum + entry.length, 0);
      if (!(patternLength > 0)) {
        return shapes;
      }
      let distance = 0;
      let guard = 0;
      while (distance < totalLength + 1e-6 && guard < 10000) {
        for (let idx = 0; idx < patternEntries.length && distance < totalLength + 1e-6; idx++) {
          const entry = patternEntries[idx];
          const element = entry.element || {};
          const isComplex = element.kind === 'shape' || element.kind === 'text' || element.shapeType === 1 || element.shapeType === 2;
          const segmentLength = entry.length;
          const appliedLength = segmentLength > 1e-6 ? segmentLength : Math.max(patternLength * 0.05, 0.1);
          if (isComplex) {
            const targetDistance = distance + appliedLength * 0.5;
            const pointInfo = this._pointAtDistance(metrics, targetDistance);
            if (pointInfo) {
              const basePoint = pointInfo.point;
              const tangent = pointInfo.tangent;
              const baseAngle = Math.atan2(tangent.y, tangent.x);
              const scaleFactor = Number.isFinite(element.scale) && element.scale !== 0 ? element.scale : 1;
              const offsetX = (element.offsetX || 0) * patternScale;
              const offsetY = (element.offsetY || 0) * patternScale;
              const cosA = Math.cos(baseAngle);
              const sinA = Math.sin(baseAngle);
              const offsetPoint = {
                x: basePoint.x + cosA * offsetX - sinA * offsetY,
                y: basePoint.y + sinA * offsetX + cosA * offsetY
              };
              const rotation = baseAngle + (element.rotation || 0) * Math.PI / 180;
              const screenPosition = toScreen(offsetPoint.x, offsetPoint.y);
              const label = element.text && element.text.length
                ? element.text
                : (element.shapeName && element.shapeName.length
                  ? element.shapeName
                  : (element.shapeNumber != null ? `#${element.shapeNumber}` : '•'));
              const baseSize = polyline.lineweight ? this._lineweightToPx(polyline.lineweight) * 6 : 6;
              const size = Math.max(4, baseSize * Math.max(0.5, scaleFactor) * Math.max(0.6, scale));
              shapes.push({
                text: label,
                position: { x: screenPosition[0], y: screenPosition[1] },
                rotation,
                size,
                color: polyline.color,
                colorCss: polyline.color.css
              });
            }
          }
          distance += appliedLength;
        }
        guard += patternEntries.length;
      }
      return shapes;
    }

    _addDimensionArrowHead(tip, toward, size, transform, updateBounds, polylineCollector, color, weight, metaFactory, lineweight) {
      if (!tip || !toward || !Number.isFinite(size) || size <= 0) {
        return;
      }
      const direction = { x: toward.x - tip.x, y: toward.y - tip.y };
      const length = this._vectorLength(direction);
      if (length < 1e-6) {
        return;
      }
      const unit = { x: direction.x / length, y: direction.y / length };
      const perp = { x: -unit.y, y: unit.x };
      const basePoint = {
        x: tip.x + unit.x * size,
        y: tip.y + unit.y * size
      };
      const spread = size * 0.5;
      const left = {
        x: basePoint.x + perp.x * spread,
        y: basePoint.y + perp.y * spread
      };
      const right = {
        x: basePoint.x - perp.x * spread,
        y: basePoint.y - perp.y * spread
      };
      const segments = [
        [tip, left],
        [tip, right]
      ];
      const createMeta = (overrides) => {
        if (typeof metaFactory !== 'function') {
          return null;
        }
        return metaFactory(Object.assign({ geometryKind: 'polyline', dimensionPart: 'arrowhead' }, overrides || {}));
      };
      const lineweightValue = Number.isFinite(lineweight) ? lineweight : null;
      segments.forEach((segment) => {
        const transformed = transformPoints(segment, transform);
        transformed.forEach((pt) => updateBounds(pt.x, pt.y));
        polylineCollector.push({
          points: transformed,
          color,
          lineweight: lineweightValue,
          weight: weight || 1,
          worldBounds: this._computeBoundsFromPoints(transformed),
          meta: createMeta()
        });
      });
    }

    _addTableGeometry(options) {
      if (!options || !options.geometry) {
        return;
      }
      const {
        entity,
        geometry,
        transform,
        updateBounds,
        polylineCollector,
        fillCollector,
        textCollector,
        baseColor,
        lineweight,
        renderBlockContent,
        getBlockNameByHandle,
        textStylesByHandle,
        depth,
        visitedBlocks,
        blockStack,
        highlightActive
      } = options;

      const rowCount = geometry.rowCount || (Array.isArray(geometry.rowHeights) ? geometry.rowHeights.length : 0);
      const columnCount = geometry.columnCount || (Array.isArray(geometry.columnWidths) ? geometry.columnWidths.length : 0);
      if (!rowCount || !columnCount) {
        return;
      }

      const defaultRowHeight = geometry.defaultRowHeight ?? (geometry.rowHeights && geometry.rowHeights.length ? geometry.rowHeights[0] : 12);
      const defaultColumnWidth = geometry.defaultColumnWidth ?? (geometry.columnWidths && geometry.columnWidths.length ? geometry.columnWidths[0] : 40);

      const rowHeights = [];
      for (let r = 0; r < rowCount; r++) {
        const candidate = geometry.rowHeights && Number.isFinite(geometry.rowHeights[r]) ? geometry.rowHeights[r] : null;
        rowHeights.push(Number.isFinite(candidate) && candidate > 0 ? candidate : (defaultRowHeight || 12));
      }

      const columnWidths = [];
      for (let c = 0; c < columnCount; c++) {
        const candidate = geometry.columnWidths && Number.isFinite(geometry.columnWidths[c]) ? geometry.columnWidths[c] : null;
        columnWidths.push(Number.isFinite(candidate) && candidate > 0 ? candidate : (defaultColumnWidth || 40));
      }

      const origin = geometry.position || { x: 0, y: 0 };
      const horizontalDirRaw = geometry.horizontalDirection || { x: 1, y: 0 };
      const verticalDirRaw = geometry.verticalDirection || { x: 0, y: 1 };
      const horizontalDir = this._normalizeVector(horizontalDirRaw);
      const verticalDir = this._normalizeVector(verticalDirRaw);
      const downwardDir = { x: -verticalDir.x, y: -verticalDir.y };

      const localMatrix = {
        a: horizontalDir.x,
        b: horizontalDir.y,
        c: downwardDir.x,
        d: downwardDir.y,
        tx: origin.x,
        ty: origin.y
      };
      const baseTransform = multiplyMatrix(transform, localMatrix);
      const baseScale = matrixScale(baseTransform);
      const avgScale = ((Math.abs(baseScale.sx) + Math.abs(baseScale.sy)) / 2) || 1;
      const baseRotation = matrixRotation(baseTransform);

      const columnOffsets = [0];
      for (let c = 0; c < columnCount; c++) {
        columnOffsets.push(columnOffsets[c] + columnWidths[c]);
      }
      const rowOffsets = [0];
      for (let r = 0; r < rowCount; r++) {
        rowOffsets.push(rowOffsets[r] + rowHeights[r]);
      }

      const cellMap = new Map();
      if (Array.isArray(geometry.cells)) {
        geometry.cells.forEach((cell) => {
          const key = `${cell.row}:${cell.column}`;
          cellMap.set(key, cell);
        });
      }

      const coveredCells = new Set();
      const lineColor = baseColor || this._createColorFromRgb({ r: 210, g: 227, b: 255 }, 1);

      const renderRectangle = (left, top, width, height, cellColor) => {
        const corners = [
          { x: left, y: top },
          { x: left + width, y: top },
          { x: left + width, y: top + height },
          { x: left, y: top + height }
        ];
        const worldCorners = transformPoints(corners, baseTransform);
        worldCorners.forEach((pt) => updateBounds(pt.x, pt.y));
        if (cellColor) {
          fillCollector.push({
            points: worldCorners.concat([worldCorners[0]]),
            color: cellColor,
            colorCss: cellColor.css
          });
        }
        polylineCollector.push({
          points: worldCorners.concat([worldCorners[0]]),
          color: lineColor,
          weight: this._lineweightToPx(lineweight)
        });
      };

      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < columnCount; c++) {
          const key = `${r}:${c}`;
          if (coveredCells.has(key)) {
            continue;
          }
          const cell = cellMap.get(key) || null;
          const rowSpan = cell ? Math.max(1, cell.rowSpan || 1) : 1;
          const columnSpan = cell ? Math.max(1, cell.columnSpan || 1) : 1;
          const width = columnOffsets[c + columnSpan] - columnOffsets[c];
          const height = rowOffsets[r + rowSpan] - rowOffsets[r];
          const left = columnOffsets[c];
          const top = rowOffsets[r];

          let backgroundColor = null;
          if (cell && cell.backgroundEnabled) {
            if (cell.backgroundTrueColor) {
              backgroundColor = this._createColorFromRgb(cell.backgroundTrueColor, 1);
            } else if (Number.isInteger(cell.backgroundColorNumber)) {
              backgroundColor = this._createColorFromRgb(this._aciToRgb(cell.backgroundColorNumber), 0.9);
            }
          }
          renderRectangle(left, top, width, height, backgroundColor);

          if (cell) {
            for (let rr = r; rr < r + rowSpan; rr++) {
              for (let cc = c; cc < c + columnSpan; cc++) {
                if (rr === r && cc === c) {
                  continue;
                }
                coveredCells.add(`${rr}:${cc}`);
              }
            }

            if (cell.text && cell.text.trim().length) {
              const paddingX = Math.min(width * 0.1, 4);
              const paddingY = Math.min(height * 0.1, 4);
              const textWidth = Math.max(width - paddingX * 2, width * 0.5);
              const textHeight = cell.textHeight && cell.textHeight > 0 ? cell.textHeight : Math.min(height - paddingY * 2, height * 0.7);
              const localCenter = {
                x: left + width / 2,
                y: top + height / 2
              };
              const worldCenter = applyMatrix(baseTransform, localCenter);
              updateBounds(worldCenter.x, worldCenter.y);

              const textStyleHandle = cell.textStyleHandle || null;
              let textStyleName = null;
              if (textStyleHandle && textStylesByHandle) {
                textStyleName = textStylesByHandle.get(textStyleHandle) ||
                  textStylesByHandle.get(String(textStyleHandle).toUpperCase()) || null;
              }

              const textColor = this._createColorFromRgb({ r: 236, g: 245, b: 255 }, 1);
              const textGeometry = {
                text: cell.text,
                referenceWidth: textWidth,
                height: textHeight,
                textStyle: textStyleName
              };
              textCollector.push({
                kind: 'MTEXT',
                entity,
                geometry: textGeometry,
                styleName: textStyleName,
                content: cell.text,
                worldPosition: worldCenter,
                rotation: baseRotation,
                worldHeight: textHeight,
                baseHeight: textHeight,
                scaleMagnitude: avgScale,
                color: textColor
              });
            }

            if (cell.blockHandle && typeof renderBlockContent === 'function' && typeof getBlockNameByHandle === 'function') {
              const blockName = getBlockNameByHandle(cell.blockHandle);
              if (blockName) {
                const localBlockOrigin = {
                  x: left + width / 2,
                  y: top + height / 2
                };
                const blockTransform = multiplyMatrix(baseTransform, translateMatrix(localBlockOrigin.x, localBlockOrigin.y));
                renderBlockContent(
                  blockName,
                  blockTransform,
                  (depth || 0) + 1,
                  visitedBlocks || [],
                  blockStack || [],
                  !!highlightActive
                );
              }
            }
          }
        }
      }
    }

    _addLeaderGeometry(options) {
      if (!options || !options.geometry) {
        return;
      }
      const {
        kind,
        entity,
        geometry,
        transform,
        updateBounds,
        polylineCollector,
        textCollector,
        color,
        lineweight,
        multiLeaderStylesByHandle,
        multiLeaderStyles,
        textStylesByHandle,
        renderBlockContent,
        getBlockNameByHandle,
        depth,
        visitedBlocks,
        blockStack,
        highlightActive
      } = options;

      const sourcePoints = Array.isArray(geometry.vertexPoints)
        ? geometry.vertexPoints
        : (Array.isArray(geometry.vertices) ? geometry.vertices : []);
      if (!sourcePoints.length) {
        return;
      }

      const leaderPoints = sourcePoints.map((pt) => ({
        x: pt.x ?? 0,
        y: pt.y ?? 0,
        z: pt.z ?? 0
      }));

      let styleEntry = null;
      if (kind === 'mleader' && geometry.styleHandle && multiLeaderStylesByHandle) {
        styleEntry = multiLeaderStylesByHandle.get(geometry.styleHandle) ||
          multiLeaderStylesByHandle.get(String(geometry.styleHandle).toUpperCase()) || null;
      }
      if (!styleEntry && kind === 'mleader' && geometry.styleHandle && multiLeaderStyles) {
        styleEntry = multiLeaderStyles[geometry.styleHandle] || null;
      }

      let doglegLength = geometry.doglegLength;
      if (!Number.isFinite(doglegLength) && styleEntry && Number.isFinite(styleEntry.doglegLength)) {
        doglegLength = styleEntry.doglegLength;
      }

      if (kind === 'mleader' && Number.isFinite(doglegLength) && doglegLength > 0 && leaderPoints.length >= 2) {
        const end = leaderPoints[leaderPoints.length - 1];
        const prev = leaderPoints[leaderPoints.length - 2];
        const vec = { x: end.x - prev.x, y: end.y - prev.y };
        const len = this._vectorLength(vec);
        if (len > 1e-6 && doglegLength < len * 2) {
          const norm = { x: vec.x / len, y: vec.y / len };
          const doglegPoint = {
            x: end.x - norm.x * doglegLength,
            y: end.y - norm.y * doglegLength,
            z: end.z
          };
          leaderPoints.splice(leaderPoints.length - 1, 0, doglegPoint);
        }
      }

      if (leaderPoints.length < 2) {
        return;
      }

      const transformed = leaderPoints.map((pt) => applyMatrix(transform, pt));
      transformed.forEach((pt) => updateBounds(pt.x, pt.y));
      polylineCollector.push({
        points: transformed,
        color,
        weight: this._lineweightToPx(lineweight)
      });

      const arrowSizeFromStyle = styleEntry && Number.isFinite(styleEntry.arrowSize) ? styleEntry.arrowSize : null;
      const arrowSize = Number.isFinite(geometry.arrowSize) && geometry.arrowSize > 0
        ? geometry.arrowSize
        : (arrowSizeFromStyle && arrowSizeFromStyle > 0 ? arrowSizeFromStyle : (geometry.scale ? geometry.scale * 4 : 6));

      if (leaderPoints.length >= 2) {
        const arrowTip = leaderPoints[0];
        const arrowBase = leaderPoints[1];
        this._addDimensionArrowHead(
          arrowTip,
          arrowBase,
          Math.max(2, arrowSize),
          transform,
          updateBounds,
          polylineCollector,
          color,
          this._lineweightToPx(lineweight),
          null,
          lineweight
        );
      }

      if (kind !== 'mleader') {
        return;
      }

      const anchorPoint = leaderPoints[leaderPoints.length - 1];
      const contentWorldPosition = applyMatrix(transform, anchorPoint);
      updateBounds(contentWorldPosition.x, contentWorldPosition.y);

      const styleTextHeight = styleEntry && Number.isFinite(styleEntry.textHeight) ? styleEntry.textHeight : null;
      const textHeight = Number.isFinite(geometry.textHeight) && geometry.textHeight > 0
        ? geometry.textHeight
        : (styleTextHeight && styleTextHeight > 0 ? styleTextHeight : (geometry.scale ? geometry.scale * 3 : 12));

      const scale = matrixScale(transform);
      const avgScale = ((Math.abs(scale.sx) + Math.abs(scale.sy)) / 2) || 1;
      const rotation = matrixRotation(transform);

      const styleTextHandle = geometry.textStyleHandle ||
        (styleEntry && styleEntry.textStyleHandle) ||
        null;
      let textStyleName = null;
      if (styleTextHandle && textStylesByHandle) {
        textStyleName = textStylesByHandle.get(styleTextHandle) ||
          textStylesByHandle.get(String(styleTextHandle).toUpperCase()) || null;
      }
      if (!textStyleName && entity && entity.textStyle) {
        textStyleName = entity.textStyle;
      }

      const textContent = geometry.text ? geometry.text.trim() : '';
      const contentType = geometry.contentType || 0;
      const shouldRenderText = textContent && (contentType === 0 || contentType === 1);

      if (shouldRenderText) {
        textCollector.push({
          kind: 'TEXT',
          entity,
          geometry: { text: textContent },
          styleName: textStyleName,
          content: textContent,
          worldPosition: contentWorldPosition,
          rotation,
          worldHeight: textHeight,
          baseHeight: textHeight,
          scaleMagnitude: avgScale,
          color
        });
      }

      const blockHandle = geometry.blockContentId ||
        (styleEntry && styleEntry.contentBlockHandle) ||
        null;

      if (contentType === 2 && blockHandle && typeof renderBlockContent === 'function' && typeof getBlockNameByHandle === 'function') {
        const blockName = getBlockNameByHandle(blockHandle);
        if (blockName) {
          const contentTransform = multiplyMatrix(transform, translateMatrix(anchorPoint.x, anchorPoint.y));
          renderBlockContent(blockName, contentTransform, depth, visitedBlocks, blockStack, highlightActive);
        }
      }
    }

    _calculateDimensionMeasurement(geometry) {
      if (!geometry) {
        return null;
      }
      const type = geometry.dimensionType & 7;
      const distance = (a, b) => {
        if (!a || !b) return null;
        return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
      };

      switch (type) {
        case 0:
        case 1: {
          const p1 = geometry.extensionLine1Point || geometry.definitionPoint;
          const p2 = geometry.extensionLine2Point || geometry.dimensionLinePoint;
          return distance(p1, p2);
        }
        case 2:
        case 5: {
          const center = geometry.dimensionLinePoint || geometry.definitionPoint;
          const a1 = geometry.arrow1Point;
          const a2 = geometry.arrow2Point;
          if (center && a1 && a2) {
            const v1 = { x: a1.x - center.x, y: a1.y - center.y };
            const v2 = { x: a2.x - center.x, y: a2.y - center.y };
            const dot = v1.x * v2.x + v1.y * v2.y;
            const det = v1.x * v2.y - v1.y * v2.x;
            const angle = Math.abs(Math.atan2(det, dot)) * 180 / Math.PI;
            return angle;
          }
          break;
        }
        case 3: {
          const a1 = geometry.arrow1Point || geometry.definitionPoint;
          const a2 = geometry.arrow2Point || geometry.dimensionLinePoint;
          return distance(a1, a2);
        }
        case 4: {
          const center = geometry.definitionPoint || geometry.dimensionLinePoint;
          const tip = geometry.arrow1Point || geometry.dimensionLinePoint;
          return distance(center, tip);
        }
        case 6: {
          const origin = geometry.definitionPoint;
          const leader = geometry.dimensionLinePoint || geometry.arrow1Point;
          if (origin && leader) {
            const dx = leader.x - origin.x;
            const dy = leader.y - origin.y;
            return Math.max(Math.abs(dx), Math.abs(dy));
          }
          break;
        }
        default:
          break;
      }

      return geometry.measurement != null ? geometry.measurement : null;
    }

    _formatDimensionLabel(geometry) {
      if (!geometry) {
        return '';
      }
      const measurementValue = this._calculateDimensionMeasurement(geometry);
      const preferredValue = geometry.measurement != null ? geometry.measurement : measurementValue;
      const formattedMeasurement = preferredValue != null
        ? this._formatDimensionMeasurement(preferredValue, geometry)
        : '';
      const raw = geometry.text != null ? geometry.text.trim() : '';
      if (!raw) {
        return formattedMeasurement;
      }
      if (formattedMeasurement && raw.includes('<>')) {
        return raw.replace(/<>/g, formattedMeasurement);
      }
      return raw;
    }

    _formatDimensionMeasurement(value, geometry) {
      if (!Number.isFinite(value)) {
        return '';
      }
      const type = geometry ? (geometry.dimensionType & 7) : 0;
      const precision = geometry && Number.isFinite(geometry.textHeight) ? 4 : 3;
      const formatted = this._trimTrailingZeros(value.toFixed(precision));
      switch (type) {
        case 2:
        case 5:
          return `${formatted}\u00B0`;
        case 3:
          return `\u2300${formatted}`;
        case 4:
          return `R${formatted}`;
        default:
          return formatted;
      }
    }

    _trimTrailingZeros(value) {
      if (typeof value !== 'string') {
        return value;
      }
      if (!value.includes('.')) {
        return value;
      }
      return value.replace(/\.?0+$/, '');
    }

    _resolveDimensionTextRotation(geometry) {
      if (!geometry) {
        return 0;
      }
      const type = geometry.dimensionType & 7;
      const angleFromVector = (from, to) => {
        if (!from || !to) return 0;
        return Math.atan2((to.y || 0) - (from.y || 0), (to.x || 0) - (from.x || 0));
      };

      switch (type) {
        case 0:
        case 1:
        case 3:
          if (geometry.arrow1Point && geometry.arrow2Point) {
            return angleFromVector(geometry.arrow1Point, geometry.arrow2Point);
          }
          if (geometry.definitionPoint && geometry.dimensionLinePoint) {
            return angleFromVector(geometry.definitionPoint, geometry.dimensionLinePoint);
          }
          break;
        case 2:
        case 5: {
          const center = geometry.dimensionLinePoint || geometry.definitionPoint;
          const a1 = geometry.arrow1Point;
          const a2 = geometry.arrow2Point;
          if (center && a1 && a2) {
            const v1 = this._normalizeVector({ x: a1.x - center.x, y: a1.y - center.y });
            const v2 = this._normalizeVector({ x: a2.x - center.x, y: a2.y - center.y });
            const bisector = this._normalizeVector({ x: v1.x + v2.x, y: v1.y + v2.y });
            if (this._vectorLength(bisector) > 1e-6) {
              return Math.atan2(bisector.y, bisector.x);
            }
            return angleFromVector(center, a1);
          }
          break;
        }
        case 4: {
          const center = geometry.definitionPoint || geometry.dimensionLinePoint;
          const tip = geometry.arrow1Point || geometry.dimensionLinePoint;
          if (center && tip) {
            return angleFromVector(center, tip);
          }
          break;
        }
        case 6:
          if (geometry.definitionPoint && geometry.dimensionLinePoint) {
            return angleFromVector(geometry.definitionPoint, geometry.dimensionLinePoint);
          }
          break;
        default:
          break;
      }
      return 0;
    }

    _normalizeVector(vector) {
      if (!vector) {
        return { x: 0, y: 0 };
      }
      const length = this._vectorLength(vector);
      if (length < 1e-6) {
        return { x: 0, y: 0 };
      }
      return { x: vector.x / length, y: vector.y / length };
    }

    _vectorLength(vector) {
      if (!vector) {
        return 0;
      }
      return Math.hypot(vector.x || 0, vector.y || 0);
    }

    _queueSingleLineText(options = {}) {
      if (!options || !options.entity || !options.geometry || !options.transform || !options.rawTexts) {
        return false;
      }
      const kind = options.kind || 'TEXT';
      const geometry = options.geometry;
      if (!geometry.position) {
        return false;
      }
      const worldPosition = applyMatrix(options.transform, geometry.position);
      if (typeof options.updateBounds === 'function') {
        options.updateBounds(worldPosition.x, worldPosition.y);
      }
      const localRotation = geometry.rotation ? geometry.rotation * Math.PI / 180 : 0;
      const rotation = matrixRotation(options.transform) + localRotation;
      let appliedRotation = rotation;
      if (this.displaySettings && this.displaySettings.mirrorText === 0) {
        const det = (options.transform.a * options.transform.d) - (options.transform.b * options.transform.c);
        if (det < 0) {
          appliedRotation += Math.PI;
        }
      }
      const scales = matrixScale(options.transform);
      const avgScale = ((Math.abs(scales.sx) + Math.abs(scales.sy)) / 2) || 1;
      const resolvedTextStyle = options.entity.resolved && options.entity.resolved.textStyle
        ? options.entity.resolved.textStyle
        : null;
      const baseHeight = geometry.height ||
        geometry.fontSize ||
        (resolvedTextStyle && resolvedTextStyle.fixedHeight) ||
        12;
      const worldHeight = baseHeight * avgScale;
      const styleName = options.entity.textStyle ||
        (resolvedTextStyle ? resolvedTextStyle.name : (geometry.textStyle || null));
      const alignmentPoint = geometry.alignmentPoint
        ? applyMatrix(options.transform, geometry.alignmentPoint)
        : null;
      let content = options.contentOverride;
      if (content == null) {
        if (typeof geometry.content === 'string') {
          content = geometry.content;
        } else if (geometry.value != null) {
          content = String(geometry.value);
        } else if (geometry.defaultValue != null) {
          content = String(geometry.defaultValue);
        } else {
          content = '';
        }
      }
      const textEntry = {
        kind,
        entity: options.entity,
        geometry,
        color: options.color,
        worldPosition,
        rotation: appliedRotation,
        worldHeight,
        baseHeight,
        scaleMagnitude: avgScale,
        styleName,
        alignmentPoint,
        content: typeof content === 'string' ? content : String(content ?? ''),
        interaction: options.interaction || null,
        meta: options.meta || null
      };
      if (geometry.tag) {
        textEntry.attributeTag = geometry.tag;
      }
      if (geometry.visibility) {
        textEntry.attributeVisibility = geometry.visibility;
      }
      options.rawTexts.push(textEntry);
      return true;
    }

    _updateBoundsForText(layout, rawText, updateBounds, scale) {
      if (!layout || !rawText || !updateBounds || !rawText.worldPosition) {
        return;
      }
      const widthFactor = layout.widthFactor || 1;
      const widthPx = layout.widthPx != null ? layout.widthPx : (layout.baseWidthPx || 0) * widthFactor;
      const heightPx = layout.heightPx || layout.lineHeight || 0;
      if (!(widthPx > 0 && heightPx > 0) || !scale) {
        updateBounds(rawText.worldPosition.x, rawText.worldPosition.y);
        return;
      }

      const invScale = 1 / scale;
      const anchorBaseX = layout.anchor && typeof layout.anchor.x === 'number' ? layout.anchor.x : 0;
      const anchorBaseY = layout.anchor && typeof layout.anchor.y === 'number' ? layout.anchor.y : 0;
      const anchorWorldX = (anchorBaseX * widthFactor) * invScale;
      const anchorWorldY = anchorBaseY * invScale;
      const widthWorld = widthPx * invScale;
      const heightWorld = heightPx * invScale;
      const rotation = layout.rotationRad != null ? layout.rotationRad : (rawText.rotation || 0);
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      const corners = [
        { x: anchorWorldX, y: anchorWorldY },
        { x: anchorWorldX + widthWorld, y: anchorWorldY },
        { x: anchorWorldX + widthWorld, y: anchorWorldY + heightWorld },
        { x: anchorWorldX, y: anchorWorldY + heightWorld }
      ];

      corners.forEach((corner) => {
        const rotatedX = corner.x * cos - corner.y * sin;
        const rotatedY = corner.x * sin + corner.y * cos;
        updateBounds(rawText.worldPosition.x + rotatedX, rawText.worldPosition.y + rotatedY);
      });
    }

    _aciToRgb(index) {
      const aciTable = {
        1: { r: 255, g: 0, b: 0 },
        2: { r: 255, g: 255, b: 0 },
        3: { r: 0, g: 255, b: 0 },
        4: { r: 0, g: 255, b: 255 },
        5: { r: 0, g: 0, b: 255 },
        6: { r: 255, g: 0, b: 255 },
        7: { r: 255, g: 255, b: 255 }
      };
      return aciTable[index] || { r: 180, g: 200, b: 220 };
    }

    _degToRad(deg) {
      return (deg || 0) * Math.PI / 180;
    }

    _sampleArc(center, radius, startAngle, endAngle, forceFullCircle) {
      const samples = [];
      const startRad = this._degToRad(startAngle || 0);
      let endRad = this._degToRad(endAngle || 0);
      let sweep = forceFullCircle ? Math.PI * 2 : endRad - startRad;
      if (!forceFullCircle) {
        if (sweep === 0) {
          sweep = Math.PI * 2;
        } else if (sweep < 0) {
          sweep += Math.PI * 2;
        }
      } else {
        endRad = startRad + Math.PI * 2;
      }
      const steps = Math.max(12, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 64));
      for (let i = 0; i <= steps; i++) {
        const t = startRad + sweep * (i / steps);
        samples.push({
          x: center.x + Math.cos(t) * radius,
          y: center.y + Math.sin(t) * radius
        });
      }
      return samples;
    }

    _sampleEllipse(geometry) {
      if (!geometry.center || !geometry.majorAxis) return null;
      const ratio = geometry.ratio || 1;
      const major = geometry.majorAxis;
      const majorLength = Math.hypot(major.x, major.y);
      if (!Number.isFinite(majorLength) || majorLength === 0) return null;
      const ux = major.x / majorLength;
      const uy = major.y / majorLength;
      const vx = -uy * ratio;
      const vy = ux * ratio;
      const start = geometry.startAngle != null ? geometry.startAngle : 0;
      const end = geometry.endAngle != null ? geometry.endAngle : Math.PI * 2;
      const steps = Math.max(16, Math.ceil(Math.abs(end - start) / (Math.PI * 2) * 72));
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = start + (end - start) * (i / steps);
        const cosT = Math.cos(t);
        const sinT = Math.sin(t);
        pts.push({
          x: geometry.center.x + cosT * ux * majorLength + sinT * vx * majorLength,
          y: geometry.center.y + cosT * uy * majorLength + sinT * vy * majorLength
        });
      }
      return pts;
    }

    _computeBoundsFromPoints(points) {
      if (!Array.isArray(points) || points.length === 0) {
        return null;
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (!pt) {
          continue;
        }
        const x = Number.isFinite(pt.x) ? pt.x : null;
        const y = Number.isFinite(pt.y) ? pt.y : null;
        if (x == null || y == null) {
          continue;
        }
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      if (minX === Infinity) {
        return null;
      }
      return { minX, minY, maxX, maxY };
    }

    _computeTextScreenBounds(layout) {
      if (!layout || !Array.isArray(layout.screenPosition) || layout.screenPosition.length < 2) {
        return null;
      }
      const baseWidth = Number.isFinite(layout.baseWidthPx)
        ? layout.baseWidthPx
        : (Number.isFinite(layout.widthPx) ? layout.widthPx : 0);
      const height = Number.isFinite(layout.heightPx)
        ? layout.heightPx
        : (Number.isFinite(layout.lineHeight) ? layout.lineHeight : 0);
      if (baseWidth <= 0 && height <= 0) {
        return null;
      }
      const widthFactor = Number.isFinite(layout.widthFactor) ? layout.widthFactor : 1;
      const rotation = layout.rotationRad != null
        ? layout.rotationRad
        : ((layout.rotationDeg || 0) * Math.PI / 180);
      const anchorX = layout.anchor && typeof layout.anchor.x === 'number' ? layout.anchor.x : 0;
      const anchorY = layout.anchor && typeof layout.anchor.y === 'number' ? layout.anchor.y : 0;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const a = widthFactor * cos;
      const b = widthFactor * sin;
      const c = -sin;
      const d = cos;
      const e = layout.screenPosition[0] + widthFactor * cos * anchorX - sin * anchorY;
      const f = layout.screenPosition[1] + widthFactor * sin * anchorX + cos * anchorY;
      const corners = [
        { x: 0, y: 0 },
        { x: baseWidth, y: 0 },
        { x: baseWidth, y: height },
        { x: 0, y: height }
      ].map((pt) => ({
        x: a * pt.x + c * pt.y + e,
        y: b * pt.x + d * pt.y + f
      }));
      return this._computeBoundsFromPoints(corners);
    }

    _resolveVisualStyle(sceneGraph, buildOptions, environmentDescriptor, coordinateResolver) {
      const tables = sceneGraph && sceneGraph.tables ? sceneGraph.tables : {};
      const byHandle = tables.visualStylesByHandle || {};
      const byName = tables.visualStylesByName || {};
      const visualStyles = tables.visualStyles || {};

      const lookupByHandle = (handle) => {
        if (!handle && handle !== 0) {
          return null;
        }
        const key = String(handle).trim().toUpperCase();
        if (!key) {
          return null;
        }
        return byHandle[key] || null;
      };

      const lookupByName = (name) => {
        if (!name) {
          return null;
        }
        const trimmed = String(name).trim();
        if (!trimmed) {
          return null;
        }
        const upper = trimmed.toUpperCase();
        return byName[upper] || visualStyles[trimmed] || null;
      };

      const buildDescriptorFromEntry = (entry, source) => {
        if (!entry) {
          return null;
        }
        const categoryGuess = entry.category || classifyVisualStyleName(entry.name);
        const normalizedCategory = this._normalizeVisualStyleCategory(categoryGuess);
        const config = this._getVisualStylePreset(normalizedCategory);
        return {
          name: entry.name || null,
          handle: entry.handle || null,
          description: entry.description || null,
          category: normalizedCategory,
          source,
          config,
          entry
        };
      };

      const buildPresetDescriptor = (category, source) => {
        const normalized = this._normalizeVisualStyleCategory(category);
        return {
          name: normalized,
          handle: null,
          description: null,
          category: normalized,
          source,
          config: this._getVisualStylePreset(normalized),
          entry: null
        };
      };

      const tryResolveSpecifier = (specifier, source) => {
        if (specifier == null) {
          return null;
        }
        if (typeof specifier === 'string') {
          const trimmed = specifier.trim();
          if (!trimmed) {
            return null;
          }
          const categoryCandidate = this._normalizeVisualStyleCategory(trimmed);
          if (Object.prototype.hasOwnProperty.call(VISUAL_STYLE_PRESETS, categoryCandidate)) {
            return buildPresetDescriptor(categoryCandidate, source);
          }
          const byHandleEntry = lookupByHandle(trimmed);
          if (byHandleEntry) {
            return buildDescriptorFromEntry(byHandleEntry, source);
          }
          const byNameEntry = lookupByName(trimmed);
          if (byNameEntry) {
            return buildDescriptorFromEntry(byNameEntry, source);
          }
          return null;
        }
        if (typeof specifier === 'object') {
          if (specifier.category) {
            return buildPresetDescriptor(specifier.category, source);
          }
          if (specifier.handle) {
            const entry = lookupByHandle(specifier.handle);
            if (entry) {
              return buildDescriptorFromEntry(entry, source);
            }
          }
          if (specifier.name) {
            const entry = lookupByName(specifier.name);
            if (entry) {
              return buildDescriptorFromEntry(entry, source);
            }
          }
          if (specifier.value) {
            return tryResolveSpecifier(specifier.value, source);
          }
        }
        return null;
      };

      const overrideSpecifier = Object.prototype.hasOwnProperty.call(buildOptions || {}, 'visualStyle')
        ? buildOptions.visualStyle
        : this.visualStyleOverride;
      if (overrideSpecifier) {
        const descriptor = tryResolveSpecifier(overrideSpecifier, 'override');
        if (descriptor) {
          return descriptor;
        }
      }

      const viewport = environmentDescriptor && environmentDescriptor.viewport
        ? environmentDescriptor.viewport
        : null;
      if (viewport && viewport.visualStyleHandle) {
        const descriptor = tryResolveSpecifier({ handle: viewport.visualStyleHandle }, 'viewport');
        if (descriptor) {
          return descriptor;
        }
      }
      if (viewport && viewport.visualStyle) {
        const descriptor = tryResolveSpecifier(viewport.visualStyle, 'viewport');
        if (descriptor) {
          return descriptor;
        }
      }

      const layoutSpecifier = this._resolveLayoutVisualStyle(tables, coordinateResolver);
      if (layoutSpecifier) {
        const descriptor = tryResolveSpecifier(layoutSpecifier, 'layout');
        if (descriptor) {
          return descriptor;
        }
      }

      const fallbackNames = ['2D WIREFRAME', '2DWIREFRAME', 'WIREFRAME', 'SHADED', 'REALISTIC'];
      for (let i = 0; i < fallbackNames.length; i++) {
        const descriptor = tryResolveSpecifier(fallbackNames[i], 'fallback');
        if (descriptor) {
          return descriptor;
        }
      }

      return buildPresetDescriptor('shaded', 'default');
    }

    _resolveLayoutVisualStyle(tables) {
      if (!tables || !tables.layouts) {
        return null;
      }
      const ordered = Array.isArray(tables.layouts.ordered) ? tables.layouts.ordered : [];
      for (let i = 0; i < ordered.length; i++) {
        const layout = ordered[i];
        if (layout && layout.visualStyleHandle) {
          return { handle: layout.visualStyleHandle };
        }
        if (layout && layout.visualStyleName) {
          return { name: layout.visualStyleName };
        }
      }
      return null;
    }

    _getVisualStylePreset(category) {
      const normalized = this._normalizeVisualStyleCategory(category);
      const preset = VISUAL_STYLE_PRESETS[normalized] || VISUAL_STYLE_PRESETS.wireframe;
      return Object.assign({}, preset);
    }

    _applyVisualStyleToEdgeColor(color, styleConfig) {
      const opacity = styleConfig && Number.isFinite(styleConfig.edgeOpacity)
        ? styleConfig.edgeOpacity
        : 1;
      let result = color ? applyAlphaMultiplier(color, opacity) : null;
      if (!result) {
        result = applyAlphaMultiplier(cloneColor(null), opacity);
      }
      const mode = styleConfig && styleConfig.edgeColorMode
        ? styleConfig.edgeColorMode
        : 'inherit';
      if (mode === 'monochrome') {
        const mono = styleConfig && styleConfig.edgeMonochrome
          ? styleConfig.edgeMonochrome
          : { r: 0.78, g: 0.82, b: 0.86 };
        result.r = Math.max(0, Math.min(1, mono.r));
        result.g = Math.max(0, Math.min(1, mono.g));
        result.b = Math.max(0, Math.min(1, mono.b));
        result.css = `rgba(${Math.round(result.r * 255)}, ${Math.round(result.g * 255)}, ${Math.round(result.b * 255)}, ${result.a.toFixed(3)})`;
        return result;
      }
      if (mode === 'desaturate') {
        const amount = Number.isFinite(styleConfig.edgeDesaturate) ? styleConfig.edgeDesaturate : 0.5;
        return desaturateColor(result, amount);
      }
      return result;
    }

    _visualStyleAllowsFill(fillRecord, styleConfig) {
      if (!styleConfig) {
        return true;
      }
      const fillKind = fillRecord && fillRecord.meta ? fillRecord.meta.fillKind : null;
      if (styleConfig.showFaces === false) {
        if (fillKind === 'hatch') {
          return styleConfig.showHatches !== false;
        }
        if (fillKind === 'wipeout') {
          return styleConfig.showWipeouts !== false;
        }
        return false;
      }
      if (fillKind === 'hatch' && styleConfig.showHatches === false) {
        return false;
      }
      if (fillKind === 'wipeout' && styleConfig.showWipeouts === false) {
        return false;
      }
      return true;
    }

    _applyVisualStyleToFill(fillRecord, styleConfig) {
      if (!fillRecord || !styleConfig) {
        return fillRecord;
      }
      const fillKind = fillRecord.meta && fillRecord.meta.fillKind
        ? fillRecord.meta.fillKind
        : null;
      let opacity = Number.isFinite(styleConfig.faceOpacity) ? styleConfig.faceOpacity : 1;
      if (fillKind === 'hatch' && Number.isFinite(styleConfig.hatchOpacity)) {
        opacity = styleConfig.hatchOpacity;
      } else if (fillKind === 'wipeout' && Number.isFinite(styleConfig.wipeoutOpacity)) {
        opacity = styleConfig.wipeoutOpacity;
      }
      if (Number.isFinite(opacity)) {
        const clamped = Math.max(0, Math.min(1, opacity));
        if (fillRecord.color) {
          fillRecord.color = applyAlphaMultiplier(fillRecord.color, clamped);
          fillRecord.colorCss = fillRecord.color.css;
        }
        if (fillRecord.gradient && Array.isArray(fillRecord.gradient.colors)) {
          fillRecord.gradient.colors = fillRecord.gradient.colors.map((stop) => {
            if (!stop || !stop.color) {
              return stop;
            }
            const nextColor = applyAlphaMultiplier(stop.color, clamped);
            return Object.assign({}, stop, { color: nextColor });
          });
        }
      }
      if (!styleConfig.enableMaterials) {
        fillRecord.material = null;
        fillRecord.materialHandle = null;
        fillRecord.materialName = null;
      } else if (!styleConfig.enableTextures && fillRecord.material) {
        fillRecord.hasMaterialTexture = false;
      }
      return fillRecord;
    }

    _normalizeVisualStyleCategory(category) {
      return normalizeVisualStyleCategory(category);
    }

    _resolveEnvironment(sceneGraph, coordinateResolver) {
      const environment = {
        background: null,
        sun: null,
        viewport: null,
        lighting: {
          defaultLightOn: null,
          defaultLightType: null,
          brightness: null,
          contrast: null,
          ambient: null
        },
        source: {
          background: null,
          sun: null
        },
        lights: []
      };
      if (!sceneGraph) {
        return environment;
      }
      const tables = sceneGraph.tables || {};
      const backgrounds = (sceneGraph.environment && sceneGraph.environment.backgrounds)
        || sceneGraph.backgrounds
        || {};
      const suns = (sceneGraph.environment && sceneGraph.environment.suns)
        || sceneGraph.suns
        || {};
      const activeVport = coordinateResolver && typeof coordinateResolver.getActiveVport === 'function'
        ? coordinateResolver.getActiveVport()
        : null;
      environment.viewport = activeVport ? Object.assign({}, activeVport) : null;
      if (activeVport) {
        const backgroundHandle = this._normalizeHandle(activeVport.backgroundHandle || null);
        if (backgroundHandle) {
          const backgroundEntry =
            backgrounds[backgroundHandle]
            || backgrounds[activeVport.backgroundHandle]
            || null;
          if (backgroundEntry) {
            environment.background = this._buildBackgroundDescriptor(backgroundEntry);
            environment.source.background = 'vport';
          }
        }
        const sunHandle = this._normalizeHandle(activeVport.sunHandle || null);
        if (sunHandle) {
          const sunEntry =
            suns[sunHandle]
            || suns[activeVport.sunHandle]
            || null;
          if (sunEntry) {
            environment.sun = Object.assign({}, sunEntry);
            environment.source.sun = 'vport';
          }
        }
        environment.lighting = {
          defaultLightOn: !!activeVport.defaultLightingOn,
          defaultLightType: Number.isFinite(activeVport.defaultLightingType)
            ? activeVport.defaultLightingType
            : null,
          brightness: Number.isFinite(activeVport.brightness) ? activeVport.brightness : null,
          contrast: Number.isFinite(activeVport.contrast) ? activeVport.contrast : null,
          ambient: this._resolveAmbientColor(activeVport)
        };
      }
      if (!environment.background) {
        const fallbackBackground = this._resolveFallbackBackground(tables, backgrounds, activeVport);
        if (fallbackBackground) {
          environment.background = fallbackBackground.descriptor;
          environment.source.background = fallbackBackground.source;
        }
      }
      if (!environment.sun) {
        const fallbackSun = this._resolveFallbackSun(tables, suns, activeVport);
        if (fallbackSun) {
          environment.sun = fallbackSun.entry;
          environment.source.sun = fallbackSun.source;
        }
      }
      return environment;
    }

    _resolveFallbackBackground(tables, backgrounds, activeVport) {
      if (!tables || !tables.layouts || !backgrounds) {
        return null;
      }
      const layouts = tables.layouts;
      const byName = layouts.byName || {};
      const ordered = layouts.ordered || [];
      const preferredNames = [];
      if (activeVport && activeVport.name) {
        const name = String(activeVport.name).trim().toUpperCase();
        if (name.includes('MODEL')) {
          preferredNames.push('MODEL');
        }
        if (name.includes('PAPER')) {
          preferredNames.push('PAPER');
        }
      }
      preferredNames.push('MODEL', 'PAPER');
      for (let i = 0; i < preferredNames.length; i++) {
        const key = preferredNames[i];
        const layout = byName[key];
        if (layout && layout.backgroundHandle) {
          const handle = this._normalizeHandle(layout.backgroundHandle);
          if (handle && backgrounds[handle]) {
            return {
              descriptor: this._buildBackgroundDescriptor(backgrounds[handle]),
              source: `layout:${key}`
            };
          }
        }
      }
      for (let i = 0; i < ordered.length; i++) {
        const layout = ordered[i];
        if (layout && layout.backgroundHandle) {
          const handle = this._normalizeHandle(layout.backgroundHandle);
          if (handle && backgrounds[handle]) {
            return {
              descriptor: this._buildBackgroundDescriptor(backgrounds[handle]),
              source: layout.name ? `layout:${layout.name}` : 'layout'
            };
          }
        }
      }
      return null;
    }

    _resolveFallbackSun(tables, suns, activeVport) {
      if (!tables || !tables.layouts || !suns) {
        return null;
      }
      const layouts = tables.layouts;
      const byName = layouts.byName || {};
      const ordered = layouts.ordered || [];
      const preferredNames = [];
      if (activeVport && activeVport.name) {
        const name = String(activeVport.name).trim().toUpperCase();
        if (name.includes('MODEL')) {
          preferredNames.push('MODEL');
        }
        if (name.includes('PAPER')) {
          preferredNames.push('PAPER');
        }
      }
      preferredNames.push('MODEL', 'PAPER');
      for (let i = 0; i < preferredNames.length; i++) {
        const key = preferredNames[i];
        const layout = byName[key];
        if (layout && layout.sunHandle) {
          const handle = this._normalizeHandle(layout.sunHandle);
          if (handle && suns[handle]) {
            return {
              entry: Object.assign({}, suns[handle]),
              source: `layout:${key}`
            };
          }
        }
      }
      for (let i = 0; i < ordered.length; i++) {
        const layout = ordered[i];
        if (layout && layout.sunHandle) {
          const handle = this._normalizeHandle(layout.sunHandle);
          if (handle && suns[handle]) {
            return {
              entry: Object.assign({}, suns[handle]),
              source: layout.name ? `layout:${layout.name}` : 'layout'
            };
          }
        }
      }
      return null;
    }

    _buildBackgroundDescriptor(entry) {
      if (!entry) {
        return null;
      }
      const descriptor = {
        type: entry.type || 'unknown',
        source: entry,
        css: null,
        solid: null,
        gradient: null,
        stops: null,
        image: entry.image || null,
        sky: entry.sky || null,
        ground: entry.ground || null,
        solidFallback: null
      };
      if (entry.type === 'solid' && entry.solid && entry.solid.color) {
        const colorInfo = entry.solid.color;
        let resolved = null;
        if (colorInfo.trueColor) {
          resolved = this._createColorFromRgb(colorInfo.trueColor, colorInfo.transparency != null ? colorInfo.transparency : 1);
        } else if (Number.isInteger(colorInfo.aci)) {
          resolved = this._createColorFromRgb(this._aciToRgb(colorInfo.aci), colorInfo.transparency != null ? colorInfo.transparency : 1);
        }
        const css = (colorInfo && colorInfo.css) || (resolved && resolved.css) || '#0b1828';
        descriptor.type = 'solid';
        descriptor.solid = {
          color: colorInfo,
          resolved,
          css
        };
        descriptor.css = css;
        descriptor.solidFallback = descriptor.solid;
        return descriptor;
      }
      if (entry.type === 'gradient' && entry.gradient && Array.isArray(entry.gradient.colors) && entry.gradient.colors.length) {
        const stops = entry.gradient.colors.map((stop, index) => {
          const info = stop || {};
          const colorInfo = info.color || {};
          let resolved = null;
          if (colorInfo.trueColor) {
            resolved = this._createColorFromRgb(colorInfo.trueColor, colorInfo.transparency != null ? colorInfo.transparency : 1);
          } else if (Number.isInteger(colorInfo.aci)) {
            resolved = this._createColorFromRgb(this._aciToRgb(colorInfo.aci), colorInfo.transparency != null ? colorInfo.transparency : 1);
          }
          const css = (colorInfo && colorInfo.css) || (resolved && resolved.css) || '#0b1828';
          let position = Number.isFinite(info.position) ? info.position : (
            entry.gradient.colors.length > 1 ? index / (entry.gradient.colors.length - 1) : 0
          );
          position = Math.max(0, Math.min(1, position));
          return {
            color: colorInfo,
            resolved,
            css,
            position
          };
        });
        descriptor.type = 'gradient';
        descriptor.gradient = {
          stops,
          version: entry.gradient.version != null ? entry.gradient.version : null,
          properties: entry.gradient.properties || {}
        };
        descriptor.stops = stops;
        descriptor.solidFallback = stops.length ? stops[0] : null;
        if (stops.length) {
          const gradientCss = stops.map((stop) => `${stop.css} ${(stop.position * 100).toFixed(1)}%`).join(', ');
          descriptor.css = `linear-gradient(180deg, ${gradientCss})`;
        }
        return descriptor;
      }
      if (entry.type === 'image') {
        descriptor.type = 'image';
        if (!descriptor.css && entry.solid && entry.solid.color) {
          const fallback = this._buildBackgroundDescriptor({
            type: 'solid',
            solid: entry.solid
          });
          if (fallback && fallback.css) {
            descriptor.css = fallback.css;
            descriptor.solidFallback = fallback.solid;
          }
        }
        return descriptor;
      }
      if (entry.type === 'sky' || entry.type === 'ground' || entry.type === 'unknown') {
        if (entry.solid && entry.solid.color) {
          const fallback = this._buildBackgroundDescriptor({
            type: 'solid',
            solid: entry.solid
          });
          if (fallback && fallback.css) {
            descriptor.css = fallback.css;
            descriptor.solidFallback = fallback.solid;
          }
        }
        return descriptor;
      }
      return descriptor;
    }

    _resolveAmbientColor(vport) {
      if (!vport) {
        return null;
      }
      if (vport.ambientTrueColor) {
        return this._createColorFromRgb(vport.ambientTrueColor, 1);
      }
      if (Number.isInteger(vport.ambientColorNumber)) {
        return this._createColorFromRgb(this._aciToRgb(vport.ambientColorNumber), 1);
      }
      return null;
    }

    _processHatchEntity({ entity, geometry, transform, updateBounds, fillCollector, color, material, meta }) {
      if (!geometry || !Array.isArray(geometry.loops) || !geometry.loops.length) {
        return;
      }

      const contourSet = this._normalizeHatchContours(geometry);
      if (!contourSet || !contourSet.length) {
        return;
      }

      const worldContours = contourSet.map((contour) => {
        const mappedPoints = transformPoints(contour.points, transform);
        mappedPoints.forEach((pt) => updateBounds(pt.x, pt.y));
        return {
          isHole: contour.isHole,
          points: mappedPoints
        };
      });

      const fillInfo = this._resolveHatchFillInfo(geometry, color);
      const gradientInstance = fillInfo.gradient ? this._createGradientInstance(fillInfo.gradient, transform) : null;
      const allPoints = [];
      worldContours.forEach((contour) => {
        if (Array.isArray(contour.points)) {
          contour.points.forEach((pt) => allPoints.push(pt));
        }
      });
      const fillEntry = {
        type: fillInfo.type,
        color: fillInfo.color,
        gradient: gradientInstance,
        pattern: fillInfo.pattern || null,
        contours: worldContours,
        associative: !!geometry.associative,
        sourceHandles: Array.isArray(geometry.sourceHandles) ? geometry.sourceHandles.slice() : [],
        seedPoints: Array.isArray(geometry.seedPoints) ? geometry.seedPoints.slice() : [],
        material,
        worldBounds: this._computeBoundsFromPoints(allPoints)
      };
      if (meta) {
        fillEntry.meta = meta;
      }

      fillCollector.push(fillEntry);
    }

    _processSolidEntity({ geometry, transform, updateBounds, fillCollector, color, material, meta }) {
      if (!geometry || !fillCollector) {
        return;
      }
      const outline = this._extractSolidOutline(geometry);
      if (!outline || outline.length < 3) {
        return;
      }
      const transformed = transformPoints(outline, transform);
      if (!transformed || transformed.length < 3) {
        return;
      }
      transformed.forEach((pt) => updateBounds(pt.x, pt.y));
      const entry = {
        points: transformed,
        color: cloneColor(color),
        material: material || null,
        worldBounds: this._computeBoundsFromPoints(transformed)
      };
      if (meta) {
        entry.meta = meta;
      }
      fillCollector.push(entry);
    }

    _processWipeoutEntity({ geometry, transform, updateBounds, fillCollector, highlightActive, material, meta }) {
      const maskColor = highlightActive ? this.highlightColor : WIPEOUT_MASK_COLOR;
      this._processSolidEntity({
        geometry,
        transform,
        updateBounds,
        fillCollector,
        color: maskColor,
        material,
        meta
      });
    }

    _normalizeHatchContours(geometry) {
      const loops = geometry.loops || [];
      const contours = [];

      loops.forEach((loop) => {
        let sampled = null;
        if (loop.isPolyline) {
          sampled = this._sampleHatchPolyline(loop);
        } else {
          sampled = this._sampleHatchEdges(loop);
        }
        if (!sampled || sampled.length < 3) {
          return;
        }
        const cleaned = this._sanitizeContour(sampled);
        if (!cleaned || cleaned.length < 3) {
          return;
        }
        let area = this._polygonArea(cleaned);
        if (Math.abs(area) < 1e-6) {
          return;
        }
        let points = cleaned;
        if (loop.isExternal && area < 0) {
          points = cleaned.slice().reverse();
          area = -area;
        } else if (!loop.isExternal && area > 0) {
          points = cleaned.slice().reverse();
          area = -area;
        }
        contours.push({
          points,
          area,
          isHole: area < 0,
          loop
        });
      });

      if (!contours.length) {
        return null;
      }

      const outers = contours.filter((c) => !c.isHole).sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
      const holes = contours.filter((c) => c.isHole);

      outers.forEach((outer) => {
        outer.holes = [];
      });

      holes.forEach((hole) => {
        const outer = outers.find((candidate) => this._pointInPolygon(hole.points[0], candidate.points));
        if (outer) {
          outer.holes.push(hole);
          hole.assigned = true;
        }
      });

      const orderedContours = [];
      outers.forEach((outer) => {
        orderedContours.push({ points: outer.points, isHole: false, loop: outer.loop });
        (outer.holes || []).forEach((hole) => {
          orderedContours.push({ points: hole.points, isHole: true, loop: hole.loop });
        });
      });

      holes.filter((hole) => !hole.assigned).forEach((hole) => {
        orderedContours.push({ points: hole.points, isHole: true, loop: hole.loop });
      });

      return orderedContours;
    }

    _extractSolidOutline(geometry) {
      if (!geometry || !Array.isArray(geometry.vertices)) {
        return null;
      }
      const toPoint = (vertex) => {
        if (!vertex) {
          return null;
        }
        const x = Number.isFinite(vertex.x) ? vertex.x : null;
        const y = Number.isFinite(vertex.y) ? vertex.y : null;
        if (x == null || y == null) {
          return null;
        }
        return { x, y };
      };

      const v1 = toPoint(geometry.vertices[0]);
      const v2 = toPoint(geometry.vertices[1]);
      const v3 = toPoint(geometry.vertices[2]);
      const v4 = toPoint(geometry.vertices[3]);
      if (!v1 || !v2) {
        return null;
      }

      const outline = [];
      const pushUnique = (pt) => {
        if (!pt) return;
        if (!outline.length || !this._pointsApproxEqual(outline[outline.length - 1], pt)) {
          outline.push({ x: pt.x, y: pt.y });
        }
      };

      pushUnique(v1);
      pushUnique(v2);
      if (v4 && (!this._pointsApproxEqual(v2, v4))) {
        pushUnique(v4);
      }
      if (v3) {
        pushUnique(v3);
      }

      if (outline.length < 3) {
        return null;
      }

      if (this._pointsApproxEqual(outline[0], outline[outline.length - 1])) {
        outline.pop();
      }

      return outline;
    }

    _sanitizeContour(points) {
      if (!points || points.length < 2) {
        return null;
      }
      const sanitized = [];
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
          continue;
        }
        if (sanitized.length === 0 || !this._pointsApproxEqual(pt, sanitized[sanitized.length - 1])) {
          sanitized.push({ x: pt.x, y: pt.y });
        }
      }
      if (sanitized.length >= 2 && this._pointsApproxEqual(sanitized[0], sanitized[sanitized.length - 1])) {
        sanitized.pop();
      }
      if (sanitized.length >= 3) {
        sanitized.push({ x: sanitized[0].x, y: sanitized[0].y });
      }
      return sanitized.length >= 3 ? sanitized : null;
    }

    _sampleHatchPolyline(loop) {
      const vertices = Array.isArray(loop.vertices) ? loop.vertices : [];
      if (vertices.length < 2) {
        return null;
      }
      const bulges = Array.isArray(loop.bulges) ? loop.bulges : [];
      const isClosed = loop.isClosed !== false;
      const points = [];
      const count = vertices.length;
      const segmentCount = isClosed ? count : count - 1;

      for (let i = 0; i < segmentCount; i++) {
        const start = vertices[i];
        const end = vertices[(i + 1) % count];
        if (!start || !end) {
          continue;
        }
        if (points.length === 0) {
          points.push({ x: start.x, y: start.y });
        }
        const bulge = bulges[i] || 0;
        if (Math.abs(bulge) > 1e-6) {
          const arcPoints = this._sampleBulgeArc(start, end, bulge);
          arcPoints.forEach((pt) => points.push(pt));
        } else {
          points.push({ x: end.x, y: end.y });
        }
      }

      if (!isClosed) {
        const lastVertex = vertices[count - 1];
        if (!this._pointsApproxEqual(points[points.length - 1], lastVertex)) {
          points.push({ x: lastVertex.x, y: lastVertex.y });
        }
      }

      return points;
    }

    _sampleHatchEdges(loop) {
      const edges = Array.isArray(loop.edges) ? loop.edges : [];
      if (!edges.length) {
        return null;
      }
      const polygon = [];
      let previousEnd = null;

      edges.forEach((edge) => {
        const edgePoints = this._sampleHatchEdge(edge);
        if (!edgePoints || edgePoints.length < 2) {
          return;
        }
        const start = edgePoints[0];
        if (!previousEnd) {
          polygon.push({ x: start.x, y: start.y });
        } else if (!this._pointsApproxEqual(previousEnd, start)) {
          polygon.push({ x: start.x, y: start.y });
        }
        for (let i = 1; i < edgePoints.length; i++) {
          polygon.push({ x: edgePoints[i].x, y: edgePoints[i].y });
        }
        previousEnd = edgePoints[edgePoints.length - 1];
      });

      if (polygon.length >= 3 && !this._pointsApproxEqual(polygon[0], polygon[polygon.length - 1])) {
        polygon.push({ x: polygon[0].x, y: polygon[0].y });
      }

      return polygon.length >= 3 ? polygon : null;
    }

    _sampleHatchEdge(edge) {
      if (!edge || typeof edge.edgeType !== 'number') {
        return null;
      }
      const type = edge.edgeType;
      switch (type) {
        case 1: {
          const start = {
            x: this._edgeValue(edge, 10, 0),
            y: this._edgeValue(edge, 20, 0)
          };
          const end = {
            x: this._edgeValue(edge, 11, start.x),
            y: this._edgeValue(edge, 21, start.y)
          };
          return [start, end];
        }
        case 2: {
          const center = {
            x: this._edgeValue(edge, 10, 0),
            y: this._edgeValue(edge, 20, 0)
          };
          const radius = this._edgeValue(edge, 40, 0);
          let startAngle = this._edgeValue(edge, 50, 0);
          let endAngle = this._edgeValue(edge, 51, startAngle);
          const isCCW = (this._edgeValue(edge, 73, 1) || 0) !== 0;
          if (!Number.isFinite(radius) || radius <= 0) {
            return null;
          }
          let points = this._sampleArc(center, radius, startAngle, endAngle, false);
          if (!points || points.length < 2) {
            return null;
          }
          if (!isCCW) {
            points = points.slice().reverse();
          }
          return points;
        }
        case 3: {
          const center = {
            x: this._edgeValue(edge, 10, 0),
            y: this._edgeValue(edge, 20, 0)
          };
          const major = {
            x: this._edgeValue(edge, 11, 1),
            y: this._edgeValue(edge, 21, 0)
          };
          const ratio = this._edgeValue(edge, 40, 1);
          const startParam = this._edgeValue(edge, 50, 0);
          const endParam = this._edgeValue(edge, 51, startParam);
          const isCCW = (this._edgeValue(edge, 73, 1) || 0) !== 0;
          const ellipsePoints = this._sampleEllipseArc(center, major, ratio, startParam, endParam, isCCW);
          return ellipsePoints;
        }
        case 4: {
          return this._sampleSplineEdge(edge);
        }
        default:
          return null;
      }
    }

    _edgeValues(edge, code) {
      if (!edge || !Array.isArray(edge.codes)) {
        return [];
      }
      return edge.codes
        .filter((entry) => entry.code === code)
        .map((entry) => entry.value);
    }

    _edgeValue(edge, code, fallback = null) {
      const values = this._edgeValues(edge, code);
      return values.length ? values[0] : fallback;
    }

    _sampleBulgeArc(start, end, bulge) {
      if (!start || !end) {
        return [];
      }
      const chordX = end.x - start.x;
      const chordY = end.y - start.y;
      const chordLength = Math.hypot(chordX, chordY);
      if (!Number.isFinite(chordLength) || chordLength < 1e-6) {
        return [{ x: end.x, y: end.y }];
      }
      const bulgeValue = Number(bulge) || 0;
      const angle = 4 * Math.atan(bulgeValue);
      if (!Number.isFinite(angle) || Math.abs(angle) < 1e-6) {
        return [{ x: end.x, y: end.y }];
      }
      const mid = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2
      };
      const normal = {
        x: -chordY / chordLength,
        y: chordX / chordLength
      };
      const sagitta = (bulgeValue * chordLength) / 2;
      const center = {
        x: mid.x + normal.x * sagitta,
        y: mid.y + normal.y * sagitta
      };
      const sagittaAbs = Math.abs(sagitta);
      const radius = sagittaAbs < 1e-6
        ? chordLength / 2
        : (((chordLength * chordLength) / 4) + (sagitta * sagitta)) / (2 * sagittaAbs);
      const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
      const sweep = angle;
      const segments = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
      const points = [];
      for (let i = 1; i <= segments; i++) {
        const t = startAngle + (sweep * (i / segments));
        points.push({
          x: center.x + Math.cos(t) * radius,
          y: center.y + Math.sin(t) * radius
        });
      }
      return points;
    }

    _sampleEllipseArc(center, majorAxis, ratio, startParam, endParam, isCCW) {
      if (!center || !majorAxis) {
        return null;
      }
      const axisLength = Math.hypot(majorAxis.x, majorAxis.y);
      if (!Number.isFinite(axisLength) || axisLength < 1e-6) {
        return null;
      }
      const ux = majorAxis.x / axisLength;
      const uy = majorAxis.y / axisLength;
      const minorRatio = Number.isFinite(ratio) ? ratio : 1;
      const vx = -uy * minorRatio;
      const vy = ux * minorRatio;

      let start = Number.isFinite(startParam) ? startParam : 0;
      let end = Number.isFinite(endParam) ? endParam : start + Math.PI * 2;
      let sweep = end - start;

      if (isCCW) {
        if (sweep <= 0) {
          sweep += Math.PI * 2;
        }
      } else {
        if (sweep >= 0) {
          sweep -= Math.PI * 2;
        }
      }

      const steps = Math.max(16, Math.ceil(Math.abs(sweep) / (Math.PI / 8)));
      const points = [];
      for (let i = 0; i <= steps; i++) {
        const t = start + (sweep * (i / steps));
        const cosT = Math.cos(t);
        const sinT = Math.sin(t);
        points.push({
          x: center.x + cosT * ux * axisLength + sinT * vx * axisLength,
          y: center.y + cosT * uy * axisLength + sinT * vy * axisLength
        });
      }
      return points;
    }

    _sampleSplineEdge(edge) {
      const controlXs = this._edgeValues(edge, 10);
      const controlYs = this._edgeValues(edge, 20);
      const fitXs = this._edgeValues(edge, 11);
      const fitYs = this._edgeValues(edge, 21);
      const points = [];
      if (fitXs.length && fitYs.length) {
        const count = Math.min(fitXs.length, fitYs.length);
        for (let i = 0; i < count; i++) {
          points.push({ x: fitXs[i], y: fitYs[i] });
        }
      } else {
        const count = Math.min(controlXs.length, controlYs.length);
        for (let i = 0; i < count; i++) {
          points.push({ x: controlXs[i], y: controlYs[i] });
        }
      }
      return points.length >= 2 ? points : null;
    }

    _pointsApproxEqual(a, b, epsilon = 1e-6) {
      if (!a || !b) {
        return false;
      }
      return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
    }

    _polygonArea(points) {
      if (!points || points.length < 3) {
        return 0;
      }
      let sum = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        sum += (p1.x * p2.y) - (p2.x * p1.y);
      }
      return sum / 2;
    }

    _pointInPolygon(point, polygon) {
      if (!polygon || polygon.length < 3 || !point) {
        return false;
      }
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;

        const intersect = ((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-12) + xi);
        if (intersect) {
          inside = !inside;
        }
      }
      return inside;
    }

    _pointInTriangle(point, a, b, c) {
      const area = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
      const w1 = area(point, b, c);
      const w2 = area(point, c, a);
      const w3 = area(point, a, b);
      const hasNeg = (w1 < 0) || (w2 < 0) || (w3 < 0);
      const hasPos = (w1 > 0) || (w2 > 0) || (w3 > 0);
      return !(hasNeg && hasPos);
    }

    _isConvexVertex(prev, current, next, isCCW) {
      const cross = (current.x - prev.x) * (next.y - current.y) - (current.y - prev.y) * (next.x - current.x);
      return isCCW ? cross >= 0 : cross <= 0;
    }

    _triangulateSimplePolygon(points) {
      if (!points || points.length < 3) {
        return null;
      }
      const sanitized = points.slice();
      if (this._pointsApproxEqual(sanitized[0], sanitized[sanitized.length - 1])) {
        sanitized.pop();
      }
      if (sanitized.length < 3) {
        return null;
      }

      const isCCW = this._polygonArea(sanitized) > 0;
      const vertexIndices = sanitized.map((_, index) => index);
      const triangles = [];
      let guard = 0;

      while (vertexIndices.length > 2 && guard < 1024) {
        let earClipped = false;
        for (let i = 0; i < vertexIndices.length; i++) {
          const prevIndex = vertexIndices[(i + vertexIndices.length - 1) % vertexIndices.length];
          const currIndex = vertexIndices[i];
          const nextIndex = vertexIndices[(i + 1) % vertexIndices.length];
          const prev = sanitized[prevIndex];
          const curr = sanitized[currIndex];
          const next = sanitized[nextIndex];

          if (!this._isConvexVertex(prev, curr, next, isCCW)) {
            continue;
          }

          let containsPoint = false;
          for (let j = 0; j < vertexIndices.length; j++) {
            const testIndex = vertexIndices[j];
            if (testIndex === prevIndex || testIndex === currIndex || testIndex === nextIndex) {
              continue;
            }
            const testPoint = sanitized[testIndex];
            if (this._pointInTriangle(testPoint, prev, curr, next)) {
              containsPoint = true;
              break;
            }
          }

          if (containsPoint) {
            continue;
          }

          triangles.push(prev.x, prev.y, curr.x, curr.y, next.x, next.y);
          vertexIndices.splice(i, 1);
          earClipped = true;
          break;
        }

        if (!earClipped) {
          break;
        }
        guard += 1;
      }

      return triangles;
    }

    _normalizeRawFillEntry(fill) {
      if (!fill) {
        return null;
      }
      if (fill.contours && Array.isArray(fill.contours) && fill.contours.length) {
        if (!fill.worldBounds) {
          let allPoints = [];
          fill.contours.forEach((contour) => {
            if (Array.isArray(contour.points)) {
              allPoints = allPoints.concat(contour.points);
            }
          });
          fill.worldBounds = this._computeBoundsFromPoints(allPoints);
        }
        return fill;
      }
      if (fill.points && Array.isArray(fill.points) && fill.points.length >= 3) {
        const points = fill.points.map((pt) => ({ x: pt.x, y: pt.y }));
        if (!this._pointsApproxEqual(points[0], points[points.length - 1])) {
          points.push({ x: points[0].x, y: points[0].y });
        }
        const normalized = {
          type: 'solid',
          color: fill.color || null,
          contours: [{ points, isHole: false }],
          associative: false,
          sourceHandles: [],
          material: fill.material || null
        };
        if (fill.meta) {
          normalized.meta = fill.meta;
        }
        normalized.worldBounds = fill.worldBounds || this._computeBoundsFromPoints(points);
        return normalized;
      }
      return null;
    }

    _resolveHatchFillInfo(geometry, baseColor) {
      const base = {
        type: 'solid',
        color: cloneColor(baseColor)
      };
      if (!geometry) {
        return base;
      }

      if (geometry.hasGradient && geometry.gradient) {
        const gradient = this._buildGradientInfo(geometry.gradient);
        if (gradient) {
          return {
            type: 'gradient',
            color: cloneColor(baseColor),
            gradient
          };
        }
      }

      if (!geometry.isSolid) {
        const pattern = this._buildPatternInfo(geometry);
        if (pattern) {
          return {
            type: 'pattern',
            color: cloneColor(baseColor),
            pattern
          };
        }
      }

      return base;
    }

    _createGradientInstance(baseGradient, transform) {
      if (!baseGradient) {
        return null;
      }
      const gradient = {
        name: baseGradient.name || null,
        type: baseGradient.type || 0,
        angle: this._transformGradientAngle(baseGradient.angle, transform),
        shift: Number.isFinite(baseGradient.shift) ? baseGradient.shift : 0,
        tint: Number.isFinite(baseGradient.tint) ? baseGradient.tint : null,
        colors: Array.isArray(baseGradient.colors)
          ? baseGradient.colors.map((stop) => ({
            position: stop.position,
            color: stop.color ? cloneColor(stop.color) : null
          }))
          : []
      };
      return gradient;
    }

    _transformGradientAngle(angle, transform) {
      const baseAngle = Number.isFinite(angle) ? angle : 0;
      if (!transform) {
        return baseAngle;
      }
      const direction = {
        x: Math.cos(baseAngle),
        y: Math.sin(baseAngle)
      };
      const transformed = applyMatrixToVector(transform, direction);
      const magnitude = Math.hypot(transformed.x, transformed.y);
      if (!Number.isFinite(magnitude) || magnitude < 1e-8) {
        return baseAngle;
      }
      return Math.atan2(transformed.y, transformed.x);
    }

    _createMaterialDescriptor(material) {
      if (!material) {
        return null;
      }
      const handle = material.handle || null;
      if (handle && this.materialDescriptorCache.has(handle)) {
        return this.materialDescriptorCache.get(handle);
      }

      const descriptor = {
        handle,
        name: material.name || null,
        diffuse: material.diffuse ? {
          color: this._cloneMaterialColorEntry(material.diffuse),
          factor: Number.isFinite(material.diffuse.factor) ? material.diffuse.factor : null,
          override: !!material.diffuse.override
        } : null,
        ambient: material.ambient ? {
          color: this._cloneMaterialColorEntry(material.ambient),
          factor: Number.isFinite(material.ambient.factor) ? material.ambient.factor : null,
          override: !!material.ambient.override
        } : null,
        specular: material.specular ? {
          color: this._cloneMaterialColorEntry(material.specular),
          factor: Number.isFinite(material.specular.colorFactor) ? material.specular.colorFactor : null,
          gloss: Number.isFinite(material.specular.gloss) ? material.specular.gloss : null,
          override: !!material.specular.override
        } : null,
        opacity: {
          factor: material.opacity && Number.isFinite(material.opacity.factor)
            ? Math.max(0, Math.min(1, material.opacity.factor))
            : null
        },
        selfIllumination: material.selfIllumination ? {
          value: Number.isFinite(material.selfIllumination.value) ? material.selfIllumination.value : 0,
          enabled: !!material.selfIllumination.enabled,
          luminance: Number.isFinite(material.selfIllumination.luminance) ? material.selfIllumination.luminance : null,
          mode: Number.isFinite(material.selfIllumination.mode) ? material.selfIllumination.mode : null
        } : null,
        refraction: material.refraction ? {
          index: Number.isFinite(material.refraction.index) ? material.refraction.index : null,
          translucence: Number.isFinite(material.refraction.translucence) ? material.refraction.translucence : null
        } : null,
        normal: material.normal ? {
          strength: Number.isFinite(material.normal.strength) ? material.normal.strength : null,
          method: Number.isFinite(material.normal.method) ? material.normal.method : null
        } : null,
        reflectivity: Number.isFinite(material.reflectivity) ? material.reflectivity : null,
        reflectanceScale: Number.isFinite(material.reflectanceScale) ? material.reflectanceScale : null,
        transmittanceScale: Number.isFinite(material.transmittanceScale) ? material.transmittanceScale : null,
        colorBleedScale: Number.isFinite(material.colorBleedScale) ? material.colorBleedScale : null,
        indirectBumpScale: Number.isFinite(material.indirectBumpScale) ? material.indirectBumpScale : null,
        globalIlluminationMode: Number.isFinite(material.globalIlluminationMode) ? material.globalIlluminationMode : null,
        finalGatherMode: Number.isFinite(material.finalGatherMode) ? material.finalGatherMode : null,
        illuminationModel: Number.isFinite(material.illuminationModel) ? material.illuminationModel : null,
        channelFlags: Number.isFinite(material.channelFlags) ? material.channelFlags : null,
        isTwoSided: material.isTwoSided === true,
        maps: this._summarizeMaterialMaps(material.maps || {}),
        textureScale: material.textureScale ? Object.assign({}, material.textureScale) : {}
      };

      if (descriptor.opacity && descriptor.opacity.factor == null) {
        descriptor.opacity = null;
      }

      if (descriptor.normal && descriptor.normal.strength == null && descriptor.normal.method == null) {
        descriptor.normal = null;
      }

      if (descriptor.refraction && descriptor.refraction.index == null && descriptor.refraction.translucence == null) {
        descriptor.refraction = null;
      }

      if (handle) {
        this.materialDescriptorCache.set(handle, descriptor);
      }
      return descriptor;
    }

    _cloneMaterialColorEntry(entry) {
      if (!entry || !entry.color) {
        return null;
      }
      const cloned = cloneColor(entry.color);
      return cloned;
    }

    _summarizeMaterialMaps(maps) {
      const summary = {};
      Object.keys(maps || {}).forEach((key) => {
        const map = maps[key];
        if (!map) {
          return;
        }
        const mapSummary = {
          file: map.file || null,
          useImage: map.useImage != null ? !!map.useImage : null,
          blend: Number.isFinite(map.blend) ? map.blend : null,
          projection: Number.isFinite(map.projection) ? map.projection : null,
          tiling: Number.isFinite(map.tiling) ? map.tiling : null,
          autoTransform: Number.isFinite(map.autoTransform) ? map.autoTransform : null
        };
        if (Array.isArray(map.transform) && map.transform.length) {
          mapSummary.transform = map.transform.slice();
        }
        summary[key] = mapSummary;
      });
      return summary;
    }

    _materialHasTexture(descriptor) {
      if (!descriptor || !descriptor.maps) {
        return false;
      }
      return Object.keys(descriptor.maps).some((key) => {
        const map = descriptor.maps[key];
        if (!map) {
          return false;
        }
        return !!(map.file && String(map.file).trim().length);
      });
    }

    _buildGradientInfo(gradientData) {
      if (!gradientData || !Array.isArray(gradientData.colors) || !gradientData.colors.length) {
        return null;
      }
      const colors = [];
      const total = gradientData.colors.length;
      gradientData.colors.forEach((entry, index) => {
        let colorObject = null;
        if (entry.trueColor) {
          colorObject = this._createColorFromRgb(entry.trueColor, entry.transparency ? entry.transparency.alpha ?? 1 : 1);
        } else if (Number.isInteger(entry.aci)) {
          colorObject = this._createColorFromRgb(this._aciToRgb(entry.aci), entry.transparency ? entry.transparency.alpha ?? 1 : 1);
        }
        if (!colorObject) {
          return;
        }
        let position = Number.isFinite(entry.position) ? entry.position : null;
        if (position == null) {
          position = total > 1 ? index / (total - 1) : 0;
        }
        position = Math.min(Math.max(position, 0), 1);
        colors.push({
          color: colorObject,
          position
        });
      });
      if (!colors.length) {
        return null;
      }
      colors.sort((a, b) => a.position - b.position);
      return {
        name: gradientData.name || null,
        type: gradientData.type || 0,
        angle: Number.isFinite(gradientData.angle) ? gradientData.angle : 0,
        shift: Number.isFinite(gradientData.shift) ? gradientData.shift : 0,
        tint: Number.isFinite(gradientData.tint) ? gradientData.tint : null,
        colors
      };
    }

    _buildPatternInfo(geometry) {
      const patternName = geometry.pattern ? String(geometry.pattern).toUpperCase() : null;
      const explicitDefinition = Array.isArray(geometry.patternDefinition) && geometry.patternDefinition.length
        ? geometry.patternDefinition
        : null;
      const fallback = !explicitDefinition ? this._lookupPatternDefinition(patternName) : null;
      const definition = explicitDefinition || fallback;
      if (!definition || !definition.length) {
        return null;
      }
      return {
        name: patternName,
        angle: Number.isFinite(geometry.angle) ? geometry.angle : 0,
        scale: Number.isFinite(geometry.scale) ? geometry.scale : 1,
        double: !!geometry.patternDouble,
        hatchStyle: geometry.hatchStyle ?? 0,
        patternType: geometry.patternType ?? 0,
        definition: definition.map((line) => ({
          angle: Number(line.angle) || 0,
          base: line.base ? { x: Number(line.base.x) || 0, y: Number(line.base.y) || 0 } : { x: 0, y: 0 },
          offset: line.offset ? { x: Number(line.offset.x) || 0, y: Number(line.offset.y) || 0 } : { x: 0, y: 0 },
          dashPattern: Array.isArray(line.dashPattern) ? line.dashPattern.map((value) => Number(value) || 0) : []
        }))
      };
    }

    _lookupPatternDefinition(name) {
      if (!name || !this.hatchPatternLibrary) {
        return null;
      }
      const key = String(name).toUpperCase();
      const entry = this.hatchPatternLibrary[key];
      if (!entry) {
        return null;
      }
      if (typeof entry === 'function') {
        const resolved = entry();
        return Array.isArray(resolved) ? resolved : null;
      }
      if (Array.isArray(entry)) {
        return entry.map((line) => Object.assign({}, line));
      }
      return null;
    }

    _buildDefaultHatchPatternLibrary() {
      return {
        'ANSI31': () => ([
          { angle: 45, base: { x: 0, y: 0 }, offset: { x: 4, y: 4 }, dashPattern: [] }
        ]),
        'ANSI32': () => ([
          { angle: 45, base: { x: 0, y: 0 }, offset: { x: 6, y: 6 }, dashPattern: [3, -3] },
          { angle: 45, base: { x: 0, y: 3 }, offset: { x: 6, y: 6 }, dashPattern: [1, -5] }
        ]),
        'ANSI33': () => ([
          { angle: 45, base: { x: 0, y: 0 }, offset: { x: 8, y: 8 }, dashPattern: [] },
          { angle: 135, base: { x: 0, y: 0 }, offset: { x: 8, y: -8 }, dashPattern: [] }
        ]),
        'ANSI37': () => ([
          { angle: 0, base: { x: 0, y: 0 }, offset: { x: 0, y: 4 }, dashPattern: [] },
          { angle: 90, base: { x: 0, y: 0 }, offset: { x: 4, y: 0 }, dashPattern: [] }
        ]),
        'ANSI38': () => ([
          { angle: 90, base: { x: 0, y: 0 }, offset: { x: 6, y: 0 }, dashPattern: [] },
          { angle: 90, base: { x: 3, y: 0 }, offset: { x: 6, y: 0 }, dashPattern: [3, -3] }
        ])
      };
    }

    _outlineFromBoundingBox(box) {
      if (!box) return null;
      const { minX, minY, maxX, maxY } = box;
      if ([minX, minY, maxX, maxY].some((v) => !Number.isFinite(v))) {
        return null;
      }
      return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
      ];
    }

    _shouldRenderInsert(blockName, blockStack) {
      if (!this.blockIsolation || !this.blockIsolation.size) {
        return true;
      }
      if (blockStack && blockStack.some((name) => this.blockIsolation.has(name))) {
        return true;
      }
      if (!blockName) {
        return false;
      }
      return this.blockIsolation.has(blockName);
    }

    _normalizeLayerState(entry) {
      if (!entry) {
        return {
          name: null,
          isOn: true,
          isFrozen: false,
          isLocked: false,
          transparencyAlpha: null
        };
      }
      let transparencyAlpha = null;
      if (typeof entry.transparencyAlpha === 'number' && !Number.isNaN(entry.transparencyAlpha)) {
        transparencyAlpha = Math.max(0, Math.min(1, entry.transparencyAlpha));
      } else if (entry.transparency && typeof entry.transparency.alpha === 'number') {
        transparencyAlpha = Math.max(0, Math.min(1, entry.transparency.alpha));
      }
      return {
        name: entry.name || null,
        isOn: entry.isOn !== false,
        isFrozen: !!entry.isFrozen,
        isLocked: !!entry.isLocked,
        transparencyAlpha
      };
    }

    _normalizeHandle(handle) {
      if (handle == null) {
        return null;
      }
      const str = typeof handle === 'string' ? handle : String(handle);
      const trimmed = str.trim();
      return trimmed ? trimmed.toUpperCase() : null;
    }

    _getLayerState(layerName) {
      if (!this.layerState || !this.layerState.size) {
        return null;
      }
      if (!layerName) {
        return this.layerState.get('0') || null;
      }
      const key = String(layerName).trim().toUpperCase();
      return this.layerState.get(key) || null;
    }

    _isHandleSelected(handle) {
      if (!handle || !this.selectionHandles || this.selectionHandles.size === 0) {
        return false;
      }
      return this.selectionHandles.has(handle);
    }

    _getEffectiveColor(baseColor, highlightActive, selected) {
      if (selected) {
        return cloneColor(this.selectionColor);
      }
      if (highlightActive) {
        return cloneColor(this.highlightColor);
      }
      return baseColor;
    }

    _queueUnderlay(entity, geometry, transform, updateBounds, fillCollector, textCollector, highlightActive) {
      const position = geometry.position || geometry.insertionPoint || { x: 0, y: 0 };
      const scale = geometry.scale || { x: 1, y: 1 };
      const rotation = (geometry.rotation || 0) * Math.PI / 180;
      const width = geometry.displaySize && Number.isFinite(geometry.displaySize.u) ? geometry.displaySize.u * (scale.x || 1) : (scale.x || 1);
      const height = geometry.displaySize && Number.isFinite(geometry.displaySize.v) ? geometry.displaySize.v * (scale.y || 1) : (scale.y || 1);

      const corners = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height }
      ].map((pt) => {
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const rotated = {
          x: pt.x * cos - pt.y * sin,
          y: pt.x * sin + pt.y * cos
        };
        return {
          x: rotated.x + position.x,
          y: rotated.y + position.y
        };
      });

      const transformed = transformPoints(corners, transform);
      transformed.forEach((pt) => updateBounds(pt.x, pt.y));
      const overlayColor = highlightActive ? cloneColor(this.highlightColor) : { r: 0.2, g: 0.2, b: 0.2, a: 0.1, css: 'rgba(80,80,80,0.1)' };
      fillCollector.push({ points: transformed.concat([transformed[0]]), color: overlayColor });

      if (!geometry.isOn) {
        textCollector.push({
          content: `${geometry.underlayType || 'UNDERLAY'} (off)`,
          worldPosition: applyMatrix(transform, { x: position.x + width * 0.5, y: position.y + height * 0.5 }),
          rotation: matrixRotation(transform),
          height: Math.max(width, height) * 0.1,
          color: overlayColor
        });
      }
    }

    _queueViewport(entity, geometry, transform, updateBounds, polyCollector, fillCollector, textCollector, color) {
      if (geometry.status === 0) {
        return;
      }

      let ll = geometry.lowerLeft;
      let ur = geometry.upperRight;
      if (!ll || !ur) {
        const viewHeight = geometry.viewHeight || 10;
        const aspect = geometry.aspectRatio && geometry.aspectRatio > 0 ? geometry.aspectRatio : 1;
        const halfWidth = (viewHeight * aspect) / 2;
        const halfHeight = viewHeight / 2;
        const center = geometry.viewCenter || { x: 0, y: 0 };
        ll = { x: center.x - halfWidth, y: center.y - halfHeight };
        ur = { x: center.x + halfWidth, y: center.y + halfHeight };
      }

      const lr = { x: ur.x, y: ll.y };
      const ul = { x: ll.x, y: ur.y };
      const points = [ll, lr, ur, ul];

      const transformed = transformPoints(points, transform);
      transformed.forEach((pt) => updateBounds(pt.x, pt.y));

      fillCollector.push({
        points: transformed.concat([transformed[0]]),
        color: { r: 0.12, g: 0.16, b: 0.22, a: 0.08, css: 'rgba(30,40,56,0.08)' }
      });

      polyCollector.push({
        points: transformed.concat([transformed[0]]),
        color,
        weight: Math.max(0.8, this._lineweightToPx(entity.lineweight))
      });

      const labelPoint = {
        x: (ll.x + ur.x) / 2,
        y: ur.y + (ur.y - ll.y) * 0.05
      };
      const labelWorld = applyMatrix(transform, labelPoint);
      textCollector.push({
        content: `Viewport ${entity.handle || ''}`.trim(),
        worldPosition: labelWorld,
        rotation: matrixRotation(transform),
        height: Math.max(ur.y - ll.y, ur.x - ll.x) * 0.12,
        color
      });
    }

    _outlineFromBoundingBox(box) {
      if (!box) return null;
      const { minX, minY, maxX, maxY } = box;
      if ([minX, minY, maxX, maxY].some((v) => !Number.isFinite(v))) {
        return null;
      }
      return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
      ];
    }

    _addDimensionGeometry(entity, geometry, transform, updateBounds, polylineCollector, textCollector, color, metaFactory) {
      const createPolylineMeta = (overrides) => {
        if (typeof metaFactory !== 'function') {
          return null;
        }
        return metaFactory(Object.assign({ geometryKind: 'polyline' }, overrides || {}));
      };
      const createTextMeta = (overrides) => {
        if (typeof metaFactory !== 'function') {
          return null;
        }
        return metaFactory(Object.assign({ geometryKind: 'text' }, overrides || {}));
      };
      const addLine = (start, end, weight = 1, part = 'segment') => {
        if (!start || !end) return;
        const transformed = transformPoints([start, end], transform);
        transformed.forEach((pt) => updateBounds(pt.x, pt.y));
        polylineCollector.push({
          points: transformed,
          color,
          lineweight: entity.lineweight,
          weight,
          worldBounds: this._computeBoundsFromPoints(transformed),
          meta: createPolylineMeta({ dimensionPart: part })
        });
      };

      const addPolyline = (points, weight = 1, part = 'polyline') => {
        if (!points || points.length < 2) {
          return;
        }
        const transformed = transformPoints(points, transform);
        transformed.forEach((pt) => updateBounds(pt.x, pt.y));
        polylineCollector.push({
          points: transformed,
          color,
          lineweight: entity.lineweight,
          weight,
          worldBounds: this._computeBoundsFromPoints(transformed),
          meta: createPolylineMeta({ dimensionPart: part })
        });
      };

      if (!geometry) {
        return;
      }

      const definitionPoint = geometry.definitionPoint;
      const dimensionLinePoint = geometry.dimensionLinePoint;
      const textPoint = geometry.textPoint;
      const arrow1 = geometry.arrow1Point;
      const arrow2 = geometry.arrow2Point;
      const extension1 = geometry.extensionLine1Point;
      const extension2 = geometry.extensionLine2Point;
      const weight = this._lineweightToPx(entity.lineweight);
      const baseLabelHeight = geometry.textHeight || geometry.height || geometry.measurement || 3;
      const type = geometry.dimensionType & 7;
      const baseStyleName = entity.textStyle ||
        (entity.resolved && entity.resolved.textStyle ? entity.resolved.textStyle.name : (geometry.textStyle || null));
      const label = this._formatDimensionLabel(geometry);
      const arrowScale = Math.max(baseLabelHeight * 0.8, 3);
      const center = geometry.dimensionLinePoint || geometry.definitionPoint || null;

      switch (type) {
        case 0: // rotated / linear
        case 1: { // aligned
          addLine(definitionPoint, dimensionLinePoint, weight, 'dimensionLine');
          if (extension1 && definitionPoint) {
            addLine(extension1, definitionPoint, weight * 0.8, 'extensionLine1');
          }
          if (extension2 && dimensionLinePoint) {
            addLine(extension2, dimensionLinePoint, weight * 0.8, 'extensionLine2');
          }
          if (arrow1 && (dimensionLinePoint || definitionPoint)) {
            this._addDimensionArrowHead(
              arrow1,
              dimensionLinePoint || definitionPoint,
              arrowScale,
              transform,
              updateBounds,
              polylineCollector,
              color,
              weight,
              metaFactory,
              entity.lineweight
            );
          }
          if (arrow2 && (definitionPoint || dimensionLinePoint)) {
            this._addDimensionArrowHead(
              arrow2,
              definitionPoint || dimensionLinePoint,
              arrowScale,
              transform,
              updateBounds,
              polylineCollector,
              color,
              weight,
              metaFactory,
              entity.lineweight
            );
          }
          break;
        }
        case 2: // angular
        case 5: { // angular 3pt
          if (extension1 && arrow1) {
            addLine(extension1, arrow1, weight * 0.85);
          }
          if (extension2 && arrow2) {
            addLine(extension2, arrow2, weight * 0.85);
          }

          const arcPoints = [];
          if (arrow1) arcPoints.push(arrow1);
          if (geometry.arcDefinitionPoints && geometry.arcDefinitionPoints.length) {
            geometry.arcDefinitionPoints.forEach((pt) => arcPoints.push(pt));
          } else if (center) {
            arcPoints.push(center);
          }
          if (arrow2) arcPoints.push(arrow2);
          if (arcPoints.length >= 2) {
            addPolyline(arcPoints, weight, 'dimensionArc');
          }

          if (center && arrow1) {
            this._addDimensionArrowHead(
              arrow1,
              center,
              arrowScale,
              transform,
              updateBounds,
              polylineCollector,
              color,
              weight,
              metaFactory,
              entity.lineweight
            );
          }
          if (center && arrow2) {
            this._addDimensionArrowHead(
              arrow2,
              center,
              arrowScale,
              transform,
              updateBounds,
              polylineCollector,
              color,
              weight,
              metaFactory,
              entity.lineweight
            );
          }
          break;
        }
        case 3: { // diameter
          if (arrow1 && arrow2) {
            addLine(arrow1, arrow2, weight, 'diameter');
          } else if (definitionPoint && dimensionLinePoint) {
            addLine(definitionPoint, dimensionLinePoint, weight, 'dimensionLine');
          }
          if (center && arrow1) {
            addLine(center, arrow1, weight * 0.8, 'radius');
            this._addDimensionArrowHead(
              arrow1,
              center,
              arrowScale,
              transform,
              updateBounds,
              polylineCollector,
              color,
              weight,
              metaFactory,
              entity.lineweight
            );
          }
          if (center && arrow2) {
            addLine(center, arrow2, weight * 0.8, 'radius');
            this._addDimensionArrowHead(
              arrow2,
              center,
              arrowScale,
              transform,
              updateBounds,
              polylineCollector,
              color,
              weight,
              metaFactory,
              entity.lineweight
            );
          }
          break;
        }
        case 4: { // radius
          const tip = arrow1 || arrow2 || dimensionLinePoint;
          const origin = definitionPoint || dimensionLinePoint;
          if (origin && tip) {
            addLine(origin, tip, weight, 'radius');
            this._addDimensionArrowHead(
              tip,
              origin,
              arrowScale,
              transform,
              updateBounds,
              polylineCollector,
              color,
              weight,
              metaFactory,
              entity.lineweight
            );
          }
          if (geometry.arcDefinitionPoints && geometry.arcDefinitionPoints.length >= 2) {
            addPolyline(geometry.arcDefinitionPoints, weight * 0.8, 'arc');
          }
          break;
        }
        case 6: { // ordinate
          const origin = definitionPoint;
          const leader = dimensionLinePoint || textPoint || arrow1;
          if (origin && leader) {
            addLine(origin, leader, weight, 'ordinate');
            if (arrow1) {
              addLine(leader, arrow1, weight, 'ordinate');
              this._addDimensionArrowHead(
                arrow1,
                origin,
                arrowScale,
                transform,
                updateBounds,
                polylineCollector,
                color,
                weight,
                metaFactory,
                entity.lineweight
              );
            } else {
              this._addDimensionArrowHead(
                leader,
                origin,
                arrowScale,
                transform,
                updateBounds,
                polylineCollector,
                color,
                weight,
                metaFactory,
                entity.lineweight
              );
            }
          }
          break;
        }
        default:
          break;
      }

      const textAnchor = textPoint || dimensionLinePoint || definitionPoint || center;
      if (label && textAnchor) {
        const position = applyMatrix(transform, textAnchor);
        updateBounds(position.x, position.y);
        const scale = matrixScale(transform);
        const avgScale = ((Math.abs(scale.sx) + Math.abs(scale.sy)) / 2) || 1;
        const rotationBase = this._resolveDimensionTextRotation(geometry) + ((geometry.obliqueAngle || 0) * Math.PI / 180);
        const rotation = matrixRotation(transform) + rotationBase;
        const worldHeight = baseLabelHeight * avgScale;
        textCollector.push({
          kind: 'TEXT',
          entity,
          geometry,
          styleName: baseStyleName,
          content: label,
          worldPosition: position,
          rotation,
          worldHeight,
          baseHeight: baseLabelHeight,
          scaleMagnitude: avgScale,
          color,
          meta: createTextMeta({ textKind: 'DIMENSION_LABEL', dimensionPart: 'label' })
        });
      }
    }

    _addMeshGeometry(entity, geometry, transform, updateBounds, polylineCollector, fillCollector, color, material, makeMeta) {
      if (!geometry) {
        return;
      }
      if (this.tessellator) {
        const tessellated = this.tessellator.tessellateMesh(geometry);
        if (tessellated && Array.isArray(tessellated.triangles) && tessellated.triangles.length) {
          tessellated.triangles.forEach((triangle) => {
            const transformed = transformPoints(triangle, transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            const data = this._pointsToFloatArray(transformed);
            if (data.length >= 6) {
              fillCollector.push({
                triangles: new Float32Array(data),
                color,
                material: material || null,
                meta: makeMeta ? makeMeta({ geometryKind: 'fill', fillKind: 'mesh' }) : null
              });
            }
          });
          if (Array.isArray(tessellated.outlines)) {
            tessellated.outlines.forEach((outline) => {
              if (!outline || outline.length < 2) return;
              const transformed = transformPoints(outline, transform);
              transformed.forEach((pt) => updateBounds(pt.x, pt.y));
              polylineCollector.push({
                points: transformed,
                color,
                lineweight: this._resolveLineweight(entity),
                worldBounds: this._computeBoundsFromPoints(transformed),
                meta: makeMeta ? makeMeta({ geometryKind: 'polyline', isClosed: this._pointsApproxEqual(transformed[0], transformed[transformed.length - 1]), family: 'mesh-outline' }) : null
              });
            });
          }
          return;
        }
      }

      if (!geometry.vertices || geometry.vertices.length === 0) return;
      const vertices = geometry.vertices.map((v) => applyMatrix(transform, { x: v.position.x, y: v.position.y }));
      vertices.forEach((pt) => updateBounds(pt.x, pt.y));
      if (geometry.faces && geometry.faces.length) {
        geometry.faces.forEach((face) => {
          const indices = face.indices || [];
          if (indices.length < 3) return;
          const facePts = indices.map((idx) => {
            const vertex = vertices[Math.abs(idx) - 1];
            return vertex ? { x: vertex.x, y: vertex.y } : null;
          }).filter(Boolean);
          if (facePts.length < 3) return;
          const triangles = triangulateFan(facePts);
          triangles.forEach((triangle) => {
            const floatVerts = new Float32Array(triangle.length * 2);
            triangle.forEach((pt, idx) => {
              floatVerts[idx * 2] = pt.x;
              floatVerts[idx * 2 + 1] = pt.y;
            });
            fillCollector.push({ triangles: floatVerts, color, material: material || null });
          });
        });
      } else {
        for (let i = 0; i < vertices.length - 1; i++) {
          polylineCollector.push({
            points: [vertices[i], vertices[i + 1]],
            color,
            weight: this._lineweightToPx(entity.lineweight)
          });
        }
      }
    }

    _addSolidGeometry(entity, geometry, transform, updateBounds, polylineCollector, fillCollector, color, material, makeMeta) {
      if (!geometry) {
        return;
      }
      const lineweight = this._resolveLineweight(entity);
      if (this.tessellator) {
        const tessellated = this.tessellator.tessellateSolid(geometry);
        if (tessellated && Array.isArray(tessellated.triangles) && tessellated.triangles.length) {
          tessellated.triangles.forEach((triangle) => {
            const transformed = transformPoints(triangle, transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            const data = this._pointsToFloatArray(transformed);
            if (data.length >= 6) {
              fillCollector.push({
                triangles: new Float32Array(data),
                color,
                material: material || null,
                meta: makeMeta ? makeMeta({ geometryKind: 'fill', fillKind: 'solid' }) : null
              });
            }
          });
          if (Array.isArray(tessellated.outlines)) {
            tessellated.outlines.forEach((outline) => {
              if (!outline || outline.length < 2) return;
              const transformed = transformPoints(outline, transform);
              transformed.forEach((pt) => updateBounds(pt.x, pt.y));
              polylineCollector.push({
                points: transformed,
                color,
                lineweight,
                worldBounds: this._computeBoundsFromPoints(transformed),
                meta: makeMeta ? makeMeta({ geometryKind: 'polyline', isClosed: true, family: 'solid-outline' }) : null
              });
            });
          }
          return;
        }
      }

      let outline = null;
      if (geometry.outline2D && geometry.outline2D.length >= 3) {
        outline = geometry.outline2D.map((pt) => ({ x: pt.x, y: pt.y }));
      } else if (geometry.boundingBox) {
        outline = this._outlineFromBoundingBox(geometry.boundingBox);
      }
      if (outline && outline.length >= 3) {
        const triangles = this._trianglesFromOutline(outline);
        if (triangles.length) {
          triangles.forEach((triangle) => {
            const transformed = transformPoints(triangle, transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            const data = this._pointsToFloatArray(transformed);
            if (data.length >= 6) {
              fillCollector.push({
                triangles: new Float32Array(data),
                color,
                material: material || null,
                meta: makeMeta ? makeMeta({ geometryKind: 'fill', fillKind: 'solid' }) : null
              });
            }
          });
        } else {
          const transformed = transformPoints(outline, transform);
          transformed.forEach((pt) => updateBounds(pt.x, pt.y));
          const closed = this._ensureClosedPolyline(transformed);
          fillCollector.push({ points: closed, color, material: material || null });
        }
        const transformedOutline = transformPoints(outline, transform);
        transformedOutline.forEach((pt) => updateBounds(pt.x, pt.y));
        polylineCollector.push({
          points: transformedOutline,
          color,
          lineweight,
          worldBounds: this._computeBoundsFromPoints(transformedOutline),
          meta: makeMeta ? makeMeta({ geometryKind: 'polyline', isClosed: true, family: 'solid-outline' }) : null
        });
      }
    }

    _addPolysolidGeometry(entity, geometry, transform, updateBounds, polylineCollector, fillCollector, color, material, makeMeta) {
      if (!geometry || !geometry.points || geometry.points.length < 2) {
        return;
      }
      const lineweight = this._resolveLineweight(entity);
      if (this.tessellator && typeof this.tessellator.tessellatePolysolid === 'function') {
        const tessellated = this.tessellator.tessellatePolysolid(geometry);
        if (tessellated) {
          if (Array.isArray(tessellated.triangles)) {
            tessellated.triangles.forEach((triangle) => {
              const transformed = transformPoints(triangle, transform);
              transformed.forEach((pt) => updateBounds(pt.x, pt.y));
              const data = this._pointsToFloatArray(transformed);
              if (data.length >= 6) {
                fillCollector.push({
                  triangles: new Float32Array(data),
                  color,
                  material: material || null,
                  meta: makeMeta ? makeMeta({ geometryKind: 'fill', fillKind: 'polysolid' }) : null
                });
              }
            });
          }
          if (Array.isArray(tessellated.outlines)) {
            tessellated.outlines.forEach((outline) => {
              if (!outline || outline.length < 2) return;
              const transformed = transformPoints(outline, transform);
              transformed.forEach((pt) => updateBounds(pt.x, pt.y));
              polylineCollector.push({
                points: transformed,
                color,
                lineweight,
                worldBounds: this._computeBoundsFromPoints(transformed),
                meta: makeMeta ? makeMeta({ geometryKind: 'polyline', isClosed: true, family: 'polysolid-outline' }) : null
              });
            });
          }
          return;
        }
      }

      const verts = geometry.points.map((pt) => ({
        x: Number.isFinite(pt.x) ? pt.x : 0,
        y: Number.isFinite(pt.y) ? pt.y : 0
      }));
      const transformed = transformPoints(verts, transform);
      transformed.forEach((pt) => updateBounds(pt.x, pt.y));
      const isClosed = !!geometry.isClosed && transformed.length > 2;
      if (isClosed && !this._pointsApproxEqual(transformed[0], transformed[transformed.length - 1])) {
        transformed.push({ x: transformed[0].x, y: transformed[0].y });
      }
      polylineCollector.push({
        points: transformed,
        color,
        lineweight,
        worldBounds: this._computeBoundsFromPoints(transformed),
        meta: makeMeta ? makeMeta({ geometryKind: 'polyline', isClosed, family: 'polysolid' }) : null
      });
    }

    _addSectionCutGeometry({ entity, geometry, transform, updateBounds, polylineCollector, fillCollector, color, material, makeMeta, tables }) {
      if (!geometry) {
        return;
      }

      const sectionColor = color || cloneColor(null);
      const sectionStyle = this._resolveSectionStyle(entity, sectionColor);
      const showHatch = sectionStyle.cutHatchEnabled !== false;
      const showBendLines = sectionStyle.bendLinesEnabled !== false;
      const lineweight = this._resolveLineweight(entity);
      const linetype = this._resolveLinetype(entity, tables);
      const boundary3d = Array.isArray(geometry.boundary) ? geometry.boundary : null;
      const boundary2d = boundary3d
        ? boundary3d.map((pt) => ({
            x: Number.isFinite(pt.x) ? pt.x : 0,
            y: Number.isFinite(pt.y) ? pt.y : 0
          }))
        : null;

      const sectionObject = entity && entity.resolved ? entity.resolved.sectionObject : null;
      const sectionGeometryRecord = entity && entity.resolved ? entity.resolved.sectionGeometry : null;
      const detailViewObject = entity && entity.resolved ? entity.resolved.detailViewObject : null;
      const normalizeHandle = (value) => this._normalizeHandle(value);

      const sourceHandles = [];
      const pushHandle = (value) => {
        const normalized = normalizeHandle(value);
        if (normalized && !sourceHandles.includes(normalized)) {
          sourceHandles.push(normalized);
        }
      };
      pushHandle(entity && entity.handle);
      pushHandle(geometry && geometry.sectionGeometryHandle);
      pushHandle(geometry && geometry.sectionObjectHandle);
      pushHandle(geometry && geometry.detailViewHandle);
      pushHandle(sectionGeometryRecord && (sectionGeometryRecord.handleUpper || sectionGeometryRecord.handle));
      pushHandle(sectionObject && (sectionObject.handleUpper || sectionObject.handle));
      pushHandle(detailViewObject && (detailViewObject.handleUpper || detailViewObject.handle));

      const sectionHandle = normalizeHandle(geometry && geometry.sectionObjectHandle
        ? geometry.sectionObjectHandle
        : (sectionObject && (sectionObject.handleUpper || sectionObject.handle)));
      const sectionGeometryHandle = normalizeHandle(geometry && geometry.sectionGeometryHandle
        ? geometry.sectionGeometryHandle
        : (sectionGeometryRecord && (sectionGeometryRecord.handleUpper || sectionGeometryRecord.handle)));
      const detailHandle = normalizeHandle(geometry && geometry.detailViewHandle
        ? geometry.detailViewHandle
        : (detailViewObject && (detailViewObject.handleUpper || detailViewObject.handle)));
      const sectionName = geometry && geometry.name ? geometry.name : (sectionObject && sectionObject.name) || null;
      const sectionDescription = sectionObject && sectionObject.description ? sectionObject.description : null;
      const isAssociative = sourceHandles.length > 0;

      let sectionAssociation = null;
      if (isAssociative) {
        sectionAssociation = {
          sectionHandle,
          geometryHandle: sectionGeometryHandle,
          detailHandle,
          name: sectionName,
          description: sectionDescription,
          sectionType: sectionObject && Number.isFinite(sectionObject.sectionType) ? sectionObject.sectionType : null,
          state: sectionObject && Number.isFinite(sectionObject.state) ? sectionObject.state : null,
          liveSection: !!geometry.liveSection,
          parameters: sectionObject ? sectionObject.parameters || null : null,
          sourceHandles: sourceHandles.slice()
        };
      }
      const cloneAssociation = () => {
        if (!sectionAssociation) {
          return null;
        }
        const copy = Object.assign({}, sectionAssociation);
        if (Array.isArray(sectionAssociation.sourceHandles)) {
          copy.sourceHandles = sectionAssociation.sourceHandles.slice();
        }
        if (Array.isArray(sectionAssociation.boundary)) {
          copy.boundary = sectionAssociation.boundary.map((pt) => ({ x: pt.x, y: pt.y }));
        }
        if (sectionAssociation.worldBounds) {
          copy.worldBounds = Object.assign({}, sectionAssociation.worldBounds);
        }
        return copy;
      };

      const triangleList = [];
      const addTriangle = (pts) => {
        if (!Array.isArray(pts) || pts.length < 3) {
          return;
        }
        const transformed = transformPoints(pts, transform);
        transformed.forEach((pt) => updateBounds(pt.x, pt.y));
        triangleList.push(transformed);
      };

      let transformedBoundary = null;
      let boundaryPoints = null;
      let boundaryContours = null;
      let boundaryBounds = null;
      if (boundary2d && boundary2d.length >= 3) {
        if (this.tessellator) {
          const tessellated = this.tessellator.tessellateSolid({ outline2D: boundary2d });
          if (tessellated && Array.isArray(tessellated.triangles)) {
            tessellated.triangles.forEach(addTriangle);
          }
          if (!transformedBoundary && tessellated && Array.isArray(tessellated.outlines) && tessellated.outlines.length) {
            const outline = tessellated.outlines[0];
            transformedBoundary = transformPoints(outline, transform);
            transformedBoundary.forEach((pt) => updateBounds(pt.x, pt.y));
          }
        }
        if (!triangleList.length) {
          const fallbackTriangles = this._trianglesFromOutline(boundary2d);
          fallbackTriangles.forEach(addTriangle);
        }
        if (!transformedBoundary) {
          transformedBoundary = transformPoints(boundary2d, transform);
          transformedBoundary.forEach((pt) => updateBounds(pt.x, pt.y));
        }
        if (transformedBoundary && transformedBoundary.length) {
          boundaryPoints = transformedBoundary.map((pt) => ({ x: pt.x, y: pt.y }));
          boundaryBounds = this._computeBoundsFromPoints(boundaryPoints);
          boundaryContours = [{ isHole: false, points: boundaryPoints }];
          if (sectionAssociation) {
            sectionAssociation.boundary = boundaryPoints.map((pt) => ({ x: pt.x, y: pt.y }));
            sectionAssociation.worldBounds = boundaryBounds ? Object.assign({}, boundaryBounds) : null;
          }
          polylineCollector.push({
            points: transformedBoundary,
            color: sectionColor,
            lineweight,
            linetype,
            worldBounds: boundaryBounds ? Object.assign({}, boundaryBounds) : null,
            meta: makeMeta
              ? makeMeta({
                  geometryKind: 'polyline',
                  isClosed: true,
                  family: 'section-boundary',
                  sectionStyle: sectionStyle.meta,
                  sectionAssociation: cloneAssociation()
                })
              : null
          });
        }
      }

      const baseFillColor = sectionStyle.backgroundFillEnabled
        ? (sectionStyle.backgroundColor ||
            this._adjustColorAlpha(sectionStyle.cutFillColor || sectionColor, 0.45, 0.25))
        : (sectionStyle.cutFillColor || this._adjustColorAlpha(sectionColor, 0.45, 0.25));
      const fillKind = sectionStyle.backgroundFillEnabled ? 'section-background' : 'section';
      const cloneContours = () => {
        if (!boundaryContours) {
          return null;
        }
        return boundaryContours.map((contour) => ({
          isHole: !!contour.isHole,
          points: contour.points.map((pt) => ({ x: pt.x, y: pt.y }))
        }));
      };
      const createFillEntry = (extras) => {
        const entry = Object.assign({
          color: baseFillColor,
          material: material || null,
          sourceHandles: sourceHandles.slice(),
          associative: isAssociative,
          sectionAssociation: cloneAssociation()
        }, extras || {});
        if (boundaryContours) {
          entry.contours = cloneContours();
          entry.worldBounds = boundaryBounds ? Object.assign({}, boundaryBounds) : null;
        }
        if (makeMeta) {
          entry.meta = makeMeta({
            geometryKind: 'fill',
            fillKind,
            sectionStyle: sectionStyle.meta,
            sectionAssociation: cloneAssociation()
          });
        }
        return entry;
      };

      if (triangleList.length && baseFillColor) {
        const flattened = [];
        triangleList.forEach((triangle) => {
          triangle.forEach((pt) => {
            flattened.push(pt.x, pt.y);
          });
        });
        if (flattened.length >= 6) {
          fillCollector.push(createFillEntry({
            triangles: new Float32Array(flattened)
          }));
        }
      } else if (!triangleList.length && transformedBoundary && transformedBoundary.length >= 3 && baseFillColor) {
        const closed = this._ensureClosedPolyline(transformedBoundary);
        fillCollector.push(createFillEntry({
          points: closed
        }));
      }

      if (showHatch && triangleList.length) {
        const hatchStrokeColor = sectionStyle.hatchColor || this._adjustColorAlpha(sectionColor, 0.8, 0.4);
        triangleList.forEach((triangle, index) => {
          const p0 = triangle[0];
          const p1 = triangle[1];
          const p2 = triangle[2];
          const area = Math.abs(((p1.x - p0.x) * (p2.y - p0.y)) - ((p2.x - p0.x) * (p1.y - p0.y))) * 0.5;
          if (!Number.isFinite(area) || area < 1e-6) {
            return;
          }
          const mid01 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
          const mid12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          const hatchSegment = [mid01, mid12];
          const transformedSegment = transformPoints(hatchSegment, transform);
          transformedSegment.forEach((pt) => updateBounds(pt.x, pt.y));
          polylineCollector.push({
            points: transformedSegment,
            color: hatchStrokeColor,
            lineweight: Math.max(0.4, this._lineweightToPx(entity.lineweight) * 0.4),
            worldBounds: this._computeBoundsFromPoints(transformedSegment),
            meta: makeMeta
              ? makeMeta({
                  geometryKind: 'polyline',
                  family: 'section-hatch',
                  segmentIndex: index,
                  sectionStyle: Object.assign({}, sectionStyle.meta, {
                    hatchPattern: sectionStyle.hatchPattern,
                    hatchAngle: sectionStyle.hatchAngle,
                    hatchScale: sectionStyle.hatchScale
                  }),
                  sectionAssociation: cloneAssociation()
                })
              : null
          });
        });
      }

      const depthValue = this._resolveSectionDepth(entity);
      if (
        showBendLines &&
        transformedBoundary &&
        transformedBoundary.length &&
        depthValue != null &&
        Math.abs(depthValue) > 1e-6 &&
        boundary3d &&
        boundary3d.length >= 3
      ) {
        const viewDir = geometry.viewDirection || {};
        let offset = { x: 0, y: -depthValue };
        const len = Math.hypot(Number(viewDir.x) || 0, Number(viewDir.y) || 0);
        if (len > 1e-6) {
          offset = {
            x: (viewDir.x / len) * depthValue,
            y: (viewDir.y / len) * depthValue
          };
        }
        const depthBoundary = boundary3d.map((pt) => ({
          x: (Number.isFinite(pt.x) ? pt.x : 0) + offset.x,
          y: (Number.isFinite(pt.y) ? pt.y : 0) + offset.y
        }));
        const transformedDepth = transformPoints(depthBoundary, transform);
        transformedDepth.forEach((pt) => updateBounds(pt.x, pt.y));
        const bendColor = sectionStyle.hatchColor || this._adjustColorAlpha(sectionColor, 0.85, 0.5);
        polylineCollector.push({
          points: transformedDepth,
          color: bendColor,
          lineweight,
          linetype,
          worldBounds: this._computeBoundsFromPoints(transformedDepth),
          meta: makeMeta
            ? makeMeta({
                geometryKind: 'polyline',
                isClosed: true,
                family: 'section-depth',
                sectionStyle: sectionStyle.meta,
                sectionAssociation: cloneAssociation()
              })
            : null
        });

        const connectorStep = Math.max(1, Math.floor(transformedBoundary.length / 8));
        for (let i = 0; i < transformedBoundary.length && i < transformedDepth.length; i += connectorStep) {
          const connector = [transformedBoundary[i], transformedDepth[Math.min(i, transformedDepth.length - 1)]];
          polylineCollector.push({
            points: connector,
            color: this._adjustColorAlpha(bendColor, 0.85, 0.45),
            lineweight: Math.max(0.4, this._lineweightToPx(entity.lineweight) * 0.5),
            worldBounds: this._computeBoundsFromPoints(connector),
            meta: makeMeta
              ? makeMeta({
                  geometryKind: 'polyline',
                  family: 'section-depth-connector',
                  sectionStyle: sectionStyle.meta,
                  sectionAssociation: cloneAssociation()
                })
              : null
          });
        }
      }

      if (showBendLines && geometry.planeOrigin && geometry.targetPoint) {
        const axisPoints = transformPoints([geometry.planeOrigin, geometry.targetPoint], transform);
        axisPoints.forEach((pt) => updateBounds(pt.x, pt.y));
        polylineCollector.push({
          points: axisPoints,
          color: sectionStyle.hatchColor || this._adjustColorAlpha(sectionColor, 0.85, 0.45),
          lineweight: Math.max(0.6, this._lineweightToPx(entity.lineweight) * 0.75),
          worldBounds: this._computeBoundsFromPoints(axisPoints),
          meta: makeMeta
            ? makeMeta({
                geometryKind: 'polyline',
                family: 'section-axis',
                sectionStyle: sectionStyle.meta,
                sectionAssociation: cloneAssociation()
              })
            : null
        });
      }
    }
    }

  namespace.RenderingSurfaceManager = RenderingSurfaceManager;

  return {
    RenderingSurfaceManager
  };
}));

// ---- End: components/rendering-renderer.js ----

// ---- Begin: components/rendering-overlay.js ----
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
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const DEFAULT_SELECTORS = {
    overlayRoot: '#dxfRenderingOverlay',
    closeBtn: '#closeRenderingOverlayBtn',
    titleEl: '#renderingOverlayTitle',
    summaryContainer: '#renderingOverlaySummary',
    infoTabButton: '#renderingOverlayInfoTab',
    layersTabButton: '#renderingOverlayLayersTab',
    infoTabPanel: '#renderingOverlayInfoPanel',
    layersTabPanel: '#renderingOverlayLayersPanel',
    layerManagerContainer: '#renderingOverlayLayerManager',
    layerManagerStatus: '#layerManagerStatus',
    layerManagerFilterInput: '#layerManagerFilter',
    layerManagerHideInactiveCheckbox: '#layerManagerHideInactive',
    layerManagerResetButton: '#layerManagerReset',
    canvas: '#renderingOverlayCanvas',
    textLayer: '#renderingOverlayTextLayer',
    attributeDefinitionCheckbox: '#toggleAttributeDefinitions',
    attributeInvisibleCheckbox: '#toggleAttributeInvisible',
    attributeReferencesCheckbox: '#toggleAttributeReferences',
    interactionLayer: '#renderingOverlayInteractionLayer',
    measurementLayer: '#renderingOverlayMeasurementLayer',
    snapLayer: '#renderingOverlaySnapLayer',
    measurementToolbar: '#renderingMeasurementToolbar',
    visualStyleSelect: '#renderingVisualStyleSelect',
    selectionToolbar: '#renderingSelectionToolbar',
    viewCubeEl: '#renderingViewCube',
    navigationWheelEl: '#renderingNavigationWheel',
    viewUndoButton: '#viewUndoBtn',
    viewRedoButton: '#viewRedoBtn',
    viewHomeButton: '#viewHomeBtn'
  };

  const DEFAULT_ADAPTERS = {
    updateBlockMetadata: null,
    handleLinkToHandle: null,
    toggleBlockHighlight: null,
    getBlockIsolation: null,
    getBlockHighlights: null
  };

  class RenderingOverlayController {
    constructor(options = {}) {
      this.global = options.global || root;
      this.document = options.document || (this.global && this.global.document ? this.global.document : null);
      this.rootElement = options.root || null;
      this.selectors = Object.assign({}, DEFAULT_SELECTORS, options.selectors || {});
      this.adapters = Object.assign({}, DEFAULT_ADAPTERS, options.adapters || {});
      this.dataController = options.dataController || null;
      this.dxfParser = options.dxfParser || null;
      this.app = options.app || null;

      this.overlayRoot = null;
      this.closeBtn = null;
      this.titleEl = null;
      this.summaryContainer = null;
      this.infoTabButton = null;
      this.layersTabButton = null;
      this.infoTabPanel = null;
      this.layersTabPanel = null;
      this.activeInfoTab = 'info';
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
      this.visualStyleSelect = null;
      this.visualStyleAutoOption = null;
      this.visualStyleChangeHandler = null;
      this.visualStyleOptionToSpecifier = new Map();
      this.visualStyleSpecifierToOption = new Map();
      this.keydownListenerTarget = null;

      this.boundInfoTabClick = () => this.setInformationTab('info', { focus: true });
      this.boundLayersTabClick = () => this.setInformationTab('layers', { focus: true });
      this.boundClose = () => this.close();
      this.boundOnKeyDown = (event) => this.handleOverlayKeyDown(event);
      this.boundPointerDown = (event) => this.handlePointerDown(event);
      this.boundPointerMove = (event) => this.handlePointerMove(event);
      this.boundPointerUp = (event) => this.handlePointerUp(event);
      this.boundPointerCancel = (event) => this.handlePointerCancel(event);
    }

    getDocument() {
      if (this.document) {
        return this.document;
      }
      if (this.rootElement && this.rootElement.ownerDocument) {
        return this.rootElement.ownerDocument;
      }
      if (this.overlayRoot && this.overlayRoot.ownerDocument) {
        return this.overlayRoot.ownerDocument;
      }
      if (this.global && this.global.document) {
        return this.global.document;
      }
      return null;
    }

    createElement(tagName) {
      const doc = this.getDocument();
      return doc ? doc.createElement(tagName) : null;
    }

    createSvgElement(tagName, namespace = SVG_NS) {
      const doc = this.getDocument();
      return doc ? doc.createElementNS(namespace, tagName) : null;
    }

    callAdapter(name, ...args) {
      const adapter = this.adapters[name];
      if (typeof adapter === 'function') {
        adapter(...args);
        return true;
      }
      if (this.app && typeof this.app[name] === 'function') {
        this.app[name](...args);
        return true;
      }
      return false;
    }

    getBlockIsolation() {
      if (typeof this.adapters.getBlockIsolation === 'function') {
        return this.adapters.getBlockIsolation();
      }
      if (this.app && Object.prototype.hasOwnProperty.call(this.app, 'blockIsolation')) {
        return this.app.blockIsolation;
      }
      return null;
    }

    getBlockHighlights() {
      if (typeof this.adapters.getBlockHighlights === 'function') {
        return this.adapters.getBlockHighlights();
      }
      if (this.app && Object.prototype.hasOwnProperty.call(this.app, 'blockHighlights')) {
        return this.app.blockHighlights;
      }
      return null;
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
      const doc = this.getDocument();
      const scope = this.rootElement || doc;
      if (!scope) {
        console.warn('RenderingOverlayController: no document or root element available.');
        return;
      }
      const queryWithin = (base, selector) => {
        if (!base || typeof selector !== 'string') {
          return null;
        }
        return typeof base.querySelector === 'function' ? base.querySelector(selector) : null;
      };
      const overlayRoot = this.rootElement || queryWithin(scope, this.selectors.overlayRoot);
      if (!overlayRoot) {
        console.warn('RenderingOverlayController: overlay root not found in DOM.');
        return;
      }
      this.overlayRoot = overlayRoot;
      const find = (key) => {
        const selector = this.selectors[key];
        if (!selector) {
          return null;
        }
        return queryWithin(overlayRoot, selector) || queryWithin(scope, selector);
      };

      this.closeBtn = find('closeBtn');
      this.titleEl = find('titleEl');
      this.summaryContainer = find('summaryContainer');
      this.infoTabButton = find('infoTabButton');
      this.layersTabButton = find('layersTabButton');
      this.infoTabPanel = find('infoTabPanel');
      this.layersTabPanel = find('layersTabPanel');
      this.layerManagerContainer = find('layerManagerContainer');
      this.layerManagerStatus = find('layerManagerStatus');
      this.layerManagerFilterInput = find('layerManagerFilterInput');
      this.layerManagerHideInactiveCheckbox = find('layerManagerHideInactiveCheckbox');
      this.layerManagerResetButton = find('layerManagerResetButton');
      this.canvas = find('canvas');
      this.textLayer = find('textLayer');
      this.attributeDefinitionCheckbox = find('attributeDefinitionCheckbox');
      this.attributeInvisibleCheckbox = find('attributeInvisibleCheckbox');
      this.attributeReferencesCheckbox = find('attributeReferencesCheckbox');
      this.viewportEl = this.canvas ? this.canvas.parentElement : null;
      this.interactionLayer = find('interactionLayer');
      this.measurementLayer = find('measurementLayer');
      this.snapLayer = find('snapLayer');
      this.snapMarkerEl = null;
      this.snapMarkerLabelEl = null;
      this.measurementToolbar = find('measurementToolbar');
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
      this.visualStyleSelect = find('visualStyleSelect');
      this.visualStyleAutoOption = this.visualStyleSelect
        ? this.visualStyleSelect.querySelector('option[value="__auto__"]')
        : null;
      if (this.visualStyleSelect) {
        this.visualStyleChangeHandler = (event) => {
          const value = event && event.target ? event.target.value : this.visualStyleSelect.value;
          this.handleVisualStyleSelectionChange(value);
        };
        this.visualStyleSelect.addEventListener('change', this.visualStyleChangeHandler);
      }
      this.selectionToolbar = find('selectionToolbar');
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
      if (this.infoTabButton) {
        this.infoTabButton.addEventListener('click', this.boundInfoTabClick);
      }
      if (this.layersTabButton) {
        this.layersTabButton.addEventListener('click', this.boundLayersTabClick);
      }
      this.setInformationTab(this.activeInfoTab);
      if (this.viewportEl && !this.pointerListenersAttached) {
        this.viewportEl.addEventListener('pointerdown', this.boundPointerDown, true);
        this.viewportEl.addEventListener('pointermove', this.boundPointerMove);
        this.viewportEl.addEventListener('pointerup', this.boundPointerUp);
        this.viewportEl.addEventListener('pointercancel', this.boundPointerCancel);
        this.pointerListenersAttached = true;
      }
      this.viewCubeEl = find('viewCubeEl');
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
      this.navigationWheelEl = find('navigationWheelEl');
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
      this.viewUndoButton = find('viewUndoButton');
      if (this.viewUndoButton && !this.viewNavHandlers.has(this.viewUndoButton)) {
        const handler = () => this.undoViewNavigation();
        this.viewUndoButton.addEventListener('click', handler);
        this.viewNavHandlers.set(this.viewUndoButton, handler);
      }
      this.viewRedoButton = find('viewRedoButton');
      if (this.viewRedoButton && !this.viewNavHandlers.has(this.viewRedoButton)) {
        const handler = () => this.redoViewNavigation();
        this.viewRedoButton.addEventListener('click', handler);
        this.viewNavHandlers.set(this.viewRedoButton, handler);
      }
      const homeButton = find('viewHomeButton');
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
      if (doc) {
        doc.addEventListener('keydown', this.boundOnKeyDown);
        this.keydownListenerTarget = doc;
      }
      this.populateVisualStyleOptions(this.currentSceneGraph);
      this.updateVisualStyleSelect(this.surfaceManager ? this.surfaceManager.lastFrame : null);
      this.syncAttributeVisibilityControls();
      this.updateMeasurementToolbarUI();
      this.updateSelectionToolbarUI();
      this.updateViewNavigationUi();
    }

    setInformationTab(tabId, options = {}) {
      const nextTab = tabId === 'layers' ? 'layers' : 'info';
      const focusRequested = options.focus === true;
      this.activeInfoTab = nextTab;
      const infoActive = nextTab === 'info';
      if (this.infoTabButton) {
        this.infoTabButton.classList.toggle('active', infoActive);
        this.infoTabButton.setAttribute('aria-selected', infoActive ? 'true' : 'false');
        if (focusRequested && infoActive) {
          this.infoTabButton.focus();
        }
      }
      if (this.layersTabButton) {
        this.layersTabButton.classList.toggle('active', !infoActive);
        this.layersTabButton.setAttribute('aria-selected', !infoActive ? 'true' : 'false');
        if (focusRequested && !infoActive) {
          this.layersTabButton.focus();
        }
      }
      if (this.infoTabPanel) {
        if (infoActive) {
          this.infoTabPanel.removeAttribute('hidden');
          this.infoTabPanel.classList.add('active');
        } else {
          this.infoTabPanel.setAttribute('hidden', 'true');
          this.infoTabPanel.classList.remove('active');
        }
      }
      if (this.layersTabPanel) {
        if (!infoActive) {
          this.layersTabPanel.removeAttribute('hidden');
          this.layersTabPanel.classList.add('active');
        } else {
          this.layersTabPanel.setAttribute('hidden', 'true');
          this.layersTabPanel.classList.remove('active');
        }
      }
    }

    dispose() {
      if (this.closeBtn) {
        this.closeBtn.removeEventListener('click', this.boundClose);
      }
      if (this.infoTabButton) {
        this.infoTabButton.removeEventListener('click', this.boundInfoTabClick);
      }
      if (this.layersTabButton) {
        this.layersTabButton.removeEventListener('click', this.boundLayersTabClick);
      }
      if (this.keydownListenerTarget) {
        this.keydownListenerTarget.removeEventListener('keydown', this.boundOnKeyDown);
        this.keydownListenerTarget = null;
      }
      if (this.visualStyleSelect && this.visualStyleChangeHandler) {
        this.visualStyleSelect.removeEventListener('change', this.visualStyleChangeHandler);
      }
      this.visualStyleChangeHandler = null;
      this.visualStyleSelect = null;
      this.visualStyleAutoOption = null;
      this.visualStyleOptionToSpecifier = new Map();
      this.visualStyleSpecifierToOption = new Map();
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
      this.infoTabButton = null;
      this.layersTabButton = null;
      this.infoTabPanel = null;
      this.layersTabPanel = null;
      this.activeInfoTab = 'info';
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
        if (existing.blockMetadata) {
          this.callAdapter('updateBlockMetadata', tab.id, existing.blockMetadata);
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
        if (doc.blockMetadata) {
          this.callAdapter('updateBlockMetadata', tab.id, doc.blockMetadata);
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
      this.populateVisualStyleOptions(null);
      this.updateVisualStyleSelect(null);
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
      this.populateVisualStyleOptions(doc.sceneGraph);
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

      if (doc.blockMetadata) {
        this.callAdapter('updateBlockMetadata', tab.id, doc.blockMetadata);
      }

      const viewContext = this.ensureViewContext();

      if (this.surfaceManager) {
        const isolation = this.getBlockIsolation();
        const highlight = this.getBlockHighlights();
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
      const dpr = (this.global && this.global.devicePixelRatio) || 1;
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
      this.setInformationTab('info');
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
        : this.getBlockIsolation();
      const highlightSource = Object.prototype.hasOwnProperty.call(options, 'highlight')
        ? options.highlight
        : this.getBlockHighlights();

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
        badge = this.createElement('div');
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
        this.isolationSummaryEl = this.createElement('div');
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
        const div = this.createElement('div');
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
        const svg = this.createSvgElement('svg');
        svg.setAttribute('class', 'selection-lasso');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        const path = this.createSvgElement('path');
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
      const svg = this.createSvgElement('svg');
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
          const labelEl = this.createElement('div');
          labelEl.className = 'measurement-label';
          labelEl.textContent = report.label;
          if (report.detail) {
            const detailSpan = this.createElement('span');
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
          const path = this.createSvgElement('path');
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
          const previewPath = this.createSvgElement('path');
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
          const polygon = this.createSvgElement('polygon');
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
          const outline = this.createSvgElement('path');
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
          const tail = this.createSvgElement('path');
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
            const closure = this.createSvgElement('path');
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
          const legPath = this.createSvgElement('path');
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
            const legPath = this.createSvgElement('path');
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
          const arcPath = this.createSvgElement('path');
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
        const circle = this.createSvgElement('circle');
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
      const marker = this.createElement('div');
      marker.className = 'snap-marker';
      const glyph = this.createElement('div');
      glyph.className = 'snap-glyph';
      const label = this.createElement('div');
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
      const dpr = Number.isFinite(frame.devicePixelRatio) ? frame.devicePixelRatio : ((this.global && this.global.devicePixelRatio) || 1);
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
        element = this.createElement('div');
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

    getVisualStylePresetList() {
      if (namespace.RenderingSurfaceManager &&
        typeof namespace.RenderingSurfaceManager.getVisualStylePresets === 'function') {
        return namespace.RenderingSurfaceManager.getVisualStylePresets();
      }
      return [
        { id: 'wireframe', label: 'Wireframe' },
        { id: 'hidden', label: 'Hidden' },
        { id: 'shaded', label: 'Shaded' },
        { id: 'realistic', label: 'Realistic' },
        { id: 'conceptual', label: 'Conceptual' }
      ];
    }

    normalizeVisualStyleSpecifierValue(value) {
      if (value == null) {
        return '';
      }
      return String(value).trim().toLowerCase();
    }

    extractDocumentVisualStyles(sceneGraph) {
      if (!sceneGraph || !sceneGraph.tables || !sceneGraph.tables.visualStyles) {
        return [];
      }
      const entries = [];
      const seen = new Set();
      const styles = sceneGraph.tables.visualStyles || {};
      Object.keys(styles).forEach((key) => {
        const entry = styles[key];
        if (!entry || typeof entry !== 'object') {
          return;
        }
        const handle = entry.handleUpper || entry.handle || null;
        const name = entry.name || key || '';
        const specifier = handle || name;
        if (!specifier) {
          return;
        }
        const normalized = this.normalizeVisualStyleSpecifierValue(specifier);
        if (seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        const value = handle ? `handle:${handle}` : `name:${name}`;
        const labelBase = name || (handle ? `Handle ${handle}` : specifier);
        const label = `${labelBase} (Drawing)`;
        const title = handle ? `Handle ${handle}` : '';
        entries.push({
          value,
          label,
          title,
          specifier,
          normalizedSpecifier: normalized
        });
      });
      entries.sort((a, b) => a.label.localeCompare(b.label));
      return entries;
    }

    populateVisualStyleOptions(sceneGraph) {
      if (!this.visualStyleSelect) {
        return;
      }
      const select = this.visualStyleSelect;
      const previousValue = select.value;
      select.innerHTML = '';
      this.visualStyleOptionToSpecifier = new Map();
      this.visualStyleSpecifierToOption = new Map();

      const autoOption = this.createElement('option');
      autoOption.value = '__auto__';
      autoOption.textContent = 'Drawing default';
      select.appendChild(autoOption);
      this.visualStyleAutoOption = autoOption;
      this.visualStyleOptionToSpecifier.set('__auto__', null);
      this.visualStyleSpecifierToOption.set('__auto__', '__auto__');

      const presets = this.getVisualStylePresetList();
      if (presets.length) {
        const group = this.createElement('optgroup');
        group.label = 'Preset styles';
        presets.forEach((preset) => {
          const option = this.createElement('option');
          option.value = `preset:${preset.id}`;
          option.textContent = preset.label;
          group.appendChild(option);
          const normalized = this.normalizeVisualStyleSpecifierValue(preset.id);
          this.visualStyleOptionToSpecifier.set(option.value, preset.id);
          this.visualStyleSpecifierToOption.set(normalized, option.value);
        });
        select.appendChild(group);
      }

      const docStyles = this.extractDocumentVisualStyles(sceneGraph);
      if (docStyles.length) {
        const group = this.createElement('optgroup');
        group.label = 'Drawing styles';
        docStyles.forEach((entry) => {
          const option = this.createElement('option');
          option.value = entry.value;
          option.textContent = entry.label;
          if (entry.title) {
            option.title = entry.title;
          }
          group.appendChild(option);
          this.visualStyleOptionToSpecifier.set(option.value, entry.specifier);
          this.visualStyleSpecifierToOption.set(entry.normalizedSpecifier, option.value);
        });
        select.appendChild(group);
      }

      if (previousValue && Array.from(select.options).some((opt) => opt.value === previousValue)) {
        select.value = previousValue;
      } else {
        select.value = '__auto__';
      }
      select.disabled = select.options.length <= 1;
    }

    getOptionValueForSpecifier(specifier) {
      if (!specifier) {
        return '__auto__';
      }
      const normalized = this.normalizeVisualStyleSpecifierValue(specifier);
      if (this.visualStyleSpecifierToOption && this.visualStyleSpecifierToOption.has(normalized)) {
        return this.visualStyleSpecifierToOption.get(normalized);
      }
      return null;
    }

    getSpecifierForOption(optionValue) {
      if (!optionValue || optionValue === '__auto__') {
        return null;
      }
      if (this.visualStyleOptionToSpecifier && this.visualStyleOptionToSpecifier.has(optionValue)) {
        return this.visualStyleOptionToSpecifier.get(optionValue);
      }
      if (optionValue.startsWith('preset:')) {
        return optionValue.slice(7);
      }
      if (optionValue.startsWith('handle:')) {
        return optionValue.slice(7);
      }
      if (optionValue.startsWith('name:')) {
        return optionValue.slice(5);
      }
      if (optionValue.startsWith('dynamic:')) {
        return optionValue.slice(8);
      }
      return optionValue;
    }

    updateVisualStyleSelect(frame) {
      if (!this.visualStyleSelect) {
        return;
      }
      const select = this.visualStyleSelect;
      const targetFrame = frame || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      const override = this.surfaceManager && typeof this.surfaceManager.getVisualStyleOverride === 'function'
        ? this.surfaceManager.getVisualStyleOverride()
        : null;
      const overrideValue = override && typeof override.value === 'string' && override.value.trim()
        ? override.value.trim()
        : null;

      Array.from(select.options).forEach((option) => {
        if (option.dataset && option.dataset.dynamic === 'true') {
          option.remove();
        }
      });

      let desiredOption = this.getOptionValueForSpecifier(overrideValue);
      if (!desiredOption && overrideValue) {
        desiredOption = `dynamic:${overrideValue}`;
        const dynamicOption = this.createElement('option');
        dynamicOption.value = desiredOption;
        dynamicOption.textContent = overrideValue;
        dynamicOption.dataset.dynamic = 'true';
        select.appendChild(dynamicOption);
        this.visualStyleOptionToSpecifier.set(desiredOption, overrideValue);
      }

      const resolvedValue = desiredOption || '__auto__';
      if ([...select.options].some((opt) => opt.value === resolvedValue)) {
        select.value = resolvedValue;
      } else {
        select.value = '__auto__';
      }

      if (this.visualStyleAutoOption) {
        const descriptor = targetFrame && targetFrame.visualStyle ? targetFrame.visualStyle : null;
        const styleLabel = descriptor
          ? (descriptor.name || (descriptor.category
            ? descriptor.category.charAt(0).toUpperCase() + descriptor.category.slice(1)
            : ''))
          : '';
        this.visualStyleAutoOption.textContent = styleLabel
          ? `Drawing default (${styleLabel})`
          : 'Drawing default';
      }
      select.disabled = select.options.length <= 1;
    }

    handleVisualStyleSelectionChange(optionValue) {
      if (!this.surfaceManager) {
        return;
      }
      const specifier = this.getSpecifierForOption(optionValue);
      this.surfaceManager.setVisualStyle(specifier);
      const activeView = this.getActiveViewState() || { mode: 'auto' };
      this.renderCurrentFrameWithView(activeView);
    }

    refreshViewportOverlays(frame) {
      this.updateVisualStyleSelect(frame);
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
        const span = this.createElement('div');
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
      if (targetHandle) {
        this.callAdapter('handleLinkToHandle', targetHandle);
        return;
      }
      if (interaction.blockName) {
        this.callAdapter('toggleBlockHighlight', interaction.blockName);
      }
    }
  }

  namespace.RenderingOverlayController = RenderingOverlayController;

  return {
    RenderingOverlayController
  };
}));

// ---- End: components/rendering-overlay.js ----
