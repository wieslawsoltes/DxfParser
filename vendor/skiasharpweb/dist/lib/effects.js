/** Extended effects missing from CanvasKit's public binding.
 * Native operations remain native. Software nodes own their inputs and operate
 * on unpremultiplied Float32 images; RGBA8 APIs quantize only at the boundary.
 * Native nodes and capture surfaces also retain Float32 component precision.
 */
export function createEffectExtensions(K,api){
  const {SKObject,SKColorFilter,SKImageFilter,SKPathEffect,SKPath,SKPathMeasure,SKMatrix,SKRect,SKPaint,SKColor}=api;
  const val=x=>x?.value??x,arr=x=>x?.ToArray?.()??x?.Values??x,n=x=>x?._native??x;
  const cloneOptions=x=>x?.value!==undefined?x:Array.isArray(x)?x.map(cloneOptions):ArrayBuffer.isView(x)?Array.from(x):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,cloneOptions(v)])):x;
  const clamp=x=>Math.max(0,Math.min(1,x)),byte=x=>Math.round(clamp(x)*255),copy=x=>x instanceof SKPaint?x.Clone():x?._clone?.()??(x?x.constructor._fromNative(x._native.clone()):null);
  const rgba=c=>Array.from(api.color(c));
  const info=(w,h)=>({width:w,height:h,colorType:K.ColorType.RGBA_F32,alphaType:K.AlphaType.Unpremul,colorSpace:K.ColorSpace.SRGB});
  const bytes=p=>new Uint8Array(p.buffer,p.byteOffset,p.byteLength);
  const frame=(pixels,width,height)=>({pixels:pixels instanceof Float32Array?pixels.slice():Float32Array.from(pixels,x=>x/255),width,height});
  const quantize=pixels=>Uint8Array.from(pixels,byte);
  const makeImage=(pixels,w,h)=>K.MakeImage(info(w,h),bytes(pixels),w*16);
  const surfacePool=[];let poolBytes=0;
  const EffectDiagnostics={FloatPrecision:32,NativeFloatSurfaces:true,SurfaceAllocations:0,SurfaceReuses:0,PeakCapturePixels:0};
  function makeSurface(w,h){
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>16777216)throw new RangeError('Float filter surface exceeds the 256 MiB allocation limit.');
    const index=surfacePool.findIndex(e=>e.width===w&&e.height===h);let e;
    if(index>=0){e=surfacePool.splice(index,1)[0];poolBytes-=w*h*16;EffectDiagnostics.SurfaceReuses++;}
    else{const allocation=K.Malloc(Float32Array,w*h*4);let surface;try{surface=K.MakeRasterDirectSurface({...info(w,h),alphaType:K.AlphaType.Premul},allocation,w*16);if(!surface)throw new Error('Native Float32 surface allocation failed.');}catch(error){K.Free(allocation);throw error;}e={width:w,height:h,allocation,surface};EffectDiagnostics.SurfaceAllocations++;}
    e.surface.getCanvas().restoreToCount(1);e.surface.getCanvas().resetMatrix?.();e.surface.getCanvas().clear(K.TRANSPARENT);e.surface.getCanvas().save();let released=false;
    return {getCanvas:()=>e.surface.getCanvas(),dispose(){if(released)return;released=true;const size=w*h*16;if(surfacePool.length<2&&poolBytes+size<=33554432){surfacePool.push(e);poolBytes+=size;}else{e.surface.dispose();K.Free(e.allocation);}}};
  }
  function PurgeEffectCache(){for(const e of surfacePool){e.surface.dispose();K.Free(e.allocation);}surfacePool.length=0;poolBytes=0;}
  function readFloat(canvas,w,h,x=0,y=0){const allocation=K.Malloc(Float32Array,w*h*4);try{const result=canvas.readPixels(x,y,info(w,h),allocation,w*16);if(!result)throw new Error('Native Float32 pixel readback failed.');return allocation.toTypedArray().slice();}finally{K.Free(allocation);}}
  function floatInput(pixels,w,h){assertFrame(pixels,w,h);return frame(pixels,w,h);}
  const srgbToLinear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
  const linearToSrgb=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
  function assertFrame(pixels,w,h){if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||pixels.length!==w*h*4)throw new RangeError('Expected width × height RGBA pixels.');}
  function nativeFilter(filter,input,colorFilter=false,ctm=null){const {width:w,height:h,pixels}=input,image=makeImage(pixels,w,h),surface=makeSurface(w,h),paint=new K.Paint();if(!image||!surface)throw new Error('Could not allocate native filter surfaces.');try{paint[colorFilter?'setColorFilter':'setImageFilter'](n(filter));const c=surface.getCanvas();if(ctm&&!colorFilter){const inverse=K.Matrix.invert(ctm);if(!inverse)throw new RangeError('Image filters require an invertible matrix.');c.concat(ctm);const saved=c.saveLayer(paint,null);c.concat(inverse);c.drawImage(image,0,0,null);c.restoreToCount(saved);}else c.drawImage(image,0,0,paint);const output=readFloat(surface.getCanvas(),w,h);if(!output)throw new Error('Filter readback failed.');return frame(output,w,h);}finally{paint.delete();image.delete();surface.dispose();}}
  class SoftwareColorFilter extends SKColorFilter {
    constructor(kind,options={},children=[],preferNative=true){super();if(preferNative&&K.SkiaSharpNative?.Effects?.MakeColorFilter&&!children.some(c=>c?._software)){const native=K.SkiaSharpNative.Effects.MakeColorFilter(kind,options);if(native)return SKColorFilter._fromNative(native);}this._software=true;this.Kind=kind;this._options=cloneOptions(options);this._children=children.map(copy);}
    _clone(){this.ThrowIfDisposed();return new SoftwareColorFilter(this.Kind,this._options,this._children,false);}
    ApplyPixels(pixels,width=pixels.length/4,height=1){this.ThrowIfDisposed();assertFrame(pixels,width,height);return quantize(evaluateColor(this,frame(pixels,width,height)).pixels);}
    ApplyFloatPixels(pixels,width=pixels.length/4,height=1){this.ThrowIfDisposed();if(!(pixels instanceof Float32Array))throw new TypeError('ApplyFloatPixels requires Float32Array RGBA components.');return evaluateColor(this,floatInput(pixels,width,height)).pixels;}
    FilterColor(c){const a=rgba(c).map(byte),out=this.ApplyPixels(a);return new SKColor(...out);}
    Dispose(){if(this.IsDisposed)return;this._children.forEach(x=>x?.Dispose());this._children=[];super.Dispose();}
  }
  class SoftwareImageFilter extends SKImageFilter {
    constructor(kind,options={},children=[],resources=[],preferNative=true){super();if(preferNative&&K.SkiaSharpNative?.Effects?.MakeImageFilter&&!children.some(c=>c?._software)&&!resources.length){const native=K.SkiaSharpNative.Effects.MakeImageFilter(kind,options,children.map(n));if(native)return SKImageFilter._fromNative(native);}this._software=true;this.Kind=kind;this._options=cloneOptions(options);this._children=children.map(copy);this._resources=resources.map(copy);}
    _clone(){this.ThrowIfDisposed();return new SoftwareImageFilter(this.Kind,this._options,this._children,this._resources,false);}
    ApplyPixels(pixels,width,height){this.ThrowIfDisposed();assertFrame(pixels,width,height);return quantize(evaluateImage(this,frame(pixels,width,height)).pixels);}
    ApplyFloatPixels(pixels,width,height){this.ThrowIfDisposed();if(!(pixels instanceof Float32Array))throw new TypeError('ApplyFloatPixels requires Float32Array RGBA components.');return evaluateImage(this,floatInput(pixels,width,height)).pixels;}
    Dispose(){if(this.IsDisposed)return;this._children.forEach(x=>x?.Dispose());this._resources.forEach(x=>x?.Dispose());this._children=[];this._resources=[];super.Dispose();}
  }
  const SKHighContrastConfigInvertStyle=Object.freeze({NoInvert:0,InvertBrightness:1,InvertLightness:2});
  class SKHighContrastConfig {
    constructor(grayscale=false,invertStyle=0,contrast=0){this.Grayscale=!!grayscale;this.InvertStyle=invertStyle;this.Contrast=contrast;}
    get IsValid(){return Number.isFinite(this.Contrast)&&Math.abs(this.Contrast)<=1&&[0,1,2].includes(val(this.InvertStyle));}
    Equals(c){return c instanceof SKHighContrastConfig&&c.Grayscale===this.Grayscale&&val(c.InvertStyle)===val(this.InvertStyle)&&c.Contrast===this.Contrast;}
    static get Default(){return new SKHighContrastConfig();}
  }
  function hsl(r,g,b){const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(min+max)/2;return [d?(((max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)/6)%1):0,d?d/(1-Math.abs(2*l-1)):0,l];}
  function fromHsl(h,s,l){h=((h%1)+1)%1;s=clamp(s);l=clamp(l);const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h*6)%2-1)),m=l-c/2,rgb=h<1/6?[c,x,0]:h<2/6?[x,c,0]:h<3/6?[0,c,x]:h<4/6?[0,x,c]:h<5/6?[x,0,c]:[c,0,x];return rgb.map(v=>v+m);}
  function evaluateColor(filter,input){
    if(!(input.pixels instanceof Float32Array))input=frame(input.pixels,input.width,input.height);
    if(!filter)return input;filter.ThrowIfDisposed();if(!filter._software)return nativeFilter(filter,input,true);
    const o=filter._options,k=filter.Kind,kids=filter._children;
    if(k==='compose')return evaluateColor(kids[0],evaluateColor(kids[1],input));
    if(k==='lerp'){const a=evaluateColor(kids[0],input),b=evaluateColor(kids[1],input),out=frame(a.pixels,a.width,a.height);for(let i=0;i<out.pixels.length;i+=4){const aa=a.pixels[i+3],ba=b.pixels[i+3],alpha=aa*(1-o.t)+ba*o.t;for(let c=0;c<3;c++)out.pixels[i+c]=alpha?(a.pixels[i+c]*aa*(1-o.t)+b.pixels[i+c]*ba*o.t)/alpha:0;out.pixels[i+3]=alpha;}return out;}
    const out=frame(input.pixels,input.width,input.height),p=out.pixels;
    for(let i=0;i<p.length;i+=4){let r=p[i],g=p[i+1],b=p[i+2],a=p[i+3];
      if(k==='table'){p[i]=o.tables[1][byte(p[i])]/255;p[i+1]=o.tables[2][byte(p[i+1])]/255;p[i+2]=o.tables[3][byte(p[i+2])]/255;p[i+3]=o.tables[0][byte(p[i+3])]/255;continue;}
      if(k==='hsla'){const s=[...hsl(r,g,b),a],v=Array.from({length:4},(_,row)=>o.matrix[row*5+4]+s.reduce((z,x,c)=>z+x*o.matrix[row*5+c],0));[r,g,b]=fromHsl(v[0],v[1],v[2]);a=clamp(v[3]);}
      else if(k==='contrast'){r=srgbToLinear(r);g=srgbToLinear(g);b=srgbToLinear(b);if(o.grayscale)r=g=b=.2126*r+.7152*g+.0722*b;if(o.invert===1){r=1-r;g=1-g;b=1-b;}else if(o.invert===2){const [h,s,l]=hsl(r,g,b);[r,g,b]=fromHsl(h,s,1-l);}const contrast=Math.min(1-2**-23,Math.max(-1+2**-23,o.contrast)),factor=(1+contrast)/(1-contrast);r=clamp((r-.5)*factor+.5);g=clamp((g-.5)*factor+.5);b=clamp((b-.5)*factor+.5);r=linearToSrgb(r);g=linearToSrgb(g);b=linearToSrgb(b);}
      else if(k==='overdraw'){const c=o.colors[Math.min(o.colors.length-1,byte(p[i+3]))];[r,g,b,a]=c;}
      else throw new Error('Unknown software color filter: '+k);
      p[i]=r;p[i+1]=g;p[i+2]=b;p[i+3]=a;
    }return out;
  }
  const originalColor={Compose:SKColorFilter.CreateCompose,Lerp:SKColorFilter.CreateLerp};
  SKColorFilter.ColorMatrixSize=20;SKColorFilter.TableMaxLength=256;
  SKColorFilter.CreateTable=function(...tables){if(tables.length===1)tables=[tables[0],tables[0],tables[0],tables[0]];if(tables.length!==4)throw new TypeError('CreateTable expects one table or A, R, G, B tables.');const identity=Array.from({length:256},(_,i)=>i);tables=tables.map(t=>t==null?identity:Array.from(t));if(tables.some(t=>t.length!==256||t.some(v=>!Number.isInteger(v)||v<0||v>255)))throw new RangeError('Every color table must contain 256 bytes.');return new SoftwareColorFilter('table',{tables});};
  SKColorFilter.CreateTableARGB=(...a)=>SKColorFilter.CreateTable(...a);
  SKColorFilter.CreateHslaColorMatrix=function(matrix){if(matrix.length!==20||Array.from(matrix).some(v=>!Number.isFinite(v)))throw new RangeError('An HSLA matrix needs twenty finite values.');return new SoftwareColorFilter('hsla',{matrix:Array.from(matrix)});};
  SKColorFilter.CreateHighContrast=function(config,invert,contrast){if(typeof config==='boolean')config=new SKHighContrastConfig(config,invert,contrast);if(!config?.IsValid)throw new RangeError('Invalid high-contrast configuration.');return new SoftwareColorFilter('contrast',{grayscale:config.Grayscale,invert:val(config.InvertStyle),contrast:config.Contrast});};
  SKColorFilter.CreateOverdraw=function(colors){if(colors.length!==6)throw new RangeError('Overdraw filters require six colors.');return new SoftwareColorFilter('overdraw',{colors:colors.map(rgba)});};
  SKColorFilter.CreateCompose=function(outer,inner){return outer?._software||inner?._software?new SoftwareColorFilter('compose',{},[outer,inner]):originalColor.Compose.call(this,outer,inner);};
  SKColorFilter.CreateLerp=function(t,a,b){if(!Number.isFinite(t))throw new RangeError('Weight must be finite.');t=clamp(t);return a?._software||b?._software?new SoftwareColorFilter('lerp',{t},[a,b]):originalColor.Lerp.call(this,t,a,b);};
  function sample(input,x,y,tile=3){const {width:w,height:h,pixels:p}=input;const coord=(v,size)=>tile===0?Math.max(0,Math.min(size-1,v)):tile===1?((v%size)+size)%size:tile===2?((v=((v%(2*size))+2*size)%(2*size))<size?v:2*size-1-v):v;x=coord(Math.floor(x),w);y=coord(Math.floor(y),h);if(x<0||y<0||x>=w||y>=h)return [0,0,0,0];const i=(y*w+x)*4;return [p[i],p[i+1],p[i+2],p[i+3]];}
  function sampleFiltered(input,x,y,options){if(!options||options.B===undefined&&val(options.filter)===0)return sample(input,Math.round(x),Math.round(y),0);const ix=Math.floor(x),iy=Math.floor(y),cubic=options.B!==undefined,weights=(d)=>{d=Math.abs(d);if(!cubic)return Math.max(0,1-d);const B=options.B,C=options.C;return d<1?((12-9*B-6*C)*d**3+(-18+12*B+6*C)*d*d+6-2*B)/6:d<2?((-B-6*C)*d**3+(6*B+30*C)*d*d+(-12*B-48*C)*d+8*B+24*C)/6:0;},sum=[0,0,0,0];for(let yy=cubic?-1:0;yy<=(cubic?2:1);yy++)for(let xx=cubic?-1:0;xx<=(cubic?2:1);xx++){const c=sample(input,ix+xx,iy+yy,0),weight=weights(x-ix-xx)*weights(y-iy-yy);sum[3]+=c[3]*weight;for(let j=0;j<3;j++)sum[j]+=c[j]*c[3]*weight;}return [sum[3]?sum[0]/sum[3]:0,sum[3]?sum[1]/sum[3]:0,sum[3]?sum[2]/sum[3]:0,clamp(sum[3])];}
  function write(p,i,c){p[i]=c[0];p[i+1]=c[1];p[i+2]=c[2];p[i+3]=c[3];}
  function evaluateImage(filter,source,ctm=null){
    if(!(source.pixels instanceof Float32Array))source=frame(source.pixels,source.width,source.height);
    if(!filter)return source;filter.ThrowIfDisposed();if(!filter._software)return nativeFilter(filter,source,false,ctm);
    const k=filter.Kind,o=filter._options,kids=filter._children,w=source.width,h=source.height;
    const inverse=ctm?K.Matrix.invert(ctm):null;if(ctm&&!inverse)throw new RangeError('Software image filters require an invertible matrix.');
    const map=(m,x,y)=>{if(!m)return [x,y];const z=m[6]*x+m[7]*y+m[8];return [(m[0]*x+m[1]*y+m[2])/z,(m[3]*x+m[4]*y+m[5])/z];};
    const localSample=(x,y,tile=3)=>{const p=map(ctm,x+.5,y+.5);return sample(input,p[0]-.5,p[1]-.5,tile);};
    if(k==='compose')return evaluateImage(kids[0],evaluateImage(kids[1],source,ctm),ctm);
    if(k==='color')return evaluateColor(filter._resources[0],evaluateImage(kids[0],source,ctm));
    if(k==='empty')return {pixels:new Float32Array(w*h*4),width:w,height:h};
    if(k==='nativeUnary'){const input=evaluateImage(kids[0],source,ctm),f=originalImage[o.name].apply(SKImageFilter,o.before.concat([null],o.after));try{return nativeFilter(f,input,false,ctm);}finally{f.Dispose();}}
    if(k==='nativeBinary'){const left=evaluateImage(kids[0],source,ctm),right=evaluateImage(kids[1],source,ctm),resources=[];try{const make=f=>{const image=makeImage(f.pixels,w,h);resources.push(image);const v=K.ImageFilter.MakeImage(image,api.sampling(api.SKSamplingOptions.Default));resources.push(v);return SKImageFilter._fromNative(v,false);},a=make(left),b=make(right);const f=originalImage[o.name].apply(SKImageFilter,[...o.before,a,b]);try{return nativeFilter(f,source,false,ctm);}finally{f.Dispose();}}finally{resources.forEach(r=>r.delete());}}
    if(k==='merge'){const surface=makeSurface(w,h);try{for(const child of kids){const f=evaluateImage(child,source,ctm),image=makeImage(f.pixels,w,h);try{surface.getCanvas().drawImage(image,0,0,null);}finally{image.delete();}}return frame(readFloat(surface.getCanvas(),w,h),w,h);}finally{surface.dispose();}}
    if(k==='blender'){const surface=makeSurface(w,h),paint=new K.Paint();try{for(let j=0;j<2;j++){const f=evaluateImage(kids[j],source,ctm),image=makeImage(f.pixels,w,h);try{if(j===1)paint.setBlender(n(filter._resources[0]));surface.getCanvas().drawImage(image,0,0,paint);}finally{image.delete();}}return frame(readFloat(surface.getCanvas(),w,h),w,h);}finally{paint.delete();surface.dispose();}}
    if(k==='picture'||k==='paint'){const surface=makeSurface(w,h);try{if(k==='picture'){if(ctm)surface.getCanvas().concat(ctm);surface.getCanvas().drawPicture(n(filter._resources[0]));}else{const paint=filter._resources[0];if(Object.values(paint._effects??{}).some(e=>e?._software)){const canvas={_native:surface.getCanvas(),_owner:{Width:w,Height:h}};renderPaintEffects(canvas,paint,p=>canvas._native.drawPaint(p));}else surface.getCanvas().drawPaint(n(paint));}return frame(readFloat(surface.getCanvas(),w,h),w,h);}finally{surface.dispose();}}
    const input=evaluateImage(kids[0],source,ctm),out={pixels:new Float32Array(w*h*4),width:w,height:h},p=out.pixels;
    if(k==='arithmetic'){const foreground=evaluateImage(kids[1],source,ctm);for(let i=0;i<p.length;i+=4){const aa=input.pixels[i+3],ba=foreground.pixels[i+3],A=[];for(let c=0;c<4;c++){const a=input.pixels[i+c]*(c<3?aa:1),b=foreground.pixels[i+c]*(c<3?ba:1);A[c]=clamp(o.k1*a*b+o.k2*b+o.k3*a+o.k4);}for(let c=0;c<3;c++){if(o.enforce)A[c]=Math.min(A[c],A[3]);A[c]=A[3]?A[c]/A[3]:0;}write(p,i,A);}return out;}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,[cx,cy]=map(inverse,x+.5,y+.5),lx=cx-.5,ly=cy-.5;
      if(k==='crop'){const [l,t,r,b]=o.rect;if(cx>=l&&cx<r&&cy>=t&&cy<b)write(p,i,sample(input,x,y));else if(o.tile!==3){const map=(v,a,z)=>o.tile===0?Math.min(z-1,Math.max(a,v)):o.tile===1?a+((v-a)%(z-a)+(z-a))%(z-a):a+((q)=>q<z-a?q:2*(z-a)-1-q)(((v-a)%(2*(z-a))+2*(z-a))%(2*(z-a)));if(r>l&&b>t)write(p,i,localSample(map(lx,l,r),map(ly,t,b)));}}
      else if(k==='tile'){const [l,t,r,b]=o.src,[dl,dt,dr,db]=o.dst;if(cx>=dl&&cx<dr&&cy>=dt&&cy<db)write(p,i,localSample(l+((lx-l)%(r-l)+(r-l))%(r-l),t+((ly-t)%(b-t)+(b-t))%(b-t)));}
      else if(k==='magnifier'){const [l,t,r,b]=o.rect;let sx=lx,sy=ly;if(cx>=l&&cx<r&&cy>=t&&cy<b){const edgeX=Math.min(cx-l,r-cx)/o.inset,edgeY=Math.min(cy-t,b-cy)/o.inset,weight=o.inset>0?clamp(edgeX<2&&edgeY<2?2-Math.hypot(2-edgeX,2-edgeY):Math.min(edgeX,edgeY))**2:1,centerX=(l+r)/2,centerY=(t+b)/2;sx=lx+(centerX+(lx-centerX)/o.zoom-lx)*weight;sy=ly+(centerY+(ly-centerY)/o.zoom-ly)*weight;}const mapped=map(ctm,sx+.5,sy+.5);write(p,i,sampleFiltered(input,mapped[0]-.5,mapped[1]-.5,o.sampling));}
      else if(k==='convolution'){const sum=[0,0,0,0];for(let ky=0;ky<o.kh;ky++)for(let kx=0;kx<o.kw;kx++){const s=localSample(lx+kx-o.ox,ly+ky-o.oy,o.tile),v=o.kernel[ky*o.kw+kx];for(let c=0;c<4;c++)sum[c]+=s[c]*(c<3&&o.alpha?s[3]:1)*v;}let a=o.alpha?clamp(sum[3]*o.gain+o.bias/255):sample(input,x,y)[3];for(let c=0;c<3;c++){sum[c]=clamp(sum[c]*o.gain+o.bias/255);if(o.alpha)sum[c]=a?Math.min(a,sum[c])/a:0;}write(p,i,[...sum.slice(0,3),a]);}
      else if(k==='lighting'){const height=(xx,yy)=>sample(input,xx,yy,0)[3]*o.scale,dx=(height(x+1,y-1)+2*height(x+1,y)+height(x+1,y+1)-height(x-1,y-1)-2*height(x-1,y)-height(x-1,y+1))/4,dy=(height(x-1,y+1)+2*height(x,y+1)+height(x+1,y+1)-height(x-1,y-1)-2*height(x,y-1)-height(x+1,y-1))/4,N=normalize([-dx,-dy,1]);let L=o.type==='distant'?normalize(o.position):normalize([o.position[0]-x-.5,o.position[1]-y-.5,o.position[2]-height(x,y)]),attenuation=1;if(o.type==='spot'){const direction=normalize(o.target.map((v,j)=>v-o.position[j])),cos=-dot(L,direction);const cutoff=Math.cos(o.cutoff*Math.PI/180);attenuation=cos>=cutoff?Math.pow(Math.max(0,cos),o.exponent)*clamp((cos-cutoff)/.016):0;}const intensity=o.specular?o.coefficient*Math.pow(Math.max(0,dot(N,normalize([L[0],L[1],L[2]+1]))),o.shininess):o.coefficient*Math.max(0,dot(N,L)),rgb=o.color.slice(0,3).map(c=>clamp(c*intensity*attenuation));write(p,i,[...rgb,o.specular?Math.max(...rgb):1]);}
      else throw new Error('Unknown software image filter: '+k);
    }return out;
  }
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),normalize=a=>{const len=Math.hypot(...a);return len?a.map(v=>v/len):[0,0,1];};
  const originalImage=Object.fromEntries(Object.getOwnPropertyNames(SKImageFilter).filter(n=>n.startsWith('Create')).map(n=>[n,SKImageFilter[n]]));
  const crop=(f,r)=>{if(!r)return f;const result=new SoftwareImageFilter('crop',{rect:Array.from(arr(r)),tile:3},[f]);f?.Dispose();return result;};
  SKImageFilter.CreateEmpty=()=>new SoftwareImageFilter('empty');
  SKImageFilter.CreateCrop=(r,tile=K.TileMode.Decal,input=null)=>new SoftwareImageFilter('crop',{rect:Array.from(arr(r)),tile:val(tile)},[input]);
  SKImageFilter.CreateArithmetic=(k1,k2,k3,k4,enforcePMColor,background,foreground=null,cropRect)=>crop(new SoftwareImageFilter('arithmetic',{k1,k2,k3,k4,enforce:!!enforcePMColor},[background,foreground]),cropRect);
  SKImageFilter.CreateMatrixConvolution=function(size,kernel,gain,bias,offset,tile,alpha,input=null,cropRect){const [kw,kh]=arr(size),[ox,oy]=arr(offset);if(!Number.isInteger(kw)||!Number.isInteger(kh)||kw<1||kh<1||kernel.length!==kw*kh||!Number.isInteger(ox)||!Number.isInteger(oy)||ox<0||oy<0||ox>=kw||oy>=kh)throw new RangeError('Invalid convolution kernel size or offset.');return crop(new SoftwareImageFilter('convolution',{kw,kh,kernel:Array.from(kernel),gain,bias,ox,oy,tile:val(tile),alpha:!!alpha},[input]),cropRect);};
  SKImageFilter.CreateMagnifier=(r,zoom,inset,sampling,input=null,cropRect)=>{if(!(zoom>0)||!(inset>=0))throw new RangeError('Magnifier zoom must be positive and inset nonnegative.');return crop(new SoftwareImageFilter('magnifier',{rect:Array.from(arr(r)),zoom,inset,sampling:sampling?.ToNative?.()??sampling},[input]),cropRect);};
  SKImageFilter.CreateTile=(src,dst,input=null)=>{if(src.Width<=0||src.Height<=0)throw new RangeError('Source tile must be nonempty.');return new SoftwareImageFilter('tile',{src:Array.from(arr(src)),dst:Array.from(arr(dst))},[input]);};
  SKImageFilter.CreatePicture=(picture,cropRect)=>crop(new SoftwareImageFilter('picture',{},[],[picture]),cropRect);
  SKImageFilter.CreatePaint=(paint,cropRect)=>crop(new SoftwareImageFilter('paint',{},[],[paint]),cropRect);
  SKImageFilter.CreateShader=(shader,dither=false,cropRect)=>{if(!dither)return crop(originalImage.CreateShader.call(SKImageFilter,shader),cropRect);const paint=new SKPaint({Shader:shader,IsDither:true});try{return SKImageFilter.CreatePaint(paint,cropRect);}finally{paint.Dispose();}};
  SKImageFilter.CreateImage=function(image,...args){if(args.length===0)return originalImage.CreateImage.call(SKImageFilter,image);if(args[0] instanceof api.SKSamplingOptions)return originalImage.CreateImage.call(SKImageFilter,image,undefined,undefined,args[0]);return originalImage.CreateImage.call(SKImageFilter,image,...args);};
  function lighting(type,specular,args){let position=args.shift(),target=null,exponent=1,cutoff=90;if(type==='spot'){target=args.shift();exponent=args.shift();cutoff=args.shift();}const color=args.shift(),scale=args.shift(),coefficient=args.shift(),shininess=specular?args.shift():1,input=args.shift()??null,cropRect=args.shift();const point=p=>p.ToArray?.()??[p.X,p.Y,p.Z];return crop(new SoftwareImageFilter('lighting',{type,specular,position:point(position),target:target?point(target):null,exponent,cutoff,color:rgba(color),scale,coefficient,shininess},[input]),cropRect);}
  for(const [name,type] of [['Distant','distant'],['Point','point'],['Spot','spot']])for(const [suffix,specular] of [['Diffuse',false],['Specular',true]])SKImageFilter['Create'+name+'Lit'+suffix]=(...args)=>lighting(type,specular,args);
  SKImageFilter.CreateCompose=(outer,inner)=>outer?._software||inner?._software?new SoftwareImageFilter('compose',{},[outer,inner]):originalImage.CreateCompose.call(SKImageFilter,outer,inner);
  SKImageFilter.CreateColorFilter=(cf,input=null,cropRect)=>crop(cf?._software||input?._software?new SoftwareImageFilter('color',{},[input],[cf]):originalImage.CreateColorFilter.call(SKImageFilter,cf,input),cropRect);
  SKImageFilter.CreateMerge=function(...args){let filters,cropRect;if(Array.isArray(args[0]))[filters,cropRect]=args;else {filters=args.slice(0,2);cropRect=args[2];}return crop(new SoftwareImageFilter('merge',{},filters),cropRect);};
  for(const [name,index] of [['CreateDilate',2],['CreateErode',2],['CreateOffset',2],['CreateMatrix',2],['CreateDropShadow',5],['CreateDropShadowOnly',5]])SKImageFilter[name]=function(...args){const before=args.slice(0,index),input=args[index]??null,cropRect=args[index+1];return crop(input?._software?new SoftwareImageFilter('nativeUnary',{name,before:before.map(v=>v?.ToFloatArray?.()??v?.ToNative?.()??v?.ToArray?.()??v),after:[]},[input]):originalImage[name].call(SKImageFilter,...before,input),cropRect);};
  SKImageFilter.CreateBlur=function(sx,sy,...args){let tile=K.TileMode.Decal,input=null,cropRect;if(args[0]?.value!==undefined||typeof args[0]==='number'){tile=args.shift();input=args.shift()??null;cropRect=args.shift();}else{input=args.shift()??null;cropRect=args.shift();}return crop(input?._software?new SoftwareImageFilter('nativeUnary',{name:'CreateBlur',before:[sx,sy],after:[tile]},[input]):originalImage.CreateBlur.call(SKImageFilter,sx,sy,input,tile),cropRect);};
  SKImageFilter.CreateBlendMode=function(mode,background=null,foreground=null,cropRect){return crop(mode instanceof api.SKBlender?new SoftwareImageFilter('blender',{},[background,foreground],[mode]):background?._software||foreground?._software?new SoftwareImageFilter('nativeBinary',{name:'CreateBlendMode',before:[mode]},[background,foreground]):originalImage.CreateBlendMode.call(SKImageFilter,mode,background,foreground),cropRect);};
  SKImageFilter.CreateDisplacementMapEffect=(x,y,scale,displacement=null,input=null,cropRect)=>crop(displacement?._software||input?._software?new SoftwareImageFilter('nativeBinary',{name:'CreateDisplacementMapEffect',before:[x,y,scale]},[displacement,input]):originalImage.CreateDisplacementMapEffect.call(SKImageFilter,x,y,scale,displacement,input),cropRect);
  SKColorFilter.prototype.ApplyFloatPixels=function(pixels,width=pixels.length/4,height=1){this.ThrowIfDisposed();if(!(pixels instanceof Float32Array))throw new TypeError('ApplyFloatPixels requires Float32Array RGBA components.');return evaluateColor(this,floatInput(pixels,width,height)).pixels;};
  SKColorFilter.prototype.ApplyPixels=function(pixels,width=pixels.length/4,height=1){this.ThrowIfDisposed();return quantize(evaluateColor(this,floatInput(pixels,width,height)).pixels);};
  SKImageFilter.prototype.ApplyFloatPixels=function(pixels,width,height){this.ThrowIfDisposed();if(!(pixels instanceof Float32Array))throw new TypeError('ApplyFloatPixels requires Float32Array RGBA components.');return evaluateImage(this,floatInput(pixels,width,height)).pixels;};
  SKImageFilter.prototype.ApplyPixels=function(pixels,width,height){this.ThrowIfDisposed();return quantize(evaluateImage(this,floatInput(pixels,width,height)).pixels);};
  function applySoftwareEffects(pixels,width,height,paint,coverage=null,ctm=null){assertFrame(pixels,width,height);let out=frame(pixels,width,height);const cf=paint?._effects?.ColorFilter,im=paint?._effects?.ImageFilter;if(cf){if(coverage)for(let i=0;i<out.pixels.length;i+=4)out.pixels[i+3]=coverage[i+3]?Math.min(1,out.pixels[i+3]/coverage[i+3]):0;out=evaluateColor(cf,out);if(coverage)for(let i=0;i<out.pixels.length;i+=4)out.pixels[i+3]=out.pixels[i+3]*coverage[i+3];}if(im)out=evaluateImage(im,out,ctm);return pixels instanceof Float32Array?out.pixels:quantize(out.pixels);}
  function renderPaintEffects(canvas,paint,drawNative){
    const original=canvas._native,matrix=Array.from(original.getTotalMatrix()),clip=Array.from(original.getDeviceClipBounds()),bounded=!paint._effects?.ImageFilter;
    const left=bounded?Math.max(0,Math.floor(clip[0])):0,top=bounded?Math.max(0,Math.floor(clip[1])):0;
    const width=bounded?Math.max(0,Math.ceil(clip[2])-left):(canvas._owner?.Width??Math.ceil(clip[2])),height=bounded?Math.max(0,Math.ceil(clip[3])-top):(canvas._owner?.Height??Math.ceil(clip[3]));if(width===0||height===0)return;
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width*height>67108864)throw new RangeError('Software effects require finite surface bounds.');
    EffectDiagnostics.PeakCapturePixels=Math.max(EffectDiagnostics.PeakCapturePixels,width*height);
    const surface=makeSurface(width,height),nativePaint=paint._native.copy(),compositePaint=new K.Paint();let image=null;
    try{nativePaint.setColorFilter(null);nativePaint.setImageFilter(null);nativePaint.setBlendMode(K.BlendMode.SrcOver);canvas._native=surface.getCanvas();canvas._native.translate(-left,-top);canvas._native.concat(matrix);drawNative(nativePaint);const raw=readFloat(surface.getCanvas(),width,height);if(!raw)throw new Error('Software effect capture failed.');let coverage=null;if(paint._effects?.ColorFilter){const constant=K.ColorFilter.MakeBlend(K.WHITE,K.BlendMode.Src);try{surface.getCanvas().clear(K.TRANSPARENT);nativePaint.setColorFilter(constant);nativePaint.setAlphaf(1);drawNative(nativePaint);coverage=readFloat(surface.getCanvas(),width,height);}finally{constant.delete();}}canvas._native=original;image=makeImage(applySoftwareEffects(raw,width,height,paint,coverage,matrix),width,height);if(!image)throw new Error('Software effect image allocation failed.');compositePaint.setBlendMode(paint.BlendMode);const saved=original.save();try{const inverse=K.Matrix.invert(matrix);if(!inverse)throw new RangeError('Software effects require an invertible canvas matrix.');original.concat(inverse);original.drawImage(image,left,top,compositePaint);}finally{original.restoreToCount(saved);}}
    finally{canvas._native=original;image?.delete();nativePaint.delete();compositePaint.delete();surface.dispose();}
  }
  return {EffectDiagnostics,PurgeEffectCache,makeEffectSurface:makeSurface,effectImageInfo:info,makeEffectImage:makeImage,readEffectPixels:readFloat,SKHighContrastConfig,SKHighContrastConfigInvertStyle,SoftwareColorFilter,SoftwareImageFilter,applySoftwareEffects,renderPaintEffects,evaluateColorFilter:evaluateColor,evaluateImageFilter:evaluateImage};
}
