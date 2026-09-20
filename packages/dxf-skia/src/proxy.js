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
