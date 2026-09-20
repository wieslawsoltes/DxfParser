/* DXF tagged document model, independent of the legacy parser/tree and renderer. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, G = A.geometry;
    const key = value => String(value ?? '').trim().toUpperCase();
    class Diagnostics {
        constructor(limit = 1000) { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000)
            throw new RangeError('Diagnostic limit must be 1–10000.'); this.limit = limit; this.items = []; this.counts = Object.create(null); this.seen = new Set(); }
        add(code, message, entity = null, severity = 'warning') {
            code = String(code).slice(0, 128);
            message = String(message).slice(0, 2048);
            const k = code + '|' + (entity?.id || entity?.handle || '') + '|' + message;
            if (this.seen.has(k))
                return;
            if (this.seen.size < Math.max(this.limit * 4, 4000))
                this.seen.add(k);
            this.counts[code] = (this.counts[code] || 0) + 1;
            if (this.items.length < this.limit)
                this.items.push(Object.freeze({ code, severity, message, handle: entity?.handle || null, type: entity?.type || null, line: entity?.line ?? null }));
        }
    }
    function parseTags(text, { maxBytes = 64 * 1024 * 1024, maxTags = 4000000 } = {}) {
        if (typeof text !== 'string')
            throw new TypeError('DXF source must be a string.');
        if (text.length > maxBytes)
            throw new RangeError('DXF text budget exceeded.');
        if (text.startsWith('AutoCAD Binary DXF'))
            throw new Error('Binary DXF requires decoding to text tags before compilation.');
        text = text.replace(/^\uFEFF/, '');
        const lines = text.split(/\r\n|\n|\r/), tags = [];
        for (let i = 0; i < lines.length;) {
            const line = i + 1, raw = lines[i++].trim();
            if (!raw)
                continue;
            if (!/^[+-]?\d+$/.test(raw) || i >= lines.length)
                throw new SyntaxError(`Invalid DXF group at line ${line}.`);
            const code = Number(raw);
            if (code < 0 || code > 1071)
                throw new RangeError(`DXF group code ${code} outside supported range.`);
            tags.push({ code, value: lines[i++], line });
            if (tags.length > maxTags)
                throw new RangeError('DXF tag budget exceeded.');
        }
        return tags;
    }
    class DxfRecord {
        constructor(tags, index = 0) {
            this.type = key(tags[0]?.value);
            this.tags = tags.slice(1);
            this.properties = this.tags;
            this.line = tags[0]?.line ?? index;
            this.handle = key(this.get(5, this.get(105, '')));
            this.id = `${this.handle || '@'}:${this.line}:${index}`;
            this.layer = String(this.get(8, '0')).trim() || '0';
            this.layout = String(this.get(410, '')).trim();
            this.space = Number(this.get(67, 0)) === 1 ? 'paper' : 'model';
            this.children = [];
            this.attributes = [];
            this.vertices = [];
            this.ownerHandle = key(this.get(330, ''));
            this.extrusion = this.point(210, G.vec(0, 0, 1));
        }
        get(code, fallback = null) { const t = this.tags.find(t => t.code === code); return t === undefined ? fallback : t.value; }
        num(code, fallback = 0) { const v = this.get(code, null); if (v === null || String(v).trim() === '')
            return fallback; const n = Number(v); if (!Number.isFinite(n))
            throw new RangeError(`${this.type} #${this.handle}: nonfinite group ${code}.`); return n; }
        all(code) { return this.tags.filter(t => t.code === code).map(t => t.value); }
        point(code = 10, fallback = G.vec()) { return G.vec(this.num(code, fallback.x), this.num(code + 10, fallback.y), this.num(code + 20, fallback.z || 0)); }
        points(code = 10) { const out = []; let p = null; for (const t of this.tags) {
            if (t.code === code) {
                p = G.vec(Number(t.value), 0, 0);
                out.push(p);
            }
            else if (p && t.code === code + 10)
                p.y = Number(t.value);
            else if (p && t.code === code + 20)
                p.z = Number(t.value);
        } if (out.some(p => !G.validPoint(p)))
            throw new RangeError('Nonfinite point coordinate.'); return out; }
        subclass(name) { const start = this.tags.findIndex(t => t.code === 100 && t.value === name); if (start < 0)
            return this; const end = this.tags.findIndex((t, i) => i > start && t.code === 100); return new DxfRecord([{ code: 0, value: this.type }, ...this.tags.slice(start + 1, end < 0 ? undefined : end)]); }
    }
    const colorObject = n => ({ red: (n >> 16) & 255, green: (n >> 8) & 255, blue: n & 255, r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 });
    function aciColor(index, background = '#212830') {
        index = Math.abs(Number(index));
        if (index === 7 || !Number.isInteger(index) || index > 255 || index === 0) {
            const n = parseInt(background.slice(1), 16);
            return (((n >> 16) & 255) * .2126 + ((n >> 8) & 255) * .7152 + (n & 255) * .0722) > 140 ? '#000000' : '#ffffff';
        }
        const base = ['#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', null, '#808080', '#c0c0c0'];
        if (index < 10)
            return base[index];
        if (index >= 250)
            return ['#333333', '#505050', '#696969', '#828282', '#bebebe', '#ffffff'][index - 250];
        const h = Math.floor((index - 10) / 10) / 4, slot = (index - 10) % 10, v = [255, 165, 127, 76, 38][Math.floor(slot / 2)], s = slot % 2 ? .5 : 1, c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c;
        const components = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
        return '#' + components.map(n => Math.floor(n + m).toString(16).padStart(2, '0')).join('');
    }
    function transparency(value, parent = 1, layer = 1) { if (value == null)
        return layer; const n = Number(value) >>> 0; return n === 0 ? layer : n === 0x1000000 ? parent : (n & 0xff000000) === 0x2000000 ? (n & 255) / 255 : layer; }
    class DxfDocument {
        constructor(input, options = {}) {
            this.diagnostics = new Diagnostics(options.maxDiagnostics);
            this.records = [];
            this.entities = [];
            this.blocks = [];
            this.byHandle = new Map();
            this.header = Object.create(null);
            this.objects = [];
            this.layouts = new Map();
            const tables = this.tables = { layers: Object.create(null), linetypes: Object.create(null), styles: Object.create(null), dimstyles: Object.create(null), blockRecords: Object.create(null), views: Object.create(null), viewports: Object.create(null), ucs: Object.create(null), layouts: Object.create(null) };
            const blocks = this.blockDefinitions = new Map();
            const tags = typeof input === 'string' ? parseTags(input, options) : input;
            if (!Array.isArray(tags))
                throw new TypeError('Expected DXF text or an array of tags.');
            if (tags.length > (options.maxTags ?? 4000000))
                throw new RangeError('DXF tag budget exceeded.');
            let section = '', currentBlock = null, table = '', sequence = null;
            for (let start = 0; start < tags.length;) {
                if (Number(tags[start].code) !== 0) {
                    start++;
                    continue;
                }
                let end = start + 1;
                while (end < tags.length && Number(tags[end].code) !== 0)
                    end++;
                const record = new DxfRecord(tags.slice(start, end).map(t => ({ ...t, code: Number(t.code) })), this.records.length), type = record.type;
                start = end;
                if (type === 'SECTION') {
                    section = key(record.get(2));
                    if (section === 'HEADER') {
                        let variable = null;
                        for (const t of record.tags) {
                            if (t.code === 9) {
                                variable = key(t.value);
                                this.header[variable] = [];
                            }
                            else if (variable)
                                this.header[variable].push(t);
                        }
                    }
                    continue;
                }
                if (type === 'ENDSEC') {
                    section = '';
                    currentBlock = null;
                    sequence = null;
                    continue;
                }
                if (type === 'EOF')
                    break;
                if (type === 'TABLE') {
                    table = key(record.get(2));
                    continue;
                }
                if (type === 'ENDTAB') {
                    table = '';
                    continue;
                }
                this.records.push(record);
                if (record.handle) {
                    if (this.byHandle.has(record.handle))
                        this.diagnostics.add('duplicate-handle', 'Duplicate handle; identity remains record-specific.', record);
                    else
                        this.byHandle.set(record.handle, record);
                }
                if (section === 'TABLES') {
                    const name = String(record.get(2, '')).trim(), flags = record.num(70);
                    if (type === 'LAYER')
                        tables.layers[name] = { name, handle: record.handle, flags, colorNumber: record.num(62, 7), trueColor: record.get(420) == null ? null : colorObject(record.num(420)), linetype: record.get(6, 'CONTINUOUS'), lineweight: record.num(370, -3), transparency: { alpha: transparency(record.get(440)) }, plot: record.num(290, 1) !== 0, material: record.get(347), plotStyle: record.get(390), record };
                    else if (type === 'LTYPE')
                        tables.linetypes[name] = { name, handle: record.handle, description: record.get(3, ''), pattern: record.all(49).map(Number), length: record.num(40), complex: record.all(74).some(n => Number(n) !== 0), record };
                    else if (type === 'STYLE')
                        tables.styles[name] = { name, handle: record.handle, font: record.get(3, ''), bigFont: record.get(4, ''), height: record.num(40), width: record.num(41, 1), oblique: record.num(50), flags, record };
                    else if (type === 'DIMSTYLE')
                        tables.dimstyles[name] = { name, handle: record.handle, record };
                    else if (type === 'BLOCK_RECORD')
                        tables.blockRecords[name] = { name, handle: record.handle, units: record.num(70), layoutHandle: record.get(340), record };
                    else if (type === 'VPORT')
                        tables.viewports[name] = { name, record };
                    else if (type === 'VIEW')
                        tables.views[name] = { name, record };
                    else if (type === 'UCS')
                        tables.ucs[name] = { name, record };
                    continue;
                }
                if (section === 'OBJECTS') {
                    this.objects.push(record);
                    if (type === 'LAYOUT') {
                        const name = String(record.get(1, 'Layout')).trim();
                        this.layouts.set(key(name), { name, record });
                        tables.layouts[name] = { name, record };
                    }
                    continue;
                }
                if (section !== 'ENTITIES' && section !== 'BLOCKS')
                    continue;
                if (type === 'BLOCK') {
                    const name = String(record.get(2, record.get(3, ''))).trim();
                    currentBlock = { name, header: { basePoint: record.point(10), flags: record.num(70), xrefPath: record.get(1, ''), handle: record.handle }, record, entities: [] };
                    blocks.set(key(name), currentBlock);
                    this.blocks.push(currentBlock);
                    sequence = null;
                    continue;
                }
                if (type === 'ENDBLK') {
                    currentBlock = null;
                    sequence = null;
                    continue;
                }
                if (type === 'SEQEND') {
                    sequence = null;
                    continue;
                }
                if (type === 'VERTEX' && sequence?.type === 'POLYLINE') {
                    sequence.vertices.push(record);
                    sequence.children.push(record);
                    continue;
                }
                if (type === 'ATTRIB' && sequence?.type === 'INSERT') {
                    sequence.attributes.push(record);
                    sequence.children.push(record);
                    continue;
                }
                sequence = null;
                if (currentBlock) {
                    record.blockName = currentBlock.name;
                    record.space = 'block';
                    currentBlock.entities.push(record);
                }
                else
                    this.entities.push(record);
                if (type === 'POLYLINE' || (type === 'INSERT' && record.num(66) === 1))
                    sequence = record;
            }
            if (!tables.layers['0'])
                tables.layers['0'] = { name: '0', handle: '', flags: 0, colorNumber: 7, linetype: 'CONTINUOUS', lineweight: -3, transparency: { alpha: 1 }, plot: true };
            this._layerMap = new Map(Object.values(tables.layers).map(l => [key(l.name), l]));
            this._lineMap = new Map(Object.values(tables.linetypes).map(l => [key(l.name), l]));
            this._styleMap = new Map(Object.values(tables.styles).map(l => [key(l.name), l]));
            const model = [], paper = Object.create(null), blockObject = Object.create(null);
            const owners = new Map(Object.values(tables.blockRecords).map(b => [key(b.handle), b]));
            const layoutByBlock = new Map();
            for (const layout of this.layouts.values()) {
                const handles = layout.record.all(330);
                if (handles.length)
                    layoutByBlock.set(key(handles.at(-1)), layout.name);
            }
            const assign = entity => {
                const owner = owners.get(entity.ownerHandle);
                let layout = entity.layout;
                if (!layout && owner) {
                    layout = layoutByBlock.get(key(owner.handle)) || this.byHandle.get(key(owner.layoutHandle))?.get(1) || '';
                    if (key(owner.name) === '*MODEL_SPACE')
                        layout = 'Model';
                }
                if (entity.space === 'paper' || (layout && key(layout) !== 'MODEL')) {
                    layout = layout || 'Layout1';
                    entity.layout = layout;
                    entity.space = 'paper';
                    (paper[layout] ||= []).push(entity);
                }
                else {
                    entity.space = 'model';
                    model.push(entity);
                }
            };
            this.entities.forEach(assign);
            for (const block of this.blocks) {
                blockObject[block.name] = block;
                if (/^\*MODEL_SPACE$/i.test(block.name) || /^\*PAPER_SPACE/i.test(block.name)) {
                    for (const e of block.entities) {
                        e.space = /MODEL/i.test(block.name) ? 'model' : 'paper';
                        if (!e.layout)
                            e.layout = e.space === 'model' ? 'Model' : layoutByBlock.get(key(owners.get(e.ownerHandle)?.handle)) || 'Layout1';
                        assign(e);
                    }
                }
            }
            this.layouts.set('MODEL', { name: 'Model', record: null });
            for (const name of Object.keys(paper))
                if (!this.layouts.has(key(name)))
                    this.layouts.set(key(name), { name, record: null });
            const imageDefinitions = Object.create(null), spatialFilters = Object.create(null);
            for (const r of this.objects) {
                if (r.type === 'IMAGEDEF')
                    imageDefinitions[r.handle] = { handle: r.handle, path: r.get(1, ''), width: r.num(10), height: r.num(20), record: r };
                if (r.type === 'SPATIAL_FILTER')
                    spatialFilters[r.handle] = r;
            }
            this.units = { insertionUnits: this.headerNumber('$INSUNITS', 0), measurement: this.headerNumber('$MEASUREMENT', 1) };
            this.stats = { modelSpaceEntities: model.length, paperSpaceLayouts: Object.keys(paper).length, paperSpaceEntities: Object.values(paper).reduce((a, b) => a + b.length, 0), blockCount: blocks.size, blockEntities: this.blocks.reduce((a, b) => a + b.entities.length, 0), entityCount: this.entities.length };
            this.sceneGraph = { modelSpace: model, paperSpaces: paper, blocks: blockObject, tables, stats: this.stats, units: this.units, imageDefinitions, spatialFilters, entities: this.entities };
            Object.defineProperty(this.sceneGraph, 'document', { value: this });
            this.blockMetadata = this.createBlockMetadata();
            this.status = 'ready';
            this.drawingProperties = { version: this.headerValue('$ACADVER', 'Unknown'), insertionUnits: this.units.insertionUnits };
        }
        headerValue(name, fallback = null) { return this.header[key(name)]?.[0]?.value ?? fallback; }
        headerNumber(name, fallback = 0) { const value = this.headerValue(name); return value == null ? fallback : G.finite(value, fallback); }
        layer(name) { return this._layerMap.get(key(name)) || this.tables.layers['0']; }
        linetype(name) { return this._lineMap.get(key(name)); }
        textStyle(name) { return this._styleMap.get(key(name)) || null; }
        getBlock(name) { return this.blockDefinitions.get(key(name)); }
        getEntities(layout = 'Model') { if (key(layout) === 'MODEL')
            return this.sceneGraph.modelSpace; const entry = Object.entries(this.sceneGraph.paperSpaces).find(([name]) => key(name) === key(layout)); if (!entry)
            throw new RangeError(`Unknown layout: ${layout}`); return entry[1]; }
        createBlockMetadata() {
            const byName = Object.create(null), ordered = [];
            for (const b of this.blocks) {
                if (/^\*(MODEL|PAPER)_SPACE/i.test(b.name))
                    continue;
                const attributes = b.entities.filter(e => e.type === 'ATTDEF').map(e => ({ tag: e.get(2, ''), prompt: e.get(3, ''), defaultValue: e.get(1, ''), flags: e.num(70), handle: e.handle, position: e.point(10), textStyle: e.get(7, 'STANDARD'), height: e.num(40), visibility: (e.num(70) & 1) ? 'Invisible' : 'Visible' }));
                const entry = { name: b.name, handle: b.record.handle, basePoint: b.header.basePoint, flags: b.header.flags, entityCount: b.entities.length, attributeCount: attributes.length, attributes, attributeDefinitions: attributes, attributeTags: attributes.map(a => a.tag), layoutUsage: [], ownerUsage: [], counters: { unitWarnings: 0 }, instances: [], instanceCount: 0, diagnostics: [], units: this.tables.blockRecords[b.name]?.units || 0 };
                byName[key(b.name)] = entry;
                ordered.push(entry);
            }
            for (const e of [...this.entities, ...this.blocks.flatMap(b => b.entities)])
                if (e.type === 'INSERT') {
                    const name = String(e.get(2, '')), entry = byName[key(name)];
                    if (!entry) {
                        this.diagnostics.add('missing-block', `Block ${name} is not defined.`, e);
                        continue;
                    }
                    entry.instances.push({ handle: e.handle, layer: e.layer, space: e.space, layout: e.layout, ownerBlock: e.blockName || null, insertionPoint: e.point(10), position: e.point(10), scale: G.vec(e.num(41, 1), e.num(42, 1), e.num(43, 1)), rotation: e.num(50), hasAttributes: !!e.attributes.length, attributes: e.attributes.map(a => ({ tag: a.get(2, ''), value: a.get(1, ''), handle: a.handle })), rows: e.num(71, 1), columns: e.num(70, 1) });
                    entry.instanceCount++;
                    const supplied = new Set(e.attributes.map(a => key(a.get(2)))), counts = new Map();
                    for (const a of e.attributes) {
                        const tag = key(a.get(2));
                        counts.set(tag, (counts.get(tag) || 0) + 1);
                    }
                    for (const def of entry.attributeDefinitions)
                        if (!(def.flags & 2) && !supplied.has(key(def.tag)))
                            entry.diagnostics.push({ message: 'Missing attribute: ' + def.tag, severity: 'warning', category: 'Attributes', instanceHandle: e.handle, space: e.space, layout: e.layout });
                    for (const [tag, count] of counts)
                        if (count > 1)
                            entry.diagnostics.push({ message: 'Duplicate attribute: ' + tag, severity: 'warning', category: 'Attributes', instanceHandle: e.handle, space: e.space, layout: e.layout });
                    if (!e.num(41, 1) || !e.num(42, 1) || !e.num(43, 1))
                        entry.diagnostics.push({ message: 'Singular INSERT scale', severity: 'error', category: 'Transform', instanceHandle: e.handle, space: e.space, layout: e.layout });
                }
            return { byName, ordered };
        }
    }
    Object.assign(A, { key, parseTags, DxfRecord, DxfDocument, Diagnostics, aciColor, colorObject, transparency });
    if (typeof module === 'object' && module.exports)
        module.exports = A;
})(globalThis);
