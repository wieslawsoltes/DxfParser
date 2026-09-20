/** SkiaSharp SKPaint overloads backed by Skia's own path expansion and bounds.
 * C# contract: b33cf54f, SKPaint.cs 642-751. In particular, a failed SKPath
 * destination is unchanged, whereas an SKPathBuilder receives the native result.
 */
export function installPaintCompletion(K, api) {
  const P = api.SKPaint.prototype;
  const oldFill = P.GetFillPath, oldBounds = P.GetFastBounds;
  const array = x => x?.ToArray?.() ?? x?.Values ?? (x?.Left !== undefined ? [x.Left,x.Top,x.Right,x.Bottom] : x);
  const isMatrix = x => x instanceof api.SKMatrix || array(x)?.length === 9;
  const isRect = x => x instanceof api.SKRect || x?.Left !== undefined || array(x)?.length === 4;
  const writeBounds = (destination, rect) => {
    if (Array.isArray(destination)) destination.splice(0, 4, ...rect.ToArray());
    else { Object.assign(destination, rect); if (!(destination instanceof api.SKRect)) destination.Value = rect; }
  };
  const hasSoftwareGeometry = paint => !!paint._effects?.PathEffect?._software;

  P.GetFillPath = function (source, ...args) {
    this.ThrowIfDisposed();
    if (!(source instanceof api.SKPath)) throw new TypeError('source must be an SKPath.');
    source.ThrowIfDisposed();
    let destination = null, cull = null, matrix = api.SKMatrix.Identity;
    if (args[0] instanceof api.SKPath) { destination = args.shift(); destination.ThrowIfDisposed(); }
    else if (args[0] == null && args.length) throw new TypeError('A path destination or a valid cull/scale/matrix is required.');
    if (isRect(args[0])) cull = Array.from(array(args.shift()));
    if (args.length) {
      const transform = args.shift();
      if (typeof transform === 'number') matrix = api.SKMatrix.CreateScale(transform, transform);
      else if (isMatrix(transform)) matrix = transform;
      else throw new TypeError('Expected a scalar resolution scale or an SKMatrix.');
    }
    if (args.length) throw new TypeError('Unexpected GetFillPath arguments.');
    if (cull?.length !== 4 && cull !== null) throw new TypeError('Cull bounds must contain four edges.');
    if (typeof K.SkiaSharpPaintGetFillPath !== 'function' || hasSoftwareGeometry(this)) {
      // Older injected engines retain their documented approximation, not a
      // fabricated native-conformance claim. Normalize the 4.x failure result.
      const params = [];
      if (destination) params.push(destination);
      if (cull) params.push(new api.SKRect(...cull));
      params.push(matrix);
      if (!destination && (this.Style?.value ?? this.Style) === 1 && this.StrokeWidth === 0) return null;
      return oldFill.call(this, source, ...params);
    }
    const row = K.SkiaSharpPaintGetFillPath(this._native, source._native, cull, Array.from(array(matrix)));
    const builder = destination instanceof api.SKPathBuilder;
    if (!row.Success && !builder) return destination ? false : null;
    const result = api.SKPath.FromVerbsPointsWeights(row.Verbs, row.Points, row.Weights);
    if (!result) throw new Error('Native path expansion returned invalid path data.');
    result.FillType = row.FillType;
    if (!destination) return result;
    try { destination._replace(result._native.copy(), result._fill); return !!row.Success; }
    finally { result.Dispose(); }
  };

  P.GetFastBounds = function (bounds, destination) {
    this.ThrowIfDisposed();
    if (!isRect(bounds)) throw new TypeError('bounds must be an SKRect.');
    if (destination !== undefined && (!destination || typeof destination !== 'object')) throw new TypeError('A mutable rectangle destination is required.');
    const software = Object.values(this._effects ?? {}).some(effect => effect?._software);
    if (typeof K.SkiaSharpPaintFastBounds !== 'function' || software) {
      const result = software ? false : oldBounds.call(this, bounds, destination);
      if (result === false && destination) writeBounds(destination, api.SKRect.Empty);
      return result;
    }
    const result = K.SkiaSharpPaintFastBounds(this._native, Array.from(array(bounds)));
    const computed = new api.SKRect(...result.Bounds);
    if (destination) { writeBounds(destination, computed); return !!result.Success; }
    return result.Success ? computed : false;
  };
  Object.defineProperty(api.SKPaint, 'HasNativeGeometry', {
    get: () => typeof K.SkiaSharpPaintGetFillPath === 'function' && typeof K.SkiaSharpPaintFastBounds === 'function'
  });
  Object.defineProperty(api.SKPaint, 'HasNativePathExpansion', {
    get: () => typeof K.SkiaSharpPaintGetFillPath === 'function' && typeof K.SkiaSharpPaintFastBounds === 'function'
  });
}
