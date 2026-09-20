/** Faithful managed text-on-path contour algorithm from SkiaSharp SKFont.cs.
 * Target: mono/SkiaSharp b33cf54f24edc5347567c95b1924c447669c1de8 (MIT).
 * Unlike the previous sampled-polyline implementation, this preserves conic,
 * quadratic and cubic verbs and uses the same first-contour and origin rules.
 */
export function installTextPathCompletion(K, api) {
  const f = Math.fround, val = v => v?.value ?? v;
  const isBytes = v => v instanceof ArrayBuffer || v instanceof Uint8Array || v instanceof DataView;
  const point = v => new api.SKPoint(f(v?.X ?? v?.[0] ?? 0), f(v?.Y ?? v?.[1] ?? 0));
  const enc = v => typeof v === 'string' ? api.SKTextEncoding[v] : val(v);
  function glyphsFor(font, input, args) {
    if (input == null) return new Uint16Array();
    if (typeof input === 'number') throw new TypeError('Native pointer overloads require a browser typed-array substitute.');
    if (isBytes(input)) {
      const encoding = enc(args.shift());
      if (![0, 1, 2, 3].includes(encoding)) throw new RangeError('An explicit SKTextEncoding is required for byte input.');
      return font.GetGlyphs(input, encoding);
    }
    if (input instanceof Uint16Array) return input;
    if (Array.isArray(input) && input.every(v => typeof v === 'number')) {
      if (input.some(v => !Number.isInteger(v) || v < 0 || v > 65535)) throw new RangeError('Glyph IDs must fit UInt16.');
      return Uint16Array.from(input);
    }
    return font.GetGlyphs(input);
  }
  api.SKFont.prototype.GetTextPathOnPath = function (input, ...args) {
    this.ThrowIfDisposed();
    const glyphs = glyphsFor(this, input, args);
    let widths, positions, path, align;
    if (Array.isArray(args[0]) || ArrayBuffer.isView(args[0])) {
      [widths, positions, path, align = api.SKTextAlign.Left] = args;
      if (args.length > 4) throw new TypeError('Unexpected GetTextPathOnPath arguments.');
      if (widths.length !== glyphs.length || positions?.length !== glyphs.length) throw new RangeError('Glyphs, widths and positions must have equal lengths.');
      positions = Array.from(positions, point);
    } else {
      let origin;
      [path, align = api.SKTextAlign.Left, origin = new api.SKPoint()] = args;
      if (args.length > 3) throw new TypeError('Unexpected GetTextPathOnPath arguments.');
      widths = this.GetGlyphWidths(glyphs);
      // Native SkFont::getPos accumulates in SkScalar, including the origin.
      let x = f(origin.X), y = f(origin.Y);
      positions = Array.from(widths, width => { const p = new api.SKPoint(x, y); x = f(x + width); return p; });
    }
    if (!(path instanceof api.SKPath)) throw new TypeError('A follow path is required.');
    path.ThrowIfDisposed();
    const alignment = val(align);
    if (![0, 1, 2].includes(alignment)) throw new RangeError('Text alignment must be Left, Center or Right.');
    const output = new api.SKPathBuilder();
    if (!glyphs.length) return output.DetachAndDispose();
    const measure = new api.SKPathMeasure(path), cache = new Map();
    try {
      const length = measure.Length;
      const textLength = f(positions.at(-1).X + f(widths[widths.length - 1]));
      // This double application of origin.X is the pinned .NET behavior.
      const offset = f(positions[0].X + f(f(length - textLength) * f(alignment * .5)));
      const morph = (p, x, y) => {
        const sx = f(f(p.X) + x), sy = f(f(p.Y) + y);
        const sample = measure.GetPositionAndTangent(sx);
        const pos = sample?.Position ?? api.SKPoint.Empty, tangent = sample?.Tangent ?? api.SKPoint.Empty;
        return new api.SKPoint(f(pos.X - f(tangent.Y * sy)), f(pos.Y + f(tangent.X * sy)));
      };
      for (let index = 0; index < glyphs.length; index++) {
        const position = positions[index], x0 = f(offset + position.X), x1 = f(x0 + f(widths[index]));
        if (!(x1 >= 0 && x0 <= length)) continue;
        const id = glyphs[index];
        if (!cache.has(id)) cache.set(id, this.GetGlyphPath(id));
        const outline = cache.get(id);
        if (!outline) continue;
        const iterator = outline.CreateIterator(false), points = [];
        try {
          for (;;) {
            const verb = val(iterator.Next(points));
            if (verb === 6) break;
            if (verb === 0) output.MoveTo(morph(points[0], x0, position.Y));
            else if (verb === 1) {
              const midpoint = new api.SKPoint(f(f(points[0].X + points[1].X) * .5), f(f(points[0].Y + points[1].Y) * .5));
              output.QuadTo(morph(midpoint, x0, position.Y), morph(points[1], x0, position.Y));
            } else if (verb === 2) output.QuadTo(morph(points[1], x0, position.Y), morph(points[2], x0, position.Y));
            else if (verb === 3) output.ConicTo(morph(points[1], x0, position.Y), morph(points[2], x0, position.Y), iterator.ConicWeight());
            else if (verb === 4) output.CubicTo(morph(points[1], x0, position.Y), morph(points[2], x0, position.Y), morph(points[3], x0, position.Y));
            else if (verb === 5) output.Close();
            else throw new Error('Invalid glyph-path verb.');
          }
        } finally { iterator.Dispose(); }
      }
      return output.Detach();
    } finally { output.Dispose(); measure.Dispose(); for (const path of cache.values()) path?.Dispose(); }
  };
  const oldDraw = api.SKCanvas.prototype.DrawTextOnPath;
  api.SKCanvas.prototype.DrawTextOnPath = function (text, path, ...args) {
    this._check();
    const original = args.slice();
    let origin;
    if (args[0]?.X !== undefined) origin = args.shift();
    else origin = new api.SKPoint(args.shift() ?? 0, args.shift() ?? 0);
    const warp = typeof args[0] === 'boolean' ? args.shift() : true;
    if (!warp) return oldDraw.call(this, text, path, ...original);
    const paint = args.pop();
    if (!(paint instanceof api.SKPaint)) throw new TypeError('A paint is required.');
    paint.ThrowIfDisposed();
    const font = args.find(v => v instanceof api.SKFont) ?? paint.ToFont(), owned = !args.includes(font);
    const align = args.find(v => v !== font) ?? paint.TextAlign ?? api.SKTextAlign.Left;
    let outline;
    try {
      outline = isBytes(text) ? font.GetTextPathOnPath(text, paint.TextEncoding, path, align, origin) : font.GetTextPathOnPath(text, path, align, origin);
      return this.DrawPath(outline, paint);
    } finally { outline?.Dispose(); if (owned) font.Dispose(); }
  };
}
