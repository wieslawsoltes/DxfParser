/** Raster-format overloads. Native Skia owns surface state; this module owns only
 * explicitly allocated Wasm pixel buffers. External JS buffers copy on Flush. */
export function installSurfaceFormats(K,api){
  const {SKSurface,SKCanvas,SKImageInfo,SKPixmap,SKColorSpace,SKMaskFilter}=api;
  if(SKSurface._surfaceFormatsInstalled)return;
  Object.defineProperty(SKSurface,'_surfaceFormatsInstalled',{value:true});
  const originalCreate=SKSurface.Create,value=v=>v?.value??v,native=v=>v?._native??v;
  const aliases={Alpha8:'Alpha_8',Rgb565:'RGB_565',Rgba8888:'RGBA_8888',Bgra8888:'BGRA_8888',Rgba1010102:'RGBA_1010102',Rgb101010x:'RGB_101010x',Gray8:'Gray_8',RgbaF16:'RGBA_F16',RgbaF32:'RGBA_F32',RgbF16F16F16x:'RGB_F16F16F16x'};
  function enumeration(input,group,fallback){if(input==null)return fallback;if(typeof input==='string'){const v=group[aliases[input]??input]??Object.entries(group).find(([name])=>name.toLowerCase()===input.toLowerCase())?.[1];if(v==null)throw new RangeError('Unknown image-format enum: '+input);return v;}const number=value(input);if(!Number.isInteger(number)||number<0)throw new RangeError('Image-format enum must be a nonnegative integer.');return group.values?.[number]??(typeof input==='object'?input:{value:number});}
  function normalize(info){
    if(!info)throw new TypeError('Image information is required.');
    const width=info.Width??info.width,height=info.Height??info.height;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new RangeError('Surface dimensions must be positive integers.');
    const colorType=enumeration(info.ColorType??info.colorType,K.ColorType,K.ColorType.RGBA_8888),alphaType=enumeration(info.AlphaType??info.alphaType,K.AlphaType,K.AlphaType.Premul);
    const inputSpace='ColorSpace' in info?info.ColorSpace:'colorSpace' in info?info.colorSpace:K.ColorSpace.SRGB;inputSpace?.ThrowIfDisposed?.();
    const colorSpace=native(inputSpace)??null,publicInfo=new SKImageInfo(width,height,colorType,alphaType,inputSpace??null),bytesPerPixel=publicInfo.BytesPerPixel;
    if(!Number.isInteger(bytesPerPixel)||bytesPerPixel<1||bytesPerPixel>16)throw new RangeError('Unknown or unsupported pixel format.');
    return {width,height,colorType,alphaType,colorSpace,bytesPerPixel};
  }
  const byteView=buffer=>{if(buffer instanceof ArrayBuffer||typeof SharedArrayBuffer!=='undefined'&&buffer instanceof SharedArrayBuffer)return new Uint8Array(buffer);if(ArrayBuffer.isView(buffer))return new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength);if(buffer?._ck&&buffer.toTypedArray)return byteView(buffer.toTypedArray());if(buffer?.GetPixels)return byteView(buffer.GetPixels());throw new TypeError('Pixels must be a typed array, ArrayBuffer or CanvasKit allocation.');};
  const isBuffer=buffer=>buffer instanceof ArrayBuffer||typeof SharedArrayBuffer!=='undefined'&&buffer instanceof SharedArrayBuffer||ArrayBuffer.isView(buffer)||buffer?._ck||buffer?.Pointer!==undefined;
  const isProps=props=>props!=null&&(props.PixelGeometry!==undefined||props.Flags!==undefined);
  const rowStride=(info,rowBytes)=>{const tight=info.width*info.bytesPerPixel,rb=rowBytes==null||rowBytes===0?tight:rowBytes;if(!Number.isInteger(rb)||rb<tight||rb%info.bytesPerPixel!==0)throw new RangeError('Row bytes must fit a pixel row and be a multiple of bytes per pixel.');const size=rb*info.height;if(!Number.isSafeInteger(size)||size>536870912)throw new RangeError('Raster allocation exceeds the 512 MiB byte limit.');return {rowBytes:rb,size};};
  function publicInfo(info,space){return new SKImageInfo(info.width,info.height,info.colorType,info.alphaType,space?SKColorSpace._fromNative(space._native,false):null);}
  function copySpace(space){return space&&SKColorSpace?SKColorSpace._fromNative(space.clone()):null;}
  SKSurface.Create=function(target,...args){
    if(target?.getContext||!(target instanceof SKImageInfo)&&!(target instanceof SKPixmap)&&!(target&&typeof target==='object'&&('Width'in target||'width'in target)&&('Height'in target||'height'in target)))return originalCreate.call(this,target,...args);
    let info=target,pixels=null,rowBytes=null,props=null,release=null,context=null;
    if(target instanceof SKPixmap){target.ThrowIfDisposed();info=target.Info;pixels=target.GetPixels();rowBytes=target.RowBytes;props=args.shift()??null;}
    else{
      if(isBuffer(args[0]))pixels=args.shift();
      else if(args[0]&&typeof args[0]==='object'&&!isProps(args[0])&&('pixels'in args[0]||'Pixels'in args[0]||'rowBytes'in args[0]||'RowBytes'in args[0])){const options=args.shift();pixels=options.pixels??options.Pixels??null;rowBytes=options.rowBytes??options.RowBytes??null;props=options.surfaceProperties??options.SurfaceProperties??options.props??null;release=options.releaseProc??options.ReleaseProc??null;context=options.context??options.Context??null;}
      if(typeof args[0]==='number')rowBytes=args.shift();
      if(typeof args[0]==='function'||pixels!=null&&args[0]===null&&args.length>1){release=args.shift();context=args.shift();}
      if(args.length)props=args.shift();
    }
    if(args.length)throw new TypeError('Unsupported raster surface overload.');
    props?.ThrowIfDisposed?.();const flags=value(props?.Flags??0),geometry=value(props?.PixelGeometry??0);
    if(!Number.isInteger(flags)||flags<0||!Number.isInteger(geometry)||geometry<0||geometry>4)throw new RangeError('Invalid surface properties.');
    const ii=normalize(info),{rowBytes:stride,size}=rowStride(ii,rowBytes),bridge=K.SkiaSharpNative?.Effects;
    if((flags||geometry)&&!bridge?.MakeRasterSurface)throw new api.SKNotSupportedError('Nondefault raster surface properties require the native surface extension.');
    let allocation=null,pointer=0,external=null,externalOwner=pixels,nativeSurface=null,surface=null,heldSpace=null;
    try{
      if(pixels?.Pointer!==undefined){pointer=pixels.Pointer;if(!Number.isInteger(pointer)||pointer<=0||pointer+size>K.HEAPU8.byteLength)throw new RangeError('Wasm pixel pointer is outside the live memory range.');}
      else if(pixels!=null){const bytes=byteView(pixels);if(bytes.byteLength<size)throw new RangeError('Pixel buffer is smaller than rowBytes × height.');if(bytes.buffer===K.HEAPU8.buffer)pointer=bytes.byteOffset;else external=bytes;}
      if(!pointer){allocation=K.Malloc(Uint8Array,size);pointer=allocation.byteOffset;allocation.toTypedArray().fill(0);if(external)allocation.toTypedArray().set(external.subarray(0,size));}
      nativeSurface=bridge?.MakeRasterSurface?bridge.MakeRasterSurface(ii,pointer,stride,flags,geometry):K.Surface._makeRasterDirect(ii,pointer,stride);
      if(!nativeSurface){if(allocation)K.Free(allocation);return null;}
      heldSpace=copySpace(ii.colorSpace);surface=new SKSurface(nativeSurface,'raster');nativeSurface=null;
      const actual=surface._native.imageInfo();if(actual.alphaType)ii.alphaType=actual.alphaType;actual.colorSpace?.delete?.();
      const getPixels=()=>{surface.ThrowIfDisposed();if(pointer+size>K.HEAPU8.byteLength)throw new Error('Pixel storage is no longer available.');return new Uint8Array(K.HEAPU8.buffer,pointer,size);};
      const syncOut=()=>{if(external){if(external.byteLength<size)throw new Error('Destination pixel buffer was detached.');external.set(getPixels());}};
      const baseFlush=surface.Flush.bind(surface),baseDispose=surface.Dispose.bind(surface);let released=false;
      Object.defineProperties(surface,{Info:{get(){this.ThrowIfDisposed();return publicInfo(ii,heldSpace);}},RowBytes:{get(){this.ThrowIfDisposed();return stride;}},Context:{value:null},PixelStorage:{value:external?'copied-js-buffer':allocation?'owned-wasm-buffer':'borrowed-wasm-buffer'},SurfaceProperties:{get(){this.ThrowIfDisposed();const p=bridge?.SurfaceProperties?.(this._native)??{Flags:flags,PixelGeometry:geometry};return api.SKSurfaceProperties?new api.SKSurfaceProperties(p.Flags,p.PixelGeometry):p;}}});
      surface.GetPixels=getPixels;
      surface.Flush=function(...args){this.ThrowIfDisposed();baseFlush(...args);syncOut();};
      surface.NotifyPixelsChanged=function(){this.ThrowIfDisposed();if(bridge?.NotifyContentWillChange)bridge.NotifyContentWillChange(this._native);if(external)getPixels().set(external.subarray(0,size));if(!bridge?.NotifyContentWillChange){const tight=ii.width*ii.bytesPerPixel,source=getPixels(),snapshot=new Uint8Array(tight*ii.height);for(let row=0;row<ii.height;row++)snapshot.set(source.subarray(row*stride,row*stride+tight),row*tight);this._native.getCanvas().writePixels(snapshot,ii.width,ii.height,0,0,ii.alphaType,ii.colorType,ii.colorSpace);}};
      surface.SyncPixelsFromBuffer=surface.NotifyPixelsChanged;
      surface.PeekPixels=function(destination){this.ThrowIfDisposed();this.Canvas._materialize();if(destination){destination.ThrowIfDisposed();destination._info=publicInfo(ii,heldSpace);destination._pixels=getPixels;destination._rowBytes=stride;destination._owner=this;return true;}const pixmap=Object.create(SKPixmap.prototype);Object.assign(pixmap,{_native:null,_ownsNative:false,_disposed:false,_info:publicInfo(ii,heldSpace),_pixels:getPixels,_rowBytes:stride,_owner:this});return pixmap;};
      surface.ReadPixels=function(info=this.Info,...args){this.ThrowIfDisposed();this.Canvas._materialize();return readPixels(this._native.getCanvas(),info,args);};
      surface.Dispose=function(){if(this.IsDisposed)return;let error;try{syncOut();}catch(e){error=e;}try{baseDispose();}finally{heldSpace?.Dispose();heldSpace=null;if(allocation){K.Free(allocation);allocation=null;}if(!released){released=true;if(release)release(externalOwner,context);}}if(error)throw error;};
      return surface;
    }catch(error){if(surface&&!surface.IsDisposed)surface.Dispose();else{nativeSurface?.dispose();heldSpace?.Dispose();if(allocation)K.Free(allocation);}throw error;}
  };
  function readPixels(canvas,info,args){
    let destination=null,rowBytes=null,x=0,y=0,asFloat=false;
    if(info instanceof SKPixmap){info.ThrowIfDisposed();destination=info.GetPixels();rowBytes=info.RowBytes;[x=0,y=0]=args;info=info.Info;}
    else if(isBuffer(args[0])){[destination,rowBytes,x=0,y=0]=args;}
    else{[x=0,y=0]=args;asFloat=value(info.ColorType??info.colorType)===value(K.ColorType.RGBA_F32);}
    const ii=normalize(info),{rowBytes:stride,size}=rowStride(ii,rowBytes);let destinationBytes=destination?.Pointer!==undefined?new Uint8Array(K.HEAPU8.buffer,destination.Pointer,size):destination?byteView(destination):null;
    if(destinationBytes&&destinationBytes.byteLength<size)throw new RangeError('Readback pixel buffer is smaller than rowBytes × height.');
    if(!Number.isInteger(x)||!Number.isInteger(y))throw new RangeError('Pixel offsets must be integers.');
    const borrowedOffset=destinationBytes?.buffer===K.HEAPU8.buffer?destinationBytes.byteOffset:null,allocation=K.Malloc(Uint8Array,size);try{if(borrowedOffset!==null)destinationBytes=new Uint8Array(K.HEAPU8.buffer,borrowedOffset,size);if(destinationBytes)allocation.toTypedArray().set(destinationBytes.subarray(0,size));else allocation.toTypedArray().fill(0);const ok=canvas.readPixels(x,y,ii,allocation,stride);if(!ok)return destination?false:null;const bytes=allocation.toTypedArray();if(destinationBytes){const tight=ii.width*ii.bytesPerPixel;for(let row=0;row<ii.height;row++)destinationBytes.set(bytes.subarray(row*stride,row*stride+tight),row*stride);return true;}const result=bytes.slice();return asFloat?new Float32Array(result.buffer,result.byteOffset,result.byteLength/4):result;}finally{K.Free(allocation);}
  }
  // CanvasKit's unallocated F32 readPixels path incorrectly treats byte length
  // as a float count. Always supply the precisely sized destination allocation.
  SKCanvas.prototype.ReadPixels=function(info,...args){this._check();this._materialize();return readPixels(this._native,info,args);};
  SKMaskFilter.TableMaxLength=256;
  const maskNative=()=>K.SkiaSharpNative?.Effects;
  SKMaskFilter.CreateTable=function(table){if(!table||table.length!==256||Array.from(table).some(v=>!Number.isInteger(v)||v<0||v>255))throw new RangeError('Mask tables require exactly 256 bytes.');if(!maskNative()?.MakeMaskTable)throw new api.SKNotSupportedError('Table mask filters require the native mask extension.');return SKMaskFilter._fromNative(maskNative().MakeMaskTable(table));};
  SKMaskFilter.CreateGamma=function(gamma){if(!Number.isFinite(gamma))throw new RangeError('Mask gamma must be finite.');if(!maskNative()?.MakeMaskGamma)throw new api.SKNotSupportedError('Gamma mask filters require the native mask extension.');return SKMaskFilter._fromNative(maskNative().MakeMaskGamma(gamma));};
  SKMaskFilter.CreateClip=function(min,max){if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||min>255||max<0||max>255)throw new RangeError('Mask clip limits must be bytes.');if(!maskNative()?.MakeMaskClip)throw new api.SKNotSupportedError('Clip mask filters require the native mask extension.');return SKMaskFilter._fromNative(maskNative().MakeMaskClip(min,max));};
  SKMaskFilter.CreateShader=function(shader){shader?.ThrowIfDisposed?.();if(!maskNative()?.MakeMaskShader)throw new api.SKNotSupportedError('Shader mask filters require the native mask extension.');return SKMaskFilter._fromNative(maskNative().MakeMaskShader(native(shader)));};
}
