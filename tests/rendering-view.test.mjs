import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import A from '../packages/dxf-skia/index.js';
import { createRenderingServices, createPropertyInspector } from '../packages/dxf-rendering-view/index.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = '0\nSECTION\n2\nENTITIES\n0\nLINE\n5\nA\n8\nPIPES\n10\n0\n20\n0\n11\n20\n21\n10\n0\nENDSEC\n0\nEOF\n';
const api = createRenderingServices({ renderer: A });
const createView = options => {
    // Compilation-only tests suspend the real host before submitting frames: no mocked renderer.
    const view = new api.RenderingSurfaceManager({ initialize: async () => { throw new Error('Unexpected initialization'); }, ...options });
    view.suspend();
    return view;
};
const graph = id => new api.RenderingDataController().ingestDocument({ tabId: id, sourceText: source }).sceneGraph;

test('rendering factory validates its contract without allocating a native runtime', () => {
    assert.throws(() => createRenderingServices(), /DxfSkia/);
    assert.throws(() => createRenderingServices({ renderer: A, initialize: 1 }), /initialize/);
    assert.throws(() => createRenderingServices({ renderer: A, onObserverError: 1 }), /onObserverError/);
    assert.throws(() => createPropertyInspector(), /browser window/);
    assert.throws(() => new api.RenderingSurfaceManager(), /Inject Skia/);
    assert.throws(() => createView({ maxPixels: -1 }), /pixel budget/);
});

test('document stores isolate overlapping handles and keep captured source text', () => {
    const a = new api.RenderingDataController(), b = new api.RenderingDataController();
    const first = a.ingestDocument({ tabId: 'same', sourceText: source });
    const second = b.ingestDocument({ tabId: 'same', sourceText: source.replace('20\n21','25\n21') });
    assert.notEqual(first, second);
    assert.equal(a.getSceneGraph('same').document, first);
    assert.equal(first.comparisonSourceText, source);
    assert.equal(second.sourceLength, source.length);
    a.releaseDocument('same'); assert.equal(a.hasDocument('same'), false); assert.equal(b.hasDocument('same'), true);
    a.dispose(); b.dispose();
});

test('document notifications have stable iteration and isolate observer exceptions', () => {
    const errors = [], { RenderingDataController } = createRenderingServices({ renderer: A, onObserverError: error => { errors.push(error); throw error; } });
    const store = new RenderingDataController(), calls = [];
    store.subscribe(() => { calls.push(1); store.subscribe(() => calls.push(3)); throw new Error('consumer'); });
    const detach = store.subscribe(() => calls.push(2));
    const doc = store.ingestDocument({ tabId: 0, sourceText: source });
    assert.ok(doc); assert.deepEqual(calls, [1,2]); assert.equal(errors.length, 1);
    detach(); store.dispose(); store.dispose();
    assert.equal(store.documents.size, 0); assert.equal(store.listeners.size, 0);
    assert.throws(() => store.subscribe(() => {}), /disposed/);
    assert.throws(() => store.ingestDocument({ tabId: 1, sourceText: source }), /disposed/);
});

test('malformed source creates a placeholder and cannot masquerade as a scene', () => {
    const store = new api.RenderingDataController();
    assert.equal(store.ingestDocument({ tabId: 'bad', sourceText: null }), null);
    assert.equal(store.getDocument('bad').status, 'placeholder');
    assert.equal(store.getSceneGraph('bad'), null);
    assert.ok(store.ingestDocument({ tabId: 'bad', sourceText: source }));
    assert.equal(store.getDocument('bad').status, 'ready');
});

test('camera-only frames reuse compilation and display changes recompile once', async () => {
    const view = createView(), input = graph('a');
    const first = view.renderScene(input), scene = view.compiled;
    const second = view.renderScene(input, { viewState: { mode: 'manual', scale: first.scale * 2, center: first.worldCenter } });
    assert.equal(view.compiled, scene); assert.equal(second.scene, scene);
    view.setLayerState({ PIPES: { visible: false } }); view.renderScene(input);
    assert.notEqual(view.compiled, scene);
    const filtered = view.compiled;
    view.setLayerState({ PIPES: { visible: false } }); view.renderScene(input);
    assert.equal(view.compiled, filtered);
    await view.dispose();
});

