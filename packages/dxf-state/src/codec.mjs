/** Source-state codec. No storage, browser globals, application imports or callbacks. */
export const DEFAULT_STATE_LIMITS = Object.freeze({
    maxBytes: 64 * 1024 * 1024,
    maxTabs: 256,
    maxTreeNodes: 1_000_000,
    maxDepth: 256,
    maxValues: 8_000_000
});
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
const encoder = new TextEncoder();
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const identifier = value => (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.length > 0);

export function stateLimits(options = {}) {
    const limits = { ...DEFAULT_STATE_LIMITS };
    for (const [key, value] of Object.entries(options)) {
        if (!own(limits, key)) throw new TypeError(`Unknown state limit: ${key}`);
        if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${key} must be a positive safe integer.`);
        limits[key] = value;
    }
    return Object.freeze(limits);
}

/** Copy JSON data without invoking getters/toJSON or retaining caller-owned objects. */
function copyData(value, limits, omit = new Set()) {
    let count = 0, characters = 0;
    const active = new WeakSet();
    const target = { value: undefined };
    const stack = [{ value, parent: target, key: 'value', depth: 0 }];
    while (stack.length) {
        const item = stack.pop();
        if (item.exit) { active.delete(item.value); continue; }
        if (++count > limits.maxValues) throw new RangeError('State value budget exceeded.');
        const input = item.value;
        if (input === null || typeof input !== 'object') {
            if (!(input === null || typeof input === 'string' || typeof input === 'boolean' || (typeof input === 'number' && Number.isFinite(input))))
                throw new TypeError('State must contain finite JSON data only.');
            if (typeof input === 'string') characters += input.length;
            if (characters > limits.maxBytes) throw new RangeError('State byte budget exceeded.');
            item.parent[item.key] = input;
            continue;
        }
        if (item.depth > limits.maxDepth * 3 + 16) throw new RangeError('State nesting budget exceeded.');
        if (active.has(input)) throw new TypeError('Cyclic state cannot be serialized.');
        // Accept plain records from other realms but never class instances or a custom prototype.
        const proto = Object.getPrototypeOf(input);
        if (!Array.isArray(input) && proto !== null && Object.getPrototypeOf(proto) !== null)
            throw new TypeError('State objects must be plain JSON records.');
        active.add(input);
        const output = Array.isArray(input) ? [] : {};
        item.parent[item.key] = output;
        stack.push({ exit: true, value: input });
        const keys = Object.keys(input);
        if (keys.length + count > limits.maxValues) throw new RangeError('State value budget exceeded.');
        if (Array.isArray(input) && keys.length !== input.length) throw new TypeError('Sparse or extended arrays are not supported.');
        for (let i = keys.length - 1; i >= 0; i--) {
            const key = keys[i];
            if (unsafeKeys.has(key)) throw new TypeError(`Unsafe state key: ${key}`);
            if (omit.has(key)) continue;
            const descriptor = Object.getOwnPropertyDescriptor(input, key);
            if (!descriptor || !own(descriptor, 'value')) throw new TypeError('State accessors are not supported.');
            if (descriptor.value === undefined && !Array.isArray(input)) continue;
            characters += key.length;
            if (characters > limits.maxBytes) throw new RangeError('State byte budget exceeded.');
            stack.push({ value: descriptor.value, parent: output, key, depth: item.depth + 1 });
        }
    }
    return target.value;
}

function checkText(text, limits) {
    if (typeof text !== 'string') throw new TypeError('State JSON must be a string.');
    if (text.length > limits.maxBytes || encoder.encode(text).byteLength > limits.maxBytes)
        throw new RangeError('State byte budget exceeded.');
    return text;
}
function strings(value, name) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new TypeError(`${name} must be a string array.`);
    return value.slice();
}
function widths(value) {
    if (value == null) return null;
    if (!record(value)) throw new TypeError('Column widths must be a record.');
    const result = {};
    for (const [key, width] of Object.entries(value)) {
        if (!((typeof width === 'number' && Number.isFinite(width) && width > 0) ||
            (typeof width === 'string' && /^(?:auto|\*|(?:\d+(?:\.\d+)?)\*)$/i.test(width))))
            throw new TypeError(`Invalid column width: ${key}`);
        result[key] = width;
    }
    return result;
}
function nodesOf(nodes, limits) {
    if (!Array.isArray(nodes)) throw new TypeError('Source tree must be an array.');
    const result = [], seen = new WeakSet(), ids = new Set();
    const stack = [{ nodes, index: 0, depth: 1 }];
    while (stack.length) {
        const frame = stack.at(-1);
        if (frame.index === frame.nodes.length) { stack.pop(); continue; }
        if (frame.depth > limits.maxDepth) throw new RangeError('Source tree depth budget exceeded.');
        if (result.length >= limits.maxTreeNodes) throw new RangeError('Source tree node budget exceeded.');
        const node = frame.nodes[frame.index++];
        if (!record(node) || !identifier(node.id) || typeof node.type !== 'string') throw new TypeError('Invalid source tree node.');
        if (seen.has(node)) throw new TypeError('Cyclic or shared source tree nodes are not supported.');
        if (ids.has(node.id)) throw new TypeError(`Duplicate source node ID: ${node.id}`);
        seen.add(node); ids.add(node.id); result.push(node);
        if (node.properties != null) {
            if (!Array.isArray(node.properties) || node.properties.some(p => !record(p) || !Number.isInteger(p.code) || typeof p.value !== 'string'))
                throw new TypeError('Invalid source group pairs.');
        }
        if (node.children != null) {
            if (!Array.isArray(node.children)) throw new TypeError('Source node children must be an array.');
            stack.push({ nodes: node.children, index: 0, depth: frame.depth + 1 });
        }
    }
    return result;
}
function expandedIds(value) {
    if (!Array.isArray(value) || value.some(id => !identifier(id))) throw new TypeError('Expanded node IDs must be an array of identifiers.');
    return new Set(value);
}
function normalizeTab(tab, limits) {
    if (!record(tab) || !identifier(tab.id)) throw new TypeError('Each source tab needs a finite number or nonempty string ID.');
    if (typeof tab.name !== 'string') throw new TypeError('Source tab name must be a string.');
    const tree = tab.originalTreeData ?? null;
    const nodes = tree === null ? [] : nodesOf(tree, limits);
    const expanded = own(tab, 'expandedNodeIds') ? expandedIds(tab.expandedNodeIds) : new Set(nodes.filter(node => node.expanded).map(node => node.id));
    for (const node of nodes) node.expanded = expanded.has(node.id);
    const history = strings(tab.navigationHistory, 'Navigation history');
    const classes = tab.classIdToName ?? {};
    if (!record(classes) || Object.values(classes).some(name => typeof name !== 'string')) throw new TypeError('Class names must be a string record.');
    const line = value => {
        if (value == null || value === '') return null;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError('Line filters must be nonnegative numbers.');
        return value;
    };
    const index = tab.currentHistoryIndex ?? -1;
    if (!Number.isInteger(index)) throw new TypeError('Invalid navigation history index.');
    const sort = tab.currentSortField || 'line';
    if (!['line', 'code', 'type', 'objectCount', 'dataSize'].includes(sort)) throw new TypeError('Invalid source sort field.');
    return {
        id: tab.id, name: tab.name, isModified: !!tab.isModified, columnWidths: widths(tab.columnWidths),
        codeSearchTerms: strings(tab.codeSearchTerms, 'Code search'), dataSearchTerms: strings(tab.dataSearchTerms, 'Data search'),
        currentSortField: sort, currentSortAscending: tab.currentSortAscending !== false,
        minLine: line(tab.minLine), maxLine: line(tab.maxLine), dataExact: !!tab.dataExact, dataCase: !!tab.dataCase,
        selectedObjectTypes: strings(tab.selectedObjectTypes, 'Object types'), navigationHistory: history,
        currentHistoryIndex: Math.max(-1, Math.min(index, history.length - 1)), classIdToName: classes,
        expandedNodeIds: nodes.filter(node => node.expanded).map(node => node.id), originalTreeData: tree
    };
}
function tabIds(left, right, limits) {
    if (!Array.isArray(left) || !Array.isArray(right)) throw new TypeError('Source tabs must be arrays.');
    if (left.length + right.length > limits.maxTabs) throw new RangeError('Source tab budget exceeded.');
    const ids = new Set();
    for (const id of [...left, ...right]) {
        if (!identifier(id)) throw new TypeError('Invalid source tab ID.');
        // Storage keys and Dockyard ContentIds stringify IDs; reject cross-type aliases too.
        if (ids.has(String(id))) throw new TypeError(`Duplicate source tab ID: ${id}`);
        ids.add(String(id));
    }
}
function appState(app, leftIds, rightIds) {
    if (!record(app)) throw new TypeError('Application state must be a record.');
    return {
        activeTabIdLeft: leftIds.includes(app.activeTabIdLeft) ? app.activeTabIdLeft : leftIds[0] ?? null,
        activeTabIdRight: rightIds.includes(app.activeTabIdRight) ? app.activeTabIdRight : rightIds[0] ?? null,
        columnWidths: widths(app.columnWidths), sidebarCollapsed: !!app.sidebarCollapsed,
        rightPanelHidden: !!app.rightPanelHidden, sideBySideDiffEnabled: !!app.sideBySideDiffEnabled
    };
}

export class StateCodec {
    constructor(options = {}) { this.limits = stateLimits(options); }
    /** Returns independently owned JSON data; rejects cycles, accessors and unsafe keys. */
    copy(value) { return copyData(value, this.limits); }
    stringify(value) { return checkText(JSON.stringify(this.copy(value)), this.limits); }
    parse(text) { return this.copy(JSON.parse(checkText(text, this.limits))); }
    getExpandedNodeIds(nodes) { return nodesOf(nodes, this.limits).filter(node => node.expanded).map(node => node.id); }
    restoreExpandedState(nodes, ids) {
        const expanded = expandedIds(ids), entries = nodesOf(nodes, this.limits);
        // Validate the entire tree before touching any expansion flags.
        for (const node of entries) node.expanded = expanded.has(node.id);
    }
    serializeTreeData(nodes) {
        nodesOf(nodes, this.limits);
        return checkText(JSON.stringify(copyData(nodes, this.limits, new Set(['expanded', 'currentTreeData']))), this.limits);
    }
    serializeTab(tab) {
        // Only select persistent fields: live tabs can contain renderer caches and callbacks.
        const data = {};
        for (const key of ['id','name','isModified','columnWidths','codeSearchTerms','dataSearchTerms','currentSortField',
            'currentSortAscending','minLine','maxLine','dataExact','dataCase','selectedObjectTypes','navigationHistory',
            'currentHistoryIndex','classIdToName','originalTreeData','expandedNodeIds']) {
            const descriptor = Object.getOwnPropertyDescriptor(tab, key);
            if (descriptor && !own(descriptor, 'value')) throw new TypeError('Tab state accessors are not supported.');
            if (descriptor?.value !== undefined) data[key] = descriptor.value;
        }
        // Live expansion flags take precedence over a previously restored ID list.
        const copied = copyData(data, this.limits, new Set(['currentTreeData']));
        if (copied.originalTreeData) copied.expandedNodeIds = this.getExpandedNodeIds(copied.originalTreeData);
        return normalizeTab(copied, this.limits);
    }
    buildSnapshot(left, right, activeLeft, activeRight, columnWidths, ui = {}, createdAt = new Date().toISOString()) {
        tabIds(left.map(tab => tab.id), right.map(tab => tab.id), this.limits);
        const result = { version: 1, createdAt, app: { ...ui, activeTabIdLeft: activeLeft, activeTabIdRight: activeRight, columnWidths },
            leftTabs: left.map(tab => this.serializeTab(tab)), rightTabs: right.map(tab => this.serializeTab(tab)) };
        const restored = this.restoreSnapshot(result);
        return { version: 1, createdAt, ...restored };
    }
    restoreSnapshot(value) {
        const input = typeof value === 'string' ? this.parse(value) : this.copy(value);
        if (!record(input) || input.version !== 1) throw new TypeError('Unsupported state snapshot version. Expected version 1.');
        const left = input.leftTabs ?? [], right = input.rightTabs ?? [];
        if (!Array.isArray(left) || !Array.isArray(right)) throw new TypeError('Snapshot tabs must be arrays.');
        tabIds(left.map(tab => tab?.id), right.map(tab => tab?.id), this.limits);
        const leftTabs = left.map(tab => normalizeTab(tab, this.limits)), rightTabs = right.map(tab => normalizeTab(tab, this.limits));
        const result = { app: appState(input.app ?? {}, leftTabs.map(tab => tab.id), rightTabs.map(tab => tab.id)), leftTabs, rightTabs };
        checkText(JSON.stringify(result), this.limits);
        return result;
    }
    buildManifest(left, right, activeLeft, activeRight, columnWidths, ui, timestamp) {
        const tabIdsLeft = left.map(tab => tab.id), tabIdsRight = right.map(tab => tab.id);
        tabIds(tabIdsLeft, tabIdsRight, this.limits);
        return { ...appState(this.copy({ ...ui, activeTabIdLeft: activeLeft, activeTabIdRight: activeRight, columnWidths }), tabIdsLeft, tabIdsRight),
            tabIdsLeft, tabIdsRight, timestamp };
    }
    parseManifest(text) {
        const input = this.parse(text);
        if (!record(input) || !Number.isFinite(input.timestamp)) throw new TypeError('Invalid state timestamp.');
        const left = input.tabIdsLeft ?? input.tabIds ?? [], right = input.tabIdsRight ?? [];
        tabIds(left, right, this.limits);
        return { ...appState({ ...input, activeTabIdLeft: input.activeTabIdLeft ?? input.activeTabId }, left, right),
            tabIdsLeft: left, tabIdsRight: right, timestamp: input.timestamp };
    }
    parseTab(text, expectedId) {
        const input = this.parse(text);
        if (!record(input) || input.id !== expectedId) throw new TypeError('Stored source identity does not match its key.');
        if (input.originalTreeDataSerialized != null) input.originalTreeData = this.parse(input.originalTreeDataSerialized);
        return normalizeTab(input, this.limits);
    }
}
