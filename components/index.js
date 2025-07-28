// DxfParser Components - Main Entry Point
// This file loads all components in the correct dependency order

// Load utilities first (no dependencies)
// Utils: hexStringToByteArray, hexDump, detectHeader, isHandleCode

// Load DXF Parser (depends on utils)
// DxfParser: Core DXF parsing functionality

// Load Tree Data Grid (depends on DxfParser)
// TreeDataGrid: Tree view data grid component

// Load Batch Data Grid (depends on TreeDataGrid)
// BatchDataGrid: Batch processing data grid

// Load State Manager (depends on TreeDataGrid)
// StateManager: State management and persistence

// Load DXF Diagnostics Engine (depends on DxfParser)
// DXFDiagnosticsEngine: Diagnostics and validation engine

// Load Main App (depends on all other components)
// App: Main application class

// Note: This file serves as a documentation of the component structure
// The actual loading is handled by the HTML file which includes the scripts in order 