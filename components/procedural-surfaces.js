/**
 * Procedural Surfaces for DXF Surface Entities
 * 
 * Implements tessellation for procedural surface entities:
 * - EXTRUDEDSURFACE - Profile extruded along a path
 * - LOFTEDSURFACE - Surface blended between multiple cross-sections
 * - REVOLVEDSURFACE - Profile rotated around an axis
 * - SWEPTSURFACE - Profile swept along a path
 * - PLANESURFACE - Flat planar surface with boundary
 * - NURBSURFACE - NURBS surface (Non-Uniform Rational B-Spline)
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

  // Default tessellation parameters
  const DEFAULT_PARAMS = {
    uSegments: 32,
    vSegments: 32,
    tolerance: 0.01,
    adaptiveTessellation: true
  };

  /**
   * Vector3 utility class
   */
  class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }

    static fromArray(arr, offset = 0) {
      return new Vec3(arr[offset] || 0, arr[offset + 1] || 0, arr[offset + 2] || 0);
    }

    static lerp(a, b, t) {
      return new Vec3(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t
      );
    }

    clone() {
      return new Vec3(this.x, this.y, this.z);
    }

    add(v) {
      return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z);
    }

    subtract(v) {
      return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z);
    }

    scale(s) {
      return new Vec3(this.x * s, this.y * s, this.z * s);
    }

    dot(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    cross(v) {
      return new Vec3(
        this.y * v.z - this.z * v.y,
        this.z * v.x - this.x * v.z,
        this.x * v.y - this.y * v.x
      );
    }

    length() {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    normalize() {
      const len = this.length();
      if (len < 1e-10) return new Vec3(0, 0, 1);
      return this.scale(1 / len);
    }

    toArray() {
      return [this.x, this.y, this.z];
    }

    to2D() {
      return { x: this.x, y: this.y };
    }
  }

  /**
   * 4x4 Matrix for transformations
   */
  class Mat4 {
    constructor(m = null) {
      this.m = m || [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ];
    }

    static identity() {
      return new Mat4();
    }

    static translation(x, y, z) {
      return new Mat4([
        1, 0, 0, x,
        0, 1, 0, y,
        0, 0, 1, z,
        0, 0, 0, 1
      ]);
    }

    static rotation(axis, angle) {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const t = 1 - c;
      const ax = axis.normalize();
      const x = ax.x, y = ax.y, z = ax.z;

      return new Mat4([
        t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0,
        t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0,
        t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0,
        0, 0, 0, 1
      ]);
    }

    static scale(sx, sy, sz) {
      return new Mat4([
        sx, 0, 0, 0,
        0, sy, 0, 0,
        0, 0, sz, 0,
        0, 0, 0, 1
      ]);
    }

    static lookAt(position, target, up) {
      const zAxis = position.subtract(target).normalize();
      const xAxis = up.cross(zAxis).normalize();
      const yAxis = zAxis.cross(xAxis);

      return new Mat4([
        xAxis.x, xAxis.y, xAxis.z, -xAxis.dot(position),
        yAxis.x, yAxis.y, yAxis.z, -yAxis.dot(position),
        zAxis.x, zAxis.y, zAxis.z, -zAxis.dot(position),
        0, 0, 0, 1
      ]);
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
      return new Mat4(result);
    }

    transformPoint(v) {
      const x = this.m[0] * v.x + this.m[1] * v.y + this.m[2] * v.z + this.m[3];
      const y = this.m[4] * v.x + this.m[5] * v.y + this.m[6] * v.z + this.m[7];
      const z = this.m[8] * v.x + this.m[9] * v.y + this.m[10] * v.z + this.m[11];
      return new Vec3(x, y, z);
    }

    transformVector(v) {
      const x = this.m[0] * v.x + this.m[1] * v.y + this.m[2] * v.z;
      const y = this.m[4] * v.x + this.m[5] * v.y + this.m[6] * v.z;
      const z = this.m[8] * v.x + this.m[9] * v.y + this.m[10] * v.z;
      return new Vec3(x, y, z);
    }
  }

  /**
   * Curve evaluation utilities
   */
  class CurveUtils {
    /**
     * Evaluate B-spline basis function
     */
    static bsplineBasis(i, degree, t, knots) {
      if (degree === 0) {
        return (t >= knots[i] && t < knots[i + 1]) ? 1 : 0;
      }

      let left = 0, right = 0;

      const d1 = knots[i + degree] - knots[i];
      if (Math.abs(d1) > 1e-10) {
        left = ((t - knots[i]) / d1) * this.bsplineBasis(i, degree - 1, t, knots);
      }

      const d2 = knots[i + degree + 1] - knots[i + 1];
      if (Math.abs(d2) > 1e-10) {
        right = ((knots[i + degree + 1] - t) / d2) * this.bsplineBasis(i + 1, degree - 1, t, knots);
      }

      return left + right;
    }

    /**
     * Evaluate NURBS curve at parameter t
     */
    static evaluateNurbsCurve(t, degree, controlPoints, weights, knots) {
      const n = controlPoints.length;
      let numerator = new Vec3();
      let denominator = 0;

      for (let i = 0; i < n; i++) {
        const basis = this.bsplineBasis(i, degree, t, knots);
        const w = weights[i] || 1;
        const weighted = basis * w;

        numerator = numerator.add(controlPoints[i].scale(weighted));
        denominator += weighted;
      }

      if (Math.abs(denominator) < 1e-10) {
        return controlPoints[0].clone();
      }

      return numerator.scale(1 / denominator);
    }

    /**
     * Sample curve at uniform parameters
     */
    static sampleCurve(evaluator, numSamples) {
      const points = [];
      for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples;
        points.push(evaluator(t));
      }
      return points;
    }

    /**
     * Compute curve tangent at parameter t
     */
    static curveTangent(evaluator, t, epsilon = 0.001) {
      const t0 = Math.max(0, t - epsilon);
      const t1 = Math.min(1, t + epsilon);
      const p0 = evaluator(t0);
      const p1 = evaluator(t1);
      return p1.subtract(p0).normalize();
    }

    /**
     * Compute Frenet frame at parameter t
     */
    static frenetFrame(evaluator, t, upHint = new Vec3(0, 0, 1)) {
      const tangent = this.curveTangent(evaluator, t);
      
      // Use up hint to compute initial normal
      let normal = upHint.cross(tangent);
      if (normal.length() < 1e-6) {
        // Tangent parallel to up, use different reference
        normal = new Vec3(1, 0, 0).cross(tangent);
        if (normal.length() < 1e-6) {
          normal = new Vec3(0, 1, 0).cross(tangent);
        }
      }
      normal = normal.normalize();
      
      const binormal = tangent.cross(normal).normalize();
      
      return { tangent, normal, binormal };
    }
  }

  /**
   * Surface evaluation utilities
   */
  class SurfaceUtils {
    /**
     * Evaluate NURBS surface at parameters (u, v)
     */
    static evaluateNurbsSurface(u, v, degreeU, degreeV, controlPoints, weights, knotsU, knotsV, numU, numV) {
      let numerator = new Vec3();
      let denominator = 0;

      for (let i = 0; i < numU; i++) {
        const basisU = CurveUtils.bsplineBasis(i, degreeU, u, knotsU);
        
        for (let j = 0; j < numV; j++) {
          const basisV = CurveUtils.bsplineBasis(j, degreeV, v, knotsV);
          const idx = i * numV + j;
          const w = weights[idx] || 1;
          const weighted = basisU * basisV * w;

          numerator = numerator.add(controlPoints[idx].scale(weighted));
          denominator += weighted;
        }
      }

      if (Math.abs(denominator) < 1e-10) {
        return controlPoints[0].clone();
      }

      return numerator.scale(1 / denominator);
    }

    /**
     * Compute surface normal at parameters (u, v)
     */
    static surfaceNormal(evaluator, u, v, epsilon = 0.001) {
      const du = evaluator(Math.min(1, u + epsilon), v).subtract(evaluator(Math.max(0, u - epsilon), v));
      const dv = evaluator(u, Math.min(1, v + epsilon)).subtract(evaluator(u, Math.max(0, v - epsilon)));
      return du.cross(dv).normalize();
    }
  }

  /**
   * Extruded Surface Tessellator
   */
  class ExtrudedSurfaceTessellator {
    constructor(params = {}) {
      this.uSegments = params.uSegments || DEFAULT_PARAMS.uSegments;
      this.vSegments = params.vSegments || DEFAULT_PARAMS.vSegments;
    }

    /**
     * Tessellate an extruded surface
     * @param {Object} entity - Entity with profile and extrusion parameters
     */
    tessellate(entity) {
      const {
        profile = [],           // Array of profile points [{x, y, z}]
        direction = { x: 0, y: 0, z: 1 }, // Extrusion direction
        height = 1,             // Extrusion distance
        twist = 0,              // Twist angle in radians
        scale = 1,              // Scale factor at end (or [startScale, endScale])
        taper = 0               // Taper angle
      } = entity;

      if (profile.length < 2) return null;

      const vertices = [];
      const triangles = [];
      const normals = [];

      const dir = new Vec3(direction.x, direction.y, direction.z).normalize();
      const profilePoints = profile.map(p => new Vec3(p.x, p.y, p.z || 0));

      // Compute profile plane normal
      const profileCenter = this.computeCentroid(profilePoints);

      for (let v = 0; v <= this.vSegments; v++) {
        const t = v / this.vSegments;
        const z = t * height;
        const angle = t * twist;
        
        // Compute scale at this position
        let s = 1;
        if (typeof scale === 'number') {
          s = 1 + (scale - 1) * t;
        } else if (Array.isArray(scale)) {
          s = scale[0] + (scale[1] - scale[0]) * t;
        }
        
        // Apply taper
        if (taper !== 0) {
          s *= 1 - Math.tan(taper) * t * height;
        }

        // Build transformation
        const rotation = Mat4.rotation(dir, angle);
        const translation = Mat4.translation(dir.x * z, dir.y * z, dir.z * z);
        const scaling = Mat4.scale(s, s, 1);
        const transform = translation.multiply(rotation).multiply(scaling);

        for (let u = 0; u <= this.uSegments; u++) {
          const profileIdx = Math.min(u, profilePoints.length - 1);
          const profileT = u / this.uSegments;
          
          // Interpolate profile point
          const idx = profileT * (profilePoints.length - 1);
          const i0 = Math.floor(idx);
          const i1 = Math.min(i0 + 1, profilePoints.length - 1);
          const frac = idx - i0;
          
          const basePoint = Vec3.lerp(profilePoints[i0], profilePoints[i1], frac);
          const localPoint = basePoint.subtract(profileCenter);
          const transformedPoint = transform.transformPoint(localPoint).add(profileCenter);
          
          vertices.push(transformedPoint.toArray());
        }
      }

      // Generate triangles
      const stride = this.uSegments + 1;
      for (let v = 0; v < this.vSegments; v++) {
        for (let u = 0; u < this.uSegments; u++) {
          const i00 = v * stride + u;
          const i10 = i00 + 1;
          const i01 = i00 + stride;
          const i11 = i01 + 1;

          triangles.push([i00, i10, i11]);
          triangles.push([i00, i11, i01]);
        }
      }

      return { vertices, triangles, normals: this.computeNormals(vertices, triangles) };
    }

    computeCentroid(points) {
      let sum = new Vec3();
      for (const p of points) {
        sum = sum.add(p);
      }
      return sum.scale(1 / points.length);
    }

    computeNormals(vertices, triangles) {
      const normals = vertices.map(() => new Vec3());

      for (const [i0, i1, i2] of triangles) {
        const v0 = Vec3.fromArray(vertices[i0]);
        const v1 = Vec3.fromArray(vertices[i1]);
        const v2 = Vec3.fromArray(vertices[i2]);

        const e1 = v1.subtract(v0);
        const e2 = v2.subtract(v0);
        const faceNormal = e1.cross(e2);

        normals[i0] = normals[i0].add(faceNormal);
        normals[i1] = normals[i1].add(faceNormal);
        normals[i2] = normals[i2].add(faceNormal);
      }

      return normals.map(n => n.normalize().toArray());
    }
  }

  /**
   * Revolved Surface Tessellator
   */
  class RevolvedSurfaceTessellator {
    constructor(params = {}) {
      this.uSegments = params.uSegments || DEFAULT_PARAMS.uSegments;
      this.vSegments = params.vSegments || DEFAULT_PARAMS.vSegments;
    }

    /**
     * Tessellate a revolved surface
     * @param {Object} entity - Entity with profile and revolution parameters
     */
    tessellate(entity) {
      const {
        profile = [],           // Profile curve points
        axisPoint = { x: 0, y: 0, z: 0 }, // Point on axis
        axisDirection = { x: 0, y: 0, z: 1 }, // Axis direction
        startAngle = 0,         // Start angle in radians
        endAngle = Math.PI * 2  // End angle in radians
      } = entity;

      if (profile.length < 2) return null;

      const vertices = [];
      const triangles = [];

      const axis = new Vec3(axisDirection.x, axisDirection.y, axisDirection.z).normalize();
      const origin = new Vec3(axisPoint.x, axisPoint.y, axisPoint.z);
      const profilePoints = profile.map(p => new Vec3(p.x, p.y, p.z || 0));

      const angleRange = endAngle - startAngle;
      const isClosed = Math.abs(angleRange - Math.PI * 2) < 0.01;

      for (let u = 0; u <= this.uSegments; u++) {
        const angle = startAngle + (u / this.uSegments) * angleRange;
        const rotation = Mat4.rotation(axis, angle);

        for (let v = 0; v <= this.vSegments; v++) {
          const t = v / this.vSegments;
          
          // Interpolate profile point
          const idx = t * (profilePoints.length - 1);
          const i0 = Math.floor(idx);
          const i1 = Math.min(i0 + 1, profilePoints.length - 1);
          const frac = idx - i0;
          
          const profilePoint = Vec3.lerp(profilePoints[i0], profilePoints[i1], frac);
          
          // Translate to axis origin, rotate, translate back
          const localPoint = profilePoint.subtract(origin);
          const rotatedPoint = rotation.transformPoint(localPoint).add(origin);
          
          vertices.push(rotatedPoint.toArray());
        }
      }

      // Generate triangles
      const stride = this.vSegments + 1;
      const uEnd = isClosed ? this.uSegments : this.uSegments;
      
      for (let u = 0; u < uEnd; u++) {
        for (let v = 0; v < this.vSegments; v++) {
          const i00 = u * stride + v;
          const i01 = i00 + 1;
          const i10 = ((u + 1) % (this.uSegments + 1)) * stride + v;
          const i11 = i10 + 1;

          triangles.push([i00, i10, i11]);
          triangles.push([i00, i11, i01]);
        }
      }

      return { 
        vertices, 
        triangles, 
        normals: this.computeNormals(vertices, triangles) 
      };
    }

    computeNormals(vertices, triangles) {
      const normals = vertices.map(() => new Vec3());

      for (const [i0, i1, i2] of triangles) {
        const v0 = Vec3.fromArray(vertices[i0]);
        const v1 = Vec3.fromArray(vertices[i1]);
        const v2 = Vec3.fromArray(vertices[i2]);

        const e1 = v1.subtract(v0);
        const e2 = v2.subtract(v0);
        const faceNormal = e1.cross(e2);

        normals[i0] = normals[i0].add(faceNormal);
        normals[i1] = normals[i1].add(faceNormal);
        normals[i2] = normals[i2].add(faceNormal);
      }

      return normals.map(n => n.normalize().toArray());
    }
  }

  /**
   * Swept Surface Tessellator
   */
  class SweptSurfaceTessellator {
    constructor(params = {}) {
      this.uSegments = params.uSegments || DEFAULT_PARAMS.uSegments;
      this.vSegments = params.vSegments || DEFAULT_PARAMS.vSegments;
    }

    /**
     * Tessellate a swept surface
     * @param {Object} entity - Entity with profile and path parameters
     */
    tessellate(entity) {
      const {
        profile = [],           // Profile curve points
        path = [],              // Path curve points
        twist = 0,              // Total twist angle
        scale = 1,              // Scale factor (or [start, end])
        bankAngle = 0,          // Bank angle for path following
        alignToPath = true      // Whether to align profile to path tangent
      } = entity;

      if (profile.length < 2 || path.length < 2) return null;

      const vertices = [];
      const triangles = [];

      const profilePoints = profile.map(p => new Vec3(p.x, p.y, p.z || 0));
      const pathPoints = path.map(p => new Vec3(p.x, p.y, p.z || 0));
      const profileCenter = this.computeCentroid(profilePoints);

      // Create path evaluator
      const pathEvaluator = (t) => {
        const idx = t * (pathPoints.length - 1);
        const i0 = Math.floor(idx);
        const i1 = Math.min(i0 + 1, pathPoints.length - 1);
        const frac = idx - i0;
        return Vec3.lerp(pathPoints[i0], pathPoints[i1], frac);
      };

      for (let v = 0; v <= this.vSegments; v++) {
        const t = v / this.vSegments;
        const pathPoint = pathEvaluator(t);
        
        // Compute frame
        let frame;
        if (alignToPath) {
          frame = CurveUtils.frenetFrame(pathEvaluator, t);
        } else {
          frame = {
            tangent: new Vec3(0, 0, 1),
            normal: new Vec3(1, 0, 0),
            binormal: new Vec3(0, 1, 0)
          };
        }

        // Apply twist
        const twistAngle = t * twist;
        const twistCos = Math.cos(twistAngle);
        const twistSin = Math.sin(twistAngle);

        // Rotate normal and binormal around tangent
        const rotatedNormal = frame.normal.scale(twistCos).add(frame.binormal.scale(twistSin));
        const rotatedBinormal = frame.binormal.scale(twistCos).subtract(frame.normal.scale(twistSin));

        // Apply bank angle
        const bankCos = Math.cos(bankAngle * t);
        const bankSin = Math.sin(bankAngle * t);
        const finalNormal = rotatedNormal.scale(bankCos).add(rotatedBinormal.scale(bankSin));
        const finalBinormal = rotatedBinormal.scale(bankCos).subtract(rotatedNormal.scale(bankSin));

        // Compute scale at this point
        let s = 1;
        if (typeof scale === 'number') {
          s = 1 + (scale - 1) * t;
        } else if (Array.isArray(scale)) {
          s = scale[0] + (scale[1] - scale[0]) * t;
        }

        for (let u = 0; u <= this.uSegments; u++) {
          const profileT = u / this.uSegments;
          
          // Interpolate profile point
          const idx = profileT * (profilePoints.length - 1);
          const i0 = Math.floor(idx);
          const i1 = Math.min(i0 + 1, profilePoints.length - 1);
          const frac = idx - i0;
          
          const localPoint = Vec3.lerp(profilePoints[i0], profilePoints[i1], frac).subtract(profileCenter);
          
          // Transform to path frame
          const worldPoint = pathPoint
            .add(finalNormal.scale(localPoint.x * s))
            .add(finalBinormal.scale(localPoint.y * s))
            .add(frame.tangent.scale(localPoint.z * s));
          
          vertices.push(worldPoint.toArray());
        }
      }

      // Generate triangles
      const stride = this.uSegments + 1;
      for (let v = 0; v < this.vSegments; v++) {
        for (let u = 0; u < this.uSegments; u++) {
          const i00 = v * stride + u;
          const i10 = i00 + 1;
          const i01 = i00 + stride;
          const i11 = i01 + 1;

          triangles.push([i00, i10, i11]);
          triangles.push([i00, i11, i01]);
        }
      }

      return { 
        vertices, 
        triangles, 
        normals: this.computeNormals(vertices, triangles) 
      };
    }

    computeCentroid(points) {
      let sum = new Vec3();
      for (const p of points) {
        sum = sum.add(p);
      }
      return sum.scale(1 / points.length);
    }

    computeNormals(vertices, triangles) {
      const normals = vertices.map(() => new Vec3());

      for (const [i0, i1, i2] of triangles) {
        const v0 = Vec3.fromArray(vertices[i0]);
        const v1 = Vec3.fromArray(vertices[i1]);
        const v2 = Vec3.fromArray(vertices[i2]);

        const e1 = v1.subtract(v0);
        const e2 = v2.subtract(v0);
        const faceNormal = e1.cross(e2);

        normals[i0] = normals[i0].add(faceNormal);
        normals[i1] = normals[i1].add(faceNormal);
        normals[i2] = normals[i2].add(faceNormal);
      }

      return normals.map(n => n.normalize().toArray());
    }
  }

  /**
   * Lofted Surface Tessellator
   */
  class LoftedSurfaceTessellator {
    constructor(params = {}) {
      this.uSegments = params.uSegments || DEFAULT_PARAMS.uSegments;
      this.vSegments = params.vSegments || DEFAULT_PARAMS.vSegments;
    }

    /**
     * Tessellate a lofted surface
     * @param {Object} entity - Entity with cross-section curves
     */
    tessellate(entity) {
      const {
        crossSections = [],     // Array of profile curves
        closed = false,         // Whether the loft is closed
        ruled = false,          // Use ruled (linear) interpolation
        guideCurves = [],       // Optional guide curves
        startTangent = null,    // Optional start tangent
        endTangent = null       // Optional end tangent
      } = entity;

      if (crossSections.length < 2) return null;

      const vertices = [];
      const triangles = [];

      // Convert cross-sections to Vec3 arrays
      const sections = crossSections.map(section => 
        section.map(p => new Vec3(p.x, p.y, p.z || 0))
      );

      // Normalize cross-sections to have same number of points
      const maxPoints = Math.max(...sections.map(s => s.length));
      const normalizedSections = sections.map(section => 
        this.resampleCurve(section, maxPoints)
      );

      for (let v = 0; v <= this.vSegments; v++) {
        const t = v / this.vSegments;
        
        // Interpolate between cross-sections
        let crossSectionPoints;
        if (ruled) {
          crossSectionPoints = this.ruledInterpolation(normalizedSections, t);
        } else {
          crossSectionPoints = this.smoothInterpolation(normalizedSections, t, startTangent, endTangent);
        }

        for (let u = 0; u <= this.uSegments; u++) {
          const profileT = u / this.uSegments;
          const idx = profileT * (crossSectionPoints.length - 1);
          const i0 = Math.floor(idx);
          const i1 = Math.min(i0 + 1, crossSectionPoints.length - 1);
          const frac = idx - i0;
          
          const point = Vec3.lerp(crossSectionPoints[i0], crossSectionPoints[i1], frac);
          vertices.push(point.toArray());
        }
      }

      // Generate triangles
      const stride = this.uSegments + 1;
      for (let v = 0; v < this.vSegments; v++) {
        for (let u = 0; u < this.uSegments; u++) {
          const i00 = v * stride + u;
          const i10 = i00 + 1;
          const i01 = i00 + stride;
          const i11 = i01 + 1;

          triangles.push([i00, i10, i11]);
          triangles.push([i00, i11, i01]);
        }
      }

      return { 
        vertices, 
        triangles, 
        normals: this.computeNormals(vertices, triangles) 
      };
    }

    ruledInterpolation(sections, t) {
      // Linear interpolation between sections
      const sectionIdx = t * (sections.length - 1);
      const i0 = Math.floor(sectionIdx);
      const i1 = Math.min(i0 + 1, sections.length - 1);
      const frac = sectionIdx - i0;

      const section0 = sections[i0];
      const section1 = sections[i1];
      
      return section0.map((p, i) => Vec3.lerp(p, section1[i], frac));
    }

    smoothInterpolation(sections, t, startTangent, endTangent) {
      // Catmull-Rom spline interpolation between sections
      const n = sections.length;
      const sectionIdx = t * (n - 1);
      const i = Math.floor(sectionIdx);
      const frac = sectionIdx - i;

      // Get control points
      const p0 = sections[Math.max(0, i - 1)];
      const p1 = sections[i];
      const p2 = sections[Math.min(i + 1, n - 1)];
      const p3 = sections[Math.min(i + 2, n - 1)];

      // Catmull-Rom interpolation for each point
      return p1.map((_, idx) => {
        return this.catmullRom(
          p0[idx], p1[idx], p2[idx], p3[idx], frac
        );
      });
    }

    catmullRom(p0, p1, p2, p3, t) {
      const t2 = t * t;
      const t3 = t2 * t;
      
      const x = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );
      
      const y = 0.5 * (
        (2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      );
      
      const z = 0.5 * (
        (2 * p1.z) +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
      );
      
      return new Vec3(x, y, z);
    }

    resampleCurve(curve, numPoints) {
      const result = [];
      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const idx = t * (curve.length - 1);
        const i0 = Math.floor(idx);
        const i1 = Math.min(i0 + 1, curve.length - 1);
        const frac = idx - i0;
        result.push(Vec3.lerp(curve[i0], curve[i1], frac));
      }
      return result;
    }

    computeNormals(vertices, triangles) {
      const normals = vertices.map(() => new Vec3());

      for (const [i0, i1, i2] of triangles) {
        const v0 = Vec3.fromArray(vertices[i0]);
        const v1 = Vec3.fromArray(vertices[i1]);
        const v2 = Vec3.fromArray(vertices[i2]);

        const e1 = v1.subtract(v0);
        const e2 = v2.subtract(v0);
        const faceNormal = e1.cross(e2);

        normals[i0] = normals[i0].add(faceNormal);
        normals[i1] = normals[i1].add(faceNormal);
        normals[i2] = normals[i2].add(faceNormal);
      }

      return normals.map(n => n.normalize().toArray());
    }
  }

  /**
   * Plane Surface Tessellator
   */
  class PlaneSurfaceTessellator {
    constructor(params = {}) {
      this.tolerance = params.tolerance || DEFAULT_PARAMS.tolerance;
    }

    /**
     * Tessellate a planar surface
     * @param {Object} entity - Entity with boundary and optional holes
     */
    tessellate(entity) {
      const {
        boundary = [],          // Outer boundary points
        holes = [],             // Array of hole boundaries
        normal = { x: 0, y: 0, z: 1 } // Plane normal
      } = entity;

      if (boundary.length < 3) return null;

      // Convert to Vec3
      const boundaryPoints = boundary.map(p => new Vec3(p.x, p.y, p.z || 0));
      const holePoints = holes.map(hole => 
        hole.map(p => new Vec3(p.x, p.y, p.z || 0))
      );

      // Project to 2D for triangulation
      const planeNormal = new Vec3(normal.x, normal.y, normal.z).normalize();
      const { uAxis, vAxis } = this.computePlaneAxes(planeNormal);

      // Project boundary
      const boundary2D = boundaryPoints.map(p => ({
        x: p.dot(uAxis),
        y: p.dot(vAxis)
      }));

      // Project holes
      const holes2D = holePoints.map(hole => 
        hole.map(p => ({
          x: p.dot(uAxis),
          y: p.dot(vAxis)
        }))
      );

      // Triangulate using earcut (or similar)
      const { triangles, flatCoords } = this.triangulate(boundary2D, holes2D);

      // Convert back to 3D
      const vertices = [];
      for (let i = 0; i < flatCoords.length; i += 2) {
        const u = flatCoords[i];
        const v = flatCoords[i + 1];
        const point = uAxis.scale(u).add(vAxis.scale(v));
        // Restore z from original points if available
        const origIdx = Math.round(i / 2);
        if (origIdx < boundaryPoints.length) {
          point.z = boundaryPoints[origIdx].z;
        }
        vertices.push(point.toArray());
      }

      // Generate normals (all same for planar surface)
      const normals = vertices.map(() => planeNormal.toArray());

      return { vertices, triangles, normals };
    }

    computePlaneAxes(normal) {
      let uAxis;
      if (Math.abs(normal.z) < 0.9) {
        uAxis = new Vec3(-normal.y, normal.x, 0).normalize();
      } else {
        uAxis = new Vec3(1, 0, 0);
      }
      const vAxis = normal.cross(uAxis).normalize();
      return { uAxis, vAxis };
    }

    triangulate(boundary, holes) {
      // Simple ear-clipping triangulation
      // In production, use earcut or similar library
      
      const flatCoords = [];
      const holeIndices = [];
      
      // Add boundary points
      for (const p of boundary) {
        flatCoords.push(p.x, p.y);
      }
      
      // Add hole points
      for (const hole of holes) {
        holeIndices.push(flatCoords.length / 2);
        for (const p of hole) {
          flatCoords.push(p.x, p.y);
        }
      }

      // Simple triangulation (fan from first vertex)
      // This is a fallback - real implementation should use earcut
      const triangles = [];
      const numBoundary = boundary.length;
      
      if (holes.length === 0) {
        for (let i = 1; i < numBoundary - 1; i++) {
          triangles.push([0, i, i + 1]);
        }
      }

      return { triangles, flatCoords };
    }
  }

  /**
   * NURBS Surface Tessellator
   */
  class NurbsSurfaceTessellator {
    constructor(params = {}) {
      this.uSegments = params.uSegments || DEFAULT_PARAMS.uSegments;
      this.vSegments = params.vSegments || DEFAULT_PARAMS.vSegments;
    }

    /**
     * Tessellate a NURBS surface
     * @param {Object} entity - Entity with NURBS surface parameters
     */
    tessellate(entity) {
      const {
        controlPoints = [],     // 2D array of control points
        weights = [],           // Weights for rational surfaces
        knotsU = [],            // U knot vector
        knotsV = [],            // V knot vector
        degreeU = 3,            // U degree
        degreeV = 3,            // V degree
        numU = 0,               // Number of control points in U
        numV = 0                // Number of control points in V
      } = entity;

      const cpU = numU || Math.sqrt(controlPoints.length) | 0;
      const cpV = numV || Math.ceil(controlPoints.length / cpU);

      if (controlPoints.length < 4) return null;

      // Convert control points to Vec3
      const cpVec = controlPoints.map(p => 
        Array.isArray(p) ? new Vec3(p[0], p[1], p[2] || 0) :
        new Vec3(p.x, p.y, p.z || 0)
      );

      // Generate default knots if not provided
      const kU = knotsU.length > 0 ? knotsU : this.generateUniformKnots(cpU, degreeU);
      const kV = knotsV.length > 0 ? knotsV : this.generateUniformKnots(cpV, degreeV);
      const w = weights.length > 0 ? weights : controlPoints.map(() => 1);

      const vertices = [];
      const triangles = [];

      // Compute parameter range
      const uMin = kU[degreeU];
      const uMax = kU[kU.length - degreeU - 1];
      const vMin = kV[degreeV];
      const vMax = kV[kV.length - degreeV - 1];

      for (let iv = 0; iv <= this.vSegments; iv++) {
        const v = vMin + (iv / this.vSegments) * (vMax - vMin);
        
        for (let iu = 0; iu <= this.uSegments; iu++) {
          const u = uMin + (iu / this.uSegments) * (uMax - uMin);
          
          const point = SurfaceUtils.evaluateNurbsSurface(
            u, v, degreeU, degreeV, cpVec, w, kU, kV, cpU, cpV
          );
          
          vertices.push(point.toArray());
        }
      }

      // Generate triangles
      const stride = this.uSegments + 1;
      for (let v = 0; v < this.vSegments; v++) {
        for (let u = 0; u < this.uSegments; u++) {
          const i00 = v * stride + u;
          const i10 = i00 + 1;
          const i01 = i00 + stride;
          const i11 = i01 + 1;

          triangles.push([i00, i10, i11]);
          triangles.push([i00, i11, i01]);
        }
      }

      return { 
        vertices, 
        triangles, 
        normals: this.computeNormals(vertices, triangles) 
      };
    }

    generateUniformKnots(numControlPoints, degree) {
      const n = numControlPoints - 1;
      const knots = [];
      
      // Clamped knot vector
      for (let i = 0; i <= degree; i++) {
        knots.push(0);
      }
      
      for (let i = 1; i <= n - degree; i++) {
        knots.push(i / (n - degree + 1));
      }
      
      for (let i = 0; i <= degree; i++) {
        knots.push(1);
      }
      
      return knots;
    }

    computeNormals(vertices, triangles) {
      const normals = vertices.map(() => new Vec3());

      for (const [i0, i1, i2] of triangles) {
        const v0 = Vec3.fromArray(vertices[i0]);
        const v1 = Vec3.fromArray(vertices[i1]);
        const v2 = Vec3.fromArray(vertices[i2]);

        const e1 = v1.subtract(v0);
        const e2 = v2.subtract(v0);
        const faceNormal = e1.cross(e2);

        normals[i0] = normals[i0].add(faceNormal);
        normals[i1] = normals[i1].add(faceNormal);
        normals[i2] = normals[i2].add(faceNormal);
      }

      return normals.map(n => n.normalize().toArray());
    }
  }

  /**
   * Main Procedural Surface Factory
   */
  class ProceduralSurfaceFactory {
    constructor(params = {}) {
      this.params = { ...DEFAULT_PARAMS, ...params };
      
      this.extrudedTessellator = new ExtrudedSurfaceTessellator(this.params);
      this.revolvedTessellator = new RevolvedSurfaceTessellator(this.params);
      this.sweptTessellator = new SweptSurfaceTessellator(this.params);
      this.loftedTessellator = new LoftedSurfaceTessellator(this.params);
      this.planeTessellator = new PlaneSurfaceTessellator(this.params);
      this.nurbsTessellator = new NurbsSurfaceTessellator(this.params);
    }

    /**
     * Tessellate a procedural surface entity
     */
    tessellate(entity) {
      const type = (entity.type || entity.entityType || '').toUpperCase();
      
      switch (type) {
        case 'EXTRUDEDSURFACE':
          return this.extrudedTessellator.tessellate(entity);
        case 'REVOLVEDSURFACE':
          return this.revolvedTessellator.tessellate(entity);
        case 'SWEPTSURFACE':
          return this.sweptTessellator.tessellate(entity);
        case 'LOFTEDSURFACE':
          return this.loftedTessellator.tessellate(entity);
        case 'PLANESURFACE':
          return this.planeTessellator.tessellate(entity);
        case 'NURBSURFACE':
          return this.nurbsTessellator.tessellate(entity);
        default:
          console.warn(`Unknown surface type: ${type}`);
          return null;
      }
    }
  }

  // Export
  namespace.ProceduralSurfaceFactory = ProceduralSurfaceFactory;
  namespace.ExtrudedSurfaceTessellator = ExtrudedSurfaceTessellator;
  namespace.RevolvedSurfaceTessellator = RevolvedSurfaceTessellator;
  namespace.SweptSurfaceTessellator = SweptSurfaceTessellator;
  namespace.LoftedSurfaceTessellator = LoftedSurfaceTessellator;
  namespace.PlaneSurfaceTessellator = PlaneSurfaceTessellator;
  namespace.NurbsSurfaceTessellator = NurbsSurfaceTessellator;
  namespace.CurveUtils = CurveUtils;
  namespace.SurfaceUtils = SurfaceUtils;
  namespace.Vec3 = Vec3;
  namespace.Mat4 = Mat4;

  return namespace;
}));
