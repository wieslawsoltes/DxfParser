/** Audited JavaScript adaptations of value, canvas, and text overloads.
 * C# ref/out values are mutable destination objects/arrays. Raw native pointers
 * are deliberately excluded; use typed arrays in browser code.
 */
export function installOverloads(K, api) {
  if(api.__overloadsInstalled)return api;
  Object.defineProperty(api,'__overloadsInstalled',{value:true});
  const {SKPoint,SKPointI,SKSize,SKSizeI,SKRect,SKRectI,SKMatrix,SKPath,SKCanvas,SKFont,SKPaint}=api;
  const arr=v=>v?.ToArray?.()??v?.Values??v;
  const val=v=>v?.value??v;
  const native=v=>v?._native??v;
  const point=v=>v&&typeof v==='object'&&('X'in v||'x'in v);
  const xy=v=>[v?.X??v?.x??v?.[0]??0,v?.Y??v?.y??v?.[1]??0];
  const array=v=>Array.isArray(v)||ArrayBuffer.isView(v);
  const rect=v=>v instanceof SKRect||v?.Left!==undefined;
  const areaEmpty=r=>r.Width<=0||r.Height<=0;
  const matrix=v=>v&&((arr(v)?.length===9)||(arr(v)?.length===16));
  const patch=(type,name,fn)=>{const old=type.prototype[name];type.prototype[name]=function(...a){return fn.call(this,old,...a);};};
  const prop=(type,name,get,set)=>Object.defineProperty(type.prototype,name,{configurable:true,enumerable:true,get,set});
  const output=(destination,values)=>{if(destination.length<values.length&&!Array.isArray(destination))throw new RangeError('Output buffer is too small.');for(let i=0;i<values.length;i++)destination[i]=values[i];return destination;};
  const en=(table,v,fallback)=>typeof v==='string'?table[v]:(table.values?.[val(v)]??Object.values(table).find(x=>x?.value===val(v))??fallback);
  const hash=values=>{let h=2166136261;for(const ch of JSON.stringify(values)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h|0;};
  const id4=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  class SKPoint3 extends SKPoint {
    constructor(x=0,y=0,z=0){super(x,y);this.Z=z;}
    get IsEmpty(){return !this.X&&!this.Y&&!this.Z;}get Length(){return Math.hypot(this.X,this.Y,this.Z);}
    ToArray(){return [this.X,this.Y,this.Z];}Equals(p){return p instanceof SKPoint3&&this.X===p.X&&this.Y===p.Y&&this.Z===p.Z;}
    static Add(a,b){return new this(a.X+b.X,a.Y+b.Y,a.Z+b.Z);}static Subtract(a,b){return new this(a.X-b.X,a.Y-b.Y,a.Z-b.Z);}
    static get Empty(){return new this();}
  }
  class SKRotationScaleMatrix {
    constructor(scos=0,ssin=0,tx=0,ty=0){Object.assign(this,{SCos:scos,SSin:ssin,TX:tx,TY:ty});}
    get Tx(){return this.TX;}set Tx(v){this.TX=v;}get Ty(){return this.TY;}set Ty(v){this.TY=v;}
    ToArray(){return [this.SCos,this.SSin,this.TX,this.TY];}
    ToMatrix(){return new SKMatrix(this.SCos,-this.SSin,this.TX,this.SSin,this.SCos,this.TY,0,0,1);}
    Equals(v){return !!v&&this.ToArray().every((n,i)=>n===arr(v)[i]);}
    static get Empty(){return new this();}static get Identity(){return new this(1,0,0,0);}
    static Create(scale,radians,tx=0,ty=0,anchorX=0,anchorY=0){const c=scale*Math.cos(radians),s=scale*Math.sin(radians);return new this(c,s,tx-c*anchorX+s*anchorY,ty-s*anchorX-c*anchorY);}
    static CreateDegrees(scale,degrees,...a){return this.Create(scale,degrees*Math.PI/180,...a);}
    static CreateIdentity(){return this.Identity;}static CreateTranslation(x,y){return new this(1,0,x,y);}static CreateScale(s){return new this(s,0,0,0);}
    static CreateRotation(r,ax=0,ay=0){return this.Create(1,r,0,0,ax,ay);}static CreateRotationDegrees(d,ax=0,ay=0){return this.CreateRotation(d*Math.PI/180,ax,ay);}
  }
  const M44Base=api.SKMatrix44;
  class SKMatrix44 extends M44Base {
    constructor(...values){let a=values.length===0?Array(16).fill(0):values.length===1?Array.from(arr(values[0])):values;if(a.length===9)a=[a[0],a[3],0,a[6],a[1],a[4],0,a[7],0,0,1,0,a[2],a[5],0,a[8]];super(a);}
    static get Identity(){return new this(id4());}static CreateIdentity(){return this.Identity;}
    static CreateTranslation(x,y,z){return new this(1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1);}
    static CreateRotation(x,y,z,r){const c=Math.cos(r),s=Math.sin(r),t=1-c;return new this(x*x*t+c,x*y*t+z*s,x*z*t-y*s,0,x*y*t-z*s,y*y*t+c,y*z*t+x*s,0,x*z*t+y*s,y*z*t-x*s,z*z*t+c,0,0,0,0,1);}
    static get Empty(){return new this(Array(16).fill(0));}
    static FromRowMajor(v){return new this(v);}static FromColumnMajor(v){return new this(K.M44.transpose(Array.from(v)));}
    static CreateScale(x,y=x,z=x,px=0,py=0,pz=0){return new this(x,0,0,0,0,y,0,0,0,0,z,0,px*(1-x),py*(1-y),pz*(1-z),1);}
    static Concat(...a){if(a.length===3){const [target,x,y]=a;target._values=K.M44.multiply(arr(x),arr(y));return target;}return new this(K.M44.multiply(arr(a[0]),arr(a[1])));}
    static Negate(v){return new this(arr(v).map(x=>-x));}static Add(a,b){return new this(arr(a).map((v,i)=>v+arr(b)[i]));}static Subtract(a,b){return new this(arr(a).map((v,i)=>v-arr(b)[i]));}
    static Multiply(a,b){return typeof b==='number'?new this(arr(a).map(v=>v*b)):this.Concat(a,b);}
    get Values(){return this._values.slice();}set Values(v){if(v.length!==16)throw new RangeError('Sixteen values required.');this._values=Array.from(v);}
    get Matrix(){return this.ToMatrix();}set Matrix(m){this._values=new SKMatrix44(m)._values;}
    ToMatrix(){const m=this._values;return new SKMatrix(m[0],m[4],m[12],m[1],m[5],m[13],m[3],m[7],m[15]);}
    MapScalars(v){if(v.length!==4)throw new RangeError('Four scalars required.');return Array.from({length:4},(_,i)=>v.reduce((s,n,j)=>s+this._values[j*4+i]*n,0));}
    ToRowMajor(out){return out?output(out,this.Values):this.Values;}ToColumnMajor(out){const v=K.M44.transpose(this._values);return out?output(out,v):v;}
    get IsInvertible(){return Number.isFinite(this.Determinant())&&Math.abs(this.Determinant())>0;}
    TryInvert(out){const d=this.Determinant();let value=null;if(Number.isFinite(d)&&d!==0){try{value=K.M44.invert(this._values);}catch{}}
      const inverse=value?new SKMatrix44(value):SKMatrix44.Empty;if(out){out.Values=inverse.Values;return !!value;}return {Success:!!value,Inverse:inverse};}
    Invert(){return this.TryInvert().Inverse;}
    Transpose(){return new SKMatrix44(K.M44.transpose(this._values));}
    PreConcat(m){return SKMatrix44.Concat(this,m);}PostConcat(m){return SKMatrix44.Concat(m,this);}
    Determinant(){const m=this._values;const minor=(r,c)=>{const a=m.filter((_,i)=>Math.floor(i/4)!==r&&i%4!==c);return a[0]*(a[4]*a[8]-a[5]*a[7])-a[1]*(a[3]*a[8]-a[5]*a[6])+a[2]*(a[3]*a[7]-a[4]*a[6]);};return m.slice(0,4).reduce((s,v,c)=>s+(c%2?-1:1)*v*minor(0,c),0);}
    MapPoint(x,y,z){let is3=z!==undefined;if(point(x)){is3=x.Z!==undefined;[x,y,z]=[x.X,x.Y,x.Z??0];}const v=this.MapScalars([x,y,z??0,1]);return is3?new SKPoint3(v[0],v[1],v[2]):new SKPoint(v[0],v[1]);}
    Equals(other){return !!other&&this._values.every((v,i)=>v===arr(other)[i]);}
    Get(row,col){if(row<0||row>3||col<0||col>3)throw new RangeError('Matrix index outside 0..3.');return super.Get(row,col);}
    Set(row,col,value){if(row<0||row>3||col<0||col>3)throw new RangeError('Matrix index outside 0..3.');return super.Set(row,col,value);}
  }
  for(let r=0;r<4;r++)for(let c=0;c<4;c++)prop(SKMatrix44,`M${r}${c}`,function(){return this.Get(r,c);},function(v){this.Set(r,c,v);});
  const concat3=SKMatrix.Concat;SKMatrix.Concat=function(...a){if(a.length===3){a[0].Values=concat3.call(this,a[1],a[2]).Values;return a[0];}return concat3.apply(this,a);};
  patch(SKMatrix,'TryInvert',function(old,out){const result=old.call(this);if(out){out.Values=result.Inverse.Values;return result.Success;}return result;});
  for(const method of ['MapPoints','MapVectors'])patch(SKMatrix,method,function(old,dst,source){if(source){return output(dst,old.call(this,source));}return old.call(this,dst);});
  SKPoint.prototype.ToSize=function(){return new SKSize(this.X,this.Y);};SKPointI.prototype.ToSize=function(){return new SKSizeI(this.X,this.Y);};
  SKPoint.prototype.ToString=function(){return `{X=${this.X}, Y=${this.Y}}`;};
  SKPoint3.prototype.ToString=function(){return `{X=${this.X}, Y=${this.Y}, Z=${this.Z}}`;};
  SKSize.prototype.ToString=function(){return `{Width=${this.Width}, Height=${this.Height}}`;};
  SKSizeI.Floor=function(s){return new this(Math.floor(s.Width),Math.floor(s.Height));};
  SKRect.prototype.ToString=function(){return `{Left=${this.Left}, Top=${this.Top}, Width=${this.Width}, Height=${this.Height}}`;};
  SKRect.prototype.ContainsRect=SKRect.prototype.Contains;
  SKRect.prototype.IntersectsWithInclusive=function(r){return this.Left<=r.Right&&this.Right>=r.Left&&this.Top<=r.Bottom&&this.Bottom>=r.Top;};
  SKRect.prototype.AspectFit=function(size){const s=Math.min(this.Width/size.Width,this.Height/size.Height);return SKRect.Create(this.MidX-size.Width*s/2,this.MidY-size.Height*s/2,size.Width*s,size.Height*s);};
  SKRect.prototype.AspectFill=function(size){const s=Math.max(this.Width/size.Width,this.Height/size.Height);return SKRect.Create(this.MidX-size.Width*s/2,this.MidY-size.Height*s/2,size.Width*s,size.Height*s);};
  SKRect.Ceiling=r=>new SKRectI(...r.ToArray().map(Math.ceil));SKRect.Floor=r=>new SKRectI(...r.ToArray().map(Math.floor));SKRect.Truncate=r=>new SKRectI(...r.ToArray().map(Math.trunc));
  patch(SKRect,'Inflate',function(old,x,y){if(x?.Width!==undefined)return old.call(this,x.Width,x.Height);return old.call(this,x,y??x);});
  const RRBase=api.SKRoundRect;
  class SKRoundRect extends RRBase{constructor(...a){if(a[0] instanceof RRBase){super(a[0].Rect);this.SetRectRadii(a[0].Rect,a[0]._radii);}else super(...a);}}
  Object.defineProperty(SKRoundRect,Symbol.hasInstance,{value:v=>v instanceof RRBase});
  const SKRoundRectType=Object.freeze({Empty:0,Rect:1,Oval:2,Simple:3,NinePatch:4,Complex:5});
  prop(RRBase,'IsEmpty',function(){return this._rect.Width<=0||this._rect.Height<=0;});
  prop(RRBase,'Radii',function(){return this._radii.map(p=>new SKPoint(p.X,p.Y));});
  prop(RRBase,'Type',function(){return this.IsEmpty?0:this.IsRect?1:this.IsOval?2:this.IsSimple?3:this._radii[0].X===this._radii[3].X&&this._radii[1].X===this._radii[2].X&&this._radii[0].Y===this._radii[1].Y&&this._radii[2].Y===this._radii[3].Y?4:5;});
  prop(RRBase,'IsValid',function(){return this._rect.IsFinite&&this._radii.every(p=>Number.isFinite(p.X)&&Number.isFinite(p.Y)&&p.X>=0&&p.Y>=0);});
  prop(RRBase,'AllCornersCircular',function(){return this.CheckAllCornersCircular(0);});
  RRBase.prototype.CheckAllCornersCircular=function(tolerance=0){return this._radii.every(p=>Math.abs(p.X-p.Y)<=tolerance);};
  patch(RRBase,'SetRect',function(old,r,x,y=x){return x===undefined?old.call(this,r):this.SetRectXY(r,x,y);});
  RRBase.prototype.SetNinePatch=function(r,l,t,right,b){return this.SetRectRadii(r,[new SKPoint(l,t),new SKPoint(right,t),new SKPoint(right,b),new SKPoint(l,b)]);};
  RRBase.prototype.Inflate=function(x,y=x){if(x?.Width!==undefined)[x,y]=[x.Width,x.Height];const r=this.Rect.Inflate(x,y);if(areaEmpty(r))return this.SetEmpty();return this.SetRectRadii(r,this._radii.map(p=>new SKPoint(Math.max(0,p.X+x),Math.max(0,p.Y+y))));};
  RRBase.prototype.Deflate=function(x,y=x){if(x?.Width!==undefined)[x,y]=[x.Width,x.Height];return this.Inflate(-x,-y);};
  RRBase.prototype.TryTransform=function(m,out){const a=arr(m),eps=1e-12,axis=Math.abs(a[1])<eps&&Math.abs(a[3])<eps,swap=Math.abs(a[0])<eps&&Math.abs(a[4])<eps;let result=null;
    if((axis||swap)&&Math.abs(a[6])<eps&&Math.abs(a[7])<eps&&a[8]===1){const r=m.MapRect(this.Rect),corners=[[this.Rect.Left,this.Rect.Top],[this.Rect.Right,this.Rect.Top],[this.Rect.Right,this.Rect.Bottom],[this.Rect.Left,this.Rect.Bottom]],rs=Array(4);corners.forEach((p,i)=>{const q=m.MapPoint(...p),j=(Math.abs(q.Y-r.Bottom)<eps?3:0)+(Math.abs(q.X-r.Right)<eps?1:0),index=j===4?2:j;const v=this._radii[i];rs[index]=axis?new SKPoint(Math.abs(a[0])*v.X,Math.abs(a[4])*v.Y):new SKPoint(Math.abs(a[1])*v.Y,Math.abs(a[3])*v.X);});result=new SKRoundRect().SetRectRadii(r,rs);}
    if(out){if(result){if(out instanceof RRBase)out.SetRectRadii(result.Rect,result.Radii);else out.Value=result;}return !!result;}return {Success:!!result,Transformed:result};};
  RRBase.prototype.Transform=function(m){return this.TryTransform(m).Transformed;};
  Object.assign(api,{SKPoint3,SKRotationScaleMatrix,SKMatrix44,SKRoundRect,SKRoundRectType});
  prop(SKRect,'IsEmpty',function(){return this.Left===0&&this.Top===0&&this.Right===0&&this.Bottom===0;});
  prop(RRBase,'IsEmpty',function(){return this.Width<=0||this.Height<=0;});
  patch(SKPath,'AddRoundRect',function(old,bounds,...args){
    if(!(bounds instanceof RRBase)||args[1]===undefined)return old.call(this,bounds,...args);
    const direction=args[0],index=args[1];if(!Number.isInteger(index)||index<0||index>4294967295)throw new RangeError('startIndex must be an unsigned 32-bit integer.');
    const r=bounds.Rect,rad=bounds.Radii,[l,t,right,b]=r.ToArray(),pts=[[l+rad[0].X,t],[right-rad[1].X,t],[right,t+rad[1].Y],[right,b-rad[2].Y],[right-rad[2].X,b],[l+rad[3].X,b],[l,b-rad[3].Y],[l,t+rad[0].Y]],corners=[[l,t],[right,t],[right,b],[l,b]],ccw=val(direction)===1||direction==='CounterClockwise'||direction==='CCW',step=ccw?-1:1;
    let at=index%8;this.MoveTo(...pts[at]);for(let i=0;i<8;i++){const next=(at+step+8)%8,curved=ccw?at%2===0:at%2===1;if(curved){const c=corners[ccw?at/2:(at+1)/2%4];this.ConicTo(...c,...pts[next],Math.SQRT1_2);}else this.LineTo(...pts[next]);at=next;}this.Close();return this;
  });

  for(const T of [SKPoint,SKPointI,SKPoint3,SKSize,SKSizeI,SKRect,SKRectI,SKMatrix,SKMatrix44,SKRotationScaleMatrix,api.SKColor,api.SKColorF])if(!T.prototype.GetHashCode)T.prototype.GetHashCode=function(){return hash(this.ToArray());};

  // Canvas overload dispatch delegates to real Skia draw calls.
  patch(SKCanvas,'Scale',function(old,x,y=x,px,py){if(point(x))[x,y]=xy(x);if(px!==undefined){this.Translate(px,py);old.call(this,x,y);this.Translate(-px,-py);}else old.call(this,x,y);});
  patch(SKCanvas,'Concat',function(old,m){return old.call(this,m instanceof SKMatrix44?m.ToColumnMajor():m);});
  patch(SKCanvas,'Skew',function(old,x,y){if(point(x))[x,y]=xy(x);return old.call(this,x,y);});
  patch(SKCanvas,'DrawColor',function(old,c,mode=K.BlendMode.Src){return old.call(this,c,mode);});
  patch(SKCanvas,'DrawPoint',function(old,...a){const p=a.at(-1);if(p instanceof api.SKColor||p instanceof api.SKColorF){const paint=new SKPaint({Color:p});try{return old.apply(this,[...a.slice(0,-1),paint]);}finally{paint.Dispose();}}return old.apply(this,a);});
  patch(SKCanvas,'DrawPicture',function(old,p,...a){if(typeof a[0]==='number'){const [x,y,paint]=a;return old.call(this,p,SKMatrix.CreateTranslation(x,y),paint);}if(point(a[0]))return old.call(this,p,SKMatrix.CreateTranslation(...xy(a[0])),a[1]);if(a[0] instanceof SKPaint)return old.call(this,p,null,a[0]);return old.call(this,p,...a);});
  SKCanvas.prototype.DrawSurface=function(surface,...a){const image=surface.Snapshot();try{this.DrawImage(image,...a);}finally{image.Dispose();}};
  SKCanvas.prototype.DrawDrawable=function(drawable,...a){return drawable.Draw(this,...a);};
  patch(SKCanvas,'DrawPatch',function(old,points,colors,tex,blend,paint){if(blend instanceof SKPaint||blend==null){paint=blend;blend=K.BlendMode.Modulate;}this._complex();return this._paint(paint,q=>this._native.drawPatch(points.flatMap(p=>arr(p)),colors?new Uint32Array(Array.from(colors,c=>c.ToUint?.()??c)):null,tex?.flatMap(p=>arr(p)),blend,q));});
  patch(SKCanvas,'DrawVertices',function(old,...a){if(a[0] instanceof api.SKVertices)return old.apply(this,a);const mode=a.shift(),positions=a.shift(),paint=a.pop();let tex=null,colors=null,indices=null,blend=K.BlendMode.Modulate;if(a.length===1)[colors]=a;else if(a.length===2)[tex,colors]=a;else if(a.length===3)[tex,colors,indices]=a;else [tex,colors,blend,indices]=a;const v=api.SKVertices.CreateCopy(mode,positions,tex,colors,indices);try{return old.call(this,v,blend,paint);}finally{v.Dispose();}});
  patch(SKCanvas,'DrawAtlas',function(old,image,sprites,transforms,...a){const cull=a.find(rect);a=a.filter(v=>v!==cull);if(cull&&this.QuickReject(cull))return;let paint=a.at(-1) instanceof SKPaint?a.pop():null;const own=!paint;if(own)paint=new SKPaint();let colors=null,mode=K.BlendMode.SrcOver,sample;for(const v of a){if(v instanceof api.SKSamplingOptions)sample=v.ToNative();else if(array(v))colors=new Uint32Array(Array.from(v,c=>c.ToUint?.()??c));else if(v!=null)mode=v;}this._complex();try{return this._paint(paint,q=>this._native.drawAtlas(native(image),sprites.flatMap(r=>arr(r)),transforms.flatMap(t=>arr(t)),q,mode,colors,sample));}finally{if(own)paint.Dispose();}});
  patch(SKCanvas,'QuickReject',function(old,shape){this._check();if(shape instanceof SKPath)shape=shape.Bounds;return this._native.quickReject(arr(shape));});
  prop(SKCanvas,'Surface',function(){return this._owner instanceof api.SKSurface?this._owner:null;});
  prop(SKCanvas,'Context',function(){return this._owner?.Context??this._owner?._grContext??null;});
  prop(SKCanvas,'TotalMatrix44',function(){this._check();return SKMatrix44.FromColumnMajor(this._native.getLocalToDevice());});
  prop(SKCanvas,'LocalClipBounds',function(){const inverse=this.TotalMatrix.TryInvert();return inverse.Success?inverse.Inverse.MapRect(this.DeviceClipBounds):SKRect.Empty;});
  prop(SKCanvas,'IsClipEmpty',function(){return areaEmpty(this.DeviceClipBounds);});
  SKCanvas.prototype.GetLocalClipBounds=function(out){const r=this.LocalClipBounds;if(out)Object.assign(out,r);return !areaEmpty(r);};
  SKCanvas.prototype.GetDeviceClipBounds=function(out){const r=this.DeviceClipBounds;if(out)Object.assign(out,r);return !areaEmpty(r);};
  const boundary=region=>{if(!region?.GetBoundaryPath)throw new TypeError('Expected SKRegion.');return region.GetBoundaryPath();};
  SKCanvas.prototype.DrawRegion=function(region,paint){const path=boundary(region);try{this.DrawPath(path,paint);}finally{path.Dispose();}};
  SKCanvas.prototype.ClipRegion=function(region,operation=K.ClipOp.Intersect){const path=boundary(region),saved=this.TotalMatrix44;try{this.ResetMatrix();this.ClipPath(path,operation,false);}finally{this.SetMatrix(saved);path.Dispose();}};
  SKCanvas.prototype.Discard=function(){this._check();}; // Skia discard is a permitted optimization hint.
  const SKCanvasSaveLayerRecFlags=Object.freeze({None:0,PreserveLCDText:2,InitWithPrevious:4,F16ColorType:16});
  class SKCanvasSaveLayerRec{constructor(bounds=null,paint=null,backdrop=null,flags=0){if(bounds&&!rect(bounds)&&'Bounds'in bounds)Object.assign(this,bounds);else Object.assign(this,{Bounds:bounds,Paint:paint,Backdrop:backdrop,Flags:flags});}}
  patch(SKCanvas,'SaveLayer',function(old,...a){if(a[0] instanceof SKCanvasSaveLayerRec||a[0]?.Backdrop!==undefined||a[0]?.Flags!==undefined){const rec=a[0];this._complex();const count=this._native.saveLayer(native(rec.Paint)||undefined,rec.Bounds?arr(rec.Bounds):null,native(rec.Backdrop)||undefined,val(rec.Flags)||0);this._clipStack[count]=this._clipDirty;return count;}return old.apply(this,a);});
  const SKLatticeRectType=Object.freeze({Default:0,Transparent:1,FixedColor:2});
  class SKLattice{constructor(xDivs=[],yDivs=[],rectTypes=null,bounds=null,colors=null){if(!array(xDivs))Object.assign(this,xDivs);else Object.assign(this,{XDivs:xDivs,YDivs:yDivs,RectTypes:rectTypes,Bounds:bounds,Colors:colors});}Equals(v){return !!v&&JSON.stringify(this)===JSON.stringify(v);}GetHashCode(){return hash(this);}}
  function latticeAxis(divs,start,end,outStart,outEnd){let previous=start;for(const d of divs){if(!Number.isInteger(d)||d<previous||d>end)throw new RangeError('Lattice divisions must be sorted within the source bounds.');previous=d;}const source=[start,...divs,end],fixed=source.slice(1).reduce((s,v,i)=>s+(i%2===0?v-source[i]:0),0),stretch=end-start-fixed,available=Math.max(0,outEnd-outStart),scale=available<fixed?available/fixed:1,dest=[outStart];for(let i=0;i<source.length-1;i++){const length=source[i+1]-source[i],d=i%2===0?length*scale:stretch?length*Math.max(0,available-fixed)/stretch:0;dest.push(dest.at(-1)+d);}if(stretch===0&&available>fixed&&fixed>0)for(let i=1;i<dest.length;i++)dest[i]=outStart+(dest[i]-outStart)*available/fixed;return {source,dest};}
  SKCanvas.prototype.DrawImageLattice=function(image,...args){this._complex();let lattice,dst;if(array(args[0])){lattice=new SKLattice(args.shift(),args.shift());dst=args.shift();}else{lattice=args.shift();dst=args.shift();}let filter=K.FilterMode.Nearest,paint=null;if(args[0] instanceof SKPaint||args[0]==null)paint=args[0]??null;else [filter,paint]=args;filter=en(K.FilterMode,filter,K.FilterMode.Nearest);const bounds=lattice.Bounds??SKRect.Create(image.Width,image.Height);if(bounds.Left<0||bounds.Top<0||bounds.Right>image.Width||bounds.Bottom>image.Height)throw new RangeError('Lattice bounds outside image.');const x=latticeAxis(lattice.XDivs,bounds.Left,bounds.Right,dst.Left,dst.Right),y=latticeAxis(lattice.YDivs,bounds.Top,bounds.Bottom,dst.Top,dst.Bottom),nx=x.source.length-1,ny=y.source.length-1;
    if(lattice.RectTypes&&lattice.RectTypes.length!==nx*ny)throw new RangeError('One lattice rect type is required per cell.');if(lattice.Colors&&lattice.Colors.length!==nx*ny)throw new RangeError('One lattice color is required per cell.');
    let colorPaint=null;try{for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const cell=j*nx+i,type=val(lattice.RectTypes?.[cell]??0);if(type===1)continue;const d=new SKRect(x.dest[i],y.dest[j],x.dest[i+1],y.dest[j+1]);if(areaEmpty(d))continue;if(type===2){if(!lattice.Colors)throw new TypeError('FixedColor lattice cells require Colors.');colorPaint??=paint?.Clone()??new SKPaint();colorPaint.Color=lattice.Colors[cell];colorPaint.Shader=null;this.DrawRect(d,colorPaint);}else if(type===0){const src=new SKRect(x.source[i],y.source[j],x.source[i+1],y.source[j+1]);if(!areaEmpty(src))this.DrawImage(image,src,d,new api.SKSamplingOptions(filter),paint);}else throw new RangeError('Unknown lattice rect type.');}}finally{colorPaint?.Dispose();}
  };
  SKCanvas.prototype.DrawBitmapLattice=function(bitmap,...a){const image=api.SKImage.FromBitmap(bitmap);try{return this.DrawImageLattice(image,...a);}finally{image.Dispose();}};
  SKCanvas.prototype.DrawImageNinePatch=function(image,center,dst,filter=K.FilterMode.Nearest,paint=null){if(filter instanceof SKPaint||filter===null){paint=filter;filter=K.FilterMode.Nearest;}this._complex();return this._paint(paint,q=>this._native.drawImageNine(native(image),arr(center),arr(dst),en(K.FilterMode,filter,K.FilterMode.Nearest),q));};
  SKCanvas.prototype.DrawBitmapNinePatch=function(bitmap,...a){const image=api.SKImage.FromBitmap(bitmap);try{return this.DrawImageNinePatch(image,...a);}finally{image.Dispose();}};
  Object.assign(api,{SKCanvasSaveLayerRec,SKCanvasSaveLayerRecFlags,SKLattice,SKLatticeRectType});
  // Text encoding and spans. UTF-16 glyph spans are disambiguated by method:
  // GetGlyphs accepts text/codepoints; width/path methods accept glyph ids.
  const SKTextEncoding=Object.freeze({Utf8:0,Utf16:1,Utf32:2,GlyphId:3});
  function decode(text,encoding=0){if(typeof text==='string')return text;if(Array.isArray(text)&&typeof text[0]==='string')return text.join('');if(text instanceof ArrayBuffer)text=new Uint8Array(text);if(text instanceof Uint8Array||text instanceof DataView){const bytes=new Uint8Array(text.buffer,text.byteOffset,text.byteLength),e=val(encoding);if(e===0)return new TextDecoder('utf-8').decode(bytes);if(e===1){if(bytes.length%2)throw new RangeError('UTF-16 input has odd byte length.');return new TextDecoder('utf-16le').decode(bytes);}if(e===2){if(bytes.length%4)throw new RangeError('UTF-32 input is not aligned.');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),chunks=[];for(let i=0;i<bytes.length;i+=4){const cp=view.getUint32(i,true);chunks.push(String.fromCodePoint(cp));}return chunks.join('');}if(e===3){if(bytes.length%2)throw new RangeError('GlyphId input has odd byte length.');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return Uint16Array.from({length:bytes.length/2},(_,i)=>view.getUint16(i*2,true));}throw new RangeError('Unknown text encoding.');}
    if(array(text)){const a=Array.from(text),chunks=[];for(let i=0;i<a.length;i+=4096)chunks.push(String.fromCodePoint(...a.slice(i,i+4096)));return chunks.join('');}return String(text??'');}
  const isBytes=v=>v instanceof Uint8Array||v instanceof ArrayBuffer||v instanceof DataView;
  const isEncoding=v=>typeof v==='number'||typeof v==='string'&&v in SKTextEncoding||v?.value!==undefined;
  const enc=v=>typeof v==='string'?SKTextEncoding[v]:val(v);
  const textArgs=(input,args,paint=false)=>{if(typeof input==='number')throw new TypeError('Native pointer overloads are unavailable in JavaScript; pass a typed array.');const a=args.slice();let encoding=0;if(isBytes(input)&&isEncoding(a[0]))encoding=enc(a.shift());const decoded=isBytes(input)?decode(input,encoding):input;return {input:decoded,args:a,encoding};};
  const glyphInput=(font,input,encoding=0)=>input instanceof Uint16Array?input:(typeof input==='string'||isBytes(input)||Array.isArray(input)&&typeof input[0]==='string')?font.GetGlyphs(decode(input,encoding)):input;
  const getGlyphsBase=SKFont.prototype.GetGlyphs;
  SKFont.prototype.GetGlyphs=function(text,...args){const parsed=textArgs(text,args),s=parsed.input instanceof Uint16Array?parsed.input:decode(parsed.input),glyphs=s instanceof Uint16Array?s.slice():getGlyphsBase.call(this,s),dst=parsed.args[0];if(dst)return output(dst,glyphs);return glyphs;};
  SKFont.prototype.GetGlyph=function(cp){return this.GetGlyphs(String.fromCodePoint(cp))[0]??0;};SKFont.prototype.ContainsGlyph=function(cp){return this.GetGlyph(cp)!==0;};
  SKFont.prototype.ContainsGlyphs=function(text,...args){return Array.from(this.GetGlyphs(text,...args)).every(v=>v!==0);};
  SKFont.prototype.CountGlyphs=function(text,...args){const p=textArgs(text,args);return p.input instanceof Uint16Array?p.input.length:Array.from(decode(p.input)).length;};
  const widthsBase=SKFont.prototype.GetGlyphWidths,boundsBase=SKFont.prototype.GetGlyphBounds;
  SKFont.prototype.GetGlyphWidths=function(input,...args){const p=textArgs(input,args),glyphs=glyphInput(this,p.input),paint=p.args.find(v=>v instanceof SKPaint)??null,outs=p.args.filter(v=>array(v));const widths=widthsBase.call(this,glyphs,paint);if(outs.length>=2){output(outs[0],widths);output(outs[1],boundsBase.call(this,glyphs,paint));return widths;}if(outs.length===1){if(outs[0] instanceof Float32Array||outs[0] instanceof Float64Array)output(outs[0],widths);else output(outs[0],boundsBase.call(this,glyphs,paint));}return widths;};
  SKFont.prototype.GetGlyphBounds=function(input,...args){const p=textArgs(input,args),glyphs=glyphInput(this,p.input),paint=p.args.find(v=>v instanceof SKPaint)??null,bounds=boundsBase.call(this,glyphs,paint),out=p.args.find(array);return out?output(out,bounds):bounds;};
  SKFont.prototype.GetGlyphPositions=function(input,...args){const p=textArgs(input,args),glyphs=glyphInput(this,p.input),out=p.args.find(array),origin=p.args.find(point)??new SKPoint(),widths=widthsBase.call(this,glyphs,null);let x=origin.X;const positions=Array.from(widths,w=>{const q=new SKPoint(x,origin.Y);x+=w;return q;});return out?output(out,positions):positions;};
  SKFont.prototype.GetGlyphOffsets=function(input,...args){const p=textArgs(input,args),glyphs=glyphInput(this,p.input),out=p.args.find(array),origin=p.args.find(v=>typeof v==='number')??0,widths=widthsBase.call(this,glyphs,null);let x=origin;const offsets=Float32Array.from(widths,w=>{const q=x;x+=w;return q;});return out?output(out,offsets):offsets;};
  patch(SKFont,'MeasureText',function(old,input,...args){const p=textArgs(input,args),glyphs=p.input instanceof Uint16Array?p.input:typeof p.input==='string'?p.input:Array.isArray(p.input)&&typeof p.input[0]==='string'?p.input.join(''):p.input;return old.call(this,glyphs,...p.args);});
  patch(SKFont,'GetFontMetrics',function(old,out){const m=old.call(this);if(out){Object.assign(out,m);return m.Descent-m.Ascent+m.Leading;}return m;});
  // Keep the v0.1 convenience result without an out parameter; C# out forms
  // return Count and populate {Value, MeasuredWidth, MeasuredText}.
  SKFont.prototype.BreakText=function(input,...args){const p=textArgs(input,args),maxWidth=p.args.shift(),paint=p.args.find(v=>v instanceof SKPaint),out=p.args.find(v=>v&&typeof v==='object'&&!(v instanceof SKPaint)),s=decode(p.input),chars=Array.from(s),glyphs=this.GetGlyphs(s),widths=widthsBase.call(this,glyphs,paint);let measured=0,count=0,utf16=0;for(let i=0;i<widths.length;i++){if(measured+widths[i]>maxWidth)break;measured+=widths[i];utf16+=chars[i].length;count++;}const text=chars.slice(0,count).join(''),byteCount=p.encoding===0?new TextEncoder().encode(text).length:p.encoding===1?utf16*2:count*4,result={Count:isBytes(input)?byteCount:utf16,CodepointCount:count,MeasuredWidth:measured,Text:text,valueOf(){return this.Count;}};if(out){Object.assign(out,{Value:measured,MeasuredWidth:measured,MeasuredText:text,Text:text});return result.Count;}return result;};
  SKFont.prototype.GetTextPath=function(input,...args){const p=textArgs(input,args),glyphs=glyphInput(this,p.input),positions=p.args.find(array),origin=p.args.find(point)??new SKPoint(typeof p.args[0]==='number'?p.args[0]:0,typeof p.args[1]==='number'?p.args[1]:0),ps=positions??this.GetGlyphPositions(glyphs,origin),path=new SKPath();if(ps.length<glyphs.length)throw new RangeError('A position is required for each glyph.');try{for(let i=0;i<glyphs.length;i++){const glyph=this.GetGlyphPath(glyphs[i]);if(!glyph)continue;try{path.AddPath(glyph,...xy(ps[i]));}finally{glyph.Dispose();}}return path;}catch(error){path.Dispose();throw error;}};
  const pGetGlyphs=(paint,input)=>{const decoded=decode(input,paint.TextEncoding??0);return decoded instanceof Uint16Array?decoded:null;};
  for(const name of ['IsLinearText','SubpixelText','LcdRenderText','IsEmbeddedBitmapText','IsAutohinted','HintingLevel','TextEncoding'])prop(SKPaint,name,function(){return this._state[name]??(name==='IsEmbeddedBitmapText'?true:name==='TextEncoding'?0:false);},function(v){this.ThrowIfDisposed();this._state[name]=v;});
  patch(SKPaint,'ToFont',function(old){const font=old.call(this);font.LinearMetrics=this.IsLinearText;font.Subpixel=this.SubpixelText;font.EmbeddedBitmaps=this.IsEmbeddedBitmapText;if(this.LcdRenderText)font.Edging=K.FontEdging.SubpixelAntiAlias;if(this._state.HintingLevel!==undefined)font.Hinting=en(K.FontHinting,this.HintingLevel,K.FontHinting.Normal);return font;});
  for(const method of ['MeasureText','GetGlyphs','CountGlyphs','ContainsGlyphs','GetGlyphWidths','GetGlyphBounds','GetGlyphPositions','GetGlyphOffsets','GetTextPath','BreakText'])SKPaint.prototype[method]=function(input,...args){const font=this.ToFont();try{if(isBytes(input))input=decode(input,this.TextEncoding);return font[method](input,...args);}finally{font.Dispose();}};
  SKPaint.prototype.GetFontMetrics=function(out){const font=this.ToFont();try{return font.GetFontMetrics(out);}finally{font.Dispose();}};
  SKPaint.prototype.GetTextIntercepts=function(text,x,y,top,bottom){if(text instanceof api.SKTextBlob){return text.GetIntercepts?.(x,y,this)??text._native?.getIntercepts?.([x,y],native(this))??new Float32Array();}const font=this.ToFont();try{const glyphs=font.GetGlyphs(decode(text,this.TextEncoding));return font.GetGlyphIntercepts(glyphs,font.GetGlyphPositions(glyphs,new SKPoint(x,y)),top,bottom);}finally{font.Dispose();}};
  SKPaint.prototype.GetPositionedTextIntercepts=function(text,positions,top,bottom){const font=this.ToFont();try{return font.GetGlyphIntercepts(font.GetGlyphs(decode(text,this.TextEncoding)),positions,top,bottom);}finally{font.Dispose();}};
  SKPaint.prototype.GetHorizontalTextIntercepts=function(text,xpositions,y,top,bottom){return this.GetPositionedTextIntercepts(text,Array.from(xpositions,x=>new SKPoint(x,y)),top,bottom);};
  SKPaint.prototype.SetColor=function(color,colorSpace=null){this.ThrowIfDisposed();this._native.setColor(arr(color),native(colorSpace)||undefined);};
  SKPaint.prototype.GetFastBounds=function(bounds,out){if(Object.values(this._effects).some(Boolean))return false;const radius=val(this.Style)!==0?this.StrokeWidth/2*(this.StrokeJoin===K.StrokeJoin.Miter?Math.max(1,this.StrokeMiter):1):0,result=SKRect.Inflate(bounds,radius);if(out)Object.assign(out,result);return out?true:result;};
  SKPaint.prototype.GetFillPath=function(src,...args){this.ThrowIfDisposed();let dst=args.find(v=>v instanceof SKPath||v instanceof api.SKPathBuilder),scale=args.find(v=>typeof v==='number')??1,source=src,owned=false;const m=args.find(matrix);if(m)scale=Math.max(m.MapVector(1,0).Length,m.MapVector(0,1).Length);const effect=this._effects.PathEffect;if(effect){if(!api.applyPathEffect)throw new api.SKNotSupportedError('This path effect cannot be converted into geometry.');source=api.applyPathEffect(src,effect,this);owned=true;}let result;try{if(val(this.Style)===0)result=source.Clone();else if(this.StrokeWidth===0){if(dst){dst.Reset();dst.AddPath(source);return false;}return source.Clone();}else{const stroke=source.Stroke({Width:this.StrokeWidth,MiterLimit:this.StrokeMiter,Join:this.StrokeJoin,Cap:this.StrokeCap,Precision:scale});if(val(this.Style)===2){try{result=source.Op(stroke,api.SKPathOp.Union);}finally{stroke.Dispose();}}else result=stroke;}if(!result)return dst?false:null;if(dst){dst.Reset();dst.AddPath(result);result.Dispose();return true;}return result;}finally{if(owned)source.Dispose();}};
  const PaintBase=api.SKPaint;
  class SKCompatPaint extends PaintBase{constructor(options={}){if(options instanceof SKFont){super();const face=options.Typeface;try{this.Typeface=face;}finally{face?.Dispose();}this.TextSize=options.Size;this.TextScaleX=options.ScaleX;this.TextSkewX=options.SkewX;this.FakeBoldText=options.Embolden;this.IsLinearText=options.LinearMetrics;this.SubpixelText=options.Subpixel;this.IsEmbeddedBitmapText=options.EmbeddedBitmaps;}else super(options);}}
  Object.defineProperty(SKCompatPaint,'name',{value:'SKPaint'});Object.defineProperty(SKCompatPaint,Symbol.hasInstance,{value:v=>v instanceof PaintBase});api.SKPaint=SKCompatPaint;api.SKTextEncoding=SKTextEncoding;

  function textPathPlacement(font,text,path,alignment,offset){const glyphs=glyphInput(font,text),widths=font.GetGlyphWidths(glyphs),measure=new api.SKPathMeasure(path,false,2),length=measure.Length,total=widths.reduce((s,x)=>s+x,0);let advance=offset.X+(alignment===K.TextAlign.Center?(length-total)/2:alignment===K.TextAlign.Right?length-total:0);const placements=[];for(let i=0;i<glyphs.length;i++){const middle=advance+widths[i]/2;if(middle>=0&&middle<=length){const pt=measure.GetPositionAndTangent(middle);if(pt)placements.push({glyph:glyphs[i],x:advance,width:widths[i],...pt});}advance+=widths[i];}return {measure,placements,length};}
  function warpOutline(out,path,map,tolerance=.2){const cmds=path._native.toCmds();let i=0,current=[0,0],start=[0,0];const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    const line=(evalAt,t0,t1,p0,p1,depth=0)=>{const tm=(t0+t1)/2,pm=map(evalAt(tm)),q1=map(evalAt((t0*3+t1)/4)),q3=map(evalAt((t0+t1*3)/4)),err=Math.max(Math.hypot(pm[0]-(p0[0]+p1[0])/2,pm[1]-(p0[1]+p1[1])/2),Math.hypot(q1[0]-(p0[0]*3+p1[0])/4,q1[1]-(p0[1]*3+p1[1])/4),Math.hypot(q3[0]-(p0[0]+p1[0]*3)/4,q3[1]-(p0[1]+p1[1]*3)/4));if(depth<14&&err>tolerance){line(evalAt,t0,tm,p0,pm,depth+1);line(evalAt,tm,t1,pm,p1,depth+1);}else out.LineTo(...p1);};
    while(i<cmds.length){const verb=cmds[i++],p0=current.slice();if(verb===0){current=[cmds[i++],cmds[i++]];start=current.slice();out.MoveTo(...map(current));continue;}let evaluate;if(verb===1){current=[cmds[i++],cmds[i++]];evaluate=t=>mix(p0,current,t);}else if(verb===2){const c=[cmds[i++],cmds[i++]];current=[cmds[i++],cmds[i++]];evaluate=t=>mix(mix(p0,c,t),mix(c,current,t),t);}else if(verb===3){const c=[cmds[i++],cmds[i++]];current=[cmds[i++],cmds[i++]];const w=cmds[i++];evaluate=t=>{const a=(1-t)**2,b=2*w*t*(1-t),c2=t*t,z=a+b+c2;return [(a*p0[0]+b*c[0]+c2*current[0])/z,(a*p0[1]+b*c[1]+c2*current[1])/z];};}else if(verb===4){const a=[cmds[i++],cmds[i++]],b=[cmds[i++],cmds[i++]];current=[cmds[i++],cmds[i++]];evaluate=t=>mix(mix(mix(p0,a,t),mix(a,b,t),t),mix(mix(a,b,t),mix(b,current,t),t),t);}else if(verb===5){current=start.slice();evaluate=t=>mix(p0,current,t);}else throw new RangeError('Unknown path command.');line(evaluate,0,1,map(p0),map(current));if(verb===5)out.Close();}
  }
  function pathOnPath(font,text,path,alignment=K.TextAlign.Left,offset=new SKPoint(),warp=true){const placement=textPathPlacement(font,text,path,alignment,offset),out=new SKPath();try{for(const item of placement.placements){const glyph=font.GetGlyphPath(item.glyph);if(!glyph)continue;try{if(warp){const map=([x,y])=>{const p=placement.measure.GetPositionAndTangent(Math.max(0,Math.min(placement.length,item.x+x)));return [p.Position.X-p.Tangent.Y*(y+offset.Y),p.Position.Y+p.Tangent.X*(y+offset.Y)];};warpOutline(out,glyph,map);}else{const {Position:p,Tangent:t,width}=item;out.AddPath(glyph,new SKMatrix(t.X,-t.Y,p.X-t.X*width/2-t.Y*offset.Y,t.Y,t.X,p.Y-t.Y*width/2+t.X*offset.Y,0,0,1));}}finally{glyph.Dispose();}}return out;}catch(e){out.Dispose();throw e;}finally{placement.measure.Dispose();}}
  SKFont.prototype.GetTextPathOnPath=function(input,...args){const p=textArgs(input,args);let [path,align=K.TextAlign.Left,origin=new SKPoint()]=p.args;if(array(path)){const [widths,positions,thePath,alignment=K.TextAlign.Left]=p.args;const glyphs=glyphInput(this,p.input);if(widths.length!==glyphs.length||positions.length!==glyphs.length)throw new RangeError('Glyph positions and widths must match glyph count.');const result=new SKPath(),measure=new api.SKPathMeasure(thePath,false,2),total=glyphs.length?positions.at(-1).X+widths.at(-1):0,offset=alignment===K.TextAlign.Center?(measure.Length-total)/2:alignment===K.TextAlign.Right?measure.Length-total:0;try{for(let i=0;i<glyphs.length;i++){const g=this.GetGlyphPath(glyphs[i]);try{warpOutline(result,g,([x,y])=>{const p=measure.GetPositionAndTangent(Math.max(0,Math.min(measure.Length,offset+positions[i].X+x)));return [p.Position.X-p.Tangent.Y*(positions[i].Y+y),p.Position.Y+p.Tangent.X*(positions[i].Y+y)];});}finally{g.Dispose();}}return result;}finally{measure.Dispose();}}return pathOnPath(this,glyphInput(this,p.input),path,align,origin,true);};
  SKCanvas.prototype.DrawTextOnPath=function(text,path,...args){this._complex();let offset;if(point(args[0]))offset=args.shift();else offset=new SKPoint(args.shift()??0,args.shift()??0);let warp=true;if(typeof args[0]==='boolean')warp=args.shift();const paint=args.pop();let font=args.find(v=>v instanceof SKFont),own=!font;if(own)font=paint.ToFont();const align=args.find(v=>v!==font)??paint.TextAlign??K.TextAlign.Left;try{const outline=pathOnPath(font,decode(text,paint.TextEncoding??0),path,align,offset,warp);try{this.DrawPath(outline,paint);}finally{outline.Dispose();}}finally{if(own)font.Dispose();}};
  SKCanvas.prototype.DrawPositionedText=function(text,positions,fontOrPaint,paint){const own=!paint,font=own?fontOrPaint.ToFont():fontOrPaint;try{paint??=fontOrPaint;const glyphs=font.GetGlyphs(decode(text,paint.TextEncoding??0));if(positions.length!==glyphs.length)throw new RangeError('One position is required for each glyph.');this.DrawGlyphs(glyphs,positions,new SKPoint(),font,paint);}finally{if(own)font.Dispose();}};
  patch(SKCanvas,'DrawText',function(old,text,...args){const p=args.at(-1);if(isBytes(text))text=decode(text,p?.TextEncoding??0);if(text instanceof Uint16Array){let a=args.slice();if(point(a[0]))a=[...xy(a[0]),...a.slice(1)];const [x,y,...rest]=a,paint=rest.at(-1),font=rest.find(v=>v instanceof SKFont)??paint.ToFont(),own=!rest.includes(font);try{return this.DrawGlyphs(text,font.GetGlyphPositions(text),new SKPoint(x,y),font,paint);}finally{if(own)font.Dispose();}}return old.call(this,text,...args);});
  // Value constructors keep instanceof compatibility with objects returned by
  // existing factory closures while accepting C# point/size constructor forms.
  const constructorProxy=(Base,normalize)=>new Proxy(Base,{construct(Target,args,NewTarget){return Reflect.construct(Target,normalize(args),NewTarget);}});
  api.SKSize=constructorProxy(SKSize,a=>point(a[0])?xy(a[0]):a);
  api.SKSizeI=constructorProxy(SKSizeI,a=>point(a[0])?xy(a[0]):a);
  api.SKPointI=constructorProxy(SKPointI,a=>a[0]?.Width!==undefined?[a[0].Width,a[0].Height]:a);
  SKPoint.Reflect=function(p,n){const dot=p.X*p.X+p.Y*p.Y;return new this(p.X-2*dot*n.X,p.Y-2*dot*n.Y);};
  SKSize.prototype.ToSizeI=function(){return new SKSizeI(this.Width,this.Height);};
  SKSizeI.prototype.ToPointI=function(){return new SKPointI(this.Width,this.Height);};
  const createRect=SKRect.Create;SKRect.Create=function(...a){if(point(a[0])&&a[1]?.Width!==undefined)return new this(a[0].X,a[0].Y,a[0].X+a[1].Width,a[0].Y+a[1].Height);return createRect.apply(this,a);};
  prop(SKPointI,'Length',function(){return Math.trunc(Math.hypot(this.X,this.Y));});
  prop(SKRectI,'MidX',function(){return this.Left+Math.trunc(this.Width/2);});
  prop(SKRectI,'MidY',function(){return this.Top+Math.trunc(this.Height/2);});
  SKRectI.prototype.AspectFit=function(size){return SKRectI.Floor(SKRect.prototype.AspectFit.call(this,size));};
  SKRectI.prototype.AspectFill=function(size){return SKRectI.Floor(SKRect.prototype.AspectFill.call(this,size));};
  const checkedInt=v=>{v=Math.trunc(v);if(!Number.isFinite(v)||v<-2147483648||v>2147483647)throw new RangeError('Value cannot be represented as Int32.');return v;};
  const roundEven=v=>{const f=Math.floor(v),d=v-f;return d===.5?(f%2===0?f:f+1):Math.round(v);};
  SKPointI.Normalize=function(p){const length=Math.sqrt(p.X*p.X+p.Y*p.Y);return new this(Math.trunc(p.X/length),Math.trunc(p.Y/length));};
  SKPointI.Ceiling=p=>new SKPointI(checkedInt(Math.ceil(p.X)),checkedInt(Math.ceil(p.Y)));
  SKPointI.Round=p=>new SKPointI(checkedInt(roundEven(p.X)),checkedInt(roundEven(p.Y)));
  SKPointI.Truncate=p=>new SKPointI(checkedInt(p.X),checkedInt(p.Y));
  SKRectI.Round=r=>new SKRectI(...r.ToArray().map(v=>checkedInt(roundEven(v))));
  SKRectI.Truncate=r=>new SKRectI(...r.ToArray().map(checkedInt));
  SKRectI.Ceiling=function(r,outwards=false){const v=[outwards&&r.Width>0?Math.floor(r.Left):Math.ceil(r.Left),outwards&&r.Height>0?Math.floor(r.Top):Math.ceil(r.Top),outwards&&r.Width<0?Math.floor(r.Right):Math.ceil(r.Right),outwards&&r.Height<0?Math.floor(r.Bottom):Math.ceil(r.Bottom)];return new this(...v.map(checkedInt));};
  SKRectI.Floor=function(r,inwards=false){const v=[inwards&&r.Width>0?Math.ceil(r.Left):Math.floor(r.Left),inwards&&r.Height>0?Math.ceil(r.Top):Math.floor(r.Top),inwards&&r.Width<0?Math.ceil(r.Right):Math.floor(r.Right),inwards&&r.Height<0?Math.ceil(r.Bottom):Math.floor(r.Bottom)];return new this(...v.map(checkedInt));};
  SKRect.Round=SKRectI.Round;
  SKRect.Union=function(a,b){return new this(Math.min(a.Left,b.Left),Math.min(a.Top,b.Top),Math.max(a.Right,b.Right),Math.max(a.Bottom,b.Bottom));};
  SKRect.Intersect=function(a,b){return !a.IntersectsWithInclusive(b)?this.Empty:new this(Math.max(a.Left,b.Left),Math.max(a.Top,b.Top),Math.min(a.Right,b.Right),Math.min(a.Bottom,b.Bottom));};
  patch(SKRect,'Contains',function(old,x,y){return rect(x)?this.Left<=x.Left&&this.Right>=x.Right&&this.Top<=x.Top&&this.Bottom>=x.Bottom:old.call(this,x,y);});
  for(const method of ['AspectFit','AspectFill'])patch(SKRect,method,function(old,size){return !size.Width||!size.Height||!this.Width||!this.Height?SKRect.Create(this.MidX,this.MidY,0,0):old.call(this,size);});
  prop(api.SKImageInfo,'BitsPerPixel',function(){return this.BytesPerPixel*8;});
  prop(api.SKImageInfo,'BitShiftPerPixel',function(){return Math.log2(this.BytesPerPixel);});
  prop(api.SKImageInfo,'Rect',function(){return new SKRectI(0,0,this.Width,this.Height);});
  prop(api.SKImageInfo,'BytesSize64',function(){return this.RowBytes*this.Height;});
  prop(api.SKImageInfo,'RowBytes64',function(){return this.RowBytes;});
  Object.assign(api.SKImageInfo,{PlatformColorAlphaShift:24,PlatformColorRedShift:0,PlatformColorGreenShift:8,PlatformColorBlueShift:16});
  for(const name of ['ReadPixels','PeekPixels'])if(!api.SKSurface.prototype[name])api.SKSurface.prototype[name]=function(...a){const image=this.Snapshot();try{return image[name](...a);}finally{image.Dispose();}};
  patch(SKCanvas,'ReadPixels',function(old,info,...a){this._check();this._materialize();if(info instanceof api.SKPixmap||array(a[0])){const isPixmap=info instanceof api.SKPixmap,pixmap=isPixmap?info:null,pub=isPixmap?pixmap.Info:info,pixels=isPixmap?pixmap.GetPixels():a[0],rowBytes=isPixmap?pixmap.RowBytes:a[1]??pub.RowBytes,x=isPixmap?a[0]??0:a[2]??0,y=isPixmap?a[1]??0:a[3]??0,bytes=this._native.readPixels(x,y,{width:pub.Width,height:pub.Height,colorType:pub.ColorType,alphaType:pub.AlphaType,colorSpace:native(pub.ColorSpace)||K.ColorSpace.SRGB});if(!bytes)return false;const tight=pub.Width*pub.BytesPerPixel;if(rowBytes<tight||pixels.byteLength<rowBytes*pub.Height)throw new RangeError('Pixel buffer is too small.');const src=new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),dst=new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength);for(let i=0;i<pub.Height;i++)dst.set(src.subarray(i*tight,(i+1)*tight),i*rowBytes);return true;}return old.call(this,info,...a);});
  return api;
}
