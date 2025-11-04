#!/usr/bin/env node

/**
 * Validation for MATERIAL object integration and renderer material usage.
 */

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

const componentFiles = [
  'rendering-entities.js',
  'rendering-scene-graph.js',
  'rendering-document-builder.js',
  'rendering-surface-canvas.js',
  'rendering-surface-webgl.js',
  'rendering-renderer.js'
];

componentFiles.forEach((file) => {
  const fullPath = path.join(componentsDir, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  vm.runInContext(source, context, { filename: fullPath });
});

if (context.window && context.window.DxfRendering) {
  context.DxfRendering = context.window.DxfRendering;
}

const { RenderingDocumentBuilder, RenderingSurfaceManager } = context.DxfRendering;

if (!RenderingDocumentBuilder || !RenderingSurfaceManager) {
  throw new Error('Failed to initialise rendering components for material checks.');
}

function parseDxfText(text) {
  const lines = text.split(/\r?\n/);
  const tags = [];
  let lineIndex = 0;
  while (lineIndex < lines.length) {
    let codeLine = lines[lineIndex];
    if (codeLine === undefined) break;
    codeLine = codeLine.trim();
    if (codeLine === '') {
      lineIndex += 1;
      continue;
    }
    const code = parseInt(codeLine, 10);
    if (Number.isNaN(code)) {
      lineIndex += 1;
      continue;
    }
    const valueLine = lineIndex + 1 < lines.length ? lines[lineIndex + 1] : '';
    tags.push({ line: lineIndex + 1, code, value: valueLine });
    lineIndex += 2;
  }
  return tags;
}

const sampleDxf = [
  '0',
  'SECTION',
  '2',
  'TABLES',
  '0',
  'ENDSEC',
  '0',
  'SECTION',
  '2',
  'OBJECTS',
  '0',
  'MATERIAL',
  '5',
  'ABCD',
  '330',
  '1F',
  '1',
  'MatName',
  '2',
  'Mat description',
  '40',
  '0.4',
  '41',
  '0.75',
  '42',
  '0.5',
  '43',
  '1',
  '43',
  '0',
  '43',
  '0',
  '43',
  '1',
  '44',
  '0.35',
  '45',
  '0.9',
  '46',
  '0.2',
  '47',
  '1',
  '47',
  '0',
  '47',
  '0',
  '47',
  '1',
  '48',
  '0.4',
  '90',
  '16711680',
  '90',
  '20',
  '91',
  '16711680',
  '92',
  '16777215',
  '140',
  '0.65',
  '3',
  'diffuse.jpg',
  '7',
  'opacity.png',
  '175',
  '1',
  '176',
  '1',
  '177',
  '1',
  '178',
  '1',
  '465',
  '0.8',
  '0',
  'ENDSEC',
  '0',
  'SECTION',
  '2',
  'ENTITIES',
  '0',
  'SOLID',
  '5',
  '200',
  '8',
  '0',
'10',
'0',
'20',
'0',
'30',
'0',
'10',
'100',
'20',
'0',
'30',
'0',
'10',
'0',
'20',
'100',
'30',
'0',
'10',
'100',
'20',
'100',
'30',
'0',
  '347',
  'ABCD',
  '0',
  'ENDSEC',
  '0',
  'EOF'
].join('\n');

const tags = parseDxfText(sampleDxf);
const builder = new RenderingDocumentBuilder({ tags });
const document = builder.build();

assert.strictEqual(document.materials.list.length, 1, 'Expected exactly one material definition');
const catalog = document.materials;
const material = catalog.byHandle['ABCD'];
assert(material, 'Material handle ABCD should be present');
assert.strictEqual(material.name, 'MatName');
assert.strictEqual(material.maps.diffuse.file, 'diffuse.jpg');
assert.strictEqual(material.maps.opacity.file, 'opacity.png');

const sceneMaterial = document.sceneGraph.materials['ABCD'];
assert(sceneMaterial, 'Scene graph should expose material by handle');

const entity = document.sceneGraph.modelSpace[0];
assert(entity, 'Scene graph should contain the SOLID entity');
assert(entity.resolved.material, 'Entity should resolve material metadata');
assert.strictEqual(entity.resolved.material.name, 'MatName');

const manager = new RenderingSurfaceManager();
manager.width = 400;
manager.height = 300;
manager.devicePixelRatio = 1;

manager.setVisualStyle('realistic');

const frame = manager._buildFrame(document.sceneGraph);
assert(frame.fills.length > 0, 'Frame should include fill geometry for SOLID');

const fill = frame.fills[0];
assert(fill.material, 'Fill should carry material descriptor');
assert.strictEqual(fill.material.handle, 'ABCD');
assert.strictEqual(fill.material.name, 'MatName');
assert.strictEqual(fill.material.maps.diffuse.file, 'diffuse.jpg');
assert.strictEqual(fill.hasMaterialTexture, true, 'Material texture should trigger texture flag');
assert.strictEqual(frame.surface, 'canvas', 'Material texture should force canvas fallback');

assert(fill.color, 'Fill color should be defined');
assert(Math.abs(fill.color.a - 0.65) < 1e-6, 'Material opacity should influence fill alpha');
assert(fill.color.r < 1 && fill.color.r > 0.7, 'Diffuse factor should scale color intensity');

console.log('✓ MATERIAL parsing and rendering integration checks passed');
