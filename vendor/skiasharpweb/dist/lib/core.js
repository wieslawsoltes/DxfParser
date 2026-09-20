/** Skia-compatible values, paint and effects, backed by CanvasKit's native Skia. */
export function createCore(K) {
  const byte = x => Math.max(0, Math.min(255, Math.round(Number(x) || 0)));
  const tuple = v => v?.ToArray ? v.ToArray() : v;
  const matrix = v => v == null ? undefined : tuple(v);
  const enumValue = v => v?.value ?? v;
  const copyEnum = (source, aliases = {}) => Object.freeze({ ...source, ...aliases });
  const enumTables = new WeakMap();
  function nativeEnum(group, input, name) {
    let table = enumTables.get(group);
    if (!table) {
      table = { names: new Map(), values: new Map() };
      for (const [key, value] of Object.entries(group)) if (Number.isInteger(value?.value)) {
        table.names.set(key.toLowerCase(), value); table.values.set(value.value, value);
      }
      enumTables.set(group, table);
    }
    const result = typeof input === 'string' ? table.names.get(input.toLowerCase()) : table.values.get(input?.value ?? input);
    if (!result) throw new (typeof input === 'string' ? TypeError : RangeError)(`Invalid ${name} value: ${String(input?.value ?? input)}`);
    return result;
  }

  class SKNotSupportedError extends Error { constructor(message) { super(message); this.name = 'SKNotSupportedError'; } }
  class SKObject {
    constructor(native = null, ownsNative = true) { this._native = native; this._disposed = false; this._ownsNative = ownsNative; }
    static _fromNative(native, ownsNative = true) { if (!native) return null; const obj = Object.create(this.prototype); obj._native = native; obj._disposed = false; obj._ownsNative = ownsNative; return obj; }
    get IsDisposed() { return !!this._disposed; }
    ThrowIfDisposed() { if (this._disposed) throw new Error(`${this.constructor.name} has been disposed.`); return this; }
    Dispose() { if (this._disposed) return; this._disposed = true; if (this._ownsNative && this._native?.delete) this._native.delete(); this._native = null; }
    Close() { this.Dispose(); }
    [Symbol.dispose]() { this.Dispose(); }
  }
  const unwrap = value => { if (value == null) return null; value.ThrowIfDisposed?.(); return value._native === undefined ? value : value._native; };
  const colors = values => values.map(color);
  function color(value) { if (value?.ToFloatArray) return value.ToFloatArray(); if (typeof value === 'string') return SKColor.Parse(value).ToFloatArray(); if (typeof value === 'number') return new SKColor(value).ToFloatArray(); return value; }
  class SKColor {
    constructor(red = 0, green, blue, alpha = 255) { this._value = green === undefined ? Number(red) >>> 0 : ((byte(alpha) << 24) | (byte(red) << 16) | (byte(green) << 8) | byte(blue)) >>> 0; }
    get Red() { return (this._value >>> 16) & 255; } get Green() { return (this._value >>> 8) & 255; } get Blue() { return this._value & 255; } get Alpha() { return this._value >>> 24; }
    get Hue() { return this.ToHsv().Hue; }
    WithRed(v) { return new SKColor(v, this.Green, this.Blue, this.Alpha); } WithGreen(v) { return new SKColor(this.Red, v, this.Blue, this.Alpha); } WithBlue(v) { return new SKColor(this.Red, this.Green, v, this.Alpha); } WithAlpha(v) { return new SKColor(this.Red, this.Green, this.Blue, v); }
    ToArray() { return [this.Red, this.Green, this.Blue, this.Alpha]; } ToFloatArray() { return new Float32Array(this.ToArray().map(v => v / 255)); }
    ToUint() { return this._value; } valueOf() { return this._value; } Equals(v) { return v instanceof SKColor && v._value === this._value; }
    ToString() { return `#${this._value.toString(16).padStart(8, '0')}`; } toString() { return this.ToString(); }
    ToCss() { return `rgba(${this.Red}, ${this.Green}, ${this.Blue}, ${this.Alpha / 255})`; }
    ToHsl() { return new SKColorF(...this.ToFloatArray()).ToHsl(); } ToHsv() { return new SKColorF(...this.ToFloatArray()).ToHsv(); }
    static FromHsl(h, s, l, a = 255) { return SKColorF.FromHsl(h, s, l, a / 255).ToSKColor(); }
    static FromHsv(h, s, v, a = 255) { return SKColorF.FromHsv(h, s, v, a / 255).ToSKColor(); }
    static Parse(value) { const out = this.TryParse(value); if (!out.Success) throw new TypeError(`Invalid hexadecimal color: ${value}`); return out.Color; }
    static TryParse(value) { let h = String(value).trim().replace(/^#+/, ''); if (!/^(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(h)) return { Success: false, Color: new SKColor() }; if (h.length <= 4) h = [...h].map(c => c + c).join(''); if (h.length === 6) h = 'ff' + h; return { Success: true, Color: new SKColor(parseInt(h, 16)) }; }
    static get Empty() { return new SKColor(); }
  }
  class SKColorF {
    constructor(red = 0, green = 0, blue = 0, alpha = 1) { if (red instanceof SKColor) [red, green, blue, alpha] = red.ToFloatArray(); this.Red = red; this.Green = green; this.Blue = blue; this.Alpha = alpha; }
    ToArray() { return [this.Red, this.Green, this.Blue, this.Alpha]; } ToFloatArray() { return new Float32Array(this.ToArray()); }
    ToSKColor() { return new SKColor(this.Red * 255, this.Green * 255, this.Blue * 255, this.Alpha * 255); }
    WithAlpha(alpha) { return new SKColorF(this.Red, this.Green, this.Blue, alpha); }
    Equals(c) { return c instanceof SKColorF && this.ToArray().every((v, i) => v === c.ToArray()[i]); }
    ToHsv() { const r = this.Red, g = this.Green, b = this.Blue, max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; let h = d === 0 ? 0 : max === r ? ((g-b)/d)%6 : max === g ? (b-r)/d+2 : (r-g)/d+4; h = (h * 60 + 360) % 360; return { Hue: h, Saturation: max === 0 ? 0 : d / max * 100, Value: max * 100 }; }
    ToHsl() { const v = this.ToHsv(), max = Math.max(this.Red,this.Green,this.Blue), min = Math.min(this.Red,this.Green,this.Blue), l = (max+min)/2, d=max-min; return { Hue:v.Hue, Saturation: d === 0 ? 0 : d/(1-Math.abs(2*l-1))*100, Luminosity:l*100, Lightness:l*100 }; }
    static FromHsv(h, s, v, a = 1) { s/=100; v/=100; h=((h%360)+360)%360/60; const c=v*s, x=c*(1-Math.abs(h%2-1)), m=v-c, rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x]; return new SKColorF(...rgb.map(n=>n+m),a); }
    static FromHsl(h,s,l,a=1) { s/=100; l/=100; const v=l+s*Math.min(l,1-l); return this.FromHsv(h,v===0?0:200*(1-l/v),100*v,a); }
  }
  const SKColors = {};
  // Standard web/Skia color constants, in ARGB byte order.
  const namedColors = {"Empty":0,"AliceBlue":4293982463,"AntiqueWhite":4294634455,"Aqua":4278255615,"Aquamarine":4286578644,"Azure":4293984255,"Beige":4294309340,"Bisque":4294960324,"Black":4278190080,"BlanchedAlmond":4294962125,"Blue":4278190335,"BlueViolet":4287245282,"Brown":4289014314,"BurlyWood":4292786311,"CadetBlue":4284456608,"Chartreuse":4286578432,"Chocolate":4291979550,"Coral":4294934352,"CornflowerBlue":4284782061,"Cornsilk":4294965468,"Crimson":4292613180,"Cyan":4278255615,"DarkBlue":4278190219,"DarkCyan":4278225803,"DarkGoldenrod":4290283019,"DarkGray":4289309097,"DarkGreen":4278215680,"DarkKhaki":4290623339,"DarkMagenta":4287299723,"DarkOliveGreen":4283788079,"DarkOrange":4294937600,"DarkOrchid":4288230092,"DarkRed":4287299584,"DarkSalmon":4293498490,"DarkSeaGreen":4287609995,"DarkSlateBlue":4282924427,"DarkSlateGray":4281290575,"DarkTurquoise":4278243025,"DarkViolet":4287889619,"DeepPink":4294907027,"DeepSkyBlue":4278239231,"DimGray":4285098345,"DodgerBlue":4280193279,"Firebrick":4289864226,"FloralWhite":4294966000,"ForestGreen":4280453922,"Fuchsia":4294902015,"Gainsboro":4292664540,"GhostWhite":4294506751,"Gold":4294956800,"Goldenrod":4292519200,"Gray":4286611584,"Green":4278222848,"GreenYellow":4289593135,"Honeydew":4293984240,"HotPink":4294928820,"IndianRed":4291648604,"Indigo":4283105410,"Ivory":4294967280,"Khaki":4293977740,"Lavender":4293322490,"LavenderBlush":4294963445,"LawnGreen":4286381056,"LemonChiffon":4294965965,"LightBlue":4289583334,"LightCoral":4293951616,"LightCyan":4292935679,"LightGoldenrodYellow":4294638290,"LightGray":4292072403,"LightGreen":4287688336,"LightPink":4294948545,"LightSalmon":4294942842,"LightSeaGreen":4280332970,"LightSkyBlue":4287090426,"LightSlateGray":4286023833,"LightSteelBlue":4289774814,"LightYellow":4294967264,"Lime":4278255360,"LimeGreen":4281519410,"Linen":4294635750,"Magenta":4294902015,"Maroon":4286578688,"MediumAquamarine":4284927402,"MediumBlue":4278190285,"MediumOrchid":4290401747,"MediumPurple":4287852763,"MediumSeaGreen":4282168177,"MediumSlateBlue":4286277870,"MediumSpringGreen":4278254234,"MediumTurquoise":4282962380,"MediumVioletRed":4291237253,"MidnightBlue":4279834992,"MintCream":4294311930,"MistyRose":4294960353,"Moccasin":4294960309,"NavajoWhite":4294958765,"Navy":4278190208,"OldLace":4294833638,"Olive":4286611456,"OliveDrab":4285238819,"Orange":4294944000,"OrangeRed":4294919424,"Orchid":4292505814,"PaleGoldenrod":4293847210,"PaleGreen":4288215960,"PaleTurquoise":4289720046,"PaleVioletRed":4292571283,"PapayaWhip":4294963157,"PeachPuff":4294957753,"Peru":4291659071,"Pink":4294951115,"Plum":4292714717,"PowderBlue":4289781990,"Purple":4286578816,"Red":4294901760,"RosyBrown":4290547599,"RoyalBlue":4282477025,"SaddleBrown":4287317267,"Salmon":4294606962,"SandyBrown":4294222944,"SeaGreen":4281240407,"SeaShell":4294964718,"Sienna":4288696877,"Silver":4290822336,"SkyBlue":4287090411,"SlateBlue":4285160141,"SlateGray":4285563024,"Snow":4294966010,"SpringGreen":4278255487,"SteelBlue":4282811060,"Tan":4291998860,"Teal":4278222976,"Thistle":4292394968,"Tomato":4294927175,"Turquoise":4282441936,"Violet":4293821166,"Wheat":4294303411,"White":4294967295,"WhiteSmoke":4294309365,"Yellow":4294967040,"YellowGreen":4288335154,"Transparent":16777215};
  for (const [name, value] of Object.entries(namedColors)) Object.defineProperty(SKColors, name, { enumerable: true, get: () => new SKColor(value) });
  Object.freeze(SKColors);
  class SKPoint {
    constructor(x = 0, y = 0) { this.X = x; this.Y = y; }
    get IsEmpty() { return this.X === 0 && this.Y === 0; } get Length() { return Math.hypot(this.X, this.Y); } get LengthSquared() { return this.X*this.X + this.Y*this.Y; }
    ToArray() { return [this.X, this.Y]; } Equals(p) { return !!p && p.X===this.X && p.Y===this.Y; }
    Offset(x,y) { if (typeof x==='object') [x,y]=tuple(x); this.X+=x; this.Y+=y; return this; }
    static Add(a,b) { return new this(a.X+(b.X??b.Width),a.Y+(b.Y??b.Height)); } static Subtract(a,b) { return new this(a.X-(b.X??b.Width),a.Y-(b.Y??b.Height)); }
    static Distance(a,b) { return Math.hypot(a.X-b.X,a.Y-b.Y); } static DistanceSquared(a,b) { return (a.X-b.X)**2+(a.Y-b.Y)**2; }
    static Normalize(p) { const l=p.Length ?? Math.hypot(p.X,p.Y); return l?new this(p.X/l,p.Y/l):new this(); }
    static get Empty() { return new this(); }
  }
  class SKPointI extends SKPoint { constructor(x=0,y=0) { super(Math.trunc(x),Math.trunc(y)); } static Ceiling(p) { return new this(Math.ceil(p.X),Math.ceil(p.Y)); } static Floor(p) { return new this(Math.floor(p.X),Math.floor(p.Y)); } static Round(p) { return new this(Math.round(p.X),Math.round(p.Y)); } static Truncate(p) { return new this(p.X,p.Y); } }
  class SKSize {
    constructor(width = 0,height = 0) { this.Width=width;this.Height=height; }
    get IsEmpty() { return this.Width===0 && this.Height===0; } ToArray() { return [this.Width,this.Height]; } Equals(s) { return !!s && s.Width===this.Width && s.Height===this.Height; }
    ToPoint() { return new SKPoint(this.Width,this.Height); } static get Empty() { return new this(); }
    static Add(a,b) { return new this(a.Width+b.Width,a.Height+b.Height); } static Subtract(a,b) { return new this(a.Width-b.Width,a.Height-b.Height); }
  }
  class SKSizeI extends SKSize { constructor(w=0,h=0) { super(Math.trunc(w),Math.trunc(h)); } static Ceiling(s) { return new this(Math.ceil(s.Width),Math.ceil(s.Height)); } static Round(s) { return new this(Math.round(s.Width),Math.round(s.Height)); } static Truncate(s) { return new this(s.Width,s.Height); } }
  class SKRect {
    constructor(left=0,top=0,right=0,bottom=0) { this.Left=left;this.Top=top;this.Right=right;this.Bottom=bottom; }
    static Create(...args) { if (args.length===1) args=[0,0,args[0].Width,args[0].Height]; else if(args.length===2) args=[0,0,...args]; const [x,y,w,h]=args; return new this(x,y,x+w,y+h); }
    static get Empty() { return new this(); }
    get Width() { return this.Right-this.Left; } set Width(v) { this.Right=this.Left+v; }
    get Height() { return this.Bottom-this.Top; } set Height(v) { this.Bottom=this.Top+v; }
    get MidX() { return (this.Left+this.Right)/2; } get MidY() { return (this.Top+this.Bottom)/2; }
    get Size() { return new SKSize(this.Width,this.Height); } set Size(v) { this.Width=v.Width;this.Height=v.Height; }
    get Location() { return new SKPoint(this.Left,this.Top); } set Location(p) { this.Offset(p.X-this.Left,p.Y-this.Top); }
    get IsEmpty() { return this.Left>=this.Right || this.Top>=this.Bottom; }
    get IsFinite() { return this.ToArray().every(Number.isFinite); }
    get Standardized() { return new this.constructor(Math.min(this.Left,this.Right),Math.min(this.Top,this.Bottom),Math.max(this.Left,this.Right),Math.max(this.Top,this.Bottom)); }
    ToArray() { return [this.Left,this.Top,this.Right,this.Bottom]; } Equals(r) { return !!r && this.ToArray().every((v,i)=>v===tuple(r)[i]); }
    Contains(x,y) { if (typeof x==='object') { if ('Right' in x) return !this.IsEmpty&&!x.IsEmpty&&this.Left<=x.Left&&this.Top<=x.Top&&this.Right>=x.Right&&this.Bottom>=x.Bottom; [x,y]=tuple(x); } return x>=this.Left&&x<this.Right&&y>=this.Top&&y<this.Bottom; }
    IntersectsWith(r) { return Math.max(this.Left,r.Left)<Math.min(this.Right,r.Right)&&Math.max(this.Top,r.Top)<Math.min(this.Bottom,r.Bottom); }
    Offset(x,y) { if(typeof x==='object') [x,y]=tuple(x); this.Left+=x;this.Right+=x;this.Top+=y;this.Bottom+=y;return this; }
    Inflate(x,y=x) { if(typeof x==='object') [x,y]=tuple(x); this.Left-=x;this.Right+=x;this.Top-=y;this.Bottom+=y;return this; }
    Intersect(r) { const next=this.constructor.Intersect(this,r); Object.assign(this,next); return !next.IsEmpty; }
    Union(r) { Object.assign(this,this.constructor.Union(this,r)); return this; }
    static Intersect(a,b) { const r=new this(Math.max(a.Left,b.Left),Math.max(a.Top,b.Top),Math.min(a.Right,b.Right),Math.min(a.Bottom,b.Bottom)); return r.IsEmpty?this.Empty:r; }
    static Union(a,b) { if(a.IsEmpty) return new this(...b.ToArray()); if(b.IsEmpty)return new this(...a.ToArray()); return new this(Math.min(a.Left,b.Left),Math.min(a.Top,b.Top),Math.max(a.Right,b.Right),Math.max(a.Bottom,b.Bottom)); }
    static Inflate(r,x,y=x) { return new this(...r.ToArray()).Inflate(x,y); }
    static Round(r) { return new SKRectI(...r.ToArray().map(Math.round)); } static RoundOut(r) { return new SKRectI(Math.floor(r.Left),Math.floor(r.Top),Math.ceil(r.Right),Math.ceil(r.Bottom)); }
  }
  class SKRectI extends SKRect { constructor(l=0,t=0,r=0,b=0) { super(...[l,t,r,b].map(Math.trunc)); } get Size(){return new SKSizeI(this.Width,this.Height);} set Size(v){this.Width=v.Width;this.Height=v.Height;} get Location(){return new SKPointI(this.Left,this.Top);} set Location(v){this.Offset(v.X-this.Left,v.Y-this.Top);} }
  const SKRoundRectCorner=Object.freeze({UpperLeft:0,UpperRight:1,LowerRight:2,LowerLeft:3});
  class SKRoundRect {
    constructor(rect=SKRect.Empty,x=0,y=x) { this.SetRectRadii(rect,[new SKPoint(x,y),new SKPoint(x,y),new SKPoint(x,y),new SKPoint(x,y)]); }
    get Rect() { return new SKRect(...this._rect.ToArray()); } get Width(){return this._rect.Width;} get Height(){return this._rect.Height;} get IsEmpty(){return this._rect.IsEmpty;} get IsRect(){return this._radii.every(v=>v.X===0||v.Y===0);} get IsOval(){return this._radii.every(v=>v.X===this.Width/2&&v.Y===this.Height/2);} get IsSimple(){return this._radii.every(v=>v.Equals(this._radii[0]));}
    SetEmpty(){return this.SetRect(SKRect.Empty);} SetRect(rect){return this.SetRectRadii(rect,Array.from({length:4},()=>new SKPoint()));} SetOval(rect){return this.SetRectRadii(rect,Array.from({length:4},()=>new SKPoint(rect.Width/2,rect.Height/2)));}
    SetRectXY(rect,x,y){return this.SetRectRadii(rect,Array.from({length:4},()=>new SKPoint(x,y)));}
    SetRectRadii(rect,radii){ if(radii.length!==4)throw new RangeError('Four corner radii are required.'); this._rect=new SKRect(...tuple(rect)).Standardized; this._radii=radii.map(p=>new SKPoint(Math.max(0,p.X??p[0]),Math.max(0,p.Y??p[1]))); const r=this._radii,w=this.Width,h=this.Height; const ratio=(n,d)=>d>0?n/d:1; const scale=Math.min(1,ratio(w,r[0].X+r[1].X),ratio(w,r[3].X+r[2].X),ratio(h,r[0].Y+r[3].Y),ratio(h,r[1].Y+r[2].Y)); const f=Number.isFinite(scale)?scale:1; if(f<1)r.forEach(v=>{v.X*=f;v.Y*=f;}); return this; }
    GetRadii(corner){return new SKPoint(...this._radii[enumValue(corner)].ToArray());} ToArray(){return [...this._rect.ToArray(),...this._radii.flatMap(r=>r.ToArray())];}
    Offset(x,y){this._rect.Offset(x,y);return this;} Contains(rect){ if(!this._rect.Contains(rect))return false; const inside=(x,y)=>{const r=this._rect;return this._radii.every((rad,i)=>{const right=i===1||i===2,bottom=i>=2,cx=right?r.Right-rad.X:r.Left+rad.X,cy=bottom?r.Bottom-rad.Y:r.Top+rad.Y;if((right?x<=cx:x>=cx)||(bottom?y<=cy:y>=cy)||!rad.X||!rad.Y)return true; return ((x-cx)/rad.X)**2+((y-cy)/rad.Y)**2<=1;});};return [[rect.Left,rect.Top],[rect.Right,rect.Top],[rect.Right,rect.Bottom],[rect.Left,rect.Bottom]].every(p=>inside(...p));}
    Clone(){const c=new SKRoundRect();return c.SetRectRadii(this._rect,this._radii);}
  }
  class SKMatrix {
    constructor(...values) { this._values=values.length===0?[1,0,0,0,1,0,0,0,1]:Array.from(values.length===1?tuple(values[0]):values); if(this._values.length!==9)throw new RangeError('SKMatrix requires nine row-major values.'); }
    get Values(){return this._values.slice();} set Values(v){if(v.length!==9)throw new RangeError('SKMatrix requires nine values.');this._values=Array.from(v);} get Value(){return this.Values;}
    ToArray(){return this.Values;} GetValues(out){if(out.length<9)throw new RangeError('Nine output values required.'); this._values.forEach((v,i)=>out[i]=v);return out;}
    get IsIdentity(){return this.Equals(SKMatrix.Identity);} get IsInvertible(){return K.Matrix.invert(this._values)!==null;}
    Equals(m){return !!m&&this._values.every((v,i)=>v===tuple(m)[i]);}
    static get Identity(){return new this();} static get Empty(){return new this(Array(9).fill(0));} static CreateIdentity(){return new this();}
    static CreateTranslation(x,y){return new this(K.Matrix.translated(x,y));} static CreateScale(x,y=x,px=0,py=0){return new this(K.Matrix.scaled(x,y,px,py));}
    static CreateRotation(radians,px=0,py=0){return new this(K.Matrix.rotated(radians,px,py));} static CreateRotationDegrees(degrees,px=0,py=0){return this.CreateRotation(degrees*Math.PI/180,px,py);}
    static CreateSkew(x,y){return new this(K.Matrix.skewed(x,y));} static CreateScaleTranslation(sx,sy,tx,ty){return new this(sx,0,tx,0,sy,ty,0,0,1);}
    static Concat(a,b){return new this(K.Matrix.multiply(tuple(a),tuple(b)));} PreConcat(m){return SKMatrix.Concat(this,m);} PostConcat(m){return SKMatrix.Concat(m,this);}
    TryInvert(){const v=K.Matrix.invert(this._values);return {Success:v!==null,Inverse:v?new SKMatrix(v):SKMatrix.Empty};} Invert(){const result=this.TryInvert();return result.Success?result.Inverse:SKMatrix.Empty;}
    MapPoint(x,y){if(typeof x==='object')[x,y]=tuple(x);const v=K.Matrix.mapPoints(this._values,[x,y]);return new SKPoint(...v);} MapPoints(points){if(typeof points[0]==='number')return K.Matrix.mapPoints(this._values,Array.from(points));return points.map(p=>this.MapPoint(p));}
    MapVector(x,y){if(typeof x==='object')[x,y]=tuple(x);const z=this.MapPoint(0,0),p=this.MapPoint(x,y);return new SKPoint(p.X-z.X,p.Y-z.Y);} MapVectors(v){return v.map(p=>this.MapVector(p));}
    MapRect(r){const p=[[r.Left,r.Top],[r.Right,r.Top],[r.Right,r.Bottom],[r.Left,r.Bottom]].map(p=>this.MapPoint(p));return new SKRect(Math.min(...p.map(v=>v.X)),Math.min(...p.map(v=>v.Y)),Math.max(...p.map(v=>v.X)),Math.max(...p.map(v=>v.Y)));}
    MapRadius(r){const a=this.MapVector(r,0),b=this.MapVector(0,r);return Math.sqrt(a.Length*b.Length);}
  }
  for (const [i,name] of ['ScaleX','SkewX','TransX','SkewY','ScaleY','TransY','Persp0','Persp1','Persp2'].entries())Object.defineProperty(SKMatrix.prototype,name,{get(){return this._values[i];},set(v){this._values[i]=v;},enumerable:true});
  class SKMatrix44 {
    constructor(values=K.M44.identity()){let a=Array.from(tuple(values));if(a.length===9)a=[a[0],a[1],0,a[2],a[3],a[4],0,a[5],0,0,1,0,a[6],a[7],0,a[8]];this._values=a;if(this._values.length!==16)throw new RangeError('SKMatrix44 requires sixteen values.');}
    get Values(){return this._values.slice();} get IsIdentity(){return this._values.every((v,i)=>v===(i%5===0?1:0));} ToArray(){return this.Values;} ToRowMajor(){return this.Values;} ToColumnMajor(){return K.M44.transpose(this._values);} static get Identity(){return new this();}
    static CreateIdentity(){return new this();} static CreateTranslation(x,y,z){return new this(K.M44.translated([x,y,z]));} static CreateScale(x,y=x,z=x){return new this(K.M44.scaled([x,y,z]));} static CreateRotation(x,y,z,radians){return new this(K.M44.rotated([x,y,z],radians));} static CreateRotationDegrees(x,y,z,degrees){return this.CreateRotation(x,y,z,degrees*Math.PI/180);}
    static Concat(a,b){return new this(K.M44.multiply(tuple(a),tuple(b)));} PreConcat(m){this._values=K.M44.multiply(this._values,tuple(m));return this;} PostConcat(m){this._values=K.M44.multiply(tuple(m),this._values);return this;}
    SetIdentity(){this._values=K.M44.identity();return this;} Transpose(){this._values=K.M44.transpose(this._values);return this;} Invert(){const n=K.M44.invert(this._values);return n?new SKMatrix44(n):null;} Get(row,col){return this._values[row*4+col];} Set(row,col,value){this._values[row*4+col]=value;return this;}
    MapScalars(v){if(v.length!==4)throw new RangeError('Four scalars required.');return Array.from({length:4},(_,i)=>v.reduce((s,n,j)=>s+this._values[i*4+j]*n,0));}
    ToMatrix(){const m=this._values;return new SKMatrix(m[0],m[1],m[3],m[4],m[5],m[7],m[12],m[13],m[15]);}
  }
  const SKAlphaType=copyEnum(K.AlphaType), SKBlendMode=copyEnum(K.BlendMode), SKBlurStyle=copyEnum(K.BlurStyle), SKClipOperation=copyEnum(K.ClipOp), SKColorChannel=copyEnum(K.ColorChannel);
  const SKColorType=copyEnum(K.ColorType,{Alpha8:K.ColorType.Alpha_8,Rgb565:K.ColorType.RGB_565,Rgba8888:K.ColorType.RGBA_8888,Bgra8888:K.ColorType.BGRA_8888,Rgba1010102:K.ColorType.RGBA_1010102,Rgb101010x:K.ColorType.RGB_101010x,Gray8:K.ColorType.Gray_8,RgbaF16:K.ColorType.RGBA_F16,RgbaF32:K.ColorType.RGBA_F32});
  const SKPaintStyle=copyEnum(K.PaintStyle,{StrokeAndFill:Object.freeze({value:2})}), SKStrokeCap=copyEnum(K.StrokeCap),SKStrokeJoin=copyEnum(K.StrokeJoin),SKShaderTileMode=copyEnum(K.TileMode),SKPathFillType=copyEnum(K.FillType,{InverseWinding:Object.freeze({value:2}),InverseEvenOdd:Object.freeze({value:3})});
  const SKPathOp=copyEnum(K.PathOp,{Xor:K.PathOp.XOR}),SKPathDirection=Object.freeze({Clockwise:0,CounterClockwise:1}),SKPathVerb=Object.freeze({Move:0,Line:1,Quad:2,Conic:3,Cubic:4,Close:5,Done:6});
  const SKPointMode=copyEnum(K.PointMode),SKVertexMode=copyEnum(K.VertexMode,{TriangleStrip:K.VertexMode.TrianglesStrip}),SKPath1DPathEffectStyle=copyEnum(K.Path1DEffectStyle),SKFilterMode=copyEnum(K.FilterMode),SKMipmapMode=copyEnum(K.MipmapMode),SKFilterQuality=Object.freeze({None:0,Low:1,Medium:2,High:3});
  const SKEncodedImageFormat=copyEnum(K.ImageFormat,{Png:K.ImageFormat.PNG,Jpeg:K.ImageFormat.JPEG,Webp:K.ImageFormat.WEBP});
  class SKColorSpace extends SKObject {
    static CreateSrgb(){return this._fromNative(K.ColorSpace.SRGB,false);} static CreateDisplayP3(){return this._fromNative(K.ColorSpace.DISPLAY_P3,false);} static CreateAdobeRgb(){return this._fromNative(K.ColorSpace.ADOBE_RGB,false);}
    get IsSrgb(){this.ThrowIfDisposed();return K.ColorSpace.Equals(this._native,K.ColorSpace.SRGB);} Equals(other){this.ThrowIfDisposed();return !!other&&K.ColorSpace.Equals(this._native,unwrap(other));}
  }
  class SKImageInfo {
    constructor(width=0,height=0,colorType=SKColorType.Rgba8888,alphaType=SKAlphaType.Premul,colorSpace=null){this.Width=width;this.Height=height;this.ColorType=colorType;this.AlphaType=alphaType;this.ColorSpace=colorSpace;}
    get BytesPerPixel(){const t=enumValue(this.ColorType);return t===enumValue(K.ColorType.Alpha_8)||t===enumValue(K.ColorType.Gray_8)?1:t===enumValue(K.ColorType.RGB_565)?2:t===enumValue(K.ColorType.RGBA_F16)?8:t===enumValue(K.ColorType.RGBA_F32)?16:4;}
    get BitsPerPixel(){return this.BytesPerPixel*8;} get BitShiftPerPixel(){return Math.log2(this.BytesPerPixel);} get BytesSize(){return this.RowBytes*this.Height;}get BytesSize64(){return this.BytesSize;}get RowBytes(){return this.Width*this.BytesPerPixel;}get RowBytes64(){return this.RowBytes;}
    get IsEmpty(){return this.Width<=0||this.Height<=0;}get IsOpaque(){return this.AlphaType===SKAlphaType.Opaque;}get Size(){return new SKSizeI(this.Width,this.Height);}get Rect(){return SKRectI.Create(this.Width,this.Height);}
    ToNative(){return {width:this.Width,height:this.Height,colorType:this.ColorType,alphaType:this.AlphaType,colorSpace:unwrap(this.ColorSpace)||K.ColorSpace.SRGB};}
    WithSize(w,h){if(typeof w==='object'){h=w.Height;w=w.Width;}return new SKImageInfo(w,h,this.ColorType,this.AlphaType,this.ColorSpace);}WithColorType(t){return new SKImageInfo(this.Width,this.Height,t,this.AlphaType,this.ColorSpace);}WithAlphaType(t){return new SKImageInfo(this.Width,this.Height,this.ColorType,t,this.ColorSpace);}WithColorSpace(s){return new SKImageInfo(this.Width,this.Height,this.ColorType,this.AlphaType,s);} Equals(i){return !!i&&this.Width===i.Width&&this.Height===i.Height&&this.ColorType===i.ColorType&&this.AlphaType===i.AlphaType&&this.ColorSpace===i.ColorSpace;}
    static get Empty(){return new SKImageInfo();}static get PlatformColorType(){return SKColorType.Rgba8888;}
  }
  class SKCubicResampler {constructor(b,c){this.B=b;this.C=c;}ToNative(){return {B:this.B,C:this.C};}static get Mitchell(){return new this(1/3,1/3);}static get CatmullRom(){return new this(0,.5);}}
  class SKSamplingOptions {constructor(filter=K.FilterMode.Nearest,mipmap=K.MipmapMode.None){if(filter instanceof SKCubicResampler){this.UseCubic=true;this.Cubic=filter;}else{this.UseCubic=false;this.Filter=filter;this.Mipmap=mipmap;}}ToNative(){return this.UseCubic?this.Cubic.ToNative():{filter:this.Filter,mipmap:this.Mipmap};}static get Default(){return new this();}}
  const sampling = v => v?.ToNative ? v.ToNative() : typeof v==='number' ? v===3?{B:1/3,C:1/3}:{filter:v===0?K.FilterMode.Nearest:K.FilterMode.Linear,mipmap:v>=2?K.MipmapMode.Linear:K.MipmapMode.None} : v||{filter:K.FilterMode.Linear,mipmap:K.MipmapMode.None};
  const cloneEffect = effect => {
    if (!effect) return null;
    effect.ThrowIfDisposed?.();
    if (effect._clone) return effect._clone();
    const copy = effect.constructor._fromNative(effect._native.clone());
    for (const key of ['_documentShader','_documentColorFilter','_documentImageFilter','_documentPathEffect']) {
      if (effect[key] !== undefined) copy[key] = effect[key];
    }
    return copy;
  };
  class SKPaint extends SKObject {
    constructor(options={}){super(new K.Paint());this._state={IsAntialias:false,IsDither:false,Style:K.PaintStyle.Fill,BlendMode:K.BlendMode.SrcOver,FilterQuality:SKFilterQuality.None,TextSize:12,TextScaleX:1,TextSkewX:0,TextAlign:K.TextAlign.Left,FakeBoldText:false,Typeface:null};this._effects={};if(options instanceof SKPaint){options.ThrowIfDisposed();this._native.delete();this._native=options._native.copy();this._state={...options._state,Typeface:options._state.Typeface?._copy?.()||null};for(const [key,effect] of Object.entries(options._effects))this._effects[key]=cloneEffect(effect);}else{try{Object.assign(this,options);}catch(error){this.Dispose();throw error;}}}
    get Color(){this.ThrowIfDisposed();return new SKColor(...Array.from(this._native.getColor(),v=>v*255));}set Color(v){this.ThrowIfDisposed();this._native.setColor(color(v));}
    get ColorF(){this.ThrowIfDisposed();return new SKColorF(...this._native.getColor());}set ColorF(v){this.ThrowIfDisposed();this._native.setColor(color(v));}
    get Alpha(){return this.Color.Alpha;}set Alpha(v){this.ThrowIfDisposed();this._native.setAlphaf(byte(v)/255);}
    get IsStroke(){return this.Style===K.PaintStyle.Stroke;}set IsStroke(v){this.Style=v?K.PaintStyle.Stroke:K.PaintStyle.Fill;}
    get Style(){this.ThrowIfDisposed();return this._state.Style;}set Style(v){this.ThrowIfDisposed();const normalized=nativeEnum(SKPaintStyle,v,'SKPaintStyle');this._native.setStyle(normalized);this._state.Style=normalized;}
    Clone(){return new SKPaint(this);}Reset(){this.ThrowIfDisposed();this._state.Typeface?.Dispose();Object.values(this._effects).forEach(v=>v?.Dispose());this._effects={};this._native.delete();this._native=new K.Paint();this._state={IsAntialias:false,IsDither:false,Style:K.PaintStyle.Fill,BlendMode:K.BlendMode.SrcOver,FilterQuality:SKFilterQuality.None,TextSize:12,TextScaleX:1,TextSkewX:0,TextAlign:K.TextAlign.Left,FakeBoldText:false,Typeface:null};return this;}
    Dispose(){if(this.IsDisposed)return;this._state?.Typeface?.Dispose();Object.values(this._effects||{}).forEach(v=>v?.Dispose());this._effects={};super.Dispose();}
  }
  for(const [name,getter,setter] of [['StrokeWidth','getStrokeWidth','setStrokeWidth'],['StrokeMiter','getStrokeMiter','setStrokeMiter'],['StrokeCap','getStrokeCap','setStrokeCap'],['StrokeJoin','getStrokeJoin','setStrokeJoin']])Object.defineProperty(SKPaint.prototype,name,{enumerable:true,get(){this.ThrowIfDisposed();return this._native[getter]();},set(v){this.ThrowIfDisposed();this._native[setter](name==='StrokeCap'?nativeEnum(SKStrokeCap,v,'SKStrokeCap'):name==='StrokeJoin'?nativeEnum(SKStrokeJoin,v,'SKStrokeJoin'):v);}});
  for(const [name,setter] of [['IsAntialias','setAntiAlias'],['IsDither','setDither'],['BlendMode','setBlendMode']])Object.defineProperty(SKPaint.prototype,name,{enumerable:true,get(){this.ThrowIfDisposed();return this._state[name];},set(v){this.ThrowIfDisposed();const normalized=name==='BlendMode'?nativeEnum(SKBlendMode,v,'SKBlendMode'):!!v;this._native[setter](normalized);this._state[name]=normalized;if(name==='BlendMode'){this._effects.Blender?.Dispose();delete this._effects.Blender;}}});
  Object.defineProperty(SKPaint.prototype,'FilterQuality',{get(){this.ThrowIfDisposed();return this._state.FilterQuality;},set(v){this.ThrowIfDisposed();this._state.FilterQuality=v;}});
  for(const [name,setter] of [['Shader','setShader'],['ColorFilter','setColorFilter'],['ImageFilter','setImageFilter'],['MaskFilter','setMaskFilter'],['PathEffect','setPathEffect'],['Blender','setBlender']])Object.defineProperty(SKPaint.prototype,name,{enumerable:true,get(){this.ThrowIfDisposed();const ref=this._effects[name];return cloneEffect(ref);},set(v){this.ThrowIfDisposed();v?.ThrowIfDisposed?.();const native=v?._software?null:unwrap(v);const held=cloneEffect(v);try{this._native[setter](native);}catch(e){held?.Dispose();throw e;}this._effects[name]?.Dispose();this._effects[name]=held;}});
  for(const name of ['TextSize','TextScaleX','TextSkewX','TextAlign','FakeBoldText'])Object.defineProperty(SKPaint.prototype,name,{enumerable:true,get(){this.ThrowIfDisposed();return this._state[name];},set(v){this.ThrowIfDisposed();this._state[name]=v;}});
  Object.defineProperty(SKPaint.prototype,'Typeface',{enumerable:true,get(){this.ThrowIfDisposed();return this._state.Typeface;},set(v){this.ThrowIfDisposed();unwrap(v);const held=v?._copy?.()||v;this._state.Typeface?.Dispose();this._state.Typeface=held;}});
  class SKShader extends SKObject {
    static CreateColor(c,space=null){return this._fromNative(K.Shader.MakeColor(color(c),unwrap(space)||K.ColorSpace.SRGB));}
    static CreateLinearGradient(start,end,cs,positions=null,tileMode=K.TileMode.Clamp,localMatrix){if(positions?.value!==undefined){localMatrix=arguments.length>=5?tileMode:undefined;tileMode=positions;positions=null;}return this._fromNative(K.Shader.MakeLinearGradient(tuple(start),tuple(end),colors(cs),positions,tileMode,matrix(localMatrix)));}
    static CreateRadialGradient(center,radius,cs,positions=null,tileMode=K.TileMode.Clamp,localMatrix){if(positions?.value!==undefined){localMatrix=arguments.length>=5?tileMode:undefined;tileMode=positions;positions=null;}return this._fromNative(K.Shader.MakeRadialGradient(tuple(center),radius,colors(cs),positions,tileMode,matrix(localMatrix)));}
    static CreateSweepGradient(center,cs,positions=null,tileMode=K.TileMode.Clamp,startAngle=0,endAngle=360,localMatrix){return this._fromNative(K.Shader.MakeSweepGradient(center.X??center[0],center.Y??center[1],colors(cs),positions,tileMode,matrix(localMatrix),0,startAngle,endAngle));}
    static CreateTwoPointConicalGradient(start,startRadius,end,endRadius,cs,positions=null,tileMode=K.TileMode.Clamp,localMatrix){return this._fromNative(K.Shader.MakeTwoPointConicalGradient(tuple(start),startRadius,tuple(end),endRadius,colors(cs),positions,tileMode,matrix(localMatrix)));}
    static CreateCompose(dst,src,mode=K.BlendMode.SrcOver){return this._fromNative(K.Shader.MakeBlend(mode,unwrap(dst),unwrap(src)));}
    static CreatePerlinNoiseFractalNoise(fx,fy,octaves,seed,tileSize=SKSizeI.Empty){return this._fromNative(K.Shader.MakeFractalNoise(fx,fy,octaves,seed,tileSize.Width,tileSize.Height));}
    static CreatePerlinNoiseTurbulence(fx,fy,octaves,seed,tileSize=SKSizeI.Empty){return this._fromNative(K.Shader.MakeTurbulence(fx,fy,octaves,seed,tileSize.Width,tileSize.Height));}
    static CreateImage(image,tx=K.TileMode.Clamp,ty=K.TileMode.Clamp,sample=SKSamplingOptions.Default,localMatrix){const img=unwrap(image),s=sampling(sample);return this._fromNative(s.B!==undefined?img.makeShaderCubic(tx,ty,s.B,s.C,matrix(localMatrix)):img.makeShaderOptions(tx,ty,s.filter,s.mipmap,matrix(localMatrix)));}
    static CreateEmpty(){return this.CreateColor(SKColors.Transparent);}
  }
  class SKColorFilter extends SKObject {
    static CreateBlendMode(c,mode){return this._fromNative(K.ColorFilter.MakeBlend(color(c),mode));}
    static CreateColorMatrix(values){if(values.length!==20)throw new RangeError('A color matrix has twenty values.');return this._fromNative(K.ColorFilter.MakeMatrix(Array.from(values)));}
    static CreateCompose(outer,inner){return this._fromNative(K.ColorFilter.MakeCompose(unwrap(outer),unwrap(inner)));}
    static CreateLerp(t,dst,src){return this._fromNative(K.ColorFilter.MakeLerp(t,unwrap(dst),unwrap(src)));}
    static CreateLumaColor(){return this._fromNative(K.ColorFilter.MakeLuma());}static CreateSrgbToLinearGamma(){return this._fromNative(K.ColorFilter.MakeSRGBToLinearGamma());}static CreateLinearToSrgbGamma(){return this._fromNative(K.ColorFilter.MakeLinearToSRGBGamma());}
    static CreateLighting(mul,add){const a=color(mul),b=color(add);return this._fromNative(K.ColorFilter.MakeMatrix([a[0],0,0,0,b[0],0,a[1],0,0,b[1],0,0,a[2],0,b[2],0,0,0,1,0]));}
  }
  class SKImageFilter extends SKObject {
    static CreateBlur(sx,sy,input=null,tileMode=K.TileMode.Decal){if(input?.value!==undefined){const source=arguments.length>=4?tileMode:null;tileMode=input;input=source;}return this._fromNative(K.ImageFilter.MakeBlur(sx,sy,tileMode,unwrap(input)));}
    static CreateColorFilter(cf,input=null){return this._fromNative(K.ImageFilter.MakeColorFilter(unwrap(cf),unwrap(input)));}
    static CreateCompose(outer,inner){return this._fromNative(K.ImageFilter.MakeCompose(unwrap(outer),unwrap(inner)));}
    static CreateDilate(x,y,input=null){return this._fromNative(K.ImageFilter.MakeDilate(x,y,unwrap(input)));}static CreateErode(x,y,input=null){return this._fromNative(K.ImageFilter.MakeErode(x,y,unwrap(input)));}
    static CreateDisplacementMapEffect(x,y,scale,displacement=null,input=null){return this._fromNative(K.ImageFilter.MakeDisplacementMap(x,y,scale,unwrap(displacement),unwrap(input)));}
    static CreateDropShadow(dx,dy,sx,sy,c,input=null){return this._fromNative(K.ImageFilter.MakeDropShadow(dx,dy,sx,sy,color(c),unwrap(input)));}static CreateDropShadowOnly(dx,dy,sx,sy,c,input=null){return this._fromNative(K.ImageFilter.MakeDropShadowOnly(dx,dy,sx,sy,color(c),unwrap(input)));}
    static CreateOffset(dx,dy,input=null){return this._fromNative(K.ImageFilter.MakeOffset(dx,dy,unwrap(input)));}static CreateMatrix(mat,quality=SKFilterQuality.Low,input=null){return this._fromNative(K.ImageFilter.MakeMatrixTransform(matrix(mat),sampling(quality),unwrap(input)));}
    static CreateBlendMode(mode,background=null,foreground=null){return this._fromNative(K.ImageFilter.MakeBlend(mode,unwrap(background),unwrap(foreground)));}
    static CreateImage(image,srcRect,dstRect,sample=SKSamplingOptions.Default){return this._fromNative(srcRect&&dstRect?K.ImageFilter.MakeImage(unwrap(image),sampling(sample),tuple(srcRect),tuple(dstRect)):K.ImageFilter.MakeImage(unwrap(image),sampling(sample)));}
    static CreateShader(shader){return this._fromNative(K.ImageFilter.MakeShader(unwrap(shader)));}
    static CreateMerge(filters){if(!filters.length)return null;let output=filters[0]?this._fromNative(unwrap(filters[0]).clone()):this.CreateOffset(0,0);for(const filter of filters.slice(1)){const next=this.CreateBlendMode(K.BlendMode.SrcOver,output,filter);output?.Dispose();output=next;}return output;}
  }
  class SKMaskFilter extends SKObject {static CreateBlur(style,sigma,respectCTM=true){return this._fromNative(K.MaskFilter.MakeBlur(style,sigma,respectCTM));}static ConvertRadiusToSigma(radius){return radius>0?radius*.57735+.5:0;}static ConvertSigmaToRadius(sigma){return sigma>.5?(sigma-.5)/.57735:0;}}
  class SKPathEffect extends SKObject {
    static CreateDash(intervals,phase=0){if(intervals.length<2||intervals.length%2||intervals.some(v=>!Number.isFinite(v)||v<0)||!intervals.some(v=>v>0))throw new RangeError('Dash intervals must be nonnegative, nonzero in total, and have even count.');return this._fromNative(K.PathEffect.MakeDash(Array.from(intervals),phase));}
    static CreateCorner(radius){return this._fromNative(K.PathEffect.MakeCorner(radius));}static CreateDiscrete(length,deviation,seed=0){return this._fromNative(K.PathEffect.MakeDiscrete(length,deviation,seed));}
    static Create1DPath(path,advance,phase=0,style=K.Path1DEffectStyle.Translate){return this._fromNative(K.PathEffect.MakePath1D(unwrap(path),advance,phase,style));}static Create2DLine(width,mat){return this._fromNative(K.PathEffect.MakeLine2D(width,matrix(mat)));}static Create2DPath(mat,path){return this._fromNative(K.PathEffect.MakePath2D(matrix(mat),unwrap(path)));}
  }
  class SKBlender extends SKObject {static Create(mode){return this._fromNative(K.Blender.Mode(mode));}}
  class SKRuntimeEffectUniforms {
    constructor(effect){effect.ThrowIfDisposed();this._descriptors=effect.Uniforms;this._buffer=new ArrayBuffer(effect.UniformSize);this._values=new Float32Array(this._buffer);}
    Set(name,value){const d=this._descriptors.find(x=>x.Name===name);if(!d)throw new RangeError(`Unknown uniform ${name}`);const a=typeof value==='number'?[value]:value?.ToFloatArray?value.ToFloatArray():tuple(value);if(a.length!==d.Count)throw new RangeError(`Uniform ${name} needs ${d.Count} values.`);if(d.IsInteger&&Array.from(a).some(v=>!Number.isInteger(v)))throw new TypeError(`Uniform ${name} requires integer values.`);this._values.set(a,d.Slot);return this;}
    Add(name,value){return this.Set(name,value);}get Count(){return this._descriptors.length;}ToArray(){return this._values.slice();}get Names(){return this._descriptors.map(x=>x.Name);}
  }
  class SKRuntimeEffectChildren {constructor(){this._values=new Map();}Add(name,shader){unwrap(shader);this._values.set(name,shader);return this;}Set(name,shader){return this.Add(name,shader);}get Count(){return this._values.size;}ToArray(){return [...this._values.values()];}}
  class SKRuntimeEffect extends SKObject {
    static Create(source,errorOutput){return this.CreateShader(source,errorOutput);}static CreateShader(source,errorOutput){let error='';const n=K.RuntimeEffect.Make(source,e=>error=e);if(errorOutput&&typeof errorOutput==='object')errorOutput.ErrorText=error;if(!n){if(errorOutput)return null;throw new Error(`SkSL compilation failed: ${error}`);}const result=this._fromNative(n);result._source=source;return result;}
    static CreateBlender(source,errorOutput){let error='';const n=K.RuntimeEffect.MakeForBlender(source,e=>error=e);if(errorOutput&&typeof errorOutput==='object')errorOutput.ErrorText=error;if(!n){if(errorOutput)return null;throw new Error(`SkSL blender compilation failed: ${error}`);}return this._fromNative(n);}
    get UniformSize(){this.ThrowIfDisposed();return this._native.getUniformFloatCount()*4;}get Uniforms(){this.ThrowIfDisposed();return Array.from({length:this._native.getUniformCount()},(_,i)=>{const d=this._native.getUniform(i);return {Name:this._native.getUniformName(i),Offset:d.slot*4,Slot:d.slot,Count:d.columns*d.rows,Columns:d.columns,Rows:d.rows,IsInteger:d.isInteger};});}
    ToShader(uniforms=[],children=null,localMatrix){this.ThrowIfDisposed();if(typeof uniforms==='boolean')throw new SKNotSupportedError('The opaque flag overload is unavailable; pass uniform values directly.');const data=uniforms instanceof SKRuntimeEffectUniforms?uniforms.ToArray():ArrayBuffer.isView(uniforms)||Array.isArray(uniforms)?uniforms:this._buildUniforms(uniforms);if(data.length!==this._native.getUniformFloatCount())throw new RangeError(`Expected ${this._native.getUniformFloatCount()} uniform scalars, got ${data.length}.`);const kids=children instanceof SKRuntimeEffectChildren?children.ToArray():children;return SKShader._fromNative(kids?.length?this._native.makeShaderWithChildren(data,kids.map(unwrap),matrix(localMatrix)):this._native.makeShader(data,matrix(localMatrix)));}
    _buildUniforms(values){const u=new SKRuntimeEffectUniforms(this);for(const [name,value]of Object.entries(values))u.Set(name,value);return u.ToArray();}
    ToBlender(uniforms=[]){this.ThrowIfDisposed();const v=uniforms instanceof SKRuntimeEffectUniforms?uniforms.ToArray():Array.isArray(uniforms)||ArrayBuffer.isView(uniforms)?uniforms:this._buildUniforms(uniforms);if(v.length!==this._native.getUniformFloatCount())throw new RangeError('Incorrect uniform scalar count.');return SKBlender._fromNative(this._native.makeBlender(v));}
  }
  return {cloneEffect,SKObject,SKNotSupportedError,SKColor,SKColorF,SKColors,SKPoint,SKPointI,SKSize,SKSizeI,SKRect,SKRectI,SKRoundRect,SKRoundRectCorner,SKMatrix,SKMatrix44,SKImageInfo,SKColorSpace,SKSamplingOptions,SKCubicResampler,SKPaint,SKShader,SKColorFilter,SKImageFilter,SKMaskFilter,SKPathEffect,SKRuntimeEffect,SKRuntimeEffectUniforms,SKRuntimeEffectChildren,SKBlender,SKAlphaType,SKBlendMode,SKBlurStyle,SKClipOperation,SKColorChannel,SKColorType,SKPaintStyle,SKStrokeCap,SKStrokeJoin,SKShaderTileMode,SKPathFillType,SKPathOp,SKPathDirection,SKPathVerb,SKPointMode,SKVertexMode,SKPath1DPathEffectStyle,SKFilterMode,SKMipmapMode,SKFilterQuality,SKEncodedImageFormat,unwrap,tuple,color,matrix,sampling,enumValue};
}
