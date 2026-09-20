/** Connect managed path effects to the public canvas overloads. */
export function installCanvasEffects(K,api){
  const P=api.SKCanvas.prototype,baseDrawPath=P.DrawPath;
  const isRect=v=>v?.Left!==undefined;
  const isPoint=v=>v?.X!==undefined;
  const effect=p=>p?._effects?.PathEffect?._software;
  const render=(canvas,path,paint)=>{const output=api.applyPathEffect(path,paint._effects.PathEffect,paint),plain=paint.Clone();try{plain.PathEffect=null;return baseDrawPath.call(canvas,output,plain);}finally{plain.Dispose();output.Dispose();}};
  P.DrawPath=function(path,paint){if(!effect(paint))return baseDrawPath.call(this,path,paint);this._complex();return render(this,path,paint);};
  function wrap(name,build){const previous=P[name];if(!previous)return;P[name]=function(...args){const paint=args.at(-1);if(!effect(paint))return previous.apply(this,args);this._complex();const path=new api.SKPath();try{build(path,args,paint);return render(this,path,paint);}finally{path.Dispose();}};}
  wrap('DrawRect',(p,a)=>p.AddRect(isRect(a[0])?a[0]:api.SKRect.Create(...a.slice(0,4))));
  wrap('DrawCircle',(p,a)=>isPoint(a[0])?p.AddCircle(a[0].X,a[0].Y,a[1]):p.AddCircle(...a.slice(0,3)));
  wrap('DrawLine',(p,a)=>{if(isPoint(a[0]))p.MoveTo(a[0]).LineTo(a[1]);else p.MoveTo(a[0],a[1]).LineTo(a[2],a[3]);});
  wrap('DrawOval',(p,a)=>{if(isRect(a[0]))p.AddOval(a[0]);else{const[x,y,rx,ry]=isPoint(a[0])?[a[0].X,a[0].Y,a[1].Width,a[1].Height]:a;p.AddOval(new api.SKRect(x-rx,y-ry,x+rx,y+ry));}});
  wrap('DrawRoundRect',(p,a)=>{if(a[0] instanceof api.SKRoundRect)p.AddRoundRect(a[0]);else if(isRect(a[0])){if(a[1]?.Width!==undefined)p.AddRoundRect(a[0],a[1].Width,a[1].Height);else p.AddRoundRect(a[0],a[1],a[2]);}else p.AddRoundRect(api.SKRect.Create(...a.slice(0,4)),a[4],a[5]);});
  wrap('DrawRoundRectDifference',(p,a)=>{p.AddRoundRect(a[0]);p.AddRoundRect(a[1]);p.FillType=K.FillType.EvenOdd;});
  wrap('DrawArc',(p,a)=>{const[r,start,sweep,center]=a;if(center){p.MoveTo(r.MidX,r.MidY);p.ArcTo(r,start,sweep,false);p.Close();}else p.AddArc(r,start,sweep);});
  wrap('DrawPoints',(p,a)=>{const[mode,values]=a,points=isPoint(values[0])?values:Array.from({length:values.length/2},(_,i)=>new api.SKPoint(values[i*2],values[i*2+1]));if((mode?.value??mode)===2)p.AddPoly(points,false);else for(let i=0;i<points.length;i+=(mode?.value??mode)===1?2:1){p.MoveTo(points[i]);p.LineTo(points[Math.min(points.length-1,i+((mode?.value??mode)===1?1:0))]);}});
  const text=P.DrawText;
  P.DrawText=function(value,...args){const paint=args.at(-1);if(!effect(paint))return text.call(this,value,...args);if(value instanceof api.SKTextBlob)throw new api.SKNotSupportedError('A native text blob does not expose glyph outlines; use DrawGlyphs with a software path effect.');if(isPoint(args[0]))args=[args[0].X,args[0].Y,...args.slice(1)];let[x,y,...rest]=args,own=false,font,align=K.TextAlign.Left;if(rest.length===1){font=paint.ToFont();own=true;align=paint.TextAlign;}else{font=rest.at(-2);if(rest.length>2)align=rest[0];}let path;try{if(align===K.TextAlign.Center)x-=font.MeasureText(value)/2;else if(align===K.TextAlign.Right)x-=font.MeasureText(value);path=font.GetTextPath(value,x,y);return this.DrawPath(path,paint);}finally{path?.Dispose();if(own)font.Dispose();}};
  wrap('DrawGlyphs',(p,a)=>{const[glyphs,positions,origin,font]=a;for(let i=0;i<glyphs.length;i++){const point=isPoint(positions[i])?positions[i]:{X:positions[i*2],Y:positions[i*2+1]},glyph=font.GetGlyphPath(glyphs[i]);try{if(glyph)p.AddPath(glyph,(origin?.X??0)+point.X,(origin?.Y??0)+point.Y);}finally{glyph?.Dispose();}}});
}
