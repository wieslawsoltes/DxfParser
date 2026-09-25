'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const A = require('../../dxf-skia/index.js'), C = require('../api.js')(A);
const { compile } = require('../../dxf-skia/tests/helpers.js');
const runtime = import('../../../vendor/skiasharpweb/dist/package/node.js').then(({Initialize}) => Initialize({fonts:false}));
const solid = (handle, x, color = 0xffffff) => [[0,'SOLID'],[5,handle],[420,color],[10,x],[20,0],[11,x+10],[21,0],[12,x],[22,10],[13,x+10],[23,10]];
async function draw(scene) {
    const S = await runtime, frame = A.prepareFrame(scene,{width:900,height:420});
    const surface = S.SKSurface.Create(new S.SKImageInfo(900,420)), painter = new A.SkiaPainter(S);
    try {
        const stats = painter.draw(surface.Canvas,frame);
        assert.deepEqual(stats.diagnostics.filter(x => x.severity === 'error'),[]);
        const image = surface.Snapshot();
        try {
            const pixels = image.ReadPixels(), data = image.Encode(S.SKEncodedImageFormat.Png,100);
            try { return {pixels, png:Buffer.from(data.ToArray()), at(x,y) {
                const p = frame.worldToScreen(A.geometry.vec(x,y,0)), index = (Math.floor(p.y)*900+Math.floor(p.x))*4;
                return Array.from(pixels.slice(index,index+3));
            }}; } finally { data.Dispose(); }
        } finally { image.Dispose(); }
    } finally { painter.dispose(); surface.Dispose(); }
}
test('native Skia pixels contain all comparison categories and revision clouds', async () => {
    const a = compile([...solid('A',0),...solid('B',20)]), b = compile([...solid('E',0),...solid('F',40)]);
    const result = C.compareScenes(a,b,{commonOpacity:1}), output = await draw(C.compose(result));
    assert.deepEqual(result.counts,{currentOnly:1,referenceOnly:1,common:1,modified:0,changes:2});
    assert.deepEqual(output.at(5,5),[168,181,200]);
    assert.deepEqual(output.at(25,5),[92,224,128]);
    assert.deepEqual(output.at(45,5),[255,102,120]);
    // Curved one-pixel strokes are antialiased; test the cloud's alpha blend
    // against the background rather than requiring an accidentally opaque pixel.
    let cloudPixels = 0;
    for (let i = 0; i < output.pixels.length; i += 4) {
        const [r,g,b] = output.pixels.slice(i,i+3), alpha = (r-33)/(255-33);
        if (alpha > .6 && Math.abs(g-(40+169*alpha)) < 3 && Math.abs(b-(48+54*alpha)) < 3) cloudPixels++;
    }
    assert(cloudPixels > 50, 'Native revision-cloud strokes must be visible in real pixels');
    const out = path.resolve(__dirname,'../../../test-results/compare-native');
    fs.mkdirSync(out,{recursive:true}); fs.writeFileSync(path.join(out,'categories.png'),output.png);
});
test('native Skia comparison compositing honors both foreground orders', async () => {
    const a = compile(solid('A',0,0xff0000)), b = compile(solid('A',0,0x0000ff));
    assert.deepEqual((await draw(C.compose(C.compareScenes(a,b,{clouds:false})))).at(5,5),[92,224,128]);
    assert.deepEqual((await draw(C.compose(C.compareScenes(a,b,{clouds:false,currentFirst:true})))).at(5,5),[255,102,120]);
});
test('native polygonal clouds draw concave outlines distinct from rectangular change-set clouds', async () => {
    const rectangle = (handle,x,y,w,h) => [[0,'SOLID'],[5,handle],[10,x],[20,y],[11,x+w],[21,y],[12,x],[22,y+h],[13,x+w],[23,y+h]];
    const current = compile([...rectangle('A',0,0,4,1),...rectangle('B',0,0,1,4)]), reference = compile([]);
    const rectangular = C.compose(C.compareScenes(current,reference,{margin:0}));
    const polygonal = C.compose(C.compareScenes(current,reference,{margin:0,cloudShape:'polygonal'}));
    assert.equal(polygonal.primitives.filter(p=>p.comparisonDecoration).length,1);
    assert.equal(polygonal.primitives.find(p=>p.comparisonDecoration).rings[0].length,6);
    const a = await draw(rectangular), b = await draw(polygonal);
    assert.notDeepEqual(a.png,b.png);
    fs.writeFileSync(path.resolve(__dirname,'../../../test-results/compare-native/polygonal.png'),b.png);
});
