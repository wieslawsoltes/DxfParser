#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm'), assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const builder = require('./build-rendering-bundle.js');
for (const page of ['index.html', 'editor/index.html', 'tests/skia-gpu.html']) {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    const block = text.match(/<!-- DXF rendering sources:[\s\S]*?<!-- End DXF rendering sources\. -->/);
    assert.ok(block, 'Missing source-module declaration in ' + page);
    const sources = [...block[0].matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)]
        .map(match => path.relative(root, path.resolve(root, path.dirname(page), match[1])).split(path.sep).join('/'));
    assert.deepEqual(sources, builder.modules, 'Source dependency order differs from the bundle: ' + page);
    assert.ok(!text.includes('dist/dxf-rendering.global.js'), 'Static entry point depends on generated output: ' + page);
}
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
// Clean checkouts have no distributions: compare two builds, not tracked output.
builder.build();
const files = [...builder.artifacts().keys()];
const before = files.map(hash);
builder.build();
assert.deepEqual(files.map(hash), before, 'Repeated builds must be byte-identical.');
execFileSync(process.execPath, ['scripts/build-rendering-bundle.js', '--check'], {cwd: root, stdio: 'inherit'});
const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'packages/dxf-skia/dist/dxf-skia.global.js'), 'utf8'), context);
assert.equal(typeof context.DxfSkia.SceneCompiler, 'function');
assert.equal(typeof context.DxfSkia.SurfaceHost, 'function');
for (const dir of ['dockyard', 'ribbonweb', 'gridweb', 'richtextweb', 'treedatagridweb', 'office-compat', 'skiasharpweb']) {
    const location = path.join(root, 'vendor', dir), manifest = fs.readFileSync(path.join(location, 'SHA256SUMS'), 'utf8');
    for (const line of manifest.trim().split('\n')) {
        const match = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line);
        assert.ok(match, 'Malformed manifest line');
        const relative = match[2].replace(/^\.\//, '');
        assert.ok(!relative.includes('..'));
        const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(location, relative))).digest('hex');
        assert.equal(actual, match[1], `${dir}/${relative}`);
    }
}
const scan = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
        scan(full);
    else
        assert.ok(!/\.(ttf|otf|ttc|woff2?|shx)$/i.test(entry.name), 'Font file must not be distributed: ' + full);
} };
scan(path.join(root, 'vendor/skiasharpweb'));
scan(path.join(root, 'packages/dxf-skia'));
const nativeManifest = JSON.parse(fs.readFileSync(path.join(root, 'vendor/skiasharpweb/dist/vendor/native-build-manifest.json')));
for (const [name, expected] of Object.entries(nativeManifest.artifacts))
    assert.equal(hash('vendor/skiasharpweb/dist/vendor/' + name), expected, 'Native artifact identity: ' + name);
const localPatches = JSON.parse(fs.readFileSync(path.join(root, 'vendor/skiasharpweb/LOCAL-PATCHES.json')));
assert.equal(localPatches.wasmUnchanged, true);
assert.equal(nativeManifest.artifacts['canvaskit.wasm'], nativeManifest.upstreamArtifacts['canvaskit.wasm']);
for (const entry of localPatches.files)
    assert.equal(hash('vendor/skiasharpweb/' + entry.path), entry.patchedSha256, 'Local patch identity: ' + entry.path);
console.log('Source entry points, reproducible bundles, classic consumer, vendor checksums and font-free distribution checks PASSED.');
