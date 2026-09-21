const api = (() => {
const globalThis = Object.create(null);
const module = undefined;
// Deterministic DxfSkia bundle. Native SkiaSharpWeb is supplied by the host.

// packages/dxf-skia/src/geometry.js
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
    const normal = a => { const n = length(a); if (!(n > EPS) || !Number.isFinite(n))
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
    function quadraticRoots(a, b, c) {
        const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
        if (!Number.isFinite(scale)) throw new RangeError('Curve derivative overflow.');
        if (!scale) return [];
        a /= scale; b /= scale; c /= scale;
        if (Math.abs(a) <= Number.EPSILON * Math.max(Math.abs(b), Math.abs(c))) return b ? [-c / b] : [];
        const d = b * b - 4 * a * c;
        if (d < 0) return [];
        const q = -.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(d));
        return q ? [q / a, c / q] : [-b / (2 * a)];
    }
    /** Exact axis extrema for positive-weight quadratic conics and polynomial
     * Beziers, also after arbitrary affine projection. Not tessellation bounds. */
    function pathBounds(path, convert = p => p) {
        const box = emptyBounds();
        let last = null, first = null;
        for (const [op, rawA, rawB, rawC] of path) {
            if (op === 'Z') { if (first) extend(box, first); last = first; continue; }
            const a = convert(rawA);
            if (!validPoint(a)) throw new RangeError('Nonfinite path bound.');
            if (op === 'M' || op === 'L') { extend(box, a); if (op === 'M') first = a; last = a; continue; }
            if (!last) throw new RangeError('Curve requires a start point.');
            const b = convert(rawB), c = op === 'C' ? convert(rawC) : null, p = last;
            if (!validPoint(b) || (c && !validPoint(c))) throw new RangeError('Nonfinite curve bound.');
            const end = c || b;
            const at = t => {
                const u = 1 - t;
                if (op === 'C') return add(p, add(mul(sub(a, p), 3*u*u*t), add(mul(sub(b, p), 3*u*t*t), mul(sub(c, p), t*t*t))));
                const w = op === 'K' ? rawC : 1;
                if (!(w > 0 && Number.isFinite(w))) throw new RangeError('Invalid conic weight.');
                return add(p, mul(add(mul(sub(a, p), 2*w*u*t), mul(sub(b, p), t*t)), 1/(u*u+2*w*u*t+t*t)));
            };
            extend(box, p); extend(box, end);
            for (const axis of ['x', 'y', 'z']) {
                const v0 = p[axis] || 0, v1 = (a[axis] || 0)-v0, v2 = (b[axis] || 0)-v0;
                let roots;
                if (op === 'C') {
                    const d0=v1, d1=v2-v1, d2=(c[axis] || 0)-v0-v2;
                    roots=quadraticRoots(d0-2*d1+d2, 2*(d1-d0), d0);
                } else {
                    const w=op==='K'?rawC:1, n1=2*w*v1, n2=v2-n1, d1=2*(w-1), d2=-d1;
                    roots=quadraticRoots(n2*d1-n1*d2, 2*n2, n1);
                }
                for (const t of roots) if (t>0 && t<1) extend(box,at(t));
            }
            last=end;
        }
        return box;
    }
    /** Chord-length C2 cubic interpolation, O(n) memory/time. Optional endpoint
     * tangent directions become clamped derivatives; closed data is periodic.
     * The original fit points remain interpolation constraints, not a polygon. */
    function interpolateFitPoints(input, { closed = false, startTangent, endTangent, maxPoints = 10000 } = {}) {
        if (!Number.isSafeInteger(maxPoints) || maxPoints < 2) throw new RangeError('Invalid fit-point budget.');
        if (!Array.isArray(input) || input.length > maxPoints || input.some(p => !validPoint(p))) throw new RangeError('Invalid or over-budget spline fit points.');
        const points=[];
        for (const p of input) if (!points.length || distance(points.at(-1),p)>0) points.push(p);
        if (closed && points.length>1 && distance(points[0],points.at(-1))===0) points.pop();
        const n=points.length;
        if (n<2 || (closed && n<3)) throw new RangeError('Too few distinct spline fit points.');
        const count=closed?n:n-1, lengths=Array.from({length:count},(_,i)=>distance(points[i],points[(i+1)%n]));
        const total=lengths.reduce((a,b)=>a+b,0);
        if (!(total>0 && Number.isFinite(total))) throw new RangeError('Invalid fit parameter range.');
        const h=lengths.map(x=>x/total), lower=new Float64Array(n), diag=new Float64Array(n), upper=new Float64Array(n);
        for(let i=0;i<n;i++) {
            if(!closed && (i===0||i===n-1)) {diag[i]=1;continue;}
            const prev=h[(i-1+count)%count],next=h[i%count];lower[i]=prev;diag[i]=2*(prev+next);upper[i]=next;
        }
        if(!closed && startTangent){normal(startTangent);diag[0]=2*h[0];upper[0]=h[0];}
        if(!closed && endTangent){normal(endTangent);lower[n-1]=h[n-2];diag[n-1]=2*h[n-2];}
        const solve=(rhs,diagonal=diag)=>{
            const b=Float64Array.from(diagonal),x=Float64Array.from(rhs);
            for(let i=1;i<n;i++){if(!b[i-1])throw new RangeError('Singular spline fit.');const q=lower[i]/b[i-1];b[i]-=q*upper[i-1];x[i]-=q*x[i-1];}
            x[n-1]/=b[n-1];for(let i=n-2;i>=0;i--)x[i]=(x[i]-upper[i]*x[i+1])/b[i];
            if([...x].some(v=>!Number.isFinite(v)))throw new RangeError('Ill-conditioned spline fit.');return x;
        };
        let cyclicDiag, z, beta, gamma;
        if(closed){beta=h.at(-1);gamma=-diag[0];cyclicDiag=Float64Array.from(diag);cyclicDiag[0]-=gamma;cyclicDiag[n-1]-=beta*beta/gamma;
            const u=new Float64Array(n);u[0]=gamma;u[n-1]=beta;z=solve(u,cyclicDiag);}
        const second=Array.from({length:n},()=>vec());
        for(const axis of ['x','y','z']) {
            const slopes=h.map((dt,i)=>((points[(i+1)%n][axis]||0)-(points[i][axis]||0))/dt),rhs=new Float64Array(n);
            for(let i=closed?0:1;i<(closed?n:n-1);i++)rhs[i]=6*(slopes[i%count]-slopes[(i-1+count)%count]);
            if(!closed&&startTangent)rhs[0]=6*(slopes[0]-normal(startTangent)[axis]*total);
            if(!closed&&endTangent)rhs[n-1]=6*(normal(endTangent)[axis]*total-slopes.at(-1));
            const x=solve(rhs,cyclicDiag||diag);
            if(closed){const factor=(x[0]+beta*x[n-1]/gamma)/(1+z[0]+beta*z[n-1]/gamma);for(let i=0;i<n;i++)x[i]-=factor*z[i];}
            for(let i=0;i<n;i++)second[i][axis]=x[i];
        }
        const path=[['M',points[0]]];
        for(let i=0;i<count;i++){
            const j=(i+1)%n,delta=sub(points[j],points[i]),dt=h[i];
            const a=add(points[i],sub(mul(delta,1/3),mul(add(mul(second[i],2),second[j]),dt*dt/18)));
            const b=sub(points[j],add(mul(delta,1/3),mul(add(second[i],mul(second[j],2)),dt*dt/18)));
            if(!validPoint(a)||!validPoint(b))throw new RangeError('Spline fit overflow.');
            path.push(['C',a,b,points[j]]);
        }
        if(closed)path.push(['Z']);
        return path;
    }
    class SpatialIndex {
        constructor(items = [], leafSize = 16) {
            if (!Number.isInteger(leafSize) || leafSize < 1) throw new RangeError('Positive integer leaf size required.');
            this.leafSize = leafSize;
            this.items = items.filter(x => !isEmpty(x.bounds));
            this.root = this.build(this.items, 0, this.items.length);
        }
        build(items, lo = 0, hi = items.length) {
            if (lo >= hi) return null;
            const b = emptyBounds(); for (let i=lo;i<hi;i++) union(b,items[i].bounds);
            if (hi-lo <= this.leafSize) return {bounds:b,lo,hi};
            const axis=(b.maxX-b.minX)>(b.maxY-b.minY)?'X':'Y', min='min'+axis,max='max'+axis;
            const coordinate = item => item.bounds[min]/2 + item.bounds[max]/2;
            const mid=(lo+hi)>>>1;
            let left=lo,right=hi-1,budget=2*Math.ceil(Math.log2(hi-lo))+2;
            // In-place deterministic median partition. Recursive nodes share one
            // backing array; no per-level full sort or subarray copying.
            while(left<right) {
                if(--budget===0) {const sorted=items.slice(left,right+1).sort((a,b)=>coordinate(a)-coordinate(b));for(let i=0;i<sorted.length;i++)items[left+i]=sorted[i];break;}
                const pivot=coordinate(items[(left+right)>>>1]);let i=left,j=right;
                while(i<=j) {
                    while(coordinate(items[i])<pivot)i++;
                    while(coordinate(items[j])>pivot)j--;
                    if(i<=j){[items[i],items[j]]=[items[j],items[i]];i++;j--;}
                }
                if(mid<=j)right=j;else if(mid>=i)left=i;else break;
            }
            return {bounds:b,left:this.build(items,lo,mid),right:this.build(items,mid,hi)};
        }
        search(box) {
            const found=[],stack=[this.root];
            while(stack.length) {
                const n=stack.pop();if(!n||!intersects(n.bounds,box))continue;
                if(n.lo!==undefined) {for(let i=n.lo;i<n.hi;i++) {const item=this.items[i];if(intersects(item.bounds,box))found.push(item);}}
                else stack.push(n.left,n.right);
            }
            return found;
        }
    }
    Object.assign(api, { geometry: Object.freeze({ TAU, EPS, finite, clamp, vec, add, sub, mul, dot, cross, length, normal, distance, lerp, validPoint, identity, multiply, translation, scaling, rotation, transform, direction, inverse, ocs, viewBasis, project, emptyBounds, isEmpty, extend, bounds, union, intersects, inBounds, center, segmentDistance, pointInPolygon, inLoops, segmentIntersection, pathFromPoints, transformPath, arcPath, bulgePath, flatten, evaluateNurbs, createNurbsEvaluator, sampleNurbs, pathBounds, interpolateFitPoints }), SpatialIndex });
    if (typeof module === 'object' && module.exports)
        module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);


// packages/dxf-skia/src/input.js
/* Byte-oriented DXF input. Binary integers are decoded without lossy Number
 * conversion; original offsets and ordered/repeated group tags are retained.
 * TextDecoder support determines legacy codepages; unsupported pages fail closed. */
(function(root) {
    'use strict';
    const A=root.DxfSkia;
    const SENTINEL='AutoCAD Binary DXF\r\n\x1a\0';
    const between=(code,a,b)=>code>=a&&code<=b;
    function binaryGroupType(code) {
        if(between(code,310,319)||code===1004)return 'binary';
        if(between(code,290,299))return 'bool';
        if(between(code,60,79)||between(code,170,179)||between(code,270,289)||between(code,370,389)||between(code,400,409)||between(code,1060,1070))return 'int16';
        if(between(code,90,99)||between(code,420,429)||between(code,440,459)||code===1071)return 'int32';
        if(between(code,160,169))return 'int64';
        if(between(code,10,59)||between(code,110,149)||between(code,210,239)||between(code,460,469)||between(code,1010,1059))return 'double';
        if(between(code,0,9)||between(code,100,102)||code===105||between(code,300,309)||between(code,320,369)||between(code,390,399)||between(code,410,419)||between(code,430,439)||between(code,470,481)||code===999||between(code,1000,1009))return 'string';
        throw new RangeError('Unsupported binary DXF group code '+code+'.');
    }
    function encodingName(version,codepage,override) {
        if(override)return override;
        if(/^AC\d{4}$/.test(version||'')&&Number(version.slice(2))>=1021)return 'utf-8';
        const page=String(codepage||'ANSI_1252').trim().toUpperCase();
        const mapping={ANSI_932:'shift_jis',ANSI_936:'gbk',ANSI_949:'euc-kr',ANSI_950:'big5',ANSI_874:'windows-874',UTF8:'utf-8','UTF-8':'utf-8',ANSI_65001:'utf-8',DOS437:'ibm437',DOS850:'ibm850'};
        if(/^ANSI_125[0-8]$/.test(page))return 'windows-'+page.slice(5);
        if(mapping[page])return mapping[page];
        throw new RangeError('Unsupported DXF codepage '+page+'; supply an explicit encoding/decoder.');
    }
    function decoder(name,options) {
        if(options.decodeString) return {decode:bytes=>String(options.decodeString(bytes,name))};
        try {
            const native = new TextDecoder(name,{fatal:options.fatalEncoding!==false});
            // Node/ICU builds may expose Latin-1 controls for this WHATWG alias.
            // Normalize only the Windows-1252 C1 window; already-decoded Unicode
            // remains untouched and undefined bytes retain their control values.
            if (native.encoding === 'windows-1252') {
                const high=[0x20ac,0x81,0x201a,0x192,0x201e,0x2026,0x2020,0x2021,0x2c6,0x2030,0x160,0x2039,0x152,0x8d,0x17d,0x8f,0x90,0x2018,0x2019,0x201c,0x201d,0x2022,0x2013,0x2014,0x2dc,0x2122,0x161,0x203a,0x153,0x9d,0x17e,0x178];
                return {decode:bytes=>native.decode(bytes).replace(/[\u0080-\u009f]/g,ch=>String.fromCodePoint(high[ch.charCodeAt(0)-128]))};
            }
            return native;
        }
        catch {throw new RangeError('TextDecoder cannot decode DXF encoding '+name+'; supply decodeString.');}
    }
    function metadata(tags) {
        let version='',codepage='',section='',variable='';
        for(const tag of tags) {
            const value=tag.value;
            if(tag.code===0) {if(value==='ENDSEC'&&section==='HEADER')break;if(value==='SECTION')section='?';variable='';}
            else if(tag.code===2&&section==='?')section=value.trim();
            else if(section==='HEADER'&&tag.code===9)variable=value.trim();
            else if(section==='HEADER'&&variable==='$ACADVER'&&tag.code===1)version=value.trim();
            else if(section==='HEADER'&&variable==='$DWGCODEPAGE'&&tag.code===3)codepage=value.trim();
        }
        return {version,codepage};
    }
    // Sniff only structural ASCII header fields without allocating every line or
    // decoding the entire file twice. Other records are traversed by byte offsets.
    function byteHeader(bytes) {
        const ascii=new TextDecoder('windows-1252');let i=0,section='',variable='',version='',codepage='';
        const line=()=>{const start=i;while(i<bytes.length&&bytes[i]!==10&&bytes[i]!==13)i++;const end=i;if(i<bytes.length){const cr=bytes[i++]===13;if(cr&&bytes[i]===10)i++;}return bytes.subarray(start,end);};
        while(i<bytes.length) {
            const codeLine=line();let code=0,valid=false;
            for(const b of codeLine){if(b===32||b===9)continue;if(b<48||b>57){valid=false;break;}code=code*10+b-48;valid=true;}
            if(!valid)continue;
            const value=line();
            if(code===0) {
                const str=ascii.decode(value).trim();
                if(str==='ENDSEC'&&section==='HEADER')break;
                section=str==='SECTION'?'?':str==='ENDSEC'?'':section;variable='';
                if(str==='EOF')break;
            } else if(code===2&&section==='?')section=ascii.decode(value).trim();
            else if(section==='HEADER') {
                if(code===9)variable=ascii.decode(value).trim();
                else if(variable==='$ACADVER'&&code===1)version=ascii.decode(value).trim();
                else if(variable==='$DWGCODEPAGE'&&code===3)codepage=ascii.decode(value).trim();
            }
        }
        return {version,codepage};
    }
    function decodeDxf(input,options={}) {
        const bytes=input instanceof ArrayBuffer?new Uint8Array(input):ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):null;
        if(!bytes)throw new TypeError('DXF input requires an ArrayBuffer or byte view.');
        const maxInputBytes=options.maxInputBytes??128*1024*1024,maxTags=options.maxTags??4000000;
        if(!Number.isSafeInteger(maxInputBytes)||maxInputBytes<1||!Number.isSafeInteger(maxTags)||maxTags<1)throw new RangeError('Positive integer input/tag budgets required.');
        if(bytes.length>maxInputBytes)throw new RangeError('DXF byte budget exceeded.');
        const binary=bytes.length>=SENTINEL.length&&Array.from(SENTINEL,(c,i)=>bytes[i]===c.charCodeAt(0)).every(Boolean);
        if(!binary) {
            if(bytes.length>=18&&new TextDecoder('ascii').decode(bytes.subarray(0,18)).startsWith('AutoCAD Binary DXF'))throw new SyntaxError('Invalid binary DXF sentinel.');
            let bom='';
            if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)bom='utf-8';
            if(bytes[0]===0xff&&bytes[1]===0xfe)bom='utf-16le';
            if(bytes[0]===0xfe&&bytes[1]===0xff)bom='utf-16be';
            const info=bom?{}:byteHeader(bytes),encoding=encodingName(info.version,info.codepage,options.encoding||bom);
            let text;try{text=decoder(encoding,options).decode(bytes);}catch(error){throw new SyntaxError('Cannot decode DXF '+encoding+': '+error.message);}
            return {format:'text',encoding,version:info.version||'',text,byteLength:bytes.length};
        }
        const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tags=[],strings=[],ascii=new TextDecoder('windows-1252');let i=22;
        const need=n=>{if(i+n>bytes.length)throw new SyntaxError('Truncated binary DXF at byte '+i+'.');};
        need(2);const legacy=bytes[22]===0&&bytes[23]!==0;
        while(i<bytes.length) {
            const offset=i;let code;
            if(legacy){need(1);code=bytes[i++];if(code===255){need(2);code=view.getUint16(i,true);i+=2;}}
            else {need(2);code=view.getUint16(i,true);i+=2;}
            let type;try{type=binaryGroupType(code);}catch(error){throw new SyntaxError(error.message+' At byte '+offset+'.');}
            let value;
            if(type==='binary'){need(1);const count=bytes[i++];need(count);value='';for(const b of bytes.subarray(i,i+count))value+=b.toString(16).padStart(2,'0');i+=count;value=value.toUpperCase();}
            else if(type==='bool'){need(1);value=bytes[i++];if(value>1)throw new SyntaxError('Invalid DXF boolean at byte '+offset+'.');}
            else if(type==='int16'){need(2);value=view.getInt16(i,true);i+=2;}
            else if(type==='int32'){need(4);value=view.getInt32(i,true);i+=4;}
            else if(type==='int64'){need(8);value=view.getBigInt64(i,true).toString();i+=8;}
            else if(type==='double'){need(8);value=view.getFloat64(i,true);i+=8;if(!Number.isFinite(value))throw new SyntaxError('Nonfinite binary DXF number at byte '+offset+'.');}
            else {const start=i,end=bytes.indexOf(0,i);if(end<0)throw new SyntaxError('Unterminated binary DXF string at byte '+i+'.');i=end+1;value=ascii.decode(bytes.subarray(start,end));strings.push({index:tags.length,start,end});}
            tags.push({code,value:String(value),line:tags.length*2+1,offset});
            if(tags.length>maxTags)throw new RangeError('DXF tag budget exceeded.');
            if(code===0&&value==='EOF'){if(i!==bytes.length)throw new SyntaxError('Trailing binary DXF data at byte '+i+'.');break;}
        }
        if(!tags.length||tags[0].code!==0||!['SECTION','EOF'].includes(tags[0].value)||tags.at(-1).code!==0||tags.at(-1).value!=='EOF')throw new SyntaxError('Binary DXF has no valid section/EOF framing.');
        const info=metadata(tags),encoding=encodingName(info.version,info.codepage,options.encoding),textDecoder=decoder(encoding,options);
        for(const span of strings) {try{tags[span.index].value=textDecoder.decode(bytes.subarray(span.start,span.end));}catch(error){throw new SyntaxError('Cannot decode binary DXF string at byte '+span.start+': '+error.message);}}
        return {format:legacy?'binary-r12':'binary',encoding,version:info.version,tags,byteLength:bytes.length};
    }
    function dxfText(input,options={}) {
        if(typeof input==='string')return input;
        const decoded=decodeDxf(input,options);
        if(decoded.text!==undefined)return decoded.text;
        return decoded.tags.map(t=>{if(/[\r\n]/.test(t.value))throw new SyntaxError('Embedded newline in binary string cannot be represented in a line-based tree; use DxfDocument byte input.');return t.code+'\n'+t.value+'\n';}).join('');
    }
    Object.assign(A,{decodeDxf,dxfText,binaryGroupType});
    if(typeof module==='object'&&module.exports)module.exports=A;
})(globalThis);


