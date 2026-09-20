/** Portable stream adapters. Numeric fields use the little-endian Skia wire format.
 * Files are explicitly mounted byte resources; URL and File handles have async import APIs. */
export function createAssetStreams(K, api) {
  const {SKObject, SKData, SKStream, SKDynamicMemoryWStream:MemoryWriter}=api;
  const bytes=value=>value instanceof SKData?value.AsSpan():value instanceof ArrayBuffer?new Uint8Array(value):ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):Array.isArray(value)?Uint8Array.from(value):(()=>{throw new TypeError('Expected byte storage.');})();
  const check=n=>{if(!Number.isSafeInteger(n)||n<0)throw new RangeError('Expected a nonnegative safe integer.');return n;};
  const output=(box,value)=>{if(Array.isArray(box))box[0]=value;else box.Value=value;};
  Object.defineProperties(SKStream.prototype,{CanRead:{get(){return !this.IsDisposed;}},CanSeek:{get(){return !this.IsDisposed;}},CanWrite:{get(){return false;}}});
  SKStream.prototype.Read=function(dst=this.Length-this.Position,a,b){this.ThrowIfDisposed();let target,count;if(typeof dst==='number'){count=check(dst);}else{target=bytes(dst);if(b===undefined){count=a??target.length;}else{target=target.subarray(check(a));count=b;}check(count);if(count>target.length)throw new RangeError('Requested bytes exceed destination.');}count=Math.min(count,this.Length-this._position);const src=this._bytes.subarray(this._position,this._position+count);this._position+=count;if(target){target.set(src);return count;}return src.slice();};
  SKStream.prototype.Peek=function(dst,count){this.ThrowIfDisposed();if(typeof dst==='number')return this._bytes.slice(this.Position,this.Position+check(dst));const target=bytes(dst);count=Math.min(check(count??target.length),this.Length-this.Position);if(count>target.length)throw new RangeError('Destination too small.');target.set(this._bytes.subarray(this.Position,this.Position+count));return count;};
  SKStream.prototype.Skip=function(count){check(count);const actual=Math.min(count,this.Length-this.Position);this.Position+=actual;return actual;};
  SKStream.prototype.GetData=function(){this.ThrowIfDisposed();return SKData.CreateCopy(this._bytes);};
  SKStream.prototype.Flush=function(){this.ThrowIfDisposed();};
  for(const [name,size,method] of [['SByte',1,'getInt8'],['Int16',2,'getInt16'],['Int32',4,'getInt32'],['Byte',1,'getUint8'],['UInt16',2,'getUint16'],['UInt32',4,'getUint32'],['Scalar',4,'getFloat32'],['Bool',1,'getUint8']]) {
    SKStream.prototype['Read'+name]=function(out){this.ThrowIfDisposed();const src=this.Read(size),ok=src.length===size;let value=ok?new DataView(src.buffer,src.byteOffset,src.byteLength)[method](0,true):0;if(name==='Bool')value=!!value;if(out!=null){output(out,value);return ok;}return value;};
  }
  SKStream.prototype.ReadPackedUInt32=function(out){const marker=this.ReadByte();let value=marker,ok=true;if(marker===254||marker===255){const box={};ok=this[marker===254?'ReadUInt16':'ReadUInt32'](box);value=box.Value;}if(out){output(out,value);return ok;}return value;};
  class SKMemoryStream extends api.SKMemoryStream {
    constructor(value=new Uint8Array(),length,copyData=true){if(typeof value==='number')value=new Uint8Array(check(value));else if(length!=null)value=bytes(value).subarray(0,check(length));super(value);if(copyData===false)this._bytes=bytes(value);}
    SetMemory(value,length,copyData=true){this.ThrowIfDisposed();const b=bytes(value),part=length==null?b:b.subarray(0,check(length));this._bytes=copyData?part.slice():part;this._position=0;}
    static FromData(data){return new SKMemoryStream(data);}
  }
  const methods={
    NewLine(){return this.WriteByte(10);},Write8(v){return this.WriteByte(v);},Write16(v){const b=new Uint8Array(2);new DataView(b.buffer).setUint16(0,v,true);return this.Write(b);},Write32(v){const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,v,true);return this.Write(b);},
    WriteBool(v){return this.WriteByte(v?1:0);},WriteScalar(v){const b=new Uint8Array(4);new DataView(b.buffer).setFloat32(0,v,true);return this.Write(b);},WriteDecimalAsTest(v){return this.WriteText(String(v|0));},WriteDecimalAsText(v){return this.WriteDecimalAsTest(v);},WriteBigDecimalAsText(v,digits=0){const n=BigInt(v),s=BigInt.asUintN(64,n).toString();return this.WriteText(s.padStart(Math.min(64,check(digits)),'0'));},WriteHexAsText(v,digits=0){return this.WriteText((v>>>0).toString(16).toUpperCase().padStart(Math.min(8,check(digits)),'0'));},WriteScalarAsText(v){return this.WriteText(String(Math.fround(v)));},
    WritePackedUInt32(v){if(!Number.isInteger(v)||v<0||v>0xffffffff)throw new RangeError('Value is outside UInt32.');return v<=253?this.WriteByte(v):v<=65535?this.WriteByte(254)&&this.Write16(v):this.WriteByte(255)&&this.Write32(v);},
    WriteStream(stream,length){check(length);const scratch=new Uint8Array(Math.min(65536,length));while(length){const n=stream.Read(scratch,Math.min(scratch.length,length));if(!n)return false;if(!this.Write(scratch,n))return false;length-=n;}return true;},
    CopyTo(destination){this.ThrowIfDisposed();if(destination?.Write){for(const p of this._parts)if(!destination.Write(p))return false;return true;}const d=bytes(destination);if(d.length<this._length)throw new RangeError('Destination too small.');let at=0;for(const p of this._parts){d.set(p,at);at+=p.length;}},
  };
  Object.assign(MemoryWriter.prototype,methods);
  MemoryWriter.GetSizeOfPackedUInt32=v=>{if(!Number.isInteger(v)||v<0||v>0xffffffff)throw new RangeError('Value is outside UInt32.');return v<=253?1:v<=65535?3:5;};
  const originalWrite=MemoryWriter.prototype.Write;
  MemoryWriter.prototype.Write=function(value,size){const b=bytes(value);if(size!=null&&check(size)>b.length)throw new RangeError('Write size exceeds source.');return originalWrite.call(this,b,size);};
  // SaveTo and WriteToStream avoid constructing an intermediate contiguous copy.
  MemoryWriter.prototype.WriteToStream=function(stream){return this.CopyTo(stream);};
  class SKWStream extends MemoryWriter {}
  const mounted=new Map();
  const path=p=>{if(typeof p!=='string'||!p||p.includes('\0'))throw new TypeError('A nonempty mounted path is required.');return p;};
  const SKFileSystem=Object.freeze({Mount(name,value){mounted.set(path(name),bytes(value).slice());return name;},Unmount(name){return mounted.delete(name);},Exists(name){return mounted.has(name);},ReadAllBytes(name){const b=mounted.get(path(name));if(!b)throw new Error('File is not mounted: '+name);return b.slice();},WriteAllBytes(name,value){mounted.set(path(name),bytes(value).slice());},GetPaths(){return [...mounted.keys()];},async MountAsync(name,source){if(typeof source==='string'||source instanceof URL){const r=await fetch(source);if(!r.ok)throw new Error('HTTP '+r.status);source=await r.arrayBuffer();}else if(source?.getFile)source=await source.getFile();if(source?.arrayBuffer)source=await source.arrayBuffer();this.Mount(name,source);return name;},async SaveAsync(name,handle){const writer=await handle.createWritable();try{await writer.write(this.ReadAllBytes(name));}finally{await writer.close();}}});
  class SKFileStream extends SKMemoryStream {
    constructor(name){const b=mounted.get(path(name));super(b??new Uint8Array());this._valid=!!b;this.Path=name;}
    get IsValid(){return this._valid&&!this.IsDisposed;}
    static IsPathSupported(name){return typeof name==='string'&&mounted.has(name);}
    static OpenStream(name){const stream=new SKFileStream(name);if(stream.IsValid)return stream;stream.Dispose();return null;}
    static async OpenStreamAsync(source,name=String(source?.name??source)){await SKFileSystem.MountAsync(name,source);return new SKFileStream(name);}
  }
  class SKFileWStream extends SKWStream {
    constructor(name){super();this.Path=path(name);this._valid=true;mounted.set(name,new Uint8Array());}
    get IsValid(){return this._valid&&!this.IsDisposed;}
    Flush(){this.ThrowIfDisposed();const data=this.CopyToData();try{SKFileSystem.WriteAllBytes(this.Path,data);}finally{data.Dispose();}return true;}
    Dispose(){if(this.IsDisposed)return;this.Flush();super.Dispose();}
    static IsPathSupported(name){return typeof name==='string'&&!!name&&!name.includes('\0');}
    static OpenStream(name){return new SKFileWStream(name);}
  }
  class SKFrontBufferedStream extends SKStream {
    static DefaultBufferSize=4096;
    constructor(stream,size=4096,dispose=false){super();if(typeof size==='boolean'){dispose=size;size=4096;}this._source=stream;this._size=check(size);this._buffer=new Uint8Array(size);this._buffered=0;this._position=0;this._disposeSource=dispose;this._total=stream.HasLength!==false?stream.Length:-1;}
    get Length(){this.ThrowIfDisposed();return this._total;}get HasLength(){return this._total>=0;}
    get IsAtEnd(){return this._position>=this._buffered&&this._source.IsAtEnd;}
    Read(dst,a,b){this.ThrowIfDisposed();let outputBuffer,count,offset=0;if(typeof dst==='number'){count=check(dst);outputBuffer=new Uint8Array(count);}else{outputBuffer=dst==null?null:bytes(dst);if(b==null)count=a??outputBuffer?.length??0;else{offset=check(a);count=b;}check(count);if(outputBuffer&&offset+count>outputBuffer.length)throw new RangeError('Destination too small.');}const start=this._position;while(count>0){let chunk;if(this._position<this._buffered){const n=Math.min(count,this._buffered-this._position);chunk=this._buffer.subarray(this._position,this._position+n);}else{const want=this._buffered<this._size?Math.min(count,this._size-this._buffered):count;const temp=new Uint8Array(want);const n=this._source.Read(temp,want);if(!n)break;chunk=temp.subarray(0,n);if(this._buffered<this._size){this._buffer.set(chunk,this._buffered);this._buffered+=n;}}outputBuffer?.set(chunk,offset);offset+=chunk.length;count-=chunk.length;this._position+=chunk.length;if(this._position>this._size)this._buffer=null;}return typeof dst==='number'?outputBuffer.subarray(0,this._position-start):this._position-start;}
    Seek(offset,origin='Begin'){this.ThrowIfDisposed();if(this._position>this._size)throw new Error('The position cannot change after reading past the front buffer.');const o=origin?.value??origin,target=offset+(o===1||o==='Current'?this._position:o===2||o==='End'?this.Length:0);check(target);if((o===2||o==='End')&&!this.HasLength)throw new Error('Unknown stream length.');if(target<=this._buffered)this._position=target;else this.Read(null,0,target-this._position);return arguments.length===1?this._position===target:this._position;}
    Rewind(){return this.Seek(0);}Move(offset){return this.Seek(this.Position+offset);}Skip(count){return this.Read(null,0,check(count));}
    ReadToEnd(){const parts=[];let length=0;while(!this.IsAtEnd){const part=this.Read(65536);if(!part.length)break;parts.push(part);length+=part.length;}const out=new Uint8Array(length);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;}
    Peek(count){const position=this.Position;if(position+count>this._size)throw new Error('Peek exceeds the rewindable front buffer.');const b=this.Read(count);this.Seek(position);return b;}
    Write(){throw new Error('The stream is read-only.');}SetLength(){throw new Error('The stream is read-only.');}
    Dispose(){if(this.IsDisposed)return;if(this._disposeSource)this._source.Dispose();this._source=null;this._buffer=null;super.Dispose();}
  }
  const resolve=value=>typeof value==='string'?SKFileSystem.ReadAllBytes(value):value;
  for(const type of [api.SKImage,api.SKBitmap,api.SKCodec])for(const name of ['FromEncodedData','Decode','DecodeBounds','Create'])if(type?.[name]&&!(type===api.SKImage&&name==='Create')){const original=type[name];type[name]=function(value,...rest){return original.call(this,resolve(value),...rest);};}
  SKData.prototype.Subset=function(offset,length){return SKData.CreateSubset(this,Number(offset),Number(length));};const createData=SKData.Create;SKData.Create=function(value,length){return createData.call(this,resolve(value),length);};
  SKData.CreateCopy=(function(original){return function(value,length){return original.call(this,resolve(value),length);};})(SKData.CreateCopy);
  class SKManagedStream extends SKStream{
    constructor(stream,disposeManagedStream=false){super();if(!stream?.Read)throw new TypeError('A synchronous readable stream with Read is required.');this._source=stream;this._disposeSource=disposeManagedStream;}
    get Length(){this.ThrowIfDisposed();return this._source.Length;}get HasLength(){return this._source.HasLength!==false&&Number.isFinite(this._source.Length);}get Position(){this.ThrowIfDisposed();return this._source.Position;}set Position(value){if(!this.Seek(value))throw new RangeError('Invalid stream position.');}get HasPosition(){return this._source.HasPosition!==false&&Number.isFinite(this._source.Position);}get IsAtEnd(){return this._source.IsAtEnd??this.Position>=this.Length;}
    Read(dst,a,b){this.ThrowIfDisposed();if(typeof dst==='number'||dst==null){const size=dst??this.Length-this.Position,target=new Uint8Array(check(size)),read=this._source.Read(target,0,size);return target.subarray(0,read);}const target=bytes(dst),offset=b==null?0:check(a),size=b==null?a??target.length:b;check(size);if(offset+size>target.length)throw new RangeError('Destination too small.');return this._source.Read(target,offset,size);}
    Peek(dst,count){this.ThrowIfDisposed();if(this._source.Peek)return this._source.Peek(dst,count);if(!this.HasPosition)throw new Error('Peek requires a rewindable stream.');const p=this.Position;try{return this.Read(dst,count);}finally{this.Seek(p);}}
    Seek(position){this.ThrowIfDisposed();check(position);if(this._source.Seek){const result=this._source.Seek(position);return typeof result==='boolean'?result:result===position;}if(this.HasPosition){this._source.Position=position;return this.Position===position;}return false;}
    Skip(size){return this.Read(check(size)).length;}Move(offset){return this.Seek(this.Position+offset);}Rewind(){return this.Seek(0);}GetData(){if(!this.HasPosition)throw new Error('GetData requires a rewindable stream.');const p=this.Position;try{this.Rewind();return new SKData(this.ReadToEnd());}finally{this.Seek(p);}}
    CopyTo(destination){this.ThrowIfDisposed();if(!destination?.Write||typeof destination.Flush!=='function')throw new TypeError('A writable SKWStream destination is required.');const buffer=new Uint8Array(65536);let total=0;while(true){const read=this._source.Read(buffer,0,buffer.length);if(!Number.isInteger(read)||read<0||read>buffer.length)throw new RangeError('The source returned an invalid byte count.');if(!read)break;destination.Write(buffer,read);total=(total+read)|0;}destination.Flush();return total;}
    ToMemoryStream(){this.ThrowIfDisposed();const destination=new MemoryWriter();try{this.CopyTo(destination);return destination.DetachAsStream();}finally{destination.Dispose();}}
    Duplicate(){if(this._source.Duplicate)return new SKManagedStream(this._source.Duplicate(),true);const data=this.GetData();try{return new SKMemoryStream(data);}finally{data.Dispose();}}Fork(){const s=this.Duplicate();s.Seek(this.Position);return s;}
    Dispose(){if(this.IsDisposed)return;if(this._disposeSource)this._source.Dispose?.();this._source=null;super.Dispose();}
    static async FromReadableStream(stream){const reader=stream.getReader(),parts=[];let length=0;try{while(true){const{done,value}=await reader.read();if(done)break;const b=bytes(value);parts.push(b);length+=b.length;}}finally{reader.releaseLock();}const data=new Uint8Array(length);let offset=0;for(const b of parts){data.set(b,offset);offset+=b.length;}return new SKManagedStream(new SKMemoryStream(data),true);}
  }
  class SKManagedWStream extends SKWStream{
    constructor(stream,disposeManagedStream=false){super();if(!stream?.Write&&!stream?.write)throw new TypeError('A writable stream is required.');this._source=stream;this._disposeSource=disposeManagedStream;}
    Write(value,size){this.ThrowIfDisposed();const b=bytes(value),n=size??b.length;if(check(n)>b.length)throw new RangeError('Write exceeds source.');const chunk=b.subarray(0,n),result=this._source.Write?this._source.Write(chunk,n):this._source.write(chunk);if(result?.then)throw new TypeError('Use an asynchronous stream adapter for promise-based writes.');if(result!==false)this._length+=n;return result!==false;}
    Flush(){this.ThrowIfDisposed();return this._source.Flush?.()??this._source.flush?.();}
    Dispose(){if(this.IsDisposed)return;this.Flush();if(this._disposeSource)this._source.Dispose?.();this._source=null;super.Dispose();}
  }
  class SKFrontBufferedManagedStream extends SKFrontBufferedStream{}
  return {SKManagedStream,SKManagedWStream,SKFrontBufferedManagedStream,SKMemoryStream,SKWStream,SKFileStream,SKFileWStream,SKFrontBufferedStream,SKFileSystem,SKSeekOrigin:Object.freeze({Begin:0,Current:1,End:2})};
}
