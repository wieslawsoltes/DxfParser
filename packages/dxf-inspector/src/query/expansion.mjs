import { sourceForest, checkSignal } from './forest.mjs';

function assertWritable(node) {
    const own = Object.getOwnPropertyDescriptor(node, 'expanded');
    if (own) {
        if (!own.writable || !('value' in own)) throw new TypeError('Source expansion requires writable data properties.');
        return;
    }
    if (!Object.isExtensible(node)) throw new TypeError('Source node cannot receive expansion state.');
    for (let parent = Object.getPrototypeOf(node); parent; parent = Object.getPrototypeOf(parent)) {
        const property = Object.getOwnPropertyDescriptor(parent, 'expanded');
        if (property) {
            if (!property.writable || !('value' in property)) throw new TypeError('Inherited expansion state is not writable data.');
            break;
        }
    }
}

/** Expand containers or collapse all source nodes without recursion. */
export function setSourceExpansion(nodes, expanded, options = {}) {
    if (typeof expanded !== 'boolean') throw new TypeError('expanded must be a boolean.');
    const forest = sourceForest(nodes, options);
    const targets = forest.entries.filter(entry => !expanded || entry.properties.length || entry.children.length);
    for (const { node } of targets) { checkSignal(options.signal); assertWritable(node); }
    checkSignal(options.signal);
    for (const { node } of targets) node.expanded = expanded;
    return nodes;
}
