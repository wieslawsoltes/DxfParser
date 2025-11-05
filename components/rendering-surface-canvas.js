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
