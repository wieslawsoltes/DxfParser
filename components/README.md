# DxfParser Components

This directory contains the modular components of the DxfParser application, split from the original monolithic `app.js` file.

## Component Structure

### 1. `utils.js` (93 lines)
**Purpose**: Utility functions and helpers
**Dependencies**: None
**Exports**:
- `hexStringToByteArray(hexString)` - Convert hex string to byte array
- `hexDump(buffer)` - Generate hex dump from buffer
- `detectHeader(buffer)` - Detect file headers
- `isHandleCode(code)` - Check if code is a handle code

### 2. `dxf-parser.js` (425 lines)
**Purpose**: Core DXF parsing functionality
**Dependencies**: utils.js
**Exports**:
- `DxfParser` class - Main parser for DXF files
- Methods: parse, parseDxf, parseDxfLines, groupObjects, etc.

### 3. `tree-data-grid.js` (601 lines)
**Purpose**: Tree view data grid component
**Dependencies**: dxf-parser.js
**Exports**:
- `TreeDataGrid` class - Tree view with virtualization
- Methods: setData, refresh, flattenTree, makeDataEditable, etc.

### 4. `batch-data-grid.js` (368 lines)
**Purpose**: Batch processing data grid
**Dependencies**: tree-data-grid.js
**Exports**:
- `BatchDataGrid` class - Multi-tab batch processing
- Methods: addTab, addRow, switchTab, removeTab, etc.

### 5. `state-manager.js` (193 lines)
**Purpose**: State management and persistence
**Dependencies**: tree-data-grid.js
**Exports**:
- `StateManager` class - Local storage and state persistence
- Methods: saveAppState, loadAppState, saveTabState, etc.

### 6. `app.js` (6,062 lines)
**Purpose**: Main application class
**Dependencies**: All other components
**Exports**:
- `App` class - Main application logic
- Methods: handleFiles, handleSearch, updateStats, etc.

### 7. `dxf-diagnostics-engine.js` (2,673 lines)
**Purpose**: Diagnostics and validation engine
**Dependencies**: dxf-parser.js
**Exports**:
- `DXFDiagnosticsEngine` class - Comprehensive DXF validation
- Methods: runFullDiagnostics, analyzeStructuralIntegrity, etc.

## Loading Order

The components must be loaded in the following order due to dependencies:

1. `utils.js`
2. `dxf-parser.js`
3. `tree-data-grid.js`
4. `batch-data-grid.js`
5. `state-manager.js`
6. `dxf-diagnostics-engine.js`
7. `app.js`

## Total Lines

- **Original app.js**: 10,416 lines
- **Split components**: 10,415 lines (1 line difference due to component separation)

## Benefits of Modular Structure

1. **Maintainability**: Each component has a single responsibility
2. **Readability**: Smaller files are easier to understand
3. **Reusability**: Components can be used independently
4. **Testing**: Individual components can be tested in isolation
5. **Development**: Multiple developers can work on different components
6. **Debugging**: Issues can be isolated to specific components

## Usage

To use the modular components, include them in your HTML file in the correct order:

```html
<script src="components/utils.js"></script>
<script src="components/dxf-parser.js"></script>
<script src="components/tree-data-grid.js"></script>
<script src="components/batch-data-grid.js"></script>
<script src="components/state-manager.js"></script>
<script src="components/dxf-diagnostics-engine.js"></script>
<script src="components/app.js"></script>
``` 