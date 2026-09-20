/** Canonical SkFont::getPaths callbacks with an independent native path matrix. */
export function installFontPathCallbacks(K, api) {
  const previous=api.SKFont.prototype.GetGlyphPaths;
  api.SKFont.prototype.GetGlyphPaths=function(glyphs,callback) {
    this.ThrowIfDisposed();
    if(typeof callback!=='function')throw new TypeError('A glyph path callback is required.');
    if(glyphs==null||typeof glyphs[Symbol.iterator]!=='function')throw new TypeError('Glyph IDs must be iterable.');
    const ids=Array.from(glyphs);
    if(ids.some(g=>!Number.isInteger(g)||g<0||g>65535))throw new RangeError('Glyph IDs must fit UInt16.');
    if(typeof K.SkiaSharpFontGetPaths!=='function')return previous.call(this,ids,callback);
    const rows=K.SkiaSharpFontGetPaths(this._native,ids);
    if(rows.length!==ids.length)throw new Error('Native glyph-path callback count mismatch.');
    for(const row of rows) {
      let path=null;
      try {
        if(row.HasPath){path=api.SKPath.FromVerbsPointsWeights(row.Verbs,row.Points,row.Weights);path.FillType=row.FillType;}
        const returned=callback(path,new api.SKMatrix(row.Matrix));
        if(returned?.then)throw new TypeError('Glyph path callbacks must be synchronous; clone paths to retain them.');
      } finally {path?.Dispose();}
    }
  };
  Object.defineProperty(api.SKFont,'HasCanonicalPathCallbacks',{get:()=>typeof K.SkiaSharpFontGetPaths==='function'});
}
