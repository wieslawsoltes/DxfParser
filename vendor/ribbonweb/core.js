/** RibbonWeb observable models, commands and bindings. Zero runtime dependencies. */
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
const lower = (name) => (name ? name[0].toLowerCase() + name.slice(1) : name);
const upper = (name) => (name ? name[0].toUpperCase() + name.slice(1) : name);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const disposable = (action) => {
  let active = true;
  const dispose = () => {
    if (active) {
      active = false;
      action();
    }
  };
  dispose.dispose = dispose;
  dispose.Dispose = dispose;
  return dispose;
};

export class EventSource {
  #listeners = new Set();
  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Event listener must be a function.');
    this.#listeners.add(listener);
    return disposable(() => this.#listeners.delete(listener));
  }
  Subscribe(listener) {
    return this.subscribe(listener);
  }
  emit(...args) {
    for (const listener of [...this.#listeners]) listener(...args);
  }
  Emit(...args) {
    this.emit(...args);
  }
  clear() {
    this.#listeners.clear();
  }
  get count() {
    return this.#listeners.size;
  }
}

function canonical(name) {
  if (typeof name !== 'string' || !name || unsafeKeys.has(name) || unsafeKeys.has(lower(name)))
    throw new TypeError('A safe, nonempty property name is required.');
  return lower(name);
}
function changed(sender, name, oldValue, value) {
  return {
    sender,
    propertyName: name,
    name,
    oldValue,
    newValue: value,
    value,
    Sender: sender,
    PropertyName: upper(name),
    OldValue: oldValue,
    NewValue: value,
  };
}
function readProperty(object, name) {
  if (object == null) return undefined;
  if (object instanceof ObservableObject) return object.GetProperty(name);
  if (name in Object(object)) return object[name];
  const alternate = name[0] === name[0].toUpperCase() ? lower(name) : upper(name);
  return object[alternate];
}
function readPath(object, path) {
  if (!path) return object;
  return String(path).split('.').reduce(readProperty, object);
}
function valuesOf(value) {
  if (value == null) return [];
  if (value instanceof ObservableCollection) return [...value];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' && typeof value[Symbol.iterator] === 'function') return [...value];
  throw new TypeError('A ribbon collection must be an array or iterable.');
}
function serialize(value, seen) {
  if (value == null || typeof value !== 'object')
    return typeof value === 'function' ? undefined : value;
  if (seen.has(value)) throw new TypeError('Cannot serialize a circular model.');
  if (
    value instanceof EventSource ||
    value instanceof RelayCommand ||
    value instanceof AsyncRelayCommand
  )
    return undefined;
  if (value instanceof Date) return value.toJSON();
  seen.add(value);
  let result;
  if (value instanceof ObservableCollection || Array.isArray(value))
    result = [...value].map((item) => serialize(item, seen));
  else {
    const source = value instanceof ObservableObject ? value._values : value;
    result = {};
    for (const [key, item] of Object.entries(source)) {
      const encoded = serialize(item, seen);
      if (encoded !== undefined) result[key] = encoded;
    }
  }
  seen.delete(value);
  return result;
}

export class ObservableObject {
  constructor(initial = {}) {
    Object.defineProperty(this, '_values', { value: Object.create(null) });
    Object.defineProperty(this, '_normalizers', { value: new Map() });
    Object.defineProperty(this, '_collectionSubscriptions', { value: new Map() });
    Object.defineProperty(this, '_aliases', { value: new Map() });
    Object.defineProperty(this, 'PropertyChanged', { value: new EventSource(), enumerable: false });
    Object.defineProperty(this, 'propertyChanged', { get: () => this.PropertyChanged });
    for (const [name, value] of Object.entries(initial || {})) this._defineProperty(name, value);
  }
  _defineProperty(name, value) {
    const key = canonical(name);
    if (key in this._values) {
      this._values[key] = value;
      return;
    }
    if (key in this || upper(key) in this)
      throw new TypeError(`Property '${name}' conflicts with the observable API.`);
    this._values[key] = value;
    const descriptor = {
      configurable: false,
      get: () => this._values[key],
      set: (next) => this.SetProperty(key, next),
    };
    Object.defineProperty(this, key, { ...descriptor, enumerable: true });
    Object.defineProperty(this, upper(key), { ...descriptor, enumerable: false });
  }
  _propertyName(name) {
    const key = canonical(name);
    return this._aliases.get(key) ?? key;
  }
  _registerAliases(aliases) {
    for (const [alias, target] of Object.entries(aliases)) {
      const name = canonical(alias);
      const property = canonical(target);
      if (name === property) continue;
      this._aliases.set(name, property);
      const descriptor = {
        enumerable: false,
        configurable: false,
        get: () => this.GetProperty(property),
        set: (value) => this.SetProperty(property, value),
      };
      for (const spelling of [name, upper(name)]) {
        if (spelling in this)
          throw new TypeError(`Alias '${spelling}' conflicts with an existing property.`);
        Object.defineProperty(this, spelling, descriptor);
      }
    }
  }
  GetProperty(name) {
    return this._values[this._propertyName(name)];
  }
  SetProperty(name, value) {
    const key = this._propertyName(name);
    const oldValue = this._values[key];
    if (this._normalizers.has(key)) value = this._normalizers.get(key)(value);
    if (own(this._values, key) && Object.is(oldValue, value)) return false;
    if (!own(this._values, key)) this._defineProperty(key, value);
    else this._values[key] = value;
    this.PropertyChanged.emit(changed(this, key, oldValue, value));
    return true;
  }
  _registerCollection(name, initial, mapItem = (item) => item) {
    const cache = new WeakMap();
    const normalizeItem = (item) => {
      if (item && typeof item === 'object') {
        if (cache.has(item)) return cache.get(item);
        const normalized = mapItem(item);
        cache.set(item, normalized);
        return normalized;
      }
      return mapItem(item);
    };
    const normalize = (source) => {
      this._collectionSubscriptions.get(name)?.();
      this._collectionSubscriptions.delete(name);
      const map = () => valuesOf(source).map(normalizeItem);
      const result = map();
      if (source instanceof ObservableCollection)
        this._collectionSubscriptions.set(
          name,
          source.CollectionChanged.subscribe(() => {
            const oldValue = this._values[name];
            const newValue = map();
            this._values[name] = newValue;
            this.PropertyChanged.emit(changed(this, name, oldValue, newValue));
          }),
        );
      return result;
    };
    this._normalizers.set(name, normalize);
    this._values[name] = normalize(initial);
  }
  dispose() {
    for (const dispose of this._collectionSubscriptions.values()) dispose();
    this._collectionSubscriptions.clear();
  }
  Dispose() {
    this.dispose();
  }
  get(path) {
    return readPath(this, path);
  }
  set(path, value) {
    const parts = String(path).split('.');
    parts.forEach(canonical);
    if (parts.length === 1) return this.SetProperty(parts[0], value);
    const name = parts.pop();
    const parent = readPath(this, parts.join('.'));
    if (parent == null) throw new TypeError(`Cannot set '${path}': parent does not exist.`);
    if (parent instanceof ObservableObject) return parent.SetProperty(name, value);
    const oldValue = readProperty(parent, name);
    if (Object.is(oldValue, value)) return false;
    const key = own(parent, name) ? name : own(parent, lower(name)) ? lower(name) : name;
    parent[key] = value;
    this.PropertyChanged.emit(changed(this, path, oldValue, value));
    return true;
  }
  toJSON() {
    return serialize(this, new Set());
  }
}

export class ObservableCollection {
  constructor(items = []) {
    this._items = [...items];
    this.CollectionChanged = new EventSource();
    this.PropertyChanged = new EventSource();
  }
  get Items() {
    return [...this._items];
  }
  get items() {
    return this.Items;
  }
  get Count() {
    return this._items.length;
  }
  get count() {
    return this.Count;
  }
  get length() {
    return this.Count;
  }
  get collectionChanged() {
    return this.CollectionChanged;
  }
  get propertyChanged() {
    return this.PropertyChanged;
  }
  [Symbol.iterator]() {
    return this._items[Symbol.iterator]();
  }
  at(index) {
    return this._items.at(index);
  }
  map(callback, thisArg) {
    return this._items.map(callback, thisArg);
  }
  forEach(callback, thisArg) {
    return this._items.forEach(callback, thisArg);
  }
  _notify(action, newItems, oldItems, index = -1, oldIndex = -1) {
    const event = {
      sender: this,
      action,
      newItems,
      oldItems,
      index,
      oldIndex,
      Sender: this,
      Action: upper(action),
      NewItems: newItems,
      OldItems: oldItems,
      NewStartingIndex: index,
      OldStartingIndex: oldIndex,
    };
    this.CollectionChanged.emit(event);
    if (action !== 'move' && action !== 'replace')
      this.PropertyChanged.emit(changed(this, 'count', undefined, this.Count));
  }
  Add(item) {
    const index = this.Count;
    this._items.push(item);
    this._notify('add', [item], [], index);
    return index;
  }
  add(item) {
    return this.Add(item);
  }
  Insert(index, item) {
    if (!Number.isInteger(index) || index < 0 || index > this.Count)
      throw new RangeError('Collection insertion index out of range.');
    this._items.splice(index, 0, item);
    this._notify('add', [item], [], index);
    return index;
  }
  insert(index, item) {
    return this.Insert(index, item);
  }
  Remove(item) {
    const index = this._items.indexOf(item);
    if (index < 0) return false;
    this.RemoveAt(index);
    return true;
  }
  remove(item) {
    return this.Remove(item);
  }
  RemoveAt(index) {
    this._validateIndex(index);
    const [item] = this._items.splice(index, 1);
    this._notify('remove', [], [item], -1, index);
    return item;
  }
  removeAt(index) {
    return this.RemoveAt(index);
  }
  Move(oldIndex, newIndex) {
    this._validateIndex(oldIndex);
    this._validateIndex(newIndex);
    if (oldIndex === newIndex) return;
    const [item] = this._items.splice(oldIndex, 1);
    this._items.splice(newIndex, 0, item);
    this._notify('move', [item], [item], newIndex, oldIndex);
  }
  move(oldIndex, newIndex) {
    return this.Move(oldIndex, newIndex);
  }
  SetItem(index, item) {
    this._validateIndex(index);
    const old = this._items[index];
    if (Object.is(old, item)) return;
    this._items[index] = item;
    this._notify('replace', [item], [old], index, index);
  }
  setItem(index, item) {
    return this.SetItem(index, item);
  }
  Clear() {
    if (!this.Count) return;
    const old = this._items.splice(0);
    this._notify('reset', [], old);
  }
  clear() {
    return this.Clear();
  }
  _validateIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.Count)
      throw new RangeError('Collection index out of range.');
  }
  toJSON() {
    return serialize(this, new Set());
  }
}

