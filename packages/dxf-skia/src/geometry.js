/* DxfSkia geometry. Row-major affine matrices and double-precision world coordinates.
 * No browser, native renderer, font, or third-party runtime dependencies. */
(function (root) {
    'use strict';
    const api = root.DxfSkia = root.DxfSkia || {};
    const TAU = 2 * Math.PI, EPS = 1e-12;
    const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
    const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
    const add = (a, b) => vec(a.x + b.x, a.y + b.y, (a.z || 0) + (b.z || 0));
    const sub = (a, b) => vec(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
    const mul = (a, n) => vec(a.x * n, a.y * n, (a.z || 0) * n);
    const dot = (a, b) => a.x * b.x + a.y * b.y + (a.z || 0) * (b.z || 0);
    const cross = (a, b) => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    const length = a => Math.hypot(a.x, a.y, a.z || 0);
    const normal = a => { const n = length(a); if (!(n > EPS))
        throw new RangeError('Zero length direction.'); return mul(a, 1 / n); };
    const distance = (a, b) => length(sub(a, b));
    const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
    const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z ?? 0);
    const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    function multiply(a, b) {
        const out = new Array(16).fill(0);
        for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++)
                for (let k = 0; k < 4; k++)
                    out[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
        return out;
    }
    const translation = p => [1, 0, 0, p.x, 0, 1, 0, p.y, 0, 0, 1, p.z || 0, 0, 0, 0, 1];
    const scaling = (x, y = x, z = 1) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
    const rotation = angle => { const c = Math.cos(angle), s = Math.sin(angle); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
    const transform = (m, p) => vec(m[0] * p.x + m[1] * p.y + m[2] * (p.z || 0) + m[3], m[4] * p.x + m[5] * p.y + m[6] * (p.z || 0) + m[7], m[8] * p.x + m[9] * p.y + m[10] * (p.z || 0) + m[11]);
    const direction = (m, p) => vec(m[0] * p.x + m[1] * p.y + m[2] * (p.z || 0), m[4] * p.x + m[5] * p.y + m[6] * (p.z || 0), m[8] * p.x + m[9] * p.y + m[10] * (p.z || 0));
    function inverse(m) {
        // Pivoted Gauss-Jordan, rather than a scale-sensitive determinant threshold.
        const a = Array.from({ length: 4 }, (_, r) => [...m.slice(r * 4, r * 4 + 4), ...identity().slice(r * 4, r * 4 + 4)]);
        for (let c = 0; c < 4; c++) {
            let pivot = c;
            for (let r = c + 1; r < 4; r++)
                if (Math.abs(a[r][c]) > Math.abs(a[pivot][c]))
                    pivot = r;
            if (!Number.isFinite(a[pivot][c]) || a[pivot][c] === 0)
                throw new RangeError('Singular transform.');
            [a[c], a[pivot]] = [a[pivot], a[c]];
            const d = a[c][c];
            for (let i = 0; i < 8; i++)
                a[c][i] /= d;
            for (let r = 0; r < 4; r++)
                if (r !== c) {
                    const factor = a[r][c];
                    for (let i = 0; i < 8; i++)
                        a[r][i] -= factor * a[c][i];
                }
        }
        return a.flatMap(row => row.slice(4));
    }
    function ocs(extrusion = vec(0, 0, 1)) {
        const n = normal(extrusion);
        const x = normal(Math.abs(n.x) < 1 / 64 && Math.abs(n.y) < 1 / 64 ? cross(vec(0, 1, 0), n) : cross(vec(0, 0, 1), n));
        const y = cross(n, x);
        return [x.x, y.x, n.x, 0, x.y, y.y, n.y, 0, x.z, y.z, n.z, 0, 0, 0, 0, 1];
    }
    function viewBasis(directionVector = vec(0, 0, 1), twist = 0) {
        const basis = ocs(directionVector), c = Math.cos(twist), s = Math.sin(twist);
        const x = vec(basis[0], basis[4], basis[8]), y = vec(basis[1], basis[5], basis[9]), n = normal(directionVector);
        return { x: add(mul(x, c), mul(y, s)), y: add(mul(x, -s), mul(y, c)), z: n };
    }
    const project = (p, basis) => vec(dot(p, basis.x), dot(p, basis.y), dot(p, basis.z));
    const emptyBounds = () => ({ minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity });
    const isEmpty = b => !b || !Number.isFinite(b.minX) || b.maxX < b.minX || b.maxY < b.minY;
    function extend(b, p) {
        if (!validPoint(p))
            return b;
        b.minX = Math.min(b.minX, p.x);
        b.maxX = Math.max(b.maxX, p.x);
        b.minY = Math.min(b.minY, p.y);
        b.maxY = Math.max(b.maxY, p.y);
        b.minZ = Math.min(b.minZ, p.z || 0);
        b.maxZ = Math.max(b.maxZ, p.z || 0);
        return b;
    }
    const bounds = points => points.reduce(extend, emptyBounds());
    function union(a, b) { if (isEmpty(b))
        return a; extend(a, vec(b.minX, b.minY, b.minZ)); extend(a, vec(b.maxX, b.maxY, b.maxZ)); return a; }
    const intersects = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
    const inBounds = (p, b, t = 0) => p.x >= b.minX - t && p.x <= b.maxX + t && p.y >= b.minY - t && p.y <= b.maxY + t;
    const center = b => vec(b.minX + (b.maxX - b.minX) / 2, b.minY + (b.maxY - b.minY) / 2, finite(b.minZ + (b.maxZ - b.minZ) / 2));
    function segmentDistance(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        const t = l2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
        const point = lerp(a, b, t);
        return { distance: Math.hypot(p.x - point.x, p.y - point.y), point, t };
    }
    function pointInPolygon(p, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const a = ring[i], b = ring[j];
            if (segmentDistance(p, a, b).distance < 1e-9)
                return true;
            if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)
                inside = !inside;
        }
        return inside;
    }
    const inLoops = (p, loops) => loops.reduce((inside, ring) => inside !== pointInPolygon(p, ring), false);
    function segmentIntersection(a, b, c, d) {
        const ax = b.x - a.x, ay = b.y - a.y, bx = d.x - c.x, by = d.y - c.y, det = ax * by - ay * bx;
        if (Math.abs(det) < EPS)
            return null;
        const t = ((c.x - a.x) * by - (c.y - a.y) * bx) / det, u = ((c.x - a.x) * ay - (c.y - a.y) * ax) / det;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? lerp(a, b, t) : null;
    }
    function pathFromPoints(points, close = false) {
        if (!points.length)
            return [];
        return [['M', points[0]], ...points.slice(1).map(p => ['L', p]), ...(close ? [['Z']] : [])];
    }
    function transformPath(path, m) { return path.map(c => [c[0], ...c.slice(1).map(p => typeof p === 'number' ? p : transform(m, p))]); }
    function arcPath(c, u, v, start = 0, sweep = TAU) {
        if (!validPoint(c) || !validPoint(u) || !validPoint(v) || !Number.isFinite(start) || !Number.isFinite(sweep) || Math.abs(sweep) > TAU + EPS)
            throw new RangeError('Invalid conic sweep.');
        const point = t => add(c, add(mul(u, Math.cos(t)), mul(v, Math.sin(t))));
        const path = [['M', point(start)]], count = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
        for (let i = 0; i < count; i++) {
            const a = start + sweep * i / count, b = start + sweep * (i + 1) / count, mid = (a + b) / 2, w = Math.cos((b - a) / 2);
            path.push(['K', add(c, mul(sub(point(mid), c), 1 / w)), point(b), w]);
        }
        return path;
    }
    function bulgePath(a, b, bulge) {
        if (Math.abs(bulge) < 1e-12 || distance(a, b) < EPS)
            return pathFromPoints([a, b]);
        const dx = b.x - a.x, dy = b.y - a.y, chord = Math.hypot(dx, dy);
        const c = vec((a.x + b.x) / 2 - dy * (1 - bulge * bulge) / (4 * bulge), (a.y + b.y) / 2 + dx * (1 - bulge * bulge) / (4 * bulge), a.z || 0);
        const r = chord * (1 + bulge * bulge) / (4 * Math.abs(bulge)), start = Math.atan2(a.y - c.y, a.x - c.x);
        return arcPath(c, vec(r, 0, 0), vec(0, r, 0), start, 4 * Math.atan(bulge));
    }
    function flatten(path, tolerance = 0.01, maxPoints = 100000) {
        if (!(tolerance > 0) || !Number.isFinite(tolerance) || !Number.isInteger(maxPoints) || maxPoints < 2)
            throw new RangeError('Invalid flattening limits.');
        const rings = [];
        let points = [], last = vec(), first = null, truncated = false, count = 0;
        const push = p => { if (count >= maxPoints) {
            truncated = true;
            return;
        } if (!validPoint(p))
            throw new RangeError('Nonfinite path coordinate.'); points.push(p); last = p; count++; };
        const sample = (fn, a = 0, b = 1, pa = fn(0), pb = fn(1), depth = 0) => {
            if (count >= maxPoints) {
                truncated = true;
                return;
            }
            const t = (a + b) / 2, pm = fn(t), q1 = fn((a + t) / 2), q3 = fn((t + b) / 2);
            const err = Math.max(distance(pm, lerp(pa, pb, .5)), distance(q1, lerp(pa, pb, .25)), distance(q3, lerp(pa, pb, .75)));
            if (err <= tolerance || depth >= 16 || count >= maxPoints - 2) {
                push(pb);
                return;
            }
            sample(fn, a, t, pa, pm, depth + 1);
            sample(fn, t, b, pm, pb, depth + 1);
        };
        for (const cmd of path) {
            if (count >= maxPoints) {
                truncated = true;
                break;
            }
            const [op, a, b, w] = cmd;
            if (op === 'M') {
                if (points.length)
                    rings.push(points);
                points = [];
                first = a;
                push(a);
            }
            else if (op === 'L')
                push(a);
            else if (op === 'Z') {
                if (first && distance(last, first) > EPS)
                    push(first);
            }
            else if (op === 'K') {
                if (!(w > 0) || !Number.isFinite(w))
                    throw new RangeError('Invalid conic weight.');
                const p = last;
                sample(t => { const s = 1 - t, d = s * s + 2 * w * s * t + t * t; return mul(add(add(mul(p, s * s), mul(a, 2 * w * s * t)), mul(b, t * t)), 1 / d); });
            }
            else if (op === 'C') {
                const p = last, end = w;
                sample(t => { const s = 1 - t; return add(add(mul(p, s * s * s), mul(a, 3 * s * s * t)), add(mul(b, 3 * s * t * t), mul(end, t * t * t))); });
            }
            else if (op === 'Q') {
                const p = last;
                sample(t => add(add(mul(p, (1 - t) * (1 - t)), mul(a, 2 * t * (1 - t))), mul(b, t * t)));
            }
            else
                throw new Error('Unknown path command ' + op);
        }
        if (points.length)
            rings.push(points);
        return { rings, points: rings.flat(), truncated };
    }
    function createNurbsEvaluator(points, degree, knots, weights) {
        if (!Number.isInteger(degree) || degree < 1 || degree > 12 || points.length <= degree || knots.length !== points.length + degree + 1)
            throw new RangeError('Invalid spline degree/control/knot counts.');
        if (points.some(p => !validPoint(p)))
            throw new RangeError('Nonfinite spline control point.');
        if (weights?.length && weights.length !== points.length)
            throw new RangeError('One weight per control point is required.');
        for (let i = 0; i < knots.length; i++)
            if (!Number.isFinite(knots[i]) || (i && knots[i] < knots[i - 1]))
                throw new RangeError('Nonmonotone spline knots.');
        const controls = points.map((p, i) => { const w = weights?.[i] ?? 1; if (!(w > 0) || !Number.isFinite(w))
            throw new RangeError('Spline weights must be positive and finite.'); return [p.x * w, p.y * w, (p.z || 0) * w, w]; });
        const n = points.length - 1, lo = knots[degree], hi = knots[n + 1];
        if (!(hi > lo))
            throw new RangeError('Empty spline parameter range.');
        return t => {
            if (!Number.isFinite(t))
                throw new RangeError('Finite spline parameter required.');
            t = clamp(t, lo, hi);
            let span = n;
            if (t < hi) {
                let l = degree, r = n + 1;
                while (r - l > 1) {
                    const mid = (l + r) >> 1;
                    if (t < knots[mid])
                        r = mid;
                    else
                        l = mid;
                }
                span = l;
            }
            const d = Array.from({ length: degree + 1 }, (_, j) => controls[span - degree + j].slice());
            for (let r = 1; r <= degree; r++)
                for (let j = degree; j >= r; j--) {
                    const i = span - degree + j, den = knots[i + degree - r + 1] - knots[i], alpha = den ? (t - knots[i]) / den : 0;
                    for (let k = 0; k < 4; k++)
                        d[j][k] = (1 - alpha) * d[j - 1][k] + alpha * d[j][k];
                }
            const p = d[degree];
            return vec(p[0] / p[3], p[1] / p[3], p[2] / p[3]);
        };
    }
    function evaluateNurbs(points, degree, knots, weights, t) { return createNurbsEvaluator(points, degree, knots, weights)(t); }
    function sampleNurbs(points, degree, knots, weights, tolerance = .01, maxPoints = 16384) {
        if (!(tolerance > 0) || !Number.isFinite(tolerance) || !Number.isInteger(maxPoints) || maxPoints < 2)
            throw new RangeError('Invalid spline limits.');
        const out = [], evalAt = createNurbsEvaluator(points, degree, knots, weights);
        const recurse = (a, b, pa, pb, depth) => {
            if (out.length >= maxPoints)
                throw new RangeError('Spline tessellation budget exceeded.');
            const t = (a + b) / 2, p = evalAt(t), q = evalAt((a + t) / 2), r = evalAt((t + b) / 2);
            if (depth >= 14 || Math.max(distance(p, lerp(pa, pb, .5)), distance(q, lerp(pa, pb, .25)), distance(r, lerp(pa, pb, .75))) <= tolerance) {
                out.push(pb);
                return;
            }
            if (out.length >= maxPoints)
                throw new RangeError('Spline tessellation budget exceeded.');
            recurse(a, t, pa, p, depth + 1);
            recurse(t, b, p, pb, depth + 1);
        };
        out.push(evalAt(knots[degree]));
        for (let i = degree; i < points.length; i++)
            if (knots[i + 1] > knots[i])
                recurse(knots[i], knots[i + 1], evalAt(knots[i]), evalAt(knots[i + 1]), 0);
        return out;
    }
    class SpatialIndex {
        constructor(items = [], leafSize = 16) { if (!Number.isInteger(leafSize) || leafSize < 1)
            throw new RangeError('Positive integer leaf size required.'); this.leafSize = leafSize; this.root = this.build(items.filter(x => !isEmpty(x.bounds))); }
        build(items) {
            if (!items.length)
                return null;
            const b = items.reduce((a, x) => union(a, x.bounds), emptyBounds());
            if (items.length <= this.leafSize)
                return { bounds: b, items };
            const axis = (b.maxX - b.minX) > (b.maxY - b.minY) ? 'X' : 'Y';
            items = items.slice().sort((a, b) => (a.bounds['min' + axis] + a.bounds['max' + axis]) - (b.bounds['min' + axis] + b.bounds['max' + axis]));
            const mid = items.length >> 1;
            return { bounds: b, left: this.build(items.slice(0, mid)), right: this.build(items.slice(mid)) };
        }
        search(box) { const found = [], stack = [this.root]; while (stack.length) {
            const n = stack.pop();
            if (!n || !intersects(n.bounds, box))
                continue;
            if (n.items)
                for (const item of n.items) {
                    if (intersects(item.bounds, box))
                        found.push(item);
                }
            else
                stack.push(n.left, n.right);
        } return found; }
    }
    Object.assign(api, { geometry: Object.freeze({ TAU, EPS, finite, clamp, vec, add, sub, mul, dot, cross, length, normal, distance, lerp, validPoint, identity, multiply, translation, scaling, rotation, transform, direction, inverse, ocs, viewBasis, project, emptyBounds, isEmpty, extend, bounds, union, intersects, inBounds, center, segmentDistance, pointInPolygon, inLoops, segmentIntersection, pathFromPoints, transformPath, arcPath, bulgePath, flatten, evaluateNurbs, createNurbsEvaluator, sampleNurbs }), SpatialIndex });
    if (typeof module === 'object' && module.exports)
        module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
