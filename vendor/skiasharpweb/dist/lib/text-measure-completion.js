/** Numeric .NET BreakText results; the earlier object result is BreakTextDetails.
 * Byte inputs return bytes, strings return UTF-16 code units. Glyph IDs are
 * measured directly rather than accidentally reinterpreted as Unicode.
 */
export function installTextMeasureCompletion(K, api) {
  const f = Math.fround, val = x => x?.value ?? x;
  const isBytes = x => x instanceof ArrayBuffer || x instanceof Uint8Array || x instanceof DataView;
  const enc = x => typeof x === 'string' ? api.SKTextEncoding[x] : val(x);
  const utf8 = new TextEncoder();
  function units(input, encoding) {
    if (!isBytes(input)) {
      if (input == null) input = '';
      if (Array.isArray(input)) input = input.join('');
      if (typeof input !== 'string') throw new TypeError('BreakText expects text or an explicitly encoded byte buffer.');
      const chars = Array.from(input);
      return { text: input, chars, sizes: chars.map(c => c.length), glyphs: null };
    }
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (![0, 1, 2, 3].includes(encoding)) throw new RangeError('Byte input requires an SKTextEncoding.');
    if (encoding === 3) {
      if (bytes.length % 2) throw new RangeError('GlyphId bytes must be UInt16-aligned.');
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { text: null, chars: null, sizes: Array(bytes.length / 2).fill(2), glyphs: Uint16Array.from({ length: bytes.length / 2 }, (_, i) => view.getUint16(i * 2, true)) };
    }
    let text;
    if (encoding === 0) text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    else if (encoding === 1) {
      if (bytes.length % 2) throw new RangeError('UTF-16 input has odd byte length.');
      text = new TextDecoder('utf-16le', { fatal: true, ignoreBOM: true }).decode(bytes);
    } else {
      if (bytes.length % 4) throw new RangeError('UTF-32 input is not aligned.');
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), chars = [];
      for (let i = 0; i < bytes.length; i += 4) {
        const cp = view.getUint32(i, true);
        if (cp > 0x10ffff || cp >= 0xd800 && cp <= 0xdfff) throw new RangeError('Invalid UTF-32 scalar.');
        chars.push(String.fromCodePoint(cp));
      }
      text = chars.join('');
    }
    const chars = Array.from(text);
    return { text, chars, glyphs: null, sizes: chars.map(c => encoding === 0 ? utf8.encode(c).length : encoding === 1 ? c.length * 2 : 4) };
  }
  api.SKFont.prototype.BreakTextDetails = function (input, ...args) {
    this.ThrowIfDisposed();
    const encoding = isBytes(input) ? enc(args.shift()) : null;
    const maxWidth = f(args.shift());
    let paint = null, out = null;
    for (const arg of args) {
      if (arg == null) continue;
      if (arg instanceof api.SKPaint) { if (paint) throw new TypeError('Only one paint may be supplied.'); paint = arg; }
      else if (typeof arg === 'object' && !out) out = arg;
      else throw new TypeError('Expected measured-width output and optional paint.');
    }
    paint?.ThrowIfDisposed();
    const data = units(input, encoding);
    let measured = 0, count = 0, size = 0;
    if (!(maxWidth <= 0) && data.sizes.length) {
      const widths = this.GetGlyphWidths(data.glyphs ?? data.text, paint);
      for (const width of widths) {
        const next = f(measured + width);
        if (next > maxWidth) break;
        measured = next; size += data.sizes[count++];
      }
    }
    const text = data.chars ? data.chars.slice(0, count).join('') : null;
    const result = { Count: size, CodepointCount: count, MeasuredWidth: measured, Text: text };
    // The pinned managed wrapper does not write the width slot on empty input.
    if (out && data.sizes.length) Object.assign(out, { Value: measured, MeasuredWidth: measured, Text: text, MeasuredText: text });
    return result;
  };
  api.SKFont.prototype.BreakText = function (...args) { return this.BreakTextDetails(...args).Count; };
  for (const name of ['BreakText', 'BreakTextDetails']) api.SKPaint.prototype[name] = function (input, ...args) {
    const font = this.ToFont();
    try { return font[name](input, ...(isBytes(input) ? [this.TextEncoding, ...args] : args), this); }
    finally { font.Dispose(); }
  };
}
