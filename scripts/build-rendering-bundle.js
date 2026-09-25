#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const renderer = require('../packages/dxf-skia/build.cjs');
const root = path.resolve(__dirname, '..');
const modules = Object.freeze([
    ...renderer.core.map(name => 'packages/dxf-skia/src/' + name + '.js'),
    'components/rendering-overlay.js',
    'packages/dxf-compare/clouds.js',
    'packages/dxf-compare/index.js',
    'packages/dxf-compare/import.js',
    'components/visual-compare.js'
]);

const viewSources = Object.freeze(['documents', 'surface-manager', 'services', 'property-inspector']);
function renderingServicesBundle() {
    const source = viewSources.map(name => {
        const file = 'packages/dxf-rendering-view/src/' + name + '.mjs';
        const text = fs.readFileSync(path.join(root, file), 'utf8')
            .replace(/^import \{[^\n]+\} from '[^']+';\n/gm, '')
            .replace(/^export function /gm, 'function ');
        if (/^\s*(?:import|export)\s/m.test(text)) throw new Error('Unsupported classic factory syntax: ' + file);
        return '// ' + file + '\n' + text;
    }).join('\n');
    return '(function(root){\n' + source + `
const url = typeof document === 'undefined' ? null : document.currentScript?.src;
let runtime;
const initializeSkia = () => runtime ||= (url
    ? import(new URL('../vendor/skiasharpweb/dist/package/browser.js', url).href).then(m => m.Initialize({fonts:false}))
    : Promise.reject(new Error('Inject a native Skia initializer.'))).catch(error => {runtime=null;throw error;});
const services = createRenderingServices({renderer:root.DxfSkia, initialize:initializeSkia, onObserverError:error=>console.warn(error)});
Object.assign(root.DxfRendering ||= {}, services, {initializeSkia});
if (typeof window !== 'undefined') root.DxfRendering.RenderingPropertyGrid = createPropertyInspector({window,
    createRecordView:(container,options)=>new (root.DxfAnalysis?.AnalysisView || root.DxfGrid.GridView)(container,options)});
})(globalThis);\n`;
}
function applicationBundle() {
    const core = modules.slice(0, renderer.core.length);
    const rest = modules.slice(renderer.core.length);
    return renderer.bundle(core, root) + '\n' + renderingServicesBundle() + renderer.bundle(rest, root);
}

function artifacts() {
    return new Map([
        ['dist/dxf-rendering.global.js', applicationBundle()],
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

module.exports = {modules, viewSources, artifacts, build};
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
