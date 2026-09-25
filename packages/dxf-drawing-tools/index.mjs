export function createDrawingViewTools(S, D) {
    'use strict';
    if (!S?.geometry || typeof S.projectedScene !== 'function')
        throw new TypeError('A DxfSkia-compatible geometry and projectedScene API is required.');
    if (typeof D?.LayoutDocument !== 'function')
        throw new TypeError('A Dockyard-compatible API is required.');
    const G = S.geometry, modes = new Set(['off', 'world', 'relative']);
    const layoutKey = value => String(value || 'Model').trim().toUpperCase();
    const finite = (value, name) => {
        if (!Number.isFinite(value)) throw new RangeError('Nonfinite camera ' + name + '.');
        return value;
    };
    const point = (p, name) => ({ x: finite(p?.x, name), y: finite(p?.y, name), z: finite(p?.z ?? 0, name) });
    const near = (a, b) => Math.abs(a - b) <= 16 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);
    const nearPoint = (a, b) => ['x', 'y', 'z'].every(axis => near(a[axis] || 0, b[axis] || 0));
    function extents(frame, direction) {
        const b = S.projectedScene(frame.scene, G.viewBasis(direction, 0)).bounds;
        if (G.isEmpty(b)) return { center: G.vec(), span: G.vec(100, 100, 1) };
        return { center: G.center(b), span: G.vec(Math.max(1e-6, b.maxX - b.minX), Math.max(1e-6, b.maxY - b.minY), Math.max(1e-6, b.maxZ - b.minZ)) };
    }
    function fitScale(frame, e, rotation) {
        const cos = Math.abs(Math.cos(rotation)), sin = Math.abs(Math.sin(rotation));
        return Math.max(1e-12, Math.min(Math.max(1, frame.width - 64) / (cos * e.span.x + sin * e.span.y), Math.max(1, frame.height - 64) / (sin * e.span.x + cos * e.span.y)));
    }
    function captureCamera(frame, layout = frame?.scene?.layout) {
        if (!frame?.scene || !(frame.scale > 0)) throw new TypeError('A rendered drawing camera is required.');
        const direction = point(frame.basis.z, 'direction'), center = point(frame.worldCenter, 'center');
        const rotationRad = finite(frame.rotationRad, 'rotation'), scale = finite(frame.scale, 'scale');
        const e = extents(frame, direction), offset = G.vec((center.x - e.center.x) / e.span.x, (center.y - e.center.y) / e.span.y, (center.z - e.center.z) / e.span.z);
        return { layout: layoutKey(layout), direction, center, scale, rotationRad, offset: point(offset, 'relative offset'), zoom: finite(scale / fitScale(frame, e, rotationRad), 'relative zoom') };
    }
    function transferCamera(snapshot, targetFrame, mode = 'world', layout = targetFrame?.scene?.layout) {
        if (!['world', 'relative'].includes(mode)) throw new TypeError('Use world or relative camera transfer.');
        if (!targetFrame?.scene || layoutKey(layout) !== snapshot.layout) return null;
        const direction = point(snapshot.direction, 'direction'), rotationRad = finite(snapshot.rotationRad, 'rotation');
        let center = point(snapshot.center, 'center'), scale = finite(snapshot.scale, 'scale');
        if (mode === 'relative') {
            const e = extents(targetFrame, direction), offset = point(snapshot.offset, 'relative offset');
            center = point(G.vec(e.center.x + offset.x * e.span.x, e.center.y + offset.y * e.span.y, e.center.z + offset.z * e.span.z), 'center');
            scale = finite(snapshot.zoom * fitScale(targetFrame, e, rotationRad), 'scale');
        }
        if (!(scale > 0) || G.length(direction) < 1e-12) throw new RangeError('Invalid camera scale or direction.');
        return { direction, viewState: { mode: 'custom', center, scale: G.clamp(scale, 1e-12, 1e12), rotationRad } };
    }
    function sameCamera(frame, camera) {
        return !!frame && nearPoint(frame.basis.z, camera.direction) && nearPoint(frame.worldCenter, camera.viewState.center) && near(frame.scale, camera.viewState.scale) && near(frame.rotationRad, camera.viewState.rotationRad);
    }
    const stamp = (snapshot, mode) => JSON.stringify(mode === 'relative'
        ? [snapshot.layout, snapshot.direction, snapshot.offset, snapshot.zoom, snapshot.rotationRad]
        : [snapshot.layout, snapshot.direction, snapshot.center, snapshot.scale, snapshot.rotationRad]);

    /** Last-writer-wins camera synchronization. The host owns records and frame scheduling. */
    class NavigationLink {
        constructor(host) { this.host = host; this.mode = 'off'; this.snapshot = null; this.pending = null; this.depth = 0; this.disposed = false; }
        usable(record) { return record && !record.disposed && record.open && this.host.visible(record) && !!this.host.frame(record); }
        setMode(mode) {
            if (!modes.has(mode)) throw new TypeError('Navigation must be off, world or relative.');
            if (this.disposed) throw new Error('Navigation link is disposed.');
            const source = this.host.active();
            // Capture before changing any state: malformed inputs cannot partially enable a link.
            const snapshot = mode === 'off' ? null : this.usable(source) ? captureCamera(this.host.frame(source), this.host.layout(source)) : null;
            if (mode !== 'off' && !snapshot) throw new Error('Open and focus a rendered drawing first.');
            this.cancel(); this.mode = mode; this.snapshot = snapshot;
            this.key = snapshot ? stamp(snapshot, mode) : null;
            if (snapshot) this.queue();
            this.host.changed?.();
        }
        queue() {
            if (this.pending !== null || this.disposed || this.mode === 'off') return;
            this.pending = this.host.schedule(() => {
                this.pending = null;
                try { this.flush(); } catch (error) { this.host.error?.(error); }
            });
        }
        cancel() { if (this.pending !== null) this.host.cancel(this.pending); this.pending = null; }
        onFrame(record, frame) {
            if (this.disposed || this.depth || this.mode === 'off' || !this.usable(record)) return;
            if (record === this.host.active()) {
                const snapshot = captureCamera(frame, this.host.layout(record)), key = stamp(snapshot, this.mode);
                if (key === this.key) return;
                this.snapshot = snapshot; this.key = key; this.queue();
            } else if (this.snapshot) {
                const camera = transferCamera(this.snapshot, frame, this.mode, this.host.layout(record));
                if (camera && !sameCamera(frame, camera)) this.queue();
            }
        }
        apply(record, snapshot = this.snapshot, mode = this.mode, history = false) {
            if (!snapshot || !this.usable(record)) return;
            const frame = this.host.frame(record), camera = transferCamera(snapshot, frame, mode, this.host.layout(record));
            if (!camera || sameCamera(frame, camera)) return;
            this.depth++;
            try { this.host.apply(record, camera, history); }
            finally { this.depth--; }
        }
        focus(record) {
            if (this.disposed || this.depth || this.mode === 'off' || !this.usable(record)) return;
            // Apply the latest queued camera before the new viewport receives a gesture.
            this.apply(record);
            this.onFrame(record, this.host.frame(record));
        }
        flush() {
            if (this.disposed || this.mode === 'off' || !this.snapshot) return;
            const source = this.host.active();
            for (const record of this.host.records()) if (record !== source) {
                try { this.apply(record); } catch (error) { this.host.error?.(error); }
            }
        }
        match() {
            if (this.disposed) throw new Error('Navigation link is disposed.');
            const source = this.host.active();
            if (!this.usable(source)) throw new Error('Open and focus a rendered drawing first.');
            const snapshot = captureCamera(this.host.frame(source), this.host.layout(source));
            for (const record of this.host.records()) if (record !== source) this.apply(record, snapshot, 'world', true);
        }
        reset() { if (!this.disposed) { this.cancel(); this.snapshot = null; this.key = null; } }
        dispose() { if (!this.disposed) { this.cancel(); this.disposed = true; this.snapshot = null; this.host = null; } }
    }

    function gridShape(count, width = 1, height = 1) {
        if (!Number.isInteger(count) || count < 1 || count > 32) throw new RangeError('A drawing grid supports 1–32 views.');
        if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) throw new RangeError('Finite positive grid dimensions required.');
        let best;
        for (let columns = 1; columns <= count; columns++) {
            const rows = Math.ceil(count / columns), cost = Math.abs(Math.log((width / columns) / (height / rows) / (4 / 3))) + 1.5 * (rows * columns - count) / count;
            if (!best || cost < best.cost) best = { columns, rows, cost };
        }
        return { columns: best.columns, rows: best.rows };
    }
    function tileDrawings(manager, models, mode = 'horizontal', width = 1, height = 1) {
        if (!['horizontal', 'vertical', 'grid'].includes(mode)) throw new TypeError('Use horizontal, vertical or grid tiling.');
        if (models.length > 32 || new Set(models).size !== models.length) throw new RangeError('Expected at most 32 unique drawing views.');
        for (const model of models) if (!(model instanceof D.LayoutDocument) || model.Root !== manager.Layout || !model.CanMove || !model.CanDock || !model.IsEnabled)
            throw new Error('All tiled drawings must be movable, enabled documents in this workspace.');
        if (models.length < 2) return;
        const shape = mode === 'grid' ? gridShape(models.length, width, height) : { columns: mode === 'horizontal' ? models.length : 1, rows: mode === 'horizontal' ? 1 : models.length };
        const activeId = manager.ActiveModel?.ContentId;
        manager.Transaction('Tile drawing views ' + mode, () => {
            let anchor = models.find(m => !m.IsFloating)?.Parent;
            anchor ||= [...manager.Layout.RootPanel.Descendents()].find(n => n instanceof D.LayoutDocumentPane);
            if (!anchor) throw new Error('The workspace has no docked document pane.');
            // Consolidate through public Dock so floating return paths and move events stay correct.
            for (const model of models) if (model.Parent !== anchor && !manager.Dock(model, anchor, 'Center')) throw new Error('Dockyard could not move a drawing.');
            // Collapse obsolete single-child wrappers instead of accumulating nesting on every retile.
            while (anchor.Parent instanceof D.LayoutDocumentPaneGroup && anchor.Parent.ChildrenCount === 1) {
                const group = anchor.Parent, parent = group.Parent;
                const w = group.DockWidth, h = group.DockHeight;
                group.Children.Remove(anchor); parent.ReplaceChild(group, anchor); anchor.DockWidth = w; anchor.DockHeight = h;
            }
            const outer = new D.LayoutDocumentPaneGroup({ Orientation: shape.rows === 1 ? 'Horizontal' : 'Vertical', DockWidth: anchor.DockWidth, DockHeight: anchor.DockHeight });
            anchor.Parent.ReplaceChild(anchor, outer); anchor.DockWidth = '1*'; anchor.DockHeight = '1*';
            // Allocate all row containers first. Every row and every pane uses equal star sizing.
            const rows = Array.from({ length: shape.rows }, () => shape.rows === 1 || shape.columns === 1 ? outer : new D.LayoutDocumentPaneGroup({ Orientation: 'Horizontal', DockWidth: '1*', DockHeight: '1*' }));
            if (shape.rows > 1 && shape.columns > 1) outer.Children.AddRange(rows);
            rows[0].Children.Add(anchor);
            models.forEach((model, i) => {
                const pane = i === 0 ? anchor : new D.LayoutDocumentPane({ DockWidth: '1*', DockHeight: '1*' });
                if (i !== 0) rows[Math.floor(i / shape.columns)].Children.Add(pane);
                if (model.Parent !== pane) pane.Children.Add(model);
                model.IsSelected = true;
            });
            const active = activeId && manager.Find(activeId);
            if (active) manager.Activate(active);
        });
        return shape;
    }
    return Object.freeze({ captureCamera, transferCamera, sameCamera, NavigationLink, gridShape, tileDrawings });
}