// packages/dxf-skia/src/document.js
/* DXF tagged document model, independent of the legacy parser/tree and renderer. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, G = A.geometry;
    const key = value => String(value ?? '').trim().toUpperCase();
    class Diagnostics {
        constructor(limit = 1000) { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000)
            throw new RangeError('Diagnostic limit must be 1–10000.'); this.limit = limit; this.items = []; this.counts = Object.create(null); this.seen = new Set(); }
        add(code, message, entity = null, severity = 'warning') {
            code = String(code).slice(0, 128);
            message = String(message).slice(0, 2048);
            const k = code + '|' + (entity?.id || entity?.handle || '') + '|' + message;
            if (this.seen.has(k))
                return;
            if (this.seen.size < Math.max(this.limit * 4, 4000))
                this.seen.add(k);
            this.counts[code] = (this.counts[code] || 0) + 1;
            if (this.items.length < this.limit)
                this.items.push(Object.freeze({ code, severity, message, handle: entity?.handle || null, type: entity?.type || null, line: entity?.line ?? null }));
        }
    }
    function* iterateTags(text, { maxBytes = 64 * 1024 * 1024, maxTags = 4000000 } = {}) {
        if (!Number.isSafeInteger(maxTags) || maxTags < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1)
            throw new RangeError('Positive integer DXF text/tag budgets required.');
        if (typeof text !== 'string') throw new TypeError('DXF source must be a string.');
        if (text.length > maxBytes) throw new RangeError('DXF text budget exceeded.');
        if (text.startsWith('AutoCAD Binary DXF')) throw new Error('Use byte input for binary DXF decoding.');
        let offset = text.charCodeAt(0) === 0xfeff ? 1 : 0, lineNumber = 1, count = 0;
        const readLine = () => {
            const start = offset;
            while (offset < text.length && text.charCodeAt(offset) !== 10 && text.charCodeAt(offset) !== 13) offset++;
            const value = text.slice(start, offset);
            if (offset < text.length) { const cr = text.charCodeAt(offset++) === 13; if (cr && text.charCodeAt(offset) === 10) offset++; }
            else offset++; // Permit a final empty value, but not a missing value line.
            lineNumber++; return value;
        };
        while (offset <= text.length) {
            const line = lineNumber, raw = readLine().trim();
            if (!raw) continue;
            if (!/^[+-]?\d+$/.test(raw) || offset > text.length) throw new SyntaxError(`Invalid DXF group at line ${line}.`);
            const code = Number(raw);
            if (code < 0 || code > 1071) throw new RangeError(`DXF group code ${code} outside supported range.`);
            const value = readLine();
            if (++count > maxTags) throw new RangeError('DXF tag budget exceeded.');
            yield { code, value, line };
        }
    }
    function parseTags(text, options) { return Array.from(iterateTags(text, options)); }
    function* recordTags(input, options) {
        const maxTags = options.maxTags ?? 4000000;
        let record = [], count = 0;
        const owned = typeof input === 'string';
        for (const original of owned ? iterateTags(input, options) : input) {
            if (++count > maxTags) throw new RangeError('DXF tag budget exceeded.');
            const tag = owned ? original : { ...original, code: Number(original.code) };
            if (!Number.isInteger(tag.code) || tag.code < 0 || tag.code > 1071) throw new RangeError('Invalid ordered DXF tag code.');
            if (tag.code === 0) {
                if (record.length) yield record;
                record = [tag];
            } else if (record.length) record.push(tag);
        }
        if (record.length) yield record;
    }
    class DxfRecord {
        constructor(tags, index = 0) {
            this.type = key(tags[0]?.value);
            this.tags = tags.slice(1);
            this.properties = this.tags;
            this.line = tags[0]?.line ?? index;
            this.offset = tags[0]?.offset ?? null;
            this._first = null;
            this.handle = key(this.get(5, this.get(105, '')));
            this.id = `${this.handle || '@'}:${this.line}:${index}`;
            this.layer = String(this.get(8, '0')).trim() || '0';
            this.layout = String(this.get(410, '')).trim();
            this.space = Number(this.get(67, 0)) === 1 ? 'paper' : 'model';
            this.children = [];
            this.attributes = [];
            this.vertices = [];
            this.ownerHandle = key(this.get(330, ''));
            this.extrusion = this.point(210, G.vec(0, 0, 1));
        }
        get(code, fallback = null) {
            if (this.tags.length >= 64) {
                if (!this._first) { this._first = new Map(); for (const t of this.tags) if (!this._first.has(t.code)) this._first.set(t.code, t.value); }
                return this._first.has(code) ? this._first.get(code) : fallback;
            }
            for (const t of this.tags) if (t.code === code) return t.value;
            return fallback;
        }
        invalidateTagIndex() { this._first = null; }
        num(code, fallback = 0) { const v = this.get(code, null); if (v === null || String(v).trim() === '')
            return fallback; const n = Number(v); if (!Number.isFinite(n))
            throw new RangeError(`${this.type} #${this.handle}: nonfinite group ${code}.`); return n; }
        all(code) { return this.tags.filter(t => t.code === code).map(t => t.value); }
        point(code = 10, fallback = G.vec()) { return G.vec(this.num(code, fallback.x), this.num(code + 10, fallback.y), this.num(code + 20, fallback.z || 0)); }
        points(code = 10) { const out = []; let p = null; for (const t of this.tags) {
            if (t.code === code) {
                p = G.vec(Number(t.value), 0, 0);
                out.push(p);
            }
            else if (p && t.code === code + 10)
                p.y = Number(t.value);
            else if (p && t.code === code + 20)
                p.z = Number(t.value);
        } if (out.some(p => !G.validPoint(p)))
            throw new RangeError('Nonfinite point coordinate.'); return out; }
        subclass(name) { const start = this.tags.findIndex(t => t.code === 100 && t.value === name); if (start < 0)
            return this; const end = this.tags.findIndex((t, i) => i > start && t.code === 100); return new DxfRecord([{ code: 0, value: this.type }, ...this.tags.slice(start + 1, end < 0 ? undefined : end)]); }
    }
    const colorObject = n => ({ red: (n >> 16) & 255, green: (n >> 8) & 255, blue: n & 255, r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 });
    function aciColor(index, background = '#212830') {
        index = Math.abs(Number(index));
        if (index === 7 || !Number.isInteger(index) || index > 255 || index === 0) {
            const n = parseInt(background.slice(1), 16);
            return (((n >> 16) & 255) * .2126 + ((n >> 8) & 255) * .7152 + (n & 255) * .0722) > 140 ? '#000000' : '#ffffff';
        }
        const base = ['#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', null, '#808080', '#c0c0c0'];
        if (index < 10)
            return base[index];
        if (index >= 250)
            return ['#333333', '#505050', '#696969', '#828282', '#bebebe', '#ffffff'][index - 250];
        const h = Math.floor((index - 10) / 10) / 4, slot = (index - 10) % 10, v = [255, 165, 127, 76, 38][Math.floor(slot / 2)], s = slot % 2 ? .5 : 1, c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c;
        const components = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
        return '#' + components.map(n => Math.floor(n + m).toString(16).padStart(2, '0')).join('');
    }
    function transparency(value, parent = 1, layer = 1) { if (value == null)
        return layer; const n = Number(value) >>> 0; return n === 0 ? layer : n === 0x1000000 ? parent : (n & 0xff000000) === 0x2000000 ? (n & 255) / 255 : layer; }
    class DxfDocument {
        constructor(input, options = {}) {
            if (options.maxTags !== undefined && (!Number.isSafeInteger(options.maxTags) || options.maxTags < 1))
                throw new RangeError('Positive integer DXF tag budget required.');
            this.diagnostics = new Diagnostics(options.maxDiagnostics);
            this.records = [];
            this.entities = [];
            this.blocks = [];
            this.byHandle = new Map();
            this.header = Object.create(null);
            this.objects = [];
            this.layouts = new Map();
            const tables = this.tables = { layers: Object.create(null), linetypes: Object.create(null), styles: Object.create(null), dimstyles: Object.create(null), blockRecords: Object.create(null), views: Object.create(null), viewports: Object.create(null), ucs: Object.create(null), layouts: Object.create(null) };
            const blocks = this.blockDefinitions = new Map();
            if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
                const decoded = A.decodeDxf(input, options);
                this.inputFormat = decoded.format; this.inputEncoding = decoded.encoding;
                input = decoded.tags || decoded.text;
            } else { this.inputFormat = typeof input === 'string' ? 'text' : 'tags'; this.inputEncoding = null; }
            if (typeof input !== 'string' && !Array.isArray(input)) throw new TypeError('Expected DXF text, bytes or an array of tags.');
            let section = '', currentBlock = null, table = '', sequence = null;
            for (const tags of recordTags(input, options)) {
                const record = new DxfRecord(tags, this.records.length), type = record.type;
                if (type === 'SECTION') {
                    section = key(record.get(2));
                    if (section === 'HEADER') {
                        let variable = null;
                        for (const t of record.tags) {
                            if (t.code === 9) {
                                variable = key(t.value);
                                this.header[variable] = [];
                            }
                            else if (variable)
                                this.header[variable].push(t);
                        }
                    }
                    continue;
                }
                if (type === 'ENDSEC') {
                    section = '';
                    currentBlock = null;
                    sequence = null;
                    continue;
                }
                if (type === 'EOF')
                    break;
                if (type === 'TABLE') {
                    table = key(record.get(2));
                    continue;
                }
                if (type === 'ENDTAB') {
                    table = '';
                    continue;
                }
                this.records.push(record);
                if (record.handle) {
                    if (this.byHandle.has(record.handle))
                        this.diagnostics.add('duplicate-handle', 'Duplicate handle; identity remains record-specific.', record);
                    else
                        this.byHandle.set(record.handle, record);
                }
                if (section === 'TABLES') {
                    const name = String(record.get(2, '')).trim(), flags = record.num(70);
                    if (type === 'LAYER')
                        tables.layers[name] = { name, handle: record.handle, flags, colorNumber: record.num(62, 7), trueColor: record.get(420) == null ? null : colorObject(record.num(420)), linetype: record.get(6, 'CONTINUOUS'), lineweight: record.num(370, -3), transparency: { alpha: transparency(record.get(440)) }, plot: record.num(290, 1) !== 0, material: record.get(347), plotStyle: record.get(390), record };
                    else if (type === 'LTYPE')
                        tables.linetypes[name] = { name, handle: record.handle, description: record.get(3, ''), pattern: record.all(49).map(Number), length: record.num(40), complex: record.all(74).some(n => Number(n) !== 0), record };
                    else if (type === 'STYLE')
                        tables.styles[name] = { name, handle: record.handle, font: record.get(3, ''), bigFont: record.get(4, ''), height: record.num(40), width: record.num(41, 1), oblique: record.num(50), flags, record };
                    else if (type === 'DIMSTYLE')
                        tables.dimstyles[name] = { name, handle: record.handle, record };
                    else if (type === 'BLOCK_RECORD')
                        tables.blockRecords[name] = { name, handle: record.handle, units: record.num(70), layoutHandle: record.get(340), record };
                    else if (type === 'VPORT')
                        tables.viewports[name] = { name, record };
                    else if (type === 'VIEW')
                        tables.views[name] = { name, record };
                    else if (type === 'UCS')
                        tables.ucs[name] = { name, record };
                    continue;
                }
                if (section === 'OBJECTS') {
                    this.objects.push(record);
                    if (type === 'LAYOUT') {
                        const name = String(record.get(1, 'Layout')).trim();
                        this.layouts.set(key(name), { name, record });
                        tables.layouts[name] = { name, record };
                    }
                    continue;
                }
                if (section !== 'ENTITIES' && section !== 'BLOCKS')
                    continue;
                if (type === 'BLOCK') {
                    const name = String(record.get(2, record.get(3, ''))).trim();
                    currentBlock = { name, header: { basePoint: record.point(10), flags: record.num(70), xrefPath: record.get(1, ''), handle: record.handle }, record, entities: [] };
                    blocks.set(key(name), currentBlock);
                    this.blocks.push(currentBlock);
                    sequence = null;
                    continue;
                }
                if (type === 'ENDBLK') {
                    currentBlock = null;
                    sequence = null;
                    continue;
                }
                if (type === 'SEQEND') {
                    sequence = null;
                    continue;
                }
                if (type === 'VERTEX' && sequence?.type === 'POLYLINE') {
                    sequence.vertices.push(record);
                    sequence.children.push(record);
                    continue;
                }
                if (type === 'ATTRIB' && sequence?.type === 'INSERT') {
                    sequence.attributes.push(record);
                    sequence.children.push(record);
                    continue;
                }
                sequence = null;
                if (currentBlock) {
                    record.blockName = currentBlock.name;
                    record.space = 'block';
                    currentBlock.entities.push(record);
                }
                else
                    this.entities.push(record);
                if (type === 'POLYLINE' || (type === 'INSERT' && record.num(66) === 1))
                    sequence = record;
            }
            if (!tables.layers['0'])
                tables.layers['0'] = { name: '0', handle: '', flags: 0, colorNumber: 7, linetype: 'CONTINUOUS', lineweight: -3, transparency: { alpha: 1 }, plot: true };
            this._layerMap = new Map(Object.values(tables.layers).map(l => [key(l.name), l]));
            this._lineMap = new Map(Object.values(tables.linetypes).map(l => [key(l.name), l]));
            this._styleMap = new Map(Object.values(tables.styles).map(l => [key(l.name), l]));
            const model = [], paper = Object.create(null), blockObject = Object.create(null);
            const owners = new Map(Object.values(tables.blockRecords).map(b => [key(b.handle), b]));
            const layoutByBlock = new Map();
            for (const layout of this.layouts.values()) {
                const handles = layout.record.all(330);
                if (handles.length)
                    layoutByBlock.set(key(handles.at(-1)), layout.name);
            }
            const assign = entity => {
                const owner = owners.get(entity.ownerHandle);
                let layout = entity.layout;
                if (!layout && owner) {
                    layout = layoutByBlock.get(key(owner.handle)) || this.byHandle.get(key(owner.layoutHandle))?.get(1) || '';
                    if (key(owner.name) === '*MODEL_SPACE')
                        layout = 'Model';
                }
                if (entity.space === 'paper' || (layout && key(layout) !== 'MODEL')) {
                    layout = layout || 'Layout1';
                    entity.layout = layout;
                    entity.space = 'paper';
                    (paper[layout] ||= []).push(entity);
                }
                else {
                    entity.space = 'model';
                    model.push(entity);
                }
            };
            this.entities.forEach(assign);
            for (const block of this.blocks) {
                blockObject[block.name] = block;
                if (/^\*MODEL_SPACE$/i.test(block.name) || /^\*PAPER_SPACE/i.test(block.name)) {
                    for (const e of block.entities) {
                        e.space = /MODEL/i.test(block.name) ? 'model' : 'paper';
                        if (!e.layout)
                            e.layout = e.space === 'model' ? 'Model' : layoutByBlock.get(key(owners.get(e.ownerHandle)?.handle)) || 'Layout1';
                        assign(e);
                    }
                }
            }
            this.layouts.set('MODEL', { name: 'Model', record: null });
            for (const name of Object.keys(paper))
                if (!this.layouts.has(key(name)))
                    this.layouts.set(key(name), { name, record: null });
            const imageDefinitions = Object.create(null), spatialFilters = Object.create(null);
            for (const r of this.objects) {
                if (r.type === 'IMAGEDEF')
                    imageDefinitions[r.handle] = { handle: r.handle, path: r.get(1, ''), width: r.num(10), height: r.num(20), record: r };
                if (r.type === 'SPATIAL_FILTER')
                    spatialFilters[r.handle] = r;
            }
            this.units = { insertionUnits: this.headerNumber('$INSUNITS', 0), measurement: this.headerNumber('$MEASUREMENT', 1) };
            this.stats = { modelSpaceEntities: model.length, paperSpaceLayouts: Object.keys(paper).length, paperSpaceEntities: Object.values(paper).reduce((a, b) => a + b.length, 0), blockCount: blocks.size, blockEntities: this.blocks.reduce((a, b) => a + b.entities.length, 0), entityCount: this.entities.length };
            this.sceneGraph = { modelSpace: model, paperSpaces: paper, blocks: blockObject, tables, stats: this.stats, units: this.units, imageDefinitions, spatialFilters, entities: this.entities };
            Object.defineProperty(this.sceneGraph, 'document', { value: this });
            this.blockMetadata = this.createBlockMetadata();
            this.status = 'ready';
            this.drawingProperties = { version: this.headerValue('$ACADVER', 'Unknown'), insertionUnits: this.units.insertionUnits };
        }
        headerValue(name, fallback = null) { return this.header[key(name)]?.[0]?.value ?? fallback; }
        headerNumber(name, fallback = 0) { const value = this.headerValue(name); return value == null ? fallback : G.finite(value, fallback); }
        layer(name) { return this._layerMap.get(key(name)) || this.tables.layers['0']; }
        linetype(name) { return this._lineMap.get(key(name)); }
        textStyle(name) { return this._styleMap.get(key(name)) || null; }
        getBlock(name) { return this.blockDefinitions.get(key(name)); }
        getEntities(layout = 'Model') { if (key(layout) === 'MODEL')
            return this.sceneGraph.modelSpace; const entry = Object.entries(this.sceneGraph.paperSpaces).find(([name]) => key(name) === key(layout)); if (!entry)
            throw new RangeError(`Unknown layout: ${layout}`); return entry[1]; }
        createBlockMetadata() {
            const byName = Object.create(null), ordered = [];
            for (const b of this.blocks) {
                if (/^\*(MODEL|PAPER)_SPACE/i.test(b.name))
                    continue;
                const attributes = b.entities.filter(e => e.type === 'ATTDEF').map(e => ({ tag: e.get(2, ''), prompt: e.get(3, ''), defaultValue: e.get(1, ''), flags: e.num(70), handle: e.handle, position: e.point(10), textStyle: e.get(7, 'STANDARD'), height: e.num(40), visibility: (e.num(70) & 1) ? 'Invisible' : 'Visible' }));
                const entry = { name: b.name, handle: b.record.handle, basePoint: b.header.basePoint, flags: b.header.flags, entityCount: b.entities.length, attributeCount: attributes.length, attributes, attributeDefinitions: attributes, attributeTags: attributes.map(a => a.tag), layoutUsage: [], ownerUsage: [], counters: { unitWarnings: 0 }, instances: [], instanceCount: 0, diagnostics: [], units: this.tables.blockRecords[b.name]?.units || 0 };
                byName[key(b.name)] = entry;
                ordered.push(entry);
            }
            for (const e of [...this.entities, ...this.blocks.flatMap(b => b.entities)])
                if (e.type === 'INSERT') {
                    const name = String(e.get(2, '')), entry = byName[key(name)];
                    if (!entry) {
                        this.diagnostics.add('missing-block', `Block ${name} is not defined.`, e);
                        continue;
                    }
                    entry.instances.push({ handle: e.handle, layer: e.layer, space: e.space, layout: e.layout, ownerBlock: e.blockName || null, insertionPoint: e.point(10), position: e.point(10), scale: G.vec(e.num(41, 1), e.num(42, 1), e.num(43, 1)), rotation: e.num(50), hasAttributes: !!e.attributes.length, attributes: e.attributes.map(a => ({ tag: a.get(2, ''), value: a.get(1, ''), handle: a.handle })), rows: e.num(71, 1), columns: e.num(70, 1) });
                    entry.instanceCount++;
                    const supplied = new Set(e.attributes.map(a => key(a.get(2)))), counts = new Map();
                    for (const a of e.attributes) {
                        const tag = key(a.get(2));
                        counts.set(tag, (counts.get(tag) || 0) + 1);
                    }
                    for (const def of entry.attributeDefinitions)
                        if (!(def.flags & 2) && !supplied.has(key(def.tag)))
                            entry.diagnostics.push({ message: 'Missing attribute: ' + def.tag, severity: 'warning', category: 'Attributes', instanceHandle: e.handle, space: e.space, layout: e.layout });
                    for (const [tag, count] of counts)
                        if (count > 1)
                            entry.diagnostics.push({ message: 'Duplicate attribute: ' + tag, severity: 'warning', category: 'Attributes', instanceHandle: e.handle, space: e.space, layout: e.layout });
                    if (!e.num(41, 1) || !e.num(42, 1) || !e.num(43, 1))
                        entry.diagnostics.push({ message: 'Singular INSERT scale', severity: 'error', category: 'Transform', instanceHandle: e.handle, space: e.space, layout: e.layout });
                }
            return { byName, ordered };
        }
    }
    Object.assign(A, { key, parseTags, iterateTags, DxfRecord, DxfDocument, Diagnostics, aciColor, colorObject, transparency });
    if (typeof module === 'object' && module.exports)
        module.exports = A;
})(globalThis);


// packages/dxf-skia/src/resources.js
/* Application-owned, explicit local resources. DXF paths are identifiers, never URLs
 * to fetch. Native objects are scoped to one initialized Skia namespace. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, G = A.geometry;
    const resourceKey = name => String(name || '').replace(/\\/g, '/').split('/').pop().normalize('NFC').toLocaleLowerCase();
    class ResourceStore {
        constructor(S, { maxBytes = 128 * 1024 * 1024, maxImagePixels = 64000000 } = {}) {
            if (!S?.SKImage || !S?.SKTypeface)
                throw new TypeError('An initialized SkiaSharpWeb namespace is required.');
            this.S = S;
            this.maxBytes = maxBytes;
            this.maxImagePixels = maxImagePixels;
            this.bytes = 0;
            this.revision = 0;
            this.entries = new Map();
            this.fontSessions = new Map(); this.measurements = new Map(); this.measurementCharacters = 0;
            this.metrics = { fontCreates: 0, measurements: 0, measurementHits: 0 };
            this.disposed = false;
        }
        get(name, kind) { const e = this.entries.get(resourceKey(name)); return e && (!kind || e.kind === kind) ? e : null; }
        register(name, input, { kind } = {}) {
            if (this.disposed)
                throw new Error('Resource store has been disposed.');
            const key = resourceKey(name);
            if (!key)
                throw new TypeError('A resource name is required.');
            const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null;
            if (!bytes?.length)
                throw new TypeError('A nonempty Uint8Array or ArrayBuffer is required.');
            const prior = this.entries.get(key);
            if (this.bytes - (prior?.size || 0) + bytes.byteLength > this.maxBytes)
                throw new RangeError('Resource memory budget exceeded.');
            kind = kind || (/\.(shx|shp)$/i.test(name) ? 'shape' : /\.(ttf|otf|ttc)$/i.test(name) ? 'font' : 'image');
            let native = null, shape = null;
            try {
                if (kind === 'font') {
                    native = this.S.SKTypeface.FromData(bytes);
                    if (!native)
                        throw new Error('Skia rejected the font.');
                }
                else if (kind === 'image') {
                    native = this.S.SKImage.FromEncodedData(bytes);
                    if (!native)
                        throw new Error('Skia rejected the image.');
                    if (native.Width * native.Height > this.maxImagePixels)
                        throw new RangeError('Decoded image pixel budget exceeded.');
                }
                else if (kind === 'shape') {
                    if (!A.ShapeFont)
                        throw new Error('The shape-font module is not loaded.');
                    shape = A.ShapeFont.parse(bytes);
                }
                else
                    throw new TypeError('Unknown resource kind: ' + kind);
                const entry = { name: String(name), key, kind, size: bytes.byteLength, native, shape };
                this.entries.set(key, entry);
                this.bytes += bytes.byteLength - (prior?.size || 0);
                this.revision++;
                this.clearTextCaches();
                prior?.native?.Dispose();
                return entry;
            }
            catch (error) {
                native?.Dispose();
                throw error;
            }
        }
        createFont(entry) {
            // Measure at a large em size; native glyph metrics can quantize at 1/64.
            // Keeping 256 font units per DXF cap height avoids tiny-font quantization.
            const font = new this.S.SKFont(entry.native, 1024);
            font.Hinting = this.S.SKFontHinting.None;
            font.LinearMetrics = true;
            font.Subpixel = true;
            if (!entry.capHeightAtUnit) {
                const m = font.Metrics;
                entry.capHeightAtUnit = Math.max(1e-6, Math.abs(m.CapHeight || -font.GetGlyphBounds(font.GetGlyphs('H'))[0]?.Top || 1024)) / 1024;
            }
            font.DxfUnit = 256;
            font.Size = font.DxfUnit / entry.capHeightAtUnit;
            return font;
        }
        fontSession(entry) {
            if (this.disposed || this.entries.get(entry.key) !== entry || entry.kind !== 'font')
                throw new Error('Font resource is no longer registered.');
            let session = this.fontSessions.get(entry);
            if (session) { this.fontSessions.delete(entry); this.fontSessions.set(entry, session); return session; }
            const font = this.createFont(entry); let shaper;
            try { shaper = new this.S.SKShaper(entry.native); }
            catch (error) { font.Dispose(); throw error; }
            session = { font, shaper }; this.metrics.fontCreates++;
            if (this.fontSessions.size >= 64) {
                const first = this.fontSessions.keys().next().value, old = this.fontSessions.get(first);
                old.shaper.Dispose(); old.font.Dispose(); this.fontSessions.delete(first);
            }
            this.fontSessions.set(entry, session); return session;
        }
        clearTextCaches() {
            for (const session of this.fontSessions.values()) { session.shaper.Dispose(); session.font.Dispose(); }
            this.fontSessions.clear(); this.measurements.clear(); this.measurementCharacters = 0;
        }
        measureText(primitive, text) {
            if (this.disposed) throw new Error('Resource store has been disposed.');
            text = String(text);
            if (text.length > 100000) throw new RangeError('Text measurement budget exceeded.');
            const entry = this.get(primitive.font, 'font') || this.get(primitive.fontName, 'font');
            const shape = this.get(primitive.font, 'shape');
            const cacheKey = (entry?.key || shape?.key || '') + '\0' + text;
            if (this.measurements.has(cacheKey)) {
                const value = this.measurements.get(cacheKey); this.metrics.measurementHits++;
                this.measurements.delete(cacheKey); this.measurements.set(cacheKey, value); return value;
            }
            this.metrics.measurements++;
            let width;
            if (entry) { const { font } = this.fontSession(entry); width = font.MeasureText(text) / font.DxfUnit; }
            else { width = 0; for (const ch of text) width += shape?.shape.glyph(ch.codePointAt(0))?.advance / (shape?.shape.above || 1) || A.draftingGlyph(ch).advance; }
            // Both entry count and stored string volume are bounded.
            while (this.measurements.size && (this.measurements.size >= 4096 || this.measurementCharacters + cacheKey.length > 1000000)) {
                const first = this.measurements.keys().next().value; this.measurementCharacters -= first.length; this.measurements.delete(first);
            }
            if (cacheKey.length <= 1000000) { this.measurements.set(cacheKey, width); this.measurementCharacters += cacheKey.length; }
            return width;
        }
        remove(name) { const key = resourceKey(name), e = this.entries.get(key); if (!e)
            return false; this.clearTextCaches(); this.entries.delete(key); this.bytes -= e.size; this.revision++; e.native?.Dispose(); return true; }
        dispose() { if (this.disposed)
            return; this.disposed = true; this.clearTextCaches(); for (const e of this.entries.values())
            e.native?.Dispose(); this.entries.clear(); this.bytes = 0; this.revision++; }
    }
    class ByteReader {
        constructor(bytes) { this.bytes = bytes; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.i = 0; }
        require(n) { if (n < 0 || this.i + n > this.bytes.length)
            throw new RangeError('Truncated shape resource.'); }
        u8() { this.require(1); return this.bytes[this.i++]; }
        i8() { const b = this.u8(); return b > 127 ? b - 256 : b; }
        u16() { this.require(2); const n = this.view.getUint16(this.i, true); this.i += 2; return n; }
        take(n) { this.require(n); const result = this.bytes.subarray(this.i, this.i + n); this.i += n; return result; }
        string() { const start = this.i; while (this.u8() !== 0) { } return new TextDecoder('windows-1252').decode(this.bytes.subarray(start, this.i - 1)); }
    }
    class ShapeFont {
        constructor({ name = '', above = 10, below = 0, unicode = false, shapes = new Map() } = {}) { Object.assign(this, { name, above, below, unicode, shapes }); this.cache = new Map(); }
        static parse(bytes) {
            const prefix = new TextDecoder('ascii').decode(bytes.subarray(0, Math.min(64, bytes.length))), marker = bytes.indexOf(0x1a), reader = new ByteReader(bytes), shapes = new Map();
            if (prefix.startsWith('AutoCAD-86 bigfont'))
                throw new Error('Bigfont SHX uses a separate multibyte mapping and is not supported.');
            if (marker < 0 || marker > 40)
                throw new Error('Expected a standard SHX shape or unifont header.');
            reader.i = marker + 1;
            if (prefix.startsWith('AutoCAD-86 shapes')) {
                const first = reader.u16(), last = reader.u16(), count = reader.u16();
                if (count > 32768)
                    throw new RangeError('SHX index budget exceeded.');
                const entries = Array.from({ length: count }, () => [reader.u16(), reader.u16()]);
                if (entries.length && (entries[0][0] !== first || entries.at(-1)[0] !== last))
                    throw new Error('Inconsistent SHX shape index.');
                for (const [id, size] of entries) {
                    const record = new ByteReader(reader.take(size)), name = record.string();
                    shapes.set(id, { name, bytes: record.take(size - record.i) });
                }
                const zero = shapes.get(0), above = zero?.bytes[0] || 10, below = zero?.bytes[1] || 0;
                return new ShapeFont({ name: zero?.name || 'SHX shapes', above, below, shapes });
            }
            if (prefix.startsWith('AutoCAD-86 unifont')) {
                reader.require(6);
                reader.i += 6;
                const name = reader.string(), above = reader.u8(), below = reader.u8();
                reader.take(4);
                while (reader.i < bytes.length) {
                    if (shapes.size >= 65536)
                        throw new RangeError('SHX glyph budget exceeded.');
                    const id = reader.u16(), size = reader.u16(), r = new ByteReader(reader.take(size)), glyphName = r.string();
                    shapes.set(id, { name: glyphName, bytes: r.take(size - r.i) });
                }
                return new ShapeFont({ name, above: above || 10, below, unicode: true, shapes });
            }
            throw new Error('Unsupported SHX header; textual SHP files must first be compiled to SHX.');
        }
        glyph(code, { vertical = false, maxOperations = 20000, maxDepth = 24 } = {}) {
            const key = code + ':' + vertical;
            if (this.cache.has(key))
                return this.cache.get(key);
            if (!this.shapes.has(code))
                return null;
            const path = [], stack = [], active = new Set();
            let p = G.vec(), down = true, unit = 1, operations = 0;
            const move = q => { path.push([down ? 'L' : 'M', q]); p = q; }, arc = (radius, a, sweep) => { const c = G.sub(p, G.vec(Math.cos(a) * radius, Math.sin(a) * radius)), segment = G.arcPath(c, G.vec(radius, 0), G.vec(0, radius), a, sweep); if (down)
                path.push(...segment.slice(1));
            else
                path.push(['M', segment.at(-1)[2]]); p = segment.at(-1)[2]; };
            const vectors = [[1, 0], [1, .5], [1, 1], [.5, 1], [0, 1], [-.5, 1], [-1, 1], [-1, .5], [-1, 0], [-1, -.5], [-1, -1], [-.5, -1], [0, -1], [.5, -1], [1, -1], [1, -.5]];
            const run = (id, depth) => {
                if (depth > maxDepth || active.has(id))
                    throw new Error('Recursive SHX shape rejected.');
                const shape = this.shapes.get(id);
                if (!shape)
                    throw new Error(`Undefined SHX subshape ${id}.`);
                active.add(id);
                const r = new ByteReader(shape.bytes);
                let skip = false;
                try {
                    while (r.i < shape.bytes.length) {
                        if (++operations > maxOperations)
                            throw new RangeError('SHX operation budget exceeded.');
                        const code = r.u8(), execute = !skip;
                        skip = false;
                        if (code === 0)
                            return;
                        if (code > 14) {
                            if (execute) {
                                const v = vectors[code & 15], n = (code >> 4) * unit;
                                move(G.add(p, G.vec(v[0] * n, v[1] * n)));
                            }
                            continue;
                        }
                        if (code === 1) {
                            if (execute) {
                                down = true;
                                path.push(['M', p]);
                            }
                        }
                        else if (code === 2) {
                            if (execute)
                                down = false;
                        }
                        else if (code === 3 || code === 4) {
                            const factor = r.u8();
                            if (!factor)
                                throw new RangeError('Zero SHX scale.');
                            if (execute)
                                unit = code === 3 ? unit / factor : unit * factor;
                        }
                        else if (code === 5) {
                            if (execute) {
                                if (stack.length >= 128)
                                    throw new RangeError('SHX stack budget exceeded.');
                                stack.push({ ...p });
                            }
                        }
                        else if (code === 6) {
                            if (execute) {
                                if (!stack.length)
                                    throw new Error('SHX stack underflow.');
                                p = stack.pop();
                                path.push(['M', p]);
                            }
                        }
                        else if (code === 7) {
                            const child = this.unicode ? r.u16() : r.u8();
                            if (execute)
                                run(child, depth + 1);
                        }
                        else if (code === 8 || code === 9) {
                            do {
                                const x = r.i8(), y = r.i8();
                                if (code === 9 && !x && !y)
                                    break;
                                if (execute)
                                    move(G.add(p, G.vec(x * unit, y * unit)));
                                if (code === 8)
                                    break;
                                if (++operations > maxOperations)
                                    throw new RangeError('SHX vector budget exceeded.');
                            } while (true);
                        }
                        else if (code === 10 || code === 11) {
                            let so = 0, eo = 256, radius;
                            if (code === 11) {
                                so = r.u8();
                                eo = r.u8() || 256;
                                radius = (r.u8() << 8) | r.u8();
                            }
                            else
                                radius = r.u8();
                            const flags = r.u8(), sign = flags & 128 ? -1 : 1, spec = flags & 127, start = (spec >> 4) * Math.PI / 4, span = (spec & 15) || 8;
                            if (execute) {
                                const a = start + sign * so * Math.PI / (4 * 256), sweep = sign * ((span - (code === 11 ? 1 : 0)) * Math.PI / 4 + (code === 11 ? eo * Math.PI / (4 * 256) : 0) - so * Math.PI / (4 * 256));
                                arc(radius * unit, a, sweep);
                            }
                        }
                        else if (code === 12 || code === 13) {
                            do {
                                const x = r.i8(), y = r.i8();
                                if (code === 13 && !x && !y)
                                    break;
                                const bulge = r.i8() / 127;
                                if (execute) {
                                    const q = G.add(p, G.vec(x * unit, y * unit)), part = G.bulgePath(p, q, bulge);
                                    if (down)
                                        path.push(...part.slice(1));
                                    else
                                        path.push(['M', q]);
                                    p = q;
                                }
                                if (code === 12)
                                    break;
                                if (++operations > maxOperations)
                                    throw new RangeError('SHX bulge budget exceeded.');
                            } while (true);
                        }
                        else if (code === 14) {
                            if (execute && !vertical)
                                skip = true;
                        }
                    }
                }
                finally {
                    active.delete(id);
                }
            };
            path.push(['M', p]);
            run(code, 0);
            const result = { path, advance: p.x, above: this.above };
            if (this.cache.size >= 2048)
                this.cache.delete(this.cache.keys().next().value);
            this.cache.set(key, result);
            return result;
        }
    }
    /* Original emergency drafting strokes, authored as source geometry. This is not
     * an installed/embedded font and not a substitute for registering the DXF font. */
    const strokeGlyphs = {
        A: '0,0 .3,1 .6,0|.12,.4 .48,.4', B: '0,0 0,1 .4,1 .6,.85 .6,.65 .4,.5 0,.5|.4,.5 .6,.35 .6,.15 .4,0 0,0',
        C: '.6,.85 .45,1 .15,1 0,.8 0,.2 .15,0 .45,0 .6,.15', D: '0,0 0,1 .35,1 .6,.75 .6,.25 .35,0 0,0',
        E: '.6,1 0,1 0,0 .6,0|0,.5 .45,.5', F: '0,0 0,1 .6,1|0,.5 .45,.5',
        G: '.6,.85 .45,1 .15,1 0,.8 0,.2 .15,0 .45,0 .6,.2 .6,.5 .35,.5', H: '0,0 0,1|.6,0 .6,1|0,.5 .6,.5',
        I: '.05,1 .55,1|.3,1 .3,0|.05,0 .55,0', J: '.1,1 .6,1 .6,.2 .45,0 .15,0 0,.2',
        K: '0,0 0,1|.6,1 0,.4|.2,.6 .6,0', L: '0,1 0,0 .6,0', M: '0,0 0,1 .3,.45 .6,1 .6,0',
        N: '0,0 0,1 .6,0 .6,1', O: '.15,0 0,.2 0,.8 .15,1 .45,1 .6,.8 .6,.2 .45,0 .15,0',
        P: '0,0 0,1 .4,1 .6,.8 .6,.65 .4,.5 0,.5', Q: '.15,0 0,.2 0,.8 .15,1 .45,1 .6,.8 .6,.2 .45,0 .15,0|.35,.25 .65,-.1',
        R: '0,0 0,1 .4,1 .6,.8 .6,.65 .4,.5 0,.5|.3,.5 .65,0', S: '.6,.85 .45,1 .15,1 0,.85 0,.65 .15,.5 .45,.5 .6,.35 .6,.15 .45,0 .15,0 0,.15',
        T: '0,1 .6,1|.3,1 .3,0', U: '0,1 0,.2 .15,0 .45,0 .6,.2 .6,1', V: '0,1 .3,0 .6,1',
        W: '0,1 .12,0 .3,.45 .48,0 .6,1', X: '0,1 .6,0|0,0 .6,1', Y: '0,1 .3,.5 .6,1|.3,.5 .3,0', Z: '0,1 .6,1 0,0 .6,0',
        0: '.15,0 0,.2 0,.8 .15,1 .45,1 .6,.8 .6,.2 .45,0 .15,0|.05,.2 .55,.8',
        1: '.1,.8 .3,1 .3,0|.1,0 .5,0', 2: '0,.8 .1,1 .45,1 .6,.85 .6,.7 0,0 .6,0',
        3: '0,.9 .15,1 .45,1 .6,.85 .6,.7 .4,.5 .2,.5|.4,.5 .6,.3 .6,.15 .45,0 .15,0 0,.1',
        4: '.5,0 .5,1 0,.3 .65,.3', 5: '.6,1 0,1 0,.55 .4,.55 .6,.35 .6,.15 .4,0 .15,0 0,.15',
        6: '.55,.9 .4,1 .15,.9 0,.65 0,.2 .15,0 .4,0 .6,.2 .6,.4 .4,.55 .15,.55 0,.4',
        7: '0,1 .6,1 .1,0', 8: '.15,.5 0,.65 0,.85 .15,1 .45,1 .6,.85 .6,.65 .45,.5 .15,.5 0,.3 0,.15 .15,0 .45,0 .6,.15 .6,.3 .45,.5',
        9: '.6,.6 .45,.45 .15,.45 0,.6 0,.8 .15,1 .4,1 .6,.8 .6,.35 .45,.1 .2,0 .05,.1',
        '-': '.05,.5 .55,.5', '_': '0,0 .6,0', '+': '.05,.5 .55,.5|.3,.75 .3,.25', '=': '.05,.65 .55,.65|.05,.35 .55,.35',
        '/': '0,0 .6,1', '\\': '0,1 .6,0', '(': '.5,1 .25,.8 .15,.5 .25,.2 .5,0', ')': '.1,1 .35,.8 .45,.5 .35,.2 .1,0',
        '[': '.5,1 .15,1 .15,0 .5,0', ']': '.1,1 .45,1 .45,0 .1,0', '<': '.55,.85 .1,.5 .55,.15', '>': '.1,.85 .55,.5 .1,.15',
        '.': '.25,.025 .3,.025', ',': '.3,.05 .2,-.1', ':': '.25,.2 .3,.2|.25,.7 .3,.7', ';': '.3,.2 .2,.05|.25,.7 .3,.7',
        '!': '.3,1 .3,.25|.3,.04 .3,0', '?': '0,.8 .1,1 .45,1 .6,.8 .5,.65 .3,.5 .3,.25|.3,.04 .3,0',
        '°': '.2,.7 .1,.8 .1,.95 .2,1 .35,1 .45,.9 .45,.8 .35,.7 .2,.7',
        '±': '.05,.65 .55,.65|.3,.9 .3,.4|.05,.1 .55,.1', 'Ω': '0,0 .2,0 .05,.3 0,.65 .15,1 .45,1 .6,.65 .55,.3 .4,0 .6,0',
        'Ø': '.15,0 0,.2 0,.8 .15,1 .45,1 .6,.8 .6,.2 .45,0 .15,0|0,-.1 .6,1.1'
    };
    const glyphCache = new Map();
    function draftingGlyph(character) {
        if (character === ' ')
            return { path: [], advance: .4 };
        const key = character.toUpperCase();
        if (glyphCache.has(key))
            return glyphCache.get(key);
        const source = strokeGlyphs[key], path = [];
        if (source)
            for (const stroke of source.split('|')) {
                const points = stroke.split(' ').map(pair => { const [x, y] = pair.split(',').map(Number); return G.vec(x, y); });
                path.push(...G.pathFromPoints(points));
            }
        else {
            path.push(...G.pathFromPoints([G.vec(0, 0), G.vec(.6, 0), G.vec(.6, 1), G.vec(0, 1)], true));
            path.push(['M', G.vec(0, 0)], ['L', G.vec(.6, 1)]);
        }
        const result = { path, advance: .75 };
        if (glyphCache.size < 512)
            glyphCache.set(key, result);
        return result;
    }
    Object.assign(A, { ResourceStore, resourceKey, ShapeFont, draftingGlyph });
    if (typeof module === 'object' && module.exports)
        module.exports = A;
})(globalThis);


