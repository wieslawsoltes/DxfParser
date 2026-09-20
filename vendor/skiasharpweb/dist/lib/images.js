/** Skia image/data compatibility layer. Native codecs and pixels are supplied by CanvasKit. */
export function createImages(K, core) {
  const { SKObject, SKRect, SKImageInfo } = core;
  const unwrap = v => v?._native ?? v;
  const disposed = v => { if (v._disposed || v.IsDisposed) throw new Error(`${v.constructor.name} is disposed.`); };
  const nativeEnum = (v, group, fallback, aliases = {}) => {
    if (v == null) return group[fallback];
    if (typeof v === 'object' && 'value' in v) return v;
    if (typeof v === 'number') { const match=Object.values(group).find(x=>x?.value===v);if(!match)throw new RangeError(`Unsupported numeric enum value: ${v}`);return match; }
    const name = aliases[v] ?? v;
    const match = Object.keys(group).find(x => x.toLowerCase() === String(name).toLowerCase());
    if (!match) throw new RangeError(`Unsupported enum value: ${String(v)}`);
    return group[match];
  };
  const colorAliases = { Alpha8:'Alpha_8', Rgb565:'RGB_565', Rgba8888:'RGBA_8888', Bgra8888:'BGRA_8888', Rgba1010102:'RGBA_1010102', Rgb101010x:'RGB_101010x', Gray8:'Gray_8', RgbaF16:'RGBA_F16', RgbaF32:'RGBA_F32' };
  const ct = v => nativeEnum(v, K.ColorType, 'RGBA_8888', colorAliases);
  const at = v => nativeEnum(v, K.AlphaType, 'Premul');
  const bpp = v => { const t=ct(v); return t===K.ColorType.Alpha_8||t===K.ColorType.Gray_8?1:t===K.ColorType.RGB_565?2:t===K.ColorType.RGBA_F16?8:t===K.ColorType.RGBA_F32?16:4; };
  const infoNative = i => ({width:i.Width ?? i.width,height:i.Height ?? i.height,colorType:ct(i.ColorType ?? i.colorType),alphaType:at(i.AlphaType ?? i.alphaType),colorSpace:unwrap(i.ColorSpace ?? i.colorSpace) ?? K.ColorSpace.SRGB});
  const infoPublic = i => new SKImageInfo(i.width,i.height,i.colorType,i.alphaType, i.colorSpace ? SKColorSpace._fromNative(i.colorSpace, false) : null);
  const bytesOf = value => {
    if (value instanceof SKData) return value.AsSpan();
    if (value instanceof SKStream) return value.ReadToEnd();
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
    if (Array.isArray(value)) return Uint8Array.from(value);
    throw new TypeError('Expected SKData, a byte array, ArrayBuffer, or SKStream. Use an Async method for Blob/URL inputs.');
  };
  const rectArray = r => r.ToArray?.() ?? [r.Left ?? r[0],r.Top ?? r[1],r.Right ?? r[2],r.Bottom ?? r[3]];
  const matrixArray = m => m == null ? undefined : m.ToArray?.() ?? m.Values ?? m._native ?? m;
  const colorArray = c => c?.ToFloatArray?.() ?? (c && 'Red' in c ? new Float32Array([c.Red/255,c.Green/255,c.Blue/255,(c.Alpha??255)/255]) : typeof c === 'number' ? new Float32Array([((c>>>16)&255)/255,((c>>>8)&255)/255,(c&255)/255,((c>>>24)&255)/255]) : c);
  const writeStream = (s,data) => { if (s?.Write) return s.Write(data); if (s?.write) return s.write(data); throw new TypeError('Expected a writable stream with Write(bytes).'); };
  const positive = (n,name) => { if (!Number.isInteger(n)||n<=0) throw new RangeError(`${name} must be a positive integer.`); return n; };
  const assertInfo = i => { const n=infoNative(i); positive(n.width,'Width'); positive(n.height,'Height'); if (n.width*n.height*bpp(n.colorType)>512*1024*1024) throw new RangeError('Pixel allocation exceeds the 512 MiB safety limit.'); return n; };
  const cloneInfo = i => infoPublic(infoNative(i));

  class SKData extends SKObject {
    constructor(bytes = new Uint8Array()) { super(null); this._bytes = new Uint8Array(bytesOf(bytes)); this._disposed=false; }
    static CreateCopy(bytes, length) { const b=bytesOf(bytes); return new SKData(length==null?b:b.subarray(0,length)); }
    static CreateUninitialized(size) { return SKData.Create(size); }
    static CreateSubset(data, offset, length) { const b=bytesOf(data); if(offset<0||length<0||offset+length>b.length) return null; return new SKData(b.subarray(offset,offset+length)); }
    static Create(stream, length) { if(typeof stream==='number'&&length==null){ if(!Number.isInteger(stream)||stream<0)throw new RangeError('Invalid data size.');return new SKData(new Uint8Array(stream));} const b=stream instanceof SKStream&&length!=null?stream.Read(length):bytesOf(stream);return new SKData(length==null?b:b.subarray(0,length)); }
    static get Empty() { return new SKData(); }
    static async FromUrl(url, options) { const r=await fetch(url,options);if(!r.ok)throw new Error(`Image/data request failed: HTTP ${r.status}`);return new SKData(await r.arrayBuffer()); }
    get Size() { disposed(this);return this._bytes.byteLength; }
    get IsEmpty() { return this.Size===0; }
    AsSpan() { disposed(this); return this._bytes; }
    ToArray() { return this.AsSpan().slice(); }
    AsStream() { return new SKMemoryStream(this.AsSpan()); }
    SaveTo(stream) { return writeStream(stream,this.AsSpan()); }
    ToBlob(type='application/octet-stream') { return new Blob([this.AsSpan()],{type}); }
    Dispose() { if(this._disposed)return;this._disposed=true;this._bytes=new Uint8Array();super.Dispose?.(); }
  }

  class SKStream extends SKObject {
    constructor(bytes=new Uint8Array()) { super(null); this._bytes=new Uint8Array(bytesOf(bytes));this._position=0;this._disposed=false; }
    get Length(){disposed(this);return this._bytes.length;} get Position(){disposed(this);return this._position;}
    set Position(v){if(!this.Seek(v))throw new RangeError('Stream position is out of bounds.');}
    get HasLength(){return true;} get HasPosition(){return true;} get IsAtEnd(){return this.Position>=this.Length;}
    Read(bufferOrCount=this.Length-this.Position, count){disposed(this);const n=Math.min(typeof bufferOrCount==='number'?bufferOrCount:count??bufferOrCount.length,this.Length-this._position);if(n<0)throw new RangeError('Read size cannot be negative.');const b=this._bytes.subarray(this._position,this._position+n);this._position+=n;if(typeof bufferOrCount==='number'||bufferOrCount==null)return b.slice();bytesOf(bufferOrCount).set(b);return n;}
    ReadByte(){return this.IsAtEnd?-1:this._bytes[this._position++];}
    ReadToEnd(){return this.Read(this.Length-this.Position);}
    Peek(count){disposed(this);return this._bytes.slice(this._position,this._position+count);}
    Seek(position){disposed(this);if(!Number.isInteger(position)||position<0||position>this.Length)return false;this._position=position;return true;}
    Move(offset){return this.Seek(this.Position+offset);} Rewind(){return this.Seek(0);} Duplicate(){return new SKMemoryStream(this._bytes);} Fork(){const s=this.Duplicate();s.Position=this.Position;return s;}
    Dispose(){if(this._disposed)return;this._disposed=true;this._bytes=new Uint8Array();super.Dispose?.();}
  }
  class SKMemoryStream extends SKStream { SetMemory(bytes){disposed(this);this._bytes=new Uint8Array(bytesOf(bytes));this._position=0;} static FromData(data){return new SKMemoryStream(data);} }
  class SKDynamicMemoryWStream extends SKObject {
    constructor(){super(null);this._parts=[];this._length=0;this._disposed=false;}
    get BytesWritten(){disposed(this);return this._length;}
    Write(bytes,size){disposed(this);const b=bytesOf(bytes);const part=b.slice(0,size??b.length);this._parts.push(part);this._length+=part.length;return true;}
    WriteByte(value){return this.Write(Uint8Array.of(value));} WriteText(text){return this.Write(new TextEncoder().encode(text));}
    Flush(){disposed(this);return true;}
    CopyToData(){disposed(this);const b=new Uint8Array(this._length);let p=0;for(const c of this._parts){b.set(c,p);p+=c.length;}return new SKData(b);}
    DetachAsData(){const d=this.CopyToData();this.Reset();return d;}
    DetachAsStream(){const d=this.DetachAsData();try{return d.AsStream();}finally{d.Dispose();}}
    WriteToStream(stream){const d=this.CopyToData();try{return d.SaveTo(stream);}finally{d.Dispose();}}
    Reset(){disposed(this);this._parts=[];this._length=0;}
    Dispose(){if(this._disposed)return;this._disposed=true;this._parts=[];super.Dispose?.();}
  }

  class SKColorSpace extends SKObject {
    constructor(native=K.ColorSpace.SRGB, owns=false, name=null){super(native,owns);this._spaceName=name;}
    static _fromNative(native,owns=true){return native?new SKColorSpace(native,owns):null;}
    static CreateSrgb(){return new SKColorSpace(K.ColorSpace.SRGB,false,'sRGB');}
    static CreateDisplayP3(){return new SKColorSpace(K.ColorSpace.DISPLAY_P3,false,'Display P3');}
    static CreateAdobeRgb(){return new SKColorSpace(K.ColorSpace.ADOBE_RGB,false,'Adobe RGB');}
    static CreateSrgbLinear(){throw new Error('Linear-sRGB construction is not exposed by this CanvasKit build.');}
    static CreateIcc(){throw new Error('Custom ICC profile construction is not exposed by this CanvasKit build. Decoded image profiles are preserved by Skia.');}
    static CreateRgb(){throw new Error('Custom RGB transfer functions are not exposed by this CanvasKit build.');}
    static Equal(a,b){return a===b || !!(a&&b&&K.ColorSpace.Equals(unwrap(a),unwrap(b)));}
    Equals(other){return SKColorSpace.Equal(this,other);}
    get IsSrgb(){disposed(this);return K.ColorSpace.Equals(this._native,K.ColorSpace.SRGB);}
    get GammaIsLinear(){disposed(this);return this.IsSrgb||K.ColorSpace.Equals(this._native,K.ColorSpace.DISPLAY_P3)||K.ColorSpace.Equals(this._native,K.ColorSpace.ADOBE_RGB)?false:null;}
    get GammaIsCloseToSrgb(){return this.IsSrgb || K.ColorSpace.Equals(this._native,K.ColorSpace.DISPLAY_P3);}
  }
  const SKEncodedImageFormat=Object.freeze({...core.SKEncodedImageFormat,Bmp:'Bmp',Gif:'Gif',Ico:'Ico',Jpeg:K.ImageFormat.JPEG,Png:K.ImageFormat.PNG,Wbmp:'Wbmp',Webp:K.ImageFormat.WEBP,Pkm:'Pkm',Ktx:'Ktx',Astc:'Astc',Dng:'Dng',Heif:'Heif',Avif:'Avif',Jpegxl:'Jpegxl'});
  const encodeFormat = v => nativeEnum(v,K.ImageFormat,'PNG',{Png:'PNG',Jpeg:'JPEG',Webp:'WEBP','image/png':'PNG','image/jpeg':'JPEG','image/webp':'WEBP'});
  function pixelsRead(native,info,destination,rowBytes,srcX=0,srcY=0){const n=assertInfo(info),rb=rowBytes??n.width*bpp(n.colorType);if(!Number.isInteger(rb)||rb<n.width*bpp(n.colorType))throw new RangeError('Row bytes is smaller than a pixel row or is not an integer.');const size=rb*n.height;if(size>512*1024*1024)throw new RangeError('Pixel allocation exceeds 512 MiB.');const mem=K.Malloc(Uint8Array,size);try{const ok=native.readPixels(srcX,srcY,n,mem,rb);if(!ok)return destination==null?null:false;const b=mem.toTypedArray().slice();if(destination!=null){const d=bytesOf(destination);if(d.length<size)throw new RangeError('Destination pixel buffer is too small.');d.set(b);return true;}return b;}finally{K.Free(mem);}}
  const defaultReadInfo=(w,h)=>new SKImageInfo(w,h,K.ColorType.RGBA_8888,K.AlphaType.Unpremul,SKColorSpace.CreateSrgb());
  class SKImage extends SKObject {
    constructor(native){if(!native)throw new TypeError('Use SKImage.FromEncodedData, FromPixels, or FromBitmap to create an image.');super(native);}
    static _fromNative(native){return native?new SKImage(native):null;}
    static FromEncodedData(data,subset){const native=K.MakeImageFromEncoded(bytesOf(data));const image=SKImage._fromNative(native);if(!image||!subset)return image;try{return image.Subset(subset);}finally{image.Dispose();}}
    static async FromEncodedDataAsync(data,options){if(typeof data==='string'||data instanceof URL){const d=await SKData.FromUrl(data,options);try{return SKImage.FromEncodedData(d);}finally{d.Dispose();}}if(typeof Blob!=='undefined'&&data instanceof Blob)data=await data.arrayBuffer();return SKImage.FromEncodedData(data);}
    static FromBitmap(bitmap){disposed(bitmap);return SKImage._fromNative(bitmap._surface?.makeImageSnapshot());}
    static FromPixels(info,pixels,rowBytes){if(info instanceof SKPixmap){pixels=info.GetPixels();rowBytes=info.RowBytes;info=info.Info;}const n=assertInfo(info),rb=rowBytes??n.width*bpp(n.colorType);const b=bytesOf(pixels);if(rb<n.width*bpp(n.colorType)||b.length<rb*n.height)throw new RangeError('Pixel buffer/stride is too small.');return SKImage._fromNative(K.MakeImage(n,b,rb));}
    static FromPixelCopy(...args){return SKImage.FromPixels(...args);}
    static FromCanvasImageSource(source){return SKImage._fromNative(K.MakeImageFromCanvasImageSource(source));}
    get Width(){disposed(this);return this._native.width();}get Height(){disposed(this);return this._native.height();}
    get Info(){disposed(this);return infoPublic(this._native.getImageInfo());}
    get ColorType(){return this.Info.ColorType;}get AlphaType(){return this.Info.AlphaType;}
    get ColorSpace(){disposed(this);return SKColorSpace._fromNative(this._native.getColorSpace(),true);}
    get IsOpaque(){return this.AlphaType===K.AlphaType.Opaque;}
    Encode(format='Png',quality=100){disposed(this);if(!Number.isFinite(quality)||quality<0||quality>100)throw new RangeError('Encoding quality must be between 0 and 100.');const b=this._native.encodeToBytes(encodeFormat(format),quality);if(!b)throw new Error(`Image encoder ${String(format)} is unavailable or encoding failed.`);return new SKData(b);}
    ReadPixels(info=defaultReadInfo(this.Width,this.Height),pixels=null,rowBytes=null,srcX=0,srcY=0){disposed(this);if(info instanceof SKPixmap){const p=info;return pixelsRead(this._native,p.Info,p.GetPixels(),p.RowBytes,pixels??0,rowBytes??0);}return pixelsRead(this._native,info,pixels,rowBytes,srcX,srcY);}
    PeekPixels(){const info=defaultReadInfo(this.Width,this.Height);return new SKPixmap(info,this.ReadPixels(info));}
    ToRasterImage(){const p=this.PeekPixels();try{return SKImage.FromPixels(p);}finally{p.Dispose();}}
    Subset(rect){disposed(this);const a=rectArray(rect).map(Math.trunc),[l,t,r,b]=a;if(l<0||t<0||r>this.Width||b>this.Height||r<=l||b<=t)return null;const info=defaultReadInfo(r-l,b-t),p=this.ReadPixels(info,null,null,l,t);return p?SKImage.FromPixels(info,p):null;}
    Resize(info,quality='High'){const n=assertInfo(info),surface=K.MakeSurface(n.width,n.height);if(!surface)return null;try{drawResized(surface.getCanvas(),this._native,[0,0,this.Width,this.Height],[0,0,n.width,n.height],quality);surface.flush();const snap=surface.makeImageSnapshot();try{const b=pixelsRead(snap,info);return b?SKImage.FromPixels(info,b):null;}finally{snap.delete();}}finally{surface.dispose();}}
    ScalePixels(destination,quality='High'){const image=this.Resize(destination.Info,quality);if(!image)return false;try{return image.ReadPixels(destination.Info,destination.GetPixels(),destination.RowBytes);}finally{image.Dispose();}}
    ToShader(tileX='Clamp',tileY='Clamp',sampling=null,localMatrix=null){disposed(this);if(sampling && (sampling.ToArray || sampling.Values || Array.isArray(sampling)||sampling instanceof Float32Array)){localMatrix=sampling;sampling=null;}const tx=nativeEnum(tileX,K.TileMode,'Clamp'),ty=nativeEnum(tileY,K.TileMode,'Clamp');const cubic=sampling?.Cubic??sampling?.cubic;const shader=cubic?this._native.makeShaderCubic(tx,ty,cubic.B,cubic.C,matrixArray(localMatrix)):this._native.makeShaderOptions(tx,ty,nativeEnum(sampling?.Filter??sampling?.filter,K.FilterMode,'Linear'),nativeEnum(sampling?.Mipmap??sampling?.mipmap,K.MipmapMode,'None'),matrixArray(localMatrix));const Wrapper=core.SKShader;return Wrapper?Wrapper._fromNative?.(shader)??new Wrapper(shader):new SKObject(shader);}
    WithDefaultMipmaps(){disposed(this);return SKImage._fromNative(this._native.makeCopyWithDefaultMipmaps());}
  }
  function drawResized(canvas,image,src,dst,quality){const value=quality?.value ?? quality;const cubic=quality?.Cubic??quality?.cubic;if(cubic||value==='High'||value===3)canvas.drawImageRectCubic(image,src,dst,cubic?.B??1/3,cubic?.C??1/3,null);else canvas.drawImageRectOptions(image,src,dst,nativeEnum(quality?.Filter??quality?.filter??((value==='None'||value===0)?'Nearest':'Linear'),K.FilterMode,'Linear'),K.MipmapMode.None,null);}

  class SKBitmap extends SKObject {
    constructor(infoOrWidth=0,height=0,colorType,alphaType){super(null);this._surface=null;this._memory=null;this._snapshot=null;this._info=new SKImageInfo(0,0);this._rowBytes=0;this._immutable=false;this._disposed=false;if(typeof infoOrWidth==='object')this.AllocPixels(infoOrWidth);else if(infoOrWidth>0&&height>0)this.AllocPixels(new SKImageInfo(infoOrWidth,height,colorType,alphaType));}
    get _native(){if(!this._surface)return null;this._surface.flush();this._snapshot?.delete();this._snapshot=this._surface.makeImageSnapshot();return this._snapshot;}
    set _native(value){this._initialNative=value;}
    static Decode(data,info){const image=SKImage.FromEncodedData(data);if(!image)return null;try{const bitmap=new SKBitmap(info??defaultReadInfo(image.Width,image.Height));if(!bitmap._surface)return null;if(info&&(info.Width!==image.Width||info.Height!==image.Height)){const scaled=image.Resize(info);if(!scaled){bitmap.Dispose();return null;}try{bitmap._surface.getCanvas().drawImage(scaled._native,0,0);}finally{scaled.Dispose();}}else bitmap._surface.getCanvas().drawImage(image._native,0,0);return bitmap;}finally{image.Dispose();}}
    static async DecodeAsync(data,info){const image=await SKImage.FromEncodedDataAsync(data);if(!image)return null;try{const b=new SKBitmap(info??defaultReadInfo(image.Width,image.Height));drawResized(b._surface.getCanvas(),image._native,[0,0,image.Width,image.Height],[0,0,b.Width,b.Height],'High');return b;}finally{image.Dispose();}}
    static FromImage(image){const b=new SKBitmap(defaultReadInfo(image.Width,image.Height));b._surface.getCanvas().drawImage(image._native,0,0);return b;}
    static DecodeBounds(data){const c=SKCodec.Create(data);if(!c)return new SKImageInfo(0,0);try{return c.Info;}finally{c.Dispose();}}
    get Width(){return this._info.Width;}get Height(){return this._info.Height;}get Info(){return cloneInfo(this._info);}get RowBytes(){return this._rowBytes;}get ByteCount(){return this._rowBytes*this.Height;}get BytesPerPixel(){return bpp(this._info.ColorType);}
    get ColorType(){return this._info.ColorType;}get AlphaType(){return this._info.AlphaType;}get ColorSpace(){return this._info.ColorSpace;}get IsEmpty(){return !this._surface;}get IsNull(){return !this._surface;}get IsImmutable(){return this._immutable;}get IsOpaque(){return at(this.AlphaType)===K.AlphaType.Opaque;}
    _clearAllocation(){this._snapshot?.delete();this._snapshot=null;this._surface?.dispose();this._surface=null;if(this._memory){K.Free(this._memory);this._memory=null;}}
    AllocPixels(info,rowBytes){disposed(this);if(this._immutable)throw new Error('Bitmap is immutable.');const n=assertInfo(info),rb=rowBytes??n.width*bpp(n.colorType);if(!Number.isInteger(rb)||rb<n.width*bpp(n.colorType)||rb*n.height>512*1024*1024)throw new RangeError('Invalid row bytes or allocation exceeds 512 MiB.');this._clearAllocation();this._memory=K.Malloc(Uint8Array,rb*n.height);this._memory.toTypedArray().fill(0);this._surface=K.MakeRasterDirectSurface(n,this._memory,rb);if(!this._surface){K.Free(this._memory);this._memory=null;throw new Error('CanvasKit cannot allocate a mutable bitmap with this color/alpha format.');}this._info=cloneInfo(info);this._rowBytes=rb;return true;}
    TryAllocPixels(info,rowBytes){try{return this.AllocPixels(info,rowBytes);}catch{return false;}}
    GetPixels(){disposed(this);this._surface?.flush();return this._memory?.toTypedArray()??new Uint8Array();}
    GetPixelSpan(){return this.GetPixels();}get Bytes(){return this.GetPixels().slice();}
    SetPixels(pixels){disposed(this);if(this._immutable)throw new Error('Bitmap is immutable.');const b=bytesOf(pixels);if(b.length<this.ByteCount)throw new RangeError('Pixel buffer is too small.');this.GetPixels().set(b.subarray(0,this.ByteCount));this.NotifyPixelsChanged();}
    NotifyPixelsChanged(){disposed(this);if(!this._surface)return;this._snapshot?.delete();this._snapshot=null;const n=infoNative(this._info),tight=n.width*bpp(n.colorType),src=this.GetPixels();let p=src;if(tight!==this.RowBytes){p=new Uint8Array(tight*this.Height);for(let y=0;y<this.Height;y++)p.set(src.subarray(y*this.RowBytes,y*this.RowBytes+tight),y*tight);}if(!this._surface.getCanvas().writePixels(p,n.width,n.height,0,0,n.alphaType,n.colorType,n.colorSpace))throw new Error('Bitmap pixel update failed.');}
    PeekPixels(){disposed(this);if(!this._surface)return null;return new SKPixmap(this.Info,()=>this.GetPixels(),this.RowBytes,this);}
    ReadPixels(info,pixels,rowBytes,srcX=0,srcY=0){const image=SKImage.FromBitmap(this);try{return image.ReadPixels(info,pixels,rowBytes,srcX,srcY);}finally{image.Dispose();}}
    GetPixel(x,y){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=this.Width||y>=this.Height)throw new RangeError('Pixel coordinates are outside the bitmap.');const p=pixelsRead(this._surface.getCanvas(),defaultReadInfo(1,1),null,null,x,y);return new core.SKColor(p[0],p[1],p[2],p[3]);}
    SetPixel(x,y,color){disposed(this);if(this._immutable)throw new Error('Bitmap is immutable.');if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=this.Width||y>=this.Height)throw new RangeError('Pixel coordinates are outside the bitmap.');const c=colorArray(color),p=Uint8Array.from(c,v=>Math.round(Math.max(0,Math.min(1,v))*255));this._surface.getCanvas().writePixels(p,1,1,x,y,K.AlphaType.Unpremul,K.ColorType.RGBA_8888,K.ColorSpace.SRGB);}
    get Pixels(){const b=pixelsRead(this._surface.getCanvas(),defaultReadInfo(this.Width,this.Height)),result=[];for(let i=0;i<b.length;i+=4)result.push(new core.SKColor(b[i],b[i+1],b[i+2],b[i+3]));return result;}
    set Pixels(colors){if(colors.length!==this.Width*this.Height)throw new RangeError('Pixel color count does not match bitmap dimensions.');if(this._immutable)throw new Error('Bitmap is immutable.');const b=new Uint8Array(colors.length*4);colors.forEach((c,i)=>b.set(Array.from(colorArray(c),v=>Math.round(v*255)),i*4));this._surface.getCanvas().writePixels(b,this.Width,this.Height,0,0,K.AlphaType.Unpremul,K.ColorType.RGBA_8888,K.ColorSpace.SRGB);}
    Erase(color,rect){disposed(this);if(this._immutable)throw new Error('Bitmap is immutable.');const c=this._surface.getCanvas();if(rect){c.save();c.clipRect(rectArray(rect),K.ClipOp.Intersect,false);c.clear(colorArray(color));c.restore();}else c.clear(colorArray(color));}
    Copy(colorType=this.ColorType){const b=new SKBitmap(new SKImageInfo(this.Width,this.Height,colorType,this.AlphaType,this.ColorSpace));const img=SKImage.FromBitmap(this);try{b._surface.getCanvas().drawImage(img._native,0,0);return b;}finally{img.Dispose();}}
    CopyTo(destination,colorType=this.ColorType){const copy=this.Copy(colorType);try{destination.AllocPixels(copy.Info,copy.RowBytes);destination.SetPixels(copy.GetPixels());return true;}finally{copy.Dispose();}}
    ExtractSubset(destinationOrRect,rect){const image=SKImage.FromBitmap(this);try{const sub=image.Subset(rect??destinationOrRect);if(!sub)return rect?false:null;try{const b=SKBitmap.FromImage(sub);if(!rect)return b;try{return b.CopyTo(destinationOrRect);}finally{b.Dispose();}}finally{sub.Dispose();}}finally{image.Dispose();}}
    Resize(info,quality='High'){const image=SKImage.FromBitmap(this);try{const resized=image.Resize(info,quality);if(!resized)return null;try{const result=new SKBitmap(info);result._surface.getCanvas().drawImage(resized._native,0,0);return result;}finally{resized.Dispose();}}finally{image.Dispose();}}
    ScalePixels(destination,quality='High'){const p=destination instanceof SKBitmap?destination.PeekPixels():destination;const image=SKImage.FromBitmap(this);try{const ok=image.ScalePixels(p,quality);if(ok&&destination instanceof SKBitmap)destination.NotifyPixelsChanged();return ok;}finally{image.Dispose();if(destination instanceof SKBitmap)p.Dispose();}}
    Encode(format,quality,streamQuality){if(format?.Write||format?.write){const d=this.Encode(quality,streamQuality);try{return d.SaveTo(format);}finally{d.Dispose();}}const i=SKImage.FromBitmap(this);try{return i.Encode(format,quality);}finally{i.Dispose();}}
    ToShader(...args){const i=SKImage.FromBitmap(this);try{return i.ToShader(...args);}finally{i.Dispose();}}
    SetImmutable(){this._immutable=true;}Reset(){disposed(this);if(this._immutable)throw new Error('Bitmap is immutable.');this._clearAllocation();this._info=new SKImageInfo(0,0);this._rowBytes=0;}
    Dispose(){if(this._disposed)return;this._clearAllocation();this._disposed=true;super.Dispose?.();}
  }

  class SKPixmap extends SKObject {
    constructor(info,pixels,rowBytes,owner=null){super(null);this._info=cloneInfo(info);this._pixels=typeof pixels==='function'?pixels:bytesOf(pixels);this._rowBytes=rowBytes??this._info.Width*bpp(this._info.ColorType);this._owner=owner;this._disposed=false;if(this._rowBytes<this.Width*bpp(this.ColorType)||this.GetPixels().length<this._rowBytes*this.Height)throw new RangeError('Pixmap pixel buffer/stride is too small.');}
    get Info(){return cloneInfo(this._info);}get Width(){return this._info.Width;}get Height(){return this._info.Height;}get RowBytes(){return this._rowBytes;}get BytesSize(){return this.RowBytes*this.Height;}get ColorType(){return this._info.ColorType;}get AlphaType(){return this._info.AlphaType;}get ColorSpace(){return this._info.ColorSpace;}
    GetPixels(){disposed(this);if(this._owner)disposed(this._owner);return typeof this._pixels==='function'?this._pixels():this._pixels;}
    GetPixelSpan(){return this.GetPixels();}
    GetPixelColor(x,y){const image=SKImage.FromPixels(this);try{const p=image.ReadPixels(defaultReadInfo(1,1),null,null,x,y);if(!p)throw new RangeError('Pixel coordinates are outside the pixmap.');return new core.SKColor(p[0],p[1],p[2],p[3]);}finally{image.Dispose();}}
    ReadPixels(...args){const image=SKImage.FromPixels(this);try{return image.ReadPixels(...args);}finally{image.Dispose();}}
    ScalePixels(destination,quality){const image=SKImage.FromPixels(this);try{return image.ScalePixels(destination,quality);}finally{image.Dispose();}}
    Encode(format,quality,streamQuality){if(format?.Write||format?.write){const d=this.Encode(quality,streamQuality);try{return d.SaveTo(format);}finally{d.Dispose();}}const image=SKImage.FromPixels(this);try{return image.Encode(format,quality);}finally{image.Dispose();}}
    Erase(color,subset){const bitmap=new SKBitmap();bitmap.AllocPixels(this.Info,this.RowBytes);try{bitmap.SetPixels(this.GetPixels());bitmap.Erase(color,subset);this.GetPixels().set(bitmap.GetPixels());this._owner?.NotifyPixelsChanged();return true;}finally{bitmap.Dispose();}}
    Dispose(){if(this._disposed)return;this._disposed=true;this._pixels=null;this._owner=null;super.Dispose?.();}
  }

  function sniffFormat(b){if(b[0]===137&&b[1]===80)return 'Png';if(b[0]===255&&b[1]===216)return 'Jpeg';const s=String.fromCharCode(...b.subarray(0,12));if(s.startsWith('GIF8'))return 'Gif';if(s.startsWith('RIFF')&&s.endsWith('WEBP'))return 'Webp';if(s.startsWith('BM'))return 'Bmp';if(b[0]===0&&b[1]===0&&b[2]===1&&b[3]===0)return 'Ico';return 'Unknown';}
  const SKCodecResult=Object.freeze({Success:'Success',IncompleteInput:'IncompleteInput',ErrorInInput:'ErrorInInput',InvalidConversion:'InvalidConversion',InvalidScale:'InvalidScale',InvalidParameters:'InvalidParameters',InvalidInput:'InvalidInput',CouldNotRewind:'CouldNotRewind',InternalError:'InternalError',Unimplemented:'Unimplemented'});
  class SKCodec extends SKObject {
    constructor(bytes,native,image){super(native);this._bytes=bytes;this._image=image;this._frameIndex=0;this._frameInfo=null;}
    static Create(data){const bytes=new Uint8Array(bytesOf(data));const animated=K.MakeAnimatedImageFromEncoded?.(bytes);if(animated)return new SKCodec(bytes,animated,null);const image=K.MakeImageFromEncoded(bytes);return image?new SKCodec(bytes,null,image):null;}
    get Info(){disposed(this);return defaultReadInfo(this._native?.width()??this._image.width(),this._native?.height()??this._image.height());}
    get EncodedFormat(){return sniffFormat(this._bytes);}get FrameCount(){disposed(this);return this._native?.getFrameCount()??1;}get RepetitionCount(){disposed(this);return this._native?.getRepetitionCount()??0;}
    get FrameInfo(){disposed(this);if(!this._frameInfo){const infos=[];const a=K.MakeAnimatedImageFromEncoded?.(this._bytes);if(a){try{for(let i=0;i<a.getFrameCount();i++){infos.push(Object.freeze({Duration:a.currentFrameDuration(),FullyReceived:null,RequiredFrame:null}));if(i+1<a.getFrameCount())a.decodeNextFrame();}}finally{a.delete();}}else infos.push(Object.freeze({Duration:0,FullyReceived:null,RequiredFrame:null}));this._frameInfo=infos;}return this._frameInfo.slice();}
    GetImage(frameIndex=0){disposed(this);if(!Number.isInteger(frameIndex)||frameIndex<0||frameIndex>=this.FrameCount)throw new RangeError('Frame index is outside the animation.');if(!this._native)return SKImage.FromEncodedData(this._bytes);if(frameIndex<this._frameIndex){this._native.reset();this._frameIndex=0;}while(this._frameIndex<frameIndex){if(this._native.decodeNextFrame()<0)return null;this._frameIndex++;}return SKImage._fromNative(this._native.makeImageAtCurrentFrame());}
    GetPixels(info,pixels,rowBytes,options={}){if(typeof rowBytes==='object'){options=rowBytes;rowBytes=null;}const image=this.GetImage(options.FrameIndex??options.frameIndex??0);if(!image)return SKCodecResult.IncompleteInput;try{if(info.Width!==image.Width||info.Height!==image.Height){const scaled=image.Resize(info);if(!scaled)return SKCodecResult.InvalidScale;try{return scaled.ReadPixels(info,pixels,rowBytes)?SKCodecResult.Success:SKCodecResult.InvalidConversion;}finally{scaled.Dispose();}}return image.ReadPixels(info,pixels,rowBytes)?SKCodecResult.Success:SKCodecResult.InvalidConversion;}finally{image.Dispose();}}
    GetScaledDimensions(scale){if(!Number.isFinite(scale)||scale<=0)throw new RangeError('Scale must be positive.');const i=this.Info;return core.SKSizeI?new core.SKSizeI(Math.max(1,Math.round(i.Width*scale)),Math.max(1,Math.round(i.Height*scale))):{Width:Math.max(1,Math.round(i.Width*scale)),Height:Math.max(1,Math.round(i.Height*scale))};}
    Dispose(){this._image?.delete();this._image=null;super.Dispose();}
  }
  const SKVertexMode=Object.freeze({Triangles:K.VertexMode.Triangles,TriangleStrip:K.VertexMode.TrianglesStrip??K.VertexMode.TriangleStrip,TriangleFan:K.VertexMode.TriangleFan??K.VertexMode.TrianglesFan});
  const pointsArray=p=>p==null?null:typeof p[0]==='number'||ArrayBuffer.isView(p)?p:p.flatMap(v=>[v.X??v.x,v.Y??v.y]);
  class SKVertices extends SKObject {
    static _fromNative(native){return native?new SKVertices(native):null;}
    static CreateCopy(mode,positions,textureCoordinates=null,colors=null,indices=null){const p=pointsArray(positions);if(!p||p.length<6||p.length%2)throw new RangeError('Vertices need at least three 2D positions.');let c=null;if(colors){if(colors instanceof Float32Array)c=colors;else c=new Float32Array(Array.from(colors).flatMap(v=>Array.from(colorArray(v))));if(c.length!==p.length*2)throw new RangeError('One color is required per vertex.');}const t=pointsArray(textureCoordinates);if(t&&t.length!==p.length)throw new RangeError('Texture coordinate count does not match positions.');if(indices&&Array.from(indices).some(i=>!Number.isInteger(i)||i<0||i>=p.length/2||i>65535))throw new RangeError('Vertex index is out of bounds.');return new SKVertices(K.MakeVertices(nativeEnum(mode,K.VertexMode,'Triangles',{TriangleStrip:'TrianglesStrip',TriangleFan:'TriangleFan'}),p,t,c,indices?Array.from(indices):null,false));}
    get Bounds(){disposed(this);return new SKRect(...this._native.bounds());}get UniqueId(){disposed(this);return this._native.uniqueID();}
  }
  // Raster PDF export is intentionally explicit: page pixels are embedded losslessly as RGB.
  // This is a usable document writer, but is not native vector PDF, tagged PDF, or PDF/A.
  const textBytes=s=>new TextEncoder().encode(s);
  const pdfText=value=>{let result='FEFF';for(let i=0;i<String(value).length;i++)result+=String(value).charCodeAt(i).toString(16).padStart(4,'0');return `<${result}>`;};
  function makeRasterPdf(pages,metadata){
    const objects=[null,null],pageIds=[];
    for(const page of pages){
      const pageId=objects.length+1, imageId=pageId+1, contentId=pageId+2;pageIds.push(pageId);
      objects.push(textBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
      objects.push([textBytes(`<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${page.pixels.length} >>\nstream\n`),page.pixels,textBytes('\nendstream')]);
      const commands=textBytes(`q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q\n`);
      objects.push([textBytes(`<< /Length ${commands.length} >>\nstream\n`),commands,textBytes('endstream')]);
    }
    objects[0]=textBytes('<< /Type /Catalog /Pages 2 0 R >>');objects[1]=textBytes(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(n=>`${n} 0 R`).join(' ')}] >>`);
    const metadataEntries=['Title','Author','Subject','Keywords','Creator'].filter(k=>metadata[k]!=null).map(k=>`/${k} ${pdfText(metadata[k])}`);
    metadataEntries.push(`/Producer ${pdfText('SkiaSharp Web raster PDF writer')}`);
    const metadataId=objects.length+1;objects.push(textBytes(`<< ${metadataEntries.join(' ')} >>`));
    const parts=[textBytes('%PDF-1.4\n% Raster PDF\n')],offsets=[0];let offset=parts[0].length;
    for(let i=0;i<objects.length;i++){offsets.push(offset);const entry=[textBytes(`${i+1} 0 obj\n`),...(Array.isArray(objects[i])?objects[i]:[objects[i]]),textBytes('\nendobj\n')];for(const p of entry){parts.push(p);offset+=p.length;}}
    const xref=offset,tail=textBytes(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info ${metadataId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);parts.push(tail);offset+=tail.length;
    const result=new Uint8Array(offset);let pos=0;for(const p of parts){result.set(p,pos);pos+=p.length;}return new SKData(result);
  }
  class SKDocument extends SKObject {
    constructor(stream=null,metadata={}){super(null);if(typeof metadata==='number')metadata={RasterDpi:metadata};this._stream=stream;this._metadata={...metadata};this._dpi=metadata.RasterDpi??144;if(!Number.isFinite(this._dpi)||this._dpi<=0||this._dpi>2400)throw new RangeError('PDF raster DPI must be in (0, 2400].');this._pages=[];this._pageSurface=null;this._pageCanvas=null;this._closed=false;this._data=null;}
    static CreatePdf(stream=null,metadata={}){if(stream&&!stream.Write&&!stream.write){metadata=stream;stream=null;}if(metadata?.PdfA)throw new Error('PDF/A conformance is not supported by the raster PDF writer.');return new SKDocument(stream,metadata);}
    static CreateXps(){throw new Error('XPS export is not supported by this CanvasKit build.');}
    get IsRasterDocument(){return true;}get RasterDpi(){return this._dpi;}get PageCount(){return this._pages.length;}
    BeginPage(width,height,content=null){disposed(this);if(this._closed)throw new Error('PDF document is closed.');if(this._pageSurface)throw new Error('End the current page before beginning another page.');if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new RangeError('Page dimensions must be positive finite point values.');if(!core.SKCanvas)throw new Error('The SKCanvas module must be initialized before creating PDF pages.');const pixelWidth=Math.ceil(width*this._dpi/72),pixelHeight=Math.ceil(height*this._dpi/72);assertInfo(new SKImageInfo(pixelWidth,pixelHeight));this._pageSurface=K.MakeSurface(pixelWidth,pixelHeight);if(!this._pageSurface)throw new Error('PDF page raster allocation failed.');this._pageDimensions={width,height,pixelWidth,pixelHeight};const native=this._pageSurface.getCanvas();native.clear(new Float32Array([1,1,1,1]));native.scale(this._dpi/72,this._dpi/72);if(content){const r=rectArray(content);native.clipRect(r,K.ClipOp.Intersect,false);native.translate(r[0],r[1]);}this._pageCanvas=new core.SKCanvas(native,this);return this._pageCanvas;}
    EndPage(){disposed(this);if(!this._pageSurface)throw new Error('No PDF page is open.');this._pageSurface.flush();const d=this._pageDimensions,pixels=pixelsRead(this._pageSurface.getCanvas(),defaultReadInfo(d.pixelWidth,d.pixelHeight));if(!pixels)throw new Error('PDF page pixel readback failed.');const rgb=new Uint8Array(d.pixelWidth*d.pixelHeight*3);for(let i=0,j=0;i<pixels.length;i+=4,j+=3){const a=pixels[i+3]/255;rgb[j]=Math.round(pixels[i]*a+255*(1-a));rgb[j+1]=Math.round(pixels[i+1]*a+255*(1-a));rgb[j+2]=Math.round(pixels[i+2]*a+255*(1-a));}this._pages.push({...d,pixels:rgb});this._pageCanvas?.Dispose();this._pageCanvas=null;this._pageSurface.dispose();this._pageSurface=null;}
    Close(){disposed(this);if(this._closed)return true;if(this._pageSurface)this.EndPage();this._data=makeRasterPdf(this._pages,this._metadata);if(this._stream)this._data.SaveTo(this._stream);this._closed=true;return true;}
    ToData(){this.Close();return SKData.CreateCopy(this._data);}
    Abort(){disposed(this);this._pageCanvas?.Dispose();this._pageCanvas=null;this._pageSurface?.dispose();this._pageSurface=null;this._pages=[];this._data?.Dispose();this._data=null;this._closed=true;}
    Dispose(){if(this._disposed)return;if(!this._closed)this.Abort();this._data?.Dispose();this._data=null;this._pages=[];super.Dispose();}
  }
  return {SKData,SKStream,SKStreamAsset:SKStream,SKMemoryStream,SKDynamicMemoryWStream,SKColorSpace,SKImage,SKBitmap,SKPixmap,SKCodec,SKVertices,SKDocument,SKEncodedImageFormat,SKCodecResult,SKVertexMode};
}
