(function (global) {
  'use strict';

  const namespace = global.DxfRendering = global.DxfRendering || {};

  class CanvasSurface {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.devicePixelRatio = global.devicePixelRatio || 1;
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
          this._renderComplexFill(ctx, fill);
        }
      }

      const polylines = frame.polylines || [];
      for (let i = 0; i < polylines.length; i++) {
        const polyline = polylines[i];
        const points = polyline.screenPoints;
        if (!points || points.length < 4) continue;

        const dashArray = polyline.lineDash
          ? (Array.isArray(polyline.lineDash) ? polyline.lineDash : Array.from(polyline.lineDash))
          : null;
        if (dashArray && dashArray.length) {
          ctx.setLineDash(dashArray);
          ctx.lineDashOffset = polyline.lineDashOffset || 0;
        } else {
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        }
        ctx.beginPath();
        ctx.moveTo(points[0], points[1]);
        for (let p = 2; p < points.length; p += 2) {
          ctx.lineTo(points[p], points[p + 1]);
        }
        ctx.strokeStyle = polyline.colorCss || 'rgba(210, 220, 255, 0.9)';
        ctx.lineWidth = Math.max(0.8, polyline.weight || 1);
        ctx.globalAlpha = polyline.color ? polyline.color.a : 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (dashArray && dashArray.length) {
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        }
      }

      const linetypeShapes = frame.linetypeShapes || [];
      for (let i = 0; i < linetypeShapes.length; i++) {
        const shape = linetypeShapes[i];
        if (!shape || !shape.position) {
          continue;
        }
        const fontSize = Math.max(6, shape.size || 8);
        ctx.save();
        ctx.translate(shape.position.x, shape.position.y);
        ctx.rotate(shape.rotation || 0);
        ctx.fillStyle = shape.colorCss || 'rgba(210, 227, 255, 1)';
        ctx.globalAlpha = shape.color ? shape.color.a ?? 1 : 1;
        ctx.font = `${fontSize}px ${shape.fontFamily || 'Arial, sans-serif'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shape.text || '•', 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      const points = frame.points || [];
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const [x, y] = point.screenPosition;
        const size = Math.max(2.5, point.size || 4);
        ctx.beginPath();
        ctx.fillStyle = point.colorCss || 'rgba(255, 200, 120, 1)';
        ctx.globalAlpha = point.color ? point.color.a : 1;
        ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    _updateBackgroundFill(background) {
      if (!background) {
        this.backgroundFill = { type: 'color', css: this.background };
        return;
      }
      if (background.type === 'gradient' && Array.isArray(background.stops) && background.stops.length >= 2) {
        const stops = background.stops.map((stop) => ({
          position: Number.isFinite(stop.position) ? Math.max(0, Math.min(1, stop.position)) : 0,
          css: stop.css || (stop.resolved && stop.resolved.css) || this.background
        }));
        this.backgroundFill = {
          type: 'gradient',
          stops
        };
        return;
      }
      if (background.type === 'solid' && background.solid) {
        const css = background.solid.css
          || (background.solid.resolved && background.solid.resolved.css)
          || this.background;
        this.backgroundFill = { type: 'color', css };
        return;
      }
      if (background.solidFallback) {
        const css = background.solidFallback.css
          || (background.solidFallback.resolved && background.solidFallback.resolved.css)
          || this.background;
        this.backgroundFill = { type: 'color', css };
        return;
      }
      if (background.css) {
        this.backgroundFill = { type: 'color', css: background.css };
        return;
      }
      this.backgroundFill = { type: 'color', css: this.background };
    }

    renderMessage(message, frame = {}) {
      if (!this.ctx) return;
      const width = frame.width || (this.canvas ? this.canvas.width / this.devicePixelRatio : 0);
      const height = frame.height || (this.canvas ? this.canvas.height / this.devicePixelRatio : 0);
      this.clear();

      if (!message) return;

      const ctx = this.ctx;
      ctx.save();
      ctx.scale(this.devicePixelRatio, this.devicePixelRatio);
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(message, width / 2, height / 2);
      ctx.restore();
    }

    suspend() {
      // No-op for canvas rendering.
    }

    resume() {
      // No-op for canvas rendering.
    }

    destroy() {
      this.canvas = null;
      this.ctx = null;
    }

    _renderComplexFill(ctx, fill) {
      const contours = fill.screenContours || [];
      if (!contours.length) {
        return;
      }
      ctx.save();
      const fillRule = 'evenodd';
      ctx.beginPath();
      for (let i = 0; i < contours.length; i++) {
        const contour = contours[i];
        const points = contour.points || [];
        if (!points.length) {
          continue;
        }
        ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < points.length; j++) {
          ctx.lineTo(points[j].x, points[j].y);
        }
        ctx.closePath();
      }

      if (fill.type === 'gradient' && fill.gradient) {
        const gradientBrush = this._createGradientBrush(ctx, fill);
        if (gradientBrush) {
          ctx.fillStyle = gradientBrush;
          ctx.fill(fillRule);
          ctx.restore();
          return;
        }
      }

      if (fill.type === 'pattern' && fill.pattern) {
        const patternBrush = this._createPatternBrush(ctx, fill);
        if (patternBrush) {
          ctx.fillStyle = patternBrush;
          ctx.fill(fillRule);
          ctx.restore();
          return;
        }
      }

      const css = fill.colorCss || (fill.color && fill.color.css) || 'rgba(210, 227, 255, 0.35)';
      ctx.fillStyle = css;
      ctx.globalAlpha = fill.color ? fill.color.a ?? 1 : 1;
      ctx.fill(fillRule);
      ctx.restore();
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

      const scale = patternInfo.scale || 1;
      const baseSize = Math.max(16, 32 * scale);
      const maxOffset = patternInfo.definition.reduce((acc, line) => {
        if (!line || !line.offset) return acc;
        const offsetMag = Math.hypot(line.offset.x || 0, line.offset.y || 0);
        return Math.max(acc, offsetMag);
      }, 0) * scale;
      const tileSizeValue = Math.max(baseSize, Math.ceil((maxOffset || 0) * 4));
      const tileSize = Math.max(16, tileSizeValue);
      const tileCanvas = document.createElement('canvas');
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
})(window);
