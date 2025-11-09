# Rendering Components Splitting Plan

## Overview

This document outlines a strategy for splitting large rendering-*.js files into smaller, more manageable modules. The goal is to improve maintainability and readability through simple copy-paste operations with minimal code changes.

## Current State

### File Sizes
- **rendering-renderer.js**: 9,585 lines
- **rendering-overlay.js**: 7,001 lines
- **rendering-document-builder.js**: 6,640 lines
- **Total**: 23,226 lines

### Smaller Files (Already Well-Sized)
- rendering-entities.js: 2,842 lines
- rendering-text-layout.js: 2,610 lines
- rendering-tessellation.js: 1,211 lines
- rendering-surface-canvas.js: 770 lines
- rendering-surface-webgl.js: 310 lines
- rendering-scene-graph.js: 172 lines
- rendering-property-grid.js: 131 lines
- rendering-data-controller.js: 106 lines

## Splitting Strategy

### Phase 1: Quick Wins (EASIEST - Copy-Paste Ready)

**Low risk, minimal changes required**

#### 1.1 Extract from rendering-renderer.js

##### Create: `rendering-matrix-utils.js`
- **Lines**: 49-215 (~170 lines)
- **Content**: Matrix transformation utilities
  - `basePointTransform()`
  - `createMatrixFromArray()`
  - `ensureMatrix3d()`
  - `multiplyMatrices3d()`
  - `translateMatrix()`
  - `scaleMatrix()`
  - `rotateMatrix()`
  - `applyTransform()`
- **Changes Required**:
  - Add UMD wrapper
  - Export all utility functions
- **Risk**: VERY LOW
- **Breaking Changes**: None (just update imports in rendering-renderer.js)

##### Create: `rendering-coordinate-system.js`
- **Lines**: 494-1,092 (~600 lines)
- **Content**: CoordinateSystemResolver class
  - Full class with all methods
  - WCS/UCS coordinate system resolution
  - View transformation logic
- **Changes Required**:
  - Add UMD wrapper
  - Export CoordinateSystemResolver class
  - Import matrix utils
- **Risk**: LOW
- **Breaking Changes**: None (just update imports)

##### Create: `rendering-geometry-utils.js`
- **Lines**: Scattered throughout (~300 lines)
- **Content**: Geometry calculation utilities
  - Arc calculations
  - Bulge/arc conversion
  - Ellipse mathematics
  - Bounding box calculations
- **Changes Required**:
  - Collect scattered utility functions
  - Add UMD wrapper
  - Export all functions
- **Risk**: LOW
- **Breaking Changes**: Update imports where used

**Phase 1 Result**:
- rendering-renderer.js: 9,585 → ~8,500 lines (~1,000 lines extracted)

---

### Phase 2: Document Builder Utilities (EASY)

**Low risk, straightforward extraction**

#### 2.1 Extract from rendering-document-builder.js

##### Create: `rendering-parser-utils.js`
- **Lines**: 31-714 (~680 lines)
- **Content**: Parsing utility functions
  - `toColorObject()`
  - `boolFromValue()`
  - `ensureArray()`
  - `normalizeHandle()`
  - `classifyVisualStyleName()`
  - `parsePropertySet()`
  - Other helper functions
- **Changes Required**:
  - Add UMD wrapper
  - Export all utility functions
- **Risk**: VERY LOW
- **Breaking Changes**: Update imports in rendering-document-builder.js

##### Create: `rendering-geographic-parser.js`
- **Lines**: Within RenderingDocumentBuilder class
- **Content**: Geographic coordinate parsing
  - `parseGeographicData()` method
  - Related GIS utilities
- **Changes Required**:
  - Extract method to standalone function
  - Add UMD wrapper
  - May need to pass document context
- **Risk**: LOW
- **Breaking Changes**: Minimal

##### Create: `rendering-plot-settings-parser.js`
- **Lines**: Within RenderingDocumentBuilder class
- **Content**: Plot configuration parsing
  - Plot settings extraction
  - Paper space configuration
- **Changes Required**:
  - Extract methods to standalone functions
  - Add UMD wrapper
- **Risk**: LOW
- **Breaking Changes**: Minimal

**Phase 2 Result**:
- rendering-document-builder.js: 6,640 → ~5,960 lines (~680 lines extracted)

---

### Phase 3: Overlay Formatters (EASY)

**Low risk, pure utility functions**

#### 3.1 Extract from rendering-overlay.js

##### Create: `rendering-overlay-formatters.js`
- **Lines**: 2,108-2,345 (~240 lines)
- **Content**: Number and unit formatting utilities
  - Number formatting functions
  - Unit conversion utilities
  - Display formatters
- **Changes Required**:
  - Add UMD wrapper
  - Export all formatter functions
- **Risk**: VERY LOW
- **Breaking Changes**: None

**Phase 3 Result**:
- rendering-overlay.js: 7,001 → ~6,760 lines (~240 lines extracted)

---

### Phase 4: Dimension Rendering (MEDIUM)

