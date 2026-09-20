/** Corrected 4.x path-measure overload dispatch; numeric work stays in Skia. */
export function installPathMeasureCompletion(K,api){
  const P=api.SKPathMeasure.prototype;
  const oldQuery=P.GetPositionAndTangent;
  P.GetPositionAndTangent=function(distance,position,tangent){
    if(distance===Infinity)distance=this.Length;else if(distance===-Infinity)distance=0;
    return oldQuery.call(this,distance,position,tangent);
  };
  P.GetPosition=function(distance,out){if(out)return this.GetPositionAndTangent(distance,out,null);return this.GetPositionAndTangent(distance)?.Position??new api.SKPoint();};
  P.GetTangent=function(distance,out){if(out)return this.GetPositionAndTangent(distance,null,out);return this.GetPositionAndTangent(distance)?.Tangent??new api.SKPoint();};
  const matrix=P.GetMatrix;
  P.GetMatrix=function(...args){return matrix.apply(this,args)??new api.SKMatrix(new Array(9).fill(0));};
  P.GetSegment=function(start,stop,destination,startWithMoveTo=true){
    this.ThrowIfDisposed();
    const hasDestination=arguments.length>=3&&typeof destination!=='boolean';
    if(hasDestination&&destination==null)throw new TypeError('A path destination is required.');
    if(typeof destination==='boolean'){startWithMoveTo=destination;destination=null;}
    if(destination&&!(destination instanceof api.SKPath))throw new TypeError('Destination must be SKPath or SKPathBuilder.');
    destination?.ThrowIfDisposed();
    if(typeof start!=='number'||typeof stop!=='number')throw new TypeError('Segment distances must be numbers.');
    const from=Math.max(start,0),to=Math.min(stop,this.Length);
    if(!this._contour||!(to>from))return destination?false:null;
    const append=destination instanceof api.SKPathBuilder;
    const native=this._contour.getSegment(from,to,append?true:!!startWithMoveTo);
    if(!native)return destination?false:null;
    const result=api.SKPath._fromNative(native);
    if(!destination)return result;
    try{
      if(!append)destination._replace(result._native.copy(),result._fill);
      else if(startWithMoveTo)destination.AddPath(result);
      else{
        const commands=result._native.toCmds(),lengths=[2,2,4,5,6,0],methods=['MoveTo','LineTo','QuadTo','ConicTo','CubicTo','Close'];
        for(let i=0;i<commands.length;){const verb=commands[i++],n=lengths[verb];if(n===undefined)throw new Error('Invalid path verb.');const values=commands.slice(i,i+n);i+=n;if(i!==3||verb!==0)destination[methods[verb]](...values);}
      }
      return true;
    }finally{result.Dispose();}
  };
}
