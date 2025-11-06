#!/usr/bin/env node

/**
 * MTEXT parsing regression checks
 * Exercises the `_decodeMText` interpreter to ensure inline formatting
 * metadata is preserved for downstream layout/rendering.
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
  document: null
};
context.global = context;
context.globalThis = context;
vm.createContext(context);

function loadComponent(file) {
  const fullPath = path.join(componentsDir, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  vm.runInContext(source, context, { filename: fullPath });
  if (context.window && context.window.DxfRendering) {
    context.DxfRendering = context.window.DxfRendering;
  }
}

loadComponent('rendering-text-layout.js');
loadComponent('rendering-entities.js');

const TextLayoutEngine = context.DxfRendering && context.DxfRendering.TextLayoutEngine;
const RenderableEntityFactory = context.DxfRendering && context.DxfRendering.RenderableEntityFactory;
if (!TextLayoutEngine) {
  console.error('Unable to load TextLayoutEngine from rendering-text-layout.js');
  process.exit(1);
}
if (!RenderableEntityFactory) {
  console.error('Unable to load RenderableEntityFactory from rendering-entities.js');
  process.exit(1);
}

const engine = new TextLayoutEngine();
const decode = (value) => engine._decodeMText(value);

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(err && err.stack ? err.stack : err);
  }
}

test('Plain text yields single run', () => {
  const result = decode('Hello world');
  assert.strictEqual(result.text, 'Hello world');
  assert.strictEqual(result.runs.length, 1);
  assert.deepStrictEqual(result.runs[0].text, 'Hello world');
  assert.strictEqual(result.paragraphs.length, 1);
  assert.strictEqual(result.paragraphs[0].hasContent, true);
});

test('Paragraph break via \\P', () => {
  const result = decode('First\\PSecond');
  assert.strictEqual(result.runs.length, 3); // text, paragraphBreak, text
  assert.strictEqual(result.paragraphs.length, 2);
  const [p0, p1] = result.paragraphs;
  assert.strictEqual(p0.startRun, 0);
  assert.strictEqual(p0.hasContent, true);
  assert.strictEqual(p1.startRun, 2);
  assert.strictEqual(p1.hasContent, true);
  assert.strictEqual(result.runs[0].text, 'First');
  assert.strictEqual(result.runs[2].text, 'Second');
});

test('Inline formatting toggles bold/italic underline', () => {
  const result = decode('Normal {\\b Bold} \\iItalic\\i');
  const boldRun = result.runs.find((run) => run.text && run.text.trim() === 'Bold');
  assert.ok(boldRun, 'Bold run missing');
  assert.strictEqual(boldRun.style.bold, true);
  assert.strictEqual(boldRun.style.italic, false);
  const italicRuns = result.runs.filter((run) => run.text && run.text.trim() === 'Italic');
  assert.strictEqual(italicRuns.length, 1);
  assert.strictEqual(italicRuns[0].style.italic, true);
  assert.strictEqual(italicRuns[0].style.bold, false);
});

test('Colour parsing handles ACI and true colour', () => {
  const aciResult = decode('\\C1;Red');
  const rgbResult = decode('\\C255,0,0;RGB');
  const hexResult = decode('\\C#00FF00;Green');

  const aciRun = aciResult.runs[0];
  assert.strictEqual(aciRun.style.color.type, 'aci');
  assert.strictEqual(aciRun.style.color.index, 1);

  const rgbRun = rgbResult.runs[0];
  assert.strictEqual(rgbRun.style.color.type, 'rgb');
  assert.strictEqual(rgbRun.style.color.r, 255);
  assert.strictEqual(rgbRun.style.color.g, 0);
  assert.strictEqual(rgbRun.style.color.b, 0);

  const hexRun = hexResult.runs[0];
  assert.strictEqual(hexRun.style.color.type, 'rgb');
  assert.strictEqual(hexRun.style.color.r, 0);
  assert.strictEqual(hexRun.style.color.g, 255);
  assert.strictEqual(hexRun.style.color.b, 0);
});

test('Height and width scaling retained', () => {
  const result = decode('\\H2.5x;Tall \\W0.5;Narrow');
  const tallRun = result.runs.find((run) => run.text === 'Tall ');
  assert.ok(tallRun, 'Tall run missing');
  assert.strictEqual(tallRun.style.heightScale, 2.5);
  assert.strictEqual(tallRun.style.heightMode, 'relative');
  const narrowRun = result.runs.find((run) => run.text === 'Narrow');
  assert.ok(narrowRun, 'Narrow run missing');
  assert.strictEqual(narrowRun.style.widthScale, 0.5);
});

test('Background mask directives captured', () => {
  const result = decode('\\bg1;\\Bc10;Masked');
  const run = result.runs[0];
  assert.ok(run.style.background);
  assert.strictEqual(run.style.background.enabled, true);
  assert.strictEqual(run.style.background.color.type, 'aci');
  assert.strictEqual(run.style.background.color.index, 10);
});

test('Unicode escapes converted', () => {
  const result = decode('Omega: \\U+03A9');
  assert.strictEqual(result.text, 'Omega: Ω');
  const omegaRun = result.runs.find((run) => run.text && run.text.includes('Ω'));
  assert.ok(omegaRun, 'Unicode character not present in runs');
});

test('Field codes evaluate \\AcVar sequences', () => {
  engine.configure({
    fieldContext: {
      drawingProperties: {
        metadata: {
          acadVersion: 'AC1032',
          created: {
            iso: '2024-01-01T00:00:00.000Z',
            locale: 'Mon Jan 01 2024 00:00:00 GMT'
          }
        }
      },
      geographic: {
        headerVariables: Object.create(null)
      }
    }
  });
  const result = decode('%<\\AcVar $ACADVER>% %<\\AcVar $TDCREATE \\f "%tc1">%');
  const fieldRuns = result.runs.filter((run) => run.type === 'field');
  assert.strictEqual(fieldRuns.length, 2, 'Expected two field runs');
  assert.strictEqual(fieldRuns[0].text, 'AC1032');
  assert.ok(fieldRuns[0].field, 'Field metadata missing');
  assert.strictEqual((fieldRuns[0].field.name || '').toUpperCase(), 'ACADVER');
  assert.strictEqual(fieldRuns[1].text, 'Mon Jan 01 2024 00:00:00 GMT');
  assert.strictEqual((fieldRuns[1].field.name || '').toUpperCase(), 'TDCREATE');
  engine.configure({ fieldContext: null, headerVariables: null });
});

test('List and tab escapes captured as metadata', () => {
  const result = decode('\\li2.5;\\ln1.25;\\lt0.5;\\pi•;\\tc5.0;Item');
  assert.ok(result.paragraphs.length > 0, 'Paragraph metadata missing');
  const paragraph = result.paragraphs[0];
  assert.ok(paragraph, 'First paragraph missing');
  assert.ok(paragraph.indent, 'Indent metadata missing');
  assert.strictEqual(paragraph.indent.left, 2.5);
  assert.strictEqual(paragraph.indent.firstLine, 1.25);
  assert.strictEqual(paragraph.indent.right, 0.5);
  assert.ok(paragraph.list, 'List metadata missing');
  assert.strictEqual(paragraph.list.kind, 'bullet');
  assert.strictEqual(paragraph.list.bullet, '•');
  assert.strictEqual(paragraph.list.indent.value, 2.5);
  assert.strictEqual(paragraph.list.indent.firstLine, 1.25);
  assert.strictEqual(paragraph.tabs.length, 1);
  assert.strictEqual(paragraph.tabs[0].type, 'center');
  assert.strictEqual(paragraph.tabs[0].value, 5);
});

test('RenderableEntityFactory captures MTEXT column/background metadata', () => {
  const tags = [
    { code: 0, value: 'MTEXT' },
    { code: 10, value: 0 },
    { code: 20, value: 0 },
    { code: 30, value: 0 },
    { code: 40, value: 1 },
    { code: 1, value: 'Body' },
    { code: 46, value: 0.25 },
    { code: 47, value: 0.5 },
    { code: 48, value: 0.75 },
    { code: 49, value: 1.0 },
    { code: 75, value: 2 },
    { code: 76, value: 3 },
    { code: 77, value: 1 },
    { code: 170, value: 4 }
  ];
  const entity = RenderableEntityFactory.fromTags('MTEXT', tags, {});
  assert.ok(entity && entity.geometry, 'MTEXT geometry not parsed');
  const backgroundOffsets = entity.geometry.backgroundOffsets;
  assert.ok(backgroundOffsets, 'Background offsets missing');
  assert.strictEqual(backgroundOffsets['46'], 0.25);
  assert.strictEqual(backgroundOffsets['47'], 0.5);
  assert.strictEqual(backgroundOffsets['48'], 0.75);
  assert.strictEqual(backgroundOffsets['49'], 1);
  const columns = entity.geometry.columns;
  assert.ok(columns, 'Column metadata missing');
  assert.strictEqual(columns.type, 2);
  assert.strictEqual(columns.count, 3);
  assert.strictEqual(columns.flow, 1);
  assert.ok(Array.isArray(columns.raw['170']));
  assert.strictEqual(columns.raw['170'][0], 4);
});

test('Layout accounts for width scaling', () => {
  const baseResult = decode('Wide');
  const baseGeometry = {
    text: 'Wide',
    height: 1,
    referenceWidth: 0,
    backgroundFill: 0,
    backgroundOffsets: null,
    columns: null,
    drawingDirection: 0,
    lineSpacingStyle: 1,
    lineSpacing: null
  };
  const baseRaw = {
    kind: 'MTEXT',
    geometry: baseGeometry,
    worldHeight: 12,
    baseHeight: 12,
    rotation: 0,
    color: { css: '#ffffff' },
    decodedMText: baseResult
  };
  const layoutBase = engine.layout(baseRaw, { frameScale: 1 });

  const scaledResult = decode('\\W2;Wide');
  const scaledGeometry = {
    text: '\\W2;Wide',
    height: 1,
    referenceWidth: 0,
    backgroundFill: 0,
    backgroundOffsets: null,
    columns: null,
    drawingDirection: 0,
    lineSpacingStyle: 1,
    lineSpacing: null
  };
  const scaledRaw = {
    kind: 'MTEXT',
    geometry: scaledGeometry,
    worldHeight: 12,
    baseHeight: 12,
    rotation: 0,
    color: { css: '#ffffff' },
    decodedMText: scaledResult
  };
  const layoutScaled = engine.layout(scaledRaw, { frameScale: 1 });
  assert.ok(layoutBase && layoutScaled, 'Layouts not generated');
  assert.ok(layoutScaled.widthPx > layoutBase.widthPx, 'Width scaling not applied');
});

test('Vertical writing flag is set for drawing direction 1', () => {
  const result = decode('Vertical text');
  const geometry = {
    text: result.text,
    height: 1,
    referenceWidth: 0,
    backgroundFill: 0,
    backgroundOffsets: null,
    columns: null,
    drawingDirection: 1,
    lineSpacingStyle: 1,
    lineSpacing: null
  };
  const raw = {
    kind: 'MTEXT',
    geometry,
    worldHeight: 10,
    baseHeight: 10,
    rotation: 0,
    color: { css: '#ffffff' },
    decodedMText: result
  };
  const layout = engine.layout(raw, { frameScale: 1 });
  assert.ok(layout, 'Layout missing');
  assert.strictEqual(layout.verticalWriting, true);
});

test('Column metadata produces column layouts', () => {
  const result = decode('Col1\\PCol2\\PCol3\\PCol4');
  const geometry = {
    text: 'Col1\\PCol2\\PCol3\\PCol4',
    height: 1,
    referenceWidth: 0,
    backgroundFill: 0,
    backgroundOffsets: null,
    columns: { count: 2, flow: 1, raw: { '76': [2] } },
    drawingDirection: 0,
    lineSpacingStyle: 1,
    lineSpacing: null
  };
  const raw = {
    kind: 'MTEXT',
    geometry,
    worldHeight: 12,
    baseHeight: 12,
    rotation: 0,
    color: { css: '#ffffff' },
    decodedMText: result
  };
  const layout = engine.layout(raw, { frameScale: 1 });
  assert.ok(layout.columnLayouts, 'Column layouts missing');
  assert.strictEqual(layout.columnLayouts.count, 2);
  const columnLines = layout.columnLayouts.layouts.reduce((total, column) => total + column.lines.length, 0);
  assert.strictEqual(columnLines, layout.lineCount);
});

test('Layout propagates list and tab metadata', () => {
  const decoded = decode('\\li1.0;\\pn3;\\pl2;\\ta4.5;Numbered');
  const geometry = {
    text: '\\li1.0;\\pn3;\\pl2;\\ta4.5;Numbered',
    height: 1,
    referenceWidth: 0,
    backgroundFill: 0,
    backgroundOffsets: null,
    columns: null,
    drawingDirection: 0,
    lineSpacingStyle: 1,
    lineSpacing: null
  };
  const raw = {
    kind: 'MTEXT',
    geometry,
    worldHeight: 12,
    baseHeight: 12,
    rotation: 0,
    color: { css: '#ffffff' },
    decodedMText: decoded
  };
  const layout = engine.layout(raw, { frameScale: 1 });
  assert.ok(layout, 'Layout missing');
  assert.ok(Array.isArray(layout.paragraphLayouts), 'Paragraph layouts missing');
  const paragraphLayout = layout.paragraphLayouts[0];
  assert.ok(paragraphLayout, 'First paragraph layout missing');
  assert.ok(paragraphLayout.list, 'List metadata not propagated');
  assert.strictEqual(paragraphLayout.list.start, 3);
  assert.strictEqual(paragraphLayout.list.level, 2);
  assert.strictEqual(paragraphLayout.tabs.length, 1);
  assert.strictEqual(paragraphLayout.tabs[0].type, 'aligned');
  assert.strictEqual(paragraphLayout.tabs[0].value, 4.5);
});

test('Caret ^J inserts line break', () => {
  const decoded = decode('First^JSecond');
  const breakRuns = decoded.runs.filter((run) => run.type === 'paragraphBreak');
  assert.strictEqual(breakRuns.length, 1, 'Expected caret break to emit paragraphBreak run');
  const geometry = {
    text: 'First^JSecond',
    height: 1,
    referenceWidth: 0,
    backgroundFill: 0,
    backgroundOffsets: null,
    columns: null,
    drawingDirection: 0,
    lineSpacingStyle: 1,
    lineSpacing: null
  };
  const raw = {
    kind: 'MTEXT',
    geometry,
    worldHeight: 12,
    baseHeight: 12,
    rotation: 0,
    color: { css: '#ffffff' },
    decodedMText: decoded
  };
  const layout = engine.layout(raw, { frameScale: 1 });
  assert.ok(layout, 'Layout missing');
  assert.strictEqual(layout.lineCount, 2, 'Caret break should create second line');
});

test('Layout applies hanging indent and bullet marker', () => {
  const source = '\\li0.5;\\ln0.2;\\pi•;First bullet';
  const decoded = decode(source);
  const geometry = {
    text: source,
    height: 1,
    referenceWidth: 0,
    backgroundFill: 0,
    backgroundOffsets: null,
    columns: null,
    drawingDirection: 0,
    lineSpacingStyle: 1,
    lineSpacing: null
  };
  const raw = {
    kind: 'MTEXT',
    geometry,
    worldHeight: 10,
    baseHeight: 10,
    rotation: 0,
    color: { css: '#ffffff' },
    decodedMText: decoded
  };
  const layout = engine.layout(raw, { frameScale: 1 });
  assert.ok(layout, 'Layout missing');
  const paragraph = layout.paragraphLayouts[0];
  assert.ok(paragraph, 'Paragraph layout missing');
  const line = paragraph.lines[0];
  assert.ok(line, 'First line missing');
  const indentSegment = line.segments.find((segment) => segment.type === 'indent');
  assert.ok(indentSegment, 'Indent segment missing');
  assert.ok(indentSegment.widthPx > 0, 'Indent segment width not applied');
  const markerSegment = line.segments.find((segment) => segment.type === 'listMarker');
  assert.ok(markerSegment, 'List marker segment missing');
  assert.strictEqual(markerSegment.text.trim(), '•');
  const textSegment = line.segments.find((segment) => segment.text && segment.text.includes('First bullet'));
  assert.ok(textSegment, 'Bullet text segment missing');
});

test('Tab stops insert spacing segments', () => {
  const source = '\\tc2.0;A\\tB';
  const decoded = decode(source);
  const geometry = {
    text: source,
    height: 1,
    referenceWidth: 0,
    backgroundFill: 0,
    backgroundOffsets: null,
    columns: null,
    drawingDirection: 0,
    lineSpacingStyle: 1,
    lineSpacing: null
  };
  const raw = {
    kind: 'MTEXT',
    geometry,
    worldHeight: 12,
    baseHeight: 12,
    rotation: 0,
    color: { css: '#ffffff' },
    decodedMText: decoded
  };
  const layout = engine.layout(raw, { frameScale: 1 });
  assert.ok(layout, 'Layout missing');
  const paragraph = layout.paragraphLayouts[0];
  assert.ok(paragraph, 'Paragraph layout missing');
  const line = paragraph.lines[0];
  assert.ok(line, 'Line missing');
  const tabSegment = line.segments.find((segment) => segment.type === 'tab');
  assert.ok(tabSegment, 'Tab spacing segment missing');
  assert.ok(tabSegment.widthPx > 0, 'Tab spacing segment width not applied');
});

test('Manual column break via \\X produces column layouts', () => {
  const source = 'Column One\\XColumn Two';
  const decoded = decode(source);
  const geometry = {
    text: source,
    height: 1,
    referenceWidth: 0,
    backgroundFill: 0,
    backgroundOffsets: null,
    columns: null,
    drawingDirection: 0,
    lineSpacingStyle: 1,
    lineSpacing: null
  };
  const raw = {
    kind: 'MTEXT',
    geometry,
    worldHeight: 12,
    baseHeight: 12,
    rotation: 0,
    color: { css: '#ffffff' },
    decodedMText: decoded
  };
  const layout = engine.layout(raw, { frameScale: 1 });
  assert.ok(layout, 'Layout missing');
  assert.ok(layout.columnLayouts, 'Manual column break should create column layouts');
  assert.strictEqual(layout.columnLayouts.count, 2, 'Expected two columns from manual break');
  const [firstColumn, secondColumn] = layout.columnLayouts.layouts;
  assert.ok(firstColumn.lines.includes('Column One'), 'First column missing expected text');
  assert.ok(secondColumn.lines.includes('Column Two'), 'Second column missing expected text');
  assert.ok(Array.isArray(layout.manualColumnBreaks) && layout.manualColumnBreaks.length === 1, 'Manual break indices missing');
});

test('Stacked fraction escape emits fraction run and layout segment', () => {
  const source = 'Value \\S1^2;';
  const decoded = decode(source);
  const fractionRun = decoded.runs.find((run) => run.type === 'fraction');
  assert.ok(fractionRun, 'Fraction run missing');
  assert.strictEqual(fractionRun.fraction.numerator, '1');
  assert.strictEqual(fractionRun.fraction.denominator, '2');
  const geometry = {
    text: source,
    height: 1,
    referenceWidth: 0,
    backgroundFill: 0,
    backgroundOffsets: null,
    columns: null,
    drawingDirection: 0,
    lineSpacingStyle: 1,
    lineSpacing: null
  };
  const raw = {
    kind: 'MTEXT',
    geometry,
    worldHeight: 10,
    baseHeight: 10,
    rotation: 0,
    color: { css: '#ffffff' },
    decodedMText: decoded
  };
  const layout = engine.layout(raw, { frameScale: 1 });
  assert.ok(layout, 'Layout missing');
  const paragraph = layout.paragraphLayouts[0];
  assert.ok(paragraph, 'Paragraph layout missing');
  const line = paragraph.lines[0];
  assert.ok(line, 'Line missing');
  const fractionSegment = line.segments.find((segment) => segment.type === 'fraction');
  assert.ok(fractionSegment, 'Fraction segment missing');
  assert.ok(fractionSegment.widthPx > 0, 'Fraction segment width should be positive');
  assert.ok(fractionSegment.heightPx > (fractionSegment.numerator.fontSizePx || 0), 'Fraction segment height not applied');
});

test('Background metrics expand mask with scale and offsets', () => {
  const source = 'Masked text';
  const decoded = decode(source);
  const geometry = {
    text: source,
    height: 1,
    referenceWidth: 0,
    backgroundFill: 1,
    backgroundScale: 1.25,
    backgroundOffsets: {
      '46': 0.2,
      '47': 0.15,
      '48': 0.3,
      '49': 0.25
    },
    backgroundColorNumber: 3,
    columns: null,
    drawingDirection: 0,
    lineSpacingStyle: 1,
    lineSpacing: null
  };
  const raw = {
    kind: 'MTEXT',
    geometry,
    worldHeight: 10,
    baseHeight: 10,
    rotation: 0,
    color: { css: '#ffffff' },
    decodedMText: decoded
  };
  const layout = engine.layout(raw, { frameScale: 10 });
  assert.ok(layout, 'Layout missing');
  assert.ok(layout.backgroundMetrics, 'Background metrics missing');
  const metrics = layout.backgroundMetrics;
  assert.ok(metrics.width > layout.widthPx, 'Expected background width to exceed text width');
  assert.ok(metrics.height > layout.heightPx, 'Expected background height to exceed text height');
  assert.ok(metrics.x < 0, 'Expected background origin to shift left from offsets');
  assert.ok(metrics.y < 0, 'Expected background origin to shift upward from offsets');
});

if (failures) {
  process.exit(1);
} else {
  console.log('All MTEXT parsing checks passed.');
}
