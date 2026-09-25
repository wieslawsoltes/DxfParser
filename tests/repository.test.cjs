'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {execFileSync, spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const builder = require('../scripts/build-rendering-bundle.js');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const suites = JSON.parse(read('tests/suites.json'));

function sourceFiles(directory = root) {
    return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        if (['.git', 'vendor', 'dist', 'test-results', 'node_modules', '__pycache__', '.venv'].includes(entry.name)) return [];
        const full = path.join(directory, entry.name);
        return entry.isDirectory() ? sourceFiles(full) : [path.relative(root, full).split(path.sep).join('/')];
    });
}

test('first-party documentation is limited to current package and root READMEs', () => {
    assert.deepEqual(sourceFiles().filter(file => file.endsWith('.md')).sort(),
        ['README.md', 'packages/dxf-compare/README.md', 'packages/dxf-skia/README.md']);
    for (const directory of ['docs', 'tests/baselines', 'tests/outputs', 'tests/trueview'])
        assert.equal(fs.existsSync(path.join(root, directory)), false, directory);
});

test('current README links resolve within the checkout', () => {
    for (const file of sourceFiles().filter(file => file.endsWith('.md'))) {
        for (const match of read(file).matchAll(/\]\(([^)]+)\)/g)) {
            if (/^(?:https?:|#)/.test(match[1])) continue;
            const target = path.resolve(root, path.dirname(file), match[1].split('#')[0]);
            assert.ok(fs.existsSync(target), `${file}: ${match[1]}`);
        }
    }
});

test('every executable browser suite is registered exactly once', () => {
    const registered = Object.values(suites).flat().map(name => `tests/${name}.py`).sort();
    const defined = sourceFiles().filter(file => file.startsWith('tests/') && file.endsWith('.py') && /def test_/.test(read(file))).sort();
    assert.equal(new Set(registered).size, registered.length);
    assert.deepEqual(registered, defined);
    const output = execFileSync(process.env.PYTHON || 'python3', ['tests/run.py', 'browser', '--list'], {cwd: root, encoding: 'utf8'});
    for (const suite of [...suites.workspace, ...suites.analysis, ...suites.drawings]) assert.ok(output.includes(`tests/${suite}.py`));
    assert.ok(!output.includes('tests/skia-gpu.py'));
});

test('HTML entry points resolve source modules without first-party distributions', () => {
    for (const file of ['index.html', 'editor/index.html', 'tests/skia-gpu.html']) {
        const html = read(file);
        const block = html.match(/<!-- DXF rendering sources:[\s\S]*?<!-- End DXF rendering sources\. -->/)[0];
        const matches = [...block.matchAll(/<script([^>]*)src="([^"]+)"([^>]*)><\/script>/g)];
        const files = matches.map(match => path.relative(root, path.resolve(root, path.dirname(file), match[2])).split(path.sep).join('/'));
        assert.deepEqual(files, builder.modules);
        for (const module of files) assert.ok(fs.existsSync(path.join(root, module)), module);
        for (const match of matches) assert.equal(/\bdefer\b/.test(match[1] + match[3]), file.startsWith('editor/'));
        assert.ok(!html.includes('dist/dxf-rendering.global.js'));
    }
});

test('classic source modules and generated core expose equivalent geometry', () => {
    const renderer = require('../packages/dxf-skia/build.cjs');
    const source = vm.createContext({console});
    for (const name of renderer.core) vm.runInContext(read(`packages/dxf-skia/src/${name}.js`), source);
    const bundle = vm.createContext({console});
    vm.runInContext(renderer.artifacts().get('dist/dxf-skia.global.js'), bundle);
    const evaluate = context => vm.runInContext(`JSON.stringify({
        exports: Object.keys(DxfSkia).sort(),
        scene: new DxfSkia.SceneCompiler(new DxfSkia.DxfDocument('0\\nSECTION\\n2\\nENTITIES\\n0\\nLINE\\n10\\n0\\n20\\n0\\n11\\n10\\n21\\n10\\n0\\nENDSEC\\n0\\nEOF\\n')).compile().primitives.map(p => ({kind:p.kind,path:p.path,style:p.style}))
    })`, context);
    assert.equal(evaluate(source), evaluate(bundle));
});

test('cleanup removes only first-party generated output and optionally test evidence', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxf-clean-test-'));
    try {
        fs.mkdirSync(path.join(temp, 'scripts'));
        fs.copyFileSync(path.join(root, 'scripts/clean.mjs'), path.join(temp, 'scripts/clean.mjs'));
        for (const file of ['dist/app.js', 'packages/dxf-skia/dist/api.js', 'test-results/evidence.json', 'vendor/skiasharpweb/dist/runtime.js']) {
            fs.mkdirSync(path.dirname(path.join(temp, file)), {recursive: true});
            fs.writeFileSync(path.join(temp, file), 'sentinel');
        }
        const run = args => spawnSync(process.execPath, ['scripts/clean.mjs', ...args], {cwd: temp});
        assert.equal(run(['--unknown']).status, 2);
        assert.ok(fs.existsSync(path.join(temp, 'dist/app.js')));
        assert.equal(run([]).status, 0);
        assert.equal(fs.existsSync(path.join(temp, 'dist')), false);
        assert.equal(fs.existsSync(path.join(temp, 'packages/dxf-skia/dist')), false);
        assert.ok(fs.existsSync(path.join(temp, 'test-results/evidence.json')));
        assert.equal(run(['--tests']).status, 0);
        assert.equal(fs.existsSync(path.join(temp, 'test-results')), false);
        assert.equal(fs.readFileSync(path.join(temp, 'vendor/skiasharpweb/dist/runtime.js'), 'utf8'), 'sentinel');
    } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('generated files are ignored but vendor runtime files are retained', () => {
    // Archives have no index; the cleanup and source-only HTTP checks still run there.
    if (!fs.existsSync(path.join(root, '.git'))) return;
    const tracked = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
    assert.equal(tracked.some(file => /^(?:dist\/|packages\/[^/]+\/dist\/|test-results\/)/.test(file)), false);
    assert.ok(tracked.includes('vendor/skiasharpweb/dist/vendor/canvaskit.wasm'));
    const ignored = execFileSync('git', ['check-ignore', '--no-index', 'dist/check.js', 'packages/dxf-skia/dist/check.js', 'test-results/check.json'], {cwd: root, encoding: 'utf8'});
    assert.equal(ignored.trim().split('\n').length, 3);
});
