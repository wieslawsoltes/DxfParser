#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const core = ['geometry', 'input', 'document', 'resources', 'proxy', 'text', 'compiler', 'renderer', 'surface-host']
    .map(name => 'packages/dxf-skia/src/' + name + '.js');
const modules = [...core, 'components/skia-rendering-adapter.js', 'components/rendering-property-grid.js', 'components/rendering-overlay.js', 'packages/dxf-compare/clouds.js', 'packages/dxf-compare/index.js', 'packages/dxf-compare/import.js', 'components/visual-compare.js'];
const bundle = files => '// Deterministic DxfSkia bundle. Native SkiaSharpWeb is supplied by the host.\n' + files
    .map(file => '\n// ' + file + '\n' + fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const exportsList = ['geometry', 'SpatialIndex', 'parseTags', 'iterateTags', 'decodeDxf', 'dxfText', 'binaryGroupType', 'DxfRecord', 'DxfDocument', 'Diagnostics', 'aciColor', 'colorObject', 'transparency', 'ResourceStore', 'resourceKey', 'ShapeFont', 'draftingGlyph', 'layoutText', 'fallbackTextWidth', 'SceneCompiler', 'plainText', 'decodeProxy', 'SkiaPainter', 'prepareFrame', 'projectedScene', 'hitTest', 'snap', 'nativeDash', 'clipInfiniteLine', 'SurfaceHost'];
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.mkdirSync(path.join(root, 'packages/dxf-skia/dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/dxf-rendering.global.js'), bundle(modules));
fs.writeFileSync(path.join(root, 'packages/dxf-skia/dist/dxf-skia.global.js'), bundle(core));
// Module consumers have a private namespace; importing does not mutate the host's
// global object. Only the explicit classic-browser build registers window.DxfSkia.
const isolated = 'const api = (() => {\nconst globalThis = Object.create(null);\nconst module = undefined;\n' + bundle(core) + '\nreturn globalThis.DxfSkia;\n})();\n';
fs.writeFileSync(path.join(root, 'packages/dxf-skia/dist/dxf-skia.cjs'), "'use strict';\n" + isolated + '\nmodule.exports = api;\n');
fs.writeFileSync(path.join(root, 'packages/dxf-skia/dist/dxf-skia.mjs'), isolated + '\nexport default api;\nexport const {' + exportsList.join(', ') + '} = api;\n');
fs.writeFileSync(path.join(root, 'packages/dxf-skia/index.mjs'), "import api from './index.js';\nexport default api;\nexport const {" + exportsList.join(', ') + '} = api;\n');
console.log('Built DxfSkia CJS/ESM/classic packages and app integration; no legacy engine is included.');
