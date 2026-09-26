import { sourceForest, checkSignal, nonnegativeInteger, text } from './forest.mjs';

function collect(limit) {
    nonnegativeInteger(limit, 'maxResults');
    const rows = [];
    return { rows, add(row) {
        if (rows.length >= limit) throw new RangeError('Source query exceeds maxResults; no partial result was returned.');
        rows.push(row);
    } };
}

/** Matches original group pairs in preorder, retaining duplicates and identities.
 * Like batch search, exact values are case-sensitive by default; substring values
 * are case-insensitive. Supplying dataCase overrides that default explicitly. */
export function searchSourceTree(nodes, { objectType = '', searchText = '', searchCode = '',
    exact = false, dataCase = exact, maxResults = 250000, limits, signal } = {}) {
    const type = text(objectType).toLowerCase(), code = text(searchCode);
    const requested = text(searchText), needle = dataCase ? requested : requested.toLowerCase();
    const output = collect(maxResults), forest = sourceForest(nodes, { limits, signal });
    for (const { node, properties } of forest.entries) {
        checkSignal(signal);
        if (type && text(node.type).toLowerCase() !== type) continue;
        if (type && !code && !requested) { output.add({ node, property: null, line: node.line, data: text(node.type) }); continue; }
        if (!code && !requested) continue;
        for (const property of properties) {
            checkSignal(signal);
            if (code && text(property.code) !== code) continue;
            const value = text(property.value), candidate = dataCase ? value : value.toLowerCase();
            if (requested && !(exact ? candidate === needle : candidate.includes(needle))) continue;
            output.add({ node, property, line: property.line, data: value });
        }
    }
    return output.rows;
}

/** Selects nodes with a synchronous host predicate. Never compiles or evaluates
 * text. Host callbacks are trusted code and their side effects cannot be undone. */
export function selectSourceNodes(nodes, predicate, { maxResults = 250000, limits, signal } = {}) {
    if (typeof predicate !== 'function') throw new TypeError('A source predicate function is required.');
    const output = collect(maxResults), forest = sourceForest(nodes, { limits, signal });
    for (const { node } of forest.entries) {
        checkSignal(signal);
        const matches = predicate(node);
        if (matches != null && typeof matches.then === 'function') {
            // An accidentally async predicate must not become an unhandled rejection.
            Promise.resolve(matches).catch(() => {});
            throw new TypeError('Source predicates must be synchronous.');
        }
        checkSignal(signal);
        if (matches) output.add(node);
    }
    return output.rows;
}
