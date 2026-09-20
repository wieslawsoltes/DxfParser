/* Bounded font normalization / instancing cache. MIT, 2026.
 * Content hashes are only bucket selectors; a byte comparison prevents hash
 * collisions from aliasing fonts. Every caller-owned byte buffer is copied. */
export function createFontCache(normalize,instance,palette){
 let maxBytes=32*1024*1024,retainedBytes=0,next=1;const entries=new Map(),buckets=new Map(),variants=new WeakMap(),nativeEntries=new WeakMap(),statistics={NativeHits:0,NativeMisses:0,SourceHits:0,SourceMisses:0,InstanceHits:0,InstanceMisses:0,Evictions:0};
 const hash=b=>{let a=2166136261,c=0x9e3779b9;for(let i=0;i<b.length;i++){a=Math.imul(a^b[i],16777619);c=Math.imul(c^b[i],0x85ebca6b);}return b.length+':'+(a>>>0)+':'+(c>>>0);};
 const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
 const touch=e=>{entries.delete(e.id);entries.set(e.id,e);return e;};
 const evict=()=>{while(retainedBytes>maxBytes&&entries.size){const e=entries.values().next().value;entries.delete(e.id);retainedBytes-=e.cost;e.remove();statistics.Evictions++;}};
 const put=(value,cost,remove)=>{const e={id:next++,value,cost,remove};entries.set(e.id,e);retainedBytes+=cost;evict();return e;};
 return{
  Normalize(bytes){const key=hash(bytes);for(const e of buckets.get(key)??[])if(equal(e.value.source,bytes)){statistics.SourceHits++;return touch(e).value.normalized;}statistics.SourceMisses++;const source=bytes.slice(),normalized=normalize(source),cost=source.byteLength+(normalized.bytes===source?0:normalized.bytes.byteLength);let e;e=put({source,normalized},cost,()=>{const bucket=buckets.get(key);if(bucket){const i=bucket.indexOf(e);if(i>=0)bucket.splice(i,1);if(!bucket.length)buckets.delete(key);}});if(entries.has(e.id)){const list=buckets.get(key)??[];list.push(e);buckets.set(key,list);}return normalized;},
  Instance(font,settings,paletteValue=null){let cache=variants.get(font);if(!cache){cache=new Map();variants.set(font,cache);}const axes=Object.entries(settings).sort(([a],[b])=>a.localeCompare(b)),p=paletteValue?{Index:paletteValue.Index,Overrides:paletteValue.Overrides.map(o=>[o.Index,typeof o.Color==='number'?o.Color>>>0:((o.Color.Alpha??255)<<24|o.Color.Red<<16|o.Color.Green<<8|o.Color.Blue)>>>0])}:null,key=JSON.stringify([axes,p]);let e=cache.get(key);if(e){statistics.InstanceHits++;return touch(e).value;}statistics.InstanceMisses++;let result=instance(font,settings);if(paletteValue){const bytes=palette(result.font,paletteValue.Index,paletteValue.Overrides);result=normalize(bytes);}e=put(result,result.bytes.byteLength,()=>cache.delete(key));if(entries.has(e.id))cache.set(key,e);return result;},
  Palette(font,value){let cache=variants.get(font);if(!cache){cache=new Map();variants.set(font,cache);}const overrides=value.Overrides.map(o=>[o.Index,typeof o.Color==='number'?o.Color>>>0:o.Color.ToUint()]),key=JSON.stringify(['palette',value.Index,overrides]);let e=cache.get(key);if(e){statistics.InstanceHits++;return touch(e).value;}statistics.InstanceMisses++;const result=normalize(palette(font,value.Index,value.Overrides));e=put(result,result.bytes.byteLength,()=>cache.delete(key));if(entries.has(e.id))cache.set(key,e);return result;},
  Document(font,convert){let cache=variants.get(font);if(!cache){cache=new Map();variants.set(font,cache);}const key='document';let e=cache.get(key);if(e)return touch(e).value;const bytes=convert(font);e=put(bytes,bytes.byteLength,()=>cache.delete(key));if(entries.has(e.id))cache.set(key,e);return bytes;},
  GetNative(record){const e=nativeEntries.get(record);if(e){statistics.NativeHits++;touch(e);return e.value.clone();}statistics.NativeMisses++;return null;},
  PutNative(record,native){if(!native?.clone||nativeEntries.has(record)||!maxBytes)return;const owned=native.clone();const e=put(owned,record.bytes.byteLength,()=>{nativeEntries.delete(record);owned.delete();});if(entries.has(e.id))nativeEntries.set(record,e);},
  Clear(){for(const e of entries.values())e.remove();entries.clear();buckets.clear();retainedBytes=0;},
  GetStatistics(){return Object.freeze({...statistics,EntryCount:entries.size,RetainedBytes:retainedBytes,MaxBytes:maxBytes});},
  get MaxBytes(){return maxBytes;},set MaxBytes(value){if(!Number.isSafeInteger(value)||value<0)throw new RangeError('Font cache size must be a nonnegative integer.');maxBytes=value;evict();}
 };
}
