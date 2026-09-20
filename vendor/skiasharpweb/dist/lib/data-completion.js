/** Checked byte/span/stream overloads with retained zero-copy views. */
export function installDataCompletion(K, api) {
  const Data = api.SKData, roots = new WeakMap(), MAX = 512 * 1024 * 1024;
  const stats = { Allocations: 0, CopiedBytes: 0, SharedViews: 0, StreamReadCalls: 0 };
  function size(value, name = 'length') {
    if (typeof value === 'bigint') { if (value < 0n || value > BigInt(MAX)) throw new RangeError(name + ' exceeds the 512 MiB byte limit.'); value = Number(value); }
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX) throw new RangeError(name + ' must be an integer from 0 through 512 MiB.');
    return value;
  }
  function bytes(value) {
    if (value instanceof Data) return value.AsSpan();
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (Array.isArray(value)) return Uint8Array.from(value);
    throw new TypeError('Expected SKData, ArrayBuffer, or typed byte storage.');
  }
  function allocate(length) { stats.Allocations++; return new Uint8Array(size(length)); }
  function release(root) { if (--root.refs === 0) { const callback = root.release; root.release = null; callback?.(root.address, root.context); } }
  function rootOf(data) {
    data.ThrowIfDisposed(); let root = roots.get(data);
    if (!root) { root = { refs: 1 }; roots.set(data, root); }
    return root;
  }
  function wrap(storage, root = { refs: 0 }) {
    const result = new Data(); result._bytes = storage; roots.set(result, root); root.refs++; return result;
  }
  const dispose = Data.prototype.Dispose;
  Data.prototype.Dispose = function () {
    if (this.IsDisposed) return;
    const root = roots.get(this); roots.delete(this);
    try { dispose.call(this); } finally { if (root) release(root); }
  };
  Data.CreateCopy = function (value, length) {
    const source = bytes(value), n = size(length ?? source.length);
    if (n > source.length) throw new RangeError('Copy length exceeds the source byte span.');
    const buffer = allocate(n); buffer.set(source.subarray(0, n)); stats.CopiedBytes += n; return wrap(buffer);
  };
  function readInto(stream, target, offset, length) {
    stream.ThrowIfDisposed?.(); stats.StreamReadCalls++;
    const n = stream.Read(target, offset, length);
    if (!Number.isSafeInteger(n) || n < 0 || n > length) throw new RangeError('Stream.Read returned an invalid byte count.');
    return n;
  }
  function fromStream(stream, length) {
    stream.ThrowIfDisposed?.();
    if (length == null) {
      // SKStream overload uses its full declared Length; CLR-style seekable
      // streams use remaining Length-Position, as in the pinned C# signatures.
      if (stream instanceof api.SKStream && stream.HasLength !== false) length = stream.Length;
      else if (stream.CanSeek || stream.HasPosition) length = stream.Length - stream.Position;
    }
    if (length != null) {
      const buffer = allocate(length); let offset = 0;
      while (offset < buffer.length) { const n = readInto(stream, buffer, offset, buffer.length - offset); if (!n) return null; offset += n; }
      return wrap(buffer);
    }
    const chunks = []; let total = 0, used = 0, buffer = allocate(65536);
    for (;;) {
      // A stream may return only one byte per Read. Fill each staging chunk
      // before allocating another, rather than retaining 64 KiB per tiny read.
      const available = Math.min(buffer.length - used, MAX - total + 1);
      const n = readInto(stream, buffer, used, available);
      if (!n) break;
      total = size(total + n); used += n;
      if (used === buffer.length) {
        chunks.push(buffer); used = 0; buffer = allocate(Math.min(65536, MAX - total + 1));
      }
    }
    if (used) chunks.push(buffer.subarray(0, used));
    const result = allocate(total); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    stats.CopiedBytes += total; return wrap(result);
  }
  Data.Create = function (value, length, callback, context) {
    if (typeof value === 'number' || typeof value === 'bigint') {
      if (arguments.length !== 1) throw new TypeError('Native pointer addresses cannot be used as JavaScript byte storage.');
      return wrap(allocate(value));
    }
    if (typeof value === 'string') {
      if (!value || value.includes('\0')) throw new TypeError('A nonempty mounted filename is required.');
      if (!api.SKFileSystem.Exists(value)) return null;
      return wrap(api.SKFileSystem.ReadAllBytes(value));
    }
    if (value && typeof value.Read === 'function') return fromStream(value, length);
    if (value == null) throw new TypeError('A readable stream or byte storage is required.');
    if (callback != null && typeof callback !== 'function') throw new TypeError('Release callback must be a function.');
    const source = bytes(value), n = size(length ?? source.length);
    if (n > source.length) throw new RangeError('Data length exceeds the source byte span.');
    stats.SharedViews++;
    if (value instanceof Data) {
      const parent = rootOf(value);
      if (!callback) return wrap(source.subarray(0, n), parent);
      parent.refs++;
      return wrap(source.subarray(0, n), { refs: 0, address: value, context,
        release(address, state) { try { callback(address, state); } finally { release(parent); } } });
    }
    return wrap(source.subarray(0, n), { refs: 0, release: callback, address: value, context });
  };
  Data.CreateUninitialized = n => wrap(allocate(n));
  Data.CreateSubset = function (data, offset, length) {
    if (!(data instanceof Data)) throw new TypeError('Subset source must be SKData.');
    const root = rootOf(data), start = size(offset, 'offset'), n = size(length);
    if (start + n > data.Size) return null;
    stats.SharedViews++; return wrap(data.AsSpan().subarray(start, start + n), root);
  };
  Data.prototype.Subset = function (offset, length) { return Data.CreateSubset(this, offset, length); };
  Object.defineProperty(Data.prototype, 'Span', { configurable: true, get() { return this.AsSpan(); } });
  Data.prototype.AsStream = function (streamDisposesData = false) {
    this.ThrowIfDisposed(); const data = this, root = rootOf(this), stream = new api.SKMemoryStream();
    stream._bytes = this.AsSpan(); root.refs++; stats.SharedViews++;
    const close = stream.Dispose.bind(stream);
    stream.Dispose = function () {
      if (this.IsDisposed) return;
      try { close(); } finally { try { if (streamDisposesData) data.Dispose(); } finally { release(root); } }
    };
    return stream;
  };
  Data.prototype.SaveTo = function (target) {
    this.ThrowIfDisposed();
    const write = target?.Write ?? target?.write;
    if (typeof write !== 'function') throw new TypeError('A synchronous writable stream is required.');
    const data = this.AsSpan();
    for (let start = 0; start < data.length; start += 81920) {
      const part = data.subarray(start, Math.min(start + 81920, data.length)), result = write.call(target, part, part.length);
      if (result?.then) throw new TypeError('Use SaveToAsync with asynchronous writers.');
      if (result === false) throw new Error('Output stream rejected the write.');
    }
    return true;
  };
  Data.prototype.SaveToAsync = async function (target, { signal } = {}) {
    signal?.throwIfAborted();
    const retained = this.Subset(0, this.Size); let writer, acquired = false;
    try {
      if (typeof target?.getWriter === 'function') { writer = target.getWriter(); acquired = true; }
      else writer = target;
      const write = writer?.write ?? writer?.Write;
      if (typeof write !== 'function') throw new TypeError('An asynchronous writable stream is required.');
      const data = retained.AsSpan();
      for (let start = 0; start < data.length; start += 81920) {
        signal?.throwIfAborted();
        if (await write.call(writer, data.subarray(start, start + 81920)) === false) throw new Error('Output stream rejected the write.');
      }
      signal?.throwIfAborted();
    } finally { try { retained.Dispose(); } finally { if (acquired) writer.releaseLock(); } }
  };
  Data.FromReadableStream = async function (stream, { signal, maxBytes = MAX } = {}) {
    maxBytes = size(maxBytes, 'maxBytes'); signal?.throwIfAborted();
    if (typeof stream?.getReader !== 'function') throw new TypeError('A ReadableStream is required.');
    const reader = stream.getReader(), chunks = []; let total = 0, used = 0, buffer = null;
    const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      for (;;) {
        signal?.throwIfAborted(); const { value, done } = await reader.read(); signal?.throwIfAborted(); if (done) break;
        const chunk = bytes(value); total += chunk.length;
        if (total > maxBytes) throw new RangeError('ReadableStream exceeds its byte limit.');
        // Coalesce tiny producer chunks and snapshot recycled producer buffers.
        for (let offset = 0; offset < chunk.length;) {
          buffer ??= allocate(Math.min(65536, maxBytes || 1));
          const n = Math.min(buffer.length - used, chunk.length - offset);
          buffer.set(chunk.subarray(offset, offset + n), used); used += n; offset += n;
          if (used === buffer.length) { chunks.push(buffer); buffer = null; used = 0; }
        }
      }
      if (used) chunks.push(buffer.subarray(0, used));
      const result = allocate(total); let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      stats.CopiedBytes += total * 2; return wrap(result);
    } catch (error) { try { await reader.cancel(error); } catch { /* preserve original error */ } throw error; }
    finally { signal?.removeEventListener('abort', abort); reader.releaseLock(); }
  };
  const Writer = api.SKDynamicMemoryWStream;
  Writer.prototype.CopyToData = function () {
    this.ThrowIfDisposed(); const result = allocate(this._length); let offset = 0;
    for (const part of this._parts) { result.set(part, offset); offset += part.length; }
    stats.CopiedBytes += result.length; return wrap(result);
  };
  // Reading the marker through the bool/out overload distinguishes EOF from 0.
  api.SKStream.prototype.ReadPackedUInt32 = function (out) {
    this.ThrowIfDisposed(); const marker = {}, value = {}; let ok = this.ReadByte(marker);
    if (ok) {
      if (marker.Value === 254 || marker.Value === 255) ok = this[marker.Value === 254 ? 'ReadUInt16' : 'ReadUInt32'](value);
      else value.Value = marker.Value;
    }
    if (out != null) { if (Array.isArray(out)) out[0] = value.Value ?? 0; else out.Value = value.Value ?? 0; return ok; }
    return value.Value ?? 0;
  };
  Data.GetCopyStatistics = () => Object.freeze({ ...stats, Scope: 'SKData factories, retained views, stream reads and writer materialization' });
}
