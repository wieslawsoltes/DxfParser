/** Byte-budgeted, generation-aware path query snapshots. Holds only JavaScript snapshots, not native owners. */
export function installPathQueryCache(K, api) {
  const P = api.SKPath.prototype, entries = new Map();
  let index = new WeakMap();
  const original = Object.fromEntries(['GetPoints', 'GetPoint'].map(name => [name, P[name]]));
  const properties = ['VerbCount', 'IsFinite', 'IsLastContourClosed', 'IsLine', 'SegmentMasks'];
  const getters = Object.fromEntries(properties.map(name => [name, Object.getOwnPropertyDescriptor(P, name).get]));
  let maxBytes = 8 * 1024 * 1024, retained = 0;
  const stats = { Hits: 0, Misses: 0, NativeReads: 0, Evictions: 0 };
  const removeItem = (item, eviction = false) => {
    if (!entries.delete(item)) return;
    retained -= item.bytes;
    if (eviction) stats.Evictions++;
  };
  const remove = path => { const item = index.get(path); if (item) removeItem(item); index.delete(path); };
  const trim = () => { while (retained > maxBytes && entries.size) removeItem(entries.keys().next().value, true); };
  function query(path) {
    path.ThrowIfDisposed();
    if (!maxBytes) return null;
    let item = index.get(path);
    if (item && entries.has(item) && item.generation === path.GenerationId) {
      stats.Hits++; entries.delete(item); entries.set(item, true); return item;
    }
    remove(path); stats.Misses++;
    const native = path._native, count = native.countPoints();
    if (count * 8 + 64 > maxBytes) return null;
    const commands = native.toCmds(); stats.NativeReads++;
    const points = new Float32Array(count * 2), lengths = [2, 2, 4, 5, 6, 0];
    let at = 0, verbs = 0, masks = 0, last = -1, first = -1, finite = true;
    for (let i = 0; i < commands.length;) {
      const verb = commands[i++], size = lengths[verb];
      if (size === undefined || i + size > commands.length) throw new Error('Malformed native path commands.');
      if (!verbs) first = verb;
      verbs++; last = verb;
      if (verb >= 1 && verb <= 4) masks |= 1 << (verb - 1);
      for (let j = 0; j < size - (verb === 3 ? 1 : 0); j++) {
        const v = commands[i + j]; points[at++] = v; finite &&= Number.isFinite(v);
      }
      i += size;
    }
    if (at !== points.length) throw new Error('Native path point count mismatch.');
    item = { generation: path.GenerationId, points, bytes: points.byteLength + 64,
      VerbCount: verbs, IsFinite: finite, IsLastContourClosed: last === 5,
      IsLine: verbs === 2 && first === 0 && last === 1, SegmentMasks: masks };
    index.set(path, item); entries.set(item, true); retained += item.bytes; trim(); return item;
  }
  const point = (item, index) => new api.SKPoint(item.points[index * 2] ?? 0, item.points[index * 2 + 1] ?? 0);
  const count = (value, name) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(name + ' must be a nonnegative safe integer.');
    return value;
  };
  P.GetPoints = function (destination, maximum) {
    const item = query(this); if (!item) return original.GetPoints.call(this, destination, maximum);
    const length = item.points.length / 2;
    if (destination === undefined) return Array.from({ length }, (_, i) => point(item, i));
    if (typeof destination === 'number') return Array.from({ length: count(destination, 'Maximum point count') }, (_, i) => point(item, i));
    if (!Array.isArray(destination)) throw new TypeError('Point output must be an array of SKPoint values.');
    const limit = Math.min(length, maximum == null ? destination.length : count(maximum, 'Maximum point count'));
    if (limit > destination.length) throw new RangeError('Point destination is too small.');
    for (let i = 0; i < limit; i++) destination[i] = point(item, i);
    return length;
  };
  P.GetPoint = function (index) {
    const item = query(this); if (!item) return original.GetPoint.call(this, index);
    if (!Number.isInteger(index) || index < 0 || index * 2 >= item.points.length) throw new RangeError('Path point index is outside the point array.');
    return point(item, index);
  };
  for (const name of properties) Object.defineProperty(P, name, { configurable: true, get() { const item = query(this); return item ? item[name] : getters[name].call(this); } });
  for (const name of ['_edit', '_replace', 'Reset', 'Dispose']) {
    const previous = P[name]; P[name] = function (...args) { remove(this); return previous.apply(this, args); };
  }
  const clear = () => { entries.clear(); index = new WeakMap(); retained = 0; };
  const purge = api.SKGraphics.PurgeAllCaches;
  api.SKGraphics.PurgeAllCaches = function () { clear(); return purge.call(this); };
  api.SKGraphics.PurgePathCache = clear;
  api.SKGraphics.SetPathCacheLimit = value => { const old = maxBytes; maxBytes = count(value, 'Path cache limit'); trim(); return old; };
  api.SKGraphics.GetPathCacheStatistics = () => Object.freeze({ ...stats, EntryCount: entries.size, RetainedBytes: retained, MaxBytes: maxBytes });
}
