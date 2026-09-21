/* Native Skia rendering and geometry-aware interaction. The renderer never owns a
 * browser 2D/WebGL drawing context; surface presentation belongs to SkiaSharpWeb. */
(function (root) {
    'use strict';
    const A = root.DxfSkia, G = A.geometry, { vec, add, sub, mul, dot, project, viewBasis, bounds, emptyBounds, union, center } = G;
    const projections = new WeakMap();
    function projectedScene(scene, basis) {
        const key = [basis.x, basis.y, basis.z].flatMap(p => [p.x, p.y, p.z]).join(',');
        let cache = projections.get(scene);
        if (!cache) {
            cache = new Map();
            projections.set(scene, cache);
        }
        if (cache.has(key))
            return cache.get(key);
        const entries = scene.primitives.map((primitive, index) => {
            let points, rings; // Pick tessellation is transformed only when interaction needs it.
            const box = primitive.infinite ? { minX: -1e30, minY: -1e30, maxX: 1e30, maxY: 1e30, minZ: 0, maxZ: 0 } : primitive.path ? G.pathBounds(primitive.path, p => project(p, basis)) : bounds((primitive.points || []).map(p => project(p, basis)));
            for (const clip of primitive.clips || [])
                if (!clip.inverse) {
                    const cb = bounds((clip.loops?.flat() || clip.points || []).map(p => project(p, basis)));
                    if (!G.isEmpty(cb)) {
                        box.minX = Math.max(box.minX, cb.minX);
                        box.maxX = Math.min(box.maxX, cb.maxX);
                        box.minY = Math.max(box.minY, cb.minY);
                        box.maxY = Math.min(box.maxY, cb.maxY);
                    }
                }
            const entry = { primitive, index, bounds: box };
            Object.defineProperties(entry, {
                points: { get: () => points ||= (primitive.points || []).map(p => project(p, basis)) },
                rings: { get: () => rings ||= primitive.rings ? primitive.rings.map(r => r.map(p => project(p, basis))) : [entry.points] }
            });
            return entry;
        });
        const extents = entries.filter(x => !x.primitive.infinite).reduce((b, x) => union(b, x.bounds), emptyBounds());
        const centerEntries = entries.filter(e => e.primitive.center).map(entry => ({ entry, bounds: bounds([project(entry.primitive.center, basis)]) }));
        const clipCache = new WeakMap();
        const result = { entries, bounds: extents, index: new A.SpatialIndex(entries), centers: new A.SpatialIndex(centerEntries), basis, key,
            clipLoops(clip) { let loops = clipCache.get(clip); if (!loops) { loops = (clip.loops || [clip.points || []]).map(r => r.map(p => project(p, basis))); clipCache.set(clip, loops); } return loops; }
        };
        if (cache.size >= 4)
            cache.delete(cache.keys().next().value);
        cache.set(key, result);
        return result;
    }
    function clipInfiniteLine(a, b, box, ray = false) {
        const d = sub(b, a);
        let low = ray ? 0 : -Infinity, high = Infinity;
        for (const axis of ['x', 'y']) {
            const min = box['min' + axis.toUpperCase()], max = box['max' + axis.toUpperCase()];
            if (Math.abs(d[axis]) < 1e-30) {
                if (a[axis] < min || a[axis] > max)
                    return null;
                continue;
            }
            let t0 = (min - a[axis]) / d[axis], t1 = (max - a[axis]) / d[axis];
            if (t0 > t1)
                [t0, t1] = [t1, t0];
            low = Math.max(low, t0);
            high = Math.min(high, t1);
            if (low > high)
                return null;
        }
        if (!Number.isFinite(low) || !Number.isFinite(high))
            return null;
        return [add(a, mul(d, low)), add(a, mul(d, high))];
    }
    // Convert signed DXF dash/gap/dot runs to a cyclic native Skia dash pattern.
    // Native intervals always begin with ink; phase preserves the source origin.
    function nativeDash(pattern, scale = 1, dotLength = .01) {
        if (!pattern?.length)
            return { intervals: [], phase: 0 };
        if (pattern.length > 1024 || !(scale > 0) || !Number.isFinite(scale) || !(dotLength > 0) || !Number.isFinite(dotLength))
            throw new RangeError('Invalid linetype pattern.');
        const runs = [];
        for (const n of pattern) {
            if (!Number.isFinite(n))
                throw new RangeError('Nonfinite dash length.');
            const ink = n >= 0, len = n === 0 ? dotLength : Math.abs(n) * scale;
            if (!Number.isFinite(Math.fround(len))) throw new RangeError('Native dash length overflow.');
            const last = runs.at(-1);
            if (last?.ink === ink)
                last.length += len;
            else
                runs.push({ ink, length: len });
        }
        if (runs.length === 1)
            return { intervals: [], phase: 0, empty: !runs[0].ink };
        let offset = 0;
        if (runs[0].ink === runs.at(-1).ink) {
            offset = runs.at(-1).length;
            runs[0].length += offset;
            runs.pop();
        }
        const pivot = runs[0].ink ? 0 : 1, prefix = pivot ? runs[0].length : 0;
        const cycle = runs.reduce((n, r) => n + r.length, 0);
        if (!Number.isFinite(Math.fround(cycle))) throw new RangeError('Native dash cycle overflow.');
        const ordered = [...runs.slice(pivot), ...runs.slice(0, pivot)];
        return { intervals: ordered.map(r => r.length), phase: ((offset - prefix) % cycle + cycle) % cycle };
    }
    function prepareFrame(scene, { width = 800, height = 600, devicePixelRatio = 1, viewState = {}, viewDirection = vec(0, 0, 1), padding = 32, visualStyle = '2dwireframe', background = '#212830' } = {}) {
        if (!scene?.primitives)
            throw new TypeError('Expected a compiled scene.');
        if (!(width > 0 && height > 0 && width <= 32768 && height <= 32768))
            throw new RangeError('Invalid viewport size.');
        if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0 || !Number.isFinite(padding) || padding < 0 || (viewState.rotationRad !== undefined && !Number.isFinite(viewState.rotationRad)))
            throw new RangeError('Invalid device pixel ratio, padding or view rotation.');
        const basis = viewBasis(viewDirection, 0), projection = projectedScene(scene, basis), b = projection.bounds, isEmpty = G.isEmpty(b);
        const autoCenter = isEmpty ? vec() : center(b), dx = isEmpty ? 100 : Math.max(1e-6, b.maxX - b.minX), dy = isEmpty ? 100 : Math.max(1e-6, b.maxY - b.minY);
        const angle = Number(viewState.rotationRad) || 0, cos = Math.cos(angle), sin = Math.sin(angle);
        const autoScale = Math.max(1e-12, Math.min(Math.max(1, width - 2 * padding) / (Math.abs(cos) * dx + Math.abs(sin) * dy), Math.max(1, height - 2 * padding) / (Math.abs(sin) * dx + Math.abs(cos) * dy)));
        const custom = viewState.mode === 'custom', c = custom && G.validPoint(viewState.center) ? vec(viewState.center.x, viewState.center.y, viewState.center.z || 0) : autoCenter;
        const scale = custom && viewState.scale > 0 && Number.isFinite(viewState.scale) ? G.clamp(viewState.scale, 1e-12, 1e12) : autoScale;
        const screen = p => vec(width / 2 + ((p.x - c.x) * cos - (p.y - c.y) * sin) * scale, height / 2 - ((p.x - c.x) * sin + (p.y - c.y) * cos) * scale, p.z), toView = p => project(p, basis);
        const toProjected = p => { const x = (p.x - width / 2) / scale, y = (height / 2 - p.y) / scale; return vec(c.x + cos * x + sin * y, c.y - sin * x + cos * y); };
        const worldToScreen = p => screen(toView(p)), screenToWorld = p => { const v = toProjected(p); return add(add(mul(basis.x, v.x), mul(basis.y, v.y)), mul(basis.z, c.z || 0)); };
        const screenDirection = p => { const v = project(p, basis); return vec((v.x * cos - v.y * sin) * scale, -(v.x * sin + v.y * cos) * scale); };
        const margin = 10 / scale, viewport = bounds([vec(-10, -10), vec(width + 10, -10), vec(width + 10, height + 10), vec(-10, height + 10)].map(toProjected));
        const entries = projection.index.search(viewport).sort((a, b) => a.index - b.index);
        const picks = new Map(), interactionStats = { pickablesCreated: 0, screenPointsTransformed: 0 };
        const pick = entry => {
            if (picks.has(entry)) return picks.get(entry);
            const p = entry.primitive;
            const b = entry.bounds;
            let screenPoints;
            const result = { handle: p.handle, entityHandle: p.entityHandle, type: p.type, layer: p.style.layer,
                worldBounds: p.bounds, worldPoints: p.points, isClosed: !!p.closed, weight: entry.index,
                primitive: p, entry, clips: p.clips };
            Object.defineProperties(result, {
                screenPoints: { enumerable: true, get() {
                    if (!screenPoints) {
                        const points = p.infinite ? clipInfiniteLine(entry.points[0], entry.points[1], viewport, p.infinite === 'ray') || [] : entry.points;
                        interactionStats.screenPointsTransformed += points.length;
                        screenPoints = points.map(screen);
                    }
                    return screenPoints;
                } },
                screenBounds: { enumerable: true, get() {
                    const box = p.infinite ? bounds(result.screenPoints) : bounds([
                        vec(b.minX,b.minY), vec(b.maxX,b.minY), vec(b.maxX,b.maxY), vec(b.minX,b.maxY)
                    ].map(screen));
                    Object.defineProperty(result, 'screenBounds', { value: box, enumerable: true });
                    return box;
                }, configurable: true }
            });
            interactionStats.pickablesCreated++;
            picks.set(entry, result);
            return result;
        };
        let pickables;
        const frame = { scene, width, height, devicePixelRatio, scale, worldCenter: c, rotationRad: Number(viewState.rotationRad) || 0, rotationDeg: (Number(viewState.rotationRad) || 0) * 180 / Math.PI,
            worldBounds: scene.bounds, bounds: b, isEmpty, autoViewState: { mode: 'auto', center: autoCenter, scale: autoScale, rotationRad: Number(viewState.rotationRad) || 0 }, viewState: { mode: custom ? 'custom' : 'auto', center: c, scale, rotationRad: Number(viewState.rotationRad) || 0 },
            basis, projection, viewport, screenDirection, cos, sin, pick, interactionStats, entries, worldToScreen, screenToWorld, toProjected, screen, background, visualStyle: { name: visualStyle, category: visualStyle.includes('shad') ? 'shaded' : 'wireframe' }, polylines: [], fills: [], points: [], texts: [] };
        Object.defineProperty(frame, 'pickables', { enumerable: true, get: () => pickables ||= entries.map(pick).filter(p => !p.primitive.infinite || p.screenPoints.length) });
        frame.hitTest = (p, tolerance = 6) => hitTest(frame, p, tolerance);
        frame.snap = (p, tolerance = 12, modes) => snap(frame, p, tolerance, modes);
        return frame;
    }
    function unclipped(frame, primitive, point) {
        for (const clip of primitive.clips) {
            const inside = G.inLoops(point, frame.projection.clipLoops(clip));
            if (clip.inverse ? inside : !inside)
                return false;
        }
        return true;
    }
    function hitTest(frame, screenPoint, tolerance = 6) {
        const p = frame.toProjected(screenPoint), t = tolerance / frame.scale;
        let winner = null, best = Infinity;
        const candidates = frame.projection.index.search({ minX:p.x-t,minY:p.y-t,maxX:p.x+t,maxY:p.y+t }).sort((a,b)=>b.index-a.index);
        for (const entry of candidates) {
            if (!G.intersects(entry.bounds, frame.viewport)) continue;
            const pick = frame.pick(entry), item = entry.primitive;
            if (item.style.alpha <= 0 || !unclipped(frame, item, p))
                continue;
            if (!item.infinite && !G.inBounds(p, pick.entry.bounds, t))
                continue;
            let distance = Infinity;
            if (item.kind === 'point')
                distance = Math.hypot(p.x - pick.entry.points[0].x, p.y - pick.entry.points[0].y);
            else if (item.kind === 'text' || item.kind === 'image')
                distance = G.pointInPolygon(p, pick.entry.points) ? 0 : Infinity;
            else if (item.fill && G.inLoops(p, pick.entry.rings))
                distance = 0;
            if (distance !== 0) {
                const rings = item.infinite ? [pick.screenPoints.map(frame.toProjected)] : pick.entry.rings;
                for (const ring of rings)
                    for (let j = 1; j < ring.length; j++)
                        distance = Math.min(distance, G.segmentDistance(p, ring[j - 1], ring[j]).distance);
            }
            if (distance <= t && distance < best) {
                best = distance;
                winner = pick;
                if (distance === 0)
                    break;
            }
        }
        return winner;
    }
    function snap(frame, screenPoint, tolerance = 12, modes = new Set(['endpoint', 'midpoint', 'center', 'node', 'quadrant'])) {
        if (!(modes instanceof Set))
            modes = new Set(modes);
        let result = null, best = tolerance;
        const consider = (point, type, pick) => { if (!modes.has(type) || !unclipped(frame, pick.primitive, project(point, frame.basis)))
            return; const screen = frame.worldToScreen(point), d = Math.hypot(screen.x - screenPoint.x, screen.y - screenPoint.y); if (d < best) {
            best = d;
            result = { point, screenPoint: screen, type, kind: type, handle: pick.handle, pickable: pick, distance: d };
        } };
        const projectedPoint = frame.toProjected(screenPoint), distance = tolerance / frame.scale;
        const box = {minX:projectedPoint.x-distance,minY:projectedPoint.y-distance,maxX:projectedPoint.x+distance,maxY:projectedPoint.y+distance};
        const candidates = new Set(frame.projection.index.search(box));
        if (modes.has('center')) for (const center of frame.projection.centers.search(box)) candidates.add(center.entry);
        for (const entry of [...candidates].sort((a,b)=>a.index-b.index)) {
            if (!G.intersects(entry.bounds, frame.viewport)) continue;
            const pick = frame.pick(entry), p = entry.primitive;
            if (p.style.alpha <= 0) continue;
            // Arc centers can lie outside the arc's bounding box.
            if (p.center) consider(p.center, 'center', pick);
            if (!G.inBounds(screenPoint, pick.screenBounds, tolerance)) continue;
            if (p.kind === 'point') consider(p.points[0], 'node', pick);
            if (p.curve) {
                const { center, u, v, start, sweep } = p.curve;
                const at = t => add(center, add(mul(u, Math.cos(t)), mul(v, Math.sin(t))));
                if (!p.closed) {
                    consider(at(start), 'endpoint', pick); consider(at(start + sweep), 'endpoint', pick);
                    consider(at(start + sweep / 2), 'midpoint', pick);
                }
                for (let i = 0; i < 4; i++) {
                    const angle = i * Math.PI / 2, delta = ((angle - start) % G.TAU + G.TAU) % G.TAU;
                    if (delta <= sweep + 1e-10) consider(at(angle), 'quadrant', pick);
                }
            } else if (p.path) {
                let previous = null, first = null;
                for (const cmd of p.path) {
                    const op = cmd[0];
                    const end = op === 'Z' ? first : op === 'K' || op === 'Q' ? cmd[2] : op === 'C' ? cmd[3] : cmd[1];
                    if (!end) continue;
                    if (op === 'M') first = end;
                    consider(end, 'endpoint', pick);
                    if (previous && (op === 'L' || op === 'Z')) consider(G.lerp(previous, end, .5), 'midpoint', pick);
                    if (previous && (op === 'K' || op === 'Q')) {
                        const weight = op === 'K' ? cmd[3] : 1;
                        const middle = add(previous, mul(add(mul(sub(cmd[1], previous), 2 * weight), sub(end, previous)), 1 / (2 + 2 * weight)));
                        consider(middle, 'midpoint', pick);
                    }
                    previous = end;
                }
            }
            if (modes.has('nearest')) {
                const q = frame.toProjected(screenPoint);
                for (const ring of pick.entry.rings) for (let i = 1; i < ring.length; i++) {
                    const nearest = G.segmentDistance(q, ring[i - 1], ring[i]);
                    // Rings and primitive geometry have corresponding sample indices.
                    const world = add(add(mul(frame.basis.x, nearest.point.x), mul(frame.basis.y, nearest.point.y)), mul(frame.basis.z, nearest.point.z));
                    consider(world, 'nearest', pick);
                }
            }
        }
        return result;
    }
    function nativePath(S, commands, convert = p => p) {
        const path = new S.SKPath();
        const checked = point => {
            const p = convert(point);
            if (!p || !Number.isFinite(Math.fround(p.x)) || !Number.isFinite(Math.fround(p.y)))
                throw new RangeError('Native path coordinate exceeds finite float32 range.');
            return p;
        };
        try {
            for (const [op, a, b, c] of commands) {
                const p = a && checked(a), q = b && typeof b !== 'number' ? checked(b) : b;
                if (op === 'M')
                    path.MoveTo(p.x, p.y);
                else if (op === 'L')
                    path.LineTo(p.x, p.y);
                else if (op === 'K') {
                    if (!(c > 0) || !Number.isFinite(Math.fround(c))) throw new RangeError('Positive finite native conic weight required.');
                    path.ConicTo(p.x, p.y, q.x, q.y, c);
                }
                else if (op === 'C') {
                    const r = checked(c);
                    path.CubicTo(p.x, p.y, q.x, q.y, r.x, r.y);
                }
                else if (op === 'Q')
                    path.QuadTo(p.x, p.y, q.x, q.y);
                else if (op === 'Z')
                    path.Close();
            }
            path.FillType = S.SKPathFillType.EvenOdd;
            return path;
        }
        catch (error) {
            path.Dispose();
            throw error;
        }
    }
    class SkiaPainter {
        constructor(S, { resources, cacheLimit = 32768, cacheBytes = 32 * 1024 * 1024, textCacheLimit = 1024, textCacheBytes = 16 * 1024 * 1024 } = {}) {
            if (!S?.SKPath || !S?.SKPaint)
                throw new TypeError('An initialized SkiaSharpWeb namespace is required.');
            this.S = S;
            if (!Number.isSafeInteger(cacheLimit) || cacheLimit < 1) throw new RangeError('Positive integer path cache limit required.');
            this.resources = resources || new A.ResourceStore(S);
            this.ownsResources = !resources;
            for (const value of [cacheBytes, textCacheLimit, textCacheBytes])
                if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Positive integer native cache budgets required.');
            Object.assign(this, {cacheLimit, cacheBytes, textCacheLimit, textCacheBytes});
            this.cachedBytes = this.textBytes = 0;
            this.cache = new Map(); this.textCache = new Map();
            this.metrics = { pathBuilds: 0, pathHits: 0, textBuilds: 0, textHits: 0, clipBuilds: 0, clipHits: 0 };
            this.scene = null;
            this.disposed = false;
            this.diagnostics = new A.Diagnostics();
            this.paint = new S.SKPaint({ IsAntialias: true, StrokeCap: S.SKStrokeCap.Round, StrokeJoin: S.SKStrokeJoin.Round });
        }
        clearCache() {
            for (const v of this.cache.values()) v.path.Dispose();
            for (const v of this.textCache.values()) v.dispose();
            this.cache.clear(); this.textCache.clear(); this.cachedBytes = this.textBytes = 0;
        }
        cachedPath(primitive, projection) {
            const key = primitive.id + '|' + projection.key;
            let entry = this.cache.get(key);
            if (entry) {
                this.metrics.pathHits++;
                this.cache.delete(key);
                this.cache.set(key, entry);
                return entry;
            }
            const origin = project(primitive.points[0] || vec(), projection.basis), path = nativePath(this.S, primitive.path, p => sub(project(p, projection.basis), origin));
            const bytes = 128 + primitive.path.length * 64;
            entry = { path, origin, bytes, temporary: false };
            this.metrics.pathBuilds++;
            // Protect entries needed later in this pass. A drawing above the budget
            // retains its hot subset rather than cyclically evicting every path.
            while ((this.cache.size >= this.cacheLimit || this.cachedBytes + bytes > this.cacheBytes) && this.cache.size) {
                const oldestKey = this.cache.keys().next().value, oldest = this.cache.get(oldestKey);
                if (this.activePathKeys?.has(oldestKey)) break;
                oldest.path.Dispose(); this.cachedBytes -= oldest.bytes; this.cache.delete(oldestKey);
            }
            if (this.cache.size >= this.cacheLimit || this.cachedBytes + bytes > this.cacheBytes) entry.temporary = true;
            else { this.cache.set(key, entry); this.cachedBytes += bytes; }
            return entry;
        }
        draw(canvas, frame, { selection = new Set(), blockHighlights = new Set(), grid = false, background = frame.background, clear = true } = {}) {
            if (this.disposed)
                throw new Error('Painter disposed.');
            const S = this.S;
            if (this.scene !== frame.scene || this.resourceRevision !== this.resources.revision) {
                this.resourceRevision = this.resources.revision;
                this.clearCache();
                this.scene = frame.scene;
                this.diagnostics = new A.Diagnostics();
            }
            if (clear)
                canvas.Clear(S.SKColor.Parse(background));
            this.frameClips = new Map();
            this.activeTextIds = new Set(frame.entries.filter(e=>e.primitive.kind==='text').map(e=>e.primitive.id));
            this.activePathKeys = new Set(frame.entries.filter(e=>e.primitive.path).map(e=>e.primitive.id+'|'+frame.projection.key));
            const save = canvas.Save();
            let drawn = 0;
            try {
                canvas.Scale(frame.devicePixelRatio, frame.devicePixelRatio);
                if (grid)
                    this.drawGrid(canvas, frame);
                for (const pick of frame.entries) {
                    try {
                        if (pick.primitive.style.alpha <= 0) continue;
                        this.drawPrimitive(canvas, frame, pick, false); drawn++;
                    }
                    catch (error) {
                        if (/GPURenderPassEncoder|GPUDevice|WebGPU|Graphite|device lost|context lost/i.test(error.message)) throw error;
                        this.diagnostics.add('skia-primitive', error.message, pick.primitive.source, 'error');
                    }
                }
                for (const pick of frame.entries)
                    if (selection.has(pick.primitive.handle) || pick.primitive.blockPath.some(b => blockHighlights.has(A.key(b)))) {
                        try {
                            this.drawPrimitive(canvas, frame, pick, true);
                        }
                        catch (error) {
                            if (/GPURenderPassEncoder|GPUDevice|WebGPU|Graphite|device lost|context lost/i.test(error.message)) throw error;
                            this.diagnostics.add('skia-selection', error.message, pick.primitive.source);
                        }
                    }
            }
            finally {
                canvas.RestoreToCount(save);
                this.activePathKeys = null; this.activeTextIds = null;
                for (const path of this.frameClips.values()) path.Dispose();
                this.frameClips = null;
            }
            return { ...this.metrics, cachedBytes: this.cachedBytes, textBytes: this.textBytes, drawn, visible: frame.entries.length, omitted: frame.entries.length - drawn, cachedPaths: this.cache.size, diagnostics: [...frame.scene.diagnostics, ...this.diagnostics.items] };
        }
        configure(p, selected = false) { const S = this.S, paint = this.paint; paint.PathEffect = null; paint.ColorFilter = null; paint.Shader = null; paint.Color = S.SKColor.Parse(selected ? '#63c9ff' : p.style.color); paint.Alpha = Math.round(255 * (selected ? 1 : p.style.alpha)); paint.Style = p.fill && !selected ? S.SKPaintStyle.Fill : S.SKPaintStyle.Stroke; paint.StrokeWidth = 1; return paint; }
        drawPrimitive(canvas, frame, pick, selected) {
            const p = pick.primitive, S = this.S, paint = this.configure(p, selected), save = canvas.Save();
            let pathEntry;
            try {
                for (const clip of p.clips) {
                    let path = this.frameClips?.get(clip);
                    const transient = !this.frameClips;
                    if (path) this.metrics.clipHits++;
                    else {
                        path = nativePath(S, clip.path || ((clip.loops || [clip.points]).flatMap(r => G.pathFromPoints(r, true))), frame.worldToScreen);
                        this.metrics.clipBuilds++; this.frameClips?.set(clip,path);
                    }
                    try { canvas.ClipPath(path, clip.inverse ? S.SKClipOperation.Difference : S.SKClipOperation.Intersect, true); }
                    finally { if (transient) path.Dispose(); }
                }
                if (p.kind === 'text') {
                    this.drawText(canvas, frame, p, selected);
                    return;
                }
                if (p.kind === 'image') {
                    this.drawImage(canvas, frame, p, selected);
                    return;
                }
                if (p.kind === 'point') {
                    const q = frame.screen(pick.points[0]), size = Math.max(2, p.size > 0 ? p.size * frame.scale : p.size < 0 ? -p.size / 100 * frame.height : 5), mode = p.mode & 31;
                    paint.StrokeWidth = selected ? 2 : 1;
                    paint.Style = S.SKPaintStyle.Stroke;
                    if (mode === 0 || selected) {
                        paint.Style = S.SKPaintStyle.Fill;
                        canvas.DrawCircle(q.x, q.y, selected ? 2 : 1, paint);
                        paint.Style = S.SKPaintStyle.Stroke;
                    }
                    if (mode === 2) {
                        canvas.DrawLine(q.x - size / 2, q.y, q.x + size / 2, q.y, paint);
                        canvas.DrawLine(q.x, q.y - size / 2, q.x, q.y + size / 2, paint);
                    }
                    if (mode === 3) {
                        canvas.DrawLine(q.x - size / 2, q.y - size / 2, q.x + size / 2, q.y + size / 2, paint);
                        canvas.DrawLine(q.x - size / 2, q.y + size / 2, q.x + size / 2, q.y - size / 2, paint);
                    }
                    if (mode === 4)
                        canvas.DrawLine(q.x, q.y, q.x, q.y - size / 2, paint);
                    if (p.mode & 32)
                        canvas.DrawCircle(q.x, q.y, size / 2, paint);
                    if (p.mode & 64)
                        canvas.DrawRect(new S.SKRect(q.x - size / 2, q.y - size / 2, q.x + size / 2, q.y + size / 2), paint);
                    return;
                }
                if (p.infinite) {
                    const clipped = clipInfiniteLine(pick.points[0], pick.points[1], frame.viewport, p.infinite === 'ray');
                    if (!clipped) return;
                    const [a, b] = clipped.map(frame.screen);
                    paint.StrokeWidth = selected ? 2 : 1;
                    canvas.DrawLine(a.x, a.y, b.x, b.y, paint);
                    return;
                }
                const entry = pathEntry = this.cachedPath(p, frame.projection), origin = frame.screen(entry.origin);
                canvas.Concat([frame.scale * frame.cos, -frame.scale * frame.sin, origin.x, -frame.scale * frame.sin, -frame.scale * frame.cos, origin.y, 0, 0, 1]);
                const width = selected ? 2.5 : p.style.lineweightVisible ? Math.max(.7, p.style.lineweight / 100 * 96 / 25.4) : 1;
                paint.StrokeWidth = width / frame.scale;
                if (p.face && frame.visualStyle.category === 'wireframe')
                    paint.Style = S.SKPaintStyle.Stroke;
                if (!selected && !p.fill && p.style.dash?.length) {
                    const dash = nativeDash(p.style.dash, p.style.dashScale, .75 / frame.scale);
                    if (dash.empty)
                        return;
                    if (dash.intervals.length) {
                        const cycle=dash.intervals.reduce((a,b)=>a+b,0);
                        const effect = S.SKPathEffect.CreateDash(dash.intervals, ((dash.phase+(p.style.dashOffset||0))%cycle+cycle)%cycle);
                        try {
                            paint.PathEffect = effect;
                        }
                        finally {
                            effect?.Dispose();
                        }
                    }
                }
                if (p.gradient && !selected) {
                    const g=p.gradient, q=sub(project(g.origin,frame.basis),entry.origin), u=project(g.u,frame.basis), v=project(g.v,frame.basis);
                    const matrix=[u.x,v.x,q.x,u.y,v.y,q.y,0,0,1], colors=g.colors.map(c=>S.SKColor.Parse(c));
                    let shader;
                    const shift=g.shift, center=shift; // normalized CAD gradient-space translation
                    if(g.name.includes('SPHERICAL')) {
                        const cs=g.name.startsWith('INV')?colors.slice().reverse():colors;
                        shader=S.SKShader.CreateRadialGradient([center,0],1,cs,[0,1],S.SKShaderTileMode.Clamp,matrix);
                    } else {
                        const cylinder=g.name.includes('CYLINDER'), cs=cylinder?(g.name.startsWith('INV')?[colors[1],colors[0],colors[1]]:[colors[0],colors[1],colors[0]]):colors;
                        shader=S.SKShader.CreateLinearGradient([-1+center,0],[1+center,0],cs,cylinder?[0,.5,1]:[0,1],S.SKShaderTileMode.Clamp,matrix);
                    }
                    try { paint.Shader=shader; } finally { shader?.Dispose(); }
                }
                if (p.face && p.edgeFlags && paint.Style === S.SKPaintStyle.Stroke) {
                    for (let i = 0; i < p.points.length - 1; i++)
                        if (!(p.edgeFlags & (1 << i))) {
                            const a = sub(project(p.points[i], frame.basis), entry.origin), b = sub(project(p.points[i + 1], frame.basis), entry.origin);
                            canvas.DrawLine(a.x, a.y, b.x, b.y, paint);
                        }
                }
                else
                    canvas.DrawPath(entry.path, paint);
            }
            finally {
                if (pathEntry?.temporary) pathEntry.path.Dispose();
                paint.PathEffect = null;
                paint.ColorFilter = null;
                paint.Shader = null;
                canvas.RestoreToCount(save);
            }
        }
        drawText(canvas, frame, p, selected) {
            const S = this.S, paint = this.paint, origin = frame.worldToScreen(p.position), u = frame.screenDirection(p.u), v = frame.screenDirection(p.v);
            const resource = this.resources.get(p.font, 'font') || this.resources.get(p.fontName, 'font'), shape = this.resources.get(p.font, 'shape');
            const stroke = Math.max(.02, Math.min(.15, 1 / Math.max(1, Math.hypot(u.x, u.y))));
            const key = p.id + '|' + selected + '|' + (resource ? '' : stroke) + '|' + (p.backgroundMask ? frame.background : '');
            let cached = this.textCache.get(key), temporary = false;
            if (cached) {
                this.metrics.textHits++; this.textCache.delete(key); this.textCache.set(key, cached);
            } else {
                this.metrics.textBuilds++;
                if (!resource) this.diagnostics.add(shape ? 'shape-font' : 'missing-font', shape ? 'Text uses explicitly registered SHX outlines.' : `Font ${p.font || p.fontName || '(unspecified)'} is not registered; original schematic fallback strokes are shown.`, p.source);
                const session = resource ? this.resources.fontSession(resource) : null, font = session?.font;
                const layout = A.layoutText(p, text => this.resources.measureText(p, text)), units = font?.DxfUnit || 1;
                const runs = [], box = emptyBounds(); let recorder, unownedPicture;
                try {
                    // Record vector glyphs in text-local coordinates. There is no bitmap
                    // cache or resolution downgrade: Skia rasterizes at the current CTM.
                    for (const line of layout.lines) {
                        const x = line.x * units, y = line.y * units;
                        if (p.backgroundMask) union(box, {minX:x-.1*units,minY:y-1.1*units,maxX:x+(line.width+.1)*units,maxY:y+.2*units,minZ:0,maxZ:0});
                        if (font && line.text.length) {
                            const run = session.shaper.Shape(line.text, x, y, font);
                            runs.push({ run, line });
                            const glyphBounds = font.GetGlyphBounds(run.Glyphs);
                            for (let i=0;i<glyphBounds.length;i++) {
                                const b=glyphBounds[i], q=run.Points[i];
                                union(box, {minX:q.X+b.Left,minY:q.Y+b.Top,maxX:q.X+b.Right,maxY:q.Y+b.Bottom,minZ:0,maxZ:0});
                            }
                        } else if (!font) {
                            const paths = []; let offset = x;
                            for (const ch of line.text) {
                                let glyph = shape?.shape.glyph(ch.codePointAt(0));
                                const factor = glyph ? 1 / (shape.shape.above || 10) : 1;
                                glyph ||= A.draftingGlyph(ch);
                                const commands = G.transformPath(glyph.path, [factor,0,0,offset, 0,-factor,0,y, 0,0,1,0, 0,0,0,1]);
                                paths.push(commands); union(box, G.pathBounds(commands)); offset += glyph.advance * factor;
                            }
                            runs.push({paths, line});
                        } else runs.push({line});
                    }
                    if (G.isEmpty(box)) Object.assign(box,{minX:0,minY:0,maxX:1,maxY:1,minZ:0,maxZ:0});
                    const padding = Math.max(units*.1,stroke*2);
                    recorder = new S.SKPictureRecorder();
                    const recording = recorder.BeginRecording(new S.SKRect(box.minX-padding,box.minY-padding,box.maxX+padding,box.maxY+padding));
                    for (const item of runs) {
                        const {line} = item, x=line.x*units,y=line.y*units;
                        if (p.backgroundMask && !selected) {
                            paint.Style=S.SKPaintStyle.Fill;paint.Color=S.SKColor.Parse(frame.background);
                            recording.DrawRect(new S.SKRect(x-.1*units,y-1.1*units,x+(line.width+.1)*units,y+.2*units),paint);
                            paint.Color=S.SKColor.Parse(p.style.color);
                        }
                        if (font) {
                            paint.Style=selected?S.SKPaintStyle.Stroke:S.SKPaintStyle.Fill;paint.StrokeWidth=.025*units;
                            if (item.run) recording.DrawGlyphs(item.run.Glyphs,item.run.Points,new S.SKPoint(0,0),font,paint);
                        } else {
                            paint.Style=S.SKPaintStyle.Stroke;paint.StrokeWidth=stroke;
                            for (const commands of item.paths || []) {
                                const path=nativePath(S,commands);
                                try { recording.DrawPath(path,paint); } finally { path.Dispose(); }
                            }
                        }
                    }
                    const picture = unownedPicture = recorder.EndRecording();
                    const bytes = picture.ApproximateBytesUsed + p.text.length * 32;
                    cached = {picture, units, bytes, primitiveId: p.id, dispose() { picture.Dispose(); }};
                    while (this.textCache.size && (this.textCache.size >= this.textCacheLimit || this.textBytes+bytes > this.textCacheBytes)) {
                        const first=this.textCache.keys().next().value, old=this.textCache.get(first);
                        if (this.activeTextIds?.has(old.primitiveId)) break;
                        this.textCache.delete(first);this.textBytes-=old.bytes;old.dispose();
                    }
                    if (this.textCache.size < this.textCacheLimit && this.textBytes + bytes <= this.textCacheBytes) {this.textCache.set(key,cached);this.textBytes+=bytes;}
                    else temporary=true;
                    unownedPicture = null;
                } finally { unownedPicture?.Dispose(); for (const item of runs) item.run?.Dispose(); recorder?.Dispose(); }
            }
            const save = canvas.Save();
            try {
                canvas.Concat([u.x/cached.units,-v.x/cached.units,origin.x,u.y/cached.units,-v.y/cached.units,origin.y,0,0,1]);
                canvas.DrawPicture(cached.picture);
            } finally { canvas.RestoreToCount(save); if(temporary)cached.dispose(); }
        }
        drawImage(canvas, frame, p, selected) {
            const S = this.S, paint = this.paint, resource = this.resources.get(p.resource, 'image'), origin = frame.worldToScreen(p.position), u = frame.screenDirection(p.u), v = frame.screenDirection(p.v), w = p.imageSize.x, h = p.imageSize.y;
            if (!resource || selected) {
                paint.Style = S.SKPaintStyle.Stroke;
                paint.StrokeWidth = selected ? 2 : 1;
                const path = nativePath(S, G.pathFromPoints(p.points, true), frame.worldToScreen);
                try {
                    canvas.DrawPath(path, paint);
                }
                finally {
                    path.Dispose();
                }
                if (!resource)
                    this.diagnostics.add('missing-image', `Register local image bytes for ${p.resource}. No external path was fetched.`, p.source);
                return;
            }
            const save = canvas.Save();
            try {
                canvas.Concat([u.x, -v.x, origin.x + v.x * h, u.y, -v.y, origin.y + v.y * h, 0, 0, 1]);
                if (p.imageClip?.length && p.source.num(280, 1)) {
                    const path = nativePath(S, G.pathFromPoints(p.imageClip, true), q => vec(q.x + .5, q.y + .5));
                    try {
                        canvas.ClipPath(path, S.SKClipOperation.Intersect, true);
                    }
                    finally {
                        path.Dispose();
                    }
                }
                const brightness = (p.brightness - 50) / 50, contrast = p.contrast / 50, fade = p.fade / 100, off = (.5 * (1 - contrast) + brightness) * (1 - fade);
                const bg = S.SKColor.Parse(frame.background), matrix = [contrast * (1 - fade), 0, 0, 0, off + bg.Red / 255 * fade, 0, contrast * (1 - fade), 0, 0, off + bg.Green / 255 * fade, 0, 0, contrast * (1 - fade), 0, off + bg.Blue / 255 * fade, 0, 0, 0, 1, 0];
                const filter = S.SKColorFilter.CreateColorMatrix(matrix);
                try {
                    paint.ColorFilter = filter;
                }
                finally {
                    filter.Dispose();
                }
                canvas.DrawImage(resource.native, new S.SKRect(0, 0, w, h), paint);
            }
            finally {
                paint.ColorFilter = null;
                canvas.RestoreToCount(save);
            }
        }
        drawGrid(canvas, frame) {
            const S = this.S, paint = this.paint, raw = 50 / frame.scale, base = 10 ** Math.floor(Math.log10(raw)), spacing = raw / base > 5 ? 10 * base : raw / base > 2 ? 5 * base : 2 * base;
            paint.Shader = null; paint.PathEffect = null; paint.ColorFilter = null;
            paint.Color = S.SKColor.Parse('#394550'); paint.Alpha = 255;
            paint.Alpha = 170;
            paint.Style = S.SKPaintStyle.Stroke;
            paint.StrokeWidth = 1;
            let count = 0;
            for (let x = Math.ceil(frame.viewport.minX / spacing) * spacing; x <= frame.viewport.maxX && count++ < 1000; x += spacing) {
                const a = frame.screen(vec(x, frame.viewport.minY)), b = frame.screen(vec(x, frame.viewport.maxY));
                canvas.DrawLine(a.x, a.y, b.x, b.y, paint);
            }
            count = 0;
            for (let y = Math.ceil(frame.viewport.minY / spacing) * spacing; y <= frame.viewport.maxY && count++ < 1000; y += spacing) {
                const a = frame.screen(vec(frame.viewport.minX, y)), b = frame.screen(vec(frame.viewport.maxX, y));
                canvas.DrawLine(a.x, a.y, b.x, b.y, paint);
            }
        }
        dispose() { if (this.disposed)
            return; this.disposed = true; this.clearCache(); this.paint.Dispose(); if (this.ownsResources)
            this.resources.dispose(); }
    }
    Object.assign(A, { projectedScene, prepareFrame, hitTest, snap, nativePath, nativeDash, clipInfiniteLine, SkiaPainter });
    if (typeof module === 'object' && module.exports)
        module.exports = A;
})(globalThis);
