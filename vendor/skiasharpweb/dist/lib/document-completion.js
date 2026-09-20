/** Native document observability, strict publication gate, and output lifetime.
 * Installed separately from the managed PDF/XPS serializers. */
export function installDocumentCompletion(K,api) {
  const Type=api.SKDocument,P=Type.prototype;
  const createPdf=Type.CreatePdf,createXps=Type.CreateXps,close=P.Close,end=P.EndPage,abort=P.Abort;
  const legacyFallbacks=Object.getOwnPropertyDescriptor(P,'RasterFallbacks').get;
  const val=v=>v?.value??v;
  function validate(metadata={}) {
    for(const k of ['Creation','Modified'])if(metadata[k]!=null&&!Number.isFinite(Number(new Date(metadata[k]))))throw new RangeError(k+' must be a valid date.');
    const dpi=metadata.RasterDpi??metadata.Dpi??72;
    if(!Number.isFinite(dpi)||dpi<=0)throw new RangeError('Document DPI must be positive.');
    if(metadata.DiagnosticsLimit!==undefined&&(!Number.isSafeInteger(metadata.DiagnosticsLimit)||metadata.DiagnosticsLimit<0||metadata.DiagnosticsLimit>65536))throw new RangeError('DiagnosticsLimit must be between 0 and 65536.');
    if(metadata.CompressionLevel!==undefined&&![-1,0,1,6,9].includes(val(metadata.CompressionLevel)))throw new RangeError('CompressionLevel must be -1, 0, 1, 6, or 9.');
    if(metadata.EncodingQuality!==undefined&&(!Number.isInteger(metadata.EncodingQuality)||metadata.EncodingQuality<0||metadata.EncodingQuality>101))throw new RangeError('EncodingQuality must be between 0 and 101.');
    return {...metadata,...(metadata.CompressionLevel===undefined?{}:{CompressionLevel:val(metadata.CompressionLevel)})};
  }
  Type.CreatePdf=function(stream=null,metadata={}) {
    if(stream&&typeof stream!=='string'&&!stream.Write&&!stream.write){metadata=stream;stream=null;}
    if(typeof metadata==='number')metadata={RasterDpi:metadata};
    const checked=validate(metadata),strict=!!(checked.StrictVector??checked.VectorOnly??false),nativeStrict=strict&&checked.NativeBackend===true;
    const result=createPdf.call(this,stream,nativeStrict?{...checked,StrictVector:false,VectorOnly:false}:checked);
    if(nativeStrict) {
      if(typeof result._nativeDocument?.rasterDiagnostics!=='function'){result.Dispose();throw new api.SKNotSupportedError('Native StrictVector requires compiled PDF raster-decision diagnostics.');}
      result._strict=true;result._metadata={...result._metadata,...checked};
    }
    return result;
  };
  Type.CreateXps=function(stream=null,dpi=72) {
    if(stream&&typeof stream!=='string'&&!stream.Write&&!stream.write){dpi=stream;stream=null;}
    return createXps.call(this,stream,validate(typeof dpi==='object'?dpi:{RasterDpi:dpi}));
  };
  Object.defineProperties(P,{
    RasterFallbackReporting:{configurable:true,get(){return this._nativeDocument?(typeof this._nativeDocument.rasterDiagnostics==='function'?'NativeDecisionSites':'UnavailableNative'):'PerOperation';}},
    RasterDiagnostics:{configurable:true,get(){
      this.ThrowIfDisposed();
      if(!this._nativeDocument){const events=legacyFallbacks.call(this);return{Source:'JavaScript-command-capture',Events:events,Total:events.length,Dropped:0,Limit:null};}
      if(typeof this._nativeDocument.rasterDiagnostics!=='function')return null;
      const native=structuredClone(this._nativeDocument.rasterDiagnostics()),adapterTotal=this._adapterRasterTotal??0;
      return{...native,Events:[...native.Events,...this._report.map(e=>({...e,Bounds:e.Bounds.slice()}))],Total:native.Total+adapterTotal,Dropped:native.Dropped+adapterTotal-this._report.length,NativeEventCount:native.Total,AdapterEventCount:adapterTotal};
    }},
    RasterFallbacks:{configurable:true,get(){return this.RasterDiagnostics?.Events??null;}}
  });
  function enforce(document) {
    if(!document._strict||!document._nativeDocument)return;
    const report=document.RasterDiagnostics;
    if(!report||report.Total>0){const error=new api.SKNotSupportedError('Strict vector native PDF produced a raster decision'+(report?.Events[0]?': '+report.Events[0].Reason:'.'));error.Diagnostics=report;document._failure=error;document.Abort();throw error;}
  }
  P.EndPage=function(){const result=end.call(this);enforce(this);return result;};
  P.Close=function(){
    this.ThrowIfDisposed();if(this._failure)throw this._failure;if(this._aborted)throw new Error('Document was aborted.');if(this._closed)return true;
    // The native/managed writers buffer into _bytes. Delay all caller-stream I/O
    // until their output and the policy have been checked successfully.
    const stream=this._stream;this._stream=null;
    try{
      close.call(this);this._stream=stream;enforce(this);
      if(stream){if((stream.Write??stream.write).call(stream,this._bytes)===false)throw new Error('Document output stream rejected the write.');stream.Flush?.();if(this._ownsStream){stream.Dispose();this._stream=null;}}
      return true;
    }catch(error){this._stream=stream;this._failure=error;this.Abort();throw error;}
  };
  P.Abort=function(){this.ThrowIfDisposed();if(this._aborted)return;this._aborted=true;return abort.call(this);};
  const flush=P.Flush;P.Flush=function(){this.ThrowIfDisposed();return flush.call(this);};
  const flags=Object.freeze({None:0,ConvertTextToPaths:1,NoPrettyXML:2,RelativePathEncoding:4});
  api.SKSvgCanvasFlags=flags;
  api.SKSvgCanvas.Create=function(bounds,stream,options=0){
    if(!stream||(typeof stream.Write!=='function'&&typeof stream.write!=='function'))throw new TypeError('SKSvgCanvas.Create requires a writable stream.');
    if(typeof K._SkiaSharpDocument!=='function')throw new api.SKNotSupportedError('Native SVG canvas requires the bundled document bindings.');
    const selected=val(options);
    if(!Number.isInteger(selected)||selected<0||(selected&~7))throw new RangeError('Unknown SVG canvas flags.');
    const r=Array.from(bounds.ToArray?.()??bounds),width=r[2]-r[0],height=r[3]-r[1];
    if(!r.every(Number.isFinite)||!(width>0&&height>0))throw new RangeError('SVG bounds must have finite positive dimensions.');
    const doc=new K._SkiaSharpDocument(false),owner=new api.SKObject();let canvas,closed=false;
    try{
      if(doc.setSvgFlags)doc.setSvgFlags(selected);
      else if(arguments.length>2&&selected!==flags.ConvertTextToPaths)throw new api.SKNotSupportedError('SVG text/format flags require the rebuilt native document extension.');
      const native=doc.beginPage(width,height);if(!native)throw new Error('Native SVG canvas creation failed.');
      canvas=new api.SKCanvas(native,owner);canvas.Translate(-r[0],-r[1]);
    }catch(error){owner.Dispose();doc.delete();throw error;}
    const dispose=canvas.Dispose.bind(canvas);
    canvas.Dispose=()=>{if(closed)return;closed=true;try{const data=new Uint8Array(doc.close());if((stream.Write??stream.write).call(stream,data)===false)throw new Error('SVG output stream rejected the document.');stream.Flush?.();}finally{dispose();owner.Dispose();doc.delete();}};
    return canvas;
  };
}
