import { sourceForest, checkSignal, text } from './forest.mjs';

function terms(values, name, fold = false) {
    if (!Array.isArray(values)) throw new TypeError(`${name} must be an array.`);
    return values.map(value => fold ? text(value).toLowerCase() : text(value));
}

function lineLimit(value, name) {
    if (value == null) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(`${name} must be finite.`);
    return number;
}

/** Retains ancestor context and the workbench's property/code/type semantics.
 * Nodes and child/property arrays are projections. Tags remain source-owned. */
export function filterSourceTree(nodes, { codeTerms = [], dataTerms = [], dataExact = false,
    dataCase = false, minLine = null, maxLine = null, objectTypes = [],
    sourceMap = new WeakMap(), limits, signal } = {}) {
    if (!sourceMap || typeof sourceMap.set !== 'function') throw new TypeError('sourceMap must support set().');
    const codes = new Set(terms(codeTerms, 'codeTerms'));
    const data = terms(dataTerms, 'dataTerms', !dataCase);
    const types = new Set(terms(objectTypes, 'objectTypes', true));
    const lower = lineLimit(minLine, 'minLine'), upper = lineLimit(maxLine, 'maxLine');
    if (lower !== null && upper !== null && lower > upper) throw new RangeError('minLine exceeds maxLine.');
    const lineMatches = value => {
        if (lower === null && upper === null) return true;
        const line = Number.parseInt(value, 10);
        return Number.isFinite(line) && (lower === null || line >= lower) && (upper === null || line <= upper);
    };
    const dataMatches = value => {
        const candidate = dataCase ? text(value) : text(value).toLowerCase();
        return data.some(term => dataExact ? candidate === term : candidate.includes(term));
    };
    const forest = sourceForest(nodes, { limits, signal });
    const projections = new Map();
    for (let i = forest.entries.length - 1; i >= 0; i--) {
        checkSignal(signal);
        const entry = forest.entries[i], node = entry.node;
        const properties = entry.properties.filter(property => {
            checkSignal(signal);
            return lineMatches(property.line) && (!codes.size || codes.has(text(property.code))) &&
                (!data.length || dataMatches(property.value));
        });
        const children = entry.children.map(child => projections.get(child.node)).filter(Boolean);
        if (types.size && !types.has(text(node.type).toLowerCase()) && !children.length) continue;
        if (data.length && !dataMatches(node.type) && !properties.length && !children.length) continue;
        if (!lineMatches(node.line) && !properties.length && !children.length) continue;
        const projected = { ...node, expanded: node.expanded, properties, children };
        sourceMap.set(projected, node);
        projections.set(node, projected);
    }
    return forest.roots.map(entry => projections.get(entry.node)).filter(Boolean);
}