// packages/dxf-skia/src/proxy.js
/* Bounded proxy-graphics stream subset. Unknown opcodes are diagnosed, never
 * mistaken for geometry. Data remains on the owning DXF record for providers. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, G = A.geometry;
    function decodeProxy(compiler, entity, context, style) {
        const hex = entity.all(310).join('').replace(/\s/g, '');
        if (!hex) {
            compiler.diagnostic('proxy-empty', 'Proxy entity contains no stored graphics.', entity);
            return;
        }
        if (hex.length > 32 * 1024 * 1024 || hex.length % 2 || !/^[0-9a-f]*$/i.test(hex))
            throw new RangeError('Invalid or oversized proxy graphic data.');
        const bytes = Uint8Array.from(hex.match(/../g), h => parseInt(h, 16)), view = new DataView(bytes.buffer);
        let offset = 8, count = 0, current = { ...style }, matrix = context.matrix, fill = false;
        const matrices = [];
        while (offset < bytes.length) {
            if (++count > 100000)
                throw new RangeError('Proxy operation budget exceeded.');
            if (offset + 8 > bytes.length)
                throw new RangeError('Truncated proxy record.');
            const size = view.getUint32(offset, true), type = view.getUint32(offset + 4, true), end = offset + size;
            if (size < 8 || end > bytes.length)
                throw new RangeError('Proxy chunk length outside stream.');
            let at = offset + 8;
            const need = n => { if (at + n > end)
                throw new RangeError('Truncated proxy payload.'); };
            const u32 = () => { need(4); const n = view.getUint32(at, true); at += 4; return n; }, number = () => { need(8); const n = view.getFloat64(at, true); at += 8; if (!Number.isFinite(n))
                throw new RangeError('Nonfinite proxy coordinate.'); return n; }, point = () => G.vec(number(), number(), number());
            const points = () => { const n = u32(); if (n > 65536)
                throw new RangeError('Proxy vertex budget exceeded.'); need(n * 24); return Array.from({ length: n }, point); };
            const c = { ...context, matrix };
            if (type === 1) { } // EXTENTS is metadata, not drawable geometry.
            else if (type === 14)
                current.color = A.aciColor(u32(), compiler.options.background);
            else if (type === 22) {
                const raw = u32();
                current.color = '#' + (raw & 0xffffff).toString(16).padStart(6, '0');
            }
            else if (type === 20)
                fill = !!u32();
            else if (type === 23) {
                current.lineweight = u32();
                if (current.lineweight > 211)
                    current.lineweight = 25;
            }
            else if (type === 24)
                current.dashScale = number();
            else if (type === 16) {
                const layer = Object.values(compiler.document.tables.layers)[u32()];
                if (layer)
                    current = { ...current, layer: layer.name, color: layer.trueColor ? '#' + ((layer.trueColor.red << 16) | (layer.trueColor.green << 8) | layer.trueColor.blue).toString(16).padStart(6, '0') : A.aciColor(layer.colorNumber, compiler.options.background) };
            }
            else if (type === 29 || type === 30) {
                if (matrices.length >= 48)
                    throw new RangeError('Proxy transform stack overflow.');
                need(128);
                const m = Array.from({ length: 16 }, number);
                matrices.push(matrix);
                matrix = G.multiply(matrix, Array.from({ length: 16 }, (_, i) => m[(i % 4) * 4 + Math.floor(i / 4)]));
            }
            else if (type === 31) {
                if (!matrices.length)
                    throw new Error('Proxy transform stack underflow.');
                matrix = matrices.pop();
            }
            else if (type === 2 || type === 4) {
                const center = point(), radius = number(), n = G.normal(point()), basis = G.ocs(n);
                let u = G.direction(basis, G.vec(radius, 0)), v = G.direction(basis, G.vec(0, radius)), sweep = G.TAU;
                if (type === 4) {
                    u = G.mul(G.normal(point()), radius);
                    v = G.mul(G.normal(G.cross(n, u)), radius);
                    sweep = number();
                }
                compiler.emit(entity, c, current, { kind: 'path', path: G.arcPath(center, u, v, 0, sweep), center: G.transform(matrix, center), closed: type === 2 });
                fill = false;
            }
            else if (type === 6 || type === 7 || type === 32) {
                const ps = points();
                compiler.path(entity, c, current, ps, type === 7, type === 7 && fill);
                fill = false;
            }
            else if (type === 12 || type === 13) {
                const a = point(), b = point();
                compiler.emit(entity, c, current, { kind: 'path', points: [a, b], infinite: type === 12 ? 'line' : 'ray' });
                fill = false;
            }
            else if (type === 8) {
                const rows = u32(), cols = u32();
                if (rows * cols > 65536 || rows < 2 || cols < 2)
                    throw new RangeError('Proxy mesh size invalid.');
                const ps = Array.from({ length: rows * cols }, point);
                for (let r = 0; r < rows - 1; r++)
                    for (let q = 0; q < cols - 1; q++)
                        compiler.path(entity, c, current, [ps[r * cols + q], ps[r * cols + q + 1], ps[(r + 1) * cols + q + 1], ps[(r + 1) * cols + q]], true, true, { face: true });
                fill = false;
                if (at < end)
                    compiler.diagnostic('proxy-mesh-traits', 'Per-face/vertex proxy mesh traits are not applied.', entity);
            }
            else if (type === 9) {
                const ps = points(), n = u32();
                if (n > 1000000)
                    throw new RangeError('Proxy face budget exceeded.');
                let used = 0;
                while (used < n) {
                    const count = u32() | 0;
                    used++;
                    if (count < 3)
                        throw new RangeError('Proxy holes/invalid face need a custom provider.');
                    if (used + count > n)
                        throw new RangeError('Truncated proxy shell face.');
                    const face = Array.from({ length: count }, () => ps[u32()]);
                    used += count;
                    if (face.some(p => !p))
                        throw new RangeError('Proxy face index out of range.');
                    compiler.path(entity, c, current, face, true, true, { face: true });
                }
                fill = false;
            }
            else
                compiler.diagnostic('proxy-opcode', `Proxy graphics opcode ${type} is not implemented; that command was omitted.`, entity);
            offset = end;
        }
        if (matrices.length)
            compiler.diagnostic('proxy-stack', 'Unbalanced proxy transform stack at end of stream.', entity);
    }
    A.decodeProxy = decodeProxy;
    if (typeof module === 'object' && module.exports)
        module.exports = A;
})(globalThis);


// packages/dxf-skia/src/text.js
/* Font-independent text arrangement. A host may inject native metrics without
 * coupling the tagged document or geometry compiler to a graphics runtime. */
