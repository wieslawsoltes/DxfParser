#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const samplePath = path.join(projectRoot, 'tests', 'data', 'sample.dxf');

const context = {
  console,
  performance: { now: () => Date.now() },
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  window: {},
  devicePixelRatio: 1
};
context.global = context;
context.globalThis = context;
context.window = context;

const canvasStub = () => ({
  width: 1024,
  height: 768,
  getContext: () => ({
    save() {},
    restore() {},
    setTransform() {},
    translate() {},
    scale() {},
    rotate() {},
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createPattern() { return null; },
    measureText: (text) => ({ width: String(text || '').length * 8 }),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1
  }),
  cloneNode() { return canvasStub(); },
  parentNode: null,
  ownerDocument: null
});

context.document = {
  createElement: (name) => {
    if (name === 'canvas') {
      const canvas = canvasStub();
      canvas.ownerDocument = context.document;
      return canvas;
    }
    return {};
  },
  createElementNS: () => ({})
};

vm.createContext(context);

function runScript(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(source, context, { filename: filePath });
}

runScript('components/dxf-parser.js');
runScript('dist/dxf-rendering.global.js');

const ParserCtor = context.DxfParser || context.window.DxfParser;
assert(ParserCtor, 'DxfParser was not attached to the global scope');

const namespace = context.window.DxfRendering;
assert(namespace, 'DxfRendering namespace missing after bundle execution');

const { RenderingDocumentBuilder, RenderingSurfaceManager, RenderingDataController } = namespace;
assert(RenderingDocumentBuilder, 'RenderingDocumentBuilder unavailable');
assert(RenderingSurfaceManager, 'RenderingSurfaceManager unavailable');
assert(RenderingDataController, 'RenderingDataController unavailable');

const parser = new ParserCtor();
const sampleText = fs.readFileSync(samplePath, 'utf8');
const tags = parser.parseDxf(sampleText);
assert(Array.isArray(tags) && tags.length > 0, 'DXF tags were not parsed');

const builder = new RenderingDocumentBuilder({ tags });
const doc = builder.build();
assert(doc && doc.sceneGraph, 'Rendering document missing scene graph');

const dataController = new RenderingDataController({ parser });
const ingested = dataController.ingestDocument({
  tabId: 'smoke',
  fileName: 'sample.dxf',
  sourceText: sampleText
});
assert(ingested && ingested.status === 'ready', 'RenderingDataController failed to ingest sample DXF');

const manager = new RenderingSurfaceManager();
const frame = manager.renderScene(doc.sceneGraph);
assert(frame && frame.isEmpty === false, 'RenderingSurfaceManager returned an empty frame');
assert(
  Array.isArray(frame.polylines) ||
  Array.isArray(frame.fills) ||
  Array.isArray(frame.points),
  'Frame does not contain any drawable primitives'
);

console.log('Smoke bundle test passed.');
