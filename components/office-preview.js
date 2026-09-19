/* Local-only Excel/Word previews in retained Dockyard content. */
(function (global) {
  'use strict';
  const MAX_INPUT = 32 * 1024 * 1024;
  const MAX_CELLS = 250000;
  const { element } = global.DxfGrid;
  function bytesOf(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    throw new TypeError('Expected file bytes.');
  }
  function compound(bytes) {
    if (!global.XLSX?.CFB) throw new Error('The local compound-document decoder is unavailable.');
    return XLSX.CFB.read(bytes, { type: 'array' });
  }
  function stream(cfb, name) {
    const content = XLSX.CFB.find(cfb, name)?.content;
    return content == null ? null : content instanceof Uint8Array ? content : new Uint8Array(content);
  }
  /** Word 97–2003 main-story text. Binary formatting is deliberately not invented. */
  function legacyWord(bytes) {
    const cfb = compound(bytes), word = stream(cfb, 'WordDocument');
    if (!word || word.length < 154) throw new Error('Not a supported Word 97–2003 document.');
    const w = new DataView(word.buffer, word.byteOffset, word.byteLength);
    if (w.getUint16(0, true) !== 0xa5ec || w.getUint16(2, true) < 0xc1) throw new Error('This older Word binary version is not supported. Save it as DOCX.');
    const flags = w.getUint16(10, true);
    if (flags & 0x8100) throw new Error('Encrypted or obfuscated Word documents are not supported.');
    let p = 32;
    const csw = w.getUint16(p, true); p += 2 + csw * 2;
    if (p + 2 > word.length) throw new Error('Invalid Word FIB.');
    const cslw = w.getUint16(p, true); p += 2;
    if (cslw < 4 || p + cslw * 4 + 2 > word.length) throw new Error('Invalid Word story sizes.');
    const characters = w.getUint32(p + 12, true); p += cslw * 4;
    const pairs = w.getUint16(p, true); p += 2;
    if (characters > 8000000 || pairs < 34 || p + pairs * 8 > word.length) throw new Error('Invalid or oversized Word piece table.');
    const fc = w.getUint32(p + 33 * 8, true), length = w.getUint32(p + 33 * 8 + 4, true);
    const table = stream(cfb, flags & 0x200 ? '1Table' : '0Table');
    if (!table || fc + length > table.length || !length) throw new Error('Missing Word piece table; save the document as DOCX.');
    const t = new DataView(table.buffer, table.byteOffset, table.byteLength);
    p = fc;
    while (p < fc + length && table[p] === 1) {
      if (p + 3 > fc + length) throw new Error('Truncated Word formatting record.');
      p += 3 + t.getUint16(p + 1, true);
    }
    if (p + 5 > fc + length || table[p] !== 2) throw new Error('Missing Word text pieces.');
    const size = t.getUint32(p + 1, true); p += 5;
    const count = (size - 4) / 12;
    if (!Number.isInteger(count) || count < 0 || count > 100000 || p + size > fc + length) throw new Error('Invalid Word piece count.');
    const parts = [];
    for (let i = 0; i < count; i++) {
      const start = t.getUint32(p + i * 4, true), end = t.getUint32(p + (i + 1) * 4, true);
      if (end < start) throw new Error('Unordered Word text pieces.');
      if (start >= characters) break;
      const encoded = t.getUint32(p + 4 * (count + 1) + i * 8 + 2, true);
      const compressed = !!(encoded & 0x40000000);
      const offset = (encoded & 0x3fffffff) / (compressed ? 2 : 1);
      const sizeBytes = (Math.min(end, characters) - start) * (compressed ? 1 : 2);
      if (!Number.isInteger(offset) || offset + sizeBytes > word.length) throw new Error('Word text piece is outside the document stream.');
      parts.push(new TextDecoder(compressed ? 'windows-1252' : 'utf-16le').decode(word.subarray(offset, offset + sizeBytes)));
    }
    return parts.join('').replace(/\r/g, '\n').replace(/\x07/g, '\t').replace(/[\x00-\x08\x0b-\x1f]/g, '');
  }
  function legacyWorkbook(bytes, name) {
    if (!global.XLSX) throw new Error('The local Excel compatibility decoder is unavailable.');
    const input = XLSX.read(bytes, { type: 'array', cellStyles: true, cellNF: true, cellDates: false, bookVBA: false });
    const book = new GridWeb.Workbook({ name }); book.HistoryLimit = 0; book.CalculationMode = 'Manual';
    let total = 0;
    try {
      input.SheetNames.forEach((name, index) => {
        const source = input.Sheets[name];
        const sheet = index ? book.Worksheets.Add(name) : book.ActiveWorksheet;
        if (!index) sheet.Name = name;
        for (const address of Object.keys(source)) {
          if (address[0] === '!' || !/^[A-Z]+[1-9]\d*$/.test(address)) continue;
          if (++total > MAX_CELLS) throw new RangeError('Excel preview exceeds 250,000 populated cells.');
          const cell = source[address], target = sheet.GetCell(address);
          // Use cached values for binary Excel. Never execute VBA or external links.
          target.Value = cell.v ?? '';
          if (cell.z) target.Style = { numberFormat: cell.z };
          if (cell.f) target.Comment = 'Original formula (cached value): =' + cell.f;
        }
        for (const [column, value] of (source['!cols'] || []).entries()) if (value) sheet.SetColumnWidth(column, Math.min(1200, Math.max(20, value.wpx || (value.wch || 10) * 7)));
        for (const merge of source['!merges'] || []) {
          if ((merge.e.r - merge.s.r + 1) * (merge.e.c - merge.s.c + 1) > MAX_CELLS) continue;
          sheet.GetRange(XLSX.utils.encode_range(merge)).Merge();
        }
      });
      book.ClearHistory(); return { workbook: book, warnings: ['Legacy Excel compatibility preview: cached formula results and supported formatting; VBA, external links and unsupported Excel features are not executed.'] };
    } catch (error) { book.Dispose(); throw error; }
  }
  function safeDocument(documentModel) {
    const json = documentModel.ToJSON();
    const visit = node => {
      // RichTextWeb sanitizes markup. Additionally prohibit automatic linked media loads.
      for (const key of ['Source', 'source', 'src']) if (typeof node.props?.[key] === 'string' && !/^(data:image\/(png|jpeg|gif|webp);|blob:)/i.test(node.props[key])) delete node.props[key];
      for (const child of node.children || []) visit(child);
    };
    visit(json); return RichTextWeb.FlowDocument.FromJSON(json);
  }
  class OfficePreview {
    constructor(app) {
      this.app = app; this.generation = 0; this.archiveGeneration = 0; this.theme = 'light'; this.disposed = false;
      this.node = element('section', 'dxf-office-preview'); this.node.id = 'officeDocumentPreview';
      this.toolbar = element('div', 'dxf-office-toolbar');
      this.fileInput = element('input'); this.fileInput.type = 'file'; this.fileInput.hidden = true;
      this.fileInput.accept = '.xlsx,.xlsm,.xltx,.xls,.xlsb,.csv,.tsv,.docx,.docm,.dotx,.doc,.rtf,.txt,.html,.htm,.zip';
      this.fileInput.setAttribute('aria-label', 'Open Excel or Word document');
      const open = element('button', '', 'Open document…'); open.type = 'button'; open.addEventListener('click', () => this.fileInput.click());
      this.download = element('button', '', 'Download original'); this.download.type = 'button'; this.download.disabled = true;
      this.download.addEventListener('click', () => this.downloadOriginal());
      this.zoom = element('select'); this.zoom.setAttribute('aria-label', 'Document zoom');
      for (const n of [50, 75, 100, 125, 150, 200]) { const option = element('option', '', n + '%'); option.value = String(n / 100); this.zoom.append(option); }
      this.zoom.value = '1'; this.zoom.addEventListener('change', () => { if (this.control) this.control.Zoom = Number(this.zoom.value); });
      this.name = element('span', '', 'Excel / Word / archive preview');
      this.toolbar.append(open, this.download, this.zoom, this.name, this.fileInput);
      this.tabs = element('div', 'dxf-office-tabs'); this.tabs.setAttribute('role', 'tablist'); this.tabs.setAttribute('aria-label', 'Worksheets');
      this.stage = element('div', 'dxf-office-stage');
      this.status = element('p', 'dxf-office-status', 'Open a workbook or Word document, or preview an embedded Office object from the Hex Viewer.'); this.status.setAttribute('role', 'status');
      this.node.append(this.toolbar, this.tabs, this.stage, this.status);
      this.fileInput.addEventListener('change', async () => { const file = this.fileInput.files[0]; this.fileInput.value = ''; if (file) await this.openFile(file); });
    }
    attachWorkspace(workspace) {
      this.workspace = workspace;
      const button = element('button', 'dxf-office-launcher', 'Documents…'); button.type = 'button';
      button.addEventListener('click', () => workspace.show('document-preview'));
      workspace.toolbar.append(button);
      const theme = () => this.setTheme(String(workspace.manager.Theme?.Name || workspace.manager.Theme || 'light').toLowerCase());
      workspace.unsubscribers.push(workspace.manager.ThemeChanged.add(theme)); theme();
      const dispose = workspace.dispose.bind(workspace);
      workspace.dispose = () => { this.dispose(); dispose(); };
    }
    async openFile(file) {
      if (this.disposed) return false;
      this.cancelPending();
      if (file.size > MAX_INPUT) return this.reportError(new RangeError('Document input exceeds 32 MiB.'));
      const generation = ++this.generation;
      try { const bytes = new Uint8Array(await file.arrayBuffer()); if (generation !== this.generation || this.disposed) return false; return await this.open(bytes, file.name); }
      catch (error) { if (generation === this.generation) this.reportError(error); return false; }
    }
    cancelPending() { this.generation++; this.archiveGeneration++; }
    async open(input, name = 'Document', { embedded = false } = {}) {
      if (this.disposed) return false;
      const generation = ++this.generation;
      let pendingBook = null;
      try {
        const bytes = bytesOf(input);
        if (bytes.length > MAX_INPUT) throw new RangeError('Document input exceeds 32 MiB.');
        const extension = name.toLowerCase().split('.').pop();
        let decoded = '', type = extension, entries = null, cfb = null;
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
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
          RichTextWeb.registerRichTextWeb();
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
          this.clear(); this.original = bytes.slice(); this.filename = name; this.download.disabled = false;
          this.name.textContent = name; this.workspace?.show('document-preview');
          await this.browseArchive(bytes, this.stage, entries); this.status.dataset.error = 'false'; this.status.dataset.warning = 'false'; this.status.textContent = 'Select an archive entry, then Preview.'; return true;
        } else if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(type)) {
          control = element('img'); control.alt = name;
          this.pendingImageURL = URL.createObjectURL(new Blob([bytes])); control.src = this.pendingImageURL;
        } else {
          if (/\x00/.test(decoded) || !decoded) throw new Error('This binary format has no document preview. Use Download in the archive or Hex Viewer.');
          control = element('pre', '', decoded);
        }
        if (generation !== this.generation || this.disposed) { pendingBook?.Dispose(); return false; }
        this.clear(); this.original = bytes.slice(); this.filename = name;
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
        this.workspace?.show('document-preview'); return true;
      } catch (error) {
        pendingBook?.Dispose();
        if (generation === this.generation && !this.disposed) this.reportError(error);
        return false;
      }
    }
    async browseArchive(input, container, cachedEntries) {
      const generation = ++this.archiveGeneration;
      try {
        const bytes = bytesOf(input);
        const entries = cachedEntries || await GridWeb.readZip(bytes);
        if (generation !== this.archiveGeneration || this.disposed) return;
        const rows = [...entries].map(([name, content]) => ({ key: name, values: [name, name.endsWith('/') ? 'Folder' : 'File', content.length],
          actions: name.endsWith('/') ? [] : [
            { label: 'Preview', run: () => this.open(content, name) },
            { label: 'Download', run: () => this.saveBytes(content, name) }
          ] }));
        this.archiveViews ||= new Map();
        this.archiveViews.get(container)?.dispose(); container.replaceChildren();
        const view = new (global.DxfAnalysis?.AnalysisView || DxfGrid.GridView)(container, { title: 'Archive Entries', columns: [{ title: 'Path', width: 430 }, 'Kind', 'Bytes'], rows });
        this.archiveViews.set(container, view);
      } catch (error) { if (generation === this.archiveGeneration && !this.disposed) { this.archiveViews?.get(container)?.dispose(); this.archiveViews?.delete(container); container.replaceChildren(element('p', 'dxf-office-status', error.message)); } }
    }
    reportError(error) {
      this.status.textContent = 'Preview failed: ' + error.message;
      this.status.dataset.error = 'true'; this.status.dataset.warning = 'false'; this.workspace?.show('document-preview');
      return false;
    }
    setTheme(theme) { this.theme = theme === 'dark' ? 'dark' : 'light'; this.control?.setAttribute('theme', this.theme); for (const view of this.archiveViews?.values() || []) view.setTheme(this.theme); }
    saveBytes(bytes, name) {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      const link = element('a'); link.href = url; link.download = String(name).split(/[\\/]/).pop(); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    downloadOriginal() { if (this.original) this.saveBytes(this.original, this.filename); }
    clear() {
      this.control?.Dispose?.(); this.control = null; this.book?.Dispose(); this.book = null;
      this.archiveViews?.get(this.stage)?.dispose(); this.archiveViews?.delete(this.stage);
      this.stage.replaceChildren(); this.tabs.replaceChildren();
      if (this.imageURL) URL.revokeObjectURL(this.imageURL); this.imageURL = this.pendingImageURL; this.pendingImageURL = null;
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true; this.cancelPending(); this.clear();
      for (const view of this.archiveViews?.values() || []) view.dispose(); this.archiveViews?.clear(); this.original = null;
    }
  }
  function createPanel(app) {
    const preview = app.officePreview = new OfficePreview(app);
    return { id: 'document-preview', title: 'Document Preview', node: preview.node, floating: true, width: 960, height: 700 };
  }
  global.DxfOffice = { OfficePreview, createPanel, legacyWord, legacyWorkbook, MAX_INPUT };
})(window);
