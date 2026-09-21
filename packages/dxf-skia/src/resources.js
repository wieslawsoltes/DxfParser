/* Application-owned, explicit local resources. DXF paths are identifiers, never URLs
 * to fetch. Native objects are scoped to one initialized Skia namespace. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, G = A.geometry;
    const resourceKey = name => String(name || '').replace(/\\/g, '/').split('/').pop().normalize('NFC').toLocaleLowerCase();
    class ResourceStore {
        constructor(S, { maxBytes = 128 * 1024 * 1024, maxImagePixels = 64000000 } = {}) {
            if (!S?.SKImage || !S?.SKTypeface)
                throw new TypeError('An initialized SkiaSharpWeb namespace is required.');
            this.S = S;
            this.maxBytes = maxBytes;
            this.maxImagePixels = maxImagePixels;
            this.bytes = 0;
            this.revision = 0;
            this.entries = new Map();
            this.fontSessions = new Map(); this.measurements = new Map(); this.measurementCharacters = 0;
            this.metrics = { fontCreates: 0, measurements: 0, measurementHits: 0 };
            this.disposed = false;
        }
        get(name, kind) { const e = this.entries.get(resourceKey(name)); return e && (!kind || e.kind === kind) ? e : null; }
        register(name, input, { kind } = {}) {
            if (this.disposed)
                throw new Error('Resource store has been disposed.');
            const key = resourceKey(name);
            if (!key)
                throw new TypeError('A resource name is required.');
            const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null;
            if (!bytes?.length)
                throw new TypeError('A nonempty Uint8Array or ArrayBuffer is required.');
            const prior = this.entries.get(key);
            if (this.bytes - (prior?.size || 0) + bytes.byteLength > this.maxBytes)
                throw new RangeError('Resource memory budget exceeded.');
            kind = kind || (/\.(shx|shp)$/i.test(name) ? 'shape' : /\.(ttf|otf|ttc)$/i.test(name) ? 'font' : 'image');
            let native = null, shape = null;
            try {
                if (kind === 'font') {
                    native = this.S.SKTypeface.FromData(bytes);
                    if (!native)
                        throw new Error('Skia rejected the font.');
                }
                else if (kind === 'image') {
                    native = this.S.SKImage.FromEncodedData(bytes);
                    if (!native)
                        throw new Error('Skia rejected the image.');
                    if (native.Width * native.Height > this.maxImagePixels)
                        throw new RangeError('Decoded image pixel budget exceeded.');
                }
                else if (kind === 'shape') {
                    if (!A.ShapeFont)
                        throw new Error('The shape-font module is not loaded.');
                    shape = A.ShapeFont.parse(bytes);
                }
                else
                    throw new TypeError('Unknown resource kind: ' + kind);
                const entry = { name: String(name), key, kind, size: bytes.byteLength, native, shape };
                this.entries.set(key, entry);
                this.bytes += bytes.byteLength - (prior?.size || 0);
                this.revision++;
                this.clearTextCaches();
                prior?.native?.Dispose();
                return entry;
            }
            catch (error) {
                native?.Dispose();
                throw error;
            }
        }
        createFont(entry) {
            // Measure at a large em size; native glyph metrics can quantize at 1/64.
            // Keeping 256 font units per DXF cap height avoids tiny-font quantization.
            const font = new this.S.SKFont(entry.native, 1024);
            font.Hinting = this.S.SKFontHinting.None;
            font.LinearMetrics = true;
            font.Subpixel = true;
            if (!entry.capHeightAtUnit) {
                const m = font.Metrics;
                entry.capHeightAtUnit = Math.max(1e-6, Math.abs(m.CapHeight || -font.GetGlyphBounds(font.GetGlyphs('H'))[0]?.Top || 1024)) / 1024;
            }
            font.DxfUnit = 256;
            font.Size = font.DxfUnit / entry.capHeightAtUnit;
            return font;
        }
        fontSession(entry) {
            if (this.disposed || this.entries.get(entry.key) !== entry || entry.kind !== 'font')
                throw new Error('Font resource is no longer registered.');
            let session = this.fontSessions.get(entry);
            if (session) { this.fontSessions.delete(entry); this.fontSessions.set(entry, session); return session; }
            const font = this.createFont(entry); let shaper;
            try { shaper = new this.S.SKShaper(entry.native); }
            catch (error) { font.Dispose(); throw error; }
            session = { font, shaper }; this.metrics.fontCreates++;
            if (this.fontSessions.size >= 64) {
                const first = this.fontSessions.keys().next().value, old = this.fontSessions.get(first);
                old.shaper.Dispose(); old.font.Dispose(); this.fontSessions.delete(first);
            }
            this.fontSessions.set(entry, session); return session;
        }
        clearTextCaches() {
            for (const session of this.fontSessions.values()) { session.shaper.Dispose(); session.font.Dispose(); }
            this.fontSessions.clear(); this.measurements.clear(); this.measurementCharacters = 0;
        }
        measureText(primitive, text) {
            if (this.disposed) throw new Error('Resource store has been disposed.');
            text = String(text);
            if (text.length > 100000) throw new RangeError('Text measurement budget exceeded.');
            const entry = this.get(primitive.font, 'font') || this.get(primitive.fontName, 'font');
            const shape = this.get(primitive.font, 'shape');
            const cacheKey = (entry?.key || shape?.key || '') + '\0' + text;
            if (this.measurements.has(cacheKey)) {
                const value = this.measurements.get(cacheKey); this.metrics.measurementHits++;
                this.measurements.delete(cacheKey); this.measurements.set(cacheKey, value); return value;
            }
            this.metrics.measurements++;
            let width;
            if (entry) { const { font } = this.fontSession(entry); width = font.MeasureText(text) / font.DxfUnit; }
            else { width = 0; for (const ch of text) width += shape?.shape.glyph(ch.codePointAt(0))?.advance / (shape?.shape.above || 1) || A.draftingGlyph(ch).advance; }
            // Both entry count and stored string volume are bounded.
            while (this.measurements.size && (this.measurements.size >= 4096 || this.measurementCharacters + cacheKey.length > 1000000)) {
                const first = this.measurements.keys().next().value; this.measurementCharacters -= first.length; this.measurements.delete(first);
            }
            if (cacheKey.length <= 1000000) { this.measurements.set(cacheKey, width); this.measurementCharacters += cacheKey.length; }
            return width;
        }
        remove(name) { const key = resourceKey(name), e = this.entries.get(key); if (!e)
            return false; this.clearTextCaches(); this.entries.delete(key); this.bytes -= e.size; this.revision++; e.native?.Dispose(); return true; }
        dispose() { if (this.disposed)
            return; this.disposed = true; this.clearTextCaches(); for (const e of this.entries.values())
            e.native?.Dispose(); this.entries.clear(); this.bytes = 0; this.revision++; }
    }
    class ByteReader {
        constructor(bytes) { this.bytes = bytes; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.i = 0; }
        require(n) { if (n < 0 || this.i + n > this.bytes.length)
            throw new RangeError('Truncated shape resource.'); }
        u8() { this.require(1); return this.bytes[this.i++]; }
        i8() { const b = this.u8(); return b > 127 ? b - 256 : b; }
        u16() { this.require(2); const n = this.view.getUint16(this.i, true); this.i += 2; return n; }
        take(n) { this.require(n); const result = this.bytes.subarray(this.i, this.i + n); this.i += n; return result; }
        string() { const start = this.i; while (this.u8() !== 0) { } return new TextDecoder('windows-1252').decode(this.bytes.subarray(start, this.i - 1)); }
    }
    class ShapeFont {
        constructor({ name = '', above = 10, below = 0, unicode = false, shapes = new Map() } = {}) { Object.assign(this, { name, above, below, unicode, shapes }); this.cache = new Map(); }
        static parse(bytes) {
            const prefix = new TextDecoder('ascii').decode(bytes.subarray(0, Math.min(64, bytes.length))), marker = bytes.indexOf(0x1a), reader = new ByteReader(bytes), shapes = new Map();
            if (prefix.startsWith('AutoCAD-86 bigfont'))
                throw new Error('Bigfont SHX uses a separate multibyte mapping and is not supported.');
            if (marker < 0 || marker > 40)
                throw new Error('Expected a standard SHX shape or unifont header.');
            reader.i = marker + 1;
            if (prefix.startsWith('AutoCAD-86 shapes')) {
                const first = reader.u16(), last = reader.u16(), count = reader.u16();
                if (count > 32768)
                    throw new RangeError('SHX index budget exceeded.');
                const entries = Array.from({ length: count }, () => [reader.u16(), reader.u16()]);
                if (entries.length && (entries[0][0] !== first || entries.at(-1)[0] !== last))
                    throw new Error('Inconsistent SHX shape index.');
                for (const [id, size] of entries) {
                    const record = new ByteReader(reader.take(size)), name = record.string();
                    shapes.set(id, { name, bytes: record.take(size - record.i) });
                }
                const zero = shapes.get(0), above = zero?.bytes[0] || 10, below = zero?.bytes[1] || 0;
                return new ShapeFont({ name: zero?.name || 'SHX shapes', above, below, shapes });
            }
            if (prefix.startsWith('AutoCAD-86 unifont')) {
                reader.require(6);
                reader.i += 6;
                const name = reader.string(), above = reader.u8(), below = reader.u8();
                reader.take(4);
                while (reader.i < bytes.length) {
                    if (shapes.size >= 65536)
                        throw new RangeError('SHX glyph budget exceeded.');
                    const id = reader.u16(), size = reader.u16(), r = new ByteReader(reader.take(size)), glyphName = r.string();
                    shapes.set(id, { name: glyphName, bytes: r.take(size - r.i) });
                }
                return new ShapeFont({ name, above: above || 10, below, unicode: true, shapes });
            }
            throw new Error('Unsupported SHX header; textual SHP files must first be compiled to SHX.');
        }
        glyph(code, { vertical = false, maxOperations = 20000, maxDepth = 24 } = {}) {
            const key = code + ':' + vertical;
            if (this.cache.has(key))
                return this.cache.get(key);
            if (!this.shapes.has(code))
                return null;
            const path = [], stack = [], active = new Set();
            let p = G.vec(), down = true, unit = 1, operations = 0;
            const move = q => { path.push([down ? 'L' : 'M', q]); p = q; }, arc = (radius, a, sweep) => { const c = G.sub(p, G.vec(Math.cos(a) * radius, Math.sin(a) * radius)), segment = G.arcPath(c, G.vec(radius, 0), G.vec(0, radius), a, sweep); if (down)
                path.push(...segment.slice(1));
            else
                path.push(['M', segment.at(-1)[2]]); p = segment.at(-1)[2]; };
            const vectors = [[1, 0], [1, .5], [1, 1], [.5, 1], [0, 1], [-.5, 1], [-1, 1], [-1, .5], [-1, 0], [-1, -.5], [-1, -1], [-.5, -1], [0, -1], [.5, -1], [1, -1], [1, -.5]];
            const run = (id, depth) => {
                if (depth > maxDepth || active.has(id))
                    throw new Error('Recursive SHX shape rejected.');
                const shape = this.shapes.get(id);
                if (!shape)
                    throw new Error(`Undefined SHX subshape ${id}.`);
                active.add(id);
                const r = new ByteReader(shape.bytes);
                let skip = false;
                try {
                    while (r.i < shape.bytes.length) {
                        if (++operations > maxOperations)
                            throw new RangeError('SHX operation budget exceeded.');
                        const code = r.u8(), execute = !skip;
                        skip = false;
                        if (code === 0)
                            return;
                        if (code > 14) {
                            if (execute) {
                                const v = vectors[code & 15], n = (code >> 4) * unit;
                                move(G.add(p, G.vec(v[0] * n, v[1] * n)));
                            }
                            continue;
                        }
                        if (code === 1) {
                            if (execute) {
                                down = true;
                                path.push(['M', p]);
                            }
                        }
                        else if (code === 2) {
                            if (execute)
                                down = false;
                        }
                        else if (code === 3 || code === 4) {
                            const factor = r.u8();
                            if (!factor)
                                throw new RangeError('Zero SHX scale.');
                            if (execute)
                                unit = code === 3 ? unit / factor : unit * factor;
                        }
                        else if (code === 5) {
                            if (execute) {
                                if (stack.length >= 128)
                                    throw new RangeError('SHX stack budget exceeded.');
                                stack.push({ ...p });
                            }
                        }
                        else if (code === 6) {
                            if (execute) {
                                if (!stack.length)
                                    throw new Error('SHX stack underflow.');
                                p = stack.pop();
                                path.push(['M', p]);
                            }
                        }
                        else if (code === 7) {
                            const child = this.unicode ? r.u16() : r.u8();
                            if (execute)
                                run(child, depth + 1);
                        }
                        else if (code === 8 || code === 9) {
                            do {
                                const x = r.i8(), y = r.i8();
                                if (code === 9 && !x && !y)
                                    break;
                                if (execute)
                                    move(G.add(p, G.vec(x * unit, y * unit)));
                                if (code === 8)
                                    break;
                                if (++operations > maxOperations)
                                    throw new RangeError('SHX vector budget exceeded.');
                            } while (true);
                        }
                        else if (code === 10 || code === 11) {
                            let so = 0, eo = 256, radius;
                            if (code === 11) {
                                so = r.u8();
                                eo = r.u8() || 256;
                                radius = (r.u8() << 8) | r.u8();
                            }
                            else
                                radius = r.u8();
                            const flags = r.u8(), sign = flags & 128 ? -1 : 1, spec = flags & 127, start = (spec >> 4) * Math.PI / 4, span = (spec & 15) || 8;
                            if (execute) {
                                const a = start + sign * so * Math.PI / (4 * 256), sweep = sign * ((span - (code === 11 ? 1 : 0)) * Math.PI / 4 + (code === 11 ? eo * Math.PI / (4 * 256) : 0) - so * Math.PI / (4 * 256));
                                arc(radius * unit, a, sweep);
                            }
                        }
                        else if (code === 12 || code === 13) {
                            do {
                                const x = r.i8(), y = r.i8();
                                if (code === 13 && !x && !y)
                                    break;
                                const bulge = r.i8() / 127;
                                if (execute) {
                                    const q = G.add(p, G.vec(x * unit, y * unit)), part = G.bulgePath(p, q, bulge);
                                    if (down)
                                        path.push(...part.slice(1));
                                    else
                                        path.push(['M', q]);
                                    p = q;
                                }
                                if (code === 12)
                                    break;
                                if (++operations > maxOperations)
                                    throw new RangeError('SHX bulge budget exceeded.');
                            } while (true);
                        }
                        else if (code === 14) {
                            if (execute && !vertical)
                                skip = true;
                        }
                    }
                }
                finally {
                    active.delete(id);
                }
            };
            path.push(['M', p]);
            run(code, 0);
            const result = { path, advance: p.x, above: this.above };
            if (this.cache.size >= 2048)
                this.cache.delete(this.cache.keys().next().value);
            this.cache.set(key, result);
            return result;
        }
    }
    /* Original emergency drafting strokes, authored as source geometry. This is not
     * an installed/embedded font and not a substitute for registering the DXF font. */
    const strokeGlyphs = {
        A: '0,0 .3,1 .6,0|.12,.4 .48,.4', B: '0,0 0,1 .4,1 .6,.85 .6,.65 .4,.5 0,.5|.4,.5 .6,.35 .6,.15 .4,0 0,0',
        C: '.6,.85 .45,1 .15,1 0,.8 0,.2 .15,0 .45,0 .6,.15', D: '0,0 0,1 .35,1 .6,.75 .6,.25 .35,0 0,0',
        E: '.6,1 0,1 0,0 .6,0|0,.5 .45,.5', F: '0,0 0,1 .6,1|0,.5 .45,.5',
        G: '.6,.85 .45,1 .15,1 0,.8 0,.2 .15,0 .45,0 .6,.2 .6,.5 .35,.5', H: '0,0 0,1|.6,0 .6,1|0,.5 .6,.5',
        I: '.05,1 .55,1|.3,1 .3,0|.05,0 .55,0', J: '.1,1 .6,1 .6,.2 .45,0 .15,0 0,.2',
        K: '0,0 0,1|.6,1 0,.4|.2,.6 .6,0', L: '0,1 0,0 .6,0', M: '0,0 0,1 .3,.45 .6,1 .6,0',
        N: '0,0 0,1 .6,0 .6,1', O: '.15,0 0,.2 0,.8 .15,1 .45,1 .6,.8 .6,.2 .45,0 .15,0',
        P: '0,0 0,1 .4,1 .6,.8 .6,.65 .4,.5 0,.5', Q: '.15,0 0,.2 0,.8 .15,1 .45,1 .6,.8 .6,.2 .45,0 .15,0|.35,.25 .65,-.1',
        R: '0,0 0,1 .4,1 .6,.8 .6,.65 .4,.5 0,.5|.3,.5 .65,0', S: '.6,.85 .45,1 .15,1 0,.85 0,.65 .15,.5 .45,.5 .6,.35 .6,.15 .45,0 .15,0 0,.15',
        T: '0,1 .6,1|.3,1 .3,0', U: '0,1 0,.2 .15,0 .45,0 .6,.2 .6,1', V: '0,1 .3,0 .6,1',
        W: '0,1 .12,0 .3,.45 .48,0 .6,1', X: '0,1 .6,0|0,0 .6,1', Y: '0,1 .3,.5 .6,1|.3,.5 .3,0', Z: '0,1 .6,1 0,0 .6,0',
        0: '.15,0 0,.2 0,.8 .15,1 .45,1 .6,.8 .6,.2 .45,0 .15,0|.05,.2 .55,.8',
        1: '.1,.8 .3,1 .3,0|.1,0 .5,0', 2: '0,.8 .1,1 .45,1 .6,.85 .6,.7 0,0 .6,0',
        3: '0,.9 .15,1 .45,1 .6,.85 .6,.7 .4,.5 .2,.5|.4,.5 .6,.3 .6,.15 .45,0 .15,0 0,.1',
        4: '.5,0 .5,1 0,.3 .65,.3', 5: '.6,1 0,1 0,.55 .4,.55 .6,.35 .6,.15 .4,0 .15,0 0,.15',
        6: '.55,.9 .4,1 .15,.9 0,.65 0,.2 .15,0 .4,0 .6,.2 .6,.4 .4,.55 .15,.55 0,.4',
        7: '0,1 .6,1 .1,0', 8: '.15,.5 0,.65 0,.85 .15,1 .45,1 .6,.85 .6,.65 .45,.5 .15,.5 0,.3 0,.15 .15,0 .45,0 .6,.15 .6,.3 .45,.5',
        9: '.6,.6 .45,.45 .15,.45 0,.6 0,.8 .15,1 .4,1 .6,.8 .6,.35 .45,.1 .2,0 .05,.1',
        '-': '.05,.5 .55,.5', '_': '0,0 .6,0', '+': '.05,.5 .55,.5|.3,.75 .3,.25', '=': '.05,.65 .55,.65|.05,.35 .55,.35',
        '/': '0,0 .6,1', '\\': '0,1 .6,0', '(': '.5,1 .25,.8 .15,.5 .25,.2 .5,0', ')': '.1,1 .35,.8 .45,.5 .35,.2 .1,0',
        '[': '.5,1 .15,1 .15,0 .5,0', ']': '.1,1 .45,1 .45,0 .1,0', '<': '.55,.85 .1,.5 .55,.15', '>': '.1,.85 .55,.5 .1,.15',
        '.': '.25,.025 .3,.025', ',': '.3,.05 .2,-.1', ':': '.25,.2 .3,.2|.25,.7 .3,.7', ';': '.3,.2 .2,.05|.25,.7 .3,.7',
        '!': '.3,1 .3,.25|.3,.04 .3,0', '?': '0,.8 .1,1 .45,1 .6,.8 .5,.65 .3,.5 .3,.25|.3,.04 .3,0',
        '°': '.2,.7 .1,.8 .1,.95 .2,1 .35,1 .45,.9 .45,.8 .35,.7 .2,.7',
        '±': '.05,.65 .55,.65|.3,.9 .3,.4|.05,.1 .55,.1', 'Ω': '0,0 .2,0 .05,.3 0,.65 .15,1 .45,1 .6,.65 .55,.3 .4,0 .6,0',
        'Ø': '.15,0 0,.2 0,.8 .15,1 .45,1 .6,.8 .6,.2 .45,0 .15,0|0,-.1 .6,1.1'
    };
    const glyphCache = new Map();
    function draftingGlyph(character) {
        if (character === ' ')
            return { path: [], advance: .4 };
        const key = character.toUpperCase();
        if (glyphCache.has(key))
            return glyphCache.get(key);
        const source = strokeGlyphs[key], path = [];
        if (source)
            for (const stroke of source.split('|')) {
                const points = stroke.split(' ').map(pair => { const [x, y] = pair.split(',').map(Number); return G.vec(x, y); });
                path.push(...G.pathFromPoints(points));
            }
        else {
            path.push(...G.pathFromPoints([G.vec(0, 0), G.vec(.6, 0), G.vec(.6, 1), G.vec(0, 1)], true));
            path.push(['M', G.vec(0, 0)], ['L', G.vec(.6, 1)]);
        }
        const result = { path, advance: .75 };
        if (glyphCache.size < 512)
            glyphCache.set(key, result);
        return result;
    }
    Object.assign(A, { ResourceStore, resourceKey, ShapeFont, draftingGlyph });
    if (typeof module === 'object' && module.exports)
        module.exports = A;
})(globalThis);
