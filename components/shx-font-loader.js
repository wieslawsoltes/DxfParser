/**
 * SHX Font Loader for DXF SHAPE Entity and Text Rendering
 * 
 * Parses AutoCAD SHX (compiled shape) and SHP (source shape) font files
 * to extract glyph definitions for text and shape rendering.
 * 
 * SHX Format:
 * - Binary compiled format used by AutoCAD
 * - Contains glyph definitions as vector commands
 * - Supports both Big Font and Regular fonts
 * 
 * SHP Format:
 * - ASCII source format for shape definitions
 * - Human-readable command sequences
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

  // SHX file type constants
  const SHXType = {
    UNKNOWN: 0,
    SHAPES: 1,      // Shape library
    BIGFONT: 2,     // Big font (Asian characters)
    UNIFONT: 3,     // Unicode font
    REGULAR: 4      // Regular font
  };

  // SHX command codes
  const SHXCommand = {
    END_OF_SHAPE: 0,
    PEN_DOWN: 1,
    PEN_UP: 2,
    DIVIDE_VECTOR: 3,
    MULTIPLY_VECTOR: 4,
    PUSH_POSITION: 5,
    POP_POSITION: 6,
    DRAW_SUBSHAPE: 7,
    XY_DISPLACEMENT: 8,
    MULTIPLE_XY: 9,
    OCTANT_ARC: 10,
    FRACTIONAL_ARC: 11,
    BULGE_ARC: 12,
    MULTIPLE_BULGE: 13,
    VERTICAL_ONLY: 14
  };

  // Direction codes for octant arcs (0-7, each representing 45 degrees)
  const OCTANT_DIRECTIONS = [
    { x: 1, y: 0 },   // 0: East
    { x: 1, y: 1 },   // 1: NE
    { x: 0, y: 1 },   // 2: North
    { x: -1, y: 1 },  // 3: NW
    { x: -1, y: 0 },  // 4: West
    { x: -1, y: -1 }, // 5: SW
    { x: 0, y: -1 },  // 6: South
    { x: 1, y: -1 }   // 7: SE
  ];

  /**
   * Glyph class - represents a single character or shape definition
   */
  class Glyph {
    constructor(code) {
      this.code = code;           // Character/shape code
      this.name = '';             // Optional name
      this.defBytes = 0;          // Definition size in bytes
      this.paths = [];            // Array of path segments
      this.width = 0;             // Advance width
      this.height = 0;            // Glyph height
      this.originX = 0;           // Origin X offset
      this.originY = 0;           // Origin Y offset
      this.boundingBox = null;    // Computed bounding box
    }

    /**
     * Get paths as canvas-compatible path data
     */
    getCanvasPath(scale = 1) {
      const path = new Path2D();
      
      for (const segment of this.paths) {
        if (segment.type === 'M') {
          path.moveTo(segment.x * scale, segment.y * scale);
        } else if (segment.type === 'L') {
          path.lineTo(segment.x * scale, segment.y * scale);
        } else if (segment.type === 'A') {
          path.arc(
            segment.cx * scale,
            segment.cy * scale,
            segment.r * scale,
            segment.startAngle,
            segment.endAngle,
            segment.counterClockwise
          );
        } else if (segment.type === 'Q') {
          path.quadraticCurveTo(
            segment.cpx * scale,
            segment.cpy * scale,
            segment.x * scale,
            segment.y * scale
          );
        }
      }
      
      return path;
    }

    /**
     * Get paths as SVG path data string
     */
    getSVGPath(scale = 1) {
      let d = '';
      
      for (const segment of this.paths) {
        if (segment.type === 'M') {
          d += `M${segment.x * scale},${segment.y * scale} `;
        } else if (segment.type === 'L') {
          d += `L${segment.x * scale},${segment.y * scale} `;
        } else if (segment.type === 'A') {
          // Convert arc to SVG arc command
          const rx = segment.r * scale;
          const ry = rx;
          const largeArc = Math.abs(segment.endAngle - segment.startAngle) > Math.PI ? 1 : 0;
          const sweep = segment.counterClockwise ? 0 : 1;
          const endX = (segment.cx + Math.cos(segment.endAngle) * segment.r) * scale;
          const endY = (segment.cy + Math.sin(segment.endAngle) * segment.r) * scale;
          d += `A${rx},${ry} 0 ${largeArc} ${sweep} ${endX},${endY} `;
        }
      }
      
      return d.trim();
    }

    /**
     * Compute bounding box
     */
    computeBounds() {
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      
      for (const segment of this.paths) {
        if (segment.x !== undefined) {
          minX = Math.min(minX, segment.x);
          maxX = Math.max(maxX, segment.x);
        }
        if (segment.y !== undefined) {
          minY = Math.min(minY, segment.y);
          maxY = Math.max(maxY, segment.y);
        }
        if (segment.type === 'A') {
          // Include arc extents
          minX = Math.min(minX, segment.cx - segment.r);
          maxX = Math.max(maxX, segment.cx + segment.r);
          minY = Math.min(minY, segment.cy - segment.r);
          maxY = Math.max(maxY, segment.cy + segment.r);
        }
      }
      
      this.boundingBox = {
        minX: Number.isFinite(minX) ? minX : 0,
        minY: Number.isFinite(minY) ? minY : 0,
        maxX: Number.isFinite(maxX) ? maxX : 0,
        maxY: Number.isFinite(maxY) ? maxY : 0,
        width: Number.isFinite(maxX - minX) ? maxX - minX : 0,
        height: Number.isFinite(maxY - minY) ? maxY - minY : 0
      };
      
      return this.boundingBox;
    }
  }

  /**
   * SHX Font class - contains all glyphs for a font
   */
  class SHXFont {
    constructor() {
      this.type = SHXType.UNKNOWN;
      this.name = '';
      this.version = '';
      this.above = 0;              // Height above baseline
      this.below = 0;              // Depth below baseline
      this.modes = 0;              // Font modes (vertical, etc.)
      this.encoding = 0;           // Character encoding
      this.glyphs = new Map();     // Map of code -> Glyph
      this.shapes = new Map();     // Map of shape number -> Glyph (for shape libraries)
      this.metadata = {};
    }

    /**
     * Get a glyph by character code
     */
    getGlyph(charCode) {
      return this.glyphs.get(charCode) || null;
    }

    /**
     * Get a glyph by character
     */
    getGlyphForChar(char) {
      const code = char.charCodeAt(0);
      return this.getGlyph(code);
    }

    /**
     * Get a shape by number
     */
    getShape(shapeNumber) {
      return this.shapes.get(shapeNumber) || null;
    }

    /**
     * Check if font has a specific glyph
     */
    hasGlyph(charCode) {
      return this.glyphs.has(charCode);
    }

    /**
     * Get the advance width for a character
     */
    getAdvanceWidth(charCode) {
      const glyph = this.getGlyph(charCode);
      return glyph ? glyph.width : this.above; // Use height as fallback
    }

    /**
     * Measure text width
     */
    measureText(text) {
      let width = 0;
      for (const char of text) {
        width += this.getAdvanceWidth(char.charCodeAt(0));
      }
      return width;
    }

    /**
     * Get text outlines as array of paths
     */
    getTextOutlines(text, scale = 1) {
      const outlines = [];
      let x = 0;
      
      for (const char of text) {
        const glyph = this.getGlyphForChar(char);
        if (glyph) {
          // Clone paths with offset
          for (const segment of glyph.paths) {
            const newSegment = { ...segment };
            if (newSegment.x !== undefined) newSegment.x = (newSegment.x + x) * scale;
            if (newSegment.y !== undefined) newSegment.y = newSegment.y * scale;
            if (newSegment.cx !== undefined) newSegment.cx = (newSegment.cx + x) * scale;
            if (newSegment.cy !== undefined) newSegment.cy = newSegment.cy * scale;
            if (newSegment.cpx !== undefined) newSegment.cpx = (newSegment.cpx + x) * scale;
            if (newSegment.cpy !== undefined) newSegment.cpy = newSegment.cpy * scale;
            if (newSegment.r !== undefined) newSegment.r = newSegment.r * scale;
            outlines.push(newSegment);
          }
          x += glyph.width;
        } else if (char === ' ') {
          x += this.above * 0.5; // Space width
        } else {
          x += this.above; // Unknown character width
        }
      }
      
      return outlines;
    }
  }

  /**
   * SHX Binary Parser
   */
  class SHXBinaryParser {
    constructor() {
      this.data = null;
      this.view = null;
      this.offset = 0;
      this.font = null;
    }

    parse(buffer) {
      this.data = buffer instanceof ArrayBuffer 
        ? new Uint8Array(buffer) 
        : buffer;
      this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
      this.offset = 0;
      this.font = new SHXFont();

      // Parse header
      this.parseHeader();

      // Parse shapes/glyphs
      this.parseGlyphs();

      return this.font;
    }

    readByte() {
      return this.data[this.offset++];
    }

    readWord() {
      const value = this.view.getUint16(this.offset, true);
      this.offset += 2;
      return value;
    }

    readInt16() {
      const value = this.view.getInt16(this.offset, true);
      this.offset += 2;
      return value;
    }

    readString(length) {
      let str = '';
      for (let i = 0; i < length; i++) {
        const byte = this.data[this.offset++];
        if (byte === 0) break;
        str += String.fromCharCode(byte);
      }
      return str;
    }

    readNullTerminatedString() {
      let str = '';
      while (this.offset < this.data.length) {
        const byte = this.data[this.offset++];
        if (byte === 0) break;
        str += String.fromCharCode(byte);
      }
      return str;
    }

    parseHeader() {
      // Check for SHX signature
      // First bytes indicate file type
      const signature = this.readString(20);
      
      if (signature.includes('AutoCAD-86') || signature.includes('Unifont')) {
        this.font.type = SHXType.UNIFONT;
      } else if (signature.includes('bigfont') || signature.includes('Big')) {
        this.font.type = SHXType.BIGFONT;
      } else if (signature.includes('shapes')) {
        this.font.type = SHXType.SHAPES;
      } else {
        this.font.type = SHXType.REGULAR;
      }

      this.font.name = signature.trim();
      this.offset = 0;

      // Skip to header info based on file type
      // Standard SHX header format:
      // Byte 0-19: File type string
      // Byte 20: File type code
      // Byte 21: Start of shape table or font info
      
      // Try to detect format
      this.offset = 20;
      
      if (this.offset < this.data.length) {
        const typeCode = this.readByte();
        
        if (this.font.type === SHXType.UNIFONT || this.font.type === SHXType.REGULAR) {
          // Font header
          if (this.offset + 6 <= this.data.length) {
            this.font.above = this.readByte();
            this.font.below = this.readByte();
            this.font.modes = this.readByte();
            const numRanges = this.readWord();
            this.font.metadata.numRanges = numRanges;
          }
        }
      }
    }

    parseGlyphs() {
      // The exact parsing depends on font type
      // This is a simplified parser for standard shapes

      // Find shape definitions
      // In SHX files, shapes start after the header
      // Each shape has: shape number (2 bytes), defbytes (2 bytes), name (null-term), data
      
      let shapeOffset = 24; // Typical start after header
      
      // Find actual start by looking for valid shape patterns
      for (let i = shapeOffset; i < this.data.length - 10; i++) {
        const potentialNum = this.view.getUint16(i, true);
        const potentialDefBytes = this.view.getUint16(i + 2, true);
        
        // Reasonable shape number and definition size
        if (potentialNum > 0 && potentialNum < 65535 && 
            potentialDefBytes > 0 && potentialDefBytes < 1000) {
          // Check if there's a valid name
          let hasValidName = true;
          let nameEnd = i + 4;
          for (let j = i + 4; j < Math.min(i + 4 + 32, this.data.length); j++) {
            const byte = this.data[j];
            if (byte === 0) {
              nameEnd = j;
              break;
            }
            if (byte < 32 || byte > 126) {
              hasValidName = false;
              break;
            }
          }
          
          if (hasValidName && nameEnd > i + 4) {
            shapeOffset = i;
            break;
          }
        }
      }

      this.offset = shapeOffset;
      
      // Parse shapes
      while (this.offset + 4 < this.data.length) {
        const shapeNum = this.readWord();
        const defBytes = this.readWord();
        
        if (shapeNum === 0 || defBytes === 0 || defBytes > this.data.length - this.offset) {
          break;
        }

        const glyph = new Glyph(shapeNum);
        glyph.defBytes = defBytes;
        glyph.name = this.readNullTerminatedString();

        // Parse shape definition bytes
        const defStart = this.offset;
        const defEnd = defStart + defBytes - glyph.name.length - 1;
        
        if (defEnd > defStart && defEnd <= this.data.length) {
          this.parseShapeDefinition(glyph, defStart, defEnd);
        }

        this.offset = defEnd;

        // Store in appropriate map
        if (this.font.type === SHXType.SHAPES) {
          this.font.shapes.set(shapeNum, glyph);
        } else {
          this.font.glyphs.set(shapeNum, glyph);
        }

        glyph.computeBounds();
      }
    }

    parseShapeDefinition(glyph, start, end) {
      this.offset = start;
      
      let x = 0, y = 0;
      let penDown = true;
      let scale = 1;
      const positionStack = [];

      while (this.offset < end) {
        const byte = this.readByte();
        
        if (byte === SHXCommand.END_OF_SHAPE) {
          break;
        }

        // Check if it's a direction/length byte (upper nibble = direction, lower = length)
        if (byte >= 0x10 && byte <= 0xFF) {
          const length = byte & 0x0F;
          const direction = (byte >> 4) & 0x0F;
          
          if (direction < 16 && length > 0) {
            // Standard vector: direction in upper nibble, length in lower
            const angle = direction * (Math.PI / 8); // 16 directions, 22.5 degrees each
            const dx = Math.cos(angle) * length * scale;
            const dy = Math.sin(angle) * length * scale;
            
            if (penDown) {
              glyph.paths.push({ type: 'L', x: x + dx, y: y + dy });
            } else {
              glyph.paths.push({ type: 'M', x: x + dx, y: y + dy });
            }
            
            x += dx;
            y += dy;
            continue;
          }
        }

        // Handle special command bytes (0-15)
        switch (byte) {
          case SHXCommand.PEN_DOWN:
            penDown = true;
            break;

          case SHXCommand.PEN_UP:
            penDown = false;
            break;

          case SHXCommand.DIVIDE_VECTOR:
            if (this.offset < end) {
              const divisor = this.readByte();
              if (divisor > 0) scale /= divisor;
            }
            break;

          case SHXCommand.MULTIPLY_VECTOR:
            if (this.offset < end) {
              const multiplier = this.readByte();
              scale *= multiplier;
            }
            break;

          case SHXCommand.PUSH_POSITION:
            positionStack.push({ x, y, scale, penDown });
            break;

          case SHXCommand.POP_POSITION:
            if (positionStack.length > 0) {
              const pos = positionStack.pop();
              x = pos.x;
              y = pos.y;
              scale = pos.scale;
              penDown = pos.penDown;
              glyph.paths.push({ type: 'M', x, y });
            }
            break;

          case SHXCommand.DRAW_SUBSHAPE:
            // Draw a previously defined shape
            if (this.offset < end) {
              const subshapeNum = this.readByte();
              // Would recursively draw subshape - skip for now
            }
            break;

          case SHXCommand.XY_DISPLACEMENT:
            // X,Y displacement from current position
            if (this.offset + 1 < end) {
              const dx = this.readSignedByte() * scale;
              const dy = this.readSignedByte() * scale;
              
              if (penDown) {
                glyph.paths.push({ type: 'L', x: x + dx, y: y + dy });
              } else {
                glyph.paths.push({ type: 'M', x: x + dx, y: y + dy });
              }
              x += dx;
              y += dy;
            }
            break;

          case SHXCommand.MULTIPLE_XY:
            // Multiple X,Y pairs, terminated by 0,0
            while (this.offset + 1 < end) {
              const dx = this.readSignedByte() * scale;
              const dy = this.readSignedByte() * scale;
              if (dx === 0 && dy === 0) break;
              
              if (penDown) {
                glyph.paths.push({ type: 'L', x: x + dx, y: y + dy });
              } else {
                glyph.paths.push({ type: 'M', x: x + dx, y: y + dy });
              }
              x += dx;
              y += dy;
            }
            break;

          case SHXCommand.OCTANT_ARC:
            // Octant arc: radius, +-0SC (octant info)
            if (this.offset + 1 < end) {
              const radius = this.readByte() * scale;
              const octantByte = this.readSignedByte();
              const startOctant = (octantByte >> 4) & 0x07;
              const numOctants = octantByte & 0x07;
              const ccw = (octantByte & 0x80) !== 0;
              
              this.drawOctantArc(glyph, x, y, radius, startOctant, numOctants, ccw);
            }
            break;

          case SHXCommand.FRACTIONAL_ARC:
            // Fractional arc with more precision
            if (this.offset + 4 < end) {
              const startOffset = this.readByte();
              const endOffset = this.readByte();
              const highByte = this.readByte();
              const radius = this.readByte() * scale;
              const octantByte = this.readSignedByte();
              
              // Similar to octant arc but with fractional start/end
              const startOctant = (octantByte >> 4) & 0x07;
              const numOctants = octantByte & 0x07;
              const ccw = (octantByte & 0x80) !== 0;
              
              this.drawOctantArc(glyph, x, y, radius, startOctant, numOctants, ccw);
            }
            break;

          case SHXCommand.BULGE_ARC:
            // Bulge arc: dx, dy, bulge
            if (this.offset + 2 < end) {
              const dx = this.readSignedByte() * scale;
              const dy = this.readSignedByte() * scale;
              const bulge = this.readSignedByte() / 127; // Normalize to -1 to 1
              
              this.drawBulgeArc(glyph, x, y, x + dx, y + dy, bulge, penDown);
              x += dx;
              y += dy;
            }
            break;

          case SHXCommand.MULTIPLE_BULGE:
            // Multiple bulge arcs, terminated by 0,0
            while (this.offset + 2 < end) {
              const dx = this.readSignedByte() * scale;
              const dy = this.readSignedByte() * scale;
              if (dx === 0 && dy === 0) break;
              
              const bulge = this.readSignedByte() / 127;
              this.drawBulgeArc(glyph, x, y, x + dx, y + dy, bulge, penDown);
              x += dx;
              y += dy;
            }
            break;

          case SHXCommand.VERTICAL_ONLY:
            // For fonts that only have vertical strokes (Asian fonts)
            if (this.offset < end) {
              const dy = this.readSignedByte() * scale;
              if (penDown) {
                glyph.paths.push({ type: 'L', x, y: y + dy });
              } else {
                glyph.paths.push({ type: 'M', x, y: y + dy });
              }
              y += dy;
            }
            break;

          default:
            // Unknown command - try to interpret as vector
            if (byte !== 0) {
              // Vector length/direction encoded
              const length = byte & 0x0F;
              const direction = (byte >> 4) & 0x0F;
              
              if (length > 0) {
                const angle = direction * (Math.PI / 8);
                const dx = Math.cos(angle) * length * scale;
                const dy = Math.sin(angle) * length * scale;
                
                if (penDown) {
                  glyph.paths.push({ type: 'L', x: x + dx, y: y + dy });
                } else {
                  glyph.paths.push({ type: 'M', x: x + dx, y: y + dy });
                }
                x += dx;
                y += dy;
              }
            }
        }
      }

      // Set glyph width
      glyph.width = x;
      glyph.height = this.font.above + this.font.below || 10;
    }

    readSignedByte() {
      const byte = this.readByte();
      return byte > 127 ? byte - 256 : byte;
    }

    drawOctantArc(glyph, cx, cy, radius, startOctant, numOctants, ccw) {
      if (numOctants <= 0 || radius <= 0) return;

      const startAngle = startOctant * (Math.PI / 4);
      const endAngle = startAngle + numOctants * (Math.PI / 4) * (ccw ? -1 : 1);

      glyph.paths.push({
        type: 'A',
        cx,
        cy,
        r: radius,
        startAngle,
        endAngle,
        counterClockwise: ccw
      });
    }

    drawBulgeArc(glyph, x1, y1, x2, y2, bulge, penDown) {
      if (Math.abs(bulge) < 0.001) {
        // Straight line
        if (penDown) {
          glyph.paths.push({ type: 'L', x: x2, y: y2 });
        } else {
          glyph.paths.push({ type: 'M', x: x2, y: y2 });
        }
        return;
      }

      // Calculate arc from bulge
      const dx = x2 - x1;
      const dy = y2 - y1;
      const chordLength = Math.sqrt(dx * dx + dy * dy);
      const sagitta = Math.abs(bulge) * chordLength / 2;
      
      // Radius from chord and sagitta
      const radius = (chordLength * chordLength / 4 + sagitta * sagitta) / (2 * sagitta);
      
      // Center of arc
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const perpX = -dy / chordLength;
      const perpY = dx / chordLength;
      const sign = bulge > 0 ? -1 : 1;
      const cx = midX + perpX * (radius - sagitta) * sign;
      const cy = midY + perpY * (radius - sagitta) * sign;
      
      // Start and end angles
      const startAngle = Math.atan2(y1 - cy, x1 - cx);
      const endAngle = Math.atan2(y2 - cy, x2 - cx);

      glyph.paths.push({
        type: 'A',
        cx,
        cy,
        r: radius,
        startAngle,
        endAngle,
        counterClockwise: bulge < 0
      });
    }
  }

  /**
   * SHP (ASCII) Parser
   */
  class SHPParser {
    constructor() {
      this.font = null;
    }

    parse(text) {
      this.font = new SHXFont();
      this.font.type = SHXType.SHAPES;

      const lines = text.split('\n');
      let currentShape = null;
      let currentDefBytes = [];

      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith(';')) continue;

        // Shape header line: *shapenum,defbytes,shapename
        if (trimmed.startsWith('*')) {
          // Save previous shape
          if (currentShape && currentDefBytes.length > 0) {
            this.parseShapeBytes(currentShape, currentDefBytes);
            this.font.shapes.set(currentShape.code, currentShape);
            this.font.glyphs.set(currentShape.code, currentShape);
          }

          // Parse new shape header
          const match = trimmed.match(/^\*(\d+),(\d+),(.*)/);
          if (match) {
            currentShape = new Glyph(parseInt(match[1], 10));
            currentShape.defBytes = parseInt(match[2], 10);
            currentShape.name = match[3].trim();
            currentDefBytes = [];
          }
        } else if (currentShape) {
          // Definition bytes - comma-separated values
          const bytes = trimmed
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map(s => this.parseByteValue(s));
          
          currentDefBytes.push(...bytes);
        }
      }

      // Save last shape
      if (currentShape && currentDefBytes.length > 0) {
        this.parseShapeBytes(currentShape, currentDefBytes);
        this.font.shapes.set(currentShape.code, currentShape);
        this.font.glyphs.set(currentShape.code, currentShape);
      }

      return this.font;
    }

    parseByteValue(s) {
      // Handle different formats: decimal, hex (0xNN), octal (0NN), parenthesized
      s = s.replace(/[()]/g, '').trim();
      
      if (s.startsWith('0x') || s.startsWith('0X')) {
        return parseInt(s, 16);
      }
      if (s.startsWith('0') && s.length > 1 && !s.includes('.')) {
        return parseInt(s, 8);
      }
      return parseInt(s, 10) || 0;
    }

    parseShapeBytes(glyph, bytes) {
      // Similar logic to binary parser
      let x = 0, y = 0;
      let penDown = true;
      let scale = 1;
      const positionStack = [];

      for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];

        if (byte === 0) break; // End of shape

        // Standard vector
        if (byte >= 0x10) {
          const length = byte & 0x0F;
          const direction = (byte >> 4) & 0x0F;
          
          if (length > 0) {
            const angle = direction * (Math.PI / 8);
            const dx = Math.cos(angle) * length * scale;
            const dy = Math.sin(angle) * length * scale;
            
            if (penDown) {
              glyph.paths.push({ type: 'L', x: x + dx, y: y + dy });
            } else {
              glyph.paths.push({ type: 'M', x: x + dx, y: y + dy });
            }
            x += dx;
            y += dy;
          }
          continue;
        }

        // Special commands
        switch (byte) {
          case 1: penDown = true; break;
          case 2: penDown = false; break;
          case 3:
            if (i + 1 < bytes.length) {
              const div = bytes[++i];
              if (div > 0) scale /= div;
            }
            break;
          case 4:
            if (i + 1 < bytes.length) {
              scale *= bytes[++i];
            }
            break;
          case 5:
            positionStack.push({ x, y, scale, penDown });
            break;
          case 6:
            if (positionStack.length > 0) {
              const pos = positionStack.pop();
              x = pos.x; y = pos.y;
              scale = pos.scale;
              penDown = pos.penDown;
              glyph.paths.push({ type: 'M', x, y });
            }
            break;
          case 8:
            if (i + 2 < bytes.length) {
              const dx = this.toSigned(bytes[++i]) * scale;
              const dy = this.toSigned(bytes[++i]) * scale;
              if (penDown) {
                glyph.paths.push({ type: 'L', x: x + dx, y: y + dy });
              } else {
                glyph.paths.push({ type: 'M', x: x + dx, y: y + dy });
              }
              x += dx; y += dy;
            }
            break;
          case 9:
            while (i + 2 < bytes.length) {
              const dx = this.toSigned(bytes[++i]) * scale;
              const dy = this.toSigned(bytes[++i]) * scale;
              if (dx === 0 && dy === 0) break;
              if (penDown) {
                glyph.paths.push({ type: 'L', x: x + dx, y: y + dy });
              } else {
                glyph.paths.push({ type: 'M', x: x + dx, y: y + dy });
              }
              x += dx; y += dy;
            }
            break;
        }
      }

      glyph.width = x;
      glyph.height = 10; // Default height
      glyph.computeBounds();
    }

    toSigned(byte) {
      return byte > 127 ? byte - 256 : byte;
    }
  }

  /**
   * SHX Font Loader - main entry point
   */
  class SHXFontLoader {
    constructor() {
      this.fonts = new Map();
      this.binaryParser = new SHXBinaryParser();
      this.shpParser = new SHPParser();
    }

    /**
     * Load font from binary data (SHX)
     */
    loadBinary(buffer, name = 'default') {
      const font = this.binaryParser.parse(buffer);
      if (font) {
        font.name = name;
        this.fonts.set(name.toLowerCase(), font);
      }
      return font;
    }

    /**
     * Load font from text data (SHP)
     */
    loadText(text, name = 'default') {
      const font = this.shpParser.parse(text);
      if (font) {
        font.name = name;
        this.fonts.set(name.toLowerCase(), font);
      }
      return font;
    }

    /**
     * Load font from URL (async)
     */
    async loadFromUrl(url) {
      const name = url.split('/').pop().replace(/\.(shx|shp)$/i, '');
      const isBinary = url.toLowerCase().endsWith('.shx');
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load SHX font: ${response.status}`);
      }

      const data = isBinary 
        ? await response.arrayBuffer() 
        : await response.text();

      return isBinary 
        ? this.loadBinary(data, name) 
        : this.loadText(data, name);
    }

    /**
     * Load font from File object (async)
     */
    async loadFromFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const name = file.name.replace(/\.(shx|shp)$/i, '');
        const isBinary = file.name.toLowerCase().endsWith('.shx');

        reader.onload = (e) => {
          try {
            const font = isBinary 
              ? this.loadBinary(e.target.result, name) 
              : this.loadText(e.target.result, name);
            resolve(font);
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

    /**
     * Get a loaded font by name
     */
    getFont(name) {
      return this.fonts.get(name.toLowerCase()) || null;
    }

    /**
     * Check if a font is loaded
     */
    hasFont(name) {
      return this.fonts.has(name.toLowerCase());
    }

    /**
     * Get a glyph from a specific font
     */
    getGlyph(fontName, charCode) {
      const font = this.getFont(fontName);
      return font ? font.getGlyph(charCode) : null;
    }

    /**
     * Get a shape from a specific font
     */
    getShape(fontName, shapeNumber) {
      const font = this.getFont(fontName);
      return font ? font.getShape(shapeNumber) : null;
    }
  }

  /**
   * Render SHX text to canvas
   */
  function renderSHXText(ctx, font, text, x, y, options = {}) {
    const {
      scale = 1,
      color = '#000000',
      strokeWidth = 1,
      rotation = 0
    } = options;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const outlines = font.getTextOutlines(text, scale);
    let currentX = 0, currentY = 0;
    let isDrawing = false;

    ctx.beginPath();
    
    for (const segment of outlines) {
      switch (segment.type) {
        case 'M':
          if (isDrawing) {
            ctx.stroke();
            ctx.beginPath();
          }
          ctx.moveTo(segment.x, -segment.y); // Flip Y for canvas
          currentX = segment.x;
          currentY = segment.y;
          isDrawing = false;
          break;
          
        case 'L':
          ctx.lineTo(segment.x, -segment.y);
          currentX = segment.x;
          currentY = segment.y;
          isDrawing = true;
          break;
          
        case 'A':
          ctx.arc(
            segment.cx, 
            -segment.cy,
            segment.r,
            -segment.startAngle,
            -segment.endAngle,
            !segment.counterClockwise
          );
          isDrawing = true;
          break;
      }
    }
    
    if (isDrawing) {
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Get shape outlines for DXF SHAPE entity
   */
  function getShapeOutlines(font, shapeNumber, scale = 1) {
    const shape = font.getShape(shapeNumber);
    if (!shape) return null;

    const outlines = [];
    let currentPath = [];

    for (const segment of shape.paths) {
      if (segment.type === 'M') {
        if (currentPath.length > 0) {
          outlines.push([...currentPath]);
        }
        currentPath = [{ x: segment.x * scale, y: segment.y * scale }];
      } else if (segment.type === 'L') {
        currentPath.push({ x: segment.x * scale, y: segment.y * scale });
      } else if (segment.type === 'A') {
        // Approximate arc with line segments
        const steps = 16;
        let startAngle = segment.startAngle;
        let endAngle = segment.endAngle;
        if (segment.counterClockwise && endAngle > startAngle) {
          endAngle -= Math.PI * 2;
        } else if (!segment.counterClockwise && endAngle < startAngle) {
          endAngle += Math.PI * 2;
        }
        
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const angle = startAngle + (endAngle - startAngle) * t;
          const px = (segment.cx + Math.cos(angle) * segment.r) * scale;
          const py = (segment.cy + Math.sin(angle) * segment.r) * scale;
          currentPath.push({ x: px, y: py });
        }
      }
    }

    if (currentPath.length > 0) {
      outlines.push(currentPath);
    }

    return {
      outlines,
      width: shape.width * scale,
      height: shape.height * scale,
      bounds: shape.boundingBox ? {
        minX: shape.boundingBox.minX * scale,
        minY: shape.boundingBox.minY * scale,
        maxX: shape.boundingBox.maxX * scale,
        maxY: shape.boundingBox.maxY * scale
      } : null
    };
  }

  // Export
  namespace.SHXFontLoader = SHXFontLoader;
  namespace.SHXFont = SHXFont;
  namespace.Glyph = Glyph;
  namespace.SHXType = SHXType;
  namespace.SHXBinaryParser = SHXBinaryParser;
  namespace.SHPParser = SHPParser;
  namespace.renderSHXText = renderSHXText;
  namespace.getShapeOutlines = getShapeOutlines;

  return namespace;
}));