export class RelayCommand {
  constructor(execute, canExecute = () => true) {
    if (typeof execute !== 'function') throw new TypeError('Command execute must be a function.');
    if (typeof canExecute !== 'function')
      throw new TypeError('Command canExecute must be a function.');
    this._execute = execute;
    this._canExecute = canExecute;
    this.CanExecuteChanged = new EventSource();
  }
  get canExecuteChanged() {
    return this.CanExecuteChanged;
  }
  CanExecute(parameter) {
    return !!this._canExecute(parameter);
  }
  canExecute(parameter) {
    return this.CanExecute(parameter);
  }
  Execute(parameter) {
    if (this.CanExecute(parameter)) return this._execute(parameter);
  }
  execute(parameter) {
    return this.Execute(parameter);
  }
  NotifyCanExecuteChanged() {
    this.CanExecuteChanged.emit({ sender: this, Sender: this });
  }
  notifyCanExecuteChanged() {
    this.NotifyCanExecuteChanged();
  }
}

export class AsyncRelayCommand extends ObservableObject {
  constructor(execute, canExecute = () => true) {
    super({ isRunning: false, isCancellationRequested: false, error: null });
    if (typeof execute !== 'function') throw new TypeError('Command execute must be a function.');
    if (typeof canExecute !== 'function')
      throw new TypeError('Command canExecute must be a function.');
    this._execute = execute;
    this._canExecute = canExecute;
    this._controller = null;
    this._pending = null;
    this.CanExecuteChanged = new EventSource();
  }
  get canExecuteChanged() {
    return this.CanExecuteChanged;
  }
  CanExecute(parameter) {
    return !this.IsRunning && !!this._canExecute(parameter);
  }
  canExecute(parameter) {
    return this.CanExecute(parameter);
  }
  Execute(parameter) {
    if (this._pending) return this._pending;
    if (!this.CanExecute(parameter)) return Promise.resolve(undefined);
    const controller = new AbortController();
    this._controller = controller;
    this.IsCancellationRequested = false;
    this.Error = null;
    this.IsRunning = true;
    const task = Promise.resolve()
      .then(() => this._execute(parameter, controller.signal))
      .catch((error) => {
        this.Error = error;
        throw error;
      })
      .finally(() => {
        this._controller = null;
        this._pending = null;
        this.IsRunning = false;
        this.NotifyCanExecuteChanged();
      });
    this._pending = task;
    this.NotifyCanExecuteChanged();
    return task;
  }
  execute(parameter) {
    return this.Execute(parameter);
  }
  Cancel() {
    if (this._controller && !this._controller.signal.aborted) {
      this.IsCancellationRequested = true;
      this._controller.abort();
    }
  }
  cancel() {
    return this.Cancel();
  }
  NotifyCanExecuteChanged() {
    this.CanExecuteChanged.emit({ sender: this, Sender: this });
  }
  notifyCanExecuteChanged() {
    this.NotifyCanExecuteChanged();
  }
}

