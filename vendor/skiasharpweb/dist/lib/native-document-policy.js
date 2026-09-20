/** Preserve native PDF content that SkPDFDevice otherwise does not draw.
 * Native PDF has no drawVertices/drawMesh implementation at the pinned revision.
 * A color-filter layer asks Skia for a raster device; all drawing/state still
 * executes in native Skia, and the decision is explicit in the document report. */
export function installNativeDocumentPolicy(K, api) {
  const begin=api.SKDocument.prototype.BeginPage;
  const unsupportedPicture=picture=>{
    if(!picture?._documentCommands)return true;
    const visit=commands=>commands.some(q=>['DrawVertices','DrawPatch'].includes(q.operation)||q.kind==='unsupported'||q.children&&visit(q.children));
    return visit(picture._documentCommands);
  };
  api.SKDocument.prototype.BeginPage=function(...args) {
    const canvas=begin.apply(this,args);
    if(!this._nativeDocument)return canvas;
    const doc=this;
    for(const name of ['DrawVertices','DrawPatch','DrawPicture']) {
      const original=canvas[name].bind(canvas);
      canvas[name]=function(...values) {
        if(name==='DrawPicture'&&!unsupportedPicture(values[0]))return original(...values);
        if(doc._strict)throw new api.SKNotSupportedError('Strict vector native PDF cannot preserve '+name+' without a raster layer.');
        const bounds=canvas.LocalClipBounds;
        if(canvas.IsClipEmpty)return;
        const filter=api.SKColorFilter.CreateColorMatrix([1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0]);
        const paint=new api.SKPaint({ColorFilter:filter});let count;
        try {
          count=canvas.SaveLayer(bounds,paint);
          original(...values);
          doc._adapterRasterTotal=(doc._adapterRasterTotal??0)+1;
          if(doc._report.length<(doc._metadata.DiagnosticsLimit??4096))doc._report.push({Page:doc.PageCount+1,Reason:'native-pdf-'+name,Operation:name,Bounds:bounds.ToArray(),CoordinateSpace:'local-clip-bound',Stage:'AdapterRasterLayer'});
        } finally {if(count!==undefined)canvas.RestoreToCount(count);paint.Dispose();filter.Dispose();}
      };
    }
    return canvas;
  };
}
