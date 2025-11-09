#!/usr/bin/env node

/**
 * Unit tests for parser utility functions
 * Tests color conversion, boolean parsing, handle normalization, and classification
 * These functions will be extracted to rendering-parser-utils.js
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

function loadComponent(file) {
  const fullPath = path.join(componentsDir, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  vm.runInContext(source, context, { filename: fullPath });
  if (context.window && context.window.DxfRendering) {
    context.DxfRendering = context.window.DxfRendering;
  }
}

loadComponent('rendering-entities.js');
loadComponent('rendering-scene-graph.js');
loadComponent('rendering-document-builder.js');

const RenderingDocumentBuilder = context.DxfRendering.RenderingDocumentBuilder;
if (!RenderingDocumentBuilder) {
  console.error('Failed to load RenderingDocumentBuilder');
  process.exit(1);
}

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(err && err.stack ? err.stack : err);
  }
}

// Test toColorObject indirectly through material parsing (which uses true colors)
test('toColorObject is used in material color parsing', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'OBJECTS' },
    { code: 0, value: 'MATERIAL' },
    { code: 5, value: 'MAT1' },
    { code: 1, value: 'RedMaterial' },
    { code: 90, value: '16711680' }, // Red ambient color
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  assert(doc.materials.list.length > 0, 'Should parse material with color');
  assert(doc.materials.byHandle['MAT1'], 'Material should be in catalog');
});

test('toColorObject handles various color integer values', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'OBJECTS' },
    { code: 0, value: 'MATERIAL' },
    { code: 5, value: 'MAT2' },
    { code: 1, value: 'GreenMaterial' },
    { code: 90, value: '65280' }, // Green
    { code: 0, value: 'MATERIAL' },
    { code: 5, value: 'MAT3' },
    { code: 1, value: 'BlueMaterial' },
    { code: 90, value: '255' }, // Blue
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  assert(doc.materials.list.length === 2, 'Should parse both materials');
  assert(doc.materials.byHandle['MAT2'], 'Green material should exist');
  assert(doc.materials.byHandle['MAT3'], 'Blue material should exist');
});

test('toColorObject is used for material color values', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'OBJECTS' },
    { code: 0, value: 'MATERIAL' },
    { code: 5, value: 'MAT4' },
    { code: 1, value: 'TransparentMaterial' },
    { code: 90, value: '8421504' }, // Gray color uses toColorObject
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  assert(doc.materials.list.length > 0, 'Should parse material with color');
  const mat = doc.materials.byHandle['MAT4'];
  assert(mat, 'Material should be in catalog');
});

// Test normalizeHandle
test('normalizeHandle converts to uppercase', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'OBJECTS' },
    { code: 0, value: 'MATERIAL' },
    { code: 5, value: 'abc123' }, // Lowercase handle
    { code: 1, value: 'TestMaterial' },
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  assert(doc.materials.byHandle['ABC123'], 'Handle should be uppercase ABC123');
  assert(!doc.materials.byHandle['abc123'], 'Lowercase handle should not exist');
});

test('normalizeHandle trims whitespace', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'OBJECTS' },
    { code: 0, value: 'MATERIAL' },
    { code: 5, value: '  A1  ' }, // Handle with whitespace
    { code: 1, value: 'TestMaterial' },
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  assert(doc.materials.byHandle['A1'], 'Handle should be trimmed to A1');
  assert(!doc.materials.byHandle['  A1  '], 'Whitespace should be removed');
});

test('normalizeHandle handles null/undefined', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'ENTITIES' },
    { code: 0, value: 'LINE' },
    { code: 8, value: '0' },
    // No handle specified
    { code: 10, value: '0' },
    { code: 20, value: '0' },
    { code: 11, value: '1' },
    { code: 21, value: '1' },
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  // Should handle missing handles gracefully
  assert(doc.sceneGraph.modelSpace.length > 0, 'Should parse entity without handle');
});

// Test classifyVisualStyleName
test('classifyVisualStyleName identifies wireframe', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'TABLES' },
    { code: 0, value: 'TABLE' },
    { code: 2, value: 'VISUALSTYLE' },
    { code: 0, value: 'VISUALSTYLE' },
    { code: 5, value: 'A1' },
    { code: 2, value: '2DWireframe' },
    { code: 3, value: '2D Wireframe' },
    { code: 0, value: 'ENDTAB' },
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  const visualStyle = doc.tables.visualStyles['2DWireframe'];
  assert(visualStyle, 'Visual style should be parsed');
  assert.strictEqual(visualStyle.category, 'wireframe', 'Should classify as wireframe');
});

test('classifyVisualStyleName identifies realistic', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'TABLES' },
    { code: 0, value: 'TABLE' },
    { code: 2, value: 'VISUALSTYLE' },
    { code: 0, value: 'VISUALSTYLE' },
    { code: 5, value: 'A2' },
    { code: 2, value: 'Realistic' },
    { code: 3, value: 'Realistic Rendering' },
    { code: 0, value: 'ENDTAB' },
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  const visualStyle = doc.tables.visualStyles['Realistic'];
  assert(visualStyle, 'Visual style should be parsed');
  assert.strictEqual(visualStyle.category, 'realistic', 'Should classify as realistic');
});

test('classifyVisualStyleName identifies conceptual', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'TABLES' },
    { code: 0, value: 'TABLE' },
    { code: 2, value: 'VISUALSTYLE' },
    { code: 0, value: 'VISUALSTYLE' },
    { code: 5, value: 'A3' },
    { code: 2, value: 'Conceptual' },
    { code: 3, value: 'Conceptual Style' },
    { code: 0, value: 'ENDTAB' },
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  const visualStyle = doc.tables.visualStyles['Conceptual'];
  assert(visualStyle, 'Visual style should be parsed');
  assert.strictEqual(visualStyle.category, 'conceptual', 'Should classify as conceptual');
});

test('classifyVisualStyleName identifies shaded', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'TABLES' },
    { code: 0, value: 'TABLE' },
    { code: 2, value: 'VISUALSTYLE' },
    { code: 0, value: 'VISUALSTYLE' },
    { code: 5, value: 'A4' },
    { code: 2, value: 'Shaded' },
    { code: 3, value: 'Shaded Rendering' },
    { code: 0, value: 'ENDTAB' },
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  const visualStyle = doc.tables.visualStyles['Shaded'];
  assert(visualStyle, 'Visual style should be parsed');
  assert.strictEqual(visualStyle.category, 'shaded', 'Should classify as shaded');
});

test('classifyVisualStyleName identifies hidden', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'TABLES' },
    { code: 0, value: 'TABLE' },
    { code: 2, value: 'VISUALSTYLE' },
    { code: 0, value: 'VISUALSTYLE' },
    { code: 5, value: 'A5' },
    { code: 2, value: 'Hidden' },
    { code: 3, value: 'Hidden Line' },
    { code: 0, value: 'ENDTAB' },
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  const visualStyle = doc.tables.visualStyles['Hidden'];
  assert(visualStyle, 'Visual style should be parsed');
  assert.strictEqual(visualStyle.category, 'hidden', 'Should classify as hidden');
});

test('classifyVisualStyleName defaults to custom for unknown styles', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'TABLES' },
    { code: 0, value: 'TABLE' },
    { code: 2, value: 'VISUALSTYLE' },
    { code: 0, value: 'VISUALSTYLE' },
    { code: 5, value: 'A6' },
    { code: 2, value: 'MyCustomStyle' },
    { code: 3, value: 'My Custom Visual Style' },
    { code: 0, value: 'ENDTAB' },
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  const visualStyle = doc.tables.visualStyles['MyCustomStyle'];
  assert(visualStyle, 'Visual style should be parsed');
  assert.strictEqual(visualStyle.category, 'custom', 'Should classify as custom');
});

// Test boolFromValue through actual parsing
test('boolFromValue handles flag values correctly', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'TABLES' },
    { code: 0, value: 'TABLE' },
    { code: 2, value: 'LAYER' },
    { code: 0, value: 'LAYER' },
    { code: 2, value: 'TestLayer' },
    { code: 70, value: '0' }, // Standard flags value
    { code: 0, value: 'ENDTAB' },
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  const layer = doc.tables.layers['TestLayer'];
  assert(layer, 'Layer should be parsed with boolean flags');
});

// Test ensureArray through table parsing
test('ensureArray creates array for first entry', () => {
  const tags = [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'TABLES' },
    { code: 0, value: 'TABLE' },
    { code: 2, value: 'LAYER' },
    { code: 0, value: 'LAYER' },
    { code: 2, value: 'Layer1' },
    { code: 0, value: 'LAYER' },
    { code: 2, value: 'Layer2' },
    { code: 0, value: 'ENDTAB' },
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ];

  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();

  assert(doc.tables.layers['Layer1'], 'First layer should be parsed');
  assert(doc.tables.layers['Layer2'], 'Second layer should be parsed');
});

console.log('');
if (failures === 0) {
  console.log('✓ All parser utility tests passed');
} else {
  console.error(`✗ ${failures} test(s) failed`);
}

process.exit(failures > 0 ? 1 : 0);
