#!/usr/bin/env python3
"""Current Graphite cold/warm pixel invariance and cache reuse; no historical checkout."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('gpu_harness', ROOT / 'tests/skia-gpu.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
OUT = ROOT / 'test-results/skia-performance'

SETUP = r'''async font => {
    window.fontBytes=Uint8Array.from(atob(font),c=>c.charCodeAt(0));
    window.file=entities=>[[0,'SECTION'],[2,'TABLES'],[0,'STYLE'],[2,'F'],[3,'local.ttf'],[0,'ENDSEC'],
        [0,'SECTION'],[2,'ENTITIES'],...entities,[0,'ENDSEC'],[0,'EOF']].map(([c,v])=>c+'\n'+v+'\n').join('');
    window.measure=async(name,count)=>{
        const A=DxfSkia,entities=[];
        for(let i=0;i<count;i++) entities.push(...(name==='circles'?
            [[0,'CIRCLE'],[5,(i+1).toString(16)],[10,(i%100)*25],[20,Math.floor(i/100)*25],[40,10]]:
            [[0,'TEXT'],[5,(i+1).toString(16)],[10,(i%8)*180],[20,Math.floor(i/8)*20],[40,10],[1,'Pump '+i+' — Ω'],[7,'F']]));
        const resources=new A.ResourceStore(S);resources.register('local.ttf',fontBytes);
        const painter=new A.SkiaPainter(S,{resources}),cold=new A.SkiaPainter(S,{resources});
        const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;document.body.append(canvas);
        let surface;
        try{
            const source=file(entities);let t=performance.now();
            const doc=new A.DxfDocument(source),parseMs=performance.now()-t;t=performance.now();
            const scene=new A.SceneCompiler(doc,{textMeasurer:(p,s)=>resources.measureText(p,s)}).compile(),compileMs=performance.now()-t;
            const initial=A.prepareFrame(scene,{width:800,height:600});
            surface=await S.SKSurface.Create(canvas,{backend:'webgpu',allowFallback:false});
            if(surface.Backend!=='webgpu'||surface.RenderMode!=='skia-graphite-webgpu')throw Error('Required Graphite pipeline not active');
            t=performance.now();painter.draw(surface.Canvas,initial);await surface.FlushAsync();const firstDrawFlushMs=performance.now()-t;
            const samples=[],startDraws=window.drawCalls;let finalFrame;
            for(let i=0;i<4;i++){
                t=performance.now();finalFrame=A.prepareFrame(scene,{width:800,height:600,
                    viewState:{...initial.viewState,mode:'custom',center:{...initial.worldCenter,x:initial.worldCenter.x+i}}});
                const prepareMs=performance.now()-t;t=performance.now();
                painter.draw(surface.Canvas,finalFrame);await surface.FlushAsync();
                samples.push({prepareMs,drawFlushMs:performance.now()-t,interaction:finalFrame.interactionStats});
            }
            const snapshot=async()=>{const image=await surface.SnapshotAsync();try{return image.ReadPixels().slice();}finally{image.Dispose();}};
            const warmPixels=await snapshot();
            // A new painter redraws the identical final frame without reusing native
            // path/text recordings. This is a current-code oracle, not an old release.
            cold.draw(surface.Canvas,finalFrame);await surface.FlushAsync();const coldPixels=await snapshot();
            let changedChannels=0,maxDifference=0;
            for(let i=0;i<warmPixels.length;i++){
                if(warmPixels[i]!==coldPixels[i])changedChannels++;
                maxDifference=Math.max(maxDifference,Math.abs(warmPixels[i]-coldPixels[i]));
            }
            return {name,count,parseMs,compileMs,firstDrawFlushMs,samples,metrics:painter.metrics,
                changedChannels,maxDifference,drawCalls:window.drawCalls-startDraws,
                errors:[...painter.diagnostics.items,...cold.diagnostics.items].filter(d=>d.severity==='error')};
        }finally{
            if(surface)await surface.DisposeAsync();painter.dispose();cold.dispose();resources.dispose();canvas.remove();
        }
    };
    const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('Required WebGPU adapter unavailable');
    return {vendor:adapter.info.vendor,architecture:adapter.info.architecture,description:adapter.info.description};
}'''


class PerformanceGpuTests(h.NativeGpuTests):
    def setUp(self):
        super().setUp()
        OUT.mkdir(parents=True, exist_ok=True)
        candidates = [os.getenv('SKIA_TEST_FONT', ''), '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                      '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']
        font = next((Path(p) for p in candidates if p and Path(p).is_file()), None)
        self.assertIsNotNone(font, 'Native font qualification requires a local system font.')
        self.adapter = self.page.evaluate(SETUP, base64.b64encode(font.read_bytes()).decode())

    def workload(self, name, count):
        result = self.page.evaluate('([name,count])=>measure(name,count)', [name, count])
        (OUT / f'{name}.json').write_text(json.dumps({
            'schemaVersion': 1, 'browser': self.browser.version, 'adapter': self.adapter,
            'backend': 'skia-graphite-webgpu', 'physicalHardware': False,
            'timing': 'Descriptive wall-clock measurements; not GPU timestamp queries.',
            'result': result,
        }, indent=2))
        self.assertEqual([], result['errors'])
        self.assertEqual(0, result['changedChannels'], result)
        self.assertGreater(result['drawCalls'], 0)
        for sample in result['samples']:
            self.assertEqual(0, sample['interaction']['screenPointsTransformed'])
            self.assertEqual(0, sample['interaction']['pickablesCreated'])
        return result['metrics']

    def test_perf_01_current_graphite_paths_reuse_cache_without_pixel_changes(self):
        metrics = self.workload('circles', 5000)
        self.assertEqual(5000, metrics['pathBuilds'])
        self.assertGreaterEqual(metrics['pathHits'], 20000)

    def test_perf_02_current_graphite_text_reuses_cache_without_pixel_changes(self):
        metrics = self.workload('native-text', 64)
        self.assertEqual(64, metrics['textBuilds'])
        self.assertEqual(256, metrics['textHits'])


if __name__ == '__main__':
    suite = unittest.TestSuite(PerformanceGpuTests(n) for n in sorted(dir(PerformanceGpuTests)) if n.startswith('test_perf_'))
    raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
