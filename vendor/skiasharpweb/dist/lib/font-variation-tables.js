/* Supplemental OpenType variation resolution. MIT, 2026.
 * Implements OpenType ItemVariationStore, MVAR and all COLRv1 variable fields.
 * Table offsets are checked before reads; resulting tables are independent copies. */
class Reader {
  constructor(bytes){this.bytes=bytes;this.v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);}
  need(p,n){if(!Number.isInteger(p)||p<0||n<0||p+n>this.bytes.length)throw new Error('Malformed font variation table bounds.');}
  u8(p){this.need(p,1);return this.bytes[p];}i8(p){this.need(p,1);return this.v.getInt8(p);}
  u16(p){this.need(p,2);return this.v.getUint16(p);}i16(p){this.need(p,2);return this.v.getInt16(p);}
  u24(p){this.need(p,3);return this.bytes[p]*65536+this.bytes[p+1]*256+this.bytes[p+2];}
  u32(p){this.need(p,4);return this.v.getUint32(p);}i32(p){this.need(p,4);return this.v.getInt32(p);}
  tag(p){this.need(p,4);return String.fromCharCode(...this.bytes.subarray(p,p+4));}
}
export function VariationDelta(bytes,storeOffset,coordinates,outer,inner){
  if(!storeOffset||outer===65535&&inner===65535)return 0;const r=new Reader(bytes);if(r.u16(storeOffset)!==1)throw new Error('Unsupported item variation store format.');
  const regionList=storeOffset+r.u32(storeOffset+2),dataCount=r.u16(storeOffset+6);if(outer>=dataCount)return 0;r.need(storeOffset+8,dataCount*4);
  const data=storeOffset+r.u32(storeOffset+8+outer*4),items=r.u16(data),wordCount=r.u16(data+2),regionCount=r.u16(data+4),wide=wordCount&32768?4:2,longCount=wordCount&32767;
  if(inner>=items)return 0;if(longCount>regionCount)throw new Error('Malformed variation delta counts.');r.need(data+6,regionCount*2);
  const axisCount=r.u16(regionList),regions=r.u16(regionList+2);r.need(regionList+4,regions*axisCount*6);const rowSize=longCount*wide+(regionCount-longCount)*(wide/2);let p=data+6+regionCount*2+inner*rowSize; r.need(p,rowSize);let delta=0;
  for(let i=0;i<regionCount;i++){
    const region=r.u16(data+6+i*2);if(region>=regions)throw new Error('Malformed variation region index.');let scalar=1;
    for(let j=0;j<axisCount;j++){const at=regionList+4+(region*axisCount+j)*6,start=r.i16(at)/16384,peak=r.i16(at+2)/16384,end=r.i16(at+4)/16384,c=coordinates[j]??0;
      if(start>peak||peak>end||start<0&&end>0&&peak!==0||peak===0)continue;
      if(c<start||c>end){scalar=0;break;}if(c!==peak)scalar*=c<peak?(c-start)/(peak-start):(end-c)/(end-peak);
    }
    const size=i<longCount?wide:wide/2,value=size===4?r.i32(p):size===2?r.i16(p):r.i8(p);p+=size;delta+=scalar*value;
  }return delta;
}
function mappedIndex(bytes,offset,index){
  if(index===0xffffffff)return [65535,65535];if(!offset)return [index>>>16,index&65535];const r=new Reader(bytes),format=r.u8(offset),entryFormat=r.u8(offset+1),count=format===0?r.u16(offset+2):format===1?r.u32(offset+2):null;if(count===null)throw new Error('Unsupported delta set index map format.');if(!count)return [index>>>16,index&65535];const size=((entryFormat>>>4)&3)+1,bits=(entryFormat&15)+1,p=offset+(format===0?4:6)+Math.min(index,count-1)*size;r.need(p,size);let value=0;for(let i=0;i<size;i++)value=value*256+r.u8(p+i);return [Math.floor(value/2**bits),value%(2**bits)];
}
export function NormalizeCoordinates(tables,settings){
  const fvar=tables.get('fvar');if(!fvar)return [];const r=new Reader(fvar),start=r.u16(4),count=r.u16(8),size=r.u16(10);if(size<20)throw new Error('Malformed fvar axis record size.');r.need(start,count*size);
  let coords=Array.from({length:count},(_,i)=>{const p=start+i*size,min=r.i32(p+4)/65536,def=r.i32(p+8)/65536,max=r.i32(p+12)/65536,v=Math.max(min,Math.min(max,settings[r.tag(p)]??def));return v===def?0:v<def?(v-def)/(def-min):(v-def)/(max-def);});
  const avar=tables.get('avar');if(!avar)return coords;const a=new Reader(avar);if(a.u16(6)!==count)throw new Error('fvar and avar axis counts do not match.');let p=8;
  coords=coords.map(c=>{const n=a.u16(p);p+=2;a.need(p,n*4);const points=Array.from({length:n},(_,i)=>[a.i16(p+i*4)/16384,a.i16(p+i*4+2)/16384]);p+=n*4;if(!n)return c;for(let i=0;i<points.length;i++){const [from,to]=points[i];if(c===from)return to;if(i&&c<from){const previous=points[i-1];return previous[1]+(c-previous[0])*(to-previous[1])/(from-previous[0]);}}return c;});
  if(a.u16(0)>=2){const map=a.u32(p),store=a.u32(p+4),original=coords;coords=coords.map((c,i)=>Math.max(-1,Math.min(1,c+VariationDelta(avar,store,original,...mappedIndex(avar,map,i))/16384)));}
  return coords;
}
const metricFields={hasc:['OS/2',68],hdsc:['OS/2',70],hlgp:['OS/2',72],hcla:['OS/2',74,true],hcld:['OS/2',76,true],vasc:['vhea',4],vdsc:['vhea',6],vlgp:['vhea',8],hcrs:['hhea',18],hcrn:['hhea',20],hcof:['hhea',22],vcrs:['vhea',18],vcrn:['vhea',20],vcof:['vhea',22],xhgt:['OS/2',86],cpht:['OS/2',88],sbxs:['OS/2',10],sbys:['OS/2',12],sbxo:['OS/2',14],sbyo:['OS/2',16],spxs:['OS/2',18],spys:['OS/2',20],spxo:['OS/2',22],spyo:['OS/2',24],strs:['OS/2',26],stro:['OS/2',28],unds:['post',10],undo:['post',8]};
function resolveMetrics(source,target,coordinates){
  const bytes=source.get('MVAR');if(!bytes)return;const r=new Reader(bytes),size=r.u16(6),count=r.u16(8),store=r.u16(10);if(size<8)throw new Error('Malformed MVAR record size.');r.need(12,count*size);
  const changed=new Map();for(let i=0;i<count;i++){const p=12+i*size,name=r.tag(p);let field=metricFields[name];if(!field&&/^gsp[0-9]$/.test(name))field=['gasp',4+Number(name[3])*4,true];if(!field)continue;const [table,offset,unsigned]=field,original=source.get(table),current=target.get(table);if(!original||!current||offset+2>original.length||offset+2>current.length)continue;
    const out=changed.get(table)??current.slice(),v=new DataView(out.buffer,out.byteOffset,out.byteLength),start=new Reader(original),value=(unsigned?start.u16(offset):start.i16(offset))+Math.round(VariationDelta(bytes,store,coordinates,r.u16(p+4),r.u16(p+6)));
    if(unsigned)v.setUint16(offset,Math.max(0,Math.min(65535,value)));else v.setInt16(offset,Math.max(-32768,Math.min(32767,value)));changed.set(table,out);
  }for(const [name,bytes]of changed)target.set(name,bytes);
}
function resolveColor(bytes,coordinates){
  const r=new Reader(bytes);if(bytes.length<34||r.u16(0)<1)return bytes;const store=r.u32(30);if(!store)return bytes;
  const map=r.u32(26),out=bytes.slice(),v=new DataView(out.buffer,out.byteOffset,out.byteLength),delta=index=>VariationDelta(bytes,store,coordinates,...mappedIndex(bytes,map,index));
  const set=(p,index,width=2,unsigned=false)=>{if(index===0xffffffff)return;const value=(width===4?r.i32(p):unsigned?r.u16(p):r.i16(p))+Math.round(delta(index));if(width===4)v.setInt32(p,Math.max(-2147483648,Math.min(2147483647,value)));else if(unsigned)v.setUint16(p,Math.max(0,Math.min(65535,value)));else v.setInt16(p,Math.max(-32768,Math.min(32767,value)));};
  const lines=new Set(),transforms=new Set(),visited=new Set(),active=new Set();
  const colorLine=p=>{if(lines.has(p))return;lines.add(p);const n=r.u16(p+1);r.need(p+3,n*10);for(let i=0;i<n;i++){const a=p+3+i*10,index=r.u32(a+6),offset=r.i16(a)+(index===0xffffffff?0:Math.round(delta(index))),alpha=r.i16(a+4)+(index===0xffffffff?0:Math.round(delta(index+1)));const to=p+3+i*6;v.setInt16(to,Math.max(-32768,Math.min(32767,offset)));v.setUint16(to+2,r.u16(a+2));v.setInt16(to+4,Math.max(0,Math.min(16384,alpha)));}};
  const layerList=r.u32(18),base=r.u32(14),roots=new Map();if(base){const n=r.u32(base);r.need(base+4,n*6);for(let i=0;i<n;i++){const p=base+4+i*6;roots.set(r.u16(p),base+r.u32(p+2));}}
  function visit(p){if(active.has(p)||active.size>128)throw new Error('Recursive COLRv1 paint graph.');if(visited.has(p))return;active.add(p);const f=r.u8(p),child=offset=>visit(p+r.u24(p+offset));
    if(f===1){const n=r.u8(p+1),first=r.u32(p+2);if(first+n>r.u32(layerList))throw new Error('Malformed COLRv1 layer range.');for(let i=0;i<n;i++)visit(layerList+r.u32(layerList+4+(first+i)*4));}
    else if(f===3){set(p+3,r.u32(p+5));v.setInt16(p+3,Math.max(0,Math.min(16384,v.getInt16(p+3))));out[p]=2;}
    else if(f===5||f===7||f===9){colorLine(p+r.u24(p+1));const n=f===9?4:6,index=r.u32(p+4+n*2);for(let i=0;i<n;i++)set(p+4+i*2,index===0xffffffff?index:index+i,2,f===7&&(i===2||i===5));out[p]=f-1;}
    else if(f===10)child(1);
    else if(f===11){const root=roots.get(r.u16(p+1));if(root!==undefined)visit(root);}
    else if(f===12||f===13){child(1);if(f===13){const at=p+r.u24(p+4);if(!transforms.has(at)){transforms.add(at);const index=r.u32(at+24);for(let i=0;i<6;i++)set(at+i*4,index===0xffffffff?index:index+i,4);}out[p]=12;}}
    else if(f>=14&&f<=31){child(1);if(f%2){const n=f<=17?2:f<=19?4:f<=21?1:f<=23?3:f<=25?1:f<=27?3:f<=29?2:4,index=r.u32(p+4+n*2);for(let i=0;i<n;i++)set(p+4+i*2,index===0xffffffff?index:index+i);out[p]=f-1;}}
    else if(f===32){child(1);child(5);}
    else if(![2,4,6,8].includes(f))throw new Error(`Unsupported COLRv1 paint format ${f}.`);
    active.delete(p);visited.add(p);
  }
  for(const root of roots.values())visit(root);
  const clipList=r.u32(22);if(clipList){if(r.u8(clipList)!==1)throw new Error('Unsupported COLRv1 clip list format.');const n=r.u32(clipList+1);r.need(clipList+5,n*7);const seen=new Set();for(let i=0;i<n;i++){const p=clipList+r.u24(clipList+5+i*7+4);if(seen.has(p))continue;seen.add(p);if(r.u8(p)===2){const index=r.u32(p+9);for(let j=0;j<4;j++)set(p+1+j*2,index===0xffffffff?index:index+j);out[p]=1;}}}
  v.setUint32(26,0);v.setUint32(30,0);return out;
}
/** Resolve supplementary tables against source values, avoiding double deltas. */
export function ResolveVariationTables(source,target,settings){
  const coordinates=NormalizeCoordinates(source,settings);resolveMetrics(source,target,coordinates);
  const colr=source.get('COLR');if(colr&&colr.length>=34&&new Reader(colr).u32(30)){target.set('COLR',resolveColor(colr,coordinates));if(source.has('CPAL'))target.set('CPAL',source.get('CPAL').slice());}
  target.delete('MVAR');return target;
}