(function (root) {
    'use strict';
    const A = root.DxfSkia;
    function fallbackTextWidth(text) { return Array.from(text).reduce((n, c) => n + (A.draftingGlyph?.(c)?.advance ?? .7), 0); }
    function layoutText(primitive, measure = fallbackTextWidth, { maxCharacters = 100000, maxLines = 4096 } = {}) {
        const source = String(primitive.text || '');
        if (source.length > maxCharacters)
            throw new RangeError('Text character budget exceeded.');
        const wrap = primitive.mtext && primitive.wrapWidth > 0 ? primitive.wrapWidth : Infinity;
        const lines = [];
        const append = text => { if (lines.length >= maxLines)
            throw new RangeError('Text line budget exceeded.'); const width = measure(text); if (!Number.isFinite(width) || width < 0)
            throw new RangeError('Invalid text measurement.'); lines.push({ text, width }); };
        for (const paragraph of source.split('\n')) {
            if (!Number.isFinite(wrap) || measure(paragraph) <= wrap) {
                append(paragraph);
                continue;
            }
            let line = '', width = 0;
            for (const token of paragraph.match(/\S+|\s+/gu) || []) {
                const w = measure(token);
                if (line && width + w > wrap) {
                    append(line.trimEnd());
                    line = '';
                    width = 0;
                }
                if (!line && /^\s+$/u.test(token))
                    continue;
                if (w <= wrap) {
                    line += token;
                    width += w;
                    continue;
                }
                for (const ch of token) {
                    const cw = measure(ch);
                    if (line && width + cw > wrap) {
                        append(line);
                        line = '';
                        width = 0;
                    }
                    line += ch;
                    width += cw;
                }
            }
            if (line || !lines.length)
                append(line.trimEnd());
        }
        if (!lines.length)
            append('');
        const spacing = Math.max(.25, Math.min(4, primitive.lineSpacing || 1)) * 1.25, descent = .2;
        const height = (lines.length - 1) * spacing + 1 + descent;
        const naturalWidth = Math.max(0, ...lines.map(l => l.width));
        const alignmentWidth = Number.isFinite(wrap) ? wrap : naturalWidth;
        let baseline = 0;
        if (primitive.mtext)
            baseline = primitive.vertical === 1 ? 1 - height / 2 : primitive.vertical === 2 ? 1 - height : 1;
        else
            baseline = primitive.vertical === 3 ? 1 : primitive.vertical === 2 ? (1 - descent) / 2 : primitive.vertical === 1 ? -descent : 0;
        for (let i = 0; i < lines.length; i++)
            Object.assign(lines[i], { x: -(primitive.align || 0) * alignmentWidth / 2, y: baseline + i * spacing });
        const left = lines[0].x, right = left + Math.max(naturalWidth, .01), top = baseline - 1, bottom = baseline + (lines.length - 1) * spacing + descent;
        return { lines, left, top, right, bottom, width: right - left, height: bottom - top, spacing };
    }
    Object.assign(A, { layoutText, fallbackTextWidth });
    if (typeof module === 'object' && module.exports)
        module.exports = A;
})(globalThis);


