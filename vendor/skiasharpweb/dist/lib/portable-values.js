const enumDeclarations={
  "SKAlphaType": {
    "Unknown": 0,
    "Opaque": 1,
    "Premul": 2,
    "Unpremul": 3
  },
  "SKColorChannel": {
    "R": 0,
    "G": 1,
    "B": 2,
    "A": 3
  },
  "SKColorspacePrimariesCicp": {
    "Unknown": 0,
    "Rec709": 1,
    "Rec470SystemM": 4,
    "Rec470SystemBg": 5,
    "Rec601": 6,
    "SmpteSt240": 7,
    "GenericFilm": 8,
    "Rec2020": 9,
    "SmpteSt4281": 10,
    "SmpteRp4312": 11,
    "SmpteEg4321": 12,
    "ItuTH273Value22": 22
  },
  "SKColorspaceTransferFnCicp": {
    "Unknown": 0,
    "Rec709": 1,
    "Rec470SystemM": 4,
    "Rec470SystemBg": 5,
    "Rec601": 6,
    "SmpteSt240": 7,
    "Linear": 8,
    "Iec6196624": 11,
    "Iec6196621": 13,
    "Rec202010bit": 14,
    "Rec202012bit": 15,
    "Pq": 16,
    "SmpteSt4281": 17,
    "Hlg": 18
  },
  "SKPathAddMode": {
    "Append": 0,
    "Extend": 1
  },
  "SKPathArcSize": {
    "Small": 0,
    "Large": 1
  },
  "SKPathSegmentMask": {
    "Line": 1,
    "Quad": 2,
    "Conic": 4,
    "Cubic": 8
  },
  "SKPathMeasureMatrixFlags": {
    "GetPosition": 1,
    "GetTangent": 2,
    "GetPositionAndTangent": 3
  },
  "SKPixelGeometry": {
    "Unknown": 0,
    "RgbHorizontal": 1,
    "BgrHorizontal": 2,
    "RgbVertical": 3,
    "BgrVertical": 4
  },
  "SKSurfacePropsFlags": {
    "None": 0,
    "UseDeviceIndependentFonts": 1
  },
  "SKPaintHinting": {
    "NoHinting": 0,
    "Slight": 1,
    "Normal": 2,
    "Full": 3
  },
  "SKPathConvexity": {
    "Unknown": 0,
    "Convex": 1,
    "Concave": 2
  }
};
export function installPortableValues(K,api){
 const val=v=>v?.value??v,arr=v=>v?.ToArray?.()??v?.Values??v,prop=(T,n,get,set)=>Object.defineProperty(T.prototype,n,{get,set,configurable:true,enumerable:true});
 const boxed=(table,n)=>Object.values(table??{}).find(v=>v?.value===n)??Object.freeze({value:n,valueOf(){return n;}});
 for(const[name,items]of Object.entries(enumDeclarations)){const old=api[name]??{},object={...old};for(const[k,n]of Object.entries(items))if(object[k]===undefined)object[k]=name==='SKAlphaType'?boxed(K.AlphaType,n):name==='SKColorChannel'?boxed(K.ColorChannel,n):n;api[name]=Object.freeze(object);}
 const nativeDefaults={Unknown:0,Alpha8:1,Rgb565:2,Argb4444:3,Rgba8888:4,Rgb888x:5,Bgra8888:6,Rgba1010102:7,Bgra1010102:8,Rgb101010x:9,Bgr101010x:10,Bgr101010xXR:11,Bgra10101010XR:12,Rgba10x6:13,Gray8:14,RgbaF16Clamped:15,RgbaF16:16,RgbF16F16F16x:17,RgbaF32:18,Rg88:19,AlphaF16:20,RgF16:21,Alpha16:22,Rg1616:23,Rgba16161616:24,Srgba8888:25,R8Unorm:26};
 const nativeTypes=K.SkiaSharpNative?.ColorTypes??nativeDefaults,types={...api.SKColorType};for(const[name,n]of Object.entries(nativeTypes))types[name]??=boxed(K.ColorType,n);api.SKColorType=Object.freeze(types);
 const byteCounts={Unknown:0,Alpha8:1,Rgb565:2,Argb4444:2,Rgba8888:4,Rgb888x:4,Bgra8888:4,Rgba1010102:4,Rgb101010x:4,Gray8:1,RgbaF16:8,RgbaF16Clamped:8,RgbaF32:16,Rg88:2,AlphaF16:2,RgF16:4,Alpha16:2,Rg1616:4,Rgba16161616:8,Bgra1010102:4,Bgr101010x:4,Bgr101010xXR:4,Srgba8888:4,R8Unorm:1,Rgba10x6:8,Bgra10101010XR:8,RgbF16F16F16x:8,R16Unorm:2,RF16:2};
 const typeName=t=>Object.keys(byteCounts).find(k=>types[k]!==undefined&&val(types[k])===val(t));
 const getBytes=t=>{const name=typeName(t);if(name===undefined)throw new RangeError('Unknown color type.');return byteCounts[name];};
 const opaque=new Set(['Gray8','Rg88','Rg1616','RgF16','Rgb565','Rgb888x','Rgb101010x','Bgr101010x','Bgr101010xXR','R8Unorm','R16Unorm','RF16','RgbF16F16F16x']);
 const formats={Unknown:0,Alpha8:0x803c,Gray8:0x8040,Rgb565:0x8d62,Argb4444:0x8056,Rgba8888:0x8058,Rgb888x:0x8051,Bgra8888:0x93a1,Rgba1010102:0x8059,AlphaF16:0x822d,RgbaF16:0x881a,RgbaF16Clamped:0x881a,Alpha16:0x822a,Rg1616:0x822c,Rgba16161616:0x805b,Rgba10x6:0,RgF16:0x822f,Rg88:0x822b,Rgb101010x:0,RgbaF32:0,Bgra1010102:0,Bgr101010x:0,Bgr101010xXR:0,Bgra10101010XR:0,Srgba8888:0x8c43,R8Unorm:0x8229,RgbF16F16F16x:0,R16Unorm:0x822a,RF16:0x822d};
 api.SkiaExtensions=Object.freeze({...api.SkiaExtensions,IsBgr:g=>[2,4].includes(val(g)),IsRgb:g=>[1,3].includes(val(g)),IsVertical:g=>[3,4].includes(val(g)),IsHorizontal:g=>[1,2].includes(val(g)),GetBytesPerPixel:getBytes,GetBitShiftPerPixel:t=>Math.max(0,Math.log2(getBytes(t))),GetAlphaType(t,a=api.SKAlphaType.Premul){const n=typeName(t);if(n===undefined)throw new RangeError('Unknown color type.');return n==='Unknown'?api.SKAlphaType.Unknown:opaque.has(n)?api.SKAlphaType.Opaque:['Alpha8','Alpha16','AlphaF16'].includes(n)&&val(a)===3?api.SKAlphaType.Premul:a;},ToGlSizedFormat(t){const n=typeName(t);if(n===undefined)throw new RangeError('Unknown color type.');return formats[n];},ToSamplingOptions(q){switch(val(q)){case 0:return new api.SKSamplingOptions(api.SKFilterMode.Nearest);case 1:return new api.SKSamplingOptions(api.SKFilterMode.Linear);case 2:return new api.SKSamplingOptions(api.SKFilterMode.Linear,api.SKMipmapMode.Linear);case 3:return new api.SKSamplingOptions(api.SKCubicResampler.Mitchell);default:throw new RangeError('Unknown filter quality.');}}});
 prop(api.SKImageInfo,'BytesPerPixel',function(){return getBytes(this.ColorType);});prop(api.SKImageInfo,'BitShiftPerPixel',function(){return Math.max(0,Math.log2(this.BytesPerPixel));});
 prop(api.SKImageInfo,'IsOpaque',function(){return val(this.AlphaType)===1;});
 class SKSurfaceProperties extends api.SKObject{constructor(flags=0,geometry){super();if(geometry===undefined){geometry=flags;flags=0;}this._flags=val(flags);this._geometry=val(geometry);}get Flags(){this.ThrowIfDisposed();return this._flags;}get PixelGeometry(){this.ThrowIfDisposed();return this._geometry;}get IsUseDeviceIndependentFonts(){return !!(this.Flags&1);}}
 api.SKSurfaceProperties=SKSurfaceProperties;
 for(const T of [api.SKCubicResampler,api.SKSamplingOptions]){T.prototype.Equals=function(other){if(!(other instanceof T))return false;if(this.B!==undefined)return this.B===other.B&&this.C===other.C;return !!this.UseCubic===!!other.UseCubic&&(this.UseCubic?this.Cubic.Equals(other.Cubic):val(this.Filter)===val(other.Filter)&&val(this.Mipmap)===val(other.Mipmap));};T.prototype.GetHashCode=function(){const values=this.B!==undefined?[this.B,this.C]:this.UseCubic?[1,this.Cubic.B,this.Cubic.C]:[0,val(this.Filter),val(this.Mipmap)];let h=0;const a=new Float32Array(1),i=new Int32Array(a.buffer);for(const x of values){a[0]=x;h=(Math.imul(h,31)+i[0])|0;}return h;};}
 api.SKBlender.CreateBlendMode=api.SKBlender.Create;api.SKBlender.CreateArithmetic=function(k1,k2,k3,k4,enforcePMColor){const builder=api.SKRuntimeEffect.BuildBlender('uniform float4 k; uniform int enforce; half4 main(half4 src, half4 dst) { half4 c=clamp(half(k.x)*src*dst+half(k.y)*src+half(k.z)*dst+half(k.w),0,1); if(enforce!=0) c.rgb=min(c.rgb,c.aaa); return c; }');try{builder.Uniforms.k=[k1,k2,k3,k4];builder.Uniforms.enforce=enforcePMColor?1:0;return builder.Build();}finally{builder.Dispose();}};
 api.SKPaint.prototype.SetColor=function(color,space=null){this.ThrowIfDisposed();this._native.setColor(api.color(color),api.unwrap(space)||undefined);};
 const canvas=api.SKCanvas,oldSet=canvas.prototype.SetMatrix,oldReset=canvas.prototype.ResetMatrix;
 canvas.prototype.SetMatrix=function(matrix){this._complex();const native=K.SkiaSharpNative?.Canvas?.SetMatrix;if(native){native(this._native,matrix instanceof api.SKMatrix44?matrix.ToColumnMajor():arr(matrix));return;}return oldSet.call(this,matrix);};canvas.prototype.ResetMatrix=function(){this._complex();const native=K.SkiaSharpNative?.Canvas?.SetMatrix;if(native){native(this._native,api.SKMatrix.Identity.ToArray());return;}return oldReset.call(this);};
 const oldClip=Object.getOwnPropertyDescriptor(canvas.prototype,'LocalClipBounds').get;prop(canvas,'LocalClipBounds',function(){this._check();const native=K.SkiaSharpNative?.Canvas?.LocalClipBounds;return native?new api.SKRect(...native(this._native)):oldClip.call(this);});prop(canvas,'IsClipRect',function(){this._check();const fn=K.SkiaSharpNative?.Canvas?.IsClipRect;if(fn)return fn(this._native);if(!this._clipDirty)return !this.IsClipEmpty;throw new api.SKNotSupportedError('Exact clip classification requires the native Canvas bridge.');});
 canvas.prototype.DrawAnnotation=function(rect,key,value){this._check();if(typeof key!=='string')throw new TypeError('Annotation key must be a string.');const bytes=value?.ToArray?.()??new Uint8Array(),native=K.SkiaSharpNative?.Canvas?.Annotation;if(native){this._complex();native(this._native,arr(rect),key,bytes);}else{this._annotations??=[];this._annotations.push({Rect:new api.SKRect(...arr(rect)),Key:key,Data:new Uint8Array(bytes),Matrix:this.TotalMatrix});}return this;};
 for(const[method,key,isPoint]of [['DrawUrlAnnotation','SkAnnotationKey_URL',false],['DrawNamedDestinationAnnotation','SkAnnotationKey_Define_Named_Dest',true],['DrawLinkDestinationAnnotation','SkAnnotationKey_Link_Named_Dest',false]])canvas.prototype[method]=function(bounds,value){const own=typeof value==='string',data=own?api.SKData.CreateCopy(new TextEncoder().encode(value+'\0')):value;this.DrawAnnotation(isPoint?new api.SKRect(bounds.X,bounds.Y,bounds.X,bounds.Y):bounds,key,data);return own?data:undefined;};
 const p=api.SKPath,oldRect=p.prototype.GetRect;prop(p,'IsConvex',function(){const native=K.SkiaSharpNative?.Path?.Classification;if(native)return native(this._native).convex;if(this.IsEmpty||this.IsRect||this.IsOval||this.IsRoundRect)return true;throw new api.SKNotSupportedError('Exact path convexity requires the native Path bridge.');});prop(p,'IsConcave',function(){return !this.IsConvex;});prop(p,'Convexity',function(){return this.IsConvex?api.SKPathConvexity.Convex:api.SKPathConvexity.Concave;});
 p.prototype.GetRect=function(closed,direction){const native=K.SkiaSharpNative?.Path?.Classification;let info;if(native){const d=native(this._native);info=d.isRect?{Rect:new api.SKRect(...d.rect),IsClosed:d.closed,Direction:d.direction}:null;}else{const d={};const rect=oldRect.call(this,d);info=this.IsRect?{Rect:rect,...d}:null;}if(direction!==undefined){if(closed)closed.Value=info?.IsClosed??false;if(direction)direction.Value=info?.Direction??0;}else if(closed)Object.assign(closed,{IsClosed:info?.IsClosed??false,Direction:info?.Direction??0});return info?.Rect??api.SKRect.Empty;};
 p.prototype.Get=function(i){return this.GetPoint(i);};
 const conic=p.ConvertConicToQuads;p.ConvertConicToQuads=function(a,b,c,w,d,power){if(d&&typeof d==='object'&&!Array.isArray(d)&&!ArrayBuffer.isView(d)){const values=conic.call(this,a,b,c,w,power);d.Value=values;d.Points=values;return (values.length-1)/2;}return conic.call(this,a,b,c,w,d,power);};
 const position=api.SKPathMeasure.prototype.GetPosition,tangent=api.SKPathMeasure.prototype.GetTangent;for(const[method,base]of [['GetPosition',position],['GetTangent',tangent]])api.SKPathMeasure.prototype[method]=function(distance,out){const result=base.call(this,distance,out);return out?result:result??api.SKPoint.Empty;};
 api.SKPicture.prototype.GetApproximateOperationCount=function(includeNested){this.ThrowIfDisposed();const fn=K.SkiaSharpNative?.Picture?.ApproximateOperationCount;if(!fn)throw new api.SKNotSupportedError('Operation counting requires the native picture bridge.');return fn(this._native,!!includeNested);};
 prop(api.SKPicture,'ApproximateOperationCount',function(){return this.GetApproximateOperationCount(false);});
 api.SKSurface.CreateNull=function(width,height){const fn=K.SkiaSharpNative?.Surface?.CreateNull;if(!fn)throw new api.SKNotSupportedError('Null surfaces require the native surface bridge.');const surface=fn(width,height);return surface?new api.SKSurface(surface):null;};
 api.SKTypeface.prototype.TryGetTableTags=function(output){this.ThrowIfDisposed();const tags=this.GetTableTags();if(output)output.Value=tags;return !!tags.length;};
 api.SKPictureRecorder.prototype.EndRecordingAsDrawable=function(){const picture=this.EndRecording(),drawable=new api.SKDrawable(canvas=>canvas.DrawPicture(picture),picture.CullRect,picture.ApproximateBytesUsed),dispose=drawable.Dispose;drawable.Dispose=function(){if(this.IsDisposed)return;picture.Dispose();dispose.call(this);};return drawable;};
 api.SKSurface.prototype.RequestReadPixels=function(...args){this.ThrowIfDisposed();const image=this.Snapshot();if(!image){const callback=args.at(-1);callback(null);return Promise.resolve(null);}try{return Promise.resolve(image.RequestReadPixels(...args)).finally(()=>image.Dispose());}catch(error){image.Dispose();throw error;}};
 for(const[name,aliases]of Object.entries({SKCanvasSaveLayerRecFlags:{PreserveLcdText:2,InitializeWithPrevious:4},SKFontEdging:{Antialias:val(K.FontEdging.AntiAlias),SubpixelAntialias:val(K.FontEdging.SubpixelAntiAlias)},SKImageCachingHint:{Allow:0,Disallow:1},SKCodecAnimationDisposalMethod:{RestoreBackgroundColor:2}})){const result={...api[name]};for(const[key,value]of Object.entries(aliases))if(result[key]===undefined)result[key]=name==='SKFontEdging'?boxed(K.FontEdging,value):value;api[name]=Object.freeze(result);}
 const Stats=api.AnimationBuilderStats;if(Stats){Stats.prototype.Equals=function(other){if(!(other instanceof Stats))return false;return Object.keys(this).every(k=>this[k]?.Equals?this[k].Equals(other[k]):this[k]===other[k]);};Stats.prototype.GetHashCode=function(){let hash=0;for(const key of Object.keys(this)){const v=this[key],n=typeof v==='number'?v:v?.Ticks??v?.TotalMilliseconds??0;hash=(Math.imul(hash,31)+Number(n))|0;}return hash;};}
 api.SKImageInfo.prototype.GetHashCode=function(){return (Math.imul((Math.imul(this.Width|0,397)^this.Height)|0,397)^Math.imul(val(this.ColorType)|0,31)^val(this.AlphaType))|0;};
 if(api.SKHighContrastConfig)api.SKHighContrastConfig.prototype.GetHashCode=function(){const bits=new Float32Array([this.Contrast]),value=new Int32Array(bits.buffer)[0];return (Math.imul((this.Grayscale?1:0)*31+(val(this.InvertStyle)|0),31)^value)|0;};
 return api;
}
