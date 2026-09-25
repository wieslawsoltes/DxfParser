/* Transactional, fail-closed import of supported reference objects. All records
 * are staged and compiled before a new source string is returned to the host. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else Object.assign(root.DxfCompare, factory(root.DxfSkia, root.DxfCompare));
})(globalThis, function createImport(A, C) {
    'use strict';
    const key = s => String(s ?? '').trim().toUpperCase();
    const tag = (code, value) => ({ code, value: String(value) });
    const copyTags = r => [tag(0, r.type), ...r.tags.map(t => tag(t.code, t.value))];
    const pointer = code => code >= 320 && code <= 369 || code >= 390 && code <= 399 || code === 480 || code === 481 || code === 1005;
    const tableKinds = new Set(['LAYER', 'LTYPE', 'STYLE', 'DIMSTYLE', 'APPID', 'BLOCK_RECORD']);
    const entityKinds = new Set(['LINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'LWPOLYLINE', 'POLYLINE', 'VERTEX', 'SEQEND', 'SPLINE', 'POINT', 'SOLID', 'TRACE', '3DFACE', 'TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF', 'INSERT', 'MINSERT', 'DIMENSION', 'HATCH', 'LEADER', 'XLINE', 'RAY', 'MESH']);
    function set(tags, code, value) { const t = tags.find(t => t.code === code); if (t) t.value = String(value); else tags.push(tag(code, value)); }
    function section(tags, name) {
        for (let i = 0; i < tags.length - 1; i++) if (tags[i].code === 0 && key(tags[i].value) === 'SECTION' && key(tags[i + 1].value) === name) {
            for (let j = i + 2; j < tags.length; j++) if (tags[j].code === 0 && key(tags[j].value) === 'ENDSEC') return { start: i + 2, end: j };
            throw new SyntaxError('Unterminated DXF section ' + name);
        }
        return null;
    }
    function ensureSection(tags, name) {
        let s = section(tags, name); if (s) return s;
        const eof = tags.findIndex(t => t.code === 0 && key(t.value) === 'EOF');
        tags.splice(eof < 0 ? tags.length : eof, 0, tag(0, 'SECTION'), tag(2, name), tag(0, 'ENDSEC'));
        return section(tags, name);
    }
    function table(tags, name) {
        const s = section(tags, 'TABLES'); if (!s) return null;
        for (let i = s.start; i < s.end - 1; i++) if (tags[i].code === 0 && key(tags[i].value) === 'TABLE' && tags[i + 1].code === 2 && key(tags[i + 1].value) === name) {
            let headerEnd = i + 1; while (headerEnd < s.end && tags[headerEnd].code !== 0) headerEnd++;
            for (let j = headerEnd; j < s.end; j++) if (tags[j].code === 0 && key(tags[j].value) === 'ENDTAB') return { start: i, headerEnd, end: j };
        }
        return null;
    }
    function importObjects(currentText, referenceText, selectedIds, settings = {}) {
        if (typeof currentText !== 'string' || typeof referenceText !== 'string') throw new TypeError('Import requires DXF source strings.');
        const current = new A.DxfDocument(currentText), reference = new A.DxfDocument(referenceText), opts = C.options(settings), ids = new Set(selectedIds);
        if (!ids.size || ids.size > 10000) throw new RangeError('Select 1–10000 reference objects.');
        if (current.diagnostics.items.some(d => /duplicate-handle/.test(d.code)) || reference.diagnostics.items.some(d => /duplicate-handle/.test(d.code))) throw new Error('Resolve duplicate handles before import.');
        const compilerOptions = settings.compileOptions || {}, beforeScene = new A.SceneCompiler(current, compilerOptions).compile('Model'), refScene = new A.SceneCompiler(reference, compilerOptions).compile('Model');
        const comparison = C.compareScenes(beforeScene, refScene, opts), eligible = new Map(comparison.referenceOnly.map(g => [g.id, g]));
        for (const id of ids) if (!eligible.has(id)) throw new Error('Only rendered reference-only model-space objects can be imported: ' + id);
        const targetTags = A.parseTags(currentText).map(t => tag(t.code, t.value));
        let next = 255n;
        for (const t of targetTags) if ((t.code === 5 || t.code === 105) && /^[0-9a-f]+$/i.test(t.value)) { const n = BigInt('0x' + t.value); if (n > next) next = n; }
        const allocate = () => (++next).toString(16).toUpperCase();
        const staged = new Map(), handles = new Map(), names = new Map(), records = reference.records;
        const byType = new Map(); for (const r of records) { if (!byType.has(r.type)) byType.set(r.type, []); byType.get(r.type).push(r); }
        const tableRecords = type => byType.get(type) || [];
        const existingNames = new Map([...tableKinds].map(t => [t, new Set(current.records.filter(r => r.type === t).map(r => key(r.get(2))))]));
        for (const b of current.blocks) existingNames.get('BLOCK_RECORD').add(key(b.name));
        let sequence = 0;
        const renamed = (type, name) => {
            const k = type + ':' + key(name); if (names.has(k)) return names.get(k);
            const set = existingNames.get(type) || new Set();
            if (!set.has(key(name))) { set.add(key(name)); names.set(k, String(name)); return String(name); }
            const base = String(name).replace(/[<>/\\":;?*|=,]/g, '_').slice(0, 160) || 'unnamed';
            let n; do { n = (type === 'BLOCK_RECORD' && String(name).startsWith('*') ? '*U_' : '') + 'CMP$' + (++sequence) + '$' + base; } while (set.has(key(n)));
            set.add(key(n)); names.set(k, n); return n;
        };
        function stage(r, destination, owner = null, blockContent = false) {
            if (staged.has(r.id)) return staged.get(r.id);
            if (!tableKinds.has(r.type) && !entityKinds.has(r.type) && r.type !== 'BLOCK' && r.type !== 'ENDBLK') throw new Error('Import requires unsupported ' + r.type + ' dependency; no changes were applied.');
            const boundaryStart = r.type === 'HATCH' ? r.tags.findIndex(t => t.code === 91) : -1;
            if (r.all(330).length > 1 || r.type === 'HATCH' && (r.num(71) === 1 || boundaryStart >= 0 && r.tags.slice(boundaryStart).some(t => t.code === 330))) throw new Error('Associative boundary/owner references require a database-aware importer; no changes were applied.');
            if (r.tags.some(t => t.code === 102)) throw new Error('Extension dictionaries/reactors require a database-aware importer; no changes were applied.');
            const entry = { record: r, tags: copyTags(r), destination, owner, blockContent, handle: allocate() };
            staged.set(r.id, entry); if (r.handle) handles.set(key(r.handle), entry.handle);
            return entry;
        }
        function symbol(type, name) {
            const n = key(name); if (!n) return name;
            const mapKey = type + ':' + n; if (names.has(mapKey)) return names.get(mapKey);
            if (type === 'LTYPE' && ['BYLAYER', 'BYBLOCK'].includes(n)) return n;
            if (type === 'BLOCK_RECORD') return block(name);
            const r = tableRecords(type).find(r => key(r.get(2)) === n);
            if (!r) {
                // Synthesize the same defaults the native compiler uses for absent tables.
                if (type === 'LAYER') {
                    const layer = reference.layer(name), tags = [tag(0, 'LAYER'), tag(2, name), tag(70, layer.flags || 0), tag(62, layer.colorNumber ?? 7), tag(6, layer.linetype || 'CONTINUOUS'), tag(370, layer.lineweight ?? -3)];
                    const synthetic = new A.DxfRecord(tags, -1000 - sequence); const n = renamed(type, name); stage(synthetic, type); return n;
                }
                if (type === 'STYLE' && n === 'STANDARD' || type === 'LTYPE' && n === 'CONTINUOUS') return name;
                throw new Error('Missing ' + type + ' dependency "' + name + '"; no changes were applied.');
            }
            const target = current.records.find(t => t.type === type && key(t.get(2)) === n);
            const definition = r => JSON.stringify(r.tags.filter(t => ![5, 105, 330, 100].includes(t.code)).map(t => [t.code, String(t.value)]));
            if (target?.handle && definition(target) === definition(r)) { names.set(mapKey, target.get(2)); if (r.handle) handles.set(key(r.handle), target.handle); return target.get(2); }
            const mapped = renamed(type, name); stage(r, type); return mapped;
        }
        function block(name) {
            const mapKey = 'BLOCK_RECORD:' + key(name); if (names.has(mapKey)) return names.get(mapKey);
            const b = reference.getBlock(name); if (!b) throw new Error('Missing block ' + name);
            if (b.record.num(70) & 124 || b.record.get(1)) throw new Error('External-reference blocks cannot be imported as self-contained objects.');
            const mapped = renamed('BLOCK_RECORD', name), br = tableRecords('BLOCK_RECORD').find(r => key(r.get(2)) === key(name));
            const record = br || new A.DxfRecord([tag(0, 'BLOCK_RECORD'), tag(2, name), tag(70, 0)], -2000 - sequence);
            const owner = stage(record, 'BLOCK_RECORD').handle;
            const start = records.indexOf(b.record); let end = start + 1; while (end < records.length && records[end].type !== 'ENDBLK') end++;
            if (end === records.length) throw new Error('Unterminated block ' + name);
            for (let i = start; i <= end; i++) stage(records[i], 'BLOCKS', owner, true);
            return mapped;
        }
        // Model owner: create a minimal BLOCK_RECORD table record when absent.
        ensureSection(targetTags, 'TABLES'); ensureSection(targetTags, 'BLOCKS'); ensureSection(targetTags, 'ENTITIES');
        const model = current.records.find(r => r.type === 'BLOCK_RECORD' && key(r.get(2)) === '*MODEL_SPACE');
        const modelHandle = model?.handle || allocate();
        const rootHandles = new Map();
        for (const id of ids) {
            const r = eligible.get(id).source; const entry = stage(r, 'ENTITIES', modelHandle); rootHandles.set(id, entry.handle);
            // Ordered sequence records include ATTRIB/VERTEX and terminating SEQEND.
            if (r.type === 'POLYLINE' || ['INSERT', 'MINSERT'].includes(r.type) && r.num(66) === 1) {
                let i = records.indexOf(r) + 1;
                for (; i < records.length && ['VERTEX', 'ATTRIB', 'SEQEND'].includes(records[i].type); i++) {
                    stage(records[i], 'ENTITIES', entry.handle, true); if (records[i].type === 'SEQEND') break;
                }
                if (records[i]?.type !== 'SEQEND') throw new Error('Unterminated entity sequence.');
            }
        }
        const findSymbol = r => {
            const t = r.type, tags = r.tags;
            if (t === 'BLOCK_RECORD') symbol('BLOCK_RECORD', r.get(2));
            if (t === 'LAYER') symbol('LTYPE', r.get(6, 'CONTINUOUS'));
            if (entityKinds.has(t)) {
                symbol('LAYER', r.layer); symbol('LTYPE', r.get(6, 'BYLAYER'));
                if (['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(t)) symbol('STYLE', r.get(7, 'STANDARD'));
                if (['INSERT', 'MINSERT', 'DIMENSION'].includes(t) && r.get(2)) block(r.get(2));
                if (t === 'DIMENSION' && r.get(3)) symbol('DIMSTYLE', r.get(3));
            }
            for (const tag of tags) {
                if (tag.code === 1001) symbol('APPID', tag.value);
                if (!pointer(tag.code) || tag.code === 330 || key(tag.value) === '0' || handles.has(key(tag.value))) continue;
                const dependency = reference.byHandle.get(key(tag.value));
                if (dependency && tableKinds.has(dependency.type)) symbol(dependency.type, dependency.get(2));
                else throw new Error('Unresolved/unsupported handle dependency ' + tag.value + ' (group ' + tag.code + '); no changes were applied.');
            }
        };
        for (const entry of staged.values()) { findSymbol(entry.record); if (staged.size > 100000) throw new RangeError('Import dependency budget exceeded.'); }
        const tableHandles = new Map();
        function ensureTable(name) {
            if (tableHandles.has(name)) return tableHandles.get(name);
            let t = table(targetTags, name), handle;
            if (t) {
                const header = targetTags.slice(t.start, t.headerEnd); handle = header.find(t => t.code === 5)?.value || allocate();
                if (!header.some(t => t.code === 5)) targetTags.splice(t.start + 2, 0, tag(5, handle));
            } else {
                handle = allocate(); const s = ensureSection(targetTags, 'TABLES');
                targetTags.splice(s.end, 0, tag(0, 'TABLE'), tag(2, name), tag(5, handle), tag(100, 'AcDbSymbolTable'), tag(70, 0), tag(0, 'ENDTAB'));
            }
            tableHandles.set(name, handle); return handle;
        }
        ensureTable('BLOCK_RECORD');
        if (!model) {
            const t = table(targetTags, 'BLOCK_RECORD'); targetTags.splice(t.end, 0, tag(0, 'BLOCK_RECORD'), tag(5, modelHandle), tag(330, tableHandles.get('BLOCK_RECORD')), tag(100, 'AcDbSymbolTableRecord'), tag(100, 'AcDbBlockTableRecord'), tag(2, '*Model_Space'), tag(70, 0));
        }
        if (!model && !current.getBlock('*Model_Space')) {
            const b = ensureSection(targetTags, 'BLOCKS'); targetTags.splice(b.end, 0, tag(0, 'BLOCK'), tag(5, allocate()), tag(330, modelHandle), tag(100, 'AcDbEntity'), tag(8, '0'), tag(100, 'AcDbBlockBegin'), tag(2, '*Model_Space'), tag(70, 0), tag(10, 0), tag(20, 0), tag(30, 0), tag(3, '*Model_Space'), tag(0, 'ENDBLK'), tag(5, allocate()), tag(330, modelHandle), tag(100, 'AcDbEntity'), tag(8, '0'), tag(100, 'AcDbBlockEnd'));
        }
        for (const entry of staged.values()) if (tableKinds.has(entry.destination)) ensureTable(entry.destination);
        const layerDefault = reference.headerNumber('$LWDEFAULT', 25), dashRatio = reference.headerNumber('$LTSCALE', 1) / current.headerNumber('$LTSCALE', 1);
        if (!Number.isFinite(dashRatio)) throw new Error('Invalid global linetype scale.');
        for (const entry of staged.values()) {
            const { record: r, tags, destination, blockContent } = entry;
            set(tags, r.type === 'DIMSTYLE' ? 105 : 5, entry.handle);
            for (const t of tags) if (pointer(t.code) && key(t.value) !== '0') {
                if (t.code === 330) t.value = handles.get(key(t.value)) || entry.owner || tableHandles.get(destination) || modelHandle;
                else { const mapped = handles.get(key(t.value)); if (!mapped) throw new Error('Unmapped handle dependency ' + t.value); t.value = mapped; }
            }
            if (!tags.some(t => t.code === 330)) set(tags, 330, entry.owner || tableHandles.get(destination) || modelHandle);
            if (tableKinds.has(r.type)) set(tags, 2, names.get(r.type + ':' + key(r.get(2))) || r.get(2));
            if (r.type === 'BLOCK') { const n = names.get('BLOCK_RECORD:' + key(r.get(2))); set(tags, 2, n); if (r.get(3)) set(tags, 3, n); }
            if (entityKinds.has(r.type)) {
                set(tags, 8, blockContent && key(r.layer) === '0' ? '0' : names.get('LAYER:' + key(r.layer)) || r.layer);
                if (['INSERT', 'MINSERT', 'DIMENSION'].includes(r.type) && r.get(2)) set(tags, 2, names.get('BLOCK_RECORD:' + key(r.get(2))));
                if (r.type === 'DIMENSION' && r.get(3)) set(tags, 3, names.get('DIMSTYLE:' + key(r.get(3))) || r.get(3));
                if (['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(r.type)) set(tags, 7, names.get('STYLE:' + key(r.get(7, 'STANDARD'))) || r.get(7, 'STANDARD'));
                if (dashRatio !== 1) set(tags, 48, r.num(48, 1) * dashRatio);
                if (r.num(370, -1) === -3) set(tags, 370, layerDefault);
                // All selected/imported roots are model-space objects.
                if (destination === 'ENTITIES' && !blockContent) { set(tags, 67, 0); if (r.get(410)) set(tags, 410, 'Model'); }
            }
            if (r.type === 'LAYER' && r.num(370, -3) === -3) set(tags, 370, layerDefault);
            for (const t of tags) {
                if (t.code === 6 && (entityKinds.has(r.type) || r.type === 'LAYER')) t.value = names.get('LTYPE:' + key(t.value)) || t.value;
                if (t.code === 1001) t.value = names.get('APPID:' + key(t.value)) || t.value;
            }
        }
        // Batch each destination, preserving block/sequence record order. Avoid O(N²) splices.
        const destinations = new Map(); for (const e of staged.values()) { if (!destinations.has(e.destination)) destinations.set(e.destination, []); for (const t of e.tags) destinations.get(e.destination).push(t); }
        for (const [destination, tags] of destinations) {
            const range = tableKinds.has(destination) ? table(targetTags, destination) : ensureSection(targetTags, destination);
            const suffix = targetTags.splice(range.end); for (const t of tags) targetTags.push(t); for (const t of suffix) targetTags.push(t);
        }
        for (const name of tableHandles.keys()) {
            const t = table(targetTags, name); let count = 0;
            for (let i = t.headerEnd; i < t.end; i++) if (targetTags[i].code === 0) count++;
            const index = targetTags.findIndex((tag, i) => i >= t.start && i < t.headerEnd && tag.code === 70);
            if (index >= 0) targetTags[index].value = String(count);
        }
        const header = ensureSection(targetTags, 'HEADER'); let seed = -1;
        for (let i = header.start; i < header.end; i++) if (targetTags[i].code === 9 && key(targetTags[i].value) === '$HANDSEED') seed = i + 1;
        if (seed >= 0 && targetTags[seed]?.code === 5) targetTags[seed].value = allocate();
        else targetTags.splice(header.end, 0, tag(9, '$HANDSEED'), tag(5, allocate()));
        const text = targetTags.map(t => t.code + '\n' + t.value + '\n').join(''), document = new A.DxfDocument(text);
        if (document.diagnostics.items.some(d => d.severity === 'error' || /duplicate-handle/.test(d.code))) throw new Error('Import validation failed; original drawing is unchanged.');
        const afterScene = new A.SceneCompiler(document, compilerOptions).compile('Model');
        const originalRootIds = new Set(document.entities.slice(0, current.entities.length).map(e => e.id));
        const originalAfter = afterScene.primitives.filter(p => originalRootIds.has((p.rootSource || p.source).id));
        if (JSON.stringify(beforeScene.primitives.map(p => C.descriptor(p, opts))) !== JSON.stringify(originalAfter.map(p => C.descriptor(p, opts)))) throw new Error('Import would change existing drawing geometry. No changes were applied.');
        // Verify the staged import retains resolved geometry and appearance. Renamed
        // symbol labels are intentionally excluded from this postcondition only.
        const visual = p => { const d = JSON.parse(C.descriptor(p, { ...opts, properties: 127 })); delete d.layer; delete d.linetype; return JSON.stringify(d); };
        for (const [id, handle] of rootHandles) {
            const before = refScene.primitives.filter(p => (p.rootSource || p.source).id === id).map(visual);
            const after = afterScene.primitives.filter(p => (p.rootSource || p.source).handle === handle).map(visual);
            if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Import would change rendered appearance (global settings or unsupported dependency). No changes were applied.');
        }
        return { text, document, imported: rootHandles.size, handles: Object.fromEntries(rootHandles), renamedSymbols: Object.fromEntries(names), recordCount: staged.size };
    }
    return { importObjects };
});
