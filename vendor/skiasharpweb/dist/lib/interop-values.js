/** Value-only GPU descriptors. These preserve configuration/serialization and
 * .NET struct-copy behavior. They do not import or dereference process handles. */
export function installInteropValues(K, api) {
  const storage = new WeakMap();
  const integer = (value, bits, signed, name) => {
    if(bits===64) {
      if(typeof value==='number'&&!Number.isSafeInteger(value)) throw new RangeError(name+' requires BigInt above the safe integer range.');
      if(typeof value!=='number'&&typeof value!=='bigint') throw new TypeError(name+' must be an integer or BigInt.');
      const n=BigInt(value),min=signed?-(1n<<63n):0n,max=signed?(1n<<63n)-1n:(1n<<64n)-1n;
      if(n<min||n>max)throw new RangeError(name+' is outside the '+(signed?'Int':'UInt')+'64 range.');
      return n;
    }
    const n=value?.value??value,min=signed?-2147483648:0,max=signed?2147483647:4294967295;
    if(!Number.isInteger(n)||n<min||n>max)throw new RangeError(name+' is outside the '+(signed?'Int':'UInt')+'32 range.');
    return n;
  };
  const schemas={
    GRVkAlloc:{Memory:'u64',Offset:'u64',Size:'u64',Flags:'u32',BackendMemory:'u64'},
    GRVkYcbcrComponents:{R:'u32',G:'u32',B:'u32',A:'u32'},
    GRVkYcbcrConversionInfo:{Format:'u32',ExternalFormat:'u64',YcbcrModel:'u32',YcbcrRange:'u32',XChromaOffset:'u32',YChromaOffset:'u32',ChromaFilter:'u32',ForceExplicitReconstruction:'u32',Components:'GRVkYcbcrComponents',SamplerFilterMustMatchChromaFilter:'bool',SupportsLinearFilter:'bool'},
    GRVkImageInfo:{Image:'u64',Alloc:'GRVkAlloc',ImageTiling:'u32',ImageLayout:'u32',Format:'u32',ImageUsageFlags:'u32',SampleCount:'u32',LevelCount:'u32',CurrentQueueFamily:'u32',Protected:'bool',YcbcrConversionInfo:'GRVkYcbcrConversionInfo',SharingMode:'u32'},
    SKGraphiteVkTextureInfo:{SampleCount:'i32',Mipmapped:'bool',Flags:'u32',Format:'i32',ImageTiling:'i32',ImageUsageFlags:'u32',SharingMode:'i32',AspectMask:'u32'}
  };
  const types={};
  function define(name, schema) {
    const fields=Object.entries(schema);
    const Record = class {
      constructor(values={}) {
        if(values===null||typeof values!=='object')throw new TypeError(name+' expects an object initializer.');
        const data={};storage.set(this,data);
        for(const [key,type]of fields) data[key]=types[type]?new types[type]():type==='bool'?false:type.endsWith('64')?0n:0;
        for(const [key,value] of Object.entries(values)) {
          if(!(key in schema))throw new TypeError('Unknown '+name+' field: '+key);
          this[key]=value;
        }
        if(values instanceof Record) for(const [key]of fields)this[key]=values[key];
      }
      Equals(other) {
        if(other?.constructor!==this.constructor)return false;
        const a=storage.get(this),b=storage.get(other);
        return fields.every(([key,type])=>types[type]?a[key].Equals(b[key]):a[key]===b[key]);
      }
      Clone() { const clone=new this.constructor();for(const [key]of fields)clone[key]=this[key];return clone; }
      GetHashCode() {
        const text=JSON.stringify(this),data=new TextEncoder().encode(text);let hash=2166136261;
        for(const b of data)hash=Math.imul(hash^b,16777619);return hash|0;
      }
      toJSON() { const data=storage.get(this);return Object.fromEntries(fields.map(([key,type])=>[key,types[type]?data[key].toJSON():type.endsWith('64')?data[key].toString():data[key]])); }
      static FromJSON(input) {
        const parsed=typeof input==='string'?JSON.parse(input):input;
        const result=new this();
        if(parsed===null||typeof parsed!=='object')throw new TypeError('Descriptor JSON must be an object.');
        for(const [key,val]of Object.entries(parsed)) {
          if(!(key in schema))throw new TypeError('Unknown '+name+' field: '+key);
          const type=schema[key];result[key]=types[type]?types[type].FromJSON(val):type.endsWith('64')&&typeof val==='string'&&/^\d+$/.test(val)?BigInt(val):val;
        }
        return result;
      }
      static op_Equality(a,b) { return a?.Equals(b)??a===b; }
      static op_Inequality(a,b) { return !this.op_Equality(a,b); }
    };
    Object.defineProperty(Record,'name',{value:name});
    for(const [key,type]of fields)Object.defineProperty(Record.prototype,key,{enumerable:true,
      get(){const value=storage.get(this)[key];return types[type]?value.Clone():value;},
      set(value){
        storage.get(this)[key]=types[type]?new types[type](value):type==='bool'?(typeof value==='boolean'?value:(()=>{throw new TypeError(key+' must be a boolean.');})()):integer(value,type.endsWith('64')?64:32,type==='i32',key);
      }
    });
    Object.defineProperty(Record,'InteropKind',{value:'value-descriptor-only'});
    types[name]=Record;
  }
  for(const [name,schema]of Object.entries(schemas))define(name,schema);
  class GrVkYcbcrConversionInfo extends types.GRVkYcbcrConversionInfo {
    constructor(values={}) { const {FormatFeatures,...rest}=values;super(rest);if(values instanceof types.GRVkYcbcrConversionInfo)for(const key of Object.keys(schemas.GRVkYcbcrConversionInfo))this[key]=values[key]; }
    static FromJSON(input){
      const parsed=typeof input==='string'?JSON.parse(input):input;
      if(parsed===null||typeof parsed!=='object')throw new TypeError('Descriptor JSON must be an object.');
      const {FormatFeatures,...fields}=parsed;
      const current=types.GRVkYcbcrConversionInfo.FromJSON(fields),result=new this(current);
      if(FormatFeatures!==undefined)result.FormatFeatures=FormatFeatures;
      return result;
    }
    get FormatFeatures(){return 0;}
    set FormatFeatures(value){integer(value,32,false,'FormatFeatures');}
    ToCurrent(){return new types.GRVkYcbcrConversionInfo(this.toJSONValues());}
    toJSONValues(){return Object.fromEntries(Object.keys(schemas.GRVkYcbcrConversionInfo).map(key=>[key,this[key]]));}
  }
  Object.assign(api,types,{GrVkYcbcrConversionInfo});
  const Texture=api.GRGlTextureInfo,Framebuffer=api.GRGlFramebufferInfo;
  function GRGlTextureInfo(target=0,id=0,format=0){return new Texture(target,id,format);}
  function GRGlFramebufferInfo(id=0,format=0){return new Framebuffer(id,format);}
  GRGlTextureInfo.prototype=Texture.prototype;Object.setPrototypeOf(GRGlTextureInfo,Texture);
  GRGlFramebufferInfo.prototype=Framebuffer.prototype;Object.setPrototypeOf(GRGlFramebufferInfo,Framebuffer);
  Object.assign(api,{GRGlTextureInfo,GRGlFramebufferInfo});
}
