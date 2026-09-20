import { createFontCache } from './font-cache.js';
import { ReadFont, NormalizeFont, InstantiateFont, ReplacePalette, ReadPalettes, ReadColorLayers, ReadBitmap, ReadSvg, ReadColorPaint, FontTables, WriteSfnt, DocumentFontBytes } from './font-engine.js';
/* Font and text APIs backed by CanvasKit's FreeType, HarfBuzz and SkParagraph.
 * Font discovery is explicitly scoped to fonts registered in this runtime.
 * Copyright (c) 2026. MIT license. */
export function createFonts(K, core) {
  const { SKObject, SKRect, SKPoint } = core;
  const SKFontCache=createFontCache(NormalizeFont,InstantiateFont,ReplacePalette);
  const un = x => x?._native ?? x;
  const num = x => typeof x === 'object' && x !== null && 'value' in x ? x.value : x;
  const enumValue = (group, value, fallback) => {
    if (value === undefined || value === null) return group[fallback];
    if (typeof value === 'object') return value;
    if (typeof value === 'string' && group[value]) return group[value];
    return Object.values(group).find(x => x && typeof x === 'object' && x.value === value) ?? group[fallback];
  };
  const bytesOf = data => {
    if (data instanceof Uint8Array) return new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (data?.ToArray) return bytesOf(data.ToArray());
    if (data?.Bytes) return bytesOf(data.Bytes);
    throw new TypeError('Font data must be ArrayBuffer, Uint8Array, or SKData.');
  };
  const bufferOf = data => { const b = bytesOf(data); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const point = (x, y) => SKPoint ? new SKPoint(x, y) : { X: x, Y: y };
  const rect = r => SKRect ? new SKRect(...r) : { Left:r[0], Top:r[1], Right:r[2], Bottom:r[3] };
  const xy = p => Array.isArray(p) || ArrayBuffer.isView(p) ? [p[0],p[1]] : [p.X ?? p.x ?? 0,p.Y ?? p.y ?? 0];
  const tagOf = t => typeof t === 'string' ? t : String.fromCharCode((Number(t) >>> 24)&255,(Number(t) >>> 16)&255,(Number(t) >>> 8)&255,Number(t)&255);
  const tagNumber = t => (((t.charCodeAt(0)<<24) | (t.charCodeAt(1)<<16) | (t.charCodeAt(2)<<8) | t.charCodeAt(3)) >>> 0);
  const unsupported = message => { throw new Error(`NotSupportedException: ${message}`); };
  function collectionFace(data,index=0) {
    const bytes=bytesOf(data);if(!Number.isInteger(index)||index<0)throw new RangeError('Collection index must be a nonnegative integer.');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(bytes.length<12||view.getUint32(0)!==0x74746366){if(index!==0)throw new RangeError('This font is not a collection.');return bytes;}
    const count=view.getUint32(8);if(count>(bytes.length-12)/4)throw new Error('Malformed font collection header.');if(index>=count)throw new RangeError('Collection index is outside the font collection.');
    const start=view.getUint32(12+index*4);if(start+12>bytes.length)throw new Error('Malformed font collection face.');
    const tables=view.getUint16(start+4);if(start+12+tables*16>bytes.length)throw new Error('Malformed font table directory.');
    const entries=[];let size=12+tables*16;
    for(let i=0;i<tables;i++){const p=start+12+i*16,source=view.getUint32(p+8),length=view.getUint32(p+12);if(source>bytes.length||length>bytes.length-source)throw new Error('Malformed font table range.');entries.push({p,source,length,target:size});size+=(length+3)&~3;}
    const output=new Uint8Array(size),target=new DataView(output.buffer);output.set(bytes.subarray(start,start+12));let head=null;
    const checksum=(offset,length)=>{let sum=0;for(let i=offset;i<offset+length;i+=4)sum=(sum+target.getUint32(i))>>>0;return sum;};
    for(let i=0;i<entries.length;i++){const e=entries[i],p=12+i*16;output.set(bytes.subarray(e.p,e.p+16),p);output.set(bytes.subarray(e.source,e.source+e.length),e.target);target.setUint32(p+8,e.target);if(view.getUint32(e.p)===0x68656164&&e.length>=12){head=e.target;target.setUint32(head+8,0);}target.setUint32(p+4,checksum(e.target,(e.length+3)&~3));}
    if(head!==null)target.setUint32(head+8,(0xb1b0afba-checksum(0,size))>>>0);return output;
  }
  let nextTypefaceId = 1, nextBlobId = 1;
  const recordHash = values => {let hash=2166136261;const b=new ArrayBuffer(8),v=new DataView(b);for(const item of values){v.setFloat64(0,item===null?NaN:Number(item)||0);hash=Math.imul(hash^v.getUint32(0),16777619);hash=Math.imul(hash^v.getUint32(4),16777619);}return hash|0;};
  const tagValue = value => typeof value==='string'?tagNumber(value):Number(value)>>>0;
  const writeRecords=(destination,records)=>{if(destination.length<records.length)throw new RangeError('Destination span is shorter than the record count.');for(let i=0;i<records.length;i++)destination[i]=records[i];return records.length;};
  class SKFontVariationAxis {
    constructor(tag=0,min=0,defaultValue=0,max=0,isHidden=false){if(tag&&typeof tag==='object'&&!tag.ToUint){const o=tag;tag=o.Tag??0;min=o.Min??0;defaultValue=o.Default??0;max=o.Max??0;isHidden=o.IsHidden??false;this.Name=o.Name??null;}this.Tag=core.SKFourByteTag?new core.SKFourByteTag(tagValue(tag)):tagValue(tag);this.Min=Number(min);this.Default=Number(defaultValue);this.Max=Number(max);this.IsHidden=!!isHidden;}
    get TagName(){return tagOf(this.Tag);}
    Equals(other){return !!other&&tagValue(this.Tag)===tagValue(other.Tag)&&this.Min===other.Min&&this.Default===other.Default&&this.Max===other.Max&&this.IsHidden===other.IsHidden;}
    GetHashCode(){return recordHash([this.Tag,this.Min,this.Default,this.Max,this.IsHidden]);}
  }
  class SKFontMetrics {
    constructor(values={}){for(const key of ['Top','Ascent','Descent','Bottom','Leading','AverageCharacterWidth','MaxCharacterWidth','XMin','XMax','XHeight','CapHeight'])this[key]=values[key]??0;for(const key of ['UnderlineThickness','UnderlinePosition','StrikeoutThickness','StrikeoutPosition'])this[key]=values[key]??null;}
    Equals(other){return !!other&&Object.keys(this).every(key=>Object.is(this[key],other[key])||this[key]===other[key]);}
    GetHashCode(){return recordHash(Object.values(this));}
  }


  class SKFontArgumentsVariationPositionCoordinate {
    constructor(axis=0,value=0){if(axis&&typeof axis==='object'&&!axis.ToUint){value=axis.Value??axis.value??0;axis=axis.Axis??axis.axis??axis.Tag??0;}this.Axis=core.SKFourByteTag?new core.SKFourByteTag(tagValue(axis)):tagValue(axis);this.Value=Number(value);}
    get AxisName(){return tagOf(this.Axis);}
    Equals(other){return !!other&&tagValue(this.Axis)===tagValue(other.Axis)&&this.Value===other.Value;}
    GetHashCode(){return recordHash([this.Axis,this.Value]);}
  }
  class SKFontArgumentsVariationPosition {
    constructor(coordinates=[]){if(!Array.isArray(coordinates)&&!ArrayBuffer.isView(coordinates))coordinates=coordinates.Coordinates??coordinates.coordinates??Object.entries(coordinates).map(([Axis,Value])=>({Axis,Value}));this.Coordinates=Array.from(coordinates,c=>new SKFontArgumentsVariationPositionCoordinate(c));}
    get CoordinateCount(){return this.Coordinates.length;}
    get length(){return this.Coordinates.length;}
    [Symbol.iterator](){return this.Coordinates[Symbol.iterator]();}
  }
  class SKFontArgumentsPaletteOverride {constructor(index=0,color=0){if(index&&typeof index==='object'){color=index.Color??index.color;index=index.Index??index.index??0;}this.Index=index;this.Color=typeof color==='number'?color>>>0:color?.ToUint?color.ToUint():color?new core.SKColor(color.Red??color.red??0,color.Green??color.green??0,color.Blue??color.blue??0,color.Alpha??color.alpha??255).ToUint():0;}Equals(other){return !!other&&this.Index===other.Index&&(typeof this.Color==='number'?this.Color>>>0:this.Color.ToUint())===(typeof other.Color==='number'?other.Color>>>0:other.Color.ToUint());}GetHashCode(){return recordHash([this.Index,typeof this.Color==='number'?this.Color>>>0:this.Color.ToUint()]);}}
  class SKFontArgumentsPalette {constructor(index=0,overrides=[]){if(index&&typeof index==='object'){overrides=index.Overrides??index.overrides??[];index=index.Index??index.index??0;}this.Index=index;this.Overrides=Array.from(overrides,v=>new SKFontArgumentsPaletteOverride(v));}get OverrideCount(){return this.Overrides.length;}}
  class SKFontArguments {
    constructor(options={}){this.CollectionIndex=options.CollectionIndex??0;this.VariationDesignPosition=new SKFontArgumentsVariationPosition(options.VariationDesignPosition??options.VariationPosition??[]);this.Palette=options.Palette!==undefined&&options.Palette!==null?new SKFontArgumentsPalette(options.Palette):options.PaletteIndex!==undefined||options.PaletteOverrides!==undefined?new SKFontArgumentsPalette(options.PaletteIndex??0,options.PaletteOverrides??[]):null;}
    get VariationDesignPosition(){return this._variationDesignPosition;}set VariationDesignPosition(value){const records=new SKFontArgumentsVariationPosition(value??[]).Coordinates;Object.defineProperties(records,{Coordinates:{get(){return this;}},CoordinateCount:{get(){return this.length;}}});this._variationDesignPosition=records;}
    get PaletteIndex(){return this.Palette?.Index??0;}set PaletteIndex(value){this.Palette=new SKFontArgumentsPalette(value,this.Palette?.Overrides??[]);}
    get PaletteOverrides(){return this.Palette?.Overrides??[];}set PaletteOverrides(value){this.Palette=new SKFontArgumentsPalette(this.Palette?.Index??0,value);}
    SetCollectionIndex(value){if(!Number.isInteger(value)||value<0)throw new RangeError('Collection index must be a nonnegative integer.');this.CollectionIndex=value;return this;}
    GetCollectionIndex(){return this.CollectionIndex;}
    SetVariationDesignPosition(value){this.VariationDesignPosition=new SKFontArgumentsVariationPosition(value);return this;}
    GetVariationDesignPosition(){return this.VariationDesignPosition;}
    SetPalette(value){this.Palette=new SKFontArgumentsPalette(value);return this;}
    GetPalette(){return this.Palette;}
  }
  class SKFontStyle {
    constructor(weight = 400, width = 5, slant = 0) {
      if (typeof weight === 'object' && weight !== null && !('value' in weight)) {
        const s = weight; weight = s.Weight ?? s.weight ?? 400; width = s.Width ?? s.width ?? 5; slant = s.Slant ?? s.slant ?? 0;
      }
      this.Weight = num(weight); this.Width = num(width); this.Slant = num(slant);
    }
    get _native() { return { weight: {value:this.Weight}, width:{value:this.Width}, slant:enumValue(K.FontSlant,this.Slant,'Upright') }; }
    Equals(other) { return !!other && this.Weight === num(other.Weight) && this.Width === num(other.Width) && this.Slant === num(other.Slant); }
    static get Normal() { return new SKFontStyle(); }
    static get Bold() { return new SKFontStyle(700); }
    static get Italic() { return new SKFontStyle(400,5,1); }
    static get BoldItalic() { return new SKFontStyle(700,5,1); }
  }

  // SFNT metadata and TrueType outlines complement APIs not exported by CanvasKit.
  // Every table and glyph read is bounded by the supplied byte buffer.
  class Sfnt {
    constructor(bytes) {
      this.bytes = bytes; this.view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength); this.tables = new Map();
      if (bytes.byteLength < 12) return;
      const signature = this.u32(0);
      if (signature !== 0x00010000 && signature !== 0x4f54544f && signature !== 0x74727565) return;
      const count = this.u16(4);
      if (12 + count * 16 > bytes.length) return;
      for (let i=0;i<count;i++) {
        const p = 12+i*16, offset=this.u32(p+8), length=this.u32(p+12);
        if (offset <= bytes.length && length <= bytes.length-offset) this.tables.set(tagOf(this.u32(p)),{offset,length});
      }
    }
    u16(p) { return this.view.getUint16(p); }
    i16(p) { return this.view.getInt16(p); }
    u32(p) { return this.view.getUint32(p); }
    table(tag) { const t=this.tables.get(tagOf(tag)); return t ? this.bytes.slice(t.offset,t.offset+t.length) : null; }
    get unitsPerEm() { const t=this.tables.get('head'); return t && t.length>=20 ? this.u16(t.offset+18) : 0; }
    get glyphCount() { const t=this.tables.get('maxp'); return t && t.length>=6 ? this.u16(t.offset+4) : 0; }
    get style() {
      const t=this.tables.get('OS/2');
      if (!t || t.length<8) return SKFontStyle.Normal;
      return new SKFontStyle(this.u16(t.offset+4),this.u16(t.offset+6),t.length>=64 && (this.u16(t.offset+62)&1) ? 1 : 0);
    }
    get fixedPitch() { const t=this.tables.get('post'); return !!(t && t.length>=16 && this.u32(t.offset+12)); }
    name(id) {
      const t=this.tables.get('name'); if (!t || t.length<6) return null;
      const count=this.u16(t.offset+2), base=t.offset+this.u16(t.offset+4); let found=null;
      for (let i=0;i<count && 6+(i+1)*12<=t.length;i++) {
        const p=t.offset+6+i*12; if(this.u16(p+6)!==id) continue;
        const platform=this.u16(p), language=this.u16(p+4), len=this.u16(p+8), start=base+this.u16(p+10);
        if (start+len>t.offset+t.length) continue;
        const data=this.bytes.subarray(start,start+len);
        const value=platform===0 || platform===3 ? new TextDecoder('utf-16be').decode(data) : new TextDecoder('macintosh').decode(data);
        if (value && (!found || language===0x409)) found=value;
        if (found && language===0x409) break;
      }
      return found;
    }
    variationAxes() {
      const t=this.tables.get('fvar'); if(!t || t.length<16) return [];
      const base=t.offset+this.u16(t.offset+4), count=this.u16(t.offset+8), size=this.u16(t.offset+10), out=[];
      if(size<20) return out;
      for(let i=0;i<count && base+(i+1)*size<=t.offset+t.length;i++) {
        const p=base+i*size; out.push({Tag:tagNumber(tagOf(this.u32(p))), TagName:tagOf(this.u32(p)), Min:this.view.getInt32(p+4)/65536, Default:this.view.getInt32(p+8)/65536, Max:this.view.getInt32(p+12)/65536, IsHidden:!!(this.u16(p+16)&1), Name:this.name(this.u16(p+18))});
      }
      return out;
    }
    kern(left,right) {
      const t=this.tables.get('kern'); if(!t || t.length<4 || this.u16(t.offset)!==0) return 0;
      let p=t.offset+4, result=0;
      for(let n=0;n<this.u16(t.offset+2) && p+6<=t.offset+t.length;n++) {
        const len=this.u16(p+2), coverage=this.u16(p+4); if(len<6 || p+len>t.offset+t.length) break;
        if ((coverage>>>8)===0 && (coverage&1) && !(coverage&6) && len>=14) {
          const count=this.u16(p+6), key=((left<<16)|right)>>>0; let lo=0, hi=count-1;
          while(lo<=hi) { const mid=(lo+hi)>>>1, at=p+14+mid*6; if(at+6>p+len) break; const v=this.u32(at); if(v===key) { const amount=this.i16(at+4); result=coverage&8 ? amount : result+amount; break; } if(v<key)lo=mid+1;else hi=mid-1; }
        }
        p+=len;
      }
      return result;
    }
    glyphContours(glyph, depth=0) {
      if(depth>24) throw new Error('Malformed font: recursive composite glyph.');
      const head=this.tables.get('head'), loca=this.tables.get('loca'), glyf=this.tables.get('glyf');
      if (!head || !loca || !glyf) unsupported('Glyph outline extraction requires a TrueType glyf/loca font. CFF, WOFF and color fonts still render and shape through the native font engine.');
      if(!Number.isInteger(glyph)||glyph<0||glyph>=this.glyphCount) throw new RangeError('Glyph id is outside the typeface.');
      const long=this.i16(head.offset+50)!==0, size=long?4:2;
      if((glyph+2)*size>loca.length) throw new Error('Malformed font: glyph location.');
      const start=long?this.u32(loca.offset+glyph*4):this.u16(loca.offset+glyph*2)*2;
      const end=long?this.u32(loca.offset+(glyph+1)*4):this.u16(loca.offset+(glyph+1)*2)*2;
      if(start===end)return [];
      if(end<start || end>glyf.length || end-start<10)throw new Error('Malformed font: glyph bounds.');
      let p=glyf.offset+start; const limit=glyf.offset+end, n=this.i16(p); p+=10;
      const need=count=>{if(p+count>limit)throw new Error('Malformed font: truncated glyph.');};
      if(n>=0) {
        need(n*2+2); const ends=[]; for(let i=0;i<n;i++){ends.push(this.u16(p));p+=2;}
        const instructions=this.u16(p);p+=2;need(instructions);p+=instructions;
        const count=n?ends[n-1]+1:0; const flags=[];
        while(flags.length<count) {need(1);const flag=this.bytes[p++];flags.push(flag);if(flag&8){need(1);const repeat=this.bytes[p++];for(let j=0;j<repeat;j++)flags.push(flag);}}
        if(flags.length!==count)throw new Error('Malformed font: excessive point repeats.');
        const points=flags.map(f=>({x:0,y:0,on:!!(f&1)}));let v=0;
        for(let i=0;i<count;i++){const f=flags[i];if(f&2){need(1);v+=(f&16?1:-1)*this.bytes[p++];}else if(!(f&16)){need(2);v+=this.i16(p);p+=2;}points[i].x=v;}
        v=0;for(let i=0;i<count;i++){const f=flags[i];if(f&4){need(1);v+=(f&32?1:-1)*this.bytes[p++];}else if(!(f&32)){need(2);v+=this.i16(p);p+=2;}points[i].y=v;}
        const contours=[];let begin=0;for(const e of ends){if(e<begin || e>=count)throw new Error('Malformed font: contour endpoint.');contours.push(points.slice(begin,e+1));begin=e+1;}return contours;
      }
      let flags=32;const contours=[];
      while(flags&32) {
        need(4);flags=this.u16(p);const component=this.u16(p+2);p+=4;
        let arg1,arg2;const isXY=!!(flags&2);
        if(flags&1){need(4);arg1=isXY?this.i16(p):this.u16(p);arg2=isXY?this.i16(p+2):this.u16(p+2);p+=4;}
        else {need(2);arg1=isXY?this.view.getInt8(p):this.bytes[p];arg2=isXY?this.view.getInt8(p+1):this.bytes[p+1];p+=2;}
        let a=1,b=0,c=0,d=1;
        if(flags&8){need(2);a=d=this.i16(p)/16384;p+=2;}
        else if(flags&64){need(4);a=this.i16(p)/16384;d=this.i16(p+2)/16384;p+=4;}
        else if(flags&128){need(8);a=this.i16(p)/16384;b=this.i16(p+2)/16384;c=this.i16(p+4)/16384;d=this.i16(p+6)/16384;p+=8;}
        const child=this.glyphContours(component,depth+1).map(contour=>contour.map(q=>({x:a*q.x+c*q.y,y:b*q.x+d*q.y,on:q.on})));
        let dx=0,dy=0;
        if(isXY){dx=arg1;dy=arg2;if(flags&2048){dx=a*arg1+c*arg2;dy=b*arg1+d*arg2;}if(flags&4){dx=Math.round(dx);dy=Math.round(dy);}}
        else {const parentPoint=contours.flat()[arg1], childPoint=child.flat()[arg2];if(!parentPoint||!childPoint)throw new Error('Malformed font: composite point attachment.');dx=parentPoint.x-childPoint.x;dy=parentPoint.y-childPoint.y;}
        for(const contour of child){for(const q of contour){q.x+=dx;q.y+=dy;}contours.push(contour);}
      }
      return contours;
    }
  }

  class SKTypeface extends SKObject {
    constructor(native, bytes=null, family=null, style=null) {
      super(native); this._bytes=bytes?.slice()??null; this._sfnt=this._bytes?new Sfnt(this._bytes):null;
      this._family=family??native?.getFamilyName()??''; this._style=style?new SKFontStyle(style):this._sfnt?.style??SKFontStyle.Normal; this._uniqueId=K.SkiaSharpTypefaceUniqueID&&native?K.SkiaSharpTypefaceUniqueID(native):nextTypefaceId++;
    }
    static FromData(data,index=0) {
      const source=collectionFace(data,index);let normalized;
      try{normalized=SKFontCache.Normalize(source);}catch(error){const native=K.Typeface.MakeTypefaceFromData(bufferOf(source));if(native){const result=new SKTypeface(native,source);result._fontParseError=error;return result;}return null;}
      const result=SKTypeface._fromNormalized(normalized);if(result){result._sourceBytes=normalized.font._originalFontBytes;result._collectionBytes=bytesOf(data).slice();}return result;
    }
    static _fromNormalized(normalized){
      const native=SKFontCache.GetNative(normalized)??K.Typeface.MakeTypefaceFromData(bufferOf(normalized.bytes));if(!native)return null;SKFontCache.PutNative(normalized,native);
      const result=new SKTypeface(native);result._bytes=normalized.bytes;result._sfnt=normalized._sfnt??=new Sfnt(normalized.bytes);result._style=result._sfnt.style;result._layoutFont=normalized.font;result._variationSource=normalized.source??normalized.font;return result;
    }
    static FromStream(data,index=0) { return SKTypeface.FromData(data,index); }
    static async FromBlob(blob,index=0) { return SKTypeface.FromData(await blob.arrayBuffer(),index); }
    static async FromFile(url,index=0) { const response=await fetch(url);if(!response.ok)throw new Error(`Font request failed: ${response.status} ${url}`);return SKTypeface.FromData(await response.arrayBuffer(),index); }
    static FromFamilyName(name,style=SKFontStyle.Normal) { return SKFontManager.Default.MatchFamily(name,style); }
    static get Default() { return SKFontManager.Default._defaultTypeface(); }
    static get Empty(){if(K.SkiaSharpTypefaceEmpty){const face=new SKTypeface(K.SkiaSharpTypefaceEmpty());face._isEmpty=true;return face;}return new SKTypeface(null);}
    static CreateDefault(){return this.Default;}
    get IsEmpty(){return this._isEmpty??this.GlyphCount===0;}
    get FamilyName() { this.ThrowIfDisposed();return this._family; }
    get FontStyle() { return new SKFontStyle(this._style); }
    get FontWeight() { return this._style.Weight; }
    get FontWidth() { return this._style.Width; }
    get FontSlant() { return this._style.Slant; }
    get IsBold() { return this.FontWeight>=600; }
    get IsItalic() { return this.FontSlant!==0; }
    get IsFixedPitch() { return this._sfnt?.fixedPitch??false; }
    get UnitsPerEm() { return this._sfnt?.unitsPerEm??0; }
    get GlyphCount() { return this._sfnt?.glyphCount??0; }
    get TableCount() { return this._sfnt?.tables.size??0; }
    get UniqueId() { return this._uniqueId; }
    get PostScriptName() { return this._sfnt?.name(6)??null; }
    GetGlyphs(text) { this.ThrowIfDisposed(); const s=decodeText(text);return new Uint16Array(this._native.getGlyphIDs(s,Array.from(s).length)); }
    GetGlyph(codepoint) { return this.GetGlyphs(typeof codepoint==='number'?String.fromCodePoint(codepoint):codepoint)[0]??0; }
    ContainsGlyph(codepoint) { return this.GetGlyph(codepoint)!==0; }
    ContainsGlyphs(text) { return Array.from(this.GetGlyphs(text)).every(g=>g!==0); }
    CountGlyphs(text) { return Array.from(decodeText(text)).length; }
    GetTableTags() { return Array.from(this._sfnt?.tables.keys()??[],tagNumber); }
    GetTableSize(tag) { return this._sfnt?.tables.get(tagOf(tag))?.length??0; }
    GetTableData(tag) { this.ThrowIfDisposed();return this._sfnt?.table(tag)??null; }
    TryGetTableData(tag) { return this.GetTableData(tag); }
    GetKerningPairAdjustments(glyphs) { this.ThrowIfDisposed();return Int32Array.from(Array.from(glyphs).slice(0,-1),(g,i)=>this._sfnt?.kern(g,glyphs[i+1])??0); }
    GetVariationDesignParameters(destination) { this.ThrowIfDisposed();const records=(this._sourceSfnt?.variationAxes()??this._sfnt?.variationAxes()??[]).map(a=>new SKFontVariationAxis(a));return destination?writeRecords(destination,records):records; }
    get VariationDesignParameterCount(){return this.GetVariationDesignParameters().length;}
    get VariationDesignParameters(){return this.GetVariationDesignParameters();}
    get VariationDesignPositionCount(){return this.GetVariationDesignPosition().length;}
    get VariationDesignPosition(){return this.GetVariationDesignPosition();}
    GetVariationDesignPosition(destination) { this.ThrowIfDisposed();const records=this.GetVariationDesignParameters().map(a=>new SKFontArgumentsVariationPositionCoordinate(a.Tag,this._variationSettings?.[a.TagName]??a.Default));return destination?writeRecords(destination,records):records; }
    GetNamedVariations() { this.ThrowIfDisposed();return Object.entries((this._variationSource??this._layoutFont)?.namedVariations??{}).map(([Name,settings])=>({Name,Coordinates:Object.entries(settings).map(([t,v])=>new SKFontArgumentsVariationPositionCoordinate(t,v))})); }
    get IsVariable(){return this.GetVariationDesignParameters().length>0;}
    get IsColor(){return ['COLR','CBDT','sbix','SVG '].some(t=>this.GetTableSize(t)>0);}
    get FontFormat(){return this.GetTableSize('CFF2')?'CFF2':this.GetTableSize('CFF ')?'CFF':this.GetTableSize('glyf')?'TrueType':'Bitmap';}
    GetColorPalettes(){this.ThrowIfDisposed();return ReadPalettes(this,core.SKColor);}
    GetColorGlyphLayers(glyph,paletteIndex=0){this.ThrowIfDisposed();return ReadColorLayers(this,glyph,core.SKColor,paletteIndex);}
    GetColorGlyphPaint(glyph){this.ThrowIfDisposed();return ReadColorPaint(this,glyph);}
    WithTables(replacements){this.ThrowIfDisposed();const tables=FontTables(this._fontEngine());for(const [tag,data]of replacements instanceof Map?replacements:Object.entries(replacements)){if(data===null)tables.delete(tagOf(tag));else tables.set(tagOf(tag),bytesOf(data).slice());}return SKTypeface.FromData(WriteSfnt(tables,tables.has('CFF ')||tables.has('CFF2')?0x4f54544f:0x10000));}
    GetGlyphBitmap(glyph,size=16){this.ThrowIfDisposed();return ReadBitmap(this,glyph,size);}
    GetGlyphSvg(glyph){this.ThrowIfDisposed();return ReadSvg(this,glyph);}
    async GetGlyphSvgText(glyph){const document=this.GetGlyphSvg(glyph);if(!document)return null;if(!document.IsCompressed)return document.Text;if(typeof DecompressionStream!=='function')throw new Error('Gzip SVG font documents require DecompressionStream.');const stream=new Blob([document.Data]).stream().pipeThrough(new DecompressionStream('gzip'));return new Response(stream).text();}
    GetSupportedCodepoints(){this.ThrowIfDisposed();return Uint32Array.from((this._layoutFont??this._fontEngine())?.characterSet??[]);}
    GetGlyphName(glyph){this.ThrowIfDisposed();return this._fontEngine()?.getGlyph(glyph)?.name??null;}
    _fontEngine(){if(!this._layoutFont&&this._bytes)this._layoutFont=ReadFont(this._bytes);return this._layoutFont;}
    Clone(argumentsValue=new SKFontArguments()) {
      this.ThrowIfDisposed();const args=argumentsValue instanceof SKFontArguments?argumentsValue:typeof argumentsValue==='number'?new SKFontArguments({PaletteIndex:argumentsValue}):Array.isArray(argumentsValue)?new SKFontArguments({VariationDesignPosition:argumentsValue}):new SKFontArguments(argumentsValue);
      if(args.CollectionIndex===0&&!args.VariationDesignPosition.Coordinates.length&&args.Palette===null)return this._copy();
      if(args.CollectionIndex!==0){if(!this._collectionBytes)throw new RangeError('No font collection bytes are available.');const selected=SKTypeface.FromData(this._collectionBytes,args.CollectionIndex);if(!selected)return null;try{return selected.Clone(new SKFontArguments({...args,CollectionIndex:0}));}finally{selected.Dispose();}}
      const settings={...this._variationSettings},source=this._variationSource??this._fontEngine(),axes=this.GetVariationDesignParameters();
      for(const coordinate of args.VariationDesignPosition.Coordinates){const name=tagOf(coordinate.Axis),axis=axes.find(a=>a.TagName===name);if(!axis)throw new RangeError(`Unknown font variation axis: ${name}`);if(!Number.isFinite(coordinate.Value))throw new RangeError('Font variation coordinates must be finite.');settings[name]=Math.max(axis.Min,Math.min(axis.Max,coordinate.Value));}
      let bytes=this._bytes,normalized;
      if(args.VariationDesignPosition.Coordinates.length)normalized=SKFontCache.Instance(source,settings,args.Palette);
      else if(args.Palette!==null)normalized=SKFontCache.Palette(this._fontEngine(),args.Palette);
      const result=normalized?SKTypeface._fromNormalized(normalized):SKTypeface.FromData(bytes);if(!result)return null;
      result._sourceBytes=this._sourceBytes??this._bytes;result._collectionBytes=this._collectionBytes;result._sourceSfnt=this._sourceSfnt??this._sfnt;result._variationSource=source;result._variationSettings=settings;result._family=this._family;
      if(settings.wght!==undefined)result._style.Weight=settings.wght;if(settings.wdth!==undefined){const widths=[50,62.5,75,87.5,100,112.5,125,150,200];result._style.Width=widths.reduce((best,v,i)=>Math.abs(v-settings.wdth)<Math.abs(widths[best]-settings.wdth)?i:best,0)+1;}if(settings.ital!==undefined)result._style.Slant=settings.ital>=.5?1:0;else if(settings.slnt!==undefined)result._style.Slant=settings.slnt!==0?2:0;
      return result;
    }
    GetDocumentFontData() { this.ThrowIfDisposed();return SKFontCache.Document(this._fontEngine(),DocumentFontBytes).slice(); }
    ToFont(size=12,scaleX=1,skewX=0) { return new SKFont(this,size,scaleX,skewX); }
    OpenStream() { this.ThrowIfDisposed();return this._bytes?.slice()??null; }
    Serialize() { return this.OpenStream(); }
    _copy() {
      this.ThrowIfDisposed();
      const native=typeof this._native.clone==='function'?this._native.clone():this._bytes?K.Typeface.MakeTypefaceFromData(bufferOf(this._bytes)):K.Typeface.GetDefault();
      if(!native)return null;const face=new SKTypeface(native,null,this._family,this._style);face._bytes=this._bytes;face._sfnt=this._sfnt;face._uniqueId=this._uniqueId;for(const key of ['_layoutFont','_sourceBytes','_collectionBytes','_sourceSfnt','_variationSource','_variationSettings'])face[key]=this[key];return face;
    }
  }

  class SKFontStyleSet extends SKObject {
    constructor(manager=null,family='') { super(null);this._manager=manager;this._family=family;return new Proxy(this,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))return target.GetStyle(Number(key));return Reflect.get(target,key,receiver);}}); }
    get _entries() { this.ThrowIfDisposed();this._manager?.ThrowIfDisposed();return this._manager?._familyIndex.get(this._family.toLowerCase())??[]; }
    get Count() { return this._entries.length; }
    GetStyle(index) { const entry=this._entries[index];if(!entry)throw new RangeError('Font style index is out of range.');return new SKFontStyle(entry.face.FontStyle); }
    GetStyleName(index) { const entry=this._entries[index];if(!entry)throw new RangeError('Font style index is out of range.');return entry.face._sfnt?.name(2)??'Regular'; }
    CreateTypeface(index) { if(index instanceof SKFontStyle)return this.MatchStyle(index);const entry=this._entries[index];return entry?entry.face._copy():null; }
    MatchStyle(style) { return this._manager?.MatchFamily(this._family,style)??null; }
    GetEnumerator(){return this[Symbol.iterator]();}
    [Symbol.iterator]() { return Array.from({length:this.Count},(_,i)=>this.GetStyle(i))[Symbol.iterator](); }
  }

  class SKFontManager extends SKObject {
    constructor() { super(K.SkiaSharpMakeFontProvider?K.SkiaSharpMakeFontProvider():K.TypefaceFontProvider.Make());this._entries=[];this._familyIndex=new Map();this._matchCache=new Map();this._characterCache=new Map(); }
    static get Default() { if(!SKFontManager._default || SKFontManager._default.IsDisposed)SKFontManager._default=new SKFontManager();return SKFontManager._default; }
    static CreateDefault() { const result=new SKFontManager();try{for(const entry of SKFontManager.Default._entries)result.RegisterFont(entry.bytes,entry.family,{Languages:entry.languages}).Dispose();return result;}catch(error){result.Dispose();throw error;} }
    static CreateFromData(...data) { const manager=new SKFontManager();try{for(const item of data.flat())manager.RegisterFont(item).Dispose();return manager;}catch(error){manager.Dispose();throw error;} }
    get FontFamilies() { this.ThrowIfDisposed();return Array.from(this._familyIndex.values(),entries=>entries[0].family); }
    get FontFamilyCount() { return this.FontFamilies.length; }
    get Count() { return this.FontFamilyCount; }
    static get CanAccessLocalFonts() { return typeof globalThis.queryLocalFonts==='function'; }
    GetFontFamilies() { return this.FontFamilies; }
    GetFamilyName(index) { const family=this.FontFamilies[index];if(family===undefined)throw new RangeError('Font family index is out of range.');return family; }
    RegisterFont(data,familyName,options={}) {
      this.ThrowIfDisposed();const bytes=bytesOf(data).slice();const face=SKTypeface.FromData(bytes);
      if(!face)throw new Error('Font data could not be decoded.');
      const family=familyName??face.FamilyName;face._family=family;
      try{if(K.SkiaSharpFontProviderRegister&&K.SkiaSharpMakeFontProvider)K.SkiaSharpFontProviderRegister(this._native,face._native,family);else this._native.registerFont(face._bytes,family);const entry={family,face,bytes:face._bytes,languages:(options.Languages??options.languages??[]).map(s=>String(s).toLowerCase())};if(K.SkiaSharpFontProviderSetLanguages&&K.SkiaSharpMakeFontProvider)K.SkiaSharpFontProviderSetLanguages(this._native,face._native,entry.languages);this._entries.push(entry);const key=family.toLowerCase(),members=this._familyIndex.get(key)??[];members.push(entry);this._familyIndex.set(key,members);this._matchCache.clear();this._characterCache.clear();return face._copy();}catch(error){face.Dispose();throw error;}
    }
    async RegisterFontFromUrl(url,familyName) { const response=await fetch(url);if(!response.ok)throw new Error(`Font request failed: ${response.status} ${url}`);return this.RegisterFont(await response.arrayBuffer(),familyName); }
    async RegisterFontFromBlob(blob,familyName) { return this.RegisterFont(await blob.arrayBuffer(),familyName); }
    async ImportLocalFonts(options={}) {
      this.ThrowIfDisposed();if(!SKFontManager.CanAccessLocalFonts)unsupported('Local Font Access is not available in this browser. Register fonts from user-selected files or URLs.');
      // The browser requires an explicit user gesture and manages its own font permission.
      const fonts=await globalThis.queryLocalFonts(options.postscriptNames?{postscriptNames:options.postscriptNames}:{}), imported=[];
      for(const item of fonts){if(options.families&&!options.families.includes(item.family))continue;const blob=await item.blob(),face=await this.RegisterFontFromBlob(blob,item.family);imported.push({FamilyName:face.FamilyName,PostScriptName:item.postscriptName,Style:item.style});face.Dispose();}
      return imported;
    }
    CreateTypeface(data,index=0) { return SKTypeface.FromData(data,index); }
    CreateStyleSet(index) { return new SKFontStyleSet(this,this.GetFamilyName(index)); }
    GetFontStyles(familyName) { return new SKFontStyleSet(this,typeof familyName==='number'?this.GetFamilyName(familyName):familyName); }
    MatchFamily(familyName,style) {
      this.ThrowIfDisposed();
      const wanted=new SKFontStyle(style??SKFontStyle.Normal),key=JSON.stringify([familyName?.toLowerCase()??'',wanted.Weight,wanted.Width,wanted.Slant]);
      let entry=this._matchCache.get(key);if(entry===undefined){const candidates=familyName?this._familyIndex.get(familyName.toLowerCase())??[]:this._entries;entry=candidates.reduce((best,item)=>!best||styleDistance(item.face._style,wanted)<styleDistance(best.face._style,wanted)?item:best,null);this._matchCache.set(key,entry);if(this._matchCache.size>512)this._matchCache.delete(this._matchCache.keys().next().value);}
      return entry?.face._copy()??null;
    }

    MatchTypeface(face,style) { return this.MatchFamily(face?.FamilyName,style??SKFontStyle.Normal); }
    MatchCharacter(...args) {
      this.ThrowIfDisposed();let family=null,style=SKFontStyle.Normal,languages=[],codepoint;
      if(args.length===1)codepoint=args[0];
      else {family=args[0];codepoint=args[args.length-1];if(args.length>=6){style=new SKFontStyle(args[1],args[2],args[3]);languages=args[4]??[];}else if(args[1] instanceof SKFontStyle||args[1]&&typeof args[1]==='object'&&!Array.isArray(args[1])){style=new SKFontStyle(args[1]);languages=args.length>=4?args[2]??[]:[];}else if(Array.isArray(args[1]))languages=args[1];}
      codepoint=typeof codepoint==='number'?codepoint:String(codepoint).codePointAt(0);if(!Number.isInteger(codepoint)||codepoint<0||codepoint>0x10ffff)throw new RangeError('Character must be a Unicode scalar value.');
      languages=Array.from(languages,s=>String(s).toLowerCase());const preferred=family?.toLowerCase()??'',key=JSON.stringify([preferred,style.Weight,style.Width,style.Slant,languages,codepoint]);let entry=this._characterCache.get(key);
      if(entry===undefined){
        const languageRank=e=>{for(let i=languages.length-1;i>=0;i--){const wanted=languages[i];if(e.languages.some(t=>t===wanted||t.split('-')[0]===wanted.split('-')[0]))return languages.length-1-i;}return languages.length;};
        const ordered=[...this._entries].sort((a,b)=>(a.family.toLowerCase()===preferred?0:1)-(b.family.toLowerCase()===preferred?0:1)||languageRank(a)-languageRank(b)||styleDistance(a.face._style,style)-styleDistance(b.face._style,style));
        entry=ordered.find(e=>e.face.ContainsGlyph(codepoint))??null;this._characterCache.set(key,entry);if(this._characterCache.size>2048)this._characterCache.delete(this._characterCache.keys().next().value);
      }
      return entry?.face._copy()??null;
    }
    _defaultTypeface() { this.ThrowIfDisposed();if(this._entries.length)return this._entries[0].face._copy();const native=K.Typeface.GetDefault();return native?new SKTypeface(native):null; }
    Dispose() { if(this.IsDisposed)return;for(const entry of this._entries)entry.face.Dispose();this._entries=[];this._familyIndex.clear();this._matchCache.clear();this._characterCache.clear();super.Dispose(); }
  }
  // Skia follows CSS font matching: narrower/expanded direction, slant preference,
  // then directional weight matching (400–500 has its own search order).
  const styleDistance=(a,b)=>{
    const width=a.Width===b.Width?0:b.Width<=5?(a.Width<b.Width?b.Width-a.Width:10+a.Width-b.Width):(a.Width>b.Width?a.Width-b.Width:10+b.Width-a.Width);
    const slants=b.Slant===0?[0,2,1]:b.Slant===1?[1,2,0]:[2,1,0],slant=slants.indexOf(a.Slant);
    let weight;if(a.Weight===b.Weight)weight=0;else if(b.Weight<400)weight=a.Weight<b.Weight?b.Weight-a.Weight:1000+a.Weight-b.Weight;else if(b.Weight>500)weight=a.Weight>b.Weight?a.Weight-b.Weight:1000+b.Weight-a.Weight;else weight=a.Weight>=b.Weight&&a.Weight<=500?a.Weight-b.Weight:a.Weight<b.Weight?1000+b.Weight-a.Weight:2000+a.Weight-b.Weight;
    return width*100000+slant*10000+weight;
  };
  const decodeText=text=>typeof text==='string'?text:text instanceof Uint8Array?new TextDecoder().decode(text):Array.isArray(text)&&text.every(x=>typeof x==='number')?String.fromCodePoint(...text):String(text??'');

  class SKFont extends SKObject {
    constructor(typeface=null,size=12,scaleX=1,skewX=0) {
      const face=typeface??SKTypeface.Default;
      super(new K.Font(face?._native??null,size,scaleX,skewX));
      this._typeface=face?._copy()??null;if(!typeface)face?.Dispose();
      this._edging=K.FontEdging.AntiAlias;this._hinting=K.FontHinting.Normal;this._embeddedBitmaps=true;this._linearMetrics=false;this._subpixel=false;
    }
    get ForceAutoHinting(){this.ThrowIfDisposed();if(K.SkiaSharpFontGetForceAutoHinting)return K.SkiaSharpFontGetForceAutoHinting(this._native);return this._forceAutoHinting??false;}set ForceAutoHinting(v){this.ThrowIfDisposed();if(!K.SkiaSharpFontSetForceAutoHinting)unsupported('ForceAutoHinting requires the bundled native font extension.');K.SkiaSharpFontSetForceAutoHinting(this._native,!!v);this._forceAutoHinting=!!v;}
    get BaselineSnap(){this.ThrowIfDisposed();if(K.SkiaSharpFontGetBaselineSnap)return K.SkiaSharpFontGetBaselineSnap(this._native);return true;}set BaselineSnap(v){this.ThrowIfDisposed();if(!K.SkiaSharpFontSetBaselineSnap)unsupported('BaselineSnap requires the bundled native font extension.');K.SkiaSharpFontSetBaselineSnap(this._native,!!v);}
    get Size() { this.ThrowIfDisposed();return this._native.getSize(); } set Size(value){this.ThrowIfDisposed();this._native.setSize(value);}
    get ScaleX(){this.ThrowIfDisposed();return this._native.getScaleX();}set ScaleX(value){this.ThrowIfDisposed();this._native.setScaleX(value);}
    get SkewX(){this.ThrowIfDisposed();return this._native.getSkewX();}set SkewX(value){this.ThrowIfDisposed();this._native.setSkewX(value);}
    get Typeface(){this.ThrowIfDisposed();return this._typeface?._copy()??null;}set Typeface(value){this.ThrowIfDisposed();const copy=value?._copy()??null;this._native.setTypeface(un(value)??null);this._typeface?.Dispose();this._typeface=copy;}
    get Embolden(){this.ThrowIfDisposed();return this._native.isEmbolden();}set Embolden(v){this.ThrowIfDisposed();this._native.setEmbolden(!!v);}
    get Edging(){return this._edging;}set Edging(v){this.ThrowIfDisposed();this._edging=enumValue(K.FontEdging,v,'AntiAlias');this._native.setEdging(this._edging);}
    get Hinting(){return this._hinting;}set Hinting(v){this.ThrowIfDisposed();this._hinting=enumValue(K.FontHinting,v,'Normal');this._native.setHinting(this._hinting);}
    get EmbeddedBitmaps(){return this._embeddedBitmaps;}set EmbeddedBitmaps(v){this.ThrowIfDisposed();this._embeddedBitmaps=!!v;this._native.setEmbeddedBitmaps(!!v);}
    get LinearMetrics(){return this._linearMetrics;}set LinearMetrics(v){this.ThrowIfDisposed();this._linearMetrics=!!v;this._native.setLinearMetrics(!!v);}
    get Subpixel(){return this._subpixel;}set Subpixel(v){this.ThrowIfDisposed();this._subpixel=!!v;this._native.setSubpixel(!!v);}
    get Metrics(){return this.GetFontMetrics();}
    get Spacing(){const m=this.Metrics;return m.Descent-m.Ascent+m.Leading;}
    GetFontMetrics(){
      this.ThrowIfDisposed();if(K.SkiaSharpFontGetMetrics)return new SKFontMetrics(K.SkiaSharpFontGetMetrics(this._native));const m=this._native.getMetrics(),s=this.Size/(this._typeface?.UnitsPerEm||this.Size),sf=this._typeface?._sfnt,os=sf?.tables.get('OS/2');
      const bounds=m.bounds??[0,m.ascent,0,m.descent];
      return new SKFontMetrics({Top:bounds[1],Ascent:m.ascent,Descent:m.descent,Bottom:bounds[3],Leading:m.leading,AverageCharacterWidth:os&&os.length>=4?sf.i16(os.offset+2)*s:0,MaxCharacterWidth:bounds[2]-bounds[0],XMin:bounds[0],XMax:bounds[2],XHeight:os&&os.length>=88&&sf.u16(os.offset)>=2?sf.i16(os.offset+86)*s:undefined,CapHeight:os&&os.length>=90&&sf.u16(os.offset)>=2?sf.i16(os.offset+88)*s:undefined,UnderlineThickness:m.underlineThickness,UnderlinePosition:m.underlinePosition,StrikeoutThickness:m.strikeoutThickness,StrikeoutPosition:m.strikeoutPosition});
    }
    GetGlyphs(text){this.ThrowIfDisposed();const s=decodeText(text);return new Uint16Array(this._native.getGlyphIDs(s,Array.from(s).length));}
    CountGlyphs(text){return Array.from(decodeText(text)).length;}
    ContainsGlyphs(text){return Array.from(this.GetGlyphs(text)).every(g=>g!==0);}
    GetGlyphWidths(glyphs,paint=null){this.ThrowIfDisposed();return new Float32Array(this._native.getGlyphWidths(glyphs,un(paint)??null));}
    GetGlyphBounds(glyphs,paint=null){this.ThrowIfDisposed();const b=this._native.getGlyphBounds(glyphs,un(paint)??null);return Array.from({length:glyphs.length},(_,i)=>rect(Array.from(b.slice(i*4,i*4+4))));}
    GetGlyphPositions(glyphs,origin=point(0,0)){const [x,y]=xy(origin);let advance=x;return Array.from(this.GetGlyphWidths(glyphs),width=>{const p=point(advance,y);advance+=width;return p;});}
    GetGlyphOffsets(glyphs,origin=0){let advance=origin;return Float32Array.from(this.GetGlyphWidths(glyphs),width=>{const x=advance;advance+=width;return x;});}
    GetGlyphIntercepts(glyphs,positions,top,bottom){this.ThrowIfDisposed();const ps=positions.length && typeof positions[0]==='object'?positions.flatMap(xy):positions;return new Float32Array(this._native.getGlyphIntercepts(glyphs,ps,top,bottom));}
    MeasureText(text,boundsOrPaint=null,paint=null){
      this.ThrowIfDisposed();const bounds=boundsOrPaint && !boundsOrPaint._native?boundsOrPaint:null; if(boundsOrPaint?._native)paint=boundsOrPaint;
      const glyphs=typeof text==='string'||text instanceof Uint8Array?this.GetGlyphs(text):text;
      const widths=this.GetGlyphWidths(glyphs,paint);
      if(bounds){const bb=this.GetGlyphBounds(glyphs,paint);let x=0,left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;for(let i=0;i<bb.length;i++){const b=bb[i];if(b.Right>b.Left&&b.Bottom>b.Top){left=Math.min(left,x+b.Left);top=Math.min(top,b.Top);right=Math.max(right,x+b.Right);bottom=Math.max(bottom,b.Bottom);}x+=widths[i];}Object.assign(bounds,{Left:Number.isFinite(left)?left:0,Top:Number.isFinite(top)?top:0,Right:Number.isFinite(right)?right:0,Bottom:Number.isFinite(bottom)?bottom:0});}
      return widths.reduce((sum,width)=>sum+width,0);
    }
    BreakText(text,maxWidth){const chars=Array.from(decodeText(text)),widths=this.GetGlyphWidths(this.GetGlyphs(chars.join('')));let measured=0,count=0,utf16=0;for(const width of widths){if(measured+width>maxWidth)break;measured+=width;utf16+=chars[count].length;count++;}return {Count:utf16,CodepointCount:count,MeasuredWidth:measured,Text:chars.slice(0,count).join('')};}
    GetGlyphPath(glyph){
      if(K.SkiaSharpFontGetPath){this.ThrowIfDisposed();const path=K.SkiaSharpFontGetPath(this._native,glyph);return path?core.SKPath._fromNative(path):null;}
      this.ThrowIfDisposed();const typeface=this._typeface;
      if(typeface?._bytes&&!typeface._sfnt?.tables.has('glyf')){const engine=typeface._fontEngine();if(!Number.isInteger(glyph)||glyph<0||glyph>=engine.numGlyphs)throw new RangeError('Glyph id is outside the typeface.');const outline=engine._getBaseGlyph(glyph).path,path=new K.PathBuilder(),scale=this.Size/engine.unitsPerEm;
        const args=a=>a.flatMap((_,i)=>i%2?[]:[scale*(a[i]*this.ScaleX-a[i+1]*this.SkewX),-scale*a[i+1]]);
        for(const c of outline.commands){const a=args(c.args);if(c.command==='moveTo')path.moveTo(...a);else if(c.command==='lineTo')path.lineTo(...a);else if(c.command==='quadraticCurveTo')path.quadTo(...a);else if(c.command==='bezierCurveTo')path.cubicTo(...a);else if(c.command==='closePath')path.close();}return core.SKPath._fromNative(path.detachAndDelete());
      }
const sf=this._typeface?._sfnt;if(!sf)unsupported('Glyph outlines require the original TrueType font bytes.');
      const contours=sf.glyphContours(glyph),path=new K.PathBuilder(), scale=this.Size/sf.unitsPerEm;
      const q=p=>[scale*(p.x*this.ScaleX-p.y*this.SkewX),-scale*p.y];
      for(const contour of contours) {
        if(!contour.length)continue;
        const first=contour[0],last=contour[contour.length-1];let start,index;
        if(first.on){start=first;index=1;}else if(last.on){start=last;index=0;}else{start={x:(first.x+last.x)/2,y:(first.y+last.y)/2,on:true};index=0;}
        path.moveTo(...q(start));
        const sequence=contour.slice(index);if(first.on===false&&last.on)sequence.pop();sequence.push(start);
        for(let i=0;i<sequence.length;i++){const current=sequence[i];if(current.on)path.lineTo(...q(current));else{const next=sequence[i+1]??start;if(next.on){path.quadTo(...q(current),...q(next));i++;}else path.quadTo(...q(current),...q({x:(current.x+next.x)/2,y:(current.y+next.y)/2}));}}
        path.close();
      }
      if(!core.SKPath){path.delete();unsupported('SKPath must be installed before extracting glyph outlines.');}
      return core.SKPath._fromNative(path.detachAndDelete());
    }
    GetTextPath(text,x=0,y=0){if(typeof x==='object')[x,y]=xy(x);const glyphs=this.GetGlyphs(text),widths=this.GetGlyphWidths(glyphs),path=new core.SKPath();for(let i=0;i<glyphs.length;i++){const glyph=this.GetGlyphPath(glyphs[i]);if(glyph){path.AddPath(glyph,x,y);glyph.Dispose();}x+=widths[i];}return path;}
    GetGlyphPaths(glyphs,callback){const positions=this.GetGlyphPositions(glyphs);for(let i=0;i<glyphs.length;i++){const path=this.GetGlyphPath(glyphs[i]);try{callback(path,positions[i],i);}finally{path?.Dispose();}}}
    Dispose(){if(this.IsDisposed)return;super.Dispose();this._typeface?.Dispose();this._typeface=null;}
  }

  class SKTextBlob extends SKObject {
    constructor(native=null,runs=[],bounds=null){super(native);this._runs=runs;this._bounds=bounds;this._uniqueId=nextBlobId++;}
    static Create(text,font,origin=null){font.ThrowIfDisposed();const s=decodeText(text);if(origin)return SKTextBlob.CreatePositioned(s,font,font.GetGlyphPositions(font.GetGlyphs(s),origin));const b=rect([0,0,0,0]);font.MeasureText(s,b);return new SKTextBlob(K.TextBlob.MakeFromText(s,font._native),[],b);}
    static CreatePositioned(text,font,positions){const glyphs=typeof text==='string'?font.GetGlyphs(text):text;if(positions.length!==glyphs.length)throw new RangeError('One position is required per glyph.');const transforms=positions.flatMap(p=>[1,0,...xy(p)]);return SKTextBlob.CreateRotationScale(glyphs,font,transforms);}
    static CreateHorizontal(text,font,positions,y=0){return SKTextBlob.CreatePositioned(text,font,Array.from(positions,x=>point(x,y)));}
    static CreateRotationScale(text,font,transforms){const glyphs=typeof text==='string'?font.GetGlyphs(text):text;const flat=transforms.length && typeof transforms[0]==='object'?transforms.flatMap(t=>Array.isArray(t)?t:[t.SCos??t.scos,t.SSin??t.ssin,t.Tx??t.tx,t.Ty??t.ty]):transforms;if(flat.length!==glyphs.length*4)throw new RangeError('One rotation-scale transform is required per glyph.');const native=K.TextBlob.MakeFromRSXformGlyphs(glyphs,flat,font._native);return new SKTextBlob(native,[],transformedGlyphBounds(font,glyphs,flat));}
    static CreateOnPath(text,font,path,initialOffset=0){return new SKTextBlob(K.TextBlob.MakeOnPath(decodeText(text),un(path),font._native,initialOffset));}
    get UniqueId(){return this._uniqueId;}
    get Bounds(){this.ThrowIfDisposed();if(this._bounds)return rect([this._bounds.Left,this._bounds.Top,this._bounds.Right,this._bounds.Bottom]);unsupported('This native TextBlob factory does not expose blob bounds. Use font glyph bounds or a positioned blob.');}
    Draw(canvas,x,y,paint){this.ThrowIfDisposed();canvas._complex?.();const native=un(canvas);if(this._native)native.drawTextBlob(this._native,x,y,un(paint));for(const run of this._runs)run.blob.Draw(canvas,x+run.x,y+run.y,paint);}
    Dispose(){if(this.IsDisposed)return;for(const run of this._runs)run.blob.Dispose();this._runs=[];super.Dispose();}
  }
  function transformedGlyphBounds(font,glyphs,transforms){let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;for(const [i,bb]of font.GetGlyphBounds(glyphs).entries()){if(bb.Right===bb.Left||bb.Top===bb.Bottom)continue;const a=transforms[i*4],s=transforms[i*4+1],x=transforms[i*4+2],y=transforms[i*4+3];for(const [px,py]of [[bb.Left,bb.Top],[bb.Right,bb.Top],[bb.Right,bb.Bottom],[bb.Left,bb.Bottom]]){const xx=a*px-s*py+x,yy=s*px+a*py+y;l=Math.min(l,xx);r=Math.max(r,xx);t=Math.min(t,yy);b=Math.max(b,yy);}}return rect(Number.isFinite(l)?[l,t,r,b]:[0,0,0,0]);}

  class SKTextBlobBuilder extends SKObject {
    constructor(){super(null);this._runs=[];}
    AddRun(text,font,x=0,y=0){this.ThrowIfDisposed();if(typeof x==='object')[x,y]=xy(x);const blob=typeof text==='string'?SKTextBlob.Create(text,font):new SKTextBlob(K.TextBlob.MakeFromGlyphs(text,font._native),[],transformedGlyphBounds(font,text,font.GetGlyphPositions(text).flatMap(p=>[1,0,...xy(p)])));this._runs.push({blob,x,y});return this;}
    AddPositionedRun(glyphs,font,positions){this.ThrowIfDisposed();this._runs.push({blob:SKTextBlob.CreatePositioned(glyphs,font,positions),x:0,y:0});return this;}
    AddHorizontalRun(glyphs,font,positions,y=0){return this.AddPositionedRun(glyphs,font,Array.from(positions,x=>point(x,y)));}
    AddRotationScaleRun(glyphs,font,transforms){this.ThrowIfDisposed();this._runs.push({blob:SKTextBlob.CreateRotationScale(glyphs,font,transforms),x:0,y:0});return this;}
    AllocateRun(font,count,x=0,y=0){return this._allocate('plain',font,count,x,y);}
    AllocatePositionedRun(font,count){return this._allocate('positioned',font,count,0,0);}
    AllocateHorizontalRun(font,count,y=0){return this._allocate('horizontal',font,count,0,y);}
    AllocateRotationScaleRun(font,count){return this._allocate('rotation',font,count,0,0);}
    _allocate(kind,font,count,x,y){this.ThrowIfDisposed();if(!Number.isInteger(count)||count<0)throw new RangeError('Glyph count must be a nonnegative integer.');const clone=new SKFont(font._typeface,font.Size,font.ScaleX,font.SkewX);clone.Embolden=font.Embolden;const buffer={Glyphs:new Uint16Array(count),Positions:kind==='positioned'?Array.from({length:count},()=>point(0,0)):kind==='horizontal'?new Float32Array(count):undefined,Transforms:kind==='rotation'?Array.from({length:count},()=>({SCos:1,SSin:0,Tx:0,Ty:0})):undefined};buffer.SetGlyphs=values=>buffer.Glyphs.set(values);buffer.SetPositions=values=>{buffer.Positions=values;};buffer.SetRotationScale=values=>{buffer.Transforms=values;};this._runs.push({pending:true,kind,font:clone,count,x,y,buffer});return buffer;}
    Build(){this.ThrowIfDisposed();const result=[];let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;for(const run of this._runs){if(run.pending){const {buffer,font}=run;try{run.blob=run.kind==='plain'?new SKTextBlob(K.TextBlob.MakeFromGlyphs(buffer.Glyphs,font._native),[],transformedGlyphBounds(font,buffer.Glyphs,font.GetGlyphPositions(buffer.Glyphs).flatMap(p=>[1,0,...xy(p)]))):run.kind==='positioned'?SKTextBlob.CreatePositioned(buffer.Glyphs,font,buffer.Positions):run.kind==='horizontal'?SKTextBlob.CreateHorizontal(buffer.Glyphs,font,buffer.Positions):SKTextBlob.CreateRotationScale(buffer.Glyphs,font,buffer.Transforms);}finally{font.Dispose();}run.pending=false;}result.push({blob:run.blob,x:run.x,y:run.y});const bb=run.blob._bounds;if(bb){l=Math.min(l,bb.Left+run.x);t=Math.min(t,bb.Top+run.y);r=Math.max(r,bb.Right+run.x);b=Math.max(b,bb.Bottom+run.y);}}this._runs=[];return new SKTextBlob(null,result,rect(Number.isFinite(l)?[l,t,r,b]:[0,0,0,0]));}
    Dispose(){if(this.IsDisposed)return;for(const run of this._runs){run.font?.Dispose();run.blob?.Dispose();}this._runs=[];super.Dispose();}
  }

  const colorValue=color=>core.color?core.color(color):color?.ToFloatArray?.()??color?._native??(Array.isArray(color)||ArrayBuffer.isView(color)?color:color && 'Red' in color?K.Color(color.Red,color.Green,color.Blue,(color.Alpha??255)/255):color);
  const mapTextStyle=style=>{
    if(!style)return {};
    const result={};for(const [key,value]of Object.entries(style)){const lower=key[0].toLowerCase()+key.slice(1);result[lower]=value;}
    if(result.typeface){result.fontFamilies=[result.typeface.FamilyName];delete result.typeface;}
    if(result.fontStyle)result.fontStyle=new SKFontStyle(result.fontStyle)._native;
    for(const key of ['color','foregroundColor','backgroundColor','decorationColor'])if(result[key])result[key]=colorValue(result[key]);
    if(result.fontFeatures)result.fontFeatures=result.fontFeatures.map(f=>({name:f.Name??f.name,value:f.Value??f.value}));
    if(result.fontVariations)result.fontVariations=result.fontVariations.map(f=>({axis:f.Axis??f.axis,value:f.Value??f.value}));
    if(result.shadows)result.shadows=result.shadows.map(s=>({color:colorValue(s.Color??s.color??K.BLACK),offset:xy(s.Offset??s.offset??[0,0]),blurRadius:s.BlurRadius??s.blurRadius??0}));
    if(result.decorationStyle!==undefined)result.decorationStyle=enumValue(K.DecorationStyle,result.decorationStyle,'Solid');
    if(result.textBaseline!==undefined)result.textBaseline=enumValue(K.TextBaseline,result.textBaseline,'Alphabetic');
    return result;
  };
  const mapParagraphStyle=style=>{
    const result={};for(const [key,value]of Object.entries(style??{})){const lower=key[0].toLowerCase()+key.slice(1);result[lower]=value;}
    if(result.textStyle)result.textStyle=mapTextStyle(result.textStyle);
    result.textStyle??={};if(result.strutStyle)result.strutStyle=mapTextStyle(result.strutStyle);
    if(result.textAlign!==undefined)result.textAlign=enumValue(K.TextAlign,result.textAlign,'Left');
    if(result.textDirection!==undefined)result.textDirection=enumValue(K.TextDirection,result.textDirection,'LTR');
    if(result.textHeightBehavior!==undefined)result.textHeightBehavior=enumValue(K.TextHeightBehavior,result.textHeightBehavior,'All');
    return result;
  };
  class SKParagraph extends SKObject {
    constructor(native,text=''){super(native);this.Text=text;this._shapedLines=null;}
    _releaseShapedLines(){for(const line of this._shapedLines??[])for(const run of line.runs)run.typeface?.delete?.();this._shapedLines=null;}
    Layout(width){this.ThrowIfDisposed();if(!Number.isFinite(width)||width<0)throw new RangeError('Paragraph width must be finite and nonnegative.');this._releaseShapedLines();this._native.layout(width);return this;}
    Paint(canvas,x=0,y=0){this.ThrowIfDisposed();if(typeof canvas.DrawParagraph==='function')return canvas.DrawParagraph(this,x,y);canvas._complex?.();un(canvas).drawParagraph(this._native,x,y);}
    get Height(){this.ThrowIfDisposed();return this._native.getHeight();}
    get MaxWidth(){this.ThrowIfDisposed();return this._native.getMaxWidth();}
    get MaxIntrinsicWidth(){this.ThrowIfDisposed();return this._native.getMaxIntrinsicWidth();}
    get MinIntrinsicWidth(){this.ThrowIfDisposed();return this._native.getMinIntrinsicWidth();}
    get LongestLine(){this.ThrowIfDisposed();return this._native.getLongestLine();}
    get AlphabeticBaseline(){this.ThrowIfDisposed();return this._native.getAlphabeticBaseline();}
    get IdeographicBaseline(){this.ThrowIfDisposed();return this._native.getIdeographicBaseline();}
    get DidExceedMaxLines(){this.ThrowIfDisposed();return this._native.didExceedMaxLines();}
    get NumberOfLines(){this.ThrowIfDisposed();return this._native.getNumberOfLines();}
    GetLineMetrics(){this.ThrowIfDisposed();return this._native.getLineMetrics().map(capitalize);}
    GetLineMetricsAt(index){this.ThrowIfDisposed();const m=this._native.getLineMetricsAt(index);return m?capitalize(m):null;}
    GetLineNumberAt(index){this.ThrowIfDisposed();return this._native.getLineNumberAt(index);}
    GetGlyphPositionAtCoordinate(x,y){this.ThrowIfDisposed();return capitalize(this._native.getGlyphPositionAtCoordinate(x,y));}
    GetClosestGlyphInfoAtCoordinate(x,y){this.ThrowIfDisposed();const g=this._native.getClosestGlyphInfoAtCoordinate(x,y);return g?capitalize(g):null;}
    GetGlyphInfoAt(index){this.ThrowIfDisposed();const g=this._native.getGlyphInfoAt(index);return g?capitalize(g):null;}
    GetWordBoundary(index){this.ThrowIfDisposed();return capitalize(this._native.getWordBoundary(index));}
    GetRectsForRange(start,end,heightStyle=K.RectHeightStyle.Tight,widthStyle=K.RectWidthStyle.Tight){this.ThrowIfDisposed();return this._native.getRectsForRange(start,end,enumValue(K.RectHeightStyle,heightStyle,'Tight'),enumValue(K.RectWidthStyle,widthStyle,'Tight')).map(r=>({Rect:rect(Array.from(r.rect)),Direction:r.dir}));}
    GetRectsForPlaceholders(){this.ThrowIfDisposed();return this._native.getRectsForPlaceholders().map(r=>({Rect:rect(Array.from(r.rect)),Direction:r.dir}));}
    GetShapedLines(){this.ThrowIfDisposed();return this._shapedLines??=this._native.getShapedLines();}
    UnresolvedCodepoints(){this.ThrowIfDisposed();return this._native.unresolvedCodepoints();}
    Dispose(){if(this.IsDisposed)return;this._releaseShapedLines();super.Dispose();}
  }
  const capitalize=obj=>Object.fromEntries(Object.entries(obj).map(([key,value])=>[key[0].toUpperCase()+key.slice(1),value]));
  class SKParagraphBuilder extends SKObject {
    constructor(style={},manager=SKFontManager.Default){manager.ThrowIfDisposed();const mapped=mapParagraphStyle(style);mapped.textStyle.fontFamilies??=manager.FontFamilies;super(K.ParagraphBuilder.MakeFromFontProvider(new K.ParagraphStyle(mapped),manager._native));this._manager=manager;this._text='';}
    AddText(text){this.ThrowIfDisposed();this._native.addText(decodeText(text));this._text+=decodeText(text);return this;}
    PushStyle(style){this.ThrowIfDisposed();this._native.pushStyle(new K.TextStyle(mapTextStyle(style)));return this;}
    PushPaintStyle(style,foreground,background){this.ThrowIfDisposed();this._native.pushPaintStyle(new K.TextStyle(mapTextStyle(style)),un(foreground),un(background));return this;}
    Pop(){this.ThrowIfDisposed();this._native.pop();return this;}
    AddPlaceholder(width=0,height=0,alignment=K.PlaceholderAlignment.Baseline,baseline=K.TextBaseline.Alphabetic,offset=0){this.ThrowIfDisposed();this._native.addPlaceholder(width,height,alignment,baseline,offset);this._text+='\ufffc';return this;}
    Build(){this.ThrowIfDisposed();return new SKParagraph(this._native.build(),this._text);}
    Reset(){this.ThrowIfDisposed();this._native.reset();this._text='';return this;}
    GetText(){this.ThrowIfDisposed();return this._native.getText();}
    SetWordsUtf16(breaks){this.ThrowIfDisposed();this._native.setWordsUtf16(breaks);return this;}
    SetGraphemeBreaksUtf16(breaks){this.ThrowIfDisposed();this._native.setGraphemeBreaksUtf16(breaks);return this;}
    SetLineBreaksUtf16(breaks){this.ThrowIfDisposed();this._native.setLineBreaksUtf16(breaks);return this;}
  }

  class SKShaperResult extends SKObject {
    constructor(paragraph,scaleX=1,skewX=0){super(null);this.Paragraph=paragraph;this.ScaleX=scaleX;this.SkewX=skewX;const glyphs=[],points=[],clusters=[],lines=paragraph.GetShapedLines();this.Baseline=lines[0]?.baseline??paragraph.AlphabeticBaseline;for(const line of lines)for(const run of line.runs){for(let i=0;i<run.glyphs.length;i++){glyphs.push(run.glyphs[i]);const y=run.positions[i*2+1]-this.Baseline;points.push(point(run.positions[i*2]*scaleX+y*skewX,y));clusters.push(run.offsets[i]);}}this.Codepoints=new Uint32Array(glyphs);this.Glyphs=new Uint16Array(glyphs);this.Points=points;this.Clusters=new Uint32Array(clusters);this.Width=paragraph.LongestLine*scaleX;}
    Paint(canvas,x=0,y=0){this.ThrowIfDisposed();if(typeof canvas.DrawParagraph==='function'){const count=canvas.Save();try{canvas.Translate(x,y);if(this.ScaleX!==1||this.SkewX!==0)canvas.Concat(new core.SKMatrix(this.ScaleX,this.SkewX,0,0,1,0,0,0,1));this.Paragraph.Paint(canvas,0,-this.Baseline);}finally{canvas.RestoreToCount(count);}return;}const native=un(canvas);native.save();try{native.translate(x,y);if(this.ScaleX!==1||this.SkewX!==0)native.concat([this.ScaleX,this.SkewX,0,0,1,0,0,0,1]);this.Paragraph.Paint(native,0,-this.Baseline);}finally{native.restore();}}
    Dispose(){if(this.IsDisposed)return;this.Paragraph.Dispose();super.Dispose();}
  }
  class SKShaper extends SKObject {
    constructor(typeface=null,manager=SKFontManager.Default){super(null);this._typeface=typeface?._copy()??null;this._manager=manager;this._ownManager=false;if(typeface?._bytes&&!manager._entries.some(e=>e.face._bytes===typeface._bytes)){this._manager=new SKFontManager();this._ownManager=true;for(const entry of manager._entries)this._manager.RegisterFont(entry.bytes,entry.family).Dispose();this._manager.RegisterFont(typeface._bytes,typeface.FamilyName).Dispose();}}
    get Typeface(){this.ThrowIfDisposed();return this._typeface?._copy()??null;}
    Shape(text,fontOrPaint=null,options={}){
      options=Object.fromEntries(Object.entries(options).map(([key,value])=>[key[0].toUpperCase()+key.slice(1),value]));
      this.ThrowIfDisposed();const font=fontOrPaint instanceof SKFont?fontOrPaint:null, paint=options.Paint??(font?null:fontOrPaint);
      const family=font?._typeface?.FamilyName??this._typeface?.FamilyName;
      const style={FontSize:font?.Size??paint?.TextSize??16,FontFamilies:family?[family,...this._manager.FontFamilies.filter(f=>f!==family)]:this._manager.FontFamilies,FontStyle:font?._typeface?.FontStyle??this._typeface?.FontStyle??SKFontStyle.Normal,Color:options.Color??paint?.Color??K.BLACK,...options.TextStyle};
      const builder=new SKParagraphBuilder({TextStyle:style,TextDirection:options.Direction??K.TextDirection.LTR,TextAlign:options.TextAlign??K.TextAlign.Left,MaxLines:options.MaxLines,...options.ParagraphStyle},this._manager);
      try{if(paint?._native){const background=new K.Paint();try{background.setColor(K.TRANSPARENT);builder.PushPaintStyle(style,paint,background);}finally{background.delete();}}builder.AddText(text);const paragraph=builder.Build();const scaleX=font?.ScaleX??paint?.TextScaleX??1,skewX=font?.SkewX??paint?.TextSkewX??0;paragraph.Layout((options.Width??10000000)/(Math.abs(scaleX)||1));return new SKShaperResult(paragraph,scaleX,skewX);}finally{builder.Dispose();}
    }
    Dispose(){if(this.IsDisposed)return;this._typeface?.Dispose();if(this._ownManager)this._manager.Dispose();super.Dispose();}
  }
  if(core.SKPaint){
    const fontForPaint=paint=>{paint.ThrowIfDisposed();const font=new SKFont(paint.Typeface,paint.TextSize??12,paint.TextScaleX??1,paint.TextSkewX??0);font.Embolden=paint.FakeBoldText??false;return font;};
    for(const method of ['MeasureText','GetGlyphs','CountGlyphs','ContainsGlyphs','GetGlyphWidths','GetGlyphBounds','GetGlyphPositions','GetGlyphOffsets','GetTextPath','BreakText'])core.SKPaint.prototype[method]=function(...args){const font=fontForPaint(this);try{return font[method](...args);}finally{font.Dispose();}};
    Object.defineProperty(core.SKPaint.prototype,'FontMetrics',{configurable:true,get(){const font=fontForPaint(this);try{return font.Metrics;}finally{font.Dispose();}}});
    Object.defineProperty(core.SKPaint.prototype,'FontSpacing',{configurable:true,get(){const font=fontForPaint(this);try{return font.Spacing;}finally{font.Dispose();}}});
    core.SKPaint.prototype.ToFont=function(){return fontForPaint(this);};
  }
  const fontWeight=Object.freeze(Object.fromEntries(Object.entries(K.FontWeight).filter(([,v])=>v&&typeof v==='object'&&'value'in v)));
  const fontWidth=Object.freeze(Object.fromEntries(Object.entries(K.FontWidth).filter(([,v])=>v&&typeof v==='object'&&'value'in v)));
  return {SKFontCache,SKFontMetrics,SKFontVariationAxis,SKFontVariationPositionCoordinate:SKFontArgumentsVariationPositionCoordinate,SKFontPaletteOverride:SKFontArgumentsPaletteOverride,SKFontArguments,SKFontArgumentsVariationPosition,SKFontArgumentsVariationPositionCoordinate,SKFontArgumentsPalette,SKFontArgumentsPaletteOverride,SKTypeface,SKFontManager,SKFontStyle,SKFontStyleSet,SKFont,SKTextBlob,SKTextBlobBuilder,SKShaper,SKShaperResult,SKParagraph,SKParagraphBuilder,SKFontStyleWeight:fontWeight,SKFontStyleWidth:fontWidth,SKFontStyleSlant:K.FontSlant,SKFontEdging:K.FontEdging,SKFontHinting:K.FontHinting,SKTextDirection:K.TextDirection,SKTextAlign:K.TextAlign,SKRectHeightStyle:K.RectHeightStyle,SKRectWidthStyle:K.RectWidthStyle,SKPlaceholderAlignment:K.PlaceholderAlignment,SKTextBaseline:K.TextBaseline,SKTextHeightBehavior:K.TextHeightBehavior,SKTextDecorationStyle:K.DecorationStyle,SKTextDecoration:Object.freeze({None:K.NoDecoration,Underline:K.UnderlineDecoration,Overline:K.OverlineDecoration,LineThrough:K.LineThroughDecoration})};
}
