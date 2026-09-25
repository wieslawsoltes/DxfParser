#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const renderer = require('../packages/dxf-skia/build.cjs');
const root = path.resolve(__dirname, '..');
const modules = Object.freeze([
    ...renderer.core.map(name => 'packages/dxf-skia/src/' + name + '.js'),
    'components/skia-rendering-adapter.js',
    'components/rendering-property-grid.js',
    'components/rendering-overlay.js',
    'packages/dxf-compare/clouds.js',
    'packages/dxf-compare/index.js',
    'packages/dxf-compare/import.js',
    'components/visual-compare.js'
]);

function artifacts() {
    return new Map([
        ['dist/dxf-rendering.global.js', renderer.bundle(modules, root)],
        ...[...renderer.artifacts()].map(([file, content]) => ['packages/dxf-skia/' + file, content])
    ]);
}

function build() {
    for (const [file, content] of artifacts()) {
        const target = path.join(root, file);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, content);
    }
}

module.exports = {modules, artifacts, build};
if (require.main === module) {
    const args = process.argv.slice(2);
    if (!args.length) {
        build();
        console.log('Built optional application bundle and DxfSkia CJS/ESM/classic distributions.');
    } else if (args.length === 1 && args[0] === '--check') {
        for (const [file, content] of artifacts()) {
            if (!fs.existsSync(path.join(root, file)) || fs.readFileSync(path.join(root, file), 'utf8') !== content) {
                console.error('Missing or stale generated output: ' + file);
                process.exitCode = 1;
            }
        }
    } else {
        console.error('Usage: node scripts/build-rendering-bundle.js [--check]');
        process.exitCode = 2;
    }
}
