#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = Object.freeze(["geometry", "input", "document", "resources", "proxy", "text", "compiler", "renderer", "surface-host"]);
const exportsList = ['geometry', 'SpatialIndex', 'parseTags', 'iterateTags', 'decodeDxf', 'dxfText', 'binaryGroupType', 'DxfRecord', 'DxfDocument', 'Diagnostics', 'aciColor', 'colorObject', 'transparency', 'ResourceStore', 'resourceKey', 'ShapeFont', 'draftingGlyph', 'layoutText', 'fallbackTextWidth', 'SceneCompiler', 'plainText', 'decodeProxy', 'SkiaPainter', 'prepareFrame', 'projectedScene', 'hitTest', 'snap', 'nativeDash', 'clipInfiniteLine', 'SurfaceHost'];

function bundle(files, root) {
    return '// Deterministic DxfSkia bundle. Native SkiaSharpWeb is supplied by the host.\n' + files
        .map(file => '\n// ' + file + '\n' + fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
}

function artifacts() {
    const source = bundle(core.map(name => 'src/' + name + '.js'), __dirname);
    const isolated = 'const api = (() => {\nconst globalThis = Object.create(null);\nconst module = undefined;\n' + source + '\nreturn globalThis.DxfSkia;\n})();\n';
    return new Map([
        ['dist/dxf-skia.global.js', source],
        ['dist/dxf-skia.cjs', "'use strict';\n" + isolated + '\nmodule.exports = api;\n'],
        ['dist/dxf-skia.mjs', isolated + '\nexport default api;\nexport const {' + exportsList.join(', ') + '} = api;\n']
    ]);
}

function build() {
    for (const [file, content] of artifacts()) {
        const target = path.join(__dirname, file);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, content);
    }
}

module.exports = {core, bundle, artifacts, build};
if (require.main === module) build();
