'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../../dxf-skia'), C = require('..')(A); Object.assign(C, require('../import')(A, C));
const text = pairs => pairs.map(([c, v]) => `${c}\n${v}\n`).join('');
const drawing = (entities = [], tables = [], blocks = [], header = [], objects = []) => text([...[['HEADER', header], ['TABLES', tables], ['BLOCKS', blocks], ['ENTITIES', entities], ['OBJECTS', objects]].flatMap(([n, tags]) => [[0, 'SECTION'], [2, n], ...tags, [0, 'ENDSEC']]), [0, 'EOF']]);
const line = (h = 'A', x = 0, extras = []) => [[0, 'LINE'], [5, h], [10, x], [20, 0], [11, x + 10], [21, 10], ...extras];
const circle = (h = 'C', r = 3, extras = []) => [[0, 'CIRCLE'], [5, h], [10, 5], [20, 5], [40, r], ...extras];
const table = (kind, records) => [[0, 'TABLE'], [2, kind], [70, records.filter(([c]) => c === 0).length], ...records, [0, 'ENDTAB']];
const layer = (color = 1) => table('LAYER', [[0, 'LAYER'], [5, 'F1'], [2, 'PIPES'], [70, 0], [62, color], [6, 'CONTINUOUS']]);
const compile = source => new A.SceneCompiler(new A.DxfDocument(source)).compile();
const compare = (a, b, opts) => C.compareScenes(compile(a), compile(b), opts);
const block = (radius = 2) => [[0, 'BLOCK'], [5, 'B0'], [2, 'VALVE'], [10, 0], [20, 0], ...circle('B1', radius), [0, 'ENDBLK'], [5, 'B2']];
const insert = (h = 'D', x = 0) => [[0, 'INSERT'], [5, h], [2, 'VALVE'], [10, x], [20, 0]];
const imported = (a, b, i = 0, opts = {}) => { const r = compare(a, b, opts); return C.importObjects(a, b, [r.referenceOnly[i].id], opts); };

