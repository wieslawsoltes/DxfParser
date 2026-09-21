/* A retained geometry compiler. The Skia backend consumes these primitives, not
 * the previous rendering library's entity classes, frames, or tessellator. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, G = A.geometry, { vec, add, sub, mul, dot, cross, normal, length, distance, identity, multiply, translation, rotation, scaling, transform, direction, ocs, arcPath, pathFromPoints, transformPath, bulgePath, flatten, bounds, emptyBounds, union, TAU, EPS } = G;
    const radians = n => n * Math.PI / 180;
    const positiveSweep = (a, b, ccw = true) => { if (!Number.isFinite(a) || !Number.isFinite(b))
        throw new RangeError('Finite curve angles required.'); const d = ((ccw ? b - a : a - b) % TAU + TAU) % TAU; return (ccw ? 1 : -1) * (d || TAU); };
    const rgb = n => '#' + (Number(n) & 0xffffff).toString(16).padStart(6, '0');
    const mapGet = (map, name) => map instanceof Map ? map.get(A.key(name)) || map.get(name) : map?.[A.key(name)] || map?.[name];
    const coordFields = ['x', 'y', 'z'];
    const casedFrozen = (set, name) => set?.has(A.key(name)) || false;
    // Decode DXF escapes in one pass: escaped braces are characters, not scope
    // delimiters, and a Unicode escape consumes exactly four hexadecimal digits.
    function plainText(value) {
        const input = String(value ?? '');
        if (input.length > 1000000) throw new RangeError('Text budget exceeded.');
        let out = '';
        for (let i = 0; i < input.length;) {
            const ch = input[i++];
            if (ch === '{' || ch === '}') continue;
            if (ch === '%' && input[i] === '%') {
                const code = input[i + 1]?.toLowerCase(), symbol = { d: '°', p: '±', c: 'Ø' }[code];
                if (symbol) { out += symbol; i += 2; continue; }
            }
            if (ch !== '\\') { out += ch; continue; }
            const code = input[i++];
            if (code === undefined) { out += '\\'; break; }
            if ('\\{}'.includes(code)) { out += code; continue; }
            if (code === 'U' && input[i] === '+' && /^[0-9a-f]{4}$/i.test(input.slice(i + 1, i + 5))) {
                out += String.fromCharCode(parseInt(input.slice(i + 1, i + 5), 16)); i += 5; continue;
            }
            if (code === 'P' || code === 'X') { out += '\n'; continue; }
            if (code === '~') { out += '\u00a0'; continue; }
            if ('LlOoKk'.includes(code)) continue;
            if ('ACHQWTFfcptS'.includes(code)) {
                const end = input.indexOf(';', i);
                if (end >= 0) {
                    if (code === 'S') out += input.slice(i, end).replace(/[\^#]/g, '/');
                    i = end + 1; continue;
                }
            }
            // A malformed/unknown escape remains visible rather than swallowing text.
            out += '\\' + code;
        }
        return out;
    }
    class SceneCompiler {
        constructor(document, options = {}) {
            if (!(document instanceof A.DxfDocument))
                throw new TypeError('SceneCompiler requires a DxfDocument.');
            this.document = document;
            this.options = { tolerance: .02, maxPrimitives: 500000, maxVertices: 3000000, maxDepth: 48, maxInstances: 100000, maxPatternLines: 20000, maxHatchLoops: 4096, background: '#212830', ...options };
            if (!(this.options.tolerance > 0) || !Number.isFinite(this.options.tolerance))
                throw new RangeError('Positive finite tessellation tolerance required.');
            for (const name of ['maxPrimitives', 'maxVertices', 'maxDepth', 'maxInstances', 'maxPatternLines', 'maxHatchLoops'])
                if (!Number.isSafeInteger(this.options[name]) || this.options[name] < 1)
                    throw new RangeError('Positive integer ' + name + ' required.');
            this.plugins = new Map(options.plugins || []);
            this.diagnostics = new A.Diagnostics(options.maxDiagnostics);
            this.primitives = [];
            this.vertices = 0;
            this.instances = 0;
            this.extents = emptyBounds();
            this.sortedLists = new WeakMap();
            this.sortTables = document.objects.filter(r => r.type === 'SORTENTSTABLE');
        }
        diagnostic(code, message, e, severity = 'warning') { this.diagnostics.add(code, message, e, severity); }
        compile(layout = 'Model') {
            this.primitives = [];
            this.vertices = 0;
            this.instances = 0;
            this.extents = emptyBounds();
            this.diagnostics = new A.Diagnostics(this.options.maxDiagnostics);
            for (const issue of this.document.diagnostics.items)
                this.diagnostics.add(issue.code, issue.message, { id: issue.handle, ...issue }, issue.severity);
            const context = { matrix: identity(), layer: '0', color: null, alpha: 1, blocks: [], handles: [], clips: [], depth: 0, layout };
            this.compileList(this.document.getEntities(layout), context);
            const result = { layout, document: this.document, compileOptions: { ...this.options }, primitives: this.primitives, bounds: this.extents, diagnostics: this.diagnostics.items, diagnosticCounts: this.diagnostics.counts,
                stats: { primitives: this.primitives.length, vertices: this.vertices, instances: this.instances } };
            result.index = new A.SpatialIndex(this.primitives.map((primitive, index) => ({ primitive, index, bounds: primitive.bounds })));
            return result;
        }
        compileList(list, context) {
            let entities = list;
            if (this.sortedLists.has(list)) entities = this.sortedLists.get(list);
            else {
            const orders = new Map(), owners = new Set(list.map(e=>e.ownerHandle));
            for (const table of this.sortTables) {
                const owner = A.key(table.all(330).at(-1));
                if (!owners.has(owner))
                    continue;
                let handle = null;
                for (const t of table.tags) {
                    if (t.code === 331)
                        handle = A.key(t.value);
                    else if (t.code === 5 && handle) {
                        orders.set(handle, A.key(t.value));
                        handle = null;
                    }
                }
            }
            if (orders.size)
                entities = list.map((entity, index) => ({ entity, index, order: orders.get(entity.handle) || entity.handle })).sort((a, b) => {
                    if (!/^[0-9a-f]+$/i.test(a.order) || !/^[0-9a-f]+$/i.test(b.order))
                        return a.index - b.index;
                    const x = BigInt('0x' + a.order), y = BigInt('0x' + b.order);
                    if (x === y)
                        return a.index - b.index;
                    if (x === 0n)
                        return 1;
                    if (y === 0n)
                        return -1;
                    return x < y ? -1 : 1;
                }).map(x => x.entity);
            this.sortedLists.set(list, entities);
            }
            for (const entity of entities) {
                if (this.primitives.length >= this.options.maxPrimitives || this.vertices >= this.options.maxVertices) {
                    this.diagnostic('geometry-budget', 'Geometry budget reached; remaining objects were not compiled.', entity, 'error');
                    break;
                }
                try {
                    this.compileEntity(entity, context);
                }
                catch (error) {
                    this.diagnostic('invalid-geometry', error.message, entity, 'error');
                }
            }
        }
        style(e, context) {
            const layerName = A.key(e.layer) === '0' ? context.layer : e.layer, layer = this.document.layer(layerName), override = mapGet(this.options.layerState, layerName);
            if (override?.isOn === false || override?.isFrozen === true)
                return null;
            if ((override?.isFrozen ?? !!(layer.flags & 1)) || !(override?.isOn ?? (layer.colorNumber >= 0)))
                return null;
            if (e.num(60) === 1 || casedFrozen(context.viewportFrozen, layerName) || this.options.printing && layer.plot === false)
                return null;
            if (!['INSERT', 'MINSERT'].includes(e.type) && this.options.entityIsolation?.size && !this.options.entityIsolation.has(e.handle) && !context.handles.some(h => this.options.entityIsolation.has(h)))
                return null;
            let colorNumber = e.num(62, 256), color;
            const explicit = e.get(420);
            if (explicit !== null)
                color = rgb(explicit);
            else if (colorNumber === 0)
                color = context.color || A.aciColor(layer.colorNumber, this.options.background);
            else if (colorNumber === 256) {
                const tc = override?.trueColor || layer.trueColor;
                color = tc ? rgb((tc.red << 16) | (tc.green << 8) | tc.blue) : A.aciColor(override?.colorNumber ?? layer.colorNumber, this.options.background);
            }
            else
                color = A.aciColor(colorNumber, this.options.background);
            const alpha = A.transparency(e.get(440), context.alpha, override?.transparencyAlpha ?? layer.transparency?.alpha ?? 1);
            let lineName = String(e.get(6, 'BYLAYER'));
            if (A.key(lineName) === 'BYLAYER')
                lineName = override?.linetype || layer.linetype || 'CONTINUOUS';
            if (A.key(lineName) === 'BYBLOCK')
                lineName = context.linetype || 'CONTINUOUS';
            const linetype = this.document.linetype(lineName);
            if (linetype?.complex)
                this.diagnostic('complex-linetype', 'Text/shape components of complex linetypes require a custom entity/linetype provider; dash geometry is retained.', e);
            let weight = e.num(370, -1);
            if (weight === -1)
                weight = override?.lineweight ?? layer.lineweight;
            if (weight === -2)
                weight = context.lineweight ?? -3;
            if (weight < 0)
                weight = this.document.headerNumber('$LWDEFAULT', 25);
            return { layer: layerName, color, alpha, lineweight: weight, locked: override?.isLocked ?? !!(layer.flags & 4), linetype: lineName, dash: linetype?.pattern || [], dashScale: this.document.headerNumber('$LTSCALE', 1) * Math.abs(e.num(48, 1)), lineweightVisible: !!this.options.lineweights || this.document.headerNumber('$LWDISPLAY') !== 0 };
        }
        emit(e, context, style, data) {
            if (this.primitives.length >= this.options.maxPrimitives)
                throw new RangeError('Primitive budget exceeded.');
            const matrix = data.matrix || context.matrix;
            if (data.path) {
                data.path = transformPath(data.path, matrix);
                const f = flatten(data.path, this.options.tolerance, 65536);
                if (f.truncated)
                    this.diagnostic('curve-budget', 'Picking tessellation reached its point limit.', e);
                data.rings = f.rings;
                data.points = f.points;
            }
            if (data.points && !data.path)
                data.points = data.points.map(p => transform(matrix, p));
            if (data.position)
                data.position = transform(matrix, data.position);
            if (data.u)
                data.u = direction(matrix, data.u);
            if (data.v)
                data.v = direction(matrix, data.v);
            if (data.curve) data.curve = { ...data.curve, center: transform(matrix, data.curve.center),
                u: direction(matrix, data.curve.u), v: direction(matrix, data.curve.v) };
            if (data.gradient) data.gradient = { ...data.gradient, origin: transform(matrix, data.gradient.origin),
                u: direction(matrix, data.gradient.u), v: direction(matrix, data.gradient.v) };
            if (data.text) {
                const layout = A.layoutText(data, this.options.textMeasurer ? t => this.options.textMeasurer(data, t) : A.fallbackTextWidth);
                data.textLayout = layout;
                const point = (x, y) => add(data.position, add(mul(data.u, x), mul(data.v, -y)));
                data.points = [point(layout.left, layout.top), point(layout.right, layout.top), point(layout.right, layout.bottom), point(layout.left, layout.bottom)];
            }
            const points = data.points || [];
            if (points.some(p => !G.validPoint(p)))
                throw new RangeError('A primitive contains a nonfinite coordinate.');
            this.vertices += points.length;
            if (this.vertices > this.options.maxVertices)
                throw new RangeError('Vertex budget exceeded.');
            const primitive = { ...data, id: `${e.id}:${this.primitives.length}`, source: e, handle: context.handles[0] || e.handle || e.id, entityHandle: e.handle || e.id, type: e.type, blockPath: context.blocks.slice(), instancePath: context.handles.slice(), style: { ...style }, clips: context.clips.slice(), bounds: data.path ? G.pathBounds(data.path) : bounds(points) };
            delete primitive.matrix;
            if (data.infinite)
                primitive.bounds = { minX: -1e30, minY: -1e30, maxX: 1e30, maxY: 1e30, minZ: 0, maxZ: 0 };
            else
                union(this.extents, primitive.bounds);
            this.primitives.push(primitive);
            if (context.thicknessVector && data.path && !data.widePolyline) {
                const offset = context.thicknessVector, ctx = { ...context, matrix: identity(), thicknessVector: null };
                this.emit(e, ctx, style, { kind: 'path', path: transformPath(data.path, translation(offset)), closed: data.closed, fill: !!data.fill, face: !!data.face });
                for (const ring of data.rings)
                    for (let i = 1; i < ring.length; i++)
                        this.path(e, ctx, style, [ring[i - 1], ring[i], add(ring[i], offset), add(ring[i - 1], offset)], true, true, { face: true });
            }
            return primitive;
        }
        path(e, c, s, points, close = false, fill = false, extra = {}) { return this.emit(e, c, s, { kind: 'path', path: pathFromPoints(points, close), fill, closed: close, ...extra }); }
        compileEntity(e, c) {
            const s = this.style(e, c);
            if (!s)
                return;
            const type = e.type;
            const thickness = e.num(39);
            const extrudable = ['LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE', 'SOLID', 'TRACE'].includes(type);
            c = { ...c, thicknessVector: thickness && extrudable ? direction(c.matrix, mul(normal(e.extrusion), thickness)) : null };
            if (thickness && !extrudable)
                this.diagnostic('entity-thickness', 'Thickness is not applied to this entity family.', e);
            if (!['INSERT', 'MINSERT'].includes(type) && this.options.blockIsolation?.size && !c.blocks.some(name => this.options.blockIsolation.has(A.key(name))))
                return;
            if (e.get(347))
                this.diagnostic('material-unlit', 'MATERIAL references are retained; the current native pipeline uses unlit entity colors.', e);
            const localOCS = () => ({ ...c, matrix: multiply(c.matrix, ocs(e.extrusion)) });
            if (type === 'VIEWPORT') {
                this.viewport(e, c, s);
                return;
            }
            if (type === 'INSERT' || type === 'MINSERT') {
                this.insert(e, c, s);
                return;
            }
            if (type === 'LINE') {
                this.path(e, c, s, [e.point(10), e.point(11)]);
                return;
            }
            if (type === 'POINT') {
                this.emit(e, c, s, { kind: 'point', points: [e.point(10)], size: this.document.headerNumber('$PDSIZE'), mode: this.document.headerNumber('$PDMODE') });
                return;
            }
            if (type === 'CIRCLE' || type === 'ARC') {
                const r = e.num(40);
                if (!(r > 0))
                    throw new RangeError('Arc radius must be positive.');
                const p = e.point(10), start = type === 'ARC' ? radians(e.num(50)) : 0, sweep = type === 'ARC' ? positiveSweep(start, radians(e.num(51))) : TAU;
                this.emit(e, localOCS(), s, { kind: 'path', path: arcPath(p, vec(r, 0), vec(0, r), start, sweep), closed: type === 'CIRCLE', curve: { center: p, u: vec(r, 0), v: vec(0, r), start, sweep }, center: transform(multiply(c.matrix, ocs(e.extrusion)), p), radius: r, fill: false });
                return;
            }
            if (type === 'ELLIPSE') {
                const center = e.point(10), u = e.point(11), ratio = e.num(40, 1);
                if (!(length(u) > 0 && ratio > 0))
                    throw new RangeError('Invalid ellipse axes.');
                const v = mul(normal(cross(normal(e.extrusion), u)), length(u) * ratio), start = e.num(41), end = e.num(42, TAU);
                this.emit(e, c, s, { kind: 'path', path: arcPath(center, u, v, start, positiveSweep(start, end)), closed: Math.abs(positiveSweep(start, end) - TAU) < 1e-9, curve: { center, u, v, start, sweep: positiveSweep(start, end) }, center: transform(c.matrix, center) });
                return;
            }
            if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
                this.polyline(e, c, s);
                return;
            }
            if (type === 'SPLINE' || type === 'HELIX') {
                const spline = type === 'HELIX' ? e.subclass('AcDbSpline') : e, cp = spline.points(10);
                if (cp.length) {
                    const points = G.sampleNurbs(cp, spline.num(71, 3), spline.all(40).map(Number), spline.all(41).map(Number), this.options.tolerance);
                    this.path(e, c, s, points, !!(spline.num(70) & 1));
                }
                else if (type === 'HELIX') {
                    const h = e.subclass('AcDbHelix'), origin = h.point(10), n = normal(h.point(12, vec(0, 0, 1))), u0 = sub(h.point(11, vec(1, 0)), origin), u = sub(u0, mul(n, dot(u0, n))), v = normal(cross(n, u));
                    const turns = h.num(41, 1), pitch = h.num(42, 1), r1 = h.num(40, length(u)), count = Math.min(16384, Math.max(32, Math.ceil(Math.abs(turns) * 96))), sign = h.num(290, 1) ? 1 : -1;
                    const points = Array.from({ length: count + 1 }, (_, i) => { const t = i / count, a = TAU * turns * t * sign, r = length(u) + (r1 - length(u)) * t; return add(origin, add(mul(n, pitch * turns * t), add(mul(normal(u), Math.cos(a) * r), mul(v, Math.sin(a) * r)))); });
                    this.path(e, c, s, points);
                }
                else {
                    const points = spline.points(11);
                    if (points.length < 2)
                        throw new RangeError('Spline contains neither control points nor fit points.');
                    const path = G.interpolateFitPoints(points, { closed: !!(spline.num(70) & 3),
                        startTangent: spline.get(12) == null ? null : spline.point(12), endTangent: spline.get(13) == null ? null : spline.point(13) });
                    this.emit(e, c, s, { kind: 'path', path, closed: !!(spline.num(70) & 3) });
                    this.diagnostic('spline-fit-interpolated', 'Fit-only SPLINE uses chord-length C2 cubic interpolation with supplied tangent directions or natural endpoints; periodic when closed.', e, 'info');
                }
                return;
            }
            if (['SOLID', 'TRACE', '3DFACE'].includes(type)) {
                const ps = [e.point(10), e.point(11), e.point(12), e.point(13, e.point(12))];
                if (type !== '3DFACE')
                    [ps[2], ps[3]] = [ps[3], ps[2]];
                const ctx = type === '3DFACE' ? c : localOCS();
                this.path(e, ctx, s, ps, true, true, { face: type === '3DFACE', edgeFlags: type === '3DFACE' ? e.num(70) : 0 });
                return;
            }
            if (type === 'MESH') {
                this.mesh(e, c, s);
                return;
            }
            if (['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(type)) {
                if (type === 'ATTDEF' && !this.options.showDefinitions && !((e.num(70) & 2) && c.blocks.length))
                    return;
                if (type === 'ATTRIB' && this.options.showReferences === false)
                    return;
                if ((type === 'ATTDEF' || type === 'ATTRIB') && (e.num(70) & 1) && !this.options.showInvisible)
                    return;
                this.text(e, c, s);
                return;
            }
            if (type === 'HATCH') {
                this.hatch(e, c, s);
                return;
            }
            if (type === 'XLINE' || type === 'RAY') {
                const p = e.point(10), d = normal(e.point(11));
                this.emit(e, c, s, { kind: 'path', points: [p, add(p, d)], infinite: type === 'RAY' ? 'ray' : 'line' });
                return;
            }
            if (type === 'LEADER' || type === 'MLEADER' || type === 'MULTILEADER') {
                const ps = e.points(10);
                if (ps.length >= 2) {
                    this.path(e, c, s, ps);
                    this.arrow(e, c, s, ps[0], ps[1], e.num(40, Math.max(.5, distance(ps[0], ps[1]) * .12)));
                }
                if (type !== 'LEADER')
                    this.diagnostic('mleader-context', 'MULTILEADER context/branch and block content requires a registered provider; decoded vertices are shown.', e);
                return;
            }
            if (type === 'DIMENSION') {
                this.dimension(e, c, s);
                return;
            }
            if (type === 'IMAGE' || type === 'WIPEOUT') {
                const p = e.point(10), u = e.point(11, vec(1, 0)), v = e.point(12, vec(0, 1)), size = e.point(13, vec(1, 1));
                let clip = e.points(14);
                if (clip.length === 2)
                    clip = [clip[0], vec(clip[1].x, clip[0].y), clip[1], vec(clip[0].x, clip[1].y)];
                const imagePoints = type === 'WIPEOUT' && clip.length ? clip.map(q => add(p, add(mul(u, q.x + .5), mul(v, .5 - q.y)))) : [p, add(p, mul(u, size.x)), add(add(p, mul(u, size.x)), mul(v, size.y)), add(p, mul(v, size.y))];
                if (type === 'WIPEOUT') {
                    this.path(e, c, { ...s, color: this.options.background }, imagePoints, true, true, { wipeout: true });
                    return;
                }
                const def = this.document.sceneGraph.imageDefinitions[A.key(e.get(340))];
                const primitive = this.emit(e, c, s, { kind: 'image', position: p, u, v, imageSize: size, resource: def?.path || e.get(340, ''), points: imagePoints, imageClip: clip, brightness: e.num(281, 50), contrast: e.num(282, 50), fade: e.num(283, 0), displayFlags: e.num(70, 3) });
                if (!(primitive.displayFlags & 1))
                    this.primitives.pop();
                return;
            }
            if (type === 'ACAD_PROXY_ENTITY' && A.decodeProxy) {
                A.decodeProxy(this, e, c, s);
                return;
            }
            const plugin = this.plugins.get(type);
            if (plugin) {
                const output = plugin(e, { document: this.document, context: c, style: s, geometry: G });
                if (!Array.isArray(output))
                    throw new TypeError('Entity provider must return primitive descriptors.');
                for (const data of output)
                    this.emit(e, c, s, data);
                return;
            }
            this.diagnostic('unsupported-entity', `${type} has no geometry provider. Raw data is preserved.`, e);
        }
        viewport(e, c, s) {
            if (e.num(69) <= 1 || e.num(68) <= 0 || A.key(c.layout) === 'MODEL')
                return;
            const width = e.num(40), height = e.num(41), viewHeight = e.num(45);
            if (!(width > 0 && height > 0 && viewHeight > 0))
                throw new RangeError('Invalid paper viewport dimensions.');
            if (e.num(90) & 1)
                this.diagnostic('viewport-perspective', 'Perspective paper viewport is rendered with orthographic projection.', e);
            const basis = G.viewBasis(e.point(16, vec(0, 0, 1)), radians(e.num(51))), target = e.point(17), view = e.point(12), paper = e.point(10), scale = height / viewHeight;
            const projection = [basis.x.x, basis.x.y, basis.x.z, -dot(target, basis.x), basis.y.x, basis.y.y, basis.y.z, -dot(target, basis.y), basis.z.x, basis.z.y, basis.z.z, -dot(target, basis.z), 0, 0, 0, 1];
            const transformMatrix = multiply(multiply(multiply(translation(paper), scaling(scale, scale, 1)), translation(mul(view, -1))), projection);
            let boundary = [vec(paper.x - width / 2, paper.y - height / 2), vec(paper.x + width / 2, paper.y - height / 2), vec(paper.x + width / 2, paper.y + height / 2), vec(paper.x - width / 2, paper.y + height / 2)];
            let clip = { points: boundary.map(p => transform(c.matrix, p)), inverse: false };
            const clipHandle = A.key(e.get(340)), clipEntity = this.document.byHandle.get(clipHandle);
            if (clipEntity && ['CIRCLE', 'ELLIPSE', 'LWPOLYLINE', 'POLYLINE', 'SPLINE'].includes(clipEntity.type)) {
                try {
                    const helper = new SceneCompiler(this.document, { ...this.options, printing: false,
                        blockIsolation: null, entityIsolation: null, layerState: null });
                    const record = new A.DxfRecord([{ code: 0, value: clipEntity.type },
                        ...clipEntity.tags.filter(t => ![39, 40, 41, 43].includes(t.code) || !['LWPOLYLINE', 'POLYLINE'].includes(clipEntity.type))]);
                    record.vertices = clipEntity.vertices.map(v => new A.DxfRecord([{ code: 0, value: 'VERTEX' }, ...v.tags.filter(t => ![40, 41].includes(t.code))]));
                    helper.style = () => s; // Geometry-only clip: ignore display/plot visibility.
                    helper.compileEntity(record, { ...c, matrix: c.matrix, thicknessVector: null, clips: [] });
                    const primitive = helper.primitives.find(p => p.path && p.closed);
                    if (primitive) clip = { path: primitive.path, loops: primitive.rings, inverse: false };
                    else this.diagnostic('viewport-boundary', 'Viewport boundary is not a supported closed curve; rectangular bounds used.', e);
                } catch (error) {
                    this.diagnostic('viewport-boundary', `Invalid viewport boundary (${error.message}); rectangular bounds used.`, e);
                }
            } else if (clipHandle) this.diagnostic('viewport-boundary', 'Viewport boundary handle is missing or unsupported; rectangular bounds used.', e);
            const frozen = new Set(e.all(331).map(handle => A.key(this.document.byHandle.get(A.key(handle))?.get(2))));
            this.compileList(this.document.sceneGraph.modelSpace, { ...c, matrix: multiply(c.matrix, transformMatrix), layout: 'Model', viewportFrozen: frozen, clips: [...c.clips, clip] });
        }
        insert(e, c, s) {
            const name = String(e.get(2, '')), block = this.document.getBlock(name), normalized = A.key(name);
            if (!block) {
                this.diagnostic('missing-block', `Block ${name} is not defined.`, e);
                return;
            }
            if (block.header.xrefPath && !block.entities.length)
                this.diagnostic('external-reference', 'Unloaded XREF: ' + block.header.xrefPath + '. External paths are never fetched automatically.', e);
            if (c.depth >= this.options.maxDepth || c.blocks.map(A.key).includes(normalized)) {
                this.diagnostic('recursive-block', `Recursive/deep block ${name} was cut.`, e, 'error');
                return;
            }
            const columns = Math.max(1, Math.floor(e.num(70, 1))), rows = Math.max(1, Math.floor(e.num(71, 1)));
            if (columns * rows > this.options.maxInstances - this.instances) {
                this.diagnostic('instance-budget', 'Block array exceeds the instance budget.', e, 'error');
                return;
            }
            const insert = multiply(multiply(ocs(e.extrusion), translation(e.point(10))), rotation(radians(e.num(50))));
            const scale = scaling(e.num(41, 1), e.num(42, 1), e.num(43, 1));
            for (let row = 0; row < rows; row++)
                for (let col = 0; col < columns; col++) {
                    this.instances++;
                    // Array spacing is in the rotated block coordinate system, but is NOT scaled.
                    const local = multiply(multiply(multiply(insert, translation(vec(col * e.num(44), row * e.num(45)))), scale), translation(mul(block.header.basePoint, -1)));
                    const child = { ...c, matrix: multiply(c.matrix, local), depth: c.depth + 1, layer: s.layer, color: s.color, alpha: s.alpha, linetype: s.linetype, lineweight: s.lineweight, blocks: [...c.blocks, block.name], handles: [...c.handles, e.handle || e.id] };
                    const clip = this.blockClip(e, child.matrix);
                    if (clip)
                        child.clips = [...c.clips, clip];
                    this.compileList(block.entities, child);
                    // Attached ATTRIB positions are already in the INSERT parent's coordinate system.
                    for (const attr of e.attributes)
                        this.compileEntity(attr, { ...child, matrix: c.matrix });
                }
        }
        blockClip(e, matrix) {
            let record = this.document.byHandle.get(A.key(e.get(360))), visited = new Set();
            const find = (r, depth) => {
                if (!r || depth > 8 || visited.has(r.id))
                    return null;
                visited.add(r.id);
                if (r.type === 'SPATIAL_FILTER')
                    return r;
                for (const t of r.tags)
                    if (t.code === 350 || t.code === 360) {
                        const result = find(this.document.byHandle.get(A.key(t.value)), depth + 1);
                        if (result)
                            return result;
                    }
                return null;
            };
            record = find(record, 0);
            if (!record || !record.num(71, 1))
                return null;
            let ps = record.points(10);
            if (ps.length < 2)
                return null;
            if (ps.length === 2)
                ps = [ps[0], vec(ps[1].x, ps[0].y), ps[1], vec(ps[0].x, ps[1].y)];
            const values = record.all(40).map(Number), raw = values.slice(-24, -12);
            let inverse = identity();
            if (raw.length === 12)
                inverse = [...raw.slice(0, 4), ...raw.slice(4, 8), ...raw.slice(8, 12), 0, 0, 0, 1];
            if (record.num(72) || record.num(73))
                this.diagnostic('xclip-depth', 'Front/back XCLIP planes are not applied by the 2D projection.', e);
            return { points: ps.map(p => transform(multiply(matrix, inverse), p)), inverse: false };
        }
        polyline(e, c, s) {
            const flags = e.num(70), light = e.type === 'LWPOLYLINE';
            if (!light && (flags & 64)) {
                const vertices = e.vertices.filter(v => (v.num(70) & 128) === 0 || !!(v.num(70) & 64)).map(v => v.point(10));
                for (const face of e.vertices.filter(v => (v.num(70) & 128) && !(v.num(70) & 64))) {
                    const indices = [71, 72, 73, 74].map(code => face.num(code)).filter(Boolean);
                    const ps = indices.map(i => vertices[Math.abs(i) - 1]);
                    if (ps.some(p => !p)) {
                        this.diagnostic('invalid-face', 'Polyface index outside the vertex array.', e);
                        continue;
                    }
                    this.path(e, c, s, ps, true, true, { face: true, edgeFlags: indices.reduce((a, n, i) => n < 0 ? a | (1 << i) : a, 0) });
                }
                return;
            }
            if (!light && (flags & 16)) {
                const vs = e.vertices.map(v => v.point(10)), m = e.num(71), n = e.num(72);
                if (m * n > vs.length || m < 2 || n < 2)
                    throw new RangeError('Invalid polygon mesh dimensions.');
                for (let i = 0; i < m - ((flags & 1) ? 0 : 1); i++)
                    for (let j = 0; j < n - ((flags & 32) ? 0 : 1); j++)
                        this.path(e, c, s, [vs[i * n + j], vs[((i + 1) % m) * n + j], vs[((i + 1) % m) * n + (j + 1) % n], vs[i * n + (j + 1) % n]], true, true, { face: true });
                return;
            }
            const vertices = [];
            if (light) {
                const elevation = e.num(38), constantWidth = e.num(43);
                let v = null;
                for (const t of e.tags) {
                    if (t.code === 10) {
                        v = { point: vec(Number(t.value), 0, elevation), bulge: 0, startWidth: constantWidth, endWidth: constantWidth };
                        vertices.push(v);
                    }
                    else if (v) {
                        if (t.code === 20)
                            v.point.y = Number(t.value);
                        if (t.code === 42)
                            v.bulge = Number(t.value);
                        if (t.code === 40)
                            v.startWidth = Number(t.value);
                        if (t.code === 41)
                            v.endWidth = Number(t.value);
                    }
                }
            }
            else
                for (const v of e.vertices)
                    vertices.push({ point: v.point(10), bulge: v.num(42), startWidth: v.num(40, e.num(40)), endWidth: v.num(41, e.num(41)) });
            if (vertices.length < 2)
                return;
            const ctx = !light && (flags & 8) ? c : { ...c, matrix: multiply(c.matrix, ocs(e.extrusion)) };
            if (!light && !(flags & 8)) {
                const elevation = e.num(30);
                for (const v of vertices)
                    v.point.z = elevation;
            }
            const closed = !!(flags & 1), path = [], hasWidth = vertices.some(v => v.startWidth > 0 || v.endWidth > 0);
            if (vertices.some(v => !G.validPoint(v.point) || !Number.isFinite(v.bulge) || !Number.isFinite(v.startWidth) || !Number.isFinite(v.endWidth) || v.startWidth < 0 || v.endWidth < 0))
                throw new RangeError('Invalid polyline vertex or width.');
            for (let i = 0; i < vertices.length - (closed ? 0 : 1); i++) {
                const a = vertices[i], b = vertices[(i + 1) % vertices.length], segment = bulgePath(a.point, b.point, a.bulge);
                path.push(...(i ? segment.slice(1) : segment));
                if (a.startWidth > 0 || a.endWidth > 0) {
                    const ps = flatten(segment, this.options.tolerance, 8192).points, left = [], right = [];
                    let total = 0;
                    const lengths = [0];
                    for (let j = 1; j < ps.length; j++) {
                        total += distance(ps[j - 1], ps[j]);
                        lengths.push(total);
                    }
                    for (let j = 0; j < ps.length; j++) {
                        const tangent = sub(ps[Math.min(ps.length - 1, j + 1)], ps[Math.max(0, j - 1)]), n = length(tangent) ? normal(vec(-tangent.y, tangent.x)) : vec(0, 1), w = (a.startWidth + (a.endWidth - a.startWidth) * (total ? lengths[j] / total : 0)) / 2;
                        left.push(add(ps[j], mul(n, w)));
                        right.push(sub(ps[j], mul(n, w)));
                    }
                    this.path(e, ctx, s, [...left, ...right.reverse()], true, true, { widePolyline: true });
                }
                else if (hasWidth)
                    this.emit(e, ctx, s, { kind: 'path', path: segment, closed: false });
            }
            if (closed)
                path.push(['Z']);
            if (!hasWidth)
                this.emit(e, ctx, s, { kind: 'path', path, closed });
        }
        mesh(e, c, s) {
            const vertices = e.points(10), start = e.tags.findIndex(t => t.code === 93), end = e.tags.findIndex((t, i) => i > start && t.code === 94);
            const faceData = e.tags.slice(start + 1, end < 0 ? undefined : end).filter(t => t.code === 90).map(t => Number(t.value));
            for (let i = 0; i < faceData.length;) {
                const n = faceData[i++];
                if (!Number.isInteger(n) || n < 3 || n > 65536 || i + n > faceData.length)
                    throw new RangeError('Invalid MESH face record.');
                const ps = faceData.slice(i, i + n).map(j => vertices[j]);
                i += n;
                if (ps.some(p => !p))
                    throw new RangeError('MESH index outside the vertex array.');
                this.path(e, c, s, ps, true, true, { face: true });
            }
            if (e.num(91) > 0)
                this.diagnostic('mesh-subdivision', 'MESH control faces are shown; subdivision/crease evaluation requires a mesh provider.', e);
        }
        text(e, c, s) {
            const mtext = e.type === 'MTEXT', style = this.document.textStyle(e.get(7, 'STANDARD'));
            const content = mtext ? e.tags.filter(t => t.code === 3 || t.code === 1).map(t => t.value).join('') : String(e.get(1, ''));
            const text = plainText(content);
            if (!text)
                return;
            const h = e.num(40, style?.height || 1);
            if (!(h > 0))
                return;
            if (mtext && /\\[ACHQWTFfS]/.test(content))
                this.diagnostic('mtext-formatting', 'Common MTEXT content is decoded; mixed run formatting and stacked fraction typography are not fully represented.', e);
            if (style?.bigFont)
                this.diagnostic('bigfont', 'Bigfont secondary mappings require a supplied text provider.', e);
            const a = radians(e.num(50)), position = e.point(10);
            let u = vec(Math.cos(a) * h, -Math.sin(a) * -h), v = vec(-Math.sin(a) * h, Math.cos(a) * h);
            if (mtext && e.get(11) !== null) {
                u = mul(normal(e.point(11)), h);
                v = mul(normal(cross(normal(e.extrusion), u)), h);
            }
            else {
                u = direction(ocs(e.extrusion), u);
                v = direction(ocs(e.extrusion), v);
            }
            const width = e.num(41, style?.width || 1), oblique = Math.tan(radians(e.num(51, style?.oblique || 0)));
            if (!mtext) {
                u = mul(u, width);
                v = add(v, mul(u, oblique));
                const flags = e.num(71);
                if (flags & 2)
                    u = mul(u, -1);
                if (flags & 4)
                    v = mul(v, -1);
            }
            let align = mtext ? (e.num(71, 1) - 1) % 3 : e.num(72), vertical = mtext ? Math.floor((e.num(71, 1) - 1) / 3) : e.num(73);
            let origin = mtext ? position : transform(ocs(e.extrusion), position);
            if (!mtext && (align || vertical) && e.get(11) !== null)
                origin = transform(ocs(e.extrusion), e.point(11));
            if (!mtext && (align === 3 || align === 5) && e.get(11) !== null) {
                const start = transform(ocs(e.extrusion), position), end = transform(ocs(e.extrusion), e.point(11)), d = sub(end, start), scale = length(d) / Math.max(text.length * .65, EPS);
                u = mul(normal(d), scale);
                if (align === 3)
                    v = mul(normal(cross(normal(e.extrusion), u)), scale);
                origin = start;
                align = 0;
            }
            this.emit(e, c, s, { kind: 'text', text, rawText: content, position: origin, u, v, font: style?.font || '', fontName: style?.name || String(e.get(7, 'STANDARD')), bigFont: style?.bigFont || '', align: Math.min(2, align), vertical, mtext, width: mtext ? e.num(41) : 0, wrapWidth: mtext ? e.num(41) / h : 0, lineSpacing: mtext ? e.num(44, 1) : 1, backgroundMask: mtext ? e.num(90) : 0 });
        }
        arrow(e, c, s, tip, towards, size) { const d = normal(sub(towards, tip)), n = vec(-d.y, d.x, d.z || 0), base = add(tip, mul(d, size)); this.path(e, c, s, [tip, add(base, mul(n, size * .3)), sub(base, mul(n, size * .3))], true, true); }
        dimension(e, c, s) {
            const name = e.get(2), block = name && this.document.getBlock(name);
            if (block) {
                this.compileList(block.entities, { ...c, blocks: [...c.blocks, block.name], handles: [...c.handles, e.handle || e.id], layer: s.layer, color: s.color, alpha: s.alpha });
                return;
            }
            const d = e.num(70) & 7;
            const style = Object.values(this.document.tables.dimstyles).find(x => A.key(x.name) === A.key(e.get(3, 'STANDARD')))?.record;
            const setting = (code, name, fallback) => style?.num(code, this.document.headerNumber(name, fallback)) ?? this.document.headerNumber(name, fallback);
            const scale = setting(40, '$DIMSCALE', 1) || 1, h = setting(140, '$DIMTXT', 2.5) * scale, arrow = setting(41, '$DIMASZ', 2.5) * scale;
            if (!(h > 0 && arrow >= 0 && Number.isFinite(h) && Number.isFinite(arrow))) throw new RangeError('Invalid dimension text/arrow size.');
            const basis = ocs(e.extrusion), inverse = G.inverse(basis), point = code => transform(inverse, e.point(code));
            const ctx = { ...c, matrix: multiply(c.matrix, basis) }; // Definition points WCS; text/arc location 11/16 OCS.
            const textSpecified = e.get(11) !== null;
            let a, b, measure, at = e.point(11), angle = 0, angular = d === 2 || d === 5;
            const extension = (p, q, index) => {
                if (setting(index === 0 ? 75 : 76, index === 0 ? '$DIMSE1' : '$DIMSE2', 0)) return;
                const delta = sub(q, p), n = length(delta) > EPS ? normal(delta) : vec(0, 1);
                const start = add(p, mul(n, setting(42, '$DIMEXO', .625) * scale));
                const end = add(q, mul(n, setting(44, '$DIMEXE', 1.25) * scale));
                this.path(e, ctx, s, [start, end]);
            };
            if (angular) {
                let origin, p, q, arcPoint;
                if (d === 5) { origin = point(15); p = point(13); q = point(14); arcPoint = point(10); }
                else {
                    const p0 = point(13), p1 = point(14), q0 = point(10), q1 = point(15), u = sub(p1, p0), v = sub(q1, q0);
                    const det = u.x*v.y-u.y*v.x;
                    if (Math.abs(det) < EPS * Math.max(1, length(u)*length(v))) throw new RangeError('Angular dimension lines are parallel or degenerate.');
                    origin = add(p0, mul(u, ((q0.x-p0.x)*v.y-(q0.y-p0.y)*v.x)/det));
                    p = p1; q = q1; arcPoint = e.point(16);
                    if (distance(p, origin) < EPS) p = p0;
                    if (distance(q, origin) < EPS) q = q0;
                }
                const u = sub(p, origin), v = sub(q, origin);
                if (length(u) < EPS || length(v) < EPS) throw new RangeError('Angular dimension requires distinct definition points.');
                const first = Math.atan2(u.y,u.x), second = Math.atan2(v.y,v.x), through = Math.atan2(arcPoint.y-origin.y,arcPoint.x-origin.x);
                const choices = d === 2 ? [first, first+Math.PI].flatMap(x => [second,second+Math.PI].map(y => [x,positiveSweep(x,y)])) : [[first,positiveSweep(first,second)],[second,positiveSweep(second,first)]];
                const sector = choices.filter(([start,sweep]) => ((through-start)%TAU+TAU)%TAU <= sweep+1e-10).sort((x,y)=>x[1]-y[1])[0] || choices[0];
                const [start,sweep] = sector, radius = Math.hypot(arcPoint.x-origin.x,arcPoint.y-origin.y);
                if (!(radius>EPS)) throw new RangeError('Angular dimension arc radius must be positive.');
                const atAngle=t=>add(origin,vec(Math.cos(t)*radius,Math.sin(t)*radius));
                a=atAngle(start);b=atAngle(start+sweep);measure=sweep;
                this.emit(e,ctx,s,{kind:'path',path:arcPath(origin,vec(radius,0),vec(0,radius),start,sweep),fill:false});
                extension(p,a,0);extension(q,b,1);
                if (arrow) {
                    const size=Math.min(arrow,radius*sweep/4);
                    this.arrow(e,ctx,s,a,add(a,vec(-Math.sin(start),Math.cos(start))),size);
                    this.arrow(e,ctx,s,b,add(b,vec(Math.sin(start+sweep),-Math.cos(start+sweep))),size);
                }
                if(!textSpecified) at=add(origin,vec(Math.cos(start+sweep/2)*(radius+h*.6),Math.sin(start+sweep/2)*(radius+h*.6)));
                angle=0;
            } else if (d === 0 || d === 1) {
                const p=point(13),q=point(14),loc=point(10);
                angle=d===1?Math.atan2(q.y-p.y,q.x-p.x):radians(e.num(50));
                const dir=vec(Math.cos(angle),Math.sin(angle)),n=vec(-dir.y,dir.x);
                a=add(p,mul(n,dot(sub(loc,p),n)));b=add(q,mul(n,dot(sub(loc,q),n)));
                measure=Math.abs(dot(sub(q,p),dir));extension(p,a,0);extension(q,b,1);
                if(!textSpecified) at=add(mul(add(a,b),.5),mul(n,h*.6));
            } else if (d === 3 || d === 4) {
                a=point(10);b=point(15);measure=distance(a,b);angle=Math.atan2(b.y-a.y,b.x-a.x);
                if(!textSpecified)at=mul(add(a,b),.5);
            } else if (d === 6) {
                a=point(13);b=point(14);const origin=point(10);measure=(e.num(70)&64)?a.x-origin.x:a.y-origin.y;
                if(!textSpecified)at=b;
            } else { this.diagnostic('dimension-fallback','Unsupported generated dimension type '+d+'.',e);return; }
            if (!angular) {
                this.path(e,ctx,s,[a,b]);
                if(arrow && distance(a,b)>EPS && d!==6) {
                    const size=Math.min(arrow,distance(a,b)/4);
                    if(d!==4)this.arrow(e,ctx,s,a,b,size);
                    this.arrow(e,ctx,s,b,a,size);
                }
            }
            let precision=setting(angular?179:271,angular?'$DIMADEC':'$DIMDEC',2);
            if(precision<0)precision=setting(271,'$DIMDEC',2);precision=Math.max(0,Math.min(8,Math.trunc(precision)));
            let numeric=angular?measure:measure*setting(144,'$DIMLFAC',1), suffix='';
            if(angular){
                const unit=setting(275,'$DIMAUNIT',0);
                if(unit===2){numeric=measure*200/Math.PI;suffix='g';}else if(unit===3){suffix='r';}else{numeric=measure*180/Math.PI;suffix='°';}
                if(unit===1 || unit===4)this.diagnostic('dimension-angle-format','DMS/surveyor formatting shown as decimal degrees.',e);
            } else {
                const rounding=setting(45,'$DIMRND',0);if(rounding>0)numeric=Math.round(numeric/rounding)*rounding;
                if(![2,6].includes(setting(277,'$DIMLUNIT',2)))this.diagnostic('dimension-linear-format','Nondecimal dimension units shown as decimal drawing units.',e);
            }
            if(!Number.isFinite(numeric))throw new RangeError('Dimension measurement overflow.');
            let value=numeric.toFixed(precision);
            const suppress=setting(angular?79:78,angular?'$DIMAZIN':'$DIMZIN',0);
            if(suppress&(angular?2:8))value=value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/,'');
            if(suppress&(angular?1:4))value=value.replace(/^(-?)0\./,'$1.');
            if(Number(value)===0)value=value.replace(/^-/, '');
            const separator=setting(278,'$DIMDSEP',46);if(Number.isInteger(separator)&&separator>=32&&separator<127)value=value.replace('.',String.fromCharCode(separator));
            value=(d===3?'Ø':d===4?'R':'')+value+suffix;
            const post=style?.get(3,'');if(!angular && post)value=String(post).replace(/<>/g,value);
            let label=String(e.get(1,'<>'));if(label===' ')return;if(label==='')label='<>';
            label=plainText(label.replace(/<>/g,value));angle+=radians(e.num(53));
            const textStyle=this.document.byHandle.get(A.key(style?.get(340))),font=this.document.textStyle(textStyle?.get(2,'STANDARD'));
            this.emit(e,ctx,s,{kind:'text',text:label,position:at,u:vec(Math.cos(angle)*h,Math.sin(angle)*h),v:vec(-Math.sin(angle)*h,Math.cos(angle)*h),align:1,vertical:0,font:font?.font||'',fontName:font?.name||'',mtext:false});
            this.diagnostic('dimension-generated','Stored dimension block absent: generated definition-point geometry; advanced overrides/arrow blocks remain unsupported.',e,'info');
        }
        hatch(e, c, s) {
            const tags = e.tags, starts = [];
            for (let i = 0; i < tags.length; i++)
                if (tags[i].code === 92)
                    starts.push(i);
            if (starts.length > this.options.maxHatchLoops) throw new RangeError('Hatch loop budget exceeded.');
            const islandStyle = e.num(75);
            if (![0, 1, 2].includes(islandStyle)) throw new RangeError('Unknown hatch island style.');
            const boundaryEnd = tags.findIndex((t, i) => i > (starts.at(-1) ?? 0) && [75, 76, 78, 98, 450].includes(t.code));
            const commands = [], loops = [], ctx = { ...c, matrix: multiply(c.matrix, ocs(e.extrusion)) }, elevation = e.num(30);
            for (let i = 0; i < starts.length; i++) {
                const part = tags.slice(starts[i], starts[i + 1] ?? (boundaryEnd < 0 ? tags.length : boundaryEnd)), flags = Number(part[0].value), path = [];
                // DXF style filters are defined by EXTERNAL/OUTERMOST flags, not
                // winding direction. Normal uses all loops; outer stops at first islands.
                if (islandStyle === 2 && !(flags & 1) || islandStyle === 1 && !(flags & 17)) continue;
                if (flags & 2) {
                    let vs = [], v = null;
                    const stop = part.findIndex(t => t.code === 97);
                    for (const t of part.slice(0, stop < 0 ? undefined : stop)) {
                        if (t.code === 10) {
                            v = { point: vec(Number(t.value), 0, elevation), bulge: 0 };
                            vs.push(v);
                        }
                        else if (v && t.code === 20)
                            v.point.y = Number(t.value);
                        else if (v && t.code === 42)
                            v.bulge = Number(t.value);
                    }
                    for (let j = 0; j < vs.length; j++) {
                        const segment = bulgePath(vs[j].point, vs[(j + 1) % vs.length].point, vs[j].bulge);
                        path.push(...(j ? segment.slice(1) : segment));
                    }
                    path.push(['Z']);
                }
                else {
                    const edges = [];
                    for (let j = 1; j < part.length; j++)
                        if (part[j].code === 72)
                            edges.push(j);
                    for (let j = 0; j < edges.length; j++) {
                        const data = part.slice(edges[j] + 1, edges[j + 1] ?? part.length), edgeType = Number(part[edges[j]].value), r = new A.DxfRecord([{ code: 0, value: 'HATCH_EDGE' }, ...data]);
                        let edge = [];
                        if (edgeType === 1)
                            edge = pathFromPoints([r.point(10), r.point(11)]);
                        else if (edgeType === 2) {
                            const center = r.point(10), radius = r.num(40), a = radians(r.num(50));
                            edge = arcPath(center, vec(radius, 0), vec(0, radius), a, positiveSweep(a, radians(r.num(51)), r.num(73, 1) !== 0));
                        }
                        else if (edgeType === 3) {
                            const center = r.point(10), u = r.point(11), v = mul(vec(-u.y, u.x), r.num(40, 1)), a = radians(r.num(50));
                            edge = arcPath(center, u, v, a, positiveSweep(a, radians(r.num(51)), r.num(73, 1) !== 0));
                        }
                        else if (edgeType === 4) {
                            edge = pathFromPoints(G.sampleNurbs(r.points(10), r.num(94, 3), r.all(40).map(Number), r.all(42).map(Number), this.options.tolerance));
                        }
                        else
                            this.diagnostic('hatch-edge', `Unsupported hatch boundary edge ${edgeType}.`, e);
                        if (edge.length) {
                            if (path.length && distance((path.at(-1)[0] === 'K' || path.at(-1)[0] === 'Q' ? path.at(-1)[2] : path.at(-1)[0] === 'C' ? path.at(-1)[3] : path.at(-1)[1]) || edge[0][1], edge[0][1]) > this.options.tolerance)
                                path.push(['L', edge[0][1]]);
                            path.push(...(path.length ? edge.slice(1) : edge));
                        }
                    }
                    path.push(['Z']);
                }
                for (const cmd of path)
                    for (const p of cmd.slice(1))
                        if (typeof p === 'object')
                            p.z = elevation;
                const fs = flatten(path, this.options.tolerance).points;
                if (fs.length >= 3) {
                    commands.push(...path);
                    loops.push(fs);
                }
            }
            if (!commands.length) {
                this.diagnostic('empty-hatch', 'Hatch has no usable boundary loops.', e);
                return;
            }
            if (e.num(70) === 1 || e.num(450) === 1) {
                let gradient = null;
                if (e.num(450) === 1) {
                    const name = A.key(e.get(470, 'LINEAR')), colors = e.all(421).map(rgb);
                    if (!colors.length) colors.push(...e.all(63).map(n => A.aciColor(Number(n), this.options.background)));
                    if (['LINEAR', 'CYLINDER', 'INVCYLINDER', 'SPHERICAL', 'INVSPHERICAL'].includes(name) && colors.length) {
                        if (e.num(452)) {
                            const tint = G.clamp(e.num(462), 0, 1), value = parseInt(colors[0].slice(1),16);
                            colors[1] = rgb([16,8,0].reduce((n,shift) => n | Math.round(((value>>>shift)&255)*(1-tint)+255*tint)<<shift,0));
                        }
                        if (!colors[1]) colors[1]='#ffffff';
                        const box=G.pathBounds(commands), cx=(box.minX+box.maxX)/2, cy=(box.minY+box.maxY)/2, angle=e.num(460), ux=Math.cos(angle), uy=Math.sin(angle);
                        const rx=Math.max(EPS,(Math.abs(ux)*(box.maxX-box.minX)+Math.abs(uy)*(box.maxY-box.minY))/2);
                        const ry=Math.max(EPS,(Math.abs(uy)*(box.maxX-box.minX)+Math.abs(ux)*(box.maxY-box.minY))/2);
                        gradient={name,colors:colors.slice(0,2),origin:vec(cx,cy,elevation),u:vec(ux*rx,uy*rx),v:vec(-uy*ry,ux*ry),shift:G.clamp(e.num(461),0,1)};
                    } else this.diagnostic('hatch-gradient', 'Gradient family or colors unavailable; solid entity color is shown for '+name+'.', e);
                }
                this.emit(e, ctx, s, { kind: 'path', path: commands, fill: true, closed: true, fillRule: 'evenodd', gradient });
                return;
            }
            const pattern = [];
            let line = null;
            for (const t of tags) {
                if (t.code === 53) {
                    line = { angle: radians(Number(t.value)), base: vec(), offset: vec(), dashes: [] };
                    pattern.push(line);
                }
                else if (line) {
                    if (t.code === 43)
                        line.base.x = Number(t.value);
                    if (t.code === 44)
                        line.base.y = Number(t.value);
                    if (t.code === 45)
                        line.offset.x = Number(t.value);
                    if (t.code === 46)
                        line.offset.y = Number(t.value);
                    if (t.code === 49)
                        line.dashes.push(Number(t.value));
                }
            }
            if (!pattern.length) {
                this.emit(e, ctx, s, { kind: 'path', path: commands, fill: false, closed: true });
                this.diagnostic('hatch-pattern', 'Pattern data absent; boundary only is drawn.', e);
                return;
            }
            const clip = { points: [], loops: loops.map(ring => ring.map(p => transform(ctx.matrix, p))), path: transformPath(commands, ctx.matrix), inverse: false };
            const clipContext = { ...ctx, clips: [...c.clips, clip] }, b = bounds(loops.flat()), corners = [vec(b.minX, b.minY), vec(b.maxX, b.minY), vec(b.maxX, b.maxY), vec(b.minX, b.maxY)];
            let emitted = 0;
            for (const p of pattern) {
                const u = vec(Math.cos(p.angle), Math.sin(p.angle)), v = vec(-u.y, u.x), spacing = dot(p.offset, v);
                if (Math.abs(spacing) < 1e-10) {
                    this.diagnostic('hatch-spacing', 'Zero hatch-line separation was rejected.', e);
                    continue;
                }
                const offsets = corners.map(q => dot(sub(q, p.base), v) / spacing), min = Math.floor(Math.min(...offsets)) - 1, max = Math.ceil(Math.max(...offsets)) + 1;
                if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max - min + 1 > this.options.maxPatternLines - emitted) {
                    this.diagnostic('hatch-density', 'Hatch pattern exceeds the line budget; pattern family was omitted.', e);
                    continue;
                }
                for (let i = min; i <= max; i++) {
                    const base = add(p.base, mul(p.offset, i)), ts = corners.map(q => dot(sub(q, base), u)), a = add(base, mul(u, Math.min(...ts) - 1)), end = add(base, mul(u, Math.max(...ts) + 1));
                    a.z = end.z = elevation;
                    const lineScale=length(direction(ctx.matrix,u));
                    this.path(e, clipContext, { ...s, dash: p.dashes, dashScale: lineScale, dashOffset: dot(sub(a,base),u)*lineScale }, [a, end]);
                    emitted++;
                }
            }
        }
    }
    Object.assign(A, { SceneCompiler, plainText });
    if (typeof module === 'object' && module.exports)
        module.exports = A;
})(globalThis);
