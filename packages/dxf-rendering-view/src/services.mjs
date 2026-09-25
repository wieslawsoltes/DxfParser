import { createDocumentServices } from './documents.mjs';
import { createSurfaceManager } from './surface-manager.mjs';

/** Create independent service classes using the supplied DxfSkia API and runtime initializer. */
export function createRenderingServices({ renderer, initialize, onObserverError } = {}) {
    for (const name of ['DxfDocument', 'SceneCompiler', 'SurfaceHost', 'prepareFrame', 'dxfText', 'key']) {
        if (typeof renderer?.[name] !== 'function') throw new TypeError('A compatible DxfSkia renderer API is required: ' + name);
    }
    for (const name of ['vec', 'normal', 'clamp']) {
        if (typeof renderer?.geometry?.[name] !== 'function') throw new TypeError('A compatible DxfSkia geometry API is required: ' + name);
    }
    if (initialize != null && typeof initialize !== 'function') throw new TypeError('initialize must be a function.');
    if (onObserverError != null && typeof onObserverError !== 'function') throw new TypeError('onObserverError must be a function.');
    const report = error => { try { onObserverError?.(error); } catch { /* Notifications never own renderer state. */ } };
    return Object.freeze({
        ...createDocumentServices(renderer, report),
        RenderingSurfaceManager: createSurfaceManager(renderer, initialize, report)
    });
}