test('handles, tag order, comments and document order are not object identity', () => {
    const a = drawing([...line('A'), ...circle('B')]);
    const b = drawing([...circle('FF'), ...line('EF').slice(0, 1), ...line('EF').slice(1).reverse(), [999, 'metadata']]);
    assert.deepEqual(compare(a, b).counts, { currentOnly: 0, referenceOnly: 0, common: 2, modified: 0, changes: 0 });
});
test('multiset matching retains duplicate multiplicity', () => { const r = compare(drawing([...line('A'), ...line('B')]), drawing(line('C'))); assert.equal(r.counts.common, 1); assert.equal(r.counts.currentOnly, 1); });
test('geometry matches precede misleading reused handles', () => { const r = compare(drawing([...line('A'), ...circle('B')]), drawing([...line('B'), ...circle('A')])); assert.equal(r.counts.common, 2); });
test('duplicate handles remain distinct roots with explicit diagnostics', () => { const r = compare(drawing([...line('A'), ...line('A', 30)]), drawing(line('B'))); assert.equal(r.counts.currentOnly, 1); assert.equal(r.counts.common, 1); assert.equal(r.incomplete, true); });
test('same unique handle links a modified object after matching', () => { const r = compare(drawing(line('A')), drawing(line('A', 5))); assert.equal(r.changes[0].status, 'modified'); assert.equal(r.counts.currentOnly, 1); assert.equal(r.counts.referenceOnly, 1); });
test('reversed continuous line endpoints are common', () => { const r = compare(drawing(line()), drawing([[0, 'LINE'], [10, 10], [20, 10], [11, 0], [21, 0]])); assert.equal(r.counts.common, 1); });
test('resolved BYLAYER color detects changes inside unchanged records', () => { assert.equal(compare(drawing(line('A', 0, [[8, 'PIPES']]), layer(1)), drawing(line('A', 0, [[8, 'PIPES']]), layer(2))).counts.modified, 1); });
test('property mask can ignore color changes', () => { assert.equal(compare(drawing(line('A', 0, [[62, 1]])), drawing(line('B', 0, [[62, 2]])), { properties: 0 }).counts.common, 1); });
test('all seven documented property bits are exposed', () => { assert.deepEqual(Object.values(C.propBits), [1, 2, 4, 8, 16, 32, 64]); });
test('precision is bounded and consistently rounds world geometry', () => {
    const a = drawing(line()), b = drawing(line('B', .0000001)); assert.equal(compare(a, b).counts.common, 1); assert.equal(compare(a, b, { precision: 8 }).counts.common, 0);
    for (const precision of [-1, 15, NaN, 1.5]) assert.throws(() => compare(a, b, { precision }), /Precision/);
});
test('settings validate colors, opacity, property mask and budgets', () => { for (const patch of [{ properties: 128 }, { currentColor: 'red' }, { margin: -1 }, { commonOpacity: 4 }, { text: 'true' }, { maxObjects: 0 }]) assert.throws(() => C.options(patch)); });
test('text inclusion affects both drawings, including block leaves', () => { const txt = [[0, 'TEXT'], [5, 'F'], [10, 0], [20, 0], [40, 2], [1, 'Pump']]; assert.equal(compare(drawing(txt), drawing(), { text: false }).counts.changes, 0); assert.equal(compare(drawing(txt), drawing()).counts.currentOnly, 1); });
test('nested block geometry changes identify the root insert', () => { const r = compare(drawing(insert(), [], block(2)), drawing(insert(), [], block(4))); assert.equal(r.counts.modified, 1); assert.equal(r.currentOnly[0].type, 'INSERT'); assert.equal(r.currentOnly[0].handle, 'D'); });
test('identical expanded block visuals do not depend on child handles', () => { const b = block().map(([c, v]) => [c, c === 5 ? 'E' + v : v]); assert.equal(compare(drawing(insert('AA'), [], block()), drawing(insert('BB'), [], b)).counts.common, 1); });
test('different INSERT transforms are visible differences', () => { assert.equal(compare(drawing(insert('D', 0), [], block()), drawing(insert('D', 50), [], block())).counts.modified, 1); });
test('hidden layers are excluded by the shared compiler', () => { const r = compare(drawing(line('A', 0, [[8, 'PIPES']]), layer(-1)), drawing()); assert.equal(r.counts.changes, 0); });
test('unsupported entities do not yield a claim of complete equality', () => { const r = compare(drawing([[0, '3DSOLID'], [5, 'A'], [1, 'opaque']]), drawing()); assert.equal(r.counts.changes, 0); assert.ok(r.incomplete); assert.ok(r.notices.length); });
test('composition preserves sources and category styles', () => { const r = compare(drawing(line()), drawing(circle())); const prior = JSON.stringify(r.currentScene.primitives); const scene = C.compose(r); assert.equal(JSON.stringify(r.currentScene.primitives), prior); assert.equal(scene.primitives.find(p => p.comparisonSide === 'current').style.color, C.defaults.currentColor); assert.equal(scene.primitives.find(p => p.comparisonSide === 'reference').style.color, C.defaults.referenceColor); assert.ok(scene.preserveForExport); });
test('reference handles cannot alias current selection or snapping', () => { const r = compare(drawing(line()), drawing(circle('A'))); const scene = C.compose(r), frame = A.prepareFrame(scene, { width: 800, height: 600 }); const p = scene.primitives.find(p => p.comparisonSide === 'reference'); assert.match(p.handle, /^compare-reference:/); const snap = A.snap(frame, frame.worldToScreen({ x: 8, y: 5, z: 0 }), 4, new Set(['quadrant'])); assert.equal(snap, null); });
test('clouds are native scalloped paths and can combine change bounds', () => { const r = compare(drawing([...line(), ...line('B', 50)]), drawing()); const scene = C.compose(r); assert.equal(scene.primitives.filter(p => p.comparisonDecoration).length, 2); assert.ok(scene.primitives.find(p => p.comparisonDecoration).path.some(p => p[0] === 'Q')); r.options.cloudMode = 'combined'; assert.equal(C.cloudBounds(r).length, 1); });
test('category visibility and front ordering change composed primitives', () => { const r = compare(drawing(line()), drawing(circle()), { clouds: false, showCurrent: false }); assert.ok(C.compose(r).primitives.every(p => p.comparisonSide === 'reference')); r.options.showCurrent = true; r.options.currentFirst = true; assert.equal(C.compose(r).primitives.at(-1).comparisonSide, 'reference'); });
test('camera changes reuse the same compiled comparison and scene', () => { const a = compile(drawing(line())), s = new C.Session(new A.DxfDocument(drawing(circle()))); const scene = s.scene(a); A.prepareFrame(scene, { width: 100, height: 100 }); assert.equal(s.scene(a), scene); assert.equal(s.referenceScene, s.result.referenceScene); s.configure({ clouds: false }); assert.notEqual(s.scene(a), scene); });
test('missing reference layout fails explicitly', () => { const a = compile(drawing(line())); a.layout = 'Missing sheet'; const s = new C.Session(new A.DxfDocument(drawing())); assert.throws(() => s.scene(a), /no layout/); });
test('object/signature budgets fail rather than silently truncating', () => { assert.throws(() => compare(drawing([...line(), ...circle()]), drawing(), { maxObjects: 1 }), /budget/); assert.throws(() => compare(drawing(line()), drawing(), { maxSignatureBytes: 1 }), /budget/); });
test('paired snapshots preserve both exact texts and validate schema', () => { const a = drawing(line()), b = drawing(circle()), s = C.readSnapshot(C.snapshot(a, b, { precision: 4 })); assert.equal(s.currentText, a); assert.equal(s.referenceText, b); assert.equal(s.options.precision, 4); assert.throws(() => C.readSnapshot('{"version":7}'), /snapshot/); });
test('report is serializable without document objects or cycles', () => { const r = C.report(compare(drawing(line()), drawing(circle()))); assert.ok(JSON.stringify(r)); assert.equal(r.changes.length, 2); assert.equal(r.currentScene, undefined); });
test('import adds new records with fresh handles and keeps current entities', () => { const a = drawing(line()), b = drawing(circle('A')), tx = imported(a, b); assert.equal(tx.imported, 1); assert.ok(tx.document.entities.some(e => e.handle === 'A' && e.type === 'LINE')); assert.ok(tx.document.entities.some(e => e.type === 'CIRCLE' && e.handle !== 'A')); assert.equal(new A.DxfDocument(a).entities.length, 1); assert.ok(tx.document.getBlock('*Model_Space')); });
test('import rejects common objects and duplicate handles', () => { const a = drawing(line()), b = drawing([...line('A'), ...line('A', 30)]); assert.throws(() => C.importObjects(a, a, [new A.DxfDocument(a).entities[0].id]), /reference-only/); assert.throws(() => C.importObjects(a, b, ['x']), /duplicate/); });
test('import carries renamed conflicting layer definitions without changing current layer', () => { const a = drawing(line('A', 0, [[8, 'PIPES']]), layer(1)), b = drawing(circle('B', 4, [[8, 'PIPES']]), layer(2)); const tx = imported(a, b); assert.equal(tx.document.layer('PIPES').colorNumber, 1); const entity = tx.document.entities.find(e => e.type === 'CIRCLE'); assert.notEqual(entity.layer, 'PIPES'); assert.equal(tx.document.layer(entity.layer).colorNumber, 2); });
test('import reuses an identical symbol definition', () => { const a = drawing(line('A', 0, [[8, 'PIPES']]), layer(1)), b = drawing(circle('B', 4, [[8, 'PIPES']]), layer(1)); const tx = imported(a, b); assert.equal(tx.document.entities.find(e => e.type === 'CIRCLE').layer, 'PIPES'); assert.equal(tx.document.records.filter(e => e.type === 'LAYER' && e.get(2) === 'PIPES').length, 1); });
test('import includes block geometry and remaps block ownership', () => { const a = drawing(line()), b = drawing(insert(), [], block()); const tx = imported(a, b); const e = tx.document.entities.find(e => e.type === 'INSERT'); assert.ok(tx.document.getBlock(e.get(2))); assert.equal(compile(tx.text).primitives.length, 2); });
test('import resolves a conflicting block name rather than redefining it', () => { const a = drawing(insert('A'), [], block(2)), b = drawing(insert('D', 30), [], block(5)), tx = imported(a, b); const inserts = tx.document.entities.filter(e => e.type === 'INSERT'); assert.equal(inserts[0].get(2), 'VALVE'); assert.notEqual(inserts[1].get(2), 'VALVE'); });
test('extension dictionaries and unresolved object graphs fail atomically', () => { const a = drawing(line()), b = drawing(circle('C', 3, [[102, '{ACAD_XDICTIONARY'], [360, 'F'], [102, '}']])); assert.throws(() => imported(a, b), /dictionaries/); const c = drawing(circle('C', 3, [[340, 'BAD']])); assert.throws(() => imported(a, c), /dependency/); assert.equal(new A.DxfDocument(a).entities.length, 1); });
test('import normalizes global dash scale without changing reference appearance', () => { const lt = table('LTYPE', [[0, 'LTYPE'], [5, 'F3'], [2, 'DASHED'], [70, 0], [73, 2], [40, 3], [49, 2], [49, -1]]); const a = drawing([], lt, [], [[9, '$LTSCALE'], [40, 2]]), b = drawing(line('A', 0, [[6, 'DASHED']]), lt, [], [[9, '$LTSCALE'], [40, 4]]); const tx = imported(a, b); assert.equal(tx.document.entities[0].num(48), 2); });
test('empty selection is rejected', () => { assert.throws(() => C.importObjects(drawing(), drawing(), []), /Select/); });


