/* Real native Skia WASM tests. All pixel expectations below are analytical;
 * no old renderer, SVG snapshot, mocked graphics context or proprietary font is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import A from '../packages/dxf-skia/index.js';
import helpers from '../packages/dxf-skia/tests/helpers.js';
import { Initialize } from '../vendor/skiasharpweb/dist/package/node.js';
const S = await Initialize({ fonts: false });
const { file, compile, block, line, circle, hatch, near } = helpers, { vec } = A.geometry;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results/skia-native');
fs.mkdirSync(out, { recursive: true });
function draw(scene, { width = 480, height = 360, resources, frameOptions = {}, paintOptions = {} } = {}) {
    const frame = A.prepareFrame(scene, { width, height, ...frameOptions }), surface = S.SKSurface.Create(new S.SKImageInfo(width, height)), painter = new A.SkiaPainter(S, { resources });
    try {
        const stats = painter.draw(surface.Canvas, frame, paintOptions), image = surface.Snapshot();
        try {
            const pixels = image.ReadPixels(), data = image.Encode(S.SKEncodedImageFormat.Png, 100);
            try {
                return { stats, pixels, png: Buffer.from(data.ToArray()), frame, width, height, pixel: (x, y) => Array.from(pixels.slice((Math.floor(y) * width + Math.floor(x)) * 4, (Math.floor(y) * width + Math.floor(x)) * 4 + 4)) };
            }
            finally {
                data.Dispose();
            }
        }
        finally {
            image.Dispose();
        }
    }
    finally {
        painter.dispose();
        surface.Dispose();
    }
}
function noErrors(result) { assert.deepEqual(result.stats.diagnostics.filter(x => x.severity === 'error'), []); }
function rgbAt(result, world) { const p = result.frame.worldToScreen(world); return result.pixel(p.x, p.y).slice(0, 3); }
function solid(color = 0xff0000) { return [[0, 'SOLID'], [5, 'S'], [420, color], [10, 0], [20, 0], [11, 10], [21, 0], [12, 0], [22, 10], [13, 10], [23, 10]]; }
function imageBytes() { const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]), image = S.SKImage.FromPixels(new S.SKImageInfo(2, 2), pixels, 8); try {
    const data = image.Encode(S.SKEncodedImageFormat.Png, 100);
    try {
        return data.ToArray();
    }
    finally {
        data.Dispose();
    }
}
finally {
    image.Dispose();
} }
const imageEntity = [[0, 'IMAGE'], [5, 'I'], [10, 0], [20, 0], [11, 10], [21, 0], [12, 0], [22, 10], [13, 2], [23, 2], [340, 'D'], [70, 3]], imageObjects = [[0, 'IMAGEDEF'], [5, 'D'], [1, 'unresolved/path/pixels.png']];
test('native Skia paints SOLID color into real RGBA pixels and encodes a PNG', () => { const r = draw(compile(solid())); noErrors(r); assert.deepEqual(rgbAt(r, vec(5, 5)), [255, 0, 0]); assert.equal(r.png.subarray(1, 4).toString(), 'PNG'); assert.equal(r.pixel(0, 0)[3], 255); fs.writeFileSync(path.join(out, 'solid.png'), r.png); });
test('native rational circle is stroked but has no fabricated fill', () => { const r = draw(compile([...circle(), [420, 0xff0000]])); noErrors(r); assert.deepEqual(rgbAt(r, vec()), [33, 40, 48]); const edge = r.frame.worldToScreen(vec(10, 0)); assert.ok(r.pixel(edge.x, edge.y)[0] > 70); });
test('native even-odd HATCH paints the shell and leaves the island empty', () => { const r = draw(compile([...hatch(), [420, 0x00ff00]])); noErrors(r); assert.deepEqual(rgbAt(r, vec(5, 0)), [0, 255, 0]); assert.deepEqual(rgbAt(r, vec()), [33, 40, 48]); fs.writeFileSync(path.join(out, 'hatch-hole.png'), r.png); });
test('native patterns are clipped to the complete hatch boundary including holes', () => { const r = draw(compile([...hatch('H', false), [420, 0xff0000], [78, 1], [53, 0], [43, 0], [44, 0], [45, 0], [46, 2], [79, 2], [49, 2], [49, -1]])); noErrors(r); assert.deepEqual(rgbAt(r, vec()), [33, 40, 48]); });
test('large world origins are rebased before Skia float path storage', () => { const nearScene = compile(line('A', 0, 0, 10, 5)), farScene = compile(line('A', 1e12, 1e12, 1e12 + 10, 1e12 + 5)); const a = draw(nearScene), b = draw(farScene); noErrors(a); noErrors(b); assert.deepEqual(a.pixels, b.pixels); });
test('selection is a native cyan overlay rather than a replacement HTML layer', () => { const r = draw(compile(line()), { paintOptions: { selection: new Set(['A']) } }); noErrors(r); const c = rgbAt(r, vec(5, 0)); assert.ok(c[2] > 180 && c[1] > 140 && c[0] < 140); });
test('native path cache reuses paths during camera changes and disposes its LRU', () => { const scene = compile([...line('A'), ...circle('B')]), surface = S.SKSurface.Create(new S.SKImageInfo(400, 300)), painter = new A.SkiaPainter(S, { cacheLimit: 1 }); try {
    const f = A.prepareFrame(scene, { width: 400, height: 300 });
    painter.draw(surface.Canvas, f);
    assert.equal(painter.cache.size, 1);
    const p = painter.cache.values().next().value.path;
    painter.draw(surface.Canvas, f);
    assert.equal(painter.cache.size, 1);
    assert.notEqual(painter.cache.values().next().value.path, p);
    painter.dispose();
    assert.equal(painter.cache.size, 0);
    painter.dispose();
}
finally {
    painter.dispose();
    surface.Dispose();
} });
test('local image decoding preserves orientation and exact source colors', () => { const resources = new A.ResourceStore(S); try {
    resources.register('pixels.png', imageBytes());
    const r = draw(compile(imageEntity, {}, { objects: imageObjects }), { resources });
    noErrors(r);
    assert.deepEqual(rgbAt(r, vec(5, 15)), [255, 0, 0]);
    assert.deepEqual(rgbAt(r, vec(15, 15)), [0, 255, 0]);
    assert.deepEqual(rgbAt(r, vec(5, 5)), [0, 0, 255]);
    assert.deepEqual(rgbAt(r, vec(15, 5)), [255, 255, 0]);
    fs.writeFileSync(path.join(out, 'image.png'), r.png);
}
finally {
    resources.dispose();
} });
test('missing images produce a bounded diagnostic and never fetch a DXF path', () => { let calls = 0; const fetch = globalThis.fetch; globalThis.fetch = () => { calls++; throw new Error('Network must not be used.'); }; try {
    const r = draw(compile(imageEntity, {}, { objects: imageObjects }));
    noErrors(r);
    assert.equal(calls, 0);
    assert.ok(r.stats.diagnostics.some(d => d.code === 'missing-image'));
}
finally {
    globalThis.fetch = fetch;
} });
test('image brightness and fade use native pixel filters without channel remapping', () => { const resources = new A.ResourceStore(S); try {
    resources.register('pixels.png', imageBytes());
    const bright = draw(compile([...imageEntity, [281, 100]], {}, { objects: imageObjects }), { resources });
    noErrors(bright);
    assert.deepEqual(rgbAt(bright, vec(5, 5)), [255, 255, 255]);
    const fade = draw(compile([...imageEntity, [283, 100]], {}, { objects: imageObjects }), { resources });
    noErrors(fade);
    assert.deepEqual(rgbAt(fade, vec(5, 5)), [33, 40, 48]);
}
finally {
    resources.dispose();
} });
test('failed native resource replacement preserves the last valid image and accounting', () => { const resources = new A.ResourceStore(S); try {
    const one = resources.register('pixels.png', imageBytes()), size = resources.bytes;
    assert.throws(() => resources.register('pixels.png', new Uint8Array([1, 2, 3])));
    assert.equal(resources.get('C:\\image\\PIXELS.png'), one);
    assert.equal(resources.bytes, size);
    assert.equal(resources.remove('pixels.png'), true);
    assert.equal(resources.bytes, 0);
}
finally {
    resources.dispose();
} });
test('encoded-byte and decoded-pixel resource budgets fail before registration', () => { const r = new A.ResourceStore(S, { maxBytes: 4 }); try {
    assert.throws(() => r.register('x.png', imageBytes()), RangeError);
}
finally {
    r.dispose();
} const p = new A.ResourceStore(S, { maxImagePixels: 3 }); try {
    assert.throws(() => p.register('x.png', imageBytes()), RangeError);
    assert.equal(p.entries.size, 0);
}
finally {
    p.dispose();
} });
test('explicit native font registration normalizes DXF height and shapes text', async (t) => { const fileName = [process.env.SKIA_TEST_FONT, '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'].find(p => p && fs.existsSync(p)); if (!fileName) {
    t.skip('Set SKIA_TEST_FONT to exercise native font bytes; no fonts are distributed.');
    return;
} const resources = new A.ResourceStore(S); try {
    const font = resources.register('registered.ttf', fs.readFileSync(fileName)), native = resources.createFont(font);
    try {
        near(assert, (native.Metrics.CapHeight || -native.GetGlyphBounds(native.GetGlyphs('H'))[0].Top) / native.DxfUnit, 1, .001);
    }
    finally {
        native.Dispose();
    }
    const doc = new A.DxfDocument(file([[0, 'TEXT'], [5, 'T'], [1, 'Native Skia Ω'], [40, 10], [7, 'LOCAL']], { tables: [[0, 'STYLE'], [2, 'LOCAL'], [3, 'registered.ttf']] })), scene = new A.SceneCompiler(doc, { textMeasurer: (p, t) => resources.measureText(p, t) }).compile(), r = draw(scene, { resources });
    noErrors(r);
    assert.ok(!r.stats.diagnostics.some(d => d.code === 'missing-font'));
    assert.ok(new Set(r.pixels).size > 10);
}
finally {
    resources.dispose();
} });
test('font-free schematic strokes are genuinely drawn and explicitly diagnosed', () => { const r = draw(compile([[0, 'TEXT'], [5, 'T'], [1, 'PUMP 12'], [40, 5]])); noErrors(r); assert.ok(r.stats.diagnostics.some(d => d.code === 'missing-font')); assert.ok(r.pixels.some((v, i) => i % 4 === 0 && v > 150)); });
test('native PDF contains a vector page and uses white-background ACI 7', async () => { const host = new A.SurfaceHost({ Skia: S }), scene = compile(line()); try {
    host.lastFrame = A.prepareFrame(scene);
    const bytes = await host.exportPdf();
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
    assert.ok(Buffer.from(bytes).includes(Buffer.from('/Type /Page')));
    const pdfScene = new A.SceneCompiler(scene.document, { background: '#ffffff', printing: true }).compile();
    assert.equal(pdfScene.primitives[0].style.color, '#000000');
    fs.writeFileSync(path.join(out, 'native-vector.pdf'), bytes);
}
finally {
    await host.dispose();
} });
test('all representative DXF fixtures compile and draw with explicit error accounting', () => { const records = []; for (const name of ['sample.dxf', 'analysis-workbench.dxf']) {
    const doc = new A.DxfDocument(fs.readFileSync(path.join(root, 'tests/data', name), 'utf8')), scene = new A.SceneCompiler(doc).compile(), result = draw(scene, { width: 900, height: 600 });
    noErrors(result);
    records.push({ name, entities: doc.entities.length, primitives: scene.primitives.length, diagnostics: result.stats.diagnostics });
    fs.writeFileSync(path.join(out, name + '.png'), result.png);
} fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ backend: 'native Skia raster', records }, null, 2)); });
function gradientHatch(name='LINEAR',angle=0,more=[]) { return [...hatch(),[450,1],[470,name],[453,2],[421,0xff0000],[421,0x0000ff],[460,angle],...more]; }
test('native linear hatch shader interpolates colors and preserves the island mask',()=>{
    const r=draw(compile(gradientHatch()));noErrors(r);
    const left=rgbAt(r,vec(-8,5)),right=rgbAt(r,vec(8,5));
    assert.ok(left[0]>200 && left[2]<60,JSON.stringify(left));assert.ok(right[2]>200 && right[0]<60,JSON.stringify(right));
    assert.deepEqual(rgbAt(r,vec()),[33,40,48]);fs.writeFileSync(path.join(out,'gradient-linear.png'),r.png);
});
test('native cylindrical and radial gradient families differ and survive rotated INSERT transforms',()=>{
    const images=[];
    for(const name of ['CYLINDER','INVCYLINDER','SPHERICAL','INVSPHERICAL']) {
        const r=draw(compile(gradientHatch(name)));noErrors(r);images.push(r.png);fs.writeFileSync(path.join(out,'gradient-'+name.toLowerCase()+'.png'),r.png);
    }
    for(let i=1;i<images.length;i++)assert.notDeepEqual(images[i],images[i-1]);
    const r=draw(compile([[0,'INSERT'],[2,'GRADIENT'],[41,-2],[42,3],[50,30],[10,100],[20,80]],{}, {blocks:block('GRADIENT',gradientHatch())}));
    noErrors(r);assert.ok(r.stats.drawn>0);
});
test('native outer and ignore island styles visibly differ from normal nesting',()=>{
    const loops=[[-10,10,3],[-6,6,18],[-2,2,2]],records=style=>[[0,'HATCH'],[70,1],[420,0x00ff00],[91,3],...loops.flatMap(([lo,hi,flag])=>[[92,flag],[72,0],[73,1],[93,4],[10,lo],[20,lo],[10,hi],[20,lo],[10,hi],[20,hi],[10,lo],[20,hi],[97,0]]),[75,style]];
    const n=draw(compile(records(0))),o=draw(compile(records(1))),i=draw(compile(records(2)));for(const r of [n,o,i])noErrors(r);
    assert.deepEqual(rgbAt(n,vec()),[0,255,0]);assert.deepEqual(rgbAt(o,vec()),[33,40,48]);assert.deepEqual(rgbAt(i,vec(4,0)),[0,255,0]);
});
test('rotated hatch gradient follows its entity-space angle rather than the screen axes',()=>{
    const r=draw(compile(gradientHatch('LINEAR',Math.PI/2)));noErrors(r);
    const bottom=rgbAt(r,vec(5,-8)),top=rgbAt(r,vec(5,8));assert.ok(bottom[0]>200);assert.ok(top[2]>200);
});
test('native circular paper viewport clips model lines at curve boundaries',()=>{
    const viewport=[[0,'VIEWPORT'],[5,'V'],[67,1],[410,'Sheet'],[69,2],[68,1],[10,0],[20,0],[40,20],[41,20],[45,20],[340,'CLIP']];
    const doc=new A.DxfDocument(file([...line('L',-10,8,10,8),[420,0xff0000],...viewport,...circle('CLIP'),[67,1],[410,'Sheet']]));
    const r=draw(new A.SceneCompiler(doc).compile('Sheet'));noErrors(r);
    assert.deepEqual(rgbAt(r,vec(8,8)),[33,40,48]);assert.ok(rgbAt(r,vec(0,8))[0]>80);
    fs.writeFileSync(path.join(out,'circular-viewport.png'),r.png);
});
