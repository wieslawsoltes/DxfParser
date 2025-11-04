#!/usr/bin/env node

/**
 * Sanity checks for SOLID fill support, WIPEOUT masking, and gradient transform handling.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const componentsDir = path.join(projectRoot, 'components');

const requiredComponents = [
  { file: 'rendering-surface-canvas.js' },
  { file: 'rendering-surface-webgl.js' },
  { file: 'rendering-renderer.js' }
];

const context = {
  console,
  window: {},
  DxfRendering: {},
  performance: { now: () => Date.now() }
};
context.global = context;
context.globalThis = context;
vm.createContext(context);

function loadComponent({ file }) {
  const fullPath = path.join(componentsDir, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  vm.runInContext(source, context, { filename: fullPath });
  if (context.window && context.window.DxfRendering) {
    context.DxfRendering = context.window.DxfRendering;
  }
}

requiredComponents.forEach(loadComponent);

const { RenderingSurfaceManager } = context.DxfRendering;
if (!RenderingSurfaceManager) {
  throw new Error('RenderingSurfaceManager failed to load.');
}

const manager = new RenderingSurfaceManager();

const squareGeometry = {
  vertices: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 10 }
  ]
};

const triangleGeometry = {
  vertices: [
    { x: 5, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 10 }
  ]
};

// _extractSolidOutline should normalise SOLID vertex ordering (1,2,4,3) and remove duplicates.
const outline = manager._extractSolidOutline(squareGeometry);
assert.ok(Array.isArray(outline), 'outline should be an array');
assert.strictEqual(outline.length, 4, 'outline should expose four unique corners');
const expectedCorners = [[0, 0], [10, 0], [10, 10], [0, 10]];
outline.forEach((pt, index) => {
  const expected = expectedCorners[index];
  assert.ok(
    Math.abs(pt.x - expected[0]) < 1e-6 && Math.abs(pt.y - expected[1]) < 1e-6,
    'outline order should match 1-2-4-3 corner ordering'
  );
});

// _processSolidEntity should emit fills with cloned color objects.
const sampleColor = { r: 1, g: 0, b: 0, a: 0.5, css: 'rgba(255,0,0,0.5)' };
const solidFills = [];
manager._processSolidEntity({
  geometry: triangleGeometry,
  transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  updateBounds: () => {},
  fillCollector: solidFills,
  color: sampleColor
});
assert.strictEqual(solidFills.length, 1, 'solid fill should be collected');
assert.notStrictEqual(solidFills[0].color, sampleColor, 'solid fill should clone color data');
assert.strictEqual(solidFills[0].color.css, sampleColor.css, 'solid fill color css should match source');
assert.strictEqual(Array.isArray(solidFills[0].points), true, 'solid fill should provide polygon points');
assert.strictEqual(solidFills[0].points.length >= 3, true, 'solid fill polygon should have at least three points');

// _processWipeoutEntity should use the mask color when not highlighted.
const wipeoutFills = [];
manager._processWipeoutEntity({
  geometry: squareGeometry,
  transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  updateBounds: () => {},
  fillCollector: wipeoutFills,
  highlightActive: false
});
assert.strictEqual(wipeoutFills.length, 1, 'wipeout fill should be collected');
assert.strictEqual(
  wipeoutFills[0].color.css,
  'rgba(11,24,40,1)',
  'wipeout fill should use overlay background mask colour'
);

// Highlighted wipeouts should adopt the renderer highlight colour.
const highlightedFills = [];
manager._processWipeoutEntity({
  geometry: squareGeometry,
  transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  updateBounds: () => {},
  fillCollector: highlightedFills,
  highlightActive: true
});
assert.strictEqual(
  highlightedFills[0].color.css,
  manager.highlightColor.css,
  'highlighted wipeout should reuse highlight colour'
);

// Gradient angle should incorporate entity transforms.
const baseGradient = {
  name: 'LINEAR',
  type: 0,
  angle: 0,
  shift: 0,
  tint: null,
  colors: [
    { position: 0, color: { r: 1, g: 0, b: 0, a: 1, css: 'rgba(255,0,0,1)' } },
    { position: 1, color: { r: 0, g: 0, b: 1, a: 1, css: 'rgba(0,0,255,1)' } }
  ]
};

const rotation90 = { a: 0, b: 1, c: -1, d: 0, tx: 0, ty: 0 };
const rotatedGradient = manager._createGradientInstance(baseGradient, rotation90);
assert.ok(rotatedGradient, 'rotated gradient should be produced');
assert.ok(
  Math.abs(rotatedGradient.angle - Math.PI / 2) < 1e-6,
  'rotation matrix should push gradient angle by 90 degrees'
);
assert.notStrictEqual(
  rotatedGradient.colors[0].color,
  baseGradient.colors[0].color,
  'gradient colours should be cloned'
);

const mirrorX = { a: -1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const mirroredGradient = manager._createGradientInstance(baseGradient, mirrorX);
assert.ok(
  Math.abs(Math.abs(mirroredGradient.angle) - Math.PI) < 1e-6,
  'mirroring across X should flip gradient direction'
);

const collapsedTransform = { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 };
const fallbackGradient = manager._createGradientInstance(baseGradient, collapsedTransform);
assert.strictEqual(
  fallbackGradient.angle,
  0,
  'degenerate transform should fall back to base gradient angle'
);

console.log('✓ SOLID, WIPEOUT, and gradient transform checks passed');
