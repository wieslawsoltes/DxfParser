/* TreeDataGrid Web 0.1.0 | Source-informed port.
The MIT License (MIT)

Copyright (c) .NET Foundation and Contributors
All Rights Reserved

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Upstream: wieslawsoltes/TreeDataGrid@3ca47316d724e5e040ab0281a880e8df999b25fc
See THIRD_PARTY_NOTICES.md for provenance. */
(()=>{
'use strict';
const modules={
"packages/core/index.js":function(exports,require){
Object.assign(exports,require("packages/core/src/events.js"));
Object.assign(exports,require("packages/core/src/primitives.js"));
Object.assign(exports,require("packages/core/src/collections.js"));
Object.assign(exports,require("packages/core/src/columns.js"));
Object.assign(exports,require("packages/core/src/geometry.js"));
Object.assign(exports,require("packages/core/src/rows.js"));
Object.assign(exports,require("packages/core/src/selection.js"));
Object.assign(exports,require("packages/core/src/sources.js"));


Object.assign(exports,{});
},
"packages/core/src/events.js":function(exports,require){
/** Synchronous, deterministic .NET-style events. Subscribe returns a callable IDisposable. */
class Signal {
    constructor() { this._listeners = new Set(); }
    Subscribe(handler) {
        if (typeof handler !== 'function')
            throw new TypeError('Event handler must be a function.');
        this._listeners.add(handler);
        const off = () => this._listeners.delete(handler);
        off.Dispose = off;
        return off;
    }
    Add(handler) { return this.Subscribe(handler); }
    Remove(handler) { this._listeners.delete(handler); }
    Emit(sender, args = {}) { for (const h of [...this._listeners])
        if (this._listeners.has(h))
            h(sender, args); }
    Clear() { this._listeners.clear(); }
    get Count() { return this._listeners.size; }
}
class NotifyingBase {
    constructor() { this.PropertyChanged = new Signal(); }
    RaisePropertyChanged(PropertyName, OldValue, NewValue) { this.PropertyChanged.Emit(this, { PropertyName, OldValue, NewValue }); }
    RaiseAndSetIfChanged(field, value, propertyName = field.replace(/^_/, '')) {
        if (Object.is(this[field], value))
            return false;
        const old = this[field];
        this[field] = value;
        this.RaisePropertyChanged(propertyName, old, value);
        return true;
    }
}
const proxies = new WeakMap(), raw = new WeakMap(), signals = new WeakMap();
let collector = null;
function isPlain(value) { return value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
/** Proxy-based property notifications. Preserve model identity by using the returned proxy everywhere. */
function observable(model) {
    if (!isPlain(model) || raw.has(model))
        return model;
    if (proxies.has(model))
        return proxies.get(model);
    const signal = new Signal();
    signals.set(model, signal);
    const proxy = new Proxy(model, {
        get(target, prop, receiver) {
            if (prop === 'PropertyChanged')
                return signal;
            if (prop === '$raw')
                return target;
            if (collector && typeof prop === 'string') {
                let keys = collector.get(target);
                if (!keys)
                    collector.set(target, keys = new Set());
                keys.add(prop);
            }
            const value = Reflect.get(target, prop, receiver);
            return isPlain(value) ? observable(value) : value;
        },
        set(target, prop, value) {
            const old = target[prop], next = raw.get(value) ?? value;
            if (Object.is(old, next))
                return true;
            if (!Reflect.set(target, prop, next))
                return false;
            signal.Emit(proxy, { PropertyName: String(prop), OldValue: old, NewValue: value });
            return true;
        },
        deleteProperty(target, prop) {
            if (!(prop in target))
                return true;
            const old = target[prop];
            const ok = Reflect.deleteProperty(target, prop);
            if (ok)
                signal.Emit(proxy, { PropertyName: String(prop), OldValue: old });
            return ok;
        }
    });
    proxies.set(model, proxy);
    raw.set(proxy, model);
    return proxy;
}
/** Tracks arbitrary accessor dependencies, including replacement of intermediate objects. */
function observeSelector(model, getter, changed, { immediate = false } = {}) {
    let off = [], stopped = false, value, busy = false;
    const evaluate = (notify) => {
        if (stopped || busy)
            return;
        busy = true;
        try {
            off.forEach(f => f());
            off = [];
            const previous = collector, deps = new Map();
            collector = deps;
            let next;
            try {
                next = getter(model);
            }
            finally {
                collector = previous;
            }
            const old = value;
            value = next;
            for (const [obj, keys] of deps)
                off.push(signals.get(obj).Subscribe((_, e) => {
                    if (!e.PropertyName || keys.has(e.PropertyName))
                        evaluate(true);
                }));
            if (!deps.size && model?.PropertyChanged?.Subscribe)
                off.push(model.PropertyChanged.Subscribe(() => evaluate(true)));
            if (notify)
                changed(next, old);
        }
        finally {
            busy = false;
        }
    };
    evaluate(immediate);
    const dispose = () => { stopped = true; off.forEach(f => f()); off = []; };
    dispose.Dispose = dispose;
    return dispose;
}
function pathAccessor(path) {
    const keys = Array.isArray(path) ? path : String(path).split('.').filter(Boolean);
    const get = model => keys.reduce((x, k) => x?.[k], model);
    get.Set = (model, value) => {
        let target = model;
        for (const k of keys.slice(0, -1)) {
            target = target?.[k];
            if (target == null)
                throw new Error(`Cannot write '${keys.join('.')}'.`);
        }
        if (!keys.length)
            throw new Error('An empty path is read-only.');
        target[keys.at(-1)] = value;
    };
    return get;
}
function disposeAll(items) { for (const x of items.splice(0))
    typeof x === 'function' ? x() : x?.Dispose?.(); }

Object.assign(exports,{Signal,NotifyingBase,observable,observeSelector,pathAccessor,disposeAll});
},
"packages/core/src/primitives.js":function(exports,require){
const GridUnitType = Object.freeze({ Auto: 'Auto', Pixel: 'Pixel', Star: 'Star' });
const ListSortDirection = Object.freeze({ Ascending: 'Ascending', Descending: 'Descending' });
const RowDropPosition = Object.freeze({ None: 'None', Before: 'Before', After: 'After', Inside: 'Inside' });
const RowMoveEffects = Object.freeze({ None: 'None', Move: 'Move', Copy: 'Copy', Link: 'Link' });
const TreeDataGridSelectionMode = Object.freeze({ Row: 0, Cell: 1, Multiple: 2 });
class GridLength {
    constructor(value = 1, type = GridUnitType.Pixel) {
        if (!Object.values(GridUnitType).includes(type) || !Number.isFinite(value) || value < 0)
            throw new RangeError('Invalid grid length.');
        this.Value = value;
        this.GridUnitType = type;
        Object.freeze(this);
    }
    get IsAbsolute() { return this.GridUnitType === GridUnitType.Pixel; }
    get IsAuto() { return this.GridUnitType === GridUnitType.Auto; }
    get IsStar() { return this.GridUnitType === GridUnitType.Star; }
    Equals(other) { return other instanceof GridLength && this.Value === other.Value && this.GridUnitType === other.GridUnitType; }
    ToString() { return this.IsAuto ? 'Auto' : `${this.Value}${this.IsStar ? '*' : ''}`; }
    toString() { return this.ToString(); }
    static Parse(value) {
        if (value instanceof GridLength)
            return value;
        if (value == null || String(value).toLowerCase() === 'auto')
            return GridLength.Auto;
        if (typeof value === 'number')
            return new GridLength(value);
        const s = String(value).trim();
        if (s.endsWith('*'))
            return new GridLength(s === '*' ? 1 : Number(s.slice(0, -1)), GridUnitType.Star);
        if (!/^\d+(\.\d+)?(?:px)?$/i.test(s))
            throw new RangeError(`Invalid grid length: ${s}`);
        return new GridLength(parseFloat(s));
    }
    static Auto = new GridLength(1, GridUnitType.Auto);
}
class IndexPath {
    constructor(...indexes) {
        let a = indexes.length === 1 ? indexes[0] : indexes;
        if (a instanceof IndexPath)
            a = a._path;
        if (a == null || a === -1)
            a = [];
        if (typeof a === 'string')
            a = a.replace(/[()]/g, '').split(/[.,/]/).filter(Boolean).map(Number);
        if (typeof a === 'number')
            a = [a];
        a = Array.from(a);
        if (a.some(i => !Number.isInteger(i) || i < 0))
            throw new RangeError('Index paths contain non-negative integers.');
        this._path = Object.freeze(a);
        this.Key = a.join('.');
        a.forEach((n, i) => Object.defineProperty(this, i, { value: n, enumerable: true }));
        Object.freeze(this);
    }
    static From(index) { return index instanceof IndexPath ? index : new IndexPath(index); }
    static Unselected = new IndexPath();
    get Count() { return this._path.length; }
    get length() { return this.Count; }
    Get(index) { if (index < 0 || index >= this.Count)
        throw new RangeError('Index out of range.'); return this._path[index]; }
    CompareTo(other) { other = IndexPath.From(other); for (let i = 0; i < Math.min(this.Count, other.Count); i++)
        if (this[i] !== other[i])
            return Math.sign(this[i] - other[i]); return Math.sign(this.Count - other.Count); }
    Equals(other) { return other != null && this.CompareTo(other) === 0; }
    Append(index) { return new IndexPath([...this, index]); }
    IsAncestorOf(other) { other = IndexPath.From(other); return this.Count < other.Count && this._path.every((x, i) => x === other[i]); }
    IsParentOf(other) { other = IndexPath.From(other); return other.Count === this.Count + 1 && this.IsAncestorOf(other); }
    Slice(start, length = this.Count - start) { if (start < 0 || length < 0 || start + length > this.Count)
        throw new RangeError('Invalid slice.'); return new IndexPath(this._path.slice(start, start + length)); }
    get Parent() { return this.Slice(0, Math.max(0, this.Count - 1)); }
    ToArray() { return this._path.slice(); }
    ToString() { return `(${this.Key})`; }
    toString() { return this.ToString(); }
    toJSON() { return this.ToArray(); }
    GetHashCode() { let h = -504981047; for (const i of this)
        h = Math.imul(h, -1521134295) + i | 0; return h; }
    [Symbol.iterator]() { return this._path[Symbol.iterator](); }
}
class CellIndex {
    constructor(columnIndex = -1, rowIndex = IndexPath.Unselected) { this.ColumnIndex = columnIndex; this.RowIndex = IndexPath.From(rowIndex); Object.freeze(this); }
    Equals(other) { return other instanceof CellIndex && this.ColumnIndex === other.ColumnIndex && this.RowIndex.Equals(other.RowIndex); }
    ToString() { return `${this.ColumnIndex}:${this.RowIndex}`; }
}
class IndexRange {
    constructor(begin, end = begin) { this.Begin = Math.min(begin, end); this.End = Math.max(begin, end); }
    get Count() { return this.End - this.Begin + 1; }
    Contains(index) { return index >= this.Begin && index <= this.End; }
    Intersects(other) { return this.Begin <= other.End && other.Begin <= this.End; }
    [Symbol.iterator]() { let i = this.Begin, e = this.End; return { next: () => i <= e ? { value: i++, done: false } : { done: true } }; }
}
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

Object.assign(exports,{GridUnitType,ListSortDirection,RowDropPosition,RowMoveEffects,TreeDataGridSelectionMode,GridLength,IndexPath,CellIndex,IndexRange,clamp});
},
"packages/core/src/collections.js":function(exports,require){
const { Signal, NotifyingBase }=require("packages/core/src/events.js");

const NotifyCollectionChangedAction = Object.freeze({ Add: 'Add', Remove: 'Remove', Replace: 'Replace', Move: 'Move', Reset: 'Reset' });
const numeric = p => typeof p === 'string' && /^(0|[1-9]\d*)$/.test(p);
function indexable(target) {
    return new Proxy(target, { get(t, p, r) { return numeric(p) ? t.Get(+p) : Reflect.get(t, p, r); }, set(t, p, v, r) { if (numeric(p)) {
            t.Set(+p, v);
            return true;
        } return Reflect.set(t, p, v, r); } });
}
class ReadOnlyListBase {
    get Count() { return 0; }
    get length() { return this.Count; }
    Get(index) { throw new RangeError(`Index ${index} not found.`); }
    at(index) { return this.Get(index < 0 ? this.Count + index : index); }
    *[Symbol.iterator]() { for (let i = 0; i < this.Count; i++)
        yield this.Get(i); }
    ToArray() { return Array.from(this); }
    IndexOf(item) { for (let i = 0; i < this.Count; i++)
        if (this.Get(i) === item)
            return i; return -1; }
    Contains(item) { return this.IndexOf(item) >= 0; }
    map(fn) { return this.ToArray().map(fn); }
    forEach(fn) { for (let i = 0; i < this.Count; i++)
        fn(this.Get(i), i); }
}
class ObservableList extends NotifyingBase {
    constructor(items = []) { super(); this._items = Array.from(items); this.CollectionChanged = new Signal(); this._batch = 0; this._pending = false; return indexable(this); }
    get Count() { return this._items.length; }
    get length() { return this.Count; }
    Get(i) { if (!Number.isInteger(i) || i < 0 || i >= this.Count)
        throw new RangeError('Index out of range.'); return this._items[i]; }
    at(i) { return this.Get(i < 0 ? this.Count + i : i); }
    Set(i, value) { const old = this.Get(i); this._validate([...this._items.slice(0, i), value, ...this._items.slice(i + 1)]); this._items[i] = value; this._emit('Replace', [value], [old], i, i); }
    _validate(_items) { }
    _emit(Action, NewItems = [], OldItems = [], NewStartingIndex = -1, OldStartingIndex = -1) {
        if (this._batch) {
            this._pending = true;
            return;
        }
        this.CollectionChanged.Emit(this, { Action, NewItems, OldItems, NewStartingIndex, OldStartingIndex });
        this.RaisePropertyChanged('Count');
    }
    Add(item) { this.Insert(this.Count, item); return this.Count - 1; }
    AddRange(items) { this.InsertRange(this.Count, items); }
    Insert(index, item) { this.InsertRange(index, [item]); }
    InsertRange(index, items) {
        if (index < 0 || index > this.Count)
            throw new RangeError('Index out of range.');
        if (typeof items === 'function') {
            const values = [];
            items(x => values.push(x));
            items = values;
        }
        const values = Array.from(items);
        if (!values.length)
            return;
        this._validate([...this._items.slice(0, index), ...values, ...this._items.slice(index)]);
        // Avoid argument-count limits when adding 100,000+ rows.
        this._items = this._items.slice(0, index).concat(values, this._items.slice(index));
        this._emit('Add', values, [], index, -1);
    }
    Remove(item) { const i = this.IndexOf(item); if (i < 0)
        return false; this.RemoveAt(i); return true; }
    RemoveAt(index) { this.RemoveRange(index, 1); }
    RemoveRange(index, count) { if (index < 0 || count < 0 || index + count > this.Count)
        throw new RangeError('Invalid range.'); if (!count)
        return; const old = this._items.splice(index, count); this._emit('Remove', [], old, -1, index); }
    Move(oldIndex, newIndex) { const item = this.Get(oldIndex); this.Get(newIndex); if (oldIndex === newIndex)
        return; this._items.splice(oldIndex, 1); this._items.splice(newIndex, 0, item); this._emit('Move', [item], [item], newIndex, oldIndex); }
    Clear() { if (!this.Count)
        return; const old = this._items; this._items = []; this._emit('Reset', [], old); }
    Reset(actionOrItems) {
        let next = this._items.slice();
        if (typeof actionOrItems === 'function') {
            const draft = new ObservableList(next);
            actionOrItems(draft);
            next = draft.ToArray();
        }
        else
            next = Array.from(actionOrItems ?? []);
        this._validate(next);
        const old = this._items;
        this._items = next;
        this._emit('Reset', next, old);
    }
    BeginUpdate() { if (!this._batch++)
        this._before = this._items.slice(); }
    EndUpdate() { if (!this._batch)
        throw new Error('Unbalanced EndUpdate.'); if (--this._batch === 0 && this._pending) {
        this._pending = false;
        this._emit('Reset', this._items.slice(), this._before);
    } if (!this._batch)
        this._before = null; }
    Batch(action) { this.BeginUpdate(); try {
        return action(this);
    }
    finally {
        this.EndUpdate();
    } }
    IndexOf(item) { return this._items.indexOf(item); }
    Contains(item) { return this.IndexOf(item) >= 0; }
    ToArray() { return this._items.slice(); }
    [Symbol.iterator]() { return this._items[Symbol.iterator](); }
    map(fn) { return this._items.map(fn); }
    forEach(fn) { this._items.forEach(fn); }
}
class NotifyingListBase extends ObservableList {
}
class TreeDataGridItemsSourceView extends ReadOnlyListBase {
    constructor(items = []) { super(); this.Items = items; this.CollectionChanged = new Signal(); this._list = Array.isArray(items) || items instanceof ObservableList ? items : Array.from(items); this._off = items.CollectionChanged?.Subscribe((s, e) => this.CollectionChanged.Emit(this, e)); return indexable(this); }
    get Count() { return this._list.Count ?? this._list.length; }
    Get(i) { if (i < 0 || i >= this.Count)
        throw new RangeError('Index out of range.'); return this._list.Get ? this._list.Get(i) : this._list[i]; }
    IndexOf(item) { return this._list.IndexOf ? this._list.IndexOf(item) : this._list.indexOf(item); }
    Dispose() { this._off?.(); this.CollectionChanged.Clear(); }
    static GetOrCreate(items) { return items instanceof TreeDataGridItemsSourceView ? items : new TreeDataGridItemsSourceView(items); }
}
function listCount(list) { return list?.Count ?? list?.length ?? 0; }
function listAt(list, index) { return list?.Get ? list.Get(index) : list?.[index]; }
function listArray(list) { return Array.isArray(list) ? list : Array.from(list ?? []); }
/** Maps one collection index through an observable change, preserving occurrences, not just item identity. */
const resetMappings = new WeakMap();
function mapChangedIndex(index, e) {
    const n = e.NewItems?.length ?? 0, o = e.OldItems?.length ?? 0, ni = e.NewStartingIndex, oi = e.OldStartingIndex;
    switch (e.Action) {
        case 'Add': return index >= ni ? index + n : index;
        case 'Remove': return index < oi ? index : index < oi + o ? -1 : index - o;
        case 'Replace': return index >= oi && index < oi + o ? -1 : index >= oi + o ? index + n - o : index;
        case 'Move':
            if (index >= oi && index < oi + o)
                return ni + index - oi;
            if (oi < ni && index >= oi + o && index < ni + o)
                return index - o;
            if (ni < oi && index >= ni && index < oi)
                return index + o;
            return index;
        case 'Reset': {
            let mapping = resetMappings.get(e);
            if (!mapping) {
                const positions = new Map();
                for (let i = 0; i < n; i++) {
                    const item = e.NewItems[i];
                    let q = positions.get(item);
                    if (!q)
                        positions.set(item, q = { list: [], next: 0 });
                    q.list.push(i);
                }
                mapping = new Int32Array(o);
                mapping.fill(-1);
                for (let i = 0; i < o; i++) {
                    const q = positions.get(e.OldItems[i]);
                    if (q && q.next < q.list.length)
                        mapping[i] = q.list[q.next++];
                }
                resetMappings.set(e, mapping);
            }
            return index >= 0 && index < mapping.length ? mapping[index] : -1;
        }
        default: return index;
    }
}

Object.assign(exports,{NotifyCollectionChangedAction,indexable,ReadOnlyListBase,ObservableList,NotifyingListBase,TreeDataGridItemsSourceView,listCount,listAt,listArray,mapChangedIndex});
},
"packages/core/src/columns.js":function(exports,require){
const { NotifyingBase, pathAccessor }=require("packages/core/src/events.js");
const { ObservableList }=require("packages/core/src/collections.js");
const { GridLength, ListSortDirection }=require("packages/core/src/primitives.js");

class ColumnOptions {
    constructor(options = {}) { Object.assign(this, { CanUserResizeColumn: null, CanUserSortColumn: null, MinWidth: new GridLength(30), MaxWidth: null, CompareAscending: null, CompareDescending: null }, options); }
}
class TextColumnOptions extends ColumnOptions {
    constructor(options = {}) { super(); Object.assign(this, { TextWrapping: false, TextTrimming: 'CharacterEllipsis', StringFormat: null, TextAlignment: 'Left', BeginEditGestures: 'DoubleTap,F2', Culture: null }, options); }
}
class CheckBoxColumnOptions extends ColumnOptions {
    constructor(options = {}) { super(options); this.IsThreeState = !!options.IsThreeState; }
}
class ColumnBase extends NotifyingBase {
    constructor(header, width = null, options = null, id = null) {
        super();
        this.Id = id ?? String(header ?? '');
        this.Header = header;
        this.Options = options instanceof ColumnOptions ? options : new ColumnOptions(options ?? {});
        this._width = GridLength.Parse(width);
        this._visible = true;
        this._presentationKey = null;
        this._sortDirection = null;
        this.Tag = null;
    }
    get Width() { return this._width; }
    set Width(v) { v = GridLength.Parse(v); if (!this._width.Equals(v))
        this.RaiseAndSetIfChanged('_width', v, 'Width'); }
    get IsVisible() { return this._visible; }
    set IsVisible(v) { this.RaiseAndSetIfChanged('_visible', !!v, 'IsVisible'); }
    get PresentationKey() { return this._presentationKey; }
    set PresentationKey(v) { this.RaiseAndSetIfChanged('_presentationKey', v, 'PresentationKey'); }
    get SortDirection() { return this._sortDirection; }
    set SortDirection(v) { this.RaiseAndSetIfChanged('_sortDirection', v, 'SortDirection'); }
    GetComparison() { return null; }
    Accept(visitor) { return visitor.Visit(this); }
}
function compareValues(a, b) { if (a == null)
    return b == null ? 0 : -1; if (b == null)
    return 1; if (a === b)
    return 0; if (typeof a === 'number' && typeof b === 'number')
    return (Number.isNaN(a) ? -1 : Number.isNaN(b) ? 1 : a - b); if (typeof a === 'string' && typeof b === 'string')
    return a.localeCompare(b); return a < b ? -1 : a > b ? 1 : 0; }
class ValueColumn extends ColumnBase {
    constructor(header, getter, setter = null, width = null, options = null, id = null) {
        super(header, width, options, id);
        this.PropertyName = typeof getter === 'string' ? getter : null;
        this.Getter = typeof getter === 'string' ? pathAccessor(getter) : getter;
        if (typeof this.Getter !== 'function')
            throw new TypeError('A column requires an accessor.');
        this.Setter = setter === true && this.PropertyName ? this.Getter.Set : setter;
        if (this.Setter != null && typeof this.Setter !== 'function')
            throw new TypeError('Setter must be a function.');
        this.GetterExpression = null;
    }
    static FromDelegate(header, getter, propertyName = null, setter = null, width = null, options = null, id = null) { const c = new ValueColumn(header, getter, setter, width, options, id); c.PropertyName = propertyName; return c; }
    GetValue(model) { return this.Getter(model); }
    SetValue(model, value) { if (!this.Setter)
        throw new Error('Column is read-only.'); this.Setter(model, value); }
    GetComparison(direction) {
        if (this.Options.CanUserSortColumn === false)
            return null;
        const custom = direction === ListSortDirection.Ascending ? this.Options.CompareAscending : this.Options.CompareDescending;
        if (custom)
            return custom;
        const sign = direction === ListSortDirection.Ascending ? 1 : -1;
        return (a, b) => sign * compareValues(a == null ? null : this.GetValue(a), b == null ? null : this.GetValue(b));
    }
}
class TextColumn extends ValueColumn {
    constructor(header, getter, setterOrWidth = null, widthOrOptions = null, optionsOrId = null, id = null) {
        if (typeof setterOrWidth === 'function' || setterOrWidth === true || setterOrWidth === null) {
            super(header, getter, setterOrWidth, widthOrOptions, optionsOrId, id);
        }
        else
            super(header, getter, null, setterOrWidth, widthOrOptions, optionsOrId);
    }
}
class CheckBoxColumn extends ValueColumn {
    constructor(header, getter, setter = null, width = null, options = null, id = null) { super(header, getter, setter, width, options, id); this.PresentationKey = 'CheckBox'; this.IsThreeState = !!options?.IsThreeState; this.BooleanGetter = this.IsThreeState ? null : this.Getter; this.BooleanSetter = this.IsThreeState ? null : this.Setter; }
}
class TemplateColumn extends ValueColumn {
    constructor(header, presentationKey, width = null, options = null, id = null) { if (presentationKey == null)
        throw new TypeError('Presentation key required.'); super(header, m => m, null, width, options, id); this.PresentationKey = presentationKey; }
    GetComparison(direction) { return this.Options.CanUserSortColumn === false ? null : (direction === ListSortDirection.Ascending ? this.Options.CompareAscending : this.Options.CompareDescending); }
}
class HierarchicalExpanderColumn {
    constructor(inner, childSelector, hasChildrenSelector = null, isExpandedSelector = null, setIsExpanded = null) {
        if (!inner || !childSelector)
            throw new TypeError('Inner column and child accessor required.');
        this.Inner = inner;
        this.ChildSelector = typeof childSelector === 'string' ? pathAccessor(childSelector) : childSelector;
        this.HasChildrenSelector = typeof hasChildrenSelector === 'string' ? pathAccessor(hasChildrenSelector) : hasChildrenSelector;
        this.IsExpandedSelector = typeof isExpandedSelector === 'string' ? pathAccessor(isExpandedSelector) : isExpandedSelector;
        this.SetIsExpanded = setIsExpanded ?? (typeof isExpandedSelector === 'string' ? this.IsExpandedSelector.Set : null);
    }
    get Id() { return this.Inner.Id; }
    get Header() { return this.Inner.Header; }
    get Options() { return this.Inner.Options; }
    get PropertyChanged() { return this.Inner.PropertyChanged; }
    get Width() { return this.Inner.Width; }
    set Width(v) { this.Inner.Width = v; }
    get IsVisible() { return this.Inner.IsVisible; }
    set IsVisible(v) { this.Inner.IsVisible = v; }
    get PresentationKey() { return this.Inner.PresentationKey; }
    set PresentationKey(v) { this.Inner.PresentationKey = v; }
    get SortDirection() { return this.Inner.SortDirection; }
    set SortDirection(v) { this.Inner.SortDirection = v; }
    get Tag() { return this.Inner.Tag; }
    set Tag(v) { this.Inner.Tag = v; }
    GetModelIsExpanded(model) { return this.IsExpandedSelector?.(model) ?? null; }
    SetModelIsExpanded(row) { this.SetIsExpanded?.(row.Model, row.IsExpanded); }
    HasChildren(model) { if (this.HasChildrenSelector)
        return !!this.HasChildrenSelector(model); const c = this.GetChildModels(model); return !!(c?.Count ?? c?.length ?? (c && Array.from(c).length)); }
    GetChildModels(model) { return this.ChildSelector(model); }
    GetValue(model) { return this.Inner.GetValue?.(model); }
    SetValue(model, value) { return this.Inner.SetValue(model, value); }
    GetComparison(direction) { return this.Inner.GetComparison(direction); }
    Accept(visitor) { return visitor.Visit(this); }
}
class ColumnList extends ObservableList {
    _validate(items) { if (new Set(items).size !== items.length)
        throw new Error('A column instance can only appear once.'); if (items.some(c => !c || typeof c.Accept !== 'function'))
        throw new TypeError('Invalid column.'); this.Validate?.(items); }
    SetColumnWidth(index, width) { this.Get(index).Width = width; }
}
class FuncComparer {
    constructor(compare) { this._compare = compare; }
    Compare(a, b) { return this._compare(a, b); }
}

Object.assign(exports,{ColumnOptions,TextColumnOptions,CheckBoxColumnOptions,ColumnBase,compareValues,ValueColumn,TextColumn,CheckBoxColumn,TemplateColumn,HierarchicalExpanderColumn,ColumnList,FuncComparer});
},
"packages/core/src/geometry.js":function(exports,require){
const { clamp, GridLength }=require("packages/core/src/primitives.js");

/** Fenwick prefix-sum index: O(log n) height updates, row offsets, and pixel-to-row lookup. */
class RowHeightIndex {
    constructor(count = 0, estimate = 32) { this.Reset(count, estimate); }
    Reset(count, estimate = 32) { if (!Number.isSafeInteger(count) || count < 0 || !Number.isFinite(estimate) || estimate <= 0)
        throw new RangeError('Invalid row geometry.'); this.Count = count; this.Estimate = estimate; this.Values = new Float64Array(count); this.Values.fill(estimate); this.Tree = new Float64Array(count + 1); for (let i = 1; i <= count; i++)
        this.Tree[i] = (i & -i) * estimate; }
    Get(index) { if (index < 0 || index >= this.Count)
        throw new RangeError('Invalid row.'); return this.Values[index]; }
    Set(index, height) { if (index < 0 || index >= this.Count || !Number.isFinite(height) || height <= 0)
        throw new RangeError('Invalid row height.'); const d = height - this.Values[index]; if (Math.abs(d) < 0.01)
        return 0; this.Values[index] = height; for (let i = index + 1; i <= this.Count; i += i & -i)
        this.Tree[i] += d; return d; }
    Offset(index) { let sum = 0; for (let i = clamp(index, 0, this.Count); i > 0; i -= i & -i)
        sum += this.Tree[i]; return sum; }
    get Total() { return this.Offset(this.Count); }
    IndexAt(offset) { if (!this.Count)
        return -1; if (offset <= 0)
        return 0; let index = 0, sum = 0; let bit = 2 ** Math.floor(Math.log2(this.Count)); for (; bit >= 1; bit = Math.floor(bit / 2)) {
        const next = index + bit;
        if (next <= this.Count && sum + this.Tree[next] <= offset) {
            sum += this.Tree[next];
            index = next;
        }
    } return Math.min(index, this.Count - 1); }
    Range(offset, viewport, overscan = 120) { if (!this.Count)
        return { start: 0, end: 0 }; return { start: this.IndexAt(Math.max(0, offset - overscan)), end: Math.min(this.Count, this.IndexAt(offset + viewport + overscan) + 1) }; }
}
class ColumnGeometry {
    constructor() { this.Items = []; this.Offsets = [0]; this.Total = 0; }
    Reset(widths) { this.Items = Array.from(widths); this.Offsets = new Float64Array(this.Items.length + 1); for (let i = 0; i < this.Items.length; i++)
        this.Offsets[i + 1] = this.Offsets[i] + this.Items[i]; this.Total = this.Offsets[this.Items.length]; }
    IndexAt(offset) { let a = 0, b = this.Items.length; while (a < b) {
        const m = (a + b) >>> 1;
        if (this.Offsets[m + 1] <= offset)
            a = m + 1;
        else
            b = m;
    } return Math.min(a, this.Items.length - 1); }
    Range(offset, width, overscan = 80) { if (!this.Items.length)
        return { start: 0, end: 0 }; return { start: Math.max(0, this.IndexAt(Math.max(0, offset - overscan))), end: Math.min(this.Items.length, this.IndexAt(offset + width + overscan) + 1) }; }
}
/** Independent per-view column widths. Star constraints are solved by water filling. */
class ColumnLayout {
    constructor() { this.Measured = new Map(); this.Columns = []; this.Widths = []; this.Geometry = new ColumnGeometry(); }
    Measure(column, width) { const old = this.Measured.get(column) ?? 0; if (width > old + 0.5) {
        this.Measured.set(column, width);
        return true;
    } return false; }
    ResetMeasurements() { this.Measured.clear(); }
    Calculate(columns, available) {
        this.Columns = Array.from(columns).filter(c => c.IsVisible);
        const widths = [], stars = [];
        const bound = (c, key, fallback) => { const v = c.Options?.[key]; if (v == null)
            return fallback; const g = GridLength.Parse(v); return g.IsAuto ? (this.Measured.get(c) ?? fallback) : g.IsAbsolute ? g.Value : fallback; };
        const min = this.Columns.map(c => bound(c, 'MinWidth', 30)), max = this.Columns.map(c => Math.max(bound(c, 'MinWidth', 30), bound(c, 'MaxWidth', Infinity)));
        let fixed = 0;
        this.Columns.forEach((c, i) => { const w = GridLength.Parse(c.Width); if (w.IsStar) {
            stars.push({ i, weight: w.Value });
            widths[i] = 0;
        }
        else {
            widths[i] = clamp(w.IsAbsolute ? w.Value : (this.Measured.get(c) ?? Math.max(80, String(c.Header ?? '').length * 8 + 34)), min[i], max[i]);
            fixed += widths[i];
        } });
        let remaining = Math.max(0, available - fixed), active = stars.slice();
        while (active.length) {
            const weight = active.reduce((s, x) => s + x.weight, 0);
            let constrained = false;
            const next = [];
            for (const x of active) {
                const share = weight ? remaining * x.weight / weight : 0;
                const w = clamp(share, min[x.i], max[x.i]);
                if (w !== share) {
                    widths[x.i] = w;
                    remaining -= w;
                    constrained = true;
                }
                else
                    next.push(x);
            }
            if (!constrained) {
                for (const x of active)
                    widths[x.i] = weight ? remaining * x.weight / weight : min[x.i];
                break;
            }
            active = next;
        }
        this.Widths = widths;
        this.Geometry.Reset(widths);
        return widths;
    }
}

Object.assign(exports,{RowHeightIndex,ColumnGeometry,ColumnLayout});
},
"packages/core/src/rows.js":function(exports,require){
const { Signal, NotifyingBase, observeSelector, disposeAll }=require("packages/core/src/events.js");
const { IndexPath }=require("packages/core/src/primitives.js");
const { ReadOnlyListBase, indexable, listCount, listAt, listArray, mapChangedIndex }=require("packages/core/src/collections.js");

class AnonymousRow extends NotifyingBase {
    constructor(model, modelIndex) { super(); this.Model = model; this._index = modelIndex; }
    get ModelIndex() { if (this._cachedPathIndex !== this._index) {
        this._cachedPathIndex = this._index;
        this._cachedPath = new IndexPath(this._index);
    } return this._cachedPath; }
    get Indent() { return 0; }
    get IsExpanded() { return false; }
    get ShowExpander() { return false; }
    get Height() { return NaN; }
}
/** Flat sources never allocate row objects for unvisited rows. */
class AnonymousSortableRows extends ReadOnlyListBase {
    constructor(source) { super(); this.Source = source; this.CollectionChanged = new Signal(); this._cache = new Map(); this._order = null; this._inverse = null; this._project(); return indexable(this); }
    get Count() { return this._order?.length ?? listCount(this.Source.Items); }
    Get(index) { if (index < 0 || index >= this.Count)
        throw new RangeError('Invalid row index.'); const mi = this._order ? this._order[index] : index; let row = this._cache.get(mi); if (!row) {
        row = new AnonymousRow(listAt(this.Source.Items, mi), mi);
        this._cache.set(mi, row);
    } return row; }
    GetModel(index) { if (index < 0 || index >= this.Count)
        throw new RangeError('Invalid row index.'); return listAt(this.Source.Items, this._order ? this._order[index] : index); }
    RowIndexToModelIndex(index) { if (index < 0 || index >= this.Count)
        return IndexPath.Unselected; return new IndexPath(this._order ? this._order[index] : index); }
    ModelIndexToRowIndex(path) { path = IndexPath.From(path); if (path.Count !== 1 || path[0] >= listCount(this.Source.Items))
        return -1; return this._inverse ? this._inverse[path[0]] : path[0]; }
    _project() {
        const source = this.Source, n = listCount(source.Items);
        if (!source._comparison && !source._filter) {
            this._order = null;
            this._inverse = null;
            return;
        }
        let indexes = Array.from({ length: n }, (_, i) => i);
        if (source._filter)
            indexes = indexes.filter(i => source._filter(listAt(source.Items, i)));
        if (source._comparison)
            indexes.sort((a, b) => source._comparison(listAt(source.Items, a), listAt(source.Items, b)) || a - b);
        this._order = Int32Array.from(indexes);
        this._inverse = new Int32Array(n);
        this._inverse.fill(-1);
        for (let i = 0; i < indexes.length; i++)
            this._inverse[indexes[i]] = i;
    }
    _changed(e) { const next = new Map(); for (const [i, row] of this._cache) {
        const ni = mapChangedIndex(i, e);
        if (ni >= 0) {
            row._index = ni;
            row.Model = listAt(this.Source.Items, ni);
            next.set(ni, row);
        }
    } this._cache = next; this._project(); this.CollectionChanged.Emit(this, e); }
    Sort() { this._project(); this.CollectionChanged.Emit(this, { Action: 'Reset', Reason: 'Sort' }); }
    Refresh() { this._cache.clear(); this._project(); this.CollectionChanged.Emit(this, { Action: 'Reset', Reason: 'Refresh' }); }
    get CachedRowCount() { return this._cache.size; }
    Dispose() { this._cache.clear(); this.CollectionChanged.Clear(); }
}
class HierarchicalRow extends NotifyingBase {
    constructor(rows, model, parent, index) {
        super();
        this.Owner = rows;
        this.Model = model;
        this.Parent = parent;
        this._index = index;
        this._children = null;
        this._childrenItems = null;
        this._off = [];
        this._expanded = false;
        this.IsLoading = false;
        this.LoadError = null;
        this._loadedModels = undefined;
        this._alive = true;
        const exp = rows.Source.ExpanderColumn;
        if (exp?.IsExpandedSelector) {
            this._expanded = !!exp.GetModelIsExpanded(model);
            this._off.push(observeSelector(model, m => exp.GetModelIsExpanded(m), v => { if (this._alive && this._expanded !== !!v)
                rows.Source._setExpandedRow(this, !!v, false); }));
        }
        if (exp)
            this._off.push(observeSelector(model, m => exp.GetChildModels(m), value => { if (this._alive && this._children && value !== this._childrenItems) {
                rows._replaceChildren(this, value);
                rows._request();
            } }));
    }
    get ModelIndex() { return this.Parent ? this.Parent.ModelIndex.Append(this._index) : new IndexPath(this._index); }
    get Indent() { let d = 0; for (let p = this.Parent; p; p = p.Parent)
        d++; return d; }
    get IsExpanded() { return this._expanded; }
    set IsExpanded(value) { this.Owner.Source._setExpandedRow(this, !!value); }
    get ShowExpander() { return this.HasChildren; }
    get HasChildren() { if (this._loadedModels !== undefined)
        return listCount(this._loadedModels) > 0; return this.Owner.Source.ExpanderColumn?.HasChildren(this.Model) ?? false; }
    get Children() { return this.Owner._ensureChildren(this); }
    get Height() { return NaN; }
    Dispose() { if (!this._alive)
        return; this._alive = false; this._abort?.abort(); disposeAll(this._off); this._childOff?.(); this._children?.forEach(r => r.Dispose()); this.PropertyChanged.Clear(); }
}
class HierarchicalRows extends ReadOnlyListBase {
    constructor(source) { super(); this.Source = source; this.CollectionChanged = new Signal(); this._visible = []; this._index = new Map(); this._roots = this._make(source.Items, null); this._rebuild(); return indexable(this); }
    GetModel(index) { return this.Get(index).Model; }
    get Count() { return this._visible.length; }
    Get(i) { if (i < 0 || i >= this.Count)
        throw new RangeError('Invalid row index.'); return this._visible[i]; }
    RowIndexToModelIndex(i) { return this._visible[i]?.ModelIndex ?? IndexPath.Unselected; }
    ModelIndexToRowIndex(p) { return this._index.get(IndexPath.From(p).Key) ?? -1; }
    _make(items, parent) { return listArray(items).map((m, i) => { for (let p = parent; p; p = p.Parent)
        if (p.Model === m)
            throw new Error('A hierarchy cannot contain a cycle.'); return new HierarchicalRow(this, m, parent, i); }); }
    _ensureChildren(row) { if (row._children)
        return row._children; const items = row._loadedModels ?? this.Source.ExpanderColumn?.GetChildModels(row.Model) ?? []; if (items?.then)
        throw new Error('Use ChildrenLoader and ExpandAsync for asynchronous children.'); this._replaceChildren(row, items); return row._children; }
    _replaceChildren(row, items) { row._children?.forEach(r => r.Dispose()); row._childOff?.(); row._childrenItems = items ?? []; row._children = this._make(items, row); row._childOff = items?.CollectionChanged?.Subscribe((_, e) => { const parent = row.ModelIndex; this.Source.CollectionChanged.Emit(this.Source, { ParentIndex: parent, Change: e }); row._children = this._reconcile(row._children, row._childrenItems, row, e); this._request(); }); }
    _reconcile(old, items, parent, e) { const next = Array(listCount(items)); for (let i = 0; i < old.length; i++) {
        const ni = mapChangedIndex(i, e);
        if (ni >= 0 && ni < next.length && old[i].Model === listAt(items, ni)) {
            old[i]._index = ni;
            next[ni] = old[i];
        }
        else
            old[i].Dispose();
    } for (let i = 0; i < next.length; i++)
        if (!next[i])
            next[i] = new HierarchicalRow(this, listAt(items, i), parent, i); return next; }
    _changed(e) { this._roots = this._reconcile(this._roots, this.Source.Items, null, e); this._request(); }
    _ordered(rows) { if (!this.Source._comparison)
        return rows; return rows.slice().sort((a, b) => this.Source._comparison(a.Model, b.Model) || a._index - b._index); }
    _rebuild() {
        const visible = [], map = new Map(), stack = [{ rows: this._ordered(this._roots), i: 0 }];
        const filter = this.Source._filter;
        while (stack.length) {
            const frame = stack.at(-1);
            if (frame.i >= frame.rows.length) {
                stack.pop();
                continue;
            }
            const row = frame.rows[frame.i++];
            // Hierarchical filtering includes matching ancestors and descendants in the projection.
            if (filter && !this._matches(row, filter, new Set()))
                continue;
            map.set(row.ModelIndex.Key, visible.length);
            visible.push(row);
            if (row._expanded && row.HasChildren)
                stack.push({ rows: this._ordered(this._ensureChildren(row)), i: 0 });
        }
        this._visible = visible;
        this._index = map;
        this.CollectionChanged.Emit(this, { Action: 'Reset' });
    }
    _matches(row, predicate, seen) { if (predicate(row.Model))
        return true; if (seen.has(row.Model))
        return false; seen.add(row.Model); if (!row.HasChildren)
        return false; for (const child of this._ensureChildren(row))
        if (this._matches(child, predicate, seen))
            return true; return false; }
    _request() { if (this.Source._batch) {
        this.Source._dirty = true;
        return;
    } this._rebuild(); this.Source.Changed.Emit(this.Source, { Kind: 'Rows' }); }
    GetRow(path, create = true) { path = IndexPath.From(path); let rows = this._roots, row = null; for (let d = 0; d < path.Count; d++) {
        row = rows[path[d]];
        if (!row)
            return null;
        if (d < path.Count - 1)
            rows = create ? this._ensureChildren(row) : (row._children ?? []);
    } return row; }
    Expand(index) { this.Source.Expand(index); }
    Collapse(index) { this.Source.Collapse(index); }
    ExpandCollapseRecursive(predicate, row = null) { this.Source.ExpandCollapseRecursive(row ?? predicate, row ? predicate : undefined); }
    Sort() { this._request(); }
    Refresh() { this._roots.forEach(r => r.Dispose()); this._roots = this._make(this.Source.Items, null); this._request(); }
    Dispose() { this._roots.forEach(r => r.Dispose()); this._roots = []; this._visible = []; this._index.clear(); this.CollectionChanged.Clear(); }
}
class RowEventArgs {
    constructor(row) { this.Row = row; this.Model = row.Model; this.ModelIndex = row.ModelIndex; this.Cancel = false; }
}

Object.assign(exports,{AnonymousRow,AnonymousSortableRows,HierarchicalRow,HierarchicalRows,RowEventArgs});
},
"packages/core/src/selection.js":function(exports,require){
const { Signal, NotifyingBase, disposeAll }=require("packages/core/src/events.js");
const { IndexPath, CellIndex, clamp }=require("packages/core/src/primitives.js");
const { ReadOnlyListBase, indexable, mapChangedIndex }=require("packages/core/src/collections.js");

class TreeSelectionModelSelectionChangedEventArgs {
    constructor(deselectedIndexes = [], selectedIndexes = [], deselectedItems = [], selectedItems = []) { Object.assign(this, { DeselectedIndexes: deselectedIndexes, SelectedIndexes: selectedIndexes, DeselectedItems: deselectedItems, SelectedItems: selectedItems }); }
}
class TreeSelectionModelIndexesChangedEventArgs {
    constructor(parentIndex, startIndex, delta) { Object.assign(this, { ParentIndex: IndexPath.From(parentIndex), StartIndex: startIndex, Delta: delta }); }
}
class TreeSelectionModelSourceResetEventArgs {
    constructor(parentIndex = IndexPath.Unselected) { this.ParentIndex = parentIndex; }
}
class TreeDataGridCellSelectionChangedEventArgs {
}
class TreeSelectionModelBase extends NotifyingBase {
    constructor(source) {
        super();
        this._grid = source?.Rows ? source : null;
        this._source = this._grid?.Items ?? source ?? null;
        this._selected = new Map();
        this._single = true;
        this._anchor = IndexPath.Unselected;
        this._rangeAnchor = IndexPath.Unselected;
        this._batch = 0;
        this._off = [];
        this.SelectionChanged = new Signal();
        this.IndexesChanged = new Signal();
        this.SourceReset = new Signal();
        this.StateChanged = new Signal();
        if (this._grid)
            this._off.push(this._grid.CollectionChanged.Subscribe((_, e) => this._collectionChanged(e.ParentIndex, e.Change)));
    }
    get Source() { return this._source; }
    set Source(v) { if (this._source === v)
        return; this.Clear(); this._source = v; this.SourceReset.Emit(this, new TreeSelectionModelSourceResetEventArgs()); }
    get SingleSelect() { return this._single; }
    set SingleSelect(v) { v = !!v; if (v === this._single)
        return; this._single = v; if (v && this._selected.size > 1) {
        const first = this._selected.values().next().value;
        this.SelectedIndex = first;
    } this.RaisePropertyChanged('SingleSelect'); }
    get _state() { return this._batch ? this._snapshot : this._selected; }
    get SelectedIndex() { return this._state.values().next().value ?? IndexPath.Unselected; }
    set SelectedIndex(index) { index = IndexPath.From(index); this.BeginBatchUpdate(); try {
        this._selected.clear();
        if (this._valid(index))
            this._selected.set(index.Key, index);
        this._anchor = index;
        this._rangeAnchor = index;
    }
    finally {
        this.EndBatchUpdate();
    } }
    get SelectedIndexes() { return Array.from(this._state.values()); }
    get SelectedItem() { return this._batch ? (this._itemSnapshot[0] ?? null) : this._model(this.SelectedIndex); }
    get SelectedItems() { return this._batch ? this._itemSnapshot.slice() : this.SelectedIndexes.map(p => this._model(p)); }
    get AnchorIndex() { return this._batch ? this._anchorSnapshot : this._anchor; }
    set AnchorIndex(v) { this._anchor = IndexPath.From(v); }
    get RangeAnchorIndex() { return this._batch ? this._rangeSnapshot : this._rangeAnchor; }
    set RangeAnchorIndex(v) { this._rangeAnchor = IndexPath.From(v); }
    get Count() { return this._state.size; }
    _valid(p) { return p.Count > 0 && this._model(p) != null; }
    _model(p) { if (!p?.Count)
        return null; if (this._grid)
        return this._grid.TryGetModelAt(p); return this._source?.Get?.(p[0]) ?? this._source?.[p[0]] ?? null; }
    BeginBatchUpdate() {
        if (this._disposed)
            throw new Error('Selection disposed.');
        if (!this._batch++) {
            this._snapshot = new Map(this._selected);
            this._snapshotCurrentPaths = new Map(this._selected);
            this._itemSnapshot = Array.from(this._selected.values(), p => this._model(p));
            this._anchorSnapshot = this._anchor;
            this._rangeSnapshot = this._rangeAnchor;
            this._pendingIndexes = [];
            this._pendingResets = [];
        }
    }
    EndBatchUpdate() {
        if (!this._batch)
            throw new Error('Unbalanced EndBatchUpdate.');
        if (--this._batch)
            return;
        const old = this._snapshot, added = [], removed = [], removedItems = [], survivingKeys = new Set();
        let i = 0;
        for (const [k, p] of old) {
            const mapped = this._snapshotCurrentPaths.get(k);
            if (!mapped?.Count || !this._selected.has(mapped.Key)) {
                removed.push(p);
                removedItems.push(this._itemSnapshot[i]);
            }
            else
                survivingKeys.add(mapped.Key);
            i++;
        }
        for (const [k, p] of this._selected)
            if (!survivingKeys.has(k))
                added.push(p);
        const primaryChanged = (old.values().next().value?.Key ?? '') !== (this._selected.values().next().value?.Key ?? '');
        const anchorsChanged = this._anchorSnapshot.Key !== this._anchor.Key || this._rangeSnapshot.Key !== this._rangeAnchor.Key;
        const indexEvents = this._pendingIndexes, resetEvents = this._pendingResets;
        this._snapshot = this._snapshotCurrentPaths = this._itemSnapshot = null;
        this._pendingIndexes = this._pendingResets = null;
        if (added.length || removed.length)
            this.SelectionChanged.Emit(this, new TreeSelectionModelSelectionChangedEventArgs(removed, added, removedItems, added.map(p => this._model(p))));
        for (const e of indexEvents)
            this.IndexesChanged.Emit(this, e);
        for (const e of resetEvents)
            this.SourceReset.Emit(this, e);
        if (added.length || removed.length || primaryChanged || indexEvents.length || resetEvents.length) {
            this.StateChanged.Emit(this);
            for (const name of ['SelectedIndex', 'SelectedIndexes', 'SelectedItem', 'SelectedItems', 'Count'])
                this.RaisePropertyChanged(name);
        }
        if (anchorsChanged) {
            this.RaisePropertyChanged('AnchorIndex');
            this.RaisePropertyChanged('RangeAnchorIndex');
        }
    }
    _mutate(action) { this.BeginBatchUpdate(); try {
        action();
    }
    finally {
        this.EndBatchUpdate();
    } }
    Select(index) { const p = IndexPath.From(index); if (!this._valid(p))
        return; this._mutate(() => { if (this._single)
        this._selected.clear(); this._selected.set(p.Key, p); this._anchor = p; }); }
    Deselect(index) { const p = IndexPath.From(index); this._mutate(() => this._selected.delete(p.Key)); }
    Clear() { this._mutate(() => { this._selected.clear(); this._anchor = this._rangeAnchor = IndexPath.Unselected; }); }
    IsSelected(index) { return this._state.has(IndexPath.From(index).Key); }
    SelectRange(start, end, add = false) {
        if (!this._grid)
            return;
        const a = this._grid.Rows.ModelIndexToRowIndex(IndexPath.From(start)), b = this._grid.Rows.ModelIndexToRowIndex(IndexPath.From(end));
        if (a < 0 || b < 0)
            return;
        this._mutate(() => { if (!add)
            this._selected.clear(); for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
            const p = this._grid.Rows.RowIndexToModelIndex(i);
            this._selected.set(p.Key, p);
            if (this._single)
                break;
        } this._anchor = IndexPath.From(end); });
    }
    SelectAll() { if (!this._grid)
        return; this._mutate(() => { this._selected.clear(); for (let i = 0; i < this._grid.Rows.Count; i++) {
        const p = this._grid.Rows.RowIndexToModelIndex(i);
        this._selected.set(p.Key, p);
        if (this._single)
            break;
    } }); }
    _collectionChanged(parent, event) {
        parent = IndexPath.From(parent);
        const remap = p => {
            if (!parent.IsAncestorOf(p))
                return p;
            const n = mapChangedIndex(p[parent.Count], event);
            return n < 0 ? IndexPath.Unselected : new IndexPath([...p.Slice(0, parent.Count), n, ...p.Slice(parent.Count + 1)]);
        };
        // Collection notifications arrive after mutation. Recover removed models from
        // OldItems, rather than accidentally reading the item now occupying their slot.
        const oldModel = p => {
            if (!parent.IsAncestorOf(p))
                return this._model(p);
            const index = p[parent.Count], oi = event.OldStartingIndex ?? -1;
            let removed;
            if (event.Action === 'Reset')
                removed = event.OldItems?.[index];
            else if ((event.Action === 'Remove' || event.Action === 'Replace') && index >= oi && index < oi + (event.OldItems?.length ?? 0))
                removed = event.OldItems[index - oi];
            if (removed !== undefined) {
                for (let depth = parent.Count + 1; depth < p.Count && removed != null; depth++) {
                    const children = this._grid?.GetModelChildren(removed);
                    removed = children?.Get ? children.Get(p[depth]) : children?.[p[depth]];
                }
                return removed ?? null;
            }
            return this._model(remap(p));
        };
        const fresh = !this._batch, before = Array.from(this._selected.values());
        const previousItems = fresh ? before.map(oldModel) : null;
        this.BeginBatchUpdate();
        try {
            if (fresh)
                this._itemSnapshot = previousItems;
            this._selected = new Map(before.map(remap).filter(p => p.Count).map(p => [p.Key, p]));
            for (const [k, p] of this._snapshotCurrentPaths)
                this._snapshotCurrentPaths.set(k, remap(p));
            this._anchor = remap(this._anchor);
            this._rangeAnchor = remap(this._rangeAnchor);
            const moved = before.some(p => { const next = remap(p); return next.Count && next.Key !== p.Key; });
            if (moved) {
                const delta = event.Action === 'Add' ? (event.NewItems?.length ?? 0) : event.Action === 'Remove' ? -(event.OldItems?.length ?? 0) : 0;
                const args = new TreeSelectionModelIndexesChangedEventArgs(parent, event.NewStartingIndex >= 0 ? event.NewStartingIndex : event.OldStartingIndex, delta);
                args.Change = event;
                this._pendingIndexes.push(args);
            }
            if (event.Action === 'Reset')
                this._pendingResets.push(new TreeSelectionModelSourceResetEventArgs(parent));
        }
        finally {
            this.EndBatchUpdate();
        }
    }
    Dispose() { if (this._disposed)
        return; this.Clear(); disposeAll(this._off); this._disposed = true; this.SelectionChanged.Clear(); this.StateChanged.Clear(); this.IndexesChanged.Clear(); this.SourceReset.Clear(); this.PropertyChanged.Clear(); }
}
class TreeDataGridRowSelectionModel extends TreeSelectionModelBase {
}
class CellIndexes extends ReadOnlyListBase {
    constructor(owner) { super(); this.Owner = owner; return indexable(this); }
    get Count() { return this.Owner.Count; }
    Get(index) { if (index < 0 || index >= this.Count)
        throw new RangeError('Invalid cell index.'); const o = this.Owner, cols = o._columnIndexes; return new CellIndex(cols[index % cols.length], o.RowSelection.SelectedIndexes[Math.floor(index / cols.length)]); }
}
class TreeDataGridCellSelectionModel extends NotifyingBase {
    constructor(source) {
        super();
        this._grid = source;
        this.RowSelection = new TreeDataGridRowSelectionModel(source);
        this._columns = new Set();
        this._primary = null;
        this._anchorColumn = null;
        this._rangeColumn = null;
        this.SelectionChanged = new Signal();
        this.StateChanged = new Signal();
        this.SelectedIndexes = new CellIndexes(this);
        this._batch = 0;
        this._changed = false;
        this._off = [this.RowSelection.StateChanged.Subscribe(() => this._change()), source.Columns.CollectionChanged.Subscribe(() => { const valid = new Set(source.Columns); for (const c of this._columns)
                if (!valid.has(c))
                    this._columns.delete(c); if (!valid.has(this._primary))
                this._primary = this._columns.values().next().value ?? null; this._change(); })];
    }
    get Source() { return this.RowSelection.Source; }
    set Source(v) { this.RowSelection.Source = v; }
    get Count() { return this._columns.size * this.RowSelection.Count; }
    get _columnIndexes() { return Array.from(this._columns, c => this._grid.Columns.IndexOf(c)).filter(i => i >= 0); }
    get SingleSelect() { return this.RowSelection.SingleSelect; }
    set SingleSelect(v) { this._update(() => { this.RowSelection.SingleSelect = v; if (v && this._columns.size > 1)
        this._columns = new Set([this._primary]); }); }
    get SelectedIndex() { return new CellIndex(this._primary ? this._grid.Columns.IndexOf(this._primary) : -1, this.RowSelection.SelectedIndex); }
    set SelectedIndex(v) { this.SetSelectedRange(v, 1, 1); }
    get AnchorIndex() { return new CellIndex(this._grid.Columns.IndexOf(this._anchorColumn), this.RowSelection.AnchorIndex); }
    get RangeAnchorIndex() { return new CellIndex(this._grid.Columns.IndexOf(this._rangeColumn), this.RowSelection.RangeAnchorIndex); }
    IsSelected(column, row) { if (column instanceof CellIndex) {
        row = column.RowIndex;
        column = column.ColumnIndex;
    } return column >= 0 && column < this._grid.Columns.Count && this._columns.has(this._grid.Columns.Get(column)) && this.RowSelection.IsSelected(row); }
    _change() { this._changed = true; if (!this._batch) {
        this._changed = false;
        this.SelectionChanged.Emit(this, new TreeDataGridCellSelectionChangedEventArgs());
        this.StateChanged.Emit(this);
    } }
    _update(fn) { if (this._disposed)
        throw new Error('Selection disposed.'); this._batch++; this.RowSelection.BeginBatchUpdate(); try {
        fn();
        this._changed = true;
    }
    finally {
        this.RowSelection.EndBatchUpdate();
        if (!--this._batch && this._changed)
            this._change();
    } }
    Clear() { this._update(() => { this._columns.clear(); this._primary = this._anchorColumn = this._rangeColumn = null; this.RowSelection.Clear(); }); }
    SetSelectedRange(start, columnCount, rowCount) {
        const s = this._grid, row = s.Rows.ModelIndexToRowIndex(start.RowIndex);
        if (!columnCount || !rowCount || start.ColumnIndex < 0 || start.ColumnIndex >= s.Columns.Count || row < 0) {
            this.Clear();
            return;
        }
        const end = (a, n, size) => clamp(a + n - Math.sign(n), 0, size - 1);
        const ec = end(start.ColumnIndex, this.SingleSelect ? 1 : columnCount, s.Columns.Count), er = end(row, this.SingleSelect ? 1 : rowCount, s.Rows.Count);
        this._update(() => { this._columns.clear(); this._primary = s.Columns.Get(start.ColumnIndex); this._columns.add(this._primary); for (let i = Math.min(start.ColumnIndex, ec); i <= Math.max(start.ColumnIndex, ec); i++)
            this._columns.add(s.Columns.Get(i)); this.RowSelection.SelectedIndex = start.RowIndex; for (let i = Math.min(row, er); i <= Math.max(row, er); i++)
            this.RowSelection.Select(s.Rows.RowIndexToModelIndex(i)); this._anchorColumn = this._primary; this._rangeColumn = s.Columns.Get(ec); this.RowSelection.AnchorIndex = start.RowIndex; this.RowSelection.RangeAnchorIndex = s.Rows.RowIndexToModelIndex(er); });
    }
    SelectAll() { if (this._grid.Rows.Count)
        this.SetSelectedRange(new CellIndex(0, this._grid.Rows.RowIndexToModelIndex(0)), this._grid.Columns.Count, this._grid.Rows.Count); }
    Dispose() { if (this._disposed)
        return; this.Clear(); disposeAll(this._off); this.RowSelection.Dispose(); this._disposed = true; this.SelectionChanged.Clear(); this.StateChanged.Clear(); }
}

Object.assign(exports,{TreeSelectionModelSelectionChangedEventArgs,TreeSelectionModelIndexesChangedEventArgs,TreeSelectionModelSourceResetEventArgs,TreeDataGridCellSelectionChangedEventArgs,TreeSelectionModelBase,TreeDataGridRowSelectionModel,TreeDataGridCellSelectionModel});
},
"packages/core/src/sources.js":function(exports,require){
const { Signal, NotifyingBase, disposeAll }=require("packages/core/src/events.js");
const { IndexPath, RowDropPosition, RowMoveEffects, ListSortDirection }=require("packages/core/src/primitives.js");
const { ObservableList, listAt, listCount, listArray }=require("packages/core/src/collections.js");
const { ColumnList, HierarchicalExpanderColumn }=require("packages/core/src/columns.js");
const { AnonymousSortableRows, HierarchicalRows, RowEventArgs }=require("packages/core/src/rows.js");
const { TreeDataGridRowSelectionModel, TreeDataGridCellSelectionModel }=require("packages/core/src/selection.js");

function asItems(items) { if (items == null)
    return []; if (Array.isArray(items) || items instanceof ObservableList)
    return items; if (items[Symbol.iterator])
    return Array.from(items); return [items]; }
class SourceBase extends NotifyingBase {
    constructor(items) {
        super();
        this.Columns = new ColumnList();
        this.Sorted = new Signal();
        this.Changed = new Signal();
        this.CollectionChanged = new Signal();
        this.ItemChanged = new Signal();
        this._items = asItems(items);
        this._comparison = null;
        this._filter = null;
        this._rows = null;
        this._selection = undefined;
        this._ownsSelection = false;
        this._off = [];
        this._columnOff = [];
        this._batch = 0;
        this._dirty = false;
        this._disposed = false;
        this._watchRoot();
        this._off.push(this.Columns.CollectionChanged.Subscribe((_, e) => this._columnsChanged(e)));
    }
    get Items() { return this._items; }
    set Items(value) { value = asItems(value); if (this._items === value)
        return; const old = this._items; this._rootOff?.(); this._items = value; this._watchRoot(); if (this._selection)
        this._selection.Source = value; this._rows?.Refresh(); this.RaisePropertyChanged('Items', old, value); this.Changed.Emit(this, { Kind: 'Items' }); }
    get Rows() { if (this._disposed)
        throw new Error('Source is disposed.'); return this._rows ??= this._createRows(); }
    get Selection() { if (this._selection === undefined) {
        this._selection = new TreeDataGridRowSelectionModel(this);
        this._ownsSelection = true;
    } return this._selection; }
    set Selection(value) { if (value != null && value.Source !== this.Items)
        throw new Error('Selection source must be set to Items.'); if (this._selection === value)
        return; if (this._ownsSelection)
        this._selection?.Dispose(); this._ownsSelection = false; const old = this._selection; this._selection = value; this.RaisePropertyChanged('Selection', old, value); this.Changed.Emit(this, { Kind: 'Selection' }); }
    get RowSelection() { const s = this.Selection; return s instanceof TreeDataGridRowSelectionModel ? s : null; }
    get IsSorted() { return this._comparison !== null; }
    get IsHierarchical() { return false; }
    _watchRoot() { this._rootOff = this._items?.CollectionChanged?.Subscribe((_, e) => { this.CollectionChanged.Emit(this, { ParentIndex: IndexPath.Unselected, Change: e }); this._rows?._changed(e); if (!this.IsHierarchical)
        this._invalidate('Items'); }); }
    _columnsChanged() { disposeAll(this._columnOff); for (const c of this.Columns)
        this._columnOff.push(c.PropertyChanged.Subscribe((_, e) => { this.Changed.Emit(this, { Kind: 'Column', Column: c, PropertyName: e.PropertyName }); })); this.RaisePropertyChanged('Columns'); this.Changed.Emit(this, { Kind: 'Columns' }); }
    _invalidate(kind = 'Rows') { if (this._batch) {
        this._dirty = true;
        return;
    } this.Changed.Emit(this, { Kind: kind }); }
    Accept(visitor) { return visitor.Visit(this); }
    SortBy(column, direction = ListSortDirection.Ascending) { if (typeof column === 'number')
        column = this.Columns.Get(column); if (!this.Columns.Contains(column))
        return false; const compare = column.GetComparison(direction); if (!compare)
        return false; this._comparison = compare; this._rows?.Sort(compare); for (const c of this.Columns)
        c.SortDirection = c === column ? direction : null; this.Sorted.Emit(this); this._invalidate('Sort'); return true; }
    ClearSort() { if (!this.IsSorted)
        return; this._comparison = null; this._rows?.Sort(null); for (const c of this.Columns)
        c.SortDirection = null; this.Sorted.Emit(this); this._invalidate('Sort'); }
    /** Web extension: filter the displayed projection without rewriting the source Items. */
    SetFilter(predicate = null) { if (predicate != null && typeof predicate !== 'function')
        throw new TypeError('Filter must be a function.'); this._filter = predicate; this._rows?.Sort(); this._invalidate('Filter'); }
    Sort(comparison) { this._comparison = comparison; this._rows?.Sort(comparison); this.Sorted.Emit(this); this._invalidate('Sort'); }
    GetModelChildren() { return []; }
    TryGetModelAt(path, out = null) { path = IndexPath.From(path); let items = this.Items, model = null; for (let d = 0; d < path.Count; d++) {
        if (path[d] >= listCount(items)) {
            model = null;
            break;
        }
        model = listAt(items, path[d]);
        if (d < path.Count - 1)
            items = this.GetModelChildren(model) ?? [];
    } if (out) {
        out.Value = model;
        return model != null;
    } return model; }
    GetModelAt(path) { const model = this.TryGetModelAt(path); if (model == null)
        throw new RangeError('Model index not found.'); return model; }
    GetParentItems(path) { path = IndexPath.From(path); return path.Count ? this.GetModelChildren(this.GetModelAt(path)) : this.Items; }
    FindModelIndex(model) { const stack = [{ items: this.Items, path: IndexPath.Unselected }]; const visited = new Set(); while (stack.length) {
        const { items, path } = stack.pop();
        if (visited.has(items))
            continue;
        visited.add(items);
        for (let i = listCount(items) - 1; i >= 0; i--) {
            const m = listAt(items, i), p = path.Append(i);
            if (m === model)
                return p;
            if (this.IsHierarchical) {
                const children = this.GetModelChildren(m);
                if (children && !children.then)
                    stack.push({ items: children, path: p });
            }
        }
    } return IndexPath.Unselected; }
    NotifyItemChanged(model, propertyName = null) { this.ItemChanged.Emit(this, { Model: model, PropertyName: propertyName }); if (this.IsSorted || this._filter)
        this._rows?.Sort(); this._invalidate('Value'); }
    Refresh() { this._rows?.Refresh(); this._invalidate('Refresh'); }
    BeginUpdate() { this._batch++; }
    EndUpdate() { if (!this._batch)
        throw new Error('Unbalanced EndUpdate.'); if (!--this._batch && this._dirty) {
        this._dirty = false;
        if (this.IsHierarchical)
            this._rows?._rebuild();
        this.Changed.Emit(this, { Kind: 'Rows' });
    } }
    Batch(action) { this.BeginUpdate(); try {
        return action(this);
    }
    finally {
        this.EndUpdate();
    } }
    MoveRows(source, indexes, targetIndex, position, effects = RowMoveEffects.Move) { moveRows(this, source, indexes, targetIndex, position, effects); }
    Dispose() { if (this._disposed)
        return; this._rootOff?.(); disposeAll(this._columnOff); disposeAll(this._off); this._rows?.Dispose(); if (this._ownsSelection)
        this._selection?.Dispose(); this._disposed = true; for (const k of ['Sorted', 'Changed', 'CollectionChanged', 'ItemChanged', 'PropertyChanged'])
        this[k].Clear(); }
}
class FlatTreeDataGridSource extends SourceBase {
    _createRows() { return new AnonymousSortableRows(this); }
}
class HierarchicalTreeDataGridSource extends SourceBase {
    constructor(items) { super(items); this.Columns.Validate = items => { if (items.filter(c => c instanceof HierarchicalExpanderColumn).length > 1)
        throw new Error('Only one expander column is allowed.'); }; this.RowExpanding = new Signal(); this.RowExpanded = new Signal(); this.RowCollapsing = new Signal(); this.RowCollapsed = new Signal(); this.RowLoading = new Signal(); this.RowLoadFailed = new Signal(); this.ChildrenLoader = null; this._loadedChildren = new WeakMap(); }
    get IsHierarchical() { return true; }
    get ExpanderColumn() { return Array.from(this.Columns).find(c => c instanceof HierarchicalExpanderColumn) ?? null; }
    _createRows() { if (!this.ExpanderColumn)
        throw new Error('No expander column defined.'); return new HierarchicalRows(this); }
    _columnsChanged(e) { const previous = this._lastExpander; super._columnsChanged(e); this._lastExpander = this.ExpanderColumn; if (this._rows && previous !== this._lastExpander)
        this._rows.Refresh(); }
    GetModelChildren(model) { return this._loadedChildren.get(model) ?? this.ExpanderColumn?.GetChildModels(model) ?? []; }
    _setExpandedRow(row, value, write = true) {
        if (!row?._alive || row._expanded === value)
            return;
        const e = new RowEventArgs(row);
        (value ? this.RowExpanding : this.RowCollapsing).Emit(this, e);
        if (e.Cancel)
            return;
        row._expanded = value;
        if (write)
            this.ExpanderColumn?.SetModelIsExpanded(row);
        row.RaisePropertyChanged('IsExpanded');
        row.Owner._request();
        (value ? this.RowExpanded : this.RowCollapsed).Emit(this, e);
    }
    Expand(index) { const row = this.Rows.GetRow(index); if (!row)
        return false; if (this.ChildrenLoader && row._loadedModels === undefined && row.HasChildren)
        return this.ExpandAsync(index); this._setExpandedRow(row, true); return true; }
    Collapse(index) { const row = this.Rows.GetRow(index, false); if (!row)
        return false; row._wantExpand = false; row._abort?.abort(); row.IsLoading = false; this._setExpandedRow(row, false); return true; }
    ExpandAll() { this.ExpandCollapseRecursive(() => true); }
    CollapseAll() { this.ExpandCollapseRecursive(() => false); }
    ExpandCollapseRecursive(rowOrPredicate, maybePredicate) { const row = typeof rowOrPredicate === 'function' ? null : rowOrPredicate, predicate = maybePredicate ?? rowOrPredicate; if (typeof predicate !== 'function')
        throw new TypeError('Predicate required.'); this.Batch(() => { const stack = row ? [row] : this.Rows._roots.slice(); while (stack.length) {
        const r = stack.pop(), expanded = !!predicate(r.Model);
        this._setExpandedRow(r, expanded);
        if (r.HasChildren) {
            const children = r._children ?? (expanded ? this.Rows._ensureChildren(r) : []);
            for (const c of children)
                stack.push(c);
        }
    } }); }
    async ExpandAsync(index, loader = this.ChildrenLoader) {
        const row = this.Rows.GetRow(index);
        if (!row)
            return false;
        if (row._loadedModels !== undefined || !loader) {
            this._setExpandedRow(row, true);
            return true;
        }
        if (row.IsLoading)
            return row._loadPromise;
        const abort = new AbortController();
        row._abort = abort;
        row.IsLoading = true;
        row._wantExpand = true;
        row.LoadError = null;
        this.RowLoading.Emit(this, new RowEventArgs(row));
        this._invalidate('Value');
        row._loadPromise = (async () => { try {
            const children = await loader(row.Model, abort.signal);
            if (abort.signal.aborted || !row._alive || this._disposed)
                return false;
            row._loadedModels = asItems(children);
            this._loadedChildren.set(row.Model, row._loadedModels);
            this.Rows._replaceChildren(row, row._loadedModels);
            if (row._wantExpand)
                this._setExpandedRow(row, true);
            return true;
        }
        catch (error) {
            if (!abort.signal.aborted) {
                row.LoadError = error;
                this.RowLoadFailed.Emit(this, { ...new RowEventArgs(row), Error: error });
            }
            return false;
        }
        finally {
            if (row._abort === abort) {
                row.IsLoading = false;
                row._abort = null;
                this._invalidate('Value');
            }
        } })();
        return row._loadPromise;
    }
    Dispose() { if (this._disposed)
        return; super.Dispose(); for (const name of ['RowExpanding', 'RowExpanded', 'RowCollapsing', 'RowCollapsed', 'RowLoading', 'RowLoadFailed'])
        this[name].Clear(); }
}
function editable(list) { if (!(Array.isArray(list) || list instanceof ObservableList) || Object.isFrozen(list))
    throw new Error('Items must be a mutable array or ObservableList.'); }
function removeAt(list, i) { list instanceof ObservableList ? list.RemoveAt(i) : list.splice(i, 1); }
function insertAt(list, i, item) { list instanceof ObservableList ? list.Insert(i, item) : list.splice(i, 0, item); }
function rowSelection(source) { const s = source._selection; return s instanceof TreeDataGridCellSelectionModel ? s.RowSelection : s; }
function findCollectionPath(source, list) { if (source.Items === list)
    return IndexPath.Unselected; const stack = [{ items: source.Items, path: IndexPath.Unselected }], seen = new Set(); while (stack.length) {
    const { items, path } = stack.pop();
    if (seen.has(items))
        continue;
    seen.add(items);
    for (let i = 0; i < listCount(items); i++) {
        const children = source.GetModelChildren(listAt(items, i)), p = path.Append(i);
        if (children === list)
            return p;
        if (children && !children.then)
            stack.push({ items: children, path: p });
    }
} return null; }
function moveRows(dest, source, indexes, targetIndex, position, effects) {
    if (effects !== RowMoveEffects.Move)
        throw new Error('Only Move is supported.');
    if (dest.IsSorted || source.IsSorted || dest._filter || source._filter)
        throw new Error('Row movement requires unsorted, unfiltered sources.');
    if (!Object.values(RowDropPosition).includes(position))
        throw new RangeError('Invalid drop position.');
    if (position === RowDropPosition.None)
        return;
    if (!dest.IsHierarchical && position === RowDropPosition.Inside)
        throw new Error('A flat grid cannot receive an Inside drop.');
    let paths = Array.from(indexes, IndexPath.From).sort((a, b) => a.CompareTo(b));
    if (new Set(paths.map(p => p.Key)).size !== paths.length)
        throw new Error('Duplicate source index.');
    if (!paths.length)
        return;
    targetIndex = IndexPath.From(targetIndex);
    dest.GetModelAt(targetIndex);
    paths = paths.filter((p, i) => !paths.slice(0, i).some(parent => parent.IsAncestorOf(p)));
    if (source === dest && paths.some(p => p.IsAncestorOf(targetIndex) || (position === 'Inside' && p.Equals(targetIndex))))
        throw new Error('A row cannot move into itself or its descendants.');
    const descriptors = paths.map(path => { source.GetModelAt(path); const list = source.GetParentItems(path.Parent); editable(list); return { path, list, index: path[path.Count - 1], model: source.GetModelAt(path) }; });
    const targetList = dest.GetParentItems(position === 'Inside' ? targetIndex : targetIndex.Parent);
    editable(targetList);
    let ti = position === 'Inside' ? listCount(targetList) : targetIndex[targetIndex.Count - 1] + (position === 'After' ? 1 : 0);
    // Per-occurrence tokens retain selection even when a collection contains the same object twice.
    const tokens = new Map();
    const tokenList = list => { if (!tokens.has(list))
        tokens.set(list, Array.from({ length: listCount(list) }, () => ({}))); return tokens.get(list); };
    const selections = [];
    for (const s of new Set([source, dest])) {
        const selection = rowSelection(s);
        if (!selection)
            continue;
        const entries = selection.SelectedIndexes.map(p => { const list = s.GetParentItems(p.Parent); return { list, token: tokenList(list)[p[p.Count - 1]], primary: p.Equals(selection.SelectedIndex), anchor: p.Equals(selection.AnchorIndex), range: p.Equals(selection.RangeAnchorIndex) }; });
        selections.push({ source: s, selection, entries });
    }
    for (const d of descriptors)
        d.token = tokenList(d.list)[d.index];
    tokenList(targetList);
    source.BeginUpdate();
    if (dest !== source)
        dest.BeginUpdate();
    try {
        for (const d of descriptors.slice().reverse()) {
            removeAt(d.list, d.index);
            tokenList(d.list).splice(d.index, 1);
            if (d.list === targetList && d.index < ti)
                ti--;
        }
        for (const d of descriptors) {
            insertAt(targetList, ti, d.model);
            tokenList(targetList).splice(ti, 0, d.token);
            ti++;
        }
        if (!(source.Items instanceof ObservableList) || descriptors.some(d => !(d.list instanceof ObservableList)))
            source.Refresh();
        if (dest !== source && !(targetList instanceof ObservableList))
            dest.Refresh();
        for (const { source: s, selection, entries } of selections) {
            selection.BeginBatchUpdate();
            try {
                selection.Clear();
                for (const e of entries) {
                    let foundList = null, index = -1;
                    for (const [l, t] of tokens) {
                        const i = t.indexOf(e.token);
                        if (i >= 0) {
                            foundList = l;
                            index = i;
                            break;
                        }
                    }
                    if (!foundList)
                        continue;
                    const parent = findCollectionPath(s, foundList);
                    if (parent == null)
                        continue;
                    const path = parent.Append(index);
                    selection.Select(path);
                    if (e.anchor)
                        selection.AnchorIndex = path;
                    if (e.range)
                        selection.RangeAnchorIndex = path;
                }
            }
            finally {
                selection.EndBatchUpdate();
            }
        }
    }
    finally {
        source.EndUpdate();
        if (dest !== source)
            dest.EndUpdate();
    }
}

Object.assign(exports,{FlatTreeDataGridSource,HierarchicalTreeDataGridSource});
},
"packages/web/index.js":function(exports,require){
Object.assign(exports,require("packages/web/src/presentation.js"));
Object.assign(exports,require("packages/web/src/tree-data-grid.js"));
const { registerTreeDataGrid }=require("packages/web/src/tree-data-grid.js");

registerTreeDataGrid();

Object.assign(exports,{});
},
"packages/web/src/presentation.js":function(exports,require){
const { Signal, ColumnLayout, GridLength, ValueColumn, CheckBoxColumn, TemplateColumn, HierarchicalExpanderColumn, disposeAll }=require("packages/core/index.js");

class PresentationRegistry extends Map {
    Add(key, value) { if (this.has(key))
        throw new Error(`Presentation '${key}' already exists.`); this.set(key, value); }
    Set(key, value) { this.set(key, value); }
}
class TreeDataGridPresentationOptions {
    constructor() { this.Columns = new PresentationRegistry(); }
    Register(key, presentation) { this.Columns.set(key, presentation); return this; }
}
class ValueCell {
    constructor(column, row) { this.Column = column; this.Row = row; this.Model = row.Model; this.IsEditing = false; this.PropertyChanged = new Signal(); }
    get Value() { return this.Column.GetValue(this.Model); }
    set Value(value) { this.Column.SetValue(this.Model, value); this.PropertyChanged.Emit(this, { PropertyName: 'Value' }); }
    get CanEdit() { return typeof this.Column.Setter === 'function'; }
    BeginEdit() { if (!this.CanEdit)
        return false; this._original = this.Value; this.EditValue = this._original; this.IsEditing = true; return true; }
    CancelEdit() { this.IsEditing = false; this.EditValue = this._original; }
    EndEdit() { if (!this.IsEditing)
        return; this.Value = this.EditValue; this.IsEditing = false; }
    Dispose() { this.PropertyChanged.Clear(); }
}
class TextCell extends ValueCell {
}
class CheckBoxCell extends ValueCell {
    get IsThreeState() { return this.Column.IsThreeState; }
}
class TemplateCell extends ValueCell {
    constructor(column, row, template) { super(column, row); this.Template = template; }
    get CanEdit() { return !!this.Template?.edit || super.CanEdit; }
}
class ExpanderCell {
    constructor(inner, row) { this.Inner = inner; this.Row = row; this.Model = row.Model; }
    get IsExpanded() { return this.Row.IsExpanded; }
    set IsExpanded(v) { this.Row.IsExpanded = v; }
    get ShowExpander() { return this.Row.ShowExpander; }
    get Indent() { return this.Row.Indent; }
    get Value() { return this.Inner.Value; }
    set Value(v) { this.Inner.Value = v; }
    get CanEdit() { return this.Inner.CanEdit; }
    Dispose() { this.Inner.Dispose(); }
}
class CellColumnOptions {
    constructor(options = {}) { Object.assign(this, { MinWidth: 30, MaxWidth: Infinity }, options); }
}
class CellColumnBase {
    constructor(column, options = {}) { this.CoreColumn = column; this.Options = new CellColumnOptions(options); this.ActualWidth = 0; this.NeedsNaturalWidth = true; }
    get Header() { return this.CoreColumn.Header; }
    get Width() { return this.CoreColumn.Width; }
    set Width(v) { this.CoreColumn.Width = GridLength.Parse(v); }
    CreateCell(row) { return new ValueCell(this.CoreColumn, row); }
    Dispose() { }
}
class TemplateCellColumn extends CellColumnBase {
    constructor(column, template, editTemplate = null, options = {}) { super(column, options); this.Template = typeof template === 'function' ? { create: template } : template; if (editTemplate)
        this.Template = { ...this.Template, edit: editTemplate }; }
    CreateCell(row) { return new TemplateCell(this.CoreColumn, row, this.Template); }
}
class BuiltInCellColumn extends CellColumnBase {
    CreateCell(row) { const c = this.CoreColumn; return c instanceof CheckBoxColumn ? new CheckBoxCell(c, row) : new TextCell(c, row); }
}
class ExpanderCellColumn extends CellColumnBase {
    constructor(core, inner) { super(core); this.Inner = inner; }
    CreateCell(row) { return new ExpanderCell(this.Inner.CreateCell(row), row); }
    Dispose() { this.Inner.Dispose(); }
}
function createColumn(column, options) {
    if (column instanceof HierarchicalExpanderColumn)
        return new ExpanderCellColumn(column, createColumn(column.Inner, options));
    const registration = options?.Columns?.get(column.PresentationKey);
    if (registration) {
        const custom = typeof registration === 'function' ? registration(column) : registration;
        if (custom?.CreateCell)
            return custom;
        if (custom?.create)
            return new TemplateCellColumn(column, custom);
        throw new Error(`Invalid presentation '${column.PresentationKey}'.`);
    }
    if (column instanceof TemplateColumn)
        throw new Error(`Register presentation '${column.PresentationKey}' before assigning Model.`);
    return new BuiltInCellColumn(column);
}
class TreeDataGridPresentation {
    static Create(model, options = new TreeDataGridPresentationOptions()) { return new TreeDataGridPresentation(model, options); }
    constructor(model, options) { this.Model = model; this.Options = options; this.Layout = new ColumnLayout(); this.Columns = []; this.Changed = new Signal(); this.Sorted = new Signal(); this._off = []; this._columnMap = new Map(); this._syncColumns(); }
    get Rows() { return this.Model.Rows; }
    _syncColumns() {
        const keep = new Set(this.Model.Columns);
        for (const [c, v] of this._columnMap)
            if (!keep.has(c)) {
                v.Dispose();
                this._columnMap.delete(c);
                this.Layout.Measured.delete(c);
            }
        this.Columns = Array.from(this.Model.Columns, c => { let view = this._columnMap.get(c); if (!view) {
            view = createColumn(c, this.Options);
            this._columnMap.set(c, view);
        } return view; });
    }
    Resume() { if (this._disposed)
        throw new Error('Presentation disposed.'); if (this._off.length)
        return; this._syncColumns(); this._off.push(this.Model.Changed.Subscribe((_, e) => { if (e.Kind === 'Columns')
        this._syncColumns(); if (e.Kind === 'Column' && e.PropertyName === 'PresentationKey') {
        this._columnMap.get(e.Column)?.Dispose();
        this._columnMap.delete(e.Column);
        this._syncColumns();
    } this.Changed.Emit(this, e); }), this.Model.Sorted.Subscribe(() => this.Sorted.Emit(this))); }
    Suspend() { disposeAll(this._off); }
    Dispose() { if (this._disposed)
        return; this.Suspend(); for (const c of this._columnMap.values())
        c.Dispose(); this._columnMap.clear(); this.Columns = []; this.Changed.Clear(); this.Sorted.Clear(); this._disposed = true; }
}
class TreeDataGridElementFactory {
    constructor() { this._pools = new Map(); this.Created = 0; this.Reused = 0; this.MaxPoolSize = 128; }
    GetElement(key, create) { const pool = this._pools.get(key); if (pool?.length) {
        this.Reused++;
        return pool.pop();
    } this.Created++; return create(); }
    RecycleElement(key, element) { let pool = this._pools.get(key); if (!pool)
        this._pools.set(key, pool = []); if (pool.length < this.MaxPoolSize)
        pool.push(element); }
    Clear() { this._pools.clear(); }
}
const numberFormats = new Map();
function formatValue(column, value, model) {
    const o = column.Options ?? {};
    if (o.Formatter)
        return String(o.Formatter(value, model) ?? '');
    if (value == null)
        return '';
    if (o.StringFormat) {
        const fmt = o.StringFormat;
        if (typeof fmt === 'function')
            return String(fmt(value));
        if (typeof value === 'number' && /[nN]\d/.test(fmt)) {
            const digits = Number(fmt.match(/[nN](\d)/)[1]);
            const key = (o.Culture ?? '') + ':' + digits;
            let formatter = numberFormats.get(key);
            if (!formatter) {
                formatter = new Intl.NumberFormat(o.Culture ?? undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
                numberFormats.set(key, formatter);
            }
            return formatter.format(value);
        }
        return String(fmt).replace(/\{0(?::[^}]+)?\}/g, String(value));
    }
    return value instanceof Date ? value.toLocaleDateString(o.Culture ?? undefined) : String(value);
}
function parseValue(column, text, old) { const o = column.Options ?? {}; if (o.ValueParser)
    return o.ValueParser(text, old); if (typeof old === 'number') {
    const n = Number(text);
    if (!text.trim() || !Number.isFinite(n))
        throw new Error('Enter a valid number.');
    return n;
} if (typeof old === 'boolean') {
    if (!/^(true|false|0|1)$/i.test(text))
        throw new Error('Enter true or false.');
    return /^(true|1)$/i.test(text);
} if (old instanceof Date) {
    const d = new Date(text);
    if (Number.isNaN(+d))
        throw new Error('Enter a valid date.');
    return d;
} return text; }

Object.assign(exports,{PresentationRegistry,TreeDataGridPresentationOptions,ValueCell,TextCell,CheckBoxCell,TemplateCell,ExpanderCell,CellColumnOptions,CellColumnBase,TemplateCellColumn,TreeDataGridPresentation,TreeDataGridElementFactory,formatValue,parseValue});
},
"packages/web/src/tree-data-grid.js":function(exports,require){
const { Signal, IndexPath, CellIndex, RowHeightIndex, GridLength, ListSortDirection, TreeDataGridSelectionMode, TreeDataGridRowSelectionModel, TreeDataGridCellSelectionModel, FlatTreeDataGridSource, HierarchicalTreeDataGridSource, HierarchicalExpanderColumn, CheckBoxColumn, TemplateColumn, ColumnList, observeSelector, disposeAll, clamp }=require("packages/core/index.js");
const { TreeDataGridPresentation, TreeDataGridPresentationOptions, TreeDataGridElementFactory, ExpanderCell, TemplateCell, formatValue, parseValue }=require("packages/web/src/presentation.js");
const { gridStyles }=require("packages/web/src/styles.js");

const MAX_EXTENT = 8000000;
let gridId = 0;
const drags = new Map();
const eventNames = ['CellClearing', 'CellPrepared', 'CellValueChanged', 'RowClearing', 'RowPrepared', 'RowDragStarted', 'RowDragOver', 'RowDrop', 'SelectionChanging', 'SelectionChanged', 'CellEditStarting', 'CellEditEnding', 'CellEditEnded', 'Rendered', 'Error', 'RowDoubleTapped'];
const eventKeys = new Map(eventNames.map(name => [name, name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()]));
const kebab = name => eventKeys.get(name) ?? name;
function dom(tag, cls, text) { const node = document.createElement(tag); if (cls)
    node.className = cls; if (text != null)
    node.textContent = text; return node; }
function innerColumn(column) { return column instanceof HierarchicalExpanderColumn ? column.Inner : column; }
const triangle = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** Reusable, dependency-free custom element. Core rows are consumed directly, never adapted. */
class TreeDataGrid extends HTMLElement {
    constructor() {
        super();
        this._id = ++gridId;
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `<style>${gridStyles}</style><div class="root" role="treegrid" tabindex="0" aria-label="Data grid"><div class="header-clip"><div class="header-row" role="row" aria-rowindex="1"></div></div><div class="viewport"><div class="extent" role="rowgroup"></div></div><div class="empty" hidden><strong>No rows to display</strong><span>Change the filter or add an item.</span></div><div class="live" role="status" aria-live="polite"></div></div>`;
        const q = s => this.shadowRoot.querySelector(s);
        this._root = q('.root');
        this._headerClip = q('.header-clip');
        this._header = q('.header-row');
        this._viewport = q('.viewport');
        this._extent = q('.extent');
        this._empty = q('.empty');
        this._live = q('.live');
        for (const name of eventNames)
            this[name] = new Signal();
        this._model = null;
        this._source = null;
        this._options = new TreeDataGridPresentationOptions();
        this._presentation = null;
        this._presentationOff = [];
        this._off = [];
        this._selectionOff = [];
        this._realized = new Map();
        this._heightCache = new Map();
        this._heights = new RowHeightIndex();
        this._elementFactory = new TreeDataGridElementFactory();
        this._frame = 0;
        this._raf = 0;
        this._rowHeight = null;
        this._estimate = 36;
        this._overscan = 160;
        this._frozen = 0;
        this._showHeaders = true;
        this._canResize = false;
        this._canSort = true;
        this._canReorder = true;
        this._autoDrag = false;
        this._gridLines = false;
        this._geometryDirty = true;
        this._layoutDirty = true;
        this._dataDirty = true;
        this._headerDirty = true;
        this._valueDirty = false;
        this._selectionDirty = true;
        this._active = { row: 0, column: 0 };
        this._logicalTop = 0;
        this._typeBuffer = '';
        this._undo = [];
        this._redo = [];
        this._selectionMode = undefined;
        this._disposed = false;
        this._itemsSource = null;
        this.ColumnDefinitions = new ColumnList();
        this.ColumnDefinitions.CollectionChanged.Subscribe(() => this._declarative());
        this.Stats = { Rows: 0, RealizedRows: 0, RealizedCells: 0, FrameMilliseconds: 0, MeasuredRows: 0, TotalHeight: 0, CreatedElements: 0, ReusedElements: 0 };
        this._viewport.addEventListener('scroll', () => { this._headerClip.scrollLeft = this._viewport.scrollLeft; this._schedule(); }, { passive: true });
        this._viewport.addEventListener('wheel', e => { if (this._heights.Total > MAX_EXTENT && e.deltaY && !e.ctrlKey) {
            e.preventDefault();
            const d = e.deltaY * (e.deltaMode === 1 ? this._estimate : e.deltaMode === 2 ? this._viewport.clientHeight : 1);
            this._setLogicalScroll(this._logicalScroll() + d);
        } }, { passive: false });
        this._root.addEventListener('click', e => this._click(e));
        this._root.addEventListener('dblclick', e => this._doubleClick(e));
        this._root.addEventListener('keydown', e => this._keyDown(e));
        this._root.addEventListener('pointerdown', e => this._pointerDown(e));
        this._root.addEventListener('contextmenu', e => this._contextMenu(e));
        this._root.addEventListener('dragstart', e => this._dragStart(e));
        this._root.addEventListener('dragover', e => this._dragOver(e));
        this._root.addEventListener('drop', e => this._drop(e));
        this._root.addEventListener('dragend', () => this._dragEnd());
        this._root.addEventListener('dragleave', e => { if (!this._root.contains(e.relatedTarget))
            this._clearDrop(); });
        this._root.addEventListener('copy', e => { if (this._editing)
            return; const text = this.GetSelectionText(); if (text) {
            e.clipboardData.setData('text/plain', text);
            e.preventDefault();
        } });
        this._root.addEventListener('paste', e => { if (this._editing)
            return; e.preventDefault(); try {
            this.Paste(e.clipboardData.getData('text/plain'));
        }
        catch (error) {
            this._error(error);
        } });
        this._root.addEventListener('focusout', () => { queueMicrotask(() => { if (this._editing && !this._root.contains(this.shadowRoot.activeElement))
            this.CommitEdit(); }); });
        this._resizeObserver = new ResizeObserver(() => { const w = this._viewport.clientWidth; if (Math.abs(w - (this._lastWidth ?? 0)) > .5) {
            this._lastWidth = w;
            this._layoutDirty = true;
            this._invalidateHeights();
        } this._schedule(); });
        this._rowObserver = new ResizeObserver(entries => this._measureRows(entries));
    }
    static get observedAttributes() { return ['aria-label', 'row-height', 'frozen-columns', 'show-column-headers']; }
    attributeChangedCallback(name, old, value) { if (old === value)
        return; if (name === 'aria-label')
        this._root?.setAttribute('aria-label', value ?? 'Data grid'); if (name === 'row-height')
        this.RowHeight = value === 'auto' || value == null ? null : Number(value); if (name === 'frozen-columns')
        this.FrozenColumns = Number(value ?? 0); if (name === 'show-column-headers')
        this.ShowColumnHeaders = value !== 'false'; }
    connectedCallback() { if (this._disposed)
        return; this._resizeObserver.observe(this._viewport); this._ensurePresentation(); this._presentation?.Resume(); this._subscribeSelection(); this._geometryDirty = this._dataDirty = this._layoutDirty = this._headerDirty = true; this._schedule(); }
    disconnectedCallback() { this._resizeObserver.disconnect(); this._rowObserver.disconnect(); this._presentation?.Suspend(); disposeAll(this._selectionOff); cancelAnimationFrame(this._raf); this._raf = 0; this.CancelEdit(); this._clearRows(); this._dragEnd(); this._resizeAbort?.abort(); }
    get Model() { return this._model; }
    set Model(value) { if (this._model === value && !this._source)
        return; this._model = value; this._source = null; this._replacePresentation(); }
    get Source() { return this._source; }
    set Source(value) { if (this._source === value && !this._model)
        return; this._source = value; this._model = null; this._replacePresentation(); }
    get ActiveModel() { return this._model ?? this._source; }
    get PresentationOptions() { return this._options; }
    set PresentationOptions(value) { this._options = value ?? new TreeDataGridPresentationOptions(); this._replacePresentation(); }
    get Presentation() { return this._presentation; }
    get Rows() { return this.ActiveModel?.Rows ?? null; }
    get Columns() { return this._presentation?.Columns ?? []; }
    get RowSelection() { return this.Source?.RowSelection ?? null; }
    get ColumnSelection() { return this.Source?.Selection instanceof TreeDataGridCellSelectionModel ? this.Source.Selection : null; }
    get Scroll() { const g = this; return { get Offset() { return { X: g._viewport.scrollLeft, Y: g._logicalScroll() }; }, set Offset(v) { g._viewport.scrollLeft = v.X ?? 0; g._setLogicalScroll(v.Y ?? 0); }, get Extent() { return { Width: g._presentation?.Layout.Geometry.Total ?? 0, Height: g._heights.Total }; }, get Viewport() { return { Width: g._viewport.clientWidth, Height: g._viewport.clientHeight }; } }; }
    get RowsPresenter() { return this._extent; }
    get ColumnHeadersPresenter() { return this._header; }
    get ElementFactory() { return this._elementFactory; }
    set ElementFactory(v) { if (!v?.GetElement)
        throw new TypeError('Invalid element factory.'); this._clearRows(); this._elementFactory = v; this._dataDirty = true; this._schedule(); }
    get RowHeight() { return this._rowHeight; }
    set RowHeight(v) { v = v == null || v === 'Auto' || v === 'auto' ? null : Number(v); if (v != null && (!Number.isFinite(v) || v < 12))
        throw new RangeError('Row height must be at least 12 pixels.'); this._rowHeight = v; this._invalidateHeights(); this._schedule(); }
    get EstimatedRowHeight() { return this._estimate; }
    set EstimatedRowHeight(v) { if (!Number.isFinite(v) || v < 12)
        throw new RangeError('Invalid estimated height.'); this._estimate = v; this._invalidateHeights(); this._schedule(); }
    get Overscan() { return this._overscan; }
    set Overscan(v) { this._overscan = Math.max(0, Number(v) || 0); this._schedule(); }
    get FrozenColumns() { return this._frozen; }
    set FrozenColumns(v) { this._frozen = Math.max(0, Math.floor(v) || 0); this._layoutDirty = this._dataDirty = this._headerDirty = true; this._schedule(); }
    get ShowColumnHeaders() { return this._showHeaders; }
    set ShowColumnHeaders(v) { this._showHeaders = !!v; this._headerClip.hidden = !v; this._schedule(); }
    get CanUserResizeColumns() { return this._canResize; }
    set CanUserResizeColumns(v) { this._canResize = !!v; this._headerDirty = true; this._schedule(); }
    get CanUserSortColumns() { return this._canSort; }
    set CanUserSortColumns(v) { this._canSort = !!v; this._headerDirty = true; this._schedule(); }
    get CanUserReorderColumns() { return this._canReorder; }
    set CanUserReorderColumns(v) { this._canReorder = !!v; this._headerDirty = true; this._schedule(); }
    get AutoDragDropRows() { return this._autoDrag; }
    set AutoDragDropRows(v) { this._autoDrag = !!v; for (const r of this._realized.values())
        r.el.draggable = !!v; }
    get ShowGridLines() { return this._gridLines; }
    set ShowGridLines(v) { this._gridLines = !!v; this._root.classList.toggle('grid-lines', !!v); }
    get SelectionMode() { return this._selectionMode ?? TreeDataGridSelectionMode.Row; }
    set SelectionMode(value) { this._selectionMode = Number(value); this._applySelectionMode(); }
    get ItemsSource() { return this._itemsSource; }
    set ItemsSource(v) { this._itemsSource = v; this._declarative(); }
    _declarative() { if (!this._itemsSource || !this.ColumnDefinitions.Count)
        return; this._generated?.Dispose(); const type = Array.from(this.ColumnDefinitions).some(c => c instanceof HierarchicalExpanderColumn) ? HierarchicalTreeDataGridSource : FlatTreeDataGridSource; this._generated = new type(this._itemsSource); this._generated.Columns.AddRange(this.ColumnDefinitions); this.Source = this._generated; }
    _applySelectionMode() { const model = this.ActiveModel; if (!model || this._selectionMode === undefined)
        return; const cell = !!(this._selectionMode & TreeDataGridSelectionMode.Cell); if (cell !== (model.Selection instanceof TreeDataGridCellSelectionModel))
        model.Selection = cell ? new TreeDataGridCellSelectionModel(model) : new TreeDataGridRowSelectionModel(model); if (model.Selection)
        model.Selection.SingleSelect = !(this._selectionMode & TreeDataGridSelectionMode.Multiple); this._subscribeSelection(); }
    _replacePresentation() { this.CancelEdit(); this._clearRows(); disposeAll(this._presentationOff); disposeAll(this._selectionOff); this._presentation?.Dispose(); this._presentation = null; this._heightCache.clear(); this._undo = []; this._redo = []; this._active = { row: 0, column: 0 }; this._viewport.scrollTop = 0; this._viewport.scrollLeft = 0; this._ensurePresentation(); this._geometryDirty = this._layoutDirty = this._dataDirty = this._headerDirty = true; this._schedule(); }
    _ensurePresentation() { if (this._presentation || !this.ActiveModel)
        return; this._presentation = TreeDataGridPresentation.Create(this.ActiveModel, this._options); this._presentationOff.push(this._presentation.Changed.Subscribe((_, e) => this._modelChanged(e))); if (this.isConnected)
        this._presentation.Resume(); this._applySelectionMode(); this._subscribeSelection(); }
    _modelChanged(e) {
        if (this._editing && !['Value', 'Selection'].includes(e.Kind))
            this.CancelEdit();
        if (e.Kind === 'Selection') {
            this._subscribeSelection();
            this._selectionDirty = true;
        }
        else if (e.Kind === 'Column' && e.PropertyName === 'SortDirection')
            this._headerDirty = true;
        else if (e.Kind === 'Column' || e.Kind === 'Columns') {
            this._layoutDirty = this._headerDirty = this._dataDirty = true;
            this._invalidateHeights();
        }
        else if (e.Kind === 'Value') {
            this._valueDirty = true;
            for (const r of this._realized.values())
                this._heightCache.delete(r.row);
        }
        else {
            this._geometryDirty = this._dataDirty = this._headerDirty = true;
        }
        this._schedule();
    }
    _subscribeSelection() { disposeAll(this._selectionOff); if (!this.isConnected)
        return; const selection = this.ActiveModel?.Selection; if (selection?.StateChanged)
        this._selectionOff.push(selection.StateChanged.Subscribe((_, e) => { this._selectionDirty = true; this._fire('SelectionChanged', { Selection: selection, ...e }); this._live.textContent = `${selection.Count} ${selection instanceof TreeDataGridCellSelectionModel ? 'cells' : 'rows'} selected`; this._schedule(); })); this._root.setAttribute('aria-multiselectable', String(selection?.SingleSelect === false)); }
    _fire(name, args = {}, cancelable = false) { this[name]?.Emit(this, args); const event = new CustomEvent(kebab(name), { detail: args, bubbles: true, composed: true, cancelable }); if (!this.dispatchEvent(event))
        args.Cancel = true; return args; }
    _error(error) { this._live.textContent = error.message ?? String(error); this._fire('Error', { Error: error }); }
    _schedule() { if (!this._raf && this.isConnected && !this._disposed)
        this._raf = requestAnimationFrame(() => { this._raf = 0; try {
            this._render();
        }
        catch (error) {
            this._error(error);
        } }); }
    InvalidateVisual() { this._valueDirty = this._layoutDirty = this._headerDirty = true; this._schedule(); }
    _invalidateHeights() { this._heightCache.clear(); this._geometryDirty = true; }
    InvalidateRowHeights() { this._invalidateHeights(); this._schedule(); }
    _logicalScroll() { const physical = Math.min(MAX_EXTENT, this._heights.Total), h = this._viewport.clientHeight, max = Math.max(0, this._heights.Total - h), pmax = Math.max(0, physical - h); return pmax > 0 ? this._viewport.scrollTop * max / pmax : 0; }
    _setLogicalScroll(value) { const total = this._heights.Total, h = this._viewport.clientHeight, max = Math.max(0, total - h), pmax = Math.max(0, Math.min(MAX_EXTENT, total) - h); this._viewport.scrollTop = max ? clamp(value, 0, max) * pmax / max : 0; this._schedule(); }
    _resetGeometry() {
        const rows = this.Rows, n = rows?.Count ?? 0;
        const anchor = this._topAnchor;
        this._heights.Reset(n, this._rowHeight ?? this._estimate);
        if (this._rowHeight == null)
            for (const [row, height] of this._heightCache) {
                const i = rows.ModelIndexToRowIndex(row.ModelIndex);
                if (i >= 0 && i < n && rows.Get(i) === row)
                    this._heights.Set(i, height);
                else
                    this._heightCache.delete(row);
            }
        this._extent.style.height = `${Math.min(MAX_EXTENT, this._heights.Total)}px`;
        if (anchor) {
            const i = rows?.ModelIndexToRowIndex(anchor.row.ModelIndex) ?? -1;
            if (i >= 0 && rows.Get(i) === anchor.row)
                this._setLogicalScroll(this._heights.Offset(i) + anchor.within);
        }
        this._geometryDirty = false;
    }
    _visibleColumnIndices() {
        const l = this._presentation.Layout, range = l.Geometry.Range(this._viewport.scrollLeft, this._viewport.clientWidth, 100);
        const selected = new Set();
        for (let i = 0; i < Math.min(this._frozen, l.Columns.length); i++)
            selected.add(i);
        for (let i = range.start; i < range.end; i++)
            selected.add(i);
        // Auto-height columns can opt into continuous realization while horizontally offscreen.
        if (this._rowHeight == null)
            l.Columns.forEach((c, i) => { if (c.Options?.AffectsRowHeight)
                selected.add(i); });
        return [...selected].sort((a, b) => a - b);
    }
    _render() {
        const start = performance.now();
        const p = this._presentation, rows = this.Rows;
        if (!p || !rows) {
            this._clearRows();
            this._header.replaceChildren();
            this._extent.style.height = '0px';
            this._empty.hidden = false;
            return;
        }
        if (this._geometryDirty)
            this._resetGeometry();
        if (this._layoutDirty) {
            const layout = p.Layout;
            layout.Calculate(this.ActiveModel.Columns, this._viewport.clientWidth);
            p.Columns.forEach(v => { const i = layout.Columns.indexOf(v.CoreColumn); v.ActualWidth = i >= 0 ? layout.Widths[i] : 0; });
            this._extent.style.width = `${Math.max(layout.Geometry.Total, this._viewport.clientWidth)}px`;
            this._header.style.width = `${layout.Geometry.Total}px`;
            this._layoutDirty = false;
            this._headerDirty = true;
        }
        const colIndexes = this._visibleColumnIndices(), signature = colIndexes.map(i => `${i}:${p.Layout.Widths[i]}`).join('|');
        if (signature !== this._colSignature) {
            this._colSignature = signature;
            this._dataDirty = this._headerDirty = true;
        }
        if (this._headerDirty) {
            this._renderHeader(colIndexes);
            this._headerDirty = false;
        }
        const top = this._logicalScroll(), height = this._viewport.clientHeight, range = this._heights.Range(top, height, this._overscan);
        this._logicalTop = top;
        if (this._editing && (this._editing.rowIndex < range.start || this._editing.rowIndex >= range.end) && !this.CommitEdit()) {
            this._setLogicalScroll(this._heights.Offset(this._editing.rowIndex));
            return;
        }
        if (this._dataDirty) {
            this._clearRows();
            this._dataDirty = false;
        }
        const base = top - this._viewport.scrollTop, reusable = [];
        for (const [i, record] of this._realized)
            if (i < range.start || i >= range.end) {
                reusable.push(record);
                this._realized.delete(i);
            }
        const fragment = document.createDocumentFragment();
        for (let i = range.start; i < range.end; i++) {
            let record = this._realized.get(i);
            const row = rows.Get(i);
            if (record && record.row !== row) {
                this._recycleRow(record);
                this._realized.delete(i);
                record = null;
            }
            if (!record) {
                if (reusable.length) {
                    record = reusable.pop();
                    this._rebindRow(record, i, row);
                }
                else {
                    record = this._prepareRow(i, row, colIndexes);
                    fragment.append(record.el);
                }
                this._realized.set(i, record);
            }
            if (this._valueDirty)
                for (const c of record.cells)
                    this._updateCell(c);
            record.el.style.transform = `translate3d(0,${this._heights.Offset(i) - base}px,0)`;
            record.el.style.width = `${p.Layout.Geometry.Total}px`;
            record.el.style.height = this._rowHeight == null ? '' : `${this._rowHeight}px`;
            record.el.style.minHeight = `${this._rowHeight ?? Math.max(this._estimate, this._heightCache.get(row) ?? 0)}px`;
            record.el.classList.toggle('selected', !(this.ActiveModel.Selection instanceof TreeDataGridCellSelectionModel) && !!this.ActiveModel.Selection?.IsSelected(row.ModelIndex));
            record.el.setAttribute('aria-selected', String(!(this.ActiveModel.Selection instanceof TreeDataGridCellSelectionModel) && !!this.ActiveModel.Selection?.IsSelected(row.ModelIndex)));
            for (const c of record.cells) {
                const cellSelected = this.ActiveModel.Selection instanceof TreeDataGridCellSelectionModel && this.ActiveModel.Selection.IsSelected(c.columnIndex, row.ModelIndex);
                c.el.classList.toggle('selected', cellSelected);
                c.el.setAttribute('aria-selected', String(cellSelected));
                const active = this._active.row === i && this._active.column === c.columnIndex;
                c.el.classList.toggle('active', active);
                if (active)
                    this._root.setAttribute('aria-activedescendant', c.el.id);
            }
        }
        for (const record of reusable)
            this._recycleRow(record);
        this._extent.append(fragment);
        this._valueDirty = this._selectionDirty = false;
        this._root.setAttribute('aria-rowcount', String(rows.Count + (this._showHeaders ? 1 : 0)));
        this._root.setAttribute('aria-colcount', String(p.Layout.Columns.length));
        this._empty.hidden = rows.Count > 0;
        const topIndex = this._heights.IndexAt(top);
        this._topAnchor = topIndex >= 0 ? { row: rows.Get(topIndex), within: top - this._heights.Offset(topIndex) } : null;
        this.Stats = { Rows: rows.Count, RealizedRows: this._realized.size, RealizedCells: [...this._realized.values()].reduce((n, r) => n + r.cells.length, 0), FrameMilliseconds: performance.now() - start, MeasuredRows: this._heightCache.size, TotalHeight: this._heights.Total, CreatedElements: this.ElementFactory.Created, ReusedElements: this.ElementFactory.Reused, FirstRow: range.start, LastRow: range.end - 1 };
        this._frame++;
        this._fire('Rendered', { Stats: this.Stats });
        if (this._needsWidthMeasure) {
            this._needsWidthMeasure = false;
            this._measureColumns();
        }
    }
    _appendColumns(container, indexes, create) { const l = this._presentation.Layout; let offset = 0; for (const i of indexes) {
        const x = l.Geometry.Offsets[i];
        if (x > offset + .1) {
            const gap = dom('div', 'gap');
            gap.style.width = `${x - offset}px`;
            gap.setAttribute('aria-hidden', 'true');
            container.append(gap);
        }
        const element = create(i);
        container.append(element);
        offset = x + l.Widths[i];
    } if (l.Geometry.Total > offset + .1) {
        const gap = dom('div', 'gap');
        gap.style.width = `${l.Geometry.Total - offset}px`;
        gap.setAttribute('aria-hidden', 'true');
        container.append(gap);
    } }
    _renderHeader(indexes) {
        this._header.replaceChildren();
        this._appendColumns(this._header, indexes, i => {
            const l = this._presentation.Layout, c = l.Columns[i], sourceIndex = this.ActiveModel.Columns.IndexOf(c), h = dom('div', 'header');
            h.dataset.column = sourceIndex;
            h.setAttribute('role', 'columnheader');
            h.setAttribute('aria-colindex', String(i + 1));
            h.style.width = `${l.Widths[i]}px`;
            h.tabIndex = -1;
            const label = dom('span', 'label', c.Header);
            h.append(label);
            const sortable = this._canSort && c.Options?.CanUserSortColumn !== false && c.GetComparison(ListSortDirection.Ascending) != null;
            h.classList.toggle('sortable', sortable);
            h.draggable = this._canReorder;
            h.setAttribute('aria-sort', c.SortDirection === ListSortDirection.Ascending ? 'ascending' : c.SortDirection === ListSortDirection.Descending ? 'descending' : 'none');
            if (c.SortDirection)
                h.append(dom('span', 'sort-indicator', c.SortDirection === ListSortDirection.Ascending ? '↑' : '↓'));
            if (c.Options?.CanUserResizeColumn ?? this._canResize) {
                const grip = dom('span', 'resize-grip');
                grip.dataset.resize = sourceIndex;
                grip.setAttribute('role', 'separator');
                grip.setAttribute('aria-orientation', 'vertical');
                grip.setAttribute('aria-label', `Resize ${c.Header}`);
                grip.tabIndex = 0;
                h.append(grip);
            }
            if (i < this._frozen) {
                h.classList.add('frozen');
                h.style.left = `${l.Geometry.Offsets[i]}px`;
                if (i === this._frozen - 1)
                    h.classList.add('frozen-edge');
            }
            return h;
        });
    }
    _prepareRow(index, row, colIndexes) {
        const el = this.ElementFactory.GetElement('row', () => dom('div', 'row'));
        el.className = 'row';
        el.dataset.row = index;
        el.setAttribute('role', 'row');
        el.setAttribute('aria-rowindex', String(index + (this._showHeaders ? 2 : 1)));
        el.setAttribute('aria-level', String((row.Indent ?? 0) + 1));
        if (row.ShowExpander)
            el.setAttribute('aria-expanded', String(row.IsExpanded));
        else
            el.removeAttribute('aria-expanded');
        el.draggable = this._autoDrag;
        const record = { el, index, row, cells: [] };
        el._record = record;
        this._appendColumns(el, colIndexes, i => { const cell = this._prepareCell(record, i); record.cells.push(cell); return cell.el; });
        this._rowObserver.observe(el);
        this._fire('RowPrepared', { Row: el, RowIndex: index, Model: row.Model, CoreRow: row });
        return record;
    }
    _rebindRow(record, index, row) {
        // Scrolling rebinds retained built-in cell DOM instead of destroying every content node.
        // Custom templates are recreated, so create-time event handlers cannot retain the old model.
        this._rowObserver.unobserve(record.el);
        this._fire('RowClearing', { Row: record.el, RowIndex: record.index, Model: record.row.Model, CoreRow: record.row });
        for (const rec of record.cells) {
            this._fire('CellClearing', { Cell: rec.el, ColumnIndex: rec.columnIndex, RowIndex: rec.rowIndex, Model: rec.row.Model, CellModel: rec.cellModel });
            disposeAll(rec.off);
            rec.cellModel.Dispose();
            if (rec.template) {
                rec.template.dispose?.(rec.templateElement);
                rec.content.replaceChildren();
                rec.templateElement = null;
            }
            rec.row = row;
            rec.rowIndex = index;
            rec.cellModel = rec.view.CreateCell(row);
            rec.inner = rec.cellModel instanceof ExpanderCell ? rec.cellModel.Inner : rec.cellModel;
            rec.el.id = `tdg-${this._id}-${index}-${rec.columnIndex}`;
            rec.el.dataset.row = index;
            if (rec.expander)
                rec.el.style.paddingLeft = `${8 + row.Indent * 18}px`;
            this._updateCell(rec);
            if (rec.column.Getter)
                rec.off.push(observeSelector(row.Model, rec.column.Getter, () => { if (this._editing?.rec !== rec) {
                    this._heightCache.delete(rec.row);
                    this._updateCell(rec);
                    this._schedule();
                } }));
            this._fire('CellPrepared', { Cell: rec.el, ColumnIndex: rec.columnIndex, RowIndex: index, Model: row.Model, Column: rec.coreColumn, CellModel: rec.cellModel });
        }
        record.row = row;
        record.index = index;
        record.el.dataset.row = index;
        record.el.setAttribute('aria-rowindex', String(index + (this._showHeaders ? 2 : 1)));
        record.el.setAttribute('aria-level', String((row.Indent ?? 0) + 1));
        if (row.ShowExpander)
            record.el.setAttribute('aria-expanded', String(row.IsExpanded));
        else
            record.el.removeAttribute('aria-expanded');
        this._rowObserver.observe(record.el);
        this.ElementFactory.Reused += 1 + record.cells.length;
        this._needsWidthMeasure = true;
        this._fire('RowPrepared', { Row: record.el, RowIndex: index, Model: row.Model, CoreRow: row });
    }
    _prepareCell(record, visibleIndex) {
        const l = this._presentation.Layout, column = l.Columns[visibleIndex], columnIndex = this.ActiveModel.Columns.IndexOf(column), view = this._presentation.Columns[columnIndex], model = view.CreateCell(record.row), inner = model instanceof ExpanderCell ? model.Inner : model, c = innerColumn(column);
        const el = this.ElementFactory.GetElement('cell', () => dom('div', 'cell'));
        el.className = 'cell';
        el.id = `tdg-${this._id}-${record.index}-${columnIndex}`;
        el.dataset.column = columnIndex;
        el.dataset.row = record.index;
        el.setAttribute('role', 'gridcell');
        el.setAttribute('aria-colindex', String(visibleIndex + 1));
        el.style.width = `${l.Widths[visibleIndex]}px`;
        el.style.left = '';
        el.style.paddingLeft = '';
        el.title = '';
        el.classList.toggle('wrap', !!c.Options?.TextWrapping);
        el.classList.toggle('right', c.Options?.TextAlignment === 'Right');
        el.classList.toggle('center', c.Options?.TextAlignment === 'Center');
        if (visibleIndex < this._frozen) {
            el.classList.add('frozen');
            el.style.left = `${l.Geometry.Offsets[visibleIndex]}px`;
            if (visibleIndex === this._frozen - 1)
                el.classList.add('frozen-edge');
        }
        const content = dom('div', 'cell-content');
        const rec = { el, content, column: c, coreColumn: column, columnIndex, rowIndex: record.index, row: record.row, cellModel: model, inner, off: [], view, template: null };
        el._cell = rec;
        if (model instanceof ExpanderCell) {
            el.style.paddingLeft = `${8 + model.Indent * 18}px`;
            const button = dom('button', `expander ${model.ShowExpander ? '' : 'empty'} ${model.IsExpanded ? 'open' : ''}`);
            button.type = 'button';
            button.tabIndex = -1;
            button.innerHTML = triangle;
            button.dataset.expand = '';
            button.setAttribute('aria-label', model.IsExpanded ? 'Collapse row' : 'Expand row');
            button.classList.toggle('loading', record.row.IsLoading);
            el.append(button);
            rec.expander = button;
        }
        el.append(content);
        if (inner instanceof TemplateCell) {
            rec.template = inner.Template;
        }
        else if (c instanceof CheckBoxColumn) {
            const input = dom('input');
            input.type = 'checkbox';
            input.tabIndex = -1;
            input.setAttribute('aria-label', String(column.Header));
            input.disabled = !c.Setter;
            content.append(input);
            rec.checkbox = input;
        }
        this._updateCell(rec);
        if (c.Getter)
            rec.off.push(observeSelector(record.row.Model, c.Getter, () => { if (!this._editing || this._editing.rec !== rec) {
                this._heightCache.delete(rec.row);
                this._updateCell(rec);
                this._schedule();
            } }));
        this._needsWidthMeasure = true;
        this._fire('CellPrepared', { Cell: el, ColumnIndex: columnIndex, RowIndex: record.index, Model: record.row.Model, Column: column, CellModel: model });
        return rec;
    }
    _templateContext(rec) { return { grid: this, row: rec.row, column: rec.coreColumn, rowIndex: rec.rowIndex, columnIndex: rec.columnIndex, document, notify: () => { this.ActiveModel.NotifyItemChanged(rec.row.Model); }, setValue: value => { rec.column.SetValue(rec.row.Model, value); this.ActiveModel.NotifyItemChanged(rec.row.Model); } }; }
    _createTemplate(rec) { const template = rec.template, result = template.create?.(rec.row.Model, this._templateContext(rec)); if (result instanceof Node) {
        rec.content.append(result);
        rec.templateElement = result;
    }
    else {
        rec.templateElement = dom('span', '', result ?? '');
        rec.content.append(rec.templateElement);
    } template.update?.(rec.templateElement, rec.row.Model, this._templateContext(rec)); }
    _updateCell(rec) {
        if (this._editing?.rec === rec)
            return;
        if (rec.template) {
            if (!rec.templateElement)
                this._createTemplate(rec);
            else if (rec.template.update)
                rec.template.update(rec.templateElement, rec.row.Model, this._templateContext(rec));
            else if (rec.templateElement) {
                rec.template.dispose?.(rec.templateElement);
                rec.content.replaceChildren();
                this._createTemplate(rec);
            }
        }
        else {
            const value = rec.inner.Value;
            if (rec.checkbox) {
                rec.checkbox.checked = value === true;
                rec.checkbox.indeterminate = value == null && rec.column.IsThreeState;
                rec.checkbox.setAttribute('aria-checked', rec.checkbox.indeterminate ? 'mixed' : String(rec.checkbox.checked));
            }
            else {
                const text = formatValue(rec.column, value, rec.row.Model);
                if (rec.content.textContent !== text)
                    rec.content.textContent = text;
                rec.el.title = text;
            }
        }
        if (rec.expander) {
            rec.expander.classList.toggle('open', rec.row.IsExpanded);
            rec.expander.classList.toggle('empty', !rec.row.ShowExpander);
            rec.expander.classList.toggle('loading', rec.row.IsLoading);
            rec.expander.setAttribute('aria-label', rec.row.IsExpanded ? 'Collapse row' : 'Expand row');
        }
    }
    _recycleCell(rec) { this._fire('CellClearing', { Cell: rec.el, ColumnIndex: rec.columnIndex, RowIndex: rec.rowIndex, Model: rec.row.Model, CellModel: rec.cellModel }); disposeAll(rec.off); rec.template?.dispose?.(rec.templateElement); rec.cellModel.Dispose(); rec.el.replaceChildren(); rec.el._cell = null; rec.el.remove(); this.ElementFactory.RecycleElement('cell', rec.el); }
    _recycleRow(record) { this._rowObserver.unobserve(record.el); for (const cell of record.cells)
        this._recycleCell(cell); this._fire('RowClearing', { Row: record.el, RowIndex: record.index, Model: record.row.Model, CoreRow: record.row }); record.el.replaceChildren(); record.el._record = null; record.el.remove(); this.ElementFactory.RecycleElement('row', record.el); }
    _clearRows() { for (const record of this._realized.values())
        this._recycleRow(record); this._realized.clear(); }
    _measureRows(entries) {
        if (this._rowHeight != null || !this.isConnected)
            return;
        const top = this._logicalScroll(), anchor = this._heights.IndexAt(top), wasAtEnd = Math.abs(this._heights.Total - this._viewport.clientHeight - top) < 2;
        let changed = false, above = 0;
        for (const entry of entries) {
            const record = entry.target._record;
            if (!record || record.index >= this._heights.Count || this.Rows?.Get(record.index) !== record.row)
                continue;
            const h = Math.max(12, entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height);
            const d = this._heights.Set(record.index, h);
            if (d) {
                changed = true;
                this._heightCache.set(record.row, h);
                if (record.index < anchor)
                    above += d;
            }
        }
        if (changed) {
            while (this._heightCache.size > 20000)
                this._heightCache.delete(this._heightCache.keys().next().value);
            this._extent.style.height = `${Math.min(MAX_EXTENT, this._heights.Total)}px`;
            if (wasAtEnd)
                this._setLogicalScroll(this._heights.Total - this._viewport.clientHeight);
            else if (above)
                this._setLogicalScroll(top + above);
            this._schedule();
        }
    }
    _measureColumns() {
        if (!this._presentation)
            return;
        const measures = new Map(), canvas = this._measureCanvas ??= document.createElement('canvas'), ctx = canvas.getContext('2d');
        // Measure intrinsic content, not the stretched flex item's scrollWidth (which would grow forever).
        for (const r of this._realized.values())
            for (const cell of r.cells) {
                const core = cell.coreColumn;
                if (!core.Width.IsAuto)
                    continue;
                ctx.font = getComputedStyle(cell.content).font;
                let natural = 0;
                if (cell.checkbox)
                    natural = 22;
                else if (cell.template) {
                    const clone = cell.content.cloneNode(true);
                    Object.assign(clone.style, { position: 'absolute', visibility: 'hidden', width: 'max-content', maxWidth: 'none', inset: '0 auto auto 0', flex: 'none' });
                    this._root.append(clone);
                    natural = clone.getBoundingClientRect().width;
                    clone.remove();
                }
                else
                    for (const line of cell.content.textContent.split('\n'))
                        natural = Math.max(natural, ctx.measureText(line).width);
                const width = Math.min(1200, Math.max(String(core.Header ?? '').length * 8 + 34, natural + 28 + (cell.expander ? cell.row.Indent * 18 + 24 : 0)));
                measures.set(core, Math.max(measures.get(core) ?? 0, width));
            }
        let changed = false;
        for (const [c, width] of measures)
            changed = this._presentation.Layout.Measure(c, width) || changed;
        if (changed) {
            this._layoutDirty = true;
            this._schedule();
        }
    }
    TryGetCell(columnIndex, rowIndex) { if (columnIndex instanceof Element)
        return columnIndex.closest('.cell'); return this._realized.get(rowIndex)?.cells.find(c => c.columnIndex === columnIndex)?.el ?? null; }
    TryGetRow(indexOrElement) { if (indexOrElement instanceof Element)
        return indexOrElement.closest('.row'); return this._realized.get(indexOrElement)?.el ?? null; }
    TryGetRowModel(element) { return this.TryGetRow(element)?._record?.row.Model ?? null; }
    QueryCancelSelection() { return !!this._fire('SelectionChanging', { Cancel: false }, true).Cancel; }
    ScrollIntoView(rowIndex, columnIndex = -1, alignment = 'nearest') {
        if (!this.Rows?.Count)
            return;
        rowIndex = clamp(rowIndex, 0, this.Rows.Count - 1);
        if (this._geometryDirty)
            this._resetGeometry();
        const top = this._heights.Offset(rowIndex), bottom = this._heights.Offset(rowIndex + 1), current = this._logicalScroll(), vh = this._viewport.clientHeight;
        if (alignment === 'start')
            this._setLogicalScroll(top);
        else if (alignment === 'center')
            this._setLogicalScroll(top - (vh - (bottom - top)) / 2);
        else if (top < current)
            this._setLogicalScroll(top);
        else if (bottom > current + vh)
            this._setLogicalScroll(bottom - vh);
        if (columnIndex >= 0 && this._presentation) {
            const l = this._presentation.Layout, i = l.Columns.indexOf(this.ActiveModel.Columns.Get(columnIndex));
            if (i >= this._frozen) {
                const x = l.Geometry.Offsets[i], w = l.Widths[i], f = l.Geometry.Offsets[Math.min(this._frozen, l.Columns.length)];
                if (x < this._viewport.scrollLeft + f)
                    this._viewport.scrollLeft = Math.max(0, x - f);
                else if (x + w > this._viewport.scrollLeft + this._viewport.clientWidth)
                    this._viewport.scrollLeft = x + w - this._viewport.clientWidth;
            }
        }
        this._schedule();
    }
    BringIntoView(index, columnIndex = -1) { index = IndexPath.From(index); if (this.ActiveModel?.IsHierarchical) {
        this.ActiveModel.Batch(() => { for (let d = 1; d < index.Count; d++)
            this.ActiveModel.Expand(index.Slice(0, d)); });
    } const row = this.Rows?.ModelIndexToRowIndex(index) ?? -1; if (row >= 0)
        this.ScrollIntoView(row, columnIndex); return row; }
    FindDisplayedRowIndex(modelOrPath) { const path = modelOrPath instanceof IndexPath ? modelOrPath : this.ActiveModel.FindModelIndex(modelOrPath); return this.Rows.ModelIndexToRowIndex(path); }
    AutoSizeColumn(columnIndex) { const c = this.ActiveModel.Columns.Get(columnIndex), inner = innerColumn(c); let width = String(c.Header ?? '').length * 8 + 34; for (let i = 0; i < Math.min(300, this.Rows.Count); i++) {
        const row = this.Rows.Get(i), text = formatValue(inner, inner.GetValue?.(row.Model), row.Model);
        width = Math.max(width, ...text.split('\n').map(x => x.length * 7.4 + 28 + (c instanceof HierarchicalExpanderColumn ? 24 + row.Indent * 18 : 0)));
    } c.Width = new GridLength(Math.min(700, Math.ceil(width))); }
    AutoSizeAllColumns() { for (let i = 0; i < this.ActiveModel.Columns.Count; i++)
        this.AutoSizeColumn(i); }
    _eventCell(event) { return event.target.closest?.('.cell')?._cell ?? null; }
    _eventHeader(event) { return event.target.closest?.('.header') ?? null; }
    _select(rowIndex, columnIndex, event = {}) {
        if (this.QueryCancelSelection())
            return;
        const source = this.ActiveModel, selection = source?.Selection;
        if (!selection)
            return;
        const path = this.Rows.RowIndexToModelIndex(rowIndex), ctrl = event.ctrlKey || event.metaKey;
        this._active = { row: rowIndex, column: columnIndex };
        if (selection instanceof TreeDataGridCellSelectionModel) {
            if (event.shiftKey && !selection.SingleSelect) {
                const anchor = selection.AnchorIndex, ar = this.Rows.ModelIndexToRowIndex(anchor.RowIndex);
                if (ar >= 0)
                    selection.SetSelectedRange(anchor, columnIndex - anchor.ColumnIndex + (columnIndex >= anchor.ColumnIndex ? 1 : -1), rowIndex - ar + (rowIndex >= ar ? 1 : -1));
                else
                    selection.SelectedIndex = new CellIndex(columnIndex, path);
            }
            else
                selection.SelectedIndex = new CellIndex(columnIndex, path);
        }
        else if (event.shiftKey && !selection.SingleSelect) {
            const anchor = selection.RangeAnchorIndex.Count ? selection.RangeAnchorIndex : selection.SelectedIndex;
            selection.SelectRange(anchor, path, ctrl);
        }
        else if (ctrl && !selection.SingleSelect) {
            selection.IsSelected(path) ? selection.Deselect(path) : selection.Select(path);
            selection.RangeAnchorIndex = path;
        }
        else
            selection.SelectedIndex = path;
        this._schedule();
    }
    _click(event) {
        const header = this._eventHeader(event);
        if (header) {
            if (event.target.closest('.resize-grip') || this._suppressClick)
                return;
            const column = this.ActiveModel.Columns.Get(+header.dataset.column);
            if (this._canSort && column.Options?.CanUserSortColumn !== false) {
                if (event.ctrlKey || event.metaKey || column.SortDirection === ListSortDirection.Descending)
                    this.ActiveModel.ClearSort();
                else
                    this.ActiveModel.SortBy(column, column.SortDirection === ListSortDirection.Ascending ? ListSortDirection.Descending : ListSortDirection.Ascending);
            }
            return;
        }
        const cell = this._eventCell(event);
        if (!cell)
            return;
        if (this._editing) {
            if (this._editing.rec === cell)
                return;
            if (!this.CommitEdit())
                return;
        }
        if (event.target.closest('[data-expand]')) {
            event.stopPropagation();
            const row = cell.row;
            if (row.HasChildren) {
                row.IsExpanded ? this.ActiveModel.Collapse(row.ModelIndex) : this.ActiveModel.Expand(row.ModelIndex);
            }
            return;
        }
        const interactive = event.target.closest('button,a,select,input,textarea');
        if (interactive && !cell.checkbox)
            return;
        this._select(cell.rowIndex, cell.columnIndex, event);
        this._root.focus({ preventScroll: true });
        if (cell.checkbox && cell.column.Setter) {
            const old = cell.column.GetValue(cell.row.Model), value = cell.column.IsThreeState ? (old === false ? true : old === true ? null : false) : !old;
            this._writeCell(cell, value, old);
        }
        if (cell.column.Options?.BeginEditGestures?.includes('Tap') && !cell.column.Options.BeginEditGestures.includes('DoubleTap'))
            this.BeginEdit(cell.columnIndex, cell.rowIndex);
    }
    _doubleClick(event) { const grip = event.target.closest?.('.resize-grip'); if (grip) {
        event.preventDefault();
        this.AutoSizeColumn(+grip.dataset.resize);
        return;
    } const cell = this._eventCell(event); if (!cell || event.target.closest('[data-expand]'))
        return; this._fire('RowDoubleTapped', { RowIndex: cell.rowIndex, Model: cell.row.Model, Row: cell.row }); if (!cell.checkbox)
        this.BeginEdit(cell.columnIndex, cell.rowIndex); }
    _pointerDown(event) {
        if (event.target.closest?.('.context-menu'))
            return;
        this._hideContextMenu();
        const grip = event.target.closest?.('.resize-grip');
        if (!grip)
            return;
        event.preventDefault();
        event.stopPropagation();
        const columnIndex = +grip.dataset.resize, column = this.ActiveModel.Columns.Get(columnIndex), layout = this._presentation.Layout, vi = layout.Columns.indexOf(column), initial = layout.Widths[vi], start = event.clientX;
        this._resizeAbort?.abort();
        const controller = new AbortController();
        this._resizeAbort = controller;
        this._suppressClick = true;
        const min = GridLength.Parse(column.Options?.MinWidth ?? 30).Value, max = column.Options?.MaxWidth ? GridLength.Parse(column.Options.MaxWidth).Value : 5000;
        document.addEventListener('pointermove', e => { column.Width = new GridLength(clamp(initial + e.clientX - start, min, max)); }, { signal: controller.signal });
        document.addEventListener('pointerup', () => { controller.abort(); this._resizeAbort = null; setTimeout(() => { this._suppressClick = false; }, 0); }, { once: true, signal: controller.signal });
        document.addEventListener('pointercancel', () => { controller.abort(); this._resizeAbort = null; this._suppressClick = false; }, { once: true, signal: controller.signal });
    }
    _keyDown(event) {
        if (event.isComposing)
            return;
        const key = event.key, ctrl = event.ctrlKey || event.metaKey;
        const grip = event.target.closest?.('.resize-grip');
        if (grip && ['ArrowLeft', 'ArrowRight'].includes(key)) {
            event.preventDefault();
            const i = +grip.dataset.resize, w = this.Columns[i].ActualWidth;
            this.ActiveModel.Columns.Get(i).Width = new GridLength(Math.max(30, w + (key === 'ArrowRight' ? 10 : -10)));
            return;
        }
        if (this._editing) {
            if (key === 'Escape') {
                event.preventDefault();
                this.CancelEdit();
                this._root.focus({ preventScroll: true });
            }
            else if (key === 'Enter' && !(event.shiftKey && this._editing.editor.tagName === 'TEXTAREA')) {
                event.preventDefault();
                if (this.CommitEdit())
                    this._root.focus({ preventScroll: true });
            }
            else if (key === 'Tab') {
                event.preventDefault();
                if (this.CommitEdit()) {
                    this._moveActive(0, event.shiftKey ? -1 : 1, false);
                    this.BeginEdit();
                }
            }
            return;
        }
        if (event.target !== this._root && event.target.closest('input,textarea,select,button,a'))
            return;
        const rows = this.Rows;
        if (!rows?.Count)
            return;
        const s = this.ActiveModel.Selection;
        if (ctrl && key.toLowerCase() === 'a') {
            event.preventDefault();
            if (!this.QueryCancelSelection())
                s?.SelectAll();
            return;
        }
        if (ctrl && key.toLowerCase() === 'z') {
            event.preventDefault();
            event.shiftKey ? this.Redo() : this.Undo();
            return;
        }
        if (ctrl && key.toLowerCase() === 'y') {
            event.preventDefault();
            this.Redo();
            return;
        }
        if (key === 'F2' || key === 'Enter') {
            event.preventDefault();
            this.BeginEdit();
            return;
        }
        if (key === 'Escape') {
            s?.Clear();
            return;
        }
        if (key === ' ') {
            event.preventDefault();
            const cell = this.TryGetCell(this._active.column, this._active.row)?._cell;
            if (cell?.checkbox && cell.column.Setter) {
                const old = cell.inner.Value, value = cell.column.IsThreeState ? (old === false ? true : old === true ? null : false) : !old;
                this._writeCell(cell, value, old);
            }
            else
                this._select(this._active.row, this._active.column, { ctrlKey: true });
            return;
        }
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Tab'].includes(key)) {
            event.preventDefault();
            let r = this._active.row, c = this._active.column;
            const row = rows.Get(clamp(r, 0, rows.Count - 1)), isCells = s instanceof TreeDataGridCellSelectionModel;
            if ((key === 'ArrowRight' || key === 'ArrowLeft') && this.ActiveModel.IsHierarchical && !isCells) {
                if (key === 'ArrowRight') {
                    if (row.HasChildren && !row.IsExpanded) {
                        this.ActiveModel.Expand(row.ModelIndex);
                        return;
                    }
                    if (row.IsExpanded && r + 1 < rows.Count)
                        r++;
                }
                else {
                    if (row.IsExpanded) {
                        this.ActiveModel.Collapse(row.ModelIndex);
                        return;
                    }
                    if (row.ModelIndex.Count > 1)
                        r = rows.ModelIndexToRowIndex(row.ModelIndex.Parent);
                }
            }
            else if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Tab') {
                this._moveActive(0, (key === 'ArrowLeft' || key === 'Tab' && event.shiftKey) ? -1 : 1, event.shiftKey && key !== 'Tab', ctrl);
                return;
            }
            else if (key === 'ArrowUp')
                r--;
            else if (key === 'ArrowDown')
                r++;
            else if (key === 'Home') {
                if (ctrl)
                    r = 0;
                else
                    c = this.ActiveModel.Columns.IndexOf(this._presentation.Layout.Columns[0]);
            }
            else if (key === 'End') {
                if (ctrl)
                    r = rows.Count - 1;
                else
                    c = this.ActiveModel.Columns.IndexOf(this._presentation.Layout.Columns.at(-1));
            }
            else if (key === 'PageDown')
                r = this._heights.IndexAt(this._heights.Offset(r) + this._viewport.clientHeight);
            else if (key === 'PageUp')
                r = this._heights.IndexAt(Math.max(0, this._heights.Offset(r) - this._viewport.clientHeight));
            r = clamp(r, 0, rows.Count - 1);
            if (ctrl && !event.shiftKey) {
                this._active = { row: r, column: c };
                this._schedule();
            }
            else
                this._select(r, c, event);
            this.ScrollIntoView(r, c);
            return;
        }
        if (key.length === 1 && !ctrl && !event.altKey) {
            const now = performance.now();
            this._typeBuffer = now - (this._typeTime ?? 0) > 800 ? key : this._typeBuffer + key;
            this._typeTime = now;
            this.Search(this._typeBuffer, { prefix: true, start: this._active.row + 1 });
        }
    }
    _moveActive(dr, dc, shift = false, ctrl = false) { const l = this._presentation.Layout; let ci = l.Columns.indexOf(this.ActiveModel.Columns.Get(this._active.column)); if (ci < 0)
        ci = 0; let r = this._active.row + dr; ci += dc; if (ci < 0) {
        ci = l.Columns.length - 1;
        r--;
    } if (ci >= l.Columns.length) {
        ci = 0;
        r++;
    } r = clamp(r, 0, this.Rows.Count - 1); const c = this.ActiveModel.Columns.IndexOf(l.Columns[ci]); this._select(r, c, { shiftKey: shift, ctrlKey: ctrl }); this.ScrollIntoView(r, c); this._root.focus({ preventScroll: true }); }
    Search(text, { prefix = false, start = 0, columnIndex = null } = {}) { if (!this.Rows?.Count || !text)
        return -1; const query = String(text).toLocaleLowerCase(), n = this.Rows.Count, columns = columnIndex == null ? this._presentation.Layout.Columns : [this.ActiveModel.Columns.Get(columnIndex)]; for (let k = 0; k < n; k++) {
        const i = (Math.max(0, start) + k) % n, model = this.Rows.GetModel?.(i) ?? this.Rows.Get(i).Model;
        for (const c of columns) {
            const inner = innerColumn(c);
            if (inner instanceof TemplateColumn)
                continue;
            const value = formatValue(inner, inner.GetValue?.(model), model).toLocaleLowerCase();
            if (prefix ? value.startsWith(query) : value.includes(query)) {
                const col = this.ActiveModel.Columns.IndexOf(c);
                this._select(i, col);
                this.ScrollIntoView(i, col, 'center');
                return i;
            }
        }
    } return -1; }
    BeginEdit(columnIndex = this._active.column, rowIndex = this._active.row) {
        if (this._editing)
            return true;
        if (!this.Rows?.Count)
            return false;
        this.ScrollIntoView(rowIndex, columnIndex);
        this._render();
        const rec = this.TryGetCell(columnIndex, rowIndex)?._cell;
        if (!rec || rec.checkbox || !rec.inner.CanEdit)
            return false;
        if (this._fire('CellEditStarting', { Cell: rec.el, Model: rec.row.Model, ColumnIndex: columnIndex, RowIndex: rowIndex, Cancel: false }, true).Cancel)
            return false;
        const original = rec.inner.Value;
        let editor;
        if (rec.template?.edit) {
            editor = rec.template.edit(rec.row.Model, this._templateContext(rec));
            if (!(editor instanceof Element))
                throw new Error('Edit template must return an element.');
        }
        else {
            editor = dom(rec.column.Options?.TextWrapping ? 'textarea' : 'input', 'editor');
            if (editor.tagName === 'INPUT')
                editor.type = 'text';
            editor.value = original == null ? '' : String(original);
            if (editor.tagName === 'TEXTAREA')
                editor.rows = 2;
        }
        editor.classList.add('editor');
        editor.setAttribute('aria-label', `Edit ${rec.coreColumn.Header}`);
        rec.content.replaceChildren(editor);
        rec.el.classList.add('editing');
        this._active = { row: rowIndex, column: columnIndex };
        this._editing = { rec, editor, original, columnIndex, rowIndex };
        rec.inner.IsEditing = true;
        editor.focus({ preventScroll: true });
        editor.select?.();
        return true;
    }
    CommitEdit() {
        const edit = this._editing;
        if (!edit)
            return true;
        const { rec, editor, original } = edit;
        try {
            let value = rec.template?.read ? rec.template.read(editor, rec.row.Model) : parseValue(rec.column, editor.value ?? editor.textContent, original);
            const validation = rec.column.Options?.Validate?.(value, rec.row.Model);
            if (validation === false || typeof validation === 'string')
                throw new Error(typeof validation === 'string' ? validation : 'Value is not valid.');
            const e = this._fire('CellEditEnding', { Cell: rec.el, Model: rec.row.Model, ColumnIndex: rec.columnIndex, RowIndex: rec.rowIndex, Value: value, Cancel: false }, true);
            if (e.Cancel)
                return false;
            value = e.Value;
            if (rec.template?.commit)
                rec.template.commit(rec.row.Model, value, editor, this._templateContext(rec));
            else
                rec.column.SetValue(rec.row.Model, value);
            this._editing = null;
            rec.inner.IsEditing = false;
            rec.el.classList.remove('editing');
            rec.el.querySelector('.error-tip')?.remove();
            rec.content.replaceChildren();
            if (rec.template)
                this._createTemplate(rec);
            this._updateCell(rec);
            this._heightCache.delete(rec.row);
            this.ActiveModel.NotifyItemChanged(rec.row.Model);
            if (!Object.is(original, value) && !rec.template) {
                this._undo.push([{ column: rec.column, model: rec.row.Model, old: original, value }]);
                this._redo = [];
            }
            this._fire('CellValueChanged', { Cell: rec.el, ColumnIndex: rec.columnIndex, RowIndex: rec.rowIndex, Model: rec.row.Model, OldValue: original, Value: value });
            this._fire('CellEditEnded', { Model: rec.row.Model, ColumnIndex: rec.columnIndex, RowIndex: rec.rowIndex, Value: value, Canceled: false });
            this._schedule();
            return true;
        }
        catch (error) {
            editor.setAttribute('aria-invalid', 'true');
            rec.el.querySelector('.error-tip')?.remove();
            const tip = dom('div', 'error-tip', error.message);
            tip.setAttribute('role', 'alert');
            rec.el.append(tip);
            this._live.textContent = error.message;
            return false;
        }
    }
    CancelEdit() { const edit = this._editing; if (!edit)
        return; const rec = edit.rec; this._editing = null; rec.inner.IsEditing = false; rec.el.classList.remove('editing'); rec.el.querySelector('.error-tip')?.remove(); rec.content.replaceChildren(); if (rec.template)
        this._createTemplate(rec); this._updateCell(rec); this._fire('CellEditEnded', { Model: rec.row.Model, ColumnIndex: rec.columnIndex, RowIndex: rec.rowIndex, Canceled: true }); this._schedule(); }
    _writeCell(rec, value, old) { try {
        const validation = rec.column.Options?.Validate?.(value, rec.row.Model);
        if (validation === false || typeof validation === 'string')
            throw new Error(typeof validation === 'string' ? validation : 'Value is not valid.');
        rec.column.SetValue(rec.row.Model, value);
        this._undo.push([{ column: rec.column, model: rec.row.Model, old, value }]);
        this._redo = [];
        this.ActiveModel.NotifyItemChanged(rec.row.Model);
        this._updateCell(rec);
        this._fire('CellValueChanged', { Cell: rec.el, Model: rec.row.Model, ColumnIndex: rec.columnIndex, RowIndex: rec.rowIndex, OldValue: old, Value: value });
    }
    catch (error) {
        this._error(error);
        this._updateCell(rec);
    } }
    Undo() { if (!this.CommitEdit())
        return false; const changes = this._undo.pop(); if (!changes)
        return false; this.ActiveModel.Batch(() => { for (const c of changes) {
        c.column.SetValue(c.model, c.old);
        this.ActiveModel.NotifyItemChanged(c.model);
    } }); this._redo.push(changes); return true; }
    Redo() { const changes = this._redo.pop(); if (!changes)
        return false; this.ActiveModel.Batch(() => { for (const c of changes) {
        c.column.SetValue(c.model, c.value);
        this.ActiveModel.NotifyItemChanged(c.model);
    } }); this._undo.push(changes); return true; }
    GetSelectionText({ headers = false, separator = '\t', safe = false } = {}) { const model = this.ActiveModel, selection = model?.Selection; if (!model || !selection?.Count)
        return ''; const cellSelection = selection instanceof TreeDataGridCellSelectionModel; const paths = cellSelection ? selection.RowSelection.SelectedIndexes : selection.SelectedIndexes; const rowIndexes = paths.map(p => this.Rows.ModelIndexToRowIndex(p)).filter(i => i >= 0).sort((a, b) => a - b); const columns = this._presentation.Layout.Columns.filter(c => !cellSelection || selection._columns.has(c)); const records = []; if (headers)
        records.push(columns.map(c => c.Header)); for (const i of rowIndexes) {
        const row = this.Rows.Get(i);
        records.push(columns.map(c => { const inner = innerColumn(c); return inner instanceof TemplateColumn ? String(inner.Options?.ClipboardValue?.(row.Model) ?? '') : formatValue(inner, inner.GetValue(row.Model), row.Model); }));
    } return records.map(r => r.map(v => quoteField(v, separator, safe)).join(separator)).join('\r\n'); }
    async Copy(options = {}) { const text = this.GetSelectionText(options); if (!text)
        return ''; try {
        await navigator.clipboard.writeText(text);
    }
    catch (error) {
        const area = dom('textarea');
        area.value = text;
        area.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.append(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        this._root.focus();
        if (!ok)
            throw error;
    } return text; }
    Paste(text) {
        if (!this.Rows?.Count)
            return 0;
        const matrix = parseDelimited(text, '\t'), l = this._presentation.Layout, ci = l.Columns.indexOf(this.ActiveModel.Columns.Get(this._active.column));
        const changes = [];
        for (let r = 0; r < matrix.length && this._active.row + r < this.Rows.Count; r++) {
            const model = this.Rows.Get(this._active.row + r).Model;
            for (let c = 0; c < matrix[r].length && ci + c < l.Columns.length; c++) {
                const column = innerColumn(l.Columns[ci + c]);
                if (!column.Setter)
                    continue;
                const old = column.GetValue(model), value = parseValue(column, matrix[r][c], old), check = column.Options?.Validate?.(value, model);
                if (check === false || typeof check === 'string')
                    throw new Error(typeof check === 'string' ? check : 'Invalid paste value.');
                changes.push({ column, model, old, value });
            }
        }
        const applied = [];
        this.ActiveModel.BeginUpdate();
        try {
            for (const change of changes) {
                change.column.SetValue(change.model, change.value);
                applied.push(change);
                this.ActiveModel.NotifyItemChanged(change.model);
            }
        }
        catch (error) {
            for (const change of applied.reverse())
                change.column.SetValue(change.model, change.old);
            throw error;
        }
        finally {
            this.ActiveModel.EndUpdate();
        }
        if (changes.length) {
            this._undo.push(changes);
            this._redo = [];
        }
        return changes.length;
    }
    ExportCsv({ selectedOnly = false, headers = true, safe = true } = {}) { if (selectedOnly)
        return this.GetSelectionText({ headers, separator: ',', safe }); const columns = this._presentation.Layout.Columns, records = []; if (headers)
        records.push(columns.map(c => c.Header)); for (let i = 0; i < this.Rows.Count; i++) {
        const m = this.Rows.GetModel?.(i) ?? this.Rows.Get(i).Model;
        records.push(columns.map(c => { const inner = innerColumn(c); return inner instanceof TemplateColumn ? (inner.Options?.ClipboardValue?.(m) ?? '') : formatValue(inner, inner.GetValue(m), m); }));
    } return records.map(r => r.map(v => quoteField(v, ',', safe)).join(',')).join('\r\n'); }
    SaveViewState() { return { version: 1, columns: Array.from(this.ActiveModel.Columns, c => ({ id: c.Id, width: c.Width.ToString(), visible: c.IsVisible })), sort: Array.from(this.ActiveModel.Columns).filter(c => c.SortDirection).map(c => ({ id: c.Id, direction: c.SortDirection })), frozen: this._frozen, rowHeight: this._rowHeight, estimatedHeight: this._estimate, scroll: { x: this._viewport.scrollLeft, y: this._logicalScroll() } }; }
    RestoreViewState(state) { if (!state || state.version !== 1)
        throw new Error('Unsupported view state.'); const cols = this.ActiveModel.Columns, byId = new Map(Array.from(cols, c => [c.Id, c])); for (let i = 0; i < (state.columns ?? []).length; i++) {
        const item = state.columns[i], c = byId.get(item.id);
        if (!c)
            continue;
        cols.Move(cols.IndexOf(c), Math.min(i, cols.Count - 1));
        c.Width = GridLength.Parse(item.width);
        c.IsVisible = item.visible !== false;
    } this.FrozenColumns = state.frozen ?? 0; this.RowHeight = state.rowHeight ?? null; this.EstimatedRowHeight = state.estimatedHeight ?? 36; this.ActiveModel.ClearSort(); for (const sort of state.sort ?? []) {
        const c = byId.get(sort.id);
        if (c)
            this.ActiveModel.SortBy(c, sort.direction);
    } this._render(); this._viewport.scrollLeft = state.scroll?.x ?? 0; this._setLogicalScroll(state.scroll?.y ?? 0); }
    _dragStart(event) {
        const header = this._eventHeader(event);
        if (header && this._canReorder) {
            this._columnDrag = this.ActiveModel.Columns.Get(+header.dataset.column);
            event.dataTransfer.setData('application/x-treedatagrid-column', String(this._id));
            event.dataTransfer.effectAllowed = 'move';
            return;
        }
        const cell = this._eventCell(event), record = event.target.closest?.('.row')?._record;
        if (!record || !this._autoDrag || this.ActiveModel.Selection instanceof TreeDataGridCellSelectionModel || this.ActiveModel.IsSorted || this.ActiveModel._filter) {
            event.preventDefault();
            return;
        }
        if (event.target.closest?.('input,textarea,button,select,a')) {
            event.preventDefault();
            return;
        }
        const selection = this.ActiveModel.RowSelection;
        if (!selection?.IsSelected(record.row.ModelIndex))
            this._select(record.index, cell?.columnIndex ?? 0);
        const indexes = selection?.SelectedIndexes ?? [record.row.ModelIndex], args = this._fire('RowDragStarted', { Model: this.ActiveModel, Source: this.Source, Indexes: indexes, Rows: indexes.map(p => this.ActiveModel.GetModelAt(p)), Cancel: false }, true);
        if (args.Cancel) {
            event.preventDefault();
            return;
        }
        const token = `${this._id}-${Date.now()}`;
        this._dragToken = token;
        drags.set(token, { Model: this.ActiveModel, Source: this.Source, Indexes: indexes, Grid: this });
        event.dataTransfer.setData('application/x-treedatagrid-rows', token);
        event.dataTransfer.setData('text/plain', indexes.map(String).join(', '));
        event.dataTransfer.effectAllowed = 'move';
        record.el.classList.add('dragging');
    }
    _dropInfo(event) { const record = event.target.closest?.('.row')?._record; if (!record)
        return null; const rect = record.el.getBoundingClientRect(), ratio = (event.clientY - rect.top) / rect.height; const position = this.ActiveModel.IsHierarchical && ratio > .27 && ratio < .73 && record.row.HasChildren ? 'Inside' : ratio < .5 ? 'Before' : 'After'; return { record, position }; }
    _dragOver(event) {
        const types = [...event.dataTransfer.types];
        if (types.includes('application/x-treedatagrid-column') && this._eventHeader(event)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            return;
        }
        if (!this._autoDrag || !types.includes('application/x-treedatagrid-rows'))
            return;
        const info = this._dropInfo(event);
        if (!info)
            return;
        const args = this._fire('RowDragOver', { Model: this.ActiveModel, TargetIndex: info.record.row.ModelIndex, Position: info.position, DragEvent: event, Cancel: false }, true);
        if (args.Cancel)
            return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        this._clearDrop();
        this._dropTarget = info;
        if (info.position === 'Inside')
            info.record.el.classList.add('drop-inside');
        else {
            const line = dom('div', 'drop-line');
            line.style.top = info.position === 'Before' ? '0' : 'calc(100% - 2px)';
            info.record.el.append(line);
        }
        const rect = this._viewport.getBoundingClientRect();
        this._autoScrollVelocity = event.clientY < rect.top + 36 ? -12 : event.clientY > rect.bottom - 36 ? 12 : 0;
        if (this._autoScrollVelocity && !this._dragRaf) {
            const tick = () => { this._dragRaf = 0; if (this._autoScrollVelocity) {
                this._setLogicalScroll(this._logicalScroll() + this._autoScrollVelocity);
                this._dragRaf = requestAnimationFrame(tick);
            } };
            this._dragRaf = requestAnimationFrame(tick);
        }
    }
    _drop(event) {
        const header = this._eventHeader(event);
        if (header && event.dataTransfer.getData('application/x-treedatagrid-column') === String(this._id) && this._columnDrag) {
            event.preventDefault();
            const from = this.ActiveModel.Columns.IndexOf(this._columnDrag), to = +header.dataset.column;
            this.ActiveModel.Columns.Move(from, to);
            this._columnDrag = null;
            return;
        }
        const token = event.dataTransfer.getData('application/x-treedatagrid-rows'), drag = drags.get(token), info = this._dropInfo(event);
        if (!drag || !info || !this._autoDrag)
            return;
        event.preventDefault();
        const args = this._fire('RowDrop', { DragInfo: drag, Model: this.ActiveModel, TargetIndex: info.record.row.ModelIndex, Position: info.position, Cancel: false }, true);
        if (!args.Cancel) {
            try {
                this.ActiveModel.MoveRows(drag.Model, drag.Indexes, args.TargetIndex, args.Position, 'Move');
                this._live.textContent = 'Rows moved';
            }
            catch (error) {
                this._error(error);
            }
        }
        this._dragEnd();
        drag.Grid._dragEnd();
    }
    _clearDrop() { this._dropTarget?.record.el.classList.remove('drop-inside'); this._dropTarget?.record.el.querySelector('.drop-line')?.remove(); this._dropTarget = null; }
    _dragEnd() { if (this._dragToken)
        drags.delete(this._dragToken); this._dragToken = null; this._columnDrag = null; this._autoScrollVelocity = 0; cancelAnimationFrame(this._dragRaf); this._dragRaf = 0; this._clearDrop(); for (const r of this._realized.values())
        r.el.classList.remove('dragging'); }
    _contextMenu(event) {
        const header = this._eventHeader(event), cell = this._eventCell(event);
        if (!header && !cell)
            return;
        event.preventDefault();
        this._hideContextMenu();
        const menu = dom('div', 'context-menu');
        menu.setAttribute('role', 'menu');
        const add = (text, action) => { const button = dom('button', '', text); button.type = 'button'; button.setAttribute('role', 'menuitem'); button.onclick = () => { this._hideContextMenu(); try {
            Promise.resolve(action()).catch(e => this._error(e));
        }
        catch (e) {
            this._error(e);
        } }; menu.append(button); };
        if (header) {
            const i = +header.dataset.column, c = this.ActiveModel.Columns.Get(i);
            add('Sort ascending', () => this.ActiveModel.SortBy(c, ListSortDirection.Ascending));
            add('Sort descending', () => this.ActiveModel.SortBy(c, ListSortDirection.Descending));
            add('Clear sorting', () => this.ActiveModel.ClearSort());
            add('Fit column to content', () => this.AutoSizeColumn(i));
            add('Hide column', () => { c.IsVisible = false; });
        }
        else {
            if (!this.ActiveModel.Selection?.Count)
                this._select(cell.rowIndex, cell.columnIndex);
            add('Copy selection', () => this.Copy());
            if (cell.inner.CanEdit)
                add('Edit cell', () => this.BeginEdit(cell.columnIndex, cell.rowIndex));
            add('Select all', () => this.ActiveModel.Selection?.SelectAll());
        }
        const rect = this._root.getBoundingClientRect();
        menu.style.left = `${clamp(event.clientX - rect.left, 0, Math.max(0, rect.width - 195))}px`;
        menu.style.top = `${clamp(event.clientY - rect.top, 0, Math.max(0, rect.height - 220))}px`;
        this._root.append(menu);
        this._context = menu;
        menu.firstChild?.focus();
    }
    _hideContextMenu() { this._context?.remove(); this._context = null; }
    Dispose() { if (this._disposed)
        return; this.CancelEdit(); this.disconnectedCallback(); disposeAll(this._presentationOff); disposeAll(this._selectionOff); this._presentation?.Dispose(); this._presentation = null; this._generated?.Dispose(); this.ElementFactory.Clear(); this._heightCache.clear(); this._disposed = true; for (const name of eventNames)
        this[name].Clear(); this._root.replaceChildren(); }
}
function quoteField(value, separator = ',', safe = true) { let s = String(value ?? ''); if (safe && /^[=+\-@\t\r]/.test(s))
    s = "'" + s; return s.includes(separator) || /["\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }
function parseDelimited(text, separator = '\t') { const rows = [], row = []; let value = '', quoted = false; for (let i = 0; i < String(text).length; i++) {
    const c = text[i];
    if (c === '"') {
        if (quoted && text[i + 1] === '"') {
            value += '"';
            i++;
        }
        else if (!value || quoted)
            quoted = !quoted;
        else
            value += c;
    }
    else if (c === separator && !quoted) {
        row.push(value);
        value = '';
    }
    else if ((c === '\n' || c === '\r') && !quoted) {
        row.push(value);
        rows.push(row.splice(0));
        value = '';
        if (c === '\r' && text[i + 1] === '\n')
            i++;
    }
    else
        value += c;
} if (quoted)
    throw new Error('Unterminated quoted field.'); if (value || row.length || !rows.length) {
    row.push(value);
    rows.push(row);
} return rows; }
function registerTreeDataGrid(name = 'tree-data-grid') { if (!customElements.get(name))
    customElements.define(name, name === 'tree-data-grid' ? TreeDataGrid : class extends TreeDataGrid {
    }); }

Object.assign(exports,{TreeDataGrid,quoteField,parseDelimited,registerTreeDataGrid});
},
"packages/web/src/styles.js":function(exports,require){
const gridStyles = `
:host{display:block;min-width:0;min-height:120px;height:100%;font:13px/1.5 Inter,"Segoe UI",system-ui,sans-serif;color:var(--tdg-fg,#24333e);--g-bg:var(--tdg-bg,#fff);--g-line:var(--tdg-line,#e5ebed);--g-accent:var(--tdg-accent,#087f78);--g-selection:var(--tdg-selection,#e1f2ef);--g-hover:var(--tdg-hover,#f3f7f7);--g-header:var(--tdg-header,#f8fafb);--g-muted:var(--tdg-muted,#788993);--g-row:var(--tdg-row-height,36px);contain:layout style}
*{box-sizing:border-box}button,input,textarea,select{font:inherit}button{color:inherit}.root{height:100%;display:flex;flex-direction:column;outline:none;background:var(--g-bg);position:relative;isolation:isolate}.root:focus-visible{box-shadow:inset 0 0 0 2px var(--g-accent)}
.header-clip{flex:none;height:39px;overflow:hidden;background:var(--g-header);border-bottom:1px solid var(--g-line);position:relative;z-index:4}.header-row{height:38px;display:flex;position:relative}.header{flex:none;position:relative;display:flex;align-items:center;gap:8px;padding:0 12px;font-size:11px;font-weight:650;letter-spacing:.025em;color:var(--tdg-header-fg,#62747e);user-select:none;border-right:1px solid transparent;outline:none;white-space:nowrap}.header:hover{background:var(--g-hover)}.header.sortable{cursor:pointer}.header .label{overflow:hidden;text-overflow:ellipsis}.sort-indicator{margin-left:auto;color:var(--g-accent);font-size:14px}.resize-grip{position:absolute;right:-4px;top:0;bottom:0;width:9px;cursor:col-resize;z-index:5}.resize-grip:after{content:"";position:absolute;top:8px;bottom:8px;left:4px;width:1px;background:var(--g-line)}.resize-grip:hover:after{background:var(--g-accent);width:2px}
.viewport{flex:1;min-height:0;overflow:auto;position:relative;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#b5c4c8 transparent;overflow-anchor:none;touch-action:pan-x pan-y}.extent{position:relative;overflow:clip;min-width:100%}.row{display:flex;position:absolute;left:0;top:0;min-height:var(--g-row);border-bottom:1px solid var(--g-line);background:var(--g-bg);contain:layout style;will-change:transform}.row:hover{background:var(--g-hover)}.row.selected{background:var(--g-selection)}.row.selected:before{content:"";position:sticky;left:0;width:3px;flex:none;margin-right:-3px;background:var(--g-accent);z-index:3}.cell{flex:none;display:flex;align-items:center;gap:5px;min-width:0;position:relative;padding:8px 12px;white-space:pre;overflow:hidden;outline:none}.cell-content{overflow:hidden;text-overflow:ellipsis;min-width:0;max-width:100%;flex:1}.cell.wrap{white-space:pre-wrap;align-items:flex-start}.cell.wrap .cell-content{overflow-wrap:anywhere;white-space:pre-wrap}.cell.right{text-align:right}.cell.center{text-align:center}.cell.selected{background:var(--g-selection)}.cell.active{box-shadow:inset 0 0 0 1.5px var(--g-accent)}.cell.frozen,.header.frozen{position:sticky;z-index:2;background:inherit}.cell.frozen-edge,.header.frozen-edge{box-shadow:1px 0 0 var(--g-line),5px 0 9px -9px #273d46}.gap{flex:none;pointer-events:none}.root.grid-lines .cell{border-right:1px solid var(--g-line)}
.expander{width:20px;height:20px;flex:none;padding:0;border:0;background:transparent;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;color:var(--g-muted);cursor:pointer}.expander:hover{background:var(--g-selection);color:var(--g-accent)}.expander svg{width:13px;height:13px;transition:transform .1s}.expander.open svg{transform:rotate(90deg)}.expander.empty{visibility:hidden}.expander.loading{animation:spin 1s linear infinite}.cell input[type=checkbox]{width:15px;height:15px;margin:0;accent-color:var(--g-accent);cursor:pointer}.cell input[type=checkbox]:disabled{cursor:default}.editor{width:100%;min-width:0;border:1px solid var(--g-accent);outline:2px solid color-mix(in srgb,var(--g-accent) 14%,transparent);border-radius:3px;background:var(--g-bg);color:inherit;padding:3px 5px;min-height:25px}.editing{padding-top:4px;padding-bottom:4px;overflow:visible}.editor[aria-invalid=true]{border-color:#c53535;outline-color:#f1cccc}.error-tip{position:absolute;left:4px;top:100%;padding:5px 8px;color:#a91c1c;background:#fff1f1;border:1px solid #e6b4b4;border-radius:4px;z-index:20;white-space:normal;min-width:140px;box-shadow:0 3px 10px #0002}.empty{position:absolute;inset:40px 0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--g-muted);pointer-events:none}.empty strong{font-size:16px;color:inherit}.empty[hidden]{display:none}.live{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}.drop-line{position:absolute;left:0;right:0;height:2px;background:var(--g-accent);z-index:8;pointer-events:none}.row.drop-inside{box-shadow:inset 0 0 0 2px var(--g-accent)}.row.dragging{opacity:.5}.context-menu{position:absolute;z-index:30;background:var(--g-bg);border:1px solid var(--g-line);box-shadow:0 8px 28px #142e3622;border-radius:8px;min-width:180px;padding:5px}.context-menu button{display:block;width:100%;text-align:left;border:0;padding:7px 10px;border-radius:4px;background:none;cursor:pointer}.context-menu button:hover{background:var(--g-hover)}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

Object.assign(exports,{gridStyles});
}
};
const cache=Object.create(null);function require(id){if(cache[id])return cache[id];const exports={};cache[id]=exports;if(!modules[id])throw new Error('Unknown bundled module: '+id);modules[id](exports,require);return exports;}
require("packages/core/index.js");
require("packages/web/index.js");
globalThis.TreeDataGridCore=require('packages/core/index.js');globalThis.TreeDataGridWeb=require('packages/web/index.js');
})();
