import { MAX_INPUT, bytesOf, createOfficeDecoders } from './decoders.mjs';

/** Import is DOM-free; creating the control binds only explicitly supplied host APIs. */
export function createOfficePreview({ window: win, gridWeb: GridWeb, richTextWeb: RichTextWeb, excel, createArchiveView } = {}) {
  if (!win?.document?.createElement || !win.HTMLElement || !win.AbortController) throw new TypeError('A browser window is required.');
  if (createArchiveView != null && typeof createArchiveView !== 'function') throw new TypeError('createArchiveView must be a function.');
  const document = win.document, { URL, Blob, TextDecoder } = win;
  const { legacyWord, legacyWorkbook, safeDocument } = createOfficeDecoders({ excel, gridWeb: GridWeb, richTextWeb: RichTextWeb });
  const compound = bytes => {
    requireAPI(excel?.CFB?.read, 'Excel compound-document decoder');
    return excel.CFB.read(bytes, { type: 'array' });
  };
  const stream = (cfb, name) => excel.CFB.find(cfb, name)?.content;
  function requireAPI(api, name) { if (!api) throw new Error(`${name} must be supplied by the host.`); }
  function requireElement(name) { if (!win.customElements.get(name)) throw new Error(`The host must register ${name} in the supplied window.`); }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  class OfficePreview {
    constructor(options = {}) {
      if (options.onReveal != null && typeof options.onReveal !== 'function') throw new TypeError('onReveal must be a function.');
      this.options = options; this.abort = new win.AbortController(); this.downloads = new Map(); this.generation = 0; this.archiveGeneration = 0; this.theme = 'light'; this.disposed = false;
      this.node = element('section', 'dxf-office-preview'); if (options.id) this.node.id = options.id;
      this.toolbar = element('div', 'dxf-office-toolbar');
      this.fileInput = element('input'); this.fileInput.type = 'file'; this.fileInput.hidden = true;
      this.fileInput.accept = '.xlsx,.xlsm,.xltx,.xls,.xlsb,.csv,.tsv,.docx,.docm,.dotx,.doc,.rtf,.txt,.html,.htm,.zip';
      this.fileInput.setAttribute('aria-label', 'Open Excel or Word document');
      const open = element('button', '', 'Open document…'); open.type = 'button'; open.addEventListener('click', () => this.fileInput.click(), { signal: this.abort.signal });
      this.download = element('button', '', 'Download original'); this.download.type = 'button'; this.download.disabled = true;
      this.download.addEventListener('click', () => this.downloadOriginal(), { signal: this.abort.signal });
      this.zoom = element('select'); this.zoom.setAttribute('aria-label', 'Document zoom');
      for (const n of [50, 75, 100, 125, 150, 200]) { const option = element('option', '', n + '%'); option.value = String(n / 100); this.zoom.append(option); }
      this.zoom.value = '1'; this.zoom.addEventListener('change', () => { if (this.control) this.control.Zoom = Number(this.zoom.value); }, { signal: this.abort.signal });
      this.name = element('span', '', 'Excel / Word / archive preview');
      this.toolbar.append(open, this.download, this.zoom, this.name, this.fileInput);
      this.tabs = element('div', 'dxf-office-tabs'); this.tabs.setAttribute('role', 'tablist'); this.tabs.setAttribute('aria-label', 'Worksheets');
      this.stage = element('div', 'dxf-office-stage');
      this.status = element('p', 'dxf-office-status', 'Open a workbook or Word document, or preview an embedded Office object from the Hex Viewer.'); this.status.setAttribute('role', 'status');
      this.node.append(this.toolbar, this.tabs, this.stage, this.status);
      this.fileInput.addEventListener('change', async () => { const file = this.fileInput.files[0]; this.fileInput.value = ''; if (file) await this.openFile(file); }, { signal: this.abort.signal });
    }
    async openFile(file) {
      if (this.disposed) return false;
      this.cancelPending();
      if (!file || typeof file.arrayBuffer !== 'function') return this.reportError(new TypeError('A readable File is required.'));
      if (file.size > MAX_INPUT) return this.reportError(new RangeError('Document input exceeds 32 MiB.'));
      const generation = ++this.generation;
      try { const bytes = new Uint8Array(await file.arrayBuffer()); if (generation !== this.generation || this.disposed) return false; return await this.open(bytes, file.name); }
      catch (error) { if (generation === this.generation && !this.disposed) this.reportError(error); return false; }
    }
    cancelPending() { this.generation++; this.archiveGeneration++; }
    async open(input, name = 'Document', { embedded = false } = {}) {
      if (this.disposed) return false;
      const generation = ++this.generation;
      this.archiveGeneration++;
      let pendingBook = null, pendingURL = null;
      try {
        const supplied = bytesOf(input);
        if (supplied.length > MAX_INPUT) throw new RangeError('Document input exceeds 32 MiB.');
        const bytes = supplied.slice();
        name = String(name);
        const extension = name.toLowerCase().split('.').pop();
        let decoded = '', type = extension, entries = null, cfb = null;
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
          requireAPI(GridWeb?.readZip, 'GridWeb ZIP decoder');
          entries = await GridWeb.readZip(bytes);
          if (entries.has('xl/workbook.xml')) type = 'xlsx';
          else if (entries.has('word/document.xml')) type = 'docx';
          else if (entries.has('xl/workbook.bin')) type = 'xlsb';
          else { if (embedded) return false; type = 'zip'; }
        } else if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
          cfb = compound(bytes); type = stream(cfb, 'WordDocument') ? 'doc' : 'xls';
        } else {
          decoded = new TextDecoder().decode(bytes);
          if (/^\s*{\\rtf/.test(decoded)) type = 'rtf';
          else if (type === 'doc' && /^\s*(<!doctype|<html)/i.test(decoded)) type = 'html';
          else if (embedded) return false;
        }
        if (generation !== this.generation || this.disposed) return false;
        let control, result, warnings = [];
        if (['xlsx','xls','xlsb','csv','tsv'].includes(type)) {
          requireAPI(GridWeb?.Workbook, 'GridWeb'); requireElement('grid-web');
        }
        if (type === 'xlsx') {
          result = await GridWeb.importXlsx(bytes); pendingBook = result.workbook;
        } else if (['xls', 'xlsb'].includes(type)) {
          result = legacyWorkbook(bytes, name); pendingBook = result.workbook;
        } else if (['csv', 'tsv'].includes(type)) {
          const book = new GridWeb.Workbook({ name }); pendingBook = book;
          book.HistoryLimit = 0;
          GridWeb.importDelimited(book.ActiveWorksheet, decoded, { delimiter: type === 'tsv' ? '\t' : ',', allowFormulas: false });
          book.ClearHistory(); result = { workbook: book, warnings: [] };
        } else if (['docx', 'docm', 'dotx', 'doc', 'rtf', 'html', 'htm'].includes(type)) {
          requireAPI(RichTextWeb?.FlowDocument, 'RichTextWeb'); requireElement('rich-text-page-editor');
          let documentModel;
          if (['docx', 'docm', 'dotx'].includes(type)) documentModel = await RichTextWeb.fromDOCX(bytes);
          else if (type === 'doc') { documentModel = RichTextWeb.fromText(legacyWord(bytes)); warnings.push('Legacy binary Word preview contains main-story text only. Formatting, images and other stories require conversion to DOCX.'); }
          else if (type === 'rtf') documentModel = RichTextWeb.fromRTF(decoded);
          else documentModel = RichTextWeb.fromHTML(decoded);
          if (generation !== this.generation || this.disposed) return false;
          control = element('rich-text-page-editor'); control.IsReadOnly = true;
          control.Document = safeDocument(documentModel); control.DocumentView = 'ReadMode'; control.PageArrangement = 'Vertical'; control.ZoomMode = 'PageWidth';
          warnings.push('RichTextWeb preview; pagination and supported Word features are not Word-identical. Macros and linked resources are not executed.');
        } else if (type === 'zip') {
          entries ||= await GridWeb.readZip(bytes);
          if (generation !== this.generation || this.disposed) return false;
          requireAPI(createArchiveView, 'createArchiveView');
          this.clear(); this.original = bytes; this.filename = name; this.download.disabled = false;
          this.name.textContent = name; this.options.onReveal?.(this);
          await this.browseArchive(bytes, this.stage, entries);
          if (generation !== this.generation || this.disposed) return false;
          this.status.dataset.error = 'false'; this.status.dataset.warning = 'false'; this.status.textContent = 'Select an archive entry, then Preview.'; return true;
        } else if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(type)) {
          control = element('img'); control.alt = name;
          pendingURL = URL.createObjectURL(new Blob([bytes])); control.src = pendingURL;
        } else {
          if (/\x00/.test(decoded) || !decoded) throw new Error('This binary format has no document preview. Use Download in the archive or Hex Viewer.');
          control = element('pre', '', decoded);
        }
        if (generation !== this.generation || this.disposed) { pendingBook?.Dispose(); return false; }
        this.clear(); this.original = bytes; this.filename = name;
        this.imageURL = pendingURL; pendingURL = null;
        this.name.textContent = name; this.download.disabled = false;
        if (result) {
          this.book = result.workbook; pendingBook = null;
          control = element('grid-web'); const emptyBook = control.Workbook; control.Workbook = this.book; emptyBook?.Dispose(); control.ReadOnly = true;
          for (const sheet of this.book.Worksheets) {
            const button = element('button', '', sheet.Name); button.type = 'button'; button.setAttribute('role', 'tab');
            button.addEventListener('click', () => { control.Sheet = sheet; for (const b of this.tabs.children) b.setAttribute('aria-selected', String(b === button)); });
            this.tabs.append(button);
          }
          this.tabs.firstElementChild?.setAttribute('aria-selected', 'true'); warnings.push(...(result.warnings || []));
        }
        this.control = control; this.stage.append(control); this.setTheme(this.theme);
        this.status.textContent = warnings.length ? warnings.join('\n') : 'Read-only preview. Original bytes are retained for download.';
        this.status.dataset.error = 'false'; this.status.dataset.warning = String(warnings.length > 0);
        this.options.onReveal?.(this); return true;
      } catch (error) {
        pendingBook?.Dispose();
        if (generation === this.generation && !this.disposed) this.reportError(error);
        return false;
      } finally { if (pendingURL) URL.revokeObjectURL(pendingURL); }
    }
    async browseArchive(input, container, cachedEntries) {
      if (this.disposed) return false;
      if (!(container instanceof win.HTMLElement) || container.ownerDocument !== document)
        throw new TypeError('Archive container must belong to the supplied window.');
      requireAPI(createArchiveView, 'createArchiveView');
      const generation = ++this.archiveGeneration;
      try {
        const bytes = bytesOf(input);
        if (bytes.length > MAX_INPUT) throw new RangeError('Archive input exceeds 32 MiB.');
        if (!cachedEntries) requireAPI(GridWeb?.readZip, 'GridWeb ZIP decoder');
        const entries = cachedEntries || await GridWeb.readZip(bytes);
        if (generation !== this.archiveGeneration || this.disposed) return;
        const rows = [...entries].map(([name, content]) => ({ key: name, values: [name, name.endsWith('/') ? 'Folder' : 'File', content.length],
          actions: name.endsWith('/') ? [] : [
            { label: 'Preview', run: () => this.open(content, name) },
            { label: 'Download', run: () => this.saveBytes(content, name) }
          ] }));
        this.archiveViews ||= new Map();
        this.archiveViews.get(container)?.dispose(); container.replaceChildren();
        const view = createArchiveView(container, { title: 'Archive Entries', columns: [{ title: 'Path', width: 430 }, 'Kind', 'Bytes'], rows });
        this.archiveViews.set(container, view); view.setTheme(this.theme);
        return true;
      } catch (error) { if (generation === this.archiveGeneration && !this.disposed) { this.archiveViews?.get(container)?.dispose(); this.archiveViews?.delete(container); container.replaceChildren(element('p', 'dxf-office-status', error.message)); } }
    }
    reportError(error) {
      this.status.textContent = 'Preview failed: ' + error.message;
      this.status.dataset.error = 'true'; this.status.dataset.warning = 'false'; this.options.onReveal?.(this);
      return false;
    }
    setTheme(theme) { this.theme = theme === 'dark' ? 'dark' : 'light'; this.control?.setAttribute('theme', this.theme); for (const view of this.archiveViews?.values() || []) view.setTheme(this.theme); }
    saveBytes(bytes, name) {
      if (this.disposed) return;
      const url = URL.createObjectURL(new Blob([bytesOf(bytes)], { type: 'application/octet-stream' }));
      const link = element('a'); link.href = url; link.download = String(name).split(/[\\/]/).pop(); link.click();
      const timer = win.setTimeout(() => { this.downloads.delete(url); URL.revokeObjectURL(url); }, 1000);
      this.downloads.set(url, timer);
    }
    downloadOriginal() { if (this.original) this.saveBytes(this.original, this.filename); }
    clear() {
      this.control?.Dispose?.(); this.control = null; this.book?.Dispose(); this.book = null;
      this.archiveViews?.get(this.stage)?.dispose(); this.archiveViews?.delete(this.stage);
      this.stage.replaceChildren(); this.tabs.replaceChildren();
      if (this.imageURL) URL.revokeObjectURL(this.imageURL); this.imageURL = null;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true; this.cancelPending(); this.abort.abort(); this.clear();
      for (const [url, timer] of this.downloads) { win.clearTimeout(timer); URL.revokeObjectURL(url); }
      this.downloads.clear(); this.download.disabled = true;
      this.options = {};
      for (const view of this.archiveViews?.values() || []) view.dispose(); this.archiveViews?.clear(); this.original = null;
    }
  }
  return OfficePreview;
}