test('isolation is order-independent and delimiter-safe', async () => {
    const view = createView();
    view.setEntityIsolation(['A', 'B']); const revision = view.compileRevision;
    view.setEntityIsolation(['B', 'A']); assert.equal(view.compileRevision, revision);
    view.setEntityIsolation(['A|B']); assert.equal(view.compileRevision, revision + 1);
    view.setEntityIsolation(['A','B']); assert.equal(view.compileRevision, revision + 2);
    view.setVisualStyle(api.RenderingSurfaceManager.getVisualStylePresets()[1]);
    assert.equal(view.getVisualStyleOverride().value, 'shaded');
    await view.dispose();
});

test('comparison remains source-bound and a failed composition leaves native geometry usable', async () => {
    const view = createView(), first = graph('first');
    view.renderScene(first);
    view.setComparison({ enabled: true, scene() { throw new Error('comparison failed'); } });
    assert.equal(view.renderScene(first).scene, view.compiled);
    assert.equal(view.comparisonError.message, 'comparison failed');
    assert.equal(view.comparison.enabled, false);
    view.renderScene(graph('second')); assert.equal(view.comparison, null);
    await view.dispose();
});

test('frame disposal stops further observers and cannot resurrect a closed view', async () => {
    const view = createView(); let called = 0;
    view.subscribeFrame(() => { view.dispose(); });
    view.subscribeFrame(() => called++);
    view.renderScene(graph('a'));
    assert.equal(called, 0); assert.equal(view.frameListeners.size, 0);
    const promise = view.dispose(); assert.equal(view.dispose(), promise); await promise;
    assert.equal(view.sceneGraph, null); assert.equal(view.lastFrame, null);
    assert.throws(() => view.renderScene(graph('b')), /disposed/);
    assert.throws(() => view.subscribeFrame(() => {}), /disposed/);
    assert.throws(() => view.initialize({}), /disposed/);
    await assert.rejects(view.exportPng(), /disposed/);
});

test('initialization and size validation fail before changing a valid viewport', async () => {
    const view = createView();
    assert.throws(() => view.initialize({}), /canvas/);
    assert.equal(view.canvas, undefined);
    view.resize(500, 400, 10); assert.equal(view.devicePixelRatio, 3);
    assert.throws(() => view.resize(NaN, 5), /Finite/); assert.equal(view.width, 500);
    view.canPresent = () => false; view.resume(); assert.equal(view.suspended, true);
    await view.dispose();
});

test('pending runtime resource registration cannot mutate a disposed view', async () => {
    let resolve;
    const { RenderingSurfaceManager } = createRenderingServices({ renderer: A, initialize: () => new Promise(r => { resolve = r; }) });
    const view = new RenderingSurfaceManager();
    const pending = view.registerResource('late.png', new Uint8Array());
    await Promise.resolve(); await Promise.resolve();
    const rejected = assert.rejects(pending, /disposed/);
    const disposal = view.dispose(); resolve({});
    await rejected; await disposal;
    assert.equal(view.resources, null); assert.equal(view.compiled, null);
});

test('optional classic application bundle retains canonical service behavior', async () => {
    const builder = require('../scripts/build-rendering-bundle.js');
    const context = vm.createContext({ console });
    vm.runInContext(builder.artifacts().get('dist/dxf-rendering.global.js'), context);
    assert.equal(typeof context.DxfRendering.RenderingSurfaceManager, 'function');
    const other = new context.DxfRendering.RenderingDataController().ingestDocument({ tabId: 'a', sourceText: source });
    assert.equal(other.comparisonSourceText, source);
    assert.equal(other.entities.length, graph('a').document.entities.length);
});

test('app and GPU entry points import the rendering adapter without relying on DOM scheduling races', () => {
    for (const file of ['components/app-startup.mjs','editor/main.js','tests/skia-gpu.html']) {
        const text = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
        assert.match(text, /import ['"].*rendering-services\.mjs['"]/);
    }
    const adapter = readFileSync(new URL('../components/rendering-services.mjs',import.meta.url),'utf8');
    assert.doesNotMatch(adapter, /class Rendering|SceneCompiler|new .*SurfaceHost/);
});
