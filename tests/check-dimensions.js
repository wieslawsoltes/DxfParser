#!/usr/bin/env node

/**
 * Dimension measurement and formatting regression checks.
 * Exercises `_formatDimensionMeasurement` across unit/tolerance permutations
 * to ensure style-driven behaviour remains stable.
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
  DxfRendering: {}
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

loadComponent('rendering-renderer.js');

const RenderingSurfaceManager = context.DxfRendering && context.DxfRendering.RenderingSurfaceManager;
if (!RenderingSurfaceManager) {
  console.error('Unable to load RenderingSurfaceManager from rendering-renderer.js');
  process.exit(1);
}

const renderer = new RenderingSurfaceManager();

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

function makeGeometry(overrides = {}) {
  return Object.assign({
    dimensionType: 0,
    dimensionSubtype: 0,
    dimensionMeasurementSettings: {
      linearUnitFormat: 1,
      linearPrecision: 3,
      zeroSuppression: 0,
      toleranceEnabled: false,
      tolerancePrecision: 3,
      angularUnitFormat: 0,
      angularPrecision: 2,
      angularZeroSuppression: 0
    },
    dimensionAlternateUnits: null,
    dimensionToleranceUpper: null,
    dimensionToleranceLower: null
  }, overrides);
}

test('Decimal dimension formatting honours precision + zero suppression', () => {
  const geometry = makeGeometry({
    dimensionMeasurementSettings: {
      linearUnitFormat: 1,
      linearPrecision: 3,
      zeroSuppression: 0
    }
  });
  const formatted = renderer._formatDimensionMeasurement(12.3456, geometry);
  assert.strictEqual(formatted, '12.346');

  geometry.dimensionMeasurementSettings.zeroSuppression = 2;
  const trimmed = renderer._formatDimensionMeasurement(12.3500, geometry);
  assert.strictEqual(trimmed, '12.35');
});

test('Architectural formatting renders feet and inches', () => {
  const geometry = makeGeometry({
    dimensionMeasurementSettings: {
      linearUnitFormat: 3,
      linearPrecision: 2,
      zeroSuppression: 0
    }
  });
  const formatted = renderer._formatDimensionMeasurement(30, geometry);
  assert.strictEqual(formatted, `2'-6"`);
});

test('Plus/minus tolerance emits stacked lines', () => {
  const geometry = makeGeometry({
    dimensionMeasurementSettings: {
      linearUnitFormat: 1,
      linearPrecision: 3,
      zeroSuppression: 2,
      toleranceEnabled: true,
      tolerancePrecision: 3,
      toleranceZeroSuppression: 2,
      limitsEnabled: false
    },
    dimensionToleranceUpper: 0.01,
    dimensionToleranceLower: 0.005
  });
  const formatted = renderer._formatDimensionMeasurement(10, geometry);
  assert.strictEqual(formatted, '10\n+0.01\n-0.005');
});

test('Alternate unit formatting brackets converted value', () => {
  const geometry = makeGeometry({
    dimensionMeasurementSettings: {
      linearUnitFormat: 1,
      linearPrecision: 2,
      zeroSuppression: 2
    },
    dimensionAlternateUnits: {
      enabled: true,
      multiplier: 25.4,
      precision: 1,
      zeroSuppression: 2,
      tolerancePrecision: 1,
      toleranceZeroSuppression: 2
    }
  });
  const formatted = renderer._formatDimensionMeasurement(10, geometry);
  assert.strictEqual(formatted, '10\n[254]');
});

test('Angular degrees-minutes-seconds formatting obeys zero suppression', () => {
  const geometry = makeGeometry({
    dimensionType: 2,
    dimensionMeasurementSettings: {
      angularUnitFormat: 2,
      angularPrecision: 1,
      angularZeroSuppression: 2,
      toleranceEnabled: false
    }
  });
  const formatted = renderer._formatDimensionMeasurement(123.5, geometry);
  assert.strictEqual(formatted, `123°30'`);
});

if (failures > 0) {
  process.exit(1);
}
