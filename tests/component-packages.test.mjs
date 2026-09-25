import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const names = ['dxf-inspector', 'dxf-analysis', 'dxf-tree-view', 'dxf-drawing-tools', 'dxf-workspace', 'dxf-office-preview'];
const before = new Set(Reflect.ownKeys(globalThis));
const packages = await Promise.all(names.map(name => import(`../packages/${name}/index.mjs`)));
const [I, A, V, T] = packages;
const source = '0\nSECTION\n2\nENTITIES\n0\nLINE\n5\nAB\n8\nDRAFT\n10\n0\n20\n0\n11\n20\n21\n10\n0\nENDSEC\n0\nEOF\n';

for (let i = 0; i < names.length; i++) {
    test(`${names[i]} shares ESM and CommonJS identity without application imports`, () => {
        const cjs = require(`../packages/${names[i]}/index.cjs`);
        assert.equal(cjs, packages[i]);
        assert.ok(Object.keys(cjs).length > 0);
    });
}

test('all extracted packages import without touching globals or constructing a DOM', () => {
    assert.deepEqual(Reflect.ownKeys(globalThis).filter(key => !before.has(key)), []);
    for (const key of ['DxfParser', 'DXFDiagnosticsEngine', 'DxfAnalysisVisualModel', 'DxfGrid', 'DxfDocking', 'TreeDataGrid'])
        assert.equal(globalThis[key], undefined, key);
});

test('inspector parses, traverses and serializes independently of the workbench', () => {
    const parser = new I.DxfParser(), tree = parser.parse(source);
    const entity = tree[0].children.find(node => node.type === 'LINE');
    assert.equal(entity.handle, 'AB');
    assert.equal(typeof entity.id, 'number');
    assert.equal(parser.findNodeByIdIterative(tree, entity.id), entity);
    assert.equal(parser.findParentByIdIterative(tree, entity.id), tree[0]);
    const roundtrip = parser.parse(parser.serializeTree(tree));
    assert.equal(roundtrip[0].children.find(node => node.type === 'LINE').handle, 'AB');
});

test('structural comparison preserves duplicate group pairs and modified values', () => {
    const parser = new I.DxfParser(), current = parser.parse(source), reference = parser.parse(source.replace('20\n21', '25\n21'));
    const same = I.TreeDiffEngine.computeDiff(current, current, { respectExpanded: false });
    const changed = I.TreeDiffEngine.computeDiff(current, reference, { respectExpanded: false });
    assert.equal(same.leftRowClasses.size, 0);
    assert.ok(changed.leftRowClasses.size > 0);
    assert.equal(changed.totalRows, same.totalRows);
});

test('diagnostics run in Node without application startup or a progress callback', async () => {
    const report = await new I.DXFDiagnosticsEngine(new I.DxfParser().parse(source), 'fixture.dxf').runFullDiagnostics();
    assert.equal(typeof report.stats.totalIssues, 'number');
    assert.equal(report.stats.totalIssues, Object.entries(report).filter(([key]) => key !== 'stats').reduce((n, [, issues]) => n + issues.length, 0));
    assert.equal(globalThis.app, undefined);
});

test('binary inspection helpers remain available independently', () => {
    const bytes = I.hexStringToByteArray('89 50 4E 47 0D 0A 1A 0A');
    assert.equal(I.detectHeader(bytes), 'PNG Image');
    assert.match(I.hexDump(bytes), /89 50 4e 47/);
    assert.equal(I.isHandleCode(330), true); assert.equal(I.isHandleCode(10), false);
});

test('factory boundaries reject missing dependencies before allocating UI or models', () => {
    assert.throws(() => A.createAnalysisUI(), /browser window/);
    assert.throws(() => V.createTreeDataGrid(), /browser window/);
    assert.throws(() => T.createDrawingViewTools(), /DxfSkia/);
    assert.throws(() => T.createDrawingViewTools({ geometry: {}, projectedScene() {} }), /Dockyard/);
});

test('analysis model subpath shares functions and has no visual/global initialization', () => {
    const models = require('../packages/dxf-analysis/models.cjs');
    assert.equal(models.aggregate, A.aggregate);
    assert.deepEqual(A.aggregate([{ key: 7, values: ['Valve', 3] }], 0, 1).buckets[0].keys, [7]);
    assert.equal(models.createAnalysisUI, undefined);
});

function files(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(directory, entry.name);
        return entry.isDirectory() ? files(full) : [full];
    });
}

test('package runtime dependencies are self-contained and cannot reach the application', () => {
    for (const name of names) {
        const base = path.join(root, 'packages', name);
        for (const file of files(base).filter(file => /\.(?:mjs|cjs)$/.test(file))) {
            const source = readFileSync(file, 'utf8');
            assert.doesNotMatch(source, /window\.app|globalThis\.(?:app|Dxf)|\.\.\/components\/|\.\.\/vendor\//, file);
            for (const match of source.matchAll(/(?:from\s+|import\s*|require\()['"](\.[^'"]+)['"]/g)) {
                const target = path.resolve(path.dirname(file), match[1]);
                assert.ok(target.startsWith(base + path.sep), file + ' escapes its package: ' + target);
                assert.ok(existsSync(target), target);
            }
        }
    }
});

test('application integration has one explicit startup root, not diagnostics side effects', () => {
    const startup = readFileSync(path.join(root, 'components/app-startup.mjs'), 'utf8');
    assert.match(startup, /new App\(/);
    assert.match(startup, /import '\.\/analysis-services\.mjs'/);
    const diagnostics = readFileSync(path.join(root, 'packages/dxf-inspector/src/diagnostics.mjs'), 'utf8');
    assert.doesNotMatch(diagnostics, /DOMContentLoaded|document\.|window\.|new App\(/);
    for (const old of ['dxf-parser.js', 'dxf-diagnostics-engine.js', 'analysis-view.js', 'data-grid.js', 'tree-data-grid.js', 'drawing-view-tools.js'])
        assert.equal(existsSync(path.join(root, 'components', old)), false, old);
});
