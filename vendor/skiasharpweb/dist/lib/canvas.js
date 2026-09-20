export function createCanvasAPI(K, api, createWebGPUBackend) {
  const {SKObject,SKRect,SKMatrix,SKColors,SKPaint,SKPaintStyle,SKImage,SKData,SKFont,SKFontManager} = api;
  const n = value => value?._native ?? value;
  const arr = value => value?.ToArray?.() ?? value?.Values ?? value;
  const color = value => value?.ToFloatArray?.() ?? value;
  const rect = value => arr(value);
  const isRect = value => value && (value.Left !== undefined || Array.isArray(value) || value instanceof Float32Array);
  const identity = matrix => matrix.every((v,i)=>Math.abs(v-[1,0,0,0,1,0,0,0,1][i])<1e-6);

  class SKCanvas extends SKObject {
    constructor(target, owner = null) {
      super(target?._surface?.getCanvas?.() || target?.getCanvas?.() || target, false);
      this._owner = owner || (target?._surface ? target : null);
      this._commands=[]; this._eligible=false; this._clipDirty=false; this._clipStack=[];
    }
    _check() { this.ThrowIfDisposed(); this._owner?.ThrowIfDisposed?.(); if(this._invalid)throw new Error('The recording canvas is no longer valid.'); }
    _materialize(){
      if(!this._owner?._presenter||!this._commands.length||(this._rasterCursor??this._commands.length)>=this._commands.length)return;
      const paint=new K.Paint();paint.setAntiAlias(true);
      try{for(let i=this._rasterCursor??this._commands.length;i<this._commands.length;i++){const q=this._commands[i];paint.setColor(q.color);if(q.type==='rect'){const[x,y,w,h]=q.rect;this._native.drawRect([x,y,x+w,y+h],paint);}else if(q.type==='circle')this._native.drawCircle(q.cx,q.cy,q.r,paint);else if(q.type==='line'){paint.setStrokeWidth(q.width);this._native.drawLine(q.x1,q.y1,q.x2,q.y2,paint);}}this._rasterCursor=this._commands.length;}finally{paint.delete();}
    }
    _complex() { this._check(); this._materialize(); this._eligible=false; }
    _primitive(command, paint, stroke=false) {
      this._check();
      paint.ThrowIfDisposed();
      if (!this._owner?._presenter || !this._eligible) return false;
      // Clear establishes an identity transform; every public transform/clip
      // operation materializes and invalidates the primitive frame immediately.
      const effects=paint._effects;
      const supported = !this._clipDirty && !(effects&&(effects.Shader||effects.ColorFilter||effects.ImageFilter||effects.MaskFilter||effects.PathEffect||effects.Blender)) && paint.IsAntialias && paint.BlendMode === K.BlendMode.SrcOver && (stroke || paint.Style === K.PaintStyle.Fill);
      if (!supported) this._complex();
      if (this._eligible) {command.color=Array.from(paint._native.getColor());this._commands.push(command);}
      return this._eligible && !!this._owner?._presenter;
    }
    _paint(paint, fn) {
      this._check(); paint?.ThrowIfDisposed?.();
      if(paint?._effects?.ColorFilter?._software || paint?._effects?.ImageFilter?._software)return api.renderPaintEffects(this,paint,fn);
      return fn(n(paint));
    }
    Clear(value=SKColors.Transparent) {
      this._check();const full=!!this._owner?._presenter && identity(this._native.getTotalMatrix()) && !this._clipDirty && this.SaveCount===1;if(!full)this._materialize();this._native.clear(color(value));
      this._eligible=full;
      this._commands=this._eligible?[{type:'clear',color:Array.from(color(value))}]:[];
      this._rasterCursor=this._commands.length;
    }
    DrawColor(value,blendMode=K.BlendMode.SrcOver) { this._complex(); this._native.drawColor(color(value),blendMode); }
    DrawPaint(paint) { this._complex(); this._paint(paint,p=>this._native.drawPaint(p)); }
    DrawRect(...a) {
      let v,p; if(isRect(a[0])) {v=rect(a[0]);p=a[1];} else {v=[a[0],a[1],a[0]+a[2],a[1]+a[3]];p=a[4];}
      if(v[2]<=v[0]||v[3]<=v[1]){this._check();return;}if(this._eligible && this._primitive({type:'rect',rect:[v[0],v[1],v[2]-v[0],v[3]-v[1]]},p))return;
      this._paint(p,q=>this._native.drawRect(v,q));
    }
    DrawCircle(...a) {
      const [x,y,r,p]=a[0]?.X!==undefined?[a[0].X,a[0].Y,a[1],a[2]]:a;
      if(r<0){this._complex();return;}if(!this._eligible || !this._primitive({type:'circle',cx:x,cy:y,r},p))this._paint(p,q=>this._native.drawCircle(x,y,r,q));
    }
    DrawLine(...a) {
      const [x1,y1,x2,y2,p]=a[0]?.X!==undefined?[a[0].X,a[0].Y,a[1].X,a[1].Y,a[2]]:a;
      if(p.StrokeCap!==K.StrokeCap.Butt || p.StrokeWidth<=0)this._complex();
      if(!this._eligible || !this._primitive({type:'line',x1,y1,x2,y2,width:p.StrokeWidth},p,true))this._paint(p,q=>this._native.drawLine(x1,y1,x2,y2,q));
    }
    DrawPoint(...a) {const [x,y,p]=a[0]?.X!==undefined?[a[0].X,a[0].Y,a[1]]:a;this.DrawPoints(K.PointMode.Points,[x,y],p);}
    DrawPoints(mode, points, paint) {this._complex();const data=points[0]?.X!==undefined?points.flatMap(p=>[p.X,p.Y]):points;this._paint(paint,p=>this._native.drawPoints(mode,data,p));}
    DrawOval(...a) {this._complex();let r,p;if(isRect(a[0]))[r,p]=a;else{const [cx,cy,rx,ry,paint]=a[0]?.X!==undefined?[a[0].X,a[0].Y,a[1].Width,a[1].Height,a[2]]:a;r=new SKRect(cx-rx,cy-ry,cx+rx,cy+ry);p=paint;}this._paint(p,q=>this._native.drawOval(rect(r),q));}
    DrawRoundRect(...a) {
      this._complex(); let r,rx,ry,p;
      if(a[0] instanceof api.SKRoundRect){this._paint(a[1],q=>this._native.drawRRect(arr(a[0]),q));return;}
      if(isRect(a[0])) {if(a[1]?.Width!==undefined)[r,rx,ry,p]=[a[0],a[1].Width,a[1].Height,a[2]];else[r,rx,ry,p]=a;} else {r=SKRect.Create(...a.slice(0,4));[rx,ry,p]=a.slice(4);}
      this._paint(p,q=>this._native.drawRRect(K.RRectXY(rect(r),rx,ry),q));
    }
    DrawRoundRectDifference(outer,inner,paint){this._complex();this._paint(paint,p=>this._native.drawDRRect(arr(outer),arr(inner),p));}
    DrawArc(oval,start,sweep,useCenter,paint){this._complex();this._paint(paint,p=>this._native.drawArc(rect(oval),start,sweep,useCenter,p));}
    DrawPath(path,paint){this._complex();path.ThrowIfDisposed?.();this._paint(paint,p=>this._native.drawPath(n(path),p));}
    DrawImage(image,...a){
      this._complex();image.ThrowIfDisposed?.();
      if(a[0]?.X!==undefined)a=[a[0].X,a[0].Y,...a.slice(1)];
      const samplingIndex=a.findIndex(v=>v instanceof api.SKSamplingOptions);let sampling=null;if(samplingIndex>=0)[sampling]=a.splice(samplingIndex,1);
      if(isRect(a[0])){
        let src,dst,p;if(isRect(a[1]))[src,dst,p]=a;else{src=SKRect.Create(0,0,image.Width,image.Height);[dst,p]=a;}
        let own=!p;if(own)p=new SKPaint();try{this._paint(p,q=>{if(sampling?.UseCubic)this._native.drawImageRectCubic(n(image),rect(src),rect(dst),sampling.Cubic.B,sampling.Cubic.C,q);else if(sampling)this._native.drawImageRectOptions(n(image),rect(src),rect(dst),sampling.Filter,sampling.Mipmap,q);else this._native.drawImageRect(n(image),rect(src),rect(dst),q);});}finally{if(own)p.Dispose();}
      }else{const[x,y,p]=a;this._paint(p,q=>{if(sampling?.UseCubic)this._native.drawImageCubic(n(image),x,y,sampling.Cubic.B,sampling.Cubic.C,q||null);else if(sampling)this._native.drawImageOptions(n(image),x,y,sampling.Filter,sampling.Mipmap,q||null);else this._native.drawImage(n(image),x,y,q||null);});}
    }
    DrawBitmap(bitmap,...a){const img=SKImage.FromBitmap(bitmap);try{this.DrawImage(img,...a);}finally{img.Dispose();}}
    DrawImageNinePatch(image,center,destination,paint=null){this._complex();this._paint(paint,p=>this._native.drawImageNine(n(image),rect(center),rect(destination),K.FilterMode.Linear,p));}
    DrawImageLattice(){throw new Error('DrawImageLattice is not exposed by the bundled CanvasKit.');}
    DrawText(text,...args){
      this._complex();if(args[0]?.X!==undefined)args=[args[0].X,args[0].Y,...args.slice(1)];const[x,y,...rest]=args;
      if(text instanceof api.SKTextBlob)return this.DrawTextBlob(text,x,y,rest.at(-1));
      let font,paint,alignment=K.TextAlign.Left,own=false,left=x;
      if(rest.length===1){paint=rest[0];font=paint.ToFont();alignment=paint.TextAlign;own=true;}else if(rest.length===2){[font,paint]=rest;}else{[alignment,font,paint]=rest;}
      try {if(alignment===K.TextAlign.Center)left-=font.MeasureText(String(text))/2;else if(alignment===K.TextAlign.Right)left-=font.MeasureText(String(text));this._paint(paint,p=>this._native.drawText(String(text),left,y,p,n(font)));}finally{if(own)font.Dispose();}
    }
    DrawShapedText(text,x,y,font,paint,options={}){
      this._complex();const face=font.Typeface;const shaper=new api.SKShaper(face,options.fontManager||SKFontManager.Default);face?.Dispose();
      try{const result=shaper.Shape(String(text),font,{...options,Width:options.Width??options.width,Paint:paint});try{result.Paint(this,x,y);}finally{result.Dispose();}}finally{shaper.Dispose?.();}
    }
    DrawTextBlob(blob,x,y,paint){this._complex();if(blob.Draw)blob.Draw(this,x,y,paint);else this._paint(paint,p=>this._native.drawTextBlob(n(blob),x,y,p));}
    DrawGlyphs(glyphs,positions,origin,font,paint){this._complex();const flat=positions[0]?.X!==undefined?positions.flatMap(p=>[p.X,p.Y]):positions;this._paint(paint,p=>this._native.drawGlyphs(glyphs,flat,origin?.X||0,origin?.Y||0,n(font),p));}
    DrawParagraph(paragraph,x,y){this._complex();this._native.drawParagraph(n(paragraph),x,y);}
    DrawPicture(picture,matrix=null,paint=null){this._complex();if(matrix||paint){const count=paint?this.SaveLayer(paint):this.Save();try{if(matrix)this.Concat(matrix);this._native.drawPicture(n(picture));}finally{this.RestoreToCount(count);}}else this._native.drawPicture(n(picture));}
    DrawVertices(vertices,blendMode,paint){this._complex();this._paint(paint,p=>this._native.drawVertices(n(vertices),blendMode,p));}
    DrawAtlas(atlas,sprites,transforms,...args){this._complex();let paint=args.at(-1) instanceof SKPaint?args.pop():null;const own=!paint;if(own)paint=new SKPaint();let colors=null,blendMode=K.BlendMode.SrcOver,sampling;for(const v of args){if(v instanceof api.SKSamplingOptions)sampling=v.ToNative();else if(Array.isArray(v)||ArrayBuffer.isView(v))colors=new Uint32Array(Array.from(v,c=>c.ToUint?.()??c));else if(v!=null)blendMode=v;}try{this._paint(paint,p=>this._native.drawAtlas(n(atlas),sprites.flatMap(r=>Array.from(rect(r))),transforms.flatMap(t=>Array.from(arr(t))),p,blendMode,colors,sampling));}finally{if(own)paint.Dispose();}}
    DrawPatch(cubics,colors,texCoords,blendMode,paint){this._complex();this._paint(paint,p=>this._native.drawPatch(cubics.flatMap(p=>arr(p)),colors?new Uint32Array(colors.map(c=>c.ToUint?.()??c)):null,texCoords?.flatMap(p=>arr(p)),blendMode,p));}
    Save(){this._check();const count=this._native.save();this._clipStack[count]=this._clipDirty;return count;}
    SaveLayer(...a){this._complex();let bounds=null,paint=null;if(isRect(a[0]))[bounds,paint]=a;else[paint]=a;const count=this._native.saveLayer(n(paint)||undefined,bounds?rect(bounds):null);this._clipStack[count]=this._clipDirty;return count;}
    Restore(){this._check();if(this.SaveCount>1){const count=this.SaveCount-1;this._native.restore();this._clipDirty=this._clipStack[count]??this._clipDirty;this._clipStack.length=count;}}
    RestoreToCount(count){this._check();count=Math.max(1,count);if(count<this.SaveCount){this._native.restoreToCount(count);this._clipDirty=this._clipStack[count]??this._clipDirty;this._clipStack.length=count;}}
    get SaveCount(){this._check();return this._native.getSaveCount();}
    get TotalMatrix(){this._check();return new SKMatrix(this._native.getTotalMatrix());}
    get DeviceClipBounds(){this._check();return new SKRect(...this._native.getDeviceClipBounds());}
    Translate(x,y){this._complex();if(x?.X!==undefined){y=x.Y;x=x.X;}this._native.translate(x,y);}
    Scale(x,y=x){this._complex();this._native.scale(x,y);}
    RotateDegrees(degrees,x=0,y=0){this._complex();this._native.rotate(degrees,x,y);}
    RotateRadians(radians,x=0,y=0){this.RotateDegrees(radians*180/Math.PI,x,y);}
    Skew(x,y){this._complex();this._native.skew(x,y);}
    Concat(matrix){this._complex();this._native.concat(arr(matrix));}
    SetMatrix(matrix){this.ResetMatrix();this.Concat(matrix);}
    ResetMatrix(){this._complex();const inverse=K.Matrix.invert(this._native.getTotalMatrix());if(!inverse)throw new Error('Cannot reset a singular matrix; restore a saved state.');this._native.concat(inverse);}
    ClipRect(bounds,operation=K.ClipOp.Intersect,antialias=false){this._complex();this._clipDirty=true;this._native.clipRect(rect(bounds),operation,antialias);}
    ClipRoundRect(bounds,operation=K.ClipOp.Intersect,antialias=false){this._complex();this._clipDirty=true;this._native.clipRRect(arr(bounds),operation,antialias);}
    ClipPath(path,operation=K.ClipOp.Intersect,antialias=false){this._complex();this._clipDirty=true;this._native.clipPath(n(path),operation,antialias);}
    QuickReject(bounds){this._check();if(!identity(this._native.getTotalMatrix()))return false;const a=rect(bounds),b=rect(this.DeviceClipBounds);return a[2]<=b[0]||a[0]>=b[2]||a[3]<=b[1]||a[1]>=b[3];}
    ReadPixels(info,x=0,y=0){this._check();this._materialize();return this._native.readPixels(x,y,toInfo(info));}
    WritePixels(pixels,width,height,x=0,y=0){this._complex();return this._native.writePixels(pixels,width,height,x,y);}
    Flush(){this._check();this._owner?.Flush?.();}
  }
  function toInfo(info){return {width:info.Width??info.width,height:info.Height??info.height,colorType:info.ColorType??info.colorType??K.ColorType.RGBA_8888,alphaType:info.AlphaType??info.alphaType??K.AlphaType.Unpremul,colorSpace:n(info.ColorSpace??info.colorSpace)??K.ColorSpace.SRGB};}
  class SKSurface extends SKObject {
    constructor(native,backend='raster',element=null,presenter=null){super(native);if(!native)throw new Error('Could not allocate Skia surface.');this.Backend=backend;this.Element=element;this._presenter=presenter;this.Canvas=new SKCanvas(native.getCanvas(),this);this.RenderMode=backend==='webgpu'?'skia-raster-upload':backend;this.FallbackReasons=[];}
    static Create(target,options={}){
      if(target?.getContext)return SKSurface.CreateForCanvas(target,options);
      const width=target.Width??target.width,height=target.Height??target.height;
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new RangeError('Surface dimensions must be positive integers.');
      return new SKSurface(K.MakeSurface(width,height));
    }
    static async CreateForCanvas(element,{backend='auto',allowFallback=true,onDeviceLost}={}){
      if(!['auto','webgpu','webgl','canvas'].includes(backend))throw new Error('Unknown rendering backend: '+backend);
      const reasons=[];const original=element;const modes=backend==='auto'?['webgpu','webgl','canvas']:allowFallback?(backend==='webgpu'?['webgpu','webgl','canvas']:backend==='webgl'?['webgl','canvas']:['canvas']):[backend];
      for(const mode of modes){
        try{
          let result;
          if(mode==='webgpu'){
            const presenter=await createWebGPUBackend(element,{onDeviceLost});
            try{
              if(api.NativeGpuCapabilities?.GraphiteDawn)result=createGraphiteCanvas(element,presenter);
              else result=new SKSurface(K.MakeSurface(element.width,element.height),'webgpu',element,presenter);
            }catch(e){presenter.dispose();throw e;}
          }else if(mode==='webgl'){
            const handle=K.GetWebGLContext(element,{alpha:1,antialias:1,preserveDrawingBuffer:1});if(!handle)throw new Error('WebGL context unavailable.');let context;
            try{context=K.MakeWebGLContext(handle);if(!context)throw new Error('Skia WebGL context unavailable.');const s=K.MakeOnScreenGLSurface(context,element.width,element.height,K.ColorSpace.SRGB);if(!s)throw new Error('Skia WebGL surface unavailable.');result=new SKSurface(s,'webgl',element);result._grContext=context;result._glHandle=handle;}catch(error){context?.delete();K.deleteContext(handle);throw error;}
          }else{if(!element.getContext('2d'))throw new Error('Canvas 2D context unavailable.');const s=K.MakeSWCanvasSurface(element);if(!s)throw new Error('Canvas allocation failed.');result=new SKSurface(s,'canvas',element);}
          result.FallbackReasons=reasons;if(element!==original&&original.isConnected)original.replaceWith(element);return result;
        }catch(error){reasons.push(mode+': '+error.message);if(element.cloneNode)element=element.cloneNode(false);else if(typeof OffscreenCanvas!=='undefined')element=new OffscreenCanvas(element.width,element.height);}
      }
      throw new Error('Rendering initialization failed. '+reasons.join(' | '));
    }
    get Width(){this.ThrowIfDisposed();return this._native.width();}
    get Height(){this.ThrowIfDisposed();return this._native.height();}
    Flush(){
      this.ThrowIfDisposed();
      if(this._presenter){
        if(this.Canvas._eligible && this.Canvas._commands.length){this._presenter.presentPrimitives(this.Canvas._commands,this.Width,this.Height);this.RenderMode='native-primitives';}
        else{this.Canvas._materialize();this._native.flush();const pixels=this._native.getCanvas().readPixels(0,0,{width:this.Width,height:this.Height,colorType:K.ColorType.RGBA_8888,alphaType:K.AlphaType.Premul,colorSpace:K.ColorSpace.SRGB});if(!pixels)throw new Error('Skia pixel readback failed.');this._presenter.presentPixels(pixels,this.Width,this.Height);this.RenderMode='skia-raster-upload';}
      }else this._native.flush();
    }
    Snapshot(bounds){this.ThrowIfDisposed();this.Canvas._materialize();return SKImage._fromNative(this._native.makeImageSnapshot(bounds?rect(bounds):undefined));}
    async FlushAsync(){if(this._presenter?.runChecked)await this._presenter.runChecked(()=>this.Flush());else{this.Flush();await this._presenter?.waitForCompletion();}}
    async SnapshotAsync(bounds){return this.Snapshot(bounds);}
    Draw(canvas,x=0,y=0,paint=null){const image=this.Snapshot();try{canvas.DrawImage(image,x,y,paint);}finally{image.Dispose();}}
    Dispose(){if(this.IsDisposed)return;this.Canvas.Dispose();this._presenter?.dispose();this._native.dispose();this._grContext?.delete();if(this._glHandle)K.deleteContext(this._glHandle);this._ownsNative=false;super.Dispose();}
  }
  function createGraphiteCanvas(element,presenter){
    let context,recorder,texture,target,surface;
    try{
      context=api.SKGraphiteContext.CreateDawn(presenter.device,{RequireOrderedRecordings:true});if(!context)throw new Error('Skia Graphite rejected the WebGPU device.');
      recorder=context.CreateRecorder();if(!recorder)throw new Error('Could not create a Graphite recorder.');
      texture=presenter.device.createTexture({label:'Skia Graphite canvas',size:[element.width,element.height],format:'rgba8unorm',usage:0x17});
      target=api.SKGraphiteBackendTexture.CreateDawn(texture);
      surface=api.SKSurface.CreateGraphite(recorder,target);if(!surface)throw new Error('Could not create a Graphite surface.');
      surface.Backend='webgpu';surface.Element=element;surface._graphitePresenter=presenter;surface.GraphiteContext=context;surface.GPUTexture=texture;
      const flush=surface.Flush.bind(surface),dispose=surface.Dispose.bind(surface);
      surface.Flush=()=>{surface.ThrowIfDisposed();flush();presenter.presentTexture(texture,element.width,element.height);};
      surface.FlushAsync=async()=>{await presenter.runChecked(()=>surface.Flush());context.CheckAsyncWorkCompletion();};
      surface.SnapshotAsync=async(bounds)=>{
        surface.ThrowIfDisposed();await surface.FlushAsync();
        const b=bounds?rect(bounds):[0,0,element.width,element.height];
        const result=await api.ReadWebGPUTexture(presenter.device,texture,{x:b[0],y:b[1],width:b[2]-b[0],height:b[3]-b[1]});
        try{return SKImage.FromPixels(new api.SKImageInfo(result.Width,result.Height,K.ColorType.RGBA_8888,K.AlphaType.Premul),result.GetData(),result.RowBytes);}finally{result.Dispose();}
      };
      surface.Dispose=()=>{
        if(surface.IsDisposed)return;
        dispose();target.Dispose();recorder.Dispose();
        surface._disposePromise=presenter.device.queue.onSubmittedWorkDone().catch(()=>{}).then(()=>{try{context.CheckAsyncWorkCompletion();context.Dispose();}finally{texture.destroy();presenter.dispose();}});
        // Preserve asynchronous failure for DisposeAsync; avoid an unhandled rejection
        // when callers use the synchronous .NET-style disposal entry point.
        surface._disposePromise.catch(error=>{surface.DisposalError=error;});
      };
      surface.DisposeAsync=async()=>{surface.Dispose();await surface._disposePromise;};
      return surface;
    }catch(error){surface?.Dispose();target?.Dispose();recorder?.Dispose();context?.Dispose();texture?.destroy();throw error;}
  }
  class SKPicture extends SKObject {
    get CullRect(){this.ThrowIfDisposed();return new SKRect(...this._native.cullRect());}
    get ApproximateBytesUsed(){this.ThrowIfDisposed();return this._native.approximateBytesUsed();}
    Serialize(){this.ThrowIfDisposed();const bytes=this._native.serialize();if(!bytes)throw new Error('Picture serialization failed.');return SKData.CreateCopy(bytes);}
    static Deserialize(data){const value=K.MakePicture(data.ToArray?.()||data);if(!value)throw new Error('Invalid or incompatible serialized Skia picture.');return this._fromNative(value);}
  }
  class SKPictureRecorder extends SKObject {
    constructor(){super(new K.PictureRecorder());this.RecordingCanvas=null;}
    BeginRecording(bounds){this.ThrowIfDisposed();if(this.RecordingCanvas)throw new Error('Recording already active.');return this.RecordingCanvas=new SKCanvas(this._native.beginRecording(rect(bounds)),this);}
    EndRecording(){this.ThrowIfDisposed();if(!this.RecordingCanvas)throw new Error('No active recording.');const p=this._native.finishRecordingAsPicture();this.RecordingCanvas._invalid=true;this.RecordingCanvas=null;return SKPicture._fromNative(p);}
    Dispose(){if(this.RecordingCanvas)this.RecordingCanvas._invalid=true;super.Dispose();}
  }
  class SKAutoCanvasRestore {constructor(canvas,doSave=true){this.Canvas=canvas;this.SaveCount=canvas.SaveCount;if(doSave)canvas.Save();}Restore(){if(this.Canvas){this.Canvas.RestoreToCount(this.SaveCount);this.Canvas=null;}}Dispose(){this.Restore();}}
  return {SKCanvas,SKSurface,SKPicture,SKPictureRecorder,SKAutoCanvasRestore};
}
