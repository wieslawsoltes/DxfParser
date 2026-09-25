/* Camera-independent revision change sets and exact orthogonal cloud contours.
 * No native/DOM allocation. Every work/output budget fails closed. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else root.DxfCompareCloudEngine = factory;
})(globalThis, function createCloudEngine(A) {
    'use strict';
    const G = A.geometry;
    function budget(options) {
        let remaining = options.maxCloudWork ?? 50000000;
        if (!Number.isSafeInteger(remaining) || remaining < 1) throw new RangeError('Invalid cloud work budget.');
        return (n = 1) => { if ((remaining -= n) < 0) throw new RangeError('Comparison cloud work budget exceeded.'); };
    }
    function expanded(bounds, margin) {
        const b = { ...bounds, minX: bounds.minX - margin, minY: bounds.minY - margin,
            maxX: bounds.maxX + margin, maxY: bounds.maxY + margin };
        if (![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) throw new RangeError('Nonfinite comparison cloud bounds.');
        return b;
    }
    function groupChanges(changes, options) {
        const tick = budget(options), margin = options.margin ?? 1, mode = options.cloudMode ?? 'grouped';
        if (!Number.isFinite(margin) || margin < 0 || margin > 1e12) throw new RangeError('Invalid cloud margin.');
        if (!['local', 'combined', 'grouped'].includes(mode)) throw new RangeError('Invalid cloud grouping.');
        const items = changes.map((change, index) => ({ change, index, bounds: G.isEmpty(change.bounds) ? null : expanded(change.bounds, margin) }));
        const groups = [], add = members => {
            members.sort((a, b) => a.index - b.index);
            const bounds = G.emptyBounds(), cloudBounds = G.emptyBounds(), rectangles = [];
            for (const item of members) { tick(); G.union(bounds, item.change.bounds); if (item.bounds) { G.union(cloudBounds, item.bounds); rectangles.push(item.bounds); } }
            groups.push({ id: 'changeset:' + members[0].change.id, firstIndex: members[0].index,
                changeIds: members.map(i => i.change.id), bounds, cloudBounds, rectangles });
        };
        if (mode === 'combined') { if (items.length) add(items); return groups; }
        if (mode === 'local') { for (const item of items) add([item]); return groups; }
        // Consume each discovered box once. Empty BVH subtrees are pruned, including
        // the dense all-overlapping case, rather than returning N candidates N times.
        const index = new A.SpatialIndex(items.filter(i => i.bounds));
        const annotate = node => {
            if (!node) return 0;
            node.remaining = node.lo !== undefined ? node.hi - node.lo : annotate(node.left) + annotate(node.right);
            return node.remaining;
        };
        annotate(index.root);
        const consume = (node, box, found) => {
            tick(); if (!node?.remaining || !G.intersects(node.bounds, box)) return;
            if (node.lo !== undefined) {
                for (let i = node.lo; i < node.hi; i++) {
                    tick(); const item = index.items[i];
                    if (!item.consumed && G.intersects(item.bounds, box)) { item.consumed = true; node.remaining--; found.push(item); }
                }
            } else { consume(node.left, box, found); consume(node.right, box, found); node.remaining = node.left.remaining + node.right.remaining; }
        };
        for (const item of items) {
            if (item.consumed) continue;
            if (!item.bounds) { add([item]); continue; }
            const members = []; consume(index.root, item.bounds, members);
            for (let next = 0; next < members.length; next++) consume(index.root, members[next].bounds, members);
            add(members);
        }
        return groups;
    }
    function rectangle(box) {
        let { minX: x, minY: y, maxX: right, maxY: top } = box;
        const z = Number.isFinite(box.minZ) ? box.minZ : 0;
        // Degenerate line/point changes still have a visible enclosing cloud. At
        // large origins use a representable minimum span rather than adding 0.01.
        if (!(right > x)) right = x + Math.max(.01, Math.abs(x) * Number.EPSILON * 4);
        if (!(top > y)) top = y + Math.max(.01, Math.abs(y) * Number.EPSILON * 4);
        if (![x, y, right, top].every(Number.isFinite)) throw new RangeError('Cloud coordinate overflow.');
        return [G.vec(x, y, z), G.vec(right, y, z), G.vec(right, top, z), G.vec(x, top, z)];
    }
    function rectangleUnion(boxes, options = {}) {
        const tick = budget(options), maxSegments = options.maxCloudSegments ?? 500000;
        if (!Number.isSafeInteger(maxSegments) || maxSegments < 1) throw new RangeError('Invalid cloud segment budget.');
        if (!boxes.length) return [];
        const normalized = boxes.map(b => { tick(); const r = rectangle(b); return { x1:r[0].x, y1:r[0].y, x2:r[2].x, y2:r[2].y }; });
        const ys = [...new Set(normalized.flatMap(b => [b.y1, b.y2]))].sort((a,b) => a-b), lookup = new Map(ys.map((y,i) => [y,i]));
        const count = ys.length - 1, cover = new Int32Array(4 * count + 4), active = new Uint8Array(cover.length), events = [];
        for (const b of normalized) { events.push({ x:b.x1, lo:lookup.get(b.y1), hi:lookup.get(b.y2), delta:1 }, { x:b.x2, lo:lookup.get(b.y1), hi:lookup.get(b.y2), delta:-1 }); }
        events.sort((a,b) => a.x-b.x);
        const update = (node, lo, hi, event) => {
            tick(); if (event.hi <= lo || event.lo >= hi) return;
            if (event.lo <= lo && hi <= event.hi) cover[node] += event.delta;
            else { const mid = (lo + hi) >>> 1; update(node*2,lo,mid,event); update(node*2+1,mid,hi,event); }
            active[node] = cover[node] > 0 || (hi-lo > 1 && (active[node*2] || active[node*2+1])) ? 1 : 0;
        };
        const intervals = () => {
            const out = [], collect = (node,lo,hi) => {
                tick(); if (!active[node]) return;
                if (cover[node] > 0) { const last=out.at(-1); if (last && last[1] === ys[lo]) last[1]=ys[hi]; else out.push([ys[lo],ys[hi]]); }
                else { const mid=(lo+hi)>>>1; collect(node*2,lo,mid); collect(node*2+1,mid,hi); }
            };
            collect(1,0,count); return out;
        };
        const difference = (left,right,emit) => {
            let j=0;
            for (const [start,end] of left) {
                let cursor=start; while(j<right.length && right[j][1]<=cursor) {tick();j++;}
                for(let k=j;k<right.length && right[k][0]<end;k++) {tick();const b=right[k];if(b[0]>cursor)emit(cursor,Math.min(b[0],end));cursor=Math.max(cursor,b[1]);if(cursor>=end)break;}
                if(cursor<end)emit(cursor,end);
            }
        };
        const edges=[], z=Number.isFinite(boxes[0].minZ)?boxes[0].minZ:0;
        const emit=(x1,y1,x2,y2) => {
            tick(); if (x1===x2 && y1===y2) return;
            if(edges.length>=maxSegments)throw new RangeError('Comparison cloud segment budget exceeded.');
            edges.push({a:G.vec(x1,y1,z),b:G.vec(x2,y2,z),dir:x2>x1?0:y2>y1?1:x2<x1?2:3,used:false});
        };
        let before=[];
        for(let i=0;i<events.length;) {
            const x=events[i].x;
            do { update(1,0,count,events[i++]); } while(i<events.length && events[i].x===x);
            const after=intervals();
            difference(after,before,(lo,hi)=>emit(x,hi,x,lo));
            difference(before,after,(lo,hi)=>emit(x,lo,x,hi));
            if(i<events.length) for(const [lo,hi] of after) {emit(x,lo,events[i].x,lo);emit(events[i].x,hi,x,hi);}
            before=after;
        }
        const pointKey=p=>p.x+','+p.y, starts=new Map();
        for(const edge of edges) { const k=pointKey(edge.a);if(!starts.has(k))starts.set(k,[]);starts.get(k).push(edge); }
        const rings=[], turnRank=[1,0,3,2];
        for(const first of edges) {
            if(first.used)continue;
            const points=[];let edge=first;
            do {
                tick();edge.used=true;points.push(edge.a);
                if(pointKey(edge.b)===pointKey(first.a))break;
                const candidates=(starts.get(pointKey(edge.b))||[]).filter(e=>!e.used);
                // Keep the filled region on the left. At corner contacts this
                // returns separate closed contours, never a figure-eight path.
                candidates.sort((a,b)=>turnRank[(a.dir-edge.dir+4)%4]-turnRank[(b.dir-edge.dir+4)%4]);
                edge=candidates[0];if(!edge)throw new Error('Unclosed comparison cloud contour.');
            } while(true);
            const corners=points.filter((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return !(a.x===p.x&&p.x===b.x || a.y===p.y&&p.y===b.y);});
            if(corners.length<4)throw new Error('Degenerate comparison cloud contour.');
            rings.push(corners);
        }
        return rings;
    }
    return { groupChanges, rectangleUnion, rectangle };
});
