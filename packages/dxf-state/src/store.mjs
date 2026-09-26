import { StateCodec } from './codec.mjs';

/** Best-effort storage facade. The host owns storage, source lifetime and scheduling. */
export class StateManager {
    constructor({ storage = null, storageKey = 'dxf_parser_state', tabStatePrefix = 'dxf_tab_',
        getUiState = () => ({}), now = Date.now, maxAge = 7 * 24 * 60 * 60 * 1000,
        onError = null, limits } = {}) {
        if (storage !== null && !['getItem', 'setItem', 'removeItem', 'key'].every(name => typeof storage[name] === 'function'))
            throw new TypeError('Provide a Storage-compatible object or null.');
        if (typeof storageKey !== 'string' || !storageKey || typeof tabStatePrefix !== 'string' || !tabStatePrefix || storageKey.startsWith(tabStatePrefix))
            throw new TypeError('State storage keys must be nonempty, nonoverlapping namespaces.');
        if (typeof getUiState !== 'function' || typeof now !== 'function' || (onError !== null && typeof onError !== 'function'))
            throw new TypeError('State callbacks must be functions.');
        if (!Number.isFinite(maxAge) || maxAge < 0) throw new RangeError('maxAge must be nonnegative and finite.');
        Object.assign(this, { storage, storageKey, tabStatePrefix, getUiState, now, maxAge, onError });
        this.codec = new StateCodec(limits); this.disposed = false;
    }
    report(error, operation) { try { this.onError?.(error, operation); } catch { /* A diagnostic observer cannot interrupt persistence or cleanup. */ } }
    ensureAlive() { if (this.disposed) throw new Error('State manager is disposed.'); }
    buildExportSnapshot(left = [], right = [], activeLeft = null, activeRight = null, widths = null) {
        this.ensureAlive();
        return this.codec.buildSnapshot(left, right, activeLeft, activeRight, widths, this.getUiState(), new Date(this.now()).toISOString());
    }
    restoreFromSnapshot(snapshot) {
        if (this.disposed) return null;
        try { return this.codec.restoreSnapshot(snapshot); }
        catch (error) { this.report(error, 'restore-snapshot'); return null; }
    }
    serializeTreeData(tree) {
        try { return this.codec.serializeTreeData(tree); }
        catch (error) { this.report(error, 'serialize-tree'); return null; }
    }
    getExpandedNodeIds(tree) { return this.codec.getExpandedNodeIds(tree); }
    restoreExpandedState(tree, ids) { return this.codec.restoreExpandedState(tree, ids); }
    saveAppState(left = [], right = [], activeLeft = null, activeRight = null, widths = null) {
        if (this.disposed || !this.storage) return false;
        // Validate every record before the first storage write. Web Storage itself is
        // not a multi-key transaction; individual failures remain observable.
        try {
            const manifest = this.codec.buildManifest(left, right, activeLeft, activeRight, widths, this.getUiState(), this.now());
            const manifestText = this.codec.stringify(manifest);
            const tabs = [...left, ...right].map(tab => this.encodeTab(tab));
            let complete = true;
            for (const tab of tabs) if (this.writeTab(tab) !== 'saved') complete = false;
            this.storage.setItem(this.storageKey, manifestText);
            return complete;
        } catch (error) { this.report(error, 'save-state'); return false; }
    }
    saveAppStateLight(left = [], right = [], activeLeft = null, activeRight = null, widths = null) {
        if (this.disposed || !this.storage) return false;
        try {
            const manifest = this.codec.buildManifest(left, right, activeLeft, activeRight, widths, this.getUiState(), this.now());
            this.storage.setItem(this.storageKey, this.codec.stringify(manifest)); return true;
        } catch (error) { this.report(error, 'save-manifest'); return false; }
    }
    encodeTab(tab) {
        const data = this.codec.serializeTab(tab);
        const originalTreeDataSerialized = data.originalTreeData === null ? null : this.codec.serializeTreeData(data.originalTreeData);
        const { originalTreeData, ...metadata } = data;
        const record = { ...metadata, originalTreeDataSerialized, timestamp: this.now() };
        return { key: this.tabStatePrefix + data.id, text: this.codec.stringify(record), metadata };
    }
    writeTab({ key, text, metadata }) {
        let previous;
        try { previous = this.storage.getItem(key); }
        catch (error) { this.report(error, 'read-before-write'); return 'failed'; }
        try { this.storage.setItem(key, text); return 'saved'; }
        catch (error) {
            this.report(error, 'save-tab');
            // Never overwrite the last persisted source with a metadata-only record.
            if (previous !== null) return 'preserved';
            try {
                this.storage.setItem(key, this.codec.stringify({ ...metadata, originalTreeDataSerialized: null, timestamp: this.now() }));
                return 'metadata-only';
            } catch (fallbackError) { this.report(fallbackError, 'save-tab-metadata'); return 'failed'; }
        }
    }
    saveTabState(tab) {
        if (this.disposed || !this.storage) return 'unavailable';
        try { return this.writeTab(this.encodeTab(tab)); }
        catch (error) { this.report(error, 'encode-tab'); return 'failed'; }
    }
    loadAppState() {
        if (this.disposed || !this.storage) return null;
        try {
            const text = this.storage.getItem(this.storageKey);
            if (text === null) return null;
            const state = this.codec.parseManifest(text);
            if (this.now() - state.timestamp > this.maxAge) { this.clearAllState(); return null; }
            return state;
        } catch (error) { this.report(error, 'load-state'); return null; }
    }
    loadTabState(id) {
        if (this.disposed || !this.storage) return null;
        try {
            const text = this.storage.getItem(this.tabStatePrefix + id);
            return text === null ? null : this.codec.parseTab(text, id);
        } catch (error) { this.report(error, 'load-tab'); return null; }
    }
    removeTabState(id) {
        if (this.disposed || !this.storage) return false;
        try { this.storage.removeItem(this.tabStatePrefix + id); return true; }
        catch (error) { this.report(error, 'remove-tab'); return false; }
    }
    clearAllState() {
        if (this.disposed || !this.storage) return false;
        let complete = true;
        const keys = new Set([this.storageKey]);
        try {
            const count = this.storage.length;
            for (let i = 0; i < count; i++) { const key = this.storage.key(i); if (key?.startsWith(this.tabStatePrefix)) keys.add(key); }
        } catch (error) { this.report(error, 'enumerate-state'); complete = false; }
        for (const key of keys) try { this.storage.removeItem(key); }
        catch (error) { this.report(error, 'clear-state'); complete = false; }
        return complete;
    }
    hasSavedState() {
        if (this.disposed || !this.storage) return false;
        try { return this.storage.getItem(this.storageKey) !== null; }
        catch (error) { this.report(error, 'has-state'); return false; }
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.storage = null; this.getUiState = null; this.onError = null; this.now = null;
    }
}
