import { StateManager } from '../packages/dxf-state/index.mjs';

/** The application supplies browser state; the package never discovers window.app. */
function createAppStateManager(app) {
    let storage = null;
    try { storage = window.localStorage; } catch { /* Sandboxed/private contexts can deny storage. */ }
    const flag = key => { try { return storage?.getItem(key) === 'true'; } catch { return false; } };
    return new StateManager({
        storage,
        getUiState: () => ({
            sidebarCollapsed: flag('sidebarCollapsed'), rightPanelHidden: flag('rightPanelHidden'),
            sideBySideDiffEnabled: !!app.sideBySideDiffEnabled
        }),
        onError: (error, operation) => console.warn(`Source state ${operation}:`, error)
    });
}
window.DxfState = { createAppStateManager };
