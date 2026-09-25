#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'test-results/component-packages');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxf-component-consumer-'));
const names = ['dxf-inspector', 'dxf-analysis', 'dxf-tree-view', 'dxf-drawing-tools'];
const run = (command, args, cwd = temp) => execFileSync(command, args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000
});
fs.mkdirSync(output, { recursive: true });
try {
    fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ name: 'isolated-component-consumer', private: true, type: 'module' }));
    const tarballs = [];
    for (const name of names) {
        const copy = path.join(temp, 'sources', name);
        fs.cpSync(path.join(root, 'packages', name), copy, { recursive: true });
        const pack = JSON.parse(run('npm', ['pack', '--offline', '--json', '--pack-destination', temp], copy))[0];
        assert.ok(pack.files.some(file => file.path === 'index.d.mts'));
        assert.ok(pack.files.some(file => file.path === 'LICENSE'));
        assert.ok(!pack.files.some(file => /(?:^dist\/|^tests\/|\.(?:ttf|otf|woff2?|shx)$)/i.test(file.path)));
        tarballs.push(path.join(temp, pack.filename));
        fs.copyFileSync(tarballs.at(-1), path.join(output, pack.filename));
    }
    // No dependency can be resolved from the checkout or a package's sibling.
    fs.rmSync(path.join(temp, 'sources'), { recursive: true, force: true });
    run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs]);
    const consumer = `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), before = new Set(Reflect.ownKeys(globalThis));
for (const name of ${JSON.stringify(names)}) {
    const specifier = '@wieslawsoltes/' + name;
    const esm = await import(specifier), cjs = require(specifier);
    assert.equal(esm, cjs);
    assert.equal(require(specifier + '/package.json').version, '0.1.0');
}
const I = await import('@wieslawsoltes/dxf-inspector');
const source = ${JSON.stringify(['0','SECTION','2','ENTITIES','0','CIRCLE','5','A','10','0','20','0','40','2','0','ENDSEC','0','EOF',''].join('\n'))};
const tree = new I.DxfParser().parse(source);
assert.equal(tree[0].children[0].type, 'CIRCLE');
assert.equal(I.TreeDiffEngine.computeDiff(tree, tree).leftRowClasses.size, 0);
const model = await import('@wieslawsoltes/dxf-analysis/models');
assert.equal(model.aggregate, require('@wieslawsoltes/dxf-analysis/models').aggregate);
assert.equal(model.aggregate([{ key: 1, values: ['Pipe', 8] }], 0, 1).buckets[0].value, 8);
assert.deepEqual(Reflect.ownKeys(globalThis).filter(key => !before.has(key)), []);
console.log('All four installed component packages: isolated ESM/CJS identity, public subpaths, source parsing and models pass.');
`;
    fs.writeFileSync(path.join(temp, 'consumer.mjs'), consumer);
    process.stdout.write(run(process.execPath, ['consumer.mjs']));
    fs.writeFileSync(path.join(temp, 'consumer.mts'), `
import { DxfParser, TreeDiffEngine, DXFDiagnosticsEngine, isHandleCode } from '@wieslawsoltes/dxf-inspector';
import { createAnalysisUI, type ReportRow } from '@wieslawsoltes/dxf-analysis';
import { aggregate } from '@wieslawsoltes/dxf-analysis/models';
import { createTreeDataGrid } from '@wieslawsoltes/dxf-tree-view';
import { createDrawingViewTools, type NavigationHost } from '@wieslawsoltes/dxf-drawing-tools';
const tree = new DxfParser().parse('');
const id: number = tree[0].id;
const diff = TreeDiffEngine.computeDiff(tree, tree, { ignoreHandles: true });
const diagnosis = new DXFDiagnosticsEngine(tree, 'test.dxf').runFullDiagnostics();
const rows: ReportRow<number>[] = [{ key: 1, values: ['Valve', 4] }];
const key: number = aggregate(rows, 0).buckets[0].keys[0];
declare const core: object, web: object, grid: object, renderer: object, dockyard: object;
const ui = createAnalysisUI({ window, treeDataGridCore: core, treeDataGridWeb: web, gridWeb: grid });
const view = new ui.AnalysisView<number>(document.body, { rows });
view.selectKey(key); view.setTheme('dark'); view.dispose();
const SourceView = createTreeDataGrid({ window, isHandleCode });
const sourceView = new SourceView(document.body, document.createElement('div'));
sourceView.setData(tree); sourceView.dispose();
const tools = createDrawingViewTools(renderer, dockyard); tools.gridShape(4, 1200, 800);
// @ts-expect-error Camera linking modes are deliberately finite.
tools.transferCamera({}, {}, 'invalid');
void [id, diff, diagnosis];
`);
    fs.writeFileSync(path.join(temp, 'consumer.cts'), `import inspector = require('@wieslawsoltes/dxf-inspector');
const parser = new inspector.DxfParser();
const tree = parser.parse('');
void tree;
`);
    process.stdout.write(run(process.env.TSC || 'tsc', ['--noEmit', '--strict', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--lib', 'es2022,dom', 'consumer.mts', 'consumer.cts']));
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ packages: names, version: '0.1.0', node: process.version, offline: true, cjsEsmIdentity: true, declarations: true }, null, 2) + '\n');
    console.log('Component package packing, offline installation and strict MTS/CTS declarations passed.');
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
