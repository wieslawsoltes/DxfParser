/* Browser font parsing and static OpenType instancing. MIT, 2026.
 * Fontkit 2.0.4 is bundled locally; see licenses/FONTKIT-THIRD-PARTY.md. */
import { create as parseFont } from '../vendor/fontkit.js';
import { decodeWoff2 } from '../vendor/woff2.js';
import { InstanceFont } from '../vendor/font-instance.js';
import { ConvertCff2ToCff1 } from './font-cff.js';
import { ResolveVariationTables } from './font-variation-tables.js';
const enc = new TextEncoder();
export const ReadFont = bytes => { const result=parseFont(bytes);result._originalFontBytes=bytes;return result; };
export function FontTables(font) {
  font._decompress?.();
  const result=new Map();
  for(const [name,entry] of Object.entries(font.directory.tables)) {
    const stream=font._getTableStream(name);if(!stream)continue;
    const length=entry.transformLength??entry.length;
    result.set(name,new Uint8Array(stream.readBuffer(length)));
  }
  return result;
}
export function WriteSfnt(tables, flavor=0x4f54544f) {
  tables=new Map(tables);if(tables.has('DSIG'))tables.delete('DSIG');
  const entries=[...tables].sort(([a],[b])=>a.localeCompare(b)),count=entries.length;
  if(count>4095)throw new RangeError('Too many font tables.');
  const total=12+16*count+entries.reduce((n,[,b])=>n+((b.length+3)&~3),0),out=new Uint8Array(total),v=new DataView(out.buffer);
  v.setUint32(0,flavor);v.setUint16(4,count);const power=2**Math.floor(Math.log2(count));v.setUint16(6,power*16);v.setUint16(8,Math.log2(power));v.setUint16(10,count*16-power*16);
  const checksum=(start,length)=>{let n=0;for(let p=start;p<start+length;p+=4)n=(n+v.getUint32(p))>>>0;return n;};
  let offset=12+count*16,head=-1;
  entries.forEach(([name,bytes],i)=>{const at=12+i*16;out.set(enc.encode(name),at);out.set(bytes,offset);if(name==='head'&&bytes.length>=12){head=offset;v.setUint32(offset+8,0);}v.setUint32(at+4,checksum(offset,(bytes.length+3)&~3));v.setUint32(at+8,offset);v.setUint32(at+12,bytes.length);offset+=(bytes.length+3)&~3;});
  if(head>=0)v.setUint32(head+8,(0xb1b0afba-checksum(0,total))>>>0);return out;
}
export function InstantiateFont(font, settings={}) {
  const source=font.type==='WOFF'?WriteSfnt(FontTables(font),font.directory.flavor):font._originalFontBytes;
  const resolved=ReadFont(InstanceFont(source,settings));
  const tables=ResolveVariationTables(FontTables(font),FontTables(resolved),settings);
  const bytes=WriteSfnt(tables,tables.has('CFF ')||tables.has('CFF2')?0x4f54544f:0x10000),staticFont=ReadFont(bytes);
  // Keep CFF2 programs and private hint dictionaries intact for FreeType.
  // Document consumers request the separate hint-preserving CFF1 conversion.
  return {bytes,font:staticFont};
}
export function NormalizeFont(bytes) {
  if(bytes[0]===119&&bytes[1]===79&&bytes[2]===70&&bytes[3]===50){const decoded=decodeWoff2(bytes);return {font:ReadFont(decoded),bytes:decoded};}
  const font=ReadFont(bytes);if(font.fonts)throw new Error('Collection face selection must be performed before normalization.');
  if(font.type==='WOFF')return {font,bytes:WriteSfnt(FontTables(font),font.directory.flavor)};
  if(font.type==='WOFF2')return {...InstantiateFont(font),source:font};
  return {font,bytes};
}
export function ReplacePalette(font, index=0, overrides=[]) {
  const tables=FontTables(font),cpal=tables.get('CPAL');if(!cpal)throw new Error('Typeface does not contain a CPAL color palette.');
  const out=cpal.slice(),v=new DataView(out.buffer);const per=v.getUint16(2),count=v.getUint16(4),records=v.getUint16(6),at=v.getUint32(8);
  if(!Number.isInteger(index)||index<0||index>=count)throw new RangeError('Palette index is outside the font palette.');
  if(12+count*2>out.length||at+records*4>out.length)throw new Error('Malformed CPAL table.');
  const selected=v.getUint16(12+index*2),first=v.getUint16(12);if(selected+per>records||first+per>records)throw new Error('Malformed CPAL palette range.');
  out.set(cpal.slice(at+selected*4,at+(selected+per)*4),at+first*4);
  for(const override of overrides){const entry=override.Index??override.index,color=override.Color??override.color;if(!Number.isInteger(entry)||entry<0||entry>=per)throw new RangeError('Palette entry is outside the palette.');const c=typeof color==='number'?{Red:(color>>>16)&255,Green:(color>>>8)&255,Blue:color&255,Alpha:color>>>24}:color;out.set([c.Blue??c.blue??0,c.Green??c.green??0,c.Red??c.red??0,c.Alpha??c.alpha??255],at+(first+entry)*4);}
  tables.set('CPAL',out);return WriteSfnt(tables,tables.has('CFF ')||tables.has('CFF2')?0x4f54544f:0x10000);
}
export function ReadPalettes(face,Color) {
  const table=face.GetTableData('CPAL');if(!table)return [];
  const v=new DataView(table.buffer,table.byteOffset,table.byteLength);if(table.length<12)throw new Error('Malformed CPAL table.');const per=v.getUint16(2),count=v.getUint16(4),records=v.getUint16(6),offset=v.getUint32(8);if(12+count*2>table.length||offset+records*4>table.length)throw new Error('Malformed CPAL table bounds.');
  return Array.from({length:count},(_,i)=>{const first=v.getUint16(12+i*2);if(first+per>records)throw new Error('Malformed CPAL color range.');return {Index:i,Colors:Array.from({length:per},(_,j)=>{const p=offset+(first+j)*4;return new Color(table[p+2],table[p+1],table[p],table[p+3]);})};});
}
export function ReadColorLayers(face,id,Color,paletteIndex=0) {
  const table=face.GetTableData('COLR');if(!table)return [];
  const v=new DataView(table.buffer,table.byteOffset,table.byteLength);if(table.length<14)throw new Error('Malformed COLR table.');const count=v.getUint16(2),base=v.getUint32(4),layers=v.getUint32(8),nLayers=v.getUint16(12);if(base+count*6>table.length||layers+nLayers*4>table.length)throw new Error('Malformed COLR table bounds.');
  const palette=ReadPalettes(face,Color)[paletteIndex];if(!palette)throw new RangeError('Palette index is outside the font palette.');
  for(let i=0;i<count;i++){const p=base+i*6;if(v.getUint16(p)!==id)continue;const start=v.getUint16(p+2),length=v.getUint16(p+4);if(start+length>nLayers)throw new Error('Malformed COLR glyph layer range.');return Array.from({length},(_,j)=>{const at=layers+(start+j)*4,index=v.getUint16(at+2);return {GlyphId:v.getUint16(at),PaletteIndex:index,IsForeground:index===65535,Color:index===65535?null:palette.Colors[index]};});}
  return [];
}
export function ReadSvg(face,id) {
  const table=face.GetTableData('SVG ');if(!table)return null;
  const v=new DataView(table.buffer,table.byteOffset,table.byteLength);if(table.length<10)throw new Error('Malformed SVG table.');const base=v.getUint32(2);if(base+2>table.length)throw new Error('Malformed SVG document index.');const count=v.getUint16(base);if(base+2+count*12>table.length)throw new Error('Malformed SVG document records.');
  for(let i=0;i<count;i++){const p=base+2+i*12;if(id<v.getUint16(p)||id>v.getUint16(p+2))continue;const at=base+v.getUint32(p+4),length=v.getUint32(p+8);if(at+length>table.length)throw new Error('Malformed SVG document range.');const bytes=table.slice(at,at+length);return {GlyphId:id,Data:bytes,IsCompressed:bytes[0]===31&&bytes[1]===139,Text:bytes[0]===31&&bytes[1]===139?null:new TextDecoder().decode(bytes)};}
  return null;
}
export function ReadBitmap(face,id,size=16) {
  const sbix=face.GetTableData('sbix');
  if(sbix){const v=new DataView(sbix.buffer,sbix.byteOffset,sbix.byteLength);if(sbix.length<8)throw new Error('Malformed sbix table.');const n=v.getUint32(4);if(8+n*4>sbix.length)throw new Error('Malformed sbix strikes.');let selected=null;for(let i=0;i<n;i++){const start=v.getUint32(8+i*4);if(start+4>sbix.length)throw new Error('Malformed sbix strike.');const ppem=v.getUint16(start);if(!selected||Math.abs(ppem-size)<Math.abs(selected.ppem-size))selected={start,ppem};}if(!selected)return null;
    const {start,ppem}=selected;if(start+4+(id+2)*4>sbix.length)throw new RangeError('Glyph is outside the sbix strike.');let begin=start+v.getUint32(start+4+id*4),end=start+v.getUint32(start+8+id*4),seen=new Set();
    while(begin<end){if(begin+8>end||end>sbix.length)throw new Error('Malformed sbix image.');const format=new TextDecoder().decode(sbix.slice(begin+4,begin+8));if(format!=='dupe')return {Format:format.trim(),Data:sbix.slice(begin+8,end),OriginX:v.getInt16(begin),OriginY:v.getInt16(begin+2),PixelsPerEm:ppem};if(begin+10>end)throw new Error('Malformed sbix duplicate.');const g=v.getUint16(begin+8);if(seen.has(g))throw new Error('Recursive sbix duplicate.');seen.add(g);if(start+4+(g+2)*4>sbix.length)throw new Error('Malformed sbix duplicate glyph.');begin=start+v.getUint32(start+4+g*4);end=start+v.getUint32(start+8+g*4);}return null;}
  const cblc=face.GetTableData('CBLC'),cbdt=face.GetTableData('CBDT');if(!cblc||!cbdt)return null;
  const v=new DataView(cblc.buffer,cblc.byteOffset,cblc.byteLength),d=new DataView(cbdt.buffer,cbdt.byteOffset,cbdt.byteLength);const need=(p,n)=>{if(p<0||p+n>cblc.length)throw new Error('Malformed CBLC table.');};need(0,8);const n=v.getUint32(4);need(8,n*48);let strike=null;
  for(let i=0;i<n;i++){const p=8+i*48;if(id<v.getUint16(p+40)||id>v.getUint16(p+42))continue;const ppem=cblc[p+45];if(!strike||Math.abs(ppem-size)<Math.abs(strike.ppem-size))strike={p,ppem};}if(!strike)return null;
  const array=v.getUint32(strike.p),count=v.getUint32(strike.p+8);need(array,count*8);
  for(let i=0;i<count;i++){const p=array+i*8,first=v.getUint16(p),last=v.getUint16(p+2);if(id<first||id>last)continue;const sub=array+v.getUint32(p+4);need(sub,8);const indexFormat=v.getUint16(sub),imageFormat=v.getUint16(sub+2),base=d.byteLength&&v.getUint32(sub+4);let offset,length;
    if(indexFormat===1||indexFormat===3){const step=indexFormat===1?4:2;need(sub+8,(last-first+2)*step);const get=at=>step===4?v.getUint32(at):v.getUint16(at);offset=get(sub+8+(id-first)*step);length=get(sub+8+(id-first+1)*step)-offset;}
    else if(indexFormat===2){need(sub+8,12);length=v.getUint32(sub+8);offset=(id-first)*length;}
    else if(indexFormat===4){need(sub+8,4);const n=v.getUint32(sub+8);need(sub+12,(n+1)*4);for(let j=0;j<n;j++){const a=sub+12+j*4;if(v.getUint16(a)===id){offset=v.getUint16(a+2);length=v.getUint16(a+6)-offset;break;}}}
    else if(indexFormat===5){need(sub+8,16);length=v.getUint32(sub+8);const n=v.getUint32(sub+20);need(sub+24,n*2);for(let j=0;j<n;j++)if(v.getUint16(sub+24+j*2)===id){offset=j*length;break;}}
    else throw new Error(`Unsupported CBLC index format ${indexFormat}.`);
    if(offset===undefined||!length)return null;let at=base+offset;if(at+length>cbdt.length||length<4)throw new Error('Malformed CBDT image.');const metricsSize=imageFormat===17?5:imageFormat===18?8:imageFormat===19?0:null;if(metricsSize===null)return {Format:`CBDT${imageFormat}`,Data:cbdt.slice(at,at+length),PixelsPerEm:strike.ppem};const metric=metricsSize?{Height:cbdt[at],Width:cbdt[at+1],OriginX:d.getInt8(at+2),OriginY:d.getInt8(at+3),Advance:cbdt[at+4]}:{};if(metricsSize+4>length)throw new Error('Malformed CBDT metrics.');const size=d.getUint32(at+metricsSize);at+=metricsSize+4;if(size>length-metricsSize-4)throw new Error('Malformed CBDT PNG.');return {Format:'png',Data:cbdt.slice(at,at+size),PixelsPerEm:strike.ppem,...metric};
  }return null;
}

