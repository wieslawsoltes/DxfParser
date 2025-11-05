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
