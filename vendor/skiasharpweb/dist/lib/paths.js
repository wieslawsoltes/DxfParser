/** Mutable, PascalCase path API over CanvasKit's immutable native SkPath. */
export function createPaths(K, core = {}) {
  const Point = core.SKPoint || class SKPoint { constructor(X = 0, Y = 0) { this.X = X; this.Y = Y; } ToArray() { return [this.X, this.Y]; } };
  const Rect = core.SKRect || class SKRect { constructor(Left=0,Top=0,Right=0,Bottom=0) { Object.assign(this,{Left,Top,Right,Bottom}); } ToArray() { return [this.Left,this.Top,this.Right,this.Bottom]; } };
  const Matrix = core.SKMatrix || class SKMatrix { constructor(values) { this.Values=values; } };
  const val = v => v && typeof v === 'object' && 'value' in v ? v.value : v;
  const xy = (p,y) => typeof p === 'number' ? [p,y] : Array.isArray(p) || ArrayBuffer.isView(p) ? [p[0],p[1]] : [p.X ?? p.x,p.Y ?? p.y];
  const rect = r => r.ToArray ? r.ToArray() : Array.isArray(r) || ArrayBuffer.isView(r) ? r : [r.Left,r.Top,r.Right,r.Bottom];
  const matrix = m => m.Values ?? m.ToArray?.() ?? m;
  const point = p => new Point(p[0],p[1]);
  const copyPoint = (target,p) => { if (Array.isArray(target) || ArrayBuffer.isView(target)) { target[0]=p[0];target[1]=p[1]; } else { target.X=p[0];target.Y=p[1]; } };
  const ccw = d => d === 'CounterClockwise' || d === 'CCW' || val(d) === 1 || d === true;
  const getEnum = (table,v,defaultName,aliases={}) => {
    if (v === undefined || v === null) return table[defaultName];
    if (typeof v === 'string') { const e=table[aliases[v] || v]; if (!e) throw new RangeError(`Unknown enum value: ${v}`);return e; }
    const n=val(v); const e=table.values?.[n] || Object.values(table).find(x=>x && typeof x==='object' && val(x)===n);
    if (!e) throw new RangeError(`Unknown enum value: ${n}`);return e;
  };
  const fillNumber = f => typeof f === 'string' ? ({Winding:0,EvenOdd:1,InverseWinding:2,InverseEvenOdd:3})[f] : val(f);
  // Skia implements inverse fills; CanvasKit omits their named JS enum exports.
  // Register their values so native getFillType can round-trip these supported values.
  if(K.FillType.values && Object.isExtensible(K.FillType.values)) for(const n of [2,3]) K.FillType.values[n] ??= Object.freeze({value:n});
  const fillNative = n => { if (![0,1,2,3].includes(n)) throw new RangeError('FillType must be Winding, EvenOdd, InverseWinding, or InverseEvenOdd.');return K.FillType.values?.[n] || (n===0 ? K.FillType.Winding : n===1 ? K.FillType.EvenOdd : Object.freeze({value:n})); };
  const fillPublic = n => core.SKPathFillType?.[['Winding','EvenOdd','InverseWinding','InverseEvenOdd'][n]] ?? fillNative(n);
  const verbLengths = [2,2,4,5,6,0];
  const Verb = Object.freeze({Move:0,Line:1,Quad:2,Conic:3,Cubic:4,Close:5,Done:6});
  let generation = 1;

  function parseCommands(native) {
    const cmds=native.toCmds(), out=[]; let current=[0,0],start=[0,0];
    for (let i=0;i<cmds.length;) {
      const verb=cmds[i++], count=verbLengths[verb];
      if (count === undefined) throw new Error(`Unknown native path verb ${verb}.`);
      const args=Array.from(cmds.slice(i,i+count));i+=count;
      if(verb===0) { current=args.slice();start=args.slice();out.push({verb,args,points:[current.slice()]}); }
      else if(verb===5) { out.push({verb,args,points:[current.slice(),start.slice()]});current=start.slice(); }
      else { const pts=[current.slice()];for(let j=0;j<count-(verb===3?1:0);j+=2) pts.push([args[j],args[j+1]]);current=pts[pts.length-1].slice();out.push({verb,args,points:pts,weight:verb===3?args[4]:1}); }
    }
    return out;
  }
  function contours(records) {
    const list=[];let contour;
    for (const record of records) {
      if(record.verb===0) { if(contour) list.push(contour);contour={start:record.points[0],segments:[],closed:false}; }
      else if(contour && record.verb===5) contour.closed=true;
      else if(contour) contour.segments.push(record);
    }
    if(contour) list.push(contour);return list;
  }
  function applyRecord(b,r) {
    const methods=['moveTo','lineTo','quadTo','conicTo','cubicTo','close'];b[methods[r.verb]](...r.args);
  }

  class SKPath {
    constructor(source = null) {
      this.IsDisposed=false;this._builder=null;this._path=null;this._fill=0;this._generation=generation++;
      if(source) { const p=source._native || source;this._path=p.copy();this._fill=source instanceof SKPath ? source._fill : val(p.getFillType()) ?? 0; }
      else this._builder=new K.PathBuilder();
    }
    static _fromNative(native, fill) {
      if(!native) return null;
      const result=Object.create(SKPath.prototype);result.IsDisposed=false;result._builder=null;result._path=native;result._fill=fill ?? val(native.getFillType()) ?? 0;result._generation=generation++;return result;
    }
    static FromNative(native) { return native ? new SKPath(native) : null; }
    ThrowIfDisposed() { if(this.IsDisposed) throw new Error('SKPath has been disposed.'); }
    get _native() { this.ThrowIfDisposed();if(!this._path) this._path=this._builder.snapshot();return this._path; }
    _edit() {
      this.ThrowIfDisposed();if(!this._builder) this._builder=new K.PathBuilder(this._path);
      if(this._path) { this._path.delete();this._path=null; }this._generation=generation++;return this._builder;
    }
    _replace(native,fill) {
      this.ThrowIfDisposed();if(!native) return false;
      this._builder?.delete();this._path?.delete();this._builder=null;this._path=native;this._fill=fill ?? val(native.getFillType()) ?? this._fill;this._generation=generation++;return true;
    }
    [Symbol.dispose]() { this.Dispose(); }
    Dispose() { if(!this.IsDisposed) { this._builder?.delete();this._path?.delete();this._builder=null;this._path=null;this.IsDisposed=true; } }
    Close() { this._edit().close();return this; }
    Reset() { this.ThrowIfDisposed();this._builder?.delete();this._path?.delete();this._builder=new K.PathBuilder();this._path=null;this._fill=0;this._generation=generation++;return this; }
    Rewind() { return this.Reset(); }
    Clone() { return new SKPath(this); }
    Equals(other) { return !!other && this._native.equals(other._native || other); }
    get IsEmpty() { return this._native.isEmpty(); }
    get PointCount() { return this._native.countPoints(); }
    get VerbCount() { return parseCommands(this._native).length; }
    get Points() { return this.GetPoints(); }
    get Bounds() { return new Rect(...this._native.getBounds()); }
    get TightBounds() { return new Rect(...this._native.computeTightBounds()); }
    get LastPoint() { return this.PointCount ? this.GetPoint(this.PointCount-1) : new Point(0,0); }
    set LastPoint(value) { this.SetLastPoint(value); }
    get IsFinite() { return this.GetPoints().every(p=>Number.isFinite(p.X)&&Number.isFinite(p.Y)); }
    get IsLastContourClosed() { const records=parseCommands(this._native);return records.length>0 && records[records.length-1].verb===5; }
    get IsInverseFillType() { return this._fill>=2; }
    get GenerationId() { this.ThrowIfDisposed();return this._generation; }
    get FillType() { this.ThrowIfDisposed();return fillPublic(this._fill); }
    set FillType(value) { const n=fillNumber(value);const native=fillNative(n);this._edit().setFillType(native);this._fill=n; }
    get IsLine() { const r=parseCommands(this._native);return r.length===2&&r[0].verb===0&&r[1].verb===1; }
    get IsRect() { return this._rectInfo()!==null; }
    get IsOval() { return this._ovalInfo()!==null; }
    get IsRoundRect() { return this._roundRectInfo()!==null; }
    _rectInfo() {
      const c=contours(parseCommands(this._native));if(c.length!==1||c[0].segments.some(r=>r.verb!==1))return null;
      const pts=[c[0].start,...c[0].segments.map(r=>r.points.at(-1))];
      if(pts.length>1&&pts[0][0]===pts.at(-1)[0]&&pts[0][1]===pts.at(-1)[1])pts.pop();
      if(pts.length!==4)return null;
      const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),l=Math.min(...xs),t=Math.min(...ys),r=Math.max(...xs),b=Math.max(...ys);
      if(l===r||t===b)return null;
      let area=0;for(let i=0;i<4;i++){const p=pts[i],q=pts[(i+1)%4];if((p[0]!==l&&p[0]!==r)||(p[1]!==t&&p[1]!==b)||(p[0]!==q[0]&&p[1]!==q[1])||(p[0]===q[0]&&p[1]===q[1]))return null;area+=p[0]*q[1]-q[0]*p[1];}
      return {Rect:new Rect(l,t,r,b),IsClosed:c[0].closed,Direction:area>0?0:1};
    }
    _ovalInfo() {
      const c=contours(parseCommands(this._native));if(c.length!==1||!c[0].closed||c[0].segments.length!==4||c[0].segments.some(r=>r.verb!==3||r.weight!==Math.fround(Math.SQRT1_2)))return null;
      const bounds=this.Bounds,[l,t,r,b]=rect(bounds),cx=Math.fround((l+r)/2),cy=Math.fround((t+b)/2);
      const extrema=[[cx,t],[r,cy],[cx,b],[l,cy]],corners=[[l,t],[r,t],[r,b],[l,b]],used=new Set();
      for(const segment of c[0].segments){const [start,control,end]=segment.points,index=extrema.findIndex(p=>p[0]===start[0]&&p[1]===start[1]);if(index<0||used.has(index)||!extrema.some(p=>p[0]===end[0]&&p[1]===end[1])||!corners.some(p=>p[0]===control[0]&&p[1]===control[1])||(start[0]===cx)===(end[0]===cx)||control[0]!==((start[0]===cx)?end[0]:start[0])||control[1]!==((start[1]===cy)?end[1]:start[1]))return null;used.add(index);}
      return bounds;
    }
    _roundRectInfo() {
      const list=contours(parseCommands(this._native));if(list.length!==1||!list[0].closed)return null;
      const c=list[0],bounds=this.Bounds,[l,t,r,b]=rect(bounds),corners=[[l,t],[r,t],[r,b],[l,b]],radii=Array.from({length:4},()=>new Point()),seen=new Set();
      for(const segment of c.segments){
        if(segment.verb===1){const [p,q]=segment.points;if(!((p[0]===q[0]&&(p[0]===l||p[0]===r))||(p[1]===q[1]&&(p[1]===t||p[1]===b))))return null;}
        else if(segment.verb===3&&segment.weight===Math.fround(Math.SQRT1_2)){
          const [p,control,q]=segment.points,index=corners.findIndex(p=>p[0]===control[0]&&p[1]===control[1]);
          if(index<0||seen.has(index)||!((p[0]===control[0]&&q[1]===control[1])||(p[1]===control[1]&&q[0]===control[0])))return null;
          seen.add(index);radii[index]=new Point(Math.abs(p[0]-control[0])+Math.abs(q[0]-control[0]),Math.abs(p[1]-control[1])+Math.abs(q[1]-control[1]));
        }else return null;
      }
      if(!seen.size)return null;return {Bounds:bounds,Radii:radii};
    }
    GetLine() { return this.IsLine?this.GetPoints(2):null; }
    GetRect(details) { const info=this._rectInfo();if(details)Object.assign(details,info?{IsClosed:info.IsClosed,Direction:info.Direction}:{IsClosed:false,Direction:0});return info?.Rect??new Rect(); }
    GetOvalBounds() { return this._ovalInfo()??new Rect(); }
    GetRoundRect() { const info=this._roundRectInfo();if(!info)return null;if(!core.SKRoundRect)throw new Error('SKRoundRect must be supplied in createPaths core.');return new core.SKRoundRect().SetRectRadii(info.Bounds,info.Radii); }
    get SegmentMasks() { return parseCommands(this._native).reduce((m,r)=>m|(r.verb===1?1:r.verb===2?2:r.verb===3?4:r.verb===4?8:0),0); }
    ToggleInverseFillType() { this.FillType=this._fill^2;return this; }
    GetPoint(index) { if(!Number.isInteger(index)||index<0||index>=this.PointCount) throw new RangeError('Path point index is outside the point array.');return point(this._native.getPoint(index)); }
    GetPoints(destination, max) {
      const n=this.PointCount;
      if(destination === undefined) return Array.from({length:n},(_,i)=>point(this._native.getPoint(i)));
      if(typeof destination === 'number') { if(!Number.isInteger(destination)||destination<0) throw new RangeError('Maximum point count must be a nonnegative integer.');return Array.from({length:destination},(_,i)=>i<n?point(this._native.getPoint(i)):new Point()); }
      const limit=Math.min(n,max ?? destination.length);
      for(let i=0;i<limit;i++) destination[i]=point(this._native.getPoint(i));return n;
    }
    SetLastPoint(x,y) {
      const p=xy(x,y), records=parseCommands(this._native);let r;
      for(let i=records.length-1;i>=0;i--) if(records[i].verb!==5) { r=records[i];break; }
      if(!r) return this.MoveTo(...p);
      const index=r.args.length-(r.verb===3?3:2);r.args[index]=p[0];r.args[index+1]=p[1];
      const next=K.Path.MakeFromCmds(records.flatMap(item=>[item.verb,...item.args]));next.setFillType(fillNative(this._fill));this._replace(next);return this;
    }
    Contains(x,y) { return this._native.contains(...xy(x,y)); }
    GetBounds(out) { const result=this.Bounds;if(out) { Object.assign(out,result);return !this.IsEmpty; }return result; }
    ComputeTightBounds() { return this.TightBounds; }
    GetTightBounds(out) { const result=this.TightBounds;if(out) { Object.assign(out,result);return this.IsFinite; }return result; }
    MoveTo(x,y) { this._edit().moveTo(...xy(x,y));return this; }
    LineTo(x,y) { this._edit().lineTo(...xy(x,y));return this; }
    QuadTo(...args) { if(args.length===2) args=args.flatMap(p=>xy(p));this._edit().quadTo(...args);return this; }
    ConicTo(...args) { if(args.length===3) args=[...xy(args[0]),...xy(args[1]),args[2]];this._edit().conicTo(...args);return this; }
    CubicTo(...args) { if(args.length===3) args=args.flatMap(p=>xy(p));this._edit().cubicTo(...args);return this; }
    RMoveTo(x,y) { this._edit().rMoveTo(...xy(x,y));return this; }
    RLineTo(x,y) { this._edit().rLineTo(...xy(x,y));return this; }
    RQuadTo(...args) { if(args.length===2) args=args.flatMap(p=>xy(p));this._edit().rQuadTo(...args);return this; }
    RConicTo(...args) { if(args.length===3) args=[...xy(args[0]),...xy(args[1]),args[2]];this._edit().rConicTo(...args);return this; }
    RCubicTo(...args) { if(args.length===3) args=args.flatMap(p=>xy(p));this._edit().rCubicTo(...args);return this; }
    ArcTo(...args) {
      const b=this._edit();
      if(args.length===4 && typeof args[0]!=='number') b.arcToOval(rect(args[0]),args[1],args[2],!!args[3]);
      else if(args.length===3 && typeof args[0]!=='number') b.arcToTangent(...xy(args[0]),...xy(args[1]),args[2]);
      else if(args.length===5 && typeof args[0]==='number') b.arcToTangent(...args);
      else if(args.length===7) b.arcToRotated(args[0],args[1],args[2],args[3]==='Small'||val(args[3])===0,ccw(args[4]),args[5],args[6]);
      else if(args.length===5 && typeof args[0]!=='number') b.arcToRotated(...xy(args[0]),args[1],args[2]==='Small'||val(args[2])===0,ccw(args[3]),...xy(args[4]));
      else throw new TypeError('ArcTo expects oval/start/sweep/forceMove, tangent points/radius, or rx/ry/rotation/arcSize/direction/x/y.');return this;
    }
    RArcTo(...args) { if(args.length===5) args=[...xy(args[0]),args[1],args[2],args[3],...xy(args[4])];const [rx,ry,rotation,size,direction,x,y]=args;this._edit().rArcTo(rx,ry,rotation,size==='Small'||val(size)===0,ccw(direction),x,y);return this; }
    AddArc(oval,startAngle,sweepAngle) { this._edit().addArc(rect(oval),startAngle,sweepAngle);return this; }
    AddCircle(x,y,radius,direction=0) { this._edit().addCircle(x,y,radius,ccw(direction));return this; }
    AddOval(oval,direction=0,startIndex=1) { this._edit().addOval(rect(oval),ccw(direction),startIndex);return this; }
    AddRect(bounds,direction=0,startIndex=0) {
      if(!Number.isInteger(startIndex)||startIndex<0||startIndex>3) throw new RangeError('Rectangle startIndex must be between 0 and 3.');
      const [l,t,r,b]=rect(bounds),corners=[[l,t],[r,t],[r,b],[l,b]],step=ccw(direction)?-1:1;
      const builder=this._edit();builder.moveTo(...corners[startIndex]);for(let i=1;i<4;i++)builder.lineTo(...corners[(startIndex+step*i+4)%4]);builder.close();return this;
    }
    AddRoundRect(bounds,rx,ry,direction=0) {
      let rr;const raw=bounds.ToArray?.() ?? bounds;
      if((Array.isArray(raw)||ArrayBuffer.isView(raw)) && raw.length===12) {
        rr=raw;direction=rx??0;
        if(ry!==undefined) throw new Error('Round-rectangle startIndex is not exposed by the CanvasKit backend.');
      } else if(Array.isArray(rx)||ArrayBuffer.isView(rx)) {
        const radii=Array.from(rx);rr=[...rect(bounds),...radii.flatMap(v=>typeof v==='number'?[v,v]:xy(v))];direction=ry??0;
        if(rr.length!==12) throw new RangeError('Rounded rectangles require four corner radii.');
      } else rr=K.RRectXY(rect(bounds),rx??0,ry??rx??0);
      this._edit().addRRect(rr,ccw(direction));return this;
    }
    AddRoundedRect(...args) { return this.AddRoundRect(...args); }
    AddPoly(points,close=true) { const flat=Array.from(points).flatMap(p=>typeof p==='number'?[p]:xy(p));this._edit().addPolygon(flat,!!close);return this; }
    AddPath(path,...args) {
      let native=path._native || path, temporary=null;
      if(path===this) { native=native.copy();temporary=native; }
      try {
        let m,extend=false;
        if(args.length && typeof args[0] === 'number' && typeof args[1] === 'number') { m=[1,0,args[0],0,1,args[1],0,0,1];extend=val(args[2])===1 || args[2]==='Extend'; }
        else if(args.length && typeof args[0]==='object') { m=matrix(args[0]);extend=val(args[1])===1 || args[1]==='Extend'; }
        else extend=val(args[0])===1 || args[0]==='Extend';
        const b=this._edit();if(m) b.addPath(native,m,extend);else b.addPath(native,extend);return this;
      } finally { temporary?.delete(); }
    }
    ReverseAddPath(path) {
      const list=contours(parseCommands(path._native || path));const b=this._edit();
      for(const c of list.reverse()) {
        const end=c.segments.length?c.segments[c.segments.length-1].points.at(-1):c.start;b.moveTo(...end);
        for(const r of c.segments.reverse()) {
          const p=r.points;
          if(r.verb===1) b.lineTo(...p[0]);
          else if(r.verb===2) b.quadTo(...p[1],...p[0]);
          else if(r.verb===3) b.conicTo(...p[1],...p[0],r.weight);
          else if(r.verb===4) b.cubicTo(...p[2],...p[1],...p[0]);
        }
        if(c.closed) b.close();
      }return this;
    }
    AddPathReverse(path) { return this.ReverseAddPath(path); }
    Offset(x,y,destination) {
      if(typeof x!=='number') { destination=y;[x,y]=xy(x); }
      if(destination && destination!==this) { const b=new K.PathBuilder(this._native);try { b.offset(x,y);destination._replace(b.detach(),this._fill); }finally { b.delete(); }return destination; }
      this._edit().offset(x,y);return this;
    }
    Transform(transform,destination) {
      if(destination && destination!==this) { const b=new K.PathBuilder(this._native);try { b.transform(matrix(transform));destination._replace(b.detach(),this._fill); }finally { b.delete(); }return destination; }
      this._edit().transform(matrix(transform));return this;
    }
    Op(other,operation,result) {
      const native=K.Path.MakeFromOp(this._native,other._native || other,getEnum(K.PathOp,operation,'Union',{Xor:'XOR'}));
      if(result) return result._replace(native);return SKPath._fromNative(native);
    }
    Simplify(result) {
      const native=this._native.makeSimplified ? this._native.makeSimplified() : this._native._makeSimplified();
      if(result) return result._replace(native);return SKPath._fromNative(native);
    }
    ToWinding(result) { const native=this._native.makeAsWinding();if(result) return result._replace(native,0);return SKPath._fromNative(native,0); }
    Trim(start,stop,isComplement=false) { return SKPath._fromNative(this._native.makeTrimmed(start,stop,isComplement),this._fill); }
    Dash(on,off,phase=0) { return SKPath._fromNative(this._native.makeDashed(on,off,phase),this._fill); }
    Stroke(options={}) {
      const opts={width:options.Width ?? options.width ?? 1,miter_limit:options.MiterLimit ?? options.miter_limit ?? 4,precision:options.Precision ?? options.precision ?? 1,join:getEnum(K.StrokeJoin,options.Join ?? options.join,'Miter'),cap:getEnum(K.StrokeCap,options.Cap ?? options.cap,'Butt')};
      return SKPath._fromNative(this._native.makeStroked(opts));
    }
    IsInterpolatable(ending) { return K.Path.CanInterpolate(this._native,ending._native || ending); }
    Interpolate(ending,weight,result) {
      const native=K.Path.MakeFromPathInterpolation(this._native,ending._native || ending,weight);
      if(result) return result._replace(native,this._fill);return SKPath._fromNative(native,this._fill);
    }
    GetContours() {
      return contours(parseCommands(this._native)).map(c=>{const p=new SKPath();p.FillType=this.FillType;p.MoveTo(...c.start);for(const r of c.segments) applyRecord(p._edit(),r);if(c.closed)p.Close();return p;});
    }
    ToSvgPathData() { return this._native.toSVGString(); }
    ToCommands() { return this._native.toCmds(); }
    CreateIterator(forceClose=false) { return new SKPathIterator(this,forceClose); }
    CreateRawIterator() { return new SKPathRawIterator(this); }
    [Symbol.iterator]() { const iter=this.CreateRawIterator();return {next(){const item=iter.Next();if(item.Verb===Verb.Done){iter.Dispose();return {done:true};}return {done:false,value:item};},return(){iter.Dispose();return {done:true};}}; }
    static ParseSvgPathData(svg) { return SKPath._fromNative(K.Path.MakeFromSVGString(svg)); }
    static FromCommands(commands) { return SKPath._fromNative(K.Path.MakeFromCmds(commands)); }
    static FromVerbsPointsWeights(verbs,points,weights=[]) { const flat=Array.from(points).flatMap(p=>typeof p==='number'?[p]:xy(p));return SKPath._fromNative(K.Path.MakeFromVerbsPointsWeights(verbs,flat,weights)); }
    static ConvertConicToQuads(p0,p1,p2,weight,destinationOrPower,power) {
      const destination=typeof destinationOrPower==='number'?null:destinationOrPower;
      power=destination?power:destinationOrPower;
      if(!Number.isInteger(power)||power<0||power>16) throw new RangeError('Conic subdivision power must be an integer from 0 through 16.');
      if(!Number.isFinite(weight)||weight<0) throw new RangeError('Conic weight must be finite and nonnegative.');
      const out=[xy(p0)];
      function subdivide(a,b,c,w,level) {
        if(level===0) { out.push(b,c);return; }
        const inv=1/(1+w),left=[(a[0]+w*b[0])*inv,(a[1]+w*b[1])*inv],right=[(c[0]+w*b[0])*inv,(c[1]+w*b[1])*inv];
        const mid=[(left[0]+right[0])/2,(left[1]+right[1])/2],childWeight=Math.sqrt((1+w)/2);
        subdivide(a,left,mid,childWeight,level-1);subdivide(mid,right,c,childWeight,level-1);
      }
      subdivide(xy(p0),xy(p1),xy(p2),weight,power);
      const points=out.map(point);if(destination) { for(let i=0;i<points.length;i++)destination[i]=points[i];return 2**power; }return points;
    }
    static Op(one,two,operation,result) { return one.Op(two,operation,result); }
    static Simplify(path,result) { return path.Simplify(result); }
  }

  class SKPathBuilder extends SKPath {
    Snapshot() { return this.Clone(); }
    Detach() { const path=this.Clone();this.Reset();return path; }
    DetachAndDispose() { const path=this.Clone();this.Dispose();return path; }
    SetFillType(type) { this.FillType=type;return this; }
  }

  class SKPathRawIterator {
    constructor(path=null) { this.IsDisposed=false;this._records=[];this._index=0;this._weight=1;if(path) this.SetPath(path); }
    ThrowIfDisposed() { if(this.IsDisposed) throw new Error('Path iterator has been disposed.'); }
    SetPath(path) { this.ThrowIfDisposed();this._records=parseCommands(path._native || path);this._index=0;return this; }
    ConicWeight() { this.ThrowIfDisposed();return this._weight; }
    Peek() { this.ThrowIfDisposed();return this._records[this._index]?.verb ?? Verb.Done; }
    Next(points) {
      this.ThrowIfDisposed();const r=this._records[this._index++];this._weight=r?.weight??1;
      if(points) { if(r) for(let i=0;i<r.points.length;i++) points[i]=point(r.points[i]);return r?.verb??Verb.Done; }
      return {Verb:r?.verb??Verb.Done,Points:r?r.points.map(point):[],ConicWeight:this._weight,IsCloseLine:!!r?.closeLine};
    }
    Rewind() { this.ThrowIfDisposed();this._index=0;return this; }
    [Symbol.dispose]() { this.Dispose(); }
    Dispose() { this._records=[];this.IsDisposed=true; }
  }
  class SKPathIterator extends SKPathRawIterator {
    constructor(path=null,forceClose=false) { super();this._forceClose=forceClose;this._closed=false;this._closeLine=false;if(path) this.SetPath(path,forceClose); }
    SetPath(path,forceClose=this._forceClose) {
      this.ThrowIfDisposed();this._forceClose=forceClose;this._records=[];this._index=0;
      for(const c of contours(parseCommands(path._native || path))) {
        this._records.push({verb:0,args:c.start,points:[c.start],contourClosed:c.closed||forceClose});
        this._records.push(...c.segments.map(r=>({...r,contourClosed:c.closed||forceClose})));
        if(c.closed||forceClose) {
          const end=c.segments.at(-1)?.points.at(-1) || c.start;
          if(end[0]!==c.start[0]||end[1]!==c.start[1]) this._records.push({verb:1,args:c.start,points:[end,c.start],closeLine:true,contourClosed:true});
          this._records.push({verb:5,args:[],points:[c.start,c.start],contourClosed:true});
        }
      }return this;
    }
    Next(points) { const r=this._records[this._index];const result=super.Next(points);this._closeLine=!!r?.closeLine;this._closed=!!r?.contourClosed;return result; }
    IsCloseLine() { this.ThrowIfDisposed();return this._closeLine; }
    IsCloseContour() { this.ThrowIfDisposed();return this._closed; }
    get IsClosedContour() { return this.IsCloseContour(); }
  }

  class SKPathMeasure {
    constructor(path=null,forceClosed=false,resScale=1) { this.IsDisposed=false;this._iter=null;this._contour=null;this._resScale=resScale;if(path) this.SetPath(path,forceClosed); }
    ThrowIfDisposed() { if(this.IsDisposed) throw new Error('SKPathMeasure has been disposed.'); }
    SetPath(path,forceClosed=false) {
      this.ThrowIfDisposed();this._contour?.delete();this._iter?.delete();this._contour=null;this._iter=null;
      if(path) { this._iter=new K.ContourMeasureIter(path._native || path,!!forceClosed,this._resScale);this._contour=this._iter.next(); }return this;
    }
    get Length() { this.ThrowIfDisposed();return this._contour?.length() ?? 0; }
    get IsClosed() { this.ThrowIfDisposed();return this._contour?.isClosed() ?? false; }
    NextContour() { this.ThrowIfDisposed();this._contour?.delete();this._contour=this._iter?.next() ?? null;return !!this._contour; }
    GetPositionAndTangent(distance,position,tangent) {
      this.ThrowIfDisposed();if(!this._contour || this.Length===0 || !Number.isFinite(distance)) return position||tangent?false:null;
      const p=this._contour.getPosTan(distance);if(position) copyPoint(position,p);if(tangent) copyPoint(tangent,p.slice(2));
      if(position||tangent) return true;return {Position:point(p),Tangent:point(p.slice(2))};
    }
    GetPosition(distance,out) { if(out) return this.GetPositionAndTangent(distance,out,null);return this.GetPositionAndTangent(distance)?.Position ?? null; }
    GetTangent(distance,out) { if(out) return this.GetPositionAndTangent(distance,null,out);return this.GetPositionAndTangent(distance)?.Tangent ?? null; }
    GetMatrix(distance,flags=3,out) {
      if(typeof flags==='object' && !('value' in flags)) { const target=flags;flags=out??3;out=target; }
      const p=this.GetPositionAndTangent(distance);if(!p) return out?false:null;
      const f=val(flags),rotate=(f&2)!==0,translate=(f&1)!==0,x=rotate?p.Tangent.X:1,y=rotate?p.Tangent.Y:0;
      const values=[x,-y,translate?p.Position.X:0,y,x,translate?p.Position.Y:0,0,0,1];
      if(out) { out.Values=values;return true; }return new Matrix(values);
    }
    GetSegment(start,stop,destination,startWithMoveTo=true) {
      this.ThrowIfDisposed();if(typeof destination==='boolean') { startWithMoveTo=destination;destination=null; }
      if(!this._contour || !(Math.min(stop,this.Length)>Math.max(start,0))) return destination?false:null;
      const native=this._contour.getSegment(start,stop,destination?true:startWithMoveTo);if(!native) return destination?false:null;
      const result=SKPath._fromNative(native);
      if(destination) { try { if(startWithMoveTo)destination.AddPath(result);else { const records=parseCommands(result._native);for(let i=0;i<records.length;i++){if(i===0&&records[i].verb===0)continue;applyRecord(destination._edit(),records[i]);} }return true; }finally { result.Dispose(); } }return result;
    }
    [Symbol.dispose]() { this.Dispose(); }
    Dispose() { if(!this.IsDisposed) { this._contour?.delete();this._iter?.delete();this._contour=null;this._iter=null;this.IsDisposed=true; } }
  }

  class SKPathOpBuilder {
    constructor() { this.IsDisposed=false;this._operations=[]; }
    Add(path,operation) { if(this.IsDisposed) throw new Error('SKPathOpBuilder has been disposed.');this._operations.push({path:path.Clone(),operation});return this; }
    Resolve(destination) {
      if(this.IsDisposed) throw new Error('SKPathOpBuilder has been disposed.');let result=new SKPath();
      try {
        for(const item of this._operations) { const next=result.Op(item.path,item.operation);result.Dispose();result=next;if(!result) return destination?false:null; }
        if(destination) { destination._replace(result._native.copy(),result._fill);return true; }const value=result;result=null;return value;
      } finally { result?.Dispose();for(const item of this._operations)item.path.Dispose();this._operations=[]; }
    }
    [Symbol.dispose]() { this.Dispose(); }
    Dispose() { if(!this.IsDisposed) { for(const item of this._operations)item.path.Dispose();this._operations=[];this.IsDisposed=true; } }
  }
  SKPath.Iterator=SKPathIterator;SKPath.RawIterator=SKPathRawIterator;SKPath.OpBuilder=SKPathOpBuilder;
  return {SKPath,SKPathBuilder,SKPathMeasure,SKPathIterator,SKPathRawIterator,SKPathOpBuilder,SKPathVerb:core.SKPathVerb || Verb};
}