/** Decode COLRv1's paint graph without losing variable indices or transforms. */
export function ReadColorPaint(face,glyphId) {
  const b=face.GetTableData('COLR');if(!b||b.length<34)return null;const v=new DataView(b.buffer,b.byteOffset,b.byteLength),need=(p,n)=>{if(p<0||p+n>b.length)throw new Error('Malformed COLRv1 paint bounds.');};
  if(v.getUint16(0)<1)return null;const base=v.getUint32(14),layerList=v.getUint32(18);if(!base)return null;need(base,4);const count=v.getUint32(base);need(base+4,count*6);
  const roots=new Map();for(let i=0;i<count;i++){const p=base+4+i*6;roots.set(v.getUint16(p),base+v.getUint32(p+2));}
  const offset24=p=>{need(p,3);return b[p]*65536+b[p+1]*256+b[p+2];};
  const u16=p=>{need(p,2);return v.getUint16(p);},i16=p=>{need(p,2);return v.getInt16(p);},u32=p=>{need(p,4);return v.getUint32(p);};
  const line=(p,variable)=>{need(p,3);const count=u16(p+1),step=variable?10:6;need(p+3,count*step);return {Extend:b[p],Stops:Array.from({length:count},(_,i)=>{const a=p+3+i*step;return {Offset:i16(a)/16384,PaletteIndex:u16(a+2),Alpha:i16(a+4)/16384,...variable?{VarIndexBase:u32(a+6)}:{}};})};};
  const visit=(p,stack=new Set())=>{if(stack.has(p)||stack.size>128)throw new Error('Recursive COLRv1 paint graph.');need(p,1);stack=new Set(stack);stack.add(p);const f=b[p],n={Format:f};const child=at=>visit(p+offset24(at),stack);const fields=(names,start=4,scale=1)=>names.forEach((name,i)=>n[name]=i16(p+start+i*2)*scale);
    if(f===1){need(p,6);const count=b[p+1],first=u32(p+2);need(layerList,4);if(first+count>u32(layerList))throw new Error('Malformed COLRv1 layer range.');n.Layers=Array.from({length:count},(_,i)=>visit(layerList+u32(layerList+4+(first+i)*4),stack));}
    else if(f===2||f===3){n.PaletteIndex=u16(p+1);n.Alpha=i16(p+3)/16384;if(f===3)n.VarIndexBase=u32(p+5);}
    else if(f>=4&&f<=9){const variable=f%2===1;n.ColorLine=line(p+offset24(p+1),variable);if(f<=5)fields(['X0','Y0','X1','Y1','X2','Y2']);else if(f<=7){fields(['X0','Y0']);n.R0=u16(p+8);fields(['X1','Y1'],10);n.R1=u16(p+14);}else{fields(['CenterX','CenterY']);n.StartAngle=(i16(p+8)/16384+1)*180;n.EndAngle=(i16(p+10)/16384+1)*180;}if(variable)n.VarIndexBase=u32(p+(f<=7?16:12));}
    else if(f===10){n.Paint=child(p+1);n.GlyphId=u16(p+4);}
    else if(f===11){n.GlyphId=u16(p+1);const root=roots.get(n.GlyphId);n.Paint=root===undefined?null:visit(root,stack);}
    else if(f===12||f===13){n.Paint=child(p+1);const a=p+offset24(p+4);need(a,f===13?28:24);n.Transform=Object.fromEntries(['ScaleX','SkewY','SkewX','ScaleY','TranslateX','TranslateY'].map((key,i)=>[key,v.getInt32(a+i*4)/65536]));if(f===13)n.Transform.VarIndexBase=u32(a+24);}
    else if(f>=14&&f<=31){n.Paint=child(p+1);let end;
      if(f<=15){fields(['Dx','Dy']);end=8;}
      else if(f<=19){fields(['ScaleX','ScaleY'],4,1/16384);if(f>=18)fields(['CenterX','CenterY'],8);end=f>=18?12:8;}
      else if(f<=23){fields(['Scale'],4,1/16384);if(f>=22)fields(['CenterX','CenterY'],6);end=f>=22?10:6;}
      else if(f<=27){fields(['Angle'],4,180/16384);if(f>=26)fields(['CenterX','CenterY'],6);end=f>=26?10:6;}
      else {fields(['XSkewAngle','YSkewAngle'],4,180/16384);if(f>=30)fields(['CenterX','CenterY'],8);end=f>=30?12:8;}
      if(f%2===1)n.VarIndexBase=u32(p+end);
    }
    else if(f===32){n.SourcePaint=child(p+1);need(p+4,1);n.CompositeMode=b[p+4];n.BackdropPaint=child(p+5);}
    else throw new Error(`Unknown COLRv1 paint format ${f}.`);
    return n;
  };
  return roots.has(glyphId)?visit(roots.get(glyphId)):null;
}

/** Static document font, preserving all original glyph IDs and Type 2 hints. */
export function DocumentFontBytes(font) {
  if(!font.directory.tables.CFF2)return font.type==='WOFF'||font.type==='WOFF2'?WriteSfnt(FontTables(font),font.directory.flavor):font._originalFontBytes??WriteSfnt(FontTables(font),font.directory.flavor);
  if(font.directory.tables.fvar)font=InstantiateFont(font).font;
  const tables=FontTables(font);tables.set('CFF ',ConvertCff2ToCff1(tables.get('CFF2'),font));tables.delete('CFF2');return WriteSfnt(tables,0x4f54544f);
}
