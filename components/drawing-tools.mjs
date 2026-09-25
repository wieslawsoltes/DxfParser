import { createDrawingViewTools } from '../packages/dxf-drawing-tools/index.mjs';
window.DxfDocking.DrawingViewTools = createDrawingViewTools(window.DxfSkia, window.AvalonDock);
