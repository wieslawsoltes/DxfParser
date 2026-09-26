/** Source queries accept ordinary host-owned data, not hostile proxies. Topology
 * and budgets are checked before any mutation or host predicate is invoked. */
export const DEFAULT_QUERY_LIMITS = Object.freeze({
    maxNodes: 1000000,
    maxProperties: 4000000,
    maxDepth: 16384
});

export function checkSignal(signal) {
    if (!signal?.aborted) return;
    if (signal.reason !== undefined) throw signal.reason;
    const error = new Error('Source query was aborted.');
    error.name = 'AbortError';
    throw error;
}

export function nonnegativeInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a nonnegative safe integer.`);
    }
    return value;
}

export function queryLimits(options = {}) {
    const limits = { ...DEFAULT_QUERY_LIMITS, ...options };
    for (const name of Object.keys(DEFAULT_QUERY_LIMITS)) nonnegativeInteger(limits[name], name);
    return limits;
}

export function text(value) { return value == null ? '' : String(value); }

function list(value, name) {
    if (value == null) return [];
    if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`);
    return value;
}

/** Preorder index plus reverse postorder, using O(depth) traversal frames.
 * Shared nodes are rejected, not silently dropped or counted under two parents. */
export function sourceForest(nodes, { limits, signal } = {}) {
    if (!Array.isArray(nodes)) throw new TypeError('Source nodes must be an array.');
    const budget = queryLimits(limits);
    checkSignal(signal);
    const entries = [], byNode = new Map(), roots = [];
    const stack = [{ nodes, index: 0, parent: null, depth: 1 }];
    let properties = 0;
    while (stack.length) {
        checkSignal(signal);
        const frame = stack[stack.length - 1];
        if (frame.index === frame.nodes.length) { stack.pop(); continue; }
        if (entries.length >= budget.maxNodes) throw new RangeError('Source query exceeds maxNodes.');
        if (frame.depth > budget.maxDepth) throw new RangeError('Source query exceeds maxDepth.');
        const node = frame.nodes[frame.index++];
        if (!node || typeof node !== 'object' || Array.isArray(node)) throw new TypeError('Invalid source node.');
        if (byNode.has(node)) throw new TypeError('Source tree contains a cycle or shared node.');
        const tags = list(node.properties, 'Source properties');
        const children = list(node.children, 'Source children');
        properties += tags.length;
        if (properties > budget.maxProperties) throw new RangeError('Source query exceeds maxProperties.');
        for (const tag of tags) {
            checkSignal(signal);
            if (!tag || typeof tag !== 'object' || Array.isArray(tag)) throw new TypeError('Invalid source property.');
        }
        const entry = { node, properties: tags, childNodes: children, children: [], depth: frame.depth };
        byNode.set(node, entry);
        entries.push(entry);
        (frame.parent ? frame.parent.children : roots).push(entry);
        if (children.length) stack.push({ nodes: children, index: 0, parent: entry, depth: frame.depth + 1 });
    }
    return { entries, roots, byNode };
}
