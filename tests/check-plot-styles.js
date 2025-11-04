#!/usr/bin/env node

/**
 * Validation for plot style dictionaries, plot configurations, and background masks.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const componentsDir = path.join(projectRoot, 'components');

const context = {
  console,
  window: {},
  DxfRendering: {},
  performance: { now: () => Date.now() }
};
context.global = context;
context.globalThis = context;
vm.createContext(context);

const componentFiles = [
  'rendering-entities.js',
  'rendering-scene-graph.js',
  'rendering-document-builder.js',
  'rendering-text-layout.js',
  'rendering-renderer.js'
];

componentFiles.forEach((file) => {
  const fullPath = path.join(componentsDir, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  vm.runInContext(source, context, { filename: fullPath });
});

if (context.window && context.window.DxfRendering) {
  context.DxfRendering = context.window.DxfRendering;
}

const {
  RenderingDocumentBuilder,
  TextLayoutEngine
} = context.DxfRendering;

if (!RenderingDocumentBuilder || !TextLayoutEngine) {
  throw new Error('Failed to initialise rendering components for plot style checks.');
}

function parseDxfText(text) {
  const lines = text.split(/\r?\n/);
  const tags = [];
  let lineIndex = 0;
  while (lineIndex < lines.length) {
    let codeLine = lines[lineIndex];
    if (codeLine === undefined) break;
    codeLine = codeLine.trim();
    if (codeLine === '') {
      lineIndex += 1;
      continue;
    }
    const code = parseInt(codeLine, 10);
    if (Number.isNaN(code)) {
      lineIndex += 1;
      continue;
    }
    const valueLine = lineIndex + 1 < lines.length ? lines[lineIndex + 1] : '';
    tags.push({ line: lineIndex + 1, code, value: valueLine });
    lineIndex += 2;
  }
  return tags;
}

const sampleDxf = [
  '0',
  'SECTION',
  '2',
  'HEADER',
  '9',
  '$PSTYLEMODE',
  '290',
  '0',
  '0',
  'ENDSEC',
  '0',
  'SECTION',
  '2',
  'TABLES',
  '0',
  'TABLE',
  '2',
  'LAYER',
  '0',
  'LAYER',
  '2',
  'LayerA',
  '70',
  '0',
  '62',
  '7',
  '6',
  'Continuous',
  '370',
  '-3',
  '390',
  'F',
  '0',
  'ENDTAB',
  '0',
  'ENDSEC',
  '0',
  'SECTION',
  '2',
  'OBJECTS',
  '0',
  'DICTIONARY',
  '5',
  'C',
  '330',
  '0',
  '100',
  'AcDbDictionary',
  '281',
  '1',
  '3',
  'ACAD_PLOTSTYLENAME',
  '350',
  'E',
  '0',
  'ACDBDICTIONARYWDFLT',
  '5',
  'E',
  '330',
  'C',
  '100',
  'AcDbDictionary',
  '281',
  '1',
  '3',
  'Normal',
  '350',
  'F',
  '340',
  'F',
  '0',
  'ACDBPLACEHOLDER',
  '5',
  'F',
  '330',
  'E',
  '0',
  'LAYOUT',
  '5',
  '200',
  '330',
  '2',
  '100',
  'AcDbPlotSettings',
  '1',
  'PageSetup1',
  '2',
  'none_device',
  '4',
  'ANSI_A_(8.50_x_11.00_Inches)',
  '6',
  'View1',
  '7',
  'sample.stb',
  '40',
  '7.5',
  '41',
  '20',
  '42',
  '7.5',
  '43',
  '20',
  '44',
  '210',
  '45',
  '297',
  '46',
  '0.0',
  '47',
  '0.0',
  '48',
  '0.0',
  '49',
  '0.0',
  '70',
  '688',
  '72',
  '1',
  '73',
  '0',
  '74',
  '5',
  '75',
  '16',
  '76',
  '0',
  '77',
  '2',
  '78',
  '300',
  '147',
  '1.0',
  '100',
  'AcDbLayout',
  '1',
  'Layout1',
  '70',
  '1',
  '71',
  '1',
  '10',
  '0.0',
  '20',
  '0.0',
  '11',
  '420.0',
  '21',
  '297.0',
  '330',
  '2',
  '331',
  '1',
  '0',
  'ENDSEC',
  '0',
  'SECTION',
  '2',
  'ENTITIES',
  '0',
  'MTEXT',
  '5',
  '10',
  '8',
  'LayerA',
  '10',
  '0.0',
  '20',
  '0.0',
  '40',
  '2.5',
  '41',
  '10',
  '71',
  '1',
  '72',
  '1',
  '1',
  'Hello world',
  '390',
  'F',
  '90',
  '1',
  '63',
  '1',
  '420',
  '16777215',
  '441',
  '3355443',
  '0',
  'ENDSEC',
  '0',
  'EOF'
].join('\n');

const tags = parseDxfText(sampleDxf);
const builder = new RenderingDocumentBuilder({ tags });
const document = builder.build();

assert.strictEqual(document.tables.plotStyleMode, 0, 'Expected named plot style mode');
assert(document.tables.plotStyles, 'Plot styles catalog should be present');
assert.strictEqual(document.tables.plotStyles.modeLabel, 'named', 'Plot style mode label mismatch');

const normalHandle = 'F';
const namedCatalog = document.tables.plotStyles.named;
assert(namedCatalog && namedCatalog.byHandle, 'Named plot style catalog missing');
assert(namedCatalog.byHandle[normalHandle], 'Normal plot style descriptor missing');
assert.strictEqual(namedCatalog.byHandle[normalHandle].name, 'Normal', 'Unexpected plot style name');

const layouts = document.tables.layouts;
assert(layouts && layouts.byName && layouts.byName.LAYOUT1, 'Layout metadata missing');

const plotConfigurations = document.tables.plotConfigurations;
assert(plotConfigurations && plotConfigurations.byName && plotConfigurations.byName.LAYOUT1, 'Plot configuration missing');
assert.strictEqual(plotConfigurations.byName.LAYOUT1.plotStyleTable, 'sample.stb', 'Plot style table name mismatch');

const mtext = document.entities.find((entity) => entity.type === 'MTEXT');
assert(mtext, 'Expected MTEXT entity to be present');
assert(mtext.geometry.backgroundFill !== 0, 'Background fill flag should be set');
assert(mtext.geometry.backgroundTrueColor && typeof mtext.geometry.backgroundTrueColor.r === 'number', 'True color should be parsed');
assert(mtext.geometry.backgroundTransparency && typeof mtext.geometry.backgroundTransparency.alpha === 'number', 'Background transparency should be parsed');
assert(mtext.resolved && mtext.resolved.plotStyle, 'Resolved plot style should be present on entity');
assert.strictEqual(mtext.resolved.plotStyle.handleUpper, normalHandle, 'Resolved plot style handle mismatch');

const textEngine = new TextLayoutEngine();
textEngine.configure({});
const backgroundCss = textEngine._resolveBackground({ kind: 'MTEXT', geometry: mtext.geometry, entity: mtext });
assert(backgroundCss && backgroundCss.startsWith('rgba('), 'Background CSS should be generated for masked text');

console.log('Plot style and background mask checks passed.');
