#!/usr/bin/env node
/** Test the packed package as an outside consumer, not via workspace paths. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results/skia-package');
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dxf-skia-consumer-'));
const run = (command, args, cwd = temp) => execFileSync(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 120000 });
try {
    const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temp], path.join(root, 'packages/dxf-skia')))[0];
    assert.ok(!packed.files.some(f => /\.(ttf|otf|woff2?|shx)$/i.test(f.path)), 'Do not distribute fonts.');
    fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ name: 'external-skia-consumer', private: true, type: 'module' }));
    run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', path.join(temp, packed.filename)]);
    const source = `import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import A, {DxfDocument,SceneCompiler,prepareFrame,geometry} from '@wieslawsoltes/dxf-skia';
import B from '@wieslawsoltes/dxf-skia/browser';
const C=createRequire(import.meta.url)('@wieslawsoltes/dxf-skia');
assert.equal(DxfDocument,C.DxfDocument);assert.equal(A,C);
assert.equal(globalThis.DxfSkia,undefined);
const text='0\\nSECTION\\n2\\nENTITIES\\n0\\nLINE\\n5\\nA\\n10\\n0\\n20\\n0\\n11\\n10\\n21\\n10\\n0\\nENDSEC\\n0\\nEOF\\n';
const doc=new DxfDocument(text),scene=new SceneCompiler(doc).compile();
assert.equal(scene.primitives.length,1);
const bytes=new TextEncoder().encode(text);assert.equal(A.dxfText(bytes),text);assert.equal(A.decodeDxf(bytes).format,'text');
assert.equal(new B.DxfDocument(bytes).entities.length,1);assert.equal([...A.iterateTags(text)].length,A.parseTags(text).length);
const frame=prepareFrame(scene,{width:200,height:100});assert.equal(frame.hitTest(frame.worldToScreen(geometry.vec(5,5)),2).handle,'A');
assert.equal(new B.SceneCompiler(new B.DxfDocument(text)).compile().primitives.length,1);
console.log('Installed CJS/ESM identity, standalone ESM, isolated namespace, compilation and picking pass.');`;
    fs.writeFileSync(path.join(temp, 'consumer.mjs'), source);
    process.stdout.write(run('node', ['consumer.mjs']));
    fs.writeFileSync(path.join(temp, 'consumer.ts'), `import A,{DxfDocument,SceneCompiler,prepareFrame,SurfaceHost,Point,geometry,decodeDxf,dxfText,iterateTags,DxfInputOptions,SkiaPainter} from '@wieslawsoltes/dxf-skia';
const inputOptions:DxfInputOptions={maxInputBytes:4096,encoding:'utf-8',fatalEncoding:true};
const decoded=decodeDxf(new Uint8Array(),inputOptions);const textual:string=dxfText(new ArrayBuffer(0));const tags=[...iterateTags(textual)];
const bytesDocument=new DxfDocument(new Uint8Array(),inputOptions);void [decoded,tags,bytesDocument.inputFormat];
const doc=new DxfDocument(''); const scene=new SceneCompiler(doc,{maxVertices:1000}).compile();
const point:Point=geometry.vec(1,2,3); const frame=prepareFrame(scene,{viewDirection:point});
const host=new SurfaceHost({initialize:async()=>({}),onPaint:s=>console.log(s.drawn)});
const fitting=geometry.interpolateFitPoints([geometry.vec(),geometry.vec(1,2),geometry.vec(3,0)],{startTangent:geometry.vec(1,0)});
const exactBounds=geometry.pathBounds(fitting);host.retryBackend('canvas');const failed:ReadonlySet<string>=host.failedBackends;
const policy=new SurfaceHost({initialize:async()=>({}),backend:'webgpu',allowFallback:false,onRecovery:e=>console.log(e.backend)});
void [exactBounds,failed,policy];host.request(frame); const result:Promise<Uint8Array>=host.exportPng();
const m=geometry.translation(point); const transformed:Point=geometry.transform(m,point);
void [A.DxfDocument, transformed, result];\n`);
    process.stdout.write(run(process.env.TSC || 'tsc', ['--noEmit', '--strict', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--lib', 'es2022,dom', 'consumer.ts']));
    const native = path.join(root, 'vendor/skiasharpweb/dist/package/node.js');
    fs.writeFileSync(path.join(temp, 'native.mjs'), `import fs from 'node:fs';import A from '@wieslawsoltes/dxf-skia';import {Initialize} from ${JSON.stringify(new URL('file://' + native).href)};
const S=await Initialize({fonts:false}),doc=new A.DxfDocument('0\\nSECTION\\n2\\nENTITIES\\n0\\nCIRCLE\\n10\\n0\\n20\\n0\\n40\\n5\\n0\\nENDSEC\\n0\\nEOF\\n');
const surface=S.SKSurface.Create(new S.SKImageInfo(128,128)),painter=new A.SkiaPainter(S);
try{painter.draw(surface.Canvas,A.prepareFrame(new A.SceneCompiler(doc).compile(),{width:128,height:128}));const image=surface.Snapshot();try{const data=image.Encode(S.SKEncodedImageFormat.Png,100);try{fs.writeFileSync(${JSON.stringify(path.join(out, 'installed-consumer.png'))},data.ToArray());}finally{data.Dispose()}}finally{image.Dispose()}}finally{painter.dispose();surface.Dispose()}
console.log('Installed package draws real native Skia PNG.');`);
    process.stdout.write(run('node', ['native.mjs']));
    fs.copyFileSync(path.join(temp, packed.filename), path.join(out, packed.filename));
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ packed: packed.filename, files: packed.files.length, checks: ['installed CJS/ESM constructor identity', 'standalone native ESM import', 'no global mutation', 'compile/pick from installed package', 'strict TypeScript consumer', 'real native Skia PNG from installed package'], passed: true }, null, 2));
    console.log('Package checks PASSED');
}
finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
