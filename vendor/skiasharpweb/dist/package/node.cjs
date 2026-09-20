'use strict';
// The CJS bridge preserves the asynchronous namespace API; it does not require ESM synchronously.
const { pathToFileURL } = require('node:url');
const { version: Version } = require('../../package.json');
const load = () => import('./node.js');
const Initialize = options => load().then(module => module.Initialize(options));
const RegisterWebComponent = options => load().then(module => module.RegisterWebComponent(options));
const GetAssetUrls = baseUrl => {
  const base = new URL(baseUrl === undefined ? '../vendor/' : String(baseUrl).replace(/\/?$/, '/'), pathToFileURL(__filename));
  if (!['http:', 'https:', 'file:'].includes(base.protocol)) throw new TypeError('assetBaseUrl must use http:, https:, or file:.');
  return Object.freeze({ scriptUrl:new URL('canvaskit.js',base).href, wasmUrl:new URL('canvaskit.wasm',base).href, wasmBaseUrl:base.href });
};
module.exports = { Initialize, RegisterWebComponent, GetAssetUrls, Version, default: Initialize };
