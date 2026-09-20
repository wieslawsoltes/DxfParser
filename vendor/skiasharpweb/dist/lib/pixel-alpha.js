/** Raw alpha inspection matching the pinned .NET/SkPixmap contract.
 * Loops read storage directly and allocate no per-pixel color objects.
 * ARGB4444 uses the low alpha nibble. XR's unsigned underflow matches native
 * getAlphaf even for noncanonical component codes below the alpha range. */
export function installPixelAlpha(K, api) {
  const nativeValue=v=>v?.value??v;
  const noAlpha=new Set([2,5,9,10,11,14,17,19,21,22,24,25,28]);
  function half(bits) {
    const e=(bits>>>10)&31,f=bits&1023,sign=bits&32768?-1:1;
    return sign*(e===31?(f?NaN:Infinity):e?2**(e-15)*(1+f/1024):f*2**-24);
  }
  function access(p) {
    p.ThrowIfDisposed();
    const bytes=p.GetPixels(),type=nativeValue(p.ColorType),bpp=p.BytesPerPixel;
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let raw,opaque;
    if(noAlpha.has(type)){raw=()=>1;opaque=()=>true;}
    else switch(type) {
      case 0:raw=()=>0;opaque=()=>false;break;
      case 1:raw=o=>Math.fround(bytes[o]*Math.fround(1/255));opaque=o=>bytes[o]===255;break;
      case 3:raw=o=>Math.fround((view.getUint16(o,true)&15)*Math.fround(1/15));opaque=o=>(view.getUint16(o,true)&15)===15;break;
      case 4:case 6:case 27:raw=o=>Math.fround(bytes[o+3]*Math.fround(1/255));opaque=o=>bytes[o+3]===255;break;
      case 7:case 8:raw=o=>Math.fround((view.getUint32(o,true)>>>30)*Math.fround(1/3));opaque=o=>(view.getUint32(o,true)>>>30)===3;break;
      case 12:raw=o=>Math.fround(Number(BigInt.asUintN(64,BigInt(view.getUint16(o+6,true)>>>6)-384n))/510);opaque=o=>(view.getUint16(o+6,true)>>>6)>=894;break;
      case 13:raw=o=>Math.fround((view.getUint16(o+6,true)>>>6)*Math.fround(1/1023));opaque=o=>(view.getUint16(o+6,true)&0xffc0)===0xffc0;break;
      case 15:case 16:raw=o=>half(view.getUint16(o+6,true));opaque=o=>view.getUint16(o+6,true)>=0x3c00;break;
      case 18:raw=o=>view.getFloat32(o+12,true);opaque=o=>!(view.getFloat32(o+12,true)<1);break;
      case 20:raw=o=>half(view.getUint16(o,true));opaque=o=>view.getUint16(o,true)>=0x3c00;break;
      case 23:raw=o=>Math.fround(view.getUint16(o,true)*Math.fround(1/65535));opaque=o=>view.getUint16(o,true)===65535;break;
      case 26:raw=o=>Math.fround(view.getUint16(o+6,true)*Math.fround(1/65535));opaque=o=>view.getUint16(o+6,true)===65535;break;
      default:throw new RangeError('Unknown pixel color type: '+type);
    }
    return {bytes,type,bpp,raw,opaque};
  }
  const colorF=api.SKPixmap.prototype.GetPixelColorF;
  api.SKPixmap.prototype.GetPixelColorF=function(x,y){
    const c=colorF.call(this,x,y);
    return nativeValue(this.AlphaType)===nativeValue(K.AlphaType.Opaque)?new api.SKColorF(c.Red,c.Green,c.Blue,this.GetPixelAlpha(x,y)):c;
  };
  api.SKPixmap.prototype.GetPixelAlpha=function(x,y) {
    const a=access(this);
    if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=this.Width||y>=this.Height)throw new RangeError('Pixel is outside image bounds.');
    return a.raw(y*this.RowBytes+x*a.bpp);
  };
  api.SKPixmap.prototype.ComputeIsOpaque=function() {
    const a=access(this),width=this.Width,height=this.Height,stride=this.RowBytes;
    if(a.type===0)return false;
    if(noAlpha.has(a.type))return true;
    if(a.type===4||a.type===6||a.type===27) {
      const data=a.bytes;
      for(let y=0;y<height;y++)for(let p=y*stride+3,end=y*stride+width*4;p<end;p+=4)if(data[p]!==255)return false;
      return true;
    }
    for(let y=0;y<height;y++)for(let p=y*stride,end=p+width*a.bpp;p<end;p+=a.bpp)if(!a.opaque(p))return false;
    return true;
  };
}
