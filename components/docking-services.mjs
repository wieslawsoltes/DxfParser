// Application storage namespace and legacy service surface; libraries install no globals.
import { createDockingWorkspace } from '../packages/dxf-workspace/index.mjs';
window.DxfDocking = createDockingWorkspace({ window, dockyard: window.AvalonDock, storagePrefix: 'dxfparser.dockyard' });
