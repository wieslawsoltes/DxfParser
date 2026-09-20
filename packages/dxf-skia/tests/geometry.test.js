'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { A, G, near } = require('./helpers'), { vec } = G;
test('affine composition and inverse round-trip preserve nonuniform 3D transforms', () => { const m = G.multiply(G.translation(vec(8, -17, 4)), G.multiply(G.rotation(.34), G.scaling(4, -2, 3))), p = vec(3, 2, 7), out = G.transform(G.inverse(m), G.transform(m, p)); for (const k of ['x', 'y', 'z'])
    near(assert, out[k], p[k]); });
test('direction transform never subtracts large translated origins', () => { const m = G.translation(vec(1e17, 1e17, 1e17)); assert.deepEqual(G.direction(m, vec(.125, .25, .5)), vec(.125, .25, .5)); });
test('zero directions and singular transforms fail explicitly', () => { assert.throws(() => G.normal(vec()), RangeError); assert.throws(() => G.inverse(G.scaling(0)), RangeError); });
test('arbitrary axis OCS is orthonormal and right-handed', () => { for (const n of [vec(0, 0, 1), vec(0, 0, -1), vec(.0001, .0001, 1), vec(2, 3, 4)]) {
    const m = G.ocs(n), x = G.direction(m, vec(1, 0)), y = G.direction(m, vec(0, 1)), z = G.normal(n);
    near(assert, G.dot(x, y), 0);
    near(assert, G.dot(G.cross(x, y), z), 1);
} });
test('circles use four exact positive-weight rational quadratics', () => { const p = G.arcPath(vec(), vec(10, 0), vec(0, 10)); assert.equal(p.length, 5); for (const c of p.slice(1)) {
    assert.equal(c[0], 'K');
    near(assert, c[3], Math.SQRT1_2);
} const f = G.flatten(p, .001); assert.ok(f.points.length > 32); for (const q of f.points)
    near(assert, Math.hypot(q.x, q.y), 10, 1e-7); });
test('transformed conics retain endpoint geometry with negative scales', () => { const m = G.multiply(G.translation(vec(100, 200)), G.scaling(-2, 3)), p = G.transformPath(G.arcPath(vec(), vec(5, 0), vec(0, 5), 0, Math.PI / 2), m); assert.deepEqual(p[0][1], vec(90, 200)); near(assert, p.at(-1)[2].y, 215); });
test('positive and negative bulges have opposite signed sagittae', () => { const a = G.flatten(G.bulgePath(vec(), vec(2, 0), 1), .0001), b = G.flatten(G.bulgePath(vec(), vec(2, 0), -1), .0001); near(assert, G.bounds(a.points).minY, -1); near(assert, G.bounds(b.points).maxY, 1); });
test('path flattening uses a global bound across disconnected subpaths', () => { const path = Array.from({ length: 100 }, (_, i) => [['M', vec(i, 0)], ['L', vec(i, 1)]]).flat(), f = G.flatten(path, .1, 12); assert.equal(f.points.length, 12); assert.equal(f.truncated, true); assert.throws(() => G.flatten([['M', vec(NaN, 0)]])); });
test('malformed conics cannot introduce NaNs or unbounded sweeps', () => { assert.throws(() => G.arcPath(vec(), vec(1, 0), vec(0, 1), 0, 100)); assert.throws(() => G.arcPath(vec(), vec(1, 0), vec(0, 1), NaN, 1)); assert.throws(() => G.flatten([['M', vec()], ['K', vec(1, 1), vec(2, 0), -1]])); });
test('rational de Boor evaluates a quarter circle, including exact ends', () => { const p = [vec(1, 0), vec(1, 1), vec(0, 1)], k = [0, 0, 0, 1, 1, 1], w = [1, Math.SQRT1_2, 1], mid = G.evaluateNurbs(p, 2, k, w, .5); near(assert, mid.x, Math.SQRT1_2); near(assert, mid.y, Math.SQRT1_2); assert.deepEqual(G.evaluateNurbs(p, 2, k, w, 0), p[0]); assert.deepEqual(G.evaluateNurbs(p, 2, k, w, 1), p[2]); });
test('NURBS rejects nonmonotone knots, invalid weights and excess samples', () => { const p = [vec(), vec(1, 3), vec(2, 0)]; assert.throws(() => G.evaluateNurbs(p, 2, [NaN, 0, 0, 1, 1, 1], [], .5)); assert.throws(() => G.evaluateNurbs(p, 2, [0, 0, 0, 1, 1, 1], [1, 0, 1], .5)); assert.throws(() => G.sampleNurbs(p, 2, [0, 0, 0, 1, 1, 1], [], 1e-9, 4)); });
test('BVH result equals brute force on twenty thousand bounds', () => { const items = Array.from({ length: 20000 }, (_, i) => ({ id: i, bounds: { minX: i % 200, minY: Math.floor(i / 200), maxX: i % 200 + .9, maxY: Math.floor(i / 200) + .9 } })), index = new A.SpatialIndex(items), box = { minX: 17.4, minY: 3.4, maxX: 23.2, maxY: 7.9 }; assert.deepEqual(index.search(box).map(x => x.id).sort((a, b) => a - b), items.filter(x => G.intersects(x.bounds, box)).map(x => x.id)); assert.throws(() => new A.SpatialIndex(items, 0)); });
test('infinite line and ray clipping includes origins far outside the viewport', () => { const b = { minX: 0, minY: 0, maxX: 100, maxY: 100 }; assert.deepEqual(A.clipInfiniteLine(vec(-1e6, 50), vec(-1e6 + 1, 50), b, true), [vec(0, 50), vec(100, 50)]); assert.equal(A.clipInfiniteLine(vec(1e6, 50), vec(1e6 + 1, 50), b, true), null); assert.equal(A.clipInfiniteLine(vec(20, 101), vec(30, 101), b), null); });
test('signed linetype runs retain initial gaps and merge consecutive ink', () => { assert.deepEqual(A.nativeDash([2, 3, -4]), { intervals: [5, 4], phase: 0 }); assert.deepEqual(A.nativeDash([-4, 2, 3]), { intervals: [5, 4], phase: 5 }); assert.deepEqual(A.nativeDash([2, -4, 3]), { intervals: [5, 4], phase: 3 }); assert.equal(A.nativeDash([-4]).empty, true); assert.throws(() => A.nativeDash([NaN, -1])); });
test('even-odd containment respects nested hatch holes', () => { const rings = [[vec(-10, -10), vec(10, -10), vec(10, 10), vec(-10, 10)], [vec(-2, -2), vec(2, -2), vec(2, 2), vec(-2, 2)]]; assert.equal(G.inLoops(vec(), rings), false); assert.equal(G.inLoops(vec(5, 0), rings), true); });
test('MTEXT wrapping obeys reference width and top/middle/bottom anchors', () => { for (const vertical of [0, 1, 2]) {
    const l = A.layoutText({ text: 'PUMP LINE\nLONGWORD', mtext: true, wrapWidth: 3, align: 1, vertical });
    assert.ok(l.lines.length >= 4);
    assert.ok(l.lines.every(x => x.width <= 3));
    near(assert, l.left, -1.5);
    if (vertical === 0)
        near(assert, l.top, 0);
    if (vertical === 1)
        near(assert, (l.top + l.bottom) / 2, 0);
    if (vertical === 2)
        near(assert, l.bottom, 0);
} });
test('text arrangement rejects nonfinite metrics and pathological input', () => { assert.throws(() => A.layoutText({ text: 'x' }, () => NaN)); assert.throws(() => A.layoutText({ text: 'x'.repeat(100001) })); });
