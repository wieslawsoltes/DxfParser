(function (global) {
  'use strict';

  const namespace = global.DxfRendering = global.DxfRendering || {};

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
      this.devicePixelRatio = global.devicePixelRatio || 1;
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
        const triangles = this._buildThickLineTriangles(polyline.screenPoints, Math.max(0.8, polyline.weight || 1) * (frame.devicePixelRatio || this.devicePixelRatio));
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
})(window);