export class Binding {
  constructor(path, options = {}) {
    if (typeof path !== 'string' || !path)
      throw new TypeError('Binding path must be a nonempty string.');
    path.split('.').forEach(canonical);
    this.path = path;
    this.mode = options.mode ?? options.Mode ?? 'OneWay';
    if (!['OneWay', 'TwoWay', 'OneTime'].includes(this.mode))
      throw new TypeError(`Unknown binding mode '${this.mode}'.`);
    this.converter = options.converter ?? options.Converter;
    this.converterParameter = options.converterParameter ?? options.ConverterParameter;
    this.fallbackValue = options.fallbackValue ?? options.FallbackValue;
  }
  get Path() {
    return this.path;
  }
  get Mode() {
    return this.mode;
  }
  get Converter() {
    return this.converter;
  }
}
function watchPath(source, path, callback) {
  let subscriptions = [];
  let disposed = false;
  const parts = path.split('.');
  function attach() {
    subscriptions.forEach((dispose) => dispose());
    subscriptions = [];
    let current = source;
    for (let index = 0; index < parts.length && current != null; index++) {
      const sourceEvent = current.PropertyChanged ?? current.propertyChanged;
      const segment =
        current instanceof ObservableObject
          ? current._propertyName(parts[index])
          : lower(parts[index]);
      const remaining = [segment, ...parts.slice(index + 1).map(lower)].join('.');
      if (sourceEvent?.subscribe)
        subscriptions.push(
          sourceEvent.subscribe((event) => {
            const name = event?.propertyName ?? event?.PropertyName ?? event?.name;
            const normalized = typeof name === 'string' ? name.split('.').map(lower).join('.') : '';
            if (
              !normalized ||
              normalized === segment ||
              normalized === remaining ||
              remaining.startsWith(normalized + '.')
            ) {
              if (!disposed) {
                attach();
                callback();
              }
            }
          }),
        );
      current = readProperty(current, parts[index]);
    }
  }
  attach();
  return disposable(() => {
    disposed = true;
    subscriptions.forEach((dispose) => dispose());
    subscriptions = [];
  });
}
function writePath(source, path, value) {
  if (source instanceof ObservableObject) return source.set(path, value);
  const parts = path.split('.');
  const key = parts.pop();
  const parent = readPath(source, parts.join('.'));
  if (parent == null) throw new TypeError(`Cannot set '${path}': parent does not exist.`);
  if (parent instanceof ObservableObject) return parent.set(key, value);
  parent[key] = value;
}
/** Binds an observable property or DOM property. TwoWay DOM bindings listen to input/change. */
export function bind(target, targetProperty, source, binding) {
  if (typeof binding === 'string') binding = new Binding(binding);
  else if (!(binding instanceof Binding))
    binding = new Binding(binding.path ?? binding.Path, binding);
  canonical(targetProperty);
  let updating = false;
  let active = true;
  const subscriptions = [];
  const convert = (value, reverse) => {
    const converter = binding.converter;
    if (!converter) return value;
    const fn = reverse
      ? (converter.convertBack ?? converter.ConvertBack)
      : typeof converter === 'function'
        ? converter
        : (converter.convert ?? converter.Convert);
    return fn ? fn.call(converter, value, binding.converterParameter) : value;
  };
  const toTarget = () => {
    if (!active || updating) return;
    updating = true;
    try {
      const value = readPath(source, binding.path);
      writePath(
        target,
        targetProperty,
        convert(value === undefined ? binding.fallbackValue : value, false),
      );
    } finally {
      updating = false;
    }
  };
  const toSource = () => {
    if (!active || updating) return;
    updating = true;
    try {
      writePath(source, binding.path, convert(readPath(target, targetProperty), true));
    } finally {
      updating = false;
    }
  };
  toTarget();
  if (binding.mode !== 'OneTime') subscriptions.push(watchPath(source, binding.path, toTarget));
  if (binding.mode === 'TwoWay') {
    if (target.PropertyChanged?.subscribe || target.propertyChanged?.subscribe)
      subscriptions.push(watchPath(target, targetProperty, toSource));
    else if (typeof target.addEventListener === 'function') {
      target.addEventListener('input', toSource);
      target.addEventListener('change', toSource);
      subscriptions.push(
        disposable(() => {
          target.removeEventListener('input', toSource);
          target.removeEventListener('change', toSource);
        }),
      );
    }
  }
  const dispose = disposable(() => {
    active = false;
    subscriptions.forEach((unsubscribe) => unsubscribe());
  });
  dispose.updateTarget = toTarget;
  dispose.updateSource = toSource;
  return dispose;
}

