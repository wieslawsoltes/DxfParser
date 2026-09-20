/** Native Skia memory tracing. All numeric values come from the loaded engine. */
export function installMemoryTracing(K, api) {
  class SKTraceMemoryDump extends api.SKObject {
    constructor(detailedDump = false, dumpWrappedObjects = true) {
      super(null, false);
      Object.defineProperties(this, {
        DetailedDump: { value: !!detailedDump, enumerable: true },
        DumpWrappedObjects: { value: !!dumpWrappedObjects, enumerable: true }
      });
    }
    OnDumpNumericValue(dumpName, valueName, units, value) {}
    OnDumpStringValue(dumpName, valueName, value) {}
    OnSetMemoryBacking(dumpName, backingType, backingObjectId) {}
    OnSetDiscardableMemoryBacking(dumpName) {}
    OnDumpWrappedState(dumpName, isWrappedObject) {}
  }
  class SKMemoryTrace extends SKTraceMemoryDump {
    constructor(detailedDump = true, dumpWrappedObjects = true) {
      super(detailedDump, dumpWrappedObjects);
      this._entries = new Map();
    }
    _row(name) {
      this.ThrowIfDisposed();
      if (!this._entries.has(name)) this._entries.set(name, { Name: name, Values: {} });
      return this._entries.get(name);
    }
    OnDumpNumericValue(name, key, units, value) { this._row(name).Values[key] = { Value: value, Units: units }; }
    OnDumpStringValue(name, key, value) { this._row(name).Values[key] = { Value: value }; }
    OnSetMemoryBacking(name, type, id) { this._row(name).Backing = { Type: type, Id: id }; }
    OnSetDiscardableMemoryBacking(name) { this._row(name).Discardable = true; }
    OnDumpWrappedState(name, wrapped) { this._row(name).Wrapped = wrapped; }
    get Entries() { this.ThrowIfDisposed(); return structuredClone([...this._entries.values()]); }
    Clear() { this.ThrowIfDisposed(); this._entries.clear(); }
    ToJson() { return JSON.stringify(this.Entries, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2); }
    Dispose() { if (!this.IsDisposed) { this._entries.clear(); super.Dispose(); } }
  }
  const validate = dump => {
    if (!(dump instanceof SKTraceMemoryDump)) throw new TypeError('dump must be an SKTraceMemoryDump.');
    dump.ThrowIfDisposed();
  };
  const need = name => {
    if (typeof K[name] !== 'function') throw new api.SKNotSupportedError('Native memory tracing requires a runtime rebuilt with skiasharp_memory.cpp.');
    return K[name];
  };
  api.SKGraphics.DumpMemoryStatistics = function (dump) {
    validate(dump); need('SkiaSharpGraphicsDumpMemoryStatistics')(dump);
  };
  const capabilities = api.SKGraphics.GetCapabilities.bind(api.SKGraphics);
  api.SKGraphics.GetCapabilities = () => Object.freeze({
    ...capabilities(), NativeMemoryDump: typeof K.SkiaSharpGraphicsDumpMemoryStatistics === 'function',
    GaneshMemoryDump: typeof K.SkiaSharpGaneshDumpMemoryStatistics === 'function'
  });
  api.GRContext.prototype.DumpMemoryStatistics = function (dump) {
    validate(dump); this._current(); need('SkiaSharpGaneshDumpMemoryStatistics')(this._native, dump);
  };
  Object.assign(api, { SKTraceMemoryDump, SKMemoryTrace });
}