**Medium effort, high impact reduction**

#### 4.1 Extract from rendering-renderer.js

##### Create: `rendering-dimensions.js`
- **Lines**: Large section (~2,450 lines)
- **Content**: All dimension entity rendering
  - Linear dimensions
  - Aligned dimensions
  - Angular dimensions
  - Radial/diameter dimensions
  - Ordinate dimensions
  - Leader lines
- **Changes Required**:
  - Extract all dimension-related methods
  - Create standalone class or module
  - **Pass RenderingSurfaceManager methods as parameters** (dependency injection)
  - Add UMD wrapper
  - Update imports
- **Risk**: MEDIUM
- **Breaking Changes**:
  - Need to refactor how dimensions access main renderer
  - May need callback pattern or dependency injection
  - Requires testing all dimension types

**Phase 4 Result**:
- rendering-renderer.js: ~8,500 → ~6,050 lines (~2,450 lines extracted)

---

### Phase 5: Advanced Splits (OPTIONAL - Higher Complexity)

**Higher risk, requires architectural changes**

These splits are NOT recommended for a quick copy-paste approach but are noted for future consideration:

#### 5.1 Entity Renderers (HARD)
- Extract individual entity type handlers (LINE, CIRCLE, ARC, etc.)
- **Challenge**: 30+ entity types, heavily coupled to RenderingSurfaceManager
- **Effort**: Would need factory pattern and significant refactoring
- **Risk**: HIGH

#### 5.2 Layer Manager UI (HARD)
- Extract layer management system from rendering-overlay.js (~1,138 lines)
- **Challenge**: Complex DOM manipulation and state management
- **Effort**: Need to pass many DOM references and callbacks
- **Risk**: MEDIUM-HIGH

#### 5.3 Selection/Isolation System (HARD)
- Extract selection and entity isolation logic (~1,011 lines)
- **Challenge**: Touches multiple systems (rendering, UI, state)
- **Effort**: Requires state management refactoring
- **Risk**: HIGH

#### 5.4 View Navigation (HARD)
- Extract view history and navigation (~607 lines)
- **Challenge**: Complex state dependencies
- **Risk**: HIGH

---

## Implementation Guidelines

### UMD Wrapper Pattern

All extracted files should use the existing UMD pattern:

```javascript
(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], function () { return factory(root); });
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    factory(root);
  }
}((function () {
  if (typeof globalThis !== "undefined") return globalThis;
  if (typeof self !== "undefined") return self;
  if (typeof window !== "undefined") return window;
  if (typeof global !== "undefined") return global;
  return {};
}()), function (root) {
  'use strict';

  const namespace = root.DxfRendering = root.DxfRendering || {};

  // Your code here

  // Export pattern
  namespace.YourModule = YourModule;

  return namespace;
}));
```

### Import Pattern for Dependencies

When files need to import from other rendering modules:

```javascript
if (!namespace.MatrixUtils && typeof require === 'function') {
  try {
    const matrixModule = require('./rendering-matrix-utils.js');
    if (matrixModule && matrixModule.MatrixUtils) {
      namespace.MatrixUtils = matrixModule.MatrixUtils;
    }
  } catch (err) {
    // Handle module not available
  }
}
```

### Testing Checklist

After each split:

1. Verify original file still works with updated imports
2. Verify new extracted file can be loaded independently
3. Test in browser environment
4. Test in Node.js environment
5. Check for any circular dependencies
6. Verify UMD compatibility (AMD, CommonJS, global)

---

## Expected Outcomes

### After Phase 1-3 (Quick Wins)
- **Lines Extracted**: ~1,920 lines
- **New Files Created**: 6 files
- **Risk Level**: LOW
- **Estimated Effort**: 4-8 hours
- **Breaking Changes**: Minimal (mostly import updates)

### After Phase 4 (Including Dimensions)
- **Lines Extracted**: ~4,370 lines
- **New Files Created**: 7 files
- **Risk Level**: MEDIUM
- **Estimated Effort**: 12-20 hours
- **Breaking Changes**: Moderate (requires dependency injection)

### Full Potential (If Phase 5 Pursued)
- **Lines Extracted**: ~7,000+ lines
- **New Files Created**: 15-20 files
- **Original Large Files**: Reduced by 70%
- **Risk Level**: HIGH
- **Estimated Effort**: 40-80 hours
- **Breaking Changes**: Significant (architectural refactoring)

---

## Recommended Approach

### Start Small
1. Begin with Phase 1: Matrix Utils and Coordinate System
2. Test thoroughly
3. If successful, proceed to Phase 2 and 3
4. Evaluate before attempting Phase 4

### Parallel Work
Multiple extractions from different files can be done in parallel:
- Developer A: rendering-renderer.js utilities
- Developer B: rendering-document-builder.js utilities
- Developer C: rendering-overlay.js formatters

### Version Control Strategy
- Create feature branch for splitting work
- One commit per extracted file
- Keep original files until all tests pass
- Tag release before starting splits (rollback point)

