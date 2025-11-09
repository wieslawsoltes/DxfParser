# Testing Strategy for Component Splitting

## Overview

**Good news: Yes, we can create tests before splitting!** The codebase already has a working test infrastructure that uses Node.js `vm` module to test the rendering components in isolation.

## Current Test Infrastructure

### Existing Tests (All Passing)

1. **smoke-bundle.js** - Integration smoke test
   - Tests the complete bundle: DxfParser + DxfRendering
   - Verifies all major components load and work together
   - Tests: Parser → DocumentBuilder → SurfaceManager → Frame generation
   - **Status**: ✓ Passing

2. **check-dimensions.js** - Dimension formatting unit tests
   - Tests `RenderingSurfaceManager._formatDimensionMeasurement()`
   - Covers decimal, architectural, tolerance, alternate units, angular formats
   - **Status**: ✓ 5 tests passing

3. **rendering-parity.js** - Baseline regression tests
   - Compares scene graph output against known-good baselines
   - 7 different DXF files with baselines
   - Tests entity counts, geometry stats, dimension metrics
   - **Status**: ✓ 7 baselines passing

4. **check-materials.js** - Material system tests
5. **check-mtext.js** - Multi-line text tests
6. **check-plot-styles.js** - Plot style tests
7. **check-visual-styles.js** - Visual style tests
8. **check-solid-wipeout.js** - Solid and wipeout entity tests
9. **check-environment.js** - Environment setup tests

### Test Infrastructure Details

**Testing Approach**: Node.js VM-based testing
```javascript
const vm = require('vm');
const context = { console, window: {}, DxfRendering: {} };
vm.createContext(context);

// Load components
const source = fs.readFileSync('components/rendering-renderer.js', 'utf8');
vm.runInContext(source, context);

// Access loaded modules
const RenderingSurfaceManager = context.DxfRendering.RenderingSurfaceManager;
```

**Key Advantages**:
- No browser required
- Tests run in Node.js
- Can stub DOM APIs (canvas, document)
- Fast execution
- Easy CI/CD integration

## Testing Strategy Before Splitting

### Phase 1: Create Baseline Tests for Target Code

Before extracting any code, create comprehensive tests for the sections we plan to split.

#### 1.1 Matrix Utilities Tests

**Create**: `tests/check-matrix-utils.js`

**What to test** (rendering-renderer.js lines 49-215):
```javascript
// Target functions:
- basePointTransform(point)
- createMatrixFromArray(array)
- ensureMatrix3d(matrix)
- multiplyMatrices3d(m1, m2)
- translateMatrix(x, y, z)
- scaleMatrix(sx, sy, sz)
- rotateMatrix(angle, axis)
- applyTransform(point, matrix)
```

**Test cases**:
- Identity matrix creation
- Translation matrix generation
- Scale matrix generation
- Rotation matrix generation (X, Y, Z axes)
- Matrix multiplication
- Point transformation
- Base point transform with null/zero handling
- 2D to 3D matrix conversion (ensureMatrix3d)
- Edge cases: null inputs, zero values, NaN handling

**Priority**: HIGH (easiest to test, pure functions)

#### 1.2 Coordinate System Tests

**Create**: `tests/check-coordinate-system.js`

**What to test** (rendering-renderer.js lines 494-1,092):
```javascript
// Target class:
CoordinateSystemResolver {
  resolveCoordinateSystem(entity, context)
  resolveWcsToUcs(point, ucs)
  resolveViewTransform(viewportConfig)
  // ... other methods
}
```

**Test cases**:
- WCS to UCS transformation
- UCS coordinate system resolution
- Viewport coordinate transforms
- Entity coordinate resolution with different DCS contexts
- OCS (Object Coordinate System) transformations
- Extrusion direction handling
- Edge cases: missing UCS definitions, null viewports

**Priority**: HIGH (isolated class, testable)

#### 1.3 Geometry Utilities Tests

**Create**: `tests/check-geometry-utils.js`

**What to test** (scattered utility functions):
```javascript
// Target functions:
- calculateArcPoints(center, radius, startAngle, endAngle)
- bulgeToArc(p1, p2, bulge)
- ellipseToPoints(center, majorAxis, minorAxis, startAngle, endAngle)
- calculateBoundingBox(points)
- pointDistance(p1, p2)
- normalizeAngle(angle)
// ... other geometry utilities
```

**Test cases**:
- Arc point calculation with various angles
- Bulge to arc conversion (polyline segments)
- Ellipse mathematics
- Bounding box calculations
- Distance calculations
- Angle normalization (-π to π, 0 to 2π)
- Edge cases: zero-radius arcs, degenerate ellipses

