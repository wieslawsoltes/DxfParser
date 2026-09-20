/** Reusable, local-only browser qualification. Software adapters never qualify as hardware. */
export async function RunQualification(S, {requirePhysical=true, iterations=200, signal, onProgress=()=>{}, canvasHost=null}={}) {
  if(!Number.isSafeInteger(iterations)||iterations<1||iterations>10000)throw new RangeError('iterations must be 1..10,000.');
  const started=performance.now(),report={version:S.Version,createdAt:new Date().toISOString(),userAgent:globalThis.navigator?.userAgent??'unknown',
    requirePhysical,iterations,physicalGPU:false,backends:[],documents:null,errors:[],passed:false,
    scope:'Fixed deterministic drawing corpus and finite surface lifecycle loop. Not complete SkiaSharp parity or a vendor certification.'};
  const documents={},width=256,height=192,reference=[];
  const check=(ok,message)=>{if(!ok)throw Error(message);},progress=(stage,completed,total)=>{signal?.throwIfAborted();onProgress({stage,completed,total});};
  const point=(x,y)=>new S.SKPoint(x,y),rect=(l,t,r,b)=>new S.SKRect(l,t,r,b);
  function fixture(index,c){
    const own=[],take=v=>(own.push(v),v),paint=take(new S.SKPaint({IsAntialias:true,Color:S.SKColors.Red}));
    try{
      c.Clear(S.SKColors.White);
      if(index===0){c.DrawRect(8,8,64,40,paint);paint.Color=S.SKColors.Blue;c.DrawCircle(148,87,47,paint);paint.Color=S.SKColors.Teal;c.DrawRoundRect(rect(19,117,235,174),12,18,paint);}
      if(index===1){const p=take(new S.SKPath().MoveTo(15,17).CubicTo(90,183,173,-40,236,149).LineTo(62,174).Close());
        c.Save();c.ClipRect(rect(20,20,230,170));paint.Color=S.SKColors.Blue.WithAlpha(170);c.DrawPath(p,paint);paint.Color=S.SKColors.Red.WithAlpha(140);c.DrawCircle(115,101,55,paint);c.Restore();}
      if(index===2){const shader=take(S.SKShader.CreateLinearGradient(point(10,20),point(221,145),[S.SKColors.Red,S.SKColors.Teal,S.SKColors.Blue],[0,.4,1],S.SKShaderTileMode.Clamp));paint.Shader=shader;c.DrawRect(5,5,240,180,paint);
        paint.Shader=null;paint.Color=S.SKColors.White;paint.ImageFilter=take(S.SKImageFilter.CreateBlur(3,3));c.DrawCircle(105,83,36,paint);}
      if(index===3){const vertices=take(S.SKVertices.CreateCopy(S.SKVertexMode.Triangles,[10,10,238,20,40,180],null,[S.SKColors.Red,S.SKColors.Green,S.SKColors.Blue]));paint.Color=S.SKColors.White;c.DrawVertices(vertices,S.SKBlendMode.Modulate,paint);
        const recorder=take(new S.SKPictureRecorder());paint.Color=S.SKColors.Blue;recorder.BeginRecording(rect(0,0,width,height)).DrawRect(184,135,48,35,paint);c.DrawPicture(take(recorder.EndRecording()));}
    }finally{for(const o of own.reverse())o?.Dispose();}
  }
  try{
    for(const backend of ['canvas','webgl','webgpu']){
      progress(backend,0,iterations+4);
      const element=document.createElement('canvas');element.width=width;element.height=height;element.setAttribute('aria-label',backend+' qualification');
      canvasHost?.append(element);let surface,listener,device;
      const result={backend,scenes:[],errors:[],iterations:0};report.backends.push(result);
      try{
        surface=await S.SKSurface.Create(element,{backend,allowFallback:false});check(surface.Backend===backend,'Explicit backend changed');result.mode=surface.RenderMode;
        const presenter=surface._graphitePresenter;
        if(backend==='webgpu'){
          check(result.mode==='skia-graphite-webgpu','Native Graphite runtime is required');
          result.adapter={...presenter.adapterInfo};device=presenter.device;
          listener=e=>result.errors.push(e.error.message);device.addEventListener('uncapturederror',listener);
          const description=JSON.stringify(result.adapter);
          report.physicalGPU=result.adapter.isFallbackAdapter===false&&!!(result.adapter.vendor||result.adapter.device)&&!/swiftshader|llvmpipe|software/i.test(description);
          result.hardwareIdentification=report.physicalGPU?'non-software adapter reported':'software or unconfirmed adapter';
        }
        for(let i=0;i<4;i++){
          fixture(i,surface.Canvas);await surface.FlushAsync();const image=await surface.SnapshotAsync();let bytes;
          try{bytes=image.ReadPixels();}finally{image.Dispose();}
          check(bytes.length===width*height*4,'Readback size mismatch');check(bytes.some((v,j)=>j%4!==3&&v<200),'Empty fixture output');
          if(backend==='canvas')reference.push(bytes.slice());
          let sum=0,max=0;for(let j=0;j<bytes.length;j++){const d=Math.abs(bytes[j]-reference[i][j]);sum+=d;max=Math.max(max,d);}
          const mae=sum/bytes.length;check(mae<5,backend+' fixture '+i+' differs from Skia raster reference: '+mae);
          result.scenes.push({id:i,meanAbsoluteComponentError:mae,maxComponentError:max});progress(backend,i+1,iterations+4);
        }
        const samples=[];
        for(let i=0;i<iterations;i++){
          const start=performance.now();fixture(i%4,surface.Canvas);await surface.FlushAsync();samples.push(performance.now()-start);result.iterations++;
          if(i%20===0){progress(backend,i+5,iterations+4);await new Promise(r=>setTimeout(r,0));}
        }
        const sorted=[...samples].sort((a,b)=>a-b);result.timing={medianCpuAndCompletionMs:sorted[Math.floor(sorted.length/2)],p95CpuAndCompletionMs:sorted[Math.floor((sorted.length-1)*.95)],note:'Wall-clock drawing plus queue completion; not GPU timestamp-query timing.'};
        if(presenter){result.presentation={...presenter.statistics};check(result.presentation.uploadedBytes===0,'Graphite presented CPU-rendered frames');}
        check(result.errors.length===0,result.errors.join('\n'));result.passed=true;
      }catch(error){result.passed=false;result.errors.push(error.message);report.errors.push(backend+': '+error.message);}
      finally{if(device&&listener)device.removeEventListener('uncapturederror',listener);if(surface?.DisposeAsync)await surface.DisposeAsync();else surface?.Dispose();element.remove();}
    }
    progress('native document decisions',0,3);
    const vector=S.SKDocument.CreatePdf({NativeBackend:true,StrictVector:true}),paint=new S.SKPaint({Color:S.SKColors.Teal});
    try{const c=vector.BeginPage(256,192);c.DrawRect(20,20,160,90,paint);const data=vector.ToData();try{documents.vector=data.ToArray();}finally{data.Dispose();}check(vector.RasterDiagnostics.Total===0,'Vector page generated a raster decision');}
    finally{vector.Dispose();paint.Dispose();}
    const filtered=S.SKDocument.CreatePdf({DiagnosticsLimit:16}),p=new S.SKPaint({Color:S.SKColors.Red}),blur=S.SKMaskFilter.CreateBlur(S.SKBlurStyle.Normal,4);p.MaskFilter=blur;
    try{filtered.BeginPage(256,192).DrawCircle(100,90,45,p);const data=filtered.ToData();try{documents.filtered=data.ToArray();}finally{data.Dispose();}
      check(filtered.RasterDiagnostics?.Total>0,'Native raster decision reporting is not active');report.documents={vectorBytes:documents.vector.length,filteredBytes:documents.filtered.length,diagnostics:filtered.RasterDiagnostics};}
    finally{filtered.Dispose();p.Dispose();blur.Dispose();}
    progress('complete',3,3);
    if(requirePhysical&&!report.physicalGPU)report.errors.push('Physical GPU qualification was requested, but this adapter is software or cannot be positively identified.');
    report.passed=report.errors.length===0&&report.backends.every(b=>b.passed);
  }catch(error){report.errors.push(error.message);report.cancelled=signal?.aborted??false;}
  report.durationMs=performance.now()-started;
  return{report,documents};
}
