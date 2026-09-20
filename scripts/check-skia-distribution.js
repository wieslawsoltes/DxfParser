#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm'), assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const removed = ['acis-parser', 'catmull-clark-subdivision', 'point-cloud-loader', 'procedural-surfaces', 'rendering-data-controller', 'rendering-document-builder', 'rendering-entities', 'rendering-renderer', 'rendering-scene-graph', 'rendering-surface-canvas', 'rendering-surface-webgl', 'rendering-tessellation', 'rendering-text-layout', 'shx-font-loader'];
for (const name of removed)
    assert.equal(fs.existsSync(path.join(root, 'components', name + '.js')), false, 'Old engine remains: ' + name);
for (const page of ['index.html', 'editor/index.html']) {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    for (const name of removed)
        assert.ok(!text.includes(name + '.js'), 'Old script in ' + page);
    assert.ok(text.includes('dist/dxf-rendering.global.js'));
}
const app = fs.readFileSync(path.join(root, 'dist/dxf-rendering.global.js'), 'utf8');
for (const token of ['RenderEntityFactories', 'class RenderingTessellator', 'class WebGLSurface', 'class CanvasSurface'])
    assert.ok(!app.includes(token), 'Old engine implementation in app bundle: ' + token);
const files = ['dist/dxf-rendering.global.js', 'packages/dxf-skia/dist/dxf-skia.global.js', 'packages/dxf-skia/dist/dxf-skia.cjs', 'packages/dxf-skia/dist/dxf-skia.mjs', 'packages/dxf-skia/index.mjs'];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const before = files.map(hash);
execFileSync(process.execPath, ['scripts/build-rendering-bundle.js'], { cwd: root, stdio: 'inherit' });
assert.deepEqual(files.map(hash), before, 'Generated bundles were stale.');
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
console.log('Removed-engine, deterministic bundle, classic consumer, all vendor checksum and font-free checks PASSED.');