**Priority**: MEDIUM (scattered code, need to identify all functions)

#### 1.4 Parser Utilities Tests

**Create**: `tests/check-parser-utils.js`

**What to test** (rendering-document-builder.js lines 31-714):
```javascript
// Target functions:
- toColorObject(intValue, alpha)
- boolFromValue(value)
- ensureArray(target, key)
- normalizeHandle(value)
- classifyVisualStyleName(name)
- parsePropertySet(data)
// ... other parsing utilities
```

**Test cases**:
- Color integer to RGBA object conversion
- Boolean parsing from DXF values
- Array initialization
- Handle normalization (uppercase, trim)
- Visual style classification (wireframe, realistic, etc.)
- Property set parsing
- Edge cases: null values, invalid integers, malformed data

**Priority**: HIGH (easy to test, pure functions)

#### 1.5 Dimension Rendering Tests (Expand Existing)

**Enhance**: `tests/check-dimensions.js`

**Current coverage**: Basic dimension formatting (5 tests)

**Add tests for**:
- Dimension text positioning
- Arrow rendering
- Extension line generation
- Dimension line calculations
- All dimension subtypes:
  - Linear (horizontal, vertical, aligned, rotated)
  - Angular (2-line, 3-point, arc)
  - Radial (radius, diameter)
  - Ordinate (X-datum, Y-datum)
- Leader lines
- Dimension style overrides
- Multi-line dimension text

**Priority**: MEDIUM-HIGH (large section, high value)

### Phase 2: Snapshot Tests for Unchanged Code

For the code that will remain in the original files, create snapshot/regression tests to ensure splitting doesn't break anything.

#### 2.1 Entity Rendering Snapshot Tests

**Create**: `tests/check-entity-rendering-snapshot.js`

**Approach**:
1. Load test DXF files
2. Render each entity type
3. Capture frame output (polylines, fills, points, text)
4. Save as JSON snapshot
5. Compare against snapshot on subsequent runs

**Entity types to snapshot**:
- LINE, CIRCLE, ARC, ELLIPSE, POLYLINE
- TEXT, MTEXT, ATTDEF, ATTRIB
- DIMENSION (all types)
- INSERT (block references)
- SOLID, WIPEOUT, HATCH
- 3DFACE, MESH, SURFACE

**Priority**: MEDIUM (safety net for refactoring)

#### 2.2 RenderingSurfaceManager Integration Tests

**Create**: `tests/check-surface-manager-integration.js`

**What to test**:
- Complete rendering pipeline
- Scene graph → Frame conversion
- Layer visibility filtering
- Block reference expansion
- Material application
- Text layout integration
- Canvas/WebGL surface output

**Priority**: HIGH (ensures end-to-end functionality)

#### 2.3 DocumentBuilder Snapshot Tests

**Enhance**: `tests/rendering-parity.js`

**Current coverage**: Entity counts and basic stats

**Add**:
- Full scene graph structure snapshots
- Table parsing (layers, styles, blocks, linetypes)
- Material definitions
- Visual styles
- Plot settings
- Geographic data (if present)

**Priority**: MEDIUM (already have some coverage)

### Phase 3: Post-Split Validation Tests

After each split, run these validation tests.

#### 3.1 Module Loading Tests

**Create**: `tests/check-module-loading.js`

**What to test**:
```javascript
// Test each new module loads correctly
- rendering-matrix-utils.js exports MatrixUtils
- rendering-coordinate-system.js exports CoordinateSystemResolver
- rendering-geometry-utils.js exports GeometryUtils
- rendering-parser-utils.js exports ParserUtils

// Test UMD compatibility
- AMD loading (define)
- CommonJS loading (module.exports)
- Global loading (window.DxfRendering)

// Test dependencies resolve
- Matrix utils has no dependencies
- Coordinate system imports matrix utils
- Renderer imports all extracted modules
```

**Priority**: CRITICAL (must pass before merge)

#### 3.2 Integration Regression Tests

**Create**: `tests/check-post-split-integration.js`

**What to test**:
1. Load all components (old + new)
2. Run complete rendering pipeline
3. Compare output with pre-split snapshots
4. Verify identical results

**Priority**: CRITICAL (must pass before merge)

## Testing Workflow

### Before Splitting Any Code

```bash
# 1. Run all existing tests to establish baseline
node tests/smoke-bundle.js
node tests/check-dimensions.js
node tests/rendering-parity.js
# ... run all other check-*.js tests

# 2. Create new tests for target code sections
node tests/check-matrix-utils.js
node tests/check-coordinate-system.js
node tests/check-geometry-utils.js
node tests/check-parser-utils.js

# 3. Create snapshot tests
node tests/check-entity-rendering-snapshot.js --capture
node tests/check-surface-manager-integration.js --capture

# 4. Verify all tests pass
# All tests must be GREEN before starting splits
```

