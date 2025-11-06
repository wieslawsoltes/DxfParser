#!/usr/bin/env node

/**
 * Rendering parity check
 * Compares the scene graph statistics produced by RenderingDocumentBuilder
 * against a baseline captured from Autodesk TrueView (or other trusted source).
 * Supports optional SVG capture and PNG diffing.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const componentsDir = path.join(projectRoot, 'components');
const baselinesDir = path.join(__dirname, 'baselines');

const requiredComponents = [
  { file: 'rendering-entities.js' },
  { file: 'rendering-scene-graph.js' },
  { file: 'rendering-document-builder.js' },
  { file: 'rendering-surface-canvas.js' },
  { file: 'rendering-surface-webgl.js' },
  { file: 'rendering-text-layout.js' },
  { file: 'rendering-renderer.js' }
];

const context = {
  console,
  window: {},
  DxfRendering: {},
  performance: { now: () => Date.now() }
};
context.global = context;
context.globalThis = context;
vm.createContext(context);

function loadComponent({ file, exportSymbol }) {
  const fullPath = path.join(componentsDir, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  vm.runInContext(source, context, { filename: fullPath });
  if (context.window && context.window.DxfRendering) {
    context.DxfRendering = context.window.DxfRendering;
  }
  if (exportSymbol) {
    vm.runInContext(
      `if (typeof ${exportSymbol} !== 'undefined') { globalThis.${exportSymbol} = ${exportSymbol}; }`,
      context
    );
  }
}

requiredComponents.forEach(loadComponent);

const RenderingDocumentBuilder = context.DxfRendering.RenderingDocumentBuilder;
const RenderingSurfaceManager = context.DxfRendering.RenderingSurfaceManager;

if (!RenderingDocumentBuilder) {
  console.error('Failed to load rendering components.');
  process.exit(1);
}

const args = process.argv.slice(2);
const captureMode = args.includes('--capture');
const captureSvg = args.includes('--capture-svg');
const compareSvgOnly = args.includes('--compare-svg');
const pngDiffMode = args.includes('--png-diff');

let sharp = null;
let pixelmatch = null;
let PNG = null;
try { sharp = require('sharp'); } catch (err) { sharp = null; }
try { pixelmatch = require('pixelmatch'); } catch (err) { pixelmatch = null; }
try { ({ PNG } = require('pngjs')); } catch (err) { PNG = null; }

const outputsDir = path.join(__dirname, 'outputs');
let warnedSharp = false;
let warnedPixelmatch = false;
let warnedPngjs = false;

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadBaselines(dir) {
  const entries = fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
  return entries.map((entry) => ({
    path: path.join(dir, entry),
    data: readJson(path.join(dir, entry))
  }));
}

function collectDimensionEntities(sceneGraph) {
  const result = [];
  if (!sceneGraph || typeof sceneGraph !== 'object') {
    return result;
  }
  const visit = (collection) => {
    if (!Array.isArray(collection)) {
      return;
    }
    collection.forEach((entity) => {
      if (entity && entity.type === 'DIMENSION') {
        result.push(entity);
      }
    });
  };
  visit(sceneGraph.modelSpace);
  if (Array.isArray(sceneGraph.paperSpace)) {
    visit(sceneGraph.paperSpace);
  }
  if (sceneGraph.paperSpaces && typeof sceneGraph.paperSpaces === 'object') {
    Object.values(sceneGraph.paperSpaces).forEach((space) => visit(space));
  }
  return result;
}

function computeDimensionMetrics(sceneGraph, frame) {
  const metrics = {};
  const entities = collectDimensionEntities(sceneGraph);
  if (!entities.length) {
    return metrics;
  }

  let linear = 0;
  let angular = 0;
  let diameter = 0;
  let radius = 0;
  let ordinate = 0;
  let ordinateX = 0;
  let ordinateY = 0;
  let alternateEnabled = 0;
  let toleranceEnabled = 0;
  let associativeDimensions = 0;
  let associativeHandles = 0;

  entities.forEach((entity) => {
    const geometry = entity.geometry || {};
    const subtypeRaw = Number.isFinite(geometry.dimensionSubtype)
      ? geometry.dimensionSubtype
      : (Number.isFinite(geometry.dimensionType) ? geometry.dimensionType : 0);
    const subtype = subtypeRaw & 7;
    switch (subtype) {
      case 0:
      case 1:
        linear += 1;
        break;
      case 2:
      case 5:
        angular += 1;
        break;
      case 3:
        diameter += 1;
        break;
      case 4:
        radius += 1;
        break;
      case 6:
        ordinate += 1;
        if (geometry.ordinateType === 1) {
          ordinateX += 1;
        } else if (geometry.ordinateType === 2) {
          ordinateY += 1;
        }
        break;
      default:
        break;
    }
    if (geometry.dimensionAlternateUnits && geometry.dimensionAlternateUnits.enabled) {
      alternateEnabled += 1;
    }
    if (geometry.dimensionMeasurementSettings && geometry.dimensionMeasurementSettings.toleranceEnabled) {
      toleranceEnabled += 1;
    }
    const assocHandles = Array.isArray(geometry.dimensionAssociativeHandles)
      ? geometry.dimensionAssociativeHandles
      : (Array.isArray(geometry.associativeHandles) ? geometry.associativeHandles : []);
    const assocMode = geometry.dimensionAssociativity != null ? geometry.dimensionAssociativity : null;
    const isAssociative = (assocMode != null && assocMode !== 0) || (assocHandles && assocHandles.length);
    if (isAssociative) {
      associativeDimensions += 1;
      associativeHandles += assocHandles.length;
    }
  });

  metrics['dimensions.total'] = entities.length;
  metrics['dimensions.linear'] = linear;
  metrics['dimensions.angular'] = angular;
  metrics['dimensions.diameter'] = diameter;
  metrics['dimensions.radius'] = radius;
  metrics['dimensions.ordinate'] = ordinate;
  metrics['dimensions.ordinateX'] = ordinateX;
  metrics['dimensions.ordinateY'] = ordinateY;
  metrics['dimensions.alternateEnabled'] = alternateEnabled;
  metrics['dimensions.toleranceEnabled'] = toleranceEnabled;
  metrics['dimensions.associative'] = associativeDimensions;
  metrics['dimensions.associativeHandles'] = associativeHandles;

  if (frame && typeof frame === 'object') {
    if (Array.isArray(frame.polylines)) {
      metrics['dimensions.arrowheads'] = frame.polylines.filter((poly) => poly.meta && poly.meta.dimensionPart === 'arrowhead').length;
      metrics['dimensions.centerMarks'] = frame.polylines.filter((poly) => poly.meta && poly.meta.dimensionPart === 'centerMark').length;
      metrics['dimensions.dimensionLines'] = frame.polylines.filter((poly) => poly.meta && poly.meta.dimensionPart === 'dimensionLine').length;
    }
    if (Array.isArray(frame.texts)) {
      const labels = frame.texts
        .filter((text) => text.meta && text.meta.dimensionPart === 'label')
        .map((text) => (text.content || '').trim())
        .filter((text) => text.length);
      metrics['dimensions.labels'] = labels.length;
      if (labels.length) {
        metrics['dimensions.labelSample'] = labels.slice(0, 3).join('|');
      }
    }
  }

  return metrics;
}

function compareStats(expected, actual) {
  const keys = Object.keys(expected);
  const mismatches = [];
  keys.forEach((key) => {
    const expectedValue = expected[key];
    const actualValue = actual[key];
    if (expectedValue !== actualValue) {
      mismatches.push({ key, expected: expectedValue, actual: actualValue });
    }
  });
  return mismatches;
}

async function runBaselineCheck(baseline, options = {}) {
  const baselineDir = path.dirname(baseline.path);
  const dxfPath = path.resolve(baselineDir, baseline.data.dxf);
  if (!fs.existsSync(dxfPath)) {
    throw new Error(`DXF sample not found: ${dxfPath}`);
  }

  const dxfText = fs.readFileSync(dxfPath, 'utf8');
  const tags = parseDxfText(dxfText);
  const builder = new RenderingDocumentBuilder({ tags });
  const doc = builder.build();
  const actualStats = Object.assign(
    {},
    doc.sceneGraph ? doc.sceneGraph.stats : {},
    doc.stats || {}
  );

  let frameManager = null;
  let frame = null;
  if (RenderingSurfaceManager && doc.sceneGraph) {
    try {
      frameManager = new RenderingSurfaceManager();
      frameManager.width = 1024;
      frameManager.height = 768;
      frameManager.devicePixelRatio = 1;
      frame = frameManager._buildFrame(doc.sceneGraph);
    } catch (err) {
      frameManager = null;
      frame = null;
      console.warn('Unable to build rendering frame for parity metrics:', err.message);
    }
  }

  const dimensionMetrics = computeDimensionMetrics(doc.sceneGraph, frame);
  Object.assign(actualStats, dimensionMetrics);

  let frameSnapshot = null;
  let frameSvg = null;
  if (frame && (options.capture || options.generateSvg || options.pngDiff)) {
    try {
      if (options.capture) {
        frameSnapshot = serializeFrame(frame);
      }
      if (options.generateSvg || options.pngDiff) {
        frameSvg = frameToSvg(frame);
      }
    } catch (err) {
      console.warn('Unable to generate frame snapshot:', err.message);
    }
  }

  let pngDiff = null;
  if (options.pngDiff && frameSvg && baseline.data.referencePng) {
    pngDiff = await compareSvgToReference(baseline, frameSvg);
  }

  return {
    mismatches: compareStats(baseline.data.expectedStats, actualStats),
    frameSnapshot,
    frameSvg,
    pngDiff
  };
}

function serializeFrame(frame) {
  if (!frame) return null;
  const serializePolyline = (polyline) => ({
    weight: polyline.weight,
    color: polyline.color,
    points: Array.from(polyline.screenPoints.slice(0, 40))
  });
  const serializeFill = (fill) => ({
    color: fill.color,
    triangles: Array.from(fill.triangles.slice(0, 48))
  });
  const serializePoint = (point) => ({
    position: Array.from(point.screenPosition),
    size: point.size,
    color: point.color
  });
  const serializeText = (text) => ({
    lines: text.lines,
    screenPosition: text.screenPosition,
    fontSize: text.fontSize,
    lineHeight: text.lineHeight,
    rotationDeg: text.rotationDeg,
    rotationRad: text.rotationRad,
    widthFactor: text.widthFactor,
    color: text.colorCss,
    baseWidthPx: text.baseWidthPx,
    widthPx: text.widthPx,
    anchor: text.anchor
  });

  return {
    bounds: frame.bounds,
    scale: frame.scale,
    polylines: (frame.polylines || []).slice(0, 12).map(serializePolyline),
    fills: (frame.fills || []).slice(0, 12).map(serializeFill),
    points: (frame.points || []).slice(0, 32).map(serializePoint),
    texts: (frame.texts || []).slice(0, 32).map(serializeText)
  };
}

function frameToSvg(frame) {
  if (!frame) return null;
  const width = frame.width || 1024;
  const height = frame.height || 768;
  const encodeColor = (item) => (item && item.colorCss) || (item && item.color && item.color.css) || 'rgba(210,227,255,0.9)';
  const polylines = (frame.polylines || []).map((poly) => {
    const pts = Array.from(poly.screenPoints || []).map((v) => v.toFixed(2));
    return `<polyline fill="none" stroke="${encodeColor(poly)}" stroke-width="${(poly.weight || 1).toFixed(2)}" points="${pts.join(' ')}" />`;
  }).join('\n');
  const fills = (frame.fills || []).map((fill) => {
    const tris = [];
    const data = fill.triangles || [];
    for (let i = 0; i < data.length; i += 6) {
      tris.push(`<polygon fill="${encodeColor(fill)}" opacity="${(fill.color && fill.color.a) ? fill.color.a.toFixed(3) : '0.6'}" points="${[
        `${data[i].toFixed(2)},${data[i + 1].toFixed(2)}`,
        `${data[i + 2].toFixed(2)},${data[i + 3].toFixed(2)}`,
        `${data[i + 4].toFixed(2)},${data[i + 5].toFixed(2)}`
      ].join(' ')}" />`);
    }
    return tris.join('\n');
  }).join('\n');
  const points = (frame.points || []).map((pt) => {
    const pos = pt.screenPosition || [];
    const size = pt.size || 4;
    return `<circle cx="${pos[0].toFixed(2)}" cy="${pos[1].toFixed(2)}" r="${(size / 2).toFixed(2)}" fill="${encodeColor(pt)}" />`;
  }).join('\n');
  const texts = (frame.texts || []).map((text) => {
    const pos = text.screenPosition || [0, 0];
    const rotation = text.rotationDeg != null ? text.rotationDeg : (text.rotation || 0);
    const content = Array.isArray(text.lines) ? text.lines.join(' ') : (text.rawContent || '');
    return `<text x="${pos[0].toFixed(2)}" y="${pos[1].toFixed(2)}" font-size="${(text.fontSize || 12).toFixed(2)}" fill="${text.colorCss || '#ffffff'}" text-anchor="start" dominant-baseline="alphabetic" transform="rotate(${rotation.toFixed(2)} ${pos[0].toFixed(2)} ${pos[1].toFixed(2)})">${escapeXml(content)}</text>`;
  }).join('\n');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" fill="none">`,
    `<rect width="${width}" height="${height}" fill="#0b1828" />`,
    fills,
    polylines,
    points,
    texts,
    '</svg>'
  ].join('\n');
}

function escapeXml(str) {
  return String(str).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case '\'': return '&apos;';
      default: return char;
    }
  });
}

async function compareSvgToReference(baseline, frameSvg) {
  if (!pngDiffMode) {
    return { skipped: true, reason: 'PNG diff not requested' };
  }
  if (!sharp) {
    if (!warnedSharp) {
      console.warn('PNG diff skipped: sharp module is not installed. Install sharp to enable raster comparisons.');
      warnedSharp = true;
    }
    return { skipped: true, reason: 'sharp missing' };
  }
  if (!pixelmatch) {
    if (!warnedPixelmatch) {
      console.warn('PNG diff skipped: pixelmatch module is not installed. Install pixelmatch to enable raster comparisons.');
      warnedPixelmatch = true;
    }
    return { skipped: true, reason: 'pixelmatch missing' };
  }
  if (!PNG) {
    if (!warnedPngjs) {
      console.warn('PNG diff skipped: pngjs module is not installed. Install pngjs to enable raster comparisons.');
      warnedPngjs = true;
    }
    return { skipped: true, reason: 'pngjs missing' };
  }

  const referencePath = path.resolve(path.dirname(baseline.path), baseline.data.referencePng);
  if (!fs.existsSync(referencePath)) {
    console.warn(`Reference PNG missing for ${baseline.data.name || path.basename(baseline.path)}: ${referencePath}`);
    return { skipped: true, reason: 'reference PNG missing' };
  }

  const svgBuffer = Buffer.from(frameSvg, 'utf8');
  let actualBuffer = await sharp(svgBuffer).png().toBuffer();
  const referenceBuffer = fs.readFileSync(referencePath);

  let actualPng = PNG.sync.read(actualBuffer);
  const referencePng = PNG.sync.read(referenceBuffer);

  if (actualPng.width !== referencePng.width || actualPng.height !== referencePng.height) {
    actualBuffer = await sharp(svgBuffer).resize(referencePng.width, referencePng.height).png().toBuffer();
    actualPng = PNG.sync.read(actualBuffer);
  }

  const diffPng = new PNG({ width: referencePng.width, height: referencePng.height });
  const diffPixels = pixelmatch(referencePng.data, actualPng.data, diffPng.data, referencePng.width, referencePng.height, {
    threshold: 0.1,
    includeAA: true
  });

  if (diffPixels > 0) {
    fs.mkdirSync(outputsDir, { recursive: true });
    const baseName = baseline.data.name || path.basename(baseline.path, '.json');
    const actualPath = path.join(outputsDir, `${baseName}.actual.png`);
    const diffPath = path.join(outputsDir, `${baseName}.diff.png`);
    fs.writeFileSync(actualPath, PNG.sync.write(actualPng));
    fs.writeFileSync(diffPath, PNG.sync.write(diffPng));
    return { diffPixels, actualPath, diffPath };
  }

  return { diffPixels: 0 };
}

async function main() {
  const baselines = loadBaselines(baselinesDir);
  if (!baselines.length) {
    console.error('No baseline files found under tests/baselines.');
    process.exit(1);
  }

  let hasFailure = false;

  for (const baseline of baselines) {
    try {
      const { mismatches, frameSnapshot, frameSvg, pngDiff } = await runBaselineCheck(baseline, {
        capture: captureMode,
        generateSvg: captureSvg || !!baseline.data.referenceSvg,
        pngDiff: pngDiffMode
      });

      if (mismatches.length) {
        hasFailure = true;
        console.error(`Baseline mismatch for ${baseline.data.name || path.basename(baseline.path)}:`);
        mismatches.forEach((item) => {
          console.error(`  ${item.key}: expected ${item.expected}, got ${item.actual}`);
        });
      } else {
        console.log(`Baseline passed for ${baseline.data.name || path.basename(baseline.path)}`);

        if (captureMode && frameSnapshot) {
          fs.mkdirSync(outputsDir, { recursive: true });
          const fileBase = baseline.data.name || path.basename(baseline.path, '.json');
          const outputPath = path.join(outputsDir, `${fileBase}.frame.json`);
          fs.writeFileSync(outputPath, JSON.stringify(frameSnapshot, null, 2));
        }

        if (frameSvg && captureSvg) {
          fs.mkdirSync(outputsDir, { recursive: true });
          const fileBase = baseline.data.name || path.basename(baseline.path, '.json');
          const outputPath = path.join(outputsDir, `${fileBase}.frame.svg`);
          fs.writeFileSync(outputPath, frameSvg, 'utf8');
        }

        if (frameSvg && baseline.data.referenceSvg) {
          const referencePath = path.resolve(path.dirname(baseline.path), baseline.data.referenceSvg);
          if (!fs.existsSync(referencePath)) {
            console.warn(`Reference SVG missing for ${baseline.data.name || baseline.path}: ${referencePath}`);
          } else {
            const expectedSvg = fs.readFileSync(referencePath, 'utf8').trim();
            const actualSvg = frameSvg.trim();
            if (expectedSvg !== actualSvg) {
              hasFailure = true;
              console.error(`SVG mismatch for ${baseline.data.name || path.basename(baseline.path)}`);
              if (captureSvg) {
                fs.mkdirSync(outputsDir, { recursive: true });
                const fileBase = baseline.data.name || path.basename(baseline.path, '.json');
                fs.writeFileSync(path.join(outputsDir, `${fileBase}.actual.svg`), actualSvg, 'utf8');
              }
            }
          }
        }

        if (pngDiff && pngDiff.diffPixels > 0) {
          hasFailure = true;
          console.error(`PNG diff detected for ${baseline.data.name || path.basename(baseline.path)} (pixels different: ${pngDiff.diffPixels})`);
          if (pngDiff.actualPath) {
            console.error(`  Actual PNG: ${pngDiff.actualPath}`);
          }
          if (pngDiff.diffPath) {
            console.error(`  Diff PNG: ${pngDiff.diffPath}`);
          }
        } else if (pngDiff && pngDiff.skipped && !pngDiff.reason.includes('missing')) {
          console.warn(`PNG diff skipped for ${baseline.data.name || path.basename(baseline.path)}: ${pngDiff.reason}`);
        }
      }
    } catch (error) {
      hasFailure = true;
      console.error(`Error processing baseline ${baseline.path}:`, error.message);
    }
  }

  if (hasFailure) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
