export const MAX_INPUT = 32 * 1024 * 1024;
export const MAX_CELLS = 250000;

/** Accept Uint8Array/Buffer and ArrayBuffer, including buffers from another realm. */
export function bytesOf(value) {
  if (ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]')
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  try { ArrayBuffer.prototype.slice.call(value, 0, 0); return new Uint8Array(value); }
  catch { throw new TypeError('Expected Uint8Array or ArrayBuffer file bytes.'); }
}

export function createOfficeDecoders({ excel: XLSX, gridWeb: GridWeb, richTextWeb: RichTextWeb } = {}) {
  function compound(bytes) {
    if (!XLSX?.CFB) throw new Error('The local compound-document decoder is unavailable.');
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
    if (!XLSX) throw new Error('The local Excel compatibility decoder is unavailable.');
    if (!GridWeb?.Workbook) throw new Error('GridWeb must be supplied by the host.');
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
    if (!RichTextWeb?.FlowDocument?.FromJSON) throw new Error('RichTextWeb must be supplied by the host.');
    const json = structuredClone(documentModel.ToJSON());
    const visit = node => {
      // RichTextWeb sanitizes markup. Additionally prohibit automatic linked media loads.
      for (const key of ['Source', 'source', 'src']) if (typeof node.props?.[key] === 'string' && !/^(data:image\/(png|jpeg|gif|webp);|blob:)/i.test(node.props[key])) delete node.props[key];
      for (const child of node.children || []) visit(child);
    };
    visit(json); return RichTextWeb.FlowDocument.FromJSON(json);
  }
  return { legacyWord, legacyWorkbook, safeDocument };
}
