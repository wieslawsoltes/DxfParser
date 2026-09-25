# @wieslawsoltes/dxf-office-preview

Reusable read-only workbook, document, image, text and archive previews. The host
supplies GridWeb, RichTextWeb, an optional legacy Excel/CFB decoder and an archive
record-view factory. No application, docking, vendor-path or global-service imports
are required. The original bytes are retained separately for download.

## Browser integration

Register the host's `grid-web` and `rich-text-page-editor` custom elements in the
supplied window and load this package's `styles.css`. Each optional format checks
its dependencies before replacing the current preview; text and image presentation
need neither vendor control. ZIP containers, including DOCX/XLSX, use GridWeb's ZIP
reader. Archive record views are provided by the host, not imported from DxfParser.

```js
import { createOfficePreview } from '@wieslawsoltes/dxf-office-preview';

const Preview = createOfficePreview({
  window, gridWeb: GridWeb, richTextWeb: RichTextWeb, excel: XLSX,
  createArchiveView: (container, options) => new reportUI.AnalysisView(container, options)
});
const preview = new Preview({ onReveal: () => showPreviewPanel() });
document.getElementById('preview').append(preview.node);
await preview.open(new TextEncoder().encode('Tag,Count\nPump,2'), 'equipment.csv');
preview.setTheme('dark');
// Dispose when the host removes the control.
preview.dispose();
```

Factories and instances do not install globals, register vendor elements, select
application panels, or patch workspace disposal. Supply a unique `id` only when
needed. Import is DOM-free and safe in Node; constructing UI requires a browser.

`openFile`, `open` and `browseArchive` guard pending reads against replacement and
disposal. Byte input is copied before asynchronous decoding. Archive containers
must belong to the supplied document. `cancelPending` invalidates outstanding
operations without removing the current preview. `dispose` is idempotent, releases
preview-owned controls/workbooks/archive views, aborts UI listeners, and revokes
owned image/download object URLs. It never disposes the host's libraries.

## Format boundaries

Input is limited to 32 MiB. Legacy Excel is a cached-value preview with supported
formatting and a 250,000-populated-cell limit. Legacy Word supports bounded main-
story text only. It does not reconstruct unsupported binary formatting or stories.
Modern format fidelity and decompression limits depend on the supplied decoders.
Macros are not executed; CSV/TSV formulas are imported as literals. Remote linked
media is removed from RichTextWeb models. Original downloads remain original files,
not sanitized rewrites. This is not an Office editing or conversion engine.

`createOfficeDecoders` exposes the legacy decoders and document-media filtering
without a browser. Decoder dependencies are supplied explicitly. `bytesOf` accepts
Uint8Array/Buffer or ArrayBuffer, including values from another JavaScript realm.

## Packaging

ESM is canonical. Node 22.13+ CommonJS consumers share the same exports through
`index.cjs`. The package contains TypeScript contracts and CSS; it needs no build or
install-time dependencies. `npm pack ./packages/dxf-office-preview` creates a local
tarball from the repository root and does not publish to npm.

## License

[MIT](LICENSE). Host-supplied dependencies retain their own licenses.
