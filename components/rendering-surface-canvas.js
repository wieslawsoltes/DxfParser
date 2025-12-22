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
        
        // Apply linetype dash pattern if available
        if (polyline.lineDash && Array.isArray(polyline.lineDash) && polyline.lineDash.length > 0) {
          ctx.setLineDash(polyline.lineDash);
          if (typeof polyline.lineDashOffset === 'number') {
            ctx.lineDashOffset = polyline.lineDashOffset;
          }
        } else {
          ctx.setLineDash([]);
        }
        
        ctx.beginPath();
        ctx.moveTo(polyline.screenPoints[0], polyline.screenPoints[1]);
        for (let p = 2; p < polyline.screenPoints.length; p += 2) {
          ctx.lineTo(polyline.screenPoints[p], polyline.screenPoints[p + 1]);
        }
        if (polyline.closed) {
          ctx.closePath();
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      // Render complex linetype shapes (text and shape markers)
      const linetypeShapes = frame.linetypeShapes || [];
      for (let i = 0; i < linetypeShapes.length; i++) {
        const shape = linetypeShapes[i];
        if (!shape || !shape.position) continue;
        ctx.save();
        ctx.translate(shape.position.x, shape.position.y);
        if (typeof shape.rotation === 'number') {
          ctx.rotate(shape.rotation);
        }
        const size = Math.max(4, shape.size || 8);
        ctx.font = `${size}px sans-serif`;
        ctx.fillStyle = shape.colorCss || 'rgba(210, 227, 255, 1)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = shape.text || '•';
        ctx.fillText(label, 0, 0);
        ctx.restore();
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
        if (!text) {
          continue;
        }
        ctx.save();
        ctx.translate(text.screenPosition[0], text.screenPosition[1]);
        ctx.rotate(text.rotationRad || 0);
        const anchorX = text.anchor && typeof text.anchor.x === 'number' ? text.anchor.x : 0;
        const anchorY = text.anchor && typeof text.anchor.y === 'number' ? text.anchor.y : 0;

        const verticalWriting = !!text.verticalWriting;
        if (verticalWriting) {
          ctx.rotate(-Math.PI / 2);
          ctx.translate(-(text.heightPx || text.lineHeight || 0), 0);
        }

        ctx.translate(-anchorX, -anchorY);

        const aciToRgb = (index) => {
          const normalized = Math.max(0, Math.min(255, Math.round(index)));
          const aciTable = {
            0: { r: 0, g: 0, b: 0 },
            1: { r: 255, g: 0, b: 0 },
            2: { r: 255, g: 255, b: 0 },
            3: { r: 0, g: 255, b: 0 },
            4: { r: 0, g: 255, b: 255 },
            5: { r: 0, g: 0, b: 255 },
            6: { r: 255, g: 0, b: 255 },
            7: { r: 255, g: 255, b: 255 }
          };
          return aciTable[normalized] || { r: 210, g: 227, b: 255 };
        };

        const colorSpecToCss = (spec, fallback) => {
          if (!spec) {
            return fallback;
          }
          if (spec.type === 'rgb' && Number.isFinite(spec.r) && Number.isFinite(spec.g) && Number.isFinite(spec.b)) {
            const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
            return `rgb(${clamp(spec.r)}, ${clamp(spec.g)}, ${clamp(spec.b)})`;
          }
          if (spec.type === 'aci' && Number.isFinite(spec.index)) {
            const rgb = aciToRgb(Math.abs(spec.index));
            const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
            return `rgb(${clamp(rgb.r)}, ${clamp(rgb.g)}, ${clamp(rgb.b)})`;
          }
          if (spec.css) {
            return spec.css;
          }
          return fallback;
        };

        const computeLineSpacing = (lineHeightPx, spacingValue, spacingStyle, frameScaleValue) => {
          const base = lineHeightPx || text.lineHeight || text.fontSize || 10;
          if (Number.isFinite(spacingValue) && spacingValue > 0) {
            const scaled = spacingValue * (frameScaleValue || 1);
            if (spacingStyle === 2) {
              return scaled;
            }
            return Math.max(base, scaled);
          }
          return base;
        };

        const drawSegmentText = (segment, x, y) => {
          if (!segment) {
            return;
          }
          const textContent = typeof segment.text === 'string' ? segment.text : '';
          if (!textContent.length) {
            return;
          }
          const segStyle = segment.style || {};
          const fontTemplate = segment.font
            || `${text.fontStyle || 'normal'} ${text.fontWeight || '400'} {size} ${text.fontFamily || 'Arial, \"Helvetica Neue\", Helvetica, sans-serif'}`;
          const segFontSize = Math.max(4, segment.fontSizePx || text.fontSize || 10);
          const font = fontTemplate.replace('{size}', `${segFontSize}px`);
          const fillCss = colorSpecToCss(segStyle.color, text.colorCss || '#e8f1ff');
          ctx.save();
          ctx.translate(x, y);
          const widthScale = Number.isFinite(segStyle.widthScale) && segStyle.widthScale > 0 ? segStyle.widthScale : 1;
          const oblique = Number.isFinite(segStyle.oblique) ? segStyle.oblique : 0;
          if (widthScale !== 1 || oblique !== 0) {
            const shear = Math.tan(oblique * Math.PI / 180);
            ctx.transform(widthScale, 0, shear, 1, 0, 0);
          }
          ctx.fillStyle = fillCss;
          ctx.font = font;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(textContent, 0, 0);
          const lineThickness = Math.max(1, segFontSize * 0.05);
          const underlineColor = fillCss;
          const lineWidth = segment.widthPx || ctx.measureText(textContent).width * widthScale;
          const drawDecoration = (offset) => {
            ctx.strokeStyle = underlineColor;
            ctx.lineWidth = lineThickness;
            ctx.beginPath();
            ctx.moveTo(0, offset);
            ctx.lineTo(lineWidth, offset);
            ctx.stroke();
          };
          if (segStyle.underline) {
            drawDecoration(segFontSize * 0.82);
          }
          if (segStyle.strike) {
            drawDecoration(segFontSize * 0.45);
          }
          if (segStyle.overline) {
            drawDecoration(0);
          }
          ctx.restore();
        };

        const drawSegmentBackground = (segment, x, y, heightPx) => {
          if (!segment) {
            return;
          }
          if (segment.type === 'indent' || segment.type === 'tab' || segment.type === 'markerSpacing') {
            return;
          }
          const segStyle = segment.style || {};
          if (!segStyle.background || !segStyle.background.enabled) {
            return;
          }
          const bgCss = colorSpecToCss(segStyle.background.color, 'rgba(0,0,0,0.25)');
          const widthPx = segment.widthPx || 0;
          const maskHeight = (segment.heightPx && segment.heightPx > 0) ? segment.heightPx : heightPx;
          if (!(bgCss && widthPx > 0 && maskHeight > 0)) {
            return;
          }
          ctx.save();
          ctx.fillStyle = bgCss;
          ctx.fillRect(x, y, widthPx, maskHeight);
          ctx.restore();
        };

        const drawFractionSegment = (segment, x, y) => {
          if (!segment || !segment.numerator || !segment.denominator) {
            return;
          }
          const segStyle = segment.style || {};
          const widthScale = Number.isFinite(segStyle.widthScale) && segStyle.widthScale > 0
            ? segStyle.widthScale
            : 1;
          const oblique = Number.isFinite(segStyle.oblique) ? segStyle.oblique : 0;
          const paddingBase = Number.isFinite(segment.basePaddingPx)
            ? segment.basePaddingPx
            : (segment.paddingPx || 0);
          const gapPx = segment.gapPx || 0;
          const barThicknessPx = segment.barThicknessPx || Math.max(1, (segment.fontSizePx || text.fontSize || 10) * 0.05);
          const baseWidth = Number.isFinite(segment.baseWidthPx)
            ? segment.baseWidthPx
            : ((segment.widthPx || 0) / widthScale);
          const numeratorBaseWidth = Number.isFinite(segment.numerator.baseWidthPx)
            ? segment.numerator.baseWidthPx
            : ((segment.numerator.widthPx || 0) / widthScale);
          const denominatorBaseWidth = Number.isFinite(segment.denominator.baseWidthPx)
            ? segment.denominator.baseWidthPx
            : ((segment.denominator.widthPx || 0) / widthScale);
          const numeratorFontSize = segment.numerator.fontSizePx || segment.fontSizePx || (text.fontSize || 10);
          const denominatorFontSize = segment.denominator.fontSizePx || segment.fontSizePx || (text.fontSize || 10);
          const fontTemplate = segment.font
            || `${text.fontStyle || 'normal'} ${text.fontWeight || '400'} {size} ${text.fontFamily || 'Arial, "Helvetica Neue", Helvetica, sans-serif'}`;
          const fillCss = colorSpecToCss(segStyle.color, text.colorCss || '#e8f1ff');
          ctx.save();
          ctx.translate(x, y);
          if (widthScale !== 1 || oblique !== 0) {
            const shear = Math.tan(oblique * Math.PI / 180);
            ctx.transform(widthScale, 0, shear, 1, 0, 0);
          }
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillStyle = fillCss;
          const usableWidth = Math.max(0, baseWidth - paddingBase * 2);
          const numeratorX = paddingBase + Math.max(0, (usableWidth - numeratorBaseWidth) / 2);
          ctx.font = fontTemplate.replace('{size}', `${Math.max(1, numeratorFontSize)}px`);
          ctx.fillText(segment.numerator.text, numeratorX, 0);
          const barY = numeratorFontSize + gapPx;
          ctx.fillRect(paddingBase, barY, usableWidth, barThicknessPx);
          const denominatorY = barY + barThicknessPx + gapPx;
          const denominatorX = paddingBase + Math.max(0, (usableWidth - denominatorBaseWidth) / 2);
          ctx.font = fontTemplate.replace('{size}', `${Math.max(1, denominatorFontSize)}px`);
          ctx.fillText(segment.denominator.text, denominatorX, denominatorY);
          if (segStyle.underline || segStyle.strike || segStyle.overline) {
            const lineThickness = Math.max(1, (segment.fontSizePx || text.fontSize || 10) * 0.05);
            const totalHeight = denominatorY + denominatorFontSize;
            const drawDecoration = (offset) => {
              ctx.strokeStyle = fillCss;
              ctx.lineWidth = lineThickness;
              ctx.beginPath();
              ctx.moveTo(paddingBase, offset);
              ctx.lineTo(paddingBase + usableWidth, offset);
              ctx.stroke();
            };
            if (segStyle.overline) {
              drawDecoration(0);
            }
            if (segStyle.strike) {
              drawDecoration(totalHeight / 2);
            }
            if (segStyle.underline) {
              drawDecoration(totalHeight);
            }
          }
          ctx.restore();
        };

        const drawBackgroundMask = () => {
          if (!text.backgroundCss) {
            return;
          }
          const metrics = text.backgroundMetrics || null;
          const maskWidth = metrics ? metrics.width : (text.widthPx || text.baseWidthPx || 0);
          const maskHeight = metrics ? metrics.height : (text.heightPx || text.lineHeight || 0);
          if (!(maskWidth > 0 && maskHeight > 0)) {
            return;
          }
          ctx.save();
          ctx.fillStyle = text.backgroundCss;
          const originX = metrics ? metrics.x : 0;
          const originY = metrics ? metrics.y : 0;
          ctx.fillRect(originX, originY, maskWidth, maskHeight);
          ctx.restore();
        };

        drawBackgroundMask();

        const paragraphLayouts = Array.isArray(text.paragraphLayouts) ? text.paragraphLayouts : null;
        if (paragraphLayouts && paragraphLayouts.length) {
          const frameScale = text.frameScale || 1;
          const columnLayouts = text.columnLayouts && Array.isArray(text.columnLayouts.layouts)
            ? text.columnLayouts
            : null;
          const hasColumns = columnLayouts && columnLayouts.layouts.length > 0;
          const columnCount = hasColumns
            ? Math.max(columnLayouts.count || columnLayouts.layouts.length, 1)
            : 1;
          const defaultWidthSource = Math.max(
            text.widthPx || text.baseWidthPx || text.maxWidth || (text.fontSize || 10) * 4,
            1
          );
          const defaultColumnWidth = defaultWidthSource / Math.max(columnCount, 1);
          const widthsSource = Array.isArray(columnLayouts && columnLayouts.widthsPx)
            ? columnLayouts.widthsPx
            : null;
          const columnWidths = new Array(columnCount).fill(0).map((_, idx) => {
            const metadataWidth = widthsSource && Number.isFinite(widthsSource[idx]) ? widthsSource[idx] : 0;
            return metadataWidth > 0 ? metadataWidth : defaultColumnWidth;
          });
          const resolveColumnGutter = () => {
            if (!hasColumns) {
              return 0;
            }
            const fallback = Math.max(2, (text.fontSize || 10) * 0.5);
            if (!columnLayouts || !columnLayouts.raw) {
              return fallback;
            }
            const extractNumeric = (value) => {
              if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i += 1) {
                  const candidate = value[i];
                  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
                    return candidate;
                  }
                }
              } else if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
              }
              return null;
            };
            const raw = columnLayouts.raw || {};
            const candidateKeys = ['79', '178', '179'];
            for (let i = 0; i < candidateKeys.length; i += 1) {
              const key = candidateKeys[i];
              const candidate = extractNumeric(raw[key]);
              if (candidate != null) {
                return Math.max(fallback, Math.abs(candidate) * frameScale);
              }
            }
            if (raw.columnsMeta) {
              const nested = raw.columnsMeta;
              for (let i = 0; i < candidateKeys.length; i += 1) {
                const key = candidateKeys[i];
                const candidate = extractNumeric(nested[key]);
                if (candidate != null) {
                  return Math.max(fallback, Math.abs(candidate) * frameScale);
                }
              }
            }
            return fallback;
          };
          const columnGutter = resolveColumnGutter();
          const columnOffsets = new Array(columnCount).fill(0);
          for (let i = 1; i < columnCount; i += 1) {
            columnOffsets[i] = columnOffsets[i - 1] + columnWidths[i - 1] + columnGutter;
          }
          const columnCursorY = new Array(columnCount).fill(0);
          const allLines = [];
          paragraphLayouts.forEach((paragraph) => {
            const lines = Array.isArray(paragraph.lines) ? paragraph.lines : [];
            lines.forEach((line) => {
              allLines.push({ line, paragraph });
            });
          });
          allLines.sort((a, b) => {
            const aIdx = Number.isFinite(a.line.globalIndex) ? a.line.globalIndex : 0;
            const bIdx = Number.isFinite(b.line.globalIndex) ? b.line.globalIndex : 0;
            return aIdx - bIdx;
          });
          allLines.forEach(({ line, paragraph }) => {
            if (!line) {
              return;
            }
            const alignment = (paragraph && paragraph.alignment) || { horizontal: 'left' };
            const spacingValue = paragraph ? paragraph.lineSpacing : null;
            const spacingStyle = paragraph ? paragraph.lineSpacingStyle : null;
            const columnIndex = Number.isFinite(line.columnIndex)
              ? Math.max(0, Math.min(columnCount - 1, line.columnIndex))
              : 0;
            const columnWidth = columnWidths[columnIndex] || defaultColumnWidth;
            const baseX = columnOffsets[columnIndex] || 0;
            const baseY = columnCursorY[columnIndex];
            const lineHeight = Math.max(line.heightPx || text.lineHeight || text.fontSize || 10, 1);
            const lineWidth = line.widthPx || 0;
            const rightIndent = line.rightIndentPx || 0;
            let startX = baseX;
            if (alignment.horizontal === 'center') {
              startX = baseX + (columnWidth - lineWidth) / 2;
            } else if (alignment.horizontal === 'right') {
              startX = baseX + Math.max(0, columnWidth - (lineWidth + rightIndent));
            }
          let cursorX = startX;
          const segments = Array.isArray(line.segments) ? line.segments : [];
          segments.forEach((segment) => {
            drawSegmentBackground(segment, cursorX, baseY, lineHeight);
            if (segment.type === 'fraction') {
              drawFractionSegment(segment, cursorX, baseY);
            } else {
              drawSegmentText(segment, cursorX, baseY);
            }
            cursorX += segment.widthPx || 0;
          });
          const spacing = computeLineSpacing(lineHeight, spacingValue, spacingStyle, frameScale);
          columnCursorY[columnIndex] += spacing;
        });
        } else if (Array.isArray(text.lines) && text.lines.length) {
          ctx.fillStyle = text.colorCss || '#e8f1ff';
          ctx.font = `${text.fontStyle || 'normal'} ${text.fontWeight || '400'} ${Math.max(6, text.fontSize || 10)}px ${text.fontFamily || 'Arial, \"Helvetica Neue\", Helvetica, sans-serif'}`;
          ctx.textAlign = text.textAlign || 'left';
          ctx.textBaseline = 'top';
          const lineHeight = Math.max(6, text.lineHeight || text.fontSize || 10);
          for (let l = 0; l < text.lines.length; l++) {
            const line = text.lines[l];
            ctx.fillText(line, 0, lineHeight * l);
          }
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
