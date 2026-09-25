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
            const primitive = { ...data, id: `${e.id}:${this.primitives.length}`, source: e, rootSource: context.rootSource || e, handle: context.handles[0] || e.handle || e.id, entityHandle: e.handle || e.id, type: e.type, blockPath: context.blocks.slice(), instancePath: context.handles.slice(), style: { ...style }, clips: context.clips.slice(), bounds: data.path ? G.pathBounds(data.path) : bounds(points) };
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
            if (!c.rootSource) c = { ...c, rootSource: e };
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
            if (item.comparisonDecoration || item.comparisonSide === 'reference' || item.style.alpha <= 0 || !unclipped(frame, item, p))
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
            if (p.comparisonDecoration || p.comparisonSide === 'reference' || p.style.alpha <= 0) continue;
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
            const scene = this.lastFrame.scene.preserveForExport ? this.lastFrame.scene : new A.SceneCompiler(this.lastFrame.scene.document, { ...this.lastFrame.scene.compileOptions, background, printing: true }).compile(this.lastFrame.scene.layout), frame = A.prepareFrame(scene, { width, height, background, viewDirection: this.lastFrame.basis.z, viewState: { mode: 'auto', rotationRad: this.lastFrame.rotationRad } }), document = this.S.SKDocument.CreatePdf(null, { NativeBackend: true });
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


