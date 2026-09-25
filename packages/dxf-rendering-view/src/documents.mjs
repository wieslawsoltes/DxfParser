/** Bind source-document services to a host-owned renderer; importing allocates nothing. */
export function createDocumentServices(renderer, reportObserverError) {
    class RenderingDataController {
        constructor(options = {}) {
            this.options = { ...options };
            this.documents = new Map();
            this.listeners = new Set();
            this.disposed = false;
        }

        assertAlive() {
            if (this.disposed) throw new Error('Rendering document store is disposed.');
        }

        ingestDocument({ tabId, fileName, sourceText, sourceBytes } = {}) {
            this.assertAlive();
            if (tabId == null || tabId === '') return null;
            let document;
            try {
                document = new renderer.DxfDocument(sourceBytes ?? sourceText, this.options);
                Object.assign(document, {
                    tabId, fileName, createdAt: Date.now(),
                    sourceLength: sourceBytes?.byteLength ?? sourceText?.length ?? 0,
                    comparisonSourceText: typeof sourceText === 'string' && sourceBytes == null ? sourceText : null
                });
                if (sourceBytes != null) {
                    // Rendering remains usable when binary data cannot round-trip through a line editor.
                    try { document.comparisonSourceText = renderer.dxfText(sourceBytes, this.options); }
                    catch { /* Unrepresentable source must not enable source transactions. */ }
                }
            } catch (error) {
                this.registerPlaceholder(tabId, { fileName, reason: 'buildError', message: error.message });
                return null;
            }
            this.documents.set(tabId, document);
            for (const listener of [...this.listeners]) {
                if (this.disposed) break;
                if (!this.listeners.has(listener)) continue;
                try { listener({ type: 'ingest', document }); }
                catch (error) { reportObserverError(error); }
            }
            return document;
        }

        subscribe(listener) {
            this.assertAlive();
            if (typeof listener !== 'function') throw new TypeError('A document listener is required.');
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        }

        registerPlaceholder(id, details = {}) {
            this.assertAlive();
            this.documents.set(id, { ...details, status: 'placeholder' });
        }

        getDocument(id) { return this.documents.get(id) || null; }
        getSceneGraph(id) { return this.getDocument(id)?.sceneGraph || null; }
        hasDocument(id) { return this.documents.has(id); }
        releaseDocument(id) { this.documents.delete(id); }

        dispose() {
            if (this.disposed) return;
            this.disposed = true;
            this.listeners.clear();
            this.documents.clear();
        }
    }

    class RenderingDocumentBuilder {
        constructor({ tags } = {}) { this.tags = tags; }
        build() { return new renderer.DxfDocument(this.tags); }
    }

    return { RenderingDataController, RenderingDocumentBuilder };
}
