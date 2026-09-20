/** Skottie and resources compatibility, with a retained scene extension for the web.
 * Animation frames, property overrides, slots and text editing execute in native Skia.
 */
export function createAnimationAPI(K, api) {
  const { SKObject, SKData, SKRect, SKSize, SKPoint, SKMatrix, SKColor, SKPaint, SKColors } = api;
  const asArray = x => x?.ToArray?.() ?? x;
  const cloneRect = x => new SKRect(...asArray(x));
  const now = () => globalThis.performance?.now() ?? Date.now();
  const unsupported = message => { throw new api.SKNotSupportedError(message); };
  const finite = (v, name) => { v=Number(v); if(!Number.isFinite(v))throw new RangeError(`${name} must be finite.`);return v; };
  const keyOf = (path, name) => name == null ? String(path) : `${path ? String(path).replace(/\/$/,'')+'/' : ''}${name}`;
  const bytesOf = value => {
    value?.ThrowIfDisposed?.();
    if (typeof value === 'string') return new TextEncoder().encode(value);
    if (value?.AsSpan) return value.AsSpan();
    if (value?.ReadToEnd) return value.ReadToEnd();
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
    throw new TypeError('Expected UTF-8 text, SKData, SKStream, ArrayBuffer or a typed array.');
  };
  function decodeDataURI(uri) {
    if (!String(uri).startsWith('data:')) return null;
    const comma=uri.indexOf(','); if(comma<0)throw new TypeError('Malformed data URI.');
    const header=uri.slice(0,comma),data=uri.slice(comma+1);
    if(/;base64(?:;|$)/i.test(header)) {
      const raw=globalThis.atob(data.replace(/\s/g,''));
      return Uint8Array.from(raw,c=>c.charCodeAt(0));
    }
    // Percent escapes encode bytes, not necessarily UTF-8 (e.g. PNG payloads).
    const out=[];
    for(let i=0;i<data.length;i++) {
      if(data[i]==='%') { const h=data.slice(i+1,i+3);if(!/^[a-f\d]{2}$/i.test(h))throw new TypeError('Malformed data URI escape.');out.push(parseInt(h,16));i+=2; }
      else { const cp=data.codePointAt(i);out.push(...new TextEncoder().encode(String.fromCodePoint(cp)));if(cp>65535)i++; }
    }
    return new Uint8Array(out);
  }
  class TimeSpan {
    constructor(seconds=0){this.TotalSeconds=finite(seconds,'seconds');Object.freeze(this);}
    static FromSeconds(v){return new TimeSpan(v);}static FromMilliseconds(v){return new TimeSpan(v/1000);}
    get TotalMilliseconds(){return this.TotalSeconds*1000;}get Ticks(){return Math.round(this.TotalSeconds*10000000);}
    valueOf(){return this.TotalSeconds;}ToString(){return `${this.TotalSeconds}s`;}
  }

  class ResourceProvider extends SKObject {
    constructor(resources={}) {super();this._entries=new Map();this._urls=new Map();this._pending=new Map();for(const [name,value]of resources instanceof Map?resources:Object.entries(resources))this.Register(name,value);}
    Register(name,data){this.ThrowIfDisposed();if(name==null)throw new TypeError('Resource name is required.');const key=String(name),bytes=bytesOf(data).slice();this._urls.delete(key);this._pending.delete(key);this._entries.set(key,bytes);return this;}
    RegisterUrl(name,url,options={}){this.ThrowIfDisposed();if(name==null)throw new TypeError('Resource name is required.');const key=String(name);this._entries.delete(key);this._pending.delete(key);this._urls.set(key,{url:String(url),options:{...options}});return this;}
    Remove(name){this.ThrowIfDisposed();const key=String(name),removed=this._urls.delete(key);this._pending.delete(key);return this._entries.delete(key)||removed;}
    get ResourceNames(){this.ThrowIfDisposed();return [...new Set([...this._entries.keys(),...this._urls.keys()])];}
    _load(path,name){const key=keyOf(path,name);return this._entries.get(key)??null;}
    Load(path,name){this.ThrowIfDisposed();const data=this._load(path,name);return data?SKData.CreateCopy(data):null;}
    async _loadAsync(path,name){
      const key=keyOf(path,name),data=this._load(path,name);if(data)return data;
      const url=this._urls.get(key);if(!url)return null;
      if(this._pending.has(key))return this._pending.get(key);
      const pending=(async()=>{
        const {MaxBytes=512*1024*1024,...options}=url.options;
        if(!Number.isSafeInteger(MaxBytes)||MaxBytes<0||MaxBytes>512*1024*1024)throw new RangeError('Resource MaxBytes must be 0..512 MiB.');
        const response=await fetch(url.url,options);if(!response.ok)throw new Error(`Resource ${key}: HTTP ${response.status}`);
        let bytes;
        if(response.body&&api.SKData.FromReadableStream){
          const data=await api.SKData.FromReadableStream(response.body,{signal:options.signal,maxBytes:MaxBytes});
          try{bytes=data.AsSpan();}finally{data.Dispose();}
        }else{bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>MaxBytes)throw new RangeError('Resource exceeds MaxBytes.');}
        // An older request can still resolve for its original caller, but may
        // never overwrite a new registration or resurrect a removed resource.
        if(this._urls.get(key)===url)this._entries.set(key,bytes);
        return bytes;
      })();
      this._pending.set(key,pending);
      try{return await pending;}finally{if(this._pending.get(key)===pending)this._pending.delete(key);}
    }
    async LoadAsync(path,name){this.ThrowIfDisposed();const bytes=await this._loadAsync(path,name);return bytes?SKData.CreateCopy(bytes):null;}
    async Preload(){this.ThrowIfDisposed();await Promise.all([...this._urls.keys()].map(key=>this._loadAsync(key)));return this;}
    _all(){return new Map(this._entries);}
    // Retained builders/proxies reference internal byte storage independently of
    // the public wrapper's disposed flag, like the native reference-counted API.
    Dispose(){if(this.IsDisposed)return;super.Dispose();}
  }
  class CachingResourceProvider extends ResourceProvider {
    constructor(provider){super();provider?.ThrowIfDisposed?.();if(!provider?._load)throw new TypeError('A ResourceProvider is required.');this._provider=provider;this._cacheEpoch=0;}
    _load(path,name){const key=keyOf(path,name);if(this._entries.has(key))return this._entries.get(key);const bytes=this._provider._load(path,name);if(bytes)this._entries.set(key,bytes.slice());return this._entries.get(key)??null;}
    async _loadAsync(path,name){
      const key=keyOf(path,name),cached=this._load(path,name);if(cached)return cached;
      if(this._pending.has(key))return this._pending.get(key);
      const epoch=this._cacheEpoch,pending=(async()=>{
        const bytes=await this._provider._loadAsync(path,name);if(!bytes)return null;
        const copy=bytes.slice();if(epoch===this._cacheEpoch)this._entries.set(key,copy);return copy;
      })();
      this._pending.set(key,pending);
      try{return await pending;}finally{if(this._pending.get(key)===pending)this._pending.delete(key);}
    }
    _all(){return new Map([...this._provider._all(),...this._entries]);}
    Clear(){this.ThrowIfDisposed();this._cacheEpoch++;this._entries.clear();this._pending.clear();}
  }
  class DataUriResourceProvider extends ResourceProvider {
    constructor(fallback=null,preDecode=false){super();if(typeof fallback==='boolean'){preDecode=fallback;fallback=null;}fallback?.ThrowIfDisposed?.();this._fallback=fallback;this.PreDecode=!!preDecode;}
    _load(path,name){const uri=name??path;return decodeDataURI(uri)??super._load(path,name)??this._fallback?._load(path,name)??null;}
    async _loadAsync(path,name){return this._load(path,name)??await this._fallback?._loadAsync(path,name)??null;}
    _all(){return new Map([...(this._fallback?._all()??[]),...this._entries]);}
  }
  class FileResourceProvider extends ResourceProvider {
    constructor(baseDirectory='',preDecode=false){super();this.BaseDirectory=String(baseDirectory);this.PreDecode=!!preDecode;}
    _load(path,name){return super._load(path,name)??super._load(keyOf(this.BaseDirectory,keyOf(path,name)));}
    async _loadAsync(path,name){const cached=this._load(path,name);if(cached)return cached;const key=keyOf(path,name);if(!this._urls.has(key)){
      const base=this.BaseDirectory.endsWith('/')?this.BaseDirectory:this.BaseDirectory+'/';
      const root=globalThis.location?.href??'http://localhost/';this._urls.set(key,{url:new URL(key,new URL(base,root)).href,options:{}});
    }return super._loadAsync(path,name);}
  }

  class InvalidationController extends SKObject {
    constructor(){super();this._bounds=SKRect.Empty;this._rects=[];}
    Invalidate(rect,matrix=SKMatrix.Identity){this.ThrowIfDisposed();const mapped=matrix.MapRect?matrix.MapRect(rect):new SKMatrix(asArray(matrix)).MapRect(rect);if(mapped.Width<=0||mapped.Height<=0)return;this._bounds=this._rects.length?SKRect.Union(this._bounds,mapped):cloneRect(mapped);this._rects.push(cloneRect(mapped));}
    get Bounds(){this.ThrowIfDisposed();return cloneRect(this._bounds);}
    get Rectangles(){this.ThrowIfDisposed();return this._rects.map(cloneRect);}
    Begin(){this.ThrowIfDisposed();return this._rects.values();}End(){this.ThrowIfDisposed();return {done:true};}
    Reset(){this.ThrowIfDisposed();this._bounds=SKRect.Empty;this._rects=[];}
    [Symbol.iterator](){return this.Rectangles[Symbol.iterator]();}
  }
  const AnimationBuilderFlags=Object.freeze({None:0,DeferImageLoading:1,PreferEmbeddedFonts:2});
  const AnimationRenderFlags=Object.freeze({None:0,SkipTopLevelIsolation:1,DisableTopLevelClipping:2});
  function readJSON(input,provider){
    if(input==null)throw new TypeError('Animation source is required.');
    if(typeof input==='object'&&!ArrayBuffer.isView(input)&&!(input instanceof ArrayBuffer)&&!input.AsSpan&&!input.ReadToEnd)return JSON.stringify(input);
    if(typeof input==='string'&&!/^\s*[\ufeff{[]/.test(input)){const bytes=provider?._load(input);if(!bytes)throw new Error(`Resource ${input} is not preloaded; use BuildAsync or Animation.CreateAsync.`);return new TextDecoder().decode(bytes);}
    return typeof input==='string'?input.replace(/^\ufeff/,''):new TextDecoder().decode(bytesOf(input)).replace(/^\ufeff/,'');
  }
  const hasAnimation = doc => doc&&typeof doc==='object'&&Number.isFinite(doc.w)&&Number.isFinite(doc.h)&&doc.w>0&&doc.h>0&&Number.isFinite(doc.fr)&&doc.fr>0&&Number.isFinite(doc.ip)&&Number.isFinite(doc.op)&&doc.op>doc.ip&&Array.isArray(doc.layers);
  const audioIdsOf=doc=>new Set([...(doc.layers??[]),...(doc.assets??[]).flatMap(asset=>asset.layers??[])].filter(layer=>layer.ty===6).map(layer=>layer.refId));
  const countAnimated=v=>!v||typeof v!=='object'?0:(v.a===1&&Array.isArray(v.k)?1:0)+Object.values(v).reduce((n,x)=>n+countAnimated(x),0);
  class AnimationBuilderStats {
    constructor(values={}){Object.assign(this,{TotalLoadTime:new TimeSpan(),JsonParseTime:new TimeSpan(),SceneParseTime:new TimeSpan(),JsonSize:0,AnimatorCount:null,JsonAnimatedPropertyCount:0},values);Object.freeze(this);}
  }
  class AnimationBuilder extends SKObject {
    constructor(flags=0){super();if(flags&~3)throw new RangeError('Unknown animation builder flags.');this.Flags=flags;this._provider=new DataUriResourceProvider();this._fontBytes=(api.SKFontManager?.Default?._entries??[]).map(e=>({family:e.family,bytes:e.bytes.slice()}));this._stats=new AnimationBuilderStats();this.Diagnostics=[];this._filterPrefix='';this._soundMap=null;}
    SetFontManager(manager){this.ThrowIfDisposed();manager.ThrowIfDisposed();this._fontBytes=(manager._entries??[]).map(e=>({family:e.family,bytes:e.bytes.slice()}));return this;}
    SetResourceProvider(provider){this.ThrowIfDisposed();provider.ThrowIfDisposed();this._provider=provider;return this;}
    SetPropertyPrefix(prefix){this.ThrowIfDisposed();this._filterPrefix=String(prefix);return this;}
    SetSoundMap(map){this.ThrowIfDisposed();if(map&&typeof map.getPlayer!=='function')throw new TypeError('SoundMap must supply getPlayer(id).');this._soundMap=map?{getPlayer:key=>{const player=map.getPlayer(key);return player&&typeof player.seek==='function'?{seek:time=>player.seek(time)}:null;}}:null;return this;}
    get Stats(){this.ThrowIfDisposed();return this._stats;}
    Build(input){this.ThrowIfDisposed();const start=now();let doc,json;this.Diagnostics=[];
      const text=readJSON(input,this._provider),parseStart=now();try{doc=JSON.parse(text);}catch(error){this.Diagnostics.push({Level:'Error',Message:error.message});return null;}const parseTime=now()-parseStart;
      if(!hasAnimation(doc)){this.Diagnostics.push({Level:'Error',Message:'Animation requires positive w/h/fr, op > ip and a layers array.'});return null;}
      const assets=Object.create(null),resources=this._provider._all(),audioIds=audioIdsOf(doc);for(const [key,bytes]of resources)assets[key]=bytes.slice().buffer;
      const resolve=(path,name)=>decodeDataURI(name)??this._provider._load(path,name)??this._provider._load(name);
      for(const [index,asset] of (doc.assets??[]).entries())if(asset.p&&!audioIds.has(asset.id)){const bytes=resolve(asset.u??'',asset.p);if(bytes){const key=`__skweb_image_${index}_${asset.id??''}`;assets[key]=bytes.slice().buffer;asset.p=key;asset.u='';asset.e=0;}else if(!String(asset.p).startsWith('data:'))this.Diagnostics.push({Level:'Warning',Message:`Image resource is not loaded: ${keyOf(asset.u,asset.p)}`});}
      for(const [index,font]of(doc.fonts?.list??[]).entries())if(font.fPath){const bytes=resolve('',font.fPath);if(bytes){const key=`__skweb_font_${index}`;assets[key]=bytes.slice().buffer;font.fPath=key;}else this.Diagnostics.push({Level:'Warning',Message:`Font resource is not loaded: ${font.fPath}`});}
      const embeddedFamilies=new Set((doc.chars??[]).map(char=>char.fFamily));
      for(const[index,font]of this._fontBytes.entries())if(!(this.Flags&2)||!embeddedFamilies.has(font.family))assets[`__skweb_manager_font_${index}`]=font.bytes.slice().buffer;
      json=JSON.stringify(doc);const sceneStart=now();const diagnostics=this.Diagnostics;
      const make=()=>{if(typeof K.MakeManagedAnimation!=='function')unsupported('This CanvasKit build does not include managed Skottie.');return K.MakeManagedAnimation(json,assets,this._filterPrefix,this._soundMap,{onError:(message,context)=>diagnostics.push({Level:'Error',Message:message,Context:context}),onWarning:(message,context)=>diagnostics.push({Level:'Warning',Message:message,Context:context})});};
      const native=(this.Flags&1)?null:make();
      this._stats=new AnimationBuilderStats({TotalLoadTime:new TimeSpan((now()-start)/1000),JsonParseTime:new TimeSpan(parseTime/1000),SceneParseTime:new TimeSpan((now()-sceneStart)/1000),JsonSize:new TextEncoder().encode(text).length,JsonAnimatedPropertyCount:countAnimated(doc)});
      if(!(this.Flags&1)&&!native)return null;
      const animation=new Animation(native,doc,make,assets,diagnostics);animation._soundMap=this._soundMap;return animation;
    }
    async BuildAsync(input,options={}){this.ThrowIfDisposed();let source=input;
      if(typeof Blob!=='undefined'&&source instanceof Blob)source=await source.arrayBuffer();
      if(typeof source==='string'&&!/^\s*[\ufeff{[]/.test(source)){
        let bytes=await this._provider._loadAsync(source);if(!bytes){const response=await fetch(source,options.fetchOptions);if(!response.ok)throw new Error(`Animation request: HTTP ${response.status}`);bytes=new Uint8Array(await response.arrayBuffer());}source=bytes;
      }
      const text=readJSON(source,this._provider);let doc;try{doc=JSON.parse(text);}catch{return this.Build(text);}
      const requests=[],audioIds=audioIdsOf(doc);for(const asset of doc.assets??[])if(asset.p&&!audioIds.has(asset.id)&&!String(asset.p).startsWith('data:'))requests.push([asset.u??'',asset.p]);for(const font of doc.fonts?.list??[])if(font.fPath&&!font.fPath.startsWith('data:'))requests.push(['',font.fPath]);
      await Promise.all(requests.map(async([path,name])=>{let bytes=await this._provider._loadAsync(path,name)??await this._provider._loadAsync(name);if(!bytes&&options.baseUrl){const url=new URL(keyOf(path,name),options.baseUrl).href;const response=await fetch(url,options.fetchOptions);if(response.ok){bytes=new Uint8Array(await response.arrayBuffer());this._provider._entries.set(keyOf(path,name),bytes);}else if(options.strictResources!==false)throw new Error(`Resource ${url}: HTTP ${response.status}`);}if(!bytes&&options.strictResources!==false)throw new Error(`Animation resource is unavailable: ${keyOf(path,name)}`);}));
      return this.Build(text);
    }
  }
  class Animation extends SKObject {
    constructor(native,doc,factory,assets,diagnostics){super(native);this._doc=doc;this._factory=factory;this._assets=assets;this._diagnostics=diagnostics;this._frame=0;this._initialSeek=false;}
    static CreateBuilder(flags=0){return new AnimationBuilder(flags);}
    static Parse(json){if(json==null)throw new TypeError('JSON is required.');const builder=new AnimationBuilder();try{return builder.Build(json);}finally{builder.Dispose();}}
    static TryParse(json,out){const animation=this.Parse(json);if(out){out.Animation=animation;return !!animation;}return {Success:!!animation,Animation:animation};}
    static Create(source){return this.Parse(source);}
    static TryCreate(source,out){return this.TryParse(source,out);}
    static async CreateAsync(source,options={}){const builder=new AnimationBuilder(options.flags??0);if(options.resourceProvider)builder.SetResourceProvider(options.resourceProvider);if(options.fontManager)builder.SetFontManager(options.fontManager);try{const baseUrl=options.baseUrl??(typeof source==='string'&&!/^\s*[\ufeff{[]/.test(source)?new URL('.',new URL(source,globalThis.location?.href??'http://localhost/')).href:undefined);return await builder.BuildAsync(source,{...options,baseUrl});}finally{builder.Dispose();}}
    _ready(){this.ThrowIfDisposed();if(!this._native){this._native=this._factory();if(!this._native)throw new Error('Native Skottie could not build the animation.');}return this._native;}
    get Duration(){this.ThrowIfDisposed();return new TimeSpan((this.OutPoint-this.InPoint)/this.Fps);}
    get Fps(){this.ThrowIfDisposed();return this._doc.fr;}get InPoint(){this.ThrowIfDisposed();return this._doc.ip;}get OutPoint(){this.ThrowIfDisposed();return this._doc.op;}
    get Version(){this.ThrowIfDisposed();return String(this._doc.v??'');}get Size(){this.ThrowIfDisposed();return new SKSize(this._doc.w,this._doc.h);}
    get Diagnostics(){this.ThrowIfDisposed();return this._diagnostics.map(x=>({...x}));}get CurrentFrame(){this.ThrowIfDisposed();return this._frame;}
    Render(canvas,destination=SKRect.Create(this.Size),flags=0){this.ThrowIfDisposed();if(canvas._isDocumentCanvas&&typeof canvas.DrawNative==='function')return canvas.DrawNative(target=>this.Render(target,destination,flags),'Skottie animation');canvas.ThrowIfDisposed?.();if(flags!==0)unsupported('The bundled CanvasKit Skottie render binding does not expose SkipTopLevelIsolation or DisableTopLevelClipping.');
      if(!this._initialSeek)this.SeekFrame(this._frame);canvas._complex?.();this._ready().render(canvas._native??canvas,asArray(destination));
    }
    Seek(percent,controller=null){return this.SeekFrame(finite(percent,'percent')*(this.OutPoint-this.InPoint),controller);}
    SeekFrame(frame,controller=null){frame=finite(frame,'frame');const native=this._ready();this._frame=Math.min(Math.max(frame,0),this.OutPoint-this.InPoint);const damage=native.seekFrame(this._frame);this._initialSeek=true;const rect=damage?new SKRect(...damage):SKRect.Create(this.Size);if(controller&&rect.Width>0&&rect.Height>0)controller.Invalidate(rect,SKMatrix.Identity);return rect;}
    SeekFrameTime(time,controller=null){return this.SeekFrame(finite(time?.TotalSeconds??time,'seconds')*this.Fps,controller);}
    get Markers(){return this._ready().getMarkers().map(m=>({Name:m.name,Start:m.t0,End:m.t1,StartFrame:m.t0*(this.OutPoint-this.InPoint),EndFrame:m.t1*(this.OutPoint-this.InPoint)}));}
    GetColorProperties(){return this._ready().getColorProps().map(p=>({Key:p.key,Value:new SKColor(p.value)}));}
    GetOpacityProperties(){return this._ready().getOpacityProps().map(p=>({Key:p.key,Value:p.value}));}
    GetTextProperties(){return this._ready().getTextProps().map(p=>({Key:p.key,Value:{Text:p.value.text,Size:p.value.size}}));}
    GetTransformProperties(){return this._ready().getTransformProps().map(p=>({Key:p.key,Value:{Anchor:new SKPoint(...p.value.anchor),Position:new SKPoint(...p.value.position),Scale:new SKPoint(...p.value.scale),Rotation:p.value.rotation,Skew:p.value.skew,SkewAxis:p.value.skew_axis}}));}
    SetColor(key,value){return this._ready().setColor(String(key),api.color(value));}
    SetOpacity(key,value){return this._ready().setOpacity(String(key),Math.max(0,Math.min(100,finite(value,'opacity'))));}
    SetText(key,text,size){if(size==null)size=this.GetTextProperties().find(p=>p.Key===key)?.Value.Size??0;return this._ready().setText(String(key),String(text),finite(size,'size'));}
    SetTransform(key,transform,...args){if(args.length){const[anchor,position,scale,rotation,skew,skewAxis]=[transform,...args];return this._ready().setTransform(String(key),asArray(anchor),asArray(position),asArray(scale),rotation,skew??0,skewAxis??0);}const t=transform;return this._ready().setTransform(String(key),asArray(t.Anchor??t.anchor??[0,0]),asArray(t.Position??t.position??[0,0]),asArray(t.Scale??t.scale??[100,100]),t.Rotation??t.rotation??0,t.Skew??t.skew??0,t.SkewAxis??t.skew_axis??0);}
    GetSlotInfo(){const s=this._ready().getSlotInfo();return {ColorSlotIds:[...s.colorSlotIDs],ScalarSlotIds:[...s.scalarSlotIDs],VectorSlotIds:[...s.vec2SlotIDs],ImageSlotIds:[...s.imageSlotIDs],TextSlotIds:[...s.textSlotIDs]};}
    SetColorSlot(key,color){return this._ready().setColorSlot(String(key),api.color(color));}GetColorSlot(key){const v=this._ready().getColorSlot(String(key));return v?new api.SKColorF(...v).ToSKColor():null;}
    SetScalarSlot(key,value){return this._ready().setScalarSlot(String(key),finite(value,'value'));}GetScalarSlot(key){return this._ready().getScalarSlot(String(key));}
    SetVectorSlot(key,value){return this._ready().setVec2Slot(String(key),asArray(value));}GetVectorSlot(key){const value=this._ready().getVec2Slot(String(key));return value?new SKPoint(...value):null;}
    SetImageSlot(key,assetName){return this._ready().setImageSlot(String(key),String(assetName));}
    SetTextSlot(key,value){const native={};for(const [name,item]of Object.entries(value)){const k=name[0].toLowerCase()+name.slice(1);native[k]=item?._native??(k==='fillColor'||k==='strokeColor'?api.color(item):item?.ToArray?.()??item);}return this._ready().setTextSlot(String(key),native);}
    GetTextSlot(key){const value=this._ready().getTextSlot(String(key));if(!value)return null;return Object.fromEntries(Object.entries(value).map(([name,item])=>[name[0].toUpperCase()+name.slice(1),item]));}
    AttachEditor(id,index=0){return this._ready().attachEditor(String(id),index);}EnableEditor(enabled){this._ready().enableEditor(!!enabled);}
    DispatchEditorKey(key){return this._ready().dispatchEditorKey(String(key));}DispatchEditorPointer(x,y,state=K.InputState.Down,modifier=K.ModifierKey.None){return this._ready().dispatchEditorPointer(x,y,state,modifier);}
    SetEditorCursorWeight(weight){this._ready().setEditorCursorWeight(finite(weight,'weight'));}
    Dispose(){if(this.IsDisposed)return;super.Dispose();this._factory=null;this._assets=null;this._soundMap=null;}
  }

  // Retained graph nodes are web extensions; upstream SkiaSharp.SceneGraph only
  // publicly wraps InvalidationController. Each leaf snapshots owned resources.
  let generation=1;
  class SceneNode extends SKObject {
    constructor(){super();this._parents=new Set();this._generation=generation++;this._matrix=SKMatrix.Identity;this._visible=true;this._opacity=1;this._bounds=SKRect.Empty;this._lastBounds=SKRect.Empty;this._dirty=true;}
    get GenerationId(){this.ThrowIfDisposed();return this._generation;}
    get Matrix(){this.ThrowIfDisposed();return new SKMatrix(this._matrix.ToArray());}set Matrix(value){this.ThrowIfDisposed();this._matrix=new SKMatrix(asArray(value));this.Invalidate();}
    get IsVisible(){return this._visible;}set IsVisible(value){this.ThrowIfDisposed();if(this._visible!==!!value){this._visible=!!value;this.Invalidate();}}
    get Opacity(){return this._opacity;}set Opacity(value){this.ThrowIfDisposed();this._opacity=Math.max(0,Math.min(1,finite(value,'opacity')));this.Invalidate();}
    Invalidate(){this.ThrowIfDisposed();this._dirty=true;this._generation=generation++;for(const parent of this._parents)parent.Invalidate();}
    _localBounds(){return SKRect.Empty;}
    get Bounds(){this.ThrowIfDisposed();return this._visible?this._matrix.MapRect(this._localBounds()):SKRect.Empty;}
    Revalidate(controller=null,parentMatrix=SKMatrix.Identity){this.ThrowIfDisposed();const current=parentMatrix.MapRect(this.Bounds);if(this._dirty){if(controller){controller.Invalidate(this._lastBounds);controller.Invalidate(current);}this._lastBounds=cloneRect(current);this._dirty=false;}return current;}
    Render(canvas){this.ThrowIfDisposed();if(!this._visible||this._opacity<=0)return;const count=canvas.Save();let paint=null;try{canvas.Concat(this._matrix);if(this._opacity<1){paint=new SKPaint({Color:SKColors.White.WithAlpha(this._opacity*255)});canvas.SaveLayer(paint);}this._draw(canvas);}finally{canvas.RestoreToCount(count);paint?.Dispose();}}
    _draw(){}
    HitTest(point){this.ThrowIfDisposed();return this._visible&&this._opacity>0&&this.Bounds.Contains(point)?this:null;}
    Dispose(){if(this.IsDisposed)return;for(const p of [...this._parents])p.Remove(this);super.Dispose();}
  }
  class GroupNode extends SceneNode {
    constructor(children=[]){super();this._children=[];for(const child of children)this.Add(child);}
    get Children(){this.ThrowIfDisposed();return this._children.slice();}
    Add(node){this.ThrowIfDisposed();node.ThrowIfDisposed();if(!(node instanceof SceneNode))throw new TypeError('Expected SceneNode.');if(node===this||node._contains?.(this))throw new Error('A scene graph cannot contain a cycle.');if(!this._children.includes(node)){this._children.push(node);node._parents.add(this);this.Invalidate();}return this;}
    _contains(node){return this._children.some(c=>c===node||c._contains?.(node));}
    Remove(node){this.ThrowIfDisposed();const index=this._children.indexOf(node);if(index<0)return false;this._children.splice(index,1);node._parents.delete(this);this.Invalidate();return true;}
    Clear(){for(const node of this._children)node._parents.delete(this);this._children=[];this.Invalidate();}
    _localBounds(){let bounds=null;for(const node of this._children){const b=node.Bounds;if(b.Width>0&&b.Height>0)bounds=bounds?SKRect.Union(bounds,b):cloneRect(b);}return bounds??SKRect.Empty;}
    _draw(canvas){for(const node of this._children)node.Render(canvas);}
    HitTest(point){this.ThrowIfDisposed();if(!this._visible||this._opacity<=0)return null;const inverse=this._matrix.TryInvert();if(!inverse.Success)return null;const local=inverse.Inverse.MapPoint(point);for(const node of [...this._children].reverse()){const result=node.HitTest(local);if(result)return result;}return null;}
    Dispose(){if(this.IsDisposed)return;this.Clear();super.Dispose();}
  }
  class GeometryNode extends SceneNode {
    constructor(kind,geometry,paint){super();this.Kind=kind;this._geometry=kind==='path'?geometry.Clone():cloneRect(geometry);this._paint=paint.Clone();}
    static Rectangle(rect,paint){return new GeometryNode('rect',rect,paint);}static Ellipse(rect,paint){return new GeometryNode('oval',rect,paint);}static Path(path,paint){return new GeometryNode('path',path,paint);}
    SetPaint(paint){this.ThrowIfDisposed();const copy=paint.Clone();this._paint.Dispose();this._paint=copy;this.Invalidate();return this;}
    SetGeometry(geometry){this.ThrowIfDisposed();const copy=this.Kind==='path'?geometry.Clone():cloneRect(geometry);this._geometry.Dispose?.();this._geometry=copy;this.Invalidate();return this;}
    _localBounds(){const bounds=this.Kind==='path'?this._geometry.Bounds:cloneRect(this._geometry);return this._paint.Style===api.SKPaintStyle.Fill?bounds:bounds.Inflate(Math.max(1,this._paint.StrokeWidth)/2);}
    _draw(canvas){if(this.Kind==='path')canvas.DrawPath(this._geometry,this._paint);else if(this.Kind==='oval')canvas.DrawOval(this._geometry,this._paint);else canvas.DrawRect(this._geometry,this._paint);}
    HitTest(point){if(!super.HitTest(point))return null;const inv=this._matrix.TryInvert();if(!inv.Success)return null;const p=inv.Inverse.MapPoint(point);if(this._paint.Style!==api.SKPaintStyle.Fill)return this;if(this.Kind==='path')return this._geometry.Contains(p.X,p.Y)?this:null;if(this.Kind==='oval'){const r=this._geometry;return ((p.X-r.MidX)/(r.Width/2))**2+((p.Y-r.MidY)/(r.Height/2))**2<=1?this:null;}return this._geometry.Contains(p)?this:null;}
    Dispose(){if(this.IsDisposed)return;this._paint.Dispose();this._geometry.Dispose?.();super.Dispose();}
  }
  class DrawableNode extends SceneNode {
    constructor(drawable,bounds){super();if(typeof drawable!=='function'&&!drawable?.Draw)throw new TypeError('Expected a drawing callback or drawable.');this._drawable=drawable;this._bounds=cloneRect(bounds??drawable.Bounds);}
    SetBounds(bounds){this._bounds=cloneRect(bounds);this.Invalidate();return this;}_localBounds(){return cloneRect(this._bounds);}
    _draw(canvas){if(typeof this._drawable==='function')this._drawable(canvas);else this._drawable.Draw(canvas);}
  }
  class ClipNode extends GroupNode {
    constructor(clip,children=[]){super(children);this._clip=clip instanceof api.SKPath?clip.Clone():cloneRect(clip);}
    SetClip(clip){this.ThrowIfDisposed();const copy=clip instanceof api.SKPath?clip.Clone():cloneRect(clip);this._clip.Dispose?.();this._clip=copy;this.Invalidate();return this;}
    _localBounds(){return SKRect.Intersect(super._localBounds(),this._clip.Bounds??this._clip);}
    _draw(canvas){const count=canvas.Save();try{if(this._clip instanceof api.SKPath)canvas.ClipPath(this._clip,api.SKClipOperation.Intersect,true);else canvas.ClipRect(this._clip,api.SKClipOperation.Intersect,true);super._draw(canvas);}finally{canvas.RestoreToCount(count);}}
    HitTest(point){const inverse=this._matrix.TryInvert();if(!inverse.Success)return null;const local=inverse.Inverse.MapPoint(point);if(!this._clip.Contains(local.X,local.Y))return null;return super.HitTest(point);}
    Dispose(){if(this.IsDisposed)return;this._clip.Dispose?.();super.Dispose();}
  }
  class ImageNode extends SceneNode {
    constructor(image,destination=null,paint=null){super();image.ThrowIfDisposed();this._image=api.SKImage._fromNative(image._native.clone());this._destination=cloneRect(destination??SKRect.Create(image.Width,image.Height));this._paint=paint?.Clone()??null;}
    SetDestination(destination){this.ThrowIfDisposed();this._destination=cloneRect(destination);this.Invalidate();return this;}
    _localBounds(){return cloneRect(this._destination);}_draw(canvas){canvas.DrawImage(this._image,this._destination,this._paint);}
    Dispose(){if(this.IsDisposed)return;this._image.Dispose();this._paint?.Dispose();super.Dispose();}
  }
  class TextNode extends SceneNode {
    constructor(text,font,paint,origin=new SKPoint()){super();const face=font.Typeface;try{this._font=new api.SKFont(face,font.Size,font.ScaleX,font.SkewX);for(const name of ['Embolden','Edging','Hinting','EmbeddedBitmaps','LinearMetrics','Subpixel'])this._font[name]=font[name];}finally{face?.Dispose();}this._paint=paint.Clone();this._text=String(text);this._origin=new SKPoint(...asArray(origin));}
    get Text(){this.ThrowIfDisposed();return this._text;}set Text(value){this.ThrowIfDisposed();this._text=String(value);this.Invalidate();}
    SetOrigin(point){this.ThrowIfDisposed();this._origin=new SKPoint(...asArray(point));this.Invalidate();return this;}
    _localBounds(){const bounds=SKRect.Empty;this._font.MeasureText(this._text,bounds,this._paint);return bounds.Offset(this._origin);}
    _draw(canvas){canvas.DrawText(this._text,this._origin.X,this._origin.Y,this._font,this._paint);}
    Dispose(){if(this.IsDisposed)return;this._font.Dispose();this._paint.Dispose();super.Dispose();}
  }
  class AnimationNode extends SceneNode {
    constructor(animation){super();animation.ThrowIfDisposed();this.Animation=animation;}
    SeekFrame(frame){this.Animation.SeekFrame(frame);this.Invalidate();return this;}_localBounds(){return SKRect.Create(this.Animation.Size);}_draw(canvas){this.Animation.Render(canvas);}
  }
  class Scene extends SKObject {
    constructor(root=new GroupNode()){super();this.Root=root;this.Invalidation=new InvalidationController();}
    Render(canvas,{clearColor=null}={}){this.ThrowIfDisposed();this.Root.Revalidate(this.Invalidation);if(clearColor!=null)canvas.Clear(clearColor);this.Root.Render(canvas);return this.Invalidation.Bounds;}
    HitTest(point){this.ThrowIfDisposed();return this.Root.HitTest(point);}
    ResetInvalidation(){this.Invalidation.Reset();}
    Dispose(){if(this.IsDisposed)return;this.Invalidation.Dispose();super.Dispose();}
  }
  const Skottie=Object.freeze({Animation,AnimationBuilder,AnimationBuilderStats,AnimationBuilderFlags,AnimationRenderFlags,TimeSpan,InputState:K.InputState,ModifierKey:K.ModifierKey});
  const Resources=Object.freeze({ResourceProvider,CachingResourceProvider,DataUriResourceProvider,FileResourceProvider});
  const SceneGraph=Object.freeze({InvalidationController,SceneNode,GroupNode,GeometryNode,DrawableNode,ClipNode,ImageNode,TextNode,AnimationNode,Scene});
  return {Skottie,Resources,SceneGraph,Animation,AnimationBuilder,AnimationBuilderStats,AnimationBuilderFlags,AnimationRenderFlags,ResourceProvider,CachingResourceProvider,DataUriResourceProvider,FileResourceProvider,InvalidationController,SKTimeSpan:TimeSpan};
}