let generatedId = 0;
function normalizeProperties(input, defaults = {}) {
  const result = { ...defaults };
  const entries = Object.entries(input || {});
  // Explicit camelCase wins over a duplicate PascalCase input, independently of insertion order.
  for (const [key, value] of entries) {
    if (!unsafeKeys.has(key)) result[lower(key)] = value;
  }
  for (const [key, value] of entries) {
    if (!unsafeKeys.has(key) && key === lower(key)) result[key] = value;
  }
  return result;
}
const controlAliases = {
  isEnabled: 'enabled',
  isVisible: 'visible',
  isChecked: 'checked',
  header: 'label',
  itemsSource: 'items',
  selectedValue: 'value',
  smallImageSource: 'icon',
  largeImageSource: 'icon',
  toolTipTitle: 'tooltip',
  toolTipDescription: 'description',
};
const groupAliases = { isVisible: 'visible', itemsSource: 'items' };
const tabAliases = { isVisible: 'visible' };
function normalizeAliasedProperties(input, defaults, aliases) {
  const properties = normalizeProperties(input);
  for (const [alias, target] of Object.entries(aliases)) {
    if (own(properties, alias)) {
      if (!own(properties, target)) properties[target] = properties[alias];
      delete properties[alias];
    }
  }
  return { ...defaults, ...properties };
}
function registerModelAliases(model, aliases) {
  model._registerAliases(aliases);
  const normalizeBindings = (bindings) =>
    bindings == null ? bindings : normalizeAliasedProperties(bindings, {}, aliases);
  model._normalizers.set('bindings', normalizeBindings);
  if (own(model._values, 'bindings'))
    model._values.bindings = normalizeBindings(model._values.bindings);
}
const controlDefaults = {
  type: 'button',
  label: '',
  icon: '',
  keyTip: '',
  tooltip: '',
  description: '',
  command: null,
  commandParameter: undefined,
  enabled: true,
  visible: true,
  checked: false,
  value: '',
  items: [],
  size: 'medium',
  bindings: null,
};
export class RibbonControl extends ObservableObject {
  constructor(options = {}, type = 'button') {
    const aliases =
      type === 'textbox' || type === 'combobox'
        ? { ...controlAliases, text: 'value' }
        : controlAliases;
    const props = normalizeAliasedProperties(
      options,
      { ...controlDefaults, type, id: `ribbon-control-${++generatedId}` },
      aliases,
    );
    if (!props.label) props.label = props.header ?? props.text ?? '';
    props.type = type;
    super(props);
    registerModelAliases(this, aliases);
    this._registerCollection(
      'items',
      props.items,
      type === 'menu' || type === 'split' || type === 'menuitem'
        ? (item) => normalizeControl(item, 'menuitem')
        : (item) => item,
    );
  }
}
export class RibbonButton extends RibbonControl {
  constructor(options) {
    super(options, 'button');
  }
}
export class RibbonToggleButton extends RibbonControl {
  constructor(options) {
    super(options, 'toggle');
  }
}
export class RibbonCheckBox extends RibbonControl {
  constructor(options) {
    super(options, 'checkbox');
  }
}
export class RibbonRadioButton extends RibbonControl {
  constructor(options) {
    super(options, 'radio');
  }
}
export class RibbonSplitButton extends RibbonControl {
  constructor(options) {
    super(options, 'split');
  }
}
export class RibbonMenuButton extends RibbonControl {
  constructor(options) {
    super(options, 'menu');
  }
}
export class RibbonMenuItem extends RibbonControl {
  constructor(options) {
    super(options, 'menuitem');
  }
}
export class RibbonTextBox extends RibbonControl {
  constructor(options) {
    super(options, 'textbox');
  }
}
export class RibbonComboBox extends RibbonControl {
  constructor(options) {
    super(options, 'combobox');
  }
}
export class RibbonDropDown extends RibbonControl {
  constructor(options) {
    super(options, 'dropdown');
  }
}
export class RibbonSpinner extends RibbonControl {
  constructor(options) {
    super(normalizeProperties(options, { min: 0, max: 100, step: 1 }), 'spinner');
  }
}
export class RibbonSlider extends RibbonControl {
  constructor(options) {
    super(normalizeProperties(options, { min: 0, max: 100, step: 1 }), 'slider');
  }
}
export class RibbonGallery extends RibbonControl {
  constructor(options) {
    super(options, 'gallery');
  }
}
export class RibbonColorPicker extends RibbonControl {
  constructor(options) {
    super(options, 'color');
  }
}
export class RibbonSeparator extends RibbonControl {
  constructor(options) {
    super(options, 'separator');
  }
}
export class RibbonLabel extends RibbonControl {
  constructor(options) {
    super(options, 'label');
  }
}
export class RibbonCustomControl extends RibbonControl {
  constructor(options) {
    super(options, 'custom');
  }
}

