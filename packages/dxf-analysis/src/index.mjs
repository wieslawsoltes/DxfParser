import * as models from './models.mjs';
import { createGridServices } from './grid.mjs';
import { createAnalysisServices } from './view.mjs';
import { createAnalysisVisuals } from './visuals.mjs';

let instanceSequence = 0;

/** Create isolated view constructors for a browser realm. No globals are installed.
 * GridWeb is optional until spreadsheet presentation is requested. The host owns
 * custom-element registration, styles, vendor versions and source activation.
 */
export function createAnalysisUI({ window, gridWeb, treeDataGridCore, treeDataGridWeb, activateSource } = {}) {
    if (!window?.document) throw new TypeError('createAnalysisUI requires a browser window.');
    if (!treeDataGridCore || !treeDataGridWeb) throw new TypeError('TreeDataGrid core and web APIs are required.');
    if (activateSource !== undefined && typeof activateSource !== 'function') throw new TypeError('activateSource must be a function.');
    const env = { window, document: window.document, GridWeb: gridWeb, treeDataGridCore, treeDataGridWeb, activateSource, models, idPrefix: 'dxf-analysis-' + ++instanceSequence };
    for (const name of ['AbortController', 'Event', 'MutationObserver', 'ResizeObserver', 'navigator', 'Blob', 'URL', 'XMLSerializer']) env[name] = window[name];
    for (const name of ['requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'setTimeout', 'clearTimeout']) env[name] = window[name].bind(window);
    env.grid = createGridServices(env);
    env.analysis = createAnalysisServices(env);
    env.analysis.AnalysisVisuals = createAnalysisVisuals(env);
    // Namespace copies in application adapters may be extended with app-specific
    // report builders; the reusable API and its dependency realm remain private.
    return Object.freeze({ ...env.grid, ...env.analysis });
}
