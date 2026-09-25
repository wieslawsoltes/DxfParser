import { createRenderingServices, createPropertyInspector } from '../packages/dxf-rendering-view/index.mjs';
import { createAnalysisUI } from '../packages/dxf-analysis/index.mjs';
import { Initialize } from '../vendor/skiasharpweb/dist/package/browser.js';

let native;
const initialize = () => native ||= Initialize({ fonts: false });
const errors = [];
const services = createRenderingServices({ renderer: window.DxfSkia, initialize, onObserverError: error => errors.push(error.message) });
const Inspector = createPropertyInspector({ window });
const source = (x, color) => `0\nSECTION\n2\nENTITIES\n0\nSOLID\n5\nA\n420\n${color}\n10\n${x}\n20\n0\n11\n${x+20}\n21\n0\n12\n${x}\n22\n15\n13\n${x+20}\n23\n15\n0\nENDSEC\n0\nEOF\n`;
const make = (id, x, color) => {
    const store = new services.RenderingDataController();
    const drawing = store.ingestDocument({ tabId: id, sourceText: source(x, color) });
    const view = new services.RenderingSurfaceManager({ backend: 'canvas' });
    view.initialize(document.getElementById(id)); view.renderScene(drawing.sceneGraph);
    const properties = new Inspector(document.getElementById('properties-' + id));
    properties.setSections([{ title: 'Entity', properties: [{ name: 'Handle', value: 'A' }, { name: 'Drawing', value: id }] }]);
    return { store, drawing, view, properties };
};
const a = make('a', 0, 0x31aa70), b = make('b', 100, 0xe8794c);
await Promise.all([a.view.ready, b.view.ready]);
window.demo = { ...services, createRenderingServices, createPropertyInspector, createAnalysisUI, Inspector, initialize, errors, a, b, source };
