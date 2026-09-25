'use strict';
const createCore = require('./index.js');
const createImport = require('./import.js');
module.exports = function createDxfCompare(DxfSkia) {
    const api = createCore(DxfSkia);
    return Object.assign(api, createImport(DxfSkia, api));
};
