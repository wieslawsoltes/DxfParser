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

const componentsDir = path.join(projectRoot, 'components');
const preferredOrder = [
  'rendering-entities.js',
  'rendering-data-controller.js',
  'rendering-surface-canvas.js',
  'rendering-surface-webgl.js',
  'rendering-text-layout.js',
  'rendering-document-builder.js',
  'rendering-scene-graph.js',
  'rendering-tessellation.js',
  'rendering-renderer.js',
  'rendering-overlay.js'
];

// Discover all rendering modules so new files are automatically picked up by the bundle.
const availableRenderingModules = fs.readdirSync(componentsDir)
  .filter((file) => /^rendering-.*\.js$/.test(file))
  .sort();

const modules = [
  ...preferredOrder
    .filter((file) => availableRenderingModules.includes(file))
    .map((file) => path.join('components', file)),
  ...availableRenderingModules
    .filter((file) => !preferredOrder.includes(file))
    .map((file) => path.join('components', file))
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
