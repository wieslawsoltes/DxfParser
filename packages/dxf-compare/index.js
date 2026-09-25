/* Render-space DXF comparison. No source mutation, DOM, GPU or native allocations.
 * A factory keeps the host's DxfSkia types/resources in the same module realm. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.DxfCompare = factory(root.DxfSkia);
})(globalThis, function createDxfCompare(A) {
    'use strict';
    if (!A?.SceneCompiler) throw new TypeError('A DxfSkia API is required.');
    const G = A.geometry;
    const cloudEngine = (typeof module === 'object' && module.exports ? require('./clouds.js') : globalThis.DxfCompareCloudEngine)(A);
    const defaults = Object.freeze({ precision: 6, properties: 127, text: true, hatch: true,
        showCurrent: true, showReference: true, showCommon: true, clouds: true,
        cloudMode: 'grouped', cloudShape: 'rectangular', margin: 1, currentFirst: false, commonOpacity: .65,
        currentColor: '#5ce080', referenceColor: '#ff6678', commonColor: '#a8b5c8', cloudColor: '#ffd166',
        maxCloudWork: 50000000, maxCloudSegments: 500000, maxObjects: 500000, maxSignatureBytes: 64 * 1024 * 1024 });
    const groupCache = new WeakMap();
    function changeSets(result) {
        const { cloudMode, margin, maxCloudWork } = result.options, cached = groupCache.get(result.changes);
        if (cached && cached.cloudMode === cloudMode && cached.margin === margin && cached.maxCloudWork === maxCloudWork) return cached.groups;
        const groups = cloudEngine.groupChanges(result.changes, result.options);
        groupCache.set(result.changes, { cloudMode, margin, maxCloudWork, groups }); return groups;
    }
    const propBits = Object.freeze({ color: 1, layer: 2, linetype: 4, linetypeScale: 8, lineweight: 16, transparency: 32, thickness: 64 });
    const key = s => String(s ?? '').trim().toUpperCase();
    function options(value = {}) {
        const o = { ...defaults, ...value };
        if (!Number.isInteger(o.precision) || o.precision < 0 || o.precision > 14) throw new RangeError('Precision must be 0–14 decimal places.');
        if (!Number.isInteger(o.properties) || o.properties < 0 || o.properties > 127) throw new RangeError('Property mask must be 0–127.');
        if (!Number.isFinite(o.margin) || o.margin < 0 || o.margin > 1e12) throw new RangeError('Cloud margin must be 0–1e12 drawing units.');
        if (!Number.isFinite(o.commonOpacity) || o.commonOpacity < 0 || o.commonOpacity > 1) throw new RangeError('Common opacity must be 0–1.');
        if (!['grouped', 'local', 'combined'].includes(o.cloudMode)) throw new RangeError('Cloud mode must be grouped, local or combined.');
        if (!['rectangular', 'polygonal'].includes(o.cloudShape)) throw new RangeError('Cloud shape must be rectangular or polygonal.');
        for (const n of ['maxObjects', 'maxSignatureBytes', 'maxCloudWork', 'maxCloudSegments']) if (!Number.isSafeInteger(o[n]) || o[n] < 1) throw new RangeError('Invalid comparison budget: ' + n);
        for (const n of ['currentColor', 'referenceColor', 'commonColor', 'cloudColor']) if (!/^#[0-9a-f]{6}$/i.test(o[n])) throw new TypeError('Colors must be six-digit hexadecimal values.');
        for (const n of ['text', 'hatch', 'showCurrent', 'showReference', 'showCommon', 'clouds', 'currentFirst']) if (typeof o[n] !== 'boolean') throw new TypeError(n + ' must be boolean.');
        return o;
    }
    function canonical(value, precision) {
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) throw new RangeError('Nonfinite comparison geometry.');
            return Number(value.toFixed(precision));
        }
        if (Array.isArray(value)) return value.map(v => canonical(v, precision));
        if (value && typeof value === 'object') {
            const result = {};
            for (const k of Object.keys(value).sort()) if (value[k] !== undefined) result[k] = canonical(value[k], precision);
            return result;
        }
        return value;
    }
    function descriptor(p, o) {
        const s = p.style, mask = o.properties;
        const d = { kind: p.kind, fill: !!p.fill, closed: !!p.closed, clips: p.clips || [] };
        if (p.path) {
            d.path = p.path;
            // A continuous single line has no visible direction. Preserve dash origin.
            if (p.path.length === 2 && p.path[0][0] === 'M' && p.path[1][0] === 'L' && !s.dash?.length) {
                const ends = [p.path[0][1], p.path[1][1]].sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
                d.path = [['M', ends[0]], ['L', ends[1]]];
            }
        } else d.points = p.points;
        for (const field of ['fillRule', 'face', 'infinite', 'size', 'mode', 'position', 'u', 'v', 'text', 'font', 'bigFont', 'align', 'vertical', 'mtext', 'wrapWidth', 'lineSpacing', 'backgroundMask', 'resource', 'imageSize', 'imageClip', 'brightness', 'contrast', 'fade', 'displayFlags'])
            if (p[field] != null) d[field] = p[field];
        // Compare resolved text/geometry, not raw formatting tags or style names.
        if (p.gradient) { d.gradient = { ...p.gradient }; if (!(mask & 1)) delete d.gradient.colors; }
        if (mask & 1) d.color = s.color.toLowerCase();
        if (mask & 2) d.layer = key(s.layer);
        if (mask & 4) { d.dash = s.dash || []; d.linetype = key(s.linetype); }
        if (mask & 8) d.dashScale = s.dashScale;
        if (mask & 16) { d.lineweight = s.lineweight; d.lineweightVisible = !!s.lineweightVisible; }
        if (mask & 32) d.alpha = s.alpha;
        if (mask & 64) d.thickness = p.source?.num(39) || 0;
        return JSON.stringify(canonical(d, o.precision));
    }
    function objects(scene, o) {
        const groups = new Map(); let bytes = 0;
        for (const p of scene.primitives) {
            if (!o.text && p.kind === 'text' || !o.hatch && p.type === 'HATCH') continue;
            const source = p.rootSource || p.source, id = source?.id || p.id;
            let group = groups.get(id);
            if (!group) {
                if (groups.size >= o.maxObjects) throw new RangeError('Comparison object budget exceeded.');
                group = { id, source, handle: source?.handle || '', type: source?.type || p.type, layer: source?.layer || p.style.layer,
                    primitives: [], bounds: G.emptyBounds(), keys: [] }; groups.set(id, group);
            }
            const signature = descriptor(p, o); bytes += signature.length * 2;
            if (bytes > o.maxSignatureBytes) throw new RangeError('Comparison signature budget exceeded.');
            group.primitives.push(p); group.keys.push(signature);
            if (!p.infinite) G.union(group.bounds, p.bounds);
        }
        for (const group of groups.values()) {
            // Preserve internal draw order: overlapping fills in a block are visual content.
            group.signature = group.keys.join('\u0000'); delete group.keys;
        }
        return [...groups.values()];
    }
    const unionOf = items => { const b = G.emptyBounds(); for (const item of items) if (!G.isEmpty(item.bounds)) G.union(b, item.bounds); return b; };
    function compareScenes(currentScene, referenceScene, settings = {}) {
        const o = options(settings), current = objects(currentScene, o), reference = objects(referenceScene, o), buckets = new Map();
        for (const r of reference) { let list = buckets.get(r.signature); if (!list) buckets.set(r.signature, list = { values: [], next: 0 }); list.values.push(r); }
        const common = [], currentOnly = [], used = new Set();
        for (const c of current) {
            const bucket = buckets.get(c.signature), r = bucket && bucket.values[bucket.next++];
            if (r) { common.push({ current: c, reference: r }); used.add(r); } else currentOnly.push(c);
        }
        const referenceOnly = reference.filter(r => !used.has(r));
        // Handles suggest correspondence only AFTER geometric multiset matching.
        const byHandle = list => { const map = new Map(); for (const item of list) if (item.handle) {
            const k = key(item.type) + ':' + key(item.handle); map.set(k, map.has(k) ? null : item);
        } return map; };
        const cm = byHandle(currentOnly), rm = byHandle(referenceOnly), linked = new Set(), changes = [];
        for (const c of currentOnly) {
            const k = key(c.type) + ':' + key(c.handle), r = c.handle && cm.get(k) === c && rm.get(k);
            if (r) linked.add(r);
            changes.push({ id: 'current:' + c.id, status: r ? 'modified' : 'current-only', current: c, reference: r || null, bounds: unionOf(r ? [c, r] : [c]) });
        }
        for (const r of referenceOnly) if (!linked.has(r)) changes.push({ id: 'reference:' + r.id, status: 'reference-only', current: null, reference: r, bounds: { ...r.bounds } });
        const notices = [...currentScene.diagnostics.map(d => ({ ...d, drawing: 'current' })), ...referenceScene.diagnostics.map(d => ({ ...d, drawing: 'reference' }))];
        if ([...currentScene.primitives, ...referenceScene.primitives].some(p => p.kind === 'image')) notices.push({ code: 'compare-image-content', severity: 'warning', message: 'Image placement/resource names are compared, not external pixel contents.' });
        const counts = { currentOnly: currentOnly.length, referenceOnly: referenceOnly.length, common: common.length,
            modified: changes.filter(c => c.status === 'modified').length, changes: changes.length };
        const result = { options: o, currentScene, referenceScene, currentOnly, referenceOnly, common, changes, counts, notices,
            incomplete: notices.some(d => d.severity !== 'info'), bounds: unionOf(changes) };
        result.changeSets = changeSets(result); return result;
    }
    function cloudBounds(result) {
        return changeSets(result).filter(g => !G.isEmpty(g.cloudBounds)).map(g => g.cloudBounds);
    }
    function cloudPrimitive(group, i, color, o, chord, consume) {
        const contours = o.cloudShape === 'polygonal' ? cloudEngine.rectangleUnion(group.rectangles, o) : [cloudEngine.rectangle(group.cloudBounds)], path = [];
        for (const corners of contours) {
            path.push(['M', corners[0]]);
            for (let edge = 0; edge < corners.length; edge++) {
                const a = corners[edge], b = corners[(edge + 1) % corners.length], dx = b.x - a.x, dy = b.y - a.y;
                const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / chord)); consume(n);
                for (let j = 0; j < n; j++) {
                    const t = (j + .5) / n, end = G.vec(a.x + dx * (j + 1) / n, a.y + dy * (j + 1) / n, a.z);
                    path.push(['Q', G.vec(a.x + dx * t + dy / n * .35, a.y + dy * t - dx / n * .35, a.z), end]);
                }
            }
            path.push(['Z']);
        }
        // Decorations cannot be picked or snapped. Retain contour vertices for
        // broad-phase work; native Skia consumes the exact quadratic cloud path.
        return { id: 'compare-cloud:' + i, handle: 'compare-cloud:' + i, entityHandle: '', type: 'REVCLOUD', kind: 'path', path,
            points: contours.flat(), rings: contours, closed: true, fill: false,
            style: { layer: 'Comparison clouds', color, alpha: 1, lineweight: 25, lineweightVisible: false, dash: [], dashScale: 1 },
            bounds: G.pathBounds(path), clips: [], blockPath: [], instancePath: [], comparisonDecoration: true, comparisonChangeSetId: group.id };
    }
    function compose(result) {
        const o = result.options, primitives = []; result.changeSets = changeSets(result);
        const add = (groups, side, color, alpha = 1) => {
            for (const group of groups) for (const p of group.primitives) {
                const reference = side === 'reference';
                primitives.push({ ...p, id: 'compare:' + side + ':' + p.id,
                    handle: reference ? 'compare-reference:' + group.id : p.handle,
                    entityHandle: reference ? 'compare-reference:' + p.entityHandle : p.entityHandle,
                    instancePath: reference ? [] : p.instancePath, blockPath: reference ? [] : p.blockPath,
                    comparisonSide: side, comparisonObjectId: group.id,
                    style: { ...p.style, color, alpha: p.style.alpha * alpha },
                    gradient: p.gradient ? { ...p.gradient, colors: [color, color] } : p.gradient });
            }
        };
        if (o.showCommon) add(result.common.map(p => p.current), 'common', o.commonColor, o.commonOpacity);
        const current = () => { if (o.showCurrent) add(result.currentOnly, 'current', o.currentColor); };
        const reference = () => { if (o.showReference) add(result.referenceOnly, 'reference', o.referenceColor); };
        if (o.currentFirst) { current(); reference(); } else { reference(); current(); }
        if (o.clouds) {
            const extent = unionOf([result.currentScene, result.referenceScene]), width = extent.maxX - extent.minX, height = extent.maxY - extent.minY;
            const chord = Math.max(.01, Number.isFinite(width) ? width / 40 : 0, Number.isFinite(height) ? height / 40 : 0, o.margin / 4);
            let remaining = o.maxCloudSegments;
            const consume = n => { if (!Number.isSafeInteger(n) || (remaining -= n) < 0) throw new RangeError('Comparison cloud segment budget exceeded.'); };
            result.changeSets.forEach((g, i) => { if (!G.isEmpty(g.cloudBounds)) primitives.push(cloudPrimitive(g, i, o.cloudColor, o, chord, consume)); });
        }
        const scene = { ...result.currentScene, primitives, bounds: unionOf(primitives.filter(p => !p.infinite)),
            diagnostics: result.notices, stats: { ...result.currentScene.stats, primitives: primitives.length }, comparison: result, preserveForExport: true };
        scene.index = new A.SpatialIndex(primitives.map((primitive, index) => ({ primitive, index, bounds: primitive.bounds })));
        return scene;
    }
    class Session {
        constructor(reference, settings = {}) {
            if (!(reference instanceof A.DxfDocument)) throw new TypeError('A reference DxfDocument is required.');
            this.reference = reference; this.options = options(settings); this.revision = 0; this.enabled = true;
        }
        configure(patch) { this.options = options({ ...this.options, ...patch }); this.revision++; }
        setReference(reference) { if (!(reference instanceof A.DxfDocument)) throw new TypeError('Invalid reference document.'); this.reference = reference; this.referenceScene = null; this.revision++; }
        scene(currentScene) {
            if (this.currentScene === currentScene && this.builtRevision === this.revision) return this.composed;
            // Reuse the reference compilation for visibility/color/cloud setting changes.
            if (this.currentScene !== currentScene || !this.referenceScene) {
                const compileOptions = { ...currentScene.compileOptions };
                // Current handle isolation must never hide unrelated reference objects.
                delete compileOptions.entityIsolation; delete compileOptions.blockIsolation;
                let layout = currentScene.layout;
                const found = [...this.reference.layouts.values()].find(l => key(l.name) === key(layout));
                if (!found) throw new Error('Reference drawing has no layout "' + layout + '". Choose a shared layout.');
                layout = found.name;
                this.referenceScene = new A.SceneCompiler(this.reference, compileOptions).compile(layout);
            }
            const previous = this.result, matchKeys = ['precision', 'properties', 'text', 'hatch', 'maxObjects', 'maxSignatureBytes'];
            const reusable = previous && previous.currentScene === currentScene && previous.referenceScene === this.referenceScene && matchKeys.every(k => previous.options[k] === this.options[k]);
            const result = reusable ? { ...previous, options: this.options } : compareScenes(currentScene, this.referenceScene, this.options);
            const composed = compose(result);
            this.result = result; this.composed = composed; this.currentScene = currentScene; this.builtRevision = this.revision;
            return composed;
        }
    }
    function snapshot(currentText, referenceText, settings, metadata = {}) {
        if (typeof currentText !== 'string' || typeof referenceText !== 'string') throw new TypeError('Snapshot requires both DXF source strings.');
        return JSON.stringify({ format: 'dxf-render-compare', version: 1, currentText, referenceText, options: options(settings),
            metadata: { currentName: String(metadata.currentName || 'current.dxf'), referenceName: String(metadata.referenceName || 'reference.dxf'), layout: String(metadata.layout || 'Model') } });
    }
    function readSnapshot(text) {
        if (typeof text !== 'string' || text.length > 128 * 1024 * 1024) throw new RangeError('Snapshot input exceeds 128 MiB.');
        const value = JSON.parse(text);
        if (value?.format !== 'dxf-render-compare' || value.version !== 1 || typeof value.currentText !== 'string' || typeof value.referenceText !== 'string') throw new TypeError('Unsupported comparison snapshot.');
        return { ...value, options: options(value.options), current: new A.DxfDocument(value.currentText), reference: new A.DxfDocument(value.referenceText) };
    }
    function report(result) {
        return { format: 'dxf-render-compare-report', version: 1, layout: result.currentScene.layout, counts: result.counts, options: result.options, incomplete: result.incomplete, notices: result.notices,
            changeSets: changeSets(result).map(g => ({ id: g.id, changeIds: g.changeIds, bounds: G.isEmpty(g.bounds) ? null : g.bounds, cloudBounds: G.isEmpty(g.cloudBounds) ? null : g.cloudBounds })),
            changes: result.changes.map(c => ({ id: c.id, status: c.status, current: c.current && { id: c.current.id, handle: c.current.handle, type: c.current.type, layer: c.current.layer },
                reference: c.reference && { id: c.reference.id, handle: c.reference.handle, type: c.reference.type, layer: c.reference.layer }, bounds: G.isEmpty(c.bounds) ? null : c.bounds })) };
    }
    return { groupChanges: cloudEngine.groupChanges, rectangleUnion: cloudEngine.rectangleUnion, createDxfCompare, defaults, propBits, options, descriptor, compareScenes, compose, cloudBounds, Session, snapshot, readSnapshot, report };
});