### During Split (Example: Matrix Utils)

```bash
# 1. Create new file: components/rendering-matrix-utils.js
# 2. Copy code from rendering-renderer.js lines 49-215
# 3. Add UMD wrapper
# 4. Export all functions

# 5. Update rendering-renderer.js to import matrix utils
# 6. Remove duplicated code from rendering-renderer.js

# 7. Run tests
node tests/check-matrix-utils.js          # New module unit tests
node tests/check-module-loading.js        # Module loading test
node tests/smoke-bundle.js                 # Integration smoke test
node tests/rendering-parity.js             # Baseline regression
node tests/check-surface-manager-integration.js  # Integration test

# 8. If all GREEN → commit
# 9. If any RED → debug and fix

# 10. Run full test suite again before moving to next split
```

### After All Splits Complete

```bash
# Full regression suite
npm test  # (if package.json test script exists)

# Or manually:
for test in tests/check-*.js; do
  echo "Running $test..."
  node "$test" || exit 1
done

node tests/smoke-bundle.js || exit 1
node tests/rendering-parity.js || exit 1
```

## Test Case Templates

### Template 1: Pure Function Test

```javascript
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

loadComponent('rendering-matrix-utils.js');

const MatrixUtils = context.DxfRendering.MatrixUtils;
if (!MatrixUtils) {
  console.error('Failed to load MatrixUtils');
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
    console.error(err.stack);
  }
}

test('Identity matrix has correct values', () => {
  const identity = MatrixUtils.createIdentityMatrix();
  assert.strictEqual(identity[0], 1);
  assert.strictEqual(identity[5], 1);
  assert.strictEqual(identity[10], 1);
  assert.strictEqual(identity[15], 1);
  assert.strictEqual(identity[1], 0);
  assert.strictEqual(identity[2], 0);
});

test('Translation matrix translates point correctly', () => {
  const matrix = MatrixUtils.translateMatrix(10, 20, 30);
  const point = { x: 5, y: 5, z: 5 };
  const result = MatrixUtils.applyTransform(point, matrix);
  assert.strictEqual(result.x, 15);
  assert.strictEqual(result.y, 25);
  assert.strictEqual(result.z, 35);
});

// ... more tests

process.exit(failures > 0 ? 1 : 0);
```

### Template 2: Integration Test with Snapshot

```javascript
#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ... setup context and load components

const captureMode = process.argv.includes('--capture');
const snapshotPath = path.join(__dirname, 'snapshots', 'entity-rendering.json');

function renderEntity(entity, sceneGraph) {
  const manager = new RenderingSurfaceManager();
  const frame = manager.renderScene(sceneGraph);
  return {
    polylineCount: frame.polylines ? frame.polylines.length : 0,
    fillCount: frame.fills ? frame.fills.length : 0,
    textCount: frame.text ? frame.text.length : 0
  };
}

const results = {};
// ... render all test entities
// ... populate results object

if (captureMode) {
  fs.writeFileSync(snapshotPath, JSON.stringify(results, null, 2));
  console.log('Snapshot captured');
} else {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  assert.deepStrictEqual(results, snapshot, 'Rendering output changed');
  console.log('✓ Snapshot test passed');
}
```

### Template 3: Class Behavior Test

```javascript
test('CoordinateSystemResolver resolves UCS correctly', () => {
  const resolver = new CoordinateSystemResolver();

  const ucs = {
    origin: { x: 10, y: 20, z: 0 },
    xAxis: { x: 1, y: 0, z: 0 },
    yAxis: { x: 0, y: 1, z: 0 }
  };

  const wcsPoint = { x: 5, y: 5, z: 0 };
  const ucsPoint = resolver.resolveWcsToUcs(wcsPoint, ucs);

  assert.strictEqual(ucsPoint.x, 15);
  assert.strictEqual(ucsPoint.y, 25);
  assert.strictEqual(ucsPoint.z, 0);
});
```

## Test Coverage Goals

### Minimum Required Coverage (Before Splitting)

- **Matrix utilities**: 100% (all pure functions, easy to test)
- **Parser utilities**: 100% (all pure functions, easy to test)
- **Coordinate system**: 80% (class with some complex state)
- **Geometry utilities**: 80% (mathematical functions)
- **Dimension rendering**: 60% (complex, many cases)

### Post-Split Validation

- **All existing tests**: Must continue passing
- **New module loading**: 100% (critical)
- **Integration tests**: Must match pre-split snapshots exactly

