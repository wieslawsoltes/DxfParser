import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createDockingWorkspace, FORMAT, VERSION } from '../packages/dxf-workspace/index.mjs';
import { createOfficePreview, createOfficeDecoders, bytesOf, MAX_INPUT } from '../packages/dxf-office-preview/index.mjs';

test('workspace and preview factories reject missing browser APIs without globals', () => {
  assert.throws(() => createDockingWorkspace(), /browser window/);
  assert.throws(() => createOfficePreview(), /browser window/);
  assert.equal(globalThis.DxfDocking, undefined);
  assert.equal(globalThis.DxfOffice, undefined);
  assert.equal(FORMAT, 'dxfparser-dockyard-workspace'); assert.equal(VERSION, 1);
  assert.equal(MAX_INPUT, 33554432);
});

test('byte adapters accept offset Uint8Array, Buffer and foreign realm buffers', () => {
  const input = new Uint8Array([8, 1, 2, 9]);
  assert.deepEqual([...bytesOf(input.subarray(1, 3))], [1, 2]);
  assert.deepEqual([...bytesOf(Buffer.from([3, 4]))], [3, 4]);
  assert.deepEqual([...bytesOf(vm.runInNewContext('new Uint8Array([5, 6])'))], [5, 6]);
  assert.deepEqual([...bytesOf(vm.runInNewContext('new Uint8Array([7, 8]).buffer'))], [7, 8]);
  for (const value of [null, {}, [], new Uint16Array([1]), 'text', new DataView(input.buffer)])
    assert.throws(() => bytesOf(value), /file bytes/);
});

test('decoder factory does not resolve ambient Office globals', () => {
  const decoder = createOfficeDecoders();
  assert.throws(() => decoder.legacyWord(new Uint8Array()), /compound-document decoder/);
  assert.throws(() => decoder.legacyWorkbook(new Uint8Array(), 'book'), /Excel compatibility decoder/);
  assert.throws(() => decoder.safeDocument({ ToJSON: () => ({}) }), /RichTextWeb/);
});

test('document-media filtering does not mutate host models', () => {
  const json = { props: { Source: 'https://remote.invalid/image.png' }, children: [
    { props: { src: 'data:image/png;base64,AA==' } }, { props: { source: 'blob:local-resource' } },
    { props: { src: 'javascript:bad()' } }, { props: { Source: 'file:///local.png' } }
  ] };
  const decoder = createOfficeDecoders({ richTextWeb: { FlowDocument: { FromJSON: x => x } } });
  const out = decoder.safeDocument({ ToJSON: () => json });
  assert.equal(out.props.Source, undefined); assert.ok(json.props.Source);
  assert.equal(out.children[0].props.src, json.children[0].props.src);
  assert.equal(out.children[1].props.source, 'blob:local-resource');
  assert.equal(out.children[2].props.src, undefined); assert.equal(out.children[3].props.Source, undefined);
});

test('legacy Word decoder consumes only injected compound streams and rejects encrypted data', () => {
  const word = new Uint8Array(512), view = new DataView(word.buffer);
  view.setUint16(0, 0xa5ec, true); view.setUint16(2, 0xc1, true); view.setUint16(10, 0x8100, true);
  const decoder = createOfficeDecoders({ excel: { CFB: {
    read: () => ({}), find: (_, name) => name === 'WordDocument' ? { content: word } : undefined
  } } });
  assert.throws(() => decoder.legacyWord(word), /Encrypted/);
  view.setUint16(10, 0, true); assert.throws(() => decoder.legacyWord(word), /story sizes/);
});

test('legacy workbook import disposes the allocated workbook when decoding projection fails', () => {
  let disposed = 0;
  const decoder = createOfficeDecoders({ excel: { read: () => ({ SheetNames: ['Sheet'], Sheets: { Sheet: { A1: {v: 3} } } }) },
    gridWeb: { Workbook: class {
      ActiveWorksheet = { GetCell() { throw new Error('cell failed'); } };
      Dispose() { disposed++; }
    } }
  });
  assert.throws(() => decoder.legacyWorkbook(new Uint8Array(), 'bad.xls'), /cell failed/);
  assert.equal(disposed, 1);
});

test('workspace factory does not read realm storage until explicitly saving or restoring', () => {
  let reads = 0;
  const win = { document: { createElement() {} }, HTMLElement: class {}, AbortController, ResizeObserver: class {},
    requestAnimationFrame() {}, cancelAnimationFrame() {}, setTimeout, clearTimeout, queueMicrotask,
    get localStorage() { reads++; throw new Error('blocked storage'); } };
  const dockyard = { DockingManager: class {}, JsonLayoutSerializer: class {}, LayoutDocument: class {} };
  assert.equal(typeof createDockingWorkspace({ window: win, dockyard }).Workspace, 'function');
  assert.equal(reads, 0);
  assert.throws(() => createDockingWorkspace({ window: win, dockyard, storage: {} }), /Storage/);
});
