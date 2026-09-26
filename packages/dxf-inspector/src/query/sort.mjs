import { sourceForest, checkSignal, text } from './forest.mjs';

const fields = new Set(['line', 'code', 'type', 'objectCount', 'dataSize']);
const number = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const code = (value, fallback) => { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) ? parsed : fallback; };

function validateField(field) {
    if (!fields.has(field)) throw new RangeError('Unknown source sort field: ' + field);
}

/** Compute each recursive aggregate once, rather than once per comparison. */
function sortKeys(forest, field, signal) {
    const keys = new Map();
    for (let i = forest.entries.length - 1; i >= 0; i--) {
        checkSignal(signal);
        const { node, properties, children } = forest.entries[i];
        let key;
        switch (field) {
            case 'line': key = number(node.line); break;
            case 'code': key = node.isProperty ? code(node.code, Number.MAX_SAFE_INTEGER) : 0; break;
            case 'type': key = text(node.isProperty ? node.data : node.type); break;
            case 'objectCount': key = node.isProperty ? 0 : children.reduce((sum, child) => sum + (child.node.isProperty ? 0 : 1 + keys.get(child.node)), 0); break;
            case 'dataSize': key = node.isProperty ? text(node.data).length :
                text(node.type).length + properties.reduce((sum, property) => sum + text(property.value).length, 0) +
                children.reduce((sum, child) => sum + keys.get(child.node), 0); break;
        }
        keys.set(node, key);
    }
    return keys;
}

export function sourceSortValue(node, field, options = {}) {
    validateField(field);
    return sortKeys(sourceForest([node], options), field, options.signal).get(node);
}

/** Stable in-place source ordering. Validation, aggregate computation and sorting
 * are completed before writes. Source node/tag identities never change. */
export function sortSourceTree(nodes, field, ascending = true, options = {}) {
    validateField(field);
    if (typeof ascending !== 'boolean') throw new TypeError('ascending must be a boolean.');
    const forest = sourceForest(nodes, options), keys = sortKeys(forest, field, options.signal);
    const direction = ascending ? 1 : -1;
    const compare = (a, b) => (typeof a === 'string' ? a.localeCompare(b) : a - b) * direction;
    const plans = [];
    const plan = (array, key) => {
        checkSignal(options.signal);
        if (array.length < 2) return;
        // Preflight all arrays, including distant descendants, before the first write.
        for (let i = 0; i < array.length; i++) {
            if (!Object.getOwnPropertyDescriptor(array, i)?.writable) throw new TypeError('Source sort requires writable dense arrays.');
        }
        const ordered = array.map((value, index) => ({ value, index, key: key(value) }));
        ordered.sort((a, b) => compare(a.key, b.key) || a.index - b.index);
        plans.push({ array, ordered });
    };
    plan(nodes, node => keys.get(node));
    for (const { childNodes, properties } of forest.entries) {
        plan(childNodes, node => keys.get(node));
        if (field === 'code') plan(properties, property => code(property.code, 0));
        else if (field === 'line') plan(properties, property => number(property.line));
        else if (field === 'type') plan(properties, property => text(property.value));
    }
    checkSignal(options.signal);
    for (const { array, ordered } of plans) for (let i = 0; i < ordered.length; i++) array[i] = ordered[i].value;
    return nodes;
}