## Tools and Utilities

### Test Runner Script

**Create**: `tests/run-all.sh`

```bash
#!/bin/bash

set -e  # Exit on first failure

echo "Running all tests..."
echo

TESTS=(
  "tests/smoke-bundle.js"
  "tests/check-dimensions.js"
  "tests/check-materials.js"
  "tests/check-mtext.js"
  "tests/check-plot-styles.js"
  "tests/check-visual-styles.js"
  "tests/check-solid-wipeout.js"
  "tests/rendering-parity.js"
)

FAILURES=0

for test in "${TESTS[@]}"; do
  echo "Running $test..."
  if ! node "$test"; then
    FAILURES=$((FAILURES + 1))
    echo "FAILED: $test"
  fi
  echo
done

if [ $FAILURES -eq 0 ]; then
  echo "✓ All tests passed!"
  exit 0
else
  echo "✗ $FAILURES test(s) failed"
  exit 1
fi
```

### Snapshot Comparison Utility

**Create**: `tests/utils/snapshot-diff.js`

```javascript
function compareSnapshots(actual, expected, path = '') {
  const differences = [];

  if (typeof actual !== typeof expected) {
    differences.push({
      path,
      actual: typeof actual,
      expected: typeof expected,
      message: 'Type mismatch'
    });
    return differences;
  }

  if (Array.isArray(actual)) {
    if (actual.length !== expected.length) {
      differences.push({
        path,
        actual: actual.length,
        expected: expected.length,
        message: 'Array length mismatch'
      });
    }
    for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
      const itemPath = `${path}[${i}]`;
      differences.push(...compareSnapshots(actual[i], expected[i], itemPath));
    }
  } else if (typeof actual === 'object' && actual !== null) {
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    for (const key of keys) {
      const keyPath = path ? `${path}.${key}` : key;
      differences.push(...compareSnapshots(actual[key], expected[key], keyPath));
    }
  } else if (actual !== expected) {
    differences.push({
      path,
      actual,
      expected,
      message: 'Value mismatch'
    });
  }

  return differences;
}

module.exports = { compareSnapshots };
```

## CI/CD Integration

### GitHub Actions Example

**Create**: `.github/workflows/test.yml`

```yaml
name: Tests

on:
  push:
    branches: [ main, feature/split-rendering-components ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm install

    - name: Run all tests
      run: |
        chmod +x tests/run-all.sh
        tests/run-all.sh

    - name: Run rendering parity tests
      run: node tests/rendering-parity.js

    - name: Check bundle integrity
      run: node tests/smoke-bundle.js
```

## Risk Assessment

### Low Risk (Can Split Immediately After Tests)

- Matrix utilities (pure functions)
- Parser utilities (pure functions)
- Formatter utilities (pure functions)

### Medium Risk (Need Comprehensive Tests)

- Coordinate system resolver (stateful class)
- Geometry utilities (mathematical edge cases)
- Dimension rendering (complex logic)

### High Risk (Need Integration Tests + Snapshots)

- Entity renderers (tightly coupled)
- Surface manager modifications
- Document builder modifications

## Success Criteria

### Before Starting Any Split

- [ ] All existing tests pass
- [ ] New unit tests created for target extraction code
- [ ] Snapshot tests created for unchanged code
- [ ] Test runner script created
- [ ] CI/CD pipeline configured (optional but recommended)

### After Each Split

- [ ] New module unit tests pass
- [ ] Module loading tests pass
- [ ] All existing tests still pass
- [ ] Integration tests still pass
- [ ] Snapshot comparisons match exactly
- [ ] No increase in bundle size (verify with `ls -lh dist/`)

### Before Merging

- [ ] Full test suite passes (100% green)
- [ ] No regressions detected
- [ ] Code coverage maintained or improved
- [ ] Performance benchmarks unchanged (optional)
- [ ] Documentation updated

## Conclusion

**Answer: Yes, we can and should create tests before splitting!**

The existing test infrastructure is solid and the code is highly testable. The VM-based approach allows us to test components in isolation without requiring a browser environment.

**Recommended Action Plan**:

1. **Week 1**: Create comprehensive unit tests for Phase 1 extractions (matrix utils, coordinate system, geometry utils, parser utils)
2. **Week 2**: Create snapshot/integration tests for safety net
3. **Week 3**: Begin Phase 1 splits with test-driven approach
4. **Week 4**: Validate, refine, and document

This test-first approach significantly reduces risk and ensures we catch any regressions immediately.

---

**Document Version**: 1.0
**Last Updated**: 2025-11-07
**Status**: Proposal - Ready for Implementation
