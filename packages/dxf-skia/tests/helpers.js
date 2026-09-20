'use strict';
const A = require('..');
function tags(pairs) { return pairs.map(([code, value], i) => ({ code, value: String(value), line: i * 2 + 1 })); }
function file(entities = [], { tables = [], blocks = [], objects = [], header = [] } = {}) {
    const output = [[0, 'SECTION'], [2, 'HEADER'], ...header, [0, 'ENDSEC']];
    for (const [name, data] of [['TABLES', tables], ['BLOCKS', blocks], ['ENTITIES', entities], ['OBJECTS', objects]])
        output.push([0, 'SECTION'], [2, name], ...data, [0, 'ENDSEC']);
    output.push([0, 'EOF']);
    return output.map(([code, value]) => `${code}\n${value}\n`).join('');
}
function compile(entities, options = {}, sections = {}) { return new A.SceneCompiler(new A.DxfDocument(file(entities, sections)), options).compile(); }
function block(name, entities, base = [0, 0, 0]) { return [[0, 'BLOCK'], [2, name], [10, base[0]], [20, base[1]], [30, base[2]], ...entities, [0, 'ENDBLK']]; }
const line = (handle = 'A', x = 0, y = 0, x2 = 10, y2 = 0) => [[0, 'LINE'], [5, handle], [10, x], [20, y], [11, x2], [21, y2]];
const circle = (handle = 'C', x = 0, y = 0, r = 10) => [[0, 'CIRCLE'], [5, handle], [10, x], [20, y], [40, r]];
function hatch(handle = 'H', solid = true) { return [[0, 'HATCH'], [5, handle], [2, 'SOLID'], [70, solid ? 1 : 0], [91, 2], ...[[-10, -10, 10, 10], [-3, -3, 3, 3]].flatMap(([x, y, r, t]) => [[92, 2], [72, 0], [73, 1], [93, 4], [10, x], [20, y], [10, r], [20, y], [10, r], [20, t], [10, x], [20, t], [97, 0]]), [75, 0]]; }
const near = (assert, a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b} ± ${epsilon}`);
module.exports = { A, G: A.geometry, tags, file, compile, block, line, circle, hatch, near };
