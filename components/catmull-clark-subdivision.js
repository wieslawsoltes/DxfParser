/**
 * Catmull-Clark Subdivision Surface Algorithm
 * 
 * Implements the Catmull-Clark subdivision algorithm for MESH entities
 * with subdivision levels > 0. This is used for smooth surface rendering
 * of polygonal meshes in DXF files.
 * 
 * Reference: Catmull, E.; Clark, J. (1978). "Recursively generated B-spline surfaces
 * on arbitrary topological meshes"
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

  /**
   * Vertex class for subdivision
   */
  class SubdivVertex {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.edges = [];        // Adjacent edges
      this.faces = [];        // Adjacent faces
      this.isBoundary = false;
      this.index = -1;
    }

    static fromArray(arr) {
      return new SubdivVertex(arr[0] || 0, arr[1] || 0, arr[2] || 0);
    }

    clone() {
      const v = new SubdivVertex(this.x, this.y, this.z);
      v.isBoundary = this.isBoundary;
      return v;
    }

    add(other) {
      return new SubdivVertex(
        this.x + other.x,
        this.y + other.y,
        this.z + other.z
      );
    }

    subtract(other) {
      return new SubdivVertex(
        this.x - other.x,
        this.y - other.y,
        this.z - other.z
      );
    }

    scale(s) {
      return new SubdivVertex(this.x * s, this.y * s, this.z * s);
    }

    length() {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    normalize() {
      const len = this.length();
      if (len < 1e-10) return new SubdivVertex(0, 0, 1);
      return this.scale(1 / len);
    }

    cross(other) {
      return new SubdivVertex(
        this.y * other.z - this.z * other.y,
        this.z * other.x - this.x * other.z,
        this.x * other.y - this.y * other.x
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
   * Edge class for subdivision
   */
  class SubdivEdge {
    constructor(v0, v1) {
      this.v0 = v0;           // Start vertex
      this.v1 = v1;           // End vertex
      this.faces = [];        // Adjacent faces (1 for boundary, 2 for interior)
      this.edgePoint = null;  // Computed edge point
      this.index = -1;
    }

    getMidpoint() {
      return this.v0.add(this.v1).scale(0.5);
    }

    isBoundary() {
      return this.faces.length === 1;
    }

    getOtherVertex(v) {
      return v === this.v0 ? this.v1 : this.v0;
    }

    containsVertex(v) {
      return v === this.v0 || v === this.v1;
    }

    // Create a key for edge lookup (order-independent)
    static makeKey(idx0, idx1) {
      return idx0 < idx1 ? `${idx0}-${idx1}` : `${idx1}-${idx0}`;
    }
  }

  /**
   * Face class for subdivision
   */
  class SubdivFace {
    constructor(vertices = []) {
      this.vertices = vertices;  // Array of SubdivVertex
      this.edges = [];           // Array of SubdivEdge
      this.facePoint = null;     // Computed face point
      this.index = -1;
    }

    getVertexCount() {
      return this.vertices.length;
    }

    getCentroid() {
      if (this.vertices.length === 0) return new SubdivVertex();
      
      let sum = new SubdivVertex();
      for (const v of this.vertices) {
        sum = sum.add(v);
      }
      return sum.scale(1 / this.vertices.length);
    }

    getNormal() {
      if (this.vertices.length < 3) return new SubdivVertex(0, 0, 1);
      
      // Use Newell's method for robust normal calculation
      let nx = 0, ny = 0, nz = 0;
      const n = this.vertices.length;
      
      for (let i = 0; i < n; i++) {
        const current = this.vertices[i];
        const next = this.vertices[(i + 1) % n];
        nx += (current.y - next.y) * (current.z + next.z);
        ny += (current.z - next.z) * (current.x + next.x);
        nz += (current.x - next.x) * (current.y + next.y);
      }
      
      const normal = new SubdivVertex(nx, ny, nz);
      return normal.normalize();
    }

    isQuad() {
      return this.vertices.length === 4;
    }

    isTriangle() {
      return this.vertices.length === 3;
    }
  }

  /**
   * Subdivision Mesh - container for mesh data during subdivision
   */
  class SubdivisionMesh {
    constructor() {
      this.vertices = [];
      this.edges = [];
      this.faces = [];
      this.edgeMap = new Map();  // Edge lookup by vertex indices
    }

    /**
     * Build mesh from vertex and face arrays
     */
    static fromArrays(vertexArray, faceArray) {
      const mesh = new SubdivisionMesh();
      
      // Create vertices
      for (let i = 0; i < vertexArray.length; i++) {
        const v = SubdivVertex.fromArray(vertexArray[i]);
        v.index = i;
        mesh.vertices.push(v);
      }

      // Create faces and edges
      for (let i = 0; i < faceArray.length; i++) {
        const faceIndices = faceArray[i];
        if (faceIndices.length < 3) continue;

        const face = new SubdivFace();
        face.index = i;

        // Add vertices to face
        for (const idx of faceIndices) {
          if (idx >= 0 && idx < mesh.vertices.length) {
            const v = mesh.vertices[idx];
            face.vertices.push(v);
            v.faces.push(face);
          }
        }

        // Create edges
        const n = face.vertices.length;
        for (let j = 0; j < n; j++) {
          const v0 = face.vertices[j];
          const v1 = face.vertices[(j + 1) % n];
          const key = SubdivEdge.makeKey(v0.index, v1.index);

          let edge = mesh.edgeMap.get(key);
          if (!edge) {
            edge = new SubdivEdge(v0, v1);
            edge.index = mesh.edges.length;
            mesh.edges.push(edge);
            mesh.edgeMap.set(key, edge);
            v0.edges.push(edge);
            v1.edges.push(edge);
          }

          edge.faces.push(face);
          face.edges.push(edge);
        }

        mesh.faces.push(face);
      }

      // Mark boundary vertices
      for (const edge of mesh.edges) {
        if (edge.isBoundary()) {
          edge.v0.isBoundary = true;
          edge.v1.isBoundary = true;
        }
      }

      return mesh;
    }

    /**
     * Convert mesh to vertex/face arrays
     */
    toArrays() {
      const vertices = this.vertices.map(v => v.toArray());
      const faces = this.faces.map(f => f.vertices.map(v => v.index));
      return { vertices, faces };
    }

    /**
     * Convert to triangles for rendering
     */
    toTriangles() {
      const vertices = this.vertices.map(v => v.toArray());
      const triangles = [];

      for (const face of this.faces) {
        if (face.vertices.length === 3) {
          triangles.push(face.vertices.map(v => v.index));
        } else if (face.vertices.length === 4) {
          // Split quad into two triangles
          const [a, b, c, d] = face.vertices.map(v => v.index);
          triangles.push([a, b, c]);
          triangles.push([a, c, d]);
        } else if (face.vertices.length > 4) {
          // Fan triangulation for n-gons
          const indices = face.vertices.map(v => v.index);
          for (let i = 1; i < indices.length - 1; i++) {
            triangles.push([indices[0], indices[i], indices[i + 1]]);
          }
        }
      }

      return { vertices, triangles };
    }
  }

  /**
   * Catmull-Clark Subdivision Algorithm
   */
  class CatmullClarkSubdivision {
    constructor(options = {}) {
      this.preserveBoundary = options.preserveBoundary !== false;
      this.smoothBoundary = options.smoothBoundary || false;
    }

    /**
     * Subdivide a mesh one level
     */
    subdivide(mesh) {
      const newMesh = new SubdivisionMesh();
      const vertexMapping = new Map();  // old vertex -> new vertex
      const edgePointMapping = new Map(); // edge -> new vertex
      const facePointMapping = new Map(); // face -> new vertex

      // Step 1: Compute face points
      for (const face of mesh.faces) {
        const facePoint = face.getCentroid();
        facePoint.index = newMesh.vertices.length;
        newMesh.vertices.push(facePoint);
        facePointMapping.set(face, facePoint);
        face.facePoint = facePoint;
      }

      // Step 2: Compute edge points
      for (const edge of mesh.edges) {
        let edgePoint;

        if (edge.isBoundary()) {
          // Boundary edge: midpoint
          edgePoint = edge.getMidpoint();
        } else {
          // Interior edge: average of midpoint and adjacent face points
          const midpoint = edge.getMidpoint();
          let faceSum = new SubdivVertex();
          for (const face of edge.faces) {
            faceSum = faceSum.add(face.facePoint);
          }
          const faceAvg = faceSum.scale(1 / edge.faces.length);
          edgePoint = midpoint.add(faceAvg).scale(0.5);
        }

        edgePoint.index = newMesh.vertices.length;
        newMesh.vertices.push(edgePoint);
        edgePointMapping.set(edge, edgePoint);
        edge.edgePoint = edgePoint;
      }

      // Step 3: Compute new positions for original vertices
      for (const vertex of mesh.vertices) {
        let newVertex;

        if (vertex.isBoundary && this.preserveBoundary) {
          if (this.smoothBoundary) {
            // Smooth boundary: average with adjacent boundary vertices
            const boundaryEdges = vertex.edges.filter(e => e.isBoundary());
            if (boundaryEdges.length === 2) {
              const e1 = boundaryEdges[0];
              const e2 = boundaryEdges[1];
              const v1 = e1.getOtherVertex(vertex);
              const v2 = e2.getOtherVertex(vertex);
              // Boundary vertex rule: 1/8 * (v1 + v2) + 3/4 * v
              newVertex = v1.add(v2).scale(0.125).add(vertex.scale(0.75));
            } else {
              newVertex = vertex.clone();
            }
          } else {
            // Keep boundary vertices in place
            newVertex = vertex.clone();
          }
        } else {
          // Interior vertex formula:
          // new_v = (Q + 2*R + (n-3)*v) / n
          // where Q = avg of face points, R = avg of edge midpoints, n = valence
          
          const n = vertex.edges.length;
          
          // Q: average of adjacent face points
          let Q = new SubdivVertex();
          for (const face of vertex.faces) {
            Q = Q.add(face.facePoint);
          }
          Q = Q.scale(1 / vertex.faces.length);

          // R: average of adjacent edge midpoints
          let R = new SubdivVertex();
          for (const edge of vertex.edges) {
            R = R.add(edge.getMidpoint());
          }
          R = R.scale(1 / vertex.edges.length);

          // Apply formula
          newVertex = Q.add(R.scale(2)).add(vertex.scale(n - 3)).scale(1 / n);
        }

        newVertex.index = newMesh.vertices.length;
        newMesh.vertices.push(newVertex);
        vertexMapping.set(vertex, newVertex);
      }

      // Step 4: Create new faces
      for (const face of mesh.faces) {
        const n = face.vertices.length;
        const facePoint = facePointMapping.get(face);

        // Create n new quads, one for each original vertex
        for (let i = 0; i < n; i++) {
          const v = face.vertices[i];
          const vPrev = face.vertices[(i + n - 1) % n];
          const vNext = face.vertices[(i + 1) % n];

          // Find edges
          const edgePrev = face.edges.find(e => e.containsVertex(v) && e.containsVertex(vPrev));
          const edgeNext = face.edges.find(e => e.containsVertex(v) && e.containsVertex(vNext));

          if (!edgePrev || !edgeNext) continue;

          const edgePointPrev = edgePointMapping.get(edgePrev);
          const edgePointNext = edgePointMapping.get(edgeNext);
          const newV = vertexMapping.get(v);

          // Create new quad face: edgePointPrev -> newV -> edgePointNext -> facePoint
          const newFace = new SubdivFace([edgePointPrev, newV, edgePointNext, facePoint]);
          newFace.index = newMesh.faces.length;
          
          // Update vertex-face references
          for (const fv of newFace.vertices) {
            fv.faces.push(newFace);
          }

          newMesh.faces.push(newFace);
        }
      }

      // Step 5: Create edges for new mesh
      for (const face of newMesh.faces) {
        const n = face.vertices.length;
        for (let i = 0; i < n; i++) {
          const v0 = face.vertices[i];
          const v1 = face.vertices[(i + 1) % n];
          const key = SubdivEdge.makeKey(v0.index, v1.index);

          let edge = newMesh.edgeMap.get(key);
          if (!edge) {
            edge = new SubdivEdge(v0, v1);
            edge.index = newMesh.edges.length;
            newMesh.edges.push(edge);
            newMesh.edgeMap.set(key, edge);
            v0.edges.push(edge);
            v1.edges.push(edge);
          }

          edge.faces.push(face);
          face.edges.push(edge);
        }
      }

      // Update boundary status
      for (const edge of newMesh.edges) {
        if (edge.isBoundary()) {
          edge.v0.isBoundary = true;
          edge.v1.isBoundary = true;
        }
      }

      return newMesh;
    }

    /**
     * Subdivide multiple levels
     */
    subdivideN(mesh, levels) {
      let currentMesh = mesh;
      for (let i = 0; i < levels; i++) {
        currentMesh = this.subdivide(currentMesh);
      }
      return currentMesh;
    }
  }

  /**
   * Loop Subdivision Algorithm (for triangle meshes)
   */
  class LoopSubdivision {
    constructor(options = {}) {
      this.preserveBoundary = options.preserveBoundary !== false;
    }

    /**
     * Subdivide a triangle mesh one level
     */
    subdivide(mesh) {
      const newMesh = new SubdivisionMesh();
      const vertexMapping = new Map();
      const edgePointMapping = new Map();

      // Step 1: Compute edge points
      for (const edge of mesh.edges) {
        let edgePoint;

        if (edge.isBoundary()) {
          // Boundary: midpoint
          edgePoint = edge.getMidpoint();
        } else {
          // Interior: 3/8 * (v0 + v1) + 1/8 * (v2 + v3)
          // where v2, v3 are opposite vertices in adjacent triangles
          const oppositeVertices = [];
          for (const face of edge.faces) {
            for (const v of face.vertices) {
              if (v !== edge.v0 && v !== edge.v1) {
                oppositeVertices.push(v);
                break;
              }
            }
          }

          if (oppositeVertices.length === 2) {
            const v0v1 = edge.v0.add(edge.v1).scale(3 / 8);
            const opposite = oppositeVertices[0].add(oppositeVertices[1]).scale(1 / 8);
            edgePoint = v0v1.add(opposite);
          } else {
            edgePoint = edge.getMidpoint();
          }
        }

        edgePoint.index = newMesh.vertices.length;
        newMesh.vertices.push(edgePoint);
        edgePointMapping.set(edge, edgePoint);
      }

      // Step 2: Compute new positions for original vertices
      for (const vertex of mesh.vertices) {
        let newVertex;
        const n = vertex.edges.length;

        if (vertex.isBoundary && this.preserveBoundary) {
          // Boundary vertex
          const boundaryEdges = vertex.edges.filter(e => e.isBoundary());
          if (boundaryEdges.length === 2) {
            const v1 = boundaryEdges[0].getOtherVertex(vertex);
            const v2 = boundaryEdges[1].getOtherVertex(vertex);
            newVertex = v1.add(v2).scale(1 / 8).add(vertex.scale(3 / 4));
          } else {
            newVertex = vertex.clone();
          }
        } else {
          // Interior vertex
          // beta = 1/n * (5/8 - (3/8 + 1/4 * cos(2*pi/n))^2)
          const beta = this.computeLoopBeta(n);
          
          let neighborSum = new SubdivVertex();
          for (const edge of vertex.edges) {
            neighborSum = neighborSum.add(edge.getOtherVertex(vertex));
          }

          newVertex = vertex.scale(1 - n * beta).add(neighborSum.scale(beta));
        }

        newVertex.index = newMesh.vertices.length;
        newMesh.vertices.push(newVertex);
        vertexMapping.set(vertex, newVertex);
      }

      // Step 3: Create new triangular faces
      for (const face of mesh.faces) {
        if (face.vertices.length !== 3) continue;

        const [v0, v1, v2] = face.vertices;
        const e01 = face.edges.find(e => e.containsVertex(v0) && e.containsVertex(v1));
        const e12 = face.edges.find(e => e.containsVertex(v1) && e.containsVertex(v2));
        const e20 = face.edges.find(e => e.containsVertex(v2) && e.containsVertex(v0));

        if (!e01 || !e12 || !e20) continue;

        const ep01 = edgePointMapping.get(e01);
        const ep12 = edgePointMapping.get(e12);
        const ep20 = edgePointMapping.get(e20);
        const nv0 = vertexMapping.get(v0);
        const nv1 = vertexMapping.get(v1);
        const nv2 = vertexMapping.get(v2);

        // Create 4 new triangles
        const faces = [
          new SubdivFace([nv0, ep01, ep20]),
          new SubdivFace([ep01, nv1, ep12]),
          new SubdivFace([ep20, ep12, nv2]),
          new SubdivFace([ep01, ep12, ep20])
        ];

        for (const newFace of faces) {
          newFace.index = newMesh.faces.length;
          for (const fv of newFace.vertices) {
            fv.faces.push(newFace);
          }
          newMesh.faces.push(newFace);
        }
      }

      // Build edges
      for (const face of newMesh.faces) {
        const n = face.vertices.length;
        for (let i = 0; i < n; i++) {
          const v0 = face.vertices[i];
          const v1 = face.vertices[(i + 1) % n];
          const key = SubdivEdge.makeKey(v0.index, v1.index);

          let edge = newMesh.edgeMap.get(key);
          if (!edge) {
            edge = new SubdivEdge(v0, v1);
            edge.index = newMesh.edges.length;
            newMesh.edges.push(edge);
            newMesh.edgeMap.set(key, edge);
            v0.edges.push(edge);
            v1.edges.push(edge);
          }

          edge.faces.push(face);
          face.edges.push(edge);
        }
      }

      // Update boundary status
      for (const edge of newMesh.edges) {
        if (edge.isBoundary()) {
          edge.v0.isBoundary = true;
          edge.v1.isBoundary = true;
        }
      }

      return newMesh;
    }

    computeLoopBeta(n) {
      if (n === 3) return 3 / 16;
      const center = 3 / 8 + Math.cos(2 * Math.PI / n) / 4;
      return (5 / 8 - center * center) / n;
    }

    subdivideN(mesh, levels) {
      let currentMesh = mesh;
      for (let i = 0; i < levels; i++) {
        currentMesh = this.subdivide(currentMesh);
      }
      return currentMesh;
    }
  }

  /**
   * Doo-Sabin Subdivision Algorithm
   */
  class DooSabinSubdivision {
    subdivide(mesh) {
      const newMesh = new SubdivisionMesh();
      const faceVertexMapping = new Map(); // face -> vertex -> new vertex

      // Step 1: Create new vertices for each corner of each face
      for (const face of mesh.faces) {
        const n = face.vertices.length;
        const centroid = face.getCentroid();
        const vertexMap = new Map();

        for (let i = 0; i < n; i++) {
          const v = face.vertices[i];
          const vPrev = face.vertices[(i + n - 1) % n];
          const vNext = face.vertices[(i + 1) % n];

          // Doo-Sabin corner vertex:
          // For quads: (9v + 3(vPrev + vNext) + centroid) / 16
          // General: weighted combination
          let newVertex;
          if (n === 4) {
            newVertex = v.scale(9 / 16)
              .add(vPrev.scale(3 / 16))
              .add(vNext.scale(3 / 16))
              .add(centroid.scale(1 / 16));
          } else {
            // General n-gon weights
            const alpha = (n + 5) / (4 * n);
            const beta = (3 + 2 * Math.cos(2 * Math.PI / n)) / (4 * n);
            
            let sum = v.scale(alpha);
            for (let j = 1; j < n; j++) {
              const weight = (3 + 2 * Math.cos(2 * Math.PI * j / n)) / (4 * n);
              sum = sum.add(face.vertices[(i + j) % n].scale(weight));
            }
            newVertex = sum;
          }

          newVertex.index = newMesh.vertices.length;
          newMesh.vertices.push(newVertex);
          vertexMap.set(v, newVertex);
        }

        faceVertexMapping.set(face, vertexMap);
      }

      // Step 2: Create new faces
      // F-faces: for each original face
      for (const face of mesh.faces) {
        const vertexMap = faceVertexMapping.get(face);
        const newVertices = face.vertices.map(v => vertexMap.get(v));
        const newFace = new SubdivFace(newVertices);
        newFace.index = newMesh.faces.length;
        
        for (const fv of newFace.vertices) {
          fv.faces.push(newFace);
        }
        newMesh.faces.push(newFace);
      }

      // E-faces: for each edge
      for (const edge of mesh.edges) {
        if (edge.faces.length < 2) continue;

        const face1 = edge.faces[0];
        const face2 = edge.faces[1];
        const vm1 = faceVertexMapping.get(face1);
        const vm2 = faceVertexMapping.get(face2);

        const newVertices = [
          vm1.get(edge.v0),
          vm1.get(edge.v1),
          vm2.get(edge.v1),
          vm2.get(edge.v0)
        ];

        const newFace = new SubdivFace(newVertices);
        newFace.index = newMesh.faces.length;
        
        for (const fv of newFace.vertices) {
          fv.faces.push(newFace);
        }
        newMesh.faces.push(newFace);
      }

      // V-faces: for each original vertex (except boundary)
      for (const vertex of mesh.vertices) {
        if (vertex.isBoundary) continue;

        const newVertices = [];
        // Collect new vertices from all adjacent faces in order
        const orderedFaces = this.getOrderedFaces(vertex);
        
        for (const face of orderedFaces) {
          const vertexMap = faceVertexMapping.get(face);
          if (vertexMap) {
            newVertices.push(vertexMap.get(vertex));
          }
        }

        if (newVertices.length >= 3) {
          const newFace = new SubdivFace(newVertices);
          newFace.index = newMesh.faces.length;
          
          for (const fv of newFace.vertices) {
            fv.faces.push(newFace);
          }
          newMesh.faces.push(newFace);
        }
      }

      // Build edges
      for (const face of newMesh.faces) {
        const n = face.vertices.length;
        for (let i = 0; i < n; i++) {
          const v0 = face.vertices[i];
          const v1 = face.vertices[(i + 1) % n];
          const key = SubdivEdge.makeKey(v0.index, v1.index);

          let edge = newMesh.edgeMap.get(key);
          if (!edge) {
            edge = new SubdivEdge(v0, v1);
            edge.index = newMesh.edges.length;
            newMesh.edges.push(edge);
            newMesh.edgeMap.set(key, edge);
            v0.edges.push(edge);
            v1.edges.push(edge);
          }

          edge.faces.push(face);
          face.edges.push(edge);
        }
      }

      return newMesh;
    }

    getOrderedFaces(vertex) {
      if (vertex.faces.length === 0) return [];
      
      const ordered = [vertex.faces[0]];
      const remaining = new Set(vertex.faces.slice(1));
      
      while (remaining.size > 0) {
        const lastFace = ordered[ordered.length - 1];
        let foundNext = false;
        
        for (const face of remaining) {
          // Check if faces share an edge at this vertex
          const sharedEdge = vertex.edges.find(e => 
            e.faces.includes(lastFace) && e.faces.includes(face)
          );
          
          if (sharedEdge) {
            ordered.push(face);
            remaining.delete(face);
            foundNext = true;
            break;
          }
        }
        
        if (!foundNext) {
          // Add remaining faces in arbitrary order
          for (const face of remaining) {
            ordered.push(face);
          }
          break;
        }
      }
      
      return ordered;
    }

    subdivideN(mesh, levels) {
      let currentMesh = mesh;
      for (let i = 0; i < levels; i++) {
        currentMesh = this.subdivide(currentMesh);
      }
      return currentMesh;
    }
  }

  /**
   * High-level API for subdivision
   */
  function subdivideMesh(vertices, faces, levels = 1, options = {}) {
    const { algorithm = 'catmull-clark' } = options;

    // Create mesh
    const mesh = SubdivisionMesh.fromArrays(vertices, faces);

    // Select algorithm
    let subdivider;
    switch (algorithm.toLowerCase()) {
      case 'loop':
        subdivider = new LoopSubdivision(options);
        break;
      case 'doo-sabin':
      case 'doosabin':
        subdivider = new DooSabinSubdivision(options);
        break;
      case 'catmull-clark':
      case 'catmullclark':
      default:
        subdivider = new CatmullClarkSubdivision(options);
    }

    // Subdivide
    const subdividedMesh = subdivider.subdivideN(mesh, levels);

    // Convert to arrays
    return subdividedMesh.toArrays();
  }

  /**
   * Subdivide and convert to triangles for rendering
   */
  function subdivideMeshToTriangles(vertices, faces, levels = 1, options = {}) {
    const { algorithm = 'catmull-clark' } = options;

    const mesh = SubdivisionMesh.fromArrays(vertices, faces);

    let subdivider;
    switch (algorithm.toLowerCase()) {
      case 'loop':
        subdivider = new LoopSubdivision(options);
        break;
      case 'doo-sabin':
        subdivider = new DooSabinSubdivision(options);
        break;
      default:
        subdivider = new CatmullClarkSubdivision(options);
    }

    const subdividedMesh = subdivider.subdivideN(mesh, levels);
    return subdividedMesh.toTriangles();
  }

  /**
   * Compute smooth normals for subdivided mesh
   */
  function computeSmoothNormals(vertices, triangles) {
    const normals = vertices.map(() => new SubdivVertex());

    // Accumulate face normals at each vertex
    for (const [i0, i1, i2] of triangles) {
      const v0 = SubdivVertex.fromArray(vertices[i0]);
      const v1 = SubdivVertex.fromArray(vertices[i1]);
      const v2 = SubdivVertex.fromArray(vertices[i2]);

      const e1 = v1.subtract(v0);
      const e2 = v2.subtract(v0);
      const faceNormal = e1.cross(e2);

      normals[i0] = normals[i0].add(faceNormal);
      normals[i1] = normals[i1].add(faceNormal);
      normals[i2] = normals[i2].add(faceNormal);
    }

    // Normalize
    return normals.map(n => n.normalize().toArray());
  }

  // Export
  namespace.SubdivisionMesh = SubdivisionMesh;
  namespace.SubdivVertex = SubdivVertex;
  namespace.SubdivEdge = SubdivEdge;
  namespace.SubdivFace = SubdivFace;
  namespace.CatmullClarkSubdivision = CatmullClarkSubdivision;
  namespace.LoopSubdivision = LoopSubdivision;
  namespace.DooSabinSubdivision = DooSabinSubdivision;
  namespace.subdivideMesh = subdivideMesh;
  namespace.subdivideMeshToTriangles = subdivideMeshToTriangles;
  namespace.computeSmoothNormals = computeSmoothNormals;

  return namespace;
}));
