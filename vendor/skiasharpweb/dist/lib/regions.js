/** Integer regions stored as canonical nonoverlapping horizontal bands.
 * Rectangle Boolean operations use exact signed integer arithmetic. Path conversion
 * uses Skia's native scan converter; serialization matches SkRegion::writeToMemory.
 */
export function createRegions(K, api) {
  const {SKRectI,SKRect,SKPath,SKObject}=api;
  const SKRegionOperation=Object.freeze({Difference:0,Intersect:1,Union:2,XOR:3,Xor:3,ReverseDifference:4,Replace:5});
  const value=v=>v?.value??(typeof v==='string'?SKRegionOperation[v]:v);
  function integer(n){n=Number(n);if(!Number.isInteger(n)||n < -2147483648||n > 2147483647)throw new RangeError('Region coordinates must be signed 32-bit integers.');return n;}
  const rect=r=>{const a=r.ToArray?.()??(Array.isArray(r)?r:[r.Left,r.Top,r.Right,r.Bottom]);if(a.length!==4)throw new TypeError('A rectangle needs four coordinates.');return a.map(integer);};
  const equal=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
  function intervals(a,b,op){
    const out=[];let i=0,j=0,insideA=false,insideB=false,active=false;
    const yes=(aa,bb)=>op===0?aa&&!bb:op===1?aa&&bb:op===2?aa||bb:op===3?aa!==bb:op===4?bb&&!aa:bb;
    while(i<a.length||j<b.length){const x=Math.min(i<a.length?a[i]:Infinity,j<b.length?b[j]:Infinity);while(i<a.length&&a[i]===x){insideA=!insideA;i++;}while(j<b.length&&b[j]===x){insideB=!insideB;j++;}const next=yes(insideA,insideB);if(next!==active){out.push(x);active=next;}}
    return out;
  }
  function append(bands,top,bottom,spans){if(top>=bottom||spans.length===0)return;const last=bands.at(-1);if(last&&last.bottom===top&&equal(last.spans,spans))last.bottom=bottom;else bands.push({top,bottom,spans});}
  // Consume already sorted canonical bands directly. A Set + boundary sort
  // used to allocate and sort every endpoint for every Boolean operation.
  const noSpans=Object.freeze([]);
  function combine(a,b,op){
    const out=[];let i=0,j=0,y=Math.min(a[0]?.top??Infinity,b[0]?.top??Infinity);
    while(Number.isFinite(y)){
      while(i<a.length&&a[i].bottom<=y)i++;
      while(j<b.length&&b[j].bottom<=y)j++;
      const left=a[i],right=b[j],inA=left&&left.top<=y,inB=right&&right.top<=y;
      const next=Math.min(inA?left.bottom:left?.top??Infinity,inB?right.bottom:right?.top??Infinity);
      if(!Number.isFinite(next))break;
      append(out,y,next,intervals(inA?left.spans:noSpans,inB?right.spans:noSpans,op));y=next;
    }
    return out;
  }
  function overlaps(a,b){
    let i=0,j=0;
    while(i<a.length&&j<b.length){
      const left=a[i],right=b[j];
      if(left.bottom<=right.top){i++;continue;}
      if(right.bottom<=left.top){j++;continue;}
      let x=0,y=0;
      while(x<left.spans.length&&y<right.spans.length){
        if(left.spans[x]<right.spans[y+1]&&right.spans[y]<left.spans[x+1])return true;
        if(left.spans[x+1]<=right.spans[y+1])x+=2;else y+=2;
      }
      if(left.bottom<=right.bottom)i++;else j++;
    }
    return false;
  }
  const fromRect=r=>{const [l,t,rr,b]=rect(r);return l<rr&&t<b?[{top:t,bottom:b,spans:[l,rr]}]:[];};
  const copy=b=>b.map(x=>({...x,spans:x.spans.slice()}));
  function bandsOf(other){if(other instanceof SKRegion){other.ThrowIfDisposed();return other._bands;}if(other instanceof SKPath){const region=new SKRegion(other);try{return copy(region._bands);}finally{region.Dispose();}}return fromRect(other);}
  const boundsCache=new WeakMap();
  function bounds(bands){const cached=boundsCache.get(bands);if(cached)return new SKRectI(...cached);if(!bands.length)return new SKRectI();let l=2147483647,r=-2147483648;for(const b of bands){l=Math.min(l,b.spans[0]);r=Math.max(r,b.spans.at(-1));}const values=[l,bands[0].top,r,bands.at(-1).bottom];boundsCache.set(bands,values);return new SKRectI(...values);}
  class SKRegion extends SKObject {
    constructor(source=null){super();this._bands=[];if(source instanceof SKRegion)this.SetRegion(source);else if(source instanceof SKPath)this.SetPath(source);else if(source)this.SetRect(source);}
    get IsEmpty(){this.ThrowIfDisposed();return this._bands.length===0;}
    get IsRect(){this.ThrowIfDisposed();return this._bands.length===1&&this._bands[0].spans.length===2;}
    get IsComplex(){return !this.IsEmpty&&!this.IsRect;}
    get Bounds(){this.ThrowIfDisposed();return bounds(this._bands);}
    get Complexity(){this.ThrowIfDisposed();return this._bands.reduce((n,b)=>n+b.spans.length/2,0);}
    Clone(){return new SKRegion(this);}
    Equals(other){this.ThrowIfDisposed();if(!(other instanceof SKRegion))return false;other.ThrowIfDisposed();return this._bands.length===other._bands.length&&this._bands.every((b,i)=>{const c=other._bands[i];return b.top===c.top&&b.bottom===c.bottom&&equal(b.spans,c.spans);});}
    SetEmpty(){this.ThrowIfDisposed();this._bands=[];}
    SetRegion(other){this.ThrowIfDisposed();other.ThrowIfDisposed();this._bands=copy(other._bands);return !this.IsEmpty;}
    SetRect(r){this.ThrowIfDisposed();this._bands=fromRect(r);return !this.IsEmpty;}
    SetRects(rectangles){
      this.ThrowIfDisposed();const levels=[];
      // Balanced incremental union avoids repeatedly copying all earlier bands.
      // Do not publish until all inputs are validated: invalid input is atomic.
      for(const r of rectangles){let bands=fromRect(r),level=0;if(!bands.length)continue;
        while(levels[level]){bands=combine(levels[level],bands,2);levels[level++]=null;}levels[level]=bands;
      }
      let result=[];for(const bands of levels)if(bands)result=combine(result,bands,2);
      this._bands=result;return !this.IsEmpty;
    }
    SetPath(path,clip=null){
      this.ThrowIfDisposed();path.ThrowIfDisposed();let clipping=clip?copy(bandsOf(clip)):fromRect(SKRect.RoundOut(path.Bounds));
      if(!path.IsInverseFillType)clipping=combine(clipping,fromRect(SKRect.RoundOut(path.Bounds)),1);
      const native=K.SkiaSharpNative?.Effects?.RegionSetPath;
      if(native){const r=SKRegion.Deserialize(native(path._native,clipping.flatMap(b=>b.spans.flatMap((x,i)=>i%2?[]:[x,b.top,b.spans[i+1],b.bottom]))));this._bands=r._bands;r._bands=[];r.Dispose();return !this.IsEmpty;}
      // One native raster draw handles an entire strip. This uses the same Skia
      // non-antialiased scan converter as integer regions, including curve extrema
      // and winding rules, and avoids a Wasm crossing for every tested pixel.
      const out=[],paint=new K.Paint();paint.setColor(K.WHITE);paint.setAntiAlias(false);
      try{for(const band of clipping){const l=band.spans[0],r=band.spans.at(-1),width=r-l;if(width>16777216)throw new RangeError('Region scan-conversion width exceeds the bounded 16 MiB strip buffer.');const rows=Math.max(1,Math.floor(1048576/width));
        for(let top=band.top;top<band.bottom;top+=rows){const height=Math.min(rows,band.bottom-top),allocation=K.Malloc(Uint8Array,width*height),surface=K.MakeRasterDirectSurface({width,height,colorType:K.ColorType.Alpha_8,alphaType:K.AlphaType.Premul,colorSpace:null},allocation,width);if(!surface){K.Free(allocation);throw new Error('Region scan-conversion surface allocation failed.');}
          try{const canvas=surface.getCanvas();canvas.clear(K.TRANSPARENT);canvas.translate(-l,-top);canvas.drawPath(path._native,paint);const pixels=allocation.toTypedArray();for(let y=0;y<height;y++){const spans=[];for(let j=0;j<band.spans.length;j+=2){let start=null;for(let x=band.spans[j];x<band.spans[j+1];x++){const inside=pixels[y*width+x-l]!==0;if(inside&&start===null)start=x;if(!inside&&start!==null){spans.push(start,x);start=null;}}if(start!==null)spans.push(start,band.spans[j+1]);}append(out,top+y,top+y+1,spans);}}
          finally{surface.dispose();K.Free(allocation);}
        }
      }}finally{paint.delete();}this._bands=out;return !this.IsEmpty;
    }
    Contains(other,y){
      this.ThrowIfDisposed();if(typeof other==='number'||(other&&'X' in other&&!('Right' in other))){const x=integer(typeof other==='number'?other:other.X);y=integer(typeof other==='number'?y:other.Y);let lo=0,hi=this._bands.length;while(lo<hi){const mid=(lo+hi)>>>1;if(this._bands[mid].bottom<=y)lo=mid+1;else hi=mid;}const band=this._bands[lo];if(!band||y<band.top)return false;lo=0;hi=band.spans.length;while(lo<hi){const mid=(lo+hi)>>>1;if(band.spans[mid]<=x)lo=mid+1;else hi=mid;}return (lo&1)!==0;}
      const b=bandsOf(other);return b.length>0&&combine(b,this._bands,0).length===0;
    }
    QuickContains(r){return this.IsRect&&this.Bounds.Contains(new SKRectI(...rect(r)));}
    QuickReject(other){const b=other instanceof SKPath?other.Bounds:other instanceof SKRegion?other.Bounds:new SKRectI(...rect(other));return this.IsEmpty||b.Width<=0||b.Height<=0||!this.Bounds.IntersectsWith(b);}
    Intersects(other){this.ThrowIfDisposed();return overlaps(this._bands,bandsOf(other));}
    Translate(x,y){this.ThrowIfDisposed();if(typeof x==='object'){y=x.Y;x=x.X;}integer(x);integer(y);const next=this._bands.map(b=>({top:integer(b.top+y),bottom:integer(b.bottom+y),spans:b.spans.map(n=>integer(n+x))}));this._bands=next;}
    Op(...args){this.ThrowIfDisposed();let other,op;if(args.length===5){other=new SKRectI(...args.slice(0,4));op=args[4];}else [other,op]=args;op=value(op);if(!Number.isInteger(op)||op<0||op>5)throw new RangeError('Unknown region operation.');this._bands=combine(this._bands,bandsOf(other),op);return !this.IsEmpty;}
    GetBoundaryPath(destination){this.ThrowIfDisposed();const p=new SKPath();for(const r of this)p.AddRect(r);if(!p.IsEmpty)p.Simplify(p);if(destination){destination.Reset().AddPath(p);const nonempty=!p.IsEmpty;p.Dispose();return nonempty;}return p;}
    CreateRectIterator(){return new RectIterator(this);}
    CreateClipIterator(clip){return new ClipIterator(this,clip);}
    CreateSpanIterator(y,left,right){return new SpanIterator(this,y,left,right);}
    *[Symbol.iterator](){this.ThrowIfDisposed();for(const b of this._bands)for(let i=0;i<b.spans.length;i+=2)yield new SKRectI(b.spans[i],b.top,b.spans[i+1],b.bottom);}
    /** Native little-endian SkRegion::writeToMemory format (empty, rect, or RLE). */
    Serialize(){this.ThrowIfDisposed();let words;if(this.IsEmpty)words=[-1];else if(this.IsRect)words=[0,...this.Bounds.ToArray()];else{const S=2147483647,runs=[this._bands[0].top];let last=this._bands[0].top,ySpans=0,intervalCount=0;for(const b of this._bands){if(b.top!==last){runs.push(b.top,0,S);ySpans++;}runs.push(b.bottom,b.spans.length/2,...b.spans,S);intervalCount+=b.spans.length/2;ySpans++;last=b.bottom;}runs.push(S);words=[runs.length,...this.Bounds.ToArray(),ySpans,intervalCount,...runs];if(this._bands.some(b=>b.bottom===S||b.spans.includes(S)))throw new RangeError('Native complex region serialization reserves INT32_MAX as its run sentinel.');}
      const bytes=new Uint8Array(words.length*4),view=new DataView(bytes.buffer);for(let i=0;i<words.length;i++)view.setInt32(i*4,words[i],true);return api.SKData?.CreateCopy?api.SKData.CreateCopy(bytes):bytes;
    }
    static Deserialize(data){const bytes=data.ToArray?.()??data;if(!(bytes instanceof Uint8Array))throw new TypeError('Expected byte data.');if(bytes.length<4||bytes.length%4)throw new RangeError('Truncated native region data.');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),get=i=>view.getInt32(i*4,true),count=get(0),out=new SKRegion();if(count===0x47524b53)return SKRegion.DeserializePortable(bytes);if(count===-1){if(bytes.length!==4)throw new RangeError('Trailing empty-region data.');return out;}if(count<0||bytes.length<20)throw new RangeError('Invalid native region header.');const expected=new SKRectI(get(1),get(2),get(3),get(4));if(expected.IsEmpty)throw new RangeError('Native region bounds must be nonempty.');if(count===0){if(bytes.length!==20)throw new RangeError('Trailing rectangular-region data.');out.SetRect(expected);return out;}if(bytes.length!==28+count*4)throw new RangeError('Invalid native region run length.');let ySpans=get(5),intervals=get(6);if(ySpans<1||intervals<2||2+3*ySpans+2*intervals!==count)throw new RangeError('Invalid native region run counts.');const S=2147483647;let at=7,top=get(at++),empty=true;if(top!==expected.Top)throw new RangeError('Native region top does not match bounds.');while(at<bytes.length/4-1){const bottom=get(at++),n=get(at++);if(bottom===S||bottom<=top||bottom>expected.Bottom||n<0||n>intervals||at+n*2+1>bytes.length/4)throw new RangeError('Invalid native region band.');if(n===0&&empty)throw new RangeError('Adjacent empty native region bands.');const spans=[];for(let j=0;j<n*2;j++){const x=get(at++);if(x===S||j&&x<=spans.at(-1))throw new RangeError('Invalid native region interval.');spans.push(x);}if(get(at++)!==S)throw new RangeError('Missing native region X sentinel.');if(n)append(out._bands,top,bottom,spans);empty=n===0;intervals-=n;ySpans--;top=bottom;}
      if(get(at++)!==S||at!==bytes.length/4||ySpans!==0||intervals!==0||empty||!out.Bounds.Equals(expected))throw new RangeError('Invalid native region bounds or terminal sentinel.');return out;
    }
    /** Legacy versioned browser format, retained for reading previous releases. */
    SerializePortable(){this.ThrowIfDisposed();const count=this._bands.reduce((n,b)=>n+3+b.spans.length,0),buffer=new ArrayBuffer(16+count*4),view=new DataView(buffer);view.setUint32(0,0x47524b53,true);view.setUint32(4,1,true);view.setUint32(8,this._bands.length,true);view.setUint32(12,count,true);let at=16;for(const b of this._bands){for(const n of [b.top,b.bottom,b.spans.length,...b.spans]){view.setInt32(at,n,true);at+=4;}}const bytes=new Uint8Array(buffer);return api.SKData?.CreateCopy?api.SKData.CreateCopy(bytes):bytes;}
    static DeserializePortable(data){const bytes=data.ToArray?.()??data;if(!(bytes instanceof Uint8Array))throw new TypeError('Expected byte data.');if(bytes.length<16)throw new RangeError('Truncated region data.');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(v.getUint32(0,true)!==0x47524b53||v.getUint32(4,true)!==1)throw new RangeError('Unsupported SKRG region format.');const count=v.getUint32(8,true),words=v.getUint32(12,true);if(16+words*4!==bytes.length||count>words/5)throw new RangeError('Invalid region data length.');const out=new SKRegion();let at=16,previous=null;for(let i=0;i<count;i++){if(at+12>bytes.length)throw new RangeError('Truncated region band.');const top=v.getInt32(at,true),bottom=v.getInt32(at+4,true),n=v.getInt32(at+8,true);at+=12;if(n<2||n%2||at+n*4>bytes.length||top>=bottom||previous&&top<previous.bottom)throw new RangeError('Invalid region band.');const spans=[];for(let j=0;j<n;j++){const x=v.getInt32(at,true);at+=4;if(j&&x<=spans.at(-1))throw new RangeError('Noncanonical region spans.');spans.push(x);}if(previous&&top===previous.bottom&&equal(spans,previous.spans))throw new RangeError('Noncanonical adjacent bands.');out._bands.push(previous={top,bottom,spans});}if(at!==bytes.length)throw new RangeError('Trailing region data.');return out;}
    Dispose(){this._bands=[];super.Dispose();}
  }
  class RectIterator extends SKObject {
    constructor(region=null){super();this._rects=region?[...region]:[];this._index=0;}
    get Done(){this.ThrowIfDisposed();return this._index>=this._rects.length;}
    get Rect(){this.ThrowIfDisposed();const r=this._rects[this._index];return r?new SKRectI(...r.ToArray()):new SKRectI();}
    Next(out){this.ThrowIfDisposed();const r=this._rects[this._index++];if(out){Object.assign(out,r??new SKRectI());return !!r;}return r?new SKRectI(...r.ToArray()):null;}
    Rewind(){this.ThrowIfDisposed();this._index=0;return this._rects.length>0;}
    Reset(region){this.ThrowIfDisposed();this._rects=[...region];this._index=0;return this;}
    *[Symbol.iterator](){let r;while((r=this.Next()))yield r;}
    Dispose(){this._rects=[];super.Dispose();}
  }
  class ClipIterator extends RectIterator {constructor(region,clip){const r=region.Clone();try{r.Op(clip,1);super(r);}finally{r.Dispose();}}}
  class SpanIterator extends SKObject {
    constructor(region,y,left,right){super();integer(y);integer(left);integer(right);region.ThrowIfDisposed();const band=region._bands.find(b=>b.top<=y&&b.bottom>y);this._spans=right>left?intervals(band?.spans??[],[left,right],1):[];this._index=0;}
    Next(leftOut,rightOut){this.ThrowIfDisposed();if(this._index>=this._spans.length)return leftOut||rightOut?false:null;const Left=this._spans[this._index++],Right=this._spans[this._index++];if(leftOut||rightOut){if(leftOut){if(Array.isArray(leftOut))leftOut[0]=Left;else {leftOut.Value=Left;leftOut.Left=Left;leftOut.Right=Right;}}if(rightOut){if(Array.isArray(rightOut))rightOut[0]=Right;else rightOut.Value=Right;}return true;}return {Left,Right};}
    *[Symbol.iterator](){let r;while((r=this.Next()))yield r;}
    Dispose(){this._spans=[];super.Dispose();}
  }
  Object.assign(SKRegion,{RectIterator,ClipIterator,SpanIterator,Iterator:RectIterator,Cliperator:ClipIterator});
  return {SKRegion,SKRegionOperation};
}