export class RibbonGroup extends ObservableObject {
  constructor(options = {}) {
    const props = normalizeAliasedProperties(
      options,
      {
        id: `ribbon-group-${++generatedId}`,
        header: '',
        items: [],
        priority: 0,
        launcher: null,
        visible: true,
      },
      groupAliases,
    );
    if (
      props.launcher &&
      typeof props.launcher === 'object' &&
      !(props.launcher instanceof RelayCommand) &&
      !(props.launcher instanceof AsyncRelayCommand) &&
      !(props.launcher.Execute || props.launcher.execute)
    )
      props.launcher = normalizeControl(props.launcher);
    super(props);
    registerModelAliases(this, groupAliases);
    this._registerCollection('items', props.items, (item) => normalizeControl(item));
  }
}
export class RibbonTab extends ObservableObject {
  constructor(options = {}) {
    const props = normalizeAliasedProperties(
      options,
      {
        id: `ribbon-tab-${++generatedId}`,
        header: '',
        keyTip: '',
        groups: [],
        visible: true,
        contextualGroup: null,
      },
      tabAliases,
    );
    super(props);
    registerModelAliases(this, tabAliases);
    this._registerCollection('groups', props.groups, (group) =>
      group instanceof RibbonGroup ? group : new RibbonGroup(group),
    );
  }
}
export class RibbonModel extends ObservableObject {
  constructor(options = {}) {
    const props = normalizeProperties(options, {
      id: `ribbon-${++generatedId}`,
      tabs: [],
      quickAccessToolbar: [],
      backstage: [],
      selectedTab: null,
      layout: 'classic',
      theme: 'system',
      context: {},
    });
    const originalTabs = props.tabs;
    const originalQuickAccessToolbar = props.quickAccessToolbar;
    const originalBackstage = props.backstage;
    if (
      !Array.isArray(props.backstage) &&
      !(props.backstage instanceof ObservableCollection) &&
      props.backstage &&
      typeof props.backstage === 'object'
    ) {
      props.backstage = normalizeProperties(props.backstage);
      if (props.backstage.items)
        props.backstage.items = valuesOf(props.backstage.items).map((item) =>
          normalizeControl(item, 'menuitem'),
        );
    }
    super(props);
    this._registerCollection('tabs', originalTabs, (tab) =>
      tab instanceof RibbonTab ? tab : new RibbonTab(tab),
    );
    this._registerCollection('quickAccessToolbar', originalQuickAccessToolbar, (item) =>
      normalizeControl(item),
    );
    if (Array.isArray(originalBackstage) || originalBackstage instanceof ObservableCollection)
      this._registerCollection('backstage', originalBackstage, (item) =>
        normalizeControl(item, 'menuitem'),
      );
    if (this.selectedTab == null)
      this._values.selectedTab = this.tabs.find((tab) => tab.visible !== false)?.id ?? null;
  }
}
const classes = {
  button: RibbonButton,
  toggle: RibbonToggleButton,
  checkbox: RibbonCheckBox,
  radio: RibbonRadioButton,
  split: RibbonSplitButton,
  menu: RibbonMenuButton,
  menuitem: RibbonMenuItem,
  textbox: RibbonTextBox,
  combobox: RibbonComboBox,
  dropdown: RibbonDropDown,
  spinner: RibbonSpinner,
  slider: RibbonSlider,
  gallery: RibbonGallery,
  color: RibbonColorPicker,
  separator: RibbonSeparator,
  label: RibbonLabel,
  custom: RibbonCustomControl,
};
const typeAliases = {
  togglebutton: 'toggle',
  radiobutton: 'radio',
  splitbutton: 'split',
  menubutton: 'menu',
  colorpicker: 'color',
  customcontrol: 'custom',
};
export function normalizeControl(control, defaultType = 'button') {
  if (control instanceof RibbonControl) return control;
  if (typeof control === 'string') control = { label: control };
  if (!control || typeof control !== 'object')
    throw new TypeError('A ribbon control must be an object or label string.');
  const raw = String(control.type ?? control.Type ?? defaultType)
    .replace(/^Ribbon/i, '')
    .replace(/[\s_-]/g, '')
    .toLowerCase();
  const type = typeAliases[raw] ?? raw;
  const Constructor = classes[type];
  if (!Constructor) throw new TypeError(`Unknown ribbon control type '${type}'.`);
  return new Constructor(control);
}
export function normalizeRibbon(model = {}) {
  return model instanceof RibbonModel ? model : new RibbonModel(model);
}
/** Enumerates every command control, including menus, launchers, backstage and quick access. */
export function* traverseControls(ribbon) {
  const model = normalizeRibbon(ribbon);
  const visited = new Set();
  function* walk(items) {
    for (const item of valuesOf(items)) {
      if (!(item instanceof RibbonControl) || visited.has(item)) continue;
      visited.add(item);
      yield item;
      yield* walk(item.items ?? []);
    }
  }
  yield* walk(model.quickAccessToolbar);
  const backstage = Array.isArray(model.backstage)
    ? model.backstage
    : (model.backstage?.items ?? []);
  yield* walk(backstage);
  for (const tab of model.tabs)
    for (const group of tab.groups) {
      yield* walk(group.items);
      if (group.launcher instanceof RibbonControl) yield* walk([group.launcher]);
    }
}
export function findControl(ribbon, id) {
  for (const control of traverseControls(ribbon)) if (control.id === id) return control;
  return undefined;
}
