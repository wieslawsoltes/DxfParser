'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { A, compile, line, hatch } = require('./helpers.js');
function u16(n) { return [n & 255, n >>> 8 & 255]; }
function shapeFile(entries) { const header = [...Buffer.from('AutoCAD-86 shapes 1.0\r\n'), 26]; return Uint8Array.from([...header, ...u16(entries[0][0]), ...u16(entries.at(-1)[0]), ...u16(entries.length), ...entries.flatMap(([id, code]) => [...u16(id), ...u16(code.length + 2)]), ...entries.flatMap(([, code]) => [65, 0, ...code]), ...Buffer.from('EOF')]); }
function proxy(type, payload = Buffer.alloc(0)) { const header = Buffer.alloc(8); header.writeUInt32LE(payload.length + 8); header.writeUInt32LE(type, 4); return Buffer.concat([header, payload]); }
function proxyEntity(chunks) { return [[0, 'ACAD_PROXY_ENTITY'], [5, 'F'], [310, Buffer.concat([Buffer.alloc(8), ...chunks]).toString('hex')]]; }
function uint(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
function doubles(...ns) { const b = Buffer.alloc(ns.length * 8); ns.forEach((n, i) => b.writeDoubleLE(n, i * 8)); return b; }
test('synthetic SHX strokes execute vectors and explicit displacement', () => { const font = A.ShapeFont.parse(shapeFile([[65, [1, 0x20, 8, 0, 3, 0]]])); const glyph = font.glyph(65); assert.equal(glyph.advance, 2); assert.equal(glyph.path.at(-1)[1].y, 3); });
test('SHX malformed header, truncated records and bigfont are explicit errors', () => { assert.throws(() => A.ShapeFont.parse(new Uint8Array([1, 2, 3]))); const raw = shapeFile([[65, [0]]]); assert.throws(() => A.ShapeFont.parse(raw.subarray(0, raw.length - 5))); assert.throws(() => A.ShapeFont.parse(Buffer.from('AutoCAD-86 bigfont 1.0\r\n\x1a')), /bigfont/i); });
test('SHX recursive glyphs and invalid stack state are bounded errors', () => { const font = A.ShapeFont.parse(shapeFile([[65, [7, 65, 0]], [66, [6, 0]]])); assert.throws(() => font.glyph(65), /Recursive/); assert.throws(() => font.glyph(66), /underflow/); });
test('SHX operation budget and zero scale cannot consume an unbounded stream', () => { const font = A.ShapeFont.parse(shapeFile([[65, [1, 0x10, 0x10, 0x10, 0x10, 0]], [66, [3, 0, 0]]])); assert.throws(() => font.glyph(65, { maxOperations: 2 }), /budget/); assert.throws(() => font.glyph(66), /Zero/); });
test('SHX pen-up moves do not become fabricated stroke segments', () => { const font = A.ShapeFont.parse(shapeFile([[65, [2, 8, 3, 0, 1, 8, 0, 2, 0]]])); const glyph = font.glyph(65); assert.equal(glyph.path.filter(c => c[0] === 'L').length, 1); assert.equal(glyph.advance, 3); });
test('proxy polylines and true colors compile to ordinary retained geometry', () => { const scene = compile(proxyEntity([proxy(22, uint(0xc200ff00)), proxy(6, Buffer.concat([uint(2), doubles(0, 0, 0, 10, 5, 0)]))])); assert.equal(scene.primitives.length, 1); assert.equal(scene.primitives[0].style.color, '#00ff00'); assert.equal(scene.primitives[0].points.at(-1).x, 10); });
test('unknown proxy opcodes are omitted with diagnostic, not silent geometry', () => { const scene = compile(proxyEntity([proxy(991)])); assert.equal(scene.primitives.length, 0); assert.ok(scene.diagnostics.some(d => d.code === 'proxy-opcode')); });
test('truncated proxy chunks isolate the error and preserve the next DXF entity', () => { const bad = Buffer.alloc(8); bad.writeUInt32LE(100); bad.writeUInt32LE(6, 4); const scene = compile([...proxyEntity([bad]), ...line()]); assert.equal(scene.primitives.length, 1); assert.ok(scene.diagnostics.some(d => d.severity === 'error')); });
test('proxy stack underflow and nonfinite vertices are diagnosed', () => { for (const chunk of [proxy(31), proxy(6, Buffer.concat([uint(1), doubles(NaN, 0, 0)]))]) {
    const scene = compile(proxyEntity([chunk]));
    assert.equal(scene.primitives.length, 0);
    assert.ok(scene.diagnostics.some(d => d.severity === 'error'));
} });
test('proxy polygons honor fill without carrying it to polylines', () => { const points = Buffer.concat([uint(3), doubles(0, 0, 0, 10, 0, 0, 0, 10, 0)]), scene = compile(proxyEntity([proxy(20, uint(1)), proxy(7, points), proxy(6, points)])); assert.equal(scene.primitives.length, 2); assert.equal(scene.primitives[0].fill, true); assert.equal(!!scene.primitives[1].fill, false); });
test('gradient hatch fallback is visible in coverage diagnostics', () => { const scene = compile([...hatch(), [450, 1], [470, 'LINEAR']]); assert.ok(scene.primitives.length); assert.ok(scene.diagnostics.some(d => d.code === 'hatch-gradient')); });