---

## File Structure After Splits

### Proposed New Structure

```
components/
├── rendering-core/
│   ├── rendering-matrix-utils.js          (new - 170 lines)
│   ├── rendering-coordinate-system.js     (new - 600 lines)
│   ├── rendering-geometry-utils.js        (new - 300 lines)
│   └── rendering-parser-utils.js          (new - 680 lines)
├── rendering-parsers/
│   ├── rendering-geographic-parser.js     (new)
│   └── rendering-plot-settings-parser.js  (new)
├── rendering-ui/
│   └── rendering-overlay-formatters.js    (new - 240 lines)
├── rendering-specialized/
│   └── rendering-dimensions.js            (new - 2,450 lines)
├── rendering-renderer.js                   (reduced to ~6,050 lines)
├── rendering-overlay.js                    (reduced to ~6,760 lines)
├── rendering-document-builder.js           (reduced to ~5,960 lines)
├── rendering-entities.js                   (unchanged - 2,842 lines)
├── rendering-text-layout.js                (unchanged - 2,610 lines)
├── rendering-tessellation.js               (unchanged - 1,211 lines)
├── rendering-surface-canvas.js             (unchanged - 770 lines)
├── rendering-surface-webgl.js              (unchanged - 310 lines)
├── rendering-scene-graph.js                (unchanged - 172 lines)
├── rendering-property-grid.js              (unchanged - 131 lines)
└── rendering-data-controller.js            (unchanged - 106 lines)
```

**Note**: Subdirectory organization is optional. Files can remain flat in the components/ directory if preferred.

---

## Dependencies Map

### After Phase 1-3 Splits

```
rendering-matrix-utils.js
  └─ (no dependencies)

rendering-coordinate-system.js
  └─ rendering-matrix-utils.js

rendering-geometry-utils.js
  └─ (no dependencies)

rendering-parser-utils.js
  └─ (no dependencies)

rendering-overlay-formatters.js
  └─ (no dependencies)

rendering-renderer.js
  ├─ rendering-matrix-utils.js
  ├─ rendering-coordinate-system.js
  ├─ rendering-geometry-utils.js
  ├─ rendering-tessellation.js
  └─ rendering-entities.js

rendering-document-builder.js
  ├─ rendering-parser-utils.js
  └─ rendering-entities.js

rendering-overlay.js
  ├─ rendering-overlay-formatters.js
  ├─ rendering-property-grid.js
  └─ rendering-data-controller.js
```

---

## Success Criteria

### Metrics
- [ ] No increase in bundle size (after minification)
- [ ] All existing tests pass
- [ ] No runtime errors in browser
- [ ] No runtime errors in Node.js
- [ ] No circular dependencies detected
- [ ] Code coverage maintained or improved

### Quality Gates
- [ ] Each extracted file has clear, single responsibility
- [ ] Export/import patterns consistent across all files
- [ ] Documentation updated (if applicable)
- [ ] No duplicate code introduced
- [ ] UMD pattern correctly implemented in all new files

---

## Risk Mitigation

### Backup Strategy
1. Create full repository backup before starting
2. Tag current stable version
3. Work in feature branch
4. Keep original files until testing complete

### Testing Strategy
1. Run existing test suite after each extraction
2. Manual testing in browser
3. Manual testing in Node.js
4. Cross-browser testing (if applicable)
5. Performance benchmarking (before/after)

### Rollback Plan
If issues arise:
1. Revert to tagged version
2. Analyze what went wrong
3. Adjust extraction strategy
4. Try again with smaller scope

---

## Timeline Estimate

### Phase 1-3 (Recommended Start)
- **Week 1**: Extract matrix utils and coordinate system
- **Week 2**: Extract parser utils and formatters
- **Week 3**: Testing and refinement
- **Week 4**: Documentation and review

### Phase 4 (If Proceeding)
- **Week 5-6**: Extract dimensions module
- **Week 7**: Testing and integration
- **Week 8**: Buffer for issues and refinement

---

## Questions to Answer Before Starting

1. Do we need to maintain backward compatibility with existing code?
2. Should extracted files go into subdirectories or stay flat?
3. What is the testing coverage for rendering components?
4. Are there any build tools that need configuration updates?
5. Should we bundle related extractions (e.g., all utils) or separate them?
6. What is the priority: maintainability vs. minimal changes?

---

## Next Steps

1. Review and approve this plan
2. Create feature branch: `feature/split-rendering-components`
3. Start with Phase 1.1: Extract rendering-matrix-utils.js
4. Validate approach with one extraction before proceeding
5. Continue systematically through phases

---

## Notes

- All line numbers referenced are approximate and based on current file state
- UMD pattern ensures compatibility with AMD, CommonJS, and browser globals
- Each extraction should be a separate commit for easy rollback
- Consider creating automated tests for extracted modules
- Keep original file structure until all splits are proven stable

---

**Document Version**: 1.0
**Last Updated**: 2025-11-07
**Status**: Proposal - Awaiting Approval