// packages/dxf-skia/src/compiler.js
/* A retained geometry compiler. The Skia backend consumes these primitives, not
 * the previous rendering library's entity classes, frames, or tessellator. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, G = A.geometry, { vec, add, sub, mul, dot, cross, normal, length, distance, identity, multiply, translation, rotation, scaling, transform, direction, ocs, arcPath, pathFromPoints, transformPath, bulgePath, flatten, bounds, emptyBounds, union, TAU, EPS } = G;
    const radians = n => n * Math.PI / 180;
    const positiveSweep = (a, b, ccw = true) => { if (!Number.isFinite(a) || !Number.isFinite(b))
        throw new RangeError('Finite curve angles required.'); const d = ((ccw ? b - a : a - b) % TAU + TAU) % TAU; return (ccw ? 1 : -1) * (d || TAU); };
    const rgb = n => '#' + (Number(n) & 0xffffff).toString(16).padStart(6, '0');
    const mapGet = (map, name) => map instanceof Map ? map.get(A.key(name)) || map.get(name) : map?.[A.key(name)] || map?.[name];
    const coordFields = ['x', 'y', 'z'];
    const casedFrozen = (set, name) => set?.has(A.key(name)) || false;
    // Decode DXF escapes in one pass: escaped braces are characters, not scope
    // delimiters, and a Unicode escape consumes exactly four hexadecimal digits.
    function plainText(value) {
        const input = String(value ?? '');
        if (input.length > 1000000) throw new RangeError('Text budget exceeded.');
        let out = '';
        for (let i = 0; i < input.length;) {
            const ch = input[i++];
            if (ch === '{' || ch === '}') continue;
            if (ch === '%' && input[i] === '%') {
                const code = input[i + 1]?.toLowerCase(), symbol = { d: '°', p: '±', c: 'Ø' }[code];
                if (symbol) { out += symbol; i += 2; continue; }
            }
            if (ch !== '\\') { out += ch; continue; }
            const code = input[i++];
            if (code === undefined) { out += '\\'; break; }
            if ('\\{}'.includes(code)) { out += code; continue; }
            if (code === 'U' && input[i] === '+' && /^[0-9a-f]{4}$/i.test(input.slice(i + 1, i + 5))) {
                out += String.fromCharCode(parseInt(input.slice(i + 1, i + 5), 16)); i += 5; continue;
            }
            if (code === 'P' || code === 'X') { out += '\n'; continue; }
            if (code === '~') { out += '\u00a0'; continue; }
            if ('LlOoKk'.includes(code)) continue;
            if ('ACHQWTFfcptS'.includes(code)) {
                const end = input.indexOf(';', i);
                if (end >= 0) {
                    if (code === 'S') out += input.slice(i, end).replace(/[\^#]/g, '/');
                    i = end + 1; continue;
                }
            }
            // A malformed/unknown escape remains visible rather than swallowing text.
            out += '\\' + code;
        }
        return out;
    }
    class SceneCompiler {
        constructor(document, options = {}) {
            if (!(document instanceof A.DxfDocument))
                throw new TypeError('SceneCompiler requires a DxfDocument.');
            this.document = document;
            this.options = { tolerance: .02, maxPrimitives: 500000, maxVertices: 3000000, maxDepth: 48, maxInstances: 100000, maxPatternLines: 20000, maxHatchLoops: 4096, background: '#212830', ...options };
            if (!(this.options.tolerance > 0) || !Number.isFinite(this.options.tolerance))
                throw new RangeError('Positive finite tessellation tolerance required.');
            for (const name of ['maxPrimitives', 'maxVertices', 'maxDepth', 'maxInstances', 'maxPatternLines', 'maxHatchLoops'])
                if (!Number.isSafeInteger(this.options[name]) || this.options[name] < 1)
                    throw new RangeError('Positive integer ' + name + ' required.');
            this.plugins = new Map(options.plugins || []);
            this.diagnostics = new A.Diagnostics(options.maxDiagnostics);
            this.primitives = [];
            this.vertices = 0;
            this.instances = 0;
            this.extents = emptyBounds();
            this.sortedLists = new WeakMap();
            this.sortTables = document.objects.filter(r => r.type === 'SORTENTSTABLE');
        }
        diagnostic(code, message, e, severity = 'warning') { this.diagnostics.add(code, message, e, severity); }
        compile(layout = 'Model') {
            this.primitives = [];
            this.vertices = 0;
            this.instances = 0;
            this.extents = emptyBounds();
            this.diagnostics = new A.Diagnostics(this.options.maxDiagnostics);
            for (const issue of this.document.diagnostics.items)
                this.diagnostics.add(issue.code, issue.message, { id: issue.handle, ...issue }, issue.severity);
            const context = { matrix: identity(), layer: '0', color: null, alpha: 1, blocks: [], handles: [], clips: [], depth: 0, layout };
            this.compileList(this.document.getEntities(layout), context);
            const result = { layout, document: this.document, compileOptions: { ...this.options }, primitives: this.primitives, bounds: this.extents, diagnostics: this.diagnostics.items, diagnosticCounts: this.diagnostics.counts,
                stats: { primitives: this.primitives.length, vertices: this.vertices, instances: this.instances } };
            result.index = new A.SpatialIndex(this.primitives.map((primitive, index) => ({ primitive, index, bounds: primitive.bounds })));
            return result;
        }
        compileList(list, context) {
            let entities = list;
            if (this.sortedLists.has(list)) entities = this.sortedLists.get(list);
            else {
            const orders = new Map(), owners = new Set(list.map(e=>e.ownerHandle));
            for (const table of this.sortTables) {
                const owner = A.key(table.all(330).at(-1));
                if (!owners.has(owner))
                    continue;
                let handle = null;
                for (const t of table.tags) {
                    if (t.code === 331)
                        handle = A.key(t.value);
                    else if (t.code === 5 && handle) {
                        orders.set(handle, A.key(t.value));
                        handle = null;
                    }
                }
            }
            if (orders.size)
                entities = list.map((entity, index) => ({ entity, index, order: orders.get(entity.handle) || entity.handle })).sort((a, b) => {
                    if (!/^[0-9a-f]+$/i.test(a.order) || !/^[0-9a-f]+$/i.test(b.order))
                        return a.index - b.index;
                    const x = BigInt('0x' + a.order), y = BigInt('0x' + b.order);
                    if (x === y)
                        return a.index - b.index;
                    if (x === 0n)
                        return 1;
                    if (y === 0n)
                        return -1;
                    return x < y ? -1 : 1;
                }).map(x => x.entity);
            this.sortedLists.set(list, entities);
            }
            for (const entity of entities) {
                if (this.primitives.length >= this.options.maxPrimitives || this.vertices >= this.options.maxVertices) {
                    this.diagnostic('geometry-budget', 'Geometry budget reached; remaining objects were not compiled.', entity, 'error');
                    break;
                }
                try {
                    this.compileEntity(entity, context);
                }
                catch (error) {
                    this.diagnostic('invalid-geometry', error.message, entity, 'error');
                }
            }
        }
        style(e, context) {
            const layerName = A.key(e.layer) === '0' ? context.layer : e.layer, layer = this.document.layer(layerName), override = mapGet(this.options.layerState, layerName);
            if (override?.isOn === false || override?.isFrozen === true)
                return null;
            if ((override?.isFrozen ?? !!(layer.flags & 1)) || !(override?.isOn ?? (layer.colorNumber >= 0)))
                return null;
            if (e.num(60) === 1 || casedFrozen(context.viewportFrozen, layerName) || this.options.printing && layer.plot === false)
                return null;
            if (!['INSERT', 'MINSERT'].includes(e.type) && this.options.entityIsolation?.size && !this.options.entityIsolation.has(e.handle) && !context.handles.some(h => this.options.entityIsolation.has(h)))
                return null;
            let colorNumber = e.num(62, 256), color;
            const explicit = e.get(420);
            if (explicit !== null)
                color = rgb(explicit);
            else if (colorNumber === 0)
                color = context.color || A.aciColor(layer.colorNumber, this.options.background);
            else if (colorNumber === 256) {
                const tc = override?.trueColor || layer.trueColor;
                color = tc ? rgb((tc.red << 16) | (tc.green << 8) | tc.blue) : A.aciColor(override?.colorNumber ?? layer.colorNumber, this.options.background);
            }
            else
                color = A.aciColor(colorNumber, this.options.background);
            const alpha = A.transparency(e.get(440), context.alpha, override?.transparencyAlpha ?? layer.transparency?.alpha ?? 1);
            let lineName = String(e.get(6, 'BYLAYER'));
            if (A.key(lineName) === 'BYLAYER')
                lineName = override?.linetype || layer.linetype || 'CONTINUOUS';
            if (A.key(lineName) === 'BYBLOCK')
                lineName = context.linetype || 'CONTINUOUS';
            const linetype = this.document.linetype(lineName);
            if (linetype?.complex)
                this.diagnostic('complex-linetype', 'Text/shape components of complex linetypes require a custom entity/linetype provider; dash geometry is retained.', e);
            let weight = e.num(370, -1);
            if (weight === -1)
                weight = override?.lineweight ?? layer.lineweight;
            if (weight === -2)
                weight = context.lineweight ?? -3;
            if (weight < 0)
                weight = this.document.headerNumber('$LWDEFAULT', 25);
            return { layer: layerName, color, alpha, lineweight: weight, locked: override?.isLocked ?? !!(layer.flags & 4), linetype: lineName, dash: linetype?.pattern || [], dashScale: this.document.headerNumber('$LTSCALE', 1) * Math.abs(e.num(48, 1)), lineweightVisible: !!this.options.lineweights || this.document.headerNumber('$LWDISPLAY') !== 0 };
        }
        emit(e, context, style, data) {
            if (this.primitives.length >= this.options.maxPrimitives)
                throw new RangeError('Primitive budget exceeded.');
            const matrix = data.matrix || context.matrix;
            if (data.path) {
                data.path = transformPath(data.path, matrix);
                const f = flatten(data.path, this.options.tolerance, 65536);
                if (f.truncated)
                    this.diagnostic('curve-budget', 'Picking tessellation reached its point limit.', e);
                data.rings = f.rings;
                data.points = f.points;
            }
            if (data.points && !data.path)
                data.points = data.points.map(p => transform(matrix, p));
            if (data.position)
                data.position = transform(matrix, data.position);
            if (data.u)
                data.u = direction(matrix, data.u);
            if (data.v)
                data.v = direction(matrix, data.v);
            if (data.curve) data.curve = { ...data.curve, center: transform(matrix, data.curve.center),
                u: direction(matrix, data.curve.u), v: direction(matrix, data.curve.v) };
            if (data.gradient) data.gradient = { ...data.gradient, origin: transform(matrix, data.gradient.origin),
                u: direction(matrix, data.gradient.u), v: direction(matrix, data.gradient.v) };
            if (data.text) {
                const layout = A.layoutText(data, this.options.textMeasurer ? t => this.options.textMeasurer(data, t) : A.fallbackTextWidth);
                data.textLayout = layout;
                const point = (x, y) => add(data.position, add(mul(data.u, x), mul(data.v, -y)));
                data.points = [point(layout.left, layout.top), point(layout.right, layout.top), point(layout.right, layout.bottom), point(layout.left, layout.bottom)];
            }
            const points = data.points || [];
            if (points.some(p => !G.validPoint(p)))
                throw new RangeError('A primitive contains a nonfinite coordinate.');
            this.vertices += points.length;
            if (this.vertices > this.options.maxVertices)
                throw new RangeError('Vertex budget exceeded.');
            const primitive = { ...data, id: `${e.id}:${this.primitives.length}`, source: e, handle: context.handles[0] || e.handle || e.id, entityHandle: e.handle || e.id, type: e.type, blockPath: context.blocks.slice(), instancePath: context.handles.slice(), style: { ...style }, clips: context.clips.slice(), bounds: data.path ? G.pathBounds(data.path) : bounds(points) };
            delete primitive.matrix;
            if (data.infinite)
                primitive.bounds = { minX: -1e30, minY: -1e30, maxX: 1e30, maxY: 1e30, minZ: 0, maxZ: 0 };
            else
                union(this.extents, primitive.bounds);
            this.primitives.push(primitive);
            if (context.thicknessVector && data.path && !data.widePolyline) {
                const offset = context.thicknessVector, ctx = { ...context, matrix: identity(), thicknessVector: null };
                this.emit(e, ctx, style, { kind: 'path', path: transformPath(data.path, translation(offset)), closed: data.closed, fill: !!data.fill, face: !!data.face });
                for (const ring of data.rings)
                    for (let i = 1; i < ring.length; i++)
                        this.path(e, ctx, style, [ring[i - 1], ring[i], add(ring[i], offset), add(ring[i - 1], offset)], true, true, { face: true });
            }
            return primitive;
        }
        path(e, c, s, points, close = false, fill = false, extra = {}) { return this.emit(e, c, s, { kind: 'path', path: pathFromPoints(points, close), fill, closed: close, ...extra }); }
        compileEntity(e, c) {
            const s = this.style(e, c);
            if (!s)
                return;
            const type = e.type;
            const thickness = e.num(39);
            const extrudable = ['LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE', 'SOLID', 'TRACE'].includes(type);
            c = { ...c, thicknessVector: thickness && extrudable ? direction(c.matrix, mul(normal(e.extrusion), thickness)) : null };
            if (thickness && !extrudable)
                this.diagnostic('entity-thickness', 'Thickness is not applied to this entity family.', e);
            if (!['INSERT', 'MINSERT'].includes(type) && this.options.blockIsolation?.size && !c.blocks.some(name => this.options.blockIsolation.has(A.key(name))))
                return;
            if (e.get(347))
                this.diagnostic('material-unlit', 'MATERIAL references are retained; the current native pipeline uses unlit entity colors.', e);
            const localOCS = () => ({ ...c, matrix: multiply(c.matrix, ocs(e.extrusion)) });
            if (type === 'VIEWPORT') {
                this.viewport(e, c, s);
                return;
            }
            if (type === 'INSERT' || type === 'MINSERT') {
                this.insert(e, c, s);
                return;
            }
            if (type === 'LINE') {
                this.path(e, c, s, [e.point(10), e.point(11)]);
                return;
            }
            if (type === 'POINT') {
                this.emit(e, c, s, { kind: 'point', points: [e.point(10)], size: this.document.headerNumber('$PDSIZE'), mode: this.document.headerNumber('$PDMODE') });
                return;
            }
            if (type === 'CIRCLE' || type === 'ARC') {
                const r = e.num(40);
                if (!(r > 0))
                    throw new RangeError('Arc radius must be positive.');
                const p = e.point(10), start = type === 'ARC' ? radians(e.num(50)) : 0, sweep = type === 'ARC' ? positiveSweep(start, radians(e.num(51))) : TAU;
                this.emit(e, localOCS(), s, { kind: 'path', path: arcPath(p, vec(r, 0), vec(0, r), start, sweep), closed: type === 'CIRCLE', curve: { center: p, u: vec(r, 0), v: vec(0, r), start, sweep }, center: transform(multiply(c.matrix, ocs(e.extrusion)), p), radius: r, fill: false });
                return;
            }
            if (type === 'ELLIPSE') {
                const center = e.point(10), u = e.point(11), ratio = e.num(40, 1);
                if (!(length(u) > 0 && ratio > 0))
                    throw new RangeError('Invalid ellipse axes.');
                const v = mul(normal(cross(normal(e.extrusion), u)), length(u) * ratio), start = e.num(41), end = e.num(42, TAU);
                this.emit(e, c, s, { kind: 'path', path: arcPath(center, u, v, start, positiveSweep(start, end)), closed: Math.abs(positiveSweep(start, end) - TAU) < 1e-9, curve: { center, u, v, start, sweep: positiveSweep(start, end) }, center: transform(c.matrix, center) });
                return;
            }
            if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
                this.polyline(e, c, s);
                return;
            }
            if (type === 'SPLINE' || type === 'HELIX') {
                const spline = type === 'HELIX' ? e.subclass('AcDbSpline') : e, cp = spline.points(10);
                if (cp.length) {
                    const points = G.sampleNurbs(cp, spline.num(71, 3), spline.all(40).map(Number), spline.all(41).map(Number), this.options.tolerance);
                    this.path(e, c, s, points, !!(spline.num(70) & 1));
                }
                else if (type === 'HELIX') {
                    const h = e.subclass('AcDbHelix'), origin = h.point(10), n = normal(h.point(12, vec(0, 0, 1))), u0 = sub(h.point(11, vec(1, 0)), origin), u = sub(u0, mul(n, dot(u0, n))), v = normal(cross(n, u));
                    const turns = h.num(41, 1), pitch = h.num(42, 1), r1 = h.num(40, length(u)), count = Math.min(16384, Math.max(32, Math.ceil(Math.abs(turns) * 96))), sign = h.num(290, 1) ? 1 : -1;
                    const points = Array.from({ length: count + 1 }, (_, i) => { const t = i / count, a = TAU * turns * t * sign, r = length(u) + (r1 - length(u)) * t; return add(origin, add(mul(n, pitch * turns * t), add(mul(normal(u), Math.cos(a) * r), mul(v, Math.sin(a) * r)))); });
                    this.path(e, c, s, points);
                }
                else {
                    const points = spline.points(11);
                    if (points.length < 2)
                        throw new RangeError('Spline contains neither control points nor fit points.');
                    const path = G.interpolateFitPoints(points, { closed: !!(spline.num(70) & 3),
                        startTangent: spline.get(12) == null ? null : spline.point(12), endTangent: spline.get(13) == null ? null : spline.point(13) });
                    this.emit(e, c, s, { kind: 'path', path, closed: !!(spline.num(70) & 3) });
                    this.diagnostic('spline-fit-interpolated', 'Fit-only SPLINE uses chord-length C2 cubic interpolation with supplied tangent directions or natural endpoints; periodic when closed.', e, 'info');
                }
                return;
            }
            if (['SOLID', 'TRACE', '3DFACE'].includes(type)) {
                const ps = [e.point(10), e.point(11), e.point(12), e.point(13, e.point(12))];
                if (type !== '3DFACE')
                    [ps[2], ps[3]] = [ps[3], ps[2]];
                const ctx = type === '3DFACE' ? c : localOCS();
                this.path(e, ctx, s, ps, true, true, { face: type === '3DFACE', edgeFlags: type === '3DFACE' ? e.num(70) : 0 });
                return;
            }
            if (type === 'MESH') {
                this.mesh(e, c, s);
                return;
            }
            if (['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(type)) {
                if (type === 'ATTDEF' && !this.options.showDefinitions && !((e.num(70) & 2) && c.blocks.length))
                    return;
                if (type === 'ATTRIB' && this.options.showReferences === false)
                    return;
                if ((type === 'ATTDEF' || type === 'ATTRIB') && (e.num(70) & 1) && !this.options.showInvisible)
                    return;
                this.text(e, c, s);
                return;
            }
            if (type === 'HATCH') {
                this.hatch(e, c, s);
                return;
            }
            if (type === 'XLINE' || type === 'RAY') {
                const p = e.point(10), d = normal(e.point(11));
                this.emit(e, c, s, { kind: 'path', points: [p, add(p, d)], infinite: type === 'RAY' ? 'ray' : 'line' });
                return;
            }
            if (type === 'LEADER' || type === 'MLEADER' || type === 'MULTILEADER') {
                const ps = e.points(10);
                if (ps.length >= 2) {
                    this.path(e, c, s, ps);
                    this.arrow(e, c, s, ps[0], ps[1], e.num(40, Math.max(.5, distance(ps[0], ps[1]) * .12)));
                }
                if (type !== 'LEADER')
                    this.diagnostic('mleader-context', 'MULTILEADER context/branch and block content requires a registered provider; decoded vertices are shown.', e);
                return;
            }
            if (type === 'DIMENSION') {
                this.dimension(e, c, s);
                return;
            }
            if (type === 'IMAGE' || type === 'WIPEOUT') {
                const p = e.point(10), u = e.point(11, vec(1, 0)), v = e.point(12, vec(0, 1)), size = e.point(13, vec(1, 1));
                let clip = e.points(14);
                if (clip.length === 2)
                    clip = [clip[0], vec(clip[1].x, clip[0].y), clip[1], vec(clip[0].x, clip[1].y)];
                const imagePoints = type === 'WIPEOUT' && clip.length ? clip.map(q => add(p, add(mul(u, q.x + .5), mul(v, .5 - q.y)))) : [p, add(p, mul(u, size.x)), add(add(p, mul(u, size.x)), mul(v, size.y)), add(p, mul(v, size.y))];
                if (type === 'WIPEOUT') {
                    this.path(e, c, { ...s, color: this.options.background }, imagePoints, true, true, { wipeout: true });
                    return;
                }
                const def = this.document.sceneGraph.imageDefinitions[A.key(e.get(340))];
                const primitive = this.emit(e, c, s, { kind: 'image', position: p, u, v, imageSize: size, resource: def?.path || e.get(340, ''), points: imagePoints, imageClip: clip, brightness: e.num(281, 50), contrast: e.num(282, 50), fade: e.num(283, 0), displayFlags: e.num(70, 3) });
                if (!(primitive.displayFlags & 1))
                    this.primitives.pop();
                return;
            }
            if (type === 'ACAD_PROXY_ENTITY' && A.decodeProxy) {
                A.decodeProxy(this, e, c, s);
                return;
            }
            const plugin = this.plugins.get(type);
            if (plugin) {
                const output = plugin(e, { document: this.document, context: c, style: s, geometry: G });
                if (!Array.isArray(output))
                    throw new TypeError('Entity provider must return primitive descriptors.');
                for (const data of output)
                    this.emit(e, c, s, data);
                return;
            }
            this.diagnostic('unsupported-entity', `${type} has no geometry provider. Raw data is preserved.`, e);
        }
        viewport(e, c, s) {
            if (e.num(69) <= 1 || e.num(68) <= 0 || A.key(c.layout) === 'MODEL')
                return;
            const width = e.num(40), height = e.num(41), viewHeight = e.num(45);
            if (!(width > 0 && height > 0 && viewHeight > 0))
                throw new RangeError('Invalid paper viewport dimensions.');
            if (e.num(90) & 1)
                this.diagnostic('viewport-perspective', 'Perspective paper viewport is rendered with orthographic projection.', e);
            const basis = G.viewBasis(e.point(16, vec(0, 0, 1)), radians(e.num(51))), target = e.point(17), view = e.point(12), paper = e.point(10), scale = height / viewHeight;
            const projection = [basis.x.x, basis.x.y, basis.x.z, -dot(target, basis.x), basis.y.x, basis.y.y, basis.y.z, -dot(target, basis.y), basis.z.x, basis.z.y, basis.z.z, -dot(target, basis.z), 0, 0, 0, 1];
            const transformMatrix = multiply(multiply(multiply(translation(paper), scaling(scale, scale, 1)), translation(mul(view, -1))), projection);
            let boundary = [vec(paper.x - width / 2, paper.y - height / 2), vec(paper.x + width / 2, paper.y - height / 2), vec(paper.x + width / 2, paper.y + height / 2), vec(paper.x - width / 2, paper.y + height / 2)];
            let clip = { points: boundary.map(p => transform(c.matrix, p)), inverse: false };
            const clipHandle = A.key(e.get(340)), clipEntity = this.document.byHandle.get(clipHandle);
            if (clipEntity && ['CIRCLE', 'ELLIPSE', 'LWPOLYLINE', 'POLYLINE', 'SPLINE'].includes(clipEntity.type)) {
                try {
                    const helper = new SceneCompiler(this.document, { ...this.options, printing: false,
                        blockIsolation: null, entityIsolation: null, layerState: null });
                    const record = new A.DxfRecord([{ code: 0, value: clipEntity.type },
                        ...clipEntity.tags.filter(t => ![39, 40, 41, 43].includes(t.code) || !['LWPOLYLINE', 'POLYLINE'].includes(clipEntity.type))]);
                    record.vertices = clipEntity.vertices.map(v => new A.DxfRecord([{ code: 0, value: 'VERTEX' }, ...v.tags.filter(t => ![40, 41].includes(t.code))]));
                    helper.style = () => s; // Geometry-only clip: ignore display/plot visibility.
                    helper.compileEntity(record, { ...c, matrix: c.matrix, thicknessVector: null, clips: [] });
                    const primitive = helper.primitives.find(p => p.path && p.closed);
                    if (primitive) clip = { path: primitive.path, loops: primitive.rings, inverse: false };
                    else this.diagnostic('viewport-boundary', 'Viewport boundary is not a supported closed curve; rectangular bounds used.', e);
                } catch (error) {
                    this.diagnostic('viewport-boundary', `Invalid viewport boundary (${error.message}); rectangular bounds used.`, e);
                }
            } else if (clipHandle) this.diagnostic('viewport-boundary', 'Viewport boundary handle is missing or unsupported; rectangular bounds used.', e);
            const frozen = new Set(e.all(331).map(handle => A.key(this.document.byHandle.get(A.key(handle))?.get(2))));
            this.compileList(this.document.sceneGraph.modelSpace, { ...c, matrix: multiply(c.matrix, transformMatrix), layout: 'Model', viewportFrozen: frozen, clips: [...c.clips, clip] });
        }
        insert(e, c, s) {
            const name = String(e.get(2, '')), block = this.document.getBlock(name), normalized = A.key(name);
            if (!block) {
                this.diagnostic('missing-block', `Block ${name} is not defined.`, e);
                return;
            }
            if (block.header.xrefPath && !block.entities.length)
                this.diagnostic('external-reference', 'Unloaded XREF: ' + block.header.xrefPath + '. External paths are never fetched automatically.', e);
            if (c.depth >= this.options.maxDepth || c.blocks.map(A.key).includes(normalized)) {
                this.diagnostic('recursive-block', `Recursive/deep block ${name} was cut.`, e, 'error');
                return;
            }
            const columns = Math.max(1, Math.floor(e.num(70, 1))), rows = Math.max(1, Math.floor(e.num(71, 1)));
            if (columns * rows > this.options.maxInstances - this.instances) {
                this.diagnostic('instance-budget', 'Block array exceeds the instance budget.', e, 'error');
                return;
            }
            const insert = multiply(multiply(ocs(e.extrusion), translation(e.point(10))), rotation(radians(e.num(50))));
            const scale = scaling(e.num(41, 1), e.num(42, 1), e.num(43, 1));
            for (let row = 0; row < rows; row++)
                for (let col = 0; col < columns; col++) {
                    this.instances++;
                    // Array spacing is in the rotated block coordinate system, but is NOT scaled.
                    const local = multiply(multiply(multiply(insert, translation(vec(col * e.num(44), row * e.num(45)))), scale), translation(mul(block.header.basePoint, -1)));
                    const child = { ...c, matrix: multiply(c.matrix, local), depth: c.depth + 1, layer: s.layer, color: s.color, alpha: s.alpha, linetype: s.linetype, lineweight: s.lineweight, blocks: [...c.blocks, block.name], handles: [...c.handles, e.handle || e.id] };
                    const clip = this.blockClip(e, child.matrix);
                    if (clip)
                        child.clips = [...c.clips, clip];
                    this.compileList(block.entities, child);
                    // Attached ATTRIB positions are already in the INSERT parent's coordinate system.
                    for (const attr of e.attributes)
                        this.compileEntity(attr, { ...child, matrix: c.matrix });
                }
        }
        blockClip(e, matrix) {
            let record = this.document.byHandle.get(A.key(e.get(360))), visited = new Set();
            const find = (r, depth) => {
                if (!r || depth > 8 || visited.has(r.id))
                    return null;
                visited.add(r.id);
                if (r.type === 'SPATIAL_FILTER')
                    return r;
                for (const t of r.tags)
                    if (t.code === 350 || t.code === 360) {
                        const result = find(this.document.byHandle.get(A.key(t.value)), depth + 1);
                        if (result)
                            return result;
                    }
                return null;
            };
            record = find(record, 0);
            if (!record || !record.num(71, 1))
                return null;
            let ps = record.points(10);
            if (ps.length < 2)
                return null;
            if (ps.length === 2)
                ps = [ps[0], vec(ps[1].x, ps[0].y), ps[1], vec(ps[0].x, ps[1].y)];
            const values = record.all(40).map(Number), raw = values.slice(-24, -12);
            let inverse = identity();
            if (raw.length === 12)
                inverse = [...raw.slice(0, 4), ...raw.slice(4, 8), ...raw.slice(8, 12), 0, 0, 0, 1];
            if (record.num(72) || record.num(73))
                this.diagnostic('xclip-depth', 'Front/back XCLIP planes are not applied by the 2D projection.', e);
            return { points: ps.map(p => transform(multiply(matrix, inverse), p)), inverse: false };
        }
        polyline(e, c, s) {
            const flags = e.num(70), light = e.type === 'LWPOLYLINE';
            if (!light && (flags & 64)) {
                const vertices = e.vertices.filter(v => (v.num(70) & 128) === 0 || !!(v.num(70) & 64)).map(v => v.point(10));
                for (const face of e.vertices.filter(v => (v.num(70) & 128) && !(v.num(70) & 64))) {
                    const indices = [71, 72, 73, 74].map(code => face.num(code)).filter(Boolean);
                    const ps = indices.map(i => vertices[Math.abs(i) - 1]);
                    if (ps.some(p => !p)) {
                        this.diagnostic('invalid-face', 'Polyface index outside the vertex array.', e);
                        continue;
                    }
                    this.path(e, c, s, ps, true, true, { face: true, edgeFlags: indices.reduce((a, n, i) => n < 0 ? a | (1 << i) : a, 0) });
                }
                return;
            }
            if (!light && (flags & 16)) {
                const vs = e.vertices.map(v => v.point(10)), m = e.num(71), n = e.num(72);
                if (m * n > vs.length || m < 2 || n < 2)
                    throw new RangeError('Invalid polygon mesh dimensions.');
                for (let i = 0; i < m - ((flags & 1) ? 0 : 1); i++)
                    for (let j = 0; j < n - ((flags & 32) ? 0 : 1); j++)
                        this.path(e, c, s, [vs[i * n + j], vs[((i + 1) % m) * n + j], vs[((i + 1) % m) * n + (j + 1) % n], vs[i * n + (j + 1) % n]], true, true, { face: true });
                return;
            }
            const vertices = [];
            if (light) {
                const elevation = e.num(38), constantWidth = e.num(43);
                let v = null;
                for (const t of e.tags) {
                    if (t.code === 10) {
                        v = { point: vec(Number(t.value), 0, elevation), bulge: 0, startWidth: constantWidth, endWidth: constantWidth };
                        vertices.push(v);
                    }
                    else if (v) {
                        if (t.code === 20)
                            v.point.y = Number(t.value);
                        if (t.code === 42)
                            v.bulge = Number(t.value);
                        if (t.code === 40)
                            v.startWidth = Number(t.value);
                        if (t.code === 41)
                            v.endWidth = Number(t.value);
                    }
                }
            }
            else
                for (const v of e.vertices)
                    vertices.push({ point: v.point(10), bulge: v.num(42), startWidth: v.num(40, e.num(40)), endWidth: v.num(41, e.num(41)) });
            if (vertices.length < 2)
                return;
            const ctx = !light && (flags & 8) ? c : { ...c, matrix: multiply(c.matrix, ocs(e.extrusion)) };
            if (!light && !(flags & 8)) {
                const elevation = e.num(30);
                for (const v of vertices)
                    v.point.z = elevation;
            }
            const closed = !!(flags & 1), path = [], hasWidth = vertices.some(v => v.startWidth > 0 || v.endWidth > 0);
            if (vertices.some(v => !G.validPoint(v.point) || !Number.isFinite(v.bulge) || !Number.isFinite(v.startWidth) || !Number.isFinite(v.endWidth) || v.startWidth < 0 || v.endWidth < 0))
                throw new RangeError('Invalid polyline vertex or width.');
            for (let i = 0; i < vertices.length - (closed ? 0 : 1); i++) {
                const a = vertices[i], b = vertices[(i + 1) % vertices.length], segment = bulgePath(a.point, b.point, a.bulge);
                path.push(...(i ? segment.slice(1) : segment));
                if (a.startWidth > 0 || a.endWidth > 0) {
                    const ps = flatten(segment, this.options.tolerance, 8192).points, left = [], right = [];
                    let total = 0;
                    const lengths = [0];
                    for (let j = 1; j < ps.length; j++) {
                        total += distance(ps[j - 1], ps[j]);
                        lengths.push(total);
                    }
                    for (let j = 0; j < ps.length; j++) {
                        const tangent = sub(ps[Math.min(ps.length - 1, j + 1)], ps[Math.max(0, j - 1)]), n = length(tangent) ? normal(vec(-tangent.y, tangent.x)) : vec(0, 1), w = (a.startWidth + (a.endWidth - a.startWidth) * (total ? lengths[j] / total : 0)) / 2;
                        left.push(add(ps[j], mul(n, w)));
                        right.push(sub(ps[j], mul(n, w)));
                    }
                    this.path(e, ctx, s, [...left, ...right.reverse()], true, true, { widePolyline: true });
                }
                else if (hasWidth)
                    this.emit(e, ctx, s, { kind: 'path', path: segment, closed: false });
            }
            if (closed)
                path.push(['Z']);
            if (!hasWidth)
                this.emit(e, ctx, s, { kind: 'path', path, closed });
        }
        mesh(e, c, s) {
            const vertices = e.points(10), start = e.tags.findIndex(t => t.code === 93), end = e.tags.findIndex((t, i) => i > start && t.code === 94);
            const faceData = e.tags.slice(start + 1, end < 0 ? undefined : end).filter(t => t.code === 90).map(t => Number(t.value));
            for (let i = 0; i < faceData.length;) {
                const n = faceData[i++];
                if (!Number.isInteger(n) || n < 3 || n > 65536 || i + n > faceData.length)
                    throw new RangeError('Invalid MESH face record.');
                const ps = faceData.slice(i, i + n).map(j => vertices[j]);
                i += n;
                if (ps.some(p => !p))
                    throw new RangeError('MESH index outside the vertex array.');
                this.path(e, c, s, ps, true, true, { face: true });
            }
            if (e.num(91) > 0)
                this.diagnostic('mesh-subdivision', 'MESH control faces are shown; subdivision/crease evaluation requires a mesh provider.', e);
        }
        text(e, c, s) {
            const mtext = e.type === 'MTEXT', style = this.document.textStyle(e.get(7, 'STANDARD'));
            const content = mtext ? e.tags.filter(t => t.code === 3 || t.code === 1).map(t => t.value).join('') : String(e.get(1, ''));
            const text = plainText(content);
            if (!text)
                return;
            const h = e.num(40, style?.height || 1);
            if (!(h > 0))
                return;
            if (mtext && /\\[ACHQWTFfS]/.test(content))
                this.diagnostic('mtext-formatting', 'Common MTEXT content is decoded; mixed run formatting and stacked fraction typography are not fully represented.', e);
            if (style?.bigFont)
                this.diagnostic('bigfont', 'Bigfont secondary mappings require a supplied text provider.', e);
            const a = radians(e.num(50)), position = e.point(10);
            let u = vec(Math.cos(a) * h, -Math.sin(a) * -h), v = vec(-Math.sin(a) * h, Math.cos(a) * h);
            if (mtext && e.get(11) !== null) {
                u = mul(normal(e.point(11)), h);
                v = mul(normal(cross(normal(e.extrusion), u)), h);
            }
            else {
                u = direction(ocs(e.extrusion), u);
                v = direction(ocs(e.extrusion), v);
            }
            const width = e.num(41, style?.width || 1), oblique = Math.tan(radians(e.num(51, style?.oblique || 0)));
            if (!mtext) {
                u = mul(u, width);
                v = add(v, mul(u, oblique));
                const flags = e.num(71);
                if (flags & 2)
                    u = mul(u, -1);
                if (flags & 4)
                    v = mul(v, -1);
            }
            let align = mtext ? (e.num(71, 1) - 1) % 3 : e.num(72), vertical = mtext ? Math.floor((e.num(71, 1) - 1) / 3) : e.num(73);
            let origin = mtext ? position : transform(ocs(e.extrusion), position);
            if (!mtext && (align || vertical) && e.get(11) !== null)
                origin = transform(ocs(e.extrusion), e.point(11));
            if (!mtext && (align === 3 || align === 5) && e.get(11) !== null) {
                const start = transform(ocs(e.extrusion), position), end = transform(ocs(e.extrusion), e.point(11)), d = sub(end, start), scale = length(d) / Math.max(text.length * .65, EPS);
                u = mul(normal(d), scale);
                if (align === 3)
                    v = mul(normal(cross(normal(e.extrusion), u)), scale);
                origin = start;
                align = 0;
            }
            this.emit(e, c, s, { kind: 'text', text, rawText: content, position: origin, u, v, font: style?.font || '', fontName: style?.name || String(e.get(7, 'STANDARD')), bigFont: style?.bigFont || '', align: Math.min(2, align), vertical, mtext, width: mtext ? e.num(41) : 0, wrapWidth: mtext ? e.num(41) / h : 0, lineSpacing: mtext ? e.num(44, 1) : 1, backgroundMask: mtext ? e.num(90) : 0 });
        }
        arrow(e, c, s, tip, towards, size) { const d = normal(sub(towards, tip)), n = vec(-d.y, d.x, d.z || 0), base = add(tip, mul(d, size)); this.path(e, c, s, [tip, add(base, mul(n, size * .3)), sub(base, mul(n, size * .3))], true, true); }
        dimension(e, c, s) {
            const name = e.get(2), block = name && this.document.getBlock(name);
            if (block) {
                this.compileList(block.entities, { ...c, blocks: [...c.blocks, block.name], handles: [...c.handles, e.handle || e.id], layer: s.layer, color: s.color, alpha: s.alpha });
                return;
            }
            const d = e.num(70) & 7;
            const style = Object.values(this.document.tables.dimstyles).find(x => A.key(x.name) === A.key(e.get(3, 'STANDARD')))?.record;
            const setting = (code, name, fallback) => style?.num(code, this.document.headerNumber(name, fallback)) ?? this.document.headerNumber(name, fallback);
            const scale = setting(40, '$DIMSCALE', 1) || 1, h = setting(140, '$DIMTXT', 2.5) * scale, arrow = setting(41, '$DIMASZ', 2.5) * scale;
            if (!(h > 0 && arrow >= 0 && Number.isFinite(h) && Number.isFinite(arrow))) throw new RangeError('Invalid dimension text/arrow size.');
            const basis = ocs(e.extrusion), inverse = G.inverse(basis), point = code => transform(inverse, e.point(code));
            const ctx = { ...c, matrix: multiply(c.matrix, basis) }; // Definition points WCS; text/arc location 11/16 OCS.
            const textSpecified = e.get(11) !== null;
            let a, b, measure, at = e.point(11), angle = 0, angular = d === 2 || d === 5;
            const extension = (p, q, index) => {
                if (setting(index === 0 ? 75 : 76, index === 0 ? '$DIMSE1' : '$DIMSE2', 0)) return;
                const delta = sub(q, p), n = length(delta) > EPS ? normal(delta) : vec(0, 1);
                const start = add(p, mul(n, setting(42, '$DIMEXO', .625) * scale));
                const end = add(q, mul(n, setting(44, '$DIMEXE', 1.25) * scale));
                this.path(e, ctx, s, [start, end]);
            };
            if (angular) {
                let origin, p, q, arcPoint;
                if (d === 5) { origin = point(15); p = point(13); q = point(14); arcPoint = point(10); }
                else {
                    const p0 = point(13), p1 = point(14), q0 = point(10), q1 = point(15), u = sub(p1, p0), v = sub(q1, q0);
                    const det = u.x*v.y-u.y*v.x;
                    if (Math.abs(det) < EPS * Math.max(1, length(u)*length(v))) throw new RangeError('Angular dimension lines are parallel or degenerate.');
                    origin = add(p0, mul(u, ((q0.x-p0.x)*v.y-(q0.y-p0.y)*v.x)/det));
                    p = p1; q = q1; arcPoint = e.point(16);
                    if (distance(p, origin) < EPS) p = p0;
                    if (distance(q, origin) < EPS) q = q0;
                }
                const u = sub(p, origin), v = sub(q, origin);
                if (length(u) < EPS || length(v) < EPS) throw new RangeError('Angular dimension requires distinct definition points.');
                const first = Math.atan2(u.y,u.x), second = Math.atan2(v.y,v.x), through = Math.atan2(arcPoint.y-origin.y,arcPoint.x-origin.x);
                const choices = d === 2 ? [first, first+Math.PI].flatMap(x => [second,second+Math.PI].map(y => [x,positiveSweep(x,y)])) : [[first,positiveSweep(first,second)],[second,positiveSweep(second,first)]];
                const sector = choices.filter(([start,sweep]) => ((through-start)%TAU+TAU)%TAU <= sweep+1e-10).sort((x,y)=>x[1]-y[1])[0] || choices[0];
                const [start,sweep] = sector, radius = Math.hypot(arcPoint.x-origin.x,arcPoint.y-origin.y);
                if (!(radius>EPS)) throw new RangeError('Angular dimension arc radius must be positive.');
                const atAngle=t=>add(origin,vec(Math.cos(t)*radius,Math.sin(t)*radius));
                a=atAngle(start);b=atAngle(start+sweep);measure=sweep;
                this.emit(e,ctx,s,{kind:'path',path:arcPath(origin,vec(radius,0),vec(0,radius),start,sweep),fill:false});
                extension(p,a,0);extension(q,b,1);
                if (arrow) {
                    const size=Math.min(arrow,radius*sweep/4);
                    this.arrow(e,ctx,s,a,add(a,vec(-Math.sin(start),Math.cos(start))),size);
                    this.arrow(e,ctx,s,b,add(b,vec(Math.sin(start+sweep),-Math.cos(start+sweep))),size);
                }
                if(!textSpecified) at=add(origin,vec(Math.cos(start+sweep/2)*(radius+h*.6),Math.sin(start+sweep/2)*(radius+h*.6)));
                angle=0;
            } else if (d === 0 || d === 1) {
                const p=point(13),q=point(14),loc=point(10);
                angle=d===1?Math.atan2(q.y-p.y,q.x-p.x):radians(e.num(50));
                const dir=vec(Math.cos(angle),Math.sin(angle)),n=vec(-dir.y,dir.x);
                a=add(p,mul(n,dot(sub(loc,p),n)));b=add(q,mul(n,dot(sub(loc,q),n)));
                measure=Math.abs(dot(sub(q,p),dir));extension(p,a,0);extension(q,b,1);
                if(!textSpecified) at=add(mul(add(a,b),.5),mul(n,h*.6));
            } else if (d === 3 || d === 4) {
                a=point(10);b=point(15);measure=distance(a,b);angle=Math.atan2(b.y-a.y,b.x-a.x);
                if(!textSpecified)at=mul(add(a,b),.5);
            } else if (d === 6) {
                a=point(13);b=point(14);const origin=point(10);measure=(e.num(70)&64)?a.x-origin.x:a.y-origin.y;
                if(!textSpecified)at=b;
            } else { this.diagnostic('dimension-fallback','Unsupported generated dimension type '+d+'.',e);return; }
            if (!angular) {
                this.path(e,ctx,s,[a,b]);
                if(arrow && distance(a,b)>EPS && d!==6) {
                    const size=Math.min(arrow,distance(a,b)/4);
                    if(d!==4)this.arrow(e,ctx,s,a,b,size);
                    this.arrow(e,ctx,s,b,a,size);
                }
            }
            let precision=setting(angular?179:271,angular?'$DIMADEC':'$DIMDEC',2);
            if(precision<0)precision=setting(271,'$DIMDEC',2);precision=Math.max(0,Math.min(8,Math.trunc(precision)));
            let numeric=angular?measure:measure*setting(144,'$DIMLFAC',1), suffix='';
            if(angular){
                const unit=setting(275,'$DIMAUNIT',0);
                if(unit===2){numeric=measure*200/Math.PI;suffix='g';}else if(unit===3){suffix='r';}else{numeric=measure*180/Math.PI;suffix='°';}
                if(unit===1 || unit===4)this.diagnostic('dimension-angle-format','DMS/surveyor formatting shown as decimal degrees.',e);
            } else {
                const rounding=setting(45,'$DIMRND',0);if(rounding>0)numeric=Math.round(numeric/rounding)*rounding;
                if(![2,6].includes(setting(277,'$DIMLUNIT',2)))this.diagnostic('dimension-linear-format','Nondecimal dimension units shown as decimal drawing units.',e);
            }
            if(!Number.isFinite(numeric))throw new RangeError('Dimension measurement overflow.');
            let value=numeric.toFixed(precision);
            const suppress=setting(angular?79:78,angular?'$DIMAZIN':'$DIMZIN',0);
            if(suppress&(angular?2:8))value=value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/,'');
            if(suppress&(angular?1:4))value=value.replace(/^(-?)0\./,'$1.');
            if(Number(value)===0)value=value.replace(/^-/, '');
            const separator=setting(278,'$DIMDSEP',46);if(Number.isInteger(separator)&&separator>=32&&separator<127)value=value.replace('.',String.fromCharCode(separator));
            value=(d===3?'Ø':d===4?'R':'')+value+suffix;
            const post=style?.get(3,'');if(!angular && post)value=String(post).replace(/<>/g,value);
            let label=String(e.get(1,'<>'));if(label===' ')return;if(label==='')label='<>';
            label=plainText(label.replace(/<>/g,value));angle+=radians(e.num(53));
            const textStyle=this.document.byHandle.get(A.key(style?.get(340))),font=this.document.textStyle(textStyle?.get(2,'STANDARD'));
            this.emit(e,ctx,s,{kind:'text',text:label,position:at,u:vec(Math.cos(angle)*h,Math.sin(angle)*h),v:vec(-Math.sin(angle)*h,Math.cos(angle)*h),align:1,vertical:0,font:font?.font||'',fontName:font?.name||'',mtext:false});
            this.diagnostic('dimension-generated','Stored dimension block absent: generated definition-point geometry; advanced overrides/arrow blocks remain unsupported.',e,'info');
        }
        hatch(e, c, s) {
            const tags = e.tags, starts = [];
            for (let i = 0; i < tags.length; i++)
                if (tags[i].code === 92)
                    starts.push(i);
            if (starts.length > this.options.maxHatchLoops) throw new RangeError('Hatch loop budget exceeded.');
            const islandStyle = e.num(75);
            if (![0, 1, 2].includes(islandStyle)) throw new RangeError('Unknown hatch island style.');
            const boundaryEnd = tags.findIndex((t, i) => i > (starts.at(-1) ?? 0) && [75, 76, 78, 98, 450].includes(t.code));
            const commands = [], loops = [], ctx = { ...c, matrix: multiply(c.matrix, ocs(e.extrusion)) }, elevation = e.num(30);
            for (let i = 0; i < starts.length; i++) {
                const part = tags.slice(starts[i], starts[i + 1] ?? (boundaryEnd < 0 ? tags.length : boundaryEnd)), flags = Number(part[0].value), path = [];
                // DXF style filters are defined by EXTERNAL/OUTERMOST flags, not
                // winding direction. Normal uses all loops; outer stops at first islands.
                if (islandStyle === 2 && !(flags & 1) || islandStyle === 1 && !(flags & 17)) continue;
                if (flags & 2) {
                    let vs = [], v = null;
                    const stop = part.findIndex(t => t.code === 97);
                    for (const t of part.slice(0, stop < 0 ? undefined : stop)) {
                        if (t.code === 10) {
                            v = { point: vec(Number(t.value), 0, elevation), bulge: 0 };
                            vs.push(v);
                        }
                        else if (v && t.code === 20)
                            v.point.y = Number(t.value);
                        else if (v && t.code === 42)
                            v.bulge = Number(t.value);
                    }
                    for (let j = 0; j < vs.length; j++) {
                        const segment = bulgePath(vs[j].point, vs[(j + 1) % vs.length].point, vs[j].bulge);
                        path.push(...(j ? segment.slice(1) : segment));
                    }
                    path.push(['Z']);
                }
                else {
                    const edges = [];
                    for (let j = 1; j < part.length; j++)
                        if (part[j].code === 72)
                            edges.push(j);
                    for (let j = 0; j < edges.length; j++) {
                        const data = part.slice(edges[j] + 1, edges[j + 1] ?? part.length), edgeType = Number(part[edges[j]].value), r = new A.DxfRecord([{ code: 0, value: 'HATCH_EDGE' }, ...data]);
                        let edge = [];
                        if (edgeType === 1)
                            edge = pathFromPoints([r.point(10), r.point(11)]);
                        else if (edgeType === 2) {
                            const center = r.point(10), radius = r.num(40), a = radians(r.num(50));
                            edge = arcPath(center, vec(radius, 0), vec(0, radius), a, positiveSweep(a, radians(r.num(51)), r.num(73, 1) !== 0));
                        }
                        else if (edgeType === 3) {
                            const center = r.point(10), u = r.point(11), v = mul(vec(-u.y, u.x), r.num(40, 1)), a = radians(r.num(50));
                            edge = arcPath(center, u, v, a, positiveSweep(a, radians(r.num(51)), r.num(73, 1) !== 0));
                        }
                        else if (edgeType === 4) {
                            edge = pathFromPoints(G.sampleNurbs(r.points(10), r.num(94, 3), r.all(40).map(Number), r.all(42).map(Number), this.options.tolerance));
                        }
                        else
                            this.diagnostic('hatch-edge', `Unsupported hatch boundary edge ${edgeType}.`, e);
                        if (edge.length) {
                            if (path.length && distance((path.at(-1)[0] === 'K' || path.at(-1)[0] === 'Q' ? path.at(-1)[2] : path.at(-1)[0] === 'C' ? path.at(-1)[3] : path.at(-1)[1]) || edge[0][1], edge[0][1]) > this.options.tolerance)
                                path.push(['L', edge[0][1]]);
                            path.push(...(path.length ? edge.slice(1) : edge));
                        }
                    }
                    path.push(['Z']);
                }
                for (const cmd of path)
                    for (const p of cmd.slice(1))
                        if (typeof p === 'object')
                            p.z = elevation;
                const fs = flatten(path, this.options.tolerance).points;
                if (fs.length >= 3) {
                    commands.push(...path);
                    loops.push(fs);
                }
            }
            if (!commands.length) {
                this.diagnostic('empty-hatch', 'Hatch has no usable boundary loops.', e);
                return;
            }
            if (e.num(70) === 1 || e.num(450) === 1) {
                let gradient = null;
                if (e.num(450) === 1) {
                    const name = A.key(e.get(470, 'LINEAR')), colors = e.all(421).map(rgb);
                    if (!colors.length) colors.push(...e.all(63).map(n => A.aciColor(Number(n), this.options.background)));
                    if (['LINEAR', 'CYLINDER', 'INVCYLINDER', 'SPHERICAL', 'INVSPHERICAL'].includes(name) && colors.length) {
                        if (e.num(452)) {
                            const tint = G.clamp(e.num(462), 0, 1), value = parseInt(colors[0].slice(1),16);
                            colors[1] = rgb([16,8,0].reduce((n,shift) => n | Math.round(((value>>>shift)&255)*(1-tint)+255*tint)<<shift,0));
                        }
                        if (!colors[1]) colors[1]='#ffffff';
                        const box=G.pathBounds(commands), cx=(box.minX+box.maxX)/2, cy=(box.minY+box.maxY)/2, angle=e.num(460), ux=Math.cos(angle), uy=Math.sin(angle);
                        const rx=Math.max(EPS,(Math.abs(ux)*(box.maxX-box.minX)+Math.abs(uy)*(box.maxY-box.minY))/2);
                        const ry=Math.max(EPS,(Math.abs(uy)*(box.maxX-box.minX)+Math.abs(ux)*(box.maxY-box.minY))/2);
                        gradient={name,colors:colors.slice(0,2),origin:vec(cx,cy,elevation),u:vec(ux*rx,uy*rx),v:vec(-uy*ry,ux*ry),shift:G.clamp(e.num(461),0,1)};
                    } else this.diagnostic('hatch-gradient', 'Gradient family or colors unavailable; solid entity color is shown for '+name+'.', e);
                }
                this.emit(e, ctx, s, { kind: 'path', path: commands, fill: true, closed: true, fillRule: 'evenodd', gradient });
                return;
            }
            const pattern = [];
            let line = null;
            for (const t of tags) {
                if (t.code === 53) {
                    line = { angle: radians(Number(t.value)), base: vec(), offset: vec(), dashes: [] };
                    pattern.push(line);
                }
                else if (line) {
                    if (t.code === 43)
                        line.base.x = Number(t.value);
                    if (t.code === 44)
                        line.base.y = Number(t.value);
                    if (t.code === 45)
                        line.offset.x = Number(t.value);
                    if (t.code === 46)
                        line.offset.y = Number(t.value);
                    if (t.code === 49)
                        line.dashes.push(Number(t.value));
                }
            }
            if (!pattern.length) {
                this.emit(e, ctx, s, { kind: 'path', path: commands, fill: false, closed: true });
                this.diagnostic('hatch-pattern', 'Pattern data absent; boundary only is drawn.', e);
                return;
            }
            const clip = { points: [], loops: loops.map(ring => ring.map(p => transform(ctx.matrix, p))), path: transformPath(commands, ctx.matrix), inverse: false };
            const clipContext = { ...ctx, clips: [...c.clips, clip] }, b = bounds(loops.flat()), corners = [vec(b.minX, b.minY), vec(b.maxX, b.minY), vec(b.maxX, b.maxY), vec(b.minX, b.maxY)];
            let emitted = 0;
            for (const p of pattern) {
                const u = vec(Math.cos(p.angle), Math.sin(p.angle)), v = vec(-u.y, u.x), spacing = dot(p.offset, v);
                if (Math.abs(spacing) < 1e-10) {
                    this.diagnostic('hatch-spacing', 'Zero hatch-line separation was rejected.', e);
                    continue;
                }
                const offsets = corners.map(q => dot(sub(q, p.base), v) / spacing), min = Math.floor(Math.min(...offsets)) - 1, max = Math.ceil(Math.max(...offsets)) + 1;
                if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max - min + 1 > this.options.maxPatternLines - emitted) {
                    this.diagnostic('hatch-density', 'Hatch pattern exceeds the line budget; pattern family was omitted.', e);
                    continue;
                }
                for (let i = min; i <= max; i++) {
                    const base = add(p.base, mul(p.offset, i)), ts = corners.map(q => dot(sub(q, base), u)), a = add(base, mul(u, Math.min(...ts) - 1)), end = add(base, mul(u, Math.max(...ts) + 1));
                    a.z = end.z = elevation;
                    const lineScale=length(direction(ctx.matrix,u));
                    this.path(e, clipContext, { ...s, dash: p.dashes, dashScale: lineScale, dashOffset: dot(sub(a,base),u)*lineScale }, [a, end]);
                    emitted++;
                }
            }
        }
    }
    Object.assign(A, { SceneCompiler, plainText });
    if (typeof module === 'object' && module.exports)
        module.exports = A;
})(globalThis);


// packages/dxf-skia/src/renderer.js
/* Native Skia rendering and geometry-aware interaction. The renderer never owns a
 * browser 2D/WebGL drawing context; surface presentation belongs to SkiaSharpWeb. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, G = A.geometry, { vec, add, sub, mul, dot, project, viewBasis, bounds, emptyBounds, union, center } = G;
    const projections = new WeakMap();
    function projectedScene(scene, basis) {
        const key = [basis.x, basis.y, basis.z].flatMap(p => [p.x, p.y, p.z]).join(',');
        let cache = projections.get(scene);
        if (!cache) {
            cache = new Map();
            projections.set(scene, cache);
        }
        if (cache.has(key))
            return cache.get(key);
        const entries = scene.primitives.map((primitive, index) => {
            let points, rings; // Pick tessellation is transformed only when interaction needs it.
            const box = primitive.infinite ? { minX: -1e30, minY: -1e30, maxX: 1e30, maxY: 1e30, minZ: 0, maxZ: 0 } : primitive.path ? G.pathBounds(primitive.path, p => project(p, basis)) : bounds((primitive.points || []).map(p => project(p, basis)));
            for (const clip of primitive.clips || [])
                if (!clip.inverse) {
                    const cb = bounds((clip.loops?.flat() || clip.points || []).map(p => project(p, basis)));
                    if (!G.isEmpty(cb)) {
                        box.minX = Math.max(box.minX, cb.minX);
                        box.maxX = Math.min(box.maxX, cb.maxX);
                        box.minY = Math.max(box.minY, cb.minY);
                        box.maxY = Math.min(box.maxY, cb.maxY);
                    }
                }
            const entry = { primitive, index, bounds: box };
            Object.defineProperties(entry, {
                points: { get: () => points ||= (primitive.points || []).map(p => project(p, basis)) },
                rings: { get: () => rings ||= primitive.rings ? primitive.rings.map(r => r.map(p => project(p, basis))) : [entry.points] }
            });
            return entry;
        });
        const extents = entries.filter(x => !x.primitive.infinite).reduce((b, x) => union(b, x.bounds), emptyBounds());
        const centerEntries = entries.filter(e => e.primitive.center).map(entry => ({ entry, bounds: bounds([project(entry.primitive.center, basis)]) }));
        const clipCache = new WeakMap();
        const result = { entries, bounds: extents, index: new A.SpatialIndex(entries), centers: new A.SpatialIndex(centerEntries), basis, key,
            clipLoops(clip) { let loops = clipCache.get(clip); if (!loops) { loops = (clip.loops || [clip.points || []]).map(r => r.map(p => project(p, basis))); clipCache.set(clip, loops); } return loops; }
        };
        if (cache.size >= 4)
            cache.delete(cache.keys().next().value);
        cache.set(key, result);
        return result;
    }
    function clipInfiniteLine(a, b, box, ray = false) {
        const d = sub(b, a);
        let low = ray ? 0 : -Infinity, high = Infinity;
        for (const axis of ['x', 'y']) {
            const min = box['min' + axis.toUpperCase()], max = box['max' + axis.toUpperCase()];
            if (Math.abs(d[axis]) < 1e-30) {
                if (a[axis] < min || a[axis] > max)
                    return null;
                continue;
            }
            let t0 = (min - a[axis]) / d[axis], t1 = (max - a[axis]) / d[axis];
            if (t0 > t1)
                [t0, t1] = [t1, t0];
            low = Math.max(low, t0);
            high = Math.min(high, t1);
            if (low > high)
                return null;
        }
        if (!Number.isFinite(low) || !Number.isFinite(high))
            return null;
        return [add(a, mul(d, low)), add(a, mul(d, high))];
    }
    // Convert signed DXF dash/gap/dot runs to a cyclic native Skia dash pattern.
    // Native intervals always begin with ink; phase preserves the source origin.
    function nativeDash(pattern, scale = 1, dotLength = .01) {
        if (!pattern?.length)
            return { intervals: [], phase: 0 };
        if (pattern.length > 1024 || !(scale > 0) || !Number.isFinite(scale) || !(dotLength > 0) || !Number.isFinite(dotLength))
            throw new RangeError('Invalid linetype pattern.');
        const runs = [];
        for (const n of pattern) {
            if (!Number.isFinite(n))
                throw new RangeError('Nonfinite dash length.');
            const ink = n >= 0, len = n === 0 ? dotLength : Math.abs(n) * scale;
            if (!Number.isFinite(Math.fround(len))) throw new RangeError('Native dash length overflow.');
            const last = runs.at(-1);
            if (last?.ink === ink)
                last.length += len;
            else
                runs.push({ ink, length: len });
        }
        if (runs.length === 1)
            return { intervals: [], phase: 0, empty: !runs[0].ink };
        let offset = 0;
        if (runs[0].ink === runs.at(-1).ink) {
            offset = runs.at(-1).length;
            runs[0].length += offset;
            runs.pop();
        }
        const pivot = runs[0].ink ? 0 : 1, prefix = pivot ? runs[0].length : 0;
        const cycle = runs.reduce((n, r) => n + r.length, 0);
        if (!Number.isFinite(Math.fround(cycle))) throw new RangeError('Native dash cycle overflow.');
        const ordered = [...runs.slice(pivot), ...runs.slice(0, pivot)];
        return { intervals: ordered.map(r => r.length), phase: ((offset - prefix) % cycle + cycle) % cycle };
    }
    function prepareFrame(scene, { width = 800, height = 600, devicePixelRatio = 1, viewState = {}, viewDirection = vec(0, 0, 1), padding = 32, visualStyle = '2dwireframe', background = '#212830' } = {}) {
        if (!scene?.primitives)
            throw new TypeError('Expected a compiled scene.');
        if (!(width > 0 && height > 0 && width <= 32768 && height <= 32768))
            throw new RangeError('Invalid viewport size.');
        if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0 || !Number.isFinite(padding) || padding < 0 || (viewState.rotationRad !== undefined && !Number.isFinite(viewState.rotationRad)))
            throw new RangeError('Invalid device pixel ratio, padding or view rotation.');
        const basis = viewBasis(viewDirection, 0), projection = projectedScene(scene, basis), b = projection.bounds, isEmpty = G.isEmpty(b);
        const autoCenter = isEmpty ? vec() : center(b), dx = isEmpty ? 100 : Math.max(1e-6, b.maxX - b.minX), dy = isEmpty ? 100 : Math.max(1e-6, b.maxY - b.minY);
        const angle = Number(viewState.rotationRad) || 0, cos = Math.cos(angle), sin = Math.sin(angle);
        const autoScale = Math.max(1e-12, Math.min(Math.max(1, width - 2 * padding) / (Math.abs(cos) * dx + Math.abs(sin) * dy), Math.max(1, height - 2 * padding) / (Math.abs(sin) * dx + Math.abs(cos) * dy)));
        const custom = viewState.mode === 'custom', c = custom && G.validPoint(viewState.center) ? vec(viewState.center.x, viewState.center.y, viewState.center.z || 0) : autoCenter;
        const scale = custom && viewState.scale > 0 && Number.isFinite(viewState.scale) ? G.clamp(viewState.scale, 1e-12, 1e12) : autoScale;
        const screen = p => vec(width / 2 + ((p.x - c.x) * cos - (p.y - c.y) * sin) * scale, height / 2 - ((p.x - c.x) * sin + (p.y - c.y) * cos) * scale, p.z), toView = p => project(p, basis);
        const toProjected = p => { const x = (p.x - width / 2) / scale, y = (height / 2 - p.y) / scale; return vec(c.x + cos * x + sin * y, c.y - sin * x + cos * y); };
        const worldToScreen = p => screen(toView(p)), screenToWorld = p => { const v = toProjected(p); return add(add(mul(basis.x, v.x), mul(basis.y, v.y)), mul(basis.z, c.z || 0)); };
        const screenDirection = p => { const v = project(p, basis); return vec((v.x * cos - v.y * sin) * scale, -(v.x * sin + v.y * cos) * scale); };
        const margin = 10 / scale, viewport = bounds([vec(-10, -10), vec(width + 10, -10), vec(width + 10, height + 10), vec(-10, height + 10)].map(toProjected));
        const entries = projection.index.search(viewport).sort((a, b) => a.index - b.index);
        const picks = new Map(), interactionStats = { pickablesCreated: 0, screenPointsTransformed: 0 };
        const pick = entry => {
            if (picks.has(entry)) return picks.get(entry);
            const p = entry.primitive;
            const b = entry.bounds;
            let screenPoints;
            const result = { handle: p.handle, entityHandle: p.entityHandle, type: p.type, layer: p.style.layer,
                worldBounds: p.bounds, worldPoints: p.points, isClosed: !!p.closed, weight: entry.index,
                primitive: p, entry, clips: p.clips };
            Object.defineProperties(result, {
                screenPoints: { enumerable: true, get() {
                    if (!screenPoints) {
                        const points = p.infinite ? clipInfiniteLine(entry.points[0], entry.points[1], viewport, p.infinite === 'ray') || [] : entry.points;
                        interactionStats.screenPointsTransformed += points.length;
                        screenPoints = points.map(screen);
                    }
                    return screenPoints;
                } },
                screenBounds: { enumerable: true, get() {
                    const box = p.infinite ? bounds(result.screenPoints) : bounds([
                        vec(b.minX,b.minY), vec(b.maxX,b.minY), vec(b.maxX,b.maxY), vec(b.minX,b.maxY)
                    ].map(screen));
                    Object.defineProperty(result, 'screenBounds', { value: box, enumerable: true });
                    return box;
                }, configurable: true }
            });
            interactionStats.pickablesCreated++;
            picks.set(entry, result);
            return result;
        };
        let pickables;
        const frame = { scene, width, height, devicePixelRatio, scale, worldCenter: c, rotationRad: Number(viewState.rotationRad) || 0, rotationDeg: (Number(viewState.rotationRad) || 0) * 180 / Math.PI,
            worldBounds: scene.bounds, bounds: b, isEmpty, autoViewState: { mode: 'auto', center: autoCenter, scale: autoScale, rotationRad: Number(viewState.rotationRad) || 0 }, viewState: { mode: custom ? 'custom' : 'auto', center: c, scale, rotationRad: Number(viewState.rotationRad) || 0 },
            basis, projection, viewport, screenDirection, cos, sin, pick, interactionStats, entries, worldToScreen, screenToWorld, toProjected, screen, background, visualStyle: { name: visualStyle, category: visualStyle.includes('shad') ? 'shaded' : 'wireframe' }, polylines: [], fills: [], points: [], texts: [] };
        Object.defineProperty(frame, 'pickables', { enumerable: true, get: () => pickables ||= entries.map(pick).filter(p => !p.primitive.infinite || p.screenPoints.length) });
        frame.hitTest = (p, tolerance = 6) => hitTest(frame, p, tolerance);
        frame.snap = (p, tolerance = 12, modes) => snap(frame, p, tolerance, modes);
        return frame;
    }
    function unclipped(frame, primitive, point) {
        for (const clip of primitive.clips) {
            const inside = G.inLoops(point, frame.projection.clipLoops(clip));
            if (clip.inverse ? inside : !inside)
                return false;
        }
        return true;
    }
    function hitTest(frame, screenPoint, tolerance = 6) {
        const p = frame.toProjected(screenPoint), t = tolerance / frame.scale;
        let winner = null, best = Infinity;
        const candidates = frame.projection.index.search({ minX:p.x-t,minY:p.y-t,maxX:p.x+t,maxY:p.y+t }).sort((a,b)=>b.index-a.index);
        for (const entry of candidates) {
            if (!G.intersects(entry.bounds, frame.viewport)) continue;
            const pick = frame.pick(entry), item = entry.primitive;
            if (item.style.alpha <= 0 || !unclipped(frame, item, p))
                continue;
            if (!item.infinite && !G.inBounds(p, pick.entry.bounds, t))
                continue;
            let distance = Infinity;
            if (item.kind === 'point')
                distance = Math.hypot(p.x - pick.entry.points[0].x, p.y - pick.entry.points[0].y);
            else if (item.kind === 'text' || item.kind === 'image')
                distance = G.pointInPolygon(p, pick.entry.points) ? 0 : Infinity;
            else if (item.fill && G.inLoops(p, pick.entry.rings))
                distance = 0;
            if (distance !== 0) {
                const rings = item.infinite ? [pick.screenPoints.map(frame.toProjected)] : pick.entry.rings;
                for (const ring of rings)
                    for (let j = 1; j < ring.length; j++)
                        distance = Math.min(distance, G.segmentDistance(p, ring[j - 1], ring[j]).distance);
            }
            if (distance <= t && distance < best) {
                best = distance;
                winner = pick;
                if (distance === 0)
                    break;
            }
        }
        return winner;
    }
    function snap(frame, screenPoint, tolerance = 12, modes = new Set(['endpoint', 'midpoint', 'center', 'node', 'quadrant'])) {
        if (!(modes instanceof Set))
            modes = new Set(modes);
        let result = null, best = tolerance;
        const consider = (point, type, pick) => { if (!modes.has(type) || !unclipped(frame, pick.primitive, project(point, frame.basis)))
            return; const screen = frame.worldToScreen(point), d = Math.hypot(screen.x - screenPoint.x, screen.y - screenPoint.y); if (d < best) {
            best = d;
            result = { point, screenPoint: screen, type, kind: type, handle: pick.handle, pickable: pick, distance: d };
        } };
        const projectedPoint = frame.toProjected(screenPoint), distance = tolerance / frame.scale;
        const box = {minX:projectedPoint.x-distance,minY:projectedPoint.y-distance,maxX:projectedPoint.x+distance,maxY:projectedPoint.y+distance};
        const candidates = new Set(frame.projection.index.search(box));
        if (modes.has('center')) for (const center of frame.projection.centers.search(box)) candidates.add(center.entry);
        for (const entry of [...candidates].sort((a,b)=>a.index-b.index)) {
            if (!G.intersects(entry.bounds, frame.viewport)) continue;
            const pick = frame.pick(entry), p = entry.primitive;
            if (p.style.alpha <= 0) continue;
            // Arc centers can lie outside the arc's bounding box.
            if (p.center) consider(p.center, 'center', pick);
            if (!G.inBounds(screenPoint, pick.screenBounds, tolerance)) continue;
            if (p.kind === 'point') consider(p.points[0], 'node', pick);
            if (p.curve) {
                const { center, u, v, start, sweep } = p.curve;
                const at = t => add(center, add(mul(u, Math.cos(t)), mul(v, Math.sin(t))));
                if (!p.closed) {
                    consider(at(start), 'endpoint', pick); consider(at(start + sweep), 'endpoint', pick);
                    consider(at(start + sweep / 2), 'midpoint', pick);
                }
                for (let i = 0; i < 4; i++) {
                    const angle = i * Math.PI / 2, delta = ((angle - start) % G.TAU + G.TAU) % G.TAU;
                    if (delta <= sweep + 1e-10) consider(at(angle), 'quadrant', pick);
                }
            } else if (p.path) {
                let previous = null, first = null;
                for (const cmd of p.path) {
                    const op = cmd[0];
                    const end = op === 'Z' ? first : op === 'K' || op === 'Q' ? cmd[2] : op === 'C' ? cmd[3] : cmd[1];
                    if (!end) continue;
                    if (op === 'M') first = end;
                    consider(end, 'endpoint', pick);
                    if (previous && (op === 'L' || op === 'Z')) consider(G.lerp(previous, end, .5), 'midpoint', pick);
                    if (previous && (op === 'K' || op === 'Q')) {
                        const weight = op === 'K' ? cmd[3] : 1;
                        const middle = add(previous, mul(add(mul(sub(cmd[1], previous), 2 * weight), sub(end, previous)), 1 / (2 + 2 * weight)));
                        consider(middle, 'midpoint', pick);
                    }
                    previous = end;
                }
            }
            if (modes.has('nearest')) {
                const q = frame.toProjected(screenPoint);
                for (const ring of pick.entry.rings) for (let i = 1; i < ring.length; i++) {
                    const nearest = G.segmentDistance(q, ring[i - 1], ring[i]);
                    // Rings and primitive geometry have corresponding sample indices.
                    const world = add(add(mul(frame.basis.x, nearest.point.x), mul(frame.basis.y, nearest.point.y)), mul(frame.basis.z, nearest.point.z));
                    consider(world, 'nearest', pick);
                }
            }
        }
        return result;
    }
    function nativePath(S, commands, convert = p => p) {
        const path = new S.SKPath();
        const checked = point => {
            const p = convert(point);
            if (!p || !Number.isFinite(Math.fround(p.x)) || !Number.isFinite(Math.fround(p.y)))
                throw new RangeError('Native path coordinate exceeds finite float32 range.');
            return p;
        };
        try {
            for (const [op, a, b, c] of commands) {
                const p = a && checked(a), q = b && typeof b !== 'number' ? checked(b) : b;
                if (op === 'M')
                    path.MoveTo(p.x, p.y);
                else if (op === 'L')
                    path.LineTo(p.x, p.y);
                else if (op === 'K') {
                    if (!(c > 0) || !Number.isFinite(Math.fround(c))) throw new RangeError('Positive finite native conic weight required.');
                    path.ConicTo(p.x, p.y, q.x, q.y, c);
                }
                else if (op === 'C') {
                    const r = checked(c);
                    path.CubicTo(p.x, p.y, q.x, q.y, r.x, r.y);
                }
                else if (op === 'Q')
                    path.QuadTo(p.x, p.y, q.x, q.y);
                else if (op === 'Z')
                    path.Close();
            }
            path.FillType = S.SKPathFillType.EvenOdd;
            return path;
        }
        catch (error) {
            path.Dispose();
            throw error;
        }
    }
    class SkiaPainter {
        constructor(S, { resources, cacheLimit = 32768, cacheBytes = 32 * 1024 * 1024, textCacheLimit = 1024, textCacheBytes = 16 * 1024 * 1024 } = {}) {
            if (!S?.SKPath || !S?.SKPaint)
                throw new TypeError('An initialized SkiaSharpWeb namespace is required.');
            this.S = S;
            if (!Number.isSafeInteger(cacheLimit) || cacheLimit < 1) throw new RangeError('Positive integer path cache limit required.');
            this.resources = resources || new A.ResourceStore(S);
            this.ownsResources = !resources;
            for (const value of [cacheBytes, textCacheLimit, textCacheBytes])
                if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Positive integer native cache budgets required.');
            Object.assign(this, {cacheLimit, cacheBytes, textCacheLimit, textCacheBytes});
            this.cachedBytes = this.textBytes = 0;
            this.cache = new Map(); this.textCache = new Map();
            this.metrics = { pathBuilds: 0, pathHits: 0, textBuilds: 0, textHits: 0, clipBuilds: 0, clipHits: 0 };
            this.scene = null;
            this.disposed = false;
            this.diagnostics = new A.Diagnostics();
            this.paint = new S.SKPaint({ IsAntialias: true, StrokeCap: S.SKStrokeCap.Round, StrokeJoin: S.SKStrokeJoin.Round });
        }
        clearCache() {
            for (const v of this.cache.values()) v.path.Dispose();
            for (const v of this.textCache.values()) v.dispose();
            this.cache.clear(); this.textCache.clear(); this.cachedBytes = this.textBytes = 0;
        }
        cachedPath(primitive, projection) {
            const key = primitive.id + '|' + projection.key;
            let entry = this.cache.get(key);
            if (entry) {
                this.metrics.pathHits++;
                this.cache.delete(key);
                this.cache.set(key, entry);
                return entry;
            }
            const origin = project(primitive.points[0] || vec(), projection.basis), path = nativePath(this.S, primitive.path, p => sub(project(p, projection.basis), origin));
            const bytes = 128 + primitive.path.length * 64;
            entry = { path, origin, bytes, temporary: false };
            this.metrics.pathBuilds++;
            // Protect entries needed later in this pass. A drawing above the budget
            // retains its hot subset rather than cyclically evicting every path.
            while ((this.cache.size >= this.cacheLimit || this.cachedBytes + bytes > this.cacheBytes) && this.cache.size) {
                const oldestKey = this.cache.keys().next().value, oldest = this.cache.get(oldestKey);
                if (this.activePathKeys?.has(oldestKey)) break;
                oldest.path.Dispose(); this.cachedBytes -= oldest.bytes; this.cache.delete(oldestKey);
            }
            if (this.cache.size >= this.cacheLimit || this.cachedBytes + bytes > this.cacheBytes) entry.temporary = true;
            else { this.cache.set(key, entry); this.cachedBytes += bytes; }
            return entry;
        }
        draw(canvas, frame, { selection = new Set(), blockHighlights = new Set(), grid = false, background = frame.background, clear = true } = {}) {
            if (this.disposed)
                throw new Error('Painter disposed.');
            const S = this.S;
            if (this.scene !== frame.scene || this.resourceRevision !== this.resources.revision) {
                this.resourceRevision = this.resources.revision;
                this.clearCache();
                this.scene = frame.scene;
                this.diagnostics = new A.Diagnostics();
            }
            if (clear)
                canvas.Clear(S.SKColor.Parse(background));
            this.frameClips = new Map();
            this.activeTextIds = new Set(frame.entries.filter(e=>e.primitive.kind==='text').map(e=>e.primitive.id));
            this.activePathKeys = new Set(frame.entries.filter(e=>e.primitive.path).map(e=>e.primitive.id+'|'+frame.projection.key));
            const save = canvas.Save();
            let drawn = 0;
            try {
                canvas.Scale(frame.devicePixelRatio, frame.devicePixelRatio);
                if (grid)
                    this.drawGrid(canvas, frame);
                for (const pick of frame.entries) {
                    try {
                        if (pick.primitive.style.alpha <= 0) continue;
                        this.drawPrimitive(canvas, frame, pick, false); drawn++;
                    }
                    catch (error) {
                        if (/GPURenderPassEncoder|GPUDevice|WebGPU|Graphite|device lost|context lost/i.test(error.message)) throw error;
                        this.diagnostics.add('skia-primitive', error.message, pick.primitive.source, 'error');
                    }
                }
                for (const pick of frame.entries)
                    if (selection.has(pick.primitive.handle) || pick.primitive.blockPath.some(b => blockHighlights.has(A.key(b)))) {
                        try {
                            this.drawPrimitive(canvas, frame, pick, true);
                        }
                        catch (error) {
                            if (/GPURenderPassEncoder|GPUDevice|WebGPU|Graphite|device lost|context lost/i.test(error.message)) throw error;
                            this.diagnostics.add('skia-selection', error.message, pick.primitive.source);
                        }
                    }
            }
            finally {
                canvas.RestoreToCount(save);
                this.activePathKeys = null; this.activeTextIds = null;
                for (const path of this.frameClips.values()) path.Dispose();
                this.frameClips = null;
            }
            return { ...this.metrics, cachedBytes: this.cachedBytes, textBytes: this.textBytes, drawn, visible: frame.entries.length, omitted: frame.entries.length - drawn, cachedPaths: this.cache.size, diagnostics: [...frame.scene.diagnostics, ...this.diagnostics.items] };
        }
        configure(p, selected = false) { const S = this.S, paint = this.paint; paint.PathEffect = null; paint.ColorFilter = null; paint.Shader = null; paint.Color = S.SKColor.Parse(selected ? '#63c9ff' : p.style.color); paint.Alpha = Math.round(255 * (selected ? 1 : p.style.alpha)); paint.Style = p.fill && !selected ? S.SKPaintStyle.Fill : S.SKPaintStyle.Stroke; paint.StrokeWidth = 1; return paint; }
        drawPrimitive(canvas, frame, pick, selected) {
            const p = pick.primitive, S = this.S, paint = this.configure(p, selected), save = canvas.Save();
            let pathEntry;
            try {
                for (const clip of p.clips) {
                    let path = this.frameClips?.get(clip);
                    const transient = !this.frameClips;
                    if (path) this.metrics.clipHits++;
                    else {
                        path = nativePath(S, clip.path || ((clip.loops || [clip.points]).flatMap(r => G.pathFromPoints(r, true))), frame.worldToScreen);
                        this.metrics.clipBuilds++; this.frameClips?.set(clip,path);
                    }
                    try { canvas.ClipPath(path, clip.inverse ? S.SKClipOperation.Difference : S.SKClipOperation.Intersect, true); }
                    finally { if (transient) path.Dispose(); }
                }
                if (p.kind === 'text') {
                    this.drawText(canvas, frame, p, selected);
                    return;
                }
                if (p.kind === 'image') {
                    this.drawImage(canvas, frame, p, selected);
                    return;
                }
                if (p.kind === 'point') {
                    const q = frame.screen(pick.points[0]), size = Math.max(2, p.size > 0 ? p.size * frame.scale : p.size < 0 ? -p.size / 100 * frame.height : 5), mode = p.mode & 31;
                    paint.StrokeWidth = selected ? 2 : 1;
                    paint.Style = S.SKPaintStyle.Stroke;
                    if (mode === 0 || selected) {
                        paint.Style = S.SKPaintStyle.Fill;
                        canvas.DrawCircle(q.x, q.y, selected ? 2 : 1, paint);
                        paint.Style = S.SKPaintStyle.Stroke;
                    }
                    if (mode === 2) {
                        canvas.DrawLine(q.x - size / 2, q.y, q.x + size / 2, q.y, paint);
                        canvas.DrawLine(q.x, q.y - size / 2, q.x, q.y + size / 2, paint);
                    }
                    if (mode === 3) {
                        canvas.DrawLine(q.x - size / 2, q.y - size / 2, q.x + size / 2, q.y + size / 2, paint);
                        canvas.DrawLine(q.x - size / 2, q.y + size / 2, q.x + size / 2, q.y - size / 2, paint);
                    }
                    if (mode === 4)
                        canvas.DrawLine(q.x, q.y, q.x, q.y - size / 2, paint);
                    if (p.mode & 32)
                        canvas.DrawCircle(q.x, q.y, size / 2, paint);
                    if (p.mode & 64)
                        canvas.DrawRect(new S.SKRect(q.x - size / 2, q.y - size / 2, q.x + size / 2, q.y + size / 2), paint);
                    return;
                }
                if (p.infinite) {
                    const clipped = clipInfiniteLine(pick.points[0], pick.points[1], frame.viewport, p.infinite === 'ray');
                    if (!clipped) return;
                    const [a, b] = clipped.map(frame.screen);
                    paint.StrokeWidth = selected ? 2 : 1;
                    canvas.DrawLine(a.x, a.y, b.x, b.y, paint);
                    return;
                }
                const entry = pathEntry = this.cachedPath(p, frame.projection), origin = frame.screen(entry.origin);
                canvas.Concat([frame.scale * frame.cos, -frame.scale * frame.sin, origin.x, -frame.scale * frame.sin, -frame.scale * frame.cos, origin.y, 0, 0, 1]);
                const width = selected ? 2.5 : p.style.lineweightVisible ? Math.max(.7, p.style.lineweight / 100 * 96 / 25.4) : 1;
                paint.StrokeWidth = width / frame.scale;
                if (p.face && frame.visualStyle.category === 'wireframe')
                    paint.Style = S.SKPaintStyle.Stroke;
                if (!selected && !p.fill && p.style.dash?.length) {
                    const dash = nativeDash(p.style.dash, p.style.dashScale, .75 / frame.scale);
                    if (dash.empty)
                        return;
                    if (dash.intervals.length) {
                        const cycle=dash.intervals.reduce((a,b)=>a+b,0);
                        const effect = S.SKPathEffect.CreateDash(dash.intervals, ((dash.phase+(p.style.dashOffset||0))%cycle+cycle)%cycle);
                        try {
                            paint.PathEffect = effect;
                        }
                        finally {
                            effect?.Dispose();
                        }
                    }
                }
                if (p.gradient && !selected) {
                    const g=p.gradient, q=sub(project(g.origin,frame.basis),entry.origin), u=project(g.u,frame.basis), v=project(g.v,frame.basis);
                    const matrix=[u.x,v.x,q.x,u.y,v.y,q.y,0,0,1], colors=g.colors.map(c=>S.SKColor.Parse(c));
                    let shader;
                    const shift=g.shift, center=shift; // normalized CAD gradient-space translation
                    if(g.name.includes('SPHERICAL')) {
                        const cs=g.name.startsWith('INV')?colors.slice().reverse():colors;
                        shader=S.SKShader.CreateRadialGradient([center,0],1,cs,[0,1],S.SKShaderTileMode.Clamp,matrix);
                    } else {
                        const cylinder=g.name.includes('CYLINDER'), cs=cylinder?(g.name.startsWith('INV')?[colors[1],colors[0],colors[1]]:[colors[0],colors[1],colors[0]]):colors;
                        shader=S.SKShader.CreateLinearGradient([-1+center,0],[1+center,0],cs,cylinder?[0,.5,1]:[0,1],S.SKShaderTileMode.Clamp,matrix);
                    }
                    try { paint.Shader=shader; } finally { shader?.Dispose(); }
                }
                if (p.face && p.edgeFlags && paint.Style === S.SKPaintStyle.Stroke) {
                    for (let i = 0; i < p.points.length - 1; i++)
                        if (!(p.edgeFlags & (1 << i))) {
                            const a = sub(project(p.points[i], frame.basis), entry.origin), b = sub(project(p.points[i + 1], frame.basis), entry.origin);
                            canvas.DrawLine(a.x, a.y, b.x, b.y, paint);
                        }
                }
                else
                    canvas.DrawPath(entry.path, paint);
            }
            finally {
                if (pathEntry?.temporary) pathEntry.path.Dispose();
                paint.PathEffect = null;
                paint.ColorFilter = null;
                paint.Shader = null;
                canvas.RestoreToCount(save);
            }
        }
        drawText(canvas, frame, p, selected) {
            const S = this.S, paint = this.paint, origin = frame.worldToScreen(p.position), u = frame.screenDirection(p.u), v = frame.screenDirection(p.v);
            const resource = this.resources.get(p.font, 'font') || this.resources.get(p.fontName, 'font'), shape = this.resources.get(p.font, 'shape');
            const stroke = Math.max(.02, Math.min(.15, 1 / Math.max(1, Math.hypot(u.x, u.y))));
            const key = p.id + '|' + selected + '|' + (resource ? '' : stroke) + '|' + (p.backgroundMask ? frame.background : '');
            let cached = this.textCache.get(key), temporary = false;
            if (cached) {
                this.metrics.textHits++; this.textCache.delete(key); this.textCache.set(key, cached);
            } else {
                this.metrics.textBuilds++;
                if (!resource) this.diagnostics.add(shape ? 'shape-font' : 'missing-font', shape ? 'Text uses explicitly registered SHX outlines.' : `Font ${p.font || p.fontName || '(unspecified)'} is not registered; original schematic fallback strokes are shown.`, p.source);
                const session = resource ? this.resources.fontSession(resource) : null, font = session?.font;
                const layout = A.layoutText(p, text => this.resources.measureText(p, text)), units = font?.DxfUnit || 1;
                const runs = [], box = emptyBounds(); let recorder, unownedPicture;
                try {
                    // Record vector glyphs in text-local coordinates. There is no bitmap
                    // cache or resolution downgrade: Skia rasterizes at the current CTM.
                    for (const line of layout.lines) {
                        const x = line.x * units, y = line.y * units;
                        if (p.backgroundMask) union(box, {minX:x-.1*units,minY:y-1.1*units,maxX:x+(line.width+.1)*units,maxY:y+.2*units,minZ:0,maxZ:0});
                        if (font && line.text.length) {
                            const run = session.shaper.Shape(line.text, x, y, font);
                            runs.push({ run, line });
                            const glyphBounds = font.GetGlyphBounds(run.Glyphs);
                            for (let i=0;i<glyphBounds.length;i++) {
                                const b=glyphBounds[i], q=run.Points[i];
                                union(box, {minX:q.X+b.Left,minY:q.Y+b.Top,maxX:q.X+b.Right,maxY:q.Y+b.Bottom,minZ:0,maxZ:0});
                            }
                        } else if (!font) {
                            const paths = []; let offset = x;
                            for (const ch of line.text) {
                                let glyph = shape?.shape.glyph(ch.codePointAt(0));
                                const factor = glyph ? 1 / (shape.shape.above || 10) : 1;
                                glyph ||= A.draftingGlyph(ch);
                                const commands = G.transformPath(glyph.path, [factor,0,0,offset, 0,-factor,0,y, 0,0,1,0, 0,0,0,1]);
                                paths.push(commands); union(box, G.pathBounds(commands)); offset += glyph.advance * factor;
                            }
                            runs.push({paths, line});
                        } else runs.push({line});
                    }
                    if (G.isEmpty(box)) Object.assign(box,{minX:0,minY:0,maxX:1,maxY:1,minZ:0,maxZ:0});
                    const padding = Math.max(units*.1,stroke*2);
                    recorder = new S.SKPictureRecorder();
                    const recording = recorder.BeginRecording(new S.SKRect(box.minX-padding,box.minY-padding,box.maxX+padding,box.maxY+padding));
                    for (const item of runs) {
                        const {line} = item, x=line.x*units,y=line.y*units;
                        if (p.backgroundMask && !selected) {
                            paint.Style=S.SKPaintStyle.Fill;paint.Color=S.SKColor.Parse(frame.background);
                            recording.DrawRect(new S.SKRect(x-.1*units,y-1.1*units,x+(line.width+.1)*units,y+.2*units),paint);
                            paint.Color=S.SKColor.Parse(p.style.color);
                        }
                        if (font) {
                            paint.Style=selected?S.SKPaintStyle.Stroke:S.SKPaintStyle.Fill;paint.StrokeWidth=.025*units;
                            if (item.run) recording.DrawGlyphs(item.run.Glyphs,item.run.Points,new S.SKPoint(0,0),font,paint);
                        } else {
                            paint.Style=S.SKPaintStyle.Stroke;paint.StrokeWidth=stroke;
                            for (const commands of item.paths || []) {
                                const path=nativePath(S,commands);
                                try { recording.DrawPath(path,paint); } finally { path.Dispose(); }
                            }
                        }
                    }
                    const picture = unownedPicture = recorder.EndRecording();
                    const bytes = picture.ApproximateBytesUsed + p.text.length * 32;
                    cached = {picture, units, bytes, primitiveId: p.id, dispose() { picture.Dispose(); }};
                    while (this.textCache.size && (this.textCache.size >= this.textCacheLimit || this.textBytes+bytes > this.textCacheBytes)) {
                        const first=this.textCache.keys().next().value, old=this.textCache.get(first);
                        if (this.activeTextIds?.has(old.primitiveId)) break;
                        this.textCache.delete(first);this.textBytes-=old.bytes;old.dispose();
                    }
                    if (this.textCache.size < this.textCacheLimit && this.textBytes + bytes <= this.textCacheBytes) {this.textCache.set(key,cached);this.textBytes+=bytes;}
                    else temporary=true;
                    unownedPicture = null;
                } finally { unownedPicture?.Dispose(); for (const item of runs) item.run?.Dispose(); recorder?.Dispose(); }
            }
            const save = canvas.Save();
            try {
                canvas.Concat([u.x/cached.units,-v.x/cached.units,origin.x,u.y/cached.units,-v.y/cached.units,origin.y,0,0,1]);
                canvas.DrawPicture(cached.picture);
            } finally { canvas.RestoreToCount(save); if(temporary)cached.dispose(); }
        }
        drawImage(canvas, frame, p, selected) {
            const S = this.S, paint = this.paint, resource = this.resources.get(p.resource, 'image'), origin = frame.worldToScreen(p.position), u = frame.screenDirection(p.u), v = frame.screenDirection(p.v), w = p.imageSize.x, h = p.imageSize.y;
            if (!resource || selected) {
                paint.Style = S.SKPaintStyle.Stroke;
                paint.StrokeWidth = selected ? 2 : 1;
                const path = nativePath(S, G.pathFromPoints(p.points, true), frame.worldToScreen);
                try {
                    canvas.DrawPath(path, paint);
                }
                finally {
                    path.Dispose();
                }
                if (!resource)
                    this.diagnostics.add('missing-image', `Register local image bytes for ${p.resource}. No external path was fetched.`, p.source);
                return;
            }
            const save = canvas.Save();
            try {
                canvas.Concat([u.x, -v.x, origin.x + v.x * h, u.y, -v.y, origin.y + v.y * h, 0, 0, 1]);
                if (p.imageClip?.length && p.source.num(280, 1)) {
                    const path = nativePath(S, G.pathFromPoints(p.imageClip, true), q => vec(q.x + .5, q.y + .5));
                    try {
                        canvas.ClipPath(path, S.SKClipOperation.Intersect, true);
                    }
                    finally {
                        path.Dispose();
                    }
                }
                const brightness = (p.brightness - 50) / 50, contrast = p.contrast / 50, fade = p.fade / 100, off = (.5 * (1 - contrast) + brightness) * (1 - fade);
                const bg = S.SKColor.Parse(frame.background), matrix = [contrast * (1 - fade), 0, 0, 0, off + bg.Red / 255 * fade, 0, contrast * (1 - fade), 0, 0, off + bg.Green / 255 * fade, 0, 0, contrast * (1 - fade), 0, off + bg.Blue / 255 * fade, 0, 0, 0, 1, 0];
                const filter = S.SKColorFilter.CreateColorMatrix(matrix);
                try {
                    paint.ColorFilter = filter;
                }
                finally {
                    filter.Dispose();
                }
                canvas.DrawImage(resource.native, new S.SKRect(0, 0, w, h), paint);
            }
            finally {
                paint.ColorFilter = null;
                canvas.RestoreToCount(save);
            }
        }
        drawGrid(canvas, frame) {
            const S = this.S, paint = this.paint, raw = 50 / frame.scale, base = 10 ** Math.floor(Math.log10(raw)), spacing = raw / base > 5 ? 10 * base : raw / base > 2 ? 5 * base : 2 * base;
            paint.Shader = null; paint.PathEffect = null; paint.ColorFilter = null;
            paint.Color = S.SKColor.Parse('#394550'); paint.Alpha = 255;
            paint.Alpha = 170;
            paint.Style = S.SKPaintStyle.Stroke;
            paint.StrokeWidth = 1;
            let count = 0;
            for (let x = Math.ceil(frame.viewport.minX / spacing) * spacing; x <= frame.viewport.maxX && count++ < 1000; x += spacing) {
                const a = frame.screen(vec(x, frame.viewport.minY)), b = frame.screen(vec(x, frame.viewport.maxY));
                canvas.DrawLine(a.x, a.y, b.x, b.y, paint);
            }
            count = 0;
            for (let y = Math.ceil(frame.viewport.minY / spacing) * spacing; y <= frame.viewport.maxY && count++ < 1000; y += spacing) {
                const a = frame.screen(vec(frame.viewport.minX, y)), b = frame.screen(vec(frame.viewport.maxX, y));
                canvas.DrawLine(a.x, a.y, b.x, b.y, paint);
            }
        }
        dispose() { if (this.disposed)
            return; this.disposed = true; this.clearCache(); this.paint.Dispose(); if (this.ownsResources)
            this.resources.dispose(); }
    }
    Object.assign(A, { projectedScene, prepareFrame, hitTest, snap, nativePath, nativeDash, clipInfiniteLine, SkiaPainter });
    if (typeof module === 'object' && module.exports)
        module.exports = A;
})(globalThis);


// packages/dxf-skia/src/surface-host.js
/* Coalesced native surface lifetime with bounded, observable backend recovery.
 * DXF documents/resources are authoritative; a failed GPU surface is disposable.
 * Never retry a failed backend implicitly, or publish a stale completed frame. */