test('hatch exclusion is symmetric and does not hide non-hatch block leaves', () => {
    const h = require('../../dxf-skia/tests/helpers').hatch('A');
    assert.equal(compare(drawing(h), drawing(), { hatch: false }).counts.changes, 0);
    assert.equal(compare(drawing(h), drawing()).counts.currentOnly, 1);
    const blocks = [[0, 'BLOCK'], [2, 'VALVE'], ...h, ...line('B', 50), [0, 'ENDBLK']];
    assert.equal(compare(drawing(insert(), [], blocks), drawing(), { hatch: false }).currentOnly[0].primitives.length, 1);
});
test('a nonassociative hatch retaining a boundary source reference is rejected', () => {
    const h = require('../../dxf-skia/tests/helpers').hatch('A'); h.push([330, 'BEEF']);
    assert.throws(() => imported(drawing(), drawing(h)), /boundary/);
});
test('large reordered drawings preserve multiplicity without pairwise candidate scans', () => {
    const a = [], b = []; const count = 10000;
    for (let i = 0; i < count; i++) a.push(...line((i + 100).toString(16), i * 20));
    for (let i = count - 1; i >= 0; i--) b.push(...line((i + 20000).toString(16), i * 20));
    const r = compare(drawing(a), drawing(b));
    assert.equal(r.counts.common, count); assert.equal(r.counts.changes, 0);
});
test('current entity isolation does not silently isolate unrelated reference handles', () => {
    const source = drawing([...line('A'), ...circle('B')]);
    const current = new A.SceneCompiler(new A.DxfDocument(source), { entityIsolation: new Set(['A']) }).compile();
    const session = new C.Session(new A.DxfDocument(drawing(circle('C')))); session.scene(current);
    assert.equal(session.referenceScene.primitives.length, 1);
});
test('paper layout comparison compiles only the matching shared layout', () => {
    const a = drawing([...line('A'), ...line('B', 50, [[67, 1], [410, 'Sheet A']])]);
    const b = drawing([...circle('C'), ...line('D', 50, [[67, 1], [410, 'Sheet A']])]);
    const current = new A.SceneCompiler(new A.DxfDocument(a)).compile('Sheet A');
    const session = new C.Session(new A.DxfDocument(b));session.scene(current);
    assert.equal(session.result.counts.common, 1); assert.equal(session.result.counts.changes, 0);
});
