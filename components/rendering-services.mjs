import { createRenderingServices } from '../packages/dxf-rendering-view/index.mjs';
import { createPropertyInspector } from '../packages/dxf-rendering-view/index.mjs';

const runtimeUrl = new URL('../vendor/skiasharpweb/dist/package/browser.js', import.meta.url).href;
let runtime;
const initializeSkia = () => runtime ||= import(runtimeUrl)
    .then(module => module.Initialize({ fonts: false }))
    .catch(error => { runtime = null; throw error; });
const services = createRenderingServices({
    renderer: globalThis.DxfSkia, initialize: initializeSkia,
    onObserverError: error => console.warn('DXF rendering observer:', error)
});
const RenderingPropertyGrid = createPropertyInspector({
    window,
    createRecordView: (container, options) => {
        const View = window.DxfAnalysis?.AnalysisView || window.DxfGrid?.GridView;
        if (!View) throw new Error('Initialize analysis services before creating the property inspector.');
        return new View(container, options);
    }
});
Object.assign(globalThis.DxfRendering ||= {}, services, { RenderingPropertyGrid, initializeSkia });
