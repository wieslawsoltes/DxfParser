#!/usr/bin/env node

/**
 * Creates dist/dxf-rendering.global.js by concatenating the rendering modules.
 * Run with: node scripts/build-rendering-bundle.js
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const bundlePath = path.join(distDir, 'dxf-rendering.global.js');

const modules = [
  'components/rendering-entities.js',
  'components/rendering-data-controller.js',
  'components/rendering-surface-canvas.js',
  'components/rendering-surface-webgl.js',
  'components/rendering-text-layout.js',
  'components/rendering-document-builder.js',
  'components/rendering-scene-graph.js',
  'components/rendering-renderer.js',
  'components/rendering-overlay.js'
];

function ensureDistDirectory() {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }
}

function buildBundle() {
  ensureDistDirectory();

  const bannerLines = [
    '// Auto-generated convenience bundle.',
    '// Concatenates core rendering modules for direct <script> inclusion.',
    '// Source modules:',
    ...modules.map((module) => `//   ${module}`),
    '',
    ''
  ];

  const chunks = [bannerLines.join('\n')];

  modules.forEach((modulePath) => {
    const absolutePath = path.join(projectRoot, modulePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Module not found: ${modulePath}`);
    }
    const source = fs.readFileSync(absolutePath, 'utf8');
    chunks.push(`// ---- Begin: ${modulePath} ----\n${source}\n// ---- End: ${modulePath} ----\n`);
  });

  fs.writeFileSync(bundlePath, chunks.join('\n'));
  console.log(`Bundle written to ${path.relative(projectRoot, bundlePath)}`);
}

buildBundle();
