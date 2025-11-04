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

function parseDxfText(text) {
  const lines = text.split(/\r?\n/);
  const tags = [];
  let idx = 0;
  while (idx < lines.length) {
    const codeLine = lines[idx];
    if (codeLine === undefined) {
      break;
    }
    const trimmed = codeLine.trim();
    if (trimmed === '') {
      idx += 1;
      continue;
    }
    const code = parseInt(trimmed, 10);
    if (Number.isNaN(code)) {
      idx += 1;
      continue;
    }
    const valueLine = idx + 1 < lines.length ? lines[idx + 1] : '';
    tags.push({ code, value: valueLine });
    idx += 2;
  }
  return tags;
}

const sampleDxf = [
  '0',
  'SECTION',
  '2',
  'TABLES',
  '0',
  'TABLE',
  '2',
  'VPORT',
  '0',
  'VPORT',
  '2',
  '*ACTIVE',
  '5',
  '30',
  '70',
  '0',
  '10',
  '0',
  '20',
  '0',
  '11',
  '1',
  '21',
  '1',
  '12',
  '0',
  '22',
  '0',
  '16',
  '0',
  '26',
  '0',
  '36',
  '1',
  '17',
  '0',
  '27',
  '0',
  '37',
  '0',
  '40',
  '10',
  '41',
  '1',
  '42',
  '50',
  '43',
  '0',
  '44',
  '0',
  '50',
  '0',
  '51',
  '0',
  '71',
  '0',
  '72',
  '0',
  '73',
  '1',
  '110',
  '0',
  '120',
  '0',
  '130',
  '0',
  '111',
  '1',
  '121',
  '0',
  '131',
  '0',
  '112',
  '0',
  '122',
  '1',
  '132',
  '0',
  '345',
  '0',
  '346',
  '0',
  '348',
  '0',
  '361',
  'SUN1',
  '332',
  'BA1',
  '292',
  '1',
  '282',
  '1',
  '141',
  '0.5',
  '142',
  '0.3',
  '63',
  '121',
  '421',
  '8421504',
  '0',
  'ENDTAB',
  '0',
  'ENDSEC',
  '0',
  'SECTION',
  '2',
  'OBJECTS',
  '0',
  'BACKGROUND',
  '5',
  'BA1',
  '330',
  '0',
  '100',
  'AcDbBackground',
  '100',
  'AcDbSolidBackground',
  '90',
  '1',
  '63',
  '3',
  '420',
  '16711680',
  '0',
  'SUN',
  '5',
  'SUN1',
  '330',
  '0',
  '100',
  'AcDbSun',
  '90',
  '1',
  '290',
  '1',
  '63',
  '2',
  '40',
  '0.75',
  '291',
  '1',
  '91',
  '2451545',
  '92',
  '43200',
  '292',
  '0',
  '70',
  '1',
  '71',
  '512',
  '280',
  '0.1',
  '0',
  'ENDSEC',
  '0',
  'SECTION',
  '2',
  'ENTITIES',
  '0',
  'LIGHT',
  '5',
  'L1',
  '330',
  '0',
  '100',
  'AcDbEntity',
  '8',
  '0',
  '100',
  'AcDbLight',
  '90',
  '1',
  '1',
  'Lamp1',
  '70',
  '2',
  '290',
  '1',
  '291',
  '1',
  '40',
  '1.25',
  '10',
  '5',
  '20',
  '5',
  '30',
  '0',
  '11',
  '0',
  '21',
  '0',
  '31',
  '1',
  '72',
  '1',
  '292',
  '1',
  '41',
  '2.5',
  '42',
  '15',
  '50',
  '10',
  '51',
  '30',
  '293',
  '1',
  '73',
  '0',
  '91',
  '256',
  '280',
  '0.2',
  '0',
  'ENDSEC',
  '0',
  'EOF'
].join('\n');

const tags = parseDxfText(sampleDxf);
const builder = new RenderingDocumentBuilder({ tags });
const doc = builder.build();

assert.ok(doc.backgrounds.list.length === 1, 'Expected one background object');
assert.ok(doc.suns.list.length === 1, 'Expected one sun object');

const surfaceManager = new RenderingSurfaceManager();
const frame = surfaceManager.renderScene(doc.sceneGraph);

assert.ok(frame.environment, 'Frame should include environment descriptor');
assert.ok(frame.environment.background, 'Background descriptor missing');
assert.strictEqual(frame.environment.background.type, 'solid', 'Solid background expected');
assert.ok(typeof frame.environment.background.solid.css === 'string', 'Background CSS missing');
assert.ok(frame.environment.sun && frame.environment.sun.status === true, 'Sun data not resolved');
assert.ok(frame.lights && frame.lights.length === 1, 'Expected one light in frame');
const light = frame.lights[0];
assert.strictEqual(light.type, 2, 'Light type should be point');
assert.ok(Array.isArray(light.screenPosition), 'Light should have screen position');
assert.ok(frame.points.some((pt) => pt.meta && pt.meta.geometryKind === 'light'), 'Light point not rendered');

console.log('Environment integration checks passed.');
