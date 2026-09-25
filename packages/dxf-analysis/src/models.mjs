export const label = v => v === true ? 'Yes' : v === false ? 'No' : v == null || v === '' ? '(empty)' : String(v);
export const numeric = v => typeof v === 'number' && Number.isFinite(v);
const keyOf = v => typeof v + ':' + String(v ?? '');
export function aggregate(rows, group, measure = -1) {
    const buckets = new Map();
    let excluded = 0;
    for (const row of rows) {
        const raw = row.values[group], key = keyOf(raw), amount = measure < 0 ? 1 : row.values[measure];
        if (!numeric(amount) || amount < 0) {
            excluded++;
            continue;
        }
        if (!buckets.has(key))
            buckets.set(key, { key, label: label(raw), value: 0, keys: [], count: 0 });
        const b = buckets.get(key);
        if (!Number.isFinite(b.value + amount))
            throw new RangeError('Aggregate exceeds the finite numeric range; inspect individual values.');
        b.value += amount;
        b.count++;
        b.keys.push(row.key);
    }
    return { buckets: [...buckets.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)), excluded };
}
export function top(buckets, limit = 8) {
    limit = Math.max(1, Math.floor(limit));
    if (buckets.length <= limit)
        return buckets;
    const rest = buckets.slice(limit - 1);
    const value = rest.reduce((n, b) => n + b.value, 0);
    if (!Number.isFinite(value))
        throw new RangeError('Other aggregate exceeds the finite numeric range; inspect individual groups.');
    return [...buckets.slice(0, limit - 1), { key: '__other__', label: `Other (${rest.length} groups)`,
            value, count: rest.reduce((n, b) => n + b.count, 0),
            keys: rest.flatMap(b => b.keys), other: true }];
}
export function histogram(rows, column, count = 10) {
    const finite = rows.filter(r => numeric(r.values[column]));
    if (!finite.length)
        return { buckets: [], excluded: rows.length };
    let min = Infinity, max = -Infinity;
    for (const r of finite) {
        min = Math.min(min, r.values[column]);
        max = Math.max(max, r.values[column]);
    }
    count = min === max ? 1 : Math.max(1, Math.min(32, Math.floor(count)));
    // Normalization avoids overflow in max-min for finite extreme values.
    const norm = Math.max(1, Math.abs(min), Math.abs(max)), a = min / norm, delta = max / norm - a;
    const fmt = n => Number(n.toPrecision(6)).toLocaleString();
    const buckets = Array.from({ length: count }, (_, i) => {
        const lo = (a + delta * i / count) * norm, hi = i === count - 1 ? max : (a + delta * (i + 1) / count) * norm;
        return { key: 'bin:' + i, label: count === 1 ? fmt(min) : `${fmt(lo)} – ${fmt(hi)}${i === count - 1 ? ' (inclusive)' : ''}`, lo, hi, keys: [], value: 0, count: 0 };
    });
    for (const r of finite) {
        const i = count === 1 ? 0 : Math.max(0, Math.min(count - 1, Math.floor((r.values[column] / norm - a) / delta * count)));
        buckets[i].keys.push(r.key);
        buckets[i].value++;
        buckets[i].count++;
    }
    return { buckets, excluded: rows.length - finite.length };
}
export function matrix(rows, x, y, maxX = 8, maxY = 8) {
    const xs = top(aggregate(rows, x).buckets, maxX), ys = top(aggregate(rows, y).buckets, maxY);
    const xi = new Map(), yi = new Map();
    xs.forEach((b, i) => b.keys.forEach(k => xi.set(k, i)));
    ys.forEach((b, i) => b.keys.forEach(k => yi.set(k, i)));
    const cells = ys.map(() => xs.map(() => ({ keys: [], value: 0 })));
    for (const r of rows) {
        const cell = cells[yi.get(r.key)]?.[xi.get(r.key)];
        if (cell) {
            cell.keys.push(r.key);
            cell.value++;
        }
    }
    return { xs, ys, cells };
}
export function byteStats(rows, column) {
    const counts = new Uint32Array(256), keys = Array.from({ length: 16 }, () => new Set());
    let total = 0, invalid = 0;
    for (const row of rows) {
        const hex = String(row.values[column] ?? '').replace(/\s/g, '');
        if (hex.length % 2 || !/^[\da-f]*$/i.test(hex)) {
            invalid++;
            continue;
        }
        const seen = new Set();
        for (let i = 0; i < hex.length; i += 2) {
            const v = parseInt(hex.slice(i, i + 2), 16);
            counts[v]++;
            total++;
            seen.add(v >> 4);
        }
        seen.forEach(i => keys[i].add(row.key));
    }
    let entropy = 0, printable = 0;
    for (let i = 0; i < 256; i++) {
        if (counts[i]) {
            const p = counts[i] / total;
            entropy -= p * Math.log2(p);
        }
        if (i >= 32 && i < 127)
            printable += counts[i];
    }
    return { total, entropy, printable, invalid, counts, buckets: keys.map((k, i) => ({ key: 'byte:' + i, label: `${i.toString(16).toUpperCase()}0–${i.toString(16).toUpperCase()}F`, keys: [...k], value: counts.slice(i * 16, i * 16 + 16).reduce((a, b) => a + b, 0), count: k.size })) };
}
export function compareRows(columns, baseline, selected) {
    return columns.map((c, i) => ({ key: 'compare:' + i, values: [c.title, baseline.values[i], selected.values[i],
            Object.is(baseline.values[i], selected.values[i]) ? 'Same' : 'Changed'] }));
}
