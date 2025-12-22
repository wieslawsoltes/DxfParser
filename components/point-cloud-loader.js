/**
 * Point Cloud Loader for DXF POINTCLOUD Entity
 * 
 * Supports loading and parsing of:
 * - PCG (Autodesk Point Cloud) files
 * - RCS/RCP (Autodesk ReCap) files
 * - PTS (ASCII point cloud) files
 * - E57 (ASTM standard point cloud) file headers
 * - XYZ (Simple ASCII) files
 * - PLY (Polygon File Format) files
 * - LAS/LAZ (LiDAR) file headers
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

  // Point cloud file format constants
  const PointCloudFormat = {
    UNKNOWN: 'unknown',
    PCG: 'pcg',
    RCS: 'rcs',
    RCP: 'rcp',
    PTS: 'pts',
    PTX: 'ptx',
    E57: 'e57',
    XYZ: 'xyz',
    PLY: 'ply',
    LAS: 'las',
    LAZ: 'laz'
  };

  // Default loading options
  const DEFAULT_OPTIONS = {
    maxPoints: 1000000,
    subsampleRate: 1,
    includeIntensity: true,
    includeColor: true,
    includeNormals: false
  };

  /**
   * Point3D class for point cloud data
   */
  class Point3D {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }

    distanceTo(other) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dz = this.z - other.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    toArray() {
      return [this.x, this.y, this.z];
    }
  }

  /**
   * Color class for RGB values
   */
  class Color {
    constructor(r = 0, g = 0, b = 0, a = 255) {
      this.r = Math.max(0, Math.min(255, Math.round(r)));
      this.g = Math.max(0, Math.min(255, Math.round(g)));
      this.b = Math.max(0, Math.min(255, Math.round(b)));
      this.a = Math.max(0, Math.min(255, Math.round(a)));
    }

    toHex() {
      return '#' + [this.r, this.g, this.b]
        .map(c => c.toString(16).padStart(2, '0'))
        .join('');
    }

    toRGBA() {
      return `rgba(${this.r},${this.g},${this.b},${this.a / 255})`;
    }

    toArray() {
      return [this.r, this.g, this.b, this.a];
    }
  }

  /**
   * Bounding box for point clouds
   */
  class BoundingBox3D {
    constructor() {
      this.min = new Point3D(Infinity, Infinity, Infinity);
      this.max = new Point3D(-Infinity, -Infinity, -Infinity);
    }

    extend(point) {
      this.min.x = Math.min(this.min.x, point.x);
      this.min.y = Math.min(this.min.y, point.y);
      this.min.z = Math.min(this.min.z, point.z);
      this.max.x = Math.max(this.max.x, point.x);
      this.max.y = Math.max(this.max.y, point.y);
      this.max.z = Math.max(this.max.z, point.z);
    }

    getCenter() {
      return new Point3D(
        (this.min.x + this.max.x) / 2,
        (this.min.y + this.max.y) / 2,
        (this.min.z + this.max.z) / 2
      );
    }

    getSize() {
      return new Point3D(
        this.max.x - this.min.x,
        this.max.y - this.min.y,
        this.max.z - this.min.z
      );
    }

    isValid() {
      return Number.isFinite(this.min.x) && 
             Number.isFinite(this.max.x) &&
             this.min.x <= this.max.x;
    }
  }

  /**
   * Point Cloud data container
   */
  class PointCloud {
    constructor() {
      this.format = PointCloudFormat.UNKNOWN;
      this.pointCount = 0;
      this.positions = [];   // Array of Point3D
      this.intensities = []; // Array of numbers (0-1)
      this.colors = [];      // Array of Color
      this.normals = [];     // Array of Point3D (normal vectors)
      this.classifications = []; // Array of classification codes
      this.bounds = new BoundingBox3D();
      this.metadata = {};
    }

    addPoint(x, y, z, intensity = null, color = null, normal = null, classification = null) {
      const point = new Point3D(x, y, z);
      this.positions.push(point);
      this.bounds.extend(point);

      if (intensity !== null) {
        this.intensities.push(intensity);
      }
      if (color !== null) {
        this.colors.push(color instanceof Color ? color : new Color(color.r, color.g, color.b));
      }
      if (normal !== null) {
        this.normals.push(new Point3D(normal.x, normal.y, normal.z));
      }
      if (classification !== null) {
        this.classifications.push(classification);
      }

      this.pointCount++;
    }

    getPoint(index) {
      if (index < 0 || index >= this.pointCount) return null;
      return {
        position: this.positions[index],
        intensity: this.intensities[index] || null,
        color: this.colors[index] || null,
        normal: this.normals[index] || null,
        classification: this.classifications[index] || null
      };
    }

    subsample(rate) {
      if (rate <= 1) return this;

      const result = new PointCloud();
      result.format = this.format;
      result.metadata = { ...this.metadata, subsampled: true, originalCount: this.pointCount };

      for (let i = 0; i < this.pointCount; i += rate) {
        const pt = this.positions[i];
        result.addPoint(
          pt.x, pt.y, pt.z,
          this.intensities[i] || null,
          this.colors[i] || null,
          this.normals[i] || null,
          this.classifications[i] || null
        );
      }

      return result;
    }

    toFloat32Arrays() {
      const positions = new Float32Array(this.pointCount * 3);
      const colors = this.colors.length > 0 ? new Uint8Array(this.pointCount * 4) : null;

      for (let i = 0; i < this.pointCount; i++) {
        const pt = this.positions[i];
        positions[i * 3] = pt.x;
        positions[i * 3 + 1] = pt.y;
        positions[i * 3 + 2] = pt.z;

        if (colors && this.colors[i]) {
          const c = this.colors[i];
          colors[i * 4] = c.r;
          colors[i * 4 + 1] = c.g;
          colors[i * 4 + 2] = c.b;
          colors[i * 4 + 3] = c.a;
        }
      }

      return { positions, colors };
    }
  }

  /**
   * Base parser class
   */
  class PointCloudParser {
    constructor(options = {}) {
      this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    parse(data) {
      throw new Error('parse() must be implemented by subclass');
    }

    detectFormat(data) {
      if (!data) return PointCloudFormat.UNKNOWN;

      // Check if it's a buffer/array
      if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        return this.detectBinaryFormat(data);
      }

      // Check if it's a string
      if (typeof data === 'string') {
        return this.detectTextFormat(data);
      }

      return PointCloudFormat.UNKNOWN;
    }

    detectBinaryFormat(buffer) {
      const bytes = buffer instanceof ArrayBuffer 
        ? new Uint8Array(buffer) 
        : buffer;

      if (bytes.length < 4) return PointCloudFormat.UNKNOWN;

      // Check magic bytes
      const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      
      // LAS file signature
      if (magic === 'LASF') return PointCloudFormat.LAS;
      
      // E57 file signature
      if (magic === 'ASTM') return PointCloudFormat.E57;
      
      // PLY binary
      if (magic === 'ply\n' || magic === 'ply ') return PointCloudFormat.PLY;
      
      // PCG signature (Autodesk proprietary)
      if (bytes[0] === 0x50 && bytes[1] === 0x43 && bytes[2] === 0x47) {
        return PointCloudFormat.PCG;
      }

      // RCS/RCP signature
      if (bytes[0] === 0x52 && bytes[1] === 0x43 && bytes[2] === 0x53) {
        return PointCloudFormat.RCS;
      }

      return PointCloudFormat.UNKNOWN;
    }

    detectTextFormat(text) {
      const firstLine = text.split('\n')[0].trim().toLowerCase();
      
      // PLY ASCII
      if (firstLine.startsWith('ply')) return PointCloudFormat.PLY;
      
      // PTS format (typically starts with point count)
      if (/^\d+$/.test(firstLine)) return PointCloudFormat.PTS;
      
      // PTX format (scanner info header)
      if (firstLine.includes('columns') || /^\d+ \d+$/.test(firstLine)) {
        return PointCloudFormat.PTX;
      }

      // XYZ format (simple space-separated coordinates)
      const parts = firstLine.split(/\s+/);
      if (parts.length >= 3 && parts.slice(0, 3).every(p => !isNaN(parseFloat(p)))) {
        return PointCloudFormat.XYZ;
      }

      return PointCloudFormat.UNKNOWN;
    }
  }

  /**
   * XYZ/ASCII Point Cloud Parser
   */
  class XYZParser extends PointCloudParser {
    parse(text) {
      const cloud = new PointCloud();
      cloud.format = PointCloudFormat.XYZ;

      const lines = text.split('\n');
      let pointsParsed = 0;

      for (let i = 0; i < lines.length && pointsParsed < this.options.maxPoints; i++) {
        // Apply subsample rate
        if (i % this.options.subsampleRate !== 0) continue;

        const line = lines[i].trim();
        if (!line || line.startsWith('#') || line.startsWith('//')) continue;

        const parts = line.split(/[\s,;]+/).map(p => parseFloat(p));
        
        // Need at least X, Y, Z
        if (parts.length < 3 || parts.slice(0, 3).some(isNaN)) continue;

        const [x, y, z] = parts;
        let intensity = null;
        let color = null;

        // Check for additional fields (intensity and/or RGB)
        if (parts.length === 4 && this.options.includeIntensity) {
          // X Y Z Intensity
          intensity = parts[3] / 255; // Normalize to 0-1
        } else if (parts.length >= 6 && this.options.includeColor) {
          // X Y Z R G B [Intensity]
          color = new Color(parts[3], parts[4], parts[5]);
          if (parts.length >= 7 && this.options.includeIntensity) {
            intensity = parts[6] / 255;
          }
        } else if (parts.length === 7 && this.options.includeIntensity) {
          // X Y Z Intensity R G B
          intensity = parts[3] / 255;
          if (this.options.includeColor) {
            color = new Color(parts[4], parts[5], parts[6]);
          }
        }

        cloud.addPoint(x, y, z, intensity, color);
        pointsParsed++;
      }

      return cloud;
    }
  }

  /**
   * PTS Point Cloud Parser (Leica/Faro format)
   */
  class PTSParser extends PointCloudParser {
    parse(text) {
      const cloud = new PointCloud();
      cloud.format = PointCloudFormat.PTS;

      const lines = text.split('\n');
      let lineIndex = 0;
      let pointsParsed = 0;

      // First line is typically the point count
      const firstLine = lines[lineIndex++].trim();
      const totalPoints = parseInt(firstLine, 10);
      if (!isNaN(totalPoints)) {
        cloud.metadata.declaredPointCount = totalPoints;
      } else {
        lineIndex = 0; // Not a count, start from beginning
      }

      for (; lineIndex < lines.length && pointsParsed < this.options.maxPoints; lineIndex++) {
        // Apply subsample rate
        if ((lineIndex - 1) % this.options.subsampleRate !== 0) continue;

        const line = lines[lineIndex].trim();
        if (!line) continue;

        const parts = line.split(/\s+/).map(p => parseFloat(p));
        
        // PTS format: X Y Z Intensity R G B
        if (parts.length < 3 || parts.slice(0, 3).some(isNaN)) continue;

        const [x, y, z] = parts;
        let intensity = null;
        let color = null;

        if (parts.length >= 4 && this.options.includeIntensity) {
          // Intensity is typically -2048 to 2047 or 0-255
          const rawIntensity = parts[3];
          if (rawIntensity < 0) {
            intensity = (rawIntensity + 2048) / 4095;
          } else if (rawIntensity > 255) {
            intensity = rawIntensity / 65535;
          } else {
            intensity = rawIntensity / 255;
          }
        }

        if (parts.length >= 7 && this.options.includeColor) {
          color = new Color(parts[4], parts[5], parts[6]);
        }

        cloud.addPoint(x, y, z, intensity, color);
        pointsParsed++;
      }

      return cloud;
    }
  }

  /**
   * PLY Point Cloud Parser
   */
  class PLYParser extends PointCloudParser {
    parse(text) {
      const cloud = new PointCloud();
      cloud.format = PointCloudFormat.PLY;

      const lines = text.split('\n');
      let lineIndex = 0;
      let inHeader = true;
      let vertexCount = 0;
      let properties = [];
      let pointsParsed = 0;

      // Parse header
      while (lineIndex < lines.length && inHeader) {
        const line = lines[lineIndex++].trim().toLowerCase();
        
        if (line === 'end_header') {
          inHeader = false;
          break;
        }

        if (line.startsWith('element vertex')) {
          vertexCount = parseInt(line.split(/\s+/)[2], 10) || 0;
        }

        if (line.startsWith('property')) {
          const parts = line.split(/\s+/);
          if (parts.length >= 3) {
            properties.push({
              type: parts[1],
              name: parts[2]
            });
          }
        }

        if (line.startsWith('format')) {
          if (line.includes('binary')) {
            console.warn('Binary PLY format not fully supported in text parser');
          }
        }
      }

      cloud.metadata.declaredPointCount = vertexCount;
      cloud.metadata.properties = properties;

      // Find property indices
      const propMap = {};
      properties.forEach((p, i) => propMap[p.name] = i);

      const hasX = propMap.hasOwnProperty('x');
      const hasY = propMap.hasOwnProperty('y');
      const hasZ = propMap.hasOwnProperty('z');
      const hasR = propMap.hasOwnProperty('red') || propMap.hasOwnProperty('r');
      const hasG = propMap.hasOwnProperty('green') || propMap.hasOwnProperty('g');
      const hasB = propMap.hasOwnProperty('blue') || propMap.hasOwnProperty('b');
      const hasNx = propMap.hasOwnProperty('nx');
      const hasNy = propMap.hasOwnProperty('ny');
      const hasNz = propMap.hasOwnProperty('nz');
      const hasIntensity = propMap.hasOwnProperty('intensity') || propMap.hasOwnProperty('scalar');

      const xIdx = propMap.x !== undefined ? propMap.x : 0;
      const yIdx = propMap.y !== undefined ? propMap.y : 1;
      const zIdx = propMap.z !== undefined ? propMap.z : 2;
      const rIdx = propMap.red !== undefined ? propMap.red : (propMap.r !== undefined ? propMap.r : -1);
      const gIdx = propMap.green !== undefined ? propMap.green : (propMap.g !== undefined ? propMap.g : -1);
      const bIdx = propMap.blue !== undefined ? propMap.blue : (propMap.b !== undefined ? propMap.b : -1);
      const nxIdx = propMap.nx !== undefined ? propMap.nx : -1;
      const nyIdx = propMap.ny !== undefined ? propMap.ny : -1;
      const nzIdx = propMap.nz !== undefined ? propMap.nz : -1;
      const intensityIdx = propMap.intensity !== undefined ? propMap.intensity : (propMap.scalar !== undefined ? propMap.scalar : -1);

      // Parse vertex data
      for (let i = 0; lineIndex < lines.length && pointsParsed < this.options.maxPoints && i < vertexCount; lineIndex++, i++) {
        // Apply subsample rate
        if (i % this.options.subsampleRate !== 0) continue;

        const line = lines[lineIndex].trim();
        if (!line) continue;

        const parts = line.split(/\s+/).map(p => parseFloat(p));
        
        if (parts.length < properties.length) continue;

        const x = parts[xIdx];
        const y = parts[yIdx];
        const z = parts[zIdx];

        if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

        let intensity = null;
        let color = null;
        let normal = null;

        if (intensityIdx >= 0 && this.options.includeIntensity) {
          intensity = parts[intensityIdx];
          if (intensity > 1) intensity /= 255;
        }

        if (rIdx >= 0 && gIdx >= 0 && bIdx >= 0 && this.options.includeColor) {
          color = new Color(parts[rIdx], parts[gIdx], parts[bIdx]);
        }

        if (nxIdx >= 0 && nyIdx >= 0 && nzIdx >= 0 && this.options.includeNormals) {
          normal = { x: parts[nxIdx], y: parts[nyIdx], z: parts[nzIdx] };
        }

        cloud.addPoint(x, y, z, intensity, color, normal);
        pointsParsed++;
      }

      return cloud;
    }
  }

  /**
   * LAS File Header Parser (basic support)
   */
  class LASParser extends PointCloudParser {
    parse(buffer) {
      const cloud = new PointCloud();
      cloud.format = PointCloudFormat.LAS;

      const bytes = buffer instanceof ArrayBuffer 
        ? new Uint8Array(buffer) 
        : buffer;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      // Validate LAS signature
      const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      if (signature !== 'LASF') {
        throw new Error('Invalid LAS file signature');
      }

      // Read header
      const versionMajor = bytes[24];
      const versionMinor = bytes[25];
      cloud.metadata.version = `${versionMajor}.${versionMinor}`;

      const headerSize = view.getUint16(94, true);
      const offsetToPointData = view.getUint32(96, true);
      const numVarLengthRecords = view.getUint32(100, true);
      const pointDataFormat = bytes[104];
      const pointDataRecordLength = view.getUint16(105, true);

      // LAS 1.4 uses 64-bit point count, earlier versions use 32-bit
      let numPoints;
      if (versionMajor >= 1 && versionMinor >= 4) {
        numPoints = Number(view.getBigUint64(247, true));
      } else {
        numPoints = view.getUint32(107, true);
      }

      cloud.metadata.declaredPointCount = numPoints;
      cloud.metadata.pointDataFormat = pointDataFormat;
      cloud.metadata.headerSize = headerSize;

      // Read scale and offset
      const scaleX = view.getFloat64(131, true);
      const scaleY = view.getFloat64(139, true);
      const scaleZ = view.getFloat64(147, true);
      const offsetX = view.getFloat64(155, true);
      const offsetY = view.getFloat64(163, true);
      const offsetZ = view.getFloat64(171, true);

      cloud.metadata.scale = { x: scaleX, y: scaleY, z: scaleZ };
      cloud.metadata.offset = { x: offsetX, y: offsetY, z: offsetZ };

      // Read bounding box from header
      const minX = view.getFloat64(187, true);
      const minY = view.getFloat64(203, true);
      const minZ = view.getFloat64(219, true);
      const maxX = view.getFloat64(179, true);
      const maxY = view.getFloat64(195, true);
      const maxZ = view.getFloat64(211, true);

      cloud.bounds.min = new Point3D(minX, minY, minZ);
      cloud.bounds.max = new Point3D(maxX, maxY, maxZ);

      // Parse point data
      let offset = offsetToPointData;
      let pointsParsed = 0;
      const maxPointsToParse = Math.min(numPoints, this.options.maxPoints);

      // Point data format determines what data is available
      const hasRGB = pointDataFormat === 2 || pointDataFormat === 3 || 
                     pointDataFormat === 5 || pointDataFormat === 7 || 
                     pointDataFormat === 8 || pointDataFormat === 10;

      for (let i = 0; i < numPoints && pointsParsed < maxPointsToParse; i++) {
        // Apply subsample rate
        if (i % this.options.subsampleRate !== 0) {
          offset += pointDataRecordLength;
          continue;
        }

        if (offset + pointDataRecordLength > bytes.length) break;

        // Read X, Y, Z as 32-bit integers
        const rawX = view.getInt32(offset, true);
        const rawY = view.getInt32(offset + 4, true);
        const rawZ = view.getInt32(offset + 8, true);

        const x = rawX * scaleX + offsetX;
        const y = rawY * scaleY + offsetY;
        const z = rawZ * scaleZ + offsetZ;

        // Read intensity (16-bit unsigned)
        let intensity = null;
        if (this.options.includeIntensity) {
          intensity = view.getUint16(offset + 12, true) / 65535;
        }

        // Read classification
        const classification = bytes[offset + 15];

        // Read RGB if available
        let color = null;
        if (hasRGB && this.options.includeColor) {
          // RGB offset depends on point format
          const rgbOffset = offset + 20; // Simplified - actual offset varies by format
          if (rgbOffset + 6 <= bytes.length) {
            const r = view.getUint16(rgbOffset, true) >> 8;
            const g = view.getUint16(rgbOffset + 2, true) >> 8;
            const b = view.getUint16(rgbOffset + 4, true) >> 8;
            color = new Color(r, g, b);
          }
        }

        cloud.addPoint(x, y, z, intensity, color, null, classification);
        pointsParsed++;
        offset += pointDataRecordLength;
      }

      return cloud;
    }
  }

  /**
   * PCG File Parser (Autodesk format - basic support)
   */
  class PCGParser extends PointCloudParser {
    parse(buffer) {
      const cloud = new PointCloud();
      cloud.format = PointCloudFormat.PCG;

      const bytes = buffer instanceof ArrayBuffer 
        ? new Uint8Array(buffer) 
        : buffer;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      // PCG format is proprietary - this is a basic parser
      // Real implementation would need reverse-engineering or official documentation

      // Check for PCG signature
      if (bytes[0] !== 0x50 || bytes[1] !== 0x43 || bytes[2] !== 0x47) {
        console.warn('Unrecognized PCG format variant');
        return cloud;
      }

      cloud.metadata.format = 'Autodesk PCG';
      
      // Try to read basic header info
      // Note: Actual PCG format is complex with multiple sections
      try {
        // Version info at offset 4
        const version = view.getUint32(4, true);
        cloud.metadata.version = version;

        // Point count often at offset 8 or 12
        const pointCount = view.getUint32(8, true);
        if (pointCount > 0 && pointCount < 100000000) {
          cloud.metadata.declaredPointCount = pointCount;
        }
      } catch (e) {
        console.warn('Error reading PCG header:', e.message);
      }

      // Without official format documentation, we can only read basic header
      // Points would need to be parsed based on format version

      return cloud;
    }
  }

  /**
   * RCS File Parser (Autodesk ReCap - basic support)
   */
  class RCSParser extends PointCloudParser {
    parse(buffer) {
      const cloud = new PointCloud();
      cloud.format = PointCloudFormat.RCS;

      const bytes = buffer instanceof ArrayBuffer 
        ? new Uint8Array(buffer) 
        : buffer;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      cloud.metadata.format = 'Autodesk ReCap';

      // RCS is a proprietary format using SQLite database
      // Full support would require SQLite parsing

      // Check for SQLite signature
      const sqliteSig = 'SQLite format 3';
      const header = String.fromCharCode(...bytes.slice(0, 16));
      if (header.startsWith(sqliteSig)) {
        cloud.metadata.containerFormat = 'SQLite';
        cloud.metadata.note = 'RCS files require SQLite database parsing for full access';
      }

      return cloud;
    }
  }

  /**
   * E57 File Parser (basic header support)
   */
  class E57Parser extends PointCloudParser {
    parse(buffer) {
      const cloud = new PointCloud();
      cloud.format = PointCloudFormat.E57;

      const bytes = buffer instanceof ArrayBuffer 
        ? new Uint8Array(buffer) 
        : buffer;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      // Check for E57 signature
      const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      if (signature !== 'ASTM') {
        throw new Error('Invalid E57 file signature');
      }

      cloud.metadata.format = 'ASTM E57';

      // Read E57 header
      try {
        // Version info
        const majorVersion = view.getUint32(4, true);
        const minorVersion = view.getUint32(8, true);
        cloud.metadata.version = `${majorVersion}.${minorVersion}`;

        // File length
        const fileLength = Number(view.getBigUint64(16, true));
        cloud.metadata.fileLength = fileLength;

        // XML offset and length
        const xmlOffset = Number(view.getBigUint64(24, true));
        const xmlLength = Number(view.getBigUint64(32, true));
        cloud.metadata.xmlOffset = xmlOffset;
        cloud.metadata.xmlLength = xmlLength;

        // E57 uses XML to describe data structure
        // Full parsing requires XML parsing and compressed data block reading
        if (xmlOffset > 0 && xmlLength > 0 && xmlOffset + xmlLength <= bytes.length) {
          const xmlBytes = bytes.slice(xmlOffset, xmlOffset + xmlLength);
          const xmlString = new TextDecoder().decode(xmlBytes);
          // Could parse XML here for structure info
          cloud.metadata.hasXML = true;
        }
      } catch (e) {
        console.warn('Error reading E57 header:', e.message);
      }

      return cloud;
    }
  }

  /**
   * Main Point Cloud Loader class
   */
  class PointCloudLoader {
    constructor(options = {}) {
      this.options = { ...DEFAULT_OPTIONS, ...options };
      this.parsers = {
        [PointCloudFormat.XYZ]: new XYZParser(this.options),
        [PointCloudFormat.PTS]: new PTSParser(this.options),
        [PointCloudFormat.PLY]: new PLYParser(this.options),
        [PointCloudFormat.LAS]: new LASParser(this.options),
        [PointCloudFormat.PCG]: new PCGParser(this.options),
        [PointCloudFormat.RCS]: new RCSParser(this.options),
        [PointCloudFormat.E57]: new E57Parser(this.options)
      };
    }

    /**
     * Detect format from file extension
     */
    detectFormatFromExtension(filename) {
      if (!filename) return PointCloudFormat.UNKNOWN;
      
      const ext = filename.toLowerCase().split('.').pop();
      const formatMap = {
        'xyz': PointCloudFormat.XYZ,
        'pts': PointCloudFormat.PTS,
        'ptx': PointCloudFormat.PTX,
        'ply': PointCloudFormat.PLY,
        'las': PointCloudFormat.LAS,
        'laz': PointCloudFormat.LAZ,
        'pcg': PointCloudFormat.PCG,
        'rcs': PointCloudFormat.RCS,
        'rcp': PointCloudFormat.RCP,
        'e57': PointCloudFormat.E57
      };
      
      return formatMap[ext] || PointCloudFormat.UNKNOWN;
    }

    /**
     * Load point cloud from data with automatic format detection
     */
    load(data, filename = null) {
      let format = PointCloudFormat.UNKNOWN;
      
      // Try to detect from filename first
      if (filename) {
        format = this.detectFormatFromExtension(filename);
      }

      // If still unknown, detect from content
      if (format === PointCloudFormat.UNKNOWN) {
        const baseParser = new PointCloudParser(this.options);
        format = baseParser.detectFormat(data);
      }

      return this.loadWithFormat(data, format);
    }

    /**
     * Load point cloud with specified format
     */
    loadWithFormat(data, format) {
      const parser = this.parsers[format];
      if (!parser) {
        console.warn(`No parser available for format: ${format}`);
        // Try XYZ as fallback for text data
        if (typeof data === 'string') {
          return this.parsers[PointCloudFormat.XYZ].parse(data);
        }
        return new PointCloud();
      }

      return parser.parse(data);
    }

    /**
     * Load from URL (async)
     */
    async loadFromUrl(url) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load point cloud: ${response.status}`);
      }

      const format = this.detectFormatFromExtension(url);
      const isBinary = [
        PointCloudFormat.LAS, 
        PointCloudFormat.LAZ,
        PointCloudFormat.PCG,
        PointCloudFormat.RCS,
        PointCloudFormat.E57
      ].includes(format);

      const data = isBinary 
        ? await response.arrayBuffer() 
        : await response.text();

      return this.load(data, url);
    }

    /**
     * Load from File object (async)
     */
    async loadFromFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const format = this.detectFormatFromExtension(file.name);
        const isBinary = [
          PointCloudFormat.LAS, 
          PointCloudFormat.LAZ,
          PointCloudFormat.PCG,
          PointCloudFormat.RCS,
          PointCloudFormat.E57
        ].includes(format);

        reader.onload = (e) => {
          try {
            const cloud = this.load(e.target.result, file.name);
            resolve(cloud);
          } catch (err) {
            reject(err);
          }
        };

        reader.onerror = () => reject(new Error('File read error'));

        if (isBinary) {
          reader.readAsArrayBuffer(file);
        } else {
          reader.readAsText(file);
        }
      });
    }
  }

  /**
   * Convert point cloud to render-ready format
   */
  function pointCloudToRenderData(cloud, options = {}) {
    const {
      pointSize = 2,
      defaultColor = '#FFFFFF',
      useIntensityAsColor = false,
      subsample = 1
    } = options;

    const data = subsample > 1 ? cloud.subsample(subsample) : cloud;
    const points = [];

    for (let i = 0; i < data.pointCount; i++) {
      const pt = data.positions[i];
      let color = defaultColor;

      if (useIntensityAsColor && data.intensities[i] !== undefined) {
        const intensity = Math.round(data.intensities[i] * 255);
        color = `rgb(${intensity},${intensity},${intensity})`;
      } else if (data.colors[i]) {
        color = data.colors[i].toHex();
      }

      points.push({
        x: pt.x,
        y: pt.y,
        z: pt.z,
        color,
        size: pointSize
      });
    }

    return {
      points,
      bounds: data.bounds,
      count: data.pointCount,
      metadata: data.metadata
    };
  }

  // Export
  namespace.PointCloudLoader = PointCloudLoader;
  namespace.PointCloud = PointCloud;
  namespace.Point3D = Point3D;
  namespace.Color = Color;
  namespace.BoundingBox3D = BoundingBox3D;
  namespace.PointCloudFormat = PointCloudFormat;
  namespace.pointCloudToRenderData = pointCloudToRenderData;

  // Individual parsers for direct use
  namespace.XYZParser = XYZParser;
  namespace.PTSParser = PTSParser;
  namespace.PLYParser = PLYParser;
  namespace.LASParser = LASParser;
  namespace.PCGParser = PCGParser;
  namespace.RCSParser = RCSParser;
  namespace.E57Parser = E57Parser;

  return namespace;
}));