// components/skia-rendering-adapter.js
/* Thin application boundary. DxfRendering remains a UI service name only; every
 * document, curve, paint operation and native surface is implemented by DxfSkia. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, G = A.geometry, N = root.DxfRendering = root.DxfRendering || {};
    const scriptUrl = typeof document !== 'undefined' ? document.currentScript?.src : null;
    const runtimeUrl = scriptUrl ? new URL('../vendor/skiasharpweb/dist/package/browser.js', scriptUrl).href : null;
    let runtime;
    const initializeSkia = () => runtime ||= (runtimeUrl ? import(runtimeUrl).then(m => m.Initialize({ fonts: false })) : Promise.reject(new Error('Provide Skia initialization outside the browser.'))).catch(e => { runtime = null; throw e; });
    class RenderingDataController {
        constructor(options = {}) { this.options = options; this.documents = new Map(); this.listeners = new Set(); }
        ingestDocument({ tabId, fileName, sourceText, sourceBytes } = {}) {
            if (!tabId)
                return null;
            try {
                const document = new A.DxfDocument(sourceBytes ?? sourceText, this.options);
                Object.assign(document, { tabId, fileName, createdAt: Date.now(), sourceLength: sourceBytes?.byteLength ?? sourceText?.length ?? 0, comparisonSourceText: typeof sourceText === "string" ? sourceText : null });
                this.documents.set(tabId, document);
                for (const listener of this.listeners) { try { listener({ type: 'ingest', document }); } catch (error) { console.warn('DXF document observer:', error); } }
                return document;
            }
            catch (error) {
                this.registerPlaceholder(tabId, { fileName, reason: 'buildError', message: error.message });
                return null;
            }
        }
        subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
        registerPlaceholder(id, details = {}) { this.documents.set(id, { status: 'placeholder', ...details }); }
        getDocument(id) { return this.documents.get(id) || null; }
        getSceneGraph(id) { return this.getDocument(id)?.sceneGraph || null; }
        hasDocument(id) { return this.documents.has(id); }
        releaseDocument(id) { this.documents.delete(id); }
    }
    class RenderingDocumentBuilder {
        constructor({ tags } = {}) { this.tags = tags; }
        build() { return new A.DxfDocument(this.tags); }
    }
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    class RenderingSurfaceManager {
        constructor(options = {}) {
            this.options = { background: '#212830', lineweights: true, ...options };
            this.width = 800;
            this.height = 600;
            this.devicePixelRatio = 1;
            this.sceneGraph = null;
            this.compiled = null;
            this.layout = 'Model';
            this.viewDirection = G.vec(0, 0, 1);
            this.viewState = { mode: 'auto' };
            this.selectionHandles = new Set();
            this.blockHighlights = new Set();
            this.compileRevision = 0;
            this.builtRevision = -1;
            this.lastFrame = null;
            this.visualStyle = '2dwireframe';
            this.gridVisible = false;
            this.suspended = false;
            this.error = null;
            this.diagnostics = [];
            this.host = new A.SurfaceHost({ initialize: options.initialize || initializeSkia, Skia: options.Skia, backend: options.backend || 'auto', onCanvasReplaced: (canvas) => { this.canvas = canvas; this.onCanvasReplaced?.(canvas); }, onPaint: stats => {
                    this.error = null;
                    this.stats = stats;
                    this.diagnostics = stats.diagnostics;
                    this.onPaint?.(stats);
                    this.canvas?.dispatchEvent(new CustomEvent('dxf-skia-painted', { detail: stats }));
                }, onError: error => { this.error = error; this.onError?.(error); this.canvas?.dispatchEvent(new CustomEvent('dxf-skia-error', { detail: error })); } });
        }
        static getVisualStylePresets() { return [{ key: '2dwireframe', id: '2dwireframe', name: '2D Wireframe', label: '2D Wireframe', category: 'wireframe' }, { key: 'shaded', id: 'shaded', name: 'Filled faces', label: 'Filled faces', category: 'shaded' }]; }
        initialize(canvas) { this.canvas = canvas; this.host.initialize(canvas); const rect = canvas.getBoundingClientRect(); this.width = Math.max(1, rect.width || canvas.width || 800); this.height = Math.max(1, rect.height || canvas.height || 600); return this; }
        setCanvasReplacementCallback(callback) { this.onCanvasReplaced = callback; }
        get activeSurface() { return this.host.surface; }
        get resources() { return this.host.resources; }
        get ready() { return this.host.whenIdle(); }
        change(name, value) { if (!same(this.options[name], value)) {
            this.options[name] = value;
            this.compileRevision++;
        } }
        setLayerState(value) { this.change('layerState', value instanceof Map ? Object.fromEntries(value) : value); }
        setBlockIsolation(value) { const next = new Set(Array.from(value || [], A.key)); if ([...next].join('|') !== [...(this.options.blockIsolation || [])].join('|')) {
            this.options.blockIsolation = next;
            this.compileRevision++;
        } }
        setEntityIsolation(value) { const next = new Set(value || []); if ([...next].join('|') !== [...(this.options.entityIsolation || [])].join('|')) {
            this.options.entityIsolation = next;
            this.compileRevision++;
        } }
        setBlockHighlights(value) { this.blockHighlights = new Set(Array.from(value || [], A.key)); }
        setSelectionHandles(value) { this.selectionHandles = new Set(value || []); }
        setAttributeDisplay(value) { for (const key of ['showDefinitions', 'showReferences', 'showInvisible'])
            if (key in value)
                this.change(key, !!value[key]); }
        setVisualStyle(value) { this.visualStyle = typeof value === 'object' ? value.name || value.key : value || '2dwireframe'; if (!['2dwireframe', 'shaded'].includes(this.visualStyle))
            this.visualStyle = '2dwireframe'; }
        getVisualStyleOverride() { return { value: this.visualStyle }; }
        setLayout(layout) { if (!this.sceneGraph?.document)
            throw new Error('Load a drawing first.'); this.sceneGraph.document.getEntities(layout); this.layout = layout; this.compileRevision++; this.viewState = { mode: 'auto' }; return this.renderScene(this.sceneGraph); }
        setViewDirection(direction) { this.viewDirection = G.normal(direction); this.viewState = { mode: 'auto' }; return this.sceneGraph ? this.renderScene(this.sceneGraph) : null; }
        setComparison(session) { this.comparison = session; this.comparisonTarget = this.sceneGraph?.document.tabId ?? this.sceneGraph?.document; this.comparisonError = null; }
        renderScene(sceneGraph, options = {}) {
            if (!sceneGraph?.document)
                throw new TypeError('Only DxfSkia scene graphs are accepted.');
            if (this.comparison && this.comparisonTarget !== (sceneGraph.document.tabId ?? sceneGraph.document)) this.setComparison(null);
            if (this.sceneGraph !== sceneGraph) {
                this.sceneGraph = sceneGraph;
                this.layout = 'Model';
                this.compileRevision++;
                this.viewState = { mode: 'auto' };
            }
            if (options.viewState)
                this.viewState = options.viewState;
            if (!this.compiled || this.builtRevision !== this.compileRevision) {
                this.compiled = new A.SceneCompiler(sceneGraph.document, { ...this.options, textMeasurer: this.resources ? (p, t) => this.resources.measureText(p, t) : undefined }).compile(this.layout);
                this.builtRevision = this.compileRevision;
            }
            let displayScene = this.compiled;
            if (this.comparison?.enabled) {
                try { displayScene = this.comparison.scene(this.compiled); this.comparisonError = null; }
                catch (error) { this.comparisonError = error; this.comparison.enabled = false; }
            }
            const frame = A.prepareFrame(displayScene, { width: this.width, height: this.height, devicePixelRatio: this.devicePixelRatio, viewState: this.viewState, viewDirection: this.viewDirection, visualStyle: this.visualStyle, background: this.options.background });
            this.lastFrame = frame;
            this.diagnostics = displayScene.diagnostics;
            this.host.request(frame, { selection: this.selectionHandles, blockHighlights: this.blockHighlights, grid: this.gridVisible });
            return frame;
        }
        resize(width, height, dpr = 1) { if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(dpr))
            throw new RangeError('Finite viewport dimensions required.'); this.width = Math.max(1, width); this.height = Math.max(1, height); this.devicePixelRatio = G.clamp(dpr, 1, 3); if (this.sceneGraph)
            this.renderScene(this.sceneGraph); }
        resume() { this.suspended = false; this.host.resume(); }
        suspend() { this.suspended = true; this.host.suspend(); }
        clear() { this.setComparison(null); this.host.suspend(); this.sceneGraph = null; this.compiled = null; this.lastFrame = null; this.host.lastFrame = null; this.host.pending = null; this.host.painter?.clearCache(); }
        renderMessage(message) { this.message = String(message); this.onError?.(new Error(message)); }
        async registerResource(...args) { await this.host.ensureRuntime(); const result = this.resources.register(...args); this.compileRevision++; if (this.sceneGraph)
            this.renderScene(this.sceneGraph); await this.ready; return result; }
        async exportPng() { return this.host.exportPng(); }
        async exportPdf(options) { return this.host.exportPdf(options); }
        async dispose() { this.clear(); await this.host.dispose(); }
        destroy() { return this.dispose(); }
    }
    Object.assign(N, { RenderingDataController, RenderingDocumentBuilder, RenderingSurfaceManager, initializeSkia });
    if (typeof module === 'object' && module.exports)
        module.exports = N;
})(globalThis);


// components/rendering-property-grid.js
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

   class RenderingPropertyGrid {
     constructor(container, options = {}) {
       this.container = container;
       this.options = Object.assign({
         emptyMessage: 'No properties available.'
       }, options);
       this.sections = [];
       if (this.container) {
         this.container.classList.add('rendering-property-grid');
       }
     }

     setSections(sections) {
       if (!Array.isArray(sections)) {
         this.sections = [];
       } else {
         this.sections = sections.map((section) => {
           return {
             title: typeof section.title === 'string' ? section.title : '',
             subtitle: typeof section.subtitle === 'string' ? section.subtitle : '',
             properties: Array.isArray(section.properties) ? section.properties.slice() : []
           };
         });
       }
       this.render();
     }

     clear() {
       this.setSections([]);
     }

     render() {
       if (!this.container) {
         return;
       }
       if (root.DxfGrid) {
         const rows = this.sections.flatMap((section, index) => section.properties.map((prop, i) => ({
           key: `${index}:${i}`, values: [section.title, prop.name, prop.isHtml ? String(prop.value ?? '').replace(/<[^>]*>/g, '') : prop.value]
         })));
         if (this.gridView) this.gridView.setRows(rows);
         else { this.container.replaceChildren(); this.gridView = new (root.DxfAnalysis?.AnalysisView || root.DxfGrid.GridView)(this.container, { title: 'Selection Properties', columns: ['Section', 'Property', 'Value'], rows }); }
         return;
       }
       this.container.innerHTML = '';
       if (!this.sections.length) {
         const emptyState = document.createElement('div');
         emptyState.className = 'property-grid-empty';
         emptyState.textContent = this.options.emptyMessage;
         this.container.appendChild(emptyState);
         return;
       }

       this.sections.forEach((section) => {
         const card = document.createElement('section');
         card.className = 'property-grid-section';

         if (section.title) {
           const heading = document.createElement('h4');
           heading.className = 'property-grid-title';
           heading.textContent = section.title;
           card.appendChild(heading);
         }
         if (section.subtitle) {
           const subtitle = document.createElement('div');
           subtitle.className = 'property-grid-subtitle';
           subtitle.textContent = section.subtitle;
           card.appendChild(subtitle);
         }

         const table = document.createElement('table');
         table.className = 'property-grid-table';
         const tbody = document.createElement('tbody');

         if (!section.properties.length) {
           const row = document.createElement('tr');
           const keyCell = document.createElement('th');
           keyCell.textContent = 'Details';
           const valueCell = document.createElement('td');
           valueCell.textContent = 'No properties provided.';
           row.appendChild(keyCell);
           row.appendChild(valueCell);
           tbody.appendChild(row);
         } else {
           section.properties.forEach((prop) => {
             const row = document.createElement('tr');
             row.className = 'property-grid-row';
             const keyCell = document.createElement('th');
             keyCell.className = 'property-grid-key';
             keyCell.textContent = prop.name != null ? String(prop.name) : '';
             const valueCell = document.createElement('td');
             valueCell.className = 'property-grid-value';
             if (prop.value == null || prop.value === '') {
               valueCell.textContent = '';
             } else if (prop.isHtml) {
               valueCell.innerHTML = prop.value;
             } else {
               const valueText = String(prop.value);
               const pre = document.createElement('pre');
               pre.textContent = valueText;
               valueCell.appendChild(pre);
             }
             row.appendChild(keyCell);
             row.appendChild(valueCell);
             tbody.appendChild(row);
           });
         }

         table.appendChild(tbody);
         card.appendChild(table);
         this.container.appendChild(card);
       });
     }
   }

   namespace.RenderingPropertyGrid = RenderingPropertyGrid;

   return {
     RenderingPropertyGrid
   };
 }));


// components/rendering-overlay.js
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
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const DEFAULT_SELECTORS = {
    overlayRoot: '#dxfRenderingOverlay',
    closeBtn: '#closeRenderingOverlayBtn',
    titleEl: '#renderingOverlayTitle',
    summaryContainer: '#renderingOverlaySummary',
    infoTabButton: '#renderingOverlayInfoTab',
    layersTabButton: '#renderingOverlayLayersTab',
    infoTabPanel: '#renderingOverlayInfoPanel',
    layersTabPanel: '#renderingOverlayLayersPanel',
    layerManagerContainer: '#renderingOverlayLayerManager',
    layerManagerStatus: '#layerManagerStatus',
    layerManagerFilterInput: '#layerManagerFilter',
    layerManagerHideInactiveCheckbox: '#layerManagerHideInactive',
    layerManagerResetButton: '#layerManagerReset',
    canvas: '#renderingOverlayCanvas',
    textLayer: '#renderingOverlayTextLayer',
    attributeDefinitionCheckbox: '#toggleAttributeDefinitions',
    attributeInvisibleCheckbox: '#toggleAttributeInvisible',
    attributeReferencesCheckbox: '#toggleAttributeReferences',
    interactionLayer: '#renderingOverlayInteractionLayer',
    measurementLayer: '#renderingOverlayMeasurementLayer',
    snapLayer: '#renderingOverlaySnapLayer',
    measurementToolbar: '#renderingMeasurementToolbar',
    visualStyleSelect: '#renderingVisualStyleSelect',
    selectionToolbar: '#renderingSelectionToolbar',
    viewCubeEl: '#renderingViewCube',
    navigationWheelEl: '#renderingNavigationWheel',
    viewUndoButton: '#viewUndoBtn',
    viewRedoButton: '#viewRedoBtn',
    viewHomeButton: '#viewHomeBtn',
    overlayBody: '.rendering-overlay-body',
    propertyPanel: '#renderingOverlayPropertyPanel',
    propertySummary: '#renderingPropertiesSummary',
    propertyGrid: '#renderingPropertyGridContainer',
    blocksTabButton: '#renderingOverlayBlocksTab',
    blocksTabPanel: '#renderingOverlayBlocksPanel',
    blockSummary: '#renderingBlocksSummary',
    blockGrid: '#renderingBlocksGrid'
  };

  const DEFAULT_ADAPTERS = {
    updateBlockMetadata: null,
    handleLinkToHandle: null,
    toggleBlockHighlight: null,
    getBlockIsolation: null,
    getBlockHighlights: null
  };

  class RenderingOverlayController {
    constructor(options = {}) {
      this.global = options.global || root;
      this.document = options.document || (this.global && this.global.document ? this.global.document : null);
      this.rootElement = options.root || null;
      this.selectors = Object.assign({}, DEFAULT_SELECTORS, options.selectors || {});
      this.adapters = Object.assign({}, DEFAULT_ADAPTERS, options.adapters || {});
      this.dataController = options.dataController || null;
      this.dxfParser = options.dxfParser || null;
      this.app = options.app || null;

      this.overlayRoot = null;
      this.closeBtn = null;
      this.titleEl = null;
      this.summaryContainer = null;
      this.infoTabButton = null;
      this.layersTabButton = null;
      this.infoTabPanel = null;
      this.layersTabPanel = null;
      this.activeInfoTab = 'info';
      this.layerManagerContainer = null;
      this.layerManagerStatus = null;
      this.layerManagerFilterInput = null;
      this.layerManagerHideInactiveCheckbox = null;
      this.layerManagerResetButton = null;
      this.canvas = null;
      this.currentTabId = null;
      this.currentPane = null;
      this.currentSceneGraph = null;
      this.currentDoc = null;
      this.surfaceManager = null;
      this.textLayer = null;
      this.viewportEl = null;
      this.interactionLayer = null;
      this.marqueeElement = null;
      this.lassoSvg = null;
      this.lassoPathElement = null;
      this.layerCatalogByTab = new Map();
      this.layerOverridesByTab = new Map();
      this.currentLayerCatalog = null;
      this.currentLayerOverrides = null;
      this.layerManagerFilterText = '';
      this.layerManagerHideInactiveFlag = false;
      this.selectionByTab = new Map();
      this.selectionHandles = new Set();
      this.entityLookupByTab = new Map();
      this.currentInteraction = null;
      this.activePointerId = null;
      this.pointerListenersAttached = false;
      this.attributeDisplayState = {
        showDefinitions: false,
        showInvisible: false,
        showReferences: true
      };
      this.attributeDefinitionCheckbox = null;
      this.attributeInvisibleCheckbox = null;
      this.attributeReferencesCheckbox = null;
      this.measurementToolbar = null;
      this.measurementToolbarButtons = [];
      this.measurementButtonHandlers = new Map();
      this.measurementLayer = null;
      this.overlayBodyEl = null;
      this.propertyPanel = null;
      this.propertySummaryEl = null;
      this.propertyGridContainer = null;
      this.propertyGrid = null;
      this.blocksTabButton = null;
      this.blocksTabPanel = null;
      this.blockSummaryEl = null;
      this.blockGridEl = null;
      this.blockCardMap = new Map();
      this.blockMetadataByTab = new Map();
      this.currentBlockMetadata = null;
      this.pendingBlockFocus = null;
      this.measurementSummaryEl = null;
      this.measurementMode = 'none';
      this.measurementModeOrder = ['none', 'distance', 'area', 'angle'];
      this.measurementState = {
        points: [],
        previewPoint: null
      };
      this.snapLayer = null;
      this.snapMarkerEl = null;
      this.snapMarkerLabelEl = null;
      this.snapState = {
        active: false,
        type: null,
        label: null,
        world: null,
        screen: null,
        sourceHandle: null,
        isPreview: false
      };
      this.snapCandidatesCache = null;
      this.selectionToolbar = null;
      this.selectionToolbarButtons = [];
      this.selectionToolbarHandlers = new Map();
      this.isolationSummaryEl = null;
      this.layerIsolationState = null;
      this.layerIsolationStateByTab = new Map();
      this.objectIsolationState = null;
      this.objectIsolationStateByTab = new Map();
      this.viewContexts = new Map();
      this.viewCubeEl = null;
      this.navigationWheelEl = null;
      this.viewUndoButton = null;
      this.viewRedoButton = null;
      this.viewHomeButton = null;
      this.viewNavHandlers = new Map();
      this.viewWheelHandler = null;
      this.viewNavigationMode = null;
      this.navigationDragState = null;
      this.visualStyleSelect = null;
      this.visualStyleAutoOption = null;
      this.visualStyleChangeHandler = null;
      this.visualStyleOptionToSpecifier = new Map();
      this.visualStyleSpecifierToOption = new Map();
      this.keydownListenerTarget = null;

      this.boundInfoTabClick = () => this.setInformationTab('info', { focus: true });
      this.boundLayersTabClick = () => this.setInformationTab('layers', { focus: true });
      this.boundBlocksTabClick = () => this.setInformationTab('blocks', { focus: true });
      this.boundClose = () => this.close();
      this.boundOnKeyDown = (event) => this.handleOverlayKeyDown(event);
      this.boundPointerDown = (event) => this.handlePointerDown(event);
      this.boundPointerMove = (event) => this.handlePointerMove(event);
      this.boundPointerUp = (event) => this.handlePointerUp(event);
      this.boundPointerCancel = (event) => this.handlePointerCancel(event);
    }

    getDocument() {
      if (this.document) {
        return this.document;
      }
      if (this.rootElement && this.rootElement.ownerDocument) {
        return this.rootElement.ownerDocument;
      }
      if (this.overlayRoot && this.overlayRoot.ownerDocument) {
        return this.overlayRoot.ownerDocument;
      }
      if (this.global && this.global.document) {
        return this.global.document;
      }
      return null;
    }

    createElement(tagName) {
      const doc = this.getDocument();
      return doc ? doc.createElement(tagName) : null;
    }

    createSvgElement(tagName, namespace = SVG_NS) {
      const doc = this.getDocument();
      return doc ? doc.createElementNS(namespace, tagName) : null;
    }

    callAdapter(name, ...args) {
      const adapter = this.adapters[name];
      if (typeof adapter === 'function') {
        adapter(...args);
        return true;
      }
      if (this.app && typeof this.app[name] === 'function') {
        this.app[name](...args);
        return true;
      }
      return false;
    }

    getBlockIsolation() {
      if (typeof this.adapters.getBlockIsolation === 'function') {
        return this.adapters.getBlockIsolation();
      }
      if (this.app && Object.prototype.hasOwnProperty.call(this.app, 'blockIsolation')) {
        return this.app.blockIsolation;
      }
      return null;
    }

    getBlockHighlights() {
      if (typeof this.adapters.getBlockHighlights === 'function') {
        return this.adapters.getBlockHighlights();
      }
      if (this.app && Object.prototype.hasOwnProperty.call(this.app, 'blockHighlights')) {
        return this.app.blockHighlights;
      }
      return null;
    }

    normalizeHandle(value) {
      if (value == null) {
        return null;
      }
      const stringValue = typeof value === 'string' ? value : String(value);
      const trimmed = stringValue.trim();
      return trimmed ? trimmed.toUpperCase() : null;
    }

    escapeHtml(value) {
      if (value == null) {
        return '';
      }
      return String(value).replace(/[&<>"']/g, (char) => {
        switch (char) {
          case '&': return '&amp;';
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '"': return '&quot;';
          case "'": return '&#39;';
          default: return char;
        }
      });
    }

    normalizeAngle(value) {
      if (!Number.isFinite(value)) {
        return 0;
      }
      let angle = value % (Math.PI * 2);
      if (angle > Math.PI) {
        angle -= Math.PI * 2;
      } else if (angle <= -Math.PI) {
        angle += Math.PI * 2;
      }
      return angle;
    }

    cloneViewState(viewState) {
      if (!viewState || typeof viewState !== 'object') {
        return null;
      }
      const mode = viewState.mode === 'auto' ? 'auto' : 'custom';
      const centerCandidate = viewState.center;
      const center = centerCandidate && typeof centerCandidate === 'object'
        ? {
            x: Number.isFinite(centerCandidate.x) ? centerCandidate.x : 0,
            y: Number.isFinite(centerCandidate.y) ? centerCandidate.y : 0
          }
        : null;
      const scale = Number.isFinite(viewState.scale) && viewState.scale > 0
        ? viewState.scale
        : null;
      let rotationRad = 0;
      if (Number.isFinite(viewState.rotationRad)) {
        rotationRad = viewState.rotationRad;
      } else if (Number.isFinite(viewState.rotationDeg)) {
        rotationRad = viewState.rotationDeg * Math.PI / 180;
      }
      rotationRad = this.normalizeAngle(rotationRad);
      return {
        mode,
        center,
        scale,
        rotationRad,
        rotationDeg: rotationRad * 180 / Math.PI
      };
    }

    normalizeViewState(viewState, fallback = null) {
      if (!viewState || typeof viewState !== 'object') {
        return fallback ? this.cloneViewState(fallback) : null;
      }
      if (viewState.mode === 'auto') {
        return { mode: 'auto' };
      }
      const fallbackState = fallback ? this.cloneViewState(fallback) : null;
      const clone = this.cloneViewState(viewState);
      if (!clone) {
        return fallbackState;
      }
      if (!clone.center && fallbackState && fallbackState.center) {
        clone.center = { x: fallbackState.center.x, y: fallbackState.center.y };
      }
      if (!Number.isFinite(clone.scale) || clone.scale <= 0) {
        clone.scale = fallbackState && Number.isFinite(fallbackState.scale) && fallbackState.scale > 0
          ? fallbackState.scale
          : 1;
      }
      if (!Number.isFinite(clone.rotationRad)) {
        clone.rotationRad = fallbackState && Number.isFinite(fallbackState.rotationRad)
          ? fallbackState.rotationRad
          : 0;
        clone.rotationDeg = clone.rotationRad * 180 / Math.PI;
      }
      clone.mode = 'custom';
      return clone;
    }

    areViewStatesEqual(a, b, epsilon = 1e-6) {
      if (!a && !b) {
        return true;
      }
      if (!a || !b) {
        return false;
      }
      if (a.mode === 'auto' || b.mode === 'auto') {
        return a.mode === b.mode;
      }
      const centerA = a.center || { x: 0, y: 0 };
      const centerB = b.center || { x: 0, y: 0 };
      const scaleA = Number.isFinite(a.scale) ? a.scale : 1;
      const scaleB = Number.isFinite(b.scale) ? b.scale : 1;
      const rotA = Number.isFinite(a.rotationRad) ? this.normalizeAngle(a.rotationRad) : 0;
      const rotB = Number.isFinite(b.rotationRad) ? this.normalizeAngle(b.rotationRad) : 0;
      return Math.abs(centerA.x - centerB.x) <= epsilon &&
        Math.abs(centerA.y - centerB.y) <= epsilon &&
        Math.abs(scaleA - scaleB) <= epsilon * Math.max(1, Math.abs(scaleA), Math.abs(scaleB)) &&
        Math.abs(rotA - rotB) <= epsilon;
    }

    getViewContextKey(tabId = this.currentTabId, pane = this.currentPane) {
      if (!tabId) {
        return null;
      }
      const paneKey = (pane || 'left').toLowerCase();
      return `${tabId}::${paneKey}`;
    }

    ensureViewContext(create = true) {
      const key = this.getViewContextKey();
      if (!key) {
        return null;
      }
      if (!this.viewContexts.has(key) && create) {
        this.viewContexts.set(key, {
          key,
          current: null,
          auto: null,
          history: [],
          index: -1
        });
      }
      return this.viewContexts.get(key) || null;
    }

    updateViewContextFromFrame(context, frame, options = {}) {
      if (!context || !frame) {
        return;
      }
      const sanitizedCurrent = this.cloneViewState(frame.viewState);
      const sanitizedAuto = this.cloneViewState(frame.autoViewState);
      if (sanitizedAuto) {
        context.auto = sanitizedAuto;
      }
      if (sanitizedCurrent) {
        context.current = sanitizedCurrent;
      }
      if (!Array.isArray(context.history) || !context.history.length) {
        if (sanitizedCurrent) {
          context.history = [this.cloneViewState(sanitizedCurrent)];
          context.index = 0;
        } else {
          context.history = [];
          context.index = -1;
        }
      } else if (options.updateCurrent === true && context.index >= 0 && context.index < context.history.length && sanitizedCurrent) {
        context.history[context.index] = this.cloneViewState(sanitizedCurrent);
      }
    }

    recordViewHistory(context, state) {
      if (!context || !state) {
        return;
      }
      const entry = this.cloneViewState(state);
      if (!entry) {
        return;
      }
      const currentHistory = Array.isArray(context.history) ? context.history : [];
      const safeIndex = Math.max(context.index != null ? context.index : -1, -1);
      const truncated = currentHistory.slice(0, safeIndex + 1);
      if (truncated.length && this.areViewStatesEqual(truncated[truncated.length - 1], entry)) {
        context.history = truncated;
        context.index = truncated.length - 1;
        return;
      }
      truncated.push(entry);
      const maxEntries = 64;
      if (truncated.length > maxEntries) {
        const removeCount = truncated.length - maxEntries;
        truncated.splice(0, removeCount);
      }
      context.history = truncated;
      context.index = truncated.length - 1;
    }

    getActiveViewState(frameOverride) {
      const context = this.ensureViewContext(false);
      if (context && context.current) {
        return this.cloneViewState(context.current);
      }
      const frame = frameOverride || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      if (frame && frame.viewState) {
        return this.cloneViewState(frame.viewState);
      }
      return null;
    }

    getAutoViewState(frameOverride) {
      const context = this.ensureViewContext(false);
      if (context && context.auto) {
        return this.cloneViewState(context.auto);
      }
      const frame = frameOverride || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      if (frame && frame.autoViewState) {
        return this.cloneViewState(frame.autoViewState);
      }
      return null;
    }

    renderCurrentFrameWithView(viewStateOverride) {
      if (!this.surfaceManager || !this.currentSceneGraph) {
        return null;
      }
      const options = {};
      if (viewStateOverride && viewStateOverride.mode === 'auto') {
        options.viewState = { mode: 'auto' };
      } else if (viewStateOverride) {
        options.viewState = this.cloneViewState(viewStateOverride);
      } else {
        options.viewState = { mode: 'auto' };
      }
      const frame = this.surfaceManager.renderScene(this.currentSceneGraph, options);
      this.surfaceManager.resume();
      this.refreshViewportOverlays(frame);
      return frame;
    }

    applyViewState(viewState, options = {}) {
      const context = this.ensureViewContext();
      if (!context) {
        return;
      }
      let normalized = null;
      if (viewState && viewState.mode === 'auto') {
        normalized = { mode: 'auto' };
      } else {
        const fallback = this.getActiveViewState();
        normalized = this.normalizeViewState(viewState, fallback);
        if (!normalized) {
          normalized = fallback || { mode: 'auto' };
        }
      }
      const frame = this.renderCurrentFrameWithView(normalized);
      if (!frame) {
        return;
      }
      const shouldUpdateCurrent = options.recordHistory === false;
      this.updateViewContextFromFrame(context, frame, { updateCurrent: shouldUpdateCurrent });
      if (options.recordHistory !== false) {
        this.recordViewHistory(context, frame.viewState);
      }
      this.updateViewNavigationUi();
    }

    zoomView(factor, options = {}) {
      const frame = this.surfaceManager?.lastFrame;
      if (!frame || !(factor > 0) || !Number.isFinite(factor)) return;
      const anchor = options.anchor || { x: frame.width / 2, y: frame.height / 2 };
      const before = frame.toProjected(anchor), ratio = Math.max(1e-12, Math.min(1e12, frame.scale * factor)) / frame.scale;
      const center = { x: before.x - (before.x - frame.worldCenter.x) / ratio, y: before.y - (before.y - frame.worldCenter.y) / ratio };
      this.applyViewState({ mode: 'custom', center, scale: frame.scale * ratio, rotationRad: frame.rotationRad });
    }

    focusHandles(handlesIterable, options = {}) {
      const frame=this.surfaceManager?.lastFrame;
      if (!frame || !handlesIterable) return false;
      const handles=new Set(Array.from(typeof handlesIterable==='string'?[handlesIterable]:handlesIterable, h=>this.normalizeHandle(h)));
      const G=globalThis.DxfSkia.geometry, extent=G.emptyBounds();
      for (const entry of frame.projection.entries) {
        if (!entry.primitive.infinite && (handles.has(this.normalizeHandle(entry.primitive.handle)) || handles.has(this.normalizeHandle(entry.primitive.entityHandle)))) G.union(extent,entry.bounds);
      }
      if (G.isEmpty(extent)) return false;
      const c=G.center(extent),padding=options.padding??48,dx=Math.max(.001,extent.maxX-extent.minX),dy=Math.max(.001,extent.maxY-extent.minY);
      const projectedWidth=Math.abs(frame.cos)*dx+Math.abs(frame.sin)*dy,projectedHeight=Math.abs(frame.sin)*dx+Math.abs(frame.cos)*dy;
      const scale=Math.max(1e-12,Math.min((frame.width-padding*2)/projectedWidth,(frame.height-padding*2)/projectedHeight));
      this.applyViewState({mode:'custom',center:c,scale,rotationRad:frame.rotationRad});
      return true;
    }

    panView(deltaX, deltaY) {
      if (!Number.isFinite(deltaX) && !Number.isFinite(deltaY)) {
        return;
      }
      const frame = this.surfaceManager ? this.surfaceManager.lastFrame : null;
      if (!frame) {
        return;
      }
      const context = this.ensureViewContext();
      if (!context) {
        return;
      }
      const current = this.getActiveViewState(frame) || this.getAutoViewState(frame);
      if (!current) {
        return;
      }
      const scale = Number.isFinite(current.scale) && current.scale > 0 ? current.scale : frame.scale || 1;
      const rotation = Number.isFinite(current.rotationRad) ? current.rotationRad : 0;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const screenDx = Number.isFinite(deltaX) ? deltaX : 0;
      const screenDy = Number.isFinite(deltaY) ? deltaY : 0;
      const dx = screenDx / scale;
      const dy = -screenDy / scale;
      const worldDx = cos * dx + sin * dy;
      const worldDy = -sin * dx + cos * dy;
      const baseCenter = current.center || frame.worldCenter || { x: 0, y: 0 };
      const nextCenter = {
        x: baseCenter.x - worldDx,
        y: baseCenter.y - worldDy
      };
      this.applyViewState({
        mode: 'custom',
        center: nextCenter,
        scale,
        rotationRad: rotation
      });
    }

    orbitView(deltaDegrees) {
      if (!Number.isFinite(deltaDegrees) || deltaDegrees === 0) {
        return;
      }
      const frame = this.surfaceManager ? this.surfaceManager.lastFrame : null;
      if (!frame) {
        return;
      }
      const context = this.ensureViewContext();
      if (!context) {
        return;
      }
      const current = this.getActiveViewState(frame) || this.getAutoViewState(frame);
      if (!current) {
        return;
      }
      const scale = Number.isFinite(current.scale) && current.scale > 0 ? current.scale : frame.scale || 1;
      const baseCenter = current.center || frame.worldCenter || { x: 0, y: 0 };
      const rotation = this.normalizeAngle((Number.isFinite(current.rotationRad) ? current.rotationRad : 0) + deltaDegrees * Math.PI / 180);
      this.applyViewState({
        mode: 'custom',
        center: baseCenter,
        scale,
        rotationRad: rotation
      });
    }

    resetViewNavigation() {
      const context = this.ensureViewContext(false);
      const target = context && context.auto ? context.auto : { mode: 'auto' };
      this.applyViewState(target);
    }

    undoViewNavigation() {
      const context = this.ensureViewContext(false);
      if (!context || !Array.isArray(context.history) || context.index <= 0) {
        return;
      }
      context.index -= 1;
      const target = context.history[context.index];
      this.applyViewState(target, { recordHistory: false });
      this.updateViewNavigationUi();
    }

    redoViewNavigation() {
      const context = this.ensureViewContext(false);
      if (!context || !Array.isArray(context.history) || context.index < 0 || context.index >= context.history.length - 1) {
        return;
      }
      context.index += 1;
      const target = context.history[context.index];
      this.applyViewState(target, { recordHistory: false });
      this.updateViewNavigationUi();
    }

    updateViewNavigationUi() {
      const context = this.ensureViewContext(false);
      const history = context && Array.isArray(context.history) ? context.history : [];
      const undoDisabled = !context || context.index <= 0;
      const redoDisabled = !context || context.index < 0 || context.index >= history.length - 1;
      if (this.viewUndoButton) {
        this.viewUndoButton.disabled = undoDisabled;
      }
      if (this.viewRedoButton) {
        this.viewRedoButton.disabled = redoDisabled;
      }
      if (this.viewHomeButton) {
        this.viewHomeButton.disabled = !context || !context.auto;
      }
      if (this.viewCubeEl) {
        const buttons = Array.from(this.viewCubeEl.querySelectorAll('button[data-view]'));
        const activeState = this.getActiveViewState();
        let activeKey = activeState && activeState.mode === 'auto' ? 'home' : null;
        if (activeState && activeState.mode !== 'auto' && Number.isFinite(activeState.rotationRad)) {
          const deg = this.normalizeAngle(activeState.rotationRad) * 180 / Math.PI;
          if (deg > -22.5 && deg <= 22.5) {
            activeKey = 'top';
          } else if (deg > 22.5 && deg <= 67.5) {
            activeKey = 'iso';
          } else if (deg > 67.5 && deg <= 112.5) {
            activeKey = 'left';
          } else if (deg > 112.5 || deg <= -157.5) {
            activeKey = 'bottom';
          } else if (deg > -67.5 && deg <= -22.5) {
            activeKey = 'iso';
          } else if (deg > -112.5 && deg <= -67.5) {
            activeKey = 'right';
          } else {
            activeKey = 'bottom';
          }
        }
        buttons.forEach((button) => {
          const isActive = activeKey && button.dataset.view === activeKey;
          button.classList.toggle('active', !!isActive);
          button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
      }
    }

    handleViewCubeSelection(orientation) {
      if (!orientation) {
        return;
      }
      this.onViewCubeOrientation(orientation.toLowerCase());
    }

    onViewCubeOrientation(orientation) {
      const directions={home:[0,0,1],top:[0,0,1],bottom:[0,0,-1],front:[0,-1,0],back:[0,1,0],left:[-1,0,0],right:[1,0,0],iso:[1,-1,1],isometric:[1,-1,1],'iso-left':[-1,-1,1],'iso-right':[1,1,1]};
      const direction=directions[String(orientation).toLowerCase()];
      if (!direction || !this.surfaceManager?.sceneGraph) return;
      this.viewState={mode:'auto',rotationRad:0};
      this.surfaceManager.setViewDirection({x:direction[0],y:direction[1],z:direction[2]});
      this.updateViewNavigationUi();
    }

    handleNavigationWheelAction(action) {
      if (!action) {
        return;
      }
      const frame = this.surfaceManager ? this.surfaceManager.lastFrame : null;
      if (!frame && action !== 'home') {
        return;
      }
      switch (action) {
        case 'pan-up':
          this.panView(0, this.getPanStep(frame));
          break;
        case 'pan-down':
          this.panView(0, -this.getPanStep(frame));
          break;
        case 'pan-left':
          this.panView(this.getPanStep(frame), 0);
          break;
        case 'pan-right':
          this.panView(-this.getPanStep(frame), 0);
          break;
        case 'zoom-in':
          this.zoomView(1.2);
          break;
        case 'zoom-out':
          this.zoomView(1 / 1.2);
          break;
        case 'orbit-left':
          this.orbitView(15);
          break;
        case 'orbit-right':
          this.orbitView(-15);
          break;
        case 'home':
          this.resetViewNavigation();
          break;
        default:
          break;
      }
    }

    handleViewportWheel(event) {
      if (!event) {
        return;
      }
      if (!this.surfaceManager || !this.surfaceManager.lastFrame) {
        return;
      }
      const delta = event.deltaY;
      if (!Number.isFinite(delta) || delta === 0) {
        return;
      }
      const rect = this.viewportEl ? this.viewportEl.getBoundingClientRect() : null;
      const anchor = rect
        ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
        : null;
      const factor = delta < 0 ? 1.1 : 1 / 1.1;
      if (anchor) {
        this.zoomView(factor, { anchor });
      } else {
        this.zoomView(factor);
      }
      event.preventDefault();
    }

    getViewportSize(frameOverride) {
      const frame = frameOverride || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      let width = frame && Number.isFinite(frame.width) ? frame.width : null;
      let height = frame && Number.isFinite(frame.height) ? frame.height : null;
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        const rect = this.viewportEl ? this.viewportEl.getBoundingClientRect() : null;
        if (rect) {
          width = rect.width;
          height = rect.height;
        }
      }
      return {
        width: Number.isFinite(width) && width > 0 ? width : 0,
        height: Number.isFinite(height) && height > 0 ? height : 0
      };
    }

    getPanStep(frameOverride) {
      const size = this.getViewportSize(frameOverride);
      const base = Math.max(size.width, size.height);
      if (!base) {
        return 80;
      }
      return Math.max(48, base * 0.12);
    }

    initializeDom() {
      if (this.overlayRoot) {
        return;
      }
      const doc = this.getDocument();
      const scope = this.rootElement || doc;
      if (!scope) {
        console.warn('RenderingOverlayController: no document or root element available.');
        return;
      }
      const queryWithin = (base, selector) => {
        if (!base || typeof selector !== 'string') {
          return null;
        }
        return typeof base.querySelector === 'function' ? base.querySelector(selector) : null;
      };
      const overlayRoot = this.rootElement || queryWithin(scope, this.selectors.overlayRoot);
      if (!overlayRoot) {
        console.warn('RenderingOverlayController: overlay root not found in DOM.');
        return;
      }
      this.overlayRoot = overlayRoot;
      const find = (key) => {
        const selector = this.selectors[key];
        if (!selector) {
          return null;
        }
        return queryWithin(overlayRoot, selector) || queryWithin(scope, selector);
      };

      this.closeBtn = find('closeBtn');
      this.titleEl = find('titleEl');
      this.summaryContainer = find('summaryContainer');
      this.infoTabButton = find('infoTabButton');
      this.layersTabButton = find('layersTabButton');
      this.infoTabPanel = find('infoTabPanel');
      this.layersTabPanel = find('layersTabPanel');
      this.layerManagerContainer = find('layerManagerContainer');
      this.layerManagerStatus = find('layerManagerStatus');
      this.layerManagerFilterInput = find('layerManagerFilterInput');
      this.layerManagerHideInactiveCheckbox = find('layerManagerHideInactiveCheckbox');
      this.layerManagerResetButton = find('layerManagerResetButton');
      this.canvas = find('canvas');
      this.textLayer = find('textLayer');
      this.attributeDefinitionCheckbox = find('attributeDefinitionCheckbox');
      this.attributeInvisibleCheckbox = find('attributeInvisibleCheckbox');
      this.attributeReferencesCheckbox = find('attributeReferencesCheckbox');
      this.viewportEl = this.canvas ? this.canvas.parentElement : null;
      this.interactionLayer = find('interactionLayer');
      this.measurementLayer = find('measurementLayer');
      this.snapLayer = find('snapLayer');
      this.snapMarkerEl = null;
      this.snapMarkerLabelEl = null;
      this.measurementToolbar = find('measurementToolbar');
      this.measurementToolbarButtons = [];
      this.measurementButtonHandlers.clear();
      if (this.measurementToolbar) {
        const toolbarButtons = Array.from(this.measurementToolbar.querySelectorAll('.measurement-tool-btn'));
        toolbarButtons.forEach((button) => {
          const mode = (button.dataset.mode || 'none').toLowerCase();
          const handler = () => this.handleMeasurementButtonClick(mode);
          button.addEventListener('click', handler);
          this.measurementButtonHandlers.set(button, handler);
        });
        this.measurementToolbarButtons = toolbarButtons;
      }
      this.visualStyleSelect = find('visualStyleSelect');
      this.visualStyleAutoOption = this.visualStyleSelect
        ? this.visualStyleSelect.querySelector('option[value="__auto__"]')
        : null;
      if (this.visualStyleSelect) {
        this.visualStyleChangeHandler = (event) => {
          const value = event && event.target ? event.target.value : this.visualStyleSelect.value;
          this.handleVisualStyleSelectionChange(value);
        };
        this.visualStyleSelect.addEventListener('change', this.visualStyleChangeHandler);
      }
      this.selectionToolbar = find('selectionToolbar');
      this.selectionToolbarButtons = [];
      this.selectionToolbarHandlers.clear();
      if (this.selectionToolbar) {
        const selectionButtons = Array.from(this.selectionToolbar.querySelectorAll('button[data-action]'));
        selectionButtons.forEach((button) => {
          const action = (button.dataset.action || '').toLowerCase();
          const handler = () => this.handleSelectionToolbarAction(action);
          button.addEventListener('click', handler);
          this.selectionToolbarHandlers.set(button, handler);
        });
        this.selectionToolbarButtons = selectionButtons;
        this.selectionToolbar.setAttribute('aria-hidden', 'true');
        this.selectionToolbar.style.display = 'none';
      }
      this.overlayBodyEl = find('overlayBody');
      this.propertyPanel = find('propertyPanel');
      this.propertySummaryEl = find('propertySummary');
      this.propertyGridContainer = find('propertyGrid');
      if (this.propertyGridContainer && namespace.RenderingPropertyGrid) {
        this.propertyGrid = new namespace.RenderingPropertyGrid(this.propertyGridContainer);
      } else {
        this.propertyGrid = null;
      }
      if (this.propertyPanel) {
        this.propertyPanel.setAttribute('aria-hidden', this.dockingWorkspace
        ? String(!this.dockingWorkspace.isOpen('render-properties')) : 'true');
      }
      if (this.propertySummaryEl) {
        this.propertySummaryEl.textContent = 'No selection.';
      }
      this.blocksTabButton = find('blocksTabButton');
      this.blocksTabPanel = find('blocksTabPanel');
      this.blockSummaryEl = find('blockSummary');
      this.blockGridEl = find('blockGrid');
      this.blockCardMap.clear();
      if (this.infoTabButton) {
        this.infoTabButton.addEventListener('click', this.boundInfoTabClick);
      }
      if (this.layersTabButton) {
        this.layersTabButton.addEventListener('click', this.boundLayersTabClick);
      }
      if (this.blocksTabButton) {
        this.blocksTabButton.addEventListener('click', this.boundBlocksTabClick);
      }
      this.setInformationTab(this.activeInfoTab);
      this.renderBlockGallery(this.currentBlockMetadata);
      if (this.viewportEl && !this.pointerListenersAttached) {
        this.viewportEl.addEventListener('pointerdown', this.boundPointerDown, true);
        this.viewportEl.addEventListener('pointermove', this.boundPointerMove);
        this.viewportEl.addEventListener('pointerup', this.boundPointerUp);
        this.viewportEl.addEventListener('pointercancel', this.boundPointerCancel);
        this.pointerListenersAttached = true;
      }
      this.viewCubeEl = find('viewCubeEl');
      if (this.viewCubeEl) {
        const cubeButtons = Array.from(this.viewCubeEl.querySelectorAll('button[data-view]'));
        cubeButtons.forEach((button) => {
          const viewKey = (button.dataset.view || '').toLowerCase();
          if (!viewKey) {
            return;
          }
          if (this.viewNavHandlers.has(button)) {
            return;
          }
          const handler = () => this.handleViewCubeSelection(viewKey);
          button.addEventListener('click', handler);
          this.viewNavHandlers.set(button, handler);
          button.setAttribute('aria-pressed', 'false');
        });
      }
      this.navigationWheelEl = find('navigationWheelEl');
      if (this.navigationWheelEl) {
        const wheelButtons = Array.from(this.navigationWheelEl.querySelectorAll('button[data-action]'));
        wheelButtons.forEach((button) => {
          const action = (button.dataset.action || '').toLowerCase();
          if (!action || this.viewNavHandlers.has(button)) {
            return;
          }
          const handler = () => this.handleNavigationWheelAction(action);
          button.addEventListener('click', handler);
          this.viewNavHandlers.set(button, handler);
          if (action === 'home' && !this.viewHomeButton) {
            this.viewHomeButton = button;
          }
        });
      }
      this.viewUndoButton = find('viewUndoButton');
      if (this.viewUndoButton && !this.viewNavHandlers.has(this.viewUndoButton)) {
        const handler = () => this.undoViewNavigation();
        this.viewUndoButton.addEventListener('click', handler);
        this.viewNavHandlers.set(this.viewUndoButton, handler);
      }
      this.viewRedoButton = find('viewRedoButton');
      if (this.viewRedoButton && !this.viewNavHandlers.has(this.viewRedoButton)) {
        const handler = () => this.redoViewNavigation();
        this.viewRedoButton.addEventListener('click', handler);
        this.viewNavHandlers.set(this.viewRedoButton, handler);
      }
      const homeButton = find('viewHomeButton');
      if (homeButton && !this.viewNavHandlers.has(homeButton)) {
        const handler = () => this.resetViewNavigation();
        homeButton.addEventListener('click', handler);
        this.viewNavHandlers.set(homeButton, handler);
        this.viewHomeButton = homeButton;
      }
      if (this.viewportEl && !this.viewWheelHandler) {
        this.viewWheelHandler = (event) => this.handleViewportWheel(event);
        this.viewportEl.addEventListener('wheel', this.viewWheelHandler, { passive: false });
      }
      if (this.canvas && namespace.RenderingSurfaceManager && !this.surfaceManager) {
        try {
          this.surfaceManager = new namespace.RenderingSurfaceManager();
          this.surfaceManager.initialize(this.canvas);
          this.surfaceManager.onPaint = stats => { if (this.currentDoc) this.refreshViewportOverlays(stats.frame); };
          this.surfaceManager.onError = error => { this.overlayEl?.dispatchEvent(new CustomEvent('dxf-skia-error', { detail: error, bubbles: true })); };
          this.surfaceManager.setCanvasReplacementCallback((replacementCanvas) => {
            this.canvas = replacementCanvas;
            this.viewportEl = this.canvas ? this.canvas.parentElement : null;
          });
        } catch (err) {
          console.warn('RenderingOverlayController: unable to initialize rendering surface manager', err);
        }
      }
      const onAttributeControlChange = () => this.applyAttributeVisibilityControls();
      if (this.attributeDefinitionCheckbox) {
        this.attributeDefinitionCheckbox.checked = !!this.attributeDisplayState.showDefinitions;
        this.attributeDefinitionCheckbox.addEventListener('change', onAttributeControlChange);
      }
      if (this.attributeReferencesCheckbox) {
        this.attributeReferencesCheckbox.checked = !!this.attributeDisplayState.showReferences;
        this.attributeReferencesCheckbox.addEventListener('change', onAttributeControlChange);
      }
      if (this.attributeInvisibleCheckbox) {
        this.attributeInvisibleCheckbox.checked = !!this.attributeDisplayState.showInvisible;
        this.attributeInvisibleCheckbox.addEventListener('change', onAttributeControlChange);
      }
      if (this.layerManagerFilterInput) {
        this.layerManagerFilterInput.addEventListener('input', () => {
          this.layerManagerFilterText = this.layerManagerFilterInput.value || '';
          this.renderLayerManagerTable();
        });
      }
      if (this.layerManagerHideInactiveCheckbox) {
        this.layerManagerHideInactiveCheckbox.addEventListener('change', () => {
          this.layerManagerHideInactiveFlag = !!this.layerManagerHideInactiveCheckbox.checked;
          this.renderLayerManagerTable();
        });
      }
      if (this.layerManagerResetButton) {
        this.layerManagerResetButton.addEventListener('click', () => this.resetLayerOverrides());
      }

      if (this.closeBtn) {
        this.closeBtn.addEventListener('click', this.boundClose);
      }
      if (this.overlayRoot) {
        this.overlayRoot.addEventListener('click', (event) => {
          if (event.target === this.overlayRoot) {
            this.close();
          }
        });
      }
      if (doc) {
        doc.addEventListener('keydown', this.boundOnKeyDown);
        this.keydownListenerTarget = doc;
      }
      this.populateVisualStyleOptions(this.currentSceneGraph);
      this.updateVisualStyleSelect(this.surfaceManager ? this.surfaceManager.lastFrame : null);
      this.syncAttributeVisibilityControls();
      this.updateMeasurementToolbarUI();
      this.updateSelectionToolbarUI();
      this.updateViewNavigationUi();
    }

    setInformationTab(tabId, options = {}) {
      const allowedTabs = ['info', 'layers', 'blocks'];
      const nextTab = allowedTabs.includes(tabId) ? tabId : 'info';
      const focusRequested = options.focus === true;
      this.activeInfoTab = nextTab;
      if (this.dockingWorkspace && this.dockingInformationPanels) {
        if (focusRequested) this.dockingWorkspace.show(this.dockingInformationPanels[nextTab]);
        return; // Information, layers and blocks are independent, retained dock tools.
      }
      const infoActive = nextTab === 'info';
      const layersActive = nextTab === 'layers';
      const blocksActive = nextTab === 'blocks';
      if (this.infoTabButton) {
        this.infoTabButton.classList.toggle('active', infoActive);
        this.infoTabButton.setAttribute('aria-selected', infoActive ? 'true' : 'false');
        if (focusRequested && infoActive) {
          this.infoTabButton.focus();
        }
      }
      if (this.layersTabButton) {
        this.layersTabButton.classList.toggle('active', layersActive);
        this.layersTabButton.setAttribute('aria-selected', layersActive ? 'true' : 'false');
        if (focusRequested && layersActive) {
          this.layersTabButton.focus();
        }
      }
      if (this.blocksTabButton) {
        this.blocksTabButton.classList.toggle('active', blocksActive);
        this.blocksTabButton.setAttribute('aria-selected', blocksActive ? 'true' : 'false');
        if (focusRequested && blocksActive) {
          this.blocksTabButton.focus();
        }
      }
      if (this.infoTabPanel) {
        if (infoActive) {
          this.infoTabPanel.removeAttribute('hidden');
          this.infoTabPanel.classList.add('active');
        } else {
          this.infoTabPanel.setAttribute('hidden', 'true');
          this.infoTabPanel.classList.remove('active');
        }
      }
      if (this.layersTabPanel) {
        if (layersActive) {
          this.layersTabPanel.removeAttribute('hidden');
          this.layersTabPanel.classList.add('active');
        } else {
          this.layersTabPanel.setAttribute('hidden', 'true');
          this.layersTabPanel.classList.remove('active');
        }
      }
      if (this.blocksTabPanel) {
        if (blocksActive) {
          this.blocksTabPanel.removeAttribute('hidden');
          this.blocksTabPanel.classList.add('active');
        } else {
          this.blocksTabPanel.setAttribute('hidden', 'true');
          this.blocksTabPanel.classList.remove('active');
        }
      }
    }

    dispose() {
      if (this.closeBtn) {
        this.closeBtn.removeEventListener('click', this.boundClose);
      }
      if (this.infoTabButton) {
        this.infoTabButton.removeEventListener('click', this.boundInfoTabClick);
      }
      if (this.layersTabButton) {
        this.layersTabButton.removeEventListener('click', this.boundLayersTabClick);
      }
      if (this.blocksTabButton) {
        this.blocksTabButton.removeEventListener('click', this.boundBlocksTabClick);
      }
      if (this.keydownListenerTarget) {
        this.keydownListenerTarget.removeEventListener('keydown', this.boundOnKeyDown);
        this.keydownListenerTarget = null;
      }
      if (this.visualStyleSelect && this.visualStyleChangeHandler) {
        this.visualStyleSelect.removeEventListener('change', this.visualStyleChangeHandler);
      }
      this.visualStyleChangeHandler = null;
      this.visualStyleSelect = null;
      this.visualStyleAutoOption = null;
      this.visualStyleOptionToSpecifier = new Map();
      this.visualStyleSpecifierToOption = new Map();
      if (this.measurementButtonHandlers && this.measurementButtonHandlers.size) {
        this.measurementButtonHandlers.forEach((handler, button) => {
          if (button && handler) {
            button.removeEventListener('click', handler);
          }
        });
        this.measurementButtonHandlers.clear();
      }
      this.measurementToolbarButtons = [];
      if (this.selectionToolbarHandlers && this.selectionToolbarHandlers.size) {
        this.selectionToolbarHandlers.forEach((handler, button) => {
          if (button && handler) {
            button.removeEventListener('click', handler);
          }
        });
        this.selectionToolbarHandlers.clear();
      }
      this.selectionToolbarButtons = [];
      if (this.viewNavHandlers && this.viewNavHandlers.size) {
        this.viewNavHandlers.forEach((handler, element) => {
          if (element && handler) {
            element.removeEventListener('click', handler);
          }
        });
        this.viewNavHandlers.clear();
      }
      if (this.viewportEl && this.pointerListenersAttached) {
        this.viewportEl.removeEventListener('pointerdown', this.boundPointerDown, true);
        this.viewportEl.removeEventListener('pointermove', this.boundPointerMove);
        this.viewportEl.removeEventListener('pointerup', this.boundPointerUp);
        this.viewportEl.removeEventListener('pointercancel', this.boundPointerCancel);
        this.pointerListenersAttached = false;
      }
      if (this.viewportEl && this.viewWheelHandler) {
        this.viewportEl.removeEventListener('wheel', this.viewWheelHandler);
        this.viewWheelHandler = null;
      }
      this.clearInteractionOverlay();
      this.clearSnapIndicator({ silent: true });
      this.resetMeasurementState({ silent: true });
      if (this.surfaceManager) this.surfaceManager.dispose();
      this.surfaceManager = null;
      this.refreshViewportOverlays(null);
      this.overlayRoot = null;
      this.closeBtn = null;
      this.titleEl = null;
      this.summaryContainer = null;
      this.infoTabButton = null;
      this.layersTabButton = null;
      this.infoTabPanel = null;
      this.layersTabPanel = null;
      this.activeInfoTab = 'info';
      this.layerManagerContainer = null;
      this.layerManagerStatus = null;
      this.layerManagerFilterInput = null;
      this.layerManagerHideInactiveCheckbox = null;
      this.layerManagerResetButton = null;
      this.canvas = null;
      this.textLayer = null;
      this.measurementLayer = null;
      this.measurementToolbar = null;
      this.measurementSummaryEl = null;
      this.isolationSummaryEl = null;
      this.selectionToolbar = null;
      this.snapLayer = null;
      this.snapMarkerEl = null;
      this.snapMarkerLabelEl = null;
      this.snapCandidatesCache = null;
      this.viewportEl = null;
      this.interactionLayer = null;
      this.marqueeElement = null;
      this.lassoSvg = null;
      this.lassoPathElement = null;
      this.currentInteraction = null;
      this.activePointerId = null;
      this.viewCubeEl = null;
      this.navigationWheelEl = null;
      this.viewUndoButton = null;
      this.viewRedoButton = null;
      this.viewHomeButton = null;
    }

    open(payload = {}) {
      if (!this.overlayRoot) {
        this.initializeDom();
      }
      if (!this.overlayRoot) {
        alert('Rendering overlay is unavailable.');
        return;
      }

      const pane = payload.pane || 'left';
      const tab = payload.tab || null;
      if (!tab) {
        alert('No DXF tab is active for rendering.');
        return;
      }

      const doc = this.ensureDocumentForTab(tab);
      this.currentTabId = tab.id;

      if (!doc || doc.status !== 'ready') {
        this.renderPlaceholder(tab, doc);
      } else {
        this.renderSceneGraph(tab, doc, pane);
      }

      this.overlayRoot.style.display = 'block';
      this.overlayRoot.setAttribute('aria-hidden', 'false');
      if (this.dockingWorkspace) this.dockingWorkspace.show('rendering');
      requestAnimationFrame(() => this.resizeCanvas());
    }

    ensureDocumentForTab(tab) {
      if (!tab || !this.dataController) {
        return null;
      }
      const existing = this.dataController.getDocument(tab.id);
      if (existing && existing.status === 'ready') {
        if (existing.blockMetadata) {
          this.callAdapter('updateBlockMetadata', tab.id, existing.blockMetadata);
        }
        return existing;
      }

      let sourceText = tab.renderingSourceText;
      if (!sourceText) {
        if (this.dxfParser && tab.originalTreeData) {
          try {
            sourceText = this.dxfParser.serializeTree(tab.originalTreeData);
          } catch (err) {
            console.warn('RenderingOverlayController: unable to serialize tab for rendering', err);
          }
        }
      }
      if (!sourceText) {
        this.dataController.registerPlaceholder(tab.id, {
          reason: 'noSource',
          fileName: tab.name || null
        });
        return this.dataController.getDocument(tab.id);
      }

      const doc = this.dataController.ingestDocument({
        tabId: tab.id,
        fileName: tab.name,
        sourceText
      });
      if (doc && doc.status === 'ready') {
        tab.renderingSourceText = sourceText;
        if (doc.blockMetadata) {
          this.callAdapter('updateBlockMetadata', tab.id, doc.blockMetadata);
        }
      }
      return doc;
    }

    renderPlaceholder(tab, doc) {
      if (this.titleEl) {
        this.titleEl.textContent = `DXF Rendering – ${tab.name || 'Untitled'}`;
      }
      this.currentSceneGraph = null;
      this.currentDoc = doc || null;
      this.currentPane = null;
      if (tab && tab.id != null) {
        this.entityLookupByTab.delete(tab.id);
        this.blockMetadataByTab.delete(tab.id);
      }
      this.currentBlockMetadata = null;
      this.clearPropertyPanel({ message: 'Scene graph unavailable.' });
      this.populateVisualStyleOptions(null);
      this.updateVisualStyleSelect(null);
      if (this.summaryContainer) {
        const reason = doc && doc.reason ? doc.reason : 'unavailable';
        const message = doc && doc.message ? doc.message : '';
      this.summaryContainer.innerHTML = `
          <p><strong>Scene graph unavailable.</strong></p>
          <p>Reason: ${reason}</p>
          ${message ? `<p>${message}</p>` : ''}
          <p>Try reloading the DXF or saving the document to rebuild the rendering model.</p>
        `;
        this.measurementSummaryEl = null;
        this.isolationSummaryEl = null;
      }
      this.currentLayerCatalog = null;
      this.currentLayerOverrides = null;
      if (this.layerManagerContainer) {
        this.layerManagerContainer.innerHTML = '<p>Layer data unavailable.</p>';
      }
      if (this.layerManagerStatus) {
        this.layerManagerStatus.textContent = 'Layer metadata unavailable';
      }
      if (this.surfaceManager) {
        if (typeof this.surfaceManager.setLayerState === 'function') {
          this.surfaceManager.setLayerState(null);
        }
        if (typeof this.surfaceManager.setEntityIsolation === 'function') {
          this.surfaceManager.setEntityIsolation(null);
        }
        this.surfaceManager.renderMessage('Scene graph not available');
      }
      this.layerIsolationState = null;
      this.objectIsolationState = null;
      if (this.currentTabId) {
        this.layerIsolationStateByTab.delete(this.currentTabId);
        this.objectIsolationStateByTab.delete(this.currentTabId);
      }
      this.resetMeasurementState({ silent: true });
      this.refreshViewportOverlays(null);
      this.updateMeasurementToolbarUI();
      this.updateIsolationSummary();
      this.updateSelectionToolbarUI();
      this.updateViewNavigationUi();
      this.renderBlockGallery(null);
    }

    renderSceneGraph(tab, doc, pane) {
      if (!doc || !doc.sceneGraph) {
        this.renderPlaceholder(tab, doc);
        return;
      }
      if (this.surfaceManager && typeof this.surfaceManager.setAttributeDisplay === 'function') {
        this.surfaceManager.setAttributeDisplay(this.attributeDisplayState || {
          showDefinitions: false,
          showInvisible: false,
          showReferences: true
        });
      }
      this.syncAttributeVisibilityControls();
      this.resetMeasurementState({ silent: true });
      this.currentSceneGraph = doc.sceneGraph;
      this.currentDoc = doc;
      this.currentPane = pane;
      if (tab && tab.id != null) {
        this.entityLookupByTab.set(tab.id, this.buildEntityLookupForDoc(doc));
      }
      this.populateVisualStyleOptions(doc.sceneGraph);
      if (this.titleEl) {
        this.titleEl.textContent = `DXF Rendering – ${tab.name || 'Untitled'} (${pane.toUpperCase()})`;
      }

      const stats = doc.sceneGraph.stats || doc.stats || {};
      const tables = doc.sceneGraph.tables || {};
      const statsHtml = this.renderSceneStats(stats);
      const drawingPropertiesHtml = this.renderDrawingPropertiesSummary(doc.drawingProperties || null);
      const plotSummaryHtml = this.renderPlotConfigurationSummary(tables);
      const summarySections = [statsHtml, drawingPropertiesHtml, plotSummaryHtml].filter(Boolean);
      if (this.summaryContainer) {
        this.summaryContainer.innerHTML = summarySections.length
          ? summarySections.join('')
          : '<p>No drawing metadata available.</p>';
        this.measurementSummaryEl = null;
        this.isolationSummaryEl = null;
      }

      this.prepareLayerManager(doc);
      this.syncIsolationStateForCurrentTab();

      if (doc.blockMetadata) {
        this.callAdapter('updateBlockMetadata', tab.id, doc.blockMetadata);
      }
      if (tab && tab.id != null) {
        this.blockMetadataByTab.set(tab.id, doc.blockMetadata || null);
      }
      this.currentBlockMetadata = doc.blockMetadata || (tab && tab.id != null ? this.blockMetadataByTab.get(tab.id) : null) || null;
      this.renderBlockGallery(this.currentBlockMetadata);

      const viewContext = this.ensureViewContext();

      if (this.surfaceManager) {
        const isolation = this.getBlockIsolation();
        const highlight = this.getBlockHighlights();
        this.surfaceManager.setBlockIsolation(isolation);
        this.surfaceManager.setBlockHighlights(highlight);
        if (typeof this.surfaceManager.setEntityIsolation === 'function') {
          const handles = this.objectIsolationState && this.objectIsolationState.handles instanceof Set
            ? this.objectIsolationState.handles
            : null;
          this.surfaceManager.setEntityIsolation(handles && handles.size ? handles : null);
        }
        const selectionSet = this.ensureSelectionSetForCurrentTab(false) || new Set();
        this.selectionHandles = new Set(selectionSet);
        this.surfaceManager.setSelectionHandles(selectionSet);
      }

      let frame = null;
      if (this.surfaceManager) {
        const viewOptions = {};
        if (viewContext && viewContext.current && viewContext.current.mode !== 'auto') {
          viewOptions.viewState = this.cloneViewState(viewContext.current);
        } else if (viewContext && viewContext.current && viewContext.current.mode === 'auto') {
          viewOptions.viewState = { mode: 'auto' };
        } else {
          viewOptions.viewState = { mode: 'auto' };
        }
        frame = this.surfaceManager.renderScene(doc.sceneGraph, viewOptions);
        this.surfaceManager.resume();
      }
      this.refreshViewportOverlays(frame);
      if (frame && viewContext) {
        this.updateViewContextFromFrame(viewContext, frame, { updateCurrent: true });
      }
      this.updateSelectionSummary();
      this.updateIsolationSummary();
      this.updateMeasurementToolbarUI();
      this.updateSelectionToolbarUI();
      this.updateViewNavigationUi();
      this.updateSelectionPropertyPanel();
    }

    prepareLayerManager(doc) {
      if (!doc || !doc.sceneGraph) {
        this.currentLayerCatalog = null;
        this.currentLayerOverrides = null;
        if (this.layerManagerContainer) {
          this.layerManagerContainer.innerHTML = '<p>No layer metadata available.</p>';
        }
        if (this.layerManagerStatus) {
          this.layerManagerStatus.textContent = 'Layer metadata unavailable';
        }
        if (this.surfaceManager && typeof this.surfaceManager.setLayerState === 'function') {
          this.surfaceManager.setLayerState(null);
        }
        return;
      }
      const tabId = doc.tabId || this.currentTabId || null;
      this.currentLayerCatalog = this.buildLayerCatalog(doc);
      let overrides = null;
      if (tabId && this.layerOverridesByTab.has(tabId)) {
        overrides = this.layerOverridesByTab.get(tabId);
      } else {
        overrides = new Map();
        if (tabId) {
          this.layerOverridesByTab.set(tabId, overrides);
        }
      }
      const catalog = this.currentLayerCatalog || new Map();
      overrides.forEach((_, key) => {
        if (!catalog.has(key)) {
          overrides.delete(key);
        }
      });
      this.currentLayerOverrides = overrides;
      this.renderLayerManagerTable(doc.sceneGraph);
      this.applyLayerStateToSurface({ reRender: false });
    }

    buildLayerCatalog(doc) {
      const catalog = new Map();
      if (!doc || !doc.sceneGraph) {
        return catalog;
      }
      const sceneGraph = doc.sceneGraph;
      const tables = sceneGraph.tables || {};
      const layerEntries = tables.layers || {};
      const colorBooks = tables.colorBooks || null;
      const plotStyles = tables.plotStyles || null;
      const plotStyleMode = Number.isInteger(tables.plotStyleMode) ? tables.plotStyleMode : (plotStyles ? plotStyles.mode : null);
      const usageList = this.computeLayerStats(sceneGraph) || [];
      const usageMap = new Map();
      usageList.forEach((entry) => usageMap.set(entry.name, entry));

      const registerLayer = (rawName, entry) => {
        const name = (rawName || entry?.name || '').trim();
        if (!name) {
          return;
        }
        const key = name.toUpperCase();
        if (catalog.has(key)) {
          return;
        }
        const flags = Number(entry?.flags) || 0;
        const colorNumber = Number.isInteger(entry?.colorNumber) ? entry.colorNumber : null;
        const trueColor = entry?.trueColor || null;
        const colorBook = entry?.colorBook || null;
        const colorBookResolved = entry?.colorBookResolved || null;
        const transparency = entry?.transparency || null;
        const usage = usageMap.get(name) || { count: 0, spaces: [] };
        const baseIsOn = colorNumber == null ? true : colorNumber >= 0;
        const baseIsFrozen = (flags & 1) === 1;
        const baseIsLocked = (flags & 4) === 4;
        const baseTransparencyAlpha = transparency && typeof transparency.alpha === 'number'
          ? Math.max(0, Math.min(1, transparency.alpha))
          : 1;
        const colorInfo = this.computeLayerColorInfo({
          colorNumber,
          trueColor,
          colorBook,
          colorBookResolved
        }, colorBooks);
        const plotStyleHandle = entry?.plotStyle || null;
        const resolvedPlotStyle = this.resolvePlotStyleDescriptor(plotStyleHandle, plotStyles);
        let plotStyleLabel = '—';
        let plotStyleDisplay = null;
        if (resolvedPlotStyle) {
          plotStyleLabel = resolvedPlotStyle.label || '—';
          plotStyleDisplay = resolvedPlotStyle.displayName || plotStyleLabel;
        } else if (plotStyleHandle) {
          plotStyleLabel = plotStyleHandle;
          plotStyleDisplay = plotStyleHandle;
        } else if (plotStyleMode != null) {
          plotStyleLabel = plotStyleMode === 1 ? 'By Color' : 'By Style';
          plotStyleDisplay = plotStyleMode === 1 ? 'By Color (CTB)' : 'By Style (STB)';
        }
        catalog.set(key, {
          name,
          baseFlags: flags,
          baseIsOn,
          baseIsFrozen,
          baseIsLocked,
          baseColorNumber: colorNumber,
          baseTrueColor: trueColor,
          baseColorBook: colorBook,
          baseColorBookResolved: colorBookResolved,
          basePlotStyleHandle: plotStyleHandle,
          basePlotStyleDescriptor: resolvedPlotStyle,
          basePlotStyle: plotStyleLabel,
          basePlotStyleDisplay: plotStyleDisplay,
          baseLinetype: entry?.linetype || null,
          baseLineweight: Number.isFinite(entry?.lineweight) ? entry.lineweight : null,
          baseMaterial: entry?.material || null,
          baseTransparency: transparency,
          baseTransparencyAlpha,
          baseTransparencyPercent: Math.round((1 - baseTransparencyAlpha) * 100),
          baseColorCss: colorInfo.css,
          baseColorLabel: colorInfo.label,
          usageCount: usage.count || 0,
          usageSpaces: Array.isArray(usage.spaces) ? usage.spaces : []
        });
      };

      Object.keys(layerEntries).forEach((name) => registerLayer(name, layerEntries[name]));
      usageMap.forEach((_, name) => {
        if (!layerEntries[name]) {
          registerLayer(name, null);
        }
      });
      if (!catalog.has('0')) {
        registerLayer('0', layerEntries['0'] || { name: '0' });
      }
      return catalog;
    }

    computeLayerColorInfo(metadata = {}, colorBooks = null) {
      const trueColor = metadata.trueColor || null;
      const colorNumber = metadata.colorNumber;
      const colorBookResolved = metadata.colorBookResolved || this.resolveColorBookDescriptor(metadata.colorBook, colorBooks);
      if (colorBookResolved) {
        if (colorBookResolved.trueColor && colorBookResolved.trueColor.hex) {
          const hex = String(colorBookResolved.trueColor.hex).toUpperCase();
          const label = `${colorBookResolved.bookName || (metadata.colorBook && metadata.colorBook.book) || ''}:${colorBookResolved.name || ''}`.replace(/:+$/, '');
          return {
            css: hex,
            label: label || hex
          };
        }
        if (Number.isInteger(colorBookResolved.aci)) {
          const aci = Math.abs(colorBookResolved.aci);
          const rgb = this.lookupAciColor(aci);
          const label = `${colorBookResolved.bookName || (metadata.colorBook && metadata.colorBook.book) || ''}:${colorBookResolved.name || ''}`.replace(/:+$/, '');
          return {
            css: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
            label: label || `ACI ${aci}`
          };
        }
      }
      if (trueColor && trueColor.hex) {
        const hex = String(trueColor.hex).toUpperCase();
        return {
          css: hex,
          label: hex
        };
      }
      if (Number.isInteger(colorNumber)) {
        const aci = Math.abs(colorNumber);
        const rgb = this.lookupAciColor(aci);
        return {
          css: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
          label: `ACI ${aci}`
        };
      }
      return {
        css: 'rgba(210,227,255,1)',
        label: 'ByLayer'
      };
    }

    resolveColorBookDescriptor(reference, colorBooks) {
      if (!reference || !colorBooks) {
        return null;
      }
      const byKey = colorBooks.byKey || null;
      const byHandle = colorBooks.byHandle || null;
      const books = colorBooks.books || null;
      if (reference.handle && byHandle) {
        const handleKey = String(reference.handle).trim().toUpperCase();
        if (handleKey && byHandle[handleKey]) {
          return byHandle[handleKey];
        }
      }
      const bookKey = reference.book ? String(reference.book).trim().toUpperCase() : null;
      const colorKey = reference.colorName ? String(reference.colorName).trim().toUpperCase() : null;
      if (bookKey && colorKey && byKey) {
        const composite = `${bookKey}::${colorKey}`;
        if (byKey[composite]) {
          return byKey[composite];
        }
      }
      if (bookKey && books && books[bookKey] && colorKey) {
        const book = books[bookKey];
        if (book && book.colors && book.colors[colorKey]) {
          return book.colors[colorKey];
        }
      }
      return null;
    }

    resolvePlotStyleDescriptor(handle, plotStyles) {
      if (!plotStyles) {
        return null;
      }
      const lookup = plotStyles.handleLookup || {};
      const normalized = this.normalizeHandle(handle);
      if (!normalized) {
        return null;
      }
      const descriptor = lookup[normalized];
      if (!descriptor) {
        return null;
      }
      const type = descriptor.type || (plotStyles.modeLabel === 'colorDependent' ? 'colorDependent' : 'named');
      const result = {
        type,
        name: descriptor.name || descriptor.nameUpper || null,
        handle: descriptor.handle || handle,
        handleUpper: descriptor.handleUpper || normalized,
        dictionaryHandle: descriptor.dictionaryHandle || null,
        isDefault: !!descriptor.isDefault,
        placeholder: descriptor.placeholder || null
      };
      let label = result.name || result.handleUpper || result.handle || normalized;
      if (type === 'colorDependent') {
        const candidate = (descriptor.name || '').trim();
        if (/^[0-9A-Fa-f]{2}$/.test(candidate)) {
          const colorIndex = parseInt(candidate, 16);
          if (Number.isFinite(colorIndex)) {
            result.colorIndex = colorIndex;
            label = `Color ${colorIndex}`;
          }
        }
        if (!label) {
          label = 'Color Dependent';
        }
      } else if (!label) {
        label = 'Normal';
      }
      const typeLabel = type === 'colorDependent' ? 'CTB' : 'STB';
      result.label = label;
      result.displayName = `${label}${typeLabel ? ` (${typeLabel})` : ''}`;
      return result;
    }

    lookupAciColor(index) {
      const table = {
        1: { r: 255, g: 0, b: 0 },
        2: { r: 255, g: 255, b: 0 },
        3: { r: 0, g: 255, b: 0 },
        4: { r: 0, g: 255, b: 255 },
        5: { r: 0, g: 0, b: 255 },
        6: { r: 255, g: 0, b: 255 },
        7: { r: 255, g: 255, b: 255 }
      };
      return table[index] || { r: 180, g: 200, b: 220 };
    }

    renderPlotConfigurationSummary(tables) {
      if (!tables) {
        return '';
      }
      const plotStyles = tables.plotStyles || null;
      const plotConfigurations = tables.plotConfigurations || null;
      const layouts = tables.layouts || null;
      const modeRaw = Number.isInteger(tables.plotStyleMode) ? tables.plotStyleMode : (plotStyles ? plotStyles.mode : null);
      const modeLabel = (() => {
        if (plotStyles && plotStyles.modeLabel) {
          return plotStyles.modeLabel === 'colorDependent'
            ? 'CTB (Color-Dependent)'
            : (plotStyles.modeLabel === 'named' ? 'STB (Named)' : plotStyles.modeLabel);
        }
        if (modeRaw === 1) {
          return 'CTB (Color-Dependent)';
        }
        if (modeRaw === 0) {
          return 'STB (Named)';
        }
        return null;
      })();

      const layoutEntries = [];
      const byHandle = plotConfigurations && plotConfigurations.byHandle ? plotConfigurations.byHandle : {};
      const byName = plotConfigurations && plotConfigurations.byName ? plotConfigurations.byName : {};

      if (layouts && Array.isArray(layouts.ordered) && layouts.ordered.length) {
        layouts.ordered.forEach((layout) => {
          const handleKey = layout.handleUpper || this.normalizeHandle(layout.handle);
          let config = null;
          if (handleKey && byHandle[handleKey]) {
            config = byHandle[handleKey];
          } else if (layout.nameUpper && byName[layout.nameUpper]) {
            config = byName[layout.nameUpper];
          }
          layoutEntries.push({ layout, config });
        });
      } else if (plotConfigurations && Object.keys(byName).length) {
        Object.keys(byName).forEach((nameKey) => {
          layoutEntries.push({
            layout: { name: nameKey, nameUpper: nameKey },
            config: byName[nameKey]
          });
        });
      }

      if (!modeLabel && !layoutEntries.length) {
        return '';
      }

      const rows = layoutEntries.map((entry) => {
        const layoutName = entry.layout && entry.layout.name
          ? entry.layout.name
          : (entry.config && entry.config.layoutName ? entry.config.layoutName : 'Layout');
        const config = entry.config || {};
        let sheet = config.plotStyleTable || '';
        if (!sheet) {
          if (config.plotStyleMode === 1 || modeRaw === 1) {
            sheet = 'By Color (CTB)';
          } else if (config.plotStyleMode === 0 || modeRaw === 0) {
            sheet = 'By Style (STB)';
          } else {
            sheet = '—';
          }
        }
        const device = config.plotConfigurationFile || '—';
        let paper = config.paperSize || '';
        if (!paper && config.paper && (config.paper.width || config.paper.height)) {
          const width = config.paper.width != null ? config.paper.width.toFixed(1) : '?';
          const height = config.paper.height != null ? config.paper.height.toFixed(1) : '?';
          paper = `${width} × ${height} mm`;
        }
        if (!paper) {
          paper = '—';
        }
        const usesPlotStyles = config.flags != null ? ((config.flags & 32) === 32) : null;
        const usesLabel = usesPlotStyles == null ? '—' : (usesPlotStyles ? 'Yes' : 'No');
        return `
          <tr>
            <td>${this.escapeHtml(layoutName)}</td>
            <td>${this.escapeHtml(sheet)}</td>
            <td>${this.escapeHtml(device)}</td>
            <td>${this.escapeHtml(paper)}</td>
            <td>${usesLabel}</td>
          </tr>
        `;
      }).join('');

      const tableHtml = rows
        ? `
          <table class="plot-summary-table">
            <thead>
              <tr>
                <th>Layout</th>
                <th>Style Sheet</th>
                <th>Device</th>
                <th>Paper</th>
                <th>Use Plot Styles</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        `
        : '<p>No plot configuration metadata available.</p>';

      return `
        <div class="plot-summary">
          ${modeLabel ? `<div class="plot-summary-mode">Plot Styles: ${this.escapeHtml(modeLabel)}</div>` : ''}
          ${tableHtml}
        </div>
      `;
    }

    renderSceneStats(stats = {}) {
      const totals = {
        'Model Space': stats.modelSpaceEntities ?? 0,
        'Paper Layouts': stats.paperSpaceLayouts ?? 0,
        'Paper Entities': stats.paperSpaceEntities ?? 0,
        Blocks: stats.blockCount ?? 0,
        'Block Entities': stats.blockEntities ?? 0,
        'Total Renderables': stats.renderableEntities ?? 0
      };
      const rows = Object.keys(totals).map((label) => {
        const value = this.escapeHtml(String(totals[label]));
        return this.renderSummaryRow(label, value);
      }).join('');
      return `
        <div class="rendering-summary-section">
          <h4>Entity Totals</h4>
          <div class="rendering-summary-grid">
            ${rows}
          </div>
        </div>
      `;
    }

    renderDrawingPropertiesSummary(drawingProperties) {
      if (!drawingProperties || typeof drawingProperties !== 'object') {
        return '';
      }
      const units = drawingProperties.units || {};
      const limits = drawingProperties.limits || {};
      const extents = drawingProperties.extents || {};
      const metadata = drawingProperties.metadata || {};
      const geographic = drawingProperties.geographic || {};
      const unitLabel = this.getUnitsLabel(units.insUnits);
      const measurementLabel = this.getMeasurementLabel(units.measurement);
      const basePointText = this.formatPoint3D(units.basePoint);
      const scaleFactorText = this.formatNumber(units.scaleFactor, { maxDigits: 6 });
      const sourceLabel = this.getUnitsLabel(units.insUnitsSource);
      const targetLabel = this.getUnitsLabel(units.insUnitsTarget);
      let conversionDisplay = '';
      if (sourceLabel || targetLabel) {
        conversionDisplay = `${sourceLabel || '—'} → ${targetLabel || '—'}`;
      }

      const unitsRows = [
        this.renderSummaryRow('Insertion Units', unitLabel ? this.escapeHtml(unitLabel) : '—'),
        this.renderSummaryRow('Measurement', measurementLabel ? this.escapeHtml(measurementLabel) : '—'),
        this.renderSummaryRow('Base Point', this.escapeHtml(basePointText)),
        this.renderSummaryRow('Scale Factor', scaleFactorText != null ? this.escapeHtml(scaleFactorText) : '—'),
        conversionDisplay ? this.renderSummaryRow('Source → Target', this.escapeHtml(conversionDisplay)) : ''
      ].filter(Boolean).join('');

      const modelLimitText = this.formatRange2D(limits.model);
      const paperLimitText = this.formatRange2D(limits.paper);
      const modelExtentText = this.formatRange3D(extents.model);
      const paperExtentText = this.formatRange3D(extents.paper);

      const limitsRows = [
        this.renderSummaryRow('Model Limits', this.escapeHtml(modelLimitText)),
        this.renderSummaryRow('Paper Limits', this.escapeHtml(paperLimitText)),
        this.renderSummaryRow('Model Extents', this.escapeHtml(modelExtentText)),
        this.renderSummaryRow('Paper Extents', this.escapeHtml(paperExtentText))
      ].join('');

      const createdText = this.formatTimestamp(metadata.created);
      const updatedText = this.formatTimestamp(metadata.updated);
      const totalEditingText = this.formatDuration(metadata.totalEditingTime);
      const userTimerText = this.formatDuration(metadata.userTimer);
      const timezoneText = this.formatTimezoneOffset(metadata.timezoneMinutes);

      const metadataRows = [
        this.renderSummaryRow('ACAD Version', metadata.acadVersion ? this.escapeHtml(metadata.acadVersion) : '—'),
        this.renderSummaryRow('Code Page', metadata.codePage ? this.escapeHtml(metadata.codePage) : '—'),
        this.renderSummaryRow('Last Saved By', metadata.lastSavedBy ? this.escapeHtml(metadata.lastSavedBy) : '—'),
        this.renderSummaryRow('Project Name', metadata.projectName ? this.escapeHtml(metadata.projectName) : '—'),
        this.renderSummaryRow('Created', createdText ? this.escapeHtml(createdText) : '—'),
        this.renderSummaryRow('Updated', updatedText ? this.escapeHtml(updatedText) : '—'),
        this.renderSummaryRow('Editing Time', totalEditingText ? this.escapeHtml(totalEditingText) : '—'),
        this.renderSummaryRow('User Timer', userTimerText ? this.escapeHtml(userTimerText) : '—'),
        this.renderSummaryRow('Time Zone', timezoneText ? this.escapeHtml(timezoneText) : '—')
      ].join('');

      const geoStatus = geographic.hasGeoData ? 'Configured' : 'Not configured';
      const latitudeText = this.formatLatitude(geographic.latitude);
      const longitudeText = this.formatLongitude(geographic.longitude);
      const elevationNumeric = this.formatNumber(geographic.elevation, { maxDigits: 3 });
      const elevationDisplay = elevationNumeric != null
        ? `${elevationNumeric}${geographic.units ? ` ${geographic.units}` : ''}`
        : null;
      const coordinateSystem = geographic.coordinateSystem ? this.escapeHtml(geographic.coordinateSystem) : null;
      const description = geographic.description ? this.escapeHtml(geographic.description) : null;
      const unitsDisplay = geographic.units ? this.escapeHtml(String(geographic.units)) : null;
      const geoObject = geographic.object || null;
      const designPointText = geoObject ? this.formatPoint3D(geoObject.designPoint) : null;
      const referencePointText = geoObject ? this.formatPoint3D(geoObject.referencePoint) : null;
      const northDirectionText = geoObject ? this.formatPoint3D(geoObject.northDirection) : null;

      const geoRows = [
        this.renderSummaryRow('Status', this.escapeHtml(geoStatus)),
        latitudeText ? this.renderSummaryRow('Latitude', this.escapeHtml(latitudeText)) : '',
        longitudeText ? this.renderSummaryRow('Longitude', this.escapeHtml(longitudeText)) : '',
        elevationDisplay ? this.renderSummaryRow('Elevation', this.escapeHtml(elevationDisplay)) : '',
        coordinateSystem ? this.renderSummaryRow('Coordinate System', coordinateSystem) : '',
        description ? this.renderSummaryRow('Description', description) : '',
        unitsDisplay ? this.renderSummaryRow('Units', unitsDisplay) : '',
        designPointText && designPointText !== '—' ? this.renderSummaryRow('Design Point', this.escapeHtml(designPointText)) : '',
        referencePointText && referencePointText !== '—' ? this.renderSummaryRow('Reference Point', this.escapeHtml(referencePointText)) : '',
        northDirectionText && northDirectionText !== '—' ? this.renderSummaryRow('North Direction', this.escapeHtml(northDirectionText)) : ''
      ].filter(Boolean).join('');

      const sections = [];
      if (unitsRows) {
        sections.push(`
          <div class="rendering-summary-section">
            <h4>Units</h4>
            <div class="rendering-summary-grid">
              ${unitsRows}
            </div>
          </div>
        `);
      }
      if (limitsRows) {
        sections.push(`
          <div class="rendering-summary-section">
            <h4>Limits &amp; Extents</h4>
            <div class="rendering-summary-grid">
              ${limitsRows}
            </div>
          </div>
        `);
      }
      if (metadataRows) {
        sections.push(`
          <div class="rendering-summary-section">
            <h4>Metadata</h4>
            <div class="rendering-summary-grid">
              ${metadataRows}
            </div>
          </div>
        `);
      }
      if (geoRows) {
        sections.push(`
          <div class="rendering-summary-section">
            <h4>Geographic Location</h4>
            <div class="rendering-summary-grid">
              ${geoRows}
            </div>
          </div>
        `);
      }

      return sections.join('');
    }

    renderSummaryRow(label, value) {
      const safeLabel = this.escapeHtml(label);
      const content = value != null && value !== '' ? value : '—';
      return `<div><span class="label">${safeLabel}:</span> ${content}</div>`;
    }

    formatNumber(value, options = {}) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return null;
      }
      const maxDigits = Number.isInteger(options.maxDigits) ? options.maxDigits : 4;
      let text = numeric.toFixed(maxDigits);
      if (options.trimZeros !== false) {
        text = text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      }
      if (text === '-0') {
        text = '0';
      }
      return text;
    }

    formatPoint2D(point) {
      if (!point || point.x == null || point.y == null) {
        return '—';
      }
      const x = this.formatNumber(point.x);
      const y = this.formatNumber(point.y);
      if (x == null || y == null) {
        return '—';
      }
      return `(${x}, ${y})`;
    }

    formatPoint3D(point) {
      if (!point || point.x == null || point.y == null) {
        return '—';
      }
      const x = this.formatNumber(point.x);
      const y = this.formatNumber(point.y);
      const z = point.z != null ? this.formatNumber(point.z) : null;
      if (x == null || y == null) {
        return '—';
      }
      const coords = [x, y];
      if (z != null) {
        coords.push(z);
      }
      return `(${coords.join(', ')})`;
    }

    formatRange2D(range) {
      if (!range) {
        return '—';
      }
      const start = this.formatPoint2D(range.min || {});
      const end = this.formatPoint2D(range.max || {});
      if (start === '—' && end === '—') {
        return '—';
      }
      return `${start} → ${end}`;
    }

    formatRange3D(range) {
      if (!range) {
        return '—';
      }
      const start = this.formatPoint3D(range.min || {});
      const end = this.formatPoint3D(range.max || {});
      if (start === '—' && end === '—') {
        return '—';
      }
      return `${start} → ${end}`;
    }

    formatTimestamp(descriptor) {
      if (!descriptor || typeof descriptor !== 'object') {
        return null;
      }
      if (descriptor.locale) {
        return descriptor.locale;
      }
      if (descriptor.iso) {
        return descriptor.iso;
      }
      if (descriptor.julian != null) {
        return `Julian ${descriptor.julian}`;
      }
      return null;
    }

    formatDuration(duration) {
      if (!duration || typeof duration !== 'object') {
        return null;
      }
      if (Number.isFinite(duration.hours)) {
        const hoursText = this.formatNumber(duration.hours, { maxDigits: 2 });
        const daysText = Number.isFinite(duration.days) ? this.formatNumber(duration.days, { maxDigits: 2 }) : null;
        if (hoursText && daysText) {
          return `${hoursText} h (${daysText} d)`;
        }
        if (hoursText) {
          return `${hoursText} h`;
        }
      }
      if (Number.isFinite(duration.days)) {
        return `${this.formatNumber(duration.days, { maxDigits: 2 })} d`;
      }
      return null;
    }

    formatTimezoneOffset(minutes) {
      if (!Number.isFinite(minutes)) {
        return null;
      }
      const totalMinutes = Number(minutes);
      const sign = totalMinutes <= 0 ? '+' : '-';
      const absMinutes = Math.abs(totalMinutes);
      const hours = Math.floor(absMinutes / 60);
      const mins = absMinutes % 60;
      const hh = String(hours).padStart(2, '0');
      const mm = String(mins).padStart(2, '0');
      return `UTC${sign}${hh}:${mm} (${totalMinutes} min)`;
    }

    formatLatitude(value) {
      if (!Number.isFinite(value)) {
        return null;
      }
      const suffix = value >= 0 ? 'N' : 'S';
      const magnitude = this.formatNumber(Math.abs(value), { maxDigits: 6 });
      return magnitude ? `${magnitude}° ${suffix}` : null;
    }

    formatLongitude(value) {
      if (!Number.isFinite(value)) {
        return null;
      }
      const suffix = value >= 0 ? 'E' : 'W';
      const magnitude = this.formatNumber(Math.abs(value), { maxDigits: 6 });
      return magnitude ? `${magnitude}° ${suffix}` : null;
    }

    getUnitsLabel(code) {
      const unitMap = {
        0: 'Unitless',
        1: 'Inches',
        2: 'Feet',
        3: 'Miles',
        4: 'Millimeters',
        5: 'Centimeters',
        6: 'Meters',
        7: 'Kilometers',
        8: 'Micro-inches',
        9: 'Mils',
        10: 'Yards',
        11: 'Angstroms',
        12: 'Nanometers',
        13: 'Micrometers',
        14: 'Decimeters',
        15: 'Decameters',
        16: 'Hectometers',
        17: 'Gigameters',
        18: 'Astronomical units',
        19: 'Light years',
        20: 'Parsecs',
        21: 'US survey feet'
      };
      if (!Number.isFinite(code)) {
        return null;
      }
      return unitMap[code] || `Custom (${code})`;
    }

    getMeasurementLabel(code) {
      if (!Number.isFinite(code)) {
        return null;
      }
      if (code === 0) {
        return 'Imperial';
      }
      if (code === 1) {
        return 'Metric';
      }
      return `Custom (${code})`;
    }

    getEffectiveLayerState(layerName) {
      if (!layerName) {
        return null;
      }
      const key = String(layerName).trim().toUpperCase();
      const catalog = this.currentLayerCatalog;
      if (!catalog || !catalog.has(key)) {
        return {
          name: layerName,
          effectiveIsOn: true,
          effectiveIsFrozen: false,
          effectiveIsLocked: false,
          effectiveTransparencyAlpha: 1,
          effectiveTransparencyPercent: 0,
          effectiveColorCss: 'rgba(210,227,255,1)',
          basePlotStyleHandle: null,
          basePlotStyleDescriptor: null,
          basePlotStyle: '—',
          basePlotStyleDisplay: '—',
          usageCount: 0,
          usageSpaces: [],
          hasOverrides: false
        };
      }
      const base = catalog.get(key);
      const overrides = this.currentLayerOverrides && this.currentLayerOverrides.get(key) ? this.currentLayerOverrides.get(key) : null;
      const resolveFlag = (prop, fallback) => {
        if (overrides && Object.prototype.hasOwnProperty.call(overrides, prop)) {
          return !!overrides[prop];
        }
        return !!fallback;
      };
      const effectiveIsOn = resolveFlag('isOn', base.baseIsOn);
      const effectiveIsFrozen = resolveFlag('isFrozen', base.baseIsFrozen);
      const effectiveIsLocked = resolveFlag('isLocked', base.baseIsLocked);

      let effectiveTransparencyAlpha = 1;
      if (overrides && Object.prototype.hasOwnProperty.call(overrides, 'transparencyAlpha')) {
        const overrideAlpha = overrides.transparencyAlpha;
        if (typeof overrideAlpha === 'number' && !Number.isNaN(overrideAlpha)) {
          effectiveTransparencyAlpha = Math.max(0, Math.min(1, overrideAlpha));
        }
      } else if (base.baseTransparency && typeof base.baseTransparency.alpha === 'number') {
        effectiveTransparencyAlpha = Math.max(0, Math.min(1, base.baseTransparency.alpha));
      }

      return Object.assign({}, base, {
        effectiveIsOn,
        effectiveIsFrozen,
        effectiveIsLocked,
        effectiveTransparencyAlpha,
        effectiveTransparencyPercent: Math.round((1 - effectiveTransparencyAlpha) * 100),
        effectiveColorCss: base.baseColorCss,
        hasOverrides: !!(overrides && Object.keys(overrides).length)
      });
    }

    renderLayerManagerTable(sceneGraph) {
      if (!this.layerManagerContainer) {
        return;
      }
      if (this.layerManagerFilterInput && this.layerManagerFilterInput.value !== this.layerManagerFilterText) {
        this.layerManagerFilterInput.value = this.layerManagerFilterText;
      }
      if (this.layerManagerHideInactiveCheckbox) {
        this.layerManagerHideInactiveCheckbox.checked = !!this.layerManagerHideInactiveFlag;
      }
      if (!this.currentLayerCatalog || !this.currentLayerCatalog.size) {
        this.layerManagerContainer.innerHTML = '<p>No layer metadata available.</p>';
        if (this.layerManagerStatus) {
          this.layerManagerStatus.textContent = 'No layers detected';
        }
        return;
      }

      const statsSource = sceneGraph || this.currentSceneGraph || {};
      const usageList = this.computeLayerStats(statsSource) || [];
      const usageMap = new Map();
      usageList.forEach((entry) => usageMap.set(entry.name, entry));

      const filter = (this.layerManagerFilterText || '').trim().toLowerCase();
      const hideInactive = !!this.layerManagerHideInactiveFlag;

      const rows = [];
      this.currentLayerCatalog.forEach((base, key) => {
        const effective = this.getEffectiveLayerState(base.name);
        if (filter && base.name.toLowerCase().indexOf(filter) === -1) {
          return;
        }
        if (hideInactive && (!effective.effectiveIsOn || effective.effectiveIsFrozen)) {
          return;
        }
        const usage = usageMap.get(base.name) || {
          count: base.usageCount || 0,
          spaces: base.usageSpaces || []
        };
        const overrides = this.currentLayerOverrides && this.currentLayerOverrides.get(key);
        rows.push({ base, effective, usage, overrides });
      });

      rows.sort((a, b) => a.base.name.localeCompare(b.base.name, undefined, { sensitivity: 'base' }));

      if (!rows.length) {
        this.layerManagerContainer.innerHTML = '<p>No layers match the current filters.</p>';
      } else {
        const body = rows.map((row) => {
        const rowClasses = [
          'layer-manager-row',
          !row.effective.effectiveIsOn ? 'layer-manager-row--off' : '',
          row.effective.effectiveIsFrozen ? 'layer-manager-row--frozen' : '',
          row.effective.effectiveIsLocked ? 'layer-manager-row--locked' : '',
          row.overrides && Object.keys(row.overrides).length ? 'layer-manager-row--overridden' : ''
        ].filter(Boolean).join(' ');
        const plotStyleDescriptor = row.base.basePlotStyleDescriptor || null;
        const plotStyleLabel = plotStyleDescriptor
          ? (plotStyleDescriptor.label || '—')
          : (row.base.basePlotStyle || '—');
        const plotStyleTitle = plotStyleDescriptor
          ? (plotStyleDescriptor.displayName || plotStyleLabel)
          : (row.base.basePlotStyleDisplay || plotStyleLabel);
        return `
            <tr class="${rowClasses}" data-layer="${row.base.name}">
              <td class="layer-manager-cell layer-manager-name">
                <span class="layer-color-swatch" style="background:${row.effective.effectiveColorCss};"></span>
                <div class="layer-name-block">
                  <div class="layer-name-text">${row.base.name}</div>
                  <div class="layer-name-meta">Entities: ${row.usage.count || 0}</div>
                </div>
              </td>
              <td class="layer-manager-cell layer-manager-toggle">
                <label>
                  <input type="checkbox" data-action="toggle-on" data-layer="${row.base.name}" ${row.effective.effectiveIsOn ? 'checked' : ''}>
                  <span>On</span>
                </label>
              </td>
              <td class="layer-manager-cell layer-manager-toggle">
                <label>
                  <input type="checkbox" data-action="toggle-frozen" data-layer="${row.base.name}" ${row.effective.effectiveIsFrozen ? 'checked' : ''}>
                  <span>Frozen</span>
                </label>
              </td>
              <td class="layer-manager-cell layer-manager-toggle">
                <label>
                  <input type="checkbox" data-action="toggle-locked" data-layer="${row.base.name}" ${row.effective.effectiveIsLocked ? 'checked' : ''}>
                  <span>Locked</span>
                </label>
              </td>
              <td class="layer-manager-cell layer-manager-transparency">
                <input type="range" min="0" max="90" step="5" value="${row.effective.effectiveTransparencyPercent}" data-action="transparency" data-layer="${row.base.name}">
                <span class="layer-transparency-value">${row.effective.effectiveTransparencyPercent}%</span>
              </td>
              <td class="layer-manager-cell layer-manager-plot-style" title="${this.escapeHtml(plotStyleTitle)}">${this.escapeHtml(plotStyleLabel)}</td>
            </tr>
          `;
        }).join('');

        this.layerManagerContainer.innerHTML = `
          <table class="layer-manager-table">
            <thead>
              <tr>
                <th>Layer</th>
                <th>On</th>
                <th>Frozen</th>
                <th>Locked</th>
                <th>Transparency</th>
                <th>Plot Style</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        `;
      }

      this.bindLayerManagerEvents();

      if (this.layerManagerStatus) {
        this.layerManagerStatus.textContent = this.computeLayerVisibilitySummary();
      }
    }

    bindLayerManagerEvents() {
      if (!this.layerManagerContainer) {
        return;
      }
      const onToggles = this.layerManagerContainer.querySelectorAll('input[data-action="toggle-on"]');
      onToggles.forEach((input) => {
        input.addEventListener('change', (event) => {
          const layer = event.target.dataset.layer;
          this.setLayerOverride(layer, 'isOn', event.target.checked);
        });
      });
      const frozenToggles = this.layerManagerContainer.querySelectorAll('input[data-action="toggle-frozen"]');
      frozenToggles.forEach((input) => {
        input.addEventListener('change', (event) => {
          const layer = event.target.dataset.layer;
          this.setLayerOverride(layer, 'isFrozen', event.target.checked);
        });
      });
      const lockedToggles = this.layerManagerContainer.querySelectorAll('input[data-action="toggle-locked"]');
      lockedToggles.forEach((input) => {
        input.addEventListener('change', (event) => {
          const layer = event.target.dataset.layer;
          this.setLayerOverride(layer, 'isLocked', event.target.checked);
        });
      });
      const transparencySliders = this.layerManagerContainer.querySelectorAll('input[data-action="transparency"]');
      transparencySliders.forEach((slider) => {
        slider.addEventListener('input', (event) => {
          const layer = event.target.dataset.layer;
          const percent = Number(event.target.value);
          this.setLayerTransparency(layer, percent, { reRenderTable: false });
          const label = event.target.parentElement ? event.target.parentElement.querySelector('.layer-transparency-value') : null;
          if (label) {
            label.textContent = `${percent}%`;
          }
        });
        slider.addEventListener('change', () => {
          this.renderLayerManagerTable();
        });
      });
    }

    computeLayerVisibilitySummary() {
      if (!this.currentLayerCatalog || !this.currentLayerCatalog.size) {
        return 'No layers detected';
      }
      let total = 0;
      let visible = 0;
      let frozen = 0;
      let locked = 0;
      let overrides = 0;
      this.currentLayerCatalog.forEach((base, key) => {
        total += 1;
        const effective = this.getEffectiveLayerState(base.name);
        if (effective.effectiveIsOn && !effective.effectiveIsFrozen) {
          visible += 1;
        }
        if (effective.effectiveIsFrozen) {
          frozen += 1;
        }
        if (effective.effectiveIsLocked) {
          locked += 1;
        }
        if (this.currentLayerOverrides && this.currentLayerOverrides.has(key)) {
          overrides += 1;
        }
      });
      const parts = [`${visible}/${total} visible`];
      if (frozen) {
        parts.push(`${frozen} frozen`);
      }
      if (locked) {
        parts.push(`${locked} locked`);
      }
      if (overrides) {
        parts.push(`${overrides} overrides`);
      }
      return parts.join(' · ');
    }

    getLayerBaseValue(base, property) {
      switch (property) {
        case 'isOn':
          return !!base.baseIsOn;
        case 'isFrozen':
          return !!base.baseIsFrozen;
        case 'isLocked':
          return !!base.baseIsLocked;
        case 'transparencyAlpha':
          if (base.baseTransparency && typeof base.baseTransparency.alpha === 'number') {
            return Math.max(0, Math.min(1, base.baseTransparency.alpha));
          }
          return 1;
        default:
          return null;
      }
    }

    normalizeLayerOverrideValue(property, value) {
      if (property === 'transparencyAlpha') {
        if (typeof value !== 'number' || Number.isNaN(value)) {
          return 1;
        }
        return Math.max(0, Math.min(1, value));
      }
      return !!value;
    }

    areLayerValuesEqual(property, a, b) {
      if (property === 'transparencyAlpha') {
        const safeA = typeof a === 'number' ? a : 1;
        const safeB = typeof b === 'number' ? b : 1;
        return Math.abs(safeA - safeB) < 0.001;
      }
      return !!a === !!b;
    }

    setLayerOverride(layerName, property, value, options = {}) {
      if (!layerName) {
        return;
      }
      const key = String(layerName).trim().toUpperCase();
      if (!key) {
        return;
      }
      const catalog = this.currentLayerCatalog;
      if (!catalog || !catalog.has(key)) {
        return;
      }
      const base = catalog.get(key);
      const { reRenderSurface = true, reRenderTable = true, preserveIsolation = false } = options;
      if (!preserveIsolation) {
        this.invalidateLayerIsolation({ silent: true });
      }
      let overridesMap = this.currentLayerOverrides;
      if (!overridesMap) {
        overridesMap = new Map();
        this.currentLayerOverrides = overridesMap;
      }
      if (this.currentTabId && !this.layerOverridesByTab.has(this.currentTabId)) {
        this.layerOverridesByTab.set(this.currentTabId, overridesMap);
      }
      let overrides = overridesMap.get(key);
      if (!overrides) {
        overrides = {};
        overridesMap.set(key, overrides);
      }

      const baseValue = this.getLayerBaseValue(base, property);
      const normalizedValue = this.normalizeLayerOverrideValue(property, value);

      if (this.areLayerValuesEqual(property, baseValue, normalizedValue)) {
        if (Object.prototype.hasOwnProperty.call(overrides, property)) {
          delete overrides[property];
        }
      } else {
        overrides[property] = normalizedValue;
      }

      if (!Object.keys(overrides).length) {
        overridesMap.delete(key);
      }

      if (this.currentTabId) {
        this.layerOverridesByTab.set(this.currentTabId, overridesMap);
      }
      this.currentLayerOverrides = overridesMap;

      this.applyLayerStateToSurface({ reRender: reRenderSurface });

      if (reRenderTable) {
        this.renderLayerManagerTable();
      }
      if (!preserveIsolation) {
        this.updateIsolationSummary();
      }
      this.updateSelectionToolbarUI();
    }

    setLayerTransparency(layerName, percent, options = {}) {
      const percentLimit = Math.max(0, Math.min(90, Number(percent) || 0));
      const alpha = 1 - percentLimit / 100;
      this.setLayerOverride(layerName, 'transparencyAlpha', alpha, {
        reRenderSurface: options.reRenderSurface !== false,
        reRenderTable: options.reRenderTable !== false,
        preserveIsolation: options.preserveIsolation === true
      });
    }

    resetLayerOverrides() {
      this.invalidateLayerIsolation({ silent: true });
      if (this.currentLayerOverrides) {
        this.currentLayerOverrides.clear();
      } else {
        this.currentLayerOverrides = new Map();
      }
      if (this.currentTabId) {
        this.layerOverridesByTab.set(this.currentTabId, this.currentLayerOverrides);
      }
      this.renderLayerManagerTable();
      this.applyLayerStateToSurface({ reRender: true });
      this.updateIsolationSummary();
      this.updateSelectionToolbarUI();
    }

    applyLayerStateToSurface(options = {}) {
      if (!this.surfaceManager || typeof this.surfaceManager.setLayerState !== 'function') {
        return;
      }
      const { reRender = true } = options;
      if (!this.currentLayerCatalog || !this.currentLayerCatalog.size) {
        this.surfaceManager.setLayerState(null);
        if (reRender && this.currentSceneGraph) {
          const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
          this.surfaceManager.resume();
          this.refreshViewportOverlays(frame);
        }
        return;
      }
      const state = new Map();
      this.currentLayerCatalog.forEach((base, key) => {
        const effective = this.getEffectiveLayerState(base.name);
        state.set(key, {
          name: base.name,
          isOn: effective.effectiveIsOn,
          isFrozen: effective.effectiveIsFrozen,
          isLocked: effective.effectiveIsLocked,
          transparencyAlpha: effective.effectiveTransparencyAlpha
        });
      });
      this.surfaceManager.setLayerState(state);
      if (reRender && this.currentSceneGraph) {
        const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
        this.surfaceManager.resume();
        this.refreshViewportOverlays(frame);
      }
    }

    computeLayerStats(sceneGraph) {
      const counts = new Map();

      const record = (entity, space) => {
        if (!entity) return;
        const layerName = entity.layer || '0';
        if (!counts.has(layerName)) {
          counts.set(layerName, { name: layerName, count: 0, spaces: new Set() });
        }
        const entry = counts.get(layerName);
        entry.count += 1;
        entry.spaces.add(space);
      };

      if (sceneGraph.modelSpace) {
        sceneGraph.modelSpace.forEach((entity) => record(entity, 'Model'));
      }
      if (sceneGraph.paperSpaces) {
        Object.keys(sceneGraph.paperSpaces).forEach((layout) => {
          sceneGraph.paperSpaces[layout].forEach((entity) => record(entity, `Paper:${layout}`));
        });
      }
      if (sceneGraph.blocks) {
        Object.keys(sceneGraph.blocks).forEach((blockName) => {
          const block = sceneGraph.blocks[blockName];
          if (block && Array.isArray(block.entities)) {
            block.entities.forEach((entity) => record(entity, `Block:${blockName}`));
          }
        });
      }

      return Array.from(counts.values())
        .map((entry) => ({
          name: entry.name,
          count: entry.count,
          spaces: Array.from(entry.spaces)
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }

    drawOverlayMessage(message) {
      if (this.surfaceManager) {
        this.surfaceManager.renderMessage(message);
      }
      this.refreshViewportOverlays(null);
    }

    drawOverview(sceneGraph) {
      const frame = this.surfaceManager ? this.surfaceManager.renderScene(sceneGraph) : null;
      this.refreshViewportOverlays(frame);
    }

    resizeCanvas() {
      if (!this.canvas) {
        return;
      }
      const container = this.canvas.parentElement;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const dpr = (this.global && this.global.devicePixelRatio) || 1;
      // Hidden tabs have zero bounds. Do not allocate/clear a canvas while it is parked.
      if (this.dockingWorkspace && (!rect.width || !rect.height)) return;
      const width = Math.max(this.dockingWorkspace ? 1 : 320, rect.width);
      const height = Math.max(this.dockingWorkspace ? 1 : 240, rect.height);
      if (this.canvas.width !== Math.floor(width * dpr) || this.canvas.height !== Math.floor(height * dpr)) {
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);
      }
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      if (this.surfaceManager) {
        this.surfaceManager.resize(width, height, dpr);
        // Resizing clears the backing bitmap. Rebuild the frame at its new bounds,
        // preserving the manager's current camera rather than resetting to auto-fit.
        const frame = this.dockingWorkspace && this.currentSceneGraph
          ? this.surfaceManager.renderScene(this.currentSceneGraph)
          : this.surfaceManager.lastFrame;
        this.refreshViewportOverlays(frame);
      }
      if (this.textLayer) {
        this.textLayer.style.width = `${width}px`;
        this.textLayer.style.height = `${height}px`;
      }
      this.clearInteractionOverlay();
    }

    close() {
      if (this.overlayRoot) {
        this.overlayRoot.style.display = 'none';
        this.overlayRoot.setAttribute('aria-hidden', 'true');
      }
      this.clearInteractionOverlay();
      if (this.surfaceManager) {
        this.surfaceManager.suspend();
      }
      this.resetMeasurementState({ silent: true });
      this.clearSnapIndicator({ silent: true });
      this.refreshViewportOverlays(null);
      this.updateMeasurementToolbarUI();
      this.setInformationTab('info');
      this.clearPropertyPanel({ message: 'No selection.' });
      this.pendingBlockFocus = null;
      this.blockCardMap.clear();
      this.currentBlockMetadata = null;
      this.currentTabId = null;
      this.currentPane = null;
      this.currentSceneGraph = null;
      this.currentDoc = null;
    }

    applyBlockFilters(options = {}) {
      if (!this.surfaceManager) {
        return;
      }
      const toSetOrNull = (value) => {
        if (!value) {
          return null;
        }
        if (value instanceof Set) {
          return value;
        }
        if (Array.isArray(value)) {
          return value.length ? new Set(value) : null;
        }
        return null;
      };
      const isolationSource = Object.prototype.hasOwnProperty.call(options, 'isolation')
        ? options.isolation
        : this.getBlockIsolation();
      const highlightSource = Object.prototype.hasOwnProperty.call(options, 'highlight')
        ? options.highlight
        : this.getBlockHighlights();

      const isolation = toSetOrNull(isolationSource);
      const highlight = toSetOrNull(highlightSource);

      this.surfaceManager.setBlockIsolation(isolation);
      this.surfaceManager.setBlockHighlights(highlight);
      this.surfaceManager.setSelectionHandles(this.selectionHandles || new Set());

      if (this.currentSceneGraph) {
        const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
        this.surfaceManager.resume();
        this.refreshViewportOverlays(frame);
      }
    }

    syncAttributeVisibilityControls() {
      if (!this.attributeDisplayState) {
        this.attributeDisplayState = {
          showDefinitions: false,
          showInvisible: false,
          showReferences: true
        };
      }
      if (this.attributeDefinitionCheckbox) {
        this.attributeDefinitionCheckbox.checked = !!this.attributeDisplayState.showDefinitions;
      }
      if (this.attributeReferencesCheckbox) {
        this.attributeReferencesCheckbox.checked = !!this.attributeDisplayState.showReferences;
      }
      if (this.attributeInvisibleCheckbox) {
        this.attributeInvisibleCheckbox.checked = !!this.attributeDisplayState.showInvisible;
      }
    }

    applyAttributeVisibilityControls() {
      const nextState = {
        showDefinitions: this.attributeDefinitionCheckbox ? !!this.attributeDefinitionCheckbox.checked : (this.attributeDisplayState?.showDefinitions || false),
        showReferences: this.attributeReferencesCheckbox ? !!this.attributeReferencesCheckbox.checked : (this.attributeDisplayState?.showReferences !== false),
        showInvisible: this.attributeInvisibleCheckbox ? !!this.attributeInvisibleCheckbox.checked : (this.attributeDisplayState?.showInvisible || false)
      };
      this.attributeDisplayState = nextState;
      if (this.surfaceManager && typeof this.surfaceManager.setAttributeDisplay === 'function') {
        this.surfaceManager.setAttributeDisplay(nextState);
      }
      this.syncAttributeVisibilityControls();
      if (this.currentSceneGraph && this.surfaceManager) {
        const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
        this.surfaceManager.resume();
        this.refreshViewportOverlays(frame);
      }
    }

    ensureSelectionSetForCurrentTab(createIfMissing = true) {
      const tabId = this.currentTabId;
      if (!tabId) {
        return createIfMissing ? new Set() : null;
      }
      if (!this.selectionByTab.has(tabId)) {
        if (!createIfMissing) {
          return null;
        }
        this.selectionByTab.set(tabId, new Set());
      }
      return this.selectionByTab.get(tabId);
    }

    normalizeHandle(handle) {
      if (handle == null) {
        return null;
      }
      const str = typeof handle === 'string' ? handle : String(handle);
      const trimmed = str.trim();
      return trimmed ? trimmed.toUpperCase() : null;
    }

    applySelectionHandles(selectionSet, options = {}) {
      if (!selectionSet) {
        selectionSet = new Set();
      }
      const nextHandles = selectionSet instanceof Set ? new Set(selectionSet) : new Set(selectionSet || []);
      const tabId = this.currentTabId;
      if (tabId) {
        this.selectionByTab.set(tabId, new Set(nextHandles));
      }
      let changed = false;
      if (this.selectionHandles.size !== nextHandles.size) {
        changed = true;
      } else {
        for (const handle of nextHandles) {
          if (!this.selectionHandles.has(handle)) {
            changed = true;
            break;
          }
        }
      }
      this.selectionHandles = nextHandles;
      if (this.surfaceManager && (changed || !this.surfaceManager.lastFrame)) {
        this.surfaceManager.setSelectionHandles(this.selectionHandles);
        if (this.currentSceneGraph) {
          const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
          this.surfaceManager.resume();
          this.refreshViewportOverlays(frame);
        }
      }
      if (!options.suppressSummary) {
        this.updateSelectionSummary();
      }
      this.updateSelectionToolbarUI();
      this.updateSelectionPropertyPanel();
    }

    updateSelectionPropertyPanel() {
      if (!this.propertyPanel || !this.propertyGrid) {
        return;
      }
      const selectionSet = this.ensureSelectionSetForCurrentTab(false);
      const handles = selectionSet
        ? Array.from(selectionSet, (handle) => this.normalizeHandle(handle)).filter(Boolean)
        : [];
      const docReady = this.currentDoc && this.currentDoc.status === 'ready';
      if (!docReady) {
        this.clearPropertyPanel({
          message: handles.length ? 'Scene graph unavailable.' : 'No selection.'
        });
        return;
      }
      if (!handles.length) {
        this.clearPropertyPanel({ message: 'No selection.' });
        return;
      }
      const tabId = this.currentTabId;
      let lookup = tabId ? this.entityLookupByTab.get(tabId) : null;
      if (!lookup && this.currentDoc && this.currentDoc.status === 'ready') {
        lookup = this.buildEntityLookupForDoc(this.currentDoc);
        if (tabId) {
          this.entityLookupByTab.set(tabId, lookup);
        }
      }
      const sections = handles.map((handle, index) => {
        const entity = lookup ? lookup.get(handle) : null;
        return this.buildPropertyGridSection(handle, entity, index);
      });
      this.propertyGrid.setSections(sections);
      if (this.propertySummaryEl) {
        this.propertySummaryEl.textContent = handles.length === 1
          ? `Handle ${handles[0]}`
          : `${handles.length} entities selected`;
      }
      this.propertyPanel.setAttribute('aria-hidden', this.dockingWorkspace
        ? String(!this.dockingWorkspace.isOpen('render-properties')) : 'false');
      if (this.overlayBodyEl) {
        this.overlayBodyEl.classList.add('has-properties');
      }
    }

    clearPropertyPanel(options = {}) {
      if (this.propertyGrid) {
        this.propertyGrid.clear();
      }
      if (!this.propertyPanel) {
        return;
      }
      if (this.propertySummaryEl) {
        this.propertySummaryEl.textContent = options.message || 'No selection.';
      }
      this.propertyPanel.setAttribute('aria-hidden', 'true');
      if (this.overlayBodyEl) {
        this.overlayBodyEl.classList.remove('has-properties');
      }
    }

    buildPropertyGridSection(handle, entity, index = 0) {
      const normalizedHandle = handle ? this.normalizeHandle(handle) : null;
      const titleParts = [];
      if (entity && entity.type) {
        titleParts.push(String(entity.type));
      } else {
        titleParts.push('Entity');
      }
      if (normalizedHandle) {
        titleParts.push(normalizedHandle);
      } else {
        titleParts.push(`#${index + 1}`);
      }
      const title = titleParts.join(' • ');
      let subtitle = '';
      if (entity && typeof entity === 'object') {
        const details = [];
        if (entity.layer) {
          details.push(`Layer: ${entity.layer}`);
        }
        if (entity.space) {
          details.push(`Space: ${entity.space}`);
        }
        if (entity.blockName) {
          details.push(`Block: ${entity.blockName}`);
        }
        if (entity.owner) {
          details.push(`Owner: ${entity.owner}`);
        }
        subtitle = details.join(' · ');
      } else {
        subtitle = 'No metadata available for this handle.';
      }
      const properties = this.extractEntityPropertiesForGrid(entity, normalizedHandle);
      if (!properties.length && normalizedHandle) {
        properties.push({ name: 'Handle', value: normalizedHandle });
      }
      return {
        title,
        subtitle,
        properties
      };
    }

    extractEntityPropertiesForGrid(entity, fallbackHandle = null) {
      if (!entity || typeof entity !== 'object') {
        if (fallbackHandle) {
          return [{ name: 'Handle', value: fallbackHandle }];
        }
        return [];
      }
      const entries = [];
      const visited = new Set();
      const maxEntries = 400;
      const maxDepth = 3;
      const maxArrayItems = 24;

      const pushEntry = (name, rawValue) => {
        if (!name || entries.length >= maxEntries) {
          return;
        }
        entries.push({
          name,
          value: this.formatPropertyValue(rawValue)
        });
      };

      const traverse = (value, path, depth) => {
        if (entries.length >= maxEntries) {
          return;
        }
        const keyPath = path || '';
        if (value === null) {
          pushEntry(keyPath, 'null');
          return;
        }
        const valueType = typeof value;
        if (valueType === 'string') {
          pushEntry(keyPath, value);
          return;
        }
        if (valueType === 'number') {
          pushEntry(keyPath, Number.isFinite(value) ? value.toString() : String(value));
          return;
        }
        if (valueType === 'boolean') {
          pushEntry(keyPath, value ? 'true' : 'false');
          return;
        }
        if (valueType === 'bigint') {
          pushEntry(keyPath, value.toString());
          return;
        }
        if (value instanceof Date) {
          pushEntry(keyPath, value.toISOString());
          return;
        }
        if (valueType === 'undefined') {
          pushEntry(keyPath, 'undefined');
          return;
        }
        if (valueType === 'function') {
          pushEntry(keyPath, '[Function]');
          return;
        }
        if (valueType !== 'object') {
          pushEntry(keyPath, this.stringifyForPropertyGrid(value));
          return;
        }
        if (visited.has(value)) {
          pushEntry(keyPath, '[Circular]');
          return;
        }
        visited.add(value);
        if (Array.isArray(value)) {
          if (!value.length) {
            pushEntry(keyPath, '[]');
          } else if (depth >= maxDepth || value.length > maxArrayItems) {
            pushEntry(keyPath, this.stringifyForPropertyGrid(value));
          } else {
            value.forEach((item, index) => {
              traverse(item, `${keyPath}[${index}]`, depth + 1);
            });
          }
          visited.delete(value);
          return;
        }
        const keys = Object.keys(value);
        if (!keys.length) {
          pushEntry(keyPath, '{}');
          visited.delete(value);
          return;
        }
        if (depth >= maxDepth) {
          pushEntry(keyPath, this.stringifyForPropertyGrid(value));
          visited.delete(value);
          return;
        }
        keys.forEach((key) => {
          const nextPath = keyPath ? `${keyPath}.${key}` : key;
          traverse(value[key], nextPath, depth + 1);
        });
        visited.delete(value);
      };

      Object.keys(entity).forEach((key) => {
        traverse(entity[key], key, 0);
      });

      if (entries.length >= maxEntries) {
        entries.push({
          name: '[Notice]',
          value: `Property list truncated at ${maxEntries} entries.`
        });
      }

      return entries;
    }

    formatPropertyValue(value) {
      if (value == null) {
        return value === null ? 'null' : '';
      }
      if (typeof value === 'string') {
        return value;
      }
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value.toString() : String(value);
      }
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      if (typeof value === 'bigint') {
        return value.toString();
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'undefined') {
        return 'undefined';
      }
      return this.stringifyForPropertyGrid(value);
    }

    stringifyForPropertyGrid(value) {
      try {
        const json = JSON.stringify(value, (key, val) => {
          if (typeof val === 'bigint') {
            return val.toString();
          }
          if (typeof val === 'function') {
            return '[Function]';
          }
          return val;
        }, 2);
        if (typeof json === 'string' && json.length > 4000) {
          return `${json.slice(0, 4000)}…`;
        }
        return json;
      } catch (error) {
        return String(value);
      }
    }

    buildEntityLookupForDoc(doc) {
      const lookup = new Map();
      if (!doc || typeof doc !== 'object') {
        return lookup;
      }
      const registerEntity = (entity) => {
        if (!entity || typeof entity !== 'object') {
          return;
        }
        const handle = this.normalizeHandle(entity.handle || entity.id || null);
        if (handle && !lookup.has(handle)) {
          lookup.set(handle, entity);
        }
      };
      if (Array.isArray(doc.entities)) {
        doc.entities.forEach(registerEntity);
      }
      if (Array.isArray(doc.blocks)) {
        doc.blocks.forEach((block) => {
          if (!block || !Array.isArray(block.entities)) {
            return;
          }
          block.entities.forEach(registerEntity);
        });
      }
      const sceneGraph = doc.sceneGraph;
      if (sceneGraph && Array.isArray(sceneGraph.entities)) {
        sceneGraph.entities.forEach(registerEntity);
      }
      return lookup;
    }

    renderBlockGallery(metadata) {
      this.currentBlockMetadata = metadata || null;
      if (!this.blockGridEl) {
        return;
      }
      this.blockCardMap.clear();
      this.blockGridEl.innerHTML = '';
      const ordered = metadata && Array.isArray(metadata.ordered) ? metadata.ordered : [];
      const totalInstances = ordered.reduce((sum, entry) => sum + (Number(entry.instanceCount) || 0), 0);
      if (this.blockSummaryEl) {
        if (!ordered.length) {
          this.blockSummaryEl.textContent = 'No block metadata.';
        } else {
          this.blockSummaryEl.textContent = `Blocks: ${ordered.length} • Instances: ${totalInstances}`;
        }
      }
      if (!ordered.length) {
        const empty = this.createElement('p');
        if (empty) {
          empty.className = 'rendering-blocks-empty';
          empty.textContent = 'No block definitions available.';
          this.blockGridEl.appendChild(empty);
        }
        this.pendingBlockFocus = null;
        return;
      }

      const formatPoint = (point) => {
        if (!point || typeof point !== 'object') {
          return '0, 0, 0';
        }
        const x = Number(point.x) || 0;
        const y = Number(point.y) || 0;
        const z = Number(point.z) || 0;
        return `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
      };

      ordered.forEach((entry) => {
        const blockName = entry && entry.name ? entry.name : '(Unnamed)';
        const normalizedName = this.normalizeBlockName(blockName);
        const card = this.createElement('div');
        if (!card) {
          return;
        }
        card.className = 'rendering-block-card';
        card.dataset.blockName = normalizedName;
        card.setAttribute('tabindex', '0');

        const thumb = this.createElement('div');
        const blockDefinition = this.getBlockDefinition(blockName);

        if (thumb) {
          thumb.className = 'rendering-block-thumb';
          const canvas = this.createElement('canvas');
          if (canvas) {
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            if (!this.renderBlockThumbnail(canvas, entry, blockDefinition)) {
              this.drawBlockFallback(canvas, entry);
            }
            thumb.appendChild(canvas);
          }
          card.appendChild(thumb);
        }

        const nameEl = this.createElement('div');
        if (nameEl) {
          nameEl.className = 'rendering-block-name';
          nameEl.textContent = blockName;
          card.appendChild(nameEl);
        }

        const details = this.createElement('div');
        if (details) {
          details.className = 'rendering-block-details';
          const instanceCount = Number(entry.instanceCount) || 0;
          const attributeCount = Number(entry.attributeCount) || 0;
          const basePoint = entry.basePoint || null;
          const statsLine = `Instances: ${instanceCount}`;
          const attrLine = `Attributes: ${attributeCount}`;
          const baseLine = `Base: ${formatPoint(basePoint)}`;
          [statsLine, attrLine, baseLine].forEach((text) => {
            const line = this.createElement('div');
            if (line) {
              line.textContent = text;
              details.appendChild(line);
            }
          });
          card.appendChild(details);
        }

        const activate = (event) => {
          if (event) {
            event.preventDefault();
          }
          this.highlightBlockCard(normalizedName, { smooth: true, focus: true });
        };
        card.addEventListener('click', activate);
        card.addEventListener('keydown', (event) => {
          if (!event) {
            return;
          }
          const key = event.key || '';
          if (key === 'Enter' || key === ' ') {
            activate(event);
          }
        });

        this.blockGridEl.appendChild(card);
        this.blockCardMap.set(normalizedName, card);
      });

      if (this.pendingBlockFocus && this.highlightBlockCard(this.pendingBlockFocus, { smooth: true, focus: true })) {
        this.pendingBlockFocus = null;
      }
    }

    renderBlockThumbnail(canvas, entry, blockDefinition) {
      if (!canvas || !this.currentDoc || !blockDefinition) return false;
      const scene = this.buildBlockPreviewScene(entry.name, blockDefinition, this.currentDoc.sceneGraph, entry);
      const manager = new namespace.RenderingSurfaceManager({ backend: 'canvas', lineweights: false });
      manager.initialize(canvas); manager.resize(180, 110, 1);
      manager.renderScene(scene); manager.resume();
      manager.ready.catch(error => { canvas.title = 'Preview unavailable: ' + error.message; })
        .finally(() => manager.dispose());
      return true;
    }

    drawBlockFallback(canvas, entry) {
      // Unsupported thumbnails are clearly identified, not fabricated geometry.
      canvas.setAttribute('aria-label', 'No preview geometry for ' + (entry?.name || 'block'));
      canvas.title = 'Block has no supported preview geometry.';
    }

    destroyRenderingSurface(manager) {
      return manager?.dispose();
    }

    computeBlockColor(name) {
      const normalized = this.normalizeBlockName(name) || 'BLOCK';
      let hash = 0;
      for (let i = 0; i < normalized.length; i += 1) {
        hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
      }
      const hue = hash % 360;
      const primary = `hsl(${hue}, 70%, 78%)`;
      const secondary = `hsl(${(hue + 30) % 360}, 80%, 92%)`;
      return { primary, secondary };
    }

    buildBlockPreviewScene(blockName, blockDefinition, sceneGraph, metadataEntry) {
      const document = Object.create(sceneGraph.document);
      const insert = new root.DxfSkia.DxfRecord([{code:0,value:'INSERT'}, {code:2,value:blockName}, {code:5,value:'PREVIEW'}]);
      document.getEntities = () => [insert];
      document.sceneGraph = { ...sceneGraph, modelSpace: [insert] };
      Object.defineProperty(document.sceneGraph, 'document', { value: document });
      return document.sceneGraph;
    }

    cloneBlockDefinition(definition) {
      return definition; // Immutable-by-contract document geometry is shared by previews.
    }

    getBlockDefinition(blockName) {
      if (!blockName || !this.currentDoc || !this.currentDoc.sceneGraph || !this.currentDoc.sceneGraph.blocks) {
        return null;
      }
      const blocks = this.currentDoc.sceneGraph.blocks;
      if (blocks[blockName]) {
        return blocks[blockName];
      }
      const upper = blockName.toUpperCase();
      if (blocks[upper]) {
        return blocks[upper];
      }
      const matchKey = Object.keys(blocks).find((key) => key.toUpperCase() === upper);
      return matchKey ? blocks[matchKey] : null;
    }

    normalizeBlockName(name) {
      if (name == null) {
        return null;
      }
      const trimmed = String(name).trim();
      return trimmed ? trimmed.toUpperCase() : null;
    }

    highlightBlockCard(blockName, options = {}) {
      const normalized = this.normalizeBlockName(blockName);
      if (!normalized || !this.blockGridEl) {
        return false;
      }
      const existingHighlight = this.blockGridEl.querySelectorAll('.rendering-block-card.highlighted');
      existingHighlight.forEach((card) => card.classList.remove('highlighted'));
      const card = this.blockCardMap.get(normalized) || this.blockGridEl.querySelector(`[data-block-name="${normalized}"]`);
      if (!card) {
        return false;
      }
      card.classList.add('highlighted');
      const shouldScroll = options && options.scroll !== false;
      if (shouldScroll) {
        try {
          card.scrollIntoView({ behavior: options.smooth === false ? 'auto' : 'smooth', block: 'nearest' });
        } catch (err) {
          /* ignore scroll errors */
        }
      }
      if (!options || options.focus !== false) {
        try {
          card.focus({ preventScroll: true });
        } catch (err) {
          /* ignore */
        }
      }
      return true;
    }

    focusBlockDefinition(blockName, options = {}) {
      const normalized = this.normalizeBlockName(blockName);
      if (!normalized) {
        return;
      }
      this.pendingBlockFocus = normalized;
      this.setInformationTab('blocks', { focus: options.focus !== false });
      const attemptFocus = (remaining) => {
        if (this.highlightBlockCard(normalized, { smooth: true, focus: true })) {
          this.pendingBlockFocus = null;
          return;
        }
        if (remaining <= 0) {
          return;
        }
        setTimeout(() => attemptFocus(remaining - 1), 140);
      };
      attemptFocus(10);
    }

    updateSelectionSummary() {
      if (!this.summaryContainer) {
        return;
      }
      const selectionSet = this.ensureSelectionSetForCurrentTab(false);
      const count = selectionSet ? selectionSet.size : 0;
      let badge = this.summaryContainer.querySelector('.rendering-selection-summary');
      if (!badge) {
        badge = this.createElement('div');
        badge.className = 'rendering-selection-summary';
        this.summaryContainer.appendChild(badge);
      }
      if (count === 0) {
        badge.textContent = 'Selection: none';
        badge.classList.add('empty');
      } else {
        badge.textContent = `Selection: ${count} ${count === 1 ? 'handle' : 'handles'}`;
        badge.classList.remove('empty');
      }
    }

    updateIsolationSummary() {
      if (!this.summaryContainer) {
        return;
      }
      if (!this.isolationSummaryEl || !this.summaryContainer.contains(this.isolationSummaryEl)) {
        this.isolationSummaryEl = this.createElement('div');
        this.isolationSummaryEl.className = 'rendering-isolation-summary';
        this.summaryContainer.appendChild(this.isolationSummaryEl);
      }
      const parts = [];
      if (this.layerIsolationState && Array.isArray(this.layerIsolationState.layerNames) && this.layerIsolationState.layerNames.length) {
        const names = this.layerIsolationState.layerNames.slice();
        const display = names.length > 3 ? `${names.slice(0, 3).join(', ')}, …` : names.join(', ');
        parts.push(`Layers (${names.length}) – ${display}`);
      }
      if (this.objectIsolationState && this.objectIsolationState.handles instanceof Set && this.objectIsolationState.handles.size) {
        parts.push(`Objects (${this.objectIsolationState.handles.size})`);
      }
      if (!parts.length) {
        this.isolationSummaryEl.textContent = 'Isolation: none';
        this.isolationSummaryEl.classList.add('empty');
      } else {
        this.isolationSummaryEl.textContent = `Isolation: ${parts.join(' • ')}`;
        this.isolationSummaryEl.classList.remove('empty');
      }
    }

    updateSelectionToolbarUI() {
      if (!this.selectionToolbar) {
        return;
      }
      const selectionSet = this.ensureSelectionSetForCurrentTab(false);
      const selectionCount = selectionSet ? selectionSet.size : 0;
      const hasLayerIsolation = !!(this.layerIsolationState && Array.isArray(this.layerIsolationState.layerKeys) && this.layerIsolationState.layerKeys.length);
      const hasObjectIsolation = !!(this.objectIsolationState && this.objectIsolationState.handles instanceof Set && this.objectIsolationState.handles.size);
      let context = null;
      if (selectionCount > 0) {
        context = this.computeSelectionContext({ selectionSet });
      }
      const layersAvailable = !!(context && context.layers && context.layers.size);
      const lockedLayersCount = context && context.lockedLayers ? context.lockedLayers.size : 0;
      const hasFrame = !!(this.surfaceManager && this.surfaceManager.lastFrame && !this.surfaceManager.lastFrame.isEmpty);
      this.selectionToolbarButtons.forEach((button) => {
        if (!button) {
          return;
        }
        const action = (button.dataset.action || '').toLowerCase();
        switch (action) {
          case 'isolate-layers':
            button.disabled = !layersAvailable;
            break;
          case 'lock-layers':
            button.disabled = !layersAvailable;
            break;
          case 'unlock-layers':
            button.disabled = !layersAvailable || lockedLayersCount === 0;
            break;
          case 'isolate-objects':
            button.disabled = !(selectionCount > 0 && hasFrame);
            break;
          case 'clear-layer-isolation':
            button.disabled = !hasLayerIsolation;
            break;
          case 'clear-object-isolation':
            button.disabled = !hasObjectIsolation;
            break;
          default:
            break;
        }
      });
      const shouldShow = selectionCount > 0 || hasLayerIsolation || hasObjectIsolation;
      if (shouldShow) {
        this.selectionToolbar.setAttribute('aria-hidden', 'false');
        this.selectionToolbar.style.display = 'inline-flex';
      } else {
        this.selectionToolbar.setAttribute('aria-hidden', 'true');
        this.selectionToolbar.style.display = 'none';
      }
    }

    computeSelectionContext(options = {}) {
      const selectionSet = options.selectionSet || this.ensureSelectionSetForCurrentTab(false);
      if (!selectionSet || !selectionSet.size) {
        return {
          handles: new Set(),
          layers: new Map(),
          layerKeys: new Set(),
          layerNames: [],
          lockedLayers: new Set()
        };
      }
      const handles = new Set();
      selectionSet.forEach((handle) => {
        const normalized = this.normalizeHandle(handle);
        if (normalized) {
          handles.add(normalized);
        }
      });
      const pickables = this.getPickables();
      const pickableByHandle = new Map();
      pickables.forEach((pickable) => {
        const normalized = this.normalizeHandle(pickable && pickable.handle);
        if (normalized) {
          pickableByHandle.set(normalized, pickable);
        }
      });
      const layers = new Map();
      handles.forEach((handle) => {
        const pick = pickableByHandle.get(handle);
        if (pick && pick.layer) {
          const rawName = pick.layer;
          const key = String(rawName).trim().toUpperCase();
          if (key && !layers.has(key)) {
            layers.set(key, rawName);
          }
        }
      });
      const layerKeys = new Set(layers.keys());
      const layerNames = Array.from(layers.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      const lockedLayers = new Set();
      layers.forEach((name, key) => {
        const state = this.getEffectiveLayerState(name);
        if (state && state.effectiveIsLocked) {
          lockedLayers.add(key);
        }
      });
      return {
        handles,
        layers,
        layerKeys,
        layerNames,
        lockedLayers
      };
    }

    handleSelectionToolbarAction(action) {
      switch ((action || '').toLowerCase()) {
        case 'isolate-layers':
          this.handleIsolateLayersAction();
          break;
        case 'lock-layers':
          this.handleLayerLockToggle(true);
          break;
        case 'unlock-layers':
          this.handleLayerLockToggle(false);
          break;
        case 'isolate-objects':
          this.handleIsolateObjectsAction();
          break;
        case 'clear-layer-isolation':
          this.clearLayerIsolation();
          break;
        case 'clear-object-isolation':
          this.clearObjectIsolation();
          break;
        default:
          break;
      }
    }

    handleIsolateLayersAction() {
      if (!this.currentLayerCatalog || !this.currentLayerCatalog.size) {
        return;
      }
      const context = this.computeSelectionContext();
      if (!context.layerKeys || !context.layerKeys.size) {
        return;
      }
      this.applyLayerIsolation({
        layerKeys: context.layerKeys,
        layerNames: context.layerNames
      });
    }

    handleLayerLockToggle(shouldLock) {
      const context = this.computeSelectionContext();
      if (!context.layerNames || !context.layerNames.length) {
        return;
      }
      const targets = context.layerNames;
      targets.forEach((layerName, index) => {
        this.setLayerOverride(layerName, 'isLocked', !!shouldLock, {
          reRenderSurface: index === targets.length - 1,
          reRenderTable: index === targets.length - 1,
          preserveIsolation: true
        });
      });
      this.updateSelectionToolbarUI();
    }

    handleIsolateObjectsAction() {
      const selectionSet = this.ensureSelectionSetForCurrentTab(false);
      if (!selectionSet || !selectionSet.size) {
        return;
      }
      const handles = new Set();
      selectionSet.forEach((handle) => {
        const normalized = this.normalizeHandle(handle);
        if (normalized) {
          handles.add(normalized);
        }
      });
      if (!handles.size) {
        return;
      }
      if (this.objectIsolationState && this.objectIsolationState.handles instanceof Set && this.setsAreEqual(this.objectIsolationState.handles, handles)) {
        this.clearObjectIsolation();
        return;
      }
      this.applyObjectIsolation(handles);
    }

    applyLayerIsolation(context) {
      if (!context || !context.layerKeys || !context.layerKeys.size || !this.currentLayerCatalog) {
        return;
      }
      const catalog = this.currentLayerCatalog;
      const snapshot = this.captureLayerOverridesSnapshot();
      const overrides = new Map();
      const selectedNames = new Set();
      context.layerKeys.forEach((key) => {
        if (catalog.has(key)) {
          selectedNames.add(catalog.get(key).name);
        }
      });
      catalog.forEach((base, key) => {
        if (context.layerKeys.has(key)) {
          const desired = {};
          if (!base.baseIsOn) {
            desired.isOn = true;
          }
          if (base.baseIsFrozen) {
            desired.isFrozen = false;
          }
          if (base.baseIsLocked) {
            desired.isLocked = false;
          }
          if (Object.keys(desired).length) {
            overrides.set(key, desired);
          }
        } else {
          overrides.set(key, { isOn: false });
        }
      });
      this.replaceLayerOverrides(overrides, { reRenderSurface: true, reRenderTable: true });
      const state = {
        layerKeys: Array.from(context.layerKeys),
        layerNames: Array.from(selectedNames).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        snapshot
      };
      this.layerIsolationState = state;
      if (this.currentTabId) {
        this.layerIsolationStateByTab.set(this.currentTabId, this.cloneLayerIsolationState(state));
      }
      this.updateIsolationSummary();
      this.updateSelectionToolbarUI();
    }

    clearLayerIsolation(options = {}) {
      if (!this.layerIsolationState) {
        return;
      }
      const snapshot = Array.isArray(this.layerIsolationState.snapshot) ? this.layerIsolationState.snapshot : [];
      this.applyLayerOverridesSnapshot(snapshot, {
        reRenderSurface: options.reRenderSurface !== false,
        reRenderTable: options.reRenderTable !== false
      });
      this.layerIsolationState = null;
      if (this.currentTabId) {
        this.layerIsolationStateByTab.delete(this.currentTabId);
      }
      if (!options.silent) {
        this.updateIsolationSummary();
        this.updateSelectionToolbarUI();
      }
    }

    applyObjectIsolation(handlesSet) {
      if (!this.surfaceManager || typeof this.surfaceManager.setEntityIsolation !== 'function') {
        return;
      }
      const nextHandles = handlesSet instanceof Set ? handlesSet : new Set(handlesSet || []);
      if (!nextHandles.size) {
        this.clearObjectIsolation();
        return;
      }
      this.surfaceManager.setEntityIsolation(nextHandles);
      if (this.currentSceneGraph) {
        const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
        this.surfaceManager.resume();
        this.refreshViewportOverlays(frame);
      }
      this.objectIsolationState = { handles: new Set(nextHandles) };
      if (this.currentTabId) {
        this.objectIsolationStateByTab.set(this.currentTabId, { handles: Array.from(nextHandles) });
      }
      this.updateIsolationSummary();
      this.updateSelectionToolbarUI();
    }

    clearObjectIsolation(options = {}) {
      if (this.surfaceManager && typeof this.surfaceManager.setEntityIsolation === 'function') {
        this.surfaceManager.setEntityIsolation(null);
        if (!options.skipRender && this.currentSceneGraph) {
          const frame = this.surfaceManager.renderScene(this.currentSceneGraph);
          this.surfaceManager.resume();
          this.refreshViewportOverlays(frame);
        }
      }
      this.objectIsolationState = null;
      if (this.currentTabId) {
        this.objectIsolationStateByTab.delete(this.currentTabId);
      }
      if (!options.silent) {
        this.updateIsolationSummary();
        this.updateSelectionToolbarUI();
      }
    }

    captureLayerOverridesSnapshot() {
      const snapshot = [];
      if (this.currentLayerOverrides && this.currentLayerOverrides.size) {
        this.currentLayerOverrides.forEach((value, key) => {
          snapshot.push([key, Object.assign({}, value)]);
        });
      }
      return snapshot;
    }

    applyLayerOverridesSnapshot(snapshot, options = {}) {
      const overrides = new Map();
      if (Array.isArray(snapshot)) {
        snapshot.forEach((entry) => {
          if (Array.isArray(entry) && entry.length === 2) {
            const key = entry[0];
            const value = entry[1];
            if (typeof key === 'string' && value && typeof value === 'object') {
              overrides.set(key, Object.assign({}, value));
            }
          }
        });
      }
      this.replaceLayerOverrides(overrides, options);
    }

    replaceLayerOverrides(overridesMap, options = {}) {
      const nextMap = overridesMap instanceof Map
        ? overridesMap
        : this.cloneLayerOverridesMap(overridesMap);
      this.currentLayerOverrides = nextMap;
      if (this.currentTabId) {
        this.layerOverridesByTab.set(this.currentTabId, nextMap);
      }
      if (options.reRenderTable !== false) {
        this.renderLayerManagerTable();
      }
      const shouldRenderSurface = options.reRenderSurface !== false;
      this.applyLayerStateToSurface({ reRender: shouldRenderSurface });
    }

    cloneLayerOverridesMap(source) {
      const result = new Map();
      if (!source) {
        return result;
      }
      if (source instanceof Map) {
        source.forEach((value, key) => {
          if (value && typeof value === 'object') {
            result.set(key, Object.assign({}, value));
          }
        });
        return result;
      }
      if (typeof source === 'object') {
        Object.keys(source).forEach((key) => {
          const entry = source[key];
          if (entry && typeof entry === 'object') {
            result.set(key, Object.assign({}, entry));
          }
        });
      }
      return result;
    }

    invalidateLayerIsolation(options = {}) {
      if (!this.layerIsolationState) {
        if (!options.silent) {
          this.updateIsolationSummary();
          this.updateSelectionToolbarUI();
        }
        return;
      }
      this.layerIsolationState = null;
      if (this.currentTabId) {
        this.layerIsolationStateByTab.delete(this.currentTabId);
      }
      if (!options.silent) {
        this.updateIsolationSummary();
        this.updateSelectionToolbarUI();
      }
    }

    syncIsolationStateForCurrentTab() {
      const tabId = this.currentTabId;
      if (!tabId) {
        this.layerIsolationState = null;
        this.objectIsolationState = null;
        return;
      }
      const layerState = this.layerIsolationStateByTab.get(tabId) || null;
      this.layerIsolationState = layerState ? this.cloneLayerIsolationState(layerState) : null;
      const objectState = this.objectIsolationStateByTab.get(tabId) || null;
      this.objectIsolationState = objectState ? this.cloneObjectIsolationState(objectState) : null;
    }

    cloneLayerIsolationState(state) {
      if (!state) {
        return null;
      }
      return {
        layerKeys: Array.isArray(state.layerKeys) ? state.layerKeys.slice() : [],
        layerNames: Array.isArray(state.layerNames) ? state.layerNames.slice() : [],
        snapshot: Array.isArray(state.snapshot)
          ? state.snapshot.map((entry) => {
              if (Array.isArray(entry) && entry.length === 2) {
                return [entry[0], Object.assign({}, entry[1])];
              }
              return entry;
            })
          : []
      };
    }

    cloneObjectIsolationState(state) {
      if (!state) {
        return null;
      }
      if (state.handles instanceof Set) {
        return { handles: new Set(state.handles) };
      }
      if (Array.isArray(state.handles)) {
        const normalized = new Set();
        state.handles.forEach((handle) => {
          const normalizedHandle = this.normalizeHandle(handle);
          if (normalizedHandle) {
            normalized.add(normalizedHandle);
          }
        });
        return { handles: normalized };
      }
      return { handles: new Set() };
    }

    setsAreEqual(a, b) {
      if (a === b) {
        return true;
      }
      if (!a || !b || a.size !== b.size) {
        return false;
      }
      for (const value of a) {
        if (!b.has(value)) {
          return false;
        }
      }
      return true;
    }

    getPickables() {
      if (!this.surfaceManager || !this.surfaceManager.lastFrame) {
        return [];
      }
      const frame = this.surfaceManager.lastFrame;
      if (!frame || !Array.isArray(frame.pickables)) {
        return [];
      }
      return frame.pickables;
    }

    clearInteractionOverlay() {
      if (this.marqueeElement && this.marqueeElement.parentNode) {
        this.marqueeElement.parentNode.removeChild(this.marqueeElement);
      }
      if (this.lassoSvg && this.lassoSvg.parentNode) {
        this.lassoSvg.parentNode.removeChild(this.lassoSvg);
      }
      this.marqueeElement = null;
      this.lassoSvg = null;
      this.lassoPathElement = null;
    }

    showMarquee(start, current, crossing) {
      if (!this.interactionLayer) {
        return;
      }
      if (!this.marqueeElement) {
        const div = this.createElement('div');
        div.className = 'selection-marquee';
        this.interactionLayer.appendChild(div);
        this.marqueeElement = div;
      }
      this.updateMarquee(current, crossing, start);
    }

    updateMarquee(current, crossing, startOverride) {
      if (!this.marqueeElement || !this.currentInteraction) {
        return;
      }
      const origin = startOverride || this.currentInteraction.start;
      const left = Math.min(origin.x, current.x);
      const top = Math.min(origin.y, current.y);
      const width = Math.abs(current.x - origin.x);
      const height = Math.abs(current.y - origin.y);
      this.marqueeElement.style.left = `${left}px`;
      this.marqueeElement.style.top = `${top}px`;
      this.marqueeElement.style.width = `${width}px`;
      this.marqueeElement.style.height = `${height}px`;
      if (crossing) {
        this.marqueeElement.classList.add('crossing');
      } else {
        this.marqueeElement.classList.remove('crossing');
      }
    }

    hideMarquee() {
      if (this.marqueeElement && this.marqueeElement.parentNode) {
        this.marqueeElement.parentNode.removeChild(this.marqueeElement);
      }
      this.marqueeElement = null;
    }

    showLasso(points, crossing) {
      if (!this.interactionLayer) {
        return;
      }
      if (!this.lassoSvg) {
        const svg = this.createSvgElement('svg');
        svg.setAttribute('class', 'selection-lasso');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        const path = this.createSvgElement('path');
        svg.appendChild(path);
        this.interactionLayer.appendChild(svg);
        this.lassoSvg = svg;
        this.lassoPathElement = path;
      }
      this.updateLasso(points, crossing);
    }

    updateLasso(points, crossing) {
      if (!this.lassoSvg || !this.lassoPathElement) {
        return;
      }
      const filtered = Array.isArray(points) ? points.slice() : [];
      if (!filtered.length && this.currentInteraction && Array.isArray(this.currentInteraction.path)) {
        filtered.push(...this.currentInteraction.path);
      }
      if (!filtered.length) {
        return;
      }
      const pathData = filtered.map((pt, index) => {
        const prefix = index === 0 ? 'M' : 'L';
        return `${prefix}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }).join(' ');
      const closedPath = `${pathData}${filtered.length > 2 ? ' Z' : ''}`;
      this.lassoPathElement.setAttribute('d', closedPath);
      if (crossing) {
        this.lassoSvg.classList.add('crossing');
      } else {
        this.lassoSvg.classList.remove('crossing');
      }
    }

    hideLasso() {
      if (this.lassoSvg && this.lassoSvg.parentNode) {
        this.lassoSvg.parentNode.removeChild(this.lassoSvg);
      }
      this.lassoSvg = null;
      this.lassoPathElement = null;
    }

    handlePointerDown(event) {
      if (!this.viewportEl || event.button !== 0) {
        return;
      }
      if (event.target && typeof event.target.closest === 'function') {
        if (event.target.closest('.rendering-measurement-toolbar') || event.target.closest('.rendering-selection-toolbar') || event.target.closest('.dxf-cad-status,button,input,select,a')) {
          return;
        }
        const attributeNode = event.target.closest('.rendering-text-attribute');
        if (attributeNode) {
          return;
        }
      }
      if (this.measurementMode !== 'none') {
        this.handleMeasurementPointerDown(event);
        return;
      }
      if (!this.surfaceManager || !this.surfaceManager.lastFrame) {
        return;
      }
      const point = this.getPointerPosition(event);
      this.clearInteractionOverlay();
      const interaction = {
        pointerId: event.pointerId,
        start: point,
        last: point,
        path: event.altKey ? [point] : [],
        mode: event.altKey ? 'lasso' : 'pending',
        shiftKey: !!event.shiftKey,
        ctrlKey: !!(event.ctrlKey || event.metaKey),
        metaKey: !!event.metaKey,
        altKey: !!event.altKey,
        crossing: false
      };
      this.currentInteraction = interaction;
      this.activePointerId = event.pointerId;
      if (this.viewportEl.setPointerCapture) {
        try {
          this.viewportEl.setPointerCapture(event.pointerId);
        } catch (captureErr) {
          // Ignore pointer capture errors in browsers that disallow capture here.
        }
      }
      if (interaction.mode === 'lasso') {
        this.showLasso(interaction.path, true);
      }
      event.preventDefault();
    }

    handlePointerMove(event) {
      if (this.measurementMode !== 'none') {
        this.handleMeasurementPointerMove(event);
        return;
      }
      const interaction = this.currentInteraction;
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return;
      }
      const point = this.getPointerPosition(event);
      const dx = point.x - interaction.start.x;
      const dy = point.y - interaction.start.y;
      const distanceSq = dx * dx + dy * dy;
      const thresholdSq = 16;
      if (interaction.mode === 'pending' && distanceSq > thresholdSq) {
        interaction.mode = 'marquee';
        const crossing = point.x < interaction.start.x;
        this.showMarquee(interaction.start, point, crossing);
      }
      if (interaction.mode === 'marquee') {
        interaction.crossing = point.x < interaction.start.x;
        this.updateMarquee(point, interaction.crossing, interaction.start);
      } else if (interaction.mode === 'lasso') {
        const lastPoint = interaction.path[interaction.path.length - 1];
        if (!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) >= 2) {
          interaction.path.push(point);
        }
        this.updateLasso(interaction.path, true);
      }
      interaction.last = point;
      event.preventDefault();
    }

    handlePointerUp(event) {
      if (this.measurementMode !== 'none') {
        this.handleMeasurementPointerUp(event);
        return;
      }
      const interaction = this.currentInteraction;
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return;
      }
      if (this.viewportEl.releasePointerCapture) {
        try {
          this.viewportEl.releasePointerCapture(event.pointerId);
        } catch (releaseErr) {
          // Ignore release issues.
        }
      }
      const point = this.getPointerPosition(event);
      interaction.last = point;
      if (interaction.mode === 'pending') {
        this.performSinglePick(point, interaction);
      } else if (interaction.mode === 'marquee') {
        interaction.crossing = point.x < interaction.start.x;
        const handles = this.computeRectangleSelection(
          interaction.start,
          point,
          interaction.crossing ? 'crossing' : 'window'
        );
        this.commitSelection(handles, this.resolveSelectionCommitMode(interaction));
      } else if (interaction.mode === 'lasso') {
        const path = interaction.path.slice();
        if (!path.length || path[path.length - 1] !== point) {
          path.push(point);
        }
        const handles = this.computeLassoSelection(path);
        this.commitSelection(handles, this.resolveSelectionCommitMode(interaction));
      }
      this.clearInteractionOverlay();
      this.currentInteraction = null;
      this.activePointerId = null;
      event.preventDefault();
    }

    handlePointerCancel(event) {
      if (this.measurementMode !== 'none') {
        this.handleMeasurementPointerCancel(event);
        return;
      }
      if (this.viewportEl && this.viewportEl.releasePointerCapture) {
        try {
          this.viewportEl.releasePointerCapture(event.pointerId);
        } catch (err) {
          // ignore
        }
      }
      this.clearInteractionOverlay();
      this.currentInteraction = null;
      this.activePointerId = null;
    }

    handleMeasurementPointerDown(event) {
      if (this.measurementMode === 'none') {
        return;
      }
      if (event.target && typeof event.target.closest === 'function') {
        if (event.target.closest('.rendering-measurement-toolbar') || event.target.closest('.rendering-selection-toolbar') || event.target.closest('.dxf-cad-status,button,input,select,a')) {
          return;
        }
      }
      const frame = this.surfaceManager ? this.surfaceManager.lastFrame : null;
      const screenPoint = this.getPointerPosition(event);
      if (!screenPoint) {
        return;
      }
      if (event.detail && event.detail > 1) {
        this.resetMeasurementState({ silent: true });
      }
      if (this.measurementMode === 'angle' && this.measurementState.points.length >= 3) {
        this.resetMeasurementState({ silent: true });
      }
      const snapCandidate = frame ? this.findSnapCandidate(screenPoint, frame) : null;
      let worldPoint = null;
      if (snapCandidate && snapCandidate.world) {
        worldPoint = snapCandidate.world;
        this.setActiveSnapCandidate(snapCandidate, frame, { isPreview: false });
      } else {
        worldPoint = this.screenToWorld(screenPoint, frame);
        this.clearSnapIndicator({ silent: true });
      }
      if (!worldPoint) {
        return;
      }
      this.measurementState.points.push({
        world: worldPoint,
        snap: this.createMeasurementSnap(snapCandidate)
      });
      this.measurementState.previewPoint = null;
      this.renderMeasurementOverlay(frame);
      this.updateMeasurementSummary();
      event.preventDefault();
    }

    handleMeasurementPointerMove(event) {
      if (this.measurementMode === 'none') {
        return;
      }
      if (event.target && typeof event.target.closest === 'function') {
        if (event.target.closest('.rendering-measurement-toolbar') || event.target.closest('.rendering-selection-toolbar') || event.target.closest('.dxf-cad-status,button,input,select,a')) {
          return;
        }
      }
      const frame = this.surfaceManager ? this.surfaceManager.lastFrame : null;
      const screenPoint = this.getPointerPosition(event);
      if (!screenPoint) {
        return;
      }
      const snapCandidate = frame ? this.findSnapCandidate(screenPoint, frame) : null;
      let worldPoint = null;
      if (snapCandidate && snapCandidate.world) {
        worldPoint = snapCandidate.world;
        this.setActiveSnapCandidate(snapCandidate, frame, { isPreview: true });
      } else {
        worldPoint = this.screenToWorld(screenPoint, frame);
        this.clearSnapIndicator({ silent: true });
      }
      if (!worldPoint) {
        return;
      }
      this.measurementState.previewPoint = {
        world: worldPoint,
        snap: this.createMeasurementSnap(snapCandidate)
      };
      this.renderMeasurementOverlay(frame);
      this.updateMeasurementSummary();
    }

    handleMeasurementPointerUp(event) {
      if (this.measurementMode === 'none') {
        return;
      }
      if (event && event.target && typeof event.target.closest === 'function') {
        if (event.target.closest('.rendering-measurement-toolbar')) {
          return;
        }
      }
      if (this.measurementState.previewPoint) {
        this.measurementState.previewPoint = null;
      }
      this.clearSnapIndicator({ silent: true });
      this.renderMeasurementOverlay();
      this.updateMeasurementSummary();
      if (event) {
        event.preventDefault();
      }
    }

    handleMeasurementPointerCancel() {
      if (this.measurementMode === 'none') {
        return;
      }
      if (this.measurementState.previewPoint) {
        this.measurementState.previewPoint = null;
      }
      this.clearSnapIndicator({ silent: true });
      this.renderMeasurementOverlay();
      this.updateMeasurementSummary();
    }

    getPointerPosition(event) {
      const reference = this.canvas || this.viewportEl;
      if (!reference) {
        return { x: event.clientX, y: event.clientY };
      }
      const rect = reference.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    resolveSelectionCommitMode(interaction) {
      if (!interaction) {
        return 'replace';
      }
      if (interaction.ctrlKey || interaction.metaKey) {
        return 'toggle';
      }
      if (interaction.shiftKey) {
        return 'add';
      }
      return 'replace';
    }

    performSinglePick(point, interaction) {
      const pickable = this.hitTestPickable(point);
      if (!pickable || !pickable.handle) {
        if (this.resolveSelectionCommitMode(interaction) === 'replace') {
          this.commitSelection([], 'replace');
        }
        return;
      }
      this.commitSelection([pickable.handle], this.resolveSelectionCommitMode(interaction));
    }

    handleOverlayKeyDown(event) {
      if (!event || typeof event.key !== 'string') {
        return;
      }
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'Escape') {
        if (this.measurementMode !== 'none' && (this.measurementState.points.length || this.measurementState.previewPoint)) {
          this.resetMeasurementState();
          this.renderMeasurementOverlay();
          this.updateMeasurementSummary();
          event.preventDefault();
          return;
        }
        this.close();
        event.preventDefault();
        return;
      }
      if (event.key === 'm' || event.key === 'M') {
        this.cycleMeasurementMode(event.shiftKey ? -1 : 1);
        event.preventDefault();
      }
    }

    handleMeasurementButtonClick(mode) {
      const normalized = this.normalizeMeasurementMode(mode);
      if (normalized === this.measurementMode && normalized !== 'none') {
        this.setMeasurementMode('none');
      } else {
        this.setMeasurementMode(normalized);
      }
    }

    normalizeMeasurementMode(mode) {
      const value = typeof mode === 'string' ? mode.toLowerCase() : 'none';
      if (value === 'distance' || value === 'area' || value === 'angle') {
        return value;
      }
      return 'none';
    }

    setMeasurementMode(mode) {
      const normalized = this.normalizeMeasurementMode(mode);
      if (normalized === this.measurementMode) {
        if (normalized !== 'none') {
          this.resetMeasurementState();
          this.renderMeasurementOverlay();
          this.updateMeasurementSummary();
        }
        this.updateMeasurementToolbarUI();
        return;
      }
      this.measurementMode = normalized;
      this.resetMeasurementState({ silent: true });
      this.renderMeasurementOverlay();
      this.updateMeasurementSummary();
      this.updateMeasurementToolbarUI();
    }

    cycleMeasurementMode(direction = 1) {
      const order = Array.isArray(this.measurementModeOrder) && this.measurementModeOrder.length
        ? this.measurementModeOrder
        : ['none', 'distance', 'area', 'angle'];
      const currentIndex = Math.max(0, order.indexOf(this.measurementMode));
      const step = direction >= 0 ? 1 : -1;
      let nextIndex = currentIndex + step;
      if (nextIndex < 0) {
        nextIndex = order.length - 1;
      } else if (nextIndex >= order.length) {
        nextIndex = 0;
      }
      this.setMeasurementMode(order[nextIndex] || 'none');
    }

    updateMeasurementToolbarUI() {
      if (!Array.isArray(this.measurementToolbarButtons) || !this.measurementToolbarButtons.length) {
        return;
      }
      const hasFrame = !!(this.surfaceManager && this.surfaceManager.lastFrame && !this.surfaceManager.lastFrame.isEmpty);
      this.measurementToolbarButtons.forEach((button) => {
        if (!button) {
          return;
        }
        const mode = this.normalizeMeasurementMode(button.dataset.mode);
        const isActive = mode === this.measurementMode || (mode === 'none' && this.measurementMode === 'none');
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        if (mode === 'none') {
          button.disabled = false;
        } else {
          button.disabled = !hasFrame;
        }
      });
    }

    resetMeasurementState(options = {}) {
      const silent = options && options.silent === true;
      this.measurementState.points = [];
      this.measurementState.previewPoint = null;
      this.clearSnapIndicator({ silent: true });
      if (!silent) {
        this.renderMeasurementOverlay();
        this.updateMeasurementSummary();
      }
    }

    getMeasurementStatePoints(includePreview = false) {
      const committed = Array.isArray(this.measurementState.points)
        ? this.measurementState.points.slice()
        : [];
      if (includePreview && this.measurementState.previewPoint) {
        committed.push(this.measurementState.previewPoint);
      }
      return committed;
    }

    commitSelection(handlesIterable, mode = 'replace') {
      const selectionSet = this.ensureSelectionSetForCurrentTab(true);
      const normalizedHandles = new Set();
      if (handlesIterable) {
        for (const handle of handlesIterable) {
          const normalized = this.normalizeHandle(handle);
          if (normalized) {
            normalizedHandles.add(normalized);
          }
        }
      }
      if (mode === 'replace') {
        selectionSet.clear();
        normalizedHandles.forEach((handle) => selectionSet.add(handle));
      } else if (mode === 'add') {
        normalizedHandles.forEach((handle) => selectionSet.add(handle));
      } else if (mode === 'toggle') {
        normalizedHandles.forEach((handle) => {
          if (selectionSet.has(handle)) {
            selectionSet.delete(handle);
          } else {
            selectionSet.add(handle);
          }
        });
      }
      if (mode === 'replace' && normalizedHandles.size === 0) {
        selectionSet.clear();
      }
      this.applySelectionHandles(selectionSet);
    }

    computeRectangleSelection(start, end, strategy = 'window') {
      if (!start || !end) {
        return new Set();
      }
      const rect = {
        minX: Math.min(start.x, end.x),
        minY: Math.min(start.y, end.y),
        maxX: Math.max(start.x, end.x),
        maxY: Math.max(start.y, end.y)
      };
      const pickables = this.getPickables();
      const handles = new Set();
      pickables.forEach((pickable) => {
        if (!pickable || !pickable.handle || !pickable.screenBounds) {
          return;
        }
        const bounds = pickable.screenBounds;
        const matches = strategy === 'window'
          ? this.boundsContains(rect, bounds)
          : this.boundsIntersect(rect, bounds);
        if (matches) {
          handles.add(pickable.handle);
        }
      });
      return handles;
    }

    computeLassoSelection(points) {
      if (!Array.isArray(points) || points.length < 3) {
        return new Set();
      }
      const polygon = points.map((pt) => ({ x: pt.x, y: pt.y }));
      const first = polygon[0];
      const last = polygon[polygon.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) > 1.5) {
        polygon.push({ x: first.x, y: first.y });
      }
      const pickables = this.getPickables();
      const handles = new Set();
      pickables.forEach((pickable) => {
        if (!pickable || !pickable.handle || !pickable.screenBounds) {
          return;
        }
        const bounds = pickable.screenBounds;
        const center = {
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2
        };
        if (this.pointInPolygon(center, polygon) || this.polygonIntersectsBounds(polygon, bounds)) {
          handles.add(pickable.handle);
        }
      });
      return handles;
    }

    hitTestPickable(point) {
      return this.surfaceManager?.lastFrame?.hitTest(point, 6) || null;
    }

    pointInsideBounds(point, bounds, padding = 0) {
      if (!point || !bounds) {
        return false;
      }
      return point.x >= bounds.minX - padding &&
        point.x <= bounds.maxX + padding &&
        point.y >= bounds.minY - padding &&
        point.y <= bounds.maxY + padding;
    }

    boundsContains(outer, inner) {
      if (!outer || !inner) {
        return false;
      }
      return inner.minX >= outer.minX &&
        inner.maxX <= outer.maxX &&
        inner.minY >= outer.minY &&
        inner.maxY <= outer.maxY;
    }

    boundsIntersect(a, b) {
      if (!a || !b) {
        return false;
      }
      return !(b.maxX < a.minX || b.minX > a.maxX || b.maxY < a.minY || b.minY > a.maxY);
    }

    polygonIntersectsBounds(polygon, bounds) {
      if (!Array.isArray(polygon) || polygon.length < 2 || !bounds) {
        return false;
      }
      for (let i = 0; i < polygon.length; i++) {
        if (this.pointInsideBounds(polygon[i], bounds)) {
          return true;
        }
      }
      const corners = [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
        { x: bounds.minX, y: bounds.maxY }
      ];
      for (let i = 0; i < corners.length; i++) {
        if (this.pointInPolygon(corners[i], polygon)) {
          return true;
        }
      }
      for (let i = 0; i < polygon.length - 1; i++) {
        const p1 = polygon[i];
        const p2 = polygon[i + 1];
        if (this.segmentIntersectsRect(p1, p2, bounds)) {
          return true;
        }
      }
      return false;
    }

    segmentIntersectsRect(p1, p2, rect) {
      if (!p1 || !p2 || !rect) {
        return false;
      }
      if (this.pointInsideBounds(p1, rect) || this.pointInsideBounds(p2, rect)) {
        return true;
      }
      const edges = [
        [{ x: rect.minX, y: rect.minY }, { x: rect.maxX, y: rect.minY }],
        [{ x: rect.maxX, y: rect.minY }, { x: rect.maxX, y: rect.maxY }],
        [{ x: rect.maxX, y: rect.maxY }, { x: rect.minX, y: rect.maxY }],
        [{ x: rect.minX, y: rect.maxY }, { x: rect.minX, y: rect.minY }]
      ];
      for (let i = 0; i < edges.length; i++) {
        const [q1, q2] = edges[i];
        if (this.segmentsIntersect(p1, p2, q1, q2)) {
          return true;
        }
      }
      return false;
    }

    segmentsIntersect(p1, p2, q1, q2) {
      const o1 = this.orientation(p1, p2, q1);
      const o2 = this.orientation(p1, p2, q2);
      const o3 = this.orientation(q1, q2, p1);
      const o4 = this.orientation(q1, q2, p2);
      if (o1 !== o2 && o3 !== o4) {
        return true;
      }
      if (o1 === 0 && this.onSegment(p1, q1, p2)) return true;
      if (o2 === 0 && this.onSegment(p1, q2, p2)) return true;
      if (o3 === 0 && this.onSegment(q1, p1, q2)) return true;
      if (o4 === 0 && this.onSegment(q1, p2, q2)) return true;
      return false;
    }

    orientation(a, b, c) {
      const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(value) < 1e-9) {
        return 0;
      }
      return value > 0 ? 1 : 2;
    }

    onSegment(a, b, c) {
      return b.x <= Math.max(a.x, c.x) + 1e-9 &&
        b.x + 1e-9 >= Math.min(a.x, c.x) &&
        b.y <= Math.max(a.y, c.y) + 1e-9 &&
        b.y + 1e-9 >= Math.min(a.y, c.y);
    }

    pointInPolygon(point, polygon) {
      if (!point || !Array.isArray(polygon) || polygon.length < 3) {
        return false;
      }
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const pi = polygon[i];
        const pj = polygon[j];
        const intersect = ((pi.y > point.y) !== (pj.y > point.y)) &&
          (point.x < (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y + 1e-12) + pi.x);
        if (intersect) {
          inside = !inside;
        }
      }
      return inside;
    }

    computeMeasurementReport(options = {}) {
      if (this.measurementMode === 'none') {
        return null;
      }
      const includePreview = options && options.includePreview !== false;
      const committed = Array.isArray(this.measurementState.points)
        ? this.measurementState.points.slice()
        : [];
      const active = includePreview ? this.getMeasurementStatePoints(true) : committed;
      switch (this.measurementMode) {
        case 'distance':
          return this.computeDistanceReport(committed, active);
        case 'area':
          return this.computeAreaReport(committed, active);
        case 'angle':
          return this.computeAngleReport(committed, active);
        default:
          return null;
      }
    }

    computeDistanceReport(committed, active) {
      const result = {
        mode: 'distance',
        hasData: false,
        label: 'Distance: click to start',
        detail: '',
        unitLabel: this.getLinearUnitLabel(),
        segments: [],
        totalLength: 0,
        labelWorld: null,
        hasPreview: Array.isArray(active) && Array.isArray(committed) ? active.length > committed.length : false
      };
      if (!Array.isArray(active) || active.length < 2) {
        return result;
      }
      const committedCount = Array.isArray(committed) ? committed.length : 0;
      let total = 0;
      const segments = [];
      for (let i = 1; i < active.length; i++) {
        const start = active[i - 1]?.world;
        const end = active[i]?.world;
        if (!start || !end) {
          continue;
        }
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (!Number.isFinite(length)) {
          continue;
        }
        total += length;
        segments.push({
          start,
          end,
          length,
          dx,
          dy,
          isPreview: i >= committedCount
        });
      }
      if (!segments.length) {
        result.label = active.length === 1 ? 'Distance: select second point' : 'Distance: add another point';
        return result;
      }
      result.segments = segments;
      result.totalLength = total;
      result.labelWorld = active[active.length - 1]?.world || null;
      result.hasData = true;
      const lengthText = this.formatNumber(total, { maxDigits: 6 });
      result.label = lengthText != null
        ? `Distance: ${lengthText}${result.unitLabel ? ` ${result.unitLabel}` : ''}`
        : 'Distance: —';
      const lastSegment = segments[segments.length - 1];
      if (lastSegment) {
        const parts = [];
        const segText = this.formatNumber(lastSegment.length, { maxDigits: 6 });
        if (segText != null) {
          parts.push(`Segment ${segText}${result.unitLabel ? ` ${result.unitLabel}` : ''}`);
        }
        const dxText = this.formatNumber(lastSegment.dx, { maxDigits: 6 });
        const dyText = this.formatNumber(lastSegment.dy, { maxDigits: 6 });
        if (dxText != null && dyText != null) {
          parts.push(`ΔX ${dxText}`, `ΔY ${dyText}`);
        }
        result.detail = parts.join(' · ');
      }
      return result;
    }

    computeAreaReport(committed, active) {
      const result = {
        mode: 'area',
        hasData: false,
        label: 'Area: add more points',
        detail: '',
        unitLabel: this.getLinearUnitLabel(),
        areaUnitLabel: null,
        area: 0,
        perimeter: 0,
        centroidWorld: null,
        labelWorld: null,
        hasPreview: Array.isArray(active) && Array.isArray(committed) ? active.length > committed.length : false
      };
      if (!Array.isArray(active) || active.length < 3) {
        if (!Array.isArray(active) || active.length === 0) {
          result.label = 'Area: click to start';
        } else if (active.length === 1) {
          result.label = 'Area: select second point';
        } else {
          result.label = 'Area: select third point';
        }
        return result;
      }
      const points = active.map((entry) => entry && entry.world ? entry.world : null).filter(Boolean);
      if (points.length < 3) {
        return result;
      }
      let areaAccumulator = 0;
      let centroidX = 0;
      let centroidY = 0;
      let perimeter = 0;
      for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        const cross = current.x * next.y - next.x * current.y;
        areaAccumulator += cross;
        centroidX += (current.x + next.x) * cross;
        centroidY += (current.y + next.y) * cross;
        const segmentLength = Math.hypot(next.x - current.x, next.y - current.y);
        if (Number.isFinite(segmentLength)) {
          perimeter += segmentLength;
        }
      }
      const rawArea = areaAccumulator / 2;
      const area = Math.abs(rawArea);
      let centroid;
      if (Math.abs(areaAccumulator) > 1e-9) {
        centroid = {
          x: centroidX / (3 * areaAccumulator),
          y: centroidY / (3 * areaAccumulator)
        };
      } else {
        const sum = points.reduce((acc, pt) => {
          acc.x += pt.x;
          acc.y += pt.y;
          return acc;
        }, { x: 0, y: 0 });
        centroid = {
          x: sum.x / points.length,
          y: sum.y / points.length
        };
      }
      result.area = area;
      result.perimeter = perimeter;
      result.centroidWorld = centroid;
      result.labelWorld = centroid;
      result.areaUnitLabel = this.getAreaUnitLabel(result.unitLabel);
      const areaText = this.formatNumber(area, { maxDigits: 6 });
      result.label = areaText != null
        ? `Area: ${areaText}${result.areaUnitLabel ? ` ${result.areaUnitLabel}` : ''}`
        : 'Area: —';
      const perimeterText = this.formatNumber(perimeter, { maxDigits: 6 });
      if (perimeterText != null) {
        result.detail = `Perimeter: ${perimeterText}${result.unitLabel ? ` ${result.unitLabel}` : ''}`;
      }
      result.hasData = area > 0;
      if (!result.hasData) {
        result.label = 'Area: insufficient span';
      }
      return result;
    }

    computeAngleReport(committed, active) {
      const result = {
        mode: 'angle',
        hasData: false,
        label: 'Angle: click first point',
        detail: '',
        labelWorld: null,
        arc: null,
        usesPreview: Array.isArray(active) && Array.isArray(committed) ? active.length > committed.length : false
      };
      if (!Array.isArray(committed) || committed.length === 0) {
        return result;
      }
      const base = committed[0]?.world;
      if (!base) {
        return result;
      }
      if (committed.length === 1) {
        result.label = 'Angle: select vertex';
        result.labelWorld = base;
        return result;
      }
      const vertex = committed[1]?.world;
      if (!vertex) {
        result.label = 'Angle: select vertex';
        result.labelWorld = base;
        return result;
      }
      result.labelWorld = vertex;
      const targetEntry = committed.length >= 3
        ? committed[2]
        : (Array.isArray(active) && active.length >= 3 ? active[2] : null);
      if (!targetEntry || !targetEntry.world) {
        result.label = 'Angle: select third point';
        return result;
      }
      const target = targetEntry.world;
      const v1 = { x: base.x - vertex.x, y: base.y - vertex.y };
      const v2 = { x: target.x - vertex.x, y: target.y - vertex.y };
      const len1 = Math.hypot(v1.x, v1.y);
      const len2 = Math.hypot(v2.x, v2.y);
      if (len1 < 1e-9 || len2 < 1e-9) {
        result.label = 'Angle: insufficient span';
        return result;
      }
      const dot = v1.x * v2.x + v1.y * v2.y;
      const cross = v1.x * v2.y - v1.y * v2.x;
      const angleRad = Math.atan2(Math.abs(cross), dot);
      const angleDeg = angleRad * 180 / Math.PI;
      const reflexDeg = 360 - angleDeg;
      const angleText = this.formatNumber(angleDeg, { maxDigits: 4 });
      const reflexText = this.formatNumber(reflexDeg, { maxDigits: 4 });
      result.label = angleText != null ? `Angle: ${angleText}°` : 'Angle: —';
      result.detail = reflexText != null ? `Reflex: ${reflexText}°` : '';
      const normalize = (vec, length) => ({ x: vec.x / length, y: vec.y / length });
      const nv1 = normalize(v1, len1);
      const nv2 = normalize(v2, len2);
      let bisector = { x: nv1.x + nv2.x, y: nv1.y + nv2.y };
      let bisectorMag = Math.hypot(bisector.x, bisector.y);
      if (bisectorMag < 1e-6) {
        bisector = { x: -nv1.y, y: nv1.x };
        bisectorMag = Math.hypot(bisector.x, bisector.y);
      }
      const radius = Math.min(len1, len2) * 0.45;
      if (bisectorMag > 1e-6 && radius > 0) {
        const factor = (radius * 1.3) / bisectorMag;
        result.labelWorld = {
          x: vertex.x + bisector.x * factor,
          y: vertex.y + bisector.y * factor
        };
      } else {
        result.labelWorld = vertex;
      }
      result.arc = {
        vertexWorld: vertex,
        baseWorld: base,
        targetWorld: target,
        radius,
        orientation: cross >= 0 ? 1 : -1,
        angleRad,
        usesPreview: committed.length < 3
      };
      result.hasData = true;
      return result;
    }

    getLinearUnitLabel() {
      const units = this.currentDoc && this.currentDoc.drawingProperties
        ? this.currentDoc.drawingProperties.units
        : null;
      if (units) {
        const unitLabel = this.getUnitsLabel(units.insUnits);
        if (unitLabel) {
          return unitLabel;
        }
        const measurementLabel = this.getMeasurementLabel(units.measurement);
        if (measurementLabel) {
          return measurementLabel;
        }
      }
      return 'Units';
    }

    getAreaUnitLabel(linearLabel) {
      if (!linearLabel || linearLabel === 'Units') {
        return 'Units²';
      }
      if (linearLabel.endsWith('²')) {
        return linearLabel;
      }
      return `${linearLabel}²`;
    }

    getMeasurementModeLabel(mode) {
      switch (mode) {
        case 'distance':
          return 'Distance';
        case 'area':
          return 'Area';
        case 'angle':
          return 'Angle';
        default:
          return 'Measurement';
      }
    }

    renderMeasurementOverlay(frameOverride) {
      if (!this.measurementLayer) {
        return;
      }
      this.measurementLayer.textContent = '';
      if (this.measurementMode === 'none') {
        this.clearSnapIndicator({ silent: true });
        return;
      }
      const frame = frameOverride || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      if (!frame) {
        this.clearSnapIndicator({ silent: true });
        return;
      }
      const committedCount = Array.isArray(this.measurementState.points) ? this.measurementState.points.length : 0;
      const screenPoints = [];
      if (committedCount) {
        this.measurementState.points.forEach((entry) => {
          if (!entry || !entry.world) {
            return;
          }
          const screen = this.worldToScreen(entry.world, frame);
          if (screen) {
            screenPoints.push({
              world: entry.world,
              screen,
              isPreview: false,
              snap: entry.snap || null
            });
          }
        });
      }
      if (this.measurementState.previewPoint) {
        const previewScreen = this.worldToScreen(this.measurementState.previewPoint.world, frame);
        if (previewScreen) {
          screenPoints.push({
            world: this.measurementState.previewPoint.world,
            screen: previewScreen,
            isPreview: true,
            snap: this.measurementState.previewPoint.snap || null
          });
        }
      }
      if (!screenPoints.length) {
        this.renderSnapOverlay(frame);
        return;
      }
      let width = Number.isFinite(frame.width) ? frame.width : null;
      let height = Number.isFinite(frame.height) ? frame.height : null;
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        const rect = this.viewportEl ? this.viewportEl.getBoundingClientRect() : null;
        if (rect) {
          width = rect.width;
          height = rect.height;
        }
      }
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return;
      }
      const svg = this.createSvgElement('svg');
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      this.measurementLayer.appendChild(svg);
      const report = this.computeMeasurementReport({ includePreview: true });
      switch (this.measurementMode) {
        case 'distance':
          this.drawDistanceOverlay(svg, screenPoints, committedCount);
          break;
        case 'area':
          this.drawAreaOverlay(svg, screenPoints, committedCount);
          break;
        case 'angle':
          this.drawAngleOverlay(svg, screenPoints, committedCount, report, frame);
          break;
        default:
          break;
      }
      this.drawMeasurementNodes(svg, screenPoints);
      if (report && report.label) {
        let anchorScreen = null;
        if (report.labelWorld) {
          anchorScreen = this.worldToScreen(report.labelWorld, frame);
        }
        if (!anchorScreen && screenPoints.length) {
          const lastPoint = screenPoints[screenPoints.length - 1];
          anchorScreen = { x: lastPoint.screen.x, y: lastPoint.screen.y };
        }
        anchorScreen = this.clampScreenPoint(anchorScreen, width, height, 18);
        if (anchorScreen) {
          const labelEl = this.createElement('div');
          labelEl.className = 'measurement-label';
          labelEl.textContent = report.label;
          if (report.detail) {
            const detailSpan = this.createElement('span');
            detailSpan.className = 'secondary';
            detailSpan.textContent = report.detail;
            labelEl.appendChild(detailSpan);
          }
          labelEl.style.left = `${anchorScreen.x.toFixed(2)}px`;
          labelEl.style.top = `${anchorScreen.y.toFixed(2)}px`;
          this.measurementLayer.appendChild(labelEl);
        }
      }
      this.renderSnapOverlay(frame);
    }

    drawDistanceOverlay(svg, points, committedCount) {
      if (!svg || !Array.isArray(points)) {
        return;
      }
      if (points.length < 2 && committedCount === 0) {
        return;
      }
      const ns = 'http://www.w3.org/2000/svg';
      if (committedCount >= 2) {
        const pathData = this.buildSvgPathFromMeasurementPoints(points.slice(0, committedCount));
        if (pathData) {
          const path = this.createSvgElement('path');
          path.setAttribute('class', 'measurement-segment');
          path.setAttribute('d', pathData);
          svg.appendChild(path);
        }
      }
      if (points.length > committedCount && committedCount >= 1) {
        const previewData = this.buildSvgPathFromMeasurementPoints([
          points[committedCount - 1],
          points[committedCount]
        ]);
        if (previewData) {
          const previewPath = this.createSvgElement('path');
          previewPath.setAttribute('class', 'measurement-segment measurement-preview');
          previewPath.setAttribute('d', previewData);
          svg.appendChild(previewPath);
        }
      }
    }

    drawAreaOverlay(svg, points, committedCount) {
      if (!svg || !Array.isArray(points) || !points.length) {
        return;
      }
      const ns = 'http://www.w3.org/2000/svg';
      if (points.length >= 3) {
        const polygonPoints = points
          .map((pt) => pt && pt.screen ? `${pt.screen.x.toFixed(2)},${pt.screen.y.toFixed(2)}` : null)
          .filter(Boolean)
          .join(' ');
        if (polygonPoints) {
          const polygon = this.createSvgElement('polygon');
          polygon.setAttribute('class', 'measurement-area-fill');
          polygon.setAttribute('points', polygonPoints);
          svg.appendChild(polygon);
        }
      }
      if (committedCount >= 2) {
        const outlineData = this.buildSvgPathFromMeasurementPoints(
          points.slice(0, committedCount),
          { close: committedCount >= 3 }
        );
        if (outlineData) {
          const outline = this.createSvgElement('path');
          outline.setAttribute('class', 'measurement-area-outline');
          outline.setAttribute('d', outlineData);
          svg.appendChild(outline);
        }
      }
      if (points.length > committedCount && committedCount >= 1) {
        const tailData = this.buildSvgPathFromMeasurementPoints([
          points[committedCount - 1],
          points[committedCount]
        ]);
        if (tailData) {
          const tail = this.createSvgElement('path');
          tail.setAttribute('class', 'measurement-area-outline measurement-preview');
          tail.setAttribute('d', tailData);
          svg.appendChild(tail);
        }
        if (committedCount >= 2) {
          const closureData = this.buildSvgPathFromMeasurementPoints([
            points[committedCount],
            points[0]
          ]);
          if (closureData) {
            const closure = this.createSvgElement('path');
            closure.setAttribute('class', 'measurement-area-outline measurement-preview');
            closure.setAttribute('d', closureData);
            svg.appendChild(closure);
          }
        }
      }
    }

    drawAngleOverlay(svg, points, committedCount, report, frame) {
      if (!svg || !Array.isArray(points) || points.length < 2) {
        return;
      }
      const ns = 'http://www.w3.org/2000/svg';
      if (committedCount >= 2 && points.length >= 2) {
        const leg1 = this.buildSvgPathFromMeasurementPoints(points.slice(0, 2));
        if (leg1) {
          const legPath = this.createSvgElement('path');
          legPath.setAttribute('class', 'measurement-angle-segment');
          legPath.setAttribute('d', leg1);
          svg.appendChild(legPath);
        }
      }
      const hasPreview = points.length > committedCount;
      if (committedCount >= 3 || (committedCount >= 2 && hasPreview)) {
        const targetPoint = committedCount >= 3 ? points[2] : points[committedCount];
        if (targetPoint) {
          const leg2 = this.buildSvgPathFromMeasurementPoints([
            points[1],
            targetPoint
          ]);
          if (leg2) {
            const classes = ['measurement-angle-segment'];
            if (targetPoint.isPreview) {
              classes.push('measurement-preview');
            }
            const legPath = this.createSvgElement('path');
            legPath.setAttribute('class', classes.join(' '));
            legPath.setAttribute('d', leg2);
            svg.appendChild(legPath);
          }
        }
      }
      if (report && report.arc) {
        const arcPathData = this.buildAngleArcPath(report.arc, frame);
        if (arcPathData) {
          const classes = ['measurement-angle-arc'];
          if (report.arc.usesPreview) {
            classes.push('measurement-preview');
          }
          const arcPath = this.createSvgElement('path');
          arcPath.setAttribute('class', classes.join(' '));
          arcPath.setAttribute('d', arcPathData);
          svg.appendChild(arcPath);
        }
      }
    }

    drawMeasurementNodes(svg, points) {
      if (!svg || !Array.isArray(points)) {
        return;
      }
      const ns = 'http://www.w3.org/2000/svg';
      points.forEach((pt) => {
        if (!pt || !pt.screen) {
          return;
        }
        const circle = this.createSvgElement('circle');
        const classes = ['measurement-node'];
        if (pt.snap && pt.snap.type) {
          classes.push('snap');
          classes.push(`snap-${pt.snap.type}`);
        }
        if (pt.isPreview) {
          classes.push('preview');
        }
        circle.setAttribute('class', classes.join(' '));
        circle.setAttribute('cx', pt.screen.x.toFixed(2));
        circle.setAttribute('cy', pt.screen.y.toFixed(2));
        circle.setAttribute('r', '4');
        svg.appendChild(circle);
      });
    }

    createMeasurementSnap(candidate) {
      if (!candidate || !candidate.type) {
        return null;
      }
      return {
        type: this.normalizeSnapType(candidate.type),
        label: candidate.label || this.getSnapTypeLabel(candidate.type),
        sourceHandle: candidate.sourceHandle || null
      };
    }

    normalizeSnapType(type) {
      if (!type) {
        return null;
      }
      return String(type).trim().toLowerCase();
    }

    getSnapTypeLabel(type) {
      const normalized = this.normalizeSnapType(type);
      switch (normalized) {
        case 'endpoint':
          return 'ENDPOINT';
        case 'midpoint':
          return 'MIDPOINT';
        case 'center':
          return 'CENTER';
        case 'node':
          return 'NODE';
        default:
          return normalized ? normalized.toUpperCase() : 'SNAP';
      }
    }

    getSnapPriority(type) {
      const normalized = this.normalizeSnapType(type);
      switch (normalized) {
        case 'endpoint':
          return 0;
        case 'midpoint':
          return 1;
        case 'center':
          return 2;
        case 'node':
          return 3;
        default:
          return 4;
      }
    }

    setActiveSnapCandidate(candidate, frame, options = {}) {
      if (!candidate || !candidate.world) {
        this.clearSnapIndicator({ silent: options && options.silent === true });
        return;
      }
      const type = this.normalizeSnapType(candidate.type);
      this.snapState.active = true;
      this.snapState.type = type;
      this.snapState.label = candidate.label || this.getSnapTypeLabel(type);
      this.snapState.world = candidate.world;
      this.snapState.screen = candidate.screen || null;
      this.snapState.sourceHandle = candidate.sourceHandle || null;
      this.snapState.isPreview = !!options.isPreview;
      this.snapState.layer = candidate.layer || null;
      if (frame) {
        this.renderSnapOverlay(frame);
      }
    }

    clearSnapIndicator(options = {}) {
      if (!this.snapState) {
        return;
      }
      this.snapState.active = false;
      this.snapState.type = null;
      this.snapState.label = null;
      this.snapState.world = null;
      this.snapState.screen = null;
      this.snapState.sourceHandle = null;
      this.snapState.layer = null;
      this.snapState.isPreview = false;
      if (this.snapMarkerEl) {
        this.snapMarkerEl.style.display = 'none';
      }
      if (!options || options.silent !== true) {
        this.renderSnapOverlay();
      }
    }

    ensureSnapMarkerElement() {
      if (!this.snapLayer) {
        return null;
      }
      if (this.snapMarkerEl && this.snapMarkerEl.parentNode === this.snapLayer) {
        return this.snapMarkerEl;
      }
      const marker = this.createElement('div');
      marker.className = 'snap-marker';
      const glyph = this.createElement('div');
      glyph.className = 'snap-glyph';
      const label = this.createElement('div');
      label.className = 'snap-label';
      marker.appendChild(glyph);
      marker.appendChild(label);
      marker.style.display = 'none';
      this.snapLayer.appendChild(marker);
      this.snapMarkerEl = marker;
      this.snapMarkerLabelEl = label;
      return marker;
    }

    renderSnapOverlay(frameOverride) {
      if (!this.snapLayer) {
        return;
      }
      const frame = frameOverride || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      if (!this.snapState || !this.snapState.active || !this.snapState.world || !frame) {
        if (this.snapMarkerEl) {
          this.snapMarkerEl.style.display = 'none';
        }
        return;
      }
      const marker = this.ensureSnapMarkerElement();
      if (!marker) {
        return;
      }
      const screen = this.worldToScreen(this.snapState.world, frame);
      if (!screen) {
        marker.style.display = 'none';
        return;
      }
      this.snapState.screen = screen;
      marker.style.display = 'flex';
      marker.style.left = `${screen.x.toFixed(2)}px`;
      marker.style.top = `${screen.y.toFixed(2)}px`;
      const typeClass = this.snapState.type ? `snap-${this.snapState.type}` : 'snap-generic';
      marker.className = `snap-marker ${typeClass}`;
      if (this.snapMarkerLabelEl) {
        this.snapMarkerLabelEl.textContent = this.snapState.label || this.getSnapTypeLabel(this.snapState.type);
      }
    }

    findSnapCandidate(screenPoint, frame, options = {}) {
      if (this.surfaceManager?.snapEnabled === false) return null;
      const hit = frame?.snap(screenPoint, options.thresholdPixels || 14);
      return hit ? { world: hit.point, screen: hit.screenPoint, type: hit.type, handle: hit.handle, priority: 0, distance: hit.distance } : null;
    }

    getSnapCandidates(frame) {
      if (!frame) {
        this.snapCandidatesCache = null;
        return [];
      }
      if (this.snapCandidatesCache && this.snapCandidatesCache.frame === frame) {
        return this.snapCandidatesCache.candidates;
      }
      const candidates = this.computeSnapCandidates(frame);
      this.snapCandidatesCache = { frame, candidates };
      return candidates;
    }

    computeSnapCandidates(frame) {
      const pickables = Array.isArray(frame && frame.pickables) ? frame.pickables : [];
      if (!pickables.length) {
        return [];
      }
      const candidates = [];
      const seen = new Map();
      const addCandidate = (type, world, pickable) => {
        if (!world || typeof world.x !== 'number' || typeof world.y !== 'number') {
          return;
        }
        const screen = this.worldToScreen(world, frame);
        if (!screen) {
          return;
        }
        const normalizedType = this.normalizeSnapType(type) || 'snap';
        const key = `${normalizedType}|${world.x.toFixed(6)}|${world.y.toFixed(6)}`;
        if (seen.has(key)) {
          return;
        }
        const candidate = {
          type: normalizedType,
          world,
          screen,
          sourceHandle: pickable && pickable.handle ? this.normalizeHandle(pickable.handle) : null,
          layer: pickable && pickable.layer ? pickable.layer : null,
          priority: this.getSnapPriority(normalizedType),
          label: this.getSnapTypeLabel(normalizedType)
        };
        seen.set(key, candidate);
        candidates.push(candidate);
      };
      pickables.forEach((pickable) => this.collectSnapCandidatesForPickable(pickable, frame, addCandidate));
      return candidates;
    }

    collectSnapCandidatesForPickable(pickable, frame, addCandidate) {
      if (!pickable || typeof addCandidate !== 'function') {
        return;
      }
      const type = (pickable.type || '').toUpperCase();
      if (type === 'HATCH' || type === 'SOLID') {
        return;
      }
      const points = this.normalizePickableWorldPoints(pickable);
      if (type === 'POINT') {
        if (points.length) {
          addCandidate('node', points[0], pickable);
        }
        return;
      }
      if (type === 'CIRCLE') {
        const center = this.estimateCircularCenter(points);
        if (center) {
          addCandidate('center', center, pickable);
        }
        return;
      }
      if (type === 'ARC') {
        if (points.length >= 1) {
          addCandidate('endpoint', points[0], pickable);
        }
        if (points.length >= 2) {
          const endPoint = points[points.length - 1];
          if (!this.pointsApproximatelyEqual(endPoint, points[0])) {
            addCandidate('endpoint', endPoint, pickable);
          }
        }
        if (points.length >= 3) {
          const midPoint = points[Math.floor(points.length / 2)];
          addCandidate('midpoint', midPoint, pickable);
        }
        const center = this.estimateCircularCenter(points);
        if (center) {
          addCandidate('center', center, pickable);
        }
        return;
      }
      const isClosed = !!pickable.isClosed;
      if (!points.length) {
        return;
      }
      if (!isClosed) {
        addCandidate('endpoint', points[0], pickable);
        if (points.length > 1) {
          addCandidate('endpoint', points[points.length - 1], pickable);
        }
      }
      points.forEach((pt) => addCandidate('node', pt, pickable));
      for (let i = 0; i < points.length - 1; i++) {
        const midpoint = this.computeSegmentMidpoint(points[i], points[i + 1]);
        if (midpoint) {
          addCandidate('midpoint', midpoint, pickable);
        }
      }
      if (isClosed && points.length > 2) {
        const closingMidpoint = this.computeSegmentMidpoint(points[points.length - 1], points[0]);
        if (closingMidpoint) {
          addCandidate('midpoint', closingMidpoint, pickable);
        }
      }
    }

    normalizePickableWorldPoints(pickable) {
      if (!pickable || !Array.isArray(pickable.worldPoints)) {
        return [];
      }
      const isClosed = !!pickable.isClosed;
      const normalized = [];
      let last = null;
      pickable.worldPoints.forEach((point) => {
        if (!point) {
          return;
        }
        const x = Number.isFinite(point.x) ? point.x : null;
        const y = Number.isFinite(point.y) ? point.y : null;
        if (x === null || y === null) {
          return;
        }
        const current = { x, y };
        if (last && this.pointsApproximatelyEqual(current, last)) {
          return;
        }
        normalized.push(current);
        last = current;
      });
      if (isClosed && normalized.length >= 2) {
        const first = normalized[0];
        const lastPoint = normalized[normalized.length - 1];
        if (this.pointsApproximatelyEqual(first, lastPoint)) {
          normalized.pop();
        }
      }
      return normalized;
    }

    pointsApproximatelyEqual(a, b, epsilon = 1e-6) {
      if (!a || !b) {
        return false;
      }
      return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
    }

    computeSegmentMidpoint(start, end) {
      if (!start || !end || this.pointsApproximatelyEqual(start, end)) {
        return null;
      }
      return {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2
      };
    }

    estimateCircularCenter(points) {
      if (!Array.isArray(points) || points.length < 3) {
        return null;
      }
      let a = null;
      let b = null;
      let c = null;
      for (let i = 0; i < points.length; i++) {
        const candidate = points[i];
        if (!candidate) {
          continue;
        }
        if (!a) {
          a = candidate;
          continue;
        }
        if (!b && !this.pointsApproximatelyEqual(candidate, a)) {
          b = candidate;
          continue;
        }
        if (!this.pointsApproximatelyEqual(candidate, a) && !this.pointsApproximatelyEqual(candidate, b)) {
          const area = Math.abs((b.x - a.x) * (candidate.y - a.y) - (b.y - a.y) * (candidate.x - a.x));
          if (area > 1e-6) {
            c = candidate;
            break;
          }
        }
      }
      if (!a || !b || !c) {
        return null;
      }
      const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
      if (Math.abs(d) < 1e-9) {
        return null;
      }
      const ux = ((a.x * a.x + a.y * a.y) * (b.y - c.y) +
        (b.x * b.x + b.y * b.y) * (c.y - a.y) +
        (c.x * c.x + c.y * c.y) * (a.y - b.y)) / d;
      const uy = ((a.x * a.x + a.y * a.y) * (c.x - b.x) +
        (b.x * b.x + b.y * b.y) * (a.x - c.x) +
        (c.x * c.x + c.y * c.y) * (b.x - a.x)) / d;
      if (!Number.isFinite(ux) || !Number.isFinite(uy)) {
        return null;
      }
      return { x: ux, y: uy };
    }

    buildSvgPathFromMeasurementPoints(points, options = {}) {
      if (!Array.isArray(points) || !points.length) {
        return null;
      }
      const screens = points
        .map((pt) => pt && pt.screen ? { x: pt.screen.x, y: pt.screen.y } : null)
        .filter(Boolean);
      return this.buildSvgPathFromScreens(screens, options && options.close === true);
    }

    buildSvgPathFromScreens(points, closePath = false) {
      if (!Array.isArray(points) || !points.length) {
        return null;
      }
      const commands = [];
      points.forEach((pt, index) => {
        if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
          return;
        }
        commands.push(`${index === 0 ? 'M' : 'L'}${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`);
      });
      if (!commands.length) {
        return null;
      }
      if (closePath) {
        commands.push('Z');
      }
      return commands.join(' ');
    }

    buildAngleArcPath(arc, frame) {
      if (!arc || !frame || !Number.isFinite(arc.radius) || arc.radius <= 0) {
        return null;
      }
      const startAngle = Math.atan2(arc.baseWorld.y - arc.vertexWorld.y, arc.baseWorld.x - arc.vertexWorld.x);
      let delta = Number.isFinite(arc.angleRad) ? arc.angleRad : 0;
      if (delta <= 0) {
        return null;
      }
      if (arc.orientation < 0) {
        delta = -delta;
      }
      const steps = Math.max(12, Math.round(Math.abs(delta) * 180 / Math.PI / 6));
      const pathPoints = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const theta = startAngle + delta * t;
        const worldPoint = {
          x: arc.vertexWorld.x + Math.cos(theta) * arc.radius,
          y: arc.vertexWorld.y + Math.sin(theta) * arc.radius
        };
        const screen = this.worldToScreen(worldPoint, frame);
        if (screen) {
          pathPoints.push(screen);
        }
      }
      return this.buildSvgPathFromScreens(pathPoints, false);
    }

    clampScreenPoint(point, width, height, padding = 12) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return null;
      }
      const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
      const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;
      return {
        x: Math.min(Math.max(point.x, padding), safeWidth - padding),
        y: Math.min(Math.max(point.y, padding), safeHeight - padding)
      };
    }

    screenToWorld(point, frameOverride) {
      return (frameOverride || this.surfaceManager?.lastFrame)?.screenToWorld(point) || null;
    }

    worldToScreen(world, frameOverride) {
      return (frameOverride || this.surfaceManager?.lastFrame)?.worldToScreen(world) || null;
    }

    ensureMeasurementSummaryElement() {
      if (!this.summaryContainer) {
        this.measurementSummaryEl = null;
        return null;
      }
      if (this.measurementSummaryEl && this.measurementSummaryEl.parentNode === this.summaryContainer) {
        return this.measurementSummaryEl;
      }
      let element = this.summaryContainer.querySelector('.rendering-measurement-summary');
      if (!element) {
        element = this.createElement('div');
        element.className = 'rendering-measurement-summary empty';
        element.textContent = 'Measurement: inactive';
        this.summaryContainer.appendChild(element);
      }
      this.measurementSummaryEl = element;
      return element;
    }

    updateMeasurementSummary() {
      if (!this.summaryContainer) {
        this.measurementSummaryEl = null;
        return;
      }
      const summaryEl = this.ensureMeasurementSummaryElement();
      if (!summaryEl) {
        return;
      }
      if (this.measurementMode === 'none') {
        summaryEl.textContent = 'Measurement: selection only';
        summaryEl.classList.add('empty');
        return;
      }
      const report = this.computeMeasurementReport({ includePreview: true });
      if (!report) {
        summaryEl.textContent = `${this.getMeasurementModeLabel(this.measurementMode)} measurement`;
        summaryEl.classList.add('empty');
        return;
      }
      let text = report.label || `${this.getMeasurementModeLabel(this.measurementMode)} measurement`;
      if (report.detail) {
        text += ` (${report.detail})`;
      }
      summaryEl.textContent = text;
      if (report.hasData) {
        summaryEl.classList.remove('empty');
      } else {
        summaryEl.classList.add('empty');
      }
    }

    getVisualStylePresetList() {
      if (namespace.RenderingSurfaceManager &&
        typeof namespace.RenderingSurfaceManager.getVisualStylePresets === 'function') {
        return namespace.RenderingSurfaceManager.getVisualStylePresets();
      }
      return [
        { id: 'wireframe', label: 'Wireframe' },
        { id: 'hidden', label: 'Hidden' },
        { id: 'shaded', label: 'Shaded' },
        { id: 'realistic', label: 'Realistic' },
        { id: 'conceptual', label: 'Conceptual' }
      ];
    }

    normalizeVisualStyleSpecifierValue(value) {
      if (value == null) {
        return '';
      }
      return String(value).trim().toLowerCase();
    }

    extractDocumentVisualStyles(sceneGraph) {
      if (!sceneGraph || !sceneGraph.tables || !sceneGraph.tables.visualStyles) {
        return [];
      }
      const entries = [];
      const seen = new Set();
      const styles = sceneGraph.tables.visualStyles || {};
      Object.keys(styles).forEach((key) => {
        const entry = styles[key];
        if (!entry || typeof entry !== 'object') {
          return;
        }
        const handle = entry.handleUpper || entry.handle || null;
        const name = entry.name || key || '';
        const specifier = handle || name;
        if (!specifier) {
          return;
        }
        const normalized = this.normalizeVisualStyleSpecifierValue(specifier);
        if (seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        const value = handle ? `handle:${handle}` : `name:${name}`;
        const labelBase = name || (handle ? `Handle ${handle}` : specifier);
        const label = `${labelBase} (Drawing)`;
        const title = handle ? `Handle ${handle}` : '';
        entries.push({
          value,
          label,
          title,
          specifier,
          normalizedSpecifier: normalized
        });
      });
      entries.sort((a, b) => a.label.localeCompare(b.label));
      return entries;
    }

    populateVisualStyleOptions(sceneGraph) {
      if (!this.visualStyleSelect) {
        return;
      }
      const select = this.visualStyleSelect;
      const previousValue = select.value;
      select.innerHTML = '';
      this.visualStyleOptionToSpecifier = new Map();
      this.visualStyleSpecifierToOption = new Map();

      const autoOption = this.createElement('option');
      autoOption.value = '__auto__';
      autoOption.textContent = 'Drawing default';
      select.appendChild(autoOption);
      this.visualStyleAutoOption = autoOption;
      this.visualStyleOptionToSpecifier.set('__auto__', null);
      this.visualStyleSpecifierToOption.set('__auto__', '__auto__');

      const presets = this.getVisualStylePresetList();
      if (presets.length) {
        const group = this.createElement('optgroup');
        group.label = 'Preset styles';
        presets.forEach((preset) => {
          const option = this.createElement('option');
          option.value = `preset:${preset.id}`;
          option.textContent = preset.label;
          group.appendChild(option);
          const normalized = this.normalizeVisualStyleSpecifierValue(preset.id);
          this.visualStyleOptionToSpecifier.set(option.value, preset.id);
          this.visualStyleSpecifierToOption.set(normalized, option.value);
        });
        select.appendChild(group);
      }

      const docStyles = this.extractDocumentVisualStyles(sceneGraph);
      if (docStyles.length) {
        const group = this.createElement('optgroup');
        group.label = 'Drawing styles';
        docStyles.forEach((entry) => {
          const option = this.createElement('option');
          option.value = entry.value;
          option.textContent = entry.label;
          if (entry.title) {
            option.title = entry.title;
          }
          group.appendChild(option);
          this.visualStyleOptionToSpecifier.set(option.value, entry.specifier);
          this.visualStyleSpecifierToOption.set(entry.normalizedSpecifier, option.value);
        });
        select.appendChild(group);
      }

      if (previousValue && Array.from(select.options).some((opt) => opt.value === previousValue)) {
        select.value = previousValue;
      } else {
        select.value = '__auto__';
      }
      select.disabled = select.options.length <= 1;
    }

    getOptionValueForSpecifier(specifier) {
      if (!specifier) {
        return '__auto__';
      }
      const normalized = this.normalizeVisualStyleSpecifierValue(specifier);
      if (this.visualStyleSpecifierToOption && this.visualStyleSpecifierToOption.has(normalized)) {
        return this.visualStyleSpecifierToOption.get(normalized);
      }
      return null;
    }

    getSpecifierForOption(optionValue) {
      if (!optionValue || optionValue === '__auto__') {
        return null;
      }
      if (this.visualStyleOptionToSpecifier && this.visualStyleOptionToSpecifier.has(optionValue)) {
        return this.visualStyleOptionToSpecifier.get(optionValue);
      }
      if (optionValue.startsWith('preset:')) {
        return optionValue.slice(7);
      }
      if (optionValue.startsWith('handle:')) {
        return optionValue.slice(7);
      }
      if (optionValue.startsWith('name:')) {
        return optionValue.slice(5);
      }
      if (optionValue.startsWith('dynamic:')) {
        return optionValue.slice(8);
      }
      return optionValue;
    }

    updateVisualStyleSelect(frame) {
      if (!this.visualStyleSelect) {
        return;
      }
      const select = this.visualStyleSelect;
      const targetFrame = frame || (this.surfaceManager ? this.surfaceManager.lastFrame : null);
      const override = this.surfaceManager && typeof this.surfaceManager.getVisualStyleOverride === 'function'
        ? this.surfaceManager.getVisualStyleOverride()
        : null;
      const overrideValue = override && typeof override.value === 'string' && override.value.trim()
        ? override.value.trim()
        : null;

      Array.from(select.options).forEach((option) => {
        if (option.dataset && option.dataset.dynamic === 'true') {
          option.remove();
        }
      });

      let desiredOption = this.getOptionValueForSpecifier(overrideValue);
      if (!desiredOption && overrideValue) {
        desiredOption = `dynamic:${overrideValue}`;
        const dynamicOption = this.createElement('option');
        dynamicOption.value = desiredOption;
        dynamicOption.textContent = overrideValue;
        dynamicOption.dataset.dynamic = 'true';
        select.appendChild(dynamicOption);
        this.visualStyleOptionToSpecifier.set(desiredOption, overrideValue);
      }

      const resolvedValue = desiredOption || '__auto__';
      if ([...select.options].some((opt) => opt.value === resolvedValue)) {
        select.value = resolvedValue;
      } else {
        select.value = '__auto__';
      }

      if (this.visualStyleAutoOption) {
        const descriptor = targetFrame && targetFrame.visualStyle ? targetFrame.visualStyle : null;
        const styleLabel = descriptor
          ? (descriptor.name || (descriptor.category
            ? descriptor.category.charAt(0).toUpperCase() + descriptor.category.slice(1)
            : ''))
          : '';
        this.visualStyleAutoOption.textContent = styleLabel
          ? `Drawing default (${styleLabel})`
          : 'Drawing default';
      }
      select.disabled = select.options.length <= 1;
    }

    handleVisualStyleSelectionChange(optionValue) {
      if (!this.surfaceManager) {
        return;
      }
      const specifier = this.getSpecifierForOption(optionValue);
      this.surfaceManager.setVisualStyle(specifier);
      const activeView = this.getActiveViewState() || { mode: 'auto' };
      this.renderCurrentFrameWithView(activeView);
    }

    refreshViewportOverlays(frame) {
      this.updateVisualStyleSelect(frame);
      this.updateTextLayer(frame);
      this.renderMeasurementOverlay(frame);
      this.renderSnapOverlay(frame);
      this.updateMeasurementSummary();
    }

    updateTextLayer(frame) {
      // Glyphs, shaping, SHX strokes and text masks are rendered by native Skia.
      // This retained DOM layer is intentionally empty: no parallel SVG text renderer.
      this.textLayer?.replaceChildren();
    }

    handleAttributeInteraction(interaction) {
      if (!interaction) {
        return;
      }
      const targetHandle = interaction.handle || interaction.ownerHandle || interaction.insertHandle || null;
      if (targetHandle) {
        this.callAdapter('handleLinkToHandle', targetHandle);
        return;
      }
      if (interaction.blockName) {
        this.callAdapter('toggleBlockHighlight', interaction.blockName);
      }
    }
  }

  namespace.RenderingOverlayController = RenderingOverlayController;

  return {
    RenderingOverlayController
  };
}));


// packages/dxf-compare/index.js
/* Render-space DXF comparison. No source mutation, DOM, GPU or native allocations.
 * A factory keeps the host's DxfSkia types/resources in the same module realm. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.DxfCompare = factory(root.DxfSkia);
})(globalThis, function createDxfCompare(A) {
    'use strict';
    if (!A?.SceneCompiler) throw new TypeError('A DxfSkia API is required.');
    const G = A.geometry;
    const defaults = Object.freeze({ precision: 6, properties: 127, text: true, hatch: true,
        showCurrent: true, showReference: true, showCommon: true, clouds: true,
        cloudMode: 'local', margin: 1, currentFirst: false, commonOpacity: .65,
        currentColor: '#5ce080', referenceColor: '#ff6678', commonColor: '#a8b5c8', cloudColor: '#ffd166',
        maxObjects: 500000, maxSignatureBytes: 64 * 1024 * 1024 });
    const propBits = Object.freeze({ color: 1, layer: 2, linetype: 4, linetypeScale: 8, lineweight: 16, transparency: 32, thickness: 64 });
    const key = s => String(s ?? '').trim().toUpperCase();
    function options(value = {}) {
        const o = { ...defaults, ...value };
        if (!Number.isInteger(o.precision) || o.precision < 0 || o.precision > 14) throw new RangeError('Precision must be 0–14 decimal places.');
        if (!Number.isInteger(o.properties) || o.properties < 0 || o.properties > 127) throw new RangeError('Property mask must be 0–127.');
        if (!Number.isFinite(o.margin) || o.margin < 0 || o.margin > 1e12) throw new RangeError('Cloud margin must be 0–1e12 drawing units.');
        if (!Number.isFinite(o.commonOpacity) || o.commonOpacity < 0 || o.commonOpacity > 1) throw new RangeError('Common opacity must be 0–1.');
        if (!['local', 'combined'].includes(o.cloudMode)) throw new RangeError('Cloud mode must be local or combined.');
        for (const n of ['maxObjects', 'maxSignatureBytes']) if (!Number.isSafeInteger(o[n]) || o[n] < 1) throw new RangeError('Invalid comparison budget: ' + n);
        for (const n of ['currentColor', 'referenceColor', 'commonColor', 'cloudColor']) if (!/^#[0-9a-f]{6}$/i.test(o[n])) throw new TypeError('Colors must be six-digit hexadecimal values.');
        for (const n of ['text', 'hatch', 'showCurrent', 'showReference', 'showCommon', 'clouds', 'currentFirst']) if (typeof o[n] !== 'boolean') throw new TypeError(n + ' must be boolean.');
        return o;
    }
    function canonical(value, precision) {
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) throw new RangeError('Nonfinite comparison geometry.');
            return Number(value.toFixed(precision));
        }
        if (Array.isArray(value)) return value.map(v => canonical(v, precision));
        if (value && typeof value === 'object') {
            const result = {};
            for (const k of Object.keys(value).sort()) if (value[k] !== undefined) result[k] = canonical(value[k], precision);
            return result;
        }
        return value;
    }
    function descriptor(p, o) {
        const s = p.style, mask = o.properties;
        const d = { kind: p.kind, fill: !!p.fill, closed: !!p.closed, clips: p.clips || [] };
        if (p.path) {
            d.path = p.path;
            // A continuous single line has no visible direction. Preserve dash origin.
            if (p.path.length === 2 && p.path[0][0] === 'M' && p.path[1][0] === 'L' && !s.dash?.length) {
                const ends = [p.path[0][1], p.path[1][1]].sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
                d.path = [['M', ends[0]], ['L', ends[1]]];
            }
        } else d.points = p.points;
        for (const field of ['fillRule', 'face', 'infinite', 'size', 'mode', 'position', 'u', 'v', 'text', 'font', 'bigFont', 'align', 'vertical', 'mtext', 'wrapWidth', 'lineSpacing', 'backgroundMask', 'resource', 'imageSize', 'imageClip', 'brightness', 'contrast', 'fade', 'displayFlags'])
            if (p[field] != null) d[field] = p[field];
        // Compare resolved text/geometry, not raw formatting tags or style names.
        if (p.gradient) { d.gradient = { ...p.gradient }; if (!(mask & 1)) delete d.gradient.colors; }
        if (mask & 1) d.color = s.color.toLowerCase();
        if (mask & 2) d.layer = key(s.layer);
        if (mask & 4) { d.dash = s.dash || []; d.linetype = key(s.linetype); }
        if (mask & 8) d.dashScale = s.dashScale;
        if (mask & 16) { d.lineweight = s.lineweight; d.lineweightVisible = !!s.lineweightVisible; }
        if (mask & 32) d.alpha = s.alpha;
        if (mask & 64) d.thickness = p.source?.num(39) || 0;
        return JSON.stringify(canonical(d, o.precision));
    }
    function objects(scene, o) {
        const groups = new Map(); let bytes = 0;
        for (const p of scene.primitives) {
            if (!o.text && p.kind === 'text' || !o.hatch && p.type === 'HATCH') continue;
            const source = p.rootSource || p.source, id = source?.id || p.id;
            let group = groups.get(id);
            if (!group) {
                if (groups.size >= o.maxObjects) throw new RangeError('Comparison object budget exceeded.');
                group = { id, source, handle: source?.handle || '', type: source?.type || p.type, layer: source?.layer || p.style.layer,
                    primitives: [], bounds: G.emptyBounds(), keys: [] }; groups.set(id, group);
            }
            const signature = descriptor(p, o); bytes += signature.length * 2;
            if (bytes > o.maxSignatureBytes) throw new RangeError('Comparison signature budget exceeded.');
            group.primitives.push(p); group.keys.push(signature);
            if (!p.infinite) G.union(group.bounds, p.bounds);
        }
        for (const group of groups.values()) {
            // Preserve internal draw order: overlapping fills in a block are visual content.
            group.signature = group.keys.join('\u0000'); delete group.keys;
        }
        return [...groups.values()];
    }
    const unionOf = items => { const b = G.emptyBounds(); for (const item of items) if (!G.isEmpty(item.bounds)) G.union(b, item.bounds); return b; };
    function compareScenes(currentScene, referenceScene, settings = {}) {
        const o = options(settings), current = objects(currentScene, o), reference = objects(referenceScene, o), buckets = new Map();
        for (const r of reference) { let list = buckets.get(r.signature); if (!list) buckets.set(r.signature, list = { values: [], next: 0 }); list.values.push(r); }
        const common = [], currentOnly = [], used = new Set();
        for (const c of current) {
            const bucket = buckets.get(c.signature), r = bucket && bucket.values[bucket.next++];
            if (r) { common.push({ current: c, reference: r }); used.add(r); } else currentOnly.push(c);
        }
        const referenceOnly = reference.filter(r => !used.has(r));
        // Handles suggest correspondence only AFTER geometric multiset matching.
        const byHandle = list => { const map = new Map(); for (const item of list) if (item.handle) {
            const k = key(item.type) + ':' + key(item.handle); map.set(k, map.has(k) ? null : item);
        } return map; };
        const cm = byHandle(currentOnly), rm = byHandle(referenceOnly), linked = new Set(), changes = [];
        for (const c of currentOnly) {
            const k = key(c.type) + ':' + key(c.handle), r = c.handle && cm.get(k) === c && rm.get(k);
            if (r) linked.add(r);
            changes.push({ id: 'current:' + c.id, status: r ? 'modified' : 'current-only', current: c, reference: r || null, bounds: unionOf(r ? [c, r] : [c]) });
        }
        for (const r of referenceOnly) if (!linked.has(r)) changes.push({ id: 'reference:' + r.id, status: 'reference-only', current: null, reference: r, bounds: { ...r.bounds } });
        const notices = [...currentScene.diagnostics.map(d => ({ ...d, drawing: 'current' })), ...referenceScene.diagnostics.map(d => ({ ...d, drawing: 'reference' }))];
        if ([...currentScene.primitives, ...referenceScene.primitives].some(p => p.kind === 'image')) notices.push({ code: 'compare-image-content', severity: 'warning', message: 'Image placement/resource names are compared, not external pixel contents.' });
        const counts = { currentOnly: currentOnly.length, referenceOnly: referenceOnly.length, common: common.length,
            modified: changes.filter(c => c.status === 'modified').length, changes: changes.length };
        return { options: o, currentScene, referenceScene, currentOnly, referenceOnly, common, changes, counts, notices,
            incomplete: notices.some(d => d.severity !== 'info'), bounds: unionOf(changes) };
    }
    function cloudBounds(result) {
        const boxes = result.changes.filter(c => !G.isEmpty(c.bounds)).map(c => ({ ...c.bounds }));
        if (!boxes.length) return [];
        const expanded = boxes.map(b => ({ ...b, minX: b.minX - result.options.margin, minY: b.minY - result.options.margin, maxX: b.maxX + result.options.margin, maxY: b.maxY + result.options.margin }));
        // Local mode intentionally emits one cloud per change set. No quadratic clustering.
        return result.options.cloudMode === 'combined' ? [unionOf(expanded.map(bounds => ({ bounds })))] : expanded;
    }
    function cloudPrimitive(box, i, color) {
        const { minX: x, minY: y } = box, w = Math.max(box.maxX - x, .01), h = Math.max(box.maxY - y, .01), z = Number.isFinite(box.minZ) ? box.minZ : 0;
        const corners = [G.vec(x, y, z), G.vec(x + w, y, z), G.vec(x + w, y + h, z), G.vec(x, y + h, z)], path = [['M', corners[0]]];
        const chord = Math.max(w, h) / 12;
        for (let edge = 0; edge < 4; edge++) {
            const a = corners[edge], b = corners[(edge + 1) % 4], dx = b.x - a.x, dy = b.y - a.y, n = Math.min(32, Math.max(2, Math.ceil(Math.hypot(dx, dy) / chord)));
            for (let j = 0; j < n; j++) {
                const t = (j + .5) / n, end = G.vec(a.x + dx * (j + 1) / n, a.y + dy * (j + 1) / n, z);
                path.push(['Q', G.vec(a.x + dx * t + dy / n * .35, a.y + dy * t - dx / n * .35, z), end]);
            }
        }
        path.push(['Z']); const f = G.flatten(path, .02, 4096);
        return { id: 'compare-cloud:' + i, handle: 'compare-cloud:' + i, entityHandle: '', type: 'REVCLOUD', kind: 'path', path, points: f.points, rings: f.rings,
            closed: true, fill: false, style: { layer: 'Comparison clouds', color, alpha: 1, lineweight: 25, lineweightVisible: false, dash: [], dashScale: 1 },
            bounds: G.pathBounds(path), clips: [], blockPath: [], instancePath: [], comparisonDecoration: true };
    }
    function compose(result) {
        const o = result.options, primitives = [];
        const add = (groups, side, color, alpha = 1) => {
            for (const group of groups) for (const p of group.primitives) {
                const reference = side === 'reference';
                primitives.push({ ...p, id: 'compare:' + side + ':' + p.id,
                    handle: reference ? 'compare-reference:' + group.id : p.handle,
                    entityHandle: reference ? 'compare-reference:' + p.entityHandle : p.entityHandle,
                    instancePath: reference ? [] : p.instancePath, blockPath: reference ? [] : p.blockPath,
                    comparisonSide: side, comparisonObjectId: group.id,
                    style: { ...p.style, color, alpha: p.style.alpha * alpha },
                    gradient: p.gradient ? { ...p.gradient, colors: [color, color] } : p.gradient });
            }
        };
        if (o.showCommon) add(result.common.map(p => p.current), 'common', o.commonColor, o.commonOpacity);
        const current = () => { if (o.showCurrent) add(result.currentOnly, 'current', o.currentColor); };
        const reference = () => { if (o.showReference) add(result.referenceOnly, 'reference', o.referenceColor); };
        if (o.currentFirst) { current(); reference(); } else { reference(); current(); }
        if (o.clouds) cloudBounds(result).forEach((b, i) => primitives.push(cloudPrimitive(b, i, o.cloudColor)));
        const scene = { ...result.currentScene, primitives, bounds: unionOf(primitives.filter(p => !p.infinite)),
            diagnostics: result.notices, stats: { ...result.currentScene.stats, primitives: primitives.length }, comparison: result, preserveForExport: true };
        scene.index = new A.SpatialIndex(primitives.map((primitive, index) => ({ primitive, index, bounds: primitive.bounds })));
        return scene;
    }
    class Session {
        constructor(reference, settings = {}) {
            if (!(reference instanceof A.DxfDocument)) throw new TypeError('A reference DxfDocument is required.');
            this.reference = reference; this.options = options(settings); this.revision = 0; this.enabled = true;
        }
        configure(patch) { this.options = options({ ...this.options, ...patch }); this.revision++; }
        setReference(reference) { if (!(reference instanceof A.DxfDocument)) throw new TypeError('Invalid reference document.'); this.reference = reference; this.referenceScene = null; this.revision++; }
        scene(currentScene) {
            if (this.currentScene === currentScene && this.builtRevision === this.revision) return this.composed;
            // Reuse the reference compilation for visibility/color/cloud setting changes.
            if (this.currentScene !== currentScene || !this.referenceScene) {
                const compileOptions = { ...currentScene.compileOptions };
                // Current handle isolation must never hide unrelated reference objects.
                delete compileOptions.entityIsolation; delete compileOptions.blockIsolation;
                let layout = currentScene.layout;
                const found = [...this.reference.layouts.values()].find(l => key(l.name) === key(layout));
                if (!found) throw new Error('Reference drawing has no layout "' + layout + '". Choose a shared layout.');
                layout = found.name;
                this.referenceScene = new A.SceneCompiler(this.reference, compileOptions).compile(layout);
            }
            const result = compareScenes(currentScene, this.referenceScene, this.options);
            const composed = compose(result);
            this.result = result; this.composed = composed; this.currentScene = currentScene; this.builtRevision = this.revision;
            return composed;
        }
    }
    function snapshot(currentText, referenceText, settings, metadata = {}) {
        if (typeof currentText !== 'string' || typeof referenceText !== 'string') throw new TypeError('Snapshot requires both DXF source strings.');
        return JSON.stringify({ format: 'dxf-render-compare', version: 1, currentText, referenceText, options: options(settings),
            metadata: { currentName: String(metadata.currentName || 'current.dxf'), referenceName: String(metadata.referenceName || 'reference.dxf'), layout: String(metadata.layout || 'Model') } });
    }
    function readSnapshot(text) {
        if (typeof text !== 'string' || text.length > 128 * 1024 * 1024) throw new RangeError('Snapshot input exceeds 128 MiB.');
        const value = JSON.parse(text);
        if (value?.format !== 'dxf-render-compare' || value.version !== 1 || typeof value.currentText !== 'string' || typeof value.referenceText !== 'string') throw new TypeError('Unsupported comparison snapshot.');
        return { ...value, options: options(value.options), current: new A.DxfDocument(value.currentText), reference: new A.DxfDocument(value.referenceText) };
    }
    function report(result) {
        return { format: 'dxf-render-compare-report', version: 1, layout: result.currentScene.layout, counts: result.counts, options: result.options, incomplete: result.incomplete, notices: result.notices,
            changes: result.changes.map(c => ({ id: c.id, status: c.status, current: c.current && { id: c.current.id, handle: c.current.handle, type: c.current.type, layer: c.current.layer },
                reference: c.reference && { id: c.reference.id, handle: c.reference.handle, type: c.reference.type, layer: c.reference.layer }, bounds: G.isEmpty(c.bounds) ? null : c.bounds })) };
    }
    return { createDxfCompare, defaults, propBits, options, descriptor, compareScenes, compose, cloudBounds, Session, snapshot, readSnapshot, report };
});


// packages/dxf-compare/import.js
/* Transactional, fail-closed import of supported reference objects. All records
 * are staged and compiled before a new source string is returned to the host. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else Object.assign(root.DxfCompare, factory(root.DxfSkia, root.DxfCompare));
})(globalThis, function createImport(A, C) {
    'use strict';
    const key = s => String(s ?? '').trim().toUpperCase();
    const tag = (code, value) => ({ code, value: String(value) });
    const copyTags = r => [tag(0, r.type), ...r.tags.map(t => tag(t.code, t.value))];
    const pointer = code => code >= 320 && code <= 369 || code >= 390 && code <= 399 || code === 480 || code === 481 || code === 1005;
    const tableKinds = new Set(['LAYER', 'LTYPE', 'STYLE', 'DIMSTYLE', 'APPID', 'BLOCK_RECORD']);
    const entityKinds = new Set(['LINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'LWPOLYLINE', 'POLYLINE', 'VERTEX', 'SEQEND', 'SPLINE', 'POINT', 'SOLID', 'TRACE', '3DFACE', 'TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF', 'INSERT', 'MINSERT', 'DIMENSION', 'HATCH', 'LEADER', 'XLINE', 'RAY', 'MESH']);
    function set(tags, code, value) { const t = tags.find(t => t.code === code); if (t) t.value = String(value); else tags.push(tag(code, value)); }
    function section(tags, name) {
        for (let i = 0; i < tags.length - 1; i++) if (tags[i].code === 0 && key(tags[i].value) === 'SECTION' && key(tags[i + 1].value) === name) {
            for (let j = i + 2; j < tags.length; j++) if (tags[j].code === 0 && key(tags[j].value) === 'ENDSEC') return { start: i + 2, end: j };
            throw new SyntaxError('Unterminated DXF section ' + name);
        }
        return null;
    }
    function ensureSection(tags, name) {
        let s = section(tags, name); if (s) return s;
        const eof = tags.findIndex(t => t.code === 0 && key(t.value) === 'EOF');
        tags.splice(eof < 0 ? tags.length : eof, 0, tag(0, 'SECTION'), tag(2, name), tag(0, 'ENDSEC'));
        return section(tags, name);
    }
    function table(tags, name) {
        const s = section(tags, 'TABLES'); if (!s) return null;
        for (let i = s.start; i < s.end - 1; i++) if (tags[i].code === 0 && key(tags[i].value) === 'TABLE' && tags[i + 1].code === 2 && key(tags[i + 1].value) === name) {
            let headerEnd = i + 1; while (headerEnd < s.end && tags[headerEnd].code !== 0) headerEnd++;
            for (let j = headerEnd; j < s.end; j++) if (tags[j].code === 0 && key(tags[j].value) === 'ENDTAB') return { start: i, headerEnd, end: j };
        }
        return null;
    }
    function importObjects(currentText, referenceText, selectedIds, settings = {}) {
        if (typeof currentText !== 'string' || typeof referenceText !== 'string') throw new TypeError('Import requires DXF source strings.');
        const current = new A.DxfDocument(currentText), reference = new A.DxfDocument(referenceText), opts = C.options(settings), ids = new Set(selectedIds);
        if (!ids.size || ids.size > 10000) throw new RangeError('Select 1–10000 reference objects.');
        if (current.diagnostics.items.some(d => /duplicate-handle/.test(d.code)) || reference.diagnostics.items.some(d => /duplicate-handle/.test(d.code))) throw new Error('Resolve duplicate handles before import.');
        const compilerOptions = settings.compileOptions || {}, beforeScene = new A.SceneCompiler(current, compilerOptions).compile('Model'), refScene = new A.SceneCompiler(reference, compilerOptions).compile('Model');
        const comparison = C.compareScenes(beforeScene, refScene, opts), eligible = new Map(comparison.referenceOnly.map(g => [g.id, g]));
        for (const id of ids) if (!eligible.has(id)) throw new Error('Only rendered reference-only model-space objects can be imported: ' + id);
        const targetTags = A.parseTags(currentText).map(t => tag(t.code, t.value));
        let next = 255n;
        for (const t of targetTags) if ((t.code === 5 || t.code === 105) && /^[0-9a-f]+$/i.test(t.value)) { const n = BigInt('0x' + t.value); if (n > next) next = n; }
        const allocate = () => (++next).toString(16).toUpperCase();
        const staged = new Map(), handles = new Map(), names = new Map(), records = reference.records;
        const byType = new Map(); for (const r of records) { if (!byType.has(r.type)) byType.set(r.type, []); byType.get(r.type).push(r); }
        const tableRecords = type => byType.get(type) || [];
        const existingNames = new Map([...tableKinds].map(t => [t, new Set(current.records.filter(r => r.type === t).map(r => key(r.get(2))))]));
        for (const b of current.blocks) existingNames.get('BLOCK_RECORD').add(key(b.name));
        let sequence = 0;
        const renamed = (type, name) => {
            const k = type + ':' + key(name); if (names.has(k)) return names.get(k);
            const set = existingNames.get(type) || new Set();
            if (!set.has(key(name))) { set.add(key(name)); names.set(k, String(name)); return String(name); }
            const base = String(name).replace(/[<>/\\":;?*|=,]/g, '_').slice(0, 160) || 'unnamed';
            let n; do { n = (type === 'BLOCK_RECORD' && String(name).startsWith('*') ? '*U_' : '') + 'CMP$' + (++sequence) + '$' + base; } while (set.has(key(n)));
            set.add(key(n)); names.set(k, n); return n;
        };
        function stage(r, destination, owner = null, blockContent = false) {
            if (staged.has(r.id)) return staged.get(r.id);
            if (!tableKinds.has(r.type) && !entityKinds.has(r.type) && r.type !== 'BLOCK' && r.type !== 'ENDBLK') throw new Error('Import requires unsupported ' + r.type + ' dependency; no changes were applied.');
            if (r.all(330).length > 1 || r.type === 'HATCH' && r.num(71) === 1) throw new Error('Associative boundary/owner references require a database-aware importer; no changes were applied.');
            if (r.tags.some(t => t.code === 102)) throw new Error('Extension dictionaries/reactors require a database-aware importer; no changes were applied.');
            const entry = { record: r, tags: copyTags(r), destination, owner, blockContent, handle: allocate() };
            staged.set(r.id, entry); if (r.handle) handles.set(key(r.handle), entry.handle);
            return entry;
        }
        function symbol(type, name) {
            const n = key(name); if (!n) return name;
            const mapKey = type + ':' + n; if (names.has(mapKey)) return names.get(mapKey);
            if (type === 'LTYPE' && ['BYLAYER', 'BYBLOCK'].includes(n)) return n;
            if (type === 'BLOCK_RECORD') return block(name);
            const r = tableRecords(type).find(r => key(r.get(2)) === n);
            if (!r) {
                // Synthesize the same defaults the native compiler uses for absent tables.
                if (type === 'LAYER') {
                    const layer = reference.layer(name), tags = [tag(0, 'LAYER'), tag(2, name), tag(70, layer.flags || 0), tag(62, layer.colorNumber ?? 7), tag(6, layer.linetype || 'CONTINUOUS'), tag(370, layer.lineweight ?? -3)];
                    const synthetic = new A.DxfRecord(tags, -1000 - sequence); const n = renamed(type, name); stage(synthetic, type); return n;
                }
                if (type === 'STYLE' && n === 'STANDARD' || type === 'LTYPE' && n === 'CONTINUOUS') return name;
                throw new Error('Missing ' + type + ' dependency "' + name + '"; no changes were applied.');
            }
            const target = current.records.find(t => t.type === type && key(t.get(2)) === n);
            const definition = r => JSON.stringify(r.tags.filter(t => ![5, 105, 330, 100].includes(t.code)).map(t => [t.code, String(t.value)]));
            if (target?.handle && definition(target) === definition(r)) { names.set(mapKey, target.get(2)); if (r.handle) handles.set(key(r.handle), target.handle); return target.get(2); }
            const mapped = renamed(type, name); stage(r, type); return mapped;
        }
        function block(name) {
            const mapKey = 'BLOCK_RECORD:' + key(name); if (names.has(mapKey)) return names.get(mapKey);
            const b = reference.getBlock(name); if (!b) throw new Error('Missing block ' + name);
            if (b.record.num(70) & 124 || b.record.get(1)) throw new Error('External-reference blocks cannot be imported as self-contained objects.');
            const mapped = renamed('BLOCK_RECORD', name), br = tableRecords('BLOCK_RECORD').find(r => key(r.get(2)) === key(name));
            const record = br || new A.DxfRecord([tag(0, 'BLOCK_RECORD'), tag(2, name), tag(70, 0)], -2000 - sequence);
            const owner = stage(record, 'BLOCK_RECORD').handle;
            const start = records.indexOf(b.record); let end = start + 1; while (end < records.length && records[end].type !== 'ENDBLK') end++;
            if (end === records.length) throw new Error('Unterminated block ' + name);
            for (let i = start; i <= end; i++) stage(records[i], 'BLOCKS', owner, true);
            return mapped;
        }
        // Model owner: create a minimal BLOCK_RECORD table record when absent.
        ensureSection(targetTags, 'TABLES'); ensureSection(targetTags, 'BLOCKS'); ensureSection(targetTags, 'ENTITIES');
        const model = current.records.find(r => r.type === 'BLOCK_RECORD' && key(r.get(2)) === '*MODEL_SPACE');
        const modelHandle = model?.handle || allocate();
        const rootHandles = new Map();
        for (const id of ids) {
            const r = eligible.get(id).source; const entry = stage(r, 'ENTITIES', modelHandle); rootHandles.set(id, entry.handle);
            // Ordered sequence records include ATTRIB/VERTEX and terminating SEQEND.
            if (r.type === 'POLYLINE' || ['INSERT', 'MINSERT'].includes(r.type) && r.num(66) === 1) {
                let i = records.indexOf(r) + 1;
                for (; i < records.length && ['VERTEX', 'ATTRIB', 'SEQEND'].includes(records[i].type); i++) {
                    stage(records[i], 'ENTITIES', entry.handle, true); if (records[i].type === 'SEQEND') break;
                }
                if (records[i]?.type !== 'SEQEND') throw new Error('Unterminated entity sequence.');
            }
        }
        const findSymbol = r => {
            const t = r.type, tags = r.tags;
            if (t === 'BLOCK_RECORD') symbol('BLOCK_RECORD', r.get(2));
            if (t === 'LAYER') symbol('LTYPE', r.get(6, 'CONTINUOUS'));
            if (entityKinds.has(t)) {
                symbol('LAYER', r.layer); symbol('LTYPE', r.get(6, 'BYLAYER'));
                if (['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(t)) symbol('STYLE', r.get(7, 'STANDARD'));
                if (['INSERT', 'MINSERT', 'DIMENSION'].includes(t) && r.get(2)) block(r.get(2));
                if (t === 'DIMENSION' && r.get(3)) symbol('DIMSTYLE', r.get(3));
            }
            for (const tag of tags) {
                if (tag.code === 1001) symbol('APPID', tag.value);
                if (!pointer(tag.code) || tag.code === 330 || key(tag.value) === '0' || handles.has(key(tag.value))) continue;
                const dependency = reference.byHandle.get(key(tag.value));
                if (dependency && tableKinds.has(dependency.type)) symbol(dependency.type, dependency.get(2));
                else throw new Error('Unresolved/unsupported handle dependency ' + tag.value + ' (group ' + tag.code + '); no changes were applied.');
            }
        };
        for (const entry of staged.values()) { findSymbol(entry.record); if (staged.size > 100000) throw new RangeError('Import dependency budget exceeded.'); }
        const tableHandles = new Map();
        function ensureTable(name) {
            if (tableHandles.has(name)) return tableHandles.get(name);
            let t = table(targetTags, name), handle;
            if (t) {
                const header = targetTags.slice(t.start, t.headerEnd); handle = header.find(t => t.code === 5)?.value || allocate();
                if (!header.some(t => t.code === 5)) targetTags.splice(t.start + 2, 0, tag(5, handle));
            } else {
                handle = allocate(); const s = ensureSection(targetTags, 'TABLES');
                targetTags.splice(s.end, 0, tag(0, 'TABLE'), tag(2, name), tag(5, handle), tag(100, 'AcDbSymbolTable'), tag(70, 0), tag(0, 'ENDTAB'));
            }
            tableHandles.set(name, handle); return handle;
        }
        ensureTable('BLOCK_RECORD');
        if (!model) {
            const t = table(targetTags, 'BLOCK_RECORD'); targetTags.splice(t.end, 0, tag(0, 'BLOCK_RECORD'), tag(5, modelHandle), tag(330, tableHandles.get('BLOCK_RECORD')), tag(100, 'AcDbSymbolTableRecord'), tag(100, 'AcDbBlockTableRecord'), tag(2, '*Model_Space'), tag(70, 0));
        }
        if (!model && !current.getBlock('*Model_Space')) {
            const b = ensureSection(targetTags, 'BLOCKS'); targetTags.splice(b.end, 0, tag(0, 'BLOCK'), tag(5, allocate()), tag(330, modelHandle), tag(100, 'AcDbEntity'), tag(8, '0'), tag(100, 'AcDbBlockBegin'), tag(2, '*Model_Space'), tag(70, 0), tag(10, 0), tag(20, 0), tag(30, 0), tag(3, '*Model_Space'), tag(0, 'ENDBLK'), tag(5, allocate()), tag(330, modelHandle), tag(100, 'AcDbEntity'), tag(8, '0'), tag(100, 'AcDbBlockEnd'));
        }
        for (const entry of staged.values()) if (tableKinds.has(entry.destination)) ensureTable(entry.destination);
        const layerDefault = reference.headerNumber('$LWDEFAULT', 25), dashRatio = reference.headerNumber('$LTSCALE', 1) / current.headerNumber('$LTSCALE', 1);
        if (!Number.isFinite(dashRatio)) throw new Error('Invalid global linetype scale.');
        for (const entry of staged.values()) {
            const { record: r, tags, destination, blockContent } = entry;
            set(tags, r.type === 'DIMSTYLE' ? 105 : 5, entry.handle);
            for (const t of tags) if (pointer(t.code) && key(t.value) !== '0') {
                if (t.code === 330) t.value = handles.get(key(t.value)) || entry.owner || tableHandles.get(destination) || modelHandle;
                else { const mapped = handles.get(key(t.value)); if (!mapped) throw new Error('Unmapped handle dependency ' + t.value); t.value = mapped; }
            }
            if (!tags.some(t => t.code === 330)) set(tags, 330, entry.owner || tableHandles.get(destination) || modelHandle);
            if (tableKinds.has(r.type)) set(tags, 2, names.get(r.type + ':' + key(r.get(2))) || r.get(2));
            if (r.type === 'BLOCK') { const n = names.get('BLOCK_RECORD:' + key(r.get(2))); set(tags, 2, n); if (r.get(3)) set(tags, 3, n); }
            if (entityKinds.has(r.type)) {
                set(tags, 8, blockContent && key(r.layer) === '0' ? '0' : names.get('LAYER:' + key(r.layer)) || r.layer);
                if (['INSERT', 'MINSERT', 'DIMENSION'].includes(r.type) && r.get(2)) set(tags, 2, names.get('BLOCK_RECORD:' + key(r.get(2))));
                if (r.type === 'DIMENSION' && r.get(3)) set(tags, 3, names.get('DIMSTYLE:' + key(r.get(3))) || r.get(3));
                if (['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(r.type)) set(tags, 7, names.get('STYLE:' + key(r.get(7, 'STANDARD'))) || r.get(7, 'STANDARD'));
                if (dashRatio !== 1) set(tags, 48, r.num(48, 1) * dashRatio);
                if (r.num(370, -1) === -3) set(tags, 370, layerDefault);
                // All selected/imported roots are model-space objects.
                if (destination === 'ENTITIES' && !blockContent) { set(tags, 67, 0); if (r.get(410)) set(tags, 410, 'Model'); }
            }
            if (r.type === 'LAYER' && r.num(370, -3) === -3) set(tags, 370, layerDefault);
            for (const t of tags) {
                if (t.code === 6 && (entityKinds.has(r.type) || r.type === 'LAYER')) t.value = names.get('LTYPE:' + key(t.value)) || t.value;
                if (t.code === 1001) t.value = names.get('APPID:' + key(t.value)) || t.value;
            }
        }
        // Batch each destination, preserving block/sequence record order. Avoid O(N²) splices.
        const destinations = new Map(); for (const e of staged.values()) { if (!destinations.has(e.destination)) destinations.set(e.destination, []); for (const t of e.tags) destinations.get(e.destination).push(t); }
        for (const [destination, tags] of destinations) {
            const range = tableKinds.has(destination) ? table(targetTags, destination) : ensureSection(targetTags, destination);
            const suffix = targetTags.splice(range.end); for (const t of tags) targetTags.push(t); for (const t of suffix) targetTags.push(t);
        }
        for (const name of tableHandles.keys()) {
            const t = table(targetTags, name); let count = 0;
            for (let i = t.headerEnd; i < t.end; i++) if (targetTags[i].code === 0) count++;
            const index = targetTags.findIndex((tag, i) => i >= t.start && i < t.headerEnd && tag.code === 70);
            if (index >= 0) targetTags[index].value = String(count);
        }
        const header = ensureSection(targetTags, 'HEADER'); let seed = -1;
        for (let i = header.start; i < header.end; i++) if (targetTags[i].code === 9 && key(targetTags[i].value) === '$HANDSEED') seed = i + 1;
        if (seed >= 0 && targetTags[seed]?.code === 5) targetTags[seed].value = allocate();
        else targetTags.splice(header.end, 0, tag(9, '$HANDSEED'), tag(5, allocate()));
        const text = targetTags.map(t => t.code + '\n' + t.value + '\n').join(''), document = new A.DxfDocument(text);
        if (document.diagnostics.items.some(d => d.severity === 'error' || /duplicate-handle/.test(d.code))) throw new Error('Import validation failed; original drawing is unchanged.');
        const afterScene = new A.SceneCompiler(document, compilerOptions).compile('Model');
        const originalRootIds = new Set(document.entities.slice(0, current.entities.length).map(e => e.id));
        const originalAfter = afterScene.primitives.filter(p => originalRootIds.has((p.rootSource || p.source).id));
        if (JSON.stringify(beforeScene.primitives.map(p => C.descriptor(p, opts))) !== JSON.stringify(originalAfter.map(p => C.descriptor(p, opts)))) throw new Error('Import would change existing drawing geometry. No changes were applied.');
        // Verify the staged import retains resolved geometry and appearance. Renamed
        // symbol labels are intentionally excluded from this postcondition only.
        const visual = p => { const d = JSON.parse(C.descriptor(p, { ...opts, properties: 127 })); delete d.layer; delete d.linetype; return JSON.stringify(d); };
        for (const [id, handle] of rootHandles) {
            const before = refScene.primitives.filter(p => (p.rootSource || p.source).id === id).map(visual);
            const after = afterScene.primitives.filter(p => (p.rootSource || p.source).handle === handle).map(visual);
            if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Import would change rendered appearance (global settings or unsupported dependency). No changes were applied.');
        }
        return { text, document, imported: rootHandles.size, handles: Object.fromEntries(rootHandles), renamedSymbols: Object.fromEntries(names), recordCount: staged.size };
    }
    return { importObjects };
});


// components/visual-compare.js
/* Dockyard/AnalysisView comparison workbench. Native drawing and export stay in
 * the existing Skia surface; no parallel Canvas2D preview is introduced. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, C = root.DxfCompare, G = A.geometry;
    const asset = typeof document !== 'undefined' && document.currentScript?.src;
    const element = (tag, text, className) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (className) e.className = className; return e; };
    class CompareController {
        constructor(cad) {
            this.cad = cad; this.manager = cad.manager; this.overlay = cad.overlay; this.app = cad.app;
            this.abort = new AbortController(); this.settings = { ...C.defaults }; this.loadGeneration = 0;
            this.undoStack = []; this.redoStack = []; this.controls = new Map(); this.selectedIndex = -1;
            this.panel = element('section', null, 'dxf-compare-panel'); this.panel.setAttribute('aria-label', 'Drawing comparison');
            if (!document.querySelector('link[data-dxf-compare]') && asset) { const css = element('link'); css.rel = 'stylesheet'; css.href = new URL('../components/visual-compare.css', asset).href; css.dataset.dxfCompare = ''; document.head.append(css); }
            const heading = element('div', null, 'dxf-compare-heading'); heading.append(element('strong', 'Drawing Compare'), element('span', 'Native Skia · object changes'));
            const source = element('div', null, 'dxf-compare-tools'); this.sources = element('select'); this.sources.setAttribute('aria-label', 'Reference drawing');
            source.append(this.sources); this.button(source, 'Compare tab', () => this.startTab()); this.button(source, 'Open reference DXF…', () => this.file.click());
            this.file = element('input'); this.file.type = 'file'; this.file.accept = '.dxf'; this.file.hidden = true;
            this.file.addEventListener('change', () => this.run(async () => { const file = this.file.files[0]; this.file.value = ''; if (file) await this.loadFile(file); }), { signal: this.abort.signal });
            this.snapshotFile = element('input'); this.snapshotFile.type = 'file'; this.snapshotFile.accept = '.json'; this.snapshotFile.hidden = true;
            this.snapshotFile.addEventListener('change', () => this.run(async () => { const file = this.snapshotFile.files[0]; this.snapshotFile.value = ''; if (file) { if (file.size > 128 * 1024 * 1024) throw new RangeError('Snapshot is too large.'); this.restoreSnapshot(await file.text()); } }), { signal: this.abort.signal });
            this.summary = element('p', 'Choose a reference drawing to compare with the active rendered DXF.', 'dxf-compare-summary'); this.summary.setAttribute('role', 'status'); this.summary.setAttribute('aria-live', 'polite');
            this.message = element('p', '', 'dxf-compare-message'); this.message.setAttribute('role', 'alert');
            const nav = element('div', null, 'dxf-compare-tools');
            this.button(nav, 'Previous', () => this.navigate(-1)); this.button(nav, 'Next', () => this.navigate(1)); this.button(nav, 'Fit changes', () => this.focus(this.require().result.bounds));
            this.toggleButton = this.button(nav, 'Hide comparison', () => this.toggle()); this.button(nav, 'Refresh', () => this.refreshComparison()); this.button(nav, 'End', () => this.end());
            const details = element('details', null, 'dxf-compare-settings'); details.append(element('summary', 'Comparison settings'));
            for (const [name, label] of [['showCurrent', 'Current only'], ['showReference', 'Reference only'], ['showCommon', 'Unchanged'], ['clouds', 'Revision clouds'], ['text', 'Compare text'], ['hatch', 'Compare hatches'], ['currentFirst', 'Reference in front']]) this.field(details, name, label, 'checkbox');
            for (const [name, label] of [['currentColor', 'Current color'], ['referenceColor', 'Reference color'], ['commonColor', 'Unchanged color'], ['cloudColor', 'Cloud color']]) this.field(details, name, label, 'color');
            this.field(details, 'precision', 'Decimal precision (0–14)', 'number', 0, 14, 1);
            this.field(details, 'margin', 'Cloud margin · drawing units', 'number', 0, 1e12, .1);
            this.field(details, 'commonOpacity', 'Unchanged opacity', 'range', 0, 1, .05);
            const mode = element('label', 'Cloud grouping'); this.cloudMode = element('select'); this.cloudMode.setAttribute('aria-label', 'Cloud grouping');
            for (const [value, label] of [['local', 'One cloud per change'], ['combined', 'One combined cloud']]) { const option = element('option', label); option.value = value; this.cloudMode.append(option); }
            this.cloudMode.addEventListener('change', () => this.run(() => this.configure({ cloudMode: this.cloudMode.value })), { signal: this.abort.signal }); mode.append(this.cloudMode); details.append(mode);
            const properties = element('fieldset'); properties.append(element('legend', 'Property changes · COMPAREPROPS'));
            for (const [name, bit] of Object.entries(C.propBits)) {
                const label = element('label', name.replace(/([A-Z])/g, ' $1')), input = element('input'); input.type = 'checkbox'; input.checked = true; input.dataset.compareProperty = name;
                input.addEventListener('change', () => this.run(() => this.configure({ properties: input.checked ? this.settings.properties | bit : this.settings.properties & ~bit })), { signal: this.abort.signal }); label.prepend(input); properties.append(label);
            }
            details.append(properties);
            const actions = element('div', null, 'dxf-compare-tools');
            this.importButton = this.button(actions, 'Import selected change', () => this.importSelected()); this.button(actions, 'Import all reference-only', () => this.importReference(this.require().result.referenceOnly.map(g => g.id)));
            this.button(actions, 'Undo import', () => this.undo()); this.button(actions, 'Redo import', () => this.redo());
            const exports = element('div', null, 'dxf-compare-tools');
            this.button(exports, 'Save snapshot', () => this.saveSnapshot()); this.button(exports, 'Open snapshot…', () => this.snapshotFile.click());
            this.button(exports, 'JSON report', () => this.download('compare-report.json', JSON.stringify(C.report(this.require().result), null, 2), 'application/json'));
            this.button(exports, 'PNG', () => this.cad.export('png')); this.button(exports, 'PDF', () => this.cad.export('pdf'));
            this.rowsHost = element('div', null, 'dxf-compare-records');
            const note = element('p', 'Comparison covers compiled visible objects in the selected layout, including nested blocks. Source handles are not identity. Unsupported geometry, fonts and external content can limit coverage. Imports add complete eligible model-space objects; unsafe dependencies are rejected.', 'dxf-cad-note');
            this.panel.append(heading, source, this.file, this.snapshotFile, this.summary, this.message, nav, details, actions, exports, this.rowsHost, note);
            this.panel.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); }, { signal: this.abort.signal });
            this.panel.addEventListener('drop', e => { if (e.dataTransfer?.files.length) { e.preventDefault(); this.run(() => this.loadFile(e.dataTransfer.files[0])); } }, { signal: this.abort.signal });
            const data = this.overlay?.dataController;
            this.unsubscribe = data?.subscribe?.(event => {
                if (!this.manager.comparison || event.type !== 'ingest') return;
                if (event.document.tabId === this.referenceTabId) {
                    this.referenceText = event.document.comparisonSourceText; this.manager.comparison.setReference(event.document); this.repaint();
                }
            });
        }
        button(host, label, action) { const b = element('button', label); b.type = 'button'; b.addEventListener('click', () => this.run(action), { signal: this.abort.signal }); host.append(b); return b; }
        async run(action) { try { this.message.textContent = ''; return await action(); } catch (error) { this.message.textContent = error.message; this.cad.write(error.message, true); return null; } }
        field(host, name, label, type, min, max, step) {
            const l = element('label', label), input = element('input'); input.type = type; input.setAttribute('aria-label', label); input.dataset.compare = name;
            if (type === 'checkbox') input.checked = this.settings[name]; else input.value = this.settings[name];
            if (min != null) { input.min = min; input.max = max; input.step = step; }
            input.addEventListener('change', () => this.run(() => this.configure({ [name]: type === 'checkbox' ? input.checked : type === 'color' ? input.value : Number(input.value) })), { signal: this.abort.signal });
            type === 'checkbox' ? l.prepend(input) : l.append(input); host.append(l); this.controls.set(name, input);
        }
        tabs() { return [...(this.app.tabs || []), ...(this.app.tabsRight || [])]; }
        currentTab() { return this.tabs().find(t => t.id === this.manager.sceneGraph?.document.tabId); }
        sourceFor(tab) { return tab.originalTreeData && this.app.dxfParser ? this.app.dxfParser.serializeTree(tab.originalTreeData) : tab.renderingSourceText; }
        currentText() { return this.manager.sceneGraph?.document.comparisonSourceText; }
        require() { const session = this.manager.comparison; if (!session?.result) throw new Error('Start a drawing comparison first.'); return session; }
        open() { this.cad.workspace?.show('render-compare'); this.refreshSources(); this.sources.focus(); }
        refreshSources() {
            const tabs = this.tabs().filter(t => t.id !== this.manager.sceneGraph?.document.tabId), stamp = JSON.stringify(tabs.map(t => [t.id, t.name]));
            if (stamp === this.sourceStamp) return; this.sourceStamp = stamp; const selected = this.sources.value; this.sources.replaceChildren();
            for (const tab of tabs) { const option = element('option', tab.name); option.value = String(tab.id); this.sources.append(option); }
            if (tabs.some(t => String(t.id) === selected)) this.sources.value = selected;
            if (!tabs.length) { const o = element('option', 'No other open drawings'); o.value = ''; this.sources.append(o); }
        }
        startTab() {
            const tab = this.tabs().find(t => String(t.id) === this.sources.value); if (!tab) throw new Error('Open another DXF tab or choose a local reference file.');
            this.start(this.sourceFor(tab), tab.name, this.settings, tab.id);
        }
        async loadFile(file) {
            if (!/\.dxf$/i.test(file.name)) throw new TypeError('Reference files must be DXF.');
            if (file.size > 128 * 1024 * 1024) throw new RangeError('Reference DXF exceeds 128 MiB.');
            const generation = ++this.loadGeneration, target = this.manager.sceneGraph?.document;
            const text = A.dxfText(await file.arrayBuffer());
            if (generation !== this.loadGeneration || target !== this.manager.sceneGraph?.document || this.abort.signal.aborted) return;
            this.start(text, file.name);
        }
        start(text, name = 'reference.dxf', settings = this.settings, tabId = null) {
            if (!this.manager.compiled) throw new Error('Render the current DXF before starting comparison.');
            const document = new A.DxfDocument(text), session = new C.Session(document, settings);
            document.fileName = name; session.scene(this.manager.compiled); // validate before replacing a working session
            this.referenceText = text; this.referenceName = name; this.referenceTabId = tabId; this.selectedIndex = -1; this.seenResult = null;
            this.settings = C.options(settings); this.syncControls(); this.manager.setComparison(session); this.repaint(); this.refresh(); return session;
        }
        configure(patch) { const settings = C.options({ ...this.settings, ...patch }); this.settings = settings; this.manager.comparison?.configure(patch); this.syncControls(); this.repaint(); this.refresh(); }
        syncControls() {
            for (const [name, control] of this.controls) control.type === 'checkbox' ? control.checked = this.settings[name] : control.value = this.settings[name];
            this.cloudMode.value = this.settings.cloudMode;
            for (const input of this.panel.querySelectorAll('[data-compare-property]')) input.checked = !!(this.settings.properties & C.propBits[input.dataset.compareProperty]);
        }
        toggle() { const s = this.require(); s.enabled = !s.enabled; this.repaint(); this.refresh(); }
        end() {
            this.loadGeneration++; this.manager.setComparison(null); this.referenceText = null; this.referenceName = null; this.referenceTabId = null; this.seenResult = null;
            this.selectedIndex = -1; this.view?.setRows([]); this.repaint(); this.refresh();
        }
        repaint() { this.cad.repaint(); }
        refreshComparison() {
            const session = this.require(), tab = this.currentTab(), referenceTab = this.tabs().find(t => t.id === this.referenceTabId);
            if (tab) {
                const text = this.sourceFor(tab);
                if (text !== this.currentText()) this.applySource(text, this.currentText(), false);
            }
            if (referenceTab) { this.referenceText = this.sourceFor(referenceTab); session.setReference(new A.DxfDocument(this.referenceText)); }
            this.manager.compileRevision++; session.revision++; this.repaint(); this.refresh();
        }
        refresh() {
            if (this.abort.signal.aborted) return;
            this.refreshSources(); const s = this.manager.comparison;
            if (!s) {
                this.summary.textContent = 'Comparison inactive. Choose a reference DXF or another open drawing.';
                if (this.seenResult) { this.view?.setRows([]); this.seenResult = null; }
                this.referenceText = null; this.referenceTabId = null; this.importButton.disabled = true; return;
            }
            this.toggleButton.textContent = s.enabled ? 'Hide comparison' : 'Show comparison';
            const r = s.result; if (!r) return;
            const count = r.counts;
            this.summary.textContent = `${count.currentOnly} current only · ${count.referenceOnly} reference only · ${count.common} unchanged · ${count.changes} change sets. Reference: ${this.referenceName || 'drawing'}${s.enabled ? '' : ' · hidden'}.`;
            const issueCount = this.manager.diagnostics?.filter(d => d.severity !== 'info').length || 0;
            if (this.manager.comparisonError) this.message.textContent = this.manager.comparisonError.message;
            else if (r.incomplete || issueCount) this.message.textContent = `Coverage warning: ${Math.max(r.notices.length, issueCount)} rendering notices. Equal visible geometry is not proof of equal DXF databases; inspect Rendering Diagnostics.`;
            if (this.seenResult !== r) {
                this.seenResult = r; this.selectedIndex = Math.min(this.selectedIndex, r.changes.length - 1);
                const rows = r.changes.map((c, i) => ({ key: c.id, changeIndex: i, values: [c.status, c.current?.type || c.reference?.type, c.current?.handle || '—', c.reference?.handle || '—', c.current?.layer || c.reference?.layer],
                    raw: JSON.stringify({ status: c.status, bounds: G.isEmpty(c.bounds) ? null : c.bounds }, null, 2) }));
                if (!this.view && root.DxfAnalysis) this.view = new root.DxfAnalysis.AnalysisView(this.rowsHost, { title: 'Drawing changes', columns: ['Status', 'Entity', 'Current handle', 'Reference handle', 'Layer'], rows, visualization: false,
                    onSelect: row => { this.selectedIndex = row.changeIndex; this.focus(r.changes[row.changeIndex]?.bounds); this.importButton.disabled = !r.changes[row.changeIndex]?.reference; } });
                else this.view?.setRows(rows);
            }
            this.importButton.disabled = !r.changes[this.selectedIndex]?.reference || this.manager.layout.toUpperCase() !== 'MODEL';
        }
        focus(bounds) {
            if (!bounds || G.isEmpty(bounds)) return;
            const frame = this.manager.lastFrame, points = [];
            for (const x of [bounds.minX, bounds.maxX]) for (const y of [bounds.minY, bounds.maxY]) for (const z of [bounds.minZ, bounds.maxZ]) points.push(G.project(G.vec(x, y, z), frame.basis));
            const b = G.bounds(points), center = G.center(b), size = Math.max(b.maxX - b.minX, b.maxY - b.minY, .01);
            const scale = Math.max(1e-9, Math.min(this.manager.width / Math.max(b.maxX - b.minX, size * .1), this.manager.height / Math.max(b.maxY - b.minY, size * .1)) * .7);
            this.overlay?.applyViewState({ mode: 'custom', center, scale, rotationRad: 0 });
        }
        navigate(delta) {
            const r = this.require().result; if (!r.changes.length) return;
            this.selectedIndex = (this.selectedIndex + delta + r.changes.length) % r.changes.length;
            const c = r.changes[this.selectedIndex]; this.view?.selectKey(c.id); this.focus(c.bounds); this.refresh();
        }
        importSelected() { const c = this.require().result.changes[this.selectedIndex]; if (!c?.reference) throw new Error('Select a change with a reference object.'); return this.importReference([c.reference.id]); }
        importReference(ids) {
            this.require(); if (this.manager.layout.toUpperCase() !== 'MODEL') throw new Error('Import is currently supported in model space only.');
            if (!this.currentTab()) throw new Error('Import into the parser workspace is supported; the standalone editor remains comparison-only.');
            const before = this.currentText(), tab = this.currentTab(), beforeTree = this.sourceFor(tab);
            // Never overwrite unrendered tree edits. Refresh updates the comparison first.
            if (this.app.dxfParser.serializeTree(this.app.dxfParser.parse(before)) !== beforeTree) throw new Error('The source tree changed. Refresh the comparison before importing.');
            const transaction = C.importObjects(before, this.referenceText, ids, { ...this.settings, compileOptions: this.manager.compiled.compileOptions });
            this.applySource(transaction.text, before);
            this.undoStack.push({ tabId: tab.id, before, after: transaction.text }); if (this.undoStack.length > 10) this.undoStack.shift(); this.redoStack = [];
            this.cad.write(`Imported ${transaction.imported} reference objects (${transaction.recordCount} records). Current objects were not deleted.`);
            return transaction;
        }
        applySource(text, expected, recordUndo = true) {
            const tab = this.currentTab(); if (!tab) throw new Error('Current source tab is closed.');
            if (this.currentText() !== expected) throw new Error('Drawing changed since this transaction. Refresh instead of overwriting newer edits.');
            const parsed = this.app.dxfParser.parse(text), document = new A.DxfDocument(text);
            Object.assign(document, { tabId: tab.id, fileName: tab.name, comparisonSourceText: text });
            // All fallible parsing/compilation occurs before the tree and renderer swap.
            new A.SceneCompiler(document, this.manager.compiled.compileOptions).compile(this.manager.layout);
            const previous = { originalTreeData: tab.originalTreeData, currentTreeData: tab.currentTreeData, renderingSourceText: tab.renderingSourceText, isModified: tab.isModified }, oldDoc = this.manager.sceneGraph.document;
            try {
                Object.assign(tab, { originalTreeData: parsed, currentTreeData: parsed, renderingSourceText: text, isModified: true });
                this.overlay.dataController.documents.set(tab.id, document); this.app.applyTabFilters(tab);
                this.overlay.renderSceneGraph(tab, document, this.overlay.currentPane);
            } catch (error) {
                Object.assign(tab, previous); this.overlay.dataController.documents.set(tab.id, oldDoc);
                this.app.applyTabFilters(tab); this.overlay.renderSceneGraph(tab, oldDoc, this.overlay.currentPane); throw error;
            }
            this.app.updateTabUI(); this.app.saveCurrentState(); this.refresh();
        }
        history(from, to, undo) {
            const item = from.at(-1), tab = this.currentTab(); if (!item || tab?.id !== item.tabId) throw new Error('No comparison import to ' + (undo ? 'undo' : 'redo') + ' in this drawing.');
            const expected = undo ? item.after : item.before;
            if (this.sourceFor(tab) !== this.app.dxfParser.serializeTree(this.app.dxfParser.parse(expected))) throw new Error('Source tree has intervening edits; import history will not overwrite them.');
            this.applySource(undo ? item.before : item.after, expected, false); from.pop(); to.push(item);
        }
        undo() { this.history(this.undoStack, this.redoStack, true); }
        redo() { this.history(this.redoStack, this.undoStack, false); }
        download(name, data, type) { const url = URL.createObjectURL(new Blob([data], { type })), link = element('a'); link.download = name; link.href = url; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        saveSnapshot() {
            this.require(); const text = C.snapshot(this.currentText(), this.referenceText, this.settings, { currentName: this.manager.sceneGraph.document.fileName, referenceName: this.referenceName, layout: this.manager.layout });
            this.download('drawing-compare.snapshot.json', text, 'application/json');
        }
        restoreSnapshot(text) {
            const value = C.readSnapshot(text); this.end();
            if (this.cad.mode === 'editor') this.app.loadDxfSource({ name: value.metadata?.currentName || 'snapshot.dxf', sourceText: value.currentText });
            else {
                this.app.handleCreateNewDxf(); const tab = this.app.getActiveTab();
                tab.name = value.metadata?.currentName || 'snapshot.dxf';
                this.overlay.open({ tab, pane: 'left' }); this.applySource(value.currentText, this.currentText(), false);
            }
            const layout = value.metadata?.layout || 'Model'; this.manager.setLayout(layout);
            this.start(value.referenceText, value.metadata?.referenceName || 'reference.dxf', value.options); this.open();
        }
        async command(command, args = []) {
            if (!/^COMPARE/.test(command)) return false;
            if (command === 'COMPARE') { this.open(); if (args.length) { const tab = this.tabs().find(t => t.name.toUpperCase() === args.join(' ').toUpperCase()); if (!tab) throw new Error('No open reference tab with that name.'); this.start(this.sourceFor(tab), tab.name, this.settings, tab.id); } }
            else if (command === 'COMPARECLOSE') this.end();
            else if (command === 'COMPARETOGGLE') this.toggle();
            else if (command === 'COMPARENEXT') this.navigate(1);
            else if (command === 'COMPAREPREV') this.navigate(-1);
            else if (command === 'COMPAREIMPORT') this.importSelected();
            else if (command === 'COMPAREUNDO') this.undo();
            else if (command === 'COMPAREREDO') this.redo();
            else if (command === 'COMPAREEXPORT') this.saveSnapshot();
            else if (command === 'COMPAREINFO') this.cad.write(JSON.stringify(C.report(this.require().result).counts));
            else if (command === 'COMPAREPROPS') this.configure({ properties: Number(args[0]) });
            else if (command === 'COMPARETOLERANCE') this.configure({ precision: Number(args[0]) });
            else throw new Error('Unknown comparison command. Use COMPARE, COMPARENEXT, COMPAREPREV, COMPARETOGGLE, COMPAREIMPORT, COMPAREEXPORT or COMPARECLOSE.');
            await this.manager.ready; return true;
        }
        dispose() { this.abort.abort(); this.loadGeneration++; this.unsubscribe?.(); this.manager.comparison = null; this.referenceText = null; this.view?.dispose(); this.undoStack = []; this.redoStack = []; }
    }
    C.CompareController = CompareController;
})(globalThis);
