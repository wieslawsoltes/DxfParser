/**
 * ACIS SAT/SAB Parser for DXF 3D Solid Entities
 * 
 * Parses ACIS (SAT - Standard ACIS Text) data embedded in DXF files
 * to extract tessellatable geometry for 3DSOLID, BODY, REGION, and SURFACE entities.
 * 
 * ACIS Format Reference:
 * - SAT files contain topology and geometry in a hierarchical text format
 * - Entities include: body, lump, shell, face, loop, coedge, edge, vertex, point
 * - Geometry includes: plane, cone, sphere, torus, spline surfaces, curves
 */
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

  // Constants for ACIS entity types
  const ACIS_ENTITY_TYPES = {
    BODY: 'body',
    LUMP: 'lump',
    SHELL: 'shell',
    FACE: 'face',
    LOOP: 'loop',
    COEDGE: 'coedge',
    EDGE: 'edge',
    VERTEX: 'vertex',
    POINT: 'point',
    // Geometry types
    PLANE: 'plane-surface',
    CONE: 'cone-surface',
    SPHERE: 'sphere-surface',
    TORUS: 'torus-surface',
    SPLINE: 'spline-surface',
    // Curve types
    STRAIGHT: 'straight-curve',
    ELLIPSE: 'ellipse-curve',
    INTCURVE: 'intcurve-curve',
    // Transform
    TRANSFORM: 'transform'
  };

  // Default tessellation parameters
  const DEFAULT_TESSELLATION = {
    tolerance: 0.01,
    maxSegments: 64,
    minSegments: 8,
    angleThreshold: 15 * Math.PI / 180
  };

  /**
   * Vector3D utility class
   */
  class Vector3D {
    constructor(x = 0, y = 0, z = 0) {
      this.x = Number.isFinite(x) ? x : 0;
      this.y = Number.isFinite(y) ? y : 0;
      this.z = Number.isFinite(z) ? z : 0;
    }

    static fromArray(arr, offset = 0) {
      return new Vector3D(
        arr[offset] || 0,
        arr[offset + 1] || 0,
        arr[offset + 2] || 0
      );
    }

    length() {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    normalize() {
      const len = this.length();
      if (len < 1e-10) return new Vector3D(0, 0, 1);
      return new Vector3D(this.x / len, this.y / len, this.z / len);
    }

    add(v) {
      return new Vector3D(this.x + v.x, this.y + v.y, this.z + v.z);
    }

    subtract(v) {
      return new Vector3D(this.x - v.x, this.y - v.y, this.z - v.z);
    }

    scale(s) {
      return new Vector3D(this.x * s, this.y * s, this.z * s);
    }

    dot(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    cross(v) {
      return new Vector3D(
        this.y * v.z - this.z * v.y,
        this.z * v.x - this.x * v.z,
        this.x * v.y - this.y * v.x
      );
    }

    toArray() {
      return [this.x, this.y, this.z];
    }

    to2D() {
      return { x: this.x, y: this.y };
    }
  }

  /**
   * Matrix4x4 for transformations
   */
  class Matrix4x4 {
    constructor(elements = null) {
      this.m = elements || [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ];
    }

    static identity() {
      return new Matrix4x4();
    }

    static fromACISTransform(data) {
      // ACIS transform format: rotation matrix (9 values) + translation (3 values) + scale
      if (!data || data.length < 12) {
        return Matrix4x4.identity();
      }
      const m = new Matrix4x4([
        data[0], data[1], data[2], 0,
        data[3], data[4], data[5], 0,
        data[6], data[7], data[8], 0,
        data[9] || 0, data[10] || 0, data[11] || 0, 1
      ]);
      if (data.length > 12 && data[12] !== 1) {
        const scale = data[12];
        m.m[0] *= scale; m.m[1] *= scale; m.m[2] *= scale;
        m.m[4] *= scale; m.m[5] *= scale; m.m[6] *= scale;
        m.m[8] *= scale; m.m[9] *= scale; m.m[10] *= scale;
      }
      return m;
    }

    transformPoint(v) {
      const x = this.m[0] * v.x + this.m[1] * v.y + this.m[2] * v.z + this.m[3];
      const y = this.m[4] * v.x + this.m[5] * v.y + this.m[6] * v.z + this.m[7];
      const z = this.m[8] * v.x + this.m[9] * v.y + this.m[10] * v.z + this.m[11];
      return new Vector3D(x, y, z);
    }

    transformVector(v) {
      const x = this.m[0] * v.x + this.m[1] * v.y + this.m[2] * v.z;
      const y = this.m[4] * v.x + this.m[5] * v.y + this.m[6] * v.z;
      const z = this.m[8] * v.x + this.m[9] * v.y + this.m[10] * v.z;
      return new Vector3D(x, y, z);
    }

    multiply(other) {
      const result = new Array(16);
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          result[row * 4 + col] =
            this.m[row * 4] * other.m[col] +
            this.m[row * 4 + 1] * other.m[col + 4] +
            this.m[row * 4 + 2] * other.m[col + 8] +
            this.m[row * 4 + 3] * other.m[col + 12];
        }
      }
      return new Matrix4x4(result);
    }
  }

  /**
   * ACIS Entity base class
   */
  class ACISEntity {
    constructor(id, type) {
      this.id = id;
      this.type = type;
      this.attributes = null;
      this.raw = null;
    }
  }

  /**
   * ACIS Token Parser
   * Handles the low-level parsing of ACIS SAT format
   */
  class ACISTokenizer {
    constructor(data) {
      this.data = data || '';
      this.position = 0;
      this.line = 1;
      this.version = 0;
      this.numRecords = 0;
      this.numEntities = 0;
      this.hasSubtypes = false;
    }

    skipWhitespace() {
      while (this.position < this.data.length) {
        const ch = this.data[this.position];
        if (ch === ' ' || ch === '\t' || ch === '\r') {
          this.position++;
        } else if (ch === '\n') {
          this.position++;
          this.line++;
        } else {
          break;
        }
      }
    }

    peekChar() {
      this.skipWhitespace();
      return this.data[this.position] || '';
    }

    readChar() {
      this.skipWhitespace();
      return this.data[this.position++] || '';
    }

    readToken() {
      this.skipWhitespace();
      if (this.position >= this.data.length) return null;

      const start = this.position;
      const ch = this.data[this.position];

      // String literal
      if (ch === '@') {
        this.position++;
        let lengthStr = '';
        while (this.position < this.data.length && /\d/.test(this.data[this.position])) {
          lengthStr += this.data[this.position++];
        }
        const length = parseInt(lengthStr, 10) || 0;
        // Skip space after length
        if (this.data[this.position] === ' ') this.position++;
        const str = this.data.substr(this.position, length);
        this.position += length;
        return { type: 'string', value: str };
      }

      // Special tokens
      if (ch === '#' || ch === '$' || ch === '-') {
        // Reference or negative number
        if (ch === '-' && this.position + 1 < this.data.length) {
          const next = this.data[this.position + 1];
          if (/\d/.test(next)) {
            // Negative number
            this.position++;
            const num = this.readNumber();
            return { type: 'number', value: -num };
          }
        }
        this.position++;
        let ref = ch;
        while (this.position < this.data.length && /[\d\w]/.test(this.data[this.position])) {
          ref += this.data[this.position++];
        }
        if (ref === '#') return { type: 'null', value: null };
        if (ref.startsWith('$')) return { type: 'pointer', value: parseInt(ref.slice(1), 10) };
        return { type: 'ref', value: ref };
      }

      // Number
      if (/[\d.]/.test(ch) || (ch === '-' && /[\d.]/.test(this.data[this.position + 1] || ''))) {
        return { type: 'number', value: this.readNumber() };
      }

      // Identifier
      if (/[a-zA-Z_]/.test(ch)) {
        let ident = '';
        while (this.position < this.data.length && /[\w\-]/.test(this.data[this.position])) {
          ident += this.data[this.position++];
        }
        if (ident === 'T' || ident === 'TRUE' || ident === 'true') {
          return { type: 'bool', value: true };
        }
        if (ident === 'F' || ident === 'FALSE' || ident === 'false') {
          return { type: 'bool', value: false };
        }
        if (ident === 'I' || ident === 'forward' || ident === 'reversed' ||
            ident === 'single' || ident === 'double' || ident === 'in' || ident === 'out') {
          return { type: 'flag', value: ident };
        }
        return { type: 'identifier', value: ident };
      }

      // Other characters
      this.position++;
      return { type: 'char', value: ch };
    }

    readNumber() {
      let numStr = '';
      let hasDecimal = false;
      let hasExponent = false;

      while (this.position < this.data.length) {
        const ch = this.data[this.position];
        if (/\d/.test(ch)) {
          numStr += ch;
          this.position++;
        } else if (ch === '.' && !hasDecimal && !hasExponent) {
          numStr += ch;
          hasDecimal = true;
          this.position++;
        } else if ((ch === 'e' || ch === 'E') && !hasExponent) {
          numStr += ch;
          hasExponent = true;
          this.position++;
          if (this.data[this.position] === '+' || this.data[this.position] === '-') {
            numStr += this.data[this.position++];
          }
        } else if (ch === '-' && numStr === '') {
          numStr += ch;
          this.position++;
        } else {
          break;
        }
      }

      return parseFloat(numStr) || 0;
    }

    parseHeader() {
      // Read header lines
      // Format: version num_records num_entities has_subtypes
      const headerLine = [];
      while (this.position < this.data.length) {
        const token = this.readToken();
        if (!token) break;
        headerLine.push(token);
        if (token.type === 'number' && headerLine.length >= 4) break;
      }

      if (headerLine.length >= 1 && headerLine[0].type === 'number') {
        this.version = headerLine[0].value;
      }
      if (headerLine.length >= 2 && headerLine[1].type === 'number') {
        this.numRecords = headerLine[1].value;
      }
      if (headerLine.length >= 3 && headerLine[2].type === 'number') {
        this.numEntities = headerLine[2].value;
      }
      if (headerLine.length >= 4) {
        this.hasSubtypes = headerLine[3].value === true || headerLine[3].value === 'T';
      }

      return {
        version: this.version,
        numRecords: this.numRecords,
        numEntities: this.numEntities,
        hasSubtypes: this.hasSubtypes
      };
    }
  }

  /**
   * ACIS SAT Parser
   * Main parser class for ACIS data
   */
  class ACISParser {
    constructor(options = {}) {
      this.tolerance = options.tolerance || DEFAULT_TESSELLATION.tolerance;
      this.maxSegments = options.maxSegments || DEFAULT_TESSELLATION.maxSegments;
      this.minSegments = options.minSegments || DEFAULT_TESSELLATION.minSegments;
      this.entities = new Map();
      this.bodies = [];
      this.transforms = new Map();
    }

    /**
     * Parse ACIS SAT data string
     */
    parse(acisData) {
      if (!acisData || typeof acisData !== 'string') {
        return null;
      }

      // Clean up data - remove line continuations
      const cleanData = acisData
        .replace(/\r\n/g, '\n')
        .replace(/\\\n/g, ' ')
        .trim();

      if (!cleanData) {
        return null;
      }

      const tokenizer = new ACISTokenizer(cleanData);
      
      try {
        // Parse header
        const header = tokenizer.parseHeader();
        
        // Parse entity records
        this.parseEntities(tokenizer);

        // Build geometry from parsed entities
        return this.buildGeometry();
      } catch (err) {
        console.warn('ACIS parse error:', err.message);
        return null;
      }
    }

    parseEntities(tokenizer) {
      let entityId = 0;
      
      while (true) {
        const token = tokenizer.readToken();
        if (!token) break;

        // Look for entity type identifier
        if (token.type === 'identifier') {
          const entityType = token.value.toLowerCase();
          const entity = this.parseEntity(tokenizer, entityId, entityType);
          if (entity) {
            this.entities.set(entityId, entity);
            if (entityType === 'body') {
              this.bodies.push(entity);
            }
          }
          entityId++;
        }
      }
    }

    parseEntity(tokenizer, id, type) {
      const entity = new ACISEntity(id, type);
      const data = [];

      // Read entity data until we hit a new line/record marker
      let depth = 0;
      while (true) {
        const token = tokenizer.readToken();
        if (!token) break;

        if (token.type === 'char' && token.value === '{') {
          depth++;
          continue;
        }
        if (token.type === 'char' && token.value === '}') {
          depth--;
          if (depth < 0) break;
          continue;
        }
        if (token.type === 'char' && (token.value === ';' || token.value === '\n')) {
          if (depth === 0) break;
          continue;
        }

        data.push(token);

        // Stop at reasonable data length to prevent runaway parsing
        if (data.length > 500) break;
      }

      entity.raw = data;
      return this.interpretEntity(entity);
    }

    interpretEntity(entity) {
      const data = entity.raw || [];
      
      switch (entity.type) {
        case 'body':
          return this.parseBody(entity, data);
        case 'lump':
          return this.parseLump(entity, data);
        case 'shell':
          return this.parseShell(entity, data);
        case 'face':
          return this.parseFace(entity, data);
        case 'loop':
          return this.parseLoop(entity, data);
        case 'coedge':
          return this.parseCoedge(entity, data);
        case 'edge':
          return this.parseEdge(entity, data);
        case 'vertex':
          return this.parseVertex(entity, data);
        case 'point':
          return this.parsePoint(entity, data);
        case 'plane-surface':
        case 'plane':
          return this.parsePlane(entity, data);
        case 'cone-surface':
        case 'cone':
          return this.parseCone(entity, data);
        case 'sphere-surface':
        case 'sphere':
          return this.parseSphere(entity, data);
        case 'torus-surface':
        case 'torus':
          return this.parseTorus(entity, data);
        case 'spline-surface':
          return this.parseSplineSurface(entity, data);
        case 'straight-curve':
        case 'straight':
          return this.parseStraight(entity, data);
        case 'ellipse-curve':
        case 'ellipse':
          return this.parseEllipse(entity, data);
        case 'transform':
          return this.parseTransform(entity, data);
        default:
          return entity;
      }
    }

    // Entity parsers
    parseBody(entity, data) {
      entity.lumpRef = this.findPointer(data, 0);
      entity.transformRef = this.findPointer(data, 1);
      return entity;
    }

    parseLump(entity, data) {
      entity.nextLumpRef = this.findPointer(data, 0);
      entity.shellRef = this.findPointer(data, 1);
      entity.bodyRef = this.findPointer(data, 2);
      return entity;
    }

    parseShell(entity, data) {
      entity.nextShellRef = this.findPointer(data, 0);
      entity.faceRef = this.findPointer(data, 1);
      entity.lumpRef = this.findPointer(data, 2);
      return entity;
    }

    parseFace(entity, data) {
      entity.nextFaceRef = this.findPointer(data, 0);
      entity.loopRef = this.findPointer(data, 1);
      entity.shellRef = this.findPointer(data, 2);
      entity.surfaceRef = this.findPointer(data, 3);
      entity.sense = this.findFlag(data, 'forward') ? 1 : -1;
      return entity;
    }

    parseLoop(entity, data) {
      entity.nextLoopRef = this.findPointer(data, 0);
      entity.coedgeRef = this.findPointer(data, 1);
      entity.faceRef = this.findPointer(data, 2);
      return entity;
    }

    parseCoedge(entity, data) {
      entity.nextCoedgeRef = this.findPointer(data, 0);
      entity.prevCoedgeRef = this.findPointer(data, 1);
      entity.partnerRef = this.findPointer(data, 2);
      entity.edgeRef = this.findPointer(data, 3);
      entity.loopRef = this.findPointer(data, 4);
      entity.sense = this.findFlag(data, 'forward') ? 1 : -1;
      return entity;
    }

    parseEdge(entity, data) {
      entity.startVertexRef = this.findPointer(data, 0);
      entity.endVertexRef = this.findPointer(data, 1);
      entity.coedgeRef = this.findPointer(data, 2);
      entity.curveRef = this.findPointer(data, 3);
      
      // Try to find parameter range
      const numbers = data.filter(t => t.type === 'number').map(t => t.value);
      if (numbers.length >= 2) {
        entity.startParam = numbers[numbers.length - 2];
        entity.endParam = numbers[numbers.length - 1];
      }
      return entity;
    }

    parseVertex(entity, data) {
      entity.edgeRef = this.findPointer(data, 0);
      entity.pointRef = this.findPointer(data, 1);
      return entity;
    }

    parsePoint(entity, data) {
      const numbers = data.filter(t => t.type === 'number').map(t => t.value);
      if (numbers.length >= 3) {
        entity.position = new Vector3D(numbers[0], numbers[1], numbers[2]);
      } else {
        entity.position = new Vector3D();
      }
      return entity;
    }

    // Geometry parsers
    parsePlane(entity, data) {
      const numbers = data.filter(t => t.type === 'number').map(t => t.value);
      if (numbers.length >= 6) {
        entity.origin = new Vector3D(numbers[0], numbers[1], numbers[2]);
        entity.normal = new Vector3D(numbers[3], numbers[4], numbers[5]).normalize();
      } else {
        entity.origin = new Vector3D();
        entity.normal = new Vector3D(0, 0, 1);
      }
      if (numbers.length >= 9) {
        entity.uDir = new Vector3D(numbers[6], numbers[7], numbers[8]).normalize();
      } else {
        // Compute U direction perpendicular to normal
        const n = entity.normal;
        if (Math.abs(n.z) < 0.9) {
          entity.uDir = new Vector3D(-n.y, n.x, 0).normalize();
        } else {
          entity.uDir = new Vector3D(1, 0, 0);
        }
      }
      entity.vDir = entity.normal.cross(entity.uDir).normalize();
      return entity;
    }

    parseCone(entity, data) {
      const numbers = data.filter(t => t.type === 'number').map(t => t.value);
      entity.origin = numbers.length >= 3 ? new Vector3D(numbers[0], numbers[1], numbers[2]) : new Vector3D();
      entity.axis = numbers.length >= 6 ? new Vector3D(numbers[3], numbers[4], numbers[5]).normalize() : new Vector3D(0, 0, 1);
      entity.radius = numbers.length >= 7 ? Math.abs(numbers[6]) : 1;
      entity.halfAngle = numbers.length >= 8 ? numbers[7] : Math.PI / 4;
      return entity;
    }

    parseSphere(entity, data) {
      const numbers = data.filter(t => t.type === 'number').map(t => t.value);
      entity.center = numbers.length >= 3 ? new Vector3D(numbers[0], numbers[1], numbers[2]) : new Vector3D();
      entity.radius = numbers.length >= 4 ? Math.abs(numbers[3]) : 1;
      return entity;
    }

    parseTorus(entity, data) {
      const numbers = data.filter(t => t.type === 'number').map(t => t.value);
      entity.center = numbers.length >= 3 ? new Vector3D(numbers[0], numbers[1], numbers[2]) : new Vector3D();
      entity.axis = numbers.length >= 6 ? new Vector3D(numbers[3], numbers[4], numbers[5]).normalize() : new Vector3D(0, 0, 1);
      entity.majorRadius = numbers.length >= 7 ? Math.abs(numbers[6]) : 2;
      entity.minorRadius = numbers.length >= 8 ? Math.abs(numbers[7]) : 0.5;
      return entity;
    }

    parseSplineSurface(entity, data) {
      // Basic spline surface - extract control points if available
      entity.controlPoints = [];
      entity.uDegree = 3;
      entity.vDegree = 3;
      entity.uKnots = [];
      entity.vKnots = [];
      
      const numbers = data.filter(t => t.type === 'number').map(t => t.value);
      // Try to extract control point grid
      if (numbers.length >= 9) {
        for (let i = 0; i + 2 < numbers.length; i += 3) {
          entity.controlPoints.push(new Vector3D(numbers[i], numbers[i + 1], numbers[i + 2]));
        }
      }
      return entity;
    }

    // Curve parsers
    parseStraight(entity, data) {
      const numbers = data.filter(t => t.type === 'number').map(t => t.value);
      entity.origin = numbers.length >= 3 ? new Vector3D(numbers[0], numbers[1], numbers[2]) : new Vector3D();
      entity.direction = numbers.length >= 6 ? new Vector3D(numbers[3], numbers[4], numbers[5]).normalize() : new Vector3D(1, 0, 0);
      return entity;
    }

    parseEllipse(entity, data) {
      const numbers = data.filter(t => t.type === 'number').map(t => t.value);
      entity.center = numbers.length >= 3 ? new Vector3D(numbers[0], numbers[1], numbers[2]) : new Vector3D();
      entity.normal = numbers.length >= 6 ? new Vector3D(numbers[3], numbers[4], numbers[5]).normalize() : new Vector3D(0, 0, 1);
      entity.majorAxis = numbers.length >= 9 ? new Vector3D(numbers[6], numbers[7], numbers[8]) : new Vector3D(1, 0, 0);
      entity.ratio = numbers.length >= 10 ? numbers[9] : 1;
      return entity;
    }

    parseTransform(entity, data) {
      const numbers = data.filter(t => t.type === 'number').map(t => t.value);
      entity.matrix = Matrix4x4.fromACISTransform(numbers);
      this.transforms.set(entity.id, entity);
      return entity;
    }

    // Helper methods
    findPointer(data, index) {
      let count = 0;
      for (const token of data) {
        if (token.type === 'pointer' || token.type === 'null') {
          if (count === index) {
            return token.value;
          }
          count++;
        }
      }
      return null;
    }

    findFlag(data, flag) {
      return data.some(t => t.type === 'flag' && t.value === flag);
    }

    getEntity(ref) {
      if (ref === null || ref === undefined) return null;
      return this.entities.get(ref) || null;
    }

    /**
     * Build tessellated geometry from parsed entities
     */
    buildGeometry() {
      const result = {
        vertices: [],
        triangles: [],
        outlines: [],
        faces: []
      };

      // Process each body
      for (const body of this.bodies) {
        this.tessellateBody(body, result);
      }

      // If no bodies found, try to tessellate individual faces
      if (result.triangles.length === 0) {
        for (const [id, entity] of this.entities) {
          if (entity.type === 'face') {
            this.tessellateFace(entity, result, Matrix4x4.identity());
          }
        }
      }

      if (result.vertices.length === 0 && result.triangles.length === 0) {
        return null;
      }

      return result;
    }

    tessellateBody(body, result) {
      // Get transform if any
      let transform = Matrix4x4.identity();
      if (body.transformRef !== null) {
        const transformEntity = this.getEntity(body.transformRef);
        if (transformEntity && transformEntity.matrix) {
          transform = transformEntity.matrix;
        }
      }

      // Traverse lumps
      let lumpRef = body.lumpRef;
      while (lumpRef !== null) {
        const lump = this.getEntity(lumpRef);
        if (!lump) break;
        
        this.tessellateLump(lump, result, transform);
        lumpRef = lump.nextLumpRef;
      }
    }

    tessellateLump(lump, result, transform) {
      let shellRef = lump.shellRef;
      while (shellRef !== null) {
        const shell = this.getEntity(shellRef);
        if (!shell) break;

        this.tessellateShell(shell, result, transform);
        shellRef = shell.nextShellRef;
      }
    }

    tessellateShell(shell, result, transform) {
      let faceRef = shell.faceRef;
      while (faceRef !== null) {
        const face = this.getEntity(faceRef);
        if (!face) break;

        this.tessellateFace(face, result, transform);
        faceRef = face.nextFaceRef;
      }
    }

    tessellateFace(face, result, transform) {
      // Get the surface geometry
      const surface = this.getEntity(face.surfaceRef);
      if (!surface) return;

      // Collect face boundary loops
      const loops = [];
      let loopRef = face.loopRef;
      while (loopRef !== null) {
        const loop = this.getEntity(loopRef);
        if (!loop) break;

        const loopPoints = this.tessellateLoop(loop, transform);
        if (loopPoints.length >= 3) {
          loops.push(loopPoints);
        }
        loopRef = loop.nextLoopRef;
      }

      // Tessellate based on surface type
      const faceData = {
        surface,
        loops,
        sense: face.sense || 1
      };

      switch (surface.type) {
        case 'plane-surface':
        case 'plane':
          this.tessellatePlanarFace(faceData, result, transform);
          break;
        case 'cone-surface':
        case 'cone':
          this.tessellateCone(faceData, result, transform);
          break;
        case 'sphere-surface':
        case 'sphere':
          this.tessellateSphere(faceData, result, transform);
          break;
        case 'torus-surface':
        case 'torus':
          this.tessellateTorus(faceData, result, transform);
          break;
        default:
          // For unknown surfaces, use boundary loops as outline
          if (loops.length > 0) {
            this.tessellatePlanarFace(faceData, result, transform);
          }
      }
    }

    tessellateLoop(loop, transform) {
      const points = [];
      let coedgeRef = loop.coedgeRef;
      const visited = new Set();

      while (coedgeRef !== null && !visited.has(coedgeRef)) {
        visited.add(coedgeRef);
        const coedge = this.getEntity(coedgeRef);
        if (!coedge) break;

        const edgePoints = this.tessellateEdge(coedge, transform);
        // Add points, avoiding duplicates
        for (const pt of edgePoints) {
          if (points.length === 0 ||
              Math.hypot(pt.x - points[points.length - 1].x,
                        pt.y - points[points.length - 1].y,
                        pt.z - points[points.length - 1].z) > 1e-6) {
            points.push(pt);
          }
        }

        coedgeRef = coedge.nextCoedgeRef;
        if (coedgeRef === loop.coedgeRef) break; // Closed loop
      }

      return points;
    }

    tessellateEdge(coedge, transform) {
      const edge = this.getEntity(coedge.edgeRef);
      if (!edge) return [];

      const curve = this.getEntity(edge.curveRef);
      const startVertex = this.getEntity(edge.startVertexRef);
      const endVertex = this.getEntity(edge.endVertexRef);

      // Get vertex positions
      let startPoint = null, endPoint = null;
      if (startVertex) {
        const pt = this.getEntity(startVertex.pointRef);
        if (pt && pt.position) {
          startPoint = transform.transformPoint(pt.position);
        }
      }
      if (endVertex) {
        const pt = this.getEntity(endVertex.pointRef);
        if (pt && pt.position) {
          endPoint = transform.transformPoint(pt.position);
        }
      }

      // If no curve, just return endpoints
      if (!curve) {
        const points = [];
        if (startPoint) points.push(startPoint);
        if (endPoint && (!startPoint || 
            Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y, endPoint.z - startPoint.z) > 1e-6)) {
          points.push(endPoint);
        }
        return coedge.sense < 0 ? points.reverse() : points;
      }

      // Tessellate based on curve type
      const points = this.tessellateCurve(curve, edge.startParam, edge.endParam, transform);
      
      // Ensure endpoints match vertices
      if (points.length > 0 && startPoint) {
        points[0] = startPoint;
      }
      if (points.length > 1 && endPoint) {
        points[points.length - 1] = endPoint;
      }

      return coedge.sense < 0 ? points.reverse() : points;
    }

    tessellateCurve(curve, t0, t1, transform) {
      const numSegments = this.minSegments;
      const points = [];

      switch (curve.type) {
        case 'straight-curve':
        case 'straight': {
          // Line from t0 to t1
          const p0 = curve.origin.add(curve.direction.scale(t0 || 0));
          const p1 = curve.origin.add(curve.direction.scale(t1 || 1));
          points.push(transform.transformPoint(p0));
          points.push(transform.transformPoint(p1));
          break;
        }
        case 'ellipse-curve':
        case 'ellipse': {
          // Ellipse arc
          const startAngle = t0 || 0;
          const endAngle = t1 || Math.PI * 2;
          const majorLen = curve.majorAxis.length();
          const majorDir = curve.majorAxis.normalize();
          const minorDir = curve.normal.cross(majorDir).normalize();
          const minorLen = majorLen * curve.ratio;

          for (let i = 0; i <= numSegments; i++) {
            const t = startAngle + (endAngle - startAngle) * (i / numSegments);
            const cos = Math.cos(t);
            const sin = Math.sin(t);
            const pt = curve.center
              .add(majorDir.scale(cos * majorLen))
              .add(minorDir.scale(sin * minorLen));
            points.push(transform.transformPoint(pt));
          }
          break;
        }
        default:
          // Unknown curve - just sample linearly if we have endpoints
          for (let i = 0; i <= 1; i++) {
            const t = (t0 || 0) + ((t1 || 1) - (t0 || 0)) * i;
            // Can't sample unknown curve, skip
          }
      }

      return points;
    }

    tessellatePlanarFace(faceData, result, transform) {
      const { loops, sense } = faceData;
      if (loops.length === 0) return;

      // Project to 2D for triangulation
      const outerLoop = loops[0];
      const holes = loops.slice(1);

      // Use first loop's points for triangulation
      const points2D = outerLoop.map(p => ({ x: p.x, y: p.y }));
      
      // Add face outline
      result.outlines.push(outerLoop.map(p => p.to2D()));

      // Simple triangulation for convex faces
      if (points2D.length >= 3) {
        const baseIdx = result.vertices.length;
        outerLoop.forEach(p => result.vertices.push(p));

        // Fan triangulation
        for (let i = 1; i < outerLoop.length - 1; i++) {
          const tri = sense > 0 
            ? [baseIdx, baseIdx + i, baseIdx + i + 1]
            : [baseIdx, baseIdx + i + 1, baseIdx + i];
          result.triangles.push(tri);
        }
      }
    }

    tessellateCone(faceData, result, transform) {
      const { surface, loops, sense } = faceData;
      const { origin, axis, radius, halfAngle } = surface;
      
      const segments = this.maxSegments;
      const vSegments = Math.ceil(segments / 2);

      // Generate cone mesh
      const uDir = this.getPerpendicularVector(axis);
      const vDir = axis.cross(uDir).normalize();

      // Height based on half angle
      const height = radius / Math.tan(halfAngle);

      const baseIdx = result.vertices.length;
      const vertices = [];

      for (let v = 0; v <= vSegments; v++) {
        const vt = v / vSegments;
        const currentRadius = radius * (1 - vt);
        const z = height * vt;

        for (let u = 0; u <= segments; u++) {
          const ut = u / segments;
          const angle = ut * Math.PI * 2;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);

          const pt = origin
            .add(uDir.scale(cos * currentRadius))
            .add(vDir.scale(sin * currentRadius))
            .add(axis.scale(z));
          
          vertices.push(transform.transformPoint(pt));
        }
      }

      // Add vertices
      vertices.forEach(v => result.vertices.push(v));

      // Generate triangles
      for (let v = 0; v < vSegments; v++) {
        for (let u = 0; u < segments; u++) {
          const i0 = baseIdx + v * (segments + 1) + u;
          const i1 = i0 + 1;
          const i2 = i0 + segments + 1;
          const i3 = i2 + 1;

          if (sense > 0) {
            result.triangles.push([i0, i1, i2]);
            result.triangles.push([i1, i3, i2]);
          } else {
            result.triangles.push([i0, i2, i1]);
            result.triangles.push([i1, i2, i3]);
          }
        }
      }

      // Add outline from loops
      loops.forEach(loop => {
        result.outlines.push(loop.map(p => p.to2D()));
      });
    }

    tessellateSphere(faceData, result, transform) {
      const { surface, loops, sense } = faceData;
      const { center, radius } = surface;

      const uSegments = this.maxSegments;
      const vSegments = Math.ceil(uSegments / 2);

      const baseIdx = result.vertices.length;

      // Generate sphere mesh
      for (let v = 0; v <= vSegments; v++) {
        const vt = v / vSegments;
        const phi = vt * Math.PI; // 0 to PI

        for (let u = 0; u <= uSegments; u++) {
          const ut = u / uSegments;
          const theta = ut * Math.PI * 2; // 0 to 2PI

          const x = radius * Math.sin(phi) * Math.cos(theta);
          const y = radius * Math.sin(phi) * Math.sin(theta);
          const z = radius * Math.cos(phi);

          const pt = center.add(new Vector3D(x, y, z));
          result.vertices.push(transform.transformPoint(pt));
        }
      }

      // Generate triangles
      for (let v = 0; v < vSegments; v++) {
        for (let u = 0; u < uSegments; u++) {
          const i0 = baseIdx + v * (uSegments + 1) + u;
          const i1 = i0 + 1;
          const i2 = i0 + uSegments + 1;
          const i3 = i2 + 1;

          if (v > 0) { // Skip degenerate triangles at poles
            if (sense > 0) {
              result.triangles.push([i0, i1, i2]);
            } else {
              result.triangles.push([i0, i2, i1]);
            }
          }
          if (v < vSegments - 1) {
            if (sense > 0) {
              result.triangles.push([i1, i3, i2]);
            } else {
              result.triangles.push([i1, i2, i3]);
            }
          }
        }
      }

      // Add outline from loops
      loops.forEach(loop => {
        result.outlines.push(loop.map(p => p.to2D()));
      });
    }

    tessellateTorus(faceData, result, transform) {
      const { surface, loops, sense } = faceData;
      const { center, axis, majorRadius, minorRadius } = surface;

      const uSegments = this.maxSegments;
      const vSegments = Math.ceil(uSegments / 2);

      const uDir = this.getPerpendicularVector(axis);
      const vDir = axis.cross(uDir).normalize();

      const baseIdx = result.vertices.length;

      // Generate torus mesh
      for (let u = 0; u <= uSegments; u++) {
        const ut = u / uSegments;
        const theta = ut * Math.PI * 2;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        // Center of tube at this theta
        const tubeCenter = center
          .add(uDir.scale(cosTheta * majorRadius))
          .add(vDir.scale(sinTheta * majorRadius));

        // Direction from center to tube center
        const tubeDir = uDir.scale(cosTheta).add(vDir.scale(sinTheta));

        for (let v = 0; v <= vSegments; v++) {
          const vt = v / vSegments;
          const phi = vt * Math.PI * 2;
          const cosPhi = Math.cos(phi);
          const sinPhi = Math.sin(phi);

          const pt = tubeCenter
            .add(tubeDir.scale(cosPhi * minorRadius))
            .add(axis.scale(sinPhi * minorRadius));

          result.vertices.push(transform.transformPoint(pt));
        }
      }

      // Generate triangles
      for (let u = 0; u < uSegments; u++) {
        for (let v = 0; v < vSegments; v++) {
          const i0 = baseIdx + u * (vSegments + 1) + v;
          const i1 = i0 + 1;
          const i2 = i0 + vSegments + 1;
          const i3 = i2 + 1;

          if (sense > 0) {
            result.triangles.push([i0, i1, i2]);
            result.triangles.push([i1, i3, i2]);
          } else {
            result.triangles.push([i0, i2, i1]);
            result.triangles.push([i1, i2, i3]);
          }
        }
      }

      // Add outline from loops
      loops.forEach(loop => {
        result.outlines.push(loop.map(p => p.to2D()));
      });
    }

    getPerpendicularVector(v) {
      if (Math.abs(v.z) < 0.9) {
        return new Vector3D(-v.y, v.x, 0).normalize();
      } else {
        return new Vector3D(1, 0, 0);
      }
    }
  }

  /**
   * High-level API for parsing ACIS data and getting tessellated geometry
   */
  function parseACIS(acisData, options = {}) {
    const parser = new ACISParser(options);
    return parser.parse(acisData);
  }

  /**
   * Convert ACIS parse result to format suitable for rendering
   */
  function acisToRenderGeometry(parseResult) {
    if (!parseResult) return null;

    const { vertices, triangles, outlines } = parseResult;

    // Convert vertices to 2D for rendering
    const vertices2D = vertices.map(v => ({ x: v.x, y: v.y }));

    // Build triangle arrays
    const triangleArrays = triangles.map(tri => {
      return tri.map(idx => vertices2D[idx]).filter(Boolean);
    }).filter(t => t.length === 3);

    return {
      triangles: triangleArrays,
      outlines: outlines || [],
      vertices: vertices2D
    };
  }

  // Export
  namespace.ACISParser = ACISParser;
  namespace.parseACIS = parseACIS;
  namespace.acisToRenderGeometry = acisToRenderGeometry;
  namespace.Vector3D = Vector3D;
  namespace.Matrix4x4 = Matrix4x4;

  return namespace;
}));
