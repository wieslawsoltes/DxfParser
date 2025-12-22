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
  const SINGLE_LINE_TEXT_CHAR_WIDTH_FACTOR = 0.6;
  const SELECTION_COLOR = {
    r: 135 / 255,
    g: 209 / 255,
    b: 255 / 255,
    a: 1,
    css: 'rgba(135,209,255,1)'
  };

  function basePointTransform(point) {
    if (!point || typeof point !== 'object') {
      return null;
    }
    const x = Number.isFinite(point.x) ? point.x : 0;
    const y = Number.isFinite(point.y) ? point.y : 0;
    const z = Number.isFinite(point.z) ? point.z : 0;
    if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9 && Math.abs(z) < 1e-9) {
      return null;
    }
    return translateMatrix(-x, -y, -z);
  }

  function createMatrixFromArray(array) {
    return {
      a: array[0],
      b: array[4],
      c: array[1],
      d: array[5],
      tx: array[3],
      ty: array[7],
      m3d: array
    };
  }

  function ensureMatrix3d(matrix) {
    if (matrix && matrix.m3d) {
      return matrix.m3d;
    }
    const array = new Float64Array(16);
    array[0] = typeof (matrix && matrix.a) === 'number' ? matrix.a : 1;
    array[1] = typeof (matrix && matrix.c) === 'number' ? matrix.c : 0;
    array[2] = 0;
    array[3] = typeof (matrix && matrix.tx) === 'number' ? matrix.tx : 0;
    array[4] = typeof (matrix && matrix.b) === 'number' ? matrix.b : 0;
    array[5] = typeof (matrix && matrix.d) === 'number' ? matrix.d : 1;
    array[6] = 0;
    array[7] = typeof (matrix && matrix.ty) === 'number' ? matrix.ty : 0;
    array[8] = 0;
    array[9] = 0;
    array[10] = 1;
    array[11] = 0;
    array[12] = 0;
    array[13] = 0;
    array[14] = 0;
    array[15] = 1;
    if (matrix) {
      matrix.m3d = array;
    }
    return array;
  }

  function identityMatrix() {
    const array = new Float64Array(16);
    array[0] = 1;
    array[5] = 1;
    array[10] = 1;
    array[15] = 1;
    return createMatrixFromArray(array);
  }

  function translateMatrix(x, y, z = 0) {
    const array = new Float64Array(16);
    array[0] = 1;
    array[5] = 1;
    array[10] = 1;
    array[15] = 1;
    array[3] = Number.isFinite(x) ? x : 0;
    array[7] = Number.isFinite(y) ? y : 0;
    array[11] = Number.isFinite(z) ? z : 0;
    return createMatrixFromArray(array);
  }

  function scaleMatrix(sx, sy, sz = 1) {
    const array = new Float64Array(16);
    array[0] = Number.isFinite(sx) ? sx : 1;
    array[5] = Number.isFinite(sy) ? sy : 1;
    array[10] = Number.isFinite(sz) ? sz : 1;
    array[15] = 1;
    return createMatrixFromArray(array);
  }

  function rotateMatrix(rad, axis = 'z') {
    const angle = Number.isFinite(rad) ? rad : 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const array = new Float64Array(16);
    array[15] = 1;
    switch ((axis || 'z').toLowerCase()) {
      case 'x':
        array[0] = 1;
        array[5] = cos;
        array[6] = -sin;
        array[9] = sin;
        array[10] = cos;
        break;
      case 'y':
        array[0] = cos;
        array[2] = sin;
        array[5] = 1;
        array[8] = -sin;
        array[10] = cos;
        break;
      case 'z':
      default:
        array[0] = cos;
        array[1] = -sin;
        array[4] = sin;
        array[5] = cos;
        array[10] = 1;
        break;
    }
    return createMatrixFromArray(array);
  }

  function multiplyMatrix(m1, m2) {
    const a1 = ensureMatrix3d(m1);
    const a2 = ensureMatrix3d(m2);
    const out = new Float64Array(16);
    for (let row = 0; row < 4; row++) {
      const rOffset = row * 4;
      for (let col = 0; col < 4; col++) {
        out[rOffset + col] =
          a1[rOffset + 0] * a2[0 * 4 + col] +
          a1[rOffset + 1] * a2[1 * 4 + col] +
          a1[rOffset + 2] * a2[2 * 4 + col] +
          a1[rOffset + 3] * a2[3 * 4 + col];
      }
    }
    return createMatrixFromArray(out);
  }

  function applyMatrix(matrix, point) {
    const array = ensureMatrix3d(matrix);
    const px = Number.isFinite(point && point.x) ? point.x : 0;
    const py = Number.isFinite(point && point.y) ? point.y : 0;
    const pz = Number.isFinite(point && point.z) ? point.z : 0;
    return {
      x: array[0] * px + array[1] * py + array[2] * pz + array[3],
      y: array[4] * px + array[5] * py + array[6] * pz + array[7],
      z: array[8] * px + array[9] * py + array[10] * pz + array[11]
    };
  }

  function applyMatrixToVector(matrix, vector) {
    const array = ensureMatrix3d(matrix);
    const vx = Number.isFinite(vector && vector.x) ? vector.x : 0;
    const vy = Number.isFinite(vector && vector.y) ? vector.y : 0;
    const vz = Number.isFinite(vector && vector.z) ? vector.z : 0;
    return {
      x: array[0] * vx + array[1] * vy + array[2] * vz,
      y: array[4] * vx + array[5] * vy + array[6] * vz,
      z: array[8] * vx + array[9] * vy + array[10] * vz
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
          let matrix = this._matrixFromBasis(basis);
          const layoutInsertTransform = basePointTransform(layout.insertBase || null);
          if (layoutInsertTransform) {
            matrix = multiplyMatrix(matrix, layoutInsertTransform);
          }
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
      let zAxis = normalizeVector(effectiveBasis.zAxis, { x: 0, y: 0, z: 1 });
      if (vectorLength(yAxis) < 1e-6) {
        yAxis = normalizeVector(crossProduct(zAxis, xAxis), { x: 0, y: 1, z: 0 });
      }
      if (vectorLength(zAxis) < 1e-6) {
        zAxis = normalizeVector(crossProduct(xAxis, yAxis), { x: 0, y: 0, z: 1 });
      }
      const array = new Float64Array(16);
      array[0] = xAxis.x;
      array[1] = yAxis.x;
      array[2] = zAxis.x;
      array[3] = -(xAxis.x * origin.x + yAxis.x * origin.y + zAxis.x * origin.z);
      array[4] = xAxis.y;
      array[5] = yAxis.y;
      array[6] = zAxis.y;
      array[7] = -(xAxis.y * origin.x + yAxis.y * origin.y + zAxis.y * origin.z);
      array[8] = xAxis.z;
      array[9] = yAxis.z;
      array[10] = zAxis.z;
      array[11] = -(xAxis.z * origin.x + yAxis.z * origin.y + zAxis.z * origin.z);
      array[12] = 0;
      array[13] = 0;
      array[14] = 0;
      array[15] = 1;
      return createMatrixFromArray(array);
    }

    _isDefaultExtrusion(extrusion) {
      if (!extrusion || typeof extrusion !== 'object') {
        return true;
      }
      const nx = Number.isFinite(extrusion.x) ? extrusion.x : 0;
      const ny = Number.isFinite(extrusion.y) ? extrusion.y : 0;
      const nz = Number.isFinite(extrusion.z) ? extrusion.z : 1;
      return Math.abs(nx) < 1e-9 && Math.abs(ny) < 1e-9 && Math.abs(nz - 1) < 1e-9;
    }

    _matrixFromExtrusionVector(extrusion) {
      if (this._isDefaultExtrusion(extrusion)) {
        return null;
      }
      const fallbackNormal = { x: 0, y: 0, z: 1 };
      const normalized = normalizeVector(extrusion, fallbackNormal);
      const reference =
        Math.abs(normalized.x) < 1 / 64 && Math.abs(normalized.y) < 1 / 64
          ? { x: 0, y: 1, z: 0 }
          : { x: 0, y: 0, z: 1 };
      let xAxis = crossProduct(reference, normalized);
      if (vectorLength(xAxis) < 1e-9) {
        xAxis = crossProduct(fallbackNormal, normalized);
      }
      xAxis = normalizeVector(xAxis, { x: 1, y: 0, z: 0 });
      let yAxis = crossProduct(normalized, xAxis);
      if (vectorLength(yAxis) < 1e-9) {
        yAxis = crossProduct(normalized, reference);
      }
      yAxis = normalizeVector(yAxis, { x: 0, y: 1, z: 0 });
      const array = new Float64Array(16);
      array[0] = xAxis.x;
      array[1] = yAxis.x;
      array[2] = normalized.x;
      array[3] = 0;
      array[4] = xAxis.y;
      array[5] = yAxis.y;
      array[6] = normalized.y;
      array[7] = 0;
      array[8] = xAxis.z;
      array[9] = yAxis.z;
      array[10] = normalized.z;
      array[11] = 0;
      array[12] = 0;
      array[13] = 0;
      array[14] = 0;
      array[15] = 1;
      return createMatrixFromArray(array);
    }

    _resolveExtrusionMatrix(entity, geometry) {
      const extrusionCandidate =
        (geometry && geometry.extrusion) ||
        (entity && entity.extrusion) ||
        null;
      if (!extrusionCandidate || this._isDefaultExtrusion(extrusionCandidate)) {
        return null;
      }
      return this._matrixFromExtrusionVector(extrusionCandidate);
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
          devicePixelRatio: this.devicePixelRatio,
          fieldContext: sceneGraph.fieldContext || null,
          headerVariables: sceneGraph.fieldContext && sceneGraph.fieldContext.headerVariables
            ? sceneGraph.fieldContext.headerVariables
            : null
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
      const primaryUnits = this._normalizeUnitsCode(units.insUnits);
      const defaultSourceUnits = this._normalizeUnitsCode(units.insUnitsSource);
      const defaultTargetUnits = this._normalizeUnitsCode(units.insUnitsTarget);
      const defaultInsertScaleFactor = Number.isFinite(units.scaleFactor) && units.scaleFactor !== 0
        ? Math.abs(units.scaleFactor)
        : 1;
      const blockUnitsLookup = this._buildBlockUnitsLookup(
        tables.blockRecords || {},
        sceneGraph.blockMetadata || {}
      );
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

      const drawingBaseTransform = basePointTransform(units.basePoint || null);
      const applyDrawingBaseTransform = (matrix) => {
        if (!drawingBaseTransform) {
          return matrix;
        }
        return multiplyMatrix(matrix || identityMatrix(), drawingBaseTransform);
      };

      const coordinateResolver = namespace.CoordinateSystemResolver
        ? new namespace.CoordinateSystemResolver(sceneGraph)
        : null;
      const blockRecordsTable = tables.blockRecords || {};
      const blockRecordsByUpperName = new Map();
      Object.keys(blockRecordsTable).forEach((key) => {
        const record = blockRecordsTable[key];
        if (!record) {
          return;
        }
        const recordName = record.name || key;
        if (!recordName) {
          return;
        }
        const normalized = String(recordName).trim().toUpperCase();
        if (normalized) {
          blockRecordsByUpperName.set(normalized, record);
        }
      });
      const rawBlockMetadata = (() => {
        const metadata = sceneGraph.blockMetadata;
        if (!metadata || typeof metadata !== 'object') {
          return {};
        }
        if (metadata.byName && typeof metadata.byName === 'object') {
          return metadata.byName;
        }
        if (Array.isArray(metadata.ordered) || metadata.count != null) {
          return {};
        }
        return metadata;
      })();
      const blockMetadataByUpperName = new Map();
      if (rawBlockMetadata && typeof rawBlockMetadata === 'object') {
        Object.keys(rawBlockMetadata).forEach((key) => {
          if (!key) {
            return;
          }
          const entry = rawBlockMetadata[key];
          if (!entry) {
            return;
          }
          const normalized = String(key).trim().toUpperCase();
          if (!normalized) {
            return;
          }
          blockMetadataByUpperName.set(normalized, entry);
        });
      }
      const getBlockRecord = (blockName) => {
        if (!blockName) {
          return null;
        }
        const normalized = String(blockName).trim().toUpperCase();
        if (!normalized) {
          return null;
        }
        return blockRecordsByUpperName.get(normalized) || null;
      };
      const getBlockMetadata = (blockName) => {
        if (!blockName) {
          return null;
        }
        const normalized = String(blockName).trim().toUpperCase();
        if (!normalized) {
          return null;
        }
        return blockMetadataByUpperName.get(normalized) || null;
      };
      const blockRequiresUniformScaling = (blockName) => {
        const record = getBlockRecord(blockName);
        if (record && record.scaleUniformly != null) {
          return !!record.scaleUniformly;
        }
        const metadata = getBlockMetadata(blockName);
        if (metadata && metadata.constraints && metadata.constraints.scaleUniformly != null) {
          return !!metadata.constraints.scaleUniformly;
        }
        return false;
      };
      const blockLayoutMatrixCache = new Map();
      const resolveBlockLayoutMatrix = (blockName) => {
        if (!coordinateResolver || !blockName) {
          return null;
        }
        const rawKey = String(blockName).trim();
        if (!rawKey) {
          return null;
        }
        const cacheKey = rawKey.toUpperCase();
        if (blockLayoutMatrixCache.has(cacheKey)) {
          return blockLayoutMatrixCache.get(cacheKey);
        }
        const candidateList = [];
        const seen = new Set();
        const enqueue = (value) => {
          if (value == null) {
            return;
          }
          const str = String(value).trim();
          if (!str) {
            return;
          }
          const normalized = str.toUpperCase();
          if (seen.has(normalized)) {
            return;
          }
          candidateList.push(str);
          seen.add(normalized);
        };
        const blockDefinition = blocks[rawKey] || blocks[cacheKey];
        if (blockDefinition && blockDefinition.header) {
          const header = blockDefinition.header;
          enqueue(header.layoutHandle);
          if (header.layoutHandleUpper) {
            enqueue(header.layoutHandleUpper);
          }
        }
        const record = blockRecordsByUpperName.get(cacheKey);
        if (record) {
          enqueue(record.layoutHandle);
          if (record.layoutHandleUpper) {
            enqueue(record.layoutHandleUpper);
          }
          enqueue(record.name);
        }
        enqueue(rawKey);
        const paperMatrices = coordinateResolver.paperMatrices instanceof Map
          ? coordinateResolver.paperMatrices
          : null;
        let resolvedMatrix = null;
        if (paperMatrices && candidateList.length) {
          for (let idx = 0; idx < candidateList.length; idx++) {
            const candidate = candidateList[idx];
            const normalized = candidate.trim().toUpperCase();
            if (!normalized) {
              continue;
            }
            if (paperMatrices.has(normalized)) {
              const baseMatrix = paperMatrices.get(normalized);
              resolvedMatrix = applyDrawingBaseTransform(baseMatrix);
              break;
            }
          }
        }
        blockLayoutMatrixCache.set(cacheKey, resolvedMatrix);
        return resolvedMatrix;
      };
      const defaultBaseMatrix = applyDrawingBaseTransform(identityMatrix());
      const modelBaseMatrix = coordinateResolver
        ? applyDrawingBaseTransform(coordinateResolver.getModelMatrix())
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
            const rawPaperMatrix = coordinateResolver.getPaperMatrix(entity.layout || null);
            paperMatrixCache.set(layoutKey, applyDrawingBaseTransform(rawPaperMatrix));
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

      const processEntity = (entity, transform, depth, visitedBlocks, blockStack, highlightActive, contextUnits, styleState, clipStack) => {
        if (!entity || depth > MAX_BLOCK_DEPTH) {
          return;
        }
        styleState = styleState || null;
        const type = (entity.type || '').toUpperCase();
        const geometry = entity.geometry || {};
        const extrusionMatrix = typeof this._resolveExtrusionMatrix === 'function'
          ? this._resolveExtrusionMatrix(entity, geometry)
          : null;
        if (extrusionMatrix) {
          transform = multiplyMatrix(transform, extrusionMatrix);
        }
        blockStack = blockStack || [];
        highlightActive = !!highlightActive;
        clipStack = clipStack || null;
        let activeUnits = this._normalizeUnitsCode(
          contextUnits != null ? contextUnits : primaryUnits
        );
        if (activeUnits == null && defaultTargetUnits != null) {
          activeUnits = defaultTargetUnits;
        }
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

        const resolvedColor = this._resolveColor(entity, styleState);
        const baseColor = cloneColor(resolvedColor);
        if (layerState && typeof layerState.transparencyAlpha === 'number') {
          const alpha = Math.max(0, Math.min(1, layerState.transparencyAlpha));
          const currentAlpha = Number.isFinite(baseColor.a) ? baseColor.a : 1;
          const appliedAlpha = Math.min(currentAlpha, alpha);
          baseColor.a = appliedAlpha;
          baseColor.css = `rgba(${Math.round(baseColor.r * 255)}, ${Math.round(baseColor.g * 255)}, ${Math.round(baseColor.b * 255)}, ${appliedAlpha.toFixed(3)})`;
        }
        const color = this._getEffectiveColor(baseColor, highlightActive, isSelected);
        const resolvedLineweight = this._resolveLineweight(entity, styleState);
        const resolvedLinetype = this._resolveLinetype(entity, tables, styleState);
        const effectiveLinetypeName = (() => {
          if (resolvedLinetype && resolvedLinetype.name) {
            return resolvedLinetype.name;
          }
          const directNameRaw = entity.linetype ? String(entity.linetype).trim() : '';
          const directUpper = directNameRaw.toUpperCase();
          if (directNameRaw && directUpper !== 'BYBLOCK' && directUpper !== 'BYLAYER') {
            return directNameRaw;
          }
          if (styleState && styleState.linetypeName) {
            return styleState.linetypeName;
          }
          if (entity.resolved && entity.resolved.layer && entity.resolved.layer.linetype) {
            const layerName = String(entity.resolved.layer.linetype || '').trim();
            if (layerName) {
              return layerName;
            }
          }
          return null;
        })();
        const renderBlockWithCurrentStyle = (blockName, matrix, depthValue, visitedBlocksValue, blockStackValue, highlightValue, parentUnitsValue, nestedClipStack) =>
          renderBlockContent(
            blockName,
            matrix,
            depthValue,
            visitedBlocksValue,
            blockStackValue,
            highlightValue,
            parentUnitsValue,
            styleState || null,
            nestedClipStack != null ? nestedClipStack : clipStack
          );
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
            const clipBounds = this._computeBoundsFromPoints(transformed);
            if (this._shouldCullWithClip(clipBounds, clipStack)) {
              return;
            }
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: resolvedLineweight,
              linetype: resolvedLinetype,
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed: false })
            });
            break;
          }
          case 'XLINE': {
            // Construction line (infinite in both directions)
            if (!geometry.point || !geometry.direction) return;
            const dir = geometry.direction;
            const dirLen = Math.hypot(dir.x || 0, dir.y || 0, dir.z || 0);
            if (dirLen < 1e-9) return;
            const normDir = {
              x: (dir.x || 0) / dirLen,
              y: (dir.y || 0) / dirLen,
              z: (dir.z || 0) / dirLen
            };
            // Extend to a large distance for viewport clipping
            const extendDist = 1e8;
            const start = {
              x: geometry.point.x - normDir.x * extendDist,
              y: geometry.point.y - normDir.y * extendDist,
              z: (geometry.point.z || 0) - normDir.z * extendDist
            };
            const end = {
              x: geometry.point.x + normDir.x * extendDist,
              y: geometry.point.y + normDir.y * extendDist,
              z: (geometry.point.z || 0) + normDir.z * extendDist
            };
            const transformed = transformPoints([start, end], transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: resolvedLineweight,
              linetype: resolvedLinetype,
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'xline', isClosed: false })
            });
            break;
          }
          case 'RAY': {
            // Semi-infinite line (starts at point, extends in direction)
            if (!geometry.start || !geometry.direction) return;
            const dir = geometry.direction;
            const dirLen = Math.hypot(dir.x || 0, dir.y || 0, dir.z || 0);
            if (dirLen < 1e-9) return;
            const normDir = {
              x: (dir.x || 0) / dirLen,
              y: (dir.y || 0) / dirLen,
              z: (dir.z || 0) / dirLen
            };
            // Extend to a large distance
            const extendDist = 1e8;
            const end = {
              x: geometry.start.x + normDir.x * extendDist,
              y: geometry.start.y + normDir.y * extendDist,
              z: (geometry.start.z || 0) + normDir.z * extendDist
            };
            const transformed = transformPoints([geometry.start, end], transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: resolvedLineweight,
              linetype: resolvedLinetype,
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'ray', isClosed: false })
            });
            break;
          }
          case 'LWPOLYLINE': {
            if (!geometry.points || geometry.points.length < 2) return;
            const transformed = transformPoints(geometry.points, transform);
            const clipBounds = this._computeBoundsFromPoints(transformed);
            if (this._shouldCullWithClip(clipBounds, clipStack)) {
              return;
            }
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            const isClosed = !!geometry.isClosed && transformed.length > 2;
            if (isClosed) {
              transformed.push({
                x: transformed[0].x,
                y: transformed[0].y,
                z: transformed[0].z != null ? transformed[0].z : 0
              });
            }
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: resolvedLineweight,
              linetype: resolvedLinetype,
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed })
            });
            break;
          }
          case 'POLYLINE': {
            if (!geometry.vertices || geometry.vertices.length < 2) return;
            const verts = geometry.vertices
              .filter((v) => !v.isFaceRecord && v.position)
              .map((v) => ({
                x: Number.isFinite(v.position.x) ? v.position.x : 0,
                y: Number.isFinite(v.position.y) ? v.position.y : 0,
                z: Number.isFinite(v.position.z) ? v.position.z : 0
              }));
            if (verts.length < 2) return;
            const transformed = transformPoints(verts, transform);
            const clipBounds = this._computeBoundsFromPoints(transformed);
            if (this._shouldCullWithClip(clipBounds, clipStack)) {
              return;
            }
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            const isClosed = !!geometry.isClosed && transformed.length > 2;
            if (isClosed && (transformed[0].x !== transformed[transformed.length - 1].x ||
              transformed[0].y !== transformed[transformed.length - 1].y ||
              (transformed[0].z ?? 0) !== (transformed[transformed.length - 1].z ?? 0))) {
              transformed.push({
                x: transformed[0].x,
                y: transformed[0].y,
                z: transformed[0].z != null ? transformed[0].z : 0
              });
            }
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: resolvedLineweight,
              linetype: resolvedLinetype,
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed })
            });
            break;
          }
          case 'MLINE': {
            if (!geometry.vertices || geometry.vertices.length < 2) return;
            const verts = geometry.vertices.map((pt) => ({
              x: Number.isFinite(pt.x) ? pt.x : 0,
              y: Number.isFinite(pt.y) ? pt.y : 0,
              z: Number.isFinite(pt.z) ? pt.z : 0
            }));
            const isClosed = !!geometry.isClosed && verts.length > 2;

            // Try to resolve MLINE style from tables
            const mlineStyleName = geometry.style || null;
            const mlineScale = Number.isFinite(geometry.scale) ? geometry.scale : 1;
            const justification = geometry.justification || 0; // 0=top, 1=zero, 2=bottom
            let styleElements = null;
            if (mlineStyleName && tables && tables.mlineStyles) {
              const styleRecord = tables.mlineStyles[mlineStyleName]
                || Object.values(tables.mlineStyles).find(s => s && s.name === mlineStyleName);
              if (styleRecord && Array.isArray(styleRecord.elements)) {
                styleElements = styleRecord.elements;
              }
            }

            // If no style elements found, default to two parallel lines
            if (!styleElements || styleElements.length === 0) {
              styleElements = [
                { offset: 0.5, colorNumber: null, trueColor: null, linetype: null },
                { offset: -0.5, colorNumber: null, trueColor: null, linetype: null }
              ];
            }

            // Calculate offset adjustment based on justification
            let justificationOffset = 0;
            if (styleElements.length > 0) {
              const maxOffset = Math.max(...styleElements.map(e => e.offset || 0));
              const minOffset = Math.min(...styleElements.map(e => e.offset || 0));
              switch (justification) {
                case 0: // Top - no offset change
                  justificationOffset = 0;
                  break;
                case 1: // Zero - center the elements
                  justificationOffset = -(maxOffset + minOffset) / 2;
                  break;
                case 2: // Bottom - shift all up
                  justificationOffset = -minOffset - maxOffset;
                  break;
                default:
                  justificationOffset = 0;
              }
            }

            // Generate parallel polylines for each element
            styleElements.forEach((element, elementIndex) => {
              const elementOffset = ((element.offset || 0) + justificationOffset) * mlineScale;
              const offsetVerts = [];

              // For each vertex, calculate perpendicular offset direction
              for (let i = 0; i < verts.length; i++) {
                let perpX = 0, perpY = 0;
                if (i === 0 && verts.length > 1) {
                  // First vertex: use direction to next
                  const dx = verts[1].x - verts[0].x;
                  const dy = verts[1].y - verts[0].y;
                  const len = Math.hypot(dx, dy);
                  if (len > 1e-9) {
                    perpX = -dy / len;
                    perpY = dx / len;
                  }
                } else if (i === verts.length - 1 && !isClosed) {
                  // Last vertex (open): use direction from previous
                  const dx = verts[i].x - verts[i - 1].x;
                  const dy = verts[i].y - verts[i - 1].y;
                  const len = Math.hypot(dx, dy);
                  if (len > 1e-9) {
                    perpX = -dy / len;
                    perpY = dx / len;
                  }
                } else {
                  // Middle vertex or closed: use miter direction (average of adjacent normals)
                  const prevIdx = i === 0 ? verts.length - 1 : i - 1;
                  const nextIdx = (i + 1) % verts.length;
                  const dx1 = verts[i].x - verts[prevIdx].x;
                  const dy1 = verts[i].y - verts[prevIdx].y;
                  const len1 = Math.hypot(dx1, dy1);
                  const dx2 = verts[nextIdx].x - verts[i].x;
                  const dy2 = verts[nextIdx].y - verts[i].y;
                  const len2 = Math.hypot(dx2, dy2);
                  if (len1 > 1e-9 && len2 > 1e-9) {
                    const n1x = -dy1 / len1, n1y = dx1 / len1;
                    const n2x = -dy2 / len2, n2y = dx2 / len2;
                    perpX = (n1x + n2x) / 2;
                    perpY = (n1y + n2y) / 2;
                    const perpLen = Math.hypot(perpX, perpY);
                    if (perpLen > 1e-9) {
                      perpX /= perpLen;
                      perpY /= perpLen;
                    }
                  }
                }
                offsetVerts.push({
                  x: verts[i].x + perpX * elementOffset,
                  y: verts[i].y + perpY * elementOffset
                });
              }

              const transformed = transformPoints(offsetVerts, transform);
              transformed.forEach((pt) => updateBounds(pt.x, pt.y));

              if (isClosed && !this._pointsApproxEqual(transformed[0], transformed[transformed.length - 1])) {
                transformed.push({ x: transformed[0].x, y: transformed[0].y });
              }

              // Resolve element color
              let elementColor = color;
              if (element.trueColor) {
                const tc = element.trueColor;
                elementColor = [
                  tc.r !== undefined ? tc.r / 255 : 1,
                  tc.g !== undefined ? tc.g / 255 : 1,
                  tc.b !== undefined ? tc.b / 255 : 1,
                  1
                ];
              } else if (element.colorNumber != null && element.colorNumber !== 256) {
                const resolved = this._resolveColorByNumber(element.colorNumber, tables);
                if (resolved) {
                  elementColor = resolved;
                }
              }

              rawPolylines.push({
                points: transformed,
                color: elementColor,
                lineweight: resolvedLineweight,
                linetype: element.linetype || resolvedLinetype,
                worldBounds: this._computeBoundsFromPoints(transformed),
                meta: makeMeta({
                  geometryKind: 'polyline',
                  isClosed,
                  family: 'mline',
                  style: mlineStyleName,
                  elementIndex
                })
              });
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
            const clipBounds = this._computeBoundsFromPoints(transformed);
            if (this._shouldCullWithClip(clipBounds, clipStack)) {
              return;
            }
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: resolvedLineweight,
              linetype: resolvedLinetype,
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed: false })
            });
            break;
          }
          case 'CIRCLE': {
            if (!geometry.center || !Number.isFinite(geometry.radius)) return;
            const arcPoints = this._sampleArc(geometry.center, geometry.radius, 0, 360, true);
            const transformed = transformPoints(arcPoints, transform);
            const clipBounds = this._computeBoundsFromPoints(transformed);
            if (this._shouldCullWithClip(clipBounds, clipStack)) {
              return;
            }
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: resolvedLineweight,
              linetype: resolvedLinetype,
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed: true })
            });
            break;
          }
          case 'ELLIPSE': {
            const ellipsePoints = this._sampleEllipse(geometry);
            if (!ellipsePoints) return;
            const transformed = transformPoints(ellipsePoints, transform);
            const clipBounds = this._computeBoundsFromPoints(transformed);
            if (this._shouldCullWithClip(clipBounds, clipStack)) {
              return;
            }
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
              lineweight: resolvedLineweight,
              linetype: resolvedLinetype,
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed })
            });
            break;
          }
          case 'SPLINE': {
            // Use proper B-spline/NURBS tessellation for accurate curve rendering
            const tessellatedPoints = this._tessellateSpline(geometry, 64);
            if (!tessellatedPoints || tessellatedPoints.length < 2) return;
            const transformed = transformPoints(tessellatedPoints, transform);
            const clipBounds = this._computeBoundsFromPoints(transformed);
            if (this._shouldCullWithClip(clipBounds, clipStack)) {
              return;
            }
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            const isClosed = !!geometry.isClosed ||
              (transformed.length >= 2 && this._pointsApproxEqual(transformed[0], transformed[transformed.length - 1]));
            if (isClosed && !this._pointsApproxEqual(transformed[0], transformed[transformed.length - 1])) {
              transformed.push({ x: transformed[0].x, y: transformed[0].y });
            }
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: resolvedLineweight,
              linetype: resolvedLinetype,
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed, curveType: 'spline' })
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
            const pointBounds = { minX: worldPoint.x, minY: worldPoint.y, maxX: worldPoint.x, maxY: worldPoint.y };
            if (this._shouldCullWithClip(pointBounds, clipStack)) {
              return;
            }
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
              lineweight: resolvedLineweight,
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
                lineweight: resolvedLineweight,
                makeMeta,
                config,
                family: 'mpoint'
              });
            });
            break;
          }
          case 'CENTERLINE': {
            // Center line annotation - line with cross marks at ends
            if (!geometry.start || !geometry.end) return;
            const startWorld = applyMatrix(transform, geometry.start);
            const endWorld = applyMatrix(transform, geometry.end);
            updateBounds(startWorld.x, startWorld.y);
            updateBounds(endWorld.x, endWorld.y);
            
            // Calculate direction and perpendicular
            const dx = endWorld.x - startWorld.x;
            const dy = endWorld.y - startWorld.y;
            const length = Math.hypot(dx, dy);
            if (length < 1e-9) break;
            const dirX = dx / length;
            const dirY = dy / length;
            const perpX = -dirY;
            const perpY = dirX;
            
            // Extension length (defaults based on line length)
            const extLen = Number.isFinite(geometry.extensionLength) && geometry.extensionLength > 0
              ? geometry.extensionLength
              : length * 0.1;
            const crossSize = Number.isFinite(geometry.crossSize) && geometry.crossSize > 0
              ? geometry.crossSize
              : length * 0.05;
            const crossGap = Number.isFinite(geometry.crossGap) && geometry.crossGap > 0
              ? geometry.crossGap
              : crossSize * 0.5;
            
            // Main center line with extensions
            const lineStart = {
              x: startWorld.x - dirX * extLen,
              y: startWorld.y - dirY * extLen
            };
            const lineEnd = {
              x: endWorld.x + dirX * extLen,
              y: endWorld.y + dirY * extLen
            };
            
            rawPolylines.push({
              points: [lineStart, lineEnd],
              color,
              lineweight: resolvedLineweight,
              linetype: resolvedLinetype,
              meta: makeMeta({ geometryKind: 'centerline', part: 'main' })
            });
            
            // Cross marks at start and end
            const addCrossMark = (center) => {
              // Perpendicular cross line
              rawPolylines.push({
                points: [
                  { x: center.x + perpX * crossSize, y: center.y + perpY * crossSize },
                  { x: center.x - perpX * crossSize, y: center.y - perpY * crossSize }
                ],
                color,
                lineweight: resolvedLineweight,
                linetype: null,
                meta: makeMeta({ geometryKind: 'centerline', part: 'cross' })
              });
            };
            
            addCrossMark(startWorld);
            addCrossMark(endWorld);
            break;
          }
          case 'CENTERMARK': {
            // Center mark annotation - cross at center of circle/arc
            if (!geometry.center) return;
            const centerWorld = applyMatrix(transform, geometry.center);
            updateBounds(centerWorld.x, centerWorld.y);
            
            const scales = matrixScale(transform);
            const avgScale = ((Math.abs(scales.sx) + Math.abs(scales.sy)) / 2) || 1;
            
            // Default sizes based on associated radius or fixed values
            const radius = Number.isFinite(geometry.radius) ? geometry.radius * avgScale : 20;
            const crossSize = Number.isFinite(geometry.crossSize)
              ? geometry.crossSize * avgScale
              : radius * 0.3;
            const crossGap = Number.isFinite(geometry.crossGap)
              ? geometry.crossGap * avgScale
              : crossSize * 0.25;
            const extLen = Number.isFinite(geometry.extensionLength)
              ? geometry.extensionLength * avgScale
              : 0;
            
            // Apply rotation
            const rotRad = Number.isFinite(geometry.rotation) ? geometry.rotation * Math.PI / 180 : 0;
            const cos = Math.cos(rotRad);
            const sin = Math.sin(rotRad);
            
            // Cross lines through center (with gap)
            if (geometry.showCrossLines !== false) {
              // Horizontal cross (rotated)
              const hDirX = cos;
              const hDirY = sin;
              // Left segment
              rawPolylines.push({
                points: [
                  { x: centerWorld.x - hDirX * crossSize, y: centerWorld.y - hDirY * crossSize },
                  { x: centerWorld.x - hDirX * crossGap, y: centerWorld.y - hDirY * crossGap }
                ],
                color,
                lineweight: resolvedLineweight,
                meta: makeMeta({ geometryKind: 'centermark', part: 'cross-h-left' })
              });
              // Right segment
              rawPolylines.push({
                points: [
                  { x: centerWorld.x + hDirX * crossGap, y: centerWorld.y + hDirY * crossGap },
                  { x: centerWorld.x + hDirX * crossSize, y: centerWorld.y + hDirY * crossSize }
                ],
                color,
                lineweight: resolvedLineweight,
                meta: makeMeta({ geometryKind: 'centermark', part: 'cross-h-right' })
              });
              
              // Vertical cross (rotated)
              const vDirX = -sin;
              const vDirY = cos;
              // Bottom segment
              rawPolylines.push({
                points: [
                  { x: centerWorld.x - vDirX * crossSize, y: centerWorld.y - vDirY * crossSize },
                  { x: centerWorld.x - vDirX * crossGap, y: centerWorld.y - vDirY * crossGap }
                ],
                color,
                lineweight: resolvedLineweight,
                meta: makeMeta({ geometryKind: 'centermark', part: 'cross-v-bottom' })
              });
              // Top segment
              rawPolylines.push({
                points: [
                  { x: centerWorld.x + vDirX * crossGap, y: centerWorld.y + vDirY * crossGap },
                  { x: centerWorld.x + vDirX * crossSize, y: centerWorld.y + vDirY * crossSize }
                ],
                color,
                lineweight: resolvedLineweight,
                meta: makeMeta({ geometryKind: 'centermark', part: 'cross-v-top' })
              });
            }
            
            // Extension lines beyond circle (if enabled)
            if (geometry.showExtensionLines && extLen > 0) {
              const hDirX = cos;
              const hDirY = sin;
              const vDirX = -sin;
              const vDirY = cos;
              
              // Horizontal extensions
              rawPolylines.push({
                points: [
                  { x: centerWorld.x - hDirX * (radius + crossGap), y: centerWorld.y - hDirY * (radius + crossGap) },
                  { x: centerWorld.x - hDirX * (radius + extLen), y: centerWorld.y - hDirY * (radius + extLen) }
                ],
                color,
                lineweight: resolvedLineweight,
                meta: makeMeta({ geometryKind: 'centermark', part: 'ext-h-left' })
              });
              rawPolylines.push({
                points: [
                  { x: centerWorld.x + hDirX * (radius + crossGap), y: centerWorld.y + hDirY * (radius + crossGap) },
                  { x: centerWorld.x + hDirX * (radius + extLen), y: centerWorld.y + hDirY * (radius + extLen) }
                ],
                color,
                lineweight: resolvedLineweight,
                meta: makeMeta({ geometryKind: 'centermark', part: 'ext-h-right' })
              });
              
              // Vertical extensions
              rawPolylines.push({
                points: [
                  { x: centerWorld.x - vDirX * (radius + crossGap), y: centerWorld.y - vDirY * (radius + crossGap) },
                  { x: centerWorld.x - vDirX * (radius + extLen), y: centerWorld.y - vDirY * (radius + extLen) }
                ],
                color,
                lineweight: resolvedLineweight,
                meta: makeMeta({ geometryKind: 'centermark', part: 'ext-v-bottom' })
              });
              rawPolylines.push({
                points: [
                  { x: centerWorld.x + vDirX * (radius + crossGap), y: centerWorld.y + vDirY * (radius + crossGap) },
                  { x: centerWorld.x + vDirX * (radius + extLen), y: centerWorld.y + vDirY * (radius + extLen) }
                ],
                color,
                lineweight: resolvedLineweight,
                meta: makeMeta({ geometryKind: 'centermark', part: 'ext-v-top' })
              });
            }
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
                lineweight: resolvedLineweight,
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
              lineweight: resolvedLineweight,
              linetype: resolvedLinetype
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
            lineweight: resolvedLineweight != null ? resolvedLineweight : entity.lineweight,
            styleEntry: null,
            multiLeaderStylesByHandle,
            multiLeaderStyles,
            textStylesByHandle,
            renderBlockContent: renderBlockWithCurrentStyle,
            getBlockNameByHandle,
            depth,
            visitedBlocks,
            blockStack,
            highlightActive,
            contextUnits: activeUnits
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
            lineweight: resolvedLineweight != null ? resolvedLineweight : entity.lineweight,
            multiLeaderStylesByHandle,
            multiLeaderStyles,
            textStylesByHandle,
            renderBlockContent: renderBlockWithCurrentStyle,
            getBlockNameByHandle,
            depth,
            visitedBlocks,
            blockStack,
            highlightActive,
            contextUnits: activeUnits
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
            lineweight: resolvedLineweight != null ? resolvedLineweight : entity.lineweight,
            renderBlockContent: renderBlockWithCurrentStyle,
            getBlockNameByHandle,
            textStylesByHandle,
            depth,
            visitedBlocks,
            blockStack,
            highlightActive,
            contextUnits: activeUnits
          });
          break;
        }
        case 'ARCALIGNEDTEXT': {
            if (!geometry || !geometry.center) {
              break;
            }
            const text = geometry.text || '';
            if (!text) break;
            
            const radius = Number.isFinite(geometry.radius) ? geometry.radius : 0;
            const startRad = Number.isFinite(geometry.startAngle) ? geometry.startAngle * Math.PI / 180 : 0;
            const endRad = Number.isFinite(geometry.endAngle) ? geometry.endAngle * Math.PI / 180 : startRad + Math.PI;
            const arcSpan = endRad - startRad;
            const offset = Number.isFinite(geometry.offset) ? geometry.offset : 0;
            const effectiveRadius = radius + offset;
            const textHeight = geometry.textHeight || geometry.height || Math.max(Math.abs(radius) * 0.05, 8);
            const charSpacing = geometry.characterSpacing || textHeight * 0.1;
            const widthFactor = geometry.widthFactor ?? 1;
            const isReversed = !!geometry.reverse;
            
            // Calculate approximate character width
            const charWidth = (textHeight * 0.6 * widthFactor + charSpacing);
            const totalWidth = text.length * charWidth;
            const arcLength = Math.abs(arcSpan * effectiveRadius);
            
            // Calculate starting angle to center text on arc
            let textArcSpan;
            if (arcLength > 0 && totalWidth < arcLength) {
              textArcSpan = (totalWidth / effectiveRadius);
            } else {
              textArcSpan = Math.abs(arcSpan);
            }
            
            const alignment = geometry.alignment || 0;
            let charStartAngle;
            switch (alignment) {
              case 1: // Left aligned
                charStartAngle = isReversed ? endRad : startRad;
                break;
              case 3: // Right aligned  
                charStartAngle = isReversed ? (startRad + textArcSpan) : (endRad - textArcSpan);
                break;
              case 2: // Center aligned (default)
              default:
                const midAngle = (startRad + endRad) / 2;
                charStartAngle = isReversed ? (midAngle + textArcSpan / 2) : (midAngle - textArcSpan / 2);
                break;
            }
            
            // Render each character along the arc
            const direction = isReversed ? -1 : 1;
            const charArcStep = (charWidth / effectiveRadius) * direction;
            
            for (let i = 0; i < text.length; i++) {
              const char = text[i];
              const charAngle = charStartAngle + (i + 0.5) * charArcStep;
              const charX = geometry.center.x + effectiveRadius * Math.cos(charAngle);
              const charY = geometry.center.y + effectiveRadius * Math.sin(charAngle);
              
              // Rotation is tangent to arc (perpendicular to radius)
              const tangentAngle = charAngle + (Math.PI / 2) * (isReversed ? -1 : 1);
              
              const charGeometry = {
                position: { x: charX, y: charY },
                rotation: tangentAngle * 180 / Math.PI,
                height: textHeight,
                textStyle: geometry.textStyle || null,
                widthFactor: widthFactor,
                content: char
              };
              
              this._queueSingleLineText({
                kind: 'ARCALIGNEDTEXT',
                entity,
                geometry: charGeometry,
                transform,
                rawTexts,
                updateBounds,
                color,
                meta: makeMeta({ geometryKind: 'text', textKind: 'ARCALIGNEDTEXT', charIndex: i })
              });
            }
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
            const direction = geometry.direction || null;
            let directionRotation = null;
            let directionScale = null;
            if (direction && (Number.isFinite(direction.x) || Number.isFinite(direction.y))) {
              const dirVector = {
                x: Number.isFinite(direction.x) ? direction.x : 0,
                y: Number.isFinite(direction.y) ? direction.y : 0
              };
              const transformedDir = applyMatrixToVector(transform, dirVector);
              const len = Math.hypot(transformedDir.x, transformedDir.y);
              if (len > 1e-6) {
                directionRotation = Math.atan2(transformedDir.y, transformedDir.x);
                directionScale = len;
              }
            }
            let appliedRotation = directionRotation != null ? directionRotation : matrixRotation(transform);
            if (Number.isFinite(geometry.rotation)) {
              appliedRotation += geometry.rotation * Math.PI / 180;
            }
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
            const widthScale = directionScale != null ? directionScale : avgScale;
            const referenceWidthWorld = geometry.referenceWidth ? geometry.referenceWidth * widthScale : null;
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
            
            // Parse and render GD&T tolerance frame
            const toleranceText = geometry.text || '';
            this._renderToleranceFrame({
              entity,
              geometry,
              position: worldPosition,
              rotation: appliedRotation,
              height: worldHeight,
              baseHeight,
              scaleMagnitude: avgScale,
              text: toleranceText,
              styleName,
              color,
              rawPolylines,
              rawTexts,
              updateBounds,
              makeMeta
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
          const blockMetadataEntry = getBlockMetadata(blockName);
          const blockFlagsInfo = blockMetadataEntry && blockMetadataEntry.flags ? blockMetadataEntry.flags : null;
          if (blockFlagsInfo && blockFlagsInfo.isOverlay && blockStack && blockStack.length) {
            return;
          }
          if (blockFlagsInfo && blockFlagsInfo.isExternallyDependent && !blockFlagsInfo.isResolved &&
            (!block.entities || !block.entities.length)) {
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
            : { x: 0, y: 0, z: 0 };
          const baseTransform = translateMatrix(
            -(Number.isFinite(basePoint.x) ? basePoint.x : 0),
            -(Number.isFinite(basePoint.y) ? basePoint.y : 0),
            -(Number.isFinite(basePoint.z) ? basePoint.z : 0)
          );
          const blockLayoutMatrix = resolveBlockLayoutMatrix(blockName);
          const definitionTransform = blockLayoutMatrix
            ? multiplyMatrix(blockLayoutMatrix, baseTransform)
            : baseTransform;

          const clipFilters = Array.isArray(geometry.clipFilters) ? geometry.clipFilters : null;
          const blockClipPolygons = clipFilters
            ? clipFilters
                .filter((filter) => filter && filter.clippingEnabled !== false &&
                  Array.isArray(filter.boundary) && filter.boundary.length >= 2)
                .map((filter) => {
                  const matrixArray = filter.inverseInsertMatrix || filter.clipBoundaryMatrix || null;
                  const baseMatrix = matrixArray ? createMatrixFromArray(matrixArray) : identityMatrix();
                  let blockPoints = filter.boundary.map((pt) => {
                    const applied = applyMatrix(baseMatrix, { x: pt.x, y: pt.y, z: 0 });
                    return { x: applied.x, y: applied.y };
                  });
                  if (blockPoints.length === 2) {
                    const p0 = blockPoints[0];
                    const p1 = blockPoints[1];
                    blockPoints = [
                      { x: p0.x, y: p0.y },
                      { x: p1.x, y: p0.y },
                      { x: p1.x, y: p1.y },
                      { x: p0.x, y: p1.y }
                    ];
                  }
                  const bounds = this._computeBoundsFromPoints(blockPoints);
                  if (!bounds) {
                    return null;
                  }
                  return {
                    points: blockPoints,
                    bounds
                  };
                })
                .filter((entry) => entry && entry.points && entry.points.length >= 3)
            : [];

          const rawBlockUnits = this._lookupBlockUnits(blockName, blockUnitsLookup);
          const normalizedBlockUnits = this._normalizeUnitsCode(rawBlockUnits);
          const normalizedActiveUnits = activeUnits;
          let unitScale = 1;
          const applyDefaultScale = () => {
            if (defaultInsertScaleFactor && defaultInsertScaleFactor !== 1) {
              unitScale *= defaultInsertScaleFactor;
            }
          };
          if (normalizedBlockUnits != null) {
            if (normalizedBlockUnits === 0) {
              const sourceUnits = defaultSourceUnits != null ? defaultSourceUnits : normalizedActiveUnits;
              if (sourceUnits != null && normalizedActiveUnits != null && sourceUnits !== normalizedActiveUnits) {
                unitScale *= this._unitConversionFactor(sourceUnits, normalizedActiveUnits);
              }
              applyDefaultScale();
            } else if (normalizedActiveUnits != null && normalizedBlockUnits !== normalizedActiveUnits) {
              unitScale *= this._unitConversionFactor(normalizedBlockUnits, normalizedActiveUnits);
            }
          } else {
            const sourceUnits = defaultSourceUnits != null ? defaultSourceUnits : normalizedActiveUnits;
            if (sourceUnits != null && normalizedActiveUnits != null && sourceUnits !== normalizedActiveUnits) {
              unitScale *= this._unitConversionFactor(sourceUnits, normalizedActiveUnits);
            }
            applyDefaultScale();
          }

          const scaleXRaw = geometry.scale && Number.isFinite(geometry.scale.x) ? geometry.scale.x : 1;
          let scaleYRaw = geometry.scale && Number.isFinite(geometry.scale.y) ? geometry.scale.y : null;
          const scaleZRaw = geometry.scale && Number.isFinite(geometry.scale.z) ? geometry.scale.z : 1;
          if (scaleYRaw == null || scaleYRaw === 0) {
            scaleYRaw = scaleZRaw !== 0 ? scaleZRaw : 1;
          }
          let resolvedScaleX = scaleXRaw !== 0 ? scaleXRaw : 1;
          let resolvedScaleY = scaleYRaw !== 0 ? scaleYRaw : 1;
          let resolvedScaleZ = scaleZRaw !== 0 ? scaleZRaw : 1;
          if (blockRequiresUniformScaling(blockName)) {
            const tolerance = 1e-6;
            const compare = (a, b) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
            const uniformXY = compare(resolvedScaleX, resolvedScaleY);
            const uniformXZ = compare(resolvedScaleX, resolvedScaleZ);
            if (!uniformXY || !uniformXZ) {
              const candidateSource = geometry.scale || {};
              const candidates = [];
              if (Number.isFinite(candidateSource.x) && candidateSource.x !== 0) {
                candidates.push(candidateSource.x);
              }
              if (Number.isFinite(candidateSource.y) && candidateSource.y !== 0) {
                candidates.push(candidateSource.y);
              }
              if (Number.isFinite(candidateSource.z) && candidateSource.z !== 0) {
                candidates.push(candidateSource.z);
              }
              if (!candidates.length) {
                candidates.push(resolvedScaleX, resolvedScaleY, resolvedScaleZ);
              }
              let base = candidates[0];
              for (let idx = 1; idx < candidates.length; idx += 1) {
                if (Math.abs(candidates[idx]) > Math.abs(base)) {
                  base = candidates[idx];
                }
              }
              if (!Number.isFinite(base) || Math.abs(base) < 1e-9) {
                base = 1;
              }
              resolvedScaleX = base;
              resolvedScaleY = base;
              resolvedScaleZ = base;
            }
          }
          const effectiveScaleX = resolvedScaleX * unitScale;
          const effectiveScaleY = resolvedScaleY * unitScale;
          const effectiveScaleZ = resolvedScaleZ * unitScale;
          const localScale = scaleMatrix(effectiveScaleX, effectiveScaleY, effectiveScaleZ);
          const rotation = rotateMatrix((geometry.rotation || 0) * Math.PI / 180);

          const columnCount = geometry.columnCount || 1;
          const rowCount = geometry.rowCount || 1;
          const columnSpacing = geometry.columnSpacing || 0;
          const rowSpacing = geometry.rowSpacing || 0;
          const childContextUnits = normalizedBlockUnits != null
            ? (normalizedBlockUnits === 0 && defaultSourceUnits != null ? defaultSourceUnits : normalizedBlockUnits)
            : normalizedActiveUnits;
          const childStyleOverrides = {
            color: resolvedColor ? cloneColor(resolvedColor) : null,
            lineweight: resolvedLineweight != null ? resolvedLineweight : (styleState ? styleState.lineweight : null),
            linetypeName: effectiveLinetypeName || (styleState ? styleState.linetypeName : null),
            linetypeEntry: resolvedLinetype || (styleState ? styleState.linetypeEntry : null)
          };

          for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < columnCount; col++) {
              // Calculate position for this grid cell
              // Row/column spacing is in OCS, applied before extrusion
              const posX = (geometry.position ? (Number.isFinite(geometry.position.x) ? geometry.position.x : 0) : 0) + col * columnSpacing;
              const posY = (geometry.position ? (Number.isFinite(geometry.position.y) ? geometry.position.y : 0) : 0) + row * rowSpacing;
              const posZ = geometry.position ? (Number.isFinite(geometry.position.z) ? geometry.position.z : 0) : 0;
              const translate = translateMatrix(posX, posY, posZ);
              
              // Transform order: basePoint → blockLayout → scale → rotation → translate → extrusion → parent
              // This becomes: parent × extrusion × translate × rotation × scale × blockLayout × basePoint
              const insertTransform = multiplyMatrix(transform, multiplyMatrix(translate, multiplyMatrix(rotation, localScale)));
              const composedTransform = multiplyMatrix(insertTransform, definitionTransform);
              let instanceClipStack = clipStack;
              if (blockClipPolygons.length) {
                const worldClips = [];
                for (let idx = 0; idx < blockClipPolygons.length; idx += 1) {
                  const entry = blockClipPolygons[idx];
                  const worldPoints = entry.points.map((pt) => {
                    const applied = applyMatrix(composedTransform, { x: pt.x, y: pt.y, z: 0 });
                    return { x: applied.x, y: applied.y };
                  });
                  const worldBounds = this._computeBoundsFromPoints(worldPoints);
                  if (worldBounds) {
                    worldClips.push({ points: worldPoints, bounds: worldBounds });
                  }
                }
                if (worldClips.length) {
                  instanceClipStack = (clipStack || []).concat(worldClips);
                }
              }
              block.entities.forEach((child) => processEntity(
                child,
                composedTransform,
                depth + 1,
                visitedStack,
                (blockStack || []).concat(blockName),
                nextHighlight,
                childContextUnits,
                childStyleOverrides,
                instanceClipStack
              ));
            }
          }
          break;
        }
        case 'DIMENSION': {
          this._addDimensionGeometry(
            entity,
            geometry,
            transform,
            updateBounds,
            rawPolylines,
            rawTexts,
            color,
            makeMeta,
            contextUnits,
            {
              renderBlockContent: renderBlockWithCurrentStyle,
              getBlockNameByHandle,
              depth,
              visitedBlocks,
              blockStack,
              highlight: highlightActive
            }
          );
          break;
        }
        case 'ARC_DIMENSION': {
          // Arc length dimension - shows the length along an arc
          this._addArcDimensionGeometry(
            entity,
            geometry,
            transform,
            updateBounds,
            rawPolylines,
            rawTexts,
            color,
            makeMeta,
            contextUnits
          );
          break;
        }
        case 'LARGE_RADIAL_DIMENSION': {
          // Jogged radius dimension for large arcs
          this._addLargeRadialDimensionGeometry(
            entity,
            geometry,
            transform,
            updateBounds,
            rawPolylines,
            rawTexts,
            color,
            makeMeta,
            contextUnits
          );
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
            tables,
            lineweight: resolvedLineweight,
            linetype: resolvedLinetype
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
            lineweight: resolvedLineweight,
            linetype: resolvedLinetype,
            worldBounds: this._computeBoundsFromPoints(transformed),
            meta: makeMeta({ geometryKind: 'polyline', isClosed: true, family: geometry.frameType ? geometry.frameType.toLowerCase() : 'frame' })
          });
          break;
        }
        case 'PROXYENTITY':
        case 'ACAD_PROXY_ENTITY': {
          if (geometry.position) {
            const projected = applyMatrix(transform, geometry.position);
            updateBounds(projected.x, projected.y);
            const size = Math.max(6, resolvedLineweight || 6);
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
        case '3DFACE': {
          // 3DFACE is a triangular or quadrilateral face in 3D space
          const points = [];
          if (geometry.firstCorner) points.push(geometry.firstCorner);
          if (geometry.secondCorner) points.push(geometry.secondCorner);
          if (geometry.thirdCorner) points.push(geometry.thirdCorner);
          if (geometry.fourthCorner) {
            // Check if fourth corner is distinct from third (quad vs triangle)
            const p3 = geometry.thirdCorner;
            const p4 = geometry.fourthCorner;
            if (Math.abs(p3.x - p4.x) > 0.0001 || Math.abs(p3.y - p4.y) > 0.0001 || Math.abs((p3.z || 0) - (p4.z || 0)) > 0.0001) {
              points.push(geometry.fourthCorner);
            }
          }
          if (points.length >= 3) {
            const transformed = transformPoints(points, transform);
            transformed.forEach((pt) => updateBounds(pt.x, pt.y));
            // Close the polygon
            if (!this._pointsApproxEqual(transformed[0], transformed[transformed.length - 1])) {
              transformed.push({ x: transformed[0].x, y: transformed[0].y });
            }
            // Render as filled polygon
            if (this._isFillEnabled()) {
              rawFills.push({
                points: transformed,
                color,
                material: materialDescriptor,
                worldBounds: this._computeBoundsFromPoints(transformed),
                meta: makeMeta({ geometryKind: 'fill', fillKind: '3dface' })
              });
            }
            // Always render outline
            rawPolylines.push({
              points: transformed,
              color,
              lineweight: resolvedLineweight,
              linetype: resolvedLinetype,
              worldBounds: this._computeBoundsFromPoints(transformed),
              meta: makeMeta({ geometryKind: 'polyline', isClosed: true, family: '3dface' })
            });
          }
          break;
        }
        case 'EXTRUDEDSURFACE':
        case 'LOFTEDSURFACE':
        case 'REVOLVEDSURFACE':
        case 'SWEPTSURFACE':
        case 'PLANESURFACE':
        case 'NURBSURFACE': {
          // Procedural surfaces - tessellate to triangles
          this._addProceduralSurfaceGeometry(entity, geometry, transform, updateBounds, rawPolylines, rawFills, color, materialDescriptor, makeMeta);
          break;
        }
        case 'PDFUNDERLAY':
        case 'DWFUNDERLAY':
        case 'DGNUNDERLAY':
        case 'UNDERLAYFRAME':
        case 'OVERLAYFRAME': {
          // External reference underlays - render as placeholder frame
          this._queueUnderlay(entity, geometry, transform, updateBounds, rawFills, rawTexts, highlightActive);
          break;
        }
        case 'OLE2FRAME':
        case 'OLEFRAME': {
          // OLE embedded objects - render bounding box as placeholder
          this._addOleFrameGeometry(entity, geometry, transform, updateBounds, rawPolylines, rawFills, rawTexts, color, resolvedLineweight, makeMeta);
          break;
        }
        case 'CAMERA': {
          // Camera entity - render as point with direction indicator
          if (geometry.position) {
            const projected = applyMatrix(transform, geometry.position);
            updateBounds(projected.x, projected.y);
            rawPoints.push({
              position: [projected.x, projected.y],
              color,
              size: Math.max(8, resolvedLineweight || 8),
              worldBounds: { minX: projected.x, minY: projected.y, maxX: projected.x, maxY: projected.y },
              meta: makeMeta({ geometryKind: 'point', family: 'camera' })
            });
            // Draw line from camera to target
            if (geometry.target) {
              const targetPt = applyMatrix(transform, geometry.target);
              updateBounds(targetPt.x, targetPt.y);
              rawPolylines.push({
                points: [projected, targetPt],
                color: this._adjustColorAlpha(color, 0.5, 0.3),
                lineweight: (resolvedLineweight || 1) * 0.5,
                worldBounds: this._computeBoundsFromPoints([projected, targetPt]),
                meta: makeMeta({ geometryKind: 'polyline', family: 'camera-direction' })
              });
            }
          }
          break;
        }
        case 'RTEXT': {
          // Reactive text - render as regular text (expression not evaluated)
          if (geometry.position) {
            const projected = applyMatrix(transform, geometry.position);
            updateBounds(projected.x, projected.y);
            rawTexts.push({
              text: geometry.text || '[RTEXT]',
              position: [projected.x, projected.y],
              height: geometry.height || 2.5,
              rotation: geometry.rotation || 0,
              color,
              halign: 'left',
              valign: 'baseline',
              meta: makeMeta({ geometryKind: 'text', family: 'rtext' })
            });
          }
          break;
        }
        case 'SUNSTUDY': {
          // Sun study - render marker at sun path origin if available
          break;
        }
        case 'GEOMCONSTRAINT': {
          // Geometric constraint - not visually rendered in model space
          break;
        }
        default: {
          break;
        }
      }
      };

      renderBlockContent = (blockName, matrix, depthValue, visitedStackValue, blockStackValue, highlightValue, parentUnits, styleOverrides, clipStackValue) => {
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
        const normalizedParentUnits = this._normalizeUnitsCode(
          parentUnits != null ? parentUnits : primaryUnits
        );
        const rawChildBlockUnits = this._lookupBlockUnits(resolvedName, blockUnitsLookup);
        const normalizedChildBlockUnits = this._normalizeUnitsCode(rawChildBlockUnits);
        const childUnits = normalizedChildBlockUnits != null
          ? (normalizedChildBlockUnits === 0 && defaultSourceUnits != null ? defaultSourceUnits : normalizedChildBlockUnits)
          : normalizedParentUnits;
        const header = blockRef.header || {};
        const basePoint = header.basePoint
          ? {
              x: Number.isFinite(header.basePoint.x) ? header.basePoint.x : 0,
              y: Number.isFinite(header.basePoint.y) ? header.basePoint.y : 0,
              z: Number.isFinite(header.basePoint.z) ? header.basePoint.z : 0
            }
          : { x: 0, y: 0, z: 0 };
        const baseTransform = translateMatrix(-basePoint.x, -basePoint.y, -basePoint.z);
        const blockLayoutMatrix = resolveBlockLayoutMatrix(resolvedName);
        const definitionTransform = blockLayoutMatrix
          ? multiplyMatrix(blockLayoutMatrix, baseTransform)
          : baseTransform;
        const initialMatrix = matrix ? matrix : identityMatrix();
        const composedMatrix = multiplyMatrix(initialMatrix, definitionTransform);
        blockRef.entities.forEach((child) => processEntity(
          child,
          composedMatrix,
          nextDepth,
          nextVisited,
          nextStack,
          highlightValue || false,
          childUnits,
          styleOverrides || null,
          clipStackValue || null
        ));
      };

      const processModelSpace = sceneGraph.modelSpace || [];
      processModelSpace.forEach((entity) => {
        const baseMatrix = resolveBaseMatrixForEntity(entity);
        processEntity(entity, baseMatrix, 0, [], [], false, primaryUnits, null, null);
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

    _resolveColor(entity, styleState = null) {
      const defaultColor = { r: 0.82, g: 0.89, b: 1.0, a: 1.0, css: 'rgba(210, 227, 255, 1)' };
      if (!entity) return defaultColor;
      const overrideColor = styleState && styleState.color ? styleState.color : null;

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

      if (entity.color && entity.color.type === 'byBlock') {
        if (overrideColor) {
          return cloneColor(overrideColor);
        }
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

    _resolveLineweight(entity, styleState = null) {
      if (!entity) {
        return null;
      }
      const explicit = Number(entity.lineweight);
      const overrideLineweight = styleState && Number.isFinite(styleState.lineweight)
        ? styleState.lineweight
        : null;
      if (Number.isFinite(explicit) && explicit > 0) {
        return explicit;
      }
      if (explicit === -2 && Number.isFinite(overrideLineweight) && overrideLineweight > 0) {
        return overrideLineweight;
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

    _resolveLinetype(entity, tables, styleState = null) {
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

      const resolveOverrideEntry = () => {
        if (!styleState) {
          return null;
        }
        if (styleState.linetypeEntry) {
          return styleState.linetypeEntry;
        }
        if (styleState.linetypeName) {
          return lookupEntry(styleState.linetypeName);
        }
        return null;
      };

      let entry = null;
      if (!isByLayer && !isByBlock) {
        entry = entity.resolved && entity.resolved.linetype
          ? entity.resolved.linetype
          : lookupEntry(directName);
      } else if (isByBlock) {
        const override = resolveOverrideEntry();
        if (override) {
          entry = override;
        }
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

    _normalizeUnitsCode(code) {
      if (code == null) {
        return null;
      }
      const numeric = Number(code);
      if (!Number.isFinite(numeric)) {
        return null;
      }
      const coerced = Math.trunc(numeric);
      return Number.isFinite(coerced) ? coerced : null;
    }

    _unitFactorFromCode(code) {
      const normalized = this._normalizeUnitsCode(code);
      if (normalized == null) {
        return 1;
      }
      const factors = {
        0: 1, // Unitless
        1: 0.0254, // Inches
        2: 0.3048, // Feet
        3: 1609.344, // Miles
        4: 0.001, // Millimeters
        5: 0.01, // Centimeters
        6: 1, // Meters
        7: 1000, // Kilometers
        8: 2.54e-7, // Micro-inches
        9: 2.54e-5, // Mils (thousandth of inch)
        10: 0.9144, // Yards
        11: 1e-10, // Angstroms
        12: 1e-9, // Nanometers
        13: 1e-6, // Micrometers
        14: 0.1, // Decimeters
        15: 10, // Decameters
        16: 100, // Hectometers
        17: 1e9, // Gigameters
        18: 1.495978707e11, // Astronomical units
        19: 9.460730472e15, // Light years
        20: 3.085677582e16, // Parsecs
        21: 0.3048006096012192 // US Survey Feet
      };
      if (Object.prototype.hasOwnProperty.call(factors, normalized)) {
        return factors[normalized];
      }
      return 1;
    }

    _unitConversionFactor(sourceCode, targetCode) {
      const sourceFactor = this._unitFactorFromCode(sourceCode);
      const targetFactor = this._unitFactorFromCode(targetCode);
      if (!Number.isFinite(sourceFactor) || !Number.isFinite(targetFactor) || targetFactor === 0) {
        return 1;
      }
      return sourceFactor / targetFactor;
    }

    _buildBlockUnitsLookup(blockRecords = {}, blockMetadata = {}) {
      const lookup = new Map();
      const assign = (key, units) => {
        if (key == null || units == null) {
          return;
        }
        const trimmed = String(key).trim();
        if (!trimmed) {
          return;
        }
        lookup.set(trimmed, units);
        lookup.set(trimmed.toUpperCase(), units);
      };
      const assignHandle = (handle, units) => {
        const normalized = this._normalizeHandle(handle);
        if (!normalized || units == null) {
          return;
        }
        lookup.set(normalized, units);
      };

      Object.keys(blockRecords).forEach((name) => {
        const record = blockRecords[name];
        if (!record || !Number.isFinite(record.units)) {
          return;
        }
        assign(record.name || name, record.units);
        assign(name, record.units);
        assignHandle(record.handle, record.units);
      });

      if (blockMetadata && typeof blockMetadata === 'object') {
        Object.keys(blockMetadata).forEach((name) => {
          const entry = blockMetadata[name];
          if (!entry || !Number.isFinite(entry.units)) {
            return;
          }
          assign(entry.name || name, entry.units);
          assign(name, entry.units);
          assignHandle(entry.handle, entry.units);
        });
      }

      return lookup;
    }

    _lookupBlockUnits(blockName, lookup) {
      if (!lookup || !blockName) {
        return null;
      }
      const raw = String(blockName).trim();
      if (!raw) {
        return null;
      }
      if (lookup.has(raw)) {
        return lookup.get(raw);
      }
      const upper = raw.toUpperCase();
      if (lookup.has(upper)) {
        return lookup.get(upper);
      }
      const normalized = this._normalizeHandle(raw);
      if (normalized && lookup.has(normalized)) {
        return lookup.get(normalized);
      }
      return null;
    }

    _resolveDimensionStyleMetrics(entity) {
      const defaults = {
        scale: 1,
        arrowSize: null,
        textHeight: null,
        textGap: null,
        extensionOffset: null,
        extensionExtension: null
      };
      if (!entity || !entity.resolved || !entity.resolved.dimensionStyle) {
        return defaults;
      }
      const style = entity.resolved.dimensionStyle;
      const lookup = style.codeValues || {};
      const pickFloat = (code) => {
        const values = lookup[code] ?? lookup[String(code)];
        if (values == null) {
          return null;
        }
        if (Array.isArray(values)) {
          for (let i = 0; i < values.length; i += 1) {
            const candidate = parseFloat(values[i]);
            if (Number.isFinite(candidate)) {
              return candidate;
            }
          }
          return null;
        }
        const numeric = parseFloat(values);
        return Number.isFinite(numeric) ? numeric : null;
      };

      const scale = pickFloat(40) ?? 1;
      const arrowBase = pickFloat(41);
      const textHeightBase = pickFloat(140);
      const textGapBase = pickFloat(147);
      const extensionOffsetBase = pickFloat(42);
      const extensionExtensionBase = pickFloat(44);

      return {
        scale,
        arrowSize: arrowBase != null ? arrowBase * scale : null,
        textHeight: textHeightBase != null ? textHeightBase * scale : null,
        textGap: textGapBase != null ? textGapBase * scale : null,
        extensionOffset: extensionOffsetBase != null ? extensionOffsetBase * scale : null,
        extensionExtension: extensionExtensionBase != null ? extensionExtensionBase * scale : null
      };
    }

    _resolveDimensionMeasurementFactor(options = {}) {
      const { geometry, entity, contextUnits } = options || {};
      let factor = 1;
      const applyFactor = (value) => {
        if (!Number.isFinite(value) || value === 0) {
          return;
        }
        factor *= value;
      };

      const style = entity && entity.resolved ? entity.resolved.dimensionStyle : null;
      const styleParameters = style && style.parameters ? style.parameters : null;

      const dimensionSubtype = geometry && Number.isFinite(geometry.dimensionSubtype)
        ? geometry.dimensionSubtype
        : (geometry && Number.isFinite(geometry.dimensionType)
          ? (geometry.dimensionType & 7)
          : null);
      const isAngular = dimensionSubtype === 2 || dimensionSubtype === 5;

      if (!isAngular) {
        if (geometry && Number.isFinite(geometry.dimensionLinearFactor)) {
          applyFactor(geometry.dimensionLinearFactor);
        } else if (styleParameters && Number.isFinite(styleParameters.linearFactor)) {
          applyFactor(styleParameters.linearFactor);
        }

        if (geometry && Number.isFinite(geometry.dimensionScaleFactor)) {
          applyFactor(geometry.dimensionScaleFactor);
        } else if (styleParameters && Number.isFinite(styleParameters.overallScale)) {
          applyFactor(styleParameters.overallScale);
        }

        const geometryUnits = geometry && geometry.units ? geometry.units : null;
        const sourceUnits = geometryUnits && geometryUnits.insUnits != null
          ? geometryUnits.insUnits
          : null;
        const targetUnits = geometryUnits && geometryUnits.insUnitsTarget != null
          ? geometryUnits.insUnitsTarget
          : null;

        if (sourceUnits != null && targetUnits != null && sourceUnits !== targetUnits) {
          applyFactor(this._unitConversionFactor(sourceUnits, targetUnits));
        } else if (sourceUnits != null && contextUnits != null && sourceUnits !== contextUnits) {
          applyFactor(this._unitConversionFactor(sourceUnits, contextUnits));
        }
      }

      return factor;
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

    _renderDimensionArrow(options = {}) {
      const descriptor = options.descriptor || { kind: 'open' };
      const {
        tip,
        toward,
        size,
        transform,
        updateBounds,
        polylineCollector,
        color,
        weight,
        metaFactory,
        lineweight,
        renderBlockContent,
        getBlockNameByHandle,
        depth = 0,
        visitedBlocks = [],
        blockStack = [],
        highlight = false,
        contextUnits
      } = options;
      if (!tip || !toward) {
        return;
      }
      switch (descriptor.kind) {
        case 'tick':
          this._addDimensionTickHead(tip, toward, size, transform, updateBounds, polylineCollector, color, weight, metaFactory, lineweight);
          return;
        case 'block': {
          const success = this._addDimensionArrowBlock({
            tip,
            toward,
            size,
            transform,
            renderBlockContent,
            getBlockNameByHandle,
            handle: descriptor.handle,
            depth,
            visitedBlocks,
            blockStack,
            highlight,
            contextUnits
          });
          if (success) {
            return;
          }
          break;
        }
        default:
          break;
      }
      this._addDimensionArrowHead(tip, toward, size, transform, updateBounds, polylineCollector, color, weight, metaFactory, lineweight);
    }

    _addDimensionTickHead(tip, toward, size, transform, updateBounds, polylineCollector, color, weight, metaFactory, lineweight) {
      if (!tip || !toward || !Number.isFinite(size) || size <= 0) {
        return;
      }
      const direction = { x: toward.x - tip.x, y: toward.y - tip.y };
      const length = this._vectorLength(direction);
      if (length < 1e-6) {
        return;
      }
      const unit = { x: direction.x / length, y: direction.y / length };
      const cos = Math.cos(Math.PI / 4);
      const sin = Math.sin(Math.PI / 4);
      const rotated = {
        x: unit.x * cos - unit.y * sin,
        y: unit.x * sin + unit.y * cos
      };
      const offset = { x: rotated.x * size, y: rotated.y * size };
      const start = { x: tip.x - offset.x, y: tip.y - offset.y };
      const end = { x: tip.x + offset.x, y: tip.y + offset.y };
      const transformed = transformPoints([start, end], transform);
      transformed.forEach((pt) => updateBounds(pt.x, pt.y));
      polylineCollector.push({
        points: transformed,
        color,
        lineweight,
        weight: weight || 1,
        worldBounds: this._computeBoundsFromPoints(transformed),
        meta: typeof metaFactory === 'function'
          ? metaFactory({ geometryKind: 'polyline', dimensionPart: 'arrowhead' })
          : null
      });
    }

    _addDimensionArrowBlock(options = {}) {
      const {
        tip,
        toward,
        size,
        transform,
        renderBlockContent,
        getBlockNameByHandle,
        handle,
        depth = 0,
        visitedBlocks = [],
        blockStack = [],
        highlight = false,
        contextUnits
      } = options;
      if (!tip || !toward || !handle) {
        return false;
      }
      if (typeof renderBlockContent !== 'function' || typeof getBlockNameByHandle !== 'function') {
        return false;
      }
      const direction = { x: toward.x - tip.x, y: toward.y - tip.y };
      const length = this._vectorLength(direction);
      if (length < 1e-6) {
        return false;
      }
      const blockName = getBlockNameByHandle(handle);
      if (!blockName) {
        return false;
      }
      const rotation = Math.atan2(direction.y, direction.x);
      const scaleFactor = Number.isFinite(size) && size !== 0 ? size : length;
      const localScale = scaleMatrix(scaleFactor, scaleFactor);
      const localRotation = rotateMatrix(rotation);
      const localTranslation = translateMatrix(tip.x, tip.y, tip.z || 0);
      const composed = multiplyMatrix(transform, multiplyMatrix(localTranslation, multiplyMatrix(localRotation, localScale)));
      renderBlockContent(blockName, composed, depth + 1, visitedBlocks, blockStack, highlight, contextUnits, null, null);
      return true;
    }

    _buildDimensionArcPoints(center, start, end, options = {}) {
      if (!center || !start || !end) {
        return null;
      }
      const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
      const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
      let sweep = endAngle - startAngle;
      if (options.clockwise) {
        while (sweep > 0) {
          sweep -= Math.PI * 2;
        }
      } else {
        while (sweep < 0) {
          sweep += Math.PI * 2;
        }
      }
      if (Math.abs(sweep) < 1e-6) {
        return [start, end];
      }
      const segments = Math.max(4, Number.isFinite(options.segments) ? options.segments : Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
      const radius = Math.hypot(start.x - center.x, start.y - center.y);
      if (!(radius > 1e-6)) {
        return [start, end];
      }
      const step = sweep / segments;
      const points = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = startAngle + step * i;
        points.push({
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius
        });
      }
      return points;
    }

    _addCenterMark(center, size, transform, updateBounds, polylineCollector, color, metaFactory, lineweight) {
      if (!center || !Number.isFinite(size) || size <= 0) {
        return;
      }
      const half = size * 0.5;
      const segments = [
        [
          { x: center.x - half, y: center.y },
          { x: center.x + half, y: center.y }
        ],
        [
          { x: center.x, y: center.y - half },
          { x: center.x, y: center.y + half }
        ]
      ];
      segments.forEach((segment) => {
        const transformed = transformPoints(segment, transform);
        transformed.forEach((pt) => updateBounds(pt.x, pt.y));
        polylineCollector.push({
          points: transformed,
          color,
          lineweight,
          weight: this._lineweightToPx(lineweight),
          worldBounds: this._computeBoundsFromPoints(transformed),
          meta: typeof metaFactory === 'function'
            ? metaFactory({ geometryKind: 'polyline', dimensionPart: 'centerMark' })
            : null
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
        highlightActive,
        contextUnits
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
                const blockTransform = multiplyMatrix(
                  baseTransform,
                  translateMatrix(
                    localBlockOrigin.x,
                    localBlockOrigin.y,
                    localBlockOrigin.z || 0
                  )
                );
                renderBlockContent(
                  blockName,
                  blockTransform,
                  (depth || 0) + 1,
                  visitedBlocks || [],
                  blockStack || [],
                  !!highlightActive,
                  contextUnits,
                  null,
                  null
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
        highlightActive,
        contextUnits
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
          const contentTransform = multiplyMatrix(
            transform,
            translateMatrix(anchorPoint.x, anchorPoint.y, anchorPoint.z || 0)
          );
          renderBlockContent(blockName, contentTransform, depth, visitedBlocks, blockStack, highlightActive, contextUnits, null, null);
        }
      }
    }

    _calculateDimensionMeasurement(geometry, options = {}) {
      if (!geometry) {
        return null;
      }
      const type = geometry.dimensionType & 7;
      const distance = (a, b) => {
        if (!a || !b) return null;
        return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
      };

      let measurement = null;

      switch (type) {
        case 0:
        case 1: {
          const p1 = geometry.extensionLine1Point || geometry.definitionPoint;
          const p2 = geometry.extensionLine2Point || geometry.dimensionLinePoint;
          measurement = distance(p1, p2);
          break;
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
            measurement = Math.abs(Math.atan2(det, dot)) * 180 / Math.PI;
          }
          break;
        }
        case 3: {
          const a1 = geometry.arrow1Point || geometry.definitionPoint;
          const a2 = geometry.arrow2Point || geometry.dimensionLinePoint;
          measurement = distance(a1, a2);
          break;
        }
        case 4: {
          const center = geometry.definitionPoint || geometry.dimensionLinePoint;
          const tip = geometry.arrow1Point || geometry.dimensionLinePoint;
          measurement = distance(center, tip);
          break;
        }
        case 6: {
          const origin = geometry.definitionPoint;
          const leader = geometry.dimensionLinePoint || geometry.arrow1Point;
          if (origin && leader) {
            const dx = leader.x - origin.x;
            const dy = leader.y - origin.y;
            const ordinateType = Number.isFinite(geometry.ordinateType) ? geometry.ordinateType : null;
            let component = null;
            if (ordinateType === 1) {
              component = dx;
            } else if (ordinateType === 2) {
              component = dy;
            } else {
              component = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
            }
            measurement = Math.abs(component != null ? component : 0);
          }
          break;
        }
        default:
          break;
      }

      if (!Number.isFinite(measurement) && geometry.measurement != null) {
        measurement = geometry.measurement;
      }

      if (!Number.isFinite(measurement)) {
        return geometry.measurement != null ? geometry.measurement : null;
      }

      const factor = this._resolveDimensionMeasurementFactor({
        geometry,
        entity: options.entity || null,
        contextUnits: options.contextUnits != null ? options.contextUnits : null
      });
      if (Number.isFinite(factor) && factor !== 1) {
        measurement *= factor;
      }
      return measurement;
    }

    _formatDimensionLabel(geometry, options = {}) {
      if (!geometry) {
        return '';
      }
      const measurementValue = this._calculateDimensionMeasurement(geometry, options);
      const preferredValue = geometry.measurement != null ? geometry.measurement : measurementValue;
      const formattedMeasurement = preferredValue != null
        ? this._formatDimensionMeasurement(preferredValue, geometry, options)
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

    _formatDimensionMeasurement(value, geometry, options = {}) {
      if (!Number.isFinite(value)) {
        return '';
      }
      const entity = options.entity || null;
      const styleInfo = entity && entity.resolved ? entity.resolved.dimensionStyle : null;
      const measurementSettings = options.measurementSettings
        || (geometry && geometry.dimensionMeasurementSettings)
        || (styleInfo && styleInfo.measurement)
        || {};
      const styleParameters = options.styleParameters
        || (styleInfo && styleInfo.parameters)
        || null;
      const alternateSettings = options.alternateSettings
        || (geometry && geometry.dimensionAlternateUnits)
        || (styleInfo && styleInfo.alternateUnits)
        || null;
      const textOverrides = options.textOverrides
        || (geometry && geometry.dimensionTextOverrides)
        || (styleInfo && styleInfo.text)
        || null;
      const measurementUnitsCode = this._resolveMeasurementUnitsCode(
        geometry,
        options.contextUnits != null ? options.contextUnits : null
      );
      const type = geometry ? (geometry.dimensionType & 7) : 0;
      const dimensionPrefix = type === 3
        ? '\u2300'
        : (type === 4 ? 'R' : '');

      if (type === 2 || type === 5) {
        return this._formatAngularMeasurement(value, {
          geometry,
          measurementSettings,
          styleParameters,
          textOverrides,
          measurementUnitsCode,
          contextUnits: options.contextUnits != null ? options.contextUnits : null
        });
      }

      const primaryLines = this._buildPrimaryMeasurementLines(value, {
        geometry,
        measurementSettings,
        styleParameters,
        textOverrides,
        dimensionPrefix,
        measurementUnitsCode,
        contextUnits: options.contextUnits != null ? options.contextUnits : null
      });

      const alternateLines = this._buildAlternateMeasurementLines(value, {
        geometry,
        measurementSettings,
        alternateSettings,
        styleParameters,
        textOverrides,
        dimensionPrefix,
        measurementUnitsCode,
        contextUnits: options.contextUnits != null ? options.contextUnits : null
      });

      const lines = primaryLines.concat(alternateLines);
      return lines.join('\n');
    }

    _buildPrimaryMeasurementLines(value, context = {}) {
      const measurementSettings = context.measurementSettings || {};
      const textOverrides = context.textOverrides || {};
      const numericString = this._formatLinearValue(value, measurementSettings, context);
      const baseValueString = (context.dimensionPrefix || '') + numericString;
      return this._buildToleranceLines({
        value,
        baseValueString,
        measurementSettings,
        styleParameters: context.styleParameters || null,
        geometry: context.geometry || null,
        textPattern: textOverrides.primary || null,
        measurementUnitsCode: context.measurementUnitsCode || null,
        toleranceMultiplier: 1,
        formatValue: (val, opts = {}) => {
          const settings = opts.measurementSettings || measurementSettings;
          const localContext = Object.assign({}, context, opts, {
            measurementSettings: settings
          });
          const formatted = this._formatLinearValue(val, settings, localContext);
          if (opts.skipPrefix) {
            return formatted;
          }
          return (context.dimensionPrefix || '') + formatted;
        }
      });
    }

    _buildAlternateMeasurementLines(value, context = {}) {
      const alternateSettings = context.alternateSettings;
      if (!alternateSettings || !alternateSettings.enabled) {
        return [];
      }
      const measurementSettings = context.measurementSettings || {};
      const styleParameters = context.styleParameters || null;
      const textOverrides = context.textOverrides || {};
      const multiplier = Number.isFinite(alternateSettings.multiplier) && alternateSettings.multiplier !== 0
        ? alternateSettings.multiplier
        : (styleParameters && Number.isFinite(styleParameters.alternateUnitScale)
          ? styleParameters.alternateUnitScale
          : 1);
      const alternateUnitFormat = alternateSettings.format != null
        ? alternateSettings.format
        : (measurementSettings.alternateUnitFormat != null ? measurementSettings.alternateUnitFormat : measurementSettings.linearUnitFormat);
      const alternatePrecision = alternateSettings.precision != null
        ? alternateSettings.precision
        : (measurementSettings.alternateUnitPrecision != null ? measurementSettings.alternateUnitPrecision : measurementSettings.linearPrecision);
      const altZeroSuppression = alternateSettings.zeroSuppression != null
        ? alternateSettings.zeroSuppression
        : (measurementSettings.alternateZeroSuppression != null ? measurementSettings.alternateZeroSuppression : measurementSettings.zeroSuppression);
      const altTolerancePrecision = alternateSettings.tolerancePrecision != null
        ? alternateSettings.tolerancePrecision
        : (measurementSettings.alternateTolerancePrecision != null ? measurementSettings.alternateTolerancePrecision : measurementSettings.tolerancePrecision);
      const altToleranceZeroSuppression = alternateSettings.toleranceZeroSuppression != null
        ? alternateSettings.toleranceZeroSuppression
        : (measurementSettings.alternateToleranceZeroSuppression != null ? measurementSettings.alternateToleranceZeroSuppression : measurementSettings.toleranceZeroSuppression);

      const altMeasurementSettings = Object.assign({}, measurementSettings, {
        linearUnitFormat: alternateUnitFormat,
        linearPrecision: alternatePrecision,
        zeroSuppression: altZeroSuppression,
        tolerancePrecision: altTolerancePrecision,
        toleranceZeroSuppression: altToleranceZeroSuppression
      });

      const altValue = value * multiplier;
      const numericString = this._formatLinearValue(altValue, altMeasurementSettings, Object.assign({}, context, {
        measurementSettings: altMeasurementSettings,
        isAlternate: true
      }));
      const baseValueString = (context.dimensionPrefix || '') + numericString;
      const toleranceLines = this._buildToleranceLines({
        value: altValue,
        baseValueString,
        measurementSettings: altMeasurementSettings,
        styleParameters,
        geometry: context.geometry || null,
        textPattern: textOverrides.alternate || null,
        measurementUnitsCode: context.measurementUnitsCode || null,
        toleranceMultiplier: multiplier,
        formatValue: (val, opts = {}) => {
          const settings = opts.measurementSettings || altMeasurementSettings;
          const localContext = Object.assign({}, context, opts, {
            measurementSettings: settings,
            isAlternate: true
          });
          const formatted = this._formatLinearValue(val, settings, localContext);
          if (opts.skipPrefix) {
            return formatted;
          }
          return (context.dimensionPrefix || '') + formatted;
        }
      });

      if (!(textOverrides && textOverrides.alternate)) {
        if (toleranceLines.length === 0) {
          toleranceLines.push(`[${baseValueString}]`);
        } else {
          for (let i = 0; i < toleranceLines.length; i += 1) {
            const line = toleranceLines[i];
            toleranceLines[i] = line != null && String(line).startsWith('[')
              ? line
              : `[${line}]`;
          }
        }
      }

      return toleranceLines;
    }

    _buildToleranceLines(config = {}) {
      const measurementSettings = config.measurementSettings || {};
      const styleParameters = config.styleParameters || null;
      const geometry = config.geometry || null;
      const textPattern = config.textPattern || null;
      const formatValue = typeof config.formatValue === 'function'
        ? config.formatValue
        : ((val) => String(val));
      const toleranceMultiplier = Number.isFinite(config.toleranceMultiplier)
        ? config.toleranceMultiplier
        : 1;
      const baseLine = this._applyDimensionTextPattern(
        config.baseValueString != null ? config.baseValueString : '',
        textPattern
      );
      if (!measurementSettings.toleranceEnabled) {
        return [baseLine];
      }

      const toleranceScaleBase = geometry && Number.isFinite(geometry.dimensionToleranceScale)
        ? geometry.dimensionToleranceScale
        : (styleParameters && Number.isFinite(styleParameters.toleranceScale)
          ? styleParameters.toleranceScale
          : 1);
      const toleranceScale = toleranceScaleBase * toleranceMultiplier;
      const rawUpper = geometry && Number.isFinite(geometry.dimensionToleranceUpper)
        ? geometry.dimensionToleranceUpper
        : (styleParameters && Number.isFinite(styleParameters.tolerancePlus) ? styleParameters.tolerancePlus : 0);
      const rawLower = geometry && Number.isFinite(geometry.dimensionToleranceLower)
        ? geometry.dimensionToleranceLower
        : (styleParameters && Number.isFinite(styleParameters.toleranceMinus) ? styleParameters.toleranceMinus : 0);
      const tolUpper = (Number.isFinite(rawUpper) ? rawUpper : 0) * toleranceScale;
      const tolLower = (Number.isFinite(rawLower) ? rawLower : 0) * toleranceScale;

      const epsilon = 1e-9;
      if (!(Math.abs(tolUpper) > epsilon || Math.abs(tolLower) > epsilon)) {
        return [baseLine];
      }

      const tolerancePrecision = measurementSettings.tolerancePrecision != null
        ? measurementSettings.tolerancePrecision
        : measurementSettings.linearPrecision;
      const toleranceMeasurementSettings = Object.assign({}, measurementSettings);
      if (tolerancePrecision != null) {
        toleranceMeasurementSettings.linearPrecision = tolerancePrecision;
      }
      if (measurementSettings.toleranceZeroSuppression != null) {
        toleranceMeasurementSettings.zeroSuppression = measurementSettings.toleranceZeroSuppression;
      }

      const lines = [];
      if (measurementSettings.limitsEnabled) {
        const upperValue = config.value + tolUpper;
        const lowerValue = config.value - tolLower;
        const upperStr = formatValue(upperValue, { measurementSettings: toleranceMeasurementSettings });
        const lowerStr = formatValue(lowerValue, { measurementSettings: toleranceMeasurementSettings });
        lines.push(this._applyDimensionTextPattern(upperStr, textPattern));
        lines.push(this._applyDimensionTextPattern(lowerStr, textPattern));
        return lines;
      }

      lines.push(baseLine);

      if (Math.abs(tolUpper) > epsilon) {
        const plusStr = formatValue(tolUpper, {
          measurementSettings: toleranceMeasurementSettings,
          isTolerance: true,
          skipPrefix: true
        });
        if (plusStr !== '') {
          lines.push(`+${plusStr}`);
        }
      }

      if (Math.abs(tolLower) > epsilon) {
        const minusStr = formatValue(tolLower, {
          measurementSettings: toleranceMeasurementSettings,
          isTolerance: true,
          skipPrefix: true
        });
        if (minusStr !== '') {
          lines.push(`-${minusStr}`);
        }
      }

      return lines;
    }

    _applyDimensionTextPattern(valueString, pattern) {
      const base = valueString != null ? String(valueString) : '';
      if (!pattern) {
        return base;
      }
      if (pattern.includes('<>')) {
        return pattern.replace(/<>/g, base);
      }
      return `${base}${pattern}`;
    }

    _formatLinearValue(value, measurementSettings = {}, context = {}) {
      if (!Number.isFinite(value)) {
        return '';
      }
      const unitFormat = Number.isFinite(measurementSettings.linearUnitFormat)
        ? measurementSettings.linearUnitFormat
        : 1;
      const precision = Number.isFinite(measurementSettings.linearPrecision)
        ? measurementSettings.linearPrecision
        : 3;
      const zeroSuppression = Number.isFinite(measurementSettings.zeroSuppression)
        ? measurementSettings.zeroSuppression
        : 0;

      switch (unitFormat) {
        case 0:
          return this._formatScientificLinearValue(value, precision, zeroSuppression);
        case 2:
          return this._formatEngineeringValue(value, precision, zeroSuppression, context);
        case 3:
          return this._formatArchitecturalValue(value, precision, zeroSuppression, context);
        case 4:
          return this._formatFractionalValue(value, precision, zeroSuppression, context);
        default:
          return this._formatDecimalLinearValue(value, precision, zeroSuppression, context);
      }
    }

    _formatDecimalLinearValue(value, precision, zeroSuppression, context = {}) {
      if (!Number.isFinite(value)) {
        return '';
      }
      const decimalPlaces = Number.isFinite(precision) && precision >= 0 ? precision : 3;
      let formatted = value.toFixed(decimalPlaces);
      if ((zeroSuppression & 2) === 2) {
        formatted = this._trimTrailingZeros(formatted);
      }
      if ((zeroSuppression & 1) === 1) {
        formatted = formatted.replace(/^(-?)0\./, '$1.');
      }
      return formatted;
    }

    _formatScientificLinearValue(value, precision, zeroSuppression) {
      if (!Number.isFinite(value)) {
        return '';
      }
      const expPrecision = Number.isFinite(precision) && precision >= 0 ? precision : 3;
      let formatted = value.toExponential(expPrecision);
      if ((zeroSuppression & 1) === 1) {
        formatted = formatted.replace(/^(-?)0\./, '$1.');
      }
      return formatted;
    }

    _formatEngineeringValue(value, precision, zeroSuppression, context = {}) {
      if (!Number.isFinite(value)) {
        return '';
      }
      const inches = this._convertLinearValue(value, context.measurementUnitsCode, 1);
      if (!Number.isFinite(inches)) {
        return '';
      }
      const sign = inches < 0 ? -1 : 1;
      let abs = Math.abs(inches);
      let feet = Math.floor(abs / 12);
      abs -= feet * 12;
      const inchString = this._formatDecimalLinearValue(abs, precision, zeroSuppression, context);
      const suppressFeet = (zeroSuppression & 4) === 4 && feet === 0;
      const suppressInches = (zeroSuppression & 8) === 8 && Math.abs(abs) < 1e-9;
      const signPrefix = sign < 0 ? '-' : '';
      const parts = [];
      if (!suppressFeet) {
        parts.push(`${feet}'`);
      }
      if (!suppressInches) {
        const inchPart = `${inchString}"`;
        if (!suppressFeet) {
          parts[parts.length - 1] = `${parts[parts.length - 1]}-${inchPart}`;
        } else {
          parts.push(inchPart);
        }
      }
      if (!parts.length) {
        parts.push('0"');
      }
      return signPrefix + parts.join('');
    }

    _formatArchitecturalValue(value, precision, zeroSuppression, context = {}) {
      if (!Number.isFinite(value)) {
        return '';
      }
      const inches = this._convertLinearValue(value, context.measurementUnitsCode, 1);
      if (!Number.isFinite(inches)) {
        return '';
      }
      const sign = inches < 0 ? -1 : 1;
      let abs = Math.abs(inches);
      let feet = Math.floor(abs / 12);
      abs -= feet * 12;
      let wholeInches = Math.floor(abs);
      let fractional = abs - wholeInches;
      const denominator = Math.pow(2, Math.min(Math.max(precision, 0) + 1, 8));
      let numerator = Math.round(fractional * denominator);
      if (numerator === denominator) {
        numerator = 0;
        wholeInches += 1;
        if (wholeInches >= 12) {
          feet += 1;
          wholeInches = 0;
        }
      }
      const fraction = this._formatFraction(numerator, denominator);
      const suppressFeet = (zeroSuppression & 4) === 4 && feet === 0;
      const suppressInches = (zeroSuppression & 8) === 8 && wholeInches === 0 && !fraction;
      const signPrefix = sign < 0 ? '-' : '';

      const inchParts = [];
      if (!suppressInches) {
        inchParts.push(String(wholeInches));
      }
      if (fraction) {
        inchParts.push(fraction);
      }
      let inchString = inchParts.join(inchParts.length > 1 ? ' ' : '');
      if (!inchString && fraction) {
        inchString = fraction;
      }
      if (inchString) {
        inchString += '"';
      }

      const parts = [];
      if (!suppressFeet) {
        parts.push(`${feet}'`);
      }
      if (inchString) {
        if (!suppressFeet) {
          parts[parts.length - 1] = `${parts[parts.length - 1]}-${inchString}`;
        } else {
          parts.push(inchString);
        }
      }
      if (!parts.length) {
        parts.push('0"');
      }
      return signPrefix + parts.join('');
    }

    _formatFractionalValue(value, precision, zeroSuppression, context = {}) {
      if (!Number.isFinite(value)) {
        return '';
      }
      const inches = this._convertLinearValue(value, context.measurementUnitsCode, 1);
      if (!Number.isFinite(inches)) {
        return '';
      }
      const sign = inches < 0 ? -1 : 1;
      const abs = Math.abs(inches);
      let whole = Math.floor(abs);
      let fractional = abs - whole;
      const denominator = Math.pow(2, Math.min(Math.max(precision, 0) + 1, 8));
      let numerator = Math.round(fractional * denominator);
      if (numerator === denominator) {
        numerator = 0;
        whole += 1;
      }
      const fraction = this._formatFraction(numerator, denominator);
      const suppressInches = (zeroSuppression & 8) === 8 && whole === 0 && !fraction;
      const signPrefix = sign < 0 ? '-' : '';
      const parts = [];
      if (!suppressInches) {
        parts.push(String(whole));
      }
      if (fraction) {
        parts.push(fraction);
      }
      if (!parts.length) {
        parts.push('0');
      }
      return `${signPrefix}${parts.join(parts.length > 1 ? ' ' : '')}"`;
    }

    _formatFraction(numerator, denominator) {
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        return '';
      }
      if (numerator === 0) {
        return '';
      }
      const absNumerator = Math.abs(numerator);
      const absDenominator = Math.abs(denominator);
      const divisor = this._gcd(absNumerator, absDenominator);
      return `${absNumerator / divisor}/${absDenominator / divisor}`;
    }

    _gcd(a, b) {
      let x = Math.abs(a);
      let y = Math.abs(b);
      while (y) {
        const temp = y;
        y = x % y;
        x = temp;
      }
      return x || 1;
    }

    _convertLinearValue(value, fromUnitCode, toUnitCode) {
      if (!Number.isFinite(value)) {
        return value;
      }
      const source = this._normalizeUnitsCode(fromUnitCode);
      const target = this._normalizeUnitsCode(toUnitCode);
      if (source == null || target == null || source === target) {
        return value;
      }
      const factor = this._unitConversionFactor(source, target);
      return value * factor;
    }

    _resolveMeasurementUnitsCode(geometry, contextUnits) {
      if (geometry && geometry.units) {
        if (geometry.units.insUnitsTarget != null) {
          return this._normalizeUnitsCode(geometry.units.insUnitsTarget);
        }
        if (geometry.units.insUnits != null) {
          return this._normalizeUnitsCode(geometry.units.insUnits);
        }
      }
      if (contextUnits != null) {
        return this._normalizeUnitsCode(contextUnits);
      }
      return null;
    }

    _formatAngularMeasurement(value, context = {}) {
      const measurementSettings = context.measurementSettings || {};
      const textOverrides = context.textOverrides || {};
      const baseValueString = this._formatAngularValueString(value, {
        format: measurementSettings.angularUnitFormat,
        precision: measurementSettings.angularPrecision,
        zeroSuppression: measurementSettings.angularZeroSuppression
      });
      const lines = this._buildToleranceLines({
        value,
        baseValueString,
        measurementSettings,
        styleParameters: context.styleParameters || null,
        geometry: context.geometry || null,
        textPattern: textOverrides.primary || null,
        measurementUnitsCode: context.measurementUnitsCode || null,
        toleranceMultiplier: 1,
        formatValue: (val, opts = {}) => {
          const precision = opts.precision != null ? opts.precision : measurementSettings.angularPrecision;
          return this._formatAngularValueString(val, {
            format: measurementSettings.angularUnitFormat,
            precision,
            zeroSuppression: measurementSettings.angularZeroSuppression
          });
        }
      });
      return lines.join('\n');
    }

    _formatAngularValueString(value, options = {}) {
      if (!Number.isFinite(value)) {
        return '';
      }
      const format = Number.isFinite(options.format) ? options.format : 0;
      const precision = Number.isFinite(options.precision) ? options.precision : 2;
      const zeroSuppression = Number.isFinite(options.zeroSuppression) ? options.zeroSuppression : 0;

      switch (format) {
        case 1:
          return this._formatDegMinValue(value, precision, zeroSuppression);
        case 2:
          return this._formatDegMinSecValue(value, precision, zeroSuppression);
        case 3:
          return this._formatGradientValue(value, precision, zeroSuppression);
        case 4:
          return this._formatRadianValue(value, precision, zeroSuppression);
        default:
          return this._formatDecimalAngularValue(value, precision, zeroSuppression);
      }
    }

    _formatDecimalAngularValue(value, precision, zeroSuppression) {
      const formatted = this._formatDecimalLinearValue(value, precision, zeroSuppression);
      return `${formatted}\u00B0`;
    }

    _formatGradientValue(value, precision, zeroSuppression) {
      const grads = value * (200 / 180);
      return `${this._formatDecimalLinearValue(grads, precision, zeroSuppression)}g`;
    }

    _formatRadianValue(value, precision, zeroSuppression) {
      const radians = value * (Math.PI / 180);
      return `${this._formatDecimalLinearValue(radians, precision, zeroSuppression)}rad`;
    }

    _formatDegMinValue(value, precision, zeroSuppression) {
      const sign = value < 0 ? -1 : 1;
      let abs = Math.abs(value);
      let degrees = Math.floor(abs);
      let minutes = (abs - degrees) * 60;
      const minutePrecision = Math.max(0, Number.isFinite(precision) ? precision : 0);
      if (minutes >= 60 - 1e-9) {
        minutes = 0;
        degrees += 1;
      }
      let minuteString = this._formatDecimalLinearValue(minutes, minutePrecision, zeroSuppression);
      if ((zeroSuppression & 2) === 2) {
        minuteString = this._trimTrailingZeros(minuteString);
      }
      const includeMinutes = !(Math.abs(minutes) < 1e-9 && (zeroSuppression & 2) === 2);
      const signPrefix = sign < 0 ? '-' : '';
      return `${signPrefix}${degrees}\u00B0${includeMinutes ? `${minuteString}'` : ''}`;
    }

    _formatDegMinSecValue(value, precision, zeroSuppression) {
      const sign = value < 0 ? -1 : 1;
      let abs = Math.abs(value);
      let degrees = Math.floor(abs);
      let minutesTotal = (abs - degrees) * 60;
      let minutes = Math.floor(minutesTotal);
      let seconds = (minutesTotal - minutes) * 60;
      if (seconds >= 60 - 1e-9) {
        seconds = 0;
        minutes += 1;
      }
      if (minutes >= 60) {
        minutes = 0;
        degrees += 1;
      }
      const secondPrecision = Math.max(0, Number.isFinite(precision) ? precision : 0);
      let secondString = this._formatDecimalLinearValue(seconds, secondPrecision, zeroSuppression);
      if ((zeroSuppression & 2) === 2) {
        secondString = this._trimTrailingZeros(secondString);
      }
      const includeMinutes = !(Math.abs(minutes) < 1e-9 && (zeroSuppression & 2) === 2 && Math.abs(seconds) < 1e-9);
      const includeSeconds = !(Math.abs(seconds) < 1e-9 && (zeroSuppression & 2) === 2);
      const signPrefix = sign < 0 ? '-' : '';
      let result = `${signPrefix}${degrees}\u00B0`;
      if (includeMinutes) {
        result += `${minutes}'`;
      }
      if (includeSeconds) {
        result += `${secondString}"`;
      }
      return result;
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
      const insertionWorldPosition = applyMatrix(options.transform, geometry.position);
      const alignmentPointWorld = geometry.alignmentPoint
        ? applyMatrix(options.transform, geometry.alignmentPoint)
        : null;
      const worldPosition = alignmentPointWorld || insertionWorldPosition;
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
        insertionWorldPosition,
        rotation: appliedRotation,
        worldHeight,
        baseHeight,
        scaleMagnitude: avgScale,
        styleName,
        alignmentPoint: alignmentPointWorld,
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
      if (geometry.lockPosition) {
        textEntry.lockPosition = true;
      }
      if (Number.isFinite(geometry.fieldLength) && geometry.fieldLength > 0) {
        const widthFactorOverride = Number.isFinite(geometry.widthFactor) && geometry.widthFactor > 0
          ? geometry.widthFactor
          : 1;
        const referenceWidth = geometry.fieldLength * baseHeight * widthFactorOverride;
        if (referenceWidth > 0) {
          textEntry.referenceWidth = referenceWidth;
        }
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

    _boundsIntersect(a, b) {
      if (!a || !b) {
        return true;
      }
      if (a.maxX < b.minX || a.minX > b.maxX) {
        return false;
      }
      if (a.maxY < b.minY || a.minY > b.maxY) {
        return false;
      }
      return true;
    }

    _shouldCullWithClip(bounds, clipStack) {
      if (!bounds || !Array.isArray(clipStack) || !clipStack.length) {
        return false;
      }
      for (let i = 0; i < clipStack.length; i += 1) {
        const clip = clipStack[i];
        if (!clip || !clip.bounds) {
          continue;
        }
        if (!this._boundsIntersect(bounds, clip.bounds)) {
          return true;
        }
      }
      return false;
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
      const az = Number.isFinite(a.z) ? a.z : 0;
      const bz = Number.isFinite(b.z) ? b.z : 0;
      return Math.abs(a.x - b.x) <= epsilon &&
        Math.abs(a.y - b.y) <= epsilon &&
        Math.abs(az - bz) <= epsilon;
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

    _addDimensionGeometry(entity, geometry, transform, updateBounds, polylineCollector, textCollector, color, metaFactory, contextUnits, options = {}) {
      const renderBlockContent = typeof options.renderBlockContent === 'function' ? options.renderBlockContent : null;
      const getBlockNameByHandle = typeof options.getBlockNameByHandle === 'function' ? options.getBlockNameByHandle : null;
      const optionDepth = Number.isFinite(options.depth) ? options.depth : 0;
      const optionVisitedBlocks = Array.isArray(options.visitedBlocks) ? options.visitedBlocks : [];
      const optionBlockStack = Array.isArray(options.blockStack) ? options.blockStack : [];
      const optionHighlight = !!options.highlight;
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

      const styleInfo = entity && entity.resolved ? entity.resolved.dimensionStyle : null;
      const styleParameters = styleInfo && styleInfo.parameters ? styleInfo.parameters : null;
      const styleToggles = styleInfo && styleInfo.toggles ? styleInfo.toggles : null;
      const measurementSettings = geometry && geometry.dimensionMeasurementSettings
        ? geometry.dimensionMeasurementSettings
        : (styleInfo && styleInfo.measurement ? styleInfo.measurement : null);
      const alternateSettings = geometry && geometry.dimensionAlternateUnits
        ? geometry.dimensionAlternateUnits
        : (styleInfo && styleInfo.alternateUnits ? styleInfo.alternateUnits : null);
      const textOverrides = geometry && geometry.dimensionTextOverrides
        ? geometry.dimensionTextOverrides
        : (styleInfo && styleInfo.text ? styleInfo.text : null);
      const dimStyleMetrics = this._resolveDimensionStyleMetrics(entity);
      const dimensionFlags = Number.isFinite(geometry.dimensionFlags) ? geometry.dimensionFlags : 0;
      const isBaselineDimension = (dimensionFlags & 16) === 16;
      const isContinuedDimension = (dimensionFlags & 32) === 32;
      let suppressDimensionLine = (dimensionFlags & 64) === 64;
      if (geometry && geometry.dimensionLineSuppressed === true) {
        suppressDimensionLine = true;
      }
      if (styleToggles && styleToggles.suppressDimensionLine === true) {
        suppressDimensionLine = true;
      }
      let suppressDimensionText = (dimensionFlags & 128) === 128;
      if (geometry && (geometry.textSuppress === true || geometry.textSuppressed === true)) {
        suppressDimensionText = true;
      }
      if (styleToggles && styleToggles.suppressText === true) {
        suppressDimensionText = true;
      }
      const dimensionScale = Number.isFinite(geometry.dimensionScaleFactor) ? geometry.dimensionScaleFactor : 1;
      const obliqueAngleRad = Number.isFinite(geometry.obliqueAngle) ? geometry.obliqueAngle * Math.PI / 180 : 0;
      const hasOblique = Math.abs(obliqueAngleRad) > 1e-6;
      const extensionOffsetValue = Number.isFinite(dimStyleMetrics.extensionOffset)
        ? dimStyleMetrics.extensionOffset
        : (Number.isFinite(styleParameters && styleParameters.extensionOffset) ? styleParameters.extensionOffset * dimensionScale : 0);
      const extensionExtensionValue = Number.isFinite(dimStyleMetrics.extensionExtension)
        ? dimStyleMetrics.extensionExtension
        : (Number.isFinite(styleParameters && styleParameters.extensionExtension) ? styleParameters.extensionExtension * dimensionScale : 0);
      const dimensionLineExtensionValue = Number.isFinite(geometry.dimensionLineExtension)
        ? geometry.dimensionLineExtension
        : (Number.isFinite(styleParameters && styleParameters.dimensionLineExtension)
          ? styleParameters.dimensionLineExtension * dimensionScale
          : null);
      const dimensionLineIncrementValue = Number.isFinite(geometry.dimensionLineIncrement)
        ? geometry.dimensionLineIncrement
        : (Number.isFinite(styleParameters && styleParameters.dimensionLineIncrement)
          ? styleParameters.dimensionLineIncrement * dimensionScale
          : null);
      const tickSizeValue = Number.isFinite(geometry.dimensionTickSize)
        ? geometry.dimensionTickSize * dimensionScale
        : (Number.isFinite(styleParameters && styleParameters.tickSize) ? styleParameters.tickSize * dimensionScale : null);
      const centerMarkSize = Number.isFinite(styleParameters && styleParameters.centerMarkSize)
        ? styleParameters.centerMarkSize * dimensionScale
        : null;
      const arrowBlocks = geometry.dimensionArrowBlocks || null;
      const suppressExtension1 = geometry.extensionLine1Suppressed === true || (styleToggles && styleToggles.suppressExtensionLine1) || false;
      const suppressExtension2 = geometry.extensionLine2Suppressed === true || (styleToggles && styleToggles.suppressExtensionLine2) || false;
      const skipExtension1 = suppressExtension1 || isContinuedDimension;
      const skipExtension2 = suppressExtension2;

      const rotatePoint = (point, pivot, angle) => {
        if (!point || !pivot || !Number.isFinite(angle) || Math.abs(angle) < 1e-9) {
          return point;
        }
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = point.x - pivot.x;
        const dy = point.y - pivot.y;
        return {
          x: pivot.x + dx * cos - dy * sin,
          y: pivot.y + dx * sin + dy * cos
        };
      };

      const normalizeUnit = (dx, dy) => {
        const length = Math.hypot(dx, dy);
        if (!(length > 1e-6)) {
          return { x: 0, y: 0, length: 0 };
        }
        return { x: dx / length, y: dy / length, length };
      };

      const adjustExtensionSegment = (start, end) => {
        if (!start || !end) {
          return null;
        }
        const direction = normalizeUnit(end.x - start.x, end.y - start.y);
        if (!(direction.length > 1e-6)) {
          return { start, end, unit: { x: 0, y: 0 } };
        }
        let adjustedStart = start;
        if (extensionOffsetValue > 0) {
          const effective = Math.min(extensionOffsetValue, Math.max(0, direction.length - 1e-6));
          adjustedStart = {
            x: start.x + direction.x * effective,
            y: start.y + direction.y * effective
          };
        }
        let adjustedEnd = end;
        if (extensionExtensionValue && extensionExtensionValue !== 0) {
          adjustedEnd = {
            x: end.x + direction.x * extensionExtensionValue,
            y: end.y + direction.y * extensionExtensionValue
          };
        }
        return {
          start: adjustedStart,
          end: adjustedEnd,
          unit: { x: direction.x, y: direction.y }
        };
      };

      const adjustDimensionLineSegment = (start, end) => {
        if (!start || !end) {
          return null;
        }
        const direction = normalizeUnit(end.x - start.x, end.y - start.y);
        if (!(direction.length > 1e-6)) {
          return { start, end, unit: { x: 0, y: 0 } };
        }
        let adjustedStart = start;
        let adjustedEnd = end;
        if (Number.isFinite(dimensionLineExtensionValue) && dimensionLineExtensionValue !== 0) {
          adjustedStart = {
            x: adjustedStart.x - direction.x * dimensionLineExtensionValue,
            y: adjustedStart.y - direction.y * dimensionLineExtensionValue
          };
          adjustedEnd = {
            x: adjustedEnd.x + direction.x * dimensionLineExtensionValue,
            y: adjustedEnd.y + direction.y * dimensionLineExtensionValue
          };
        }
        return {
          start: adjustedStart,
          end: adjustedEnd,
          unit: { x: direction.x, y: direction.y }
        };
      };

      const rotateSegment = (segment, pivot) => {
        if (!segment) {
          return null;
        }
        if (!hasOblique || !pivot) {
          return segment;
        }
        const rotatedStart = rotatePoint(segment.start, pivot, obliqueAngleRad);
        const rotatedEnd = rotatePoint(segment.end, pivot, obliqueAngleRad);
        const direction = normalizeUnit(rotatedEnd.x - rotatedStart.x, rotatedEnd.y - rotatedStart.y);
        return {
          start: rotatedStart,
          end: rotatedEnd,
          unit: { x: direction.x, y: direction.y }
        };
      };

      const applyPerpendicularOffset = (segment, distance) => {
        if (!segment || !Number.isFinite(distance) || Math.abs(distance) < 1e-6) {
          return segment;
        }
        const direction = normalizeUnit(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
        if (!(direction.length > 1e-6)) {
          return segment;
        }
        const nx = -direction.y;
        const ny = direction.x;
        return {
          start: {
            x: segment.start.x + nx * distance,
            y: segment.start.y + ny * distance
          },
          end: {
            x: segment.end.x + nx * distance,
            y: segment.end.y + ny * distance
          },
          unit: { x: direction.x, y: direction.y }
        };
      };

      const resolveArrowDescriptor = (index) => {
        if (tickSizeValue != null && tickSizeValue > 0) {
          return { kind: 'tick', size: tickSizeValue };
        }
        if (arrowBlocks) {
          let handle = null;
          if (index === 0) {
            handle = arrowBlocks.first || arrowBlocks.primary || null;
          } else if (index === 1) {
            handle = arrowBlocks.second || arrowBlocks.primary || null;
          }
          if (handle) {
            return { kind: 'block', handle };
          }
        }
        return { kind: 'open' };
      };

      const definitionPoint = geometry.definitionPoint;
      const dimensionLinePoint = geometry.dimensionLinePoint;
      const textPoint = geometry.textPoint;
      const arrow1 = geometry.arrow1Point;
      const arrow2 = geometry.arrow2Point;
      const extension1 = geometry.extensionLine1Point;
      const extension2 = geometry.extensionLine2Point;
      const weight = this._lineweightToPx(entity.lineweight);
      const resolvedTextHeight = Number.isFinite(geometry.textHeight) && geometry.textHeight > 0
        ? geometry.textHeight
        : (Number.isFinite(geometry.height) && geometry.height > 0 ? geometry.height : null);
      let baseLabelHeight = Number.isFinite(resolvedTextHeight) && resolvedTextHeight > 0
        ? resolvedTextHeight
        : null;
      if (!(Number.isFinite(baseLabelHeight) && baseLabelHeight > 0)) {
        baseLabelHeight = dimStyleMetrics.textHeight != null && dimStyleMetrics.textHeight > 0
          ? dimStyleMetrics.textHeight
          : 3;
      }
      const type = geometry.dimensionType & 7;
      const baseStyleName = entity.textStyle ||
        (entity.resolved && entity.resolved.textStyle ? entity.resolved.textStyle.name : (geometry.textStyle || null));
      const label = this._formatDimensionLabel(geometry, {
        entity,
        contextUnits,
        measurementSettings,
        alternateSettings,
        textOverrides,
        styleParameters,
        styleToggles
      });
      const arrowFromGeometry = Number.isFinite(geometry.arrowSize) && geometry.arrowSize > 0
        ? geometry.arrowSize
        : null;
      const arrowScale = arrowFromGeometry != null
        ? arrowFromGeometry
        : (dimStyleMetrics.arrowSize != null && dimStyleMetrics.arrowSize > 0
          ? dimStyleMetrics.arrowSize
          : Math.max(baseLabelHeight * 0.8, 3));
      const drawArrowHead = (tip, base, index) => {
        if (!tip || !base) {
          return;
        }
        const descriptor = resolveArrowDescriptor(index);
        this._renderDimensionArrow({
          tip,
          toward: base,
          size: arrowScale,
          descriptor,
          transform,
          updateBounds,
          polylineCollector,
          color,
          weight,
          metaFactory,
          lineweight: entity.lineweight,
          renderBlockContent,
          getBlockNameByHandle,
          depth: optionDepth,
          visitedBlocks: optionVisitedBlocks,
          blockStack: optionBlockStack,
          highlight: optionHighlight,
          contextUnits
        });
      };
      const center = geometry.dimensionLinePoint || geometry.definitionPoint || null;

      let dimensionSegment = null;
      let dimensionNormal = null;

      switch (type) {
        case 0: // rotated / linear
        case 1: { // aligned
          // For linear dimensions, the dimension line connects the arrow points
          // Arrow points (16,26,36) and (17,27,37) are on the dimension line
          // Extension lines go from measured points (13,23,33) and (14,24,34) to the dimension line
          let dimLineStart = arrow1 || definitionPoint;
          let dimLineEnd = arrow2 || dimensionLinePoint;
          
          // If no arrow points, compute from definition point and extension line origins
          if (!arrow1 && !arrow2 && definitionPoint && dimensionLinePoint && extension1) {
            // For LINEAR: definition point (10) is on dimension line
            // dimensionLinePoint (13) and extensionLine1Point (14) are measured points
            // Compute dimension line direction from measured points
            const measuredDir = normalizeUnit(
              extension1.x - dimensionLinePoint.x,
              extension1.y - dimensionLinePoint.y
            );
            if (measuredDir.length > 1e-6) {
              // Dimension line is parallel to the line between measured points
              // Position it at definition point's perpendicular distance
              dimLineStart = definitionPoint;
              const dist = Math.hypot(extension1.x - dimensionLinePoint.x, extension1.y - dimensionLinePoint.y);
              dimLineEnd = {
                x: definitionPoint.x + measuredDir.x * dist,
                y: definitionPoint.y + measuredDir.y * dist,
                z: definitionPoint.z || 0
              };
            }
          }
          
          dimensionSegment = adjustDimensionLineSegment(dimLineStart, dimLineEnd);
          if (dimensionSegment) {
            dimensionSegment = rotateSegment(dimensionSegment, dimensionSegment.start || dimLineStart || dimLineEnd);
            if (isBaselineDimension && Number.isFinite(dimensionLineIncrementValue) && dimensionLineIncrementValue !== 0) {
              dimensionSegment = applyPerpendicularOffset(dimensionSegment, dimensionLineIncrementValue);
            }
          }
          if (!suppressDimensionLine) {
            if (dimensionSegment) {
              addLine(dimensionSegment.start, dimensionSegment.end, weight, 'dimensionLine');
            } else if (dimLineStart && dimLineEnd) {
              addLine(dimLineStart, dimLineEnd, weight, 'dimensionLine');
            }
          }
          const dimensionLineStart = dimensionSegment
            ? dimensionSegment.start
            : (dimLineStart || arrow1 || definitionPoint);
          const dimensionLineEnd = dimensionSegment
            ? dimensionSegment.end
            : (dimLineEnd || arrow2 || dimensionLinePoint);
          const extensionTarget1 = arrow1 || dimensionLineStart;
          const extensionTarget2 = arrow2 || dimensionLineEnd;
          if (dimensionSegment) {
            dimensionNormal = { x: -dimensionSegment.unit.y, y: dimensionSegment.unit.x };
          } else if (dimensionLineStart && dimensionLineEnd) {
            const fallbackDirection = normalizeUnit(
              dimensionLineEnd.x - dimensionLineStart.x,
              dimensionLineEnd.y - dimensionLineStart.y
            );
            if (fallbackDirection.length > 1e-6) {
              dimensionNormal = { x: -fallbackDirection.y, y: fallbackDirection.x };
            }
          }
          // For LINEAR dimensions:
          // - First extension line: from dimensionLinePoint (13,23,33) to arrow1/dimension line
          // - Second extension line: from extension1 (14,24,34) to arrow2/dimension line
          const extOrigin1 = dimensionLinePoint;  // First measured point (13,23,33)
          const extOrigin2 = extension1;           // Second measured point (14,24,34)
          if (!skipExtension1 && extOrigin1 && extensionTarget1) {
            let extensionSegment1 = adjustExtensionSegment(extOrigin1, extensionTarget1);
            extensionSegment1 = rotateSegment(extensionSegment1, extOrigin1);
            addLine(extensionSegment1.start, extensionSegment1.end, weight * 0.8, 'extensionLine1');
          }
          if (!skipExtension2 && extOrigin2 && extensionTarget2) {
            let extensionSegment2 = adjustExtensionSegment(extOrigin2, extensionTarget2);
            extensionSegment2 = rotateSegment(extensionSegment2, extOrigin2);
            addLine(extensionSegment2.start, extensionSegment2.end, weight * 0.8, 'extensionLine2');
          }
          const arrowBase1 = arrow2 || dimLineEnd || dimensionLineEnd;  // Arrow 1 points away from arrow 2
          const arrowBase2 = arrow1 || dimLineStart || dimensionLineStart;  // Arrow 2 points away from arrow 1
          if (arrow1 && arrowBase1) {
            drawArrowHead(arrow1, arrowBase1, 0);
          }
          if (arrow2 && arrowBase2) {
            drawArrowHead(arrow2, arrowBase2, 1);
          }
         break;
        }
        case 2: // angular
        case 5: { // angular 3pt
          const arcCenter = center || dimensionLinePoint || definitionPoint;
          const extensionTarget1 = arrow1 || arcCenter;
          const extensionTarget2 = arrow2 || arcCenter;
          if (!skipExtension1 && extension1 && extensionTarget1) {
            let extensionSegment1 = adjustExtensionSegment(extension1, extensionTarget1);
            extensionSegment1 = rotateSegment(extensionSegment1, extension1);
            addLine(extensionSegment1.start, extensionSegment1.end, weight * 0.85, 'extensionLine1');
          }
          if (!skipExtension2 && extension2 && extensionTarget2) {
            let extensionSegment2 = adjustExtensionSegment(extension2, extensionTarget2);
            extensionSegment2 = rotateSegment(extensionSegment2, extension2);
            addLine(extensionSegment2.start, extensionSegment2.end, weight * 0.85, 'extensionLine2');
          }

          let arcPoints = null;
          if (arcCenter && arrow1 && arrow2) {
            const det = (arrow1.x - arcCenter.x) * (arrow2.y - arcCenter.y) - (arrow1.y - arcCenter.y) * (arrow2.x - arcCenter.x);
            const clockwise = det < 0;
            const dot = (arrow1.x - arcCenter.x) * (arrow2.x - arcCenter.x) + (arrow1.y - arcCenter.y) * (arrow2.y - arcCenter.y);
            const rawAngle = Math.abs(Math.atan2(det, dot));
            const segments = Math.max(8, Math.ceil((rawAngle > 1e-6 ? rawAngle : Math.PI / 6) / (Math.PI / 36)));
            arcPoints = this._buildDimensionArcPoints(arcCenter, arrow1, arrow2, { clockwise, segments });
          } else if (geometry.arcDefinitionPoints && geometry.arcDefinitionPoints.length >= 2) {
            arcPoints = [];
            if (arrow1) {
              arcPoints.push(arrow1);
            }
            geometry.arcDefinitionPoints.forEach((pt) => arcPoints.push(pt));
            if (arrow2) {
              arcPoints.push(arrow2);
            }
          }

          if (!suppressDimensionLine && arcPoints && arcPoints.length >= 2) {
            addPolyline(arcPoints, weight, 'dimensionArc');
          }

          if (arcCenter && arrow1) {
            drawArrowHead(arrow1, arcCenter, 0);
          }
          if (arcCenter && arrow2) {
            drawArrowHead(arrow2, arcCenter, 1);
          }
          break;
        }
        case 3: { // diameter
          if (!suppressDimensionLine && arrow1 && arrow2) {
            addLine(arrow1, arrow2, weight, 'diameter');
          } else if (!suppressDimensionLine && definitionPoint && dimensionLinePoint) {
            let diameterSegment = adjustDimensionLineSegment(definitionPoint, dimensionLinePoint);
            diameterSegment = rotateSegment(diameterSegment, definitionPoint);
            if (diameterSegment) {
              addLine(diameterSegment.start, diameterSegment.end, weight, 'dimensionLine');
            } else {
              addLine(definitionPoint, dimensionLinePoint, weight, 'dimensionLine');
            }
          }
          const diameterCenter = center || definitionPoint || dimensionLinePoint;
          if (diameterCenter && arrow1) {
            if (!suppressDimensionLine) {
              addLine(diameterCenter, arrow1, weight * 0.8, 'radius');
            }
            drawArrowHead(arrow1, diameterCenter, 0);
          }
          if (diameterCenter && arrow2) {
            if (!suppressDimensionLine) {
              addLine(diameterCenter, arrow2, weight * 0.8, 'radius');
            }
            drawArrowHead(arrow2, diameterCenter, 1);
          }
          if (diameterCenter && Number.isFinite(centerMarkSize) && centerMarkSize > 0) {
            this._addCenterMark(diameterCenter, centerMarkSize, transform, updateBounds, polylineCollector, color, metaFactory, entity.lineweight);
          }
          break;
        }
        case 4: { // radius
          const tip = arrow1 || arrow2 || dimensionLinePoint;
          const origin = definitionPoint || dimensionLinePoint;
          if (origin && tip) {
            if (!suppressDimensionLine) {
              addLine(origin, tip, weight, 'radius');
            }
            const arrowIndex = arrow1 ? 0 : 1;
            drawArrowHead(tip, origin, arrowIndex);
          }
          if (geometry.arcDefinitionPoints && geometry.arcDefinitionPoints.length >= 2) {
            addPolyline(geometry.arcDefinitionPoints, weight * 0.8, 'arc');
          }
          if (origin && Number.isFinite(centerMarkSize) && centerMarkSize > 0) {
            this._addCenterMark(origin, centerMarkSize, transform, updateBounds, polylineCollector, color, metaFactory, entity.lineweight);
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
              drawArrowHead(arrow1, origin, 0);
            } else {
              drawArrowHead(leader, origin, 0);
            }
            const axisVector = normalizeUnit(leader.x - origin.x, leader.y - origin.y);
            if (axisVector.length > 1e-6) {
              dimensionNormal = { x: axisVector.x, y: axisVector.y };
            }
          }
          break;
        }
        default:
          break;
      }

      const textAnchor = textPoint || dimensionLinePoint || definitionPoint || center;
      if (!suppressDimensionText && label && textAnchor) {
        const textMovementMode = measurementSettings && measurementSettings.textMovement != null
          ? measurementSettings.textMovement
          : null;
        const textIsOutside = textMovementMode === 1 || textMovementMode === 2;
        let effectiveTextAnchor = textAnchor;
        if (!geometry.textPoint && textIsOutside && dimensionNormal) {
          const gap = dimStyleMetrics.textGap != null ? dimStyleMetrics.textGap : 0;
          const offsetMagnitude = Math.max(gap, baseLabelHeight * 0.5) + arrowScale * 0.5;
          effectiveTextAnchor = {
            x: textAnchor.x + dimensionNormal.x * offsetMagnitude,
            y: textAnchor.y + dimensionNormal.y * offsetMagnitude
          };
        }
        const position = applyMatrix(transform, effectiveTextAnchor);
        updateBounds(position.x, position.y);
        const scale = matrixScale(transform);
        const avgScale = ((Math.abs(scale.sx) + Math.abs(scale.sy)) / 2) || 1;
        const rotationBase = this._resolveDimensionTextRotation(geometry) + ((geometry.obliqueAngle || 0) * Math.PI / 180);
        let rotation = matrixRotation(transform) + rotationBase;
        if ((styleToggles && styleToggles.textOutsideHorizontal && textIsOutside)
          || (styleToggles && styleToggles.textInsideHorizontal && !textIsOutside)) {
          rotation = matrixRotation(transform);
        }
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

    _addArcDimensionGeometry(entity, geometry, transform, updateBounds, polylineCollector, textCollector, color, metaFactory, contextUnits) {
      // ARC_DIMENSION measures the arc length along an arc segment
      if (!geometry) {
        return;
      }
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

      const arcCenter = geometry.arcCenter;
      const ext1 = geometry.extensionLine1Point;
      const ext2 = geometry.extensionLine2Point;
      const dimArcPoint = geometry.dimensionArcPoint;
      const textPoint = geometry.textPoint;
      const arcRadius = geometry.arcRadius;
      const weight = this._lineweightToPx(entity.lineweight);

      // Compute dimension arc radius (from center to dimension arc point)
      let dimRadius = arcRadius;
      if (arcCenter && dimArcPoint) {
        dimRadius = Math.hypot(dimArcPoint.x - arcCenter.x, dimArcPoint.y - arcCenter.y);
      }
      if (!Number.isFinite(dimRadius) || dimRadius <= 0) {
        dimRadius = arcRadius || 10;
      }

      // Compute start and end angles
      let startAngle = geometry.startAngle;
      let endAngle = geometry.endAngle;
      if (arcCenter && ext1) {
        startAngle = Math.atan2(ext1.y - arcCenter.y, ext1.x - arcCenter.x);
      }
      if (arcCenter && ext2) {
        endAngle = Math.atan2(ext2.y - arcCenter.y, ext2.x - arcCenter.x);
      }
      if (startAngle == null) startAngle = 0;
      if (endAngle == null) endAngle = Math.PI / 2;

      // Ensure proper angle sweep
      let sweep = endAngle - startAngle;
      if (sweep < 0) sweep += Math.PI * 2;
      if (sweep > Math.PI * 2) sweep = Math.PI * 2;

      // Build dimension arc
      const segments = Math.max(16, Math.ceil(sweep / (Math.PI / 36)));
      const arcPoints = [];
      for (let i = 0; i <= segments; i++) {
        const angle = startAngle + (sweep * i / segments);
        arcPoints.push({
          x: arcCenter.x + dimRadius * Math.cos(angle),
          y: arcCenter.y + dimRadius * Math.sin(angle)
        });
      }
      if (arcPoints.length >= 2) {
        addPolyline(arcPoints, weight, 'dimensionArc');
      }

      // Draw extension lines from arc points to dimension arc
      if (arcCenter && ext1) {
        const ext1OnDimArc = {
          x: arcCenter.x + dimRadius * Math.cos(startAngle),
          y: arcCenter.y + dimRadius * Math.sin(startAngle)
        };
        addLine(ext1, ext1OnDimArc, weight * 0.8, 'extensionLine1');
      }
      if (arcCenter && ext2) {
        const ext2OnDimArc = {
          x: arcCenter.x + dimRadius * Math.cos(endAngle),
          y: arcCenter.y + dimRadius * Math.sin(endAngle)
        };
        addLine(ext2, ext2OnDimArc, weight * 0.8, 'extensionLine2');
      }

      // Draw arrowheads at arc endpoints
      const arrow1Pos = arcPoints[0];
      const arrow2Pos = arcPoints[arcPoints.length - 1];
      if (arrow1Pos && arcCenter) {
        const tangent1 = { x: -(arrow1Pos.y - arcCenter.y), y: arrow1Pos.x - arcCenter.x };
        const len = Math.hypot(tangent1.x, tangent1.y);
        if (len > 1e-6) {
          const arrowSize = geometry.textHeight || 3;
          const arrowBase = {
            x: arrow1Pos.x + (tangent1.x / len) * arrowSize,
            y: arrow1Pos.y + (tangent1.y / len) * arrowSize
          };
          this._renderDimensionArrow({
            tip: arrow1Pos,
            toward: arrowBase,
            size: arrowSize,
            descriptor: { kind: 'open' },
            transform,
            updateBounds,
            polylineCollector,
            color,
            weight,
            metaFactory,
            lineweight: entity.lineweight
          });
        }
      }
      if (arrow2Pos && arcCenter) {
        const tangent2 = { x: arrow2Pos.y - arcCenter.y, y: -(arrow2Pos.x - arcCenter.x) };
        const len = Math.hypot(tangent2.x, tangent2.y);
        if (len > 1e-6) {
          const arrowSize = geometry.textHeight || 3;
          const arrowBase = {
            x: arrow2Pos.x + (tangent2.x / len) * arrowSize,
            y: arrow2Pos.y + (tangent2.y / len) * arrowSize
          };
          this._renderDimensionArrow({
            tip: arrow2Pos,
            toward: arrowBase,
            size: arrowSize,
            descriptor: { kind: 'open' },
            transform,
            updateBounds,
            polylineCollector,
            color,
            weight,
            metaFactory,
            lineweight: entity.lineweight
          });
        }
      }

      // Add dimension text
      const labelText = geometry.text || '';
      const arcLength = sweep * dimRadius;
      const label = labelText || arcLength.toFixed(4);
      const textAnchor = textPoint || dimArcPoint || (arcPoints.length > 0 ? arcPoints[Math.floor(arcPoints.length / 2)] : arcCenter);
      if (label && textAnchor) {
        const position = applyMatrix(transform, textAnchor);
        updateBounds(position.x, position.y);
        const scale = matrixScale(transform);
        const avgScale = ((Math.abs(scale.sx) + Math.abs(scale.sy)) / 2) || 1;
        const rotation = matrixRotation(transform);
        const textHeight = geometry.textHeight || 3;
        const worldHeight = textHeight * avgScale;
        textCollector.push({
          kind: 'TEXT',
          entity,
          geometry,
          styleName: null,
          content: label,
          worldPosition: position,
          rotation,
          worldHeight,
          baseHeight: textHeight,
          scaleMagnitude: avgScale,
          color,
          meta: createTextMeta({ textKind: 'DIMENSION_LABEL', dimensionPart: 'label' })
        });
      }
    }

    _addLargeRadialDimensionGeometry(entity, geometry, transform, updateBounds, polylineCollector, textCollector, color, metaFactory, contextUnits) {
      // LARGE_RADIAL_DIMENSION is a jogged radius dimension for large radius arcs
      if (!geometry) {
        return;
      }
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

      const centerPoint = geometry.centerPoint;
      const definitionPoint = geometry.definitionPoint;
      const jogPoint = geometry.jogPoint;
      const chordPoint = geometry.chordPoint;
      const textPoint = geometry.textPoint;
      const jogAngle = geometry.jogAngle || (Math.PI / 4);
      const weight = this._lineweightToPx(entity.lineweight);

      // A jogged radius dimension has:
      // 1. Line from chord point (on arc) toward center, but stopped at jog point
      // 2. A jog (zig-zag) at the jog point
      // 3. Line from jog to definition point (where text goes)
      if (chordPoint && jogPoint) {
        addLine(chordPoint, jogPoint, weight, 'dimensionLine');
      }
      if (jogPoint && definitionPoint) {
        // Create jog - a small zig-zag perpendicular to main line
        const mainDir = centerPoint && chordPoint
          ? { x: centerPoint.x - chordPoint.x, y: centerPoint.y - chordPoint.y }
          : { x: 1, y: 0 };
        const mainLen = Math.hypot(mainDir.x, mainDir.y);
        if (mainLen > 1e-6) {
          const ux = mainDir.x / mainLen;
          const uy = mainDir.y / mainLen;
          // Perpendicular for jog
          const px = -uy;
          const py = ux;
          const jogSize = (geometry.textHeight || 3) * 0.5;
          // Jog pattern: up, across, down
          const jogMid1 = {
            x: jogPoint.x + px * jogSize,
            y: jogPoint.y + py * jogSize
          };
          const jogMid2 = {
            x: jogMid1.x + ux * jogSize * 2,
            y: jogMid1.y + uy * jogSize * 2
          };
          const jogEnd = {
            x: jogMid2.x - px * jogSize,
            y: jogMid2.y - py * jogSize
          };
          addLine(jogPoint, jogMid1, weight, 'jog');
          addLine(jogMid1, jogMid2, weight, 'jog');
          addLine(jogMid2, jogEnd, weight, 'jog');
          addLine(jogEnd, definitionPoint, weight, 'dimensionLine');
        } else {
          addLine(jogPoint, definitionPoint, weight, 'dimensionLine');
        }
      } else if (chordPoint && definitionPoint) {
        addLine(chordPoint, definitionPoint, weight, 'dimensionLine');
      }

      // Draw arrowhead at chord point (pointing toward center)
      if (chordPoint && centerPoint) {
        const arrowSize = geometry.textHeight || 3;
        this._renderDimensionArrow({
          tip: chordPoint,
          toward: centerPoint,
          size: arrowSize,
          descriptor: { kind: 'open' },
          transform,
          updateBounds,
          polylineCollector,
          color,
          weight,
          metaFactory,
          lineweight: entity.lineweight
        });
      }

      // Add dimension text
      const labelText = geometry.text || '';
      let radius = null;
      if (centerPoint && chordPoint) {
        radius = Math.hypot(chordPoint.x - centerPoint.x, chordPoint.y - centerPoint.y);
      }
      const label = labelText || (radius != null ? ('R' + radius.toFixed(4)) : 'R');
      const textAnchor = textPoint || definitionPoint || jogPoint;
      if (label && textAnchor) {
        const position = applyMatrix(transform, textAnchor);
        updateBounds(position.x, position.y);
        const scale = matrixScale(transform);
        const avgScale = ((Math.abs(scale.sx) + Math.abs(scale.sy)) / 2) || 1;
        const rotation = matrixRotation(transform);
        const textHeight = geometry.textHeight || 3;
        const worldHeight = textHeight * avgScale;
        textCollector.push({
          kind: 'TEXT',
          entity,
          geometry,
          styleName: null,
          content: label,
          worldPosition: position,
          rotation,
          worldHeight,
          baseHeight: textHeight,
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
      const resolvedLineweight = Number.isFinite(lineweight) ? lineweight : this._resolveLineweight(entity);
      const resolvedLinetype = linetype || this._resolveLinetype(entity, tables);
      const resolvedLineweightPx = this._lineweightToPx(
        resolvedLineweight != null ? resolvedLineweight : entity.lineweight
      );
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
            lineweight: resolvedLineweight,
            linetype: resolvedLinetype,
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
            lineweight: Math.max(0.4, resolvedLineweightPx * 0.4),
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
          lineweight: resolvedLineweight,
          linetype: resolvedLinetype,
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
            lineweight: Math.max(0.4, resolvedLineweightPx * 0.5),
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
          lineweight: Math.max(0.6, resolvedLineweightPx * 0.75),
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

    _addProceduralSurfaceGeometry(entity, geometry, transform, updateBounds, polylineCollector, fillCollector, color, material, makeMeta) {
      if (!geometry) {
        return;
      }
      const lineweight = this._resolveLineweight(entity);
      
      // Try tessellation first if available
      if (this.tessellator && typeof this.tessellator.tessellateProceduralSurface === 'function') {
        const tessellated = this.tessellator.tessellateProceduralSurface(geometry);
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
                  meta: makeMeta ? makeMeta({ geometryKind: 'fill', fillKind: 'procedural-surface' }) : null
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
                meta: makeMeta ? makeMeta({ geometryKind: 'polyline', isClosed: true, family: 'procedural-surface-outline' }) : null
              });
            });
          }
          return;
        }
      }

      // Fallback: render bounding box or profile
      let outline = null;
      if (geometry.profilePoints && geometry.profilePoints.length >= 3) {
        outline = geometry.profilePoints.map((pt) => ({ x: pt.x, y: pt.y }));
      } else if (geometry.boundingBox) {
        outline = this._outlineFromBoundingBox(geometry.boundingBox);
      }
      
      if (outline && outline.length >= 3) {
        const transformed = transformPoints(outline, transform);
        transformed.forEach((pt) => updateBounds(pt.x, pt.y));
        const closed = this._ensureClosedPolyline(transformed);
        polylineCollector.push({
          points: closed,
          color,
          lineweight,
          worldBounds: this._computeBoundsFromPoints(transformed),
          meta: makeMeta ? makeMeta({ geometryKind: 'polyline', isClosed: true, family: 'procedural-surface' }) : null
        });
      }
    }

    _addOleFrameGeometry(entity, geometry, transform, updateBounds, polylineCollector, fillCollector, textCollector, color, lineweight, makeMeta) {
      // OLE frames are embedded objects - render the bounding box as placeholder
      let bounds = null;
      
      if (geometry.upperLeft && geometry.lowerRight) {
        bounds = {
          minX: Math.min(geometry.upperLeft.x, geometry.lowerRight.x),
          minY: Math.min(geometry.upperLeft.y, geometry.lowerRight.y),
          maxX: Math.max(geometry.upperLeft.x, geometry.lowerRight.x),
          maxY: Math.max(geometry.upperLeft.y, geometry.lowerRight.y)
        };
      } else if (geometry.boundingBox) {
        bounds = geometry.boundingBox;
      } else if (geometry.insertionPoint) {
        // Create a default size if only insertion point exists
        const size = 100;
        bounds = {
          minX: geometry.insertionPoint.x,
          minY: geometry.insertionPoint.y,
          maxX: geometry.insertionPoint.x + size,
          maxY: geometry.insertionPoint.y + size
        };
      }
      
      if (bounds) {
        const rectPoints = [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY },
          { x: bounds.minX, y: bounds.maxY },
          { x: bounds.minX, y: bounds.minY }
        ];
        
        const transformed = transformPoints(rectPoints, transform);
        transformed.forEach((pt) => updateBounds(pt.x, pt.y));
        
        // Draw frame outline
        polylineCollector.push({
          points: transformed,
          color,
          lineweight: lineweight || 1,
          worldBounds: this._computeBoundsFromPoints(transformed),
          meta: makeMeta ? makeMeta({ geometryKind: 'polyline', isClosed: true, family: 'ole-frame' }) : null
        });
        
        // Draw X across the frame to indicate placeholder
        const diagonal1 = transformPoints([
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY }
        ], transform);
        const diagonal2 = transformPoints([
          { x: bounds.maxX, y: bounds.minY },
          { x: bounds.minX, y: bounds.maxY }
        ], transform);
        
        polylineCollector.push({
          points: diagonal1,
          color: this._adjustColorAlpha(color, 0.5, 0.3),
          lineweight: (lineweight || 1) * 0.5,
          worldBounds: this._computeBoundsFromPoints(diagonal1),
          meta: makeMeta ? makeMeta({ geometryKind: 'polyline', family: 'ole-placeholder' }) : null
        });
        polylineCollector.push({
          points: diagonal2,
          color: this._adjustColorAlpha(color, 0.5, 0.3),
          lineweight: (lineweight || 1) * 0.5,
          worldBounds: this._computeBoundsFromPoints(diagonal2),
          meta: makeMeta ? makeMeta({ geometryKind: 'polyline', family: 'ole-placeholder' }) : null
        });
        
        // Add label text in center
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const centerPt = applyMatrix(transform, { x: centerX, y: centerY });
        const height = Math.min(bounds.maxY - bounds.minY, bounds.maxX - bounds.minX) * 0.15;
        
        textCollector.push({
          text: 'OLE Object',
          position: [centerPt.x, centerPt.y],
          height: height || 10,
          rotation: 0,
          color: this._adjustColorAlpha(color, 0.7, 0.5),
          halign: 'center',
          valign: 'middle',
          meta: makeMeta ? makeMeta({ geometryKind: 'text', family: 'ole-label' }) : null
        });
      }
    }

    /**
     * Tessellate a B-spline/NURBS curve using De Boor algorithm
     * @param {Object} geometry - Spline geometry with controlPoints, knots, degree, weights
     * @param {number} numSamples - Number of output samples
     * @returns {Array} Array of tessellated points
     */
    _tessellateSpline(geometry, numSamples = 64) {
      const degree = geometry.degree || 3;
      const controlPoints = geometry.controlPoints || [];
      const weights = geometry.weights || [];
      let knots = geometry.knots || [];
      
      // If fit points but no control points, use fit points directly with Catmull-Rom
      if ((!controlPoints || controlPoints.length < 2) && geometry.fitPoints && geometry.fitPoints.length >= 2) {
        return this._tessellateWithCatmullRom(geometry.fitPoints, numSamples, !!geometry.isClosed);
      }
      
      if (controlPoints.length < 2) {
        return controlPoints.slice();
      }
      
      // Generate uniform knot vector if not provided
      const n = controlPoints.length;
      if (!knots || knots.length < n + degree + 1) {
        knots = [];
        const numKnots = n + degree + 1;
        for (let i = 0; i < numKnots; i++) {
          if (i < degree + 1) {
            knots.push(0);
          } else if (i >= numKnots - degree - 1) {
            knots.push(1);
          } else {
            knots.push((i - degree) / (numKnots - 2 * degree - 1));
          }
        }
      }
      
      // Normalize knots to [0, 1]
      const minKnot = knots[0];
      const maxKnot = knots[knots.length - 1];
      const knotRange = maxKnot - minKnot;
      if (knotRange < 1e-10) {
        return controlPoints.slice();
      }
      const normalizedKnots = knots.map(k => (k - minKnot) / knotRange);
      
      // Ensure weights array
      const w = weights.length === n ? weights : controlPoints.map(() => 1);
      
      // De Boor B-spline basis function
      const bsplineBasis = (i, p, t) => {
        if (p === 0) {
          return (t >= normalizedKnots[i] && t < normalizedKnots[i + 1]) ? 1 : 0;
        }
        let left = 0, right = 0;
        const d1 = normalizedKnots[i + p] - normalizedKnots[i];
        if (Math.abs(d1) > 1e-10) {
          left = ((t - normalizedKnots[i]) / d1) * bsplineBasis(i, p - 1, t);
        }
        const d2 = normalizedKnots[i + p + 1] - normalizedKnots[i + 1];
        if (Math.abs(d2) > 1e-10) {
          right = ((normalizedKnots[i + p + 1] - t) / d2) * bsplineBasis(i + 1, p - 1, t);
        }
        return left + right;
      };
      
      // Evaluate NURBS curve at parameter t
      const evaluateAt = (t) => {
        // Clamp t for endpoint
        if (t >= 1) t = 1 - 1e-10;
        
        let numeratorX = 0, numeratorY = 0, numeratorZ = 0;
        let denominator = 0;
        
        for (let i = 0; i < n; i++) {
          const basis = bsplineBasis(i, degree, t);
          const weight = w[i];
          const weighted = basis * weight;
          
          numeratorX += (controlPoints[i].x || 0) * weighted;
          numeratorY += (controlPoints[i].y || 0) * weighted;
          numeratorZ += (controlPoints[i].z || 0) * weighted;
          denominator += weighted;
        }
        
        if (Math.abs(denominator) < 1e-10) {
          return { x: controlPoints[0].x || 0, y: controlPoints[0].y || 0, z: controlPoints[0].z || 0 };
        }
        
        return {
          x: numeratorX / denominator,
          y: numeratorY / denominator,
          z: numeratorZ / denominator
        };
      };
      
      // Sample the curve
      const result = [];
      for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples;
        result.push(evaluateAt(t));
      }
      
      return result;
    }

    /**
     * Tessellate using Catmull-Rom spline interpolation for fit points
     */
    _tessellateWithCatmullRom(fitPoints, numSamples, isClosed) {
      if (fitPoints.length < 2) return fitPoints.slice();
      
      const result = [];
      const n = fitPoints.length;
      const segmentsPerSpan = Math.ceil(numSamples / (n - 1));
      
      for (let i = 0; i < n - 1; i++) {
        const p0 = fitPoints[Math.max(0, i - 1)];
        const p1 = fitPoints[i];
        const p2 = fitPoints[Math.min(n - 1, i + 1)];
        const p3 = fitPoints[Math.min(n - 1, i + 2)];
        
        for (let j = 0; j < segmentsPerSpan; j++) {
          const t = j / segmentsPerSpan;
          const t2 = t * t;
          const t3 = t2 * t;
          
          // Catmull-Rom coefficients
          const c0 = -0.5 * t3 + t2 - 0.5 * t;
          const c1 = 1.5 * t3 - 2.5 * t2 + 1;
          const c2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
          const c3 = 0.5 * t3 - 0.5 * t2;
          
          result.push({
            x: c0 * (p0.x || 0) + c1 * (p1.x || 0) + c2 * (p2.x || 0) + c3 * (p3.x || 0),
            y: c0 * (p0.y || 0) + c1 * (p1.y || 0) + c2 * (p2.y || 0) + c3 * (p3.y || 0),
            z: c0 * (p0.z || 0) + c1 * (p1.z || 0) + c2 * (p2.z || 0) + c3 * (p3.z || 0)
          });
        }
      }
      
      // Add the last point
      result.push({ ...fitPoints[n - 1] });
      
      if (isClosed && result.length > 0) {
        result.push({ ...result[0] });
      }
      
      return result;
    }

    _renderToleranceFrame({ entity, geometry, position, rotation, height, baseHeight, scaleMagnitude, text, styleName, color, rawPolylines, rawTexts, updateBounds, makeMeta }) {
      // GD&T Tolerance frame rendering
      // Parse tolerance text format: %%v{symbol}/{value1}^{value2}%%v{datum}...
      // Common GD&T symbols: ⌀ (diameter), ⊥ (perpendicularity), ∥ (parallelism), etc.
      
      const gdtSymbols = {
        'gdt;n': '⌀',      // Diameter
        'gdt;j': '⊥',      // Perpendicularity
        'gdt;h': '∥',      // Parallelism
        'gdt;p': '⦜',      // Position
        'gdt;r': '○',      // Circularity
        'gdt;s': '⌭',      // Cylindricity
        'gdt;f': '⏥',      // Flatness
        'gdt;l': '—',      // Straightness
        'gdt;g': '⌓',      // Profile of surface
        'gdt;k': '⌒',      // Profile of line
        'gdt;a': '⦟',      // Angularity
        'gdt;c': '◎',      // Concentricity
        'gdt;u': '↗',      // Runout
        'gdt;t': '↗↗',     // Total runout
        'gdt;i': 'Ⓜ',      // Maximum material condition
        'gdt;o': 'Ⓛ',      // Least material condition
        'gdt;m': 'Ⓢ',      // Regardless of feature size
        'gdt;e': 'Ⓟ',      // Projected tolerance zone
      };
      
      // Parse the tolerance string
      let displayText = text;
      Object.keys(gdtSymbols).forEach(key => {
        const regex = new RegExp(key.replace(/;/g, '\\;'), 'gi');
        displayText = displayText.replace(regex, gdtSymbols[key]);
      });
      
      // Also handle %%c (diameter) and %%p (plus/minus)
      displayText = displayText.replace(/%%c/gi, '⌀');
      displayText = displayText.replace(/%%p/gi, '±');
      displayText = displayText.replace(/%%d/gi, '°');
      
      // Calculate frame dimensions
      const cellHeight = height * 1.5;
      const cellPadding = height * 0.3;
      
      // Split into cells (separated by /)
      const cells = displayText.split(/[\/\\|]/);
      let totalWidth = 0;
      const cellWidths = cells.map(cell => {
        const width = Math.max(cell.length * height * 0.6, height);
        totalWidth += width + cellPadding * 2;
        return width + cellPadding * 2;
      });
      
      // Draw frame outline
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      
      const transformPoint = (dx, dy) => ({
        x: position.x + dx * cos - dy * sin,
        y: position.y + dx * sin + dy * cos
      });
      
      // Main frame rectangle
      const framePoints = [
        transformPoint(0, 0),
        transformPoint(totalWidth, 0),
        transformPoint(totalWidth, cellHeight),
        transformPoint(0, cellHeight),
        transformPoint(0, 0)
      ];
      
      framePoints.forEach(pt => updateBounds(pt.x, pt.y));
      
      rawPolylines.push({
        points: framePoints,
        color,
        lineweight: 1,
        worldBounds: this._computeBoundsFromPoints(framePoints),
        meta: makeMeta ? makeMeta({ geometryKind: 'polyline', isClosed: true, family: 'tolerance-frame' }) : null
      });
      
      // Draw cell dividers and text
      let xOffset = 0;
      cells.forEach((cell, index) => {
        const cellWidth = cellWidths[index];
        
        // Draw vertical divider (except for first cell)
        if (index > 0) {
          const dividerStart = transformPoint(xOffset, 0);
          const dividerEnd = transformPoint(xOffset, cellHeight);
          rawPolylines.push({
            points: [dividerStart, dividerEnd],
            color,
            lineweight: 1,
            worldBounds: this._computeBoundsFromPoints([dividerStart, dividerEnd]),
            meta: makeMeta ? makeMeta({ geometryKind: 'polyline', family: 'tolerance-divider' }) : null
          });
        }
        
        // Add cell text
        const textX = xOffset + cellWidth / 2;
        const textY = cellHeight / 2;
        const textPos = transformPoint(textX, textY);
        
        rawTexts.push({
          text: cell.trim(),
          position: [textPos.x, textPos.y],
          height: height,
          rotation: rotation * 180 / Math.PI,
          color,
          halign: 'center',
          valign: 'middle',
          styleName,
          meta: makeMeta ? makeMeta({ geometryKind: 'text', textKind: 'tolerance-cell', cellIndex: index }) : null
        });
        
        xOffset += cellWidth;
      });
    }
    }

  namespace.RenderingSurfaceManager = RenderingSurfaceManager;

  return {
    RenderingSurfaceManager
  };
}));
