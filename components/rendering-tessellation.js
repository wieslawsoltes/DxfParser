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

  function vectorLength(vector) {
    if (!vector || typeof vector !== 'object') {
      return 0;
    }
    const x = Number.isFinite(vector.x) ? vector.x : 0;
    const y = Number.isFinite(vector.y) ? vector.y : 0;
    const z = Number.isFinite(vector.z) ? vector.z : 0;
    return Math.hypot(x, y, z);
  }

  function normalizeVector(vector, fallback) {
    const length = vectorLength(vector);
    if (length < 1e-9) {
      if (fallback) {
        return { x: fallback.x || 0, y: fallback.y || 0, z: fallback.z || 0 };
      }
      return { x: 0, y: 0, z: 0 };
    }
    return {
      x: (Number.isFinite(vector.x) ? vector.x : 0) / length,
      y: (Number.isFinite(vector.y) ? vector.y : 0) / length,
      z: (Number.isFinite(vector.z) ? vector.z : 0) / length
    };
  }

  function triangulateFan(points) {
    if (!Array.isArray(points) || points.length < 3) {
      return [];
    }
    const triangles = [];
    const base = points[0];
    for (let i = 1; i < points.length - 1; i += 1) {
      const p1 = points[i];
      const p2 = points[i + 1];
      triangles.push([base, p1, p2]);
    }
    return triangles;
  }

  function buildBoundingBoxTriangles(outline) {
    if (!outline || outline.length < 4) {
      return [];
    }
    return triangulateFan(outline.slice(0, 4));
  }

  function polygonArea2D(points) {
    if (!Array.isArray(points) || points.length < 3) {
      return 0;
    }
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const x1 = Number.isFinite(p1.x) ? p1.x : 0;
      const y1 = Number.isFinite(p1.y) ? p1.y : 0;
      const x2 = Number.isFinite(p2.x) ? p2.x : 0;
      const y2 = Number.isFinite(p2.y) ? p2.y : 0;
      area += (x1 * y2) - (x2 * y1);
    }
    return area * 0.5;
  }

  function pointInTriangle2D(point, a, b, c) {
    const px = Number.isFinite(point.x) ? point.x : 0;
    const py = Number.isFinite(point.y) ? point.y : 0;
    const ax = Number.isFinite(a.x) ? a.x : 0;
    const ay = Number.isFinite(a.y) ? a.y : 0;
    const bx = Number.isFinite(b.x) ? b.x : 0;
    const by = Number.isFinite(b.y) ? b.y : 0;
    const cx = Number.isFinite(c.x) ? c.x : 0;
    const cy = Number.isFinite(c.y) ? c.y : 0;

    const v0x = cx - ax;
    const v0y = cy - ay;
    const v1x = bx - ax;
    const v1y = by - ay;
    const v2x = px - ax;
    const v2y = py - ay;

    const dot00 = v0x * v0x + v0y * v0y;
    const dot01 = v0x * v1x + v0y * v1y;
    const dot02 = v0x * v2x + v0y * v2y;
    const dot11 = v1x * v1x + v1y * v1y;
    const dot12 = v1x * v2x + v1y * v2y;

    const denom = (dot00 * dot11) - (dot01 * dot01);
    if (Math.abs(denom) < 1e-12) {
      return false;
    }
    const invDenom = 1 / denom;
    const u = ((dot11 * dot02) - (dot01 * dot12)) * invDenom;
    const v = ((dot00 * dot12) - (dot01 * dot02)) * invDenom;
    return u >= -1e-9 && v >= -1e-9 && (u + v) <= 1 + 1e-9;
  }

  function triangulatePolygon2D(points) {
    if (!Array.isArray(points) || points.length < 3) {
      return [];
    }
    const area = polygonArea2D(points);
    if (Math.abs(area) < 1e-12) {
      return [];
    }
    const orientation = area > 0 ? 1 : -1;
    const vertices = points.map((pt) => ({
      x: Number.isFinite(pt.x) ? pt.x : 0,
      y: Number.isFinite(pt.y) ? pt.y : 0
    }));
    const indices = vertices.map((_, idx) => idx);
    const triangles = [];
    let guard = 0;
    const maxIterations = indices.length * indices.length;

    while (indices.length > 2 && guard < maxIterations) {
      let earFound = false;
      for (let i = 0; i < indices.length; i += 1) {
        const prevIdx = indices[(i - 1 + indices.length) % indices.length];
        const currIdx = indices[i];
        const nextIdx = indices[(i + 1) % indices.length];
        const prev = vertices[prevIdx];
        const curr = vertices[currIdx];
        const next = vertices[nextIdx];

        const cross = ((curr.x - prev.x) * (next.y - prev.y)) - ((curr.y - prev.y) * (next.x - prev.x));
        if (orientation > 0 ? cross <= 1e-9 : cross >= -1e-9) {
          continue;
        }

        let hasPointInside = false;
        for (let j = 0; j < indices.length; j += 1) {
          const testIndex = indices[j];
          if (testIndex === prevIdx || testIndex === currIdx || testIndex === nextIdx) {
            continue;
          }
          if (pointInTriangle2D(vertices[testIndex], prev, curr, next)) {
            hasPointInside = true;
            break;
          }
        }
        if (hasPointInside) {
          continue;
        }

        triangles.push([prev, curr, next]);
        indices.splice(i, 1);
        earFound = true;
        break;
      }
      if (!earFound) {
        break;
      }
      guard += 1;
    }

    return triangles;
  }

  // Earcut triangulation (https://github.com/mapbox/earcut) - MIT License
  function earcut(data, holeIndices, dim) {
    dim = dim || 2;
    const hasHoles = holeIndices && holeIndices.length;
    const outerLen = hasHoles ? holeIndices[0] * dim : data.length;

    let outerNode = linkedList(data, 0, outerLen, dim, true);
    if (!outerNode) {
      return [];
    }

    const triangles = [];
    let minX;
    let minY;
    let maxX;
    let maxY;
    let x;
    let y;
    let size;

    if (hasHoles) {
      outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
    }

    if (data.length > 80 * dim) {
      minX = maxX = data[0];
      minY = maxY = data[1];

      for (let i = dim; i < outerLen; i += dim) {
        x = data[i];
        y = data[i + 1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }

      size = Math.max(maxX - minX, maxY - minY);
    }

    earcutLinked(outerNode, triangles, dim, minX, minY, size);

    return triangles;
  }

  function linkedList(data, start, end, dim, clockwise) {
    let last = null;

    if (clockwise === (signedArea(data, start, end, dim) > 0)) {
      for (let i = start; i < end; i += dim) {
        last = insertNode(i, data[i], data[i + 1], last);
      }
    } else {
      for (let i = end - dim; i >= start; i -= dim) {
        last = insertNode(i, data[i], data[i + 1], last);
      }
    }

    if (last && equals(last, last.next)) {
      removeNode(last);
      last = last.next;
    }

    return last;
  }

  function filterPoints(start, end = null) {
    if (!start) {
      return start;
    }
    if (!end) {
      end = start;
    }
    let node = start;
    let again;
    do {
      again = false;
      if (!node.steiner && (equals(node, node.next) || area(node.prev, node, node.next) === 0)) {
        removeNode(node);
        node = end = node.prev;
        if (node === node.next) {
          return null;
        }
        again = true;
      } else {
        node = node.next;
      }
    } while (again || node !== end);
    return end;
  }

  function earcutLinked(ear, triangles, dim, minX, minY, size, pass = 0) {
    if (!ear) {
      return;
    }

    if (!pass && size) {
      indexCurve(ear, minX, minY, size);
    }

    let stop = ear;
    let prev;
    let next;

    while (ear.prev !== ear.next) {
      prev = ear.prev;
      next = ear.next;

      if (size ? isEarHashed(ear, minX, minY, size) : isEar(ear)) {
        triangles.push(prev.i / dim);
        triangles.push(ear.i / dim);
        triangles.push(next.i / dim);

        removeNode(ear);

        ear = next.next;
        stop = next.next;

        continue;
      }

      ear = next;

      if (ear === stop) {
        if (!pass) {
          earcutLinked(filterPoints(ear), triangles, dim, minX, minY, size, 1);
        } else if (pass === 1) {
          ear = cureLocalIntersections(filterPoints(ear), triangles, dim);
          earcutLinked(ear, triangles, dim, minX, minY, size, 2);
        } else if (pass === 2) {
          splitEarcut(ear, triangles, dim, minX, minY, size);
        }
        break;
      }
    }
  }

  function isEar(ear) {
    const a = ear.prev;
    const b = ear;
    const c = ear.next;

    if (area(a, b, c) >= 0) {
      return false;
    }

    let p = ear.next.next;

    while (p !== ear.prev) {
      if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && area(p.prev, p, p.next) >= 0) {
        return false;
      }
      p = p.next;
    }

    return true;
  }

  function isEarHashed(ear, minX, minY, size) {
    const a = ear.prev;
    const b = ear;
    const c = ear.next;

    if (area(a, b, c) >= 0) {
      return false;
    }

    const minTX = Math.min(a.x, b.x, c.x);
    const minTY = Math.min(a.y, b.y, c.y);
    const maxTX = Math.max(a.x, b.x, c.x);
    const maxTY = Math.max(a.y, b.y, c.y);

    const minZ = zOrder(minTX, minTY, minX, minY, size);
    const maxZ = zOrder(maxTX, maxTY, minX, minY, size);

    let node = ear.prevZ;
    let prevZ;
    let nextZ;

    while (node && node.z >= minZ && node !== ear) {
      if (node.x >= minTX && node.y >= minTY && node.x <= maxTX && node.y <= maxTY &&
        node !== a && node !== c &&
        pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, node.x, node.y) &&
        area(node.prev, node, node.next) >= 0) {
        return false;
      }
      node = node.prevZ;
    }

    node = ear.nextZ;

    while (node && node.z <= maxZ && node !== ear) {
      if (node.x >= minTX && node.y >= minTY && node.x <= maxTX && node.y <= maxTY &&
        node !== a && node !== c &&
        pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, node.x, node.y) &&
        area(node.prev, node, node.next) >= 0) {
        return false;
      }
      node = node.nextZ;
    }

    return true;
  }

  function cureLocalIntersections(start, triangles, dim) {
    let node = start;
    do {
      const a = node.prev;
      const b = node.next.next;

      if (!equals(a, b) &&
        intersects(a, node, node.next, b) &&
        locallyInside(a, b) &&
        locallyInside(b, a)) {
        triangles.push(a.i / dim);
        triangles.push(node.i / dim);
        triangles.push(b.i / dim);

        removeNode(node);
        removeNode(node.next);

        node = start = b;
      }
      node = node.next;
    } while (node !== start);

    return filterPoints(node);
  }

  function splitEarcut(start, triangles, dim, minX, minY, size) {
    let node = start;
    do {
      let a = node.prev;
      let b = node.next.next;
      if (!equals(a, b) && intersects(a, node, node.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
        const splits = splitPolygon(node, b);
        node = splits[0];
        const splitNode = splits[1];
        filterPoints(node, node.next);
        filterPoints(splitNode, splitNode.next);
        earcutLinked(node, triangles, dim, minX, minY, size);
        earcutLinked(splitNode, triangles, dim, minX, minY, size);
        return;
      }
      node = node.next;
    } while (node !== start);
  }

  function eliminateHoles(data, holeIndices, outerNode, dim) {
    const queue = [];
    for (let i = 0, len = holeIndices.length; i < len; i += 1) {
      const start = holeIndices[i] * dim;
      const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
      const list = linkedList(data, start, end, dim, false);
      if (list) {
        queue.push(getLeftmost(list));
      }
    }
    queue.sort((a, b) => a.x - b.x);
    queue.forEach((hole) => {
      eliminateHole(hole, outerNode);
      outerNode = filterPoints(outerNode, outerNode.next);
    });
    return outerNode;
  }

  function eliminateHole(hole, outerNode) {
    outerNode = findHoleBridge(hole, outerNode);
    if (outerNode) {
      const b = splitPolygon(outerNode, hole);
      filterPoints(b[0], b[0].next);
    }
  }

  function findHoleBridge(hole, outerNode) {
    let p = outerNode;
    const hx = hole.x;
    const hy = hole.y;
    let qx = -Infinity;
    let m;

    do {
      if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
        const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
        if (x <= hx && x > qx) {
          qx = x;
          if (x === hx) {
            if (hy === p.y) {
              return p;
            }
            if (hy === p.next.y) {
              return p.next;
            }
          }
          m = p.x < p.next.x ? p : p.next;
        }
      }
      p = p.next;
    } while (p !== outerNode);

    if (!m) {
      return null;
    }

    const stop = m;
    let mx = m.x;
    let my = m.y;
    let tanMin = Infinity;
    let tan;

    p = m;
    do {
      if (hx >= p.x && p.x >= mx && hx !== p.x && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
        tan = Math.abs(hy - p.y) / (hx - p.x);
        if ((locallyInside(p, hole) && locallyInside(hole, p) && (tan < tanMin ||
            (tan === tanMin && p.x > m.x)))) {
          m = p;
          tanMin = tan;
        }
      }
      p = p.next;
    } while (p !== stop);

    return m;
  }

  function indexCurve(start, minX, minY, size) {
    let node = start;
    do {
      if (node.z === null) {
        node.z = zOrder(node.x, node.y, minX, minY, size);
      }
      node.prevZ = node.prev;
      node.nextZ = node.next;
      node = node.next;
    } while (node !== start);
    node.prevZ.nextZ = null;
    node.prevZ = null;
    sortLinked(node);
  }

  function sortLinked(list) {
    let inSize = 1;
    let numMerges;
    let p;
    let q;
    let pSize;
    let qSize;
    let e;

    do {
      p = list;
      list = null;
      let tail = null;
      numMerges = 0;

      while (p) {
        numMerges += 1;
        q = p;
        pSize = 0;
        for (let i = 0; i < inSize; i += 1) {
          pSize += 1;
          q = q.nextZ;
          if (!q) {
            break;
          }
        }
        qSize = inSize;

        while (pSize > 0 || (qSize > 0 && q)) {
          if (pSize === 0) {
            e = q;
            q = q.nextZ;
            qSize -= 1;
          } else if (qSize === 0 || !q) {
            e = p;
            p = p.nextZ;
            pSize -= 1;
          } else if (p.z <= q.z) {
            e = p;
            p = p.nextZ;
            pSize -= 1;
          } else {
            e = q;
            q = q.nextZ;
            qSize -= 1;
          }

          if (tail) {
            tail.nextZ = e;
          } else {
            list = e;
          }

          e.prevZ = tail;
          tail = e;
        }

        p = q;
      }

      tail.nextZ = null;
      inSize *= 2;
    } while (numMerges > 1);

    return list;
  }

  function signedArea(data, start, end, dim) {
    let sum = 0;
    for (let i = start, j = end - dim; i < end; i += dim) {
      sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
      j = i;
    }
    return sum;
  }

  function insertNode(i, x, y, last) {
    const node = {
      i,
      x,
      y,
      prev: null,
      next: null,
      z: null,
      prevZ: null,
      nextZ: null,
      steiner: false
    };

    if (!last) {
      node.prev = node;
      node.next = node;
    } else {
      node.next = last.next;
      node.prev = last;
      last.next.prev = node;
      last.next = node;
    }
    return node;
  }

  function removeNode(node) {
    node.next.prev = node.prev;
    node.prev.next = node.next;

    if (node.prevZ) {
      node.prevZ.nextZ = node.nextZ;
    }
    if (node.nextZ) {
      node.nextZ.prevZ = node.prevZ;
    }
  }

  function equals(p1, p2) {
    return p1.x === p2.x && p1.y === p2.y;
  }

  function area(p, q, r) {
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  }

  function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return ((cx - px) * (ay - py) - (ax - px) * (cy - py)) >= 0 &&
      ((ax - px) * (by - py) - (bx - px) * (ay - py)) >= 0 &&
      ((bx - px) * (cy - py) - (cx - px) * (by - py)) >= 0;
  }

  function getLeftmost(start) {
    let p = start;
    let leftmost = start;
    do {
      if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) {
        leftmost = p;
      }
      p = p.next;
    } while (p !== start);
    return leftmost;
  }

  function locallyInside(a, b) {
    return area(a.prev, a, a.next) < 0
      ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0
      : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
  }

  function intersects(p1, q1, p2, q2) {
    if ((equals(p1, q1) && equals(p2, q2)) || (equals(p1, q2) && equals(p2, q1))) {
      return true;
    }
    return (area(p1, q1, p2) > 0) !== (area(p1, q1, q2) > 0) &&
      (area(p2, q2, p1) > 0) !== (area(p2, q2, q1) > 0);
  }

  function splitPolygon(a, b) {
    const a2 = insertNode(a.i, a.x, a.y, a);
    const b2 = insertNode(b.i, b.x, b.y, b);

    const an = a.next;
    const bp = b.prev;

    a.next = b;
    b.prev = a;

    a2.next = an;
    an.prev = a2;

    b2.next = a2;
    a2.prev = b2;

    bp.next = b2;
    b2.prev = bp;

    return [a2, b2];
  }

  function zOrder(x, y, minX, minY, size) {
    x = 32767 * (x - minX) / size;
    y = 32767 * (y - minY) / size;

    x = (x | (x << 8)) & 0x00ff00ff;
    x = (x | (x << 4)) & 0x0f0f0f0f;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;

    y = (y | (y << 8)) & 0x00ff00ff;
    y = (y | (y << 4)) & 0x0f0f0f0f;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;

    return x | (y << 1);
  }

  class TessellationEngine {
    constructor() {}

    tessellateSolid(geometry) {
      if (!geometry) {
        return null;
      }

      // Try ACIS parsing first if acisData is available
      if (geometry.acisData && typeof geometry.acisData === 'string' && geometry.acisData.trim()) {
        const acisResult = this._tessellateACIS(geometry.acisData);
        if (acisResult && (acisResult.triangles.length > 0 || acisResult.outlines.length > 0)) {
          return acisResult;
        }
      }

      const collectLoops = () => {
        const loops = [];
        if (Array.isArray(geometry.outline2D) && geometry.outline2D.length) {
          const outline = geometry.outline2D;
          if (Array.isArray(outline[0])) {
            outline.forEach((loop) => {
              if (Array.isArray(loop) && loop.length >= 3) {
                loops.push(loop);
              }
            });
          } else if (outline.length >= 3) {
            loops.push(outline);
          }
        }
        if (Array.isArray(geometry.loops) && geometry.loops.length) {
          geometry.loops.forEach((loop) => {
            if (Array.isArray(loop) && loop.length >= 3) {
              loops.push(loop);
            }
          });
        }
        return loops;
      };

      const rawLoops = collectLoops();
      const sanitizeLoop = (loop) => {
        const sanitized = [];
        loop.forEach((pt) => {
          const x = Number.isFinite(pt.x) ? pt.x : 0;
          const y = Number.isFinite(pt.y) ? pt.y : 0;
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
          }
          if (sanitized.length) {
            const last = sanitized[sanitized.length - 1];
            if (Math.hypot(x - last.x, y - last.y) < 1e-9) {
              return;
            }
          }
          sanitized.push({ x, y });
        });
        if (sanitized.length >= 3) {
          const first = sanitized[0];
          const last = sanitized[sanitized.length - 1];
          if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-9) {
            sanitized.pop();
          }
        }
        return sanitized.length >= 3 ? sanitized : null;
      };

      const sanitizedLoops = rawLoops
        .map(sanitizeLoop)
        .filter(Boolean);

      let outlineLoops = sanitizedLoops;

      if ((!outlineLoops || !outlineLoops.length) && geometry.boundingBox) {
        const box = geometry.boundingBox;
        if ([box.minX, box.minY, box.maxX, box.maxY].every((v) => Number.isFinite(v))) {
          outlineLoops = [[
            { x: box.minX, y: box.minY },
            { x: box.maxX, y: box.minY },
            { x: box.maxX, y: box.maxY },
            { x: box.minX, y: box.maxY }
          ]];
        }
      }

      if (!outlineLoops || !outlineLoops.length) {
        return null;
      }

      const loopsProcessed = outlineLoops.map((loop, index) => {
        const area = polygonArea2D(loop);
        const shouldBePositive = index === 0;
        const normalized = area === 0
          ? loop.slice()
          : (shouldBePositive ? (area > 0 ? loop.slice() : loop.slice().reverse())
            : (area < 0 ? loop.slice() : loop.slice().reverse()));
        const closed = this._ensureClosedOutline(normalized);
        return {
          open: normalized,
          closed,
          area: polygonArea2D(normalized)
        };
      }).filter((entry) => entry.open.length >= 3);

      if (!loopsProcessed.length) {
        return null;
      }

      const flattened = [];
      const holeIndices = [];
      const pointRefs = [];
      loopsProcessed.forEach((entry, loopIndex) => {
        if (loopIndex > 0) {
          holeIndices.push(flattened.length / 2);
        }
        entry.open.forEach((pt) => {
          flattened.push(pt.x, pt.y);
          pointRefs.push(pt);
        });
      });

      let triangles = [];
      if (flattened.length >= 6) {
        const indices = earcut(flattened, holeIndices.length ? holeIndices : null, 2);
        if (indices && indices.length >= 3) {
          for (let i = 0; i < indices.length; i += 3) {
            const a = pointRefs[indices[i]];
            const b = pointRefs[indices[i + 1]];
            const c = pointRefs[indices[i + 2]];
            if (a && b && c) {
              triangles.push([a, b, c]);
            }
          }
        }
      }

      if (!triangles.length) {
        triangles = triangulateFan(loopsProcessed[0].closed);
      }

      const outlines = loopsProcessed.map((entry) => entry.closed);

      return {
        triangles,
        outlines
      };
    }

    tessellateMesh(geometry) {
      if (!geometry || !Array.isArray(geometry.vertices) || geometry.vertices.length === 0) {
        return null;
      }

      const vertices = geometry.vertices.map((vertex) => {
        const pos = vertex.position || vertex;
        return {
          x: Number.isFinite(pos.x) ? pos.x : 0,
          y: Number.isFinite(pos.y) ? pos.y : 0,
          z: Number.isFinite(pos.z) ? pos.z : 0
        };
      });

      // Check for subdivision level and apply Catmull-Clark if available
      const subdivisionLevel = geometry.subdivisionLevel || 0;
      if (subdivisionLevel > 0 && namespace.SubdivisionMesh && namespace.CatmullClarkSubdivision) {
        return this._tessellateSubdividedMesh(vertices, geometry.faces, subdivisionLevel);
      }

      const triangleList = [];
      const outlines = [];

      if (Array.isArray(geometry.faces) && geometry.faces.length) {
        geometry.faces.forEach((face) => {
          const indices = Array.isArray(face.indices) ? face.indices : [];
          if (indices.length < 3) {
            return;
          }
          const facePoints = indices.map((idx) => {
            const normalizedIndex = Math.abs(idx) - 1;
            return vertices[normalizedIndex] || null;
          }).filter(Boolean);
          if (facePoints.length < 3) {
            return;
          }
          const flattened = facePoints.map((pt) => ({ x: pt.x, y: pt.y }));
          const localTriangles = triangulateFan(flattened);
          triangleList.push(...localTriangles);
          outlines.push(this._ensureClosedOutline(flattened));
        });
      }

      if (!triangleList.length) {
        return null;
      }

      return {
        triangles: triangleList,
        outlines
      };
    }

    /**
     * Apply Catmull-Clark subdivision to a mesh and tessellate
     * @param {Array} vertices - Array of vertex positions {x, y, z}
     * @param {Array} faces - Array of face definitions with indices
     * @param {number} level - Subdivision level (1-4)
     * @returns {Object|null} Tessellation result with triangles and outlines
     */
    _tessellateSubdividedMesh(vertices, faces, level) {
      try {
        // Create SubdivisionMesh from geometry
        const subdivMesh = new namespace.SubdivisionMesh();
        
        // Add vertices
        vertices.forEach(v => {
          subdivMesh.addVertex(v.x, v.y, v.z);
        });
        
        // Add faces (convert from 1-based to 0-based indices)
        if (Array.isArray(faces)) {
          faces.forEach(face => {
            const indices = Array.isArray(face.indices) ? face.indices : [];
            if (indices.length >= 3) {
              // Convert to 0-based indices
              const zeroBasedIndices = indices.map(idx => Math.abs(idx) - 1);
              subdivMesh.addFace(zeroBasedIndices);
            }
          });
        }
        
        // Apply Catmull-Clark subdivision
        const subdivided = namespace.CatmullClarkSubdivision.subdivide(subdivMesh, Math.min(level, 4));
        
        // Extract triangles from subdivided mesh
        const triangleList = [];
        const outlines = [];
        
        subdivided.faces.forEach(face => {
          if (face.vertices.length >= 3) {
            const facePoints = face.vertices.map(v => ({
              x: v.position.x,
              y: v.position.y,
              z: v.position.z
            }));
            
            const flattened = facePoints.map(pt => ({ x: pt.x, y: pt.y }));
            const localTriangles = triangulateFan(flattened);
            triangleList.push(...localTriangles);
            outlines.push(this._ensureClosedOutline(flattened));
          }
        });
        
        if (triangleList.length > 0) {
          return {
            triangles: triangleList,
            outlines
          };
        }
      } catch (e) {
        console.warn('Catmull-Clark subdivision failed, falling back to base mesh:', e.message);
      }
      
      return null;
    }

    _ensureClosedOutline(points) {
      if (!Array.isArray(points) || points.length === 0) {
        return [];
      }
      const outline = points.map((pt) => ({
        x: Number.isFinite(pt.x) ? pt.x : 0,
        y: Number.isFinite(pt.y) ? pt.y : 0
      }));
      const first = outline[0];
      const last = outline[outline.length - 1];
      if (Math.abs(first.x - last.x) > 1e-6 || Math.abs(first.y - last.y) > 1e-6) {
        outline.push({ x: first.x, y: first.y });
      }
      return outline;
    }

    /**
     * Parse ACIS SAT data and tessellate the geometry
     * @param {string} acisData - The ACIS SAT data string
     * @returns {Object|null} Tessellation result with triangles and outlines
     */
    _tessellateACIS(acisData) {
      try {
        // Use the ACIS parser if available
        if (namespace.parseACIS && namespace.acisToRenderGeometry) {
          const parsed = namespace.parseACIS(acisData);
          if (parsed) {
            const renderData = namespace.acisToRenderGeometry(parsed);
            if (renderData) {
              return {
                triangles: renderData.triangles || [],
                outlines: renderData.outlines || []
              };
            }
          }
        }
      } catch (e) {
        // ACIS parsing failed, fall back to outline-based tessellation
      }
      return null;
    }

    /**
     * Tessellate a procedural surface entity (EXTRUDEDSURFACE, REVOLVEDSURFACE, etc.)
     * @param {Object} geometry - The procedural surface geometry data
     * @returns {Object|null} Tessellation result with triangles and outlines
     */
    tessellateProceduralSurface(geometry) {
      if (!geometry || !geometry.surfaceType) {
        return null;
      }

      try {
        // First try ACIS data if available
        if (geometry.acisData) {
          const acisResult = this._tessellateACIS(geometry.acisData);
          if (acisResult && acisResult.triangles && acisResult.triangles.length > 0) {
            return acisResult;
          }
        }

        // Use ProceduralSurfaceFactory if available
        if (namespace.ProceduralSurfaceFactory) {
          const factory = new namespace.ProceduralSurfaceFactory({
            uSegments: 16,
            vSegments: 16
          });

          const result = factory.tessellate(geometry);
          if (result && result.vertices && result.faces) {
            // Convert to our format
            const triangles = [];
            const outlines = [];

            result.faces.forEach(face => {
              if (face.length >= 3) {
                const facePoints = face.map(idx => {
                  const v = result.vertices[idx];
                  return v ? { x: v.x, y: v.y, z: v.z } : null;
                }).filter(Boolean);

                if (facePoints.length >= 3) {
                  const flattened = facePoints.map(pt => ({ x: pt.x, y: pt.y }));
                  const localTriangles = triangulateFan(flattened);
                  triangles.push(...localTriangles);
                  outlines.push(this._ensureClosedOutline(flattened));
                }
              }
            });

            if (triangles.length > 0) {
              return { triangles, outlines };
            }
          }
        }
      } catch (e) {
        console.warn('Procedural surface tessellation failed:', e.message);
      }

      return null;
    }
  }

  namespace.TessellationEngine = TessellationEngine;

  TessellationEngine.prototype.tessellatePolysolid = function tessellatePolysolid(geometry) {
    if (!geometry || !Array.isArray(geometry.points) || geometry.points.length < 2) {
      return null;
    }
    const EPS = 1e-6;
    const MIN_WIDTH = 1e-3;

    const rawPoints = geometry.points.map((pt) => ({
      x: Number.isFinite(pt.x) ? pt.x : 0,
      y: Number.isFinite(pt.y) ? pt.y : 0
    }));

    const sanitized = [];
    rawPoints.forEach((pt) => {
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
        return;
      }
      if (sanitized.length) {
        const last = sanitized[sanitized.length - 1];
        if (Math.hypot(pt.x - last.x, pt.y - last.y) < EPS) {
          return;
        }
      }
      sanitized.push({ x: pt.x, y: pt.y });
    });

    if (sanitized.length < 2) {
      return null;
    }

    let isClosed = !!geometry.isClosed;
    if (sanitized.length >= 3) {
      const first = sanitized[0];
      const last = sanitized[sanitized.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) < EPS) {
        sanitized.pop();
        isClosed = true;
      }
    } else {
      isClosed = false;
    }

    const vertexCount = sanitized.length;
    if (vertexCount < 2) {
      return null;
    }

    const segments = [];
    const segmentByStart = new Array(vertexCount).fill(null);
    let totalLength = 0;
    for (let i = 0; i < vertexCount; i += 1) {
      let nextIndex = i + 1;
      if (nextIndex >= vertexCount) {
        if (!isClosed) {
          break;
        }
        nextIndex = 0;
      }
      const start = sanitized[i];
      const end = sanitized[nextIndex];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      if (length < EPS) {
        continue;
      }
      const dir = { x: dx / length, y: dy / length };
      const segment = {
        startIndex: i,
        endIndex: nextIndex,
        length,
        direction: dir
      };
      segments.push(segment);
      segmentByStart[i] = segment;
      totalLength += length;
    }

    if (!segments.length) {
      return null;
    }

    const cumulative = new Array(vertexCount).fill(0);
    let running = 0;
    for (let i = 0; i < vertexCount; i += 1) {
      cumulative[i] = running;
      const segment = segmentByStart[i];
      if (segment) {
        running += segment.length;
      }
    }

    const candidateWidths = [
      geometry.startWidth,
      geometry.defaultWidth,
      geometry.width,
      geometry.endWidth
    ];
    let fallbackWidth = 0;
    candidateWidths.forEach((value) => {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && Math.abs(numeric) > EPS && fallbackWidth === 0) {
        fallbackWidth = Math.abs(numeric);
      }
    });
    if (fallbackWidth <= 0) {
      fallbackWidth = 1;
    }
    const startWidthRaw = Number(geometry.startWidth);
    const endWidthRaw = Number(geometry.endWidth);
    const defaultWidthRaw = Number(geometry.defaultWidth);
    const startWidth = Number.isFinite(startWidthRaw) && Math.abs(startWidthRaw) > EPS
      ? Math.abs(startWidthRaw)
      : fallbackWidth;
    const endWidth = Number.isFinite(endWidthRaw) && Math.abs(endWidthRaw) > EPS
      ? Math.abs(endWidthRaw)
      : startWidth;
    const defaultWidth = Number.isFinite(defaultWidthRaw) && Math.abs(defaultWidthRaw) > EPS
      ? Math.abs(defaultWidthRaw)
      : fallbackWidth;

    const widths = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i += 1) {
      let widthValue;
      if (!isClosed) {
        if (totalLength > EPS) {
          const t = cumulative[i] / totalLength;
          widthValue = startWidth + (endWidth - startWidth) * Math.min(Math.max(t, 0), 1);
        } else {
          widthValue = startWidth;
        }
      } else {
        widthValue = defaultWidth;
      }
      widths[i] = Math.max(Math.abs(widthValue) || fallbackWidth, MIN_WIDTH);
    }
    if (!isClosed && vertexCount >= 2) {
      widths[vertexCount - 1] = Math.max(Math.abs(endWidth) || fallbackWidth, MIN_WIDTH);
      widths[0] = Math.max(Math.abs(startWidth) || fallbackWidth, MIN_WIDTH);
    }

    const computeDirection = (from, to) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len < EPS) {
        return null;
      }
      return { x: dx / len, y: dy / len };
    };

    const rotateLeft = (vec) => ({ x: -vec.y, y: vec.x });
    const rotateRight = (vec) => ({ x: vec.y, y: -vec.x });

    const computeOffsetPoint = (point, prevDirIn, nextDirIn, halfWidth, isLeft) => {
      const normalizeDir = (dir) => {
        if (!dir) {
          return null;
        }
        const len = Math.hypot(dir.x, dir.y);
        if (len < EPS) {
          return null;
        }
        return { x: dir.x / len, y: dir.y / len };
      };

      let prevDir = normalizeDir(prevDirIn);
      let nextDir = normalizeDir(nextDirIn);
      if (!prevDir && nextDir) {
        prevDir = { x: -nextDir.x, y: -nextDir.y };
      } else if (!nextDir && prevDir) {
        nextDir = { x: -prevDir.x, y: -prevDir.y };
      }
      if (!prevDir && !nextDir) {
        return { x: point.x, y: point.y };
      }

      const perpendicular = isLeft ? rotateLeft : rotateRight;

      if (!prevDir || !nextDir) {
        const dir = prevDir || nextDir || { x: 1, y: 0 };
        const normal = perpendicular(dir);
        return {
          x: point.x + normal.x * halfWidth,
          y: point.y + normal.y * halfWidth
        };
      }

      const normalPrev = perpendicular(prevDir);
      const normalNext = perpendicular(nextDir);
      const tangent = {
        x: normalPrev.x + normalNext.x,
        y: normalPrev.y + normalNext.y
      };
      const tangentLength = Math.hypot(tangent.x, tangent.y);
      if (tangentLength < EPS) {
        const normal = perpendicular(prevDir);
        return {
          x: point.x + normal.x * halfWidth,
          y: point.y + normal.y * halfWidth
        };
      }

      const miter = {
        x: tangent.x / tangentLength,
        y: tangent.y / tangentLength
      };
      let denom = (miter.x * normalNext.x) + (miter.y * normalNext.y);
      if (Math.abs(denom) < EPS) {
        const normal = perpendicular(prevDir);
        return {
          x: point.x + normal.x * halfWidth,
          y: point.y + normal.y * halfWidth
        };
      }
      let distance = halfWidth / denom;
      if (!Number.isFinite(distance)) {
        distance = halfWidth;
      }
      const maxDistance = halfWidth * 8;
      if (Math.abs(distance) > maxDistance) {
        distance = distance < 0 ? -maxDistance : maxDistance;
      }
      return {
        x: point.x + miter.x * distance,
        y: point.y + miter.y * distance
      };
    };

    const leftPoints = new Array(vertexCount);
    const rightPoints = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i += 1) {
      const point = sanitized[i];
      const widthValue = widths[i];
      const halfWidth = Math.max(widthValue / 2, MIN_WIDTH);
      const prevIndex = i === 0 ? (isClosed ? vertexCount - 1 : -1) : i - 1;
      const nextIndex = i === vertexCount - 1 ? (isClosed ? 0 : -1) : i + 1;
      const prevPoint = prevIndex >= 0 ? sanitized[prevIndex] : null;
      const nextPoint = nextIndex >= 0 ? sanitized[nextIndex] : null;
      const prevDir = prevPoint ? computeDirection(prevPoint, point) : null;
      const nextDir = nextPoint ? computeDirection(point, nextPoint) : null;
      leftPoints[i] = computeOffsetPoint(point, prevDir, nextDir, halfWidth, true);
      rightPoints[i] = computeOffsetPoint(point, prevDir, nextDir, halfWidth, false);
    }

    const outlineSequence = [];
    for (let i = 0; i < vertexCount; i += 1) {
      outlineSequence.push({ x: leftPoints[i].x, y: leftPoints[i].y });
    }
    for (let i = vertexCount - 1; i >= 0; i -= 1) {
      outlineSequence.push({ x: rightPoints[i].x, y: rightPoints[i].y });
    }

    const outlineClosed = this._ensureClosedOutline(outlineSequence);
    const outlineForTriangulation = outlineClosed.length > 1
      ? outlineClosed.slice(0, outlineClosed.length - 1)
      : outlineClosed.slice();

    let triangles = triangulatePolygon2D(outlineForTriangulation);

    if (!triangles.length) {
      triangles = [];
      const segmentCount = isClosed ? vertexCount : vertexCount - 1;
      for (let i = 0; i < segmentCount; i += 1) {
        const nextIndex = (i + 1) % vertexCount;
        const quad = [
          leftPoints[i],
          leftPoints[nextIndex],
          rightPoints[nextIndex],
          rightPoints[i]
        ];
        const area1 = ((quad[1].x - quad[0].x) * (quad[2].y - quad[0].y)) -
          ((quad[1].y - quad[0].y) * (quad[2].x - quad[0].x));
        if (Math.abs(area1) > EPS) {
          triangles.push([quad[0], quad[1], quad[2]]);
        }
        const area2 = ((quad[2].x - quad[0].x) * (quad[3].y - quad[0].y)) -
          ((quad[2].y - quad[0].y) * (quad[3].x - quad[0].x));
        if (Math.abs(area2) > EPS) {
          triangles.push([quad[0], quad[2], quad[3]]);
        }
      }
    }

    return {
      triangles,
      outlines: outlineClosed.length >= 3 ? [outlineClosed] : []
    };
  };

  return {
    TessellationEngine,
    triangulateFan
  };
}));
