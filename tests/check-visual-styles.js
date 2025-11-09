#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const componentsDir = path.join(projectRoot, 'components');

const context = {
  console,
  window: {},
  DxfRendering: {},
  performance: { now: () => Date.now() }
};
context.global = context;
context.globalThis = context;
vm.createContext(context);

const componentsToLoad = [
  'rendering-entities.js',
  'rendering-scene-graph.js',
  'rendering-document-builder.js',
  'rendering-surface-canvas.js',
  'rendering-surface-webgl.js',
  'rendering-text-layout.js',
  'rendering-renderer.js'
];

componentsToLoad.forEach((file) => {
  const fullPath = path.join(componentsDir, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  vm.runInContext(source, context, { filename: fullPath });
  if (context.window && context.window.DxfRendering) {
    context.DxfRendering = context.window.DxfRendering;
  }
});

const namespace = context.DxfRendering;
assert(namespace, 'DxfRendering namespace not initialised');

const Builder = namespace.RenderingDocumentBuilder;
const RenderingSurfaceManager = namespace.RenderingSurfaceManager;
assert(typeof Builder === 'function', 'RenderingDocumentBuilder unavailable');
assert(typeof RenderingSurfaceManager === 'function', 'RenderingSurfaceManager unavailable');

const tags = [
  { code: 0, value: 'SECTION' },
  { code: 2, value: 'HEADER' },
  { code: 0, value: 'ENDSEC' },
  { code: 0, value: 'SECTION' },
  { code: 2, value: 'TABLES' },
  { code: 0, value: 'TABLE' },
  { code: 2, value: 'LAYER' },
  { code: 70, value: '1' },
  { code: 0, value: 'LAYER' },
  { code: 2, value: '0' },
  { code: 70, value: '0' },
  { code: 62, value: '7' },
  { code: 6, value: 'CONTINUOUS' },
  { code: 0, value: 'ENDTAB' },
  { code: 0, value: 'TABLE' },
  { code: 2, value: 'VISUALSTYLE' },
  { code: 70, value: '2' },
  { code: 0, value: 'VISUALSTYLE' },
  { code: 5, value: 'AA' },
  { code: 330, value: '0' },
  { code: 100, value: 'AcDbObject' },
  { code: 100, value: 'AcDbVisualStyle' },
  { code: 2, value: '2DWireframe' },
  { code: 3, value: '2D Wireframe' },
  { code: 4, value: 'Standard 2D Wireframe' },
  { code: 70, value: '1' },
  { code: 0, value: 'VISUALSTYLE' },
  { code: 5, value: 'AB' },
  { code: 330, value: '0' },
  { code: 100, value: 'AcDbObject' },
  { code: 100, value: 'AcDbVisualStyle' },
  { code: 2, value: 'Realistic' },
  { code: 3, value: 'Realistic' },
  { code: 4, value: 'Realistic style' },
  { code: 70, value: '3' },
  { code: 0, value: 'ENDTAB' },
  { code: 0, value: 'TABLE' },
  { code: 2, value: 'VPORT' },
  { code: 70, value: '1' },
  { code: 0, value: 'VPORT' },
  { code: 2, value: '*ACTIVE' },
  { code: 5, value: '30' },
  { code: 70, value: '0' },
  { code: 10, value: '0' },
  { code: 20, value: '0' },
  { code: 11, value: '1' },
  { code: 21, value: '1' },
  { code: 12, value: '0' },
  { code: 22, value: '0' },
  { code: 16, value: '0' },
  { code: 26, value: '0' },
  { code: 36, value: '1' },
  { code: 17, value: '0' },
  { code: 27, value: '0' },
  { code: 37, value: '0' },
  { code: 40, value: '10' },
  { code: 41, value: '1' },
  { code: 42, value: '50' },
  { code: 43, value: '0' },
  { code: 44, value: '0' },
  { code: 71, value: '1' },
  { code: 348, value: 'AB' },
  { code: 282, value: '0' },
  { code: 292, value: '1' },
  { code: 0, value: 'ENDTAB' },
  { code: 0, value: 'ENDSEC' },
  { code: 0, value: 'SECTION' },
  { code: 2, value: 'ENTITIES' },
  { code: 0, value: 'LINE' },
  { code: 5, value: '200' },
  { code: 8, value: '0' },
  { code: 10, value: '0' },
  { code: 20, value: '0' },
  { code: 11, value: '5' },
  { code: 21, value: '0' },
  { code: 0, value: 'SOLID' },
  { code: 5, value: '201' },
  { code: 8, value: '0' },
  { code: 10, value: '0' },
  { code: 20, value: '0' },
  { code: 30, value: '0' },
  { code: 11, value: '5' },
  { code: 21, value: '0' },
  { code: 31, value: '0' },
  { code: 12, value: '5' },
  { code: 22, value: '5' },
  { code: 32, value: '0' },
  { code: 13, value: '0' },
  { code: 23, value: '5' },
  { code: 33, value: '0' },
  { code: 0, value: 'ENDSEC' },
  { code: 0, value: 'EOF' }
];

const builder = new Builder({ tags });
const doc = builder.build();
assert(doc && doc.tables, 'Document tables missing');

const visualStyles = doc.tables.visualStyles || {};
assert(visualStyles['2DWireframe'], '2DWireframe visual style missing');
assert.strictEqual(visualStyles['2DWireframe'].category, 'wireframe', '2DWireframe category mismatch');
assert(visualStyles['Realistic'], 'Realistic visual style missing');
assert.strictEqual(visualStyles['Realistic'].category, 'realistic', 'Realistic category mismatch');

const manager = new RenderingSurfaceManager();
manager.width = 800;
manager.height = 600;
manager.devicePixelRatio = 1;

let frame = manager._buildFrame(doc.sceneGraph, {});
assert(frame, 'Frame not produced');
assert(frame.visualStyle, 'Frame visual style missing');
assert.strictEqual(frame.visualStyle.category, 'realistic', 'Active visual style should be realistic');
assert(frame.polylines.length > 0, 'Realistic style should render polylines');
assert(Math.abs(frame.polylines[0].color.a - 0.5) < 1e-6, 'Realistic edges should be semi-transparent');
assert.strictEqual(frame.surface, 'canvas', 'Realistic style should prefer canvas surface');

manager.setVisualStyle('AA');
frame = manager._buildFrame(doc.sceneGraph, {});
assert(frame.visualStyle, 'Override frame missing visual style');
assert.strictEqual(frame.visualStyle.category, 'wireframe', 'Override visual style should be wireframe');
assert(frame.polylines.length > 0, 'Wireframe should retain polylines');
assert(Math.abs(frame.polylines[0].color.a - 1) < 1e-6, 'Wireframe edges should render fully opaque');
assert(frame.surface !== 'canvas', 'Wireframe style should not force canvas surface');

console.log('Visual style checks passed');
