/** Special-purpose canvases, managed drawables and native picture/cache APIs. */
export function createSpecializedAPI(K, api) {
  const {SKObject,SKCanvas,SKRect,SKImageInfo,SKMatrix,SKPicture,SKShader}=api;
  const array=value=>value?.ToArray?.()??value;
  let generation=1;
  class SKDrawable extends SKObject {
    constructor(draw=null,bounds=new SKRect(),approximateBytes=0){super(null);this._draw=draw;this._bounds=bounds.Clone?.()??new SKRect(...array(bounds));this._bytes=approximateBytes;this._generation=generation++;}
    get GenerationId(){this.ThrowIfDisposed();return this._generation;}
    get Bounds(){this.ThrowIfDisposed();const b=this.OnGetBounds();return b.Clone?.()??new SKRect(...array(b));}
    get ApproximateBytesUsed(){this.ThrowIfDisposed();return this.OnGetApproximateBytesUsed();}
    OnGetBounds(){return this._bounds;}
    OnGetApproximateBytesUsed(){return this._bytes;}
    OnDraw(canvas){if(typeof this._draw!=='function')throw new Error('SKDrawable must implement OnDraw(canvas) or receive a drawing callback.');this._draw(canvas);}
    Draw(canvas,matrixOrX=null,y=0){this.ThrowIfDisposed();canvas._check?.();const saved=canvas.Save();try{if(typeof matrixOrX==='number')canvas.Translate(matrixOrX,y);else if(matrixOrX)canvas.Concat(matrixOrX);this.OnDraw(canvas);}finally{canvas.RestoreToCount(saved);}}
    NotifyDrawingChanged(){this.ThrowIfDisposed();this._generation=generation++;}
    Snapshot(){this.ThrowIfDisposed();const recorder=new api.SKPictureRecorder();try{const canvas=recorder.BeginRecording(this.Bounds);this.OnDraw(canvas);return recorder.EndRecording();}finally{recorder.Dispose();}}
  }
  class SKNoDrawCanvas extends SKCanvas {
    constructor(width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<0||height<0)throw new RangeError('Canvas dimensions must be nonnegative integers.');const recorder=new K.PictureRecorder();const native=recorder.beginRecording([0,0,width,height]);super(native);this._stateRecorder=recorder;this.Width=width;this.Height=height;native.clipRect([0,0,width,height],K.ClipOp.Intersect,false);this._clipDirty=true;}
    SaveLayer(){return this.Save();}
    WritePixels(){this._check();return false;}
    ReadPixels(){this._check();return null;}
    Flush(){this._check();}
    Dispose(){if(this.IsDisposed)return;super.Dispose();this._stateRecorder.delete();this._stateRecorder=null;}
  }
  const methods=new Set();let p=SKCanvas.prototype;while(p&&p!==SKObject.prototype){for(const name of Object.getOwnPropertyNames(p))if(typeof Object.getOwnPropertyDescriptor(p,name)?.value==='function')methods.add(name);p=Object.getPrototypeOf(p);}
  for(const name of methods)if(/^Draw/.test(name)||name==='Clear')Object.defineProperty(SKNoDrawCanvas.prototype,name,{configurable:true,writable:true,value:function(){this._check();}});
  class SKNWayCanvas extends SKNoDrawCanvas {
    constructor(width,height){super(width,height);this._targets=[];}
    AddCanvas(canvas){this._check();if(!canvas||typeof canvas.Save!=='function')throw new TypeError('A canvas is required.');if(canvas===this||canvas._containsCanvas?.(this))throw new Error('Canvas forwarding cannot contain a cycle.');if(!this._targets.some(t=>t.canvas===canvas))this._targets.push({canvas,base:canvas.SaveCount-1});}
    _containsCanvas(canvas){return this._targets.some(t=>t.canvas===canvas||t.canvas._containsCanvas?.(canvas));}
    RemoveCanvas(canvas){this._check();this._targets=this._targets.filter(t=>t.canvas!==canvas);}
    RemoveAll(){this._check();this._targets=[];}
    Dispose(){if(this.IsDisposed)return;this.RemoveAll();super.Dispose();}
  }
  const forward=new Set([...methods].filter(n=>/^Draw/.test(n)||/^Clip/.test(n)||['Clear','WritePixels','Save','SaveLayer','Restore','RestoreToCount','Translate','Scale','RotateDegrees','RotateRadians','Skew','Concat','SetMatrix','ResetMatrix','Flush'].includes(n)));
  // Each public operation is forwarded once; local inherited implementation may
  // call other public operations, so a guard suppresses recursive forwarding.
  for(const name of forward){Object.defineProperty(SKNWayCanvas.prototype,name,{configurable:true,writable:true,value:function(...args){this._check();if(this._forwarding)return SKNoDrawCanvas.prototype[name].apply(this,args);this._forwarding=true;try{for(const target of this._targets){const forwarded=name==='RestoreToCount'?[target.base+Math.max(1,args[0])]:args;target.canvas[name](...forwarded);}return SKNoDrawCanvas.prototype[name].apply(this,args);}finally{this._forwarding=false;}}});}
  if(!SKCanvas.prototype.DrawDrawable)SKCanvas.prototype.DrawDrawable=function(drawable,...args){this._complex();drawable.Draw(this,...args);};
  SKPicture.prototype.Playback=function(canvas){this.ThrowIfDisposed();canvas.DrawPicture(this);};
  SKPicture.prototype.ToShader=function(tmx=K.TileMode.Clamp,tmy=K.TileMode.Clamp,...args){this.ThrowIfDisposed();let filter=K.FilterMode.Nearest,matrix=null,tile=null;for(const arg of args){if(arg?.Left!==undefined)tile=array(arg);else if(arg instanceof api.SKMatrix||Array.isArray(arg)||ArrayBuffer.isView(arg))matrix=array(arg);else if(arg!=null)filter=arg;}return SKShader._fromNative(this._native.makeShader(tmx,tmy,filter,matrix??undefined,tile??undefined));};
  const serialize=SKPicture.prototype.Serialize;
  SKPicture.prototype.Serialize=function(stream){const data=serialize.call(this);if(!stream)return data;try{return data.SaveTo(stream);}finally{data.Dispose();}};
  const nativeGraphics=()=>K.SkiaSharpNative?.Graphics??Object.fromEntries(Object.entries({GetFontCacheUsed:'FontCacheUsed',GetFontCacheLimit:'FontCacheLimit',SetFontCacheLimit:'SetFontCacheLimit',GetFontCacheCountUsed:'GetFontCacheCountUsed',GetFontCacheCountLimit:'GetFontCacheCountLimit',SetFontCacheCountLimit:'SetFontCacheCountLimit',GetResourceCacheSingleAllocationByteLimit:'GetResourceCacheSingleAllocationByteLimit',SetResourceCacheSingleAllocationByteLimit:'SetResourceCacheSingleAllocationByteLimit',GetTypefaceCacheCountLimit:'GetTypefaceCacheCountLimit',SetTypefaceCacheCountLimit:'SetTypefaceCacheCountLimit',PurgePinnedFontCache:'PurgePinnedFontCache',PurgeFontCache:'PurgeFontCache',PurgeAllCaches:'PurgeAllCaches'}).map(([publicName,nativeName])=>[publicName,K['SkiaSharp'+nativeName]]));
  const need=(name,...args)=>{const method=nativeGraphics()?.[name];if(typeof method!=='function')throw new api.SKNotSupportedError(`${name} requires the optional native SkGraphics bindings.`);return method(...args);};
  const SKGraphics={
    Init(){return undefined;},
    GetResourceCacheTotalByteLimit(){return K.getDecodeCacheLimitBytes();},
    SetResourceCacheTotalByteLimit(bytes){if(!Number.isSafeInteger(bytes)||bytes<0)throw new RangeError('Cache limit must be a nonnegative safe integer.');return K.setDecodeCacheLimitBytes(bytes);},
    GetResourceCacheTotalBytesUsed(){return K.getDecodeCacheUsedBytes();},
    PurgeResourceCache(){const limit=K.getDecodeCacheLimitBytes();K.setDecodeCacheLimitBytes(0);K.setDecodeCacheLimitBytes(limit);},
    GetFontCacheLimit(){return need('GetFontCacheLimit');},SetFontCacheLimit(value){return need('SetFontCacheLimit',value);},GetFontCacheUsed(){return need('GetFontCacheUsed');},GetFontCacheCountUsed(){return need('GetFontCacheCountUsed');},GetFontCacheCountLimit(){return need('GetFontCacheCountLimit');},SetFontCacheCountLimit(value){return need('SetFontCacheCountLimit',value);},PurgeFontCache(){return need('PurgeFontCache');},
    GetResourceCacheSingleAllocationByteLimit(){return need('GetResourceCacheSingleAllocationByteLimit');},SetResourceCacheSingleAllocationByteLimit(value){return need('SetResourceCacheSingleAllocationByteLimit',value);},
    GetTypefaceCacheCountLimit(){return need('GetTypefaceCacheCountLimit');},SetTypefaceCacheCountLimit(value){return need('SetTypefaceCacheCountLimit',value);},PurgePinnedFontCache(){return need('PurgePinnedFontCache');},
    PurgeAllCaches(){if(nativeGraphics()?.PurgeAllCaches)return nativeGraphics().PurgeAllCaches();throw new api.SKNotSupportedError('PurgeAllCaches requires native font-cache bindings; PurgeResourceCache is available.');},
    DumpMemoryStatistics(dump){if(nativeGraphics()?.DumpMemoryStatistics)return nativeGraphics().DumpMemoryStatistics(dump);throw new api.SKNotSupportedError('Full native memory diagnostics require the optional SkGraphics bindings.');},
    GetCapabilities(){return Object.freeze({ResourceCache:true,FontCache:!!nativeGraphics()?.GetFontCacheUsed,NativeMemoryDump:!!nativeGraphics()?.DumpMemoryStatistics});}
  };
  return {SKDrawable,SKNoDrawCanvas,SKNWayCanvas,SKGraphics};
}