(function (root) {
    'use strict';
    const A = root.DxfSkia;
    const MODES = ['webgpu', 'webgl', 'canvas'];
    class SurfaceHost {
        constructor({ initialize, Skia, backend = 'auto', allowFallback = true, resources,
            maxPixels = 32000000, onPaint, onError, onCanvasReplaced, onRecovery } = {}) {
            if (!Skia && typeof initialize !== 'function') throw new TypeError('Inject Skia or an asynchronous initialize function.');
            if (backend !== 'auto' && !MODES.includes(backend)) throw new RangeError('Unknown rendering backend.');
            if (!Number.isSafeInteger(maxPixels) || maxPixels < 1) throw new RangeError('Positive integer pixel budget required.');
            Object.assign(this, { initializer: initialize, S: Skia, backend, allowFallback, resources, maxPixels, onPaint, onError, onCanvasReplaced, onRecovery });
            this.canvas = this.surface = this.painter = this.pending = this.lastFrame = this.presentedFrame = null;
            this.paintOptions = {};
            this.suspended = this.disposed = this.faulted = false;
            this.generation = this.requestId = this.paintCount = 0;
            this.error = this._running = this._init = null;
            this.failedBackends = new Set();
            this.recoveryEvents = [];
            this._reportedError = '';
            this._disposePromise = null;
            this._retirements = new WeakMap();
            this._surfaceOperations = new WeakMap();
        }
        initialize(canvas) {
            if (this.disposed) throw new Error('Surface host is disposed.');
            if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('An HTML canvas is required.');
            if (this.surface && this.canvas !== canvas) throw new Error('Cannot change an active canvas; dispose the host first.');
            this.canvas = canvas;
            return this;
        }
        async ensureRuntime() {
            if (this.disposed) throw new Error('Surface host is disposed.');
            this.S = await (this._init ||= (this.S ? Promise.resolve(this.S) : Promise.resolve().then(this.initializer)).catch(error => { this._init = null; throw error; }));
            if (this.disposed) throw new Error('Surface host disposed during initialization.');
            if (!this.painter) {
                this.painter = new A.SkiaPainter(this.S, { resources: this.resources });
                this.resources = this.painter.resources;
            }
            return this.S;
        }
        request(frame, options = {}) {
            if (this.disposed) return;
            this.lastFrame = this.pending = frame;
            this.paintOptions = options;
            this.requestId++;
            if (!this.suspended && !this.faulted) this.schedule();
        }
        reportError(error) {
            this.error = error;
            const signature = error.name + ':' + error.message;
            if (signature !== this._reportedError) {
                this._reportedError = signature;
                try { this.onError?.(error); } catch { /* Consumer callbacks cannot start a rejection loop. */ }
            }
        }
        schedule() {
            if (this._running || this.disposed || this.suspended || this.faulted) return;
            this._running = Promise.resolve().then(() => this.drain()).catch(error => {
                this.pending = null;
                if (!this.disposed) this.reportError(error);
            }).finally(() => {
                this._running = null;
                if (this.pending && !this.suspended && !this.disposed && !this.faulted) this.schedule();
            });
        }
        candidates() {
            const start = this.backend === 'auto' ? 0 : MODES.indexOf(this.backend);
            return MODES.slice(start, this.allowFallback ? undefined : start + 1).filter(mode => !this.failedBackends.has(mode));
        }
        replaceCanvas() {
            const previous = this.canvas;
            if (!previous?.cloneNode) throw new Error('Backend recovery requires a replaceable HTML canvas.');
            const next = previous.cloneNode(false);
            previous.replaceWith?.(next);
            this.canvas = next;
            this.notifyCanvasReplaced(next, previous);
        }
        notifyCanvasReplaced(next, previous) {
            try { this.onCanvasReplaced?.(next, previous); }
            catch (error) { this.callbackError = error; } // Notification failures are not GPU failures.
        }
        surfaceOperation(surface, action) {
            // Native readback, drawing/flush and retirement share one FIFO per surface.
            // Waiting for GPU completion is not sufficient: SnapshotAsync can still
            // own mapping/Skia state after a frame has finished. A rejected read must
            // also release the queue, never stall subsequent paints or teardown.
            const previous = this._surfaceOperations.get(surface) || Promise.resolve();
            const operation = previous.then(action);
            this._surfaceOperations.set(surface, operation.then(() => {}, () => {}));
            return operation;
        }
        async releaseSurface(surface = this.surface) {
            if (!surface) return;
            if (this.surface === surface) this.surface = null;
            // All disposal callers join the same promise, including a loss during flush.
            if (this._retirements.has(surface)) return this._retirements.get(surface);
            const promise = this.surfaceOperation(surface, async () => {
                try { if (surface.DisposeAsync) await surface.DisposeAsync(); else surface.Dispose(); }
                catch (error) { this.disposalError = error; } // Native teardown failed; do not reuse it.
            });
            this._retirements.set(surface, promise);
            this._retiring = { surface, promise };
            await promise;
        }
        recordFailure(mode, error) {
            if (this.failedBackends.has(mode)) return;
            this.failedBackends.add(mode);
            const event = Object.freeze({ backend: mode, message: String(error?.message || error).slice(0, 2048) });
            this.recoveryEvents.push(event);
            this.painter?.clearCache();
            try { this.onRecovery?.(event); } catch { /* Notification only. */ }
        }
        async ensureSurface(width, height) {
            const epoch = this.generation;
            if (this.surface && this.surface.Width === width && this.surface.Height === height) return;
            await this.releaseSurface();
            if (this.disposed || this.suspended || epoch !== this.generation) return;
            const choices = this.negotiatedBackend && !this.failedBackends.has(this.negotiatedBackend)
                ? [this.negotiatedBackend, ...this.candidates().filter(x => x !== this.negotiatedBackend)] : this.candidates();
            for (const mode of choices) {
                if (this.disposed || this.suspended || epoch !== this.generation) return;
                if (this._replaceBeforeCreate) { this.replaceCanvas(); this._replaceBeforeCreate = false; }
                this.canvas.width = width; this.canvas.height = height;
                let created = null, loss = null;
                try {
                    created = await this.S.SKSurface.Create(this.canvas, { backend: mode, allowFallback: false, onDeviceLost: info => {
                        loss = new Error('WebGPU device lost: ' + (info?.message || info?.reason || 'unknown reason'));
                        if (this.disposed || this.surface !== created || !created) return;
                        this.generation++;
                        this.recordFailure(mode, loss);
                        this._lostSurface = created;
                        this.pending = this.lastFrame;
                        this.schedule();
                    } });
                    if (this.disposed || this.suspended || epoch !== this.generation) {
                        await this.releaseSurface(created);
                        this._replaceBeforeCreate = true;
                        return;
                    }
                    if (loss) { await this.releaseSurface(created); throw loss; }
                    this.surface = created;
                    this.negotiatedBackend = created.Backend || mode;
                    if (created.Element && created.Element !== this.canvas) {
                        const previous = this.canvas;
                        this.canvas = created.Element;
                        this.notifyCanvasReplaced(this.canvas, previous);
                    }
                    if (this.canvas.dataset) {
                        this.canvas.dataset.skiaBackend = this.negotiatedBackend;
                        this.canvas.dataset.renderer = 'DxfSkia';
                    }
                    return;
                } catch (error) {
                    if (this.disposed || epoch !== this.generation) { this._replaceBeforeCreate = true; return; }
                    this.recordFailure(mode, error);
                    this._replaceBeforeCreate = true;
                }
            }
            this.faulted = true;
            throw new Error('All permitted rendering backends failed. ' + this.recoveryEvents.map(e => e.backend + ': ' + e.message).join(' | '));
        }
        dimensions(frame) {
            const { width, height, devicePixelRatio = 1 } = frame;
            if (![width, height, devicePixelRatio].every(Number.isFinite) || width <= 0 || height <= 0 || devicePixelRatio <= 0)
                throw new RangeError('Finite positive frame dimensions and device pixel ratio required.');
            const w = Math.max(1, Math.round(width * devicePixelRatio)), h = Math.max(1, Math.round(height * devicePixelRatio));
            if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w * h > this.maxPixels || w > 16384 || h > 16384)
                throw new RangeError('Native surface pixel budget exceeded.');
            return [w, h];
        }
        async drain() {
            await this.ensureRuntime();
            while (this.pending && !this.suspended && !this.disposed && !this.faulted) {
                if (this._lostSurface) {
                    await this.releaseSurface(this._lostSurface);
                    this._lostSurface = null;
                    this._replaceBeforeCreate = true;
                    this.negotiatedBackend = null;
                }
                const frame = this.pending, options = this.paintOptions, id = this.requestId, epoch = this.generation;
                this.pending = null;
                const [width, height] = this.dimensions(frame); // Invalid input is NOT a GPU failure.
                if (!this.canvas) throw new Error('Canvas is not attached.');
                await this.ensureSurface(width, height);
                if (this.disposed || this.suspended) return;
                if (this.pending || id !== this.requestId || epoch !== this.generation) continue;
                const surface = this.surface;
                try {
                    const stats = await this.surfaceOperation(surface, async () => {
                        // The request may have changed while an export held the surface.
                        if (this.disposed || this.suspended || epoch !== this.generation || id !== this.requestId || this.surface !== surface) return null;
                        const result = this.painter.draw(surface.Canvas, frame, options);
                        await surface.FlushAsync();
                        return result;
                    });
                    if (this.disposed || this.suspended || epoch !== this.generation || id !== this.requestId || this.surface !== surface) continue;
                    this.error = null; this._reportedError = '';
                    this.presentedFrame = frame;
                    this.paintCount++;
                    try {
                        this.onPaint?.({ ...stats, frame, paintCount: this.paintCount, backend: surface.Backend,
                            fallbackReasons: [...this.recoveryEvents.map(e => e.backend + ': ' + e.message), ...(surface.FallbackReasons || [])] });
                    } catch (error) { this.callbackError = error; } // A UI callback is not a GPU failure.
                } catch (error) {
                    if (this.disposed) return;
                    if (epoch !== this.generation) {
                        // A late flush rejection belongs to the retired generation.
                        // In particular it must not re-quarantine a backend that the
                        // user has just explicitly retried. Device-loss notifications
                        // already record their own failures before changing generation.
                        await this.releaseSurface(surface);
                        this._replaceBeforeCreate = true;
                        this.negotiatedBackend = null;
                        continue;
                    }
                    const mode = surface.Backend || this.negotiatedBackend;
                    this.recordFailure(mode, error);
                    await this.releaseSurface(surface);
                    this._replaceBeforeCreate = true;
                    this.negotiatedBackend = null;
                    if (!this.allowFallback || !this.candidates().length) { this.faulted = true; throw error; }
                    if (!this.suspended) this.pending ||= this.lastFrame;
                }
            }
        }
        async whenIdle() {
            while (this._running) await this._running;
            if (this.error) throw this.error;
            return this.presentedFrame;
        }
        retryBackend(backend = this.backend) {
            if (backend !== 'auto' && !MODES.includes(backend)) throw new RangeError('Unknown rendering backend.');
            if (this.disposed) throw new Error('Surface host is disposed.');
            this.backend = backend;
            this.failedBackends.clear(); this.recoveryEvents = [];
            this.error = null; this._reportedError = ''; this.faulted = false;
            this.generation++;
            this._lostSurface = this.surface;
            this.negotiatedBackend = null;
            this.pending = this.lastFrame;
            this.schedule();
        }
        resume() { if (this.disposed) return; this.suspended = false; if (this.lastFrame) this.pending = this.lastFrame; this.schedule(); }
        suspend() { this.suspended = true; this.generation++; this.pending = null; }
        async registerResource(name, bytes, options) {
            await this.ensureRuntime();
            const entry = this.resources.register(name, bytes, options);
            if (this.lastFrame) this.request(this.lastFrame, this.paintOptions);
            await this.whenIdle();
            return entry;
        }
        async exportPng() {
            if (this.disposed) throw new Error('Surface host is disposed.');
            if (this.suspended) throw new Error('Resume the drawing before exporting.');
            // whenIdle may have resolved just before another request scheduled a
            // drain. Recheck after the await before taking the readback transaction.
            do { await this.whenIdle(); } while (this._running);
            const surface = this.surface, epoch = this.generation, id = this.requestId;
            if (!surface) throw new Error('No rendered surface.');
            const assertCurrent = () => {
                if (this.disposed || this.suspended || epoch !== this.generation || id !== this.requestId || this.surface !== surface)
                    throw new Error('Drawing changed while exporting.');
            };
            return this.surfaceOperation(surface, async () => {
                assertCurrent();
                const image = await surface.SnapshotAsync();
                if (!image) throw new Error('Native snapshot failed.');
                try {
                    assertCurrent();
                    const data = image.Encode(this.S.SKEncodedImageFormat.Png, 100);
                    if (!data) throw new Error('PNG encoding failed.');
                    try { return data.ToArray(); } finally { data.Dispose(); }
                } finally { image.Dispose(); }
            });
        }
        async exportPdf({ width = 842, height = 595, background = '#ffffff' } = {}) {
            await this.ensureRuntime();
            if (!this.lastFrame)
                throw new Error('No drawing is loaded.');
            if (!(width > 0 && height > 0 && width <= 14400 && height <= 14400))
                throw new RangeError('Invalid PDF page dimensions.');
            const scene = new A.SceneCompiler(this.lastFrame.scene.document, { ...this.lastFrame.scene.compileOptions, background, printing: true }).compile(this.lastFrame.scene.layout), frame = A.prepareFrame(scene, { width, height, background, viewDirection: this.lastFrame.basis.z, viewState: { mode: 'auto', rotationRad: this.lastFrame.rotationRad } }), document = this.S.SKDocument.CreatePdf(null, { NativeBackend: true });
            try {
                const canvas = document.BeginPage(width, height);
                this.painter.draw(canvas, frame, { background });
                document.EndPage();
                document.Close();
                const data = document.ToData();
                try {
                    return data.ToArray();
                }
                finally {
                    data.Dispose();
                }
            }
            finally {
                document.Dispose();
            }
        }
        dispose() {
            if (this._disposePromise) return this._disposePromise;
            this.disposed = true; this.generation++; this.pending = null;
            return this._disposePromise = (async () => {
                await this._running;
                await this.releaseSurface();
                await this._retiring?.promise;
                this.painter?.dispose(); this.painter = null; this.resources = null; this.canvas = null;
            })();
        }
    }
    A.SurfaceHost = SurfaceHost;
    if (typeof module === 'object' && module.exports) module.exports = A;
})(globalThis);

return globalThis.DxfSkia;
})();

export default api;
export const {geometry, SpatialIndex, parseTags, iterateTags, decodeDxf, dxfText, binaryGroupType, DxfRecord, DxfDocument, Diagnostics, aciColor, colorObject, transparency, ResourceStore, resourceKey, ShapeFont, draftingGlyph, layoutText, fallbackTextWidth, SceneCompiler, plainText, decodeProxy, SkiaPainter, prepareFrame, projectedScene, hitTest, snap, nativeDash, clipInfiniteLine, SurfaceHost} = api;
